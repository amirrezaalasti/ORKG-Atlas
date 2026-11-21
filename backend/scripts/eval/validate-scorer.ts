/**
 * Metamorphic validation of the result-set scorers (lenient scoreTables and
 * scoreTablesStrict). Each gold result table is transformed in ways that keep
 * the answer (the score should stay 1) or change it (the score should drop),
 * and the share of transformed answers each scorer rates exact is reported.
 *
 * Usage:
 *   npx tsx scripts/eval/validate-scorer.ts [--json out.json]
 *     (uses data/gold-results-{curated,ood}.json and the matching question files)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normaliseValue,
  scoreTables,
  scoreTablesStrict,
  type ResultTable,
} from './common.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const jsonOut = args.includes('--json')
  ? args[args.indexOf('--json') + 1]
  : undefined;

type GoldFile = {
  items: Array<{
    id: string;
    results: Array<{
      ok: boolean;
      vars?: string[];
      rows?: Record<string, string>[];
    }>;
  }>;
};
const sets = (
  args.includes('--sets') ? args[args.indexOf('--sets') + 1] : 'curated,ood'
).split(',');
const gold = new Map<string, ResultTable[]>();
for (const s of sets) {
  const g = JSON.parse(
    readFileSync(join(here, 'data', `gold-results-${s}.json`), 'utf8')
  ) as GoldFile;
  for (const it of g.items) {
    const tables = it.results
      .filter((r) => r.ok && (r.rows?.length ?? 0) > 0)
      .map((r) => ({ vars: r.vars ?? [], rows: r.rows ?? [] }));
    if (tables.length) gold.set(it.id, tables);
  }
}

const IDENT =
  /^(paper|paperlabel|paper_label|title|contribution|contri|year|doi)$/i;
let seed = 7;
const rand = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const answerCols = (t: ResultTable) =>
  t.vars.filter((v) => !IDENT.test(v) && t.rows.some((r) => r[v]));
/** Answer columns, most informative (most distinct values) first. */
const informative = (t: ResultTable) =>
  [...answerCols(t)].sort(
    (a, b) =>
      new Set(t.rows.map((r) => r[b])).size -
      new Set(t.rows.map((r) => r[a])).size
  );
const papersOf = (t: ResultTable) => [
  ...new Set(t.rows.map((r) => r.paper).filter(Boolean)),
];
const isFlag = (t: ResultTable, v: string) =>
  new Set(t.rows.map((r) => normaliseValue(r[v] ?? '')).filter((x) => x))
    .size <= 2;
const template = (id: string) => id.split('/')[0];

/** Another gold table on the same template with an answer column (for "wrong attribute"). */
const sibling = (id: string, col: string, vals: Set<string>) => {
  for (const [oid, ts] of gold) {
    if (oid === id || template(oid) !== template(id)) continue;
    for (const t of ts) {
      if (!t.vars.includes('paper')) continue;
      for (const c of answerCols(t)) {
        const ov = new Set(t.rows.map((r) => normaliseValue(r[c] ?? '')));
        let overlap = 0;
        for (const v of ov) if (vals.has(v)) overlap++;
        if (c !== col && overlap / Math.max(1, ov.size) < 0.5) return { t, c };
      }
    }
  }
  return null;
};

type Transform = {
  name: string;
  preserves: boolean;
  apply: (id: string, tables: ResultTable[]) => ResultTable[] | null;
};

const mapTables = (
  tables: ResultTable[],
  f: (t: ResultTable) => ResultTable | null
) => {
  const out = tables.map(f);
  return out.some((t) => t === null) ? null : (out as ResultTable[]);
};

