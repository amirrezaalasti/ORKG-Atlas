"""Build the *sampled* question set: templates drawn at random from the catalogue,
questions and gold queries generated mechanically from the template and its
instance profile, so neither the question choice nor the gold depends on the
authors or on the system under test.

Sampling. Eligible templates have a usable schema, >=10 instances attached to
papers, are not in the curated/OOD sets, and do not share a reachable template
with an already sampled one (one template per schema family). They are drawn
with a fixed seed, stratified by research field (round robin over fields in
random order), up to --n templates.

Question kinds (each only if the profile supports it):
  attr     a root property stated by >=20% of instances           (one hop)
  nested   a property of a sub-template reached from the root       (two hops)
  filter   attr restricted to instances whose property A has value v (v held by 15-70%)
  count    number of distinct values of a root property per paper
  unused   a declared root property no instance states  -> gold is empty
  mismatch a declared property no instance states, whose label matches an undeclared
           predicate instances do use -> gold uses the used predicate
Gold queries reach instances from papers along every observed route (UNION over
routes), so gold does not depend on the route a system picks.

  python3 catalogue/build_sampled.py --n 40 --seed 2027 [--out data/sampled-cqs.json]
"""
import argparse, collections, gzip, json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXCLUDE = {'R186491', 'R1544125', 'R1411854', 'R593657', 'R593670', 'R702332', 'R1596350'}
# ORKG system predicates every contribution/resource may carry (research problem, field, DOI, ...).
STRUCTURAL = {'description', 'P32', 'P30', 'P31', 'P26', 'P29', 'SAME_AS', 'url', 'hasAuthors', 'hasContent', 'license', 'compareWith', 'http://www.w3.org/2000/01/rdf-schema#comment'}


def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"')


STOP = {'has', 'the', 'and', 'for', 'with', 'type', 'data', 'used', 'value', 'number'}


def tokens(s):
    return {t for t in re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).split() if len(t) > 2 and t not in STOP}


def similar(a, b):
    """Label match for a declared/used substitution: token Jaccard >= 0.5."""
    ta, tb = tokens(a), tokens(b)
    return bool(ta and tb) and len(ta & tb) / len(ta | tb) >= 0.5


def pred(p):
    return f'<http://orkg.org/orkg/predicate/{p}>'


def route_block(routes, cls):
    """UNION over observed paper->instance routes (top routes covering all attached instances)."""
    parts = []
    for r in routes:
        if r['depth'] == 0:
            parts.append('{ ?paper orkgp:P31 ?x . }')
        elif r['depth'] == 1:
            parts.append(f"{{ ?paper orkgp:P31 ?k . ?k {pred(r['route'][0])} ?x . }}")
        else:
            parts.append(f"{{ ?paper orkgp:P31 ?k . ?k {pred(r['route'][0])} ?m . ?m {pred(r['route'][1])} ?x . }}")
    return f"?x a orkgc:{cls} .\n  " + '\n  UNION '.join(parts)


def value_pattern(var_in, p, out):
    """Value of property p as a label (resources) or literal."""
    return (f'{var_in} {pred(p)} ?{out}_v . OPTIONAL {{ ?{out}_v rdfs:label ?{out}_l . }} '
            f'BIND(COALESCE(?{out}_l, STR(?{out}_v)) AS ?{out})')


