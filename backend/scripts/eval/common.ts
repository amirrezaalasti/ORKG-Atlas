/**
 * Shared pieces of the RQ2 evaluation harness: dataset types, SPARQL execution,
 * result normalisation, and answer-set scoring.
 */

import { sparqlQuery } from '../../src/services/orkg/orkgClient.js';

export type EvalItem = {
  id: string;
  dataset: string;
  templateId: string;
  title?: string;
  question: string;
  goldQueries: string[];
};

export type ResultTable = { vars: string[]; rows: Record<string, string>[] };

export type ExecOutcome =
  | { ok: true; table: ResultTable }
  | { ok: false; error: string };

const ORKG_RESOURCE =
  /^https?:\/\/orkg\.org\/orkg\/(resource|predicate|class)\//;

export const executeSparql = async (
  query: string,
  timeoutMs = 60_000
): Promise<ExecOutcome> => {
  try {
    const res = await sparqlQuery(query, { readonly: true, timeoutMs });
    const bindings = res.results?.bindings ?? [];
    const vars =
      res.head?.vars ?? (bindings[0] ? Object.keys(bindings[0]) : []);
    const rows = bindings.map((b) =>
      Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v?.value ?? '']))
    );
    return { ok: true, table: { vars, rows } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Canonical form of a cell value: ORKG URIs → id, numbers → canonical, text → lowercase. */
export const normaliseValue = (v: string): string => {
  const s = v.trim();
  if (ORKG_RESOURCE.test(s)) return s.replace(ORKG_RESOURCE, '');
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n * 1e6) / 1e6);
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
};

const columnValues = (t: ResultTable, v: string): Set<string> => {
  const out = new Set<string>();
  for (const r of t.rows) {
    const val = r[v];
    if (val !== undefined && val !== '') out.add(normaliseValue(val));
  }
  return out;
};

/** Columns that identify the paper rather than answer the question. */
const IDENTITY_COLUMNS =
  /^(paper|paperlabel|paper_label|title|contribution|contri|year|doi)$/i;

/** A flag value is "positive" unless empty, 0, false, or a "no …" label. */
const isPositive = (v: string) =>
  v !== '' && v !== '0' && v !== 'false' && v !== 'no' && !v.startsWith('no ');

/**
 * Flag columns: by default any column with ≤2 distinct values. SCORER_FLAGS=boolean
 * (sensitivity check) also requires the values to look boolean (yes/no, true/false,
 * 0/1, "no …"), so a genuine two-valued answer column is compared value by value.
 */
const BOOLEANISH = /^(yes|no|true|false|0|1|y|n)$|^no /;
const isFlagColumn = (distinct: Set<string>) =>
  distinct.size <= 2 &&
  (process.env.SCORER_FLAGS !== 'boolean' ||
    [...distinct].every((v) => BOOLEANISH.test(normaliseValue(v))));

const pairs = (
  t: ResultTable,
  key: string,
  v: string,
  flag: boolean
): Set<string> => {
  const out = new Set<string>();
  for (const r of t.rows) {
    const k = r[key];
    if (!k) continue;
    const val = normaliseValue(r[v] ?? '');
    if (flag) {
      if (isPositive(val)) out.add(normaliseValue(k));
    } else if (val !== '') {
      out.add(`${normaliseValue(k)}\u0000${val}`);
    }
  }
  return out;
};

export const setPRF = (gold: Set<string>, pred: Set<string>) => {
  if (gold.size === 0 && pred.size === 0) return { p: 1, r: 1, f1: 1 };
  let tp = 0;
  for (const g of gold) if (pred.has(g)) tp++;
  const p = pred.size ? tp / pred.size : 0;
  const r = gold.size ? tp / gold.size : 0;
  const f1 = p + r ? (2 * p * r) / (p + r) : 0;
  return { p, r, f1 };
};

/** The predicted column whose values overlap most with the gold paper ids. */
const findPaperKey = (
  t: ResultTable,
  goldPapers: Set<string>
): string | null => {
  let best: string | null = null;
  let bestOverlap = 0;
  for (const v of t.vars) {
    let overlap = 0;
    for (const val of columnValues(t, v)) if (goldPapers.has(val)) overlap++;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = v;
    }
  }
  return best;
};

/**
 * Column-aligned answer score. Gold and predicted queries name variables
 * differently, so each gold *answer* column (identity columns such as paper,
 * paperLabel, contribution, and year excluded) is aligned with the predicted
 * column that matches it best (max F1). When the gold result has a `paper`
 * column, values are compared as (paper, value) pairs, so an answer only
 * counts when it is attached to the right paper; low-cardinality flag columns
 * (≤2 distinct values) are compared as the set of papers where the flag is
 * positive, which makes 0/1, label/null, and "x"/"no x" encodings comparable.
 * Without a gold paper column, distinct value sets are compared. The question
 * score is the mean P/R/F1 over gold answer columns; extra predicted columns
 * are not penalised.
 */