const TRANSFORMS: Transform[] = [
  // ---- meaning-preserving ----
  {
    name: 'rename+reorder',
    preserves: true,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        const names = new Map(
          t.vars.map((v, i) => [v, v === 'paper' ? 'p_item' : `col${i}`])
        );
        const vars = shuffle(t.vars).map((v) => names.get(v)!);
        const rows = shuffle(t.rows).map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [names.get(k) ?? k, v])
          )
        );
        return { vars, rows };
      }),
  },
  {
    name: 'add-label+uri-columns',
    preserves: true,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        const ans = answerCols(t);
        const vars = [...t.vars, 'paperLabel', ...ans.map((a) => `${a}_uri`)];
        const rows = t.rows.map((r) => {
          const o: Record<string, string> = {
            ...r,
            paperLabel: `Title of ${r.paper ?? ''}`,
          };
          for (const a of ans)
            o[`${a}_uri`] = r[a]
              ? `http://orkg.org/orkg/resource/X${Buffer.from(r[a]).toString('hex')}`
              : '';
          return o;
        });
        return { vars, rows };
      }),
  },
  {
    name: 'duplicate-rows',
    preserves: true,
    apply: (_id, ts) =>
      mapTables(ts, (t) => ({ vars: t.vars, rows: [...t.rows, ...t.rows] })),
  },
  {
    name: 'case-whitespace',
    preserves: true,
    apply: (_id, ts) =>
      mapTables(ts, (t) => ({
        vars: t.vars,
        rows: t.rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              k === 'paper' || /^https?:/.test(v) ? v : ` ${v.toUpperCase()} `,
            ])
          )
        ),
      })),
  },
  // ---- meaning-changing ----
  {
    name: 'wrong-attribute',
    preserves: false,
    apply: (id, ts) =>
      mapTables(ts, (t) => {
        if (!t.vars.includes('paper')) return null;
        const ans = informative(t);
        if (!ans.length) return null;
        const target = ans[0];
        const sib = sibling(
          id,
          target,
          new Set(t.rows.map((r) => normaliseValue(r[target] ?? '')))
        );
        if (!sib) return null;
        const byPaper = new Map<string, string[]>();
        for (const r of sib.t.rows)
          if (r.paper && r[sib.c])
            byPaper.set(r.paper, [...(byPaper.get(r.paper) ?? []), r[sib.c]]);
        const rows: Record<string, string>[] = [];
        for (const r of t.rows)
          for (const v of byPaper.get(r.paper) ?? [])
            rows.push({ ...r, [target]: v });
        return rows.length ? { vars: t.vars, rows } : null;
      }),
  },
  {
    name: 'intermediate-node-label',
    preserves: false,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        const ans = informative(t).filter((a) => !isFlag(t, a));
        if (!ans.length) return null;
        return {
          vars: t.vars,
          rows: t.rows.map((r) => ({ ...r, [ans[0]]: 'Data collection' })),
        };
      }),
  },
  {
    name: 'missing-filter(+50% papers)',
    preserves: false,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        if (!t.vars.includes('paper')) return null;
        const ps = papersOf(t);
        const extra = t.rows
          .filter((r) => ps.indexOf(r.paper) < Math.ceil(ps.length / 2))
          .map((r) => ({ ...r, paper: `${r.paper}_other` }));
        return { vars: t.vars, rows: [...t.rows, ...extra] };
      }),
  },
  {
    name: 'extra-filter(-50% papers)',
    preserves: false,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        if (!t.vars.includes('paper')) return null;
        const keep = new Set(
          shuffle(papersOf(t)).slice(
            0,
            Math.max(1, Math.floor(papersOf(t).length / 2))
          )
        );
        if (keep.size === papersOf(t).length) return null;
        return { vars: t.vars, rows: t.rows.filter((r) => keep.has(r.paper)) };
      }),
  },
  {
    name: 'misattached-values',
    preserves: false,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        if (!t.vars.includes('paper')) return null;
        const ps = papersOf(t);
        if (ps.length < 3) return null;
        const rot = new Map(ps.map((p, i) => [p, ps[(i + 1) % ps.length]]));
        return {
          vars: t.vars,
          rows: t.rows.map((r) => ({
            ...r,
            paper: rot.get(r.paper) ?? r.paper,
          })),
        };
      }),
  },
  {
    name: 'drop-answer-column',
    preserves: false,
    apply: (_id, ts) =>
      mapTables(ts, (t) => {
        const ans = answerCols(t);
        if (ans.length < 2) return null;
        return {
          vars: t.vars.filter((v) => v !== ans[ans.length - 1]),
          rows: t.rows.map((r) => {
            const o = { ...r };
            delete o[ans[ans.length - 1]];
            return o;
          }),
        };
      }),
  },
  {
    name: 'extra-unrequested-column',
    preserves: false,
    apply: (id, ts) =>
      mapTables(ts, (t) => {
        if (!t.vars.includes('paper')) return null;
        const ans = answerCols(t);
        if (!ans.length) return null;
        const sib = sibling(
          id,
          ans[0],
          new Set(t.rows.map((r) => normaliseValue(r[ans[0]] ?? '')))
        );
        if (!sib) return null;
        const byPaper = new Map<string, string>();
        for (const r of sib.t.rows)
          if (r.paper && r[sib.c]) byPaper.set(r.paper, r[sib.c]);
        return {
          vars: [...t.vars, 'extra'],
          rows: t.rows.map((r) => ({
            ...r,
            extra: byPaper.get(r.paper) ?? `v${Math.floor(rand() * 5)}`,
          })),
        };
      }),
  },
];