def reach(tid, templates, by_class):
    seen, todo = {tid}, [tid]
    while todo:
        t = templates[todo.pop()]
        for q in t.get('properties', []):
            c = (q.get('class') or {}).get('id')
            for nt in by_class.get(c, []):
                if nt not in seen:
                    seen.add(nt); todo.append(nt)
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profile', default=os.path.join(HERE, '..', 'data', 'catalogue-profile-dump.json'))
    ap.add_argument('--snapshot', default=os.path.join(HERE, '..', 'data', 'orkg-templates-2026-08-28.json.gz'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'sampled-cqs.json'))
    ap.add_argument('--n', type=int, default=40)
    ap.add_argument('--seed', type=int, default=2027)
    ap.add_argument('--min-attached', type=int, default=10)
    ap.add_argument('--stress', action='store_true',
                    help='targeted set: misrouting, substitution and never-stated templates (disjoint from --exclude-set)')
    ap.add_argument('--per-kind', type=int, default=15)
    ap.add_argument('--exclude-set', default=os.path.join(HERE, '..', 'data', 'sampled-cqs.json'))
    a = ap.parse_args()
    rng = random.Random(a.seed)
    prof = json.load(open(a.profile))
    P, labels = prof['templates'], prof.get('predicate_labels', {})
    templates = {t['id']: t for t in json.load(gzip.open(a.snapshot))}
    by_class = collections.defaultdict(list)
    for t in templates.values():
        if t.get('target_class'):
            by_class[t['target_class']['id']].append(t['id'])

    def usable(t):
        return t.get('target_class') and any(q.get('path') for q in t.get('properties', []))

    if a.stress:
        return build_stress(a, rng, P, labels, templates, by_class, usable)
    excluded_reach = set()
    for e in EXCLUDE:
        if e in templates:
            excluded_reach |= reach(e, templates, by_class)
    eligible = [tid for tid, p in P.items()
                if p['n_attached'] >= a.min_attached and usable(templates[tid]) and tid not in excluded_reach]
    by_field = collections.defaultdict(list)
    for tid in eligible:
        f = ((templates[tid].get('relations') or {}).get('research_fields') or [{'label': 'none'}])[0]['label']
        by_field[f].append(tid)
    fields = sorted(by_field)
    rng.shuffle(fields)
    for f in fields:
        rng.shuffle(by_field[f])

    chosen, used_reach, items = [], set(), []
    # Round robin over fields; a template is skipped if its schema family overlaps a chosen one.
    while len(chosen) < a.n and any(by_field[f] for f in fields):
        for f in fields:
            if len(chosen) >= a.n or not by_field[f]:
                continue
            tid = by_field[f].pop()
            r = reach(tid, templates, by_class)
            if r & used_reach:
                continue
            qs = make_questions(tid, templates, P, labels, by_class, rng)
            if not qs:
                continue
            chosen.append(tid); used_reach |= r
            items.extend(qs)

    meta = {
        'source': f"build_sampled.py --n {a.n} --seed {a.seed} over {prof.get('dump')}",
        'eligible_templates': len(eligible), 'fields_with_eligible': len(fields),
        'templates': chosen, 'count': len(items),
        'kinds': dict(collections.Counter(i['kind'] for i in items)),
    }
    json.dump({**meta, 'items': items}, open(a.out, 'w'), indent=1)
    print(json.dumps(meta, indent=1))


def make_questions(tid, templates, P, labels, by_class, rng):
    t, p = templates[tid], P[tid]
    cls, n = t['target_class']['id'], p['n_instances']
    tlabel = t['label'].strip()
    field = ((t.get('relations') or {}).get('research_fields') or [{'label': ''}])[0]['label']
    used = p['used']
    routes = [r for r in p['routes'] if r['n'] > 0][:12]
    if not routes:
        return []
    block = route_block(routes, cls)
    props = [q for q in t.get('properties', []) if q.get('path')]
    stated = [q for q in props if used.get(q['path']['id'], 0) >= max(3, 0.2 * n) and q['path']['id'] not in STRUCTURAL]
    rng.shuffle(stated)
    qs = []

    def item(kind, question, gold, extra=None):
        qs.append({'id': f'{tid}/{kind}', 'dataset': 'sampled', 'kind': kind, 'templateId': tid,
                   'templateTitle': tlabel, 'field': field, 'question': question,
                   'goldQueries': [gold], **(extra or {})})

    def plabel(q):
        return (q['path'].get('label') or q['path']['id']).strip()

    if stated:
        q = stated[0]
        item('attr', f'For the papers described with the "{tlabel}" template, what {plabel(q)} does each paper report?',
             f"SELECT DISTINCT ?paper ?value WHERE {{\n  {block}\n  {value_pattern('?x', q['path']['id'], 'value')}\n}}")
        item('count', f'For the papers described with the "{tlabel}" template, how many different values of {plabel(q)} does each paper report?',
             f"SELECT ?paper (COUNT(DISTINCT ?v) AS ?n) WHERE {{\n  {block}\n  ?x {pred(q['path']['id'])} ?v .\n}} GROUP BY ?paper")
    # nested: root property whose class is a sub-template's target class
    for q in props:
        c = (q.get('class') or {}).get('id')
        subs = [s for s in by_class.get(c, []) if s != tid]
        if not subs or used.get(q['path']['id'], 0) < 3:
            continue
        sub = templates[sorted(subs)[0]]
        sp = P.get(sub['id'], {}).get('used', {})
        cand = [s for s in sub.get('properties', []) if s.get('path') and sp.get(s['path']['id'], 0) >= 3
                and s['path']['id'] not in STRUCTURAL]
        if not cand:
            continue
        s = rng.choice(cand)
        item('nested', f'For the papers described with the "{tlabel}" template, what {plabel(s)} is given for their {plabel(q)}?',
             f"SELECT DISTINCT ?paper ?value WHERE {{\n  {block}\n  ?x {pred(q['path']['id'])} ?y .\n  {value_pattern('?y', s['path']['id'], 'value')}\n}}")
        break
    # filter: needs a frozen value distribution; resolved by freeze step (value chosen there)
    if len(stated) >= 2:
        a_, b_ = stated[0], stated[1]
        item('filter', None, None, {'filter': {'on': a_['path']['id'], 'onLabel': plabel(a_), 'select': b_['path']['id'],
                                                'selectLabel': plabel(b_), 'templateLabel': tlabel, 'block': block}})
    declared = {q['path']['id']: q for q in props}
    unused = [q for q in props if used.get(q['path']['id'], 0) == 0 and q['path']['id'] not in STRUCTURAL]
    salient = [k for k, v in used.items() if k not in declared and v >= 2 and v >= 0.1 * n and k not in STRUCTURAL]
    mism = [(q, k) for q in unused for k in salient if similar(plabel(q), labels.get(k))]
    if mism:
        q, k = mism[0]
        item('mismatch', f'For the papers described with the "{tlabel}" template, what {plabel(q)} does each paper report?',
             f"SELECT DISTINCT ?paper ?value WHERE {{\n  {block}\n  {value_pattern('?x', k, 'value')}\n}}",
             {'declared': q['path']['id'], 'used': k})
    elif unused:
        q = rng.choice(unused)
        item('unused', f'For the papers described with the "{tlabel}" template, what {plabel(q)} does each paper report?',
             f"SELECT DISTINCT ?paper ?value WHERE {{\n  {block}\n  {value_pattern('?x', q['path']['id'], 'value')}\n}}",
             {'declared': q['path']['id']})
    return qs


