/**
 * Instance profiling: reconciles what a template *declares* with what its
 * instances actually *state*.
 *
 * A template is a shape over instances, not a guarantee about them. Three kinds
 * of schema–data divergence break schema-grounded querying:
 *  1. heterogeneous attachment: instances hang off papers along several paths
 *     (directly, one hop, two hops below the contribution);
 *  2. declared-but-unused properties: a query over them is valid but empty;
 *  3. used-but-undeclared predicates: data use a predicate the template does not
 *     name (e.g. wikidata:P17 instead of the declared P15249 "country").
 *
 * The profiler measures all three with aggregate SPARQL queries (no instance
 * data leaves the endpoint other than counts and predicate labels) and renders
 * them as prompt context; `diagnoseEmptyResult` uses the same counts to tell a
 * data gap from a query problem when a query returns nothing.
 */

import type { PaperLinkPath } from './promptGenerator.js';

export type SparqlRunner = (
  query: string
) => Promise<Record<string, unknown>[]>;

const ORKG_PRED = 'http://orkg.org/orkg/predicate/';
const ORKG_CLASS = 'http://orkg.org/orkg/class/';
const shortPred = (uri: string) =>
  uri.startsWith(ORKG_PRED) ? uri.slice(ORKG_PRED.length) : uri;
/** Predicates every resource has; not informative for reconciliation. */
const STRUCTURAL = new Set([
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'description',
]);
/** ORKG system predicates any contribution may carry (research problem, field, DOI, ...). */
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
]);

export type AttachmentRoute = {
  depth: 0 | 1 | 2;
  /** Predicates on each hop below the contribution (empty for depth 0). */
  hops: string[][];
  /** Distinct instances reached along this route. */
  instances: number;
};

/**
 * Distinct-instance route signature: `n` instances are reached by exactly the
 * routes in `keys` at this depth (depth 1: "P"; depth 2: "H>G"). Route counts
 * overlap when an instance is reached along several predicates; signatures let
 * coverage of a predicate set be counted over distinct instances.
 */
export type RouteCombo = { depth: 1 | 2; keys: string[]; n: number };

export type AttachmentProfile = {
  /** Distinct instances reachable from a paper within two hops of P31. */
  attached: number;
  routes: AttachmentRoute[];
  combos?: RouteCombo[];
  /** Route the prompt uses: the most frequent depth, predicates covering ≥90% of it. */
  chosen: PaperLinkPath | null;
  /** Share of attached instances the chosen route reaches. */
  chosenCoverage: number;
};

export type ClassUsage = {
  classId: string;
  templateLabel?: string;
  instances: number;
  /** predicate id → number of instances stating it */
  used: Record<string, number>;
};

export type DeclaredProperty = {
  classId: string;
  predicate: string;
  label?: string;
};

