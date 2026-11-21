/**
 * Execute every gold query against the live ORKG endpoint and freeze the
 * result sets with a timestamp, so scoring is immune to later curation drift.
 *
 * Usage: npx tsx scripts/eval/freeze-gold.ts [dataset.json] [out.json]
 *   defaults: data/curated-cqs.json → data/gold-results-curated.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeSparql, mapLimit, type EvalItem } from './common.js';

const here = dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2] ?? join(here, 'data', 'curated-cqs.json');
const outPath =
  process.argv[3] ?? join(here, 'data', 'gold-results-curated.json');

const { items } = JSON.parse(readFileSync(inPath, 'utf8')) as {
  items: EvalItem[];
};

const frozen = await mapLimit(items, 3, async (item) => {
  const results = [];
  for (const q of item.goldQueries) {
    const r = await executeSparql(q, 120_000);
    results.push(
      r.ok
        ? { ok: true, vars: r.table.vars, rows: r.table.rows }
        : { ok: false, error: r.error }
    );
  }
  const summary = results
    .map((r) => (r.ok ? `${r.rows?.length} rows` : `ERROR`))
    .join(', ');
  console.log(`${item.id}: ${summary}`);
  return { id: item.id, results };
});

const failed = frozen.filter((f) => f.results.some((r) => !r.ok));
const empty = frozen.filter((f) =>
  f.results.every((r) => r.ok && r.rows?.length === 0)
);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      endpoint: 'https://orkg.org/triplestore/sparql',
      source: inPath.split('/').pop(),
      items: frozen,
    },
    null,
    1
  )
);
console.log(
  `\nFroze ${frozen.length} items → ${outPath}\n  failing: ${failed.map((f) => f.id).join(', ') || 'none'}\n  empty: ${empty.map((f) => f.id).join(', ') || 'none'}`
);
