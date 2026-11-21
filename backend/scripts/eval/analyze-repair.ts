/**
 * H4: does endpoint-as-oracle repair help, and does it over-repair?
 * For every record that used ≥1 repair, re-execute the first-attempt queries
 * (no LLM calls), score them, and compare with the final (repaired) score,
 * grouped by what triggered the repair.
 *
 * Usage: npx tsx scripts/eval/analyze-repair.ts runs/a.jsonl [runs/b.jsonl …]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeSparql,
  mapLimit,
  scoreTables,
  type ResultTable,
} from './common.js';
import type { RunRecord } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(
  readFileSync(join(here, 'data', 'gold-results-curated.json'), 'utf8')
) as {
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
for (const f of process.argv.slice(2))
  for (const line of readFileSync(f, 'utf8').split('\n'))
    if (line.trim()) {
      const r = JSON.parse(line) as RunRecord;
      latest.set(`${r.itemId}|${r.config}|${r.model}|${r.run}`, r);
    }
const repaired = [...latest.values()].filter(
  (r) => r.repairs > 0 && !r.error && goldById.has(r.itemId)
);

type Row = {
  trigger: string;
  model: string;
  config: string;
  before: number;
  after: number;
};
const rows = await mapLimit(repaired, 2, async (r): Promise<Row> => {
  const g = goldById.get(r.itemId)!;
  const first = r.attempts[0];
  let before = 0;
  if (first.outcome === 'empty' || first.outcome === 'ok') {
    const res = await Promise.all(first.queries.map((q) => executeSparql(q)));
    if (res.every((x) => x.ok))
      before = scoreTables(
        g,
        res.map((x) => (x.ok ? x.table : { vars: [], rows: [] }))
      ).f1;
  }
  const after = r.executable ? scoreTables(g, r.finalTables).f1 : 0;
  return {
    trigger: first.outcome,
    model: r.model,
    config: r.config,
    before,
    after,
  };
});

const byTrigger = new Map<string, Row[]>();
for (const row of rows)
  byTrigger.set(row.trigger, [...(byTrigger.get(row.trigger) ?? []), row]);

console.log(
  [
    'trigger',
    'n',
    'F1 before',
    'F1 after',
    'improved',
    'worse',
    'unchanged',
    'final empty',
  ].join('\t')
);
for (const [trigger, rs] of [...byTrigger.entries()].sort()) {
  const mean = (k: 'before' | 'after') =>
    rs.reduce((s, x) => s + x[k], 0) / rs.length;
  const improved = rs.filter((x) => x.after > x.before + 0.05).length;
  const worse = rs.filter((x) => x.after < x.before - 0.05).length;
  const finalEmpty = repaired.filter(
    (r) => r.attempts[0].outcome === trigger && !r.nonEmpty
  ).length;
  console.log(
    [
      trigger,
      rs.length,
      mean('before').toFixed(3),
      mean('after').toFixed(3),
      improved,
      worse,
      rs.length - improved - worse,
      finalEmpty,
    ].join('\t')
  );
}
// Empty-triggered repairs where the empty first answer was in fact correct
// (gold also empty is impossible here: all gold sets are non-empty), so report
// the over-repair proxy: repaired queries that score worse than the original.
const worse = rows.filter((x) => x.after < x.before - 0.05);
console.log(
  `\nOver-repair (final F1 lower than first attempt by >0.05): ${worse.length} of ${rows.length} repaired records`
);