export const scoreTables = (gold: ResultTable[], pred: ResultTable[]) => {
  const perColumn: Array<{
    column: string;
    mode: string;
    p: number;
    r: number;
    f1: number;
  }> = [];
  for (const t of gold) {
    const goldKey = t.vars.find((v) => /^paper$/i.test(v)) ?? null;
    const goldPapers = goldKey ? columnValues(t, goldKey) : new Set<string>();
    const answerCols = t.vars.filter((v) => !IDENTITY_COLUMNS.test(v));
    for (const v of answerCols) {
      const distinct = columnValues(t, v);
      if (distinct.size === 0) continue;
      const flag = isFlagColumn(distinct);
      let best = { p: 0, r: 0, f1: 0 };
      let mode = 'values';
      if (goldKey) {
        mode = flag ? 'paper-flag' : 'paper-value';
        const g = pairs(t, goldKey, v, flag);
        if (g.size === 0) continue;
        const goldFlagDiscriminates = flag && g.size < goldPapers.size;
        for (const pt of pred) {
          const predKey = findPaperKey(pt, goldPapers);
          if (!predKey) continue;
          for (const pv of pt.vars) {
            if (pv === predKey) continue;
            const candidate = pairs(pt, predKey, pv, flag);
            // A column positive for every gold paper does not discriminate and
            // may only match an all-positive gold flag. Papers a query filters
            // out count as negative, so filtering is a valid flag encoding.
            if (goldFlagDiscriminates) {
              let covered = 0;
              for (const c of candidate) if (goldPapers.has(c)) covered++;
              if (covered >= goldPapers.size) continue;
            }
            const s = setPRF(g, candidate);
            if (s.f1 > best.f1) best = s;
          }
        }
      } else {
        for (const pt of pred)
          for (const pv of pt.vars) {
            const s = setPRF(distinct, columnValues(pt, pv));
            if (s.f1 > best.f1) best = s;
          }
      }
      perColumn.push({ column: v, mode, ...best });
    }
  }
  if (perColumn.length === 0) {
    const predEmpty = pred.every((t) => t.rows.length === 0);
    const v = predEmpty ? 1 : 0;
    return { p: v, r: v, f1: v, perColumn };
  }
  const mean = (k: 'p' | 'r' | 'f1') =>
    perColumn.reduce((s, c) => s + c[k], 0) / perColumn.length;
  return { p: mean('p'), r: mean('r'), f1: mean('f1'), perColumn };
};