export type InstanceProfile = {
  rootClass: string;
  attachment: AttachmentProfile | null;
  classes: ClassUsage[];
  declared: DeclaredProperty[];
  /** Labels of undeclared-but-used predicates. */
  predicateLabels: Record<string, string>;
  /** Some sub-template classes could not be profiled. */
  incomplete?: boolean;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Frequency-based paper-to-instance route discovery (replaces the existence probe). */
export const profileAttachment = async (
  classId: string,
  run: SparqlRunner,
  minShare = 0.9
): Promise<AttachmentProfile> => {
  const cls = `<${ORKG_CLASS}${classId}>`;
  const p31 = `<${ORKG_PRED}P31>`;
  const routes: AttachmentRoute[] = [];
  const direct = await run(
    `SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ?p ${p31} ?x . ?x a ${cls} }`
  );
  const n0 = num(direct[0]?.n);
  if (n0 > 0) routes.push({ depth: 0, hops: [], instances: n0 });
  const one = await run(
    `SELECT ?h (COUNT(DISTINCT ?x) AS ?n) WHERE { ?p ${p31} ?k . ?k ?h ?x . ?x a ${cls} } GROUP BY ?h ORDER BY DESC(?n)`
  );
  for (const r of one)
    routes.push({
      depth: 1,
      hops: [[shortPred(String(r.h))]],
      instances: num(r.n),
    });
  // Per-instance route signatures, aggregated in the endpoint (only counts leave it).
  const comboQuery = (depth: 1 | 2, pattern: string, key: string) =>
    run(
      `SELECT ?hs (COUNT(*) AS ?n) WHERE { { SELECT ?x (GROUP_CONCAT(DISTINCT ${key}; separator=" ") AS ?hs) WHERE { ${pattern} } GROUP BY ?x } } GROUP BY ?hs`
    ).then((rows) => parseCombos(depth, rows));
  const combos: RouteCombo[] = one.length
    ? await comboQuery(1, `?p ${p31} ?k . ?k ?h ?x . ?x a ${cls}`, 'STR(?h)')
    : [];
  // Two hops only when one hop finds little: the query is expensive on large classes.
  const n1 = distinctAtDepth(1, routes, combos);
  if (n0 + n1 === 0 || (n0 === 0 && n1 < 5)) {
    const two = await run(
      `SELECT ?h ?g (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x a ${cls} . ?m ?g ?x . ?k ?h ?m . ?p ${p31} ?k } GROUP BY ?h ?g ORDER BY DESC(?n) LIMIT 50`
    );
    for (const r of two)
      routes.push({
        depth: 2,
        hops: [[shortPred(String(r.h))], [shortPred(String(r.g))]],
        instances: num(r.n),
      });
    if (two.length)
      combos.push(
        ...(await comboQuery(
          2,
          `?x a ${cls} . ?m ?g ?x . ?k ?h ?m . ?p ${p31} ?k`,
          'CONCAT(STR(?h), ">", STR(?g))'
        ))
      );
  }
  const totalQ = await run(
    `SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x a ${cls} . { ?p ${p31} ?x } UNION { ?p ${p31} ?k . ?k ?h ?x } }`
  );
  // The UNION covers depths 0–1; depth-2 instances count only with measured signatures
  // (summed route counts overlap), else the largest single route is a safe lower bound.
  const depth2 = combos.some((c) => c.depth === 2)
    ? distinctAtDepth(2, routes, combos)
    : routes
        .filter((r) => r.depth === 2)
        .reduce((m, r) => Math.max(m, r.instances), 0);
  const attached = Math.max(
    num(totalQ[0]?.n),
    n0,
    depth2,
    ...routes.filter((r) => r.depth === 1).map((r) => r.instances)
  );

  return {
    attached,
    routes,
    ...(combos.length ? { combos } : {}),
    ...chooseRoute(routes, attached, minShare, combos),
  };
};

/** GROUP_CONCAT rows → signatures with short, sorted keys (merging reorderings). */
const parseCombos = (
  depth: 1 | 2,
  rows: Record<string, unknown>[]
): RouteCombo[] => {
  const merged = new Map<string, RouteCombo>();
  for (const r of rows) {
    const keys = [
      ...new Set(
        String(r.hs ?? '')
          .split(' ')
          .filter(Boolean)
          .map((k) => k.split('>').map(shortPred).join('>'))
      ),
    ].sort();
    if (!keys.length) continue;
    const id = keys.join(' ');
    const c = merged.get(id) ?? { depth, keys, n: 0 };
    c.n += num(r.n);
    merged.set(id, c);
  }
  return [...merged.values()];
};

const routeKey = (r: AttachmentRoute) => r.hops.map((h) => h[0]).join('>');

/**
 * Signatures for one depth. Without measured signatures (endpoint failure, old
 * frozen profiles) each route is treated as its own instances, as before.
 */
const combosAt = (
  depth: 1 | 2,
  routes: AttachmentRoute[],
  combos: RouteCombo[] = []
): RouteCombo[] => {
  const measured = combos.filter((c) => c.depth === depth);
  if (measured.length) return measured;
  return routes
    .filter((r) => r.depth === depth)
    .map((r) => ({ depth, keys: [routeKey(r)], n: r.instances }));
};

const distinctAtDepth = (
  depth: 1 | 2,
  routes: AttachmentRoute[],
  combos?: RouteCombo[]
) => combosAt(depth, routes, combos).reduce((s, c) => s + c.n, 0);

/** Distinct instances reached by at least one of the given route keys. */
const coverOf = (cs: RouteCombo[], keys: Set<string>) =>
  cs.reduce((s, c) => (c.keys.some((k) => keys.has(k)) ? s + c.n : s), 0);

/**
 * Route choice: the depth that reaches most distinct instances, then the fewest
 * predicates covering minShare of it, chosen greedily by new instances covered
 * (depth 1), or the first hop reaching most instances with all its second hops
 * (depth 2). Coverage counts distinct instances, so an instance reached along
 * two predicates is counted once.
 */
export const chooseRoute = (
  routes: AttachmentRoute[],
  attached: number,
  minShare = 0.9,
  combos?: RouteCombo[]
): { chosen: PaperLinkPath | null; chosenCoverage: number } => {
  const n0 = routes
    .filter((r) => r.depth === 0)
    .reduce((s, r) => Math.max(s, r.instances), 0);
  const c1 = combosAt(1, routes, combos);
  const c2 = combosAt(2, routes, combos);
  const totals: Array<[0 | 1 | 2, number]> = [
    [0, n0],
    [1, c1.reduce((s, c) => s + c.n, 0)],
    [2, c2.reduce((s, c) => s + c.n, 0)],
  ];
  let best: { depth: 0 | 1 | 2; n: number } | null = null;
  for (const [depth, n] of totals)
    if (n > 0 && (!best || n > best.n)) best = { depth, n };
  if (!best) return { chosen: null, chosenCoverage: 0 };
  const share = (covered: number) =>
    attached ? Math.min(1, covered / attached) : 0;
  if (best.depth === 0) return { chosen: [], chosenCoverage: share(best.n) };
  if (best.depth === 1) {
    const candidates = [...new Set(c1.flatMap((c) => c.keys))];
    const keep = new Set<string>();
    let covered = 0;
    while (covered < minShare * best.n) {
      let pick: string | null = null;
      let gain = 0;
      for (const k of candidates) {
        if (keep.has(k)) continue;
        const g = coverOf(c1, new Set([...keep, k])) - covered;
        if (g > gain) [pick, gain] = [k, g];
      }
      if (!pick) break;
      keep.add(pick);
      covered += gain;
    }
    return { chosen: [[...keep]], chosenCoverage: share(covered) };
  }
  const firstHops = [
    ...new Set(c2.flatMap((c) => c.keys.map((k) => k.split('>')[0]))),
  ];
  const reach = (h: string) =>
    c2.reduce(
      (s, c) => (c.keys.some((k) => k.startsWith(`${h}>`)) ? s + c.n : s),
      0
    );
  const top = firstHops.sort((a, b) => reach(b) - reach(a))[0];
  const seconds = [
    ...new Set(
      c2.flatMap((c) =>
        c.keys
          .filter((k) => k.startsWith(`${top}>`))
          .map((k) => k.split('>')[1])
      )
    ),
  ];
  return { chosen: [[top], seconds], chosenCoverage: share(reach(top)) };
};

/** Predicate usage per class (instances stating each predicate). */
export const profileClassUsage = async (
  classId: string,
  run: SparqlRunner
): Promise<ClassUsage> => {
  const cls = `<${ORKG_CLASS}${classId}>`;
  const [cnt, used] = await Promise.all([
    run(`SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x a ${cls} }`),
    run(
      `SELECT ?pred (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x a ${cls} ; ?pred ?o } GROUP BY ?pred`
    ),
  ]);
  const usage: Record<string, number> = {};
  for (const r of used) {
    const p = String(r.pred);
    if (STRUCTURAL.has(p)) continue;
    usage[shortPred(p)] = num(r.n);
  }
  return { classId, instances: num(cnt[0]?.n), used: usage };
};

type TemplateLike = {
  id: string;
  label?: string;
  target_class?: { id?: string } | null;
  properties?: Array<{ path?: { id?: string; label?: string } | null }>;
};

/** Profile a resolved template set (root + reachable sub-templates). */
export const profileTemplates = async (
  templates: TemplateLike[],
  rootClass: string,
  run: SparqlRunner,
  opts: { attachment?: boolean; maxClasses?: number } = {}
): Promise<InstanceProfile> => {
  const declared: DeclaredProperty[] = [];
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
    rootClass,
    ...[...labelOf.keys()].filter((c) => c !== rootClass),
  ].slice(0, opts.maxClasses ?? 12);
  // The root's route and usage are required (a failure propagates so callers can retry);
  // sub-template classes are best effort and mark the profile incomplete.
  const [attachment, classes] = await Promise.all([
    opts.attachment === false
      ? Promise.resolve(null)
      : profileAttachment(rootClass, run),
    Promise.all(
      classIds.map((c) =>
        profileClassUsage(c, run)
          .then((u): ClassUsage | null => ({
            ...u,
            templateLabel: labelOf.get(c),
          }))
          .catch((err): ClassUsage | null => {
            if (c === rootClass) throw err;
            return null;
          })
      )
    ),
  ]);
  const okClasses = classes.filter((c): c is ClassUsage => c !== null);

  // Labels for undeclared predicates that the prompt will mention.
  const declaredSet = new Set(
    declared.map((d) => `${d.classId}|${d.predicate}`)
  );
  const undeclared = new Set<string>();
  for (const c of okClasses)
    for (const [p, n] of Object.entries(c.used))
      if (
        !declaredSet.has(`${c.classId}|${p}`) &&
        !GENERIC.has(p) &&
        isSalient(n, c.instances)
      )
        undeclared.add(p);
  const predicateLabels: Record<string, string> = {};
  if (undeclared.size) {
    const values = [...undeclared].map((p) => `<${ORKG_PRED}${p}>`).join(' ');
    try {
      const rows = await run(
        `SELECT ?p ?l WHERE { VALUES ?p { ${values} } ?p <http://www.w3.org/2000/01/rdf-schema#label> ?l }`
      );
      for (const r of rows)
        predicateLabels[shortPred(String(r.p))] = String(r.l);
    } catch {
      /* labels are optional */
    }
  }
  const incomplete = okClasses.length < classIds.length;
  return {
    rootClass,
    attachment,
    classes: okClasses,
    declared,
    predicateLabels,
    ...(incomplete ? { incomplete } : {}),
  };
};

