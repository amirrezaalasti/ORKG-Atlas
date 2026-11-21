/**
 * Score JSONL run logs against frozen gold results and print a per-config
 * table (Exec., non-empty rate, P/R/F1, repairs, validator rejections, cost).
 *
 * Usage: npx tsx scripts/eval/score.ts runs/*.jsonl [--gold data/gold-results-curated.json] [--per-item]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreTables, type ResultTable } from './common.js';
import type { RunRecord } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const goldIdx = args.indexOf('--gold');
const goldPath =
  goldIdx >= 0
    ? args[goldIdx + 1]
    : join(here, 'data', 'gold-results-curated.json');
const perItem = args.includes('--per-item');
const files = args.filter(
  (a, i) => a.endsWith('.jsonl') && !(goldIdx >= 0 && i === goldIdx + 1)
);

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

// Keep the latest record per (item, config, model, run): resumed runs retry errors.
const latest = new Map<string, RunRecord>();
for (const f of files)
  for (const line of readFileSync(f, 'utf8').split('\n'))
    if (line.trim()) {
      const r = JSON.parse(line) as RunRecord;
      latest.set(`${r.itemId}|${r.config}|${r.model}|${r.run}`, r);
    }
const records = [...latest.values()];

type Agg = {
  n: number;
  exec: number;
  nonEmpty: number;
  p: number;
  r: number;
  f1: number;
  repairs: number;
  rejects: number;
  cost: number;
  latency: number;
  errors: number;
};
const groups = new Map<string, Agg>();
const itemRows: string[] = [];

for (const rec of records) {
  const g = goldById.get(rec.itemId);
  if (!g) continue;
  const s = rec.executable
    ? scoreTables(g, rec.finalTables)
    : { p: 0, r: 0, f1: 0 };
  const key = `${rec.model}\t${rec.config}`;
  const a = groups.get(key) ?? {
    n: 0,
    exec: 0,
    nonEmpty: 0,
    p: 0,
    r: 0,
    f1: 0,
    repairs: 0,
    rejects: 0,
    cost: 0,
    latency: 0,
    errors: 0,
  };
  a.n++;
  a.exec += rec.executable ? 1 : 0;
  a.nonEmpty += rec.nonEmpty ? 1 : 0;
  a.p += s.p;
  a.r += s.r;
  a.f1 += s.f1;
  a.repairs += rec.repairs;
  a.rejects += rec.validatorRejections;
  a.cost += rec.costUsd;
  a.latency += rec.latencyMs;
  a.errors += rec.error ? 1 : 0;
  groups.set(key, a);
  itemRows.push(
    [
      rec.model,
      rec.config,
      rec.itemId,
      rec.run,
      rec.executable ? 1 : 0,
      rec.nonEmpty ? 1 : 0,
      s.p.toFixed(3),
      s.r.toFixed(3),
      s.f1.toFixed(3),
      rec.repairs,
      rec.validatorRejections,
      rec.costUsd.toFixed(5),
    ].join('\t')
  );
}

const pct = (x: number, n: number) => ((100 * x) / n).toFixed(1).padStart(5);
console.log(
  [
    'model',
    'config',
    'n',
    'Exec%',
    'NonEmp%',
    'P',
    'R',
    'F1',
    'repairs/q',
    'rejects/q',
    '$total',
    '$/q',
    's/q',
    'errors',
  ].join('\t')
);
const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
for (const [key, a] of sorted) {
  console.log(
    [
      key,
      a.n,
      pct(a.exec, a.n),
      pct(a.nonEmpty, a.n),
      (a.p / a.n).toFixed(3),
      (a.r / a.n).toFixed(3),
      (a.f1 / a.n).toFixed(3),
      (a.repairs / a.n).toFixed(2),
      (a.rejects / a.n).toFixed(2),
      a.cost.toFixed(4),
      (a.cost / a.n).toFixed(5),
      (a.latency / a.n / 1000).toFixed(1),
      a.errors,
    ].join('\t')
  );
}

if (perItem) {
  const out = join(here, 'runs', 'scores-per-item.tsv');
  writeFileSync(
    out,
    [
      'model',
      'config',
      'item',
      'run',
      'exec',
      'nonEmpty',
      'P',
      'R',
      'F1',
      'repairs',
      'rejects',
      'cost',
    ].join('\t') +
      '\n' +
      itemRows.join('\n') +
      '\n'
  );
  console.log(`\nPer-item scores → ${out}`);
}
