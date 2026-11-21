/**
 * Paper-level statistics over JSONL run logs:
 *  - mean F1 ± SD of per-run means, exact-match rate (share of runs with F1 = 1),
 *    questions with F1 = 1 on every run;
 *  - paired bootstrap 95% CI over questions for each config minus a reference;
 *  - optional per-template breakdown;
 *  - --empty: abstention metric for questions whose gold answer is empty / zero.
 *
 * Usage:
 *   npx tsx scripts/eval/analyze.ts runs/a.jsonl [...] --gold data/gold-results-ood.json \
 *     [--ref full] [--by-template] [--empty]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scoreTables,
  scoreTablesStrict,
  normaliseValue,
  setPRF,
  type ResultTable,
} from './common.js';
import type { RunRecord } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const goldPath =
  opt('--gold') ?? join(here, 'data', 'gold-results-curated.json');
const ref = opt('--ref') ?? 'full';
const byTemplate = args.includes('--by-template');
const emptyMode = args.includes('--empty');
/** Secondary score: also credit aggregated answers (value, #papers) when no paper column is returned. */
const aggMode = args.includes('--agg');
/** Strict scorer: one-to-one column alignment, extra columns penalised. */
const strictMode = args.includes('--strict');
/** Write per-(model,config,item,run) scores as JSONL for figures. */
const dumpPath = opt('--dump');
/** Write the summary rows (incl. Δ and CI) as JSON for figures. */
const summaryPath = opt('--summary');
const summaryRows: Record<string, unknown>[] = [];
const files = args.filter((a) => a.endsWith('.jsonl'));

const gold = JSON.parse(readFileSync(goldPath, 'utf8')) as {
  items: Array<{
    id: string;
    results: Array<{
      ok: boolean;
      vars?: string[];
      rows?: Record<string, string>[];
    }>;
  }>;
};
const goldById = new Map<string, ResultTable[]>(
  gold.items.map((g) => [
    g.id,
    g.results
      .filter((r) => r.ok)
      .map((r) => ({ vars: r.vars ?? [], rows: r.rows ?? [] })),
  ])
);

const latest = new Map<string, RunRecord>();
for (const f of files)
  for (const line of readFileSync(f, 'utf8').split('\n'))
    if (line.trim()) {
      const r = JSON.parse(line) as RunRecord;
      if (!goldById.has(r.itemId)) continue;
      latest.set(`${r.itemId}|${r.config}|${r.model}|${r.run}`, r);
    }

/** An answer that states nothing: no rows, or only zero / empty counts. */
const IDENTITY =
  /^(paper|paperlabel|paper_label|title|contribution|contri|year|doi)$/i;
const abstains = (tables: ResultTable[]) =>
  tables.every((t) =>
    t.rows.every((row) =>
      Object.entries(row)
        .filter(([k]) => !IDENTITY.test(k))
        .every(([, v]) => v === '' || normaliseValue(v) === '0')
    )
  );

/**
 * Aggregate-aware fallback. Gold answers are row-level (paper, value); a query
 * that answers "how many papers per X" with GROUP BY returns (X, count) and no
 * paper column, which the strict scorer gives 0. Here each non-flag gold answer
 * column is aggregated to {value -> #distinct papers} and compared with the best
 * (label column, numeric column) pair of a predicted table without a paper column.
 */
const isNum = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());
const aggScore = (gold: ResultTable[], pred: ResultTable[]) => {
  const cols: number[] = [];
  for (const t of gold) {
    const key = t.vars.find((v) => /^paper$/i.test(v));
    if (!key) continue;
    const goldPapers = new Set(t.rows.map((r) => normaliseValue(r[key] ?? '')));
    for (const v of t.vars.filter((x) => !IDENTITY.test(x))) {
      const byVal = new Map<string, Set<string>>();
      for (const r of t.rows) {
        const val = r[v];
        if (!val || !r[key]) continue;
        const n = normaliseValue(val);
        byVal.set(n, (byVal.get(n) ?? new Set()).add(normaliseValue(r[key])));
      }
      if (byVal.size <= 2) continue; // flags: no aggregate fallback
      const g = new Set(
        [...byVal].map(([val, ps]) => `${val}\u0000${ps.size}`)
      );
      let best = 0;
      for (const pt of pred) {
        const hasPaper = pt.vars.some((pv) =>
          pt.rows.some((r) => goldPapers.has(normaliseValue(r[pv] ?? '')))
        );
        if (hasPaper) continue;
        for (const lab of pt.vars)
          for (const num of pt.vars) {
            if (
              lab === num ||
              !pt.rows.length ||
              !pt.rows.every((r) => isNum(r[num] ?? ''))
            )
              continue;
            const c = new Set(
              pt.rows.map(
                (r) =>
                  `${normaliseValue(r[lab] ?? '')}\u0000${normaliseValue(r[num])}`
              )
            );
            best = Math.max(best, setPRF(g, c).f1);
          }
      }
      cols.push(best);
    }
  }
  return cols.length ? cols.reduce((a, b) => a + b, 0) / cols.length : 0;
};