def build_stress(a, rng, P, labels, templates, by_class, usable):
    sys.path.insert(0, HERE)
    from analyse_profile import existence_choice, coverage
    skip = set(EXCLUDE)
    if os.path.exists(a.exclude_set):
        skip |= set(json.load(open(a.exclude_set)).get('templates', []))
    pools = {'route': [], 'mismatch': [], 'unused': []}
    for tid, p in sorted(P.items()):
        t = templates[tid]
        if tid in skip or not usable(t) or p['n_attached'] < 5:
            continue
        routes = p['routes']
        if p['n_attached'] >= 10 and coverage(routes, existence_choice(routes), p['n_attached']) < 0.5:
            pools['route'].append(tid)
        declared = {q['path']['id']: q for q in t.get('properties', []) if q.get('path')}
        unused = [d for d in declared if p['used'].get(d, 0) == 0 and d not in STRUCTURAL]
        salient = [k for k, v in p['used'].items() if k not in declared and k not in STRUCTURAL and v >= 2 and v >= 0.1 * p['n_instances']]
        if any(similar(declared[d]['path'].get('label'), labels.get(k)) for d in unused for k in salient):
            pools['mismatch'].append(tid)
        elif unused and p['n_attached'] >= 10:
            pools['unused'].append(tid)
    items, chosen = [], {}
    for kind, pool in pools.items():
        rng.shuffle(pool)
        chosen[kind] = []
        for tid in pool:
            if len(chosen[kind]) >= a.per_kind:
                break
            qs = make_questions(tid, templates, P, labels, by_class, rng)
            want = 'attr' if kind == 'route' else kind
            qs = [dict(q, id=f"{tid}/stress-{kind}", dataset='stress', stress=kind) for q in qs if q['kind'] == want]
            if not qs:
                continue
            chosen[kind].append(tid)
            items.extend(qs)
    meta = {'source': f"build_sampled.py --stress --per-kind {a.per_kind} --seed {a.seed}",
            'pool_sizes': {k: len(v) for k, v in pools.items()}, 'templates': chosen, 'count': len(items)}
    out = a.out if not a.out.endswith('sampled-cqs.json') else a.out.replace('sampled-cqs.json', 'stress-cqs.json')
    json.dump({**meta, 'items': items}, open(out, 'w'), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == '__main__':
    sys.exit(main())