export const extractSparqlBlocks = (text: string): string[] => {
  const blocks: string[] = [];
  const re = /```(?:sparql)?\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1].trim();
    if (/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i.test(body)) blocks.push(body);
  }
  if (blocks.length === 0 && /\bSELECT\b/i.test(text)) blocks.push(text.trim());
  return blocks;
};

/** Run async tasks with a fixed concurrency limit, preserving order. */
export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return out;
};

/**
 * Strict variant of scoreTables, used to check that conclusions do not depend on
 * the lenient alignment:
 *  - one-to-one alignment: each predicted column answers at most one gold column
 *    (maximum-weight matching over per-pair F1);
 *  - a predicted column is treated as a flag only if it is itself low-cardinality
 *    (≤2 distinct values), so a filter is no longer a valid flag encoding;
 *  - extra columns are penalised: the score is multiplied by column precision,
 *    the share of predicted answer columns that are matched or redundant
 *    (row-wise functionally equivalent to a matched or identity column, e.g. a
 *    URI next to its label). Paper / paper-label / year columns are identity.
 */
export const scoreTablesStrict = (gold: ResultTable[], pred: ResultTable[]) => {
  type Cand = {
    g: number;
    t: number;
    v: string;
    f1: number;
    p: number;
    r: number;
  };
  const goldCols: Array<{
    gi: number;
    table: ResultTable;
    key: string | null;
    col: string;
    flag: boolean;
    set: Set<string>;
    goldPapers: Set<string>;
  }> = [];
  for (const t of gold) {
    const goldKey = t.vars.find((v) => /^paper$/i.test(v)) ?? null;
    const goldPapers = goldKey ? columnValues(t, goldKey) : new Set<string>();
    for (const v of t.vars.filter((x) => !IDENTITY_COLUMNS.test(x))) {
      const distinct = columnValues(t, v);
      if (distinct.size === 0) continue;
      const flag = isFlagColumn(distinct);
      const set = goldKey ? pairs(t, goldKey, v, flag) : distinct;
      if (set.size === 0) continue;
      goldCols.push({
        gi: goldCols.length,
        table: t,
        key: goldKey,
        col: v,
        flag,
        set,
        goldPapers,
      });
    }
  }
  if (goldCols.length === 0) {
    const predEmpty = pred.every((t) => t.rows.length === 0);
    const v = predEmpty ? 1 : 0;
    return { p: v, r: v, f1: v, colPrecision: 1 };
  }
  const allGoldPapers = new Set<string>();
  for (const g of goldCols) for (const p of g.goldPapers) allGoldPapers.add(p);

  // Identity columns of each predicted table: the paper key and anything that is a
  // function of it with ≤1 value per paper (title, year, DOI).
  // Value sets of the gold identity columns (year, title, ...), so renamed
  // identity columns in a prediction are recognised by content, not name.
  const goldIdentSets: Set<string>[] = [];
  for (const t of gold)
    for (const v of t.vars)
      if (IDENTITY_COLUMNS.test(v) && !/^paper$/i.test(v)) {
        const s = columnValues(t, v);
        if (s.size) goldIdentSets.push(s);
      }
  const predInfo = pred.map((pt) => {
    const key = allGoldPapers.size ? findPaperKey(pt, allGoldPapers) : null;
    const ident = new Set<string>();
    if (key) ident.add(key);
    for (const v of pt.vars) {
      if (v === key) continue;
      if (
        IDENTITY_COLUMNS.test(v) ||
        /^(paper.*|title.*|.*year.*|doi.*)$/i.test(v)
      ) {
        ident.add(v);
        continue;
      }
      const vals = columnValues(pt, v);
      if (!vals.size) continue;
      for (const gs of goldIdentSets) {
        let inter = 0;
        for (const x of vals) if (gs.has(x)) inter++;
        if (inter / vals.size >= 0.8) {
          ident.add(v);
          break;
        }
      }
    }
    return { key, ident };
  });

  const cands: Cand[] = [];
  for (const g of goldCols)
    pred.forEach((pt, ti) => {
      const { key, ident } = predInfo[ti];
      for (const pv of pt.vars) {
        if (ident.has(pv)) continue;
        let set: Set<string>;
        if (g.key) {
          if (!key) continue;
          const predDistinct = columnValues(pt, pv);
          const flag = g.flag && predDistinct.size <= 2;
          set = pairs(pt, key, pv, flag);
          if (g.flag && !flag) set = new Set(); // value column cannot answer a flag
        } else set = columnValues(pt, pv);
        const s = setPRF(g.set, set);
        if (s.f1 > 0) cands.push({ g: g.gi, t: ti, v: pv, ...s });
      }
    });

  // Maximum-weight one-to-one matching (greedy on sorted F1 is optimal enough for
  // the small column counts here; exact search when ≤ 8 gold columns).
  const colKey = (c: Cand) => `${c.t}\u0000${c.v}`;
  let bestAssign: Cand[] = [];
  let bestSum = -1;
  const byGold = goldCols.map((g) =>
    cands
      .filter((c) => c.g === g.gi)
      .sort((a, b) => b.f1 - a.f1)
      .slice(0, 6)
  );
  if (goldCols.length <= 8) {
    const used = new Set<string>();
    const cur: Cand[] = [];
    const rec = (i: number, sum: number) => {
      if (i === goldCols.length) {
        if (sum > bestSum) {
          bestSum = sum;
          bestAssign = [...cur];
        }
        return;
      }
      rec(i + 1, sum); // leave gold column i unmatched
      for (const c of byGold[i]) {
        const k = colKey(c);
        if (used.has(k)) continue;
        used.add(k);
        cur.push(c);
        rec(i + 1, sum + c.f1);
        cur.pop();
        used.delete(k);
      }
    };
    rec(0, 0);
  } else {
    const used = new Set<string>();
    const doneG = new Set<number>();
    for (const c of [...cands].sort((a, b) => b.f1 - a.f1)) {
      if (doneG.has(c.g) || used.has(colKey(c))) continue;
      doneG.add(c.g);
      used.add(colKey(c));
      bestAssign.push(c);
    }
  }
  const per = goldCols.map(
    (g) => bestAssign.find((c) => c.g === g.gi) ?? { p: 0, r: 0, f1: 0 }
  );
  const mean = (k: 'p' | 'r' | 'f1') =>
    per.reduce((s, c) => s + c[k], 0) / per.length;

  // Column precision: matched or redundant predicted answer columns.
  const matched = new Set(bestAssign.map(colKey));
  const functional = (pt: ResultTable, a: string, b: string) => {
    const m = new Map<string, string>();
    for (const r of pt.rows) {
      const x = r[a] ?? '',
        y = r[b] ?? '';
      if (m.has(x) && m.get(x) !== y) return false;
      m.set(x, y);
    }
    return true;
  };
  let answerCols = 0;
  let okCols = 0;
  pred.forEach((pt, ti) => {
    const { ident } = predInfo[ti];
    const anchors = pt.vars.filter((v) => matched.has(`${ti}\u0000${v}`));
    for (const v of pt.vars) {
      if (ident.has(v)) continue;
      if (pt.rows.every((r) => !r[v])) continue; // unbound column carries no claim
      answerCols++;
      if (matched.has(`${ti}\u0000${v}`)) {
        okCols++;
        continue;
      }
      // redundant: determines a matched column row-wise (a URI next to its label)
      if (anchors.some((a) => functional(pt, v, a))) okCols++;
    }
  });
  const colPrecision = answerCols ? okCols / answerCols : 1;
  const f1 = mean('f1') * colPrecision;
  return { p: mean('p') * colPrecision, r: mean('r'), f1, colPrecision };
};