type Score = { f1: number; exact: number };
// config -> item -> run -> score
const scores = new Map<string, Map<string, Map<number, Score>>>();
const recsByKey = new Map<string, RunRecord[]>();
for (const rec of latest.values()) {
  const key = `${rec.model.split('/').pop()}|${rec.config}`;
  let f1: number;
  const goldEmpty = (goldById.get(rec.itemId) ?? []).every(
    (t) => t.rows.length === 0
  );
  if (emptyMode || goldEmpty)
    f1 = rec.executable && abstains(rec.finalTables) ? 1 : 0;
  else if (!rec.executable) f1 = 0;
  else {
    const g = goldById.get(rec.itemId)!;
    f1 = (strictMode ? scoreTablesStrict : scoreTables)(g, rec.finalTables).f1;
    if (aggMode && f1 < 0.999) f1 = Math.max(f1, aggScore(g, rec.finalTables));
  }
  const byItem = scores.get(key) ?? new Map();
  const byRun = byItem.get(rec.itemId) ?? new Map();
  byRun.set(rec.run, { f1, exact: f1 >= 0.999 ? 1 : 0 });
  byItem.set(rec.itemId, byRun);
  scores.set(key, byItem);
  recsByKey.set(key, [...(recsByKey.get(key) ?? []), rec]);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(
    xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)
  );
};
const itemMean = (byRun: Map<number, Score>, k: keyof Score) =>
  mean([...byRun.values()].map((s) => s[k]));

// Deterministic PRNG so CIs are reproducible.
let seed = 12345;
const rand = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const bootstrapCI = (diffs: number[], B = 10000) => {
  const n = diffs.length;
  const means: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(rand() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * B)], means[Math.floor(0.975 * B)]];
};