/** An undeclared predicate is worth mentioning when a meaningful share of instances use it. */
const isSalient = (n: number, total: number) => n >= 2 && n >= 0.1 * total;

const STOP = new Set([
  'has',
  'the',
  'and',
  'for',
  'with',
  'type',
  'data',
  'used',
  'value',
  'number',
]);
const normLabel = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tokens = (s?: string) =>
  new Set(
    normLabel(s)
      .split(' ')
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
/** Label match for a declared/used substitution: token Jaccard >= 0.5. */
const similar = (a?: string, b?: string) => {
  const ta = tokens(a),
    tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.5;
};

export type Reconciliation = {
  classId: string;
  templateLabel?: string;
  instances: number;
  declaredUsage: Array<{ predicate: string; label?: string; n: number }>;
  undeclaredUsed: Array<{
    predicate: string;
    label?: string;
    n: number;
    substitutes?: string;
  }>;
};

/** Declared-vs-used comparison per class. */
export const reconcile = (profile: InstanceProfile): Reconciliation[] =>
  profile.classes.map((c) => {
    const decl = profile.declared.filter((d) => d.classId === c.classId);
    const declaredUsage = decl.map((d) => ({
      predicate: d.predicate,
      label: d.label,
      n: c.used[d.predicate] ?? 0,
    }));
    const declaredIds = new Set(decl.map((d) => d.predicate));
    const unusedDeclared = declaredUsage.filter((d) => d.n === 0);
    const undeclaredUsed = Object.entries(c.used)
      .filter(
        ([p, n]) =>
          !declaredIds.has(p) && !GENERIC.has(p) && isSalient(n, c.instances)
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p, n]) => {
        const label = profile.predicateLabels[p];
        const sub = unusedDeclared.find((d) => similar(d.label, label));
        return { predicate: p, label, n, substitutes: sub?.predicate };
      });
    return {
      classId: c.classId,
      templateLabel: c.templateLabel,
      instances: c.instances,
      declaredUsage,
      undeclaredUsed,
    };
  });

