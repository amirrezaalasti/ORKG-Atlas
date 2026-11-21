/**
 * Print the instance profile (route, declared-vs-used predicates) of templates
 * as the profiled configuration puts it into the prompt.
 *
 *   npx tsx scripts/eval/profile-template.ts R593670 R702332 [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { instanceProfile } from './pipeline.js';
import {
  reconcile,
  renderProfileSection,
} from '../../../shared/instanceProfile.js';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json')
  ? args[args.indexOf('--json') + 1]
  : undefined;
const ids = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--json'
);
const out: Record<string, unknown> = {};
for (const t of ids) {
  const t0 = Date.now();
  const p = await instanceProfile(t);
  console.log(
    `### ${t} (${((Date.now() - t0) / 1000).toFixed(0)} s) route=${JSON.stringify(p.attachment?.chosen)} coverage=${p.attachment?.chosenCoverage?.toFixed(2)}`
  );
  console.log(renderProfileSection(p));
  out[t] = { profile: p, reconciliation: reconcile(p) };
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