const summarise = (filter?: (itemId: string) => boolean, label = 'all') => {
  console.log(
    `\n## ${label}${emptyMode ? ' (score = abstained correctly)' : ''}`
  );
  console.log(
    [
      'model|config',
      'nItems',
      'Exec%',
      'NonEmp%',
      'F1 mean±SD(runs)',
      'exact/run%',
      'exact all runs',
      'repairs/q',
      'rejects',
      '$/q',
      `Δ vs ${ref} [95% CI]`,
      'better/worse/tie',
    ].join('\t')
  );
  for (const [key, byItem] of [...scores.entries()].sort()) {
    const items = [...byItem.keys()].filter((i) => !filter || filter(i)).sort();
    if (!items.length) continue;
    const runs = new Set<number>();
    for (const i of items) for (const r of byItem.get(i)!.keys()) runs.add(r);
    const perRunMeans = [...runs].map((r) =>
      mean(items.map((i) => byItem.get(i)!.get(r)?.f1 ?? 0))
    );
    const exactRun = mean(
      items.flatMap((i) => [...byItem.get(i)!.values()].map((s) => s.exact))
    );
    const exactAll = items.filter((i) =>
      [...byItem.get(i)!.values()].every((s) => s.exact)
    ).length;
    const m = { exec: 0, nonEmpty: 0, n: 0, repairs: 0, rejects: 0, cost: 0 };
    for (const rec of recsByKey.get(key)!) {
      if (filter && !filter(rec.itemId)) continue;
      m.n++;
      m.exec += rec.executable ? 1 : 0;
      m.nonEmpty += rec.nonEmpty ? 1 : 0;
      m.repairs += rec.repairs;
      m.rejects += rec.validatorRejections;
      m.cost += rec.costUsd;
    }
    let delta = '';
    let bwt = '';
    let ci: [number, number] | null = null;
    let dMean: number | null = null;
    const refKey = `${key.split('|')[0]}|${ref}`;
    const refItems = scores.get(refKey);
    if (refItems && refKey !== key) {
      const shared = items.filter((i) => refItems.has(i));
      const diffs = shared.map(
        (i) => itemMean(byItem.get(i)!, 'f1') - itemMean(refItems.get(i)!, 'f1')
      );
      // Two-level bootstrap: resample questions, then runs within each question
      // (independently per config), so run-to-run noise widens the interval.
      const runsA = shared.map((i) =>
        [...byItem.get(i)!.values()].map((x) => x.f1)
      );
      const runsB = shared.map((i) =>
        [...refItems.get(i)!.values()].map((x) => x.f1)
      );
      const pick = (xs: number[]) => {
        let t = 0;
        for (let k = 0; k < xs.length; k++)
          t += xs[Math.floor(rand() * xs.length)];
        return t / xs.length;
      };
      const B = 10000;
      const bs: number[] = [];
      for (let b = 0; b < B; b++) {
        let t = 0;
        for (let k = 0; k < shared.length; k++) {
          const q = Math.floor(rand() * shared.length);
          t += pick(runsA[q]) - pick(runsB[q]);
        }
        bs.push(t / shared.length);
      }
      bs.sort((x, y) => x - y);
      const [lo, hi] = [bs[Math.floor(0.025 * B)], bs[Math.floor(0.975 * B)]];
      void bootstrapCI;
      delta = `${mean(diffs) >= 0 ? '+' : ''}${mean(diffs).toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`;
      ci = [lo, hi];
      dMean = mean(diffs);
      const eps = 1e-9;
      bwt = `${diffs.filter((d) => d > eps).length}/${diffs.filter((d) => d < -eps).length}/${diffs.filter((d) => Math.abs(d) <= eps).length}`;
    }
    summaryRows.push({
      label,
      model: key.split('|')[0],
      config: key.split('|')[1],
      n: items.length,
      exec: m.exec / m.n,
      nonEmpty: m.nonEmpty / m.n,
      f1: mean(perRunMeans),
      f1Sd: sd(perRunMeans),
      exactRate: exactRun,
      exactAll,
      costPerQ: m.cost / m.n,
      delta: dMean,
      ci,
      strict: strictMode,
      repairsPerQ: m.repairs / m.n,
      rejects: m.rejects,
    });
    console.log(
      [
        key,
        items.length,
        ((100 * m.exec) / m.n).toFixed(1),
        ((100 * m.nonEmpty) / m.n).toFixed(1),
        `${mean(perRunMeans).toFixed(2)} ± ${sd(perRunMeans).toFixed(2)}`,
        (100 * exactRun).toFixed(1),
        `${exactAll}/${items.length}`,
        (m.repairs / m.n).toFixed(2),
        m.rejects,
        (m.cost / m.n).toFixed(4),
        delta,
        bwt,
      ].join('\t')
    );
  }
};

summarise();
if (summaryPath) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(summaryPath, JSON.stringify(summaryRows, null, 1));
}
if (dumpPath) {
  const { writeFileSync } = await import('node:fs');
  const lines: string[] = [];
  for (const [key, byItem] of scores)
    for (const [item, byRun] of byItem)
      for (const [run, sc] of byRun) {
        const [model, config] = key.split('|');
        lines.push(
          JSON.stringify({
            model,
            config,
            item,
            run,
            f1: sc.f1,
            exact: sc.exact,
            strict: strictMode,
            empty: emptyMode,
          })
        );
      }
  writeFileSync(dumpPath, lines.join('\n') + '\n');
}
if (byTemplate) {
  const templates = new Set([...latest.values()].map((r) => r.templateId));
  for (const t of [...templates].sort())
    summarise((i) => i.startsWith(`${t}/`), `template ${t}`);
}
if (summaryPath) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(summaryPath, JSON.stringify(summaryRows, null, 1));
}