const fmtHops = (path: PaperLinkPath) =>
  path.length === 0
    ? 'P31 (instance is the contribution)'
    : ['P31', ...path.map((h) => h.join('|'))].join(' → ');

/** Prompt section: observed data, so the model queries what instances state. */
export const renderProfileSection = (profile: InstanceProfile): string => {
  const lines: string[] = [
    '',
    '## Observed instance data (profiled from the graph)',
    'The template declares what instances MAY state. The counts below are what instances DO state. Prefer predicates that instances use; a declared predicate with 0 uses returns no rows.',
  ];
  const a = profile.attachment;
  if (a && a.chosen) {
    const chosen = a.chosen;
    const inChosen = (r: AttachmentRoute) =>
      r.depth === chosen.length &&
      r.hops.every((h, i) => h.every((p) => chosen[i]?.includes(p)));
    const others = a.routes
      .filter((r) => !inChosen(r))
      .slice(0, 3)
      .map((r) => `${fmtHops(r.hops)} (${r.instances})`);
    lines.push(
      `- Paper-to-instance route used in this prompt: ${fmtHops(a.chosen)}, reaching ${Math.round(100 * a.chosenCoverage)}% of the ${a.attached} instances attached to papers.${others.length ? ` Other routes: ${others.join('; ')}.` : ''}`
    );
  }
  for (const r of reconcile(profile)) {
    if (r.instances === 0) {
      lines.push(
        `- ${r.templateLabel ?? r.classId} (orkgc:${r.classId}): no instances.`
      );
      continue;
    }
    const used = r.declaredUsage
      .filter((d) => d.n > 0)
      .sort((x, y) => y.n - x.n)
      .map((d) => `${d.predicate} ${d.n}`)
      .join(', ');
    const unused = r.declaredUsage
      .filter((d) => d.n === 0)
      .map((d) => `${d.predicate}${d.label ? ` "${d.label}"` : ''}`);
    lines.push(
      `- ${r.templateLabel ?? r.classId} (orkgc:${r.classId}), ${r.instances} instances. Declared predicates stated by n instances: ${used || 'none'}.`
    );
    if (unused.length)
      lines.push(`  Declared but never stated: ${unused.join(', ')}.`);
    for (const u of r.undeclaredUsed)
      lines.push(
        `  Not declared but stated by ${u.n} instances: orkgp:${u.predicate}${u.label ? ` "${u.label}"` : ''}${u.substitutes ? ` — instances appear to use it instead of the declared ${u.substitutes}` : ''}.`
      );
  }
  return lines.join('\n');
};

