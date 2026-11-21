/**
 * Draw a stratified sample of scored outputs for a blind correctness audit.
 * Writes audit/sample.md (no scores) and audit/key.json (scores) .
 * Usage: npx tsx scripts/eval/audit-sample.ts <runs.jsonl>:<gold.json> [...] --n 40
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreTables, type ResultTable } from './common.js';
import type { RunRecord } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const pairs = process.argv.slice(2).filter((a) => a.includes(':'));
const n = Number(process.argv[process.argv.indexOf('--n') + 1] ?? 40);
let seed = 7;
const rand = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

type Cand = {
  rec: RunRecord;
  f1: number;
  question: string;
  gold: string[];
  goldTables: ResultTable[];
};
const cands: Cand[] = [];
for (const p of pairs) {
  const [runs, goldPath, dsPath] = p.split(':');
  const gold = JSON.parse(readFileSync(goldPath, 'utf8')).items as any[];
  const ds = JSON.parse(readFileSync(dsPath, 'utf8')).items as any[];
  for (const line of readFileSync(runs, 'utf8').trim().split('\n')) {
    const rec = JSON.parse(line) as RunRecord;
    if (
      rec.run !== 1 ||
      !['full', 'no-guidance', 'schema-dump', 'no-nesting'].includes(
        rec.config
      ) ||
      !rec.executable
    )
      continue;
    const g = gold.find((x) => x.id === rec.itemId);
    const item = ds.find((x) => x.id === rec.itemId);
    const goldTables = g.results
      .filter((r: any) => r.ok)
      .map((r: any) => ({ vars: r.vars, rows: r.rows }));
    cands.push({
      rec,
      f1: scoreTables(goldTables, rec.finalTables).f1,
      question: item.question,
      gold: item.goldQueries,
      goldTables,
    });
  }
}
const bins = [
  (f: number) => f === 0,
  (f: number) => f > 0 && f < 0.5,
  (f: number) => f >= 0.5 && f < 0.999,
  (f: number) => f >= 0.999,
];
const picked: Cand[] = [];
for (const b of bins) {
  const pool = cands.filter((c) => b(c.f1)).sort(() => rand() - 0.5);
  picked.push(...pool.slice(0, Math.ceil(n / 4)));
}
picked.sort(() => rand() - 0.5);
const head = (t: ResultTable) =>
  `${t.rows.length} rows; columns: ${t.vars.join(', ')}\n` +
  t.rows
    .slice(0, 12)
    .map(
      (r) =>
        '  ' +
        t.vars
          .map(
            (v) =>
              `${v}=${(r[v] ?? '').replace(/http:\/\/orkg.org\/orkg\/resource\//, '').slice(0, 60)}`
          )
          .join(' | ')
    )
    .join('\n');
const out = join(here, 'audit');
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, 'sample.md'),
  picked
    .map(
      (c, i) =>
        `## Case ${i + 1}\nQuestion: ${c.question}\n\n### Gold query\n${c.gold.join('\n---\n')}\n\n### Gold result (head)\n${c.goldTables.map(head).join('\n---\n')}\n\n### Predicted query\n${c.rec.finalQueries.join('\n---\n').replace(/^PREFIX.*\n/gm, '')}\n\n### Predicted result (head)\n${c.rec.finalTables.map(head).join('\n---\n')}\n`
    )
    .join('\n')
);
writeFileSync(
  join(out, 'key.json'),
  JSON.stringify(
    picked.map((c, i) => ({
      case: i + 1,
      item: c.rec.itemId,
      config: c.rec.config,
      f1: c.f1,
    })),
    null,
    1
  )
);
console.log(`${picked.length} cases from ${cands.length} candidates`);
