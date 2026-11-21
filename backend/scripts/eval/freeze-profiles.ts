/**
 * Compute and freeze the run-time instance profile (shared/instanceProfile.ts)
 * of every template in the given question sets, one template at a time.
 *
 *   npx tsx scripts/eval/freeze-profiles.ts data/curated-cqs.json data/ood-cqs.json ...
 */
import { readFileSync } from 'node:fs';
import { instanceProfile } from './pipeline.js';

const ids = new Set<string>();
for (const f of process.argv.slice(2))
  for (const it of (
    JSON.parse(readFileSync(f, 'utf8')) as { items: { templateId: string }[] }
  ).items)
    ids.add(it.templateId);
let i = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const p = await instanceProfile(id);
    console.log(
      `${++i}/${ids.size} ${id} ${((Date.now() - t0) / 1000).toFixed(0)}s route=${JSON.stringify(p.attachment?.chosen)} classes=${p.classes.length}${p.incomplete ? ' INCOMPLETE' : ''}`
    );
  } catch (err) {
    console.log(
      `${++i}/${ids.size} ${id} FAILED ${err instanceof Error ? err.message.slice(0, 100) : err}`
    );
  }
}