/** Profile-based route as a PaperLinkPath for the existing prompt/validator. */
export const chosenLinkPath = (
  profile: InstanceProfile | null
): PaperLinkPath | null => profile?.attachment?.chosen ?? null;

export type EmptyDiagnosis =
  | { kind: 'data-gap'; message: string; predicates: string[] }
  | {
      kind: 'substitution';
      message: string;
      predicates: string[];
      substitutes: Record<string, string>;
    }
  | { kind: 'unknown'; message: string };

/**
 * Explain an empty result from the profile alone. A required predicate (outside
 * OPTIONAL) that is declared by a profiled class but stated by none of the
 * profiled instances makes the result empty for data reasons:
 *  - substitution: instances state a label-matching undeclared predicate instead,
 *    so the query should use that one;
 *  - data gap: nothing replaces it, so the empty result reflects missing curation.
 * Predicates of classes that were not profiled are never judged.
 */
export const diagnoseEmptyResult = (
  query: string,
  profile: InstanceProfile
): EmptyDiagnosis => {
  const withoutOptional = stripOptional(query.replace(/#[^\n]*/g, ''));
  const preds = new Set<string>();
  for (const m of withoutOptional.matchAll(/orkgp:([A-Za-z0-9_:]+)/g))
    preds.add(m[1]);
  for (const m of withoutOptional.matchAll(
    /<http:\/\/orkg\.org\/orkg\/predicate\/([^>]+)>/g
  ))
    preds.add(m[1]);
  for (const p of [...preds])
    if (STRUCTURAL.has(p) || GENERIC.has(p)) preds.delete(p);
  const profiled = new Set(profile.classes.map((c) => c.classId));
  const missing = [...preds].filter((p) => {
    const declaringProfiled = profile.declared.some(
      (d) => d.predicate === p && profiled.has(d.classId)
    );
    return declaringProfiled && profile.classes.every((c) => !(c.used[p] > 0));
  });
  if (!missing.length)
    return {
      kind: 'unknown',
      message:
        'Every predicate the query requires is stated by some profiled instance (or belongs to an unprofiled class); the empty result may come from the query or from a filter no instance satisfies.',
    };
  const substitutes: Record<string, string> = {};
  for (const r of reconcile(profile))
    for (const u of r.undeclaredUsed)
      if (u.substitutes && missing.includes(u.substitutes))
        substitutes[u.substitutes] = u.predicate;
  if (Object.keys(substitutes).length)
    return {
      kind: 'substitution',
      predicates: missing,
      substitutes,
      message: `No instance states ${Object.keys(substitutes)
        .map((p) => `orkgp:${p}`)
        .join(', ')}; instances use ${Object.entries(substitutes)
        .map(([d, u]) => `orkgp:${u} instead of orkgp:${d}`)
        .join(', ')}.`,
    };
  const total =
    profile.classes.find((c) => c.classId === profile.rootClass)?.instances ??
    0;
  return {
    kind: 'data-gap',
    predicates: missing,
    message: `The template declares ${missing.map((p) => `orkgp:${p}`).join(', ')}, but none of the ${total} instances (or their profiled sub-template instances) state it. The empty result reflects missing curation, not necessarily a wrong query.`,
  };
};

const stripOptional = (q: string): string => {
  let out = '';
  let i = 0;
  while (i < q.length) {
    const m = /OPTIONAL\s*\{/iy;
    m.lastIndex = i;
    if (m.test(q)) {
      let depth = 1;
      let j = m.lastIndex;
      while (j < q.length && depth > 0) {
        if (q[j] === '{') depth++;
        else if (q[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    out += q[i++];
  }
  return out;
};
