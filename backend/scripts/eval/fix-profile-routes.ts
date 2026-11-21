/**
 * Recompute the paper-to-instance route of frozen profiles with distinct-instance
 * coverage (shared/instanceProfile.ts chooseRoute with route signatures) and list the
 * questions whose route or reported coverage changes, for a targeted rerun.
 *
 * Usage, class usage, declared predicates and labels are kept from the frozen
 * profiles; only `attachment` is replaced, from a dump profile that has `combos`
 * (catalogue/profile_dump.py). The rule for two-hop routes is the profiler's.
 *
 *   npx tsx scripts/eval/fix-profile-routes.ts <dump-profile.json> \
 *     [--in data/profiles-frozen.json] [--out data/profiles-frozen-v2.json] [--subsets data/fixed-routes]
 * Writes the new profiles and, per question set with changed items, <subsets>-<set>-cqs.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseRoute,
  type AttachmentRoute,
  type InstanceProfile,
  type RouteCombo,
} from '../../../shared/instanceProfile.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k: string, d: string) =>
  args.includes(k) ? args[args.indexOf(k) + 1] : d;
const dumpPath = args[0];
const inPath = opt('--in', join(here, 'data', 'profiles-frozen.json'));
const outPath = opt('--out', join(here, 'data', 'profiles-frozen-v2.json'));
const subsets = opt('--subsets', join(here, 'data', 'fixed-routes'));

type DumpT = {
  target_class: string;
  n_attached: number;
  routes: { depth: number; route: string[]; n: number }[];
  combos?: RouteCombo[];
};
const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as {
  dump: string;
  templates: Record<string, DumpT>;
};
const byClass = new Map<string, DumpT>();
for (const t of Object.values(dump.templates))
  if (!byClass.has(t.target_class)) byClass.set(t.target_class, t);

const frozen = JSON.parse(readFileSync(inPath, 'utf8')) as Record<
  string,
  InstanceProfile & { source?: string }
>;
const norm = (c: unknown) =>
  JSON.stringify((c as string[][] | null)?.map((h) => [...h].sort()) ?? null);
const changed = new Set<string>();
const out: typeof frozen = {};
for (const [tid, p] of Object.entries(frozen)) {
  const root = byClass.get(p.rootClass);
  if (!root?.combos)
    throw new Error(
      `${tid}: dump profile has no route signatures for ${p.rootClass}`
    );
  const routes0: AttachmentRoute[] = root.routes.map((r) => ({
    depth: r.depth as 0 | 1 | 2,
    hops: r.route.map((x) => [x]),
    instances: r.n,
  }));
  const n0 = routes0
    .filter((r) => r.depth === 0)
    .reduce((s, r) => s + r.instances, 0);
  const n1 = root.combos
    .filter((c) => c.depth === 1)
    .reduce((s, c) => s + c.n, 0);
  const twoHop = n0 + n1 === 0 || (n0 === 0 && n1 < 5);
  const routes = routes0.filter((r) => r.depth < 2 || twoHop);
  const combos = root.combos.filter((c) => c.depth < 2 || twoHop);
  const attachment = {
    attached: root.n_attached,
    routes,
    combos,
    ...chooseRoute(routes, root.n_attached, 0.9, combos),
  };
  const before = p.attachment;
  if (
    norm(before?.chosen) !== norm(attachment.chosen) ||
    Math.round(100 * (before?.chosenCoverage ?? 0)) !==
      Math.round(100 * attachment.chosenCoverage)
  ) {
    changed.add(tid);
    console.log(
      `${tid}: ${norm(before?.chosen)} ${Math.round(100 * (before?.chosenCoverage ?? 0))}% -> ${norm(attachment.chosen)} ${Math.round(100 * attachment.chosenCoverage)}%`
    );
  }
  out[tid] = {
    ...p,
    attachment,
    source: `${p.source ?? ''}; routes recomputed with distinct coverage from ${dump.dump}`,
  };
}
writeFileSync(outPath, JSON.stringify(out));
console.log(
  `${changed.size} of ${Object.keys(frozen).length} templates changed -> ${outPath}`
);

for (const set of ['sampled', 'stress', 'curated', 'ood', 'empty']) {
  const data = JSON.parse(
    readFileSync(join(here, 'data', `${set}-cqs.json`), 'utf8')
  );
  const items = data.items.filter((it: { templateId: string }) =>
    changed.has(it.templateId)
  );
  if (!items.length) continue;
  const f = `${subsets}-${set}-cqs.json`;
  writeFileSync(
    f,
    JSON.stringify(
      {
        ...data,
        source: `${set} items whose templates' routes changed (fix-profile-routes.ts)`,
        count: items.length,
        items,
      },
      null,
      1
    )
  );
  console.log(`${set}: ${items.length} questions -> ${f}`);
}