type Row = {
  transform: string;
  preserves: boolean;
  n: number;
  lenientExact: number;
  strictExact: number;
  lenientMean: number;
  strictMean: number;
};
const out: Row[] = [];
console.log(
  [
    'transform',
    'preserves',
    'n',
    'lenient F1=1',
    'strict F1=1',
    'lenient mean',
    'strict mean',
  ].join('\t')
);
for (const tr of TRANSFORMS) {
  const r: Row = {
    transform: tr.name,
    preserves: tr.preserves,
    n: 0,
    lenientExact: 0,
    strictExact: 0,
    lenientMean: 0,
    strictMean: 0,
  };
  for (const [id, ts] of gold) {
    const pred = tr.apply(id, ts);
    if (!pred) continue;
    const l = scoreTables(ts, pred).f1;
    const s = scoreTablesStrict(ts, pred).f1;
    r.n++;
    r.lenientExact += l >= 0.999 ? 1 : 0;
    r.strictExact += s >= 0.999 ? 1 : 0;
    r.lenientMean += l;
    r.strictMean += s;
  }
  if (r.n) {
    r.lenientExact /= r.n;
    r.strictExact /= r.n;
    r.lenientMean /= r.n;
    r.strictMean /= r.n;
  }
  out.push(r);
  console.log(
    [
      r.transform,
      r.preserves,
      r.n,
      r.lenientExact.toFixed(2),
      r.strictExact.toFixed(2),
      r.lenientMean.toFixed(2),
      r.strictMean.toFixed(2),
    ].join('\t')
  );
}
// sanity: identity
let idOk = 0;
for (const [, ts] of gold)
  idOk +=
    scoreTables(ts, ts).f1 >= 0.999 && scoreTablesStrict(ts, ts).f1 >= 0.999
      ? 1
      : 0;
console.log(`identity: ${idOk}/${gold.size} exact under both scorers`);
if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify(
      { items: gold.size, identityExact: idOk, transforms: out },
      null,
      1
    )
  );
if (args.includes('--debug')) {
  const tr = TRANSFORMS.find((t) => t.name === 'wrong-attribute')!;
  for (const [id, ts] of gold) {
    const pred = tr.apply(id, ts);
    if (pred && scoreTables(ts, pred).f1 >= 0.999) {
      const c = answerCols(ts[0]);
      console.log(
        id,
        ts[0].vars,
        'flag?',
        c.map((x) => isFlag(ts[0], x)),
        [...new Set(ts[0].rows.map((r) => r[c[0]]))].slice(0, 3),
        '->',
        [...new Set(pred[0].rows.map((r) => r[c[0]]))].slice(0, 3)
      );
    }
  }
}
