/**
 * Freeze instance profiles for the evaluated templates from the catalogue dump
 * profile (catalogue/profile_dump.py) instead of live aggregate queries.
 *
 * Template definitions (root + reachable sub-templates, at most 12 classes) come
 * from the live template API exactly as at run time; instance counts, routes,
 * predicate usage, and predicate labels come from the 14 Nov 2026 dump, so the
 * profiles, the catalogue analysis, and the sampled gold describe one snapshot.
 * The rules of profileTemplates are mirrored: two-hop routes only when no
 * instance is a contribution and fewer than five sit one hop below; route choice
 * via chooseRoute; undeclared labels only for salient predicates.
 *
 *   npx tsx scripts/eval/freeze-profiles-dump.ts data/curated-cqs.json ... [--check data/profiles-live-check.json]
 *     [--profile <catalogue-profile-dump.json>] [--out <profiles.json>]   (defaults: data/…)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplateFlow } from '../../src/services/orkg/templateFlow.js';
import {
  chooseRoute,
  type AttachmentRoute,
  type RouteCombo,
  type ClassUsage,
  type InstanceProfile,
} from '../../../shared/instanceProfile.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const checkPath = args.includes('--check')
  ? args[args.indexOf('--check') + 1]
  : undefined;
const optVal = (k: string) =>
  args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
const dumpProfilePath =
  optVal('--profile') ?? join(here, 'data', 'catalogue-profile-dump.json');
const outPath = optVal('--out') ?? join(here, 'data', 'profiles-frozen.json');
const sets = args.filter(
  (a) =>
    a.endsWith('.json') &&
    ![checkPath, optVal('--profile'), optVal('--out')].includes(a)
);

type DumpT = {
  target_class: string;
  n_instances: number;
  n_attached: number;
  routes: { depth: number; route: string[]; n: number }[];
  combos?: RouteCombo[];
  used: Record<string, number>;
};
const dump = JSON.parse(readFileSync(dumpProfilePath, 'utf8')) as {
  dump: string;
  templates: Record<string, DumpT>;
  predicate_labels: Record<string, string>;
};
const byClass = new Map<string, DumpT>();
for (const t of Object.values(dump.templates))
  if (!byClass.has(t.target_class)) byClass.set(t.target_class, t);

const GENERIC = new Set([
  'P32',
  'P30',
  'P31',
  'P26',
  'P29',
  'SAME_AS',
  'url',
  'hasAuthors',
  'hasContent',
  'license',
  'compareWith',
  'description',
]);
const isSalient = (n: number, total: number) => n >= 2 && n >= 0.1 * total;

// Fallback when the template API is unreachable: the frozen catalogue snapshot,
// expanded with the resolver's rule (a property whose class is another template's
// target class nests that template; visited set ends cycles).
type SnapT = {
  id: string;
  label?: string;
  target_class?: { id?: string };
  properties?: {
    path?: { id?: string; label?: string };
    class?: { id?: string };
  }[];
};
const snap = JSON.parse(
  gunzipSync(
    readFileSync(join(here, 'data', 'orkg-templates-2026-08-28.json.gz'))
  ).toString()
) as SnapT[];
const snapById = new Map(snap.map((t) => [t.id, t]));
const snapByClass = new Map<string, SnapT[]>();
for (const t of snap)
  if (t.target_class?.id)
    snapByClass.set(t.target_class.id, [
      ...(snapByClass.get(t.target_class.id) ?? []),
      t,
    ]);
const snapshotFlow = (id: string) => {
  const root = snapById.get(id);
  if (!root) throw new Error(`template ${id} not in snapshot`);
  const seen = new Set([id]);
  const order = [root];
  for (let i = 0; i < order.length; i++)
    for (const p of order[i].properties ?? [])
      for (const t of [...(snapByClass.get(p.class?.id ?? '') ?? [])].sort(
        (a, b) => a.id.localeCompare(b.id)
      ))
        if (!seen.has(t.id)) {
          seen.add(t.id);
          order.push(t);
        }
  return { templates: order, targetClassId: root.target_class?.id };
};
const snapshotOnly = args.includes('--snapshot');
const flow = async (id: string) => {
  if (snapshotOnly) return { ...snapshotFlow(id), from: 'snapshot' };
  for (let i = 0; i < 3; i++) {
    try {
      return { ...(await loadTemplateFlow(id)), from: 'api' };
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return { ...snapshotFlow(id), from: 'snapshot' };
};

const ids = new Set<string>();
for (const f of sets)
  for (const it of (
    JSON.parse(readFileSync(f, 'utf8')) as { items: { templateId: string }[] }
  ).items)
    ids.add(it.templateId);

const out: Record<string, InstanceProfile & { source: string }> = {};
const missing: string[] = [];
for (const id of ids) {
  const { templates, targetClassId, from } = await flow(id);
  const root = byClass.get(targetClassId ?? '');
  if (!targetClassId || !root) {
    missing.push(id);
    continue;
  }
  const routes0: AttachmentRoute[] = root.routes.map((r) => ({
    depth: r.depth as 0 | 1 | 2,
    hops: r.route.map((p) => [p]),
    instances: r.n,
  }));
  const n0 = routes0
    .filter((r) => r.depth === 0)
    .reduce((s, r) => s + r.instances, 0);
  // Distinct one-hop instances when the dump profile has route signatures (else summed, as before).
  const n1 = root.combos
    ? root.combos.filter((c) => c.depth === 1).reduce((s, c) => s + c.n, 0)
    : routes0.filter((r) => r.depth === 1).reduce((s, r) => s + r.instances, 0);
  const twoHop = n0 + n1 === 0 || (n0 === 0 && n1 < 5);
  const routes = routes0.filter((r) => r.depth < 2 || twoHop);
  const combos = root.combos?.filter((c) => c.depth < 2 || twoHop);
  const attachment = {
    attached: root.n_attached,
    routes,
    ...(combos ? { combos } : {}),
    ...chooseRoute(routes, root.n_attached, 0.9, combos),
  };

  const declared: InstanceProfile['declared'] = [];
  const labelOf = new Map<string, string>();
  for (const t of templates) {
    const c = t.target_class?.id;
    if (!c) continue;
    if (t.label && !labelOf.has(c)) labelOf.set(c, t.label);
    for (const p of t.properties ?? [])
      if (p.path?.id)
        declared.push({
          classId: c,
          predicate: p.path.id,
          label: p.path.label,
        });
  }
  const classIds = [
    targetClassId,
    ...[...labelOf.keys()].filter((c) => c !== targetClassId),
  ].slice(0, 12);
  const classes: ClassUsage[] = [];
  for (const c of classIds) {
    const d = byClass.get(c);
    if (!d) continue; // class newer than the catalogue snapshot
    const used = Object.fromEntries(
      Object.entries(d.used).filter(([p]) => p !== 'description')
    );
    classes.push({
      classId: c,
      templateLabel: labelOf.get(c),
      instances: d.n_instances,
      used,
    });
  }
  const declaredSet = new Set(
    declared.map((d) => `${d.classId}|${d.predicate}`)
  );
  const predicateLabels: Record<string, string> = {};
  for (const c of classes)
    for (const [p, n] of Object.entries(c.used))
      if (
        !declaredSet.has(`${c.classId}|${p}`) &&
        !GENERIC.has(p) &&
        isSalient(n, c.instances) &&
        dump.predicate_labels[p]
      )
        predicateLabels[p] = dump.predicate_labels[p];
  out[id] = {
    rootClass: targetClassId,
    attachment,
    classes,
    declared,
    predicateLabels,
    ...(classes.length < classIds.length ? { incomplete: true } : {}),
    source: `${dump.dump}; templates from ${from}`,
  };
  console.log(
    `${id} [${from}] route=${JSON.stringify(attachment.chosen)} cov=${attachment.chosenCoverage.toFixed(2)} classes=${classes.length}/${classIds.length}`
  );
}
writeFileSync(outPath, JSON.stringify(out));
console.log(
  `froze ${Object.keys(out).length} profiles; no dump class for: ${missing.join(', ') || 'none'}`
);

if (checkPath) {
  const live = JSON.parse(readFileSync(checkPath, 'utf8')) as Record<
    string,
    InstanceProfile
  >;
  for (const [id, l] of Object.entries(live)) {
    const d = out[id];
    if (!d) continue;
    const same =
      JSON.stringify(l.attachment?.chosen) ===
      JSON.stringify(d.attachment?.chosen);
    let diffs = 0,
      total = 0;
    for (const lc of l.classes) {
      // Compare classes both profiles reached; 'description' is excluded by design.
      const dc = d.classes.find((c) => c.classId === lc.classId);
      if (!dc) continue;
      for (const [p, n] of Object.entries(lc.used)) {
        if (p === 'description') continue;
        total++;
        if (Math.abs((dc.used[p] ?? 0) - n) > Math.max(1, 0.02 * n)) diffs++;
      }
    }
    console.log(
      `check ${id}: route ${same ? 'same' : `live ${JSON.stringify(l.attachment?.chosen)} vs dump ${JSON.stringify(d.attachment?.chosen)}`}; usage counts differing >2%: ${diffs}/${total}`
    );
  }
}
