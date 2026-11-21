/**
 * Check how many SciQA gold queries still execute on the live ORKG endpoint.
 * Usage: npx tsx scripts/eval/check-sciqa.ts <sciqa-test.json> [out.json]
 *   input: array of SciQA rows ({id, question:{string}, query:{sparql}, template_id, query_type})
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { executeSparql, mapLimit } from './common.js';

const [inPath, outPath = 'sciqa-executability.json'] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(inPath, 'utf8')) as Array<{
  id: string;
  question: { string: string };
  query: { sparql: string };
  template_id: string;
  query_type: string;
}>;

const results = await mapLimit(rows, 2, async (r) => {
  const res = await executeSparql(r.query.sparql, 60_000);
  return {
    id: r.id,
    template: r.template_id,
    type: r.query_type,
    ok: res.ok,
    rows: res.ok ? res.table.rows.length : 0,
    error: res.ok ? undefined : res.error.slice(0, 200),
  };
});
const ok = results.filter((r) => r.ok);
const nonEmpty = ok.filter((r) => r.rows > 0);
console.log(
  `SciQA test: ${rows.length} queries · executable ${ok.length} · non-empty ${nonEmpty.length}`
);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: rows.length,
      executable: ok.length,
      nonEmpty: nonEmpty.length,
      results,
    },
    null,
    1
  )
);
