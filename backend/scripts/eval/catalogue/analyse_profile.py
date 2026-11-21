"""Schema-data divergence statistics over the whole template catalogue (RQ1b).

Reads the dump profile (profile_dump.py) and the frozen template snapshot and
reports, for templates with instances attached to papers:
  * attachment heterogeneity: instances reached along >1 depth / >1 route;
  * route choice: share of attached instances reached by the existence probe
    (direct path if any instance is a contribution, else all one-hop predicates,
    else the most frequent two-hop first hop) vs the frequency-based choice;
  * declared-but-unused properties (root template) and
  * used-but-undeclared predicates stated by >=10% (and >=2) of instances,
    with label-similar substitutes of an unused declared property.

  python3 catalogue/analyse_profile.py [--profile data/catalogue-profile-dump.json] [--json runs/catalogue-divergence.json]
"""
import argparse, gzip, json, os, re, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# ORKG system predicates every contribution/resource may carry (research problem, field, DOI, ...).
STRUCTURAL = {'description', 'P32', 'P30', 'P31', 'P26', 'P29', 'SAME_AS', 'url', 'hasAuthors', 'hasContent', 'license', 'compareWith', 'http://www.w3.org/2000/01/rdf-schema#comment'}


STOP = {'has', 'the', 'and', 'for', 'with', 'type', 'data', 'used', 'value', 'number'}


def tokens(s):
    return {t for t in re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).split() if len(t) > 2 and t not in STOP}


def similar(a, b):
    """Label match for a declared/used substitution: token Jaccard >= 0.5."""
    ta, tb = tokens(a), tokens(b)
    return bool(ta and tb) and len(ta & tb) / len(ta | tb) >= 0.5


def existence_choice(routes):
    """Routes (as tuples) the old existence-based probe would use."""
    if any(r['depth'] == 0 for r in routes):
        return {()}
    one = [tuple(r['route']) for r in routes if r['depth'] == 1]
    if one:
        return set(one)
    two = sorted([r for r in routes if r['depth'] == 2], key=lambda r: -r['n'])
    if two:
        top = two[0]['route'][0]
        return {tuple(r['route']) for r in two if r['route'][0] == top}
    return set()


def frequency_choice(routes, share=0.9):
    by_depth = {}
    for r in routes:
        by_depth.setdefault(r['depth'], []).append(r)
    if not by_depth:
        return set()
    depth = max(by_depth, key=lambda d: sum(r['n'] for r in by_depth[d]))
    rs = sorted(by_depth[depth], key=lambda r: -r['n'])
    if depth == 0:
        return {()}
    total = sum(r['n'] for r in rs)
    keep, cov = set(), 0
    if depth == 1:
        for r in rs:
            if cov >= share * total:
                break
            keep.add(tuple(r['route'])); cov += r['n']
        return keep
    top = rs[0]['route'][0]
    return {tuple(r['route']) for r in rs if r['route'][0] == top}


def coverage(routes, chosen, attached):
    """Upper bound on attached instances reached (sum of route counts, capped)."""
    if not attached:
        return 0.0
    n = sum(r['n'] for r in routes if tuple(r['route']) in chosen)
    return min(1.0, n / attached)


def runtime_routes(p):
    """The deployed profiler's rule: two-hop routes only when no instance is a
    contribution and fewer than five distinct instances sit one hop below."""
    routes, combos = p['routes'], p.get('combos')
    n0 = sum(r['n'] for r in routes if r['depth'] == 0)
    n1 = (sum(c['n'] for c in combos if c['depth'] == 1) if combos is not None
          else sum(r['n'] for r in routes if r['depth'] == 1))
    two = n0 + n1 == 0 or (n0 == 0 and n1 < 5)
    keep = lambda d: d < 2 or two
    return [r for r in routes if keep(r['depth'])], (None if combos is None else [c for c in combos if keep(c['depth'])])


def exact_frequency_choice(routes, combos, share=0.9):
    """shared/instanceProfile.ts chooseRoute over distinct instances (route signatures)."""
    n0 = max([r['n'] for r in routes if r['depth'] == 0] or [0])
    by = {d: [c for c in combos if c['depth'] == d] for d in (1, 2)}
    tot = {0: n0, 1: sum(c['n'] for c in by[1]), 2: sum(c['n'] for c in by[2])}
    depth = max((d for d in tot if tot[d] > 0), key=lambda d: (tot[d], -d), default=None)
    if depth is None:
        return set()
    if depth == 0:
        return {()}
    cs = by[depth]
    cover = lambda ks: sum(c['n'] for c in cs if ks & set(c['keys']))
    if depth == 1:
        keep, cov = set(), 0
        cands = {k for c in cs for k in c['keys']}
        while cov < share * tot[1]:
            best, gain = None, 0
            for k in sorted(cands - keep):
                g = cover(keep | {k}) - cov
                if g > gain:
                    best, gain = k, g
            if best is None:
                break
            keep.add(best); cov += gain
        return {(k,) for k in keep}
    heads = {k.split('>')[0] for c in cs for k in c['keys']}
    reach = lambda h: sum(c['n'] for c in cs if any(k.startswith(h + '>') for k in c['keys']))
    top = max(sorted(heads), key=reach)
    return {tuple(k.split('>')) for c in cs for k in c['keys'] if k.startswith(top + '>')}


def exact_coverage(routes, combos, chosen, attached):
    """Distinct attached instances reached by the chosen routes."""
    if not attached:
        return 0.0
    n = max([r['n'] for r in routes if r['depth'] == 0] or [0]) if () in chosen else 0
    keys = {'>'.join(c) for c in chosen if c}
    n += sum(c['n'] for c in combos if keys & set(c['keys']))
    return min(1.0, n / attached)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profile', default=os.path.join(HERE, '..', 'data', 'catalogue-profile-dump.json'))
    ap.add_argument('--snapshot', default=os.path.join(HERE, '..', 'data', 'orkg-templates-2026-08-28.json.gz'))
    ap.add_argument('--json')
    a = ap.parse_args()
    prof = json.load(open(a.profile))
    P, labels = prof['templates'], prof.get('predicate_labels', {})
    templates = {t['id']: t for t in json.load(gzip.open(a.snapshot))}

    def exact_rows(p, routes, ex, att):
        combos = p['combos']
        rt_routes, rt_combos = runtime_routes(p)
        return {
            'xcov_existence': exact_coverage(routes, combos, ex, att),
            'xcov_frequency': exact_coverage(routes, combos, exact_frequency_choice(routes, combos), att),
            'xcov_frequency_runtime': exact_coverage(rt_routes, rt_combos, exact_frequency_choice(rt_routes, rt_combos), att),
        }

    rows = []
    for tid, p in P.items():
        t = templates[tid]
        declared = {q['path']['id']: q['path'].get('label') for q in t.get('properties', []) if q.get('path') and q['path']['id'] not in STRUCTURAL}
        used = {k: v for k, v in p['used'].items() if k not in STRUCTURAL}
        n, att = p['n_instances'], p['n_attached']
        routes = p['routes']
        depths = {r['depth'] for r in routes}
        ex, fr = existence_choice(routes), frequency_choice(routes)
        unused = [d for d in declared if used.get(d, 0) == 0]
        salient = [k for k, v in used.items() if k not in declared and v >= 2 and v >= 0.1 * n]
        subs = [(d, k) for d in unused for k in salient if similar(declared[d], labels.get(k))]
        rows.append({
            'id': tid, 'n': n, 'attached': att, 'declared': len(declared),
            'depths': sorted(depths), 'n_routes': len(routes),
            'cov_existence': coverage(routes, ex, att), 'cov_frequency': coverage(routes, fr, att),
            **({} if p.get('combos') is None else exact_rows(p, routes, ex, att)),
            'unused_declared': len(unused), 'share_unused': len(unused) / len(declared) if declared else None,
            'undeclared_salient': len(salient), 'substitutions': subs,
        })

    with_inst = [r for r in rows if r['n'] > 0]
    att = [r for r in rows if r['attached'] >= 1]
    att10 = [r for r in rows if r['attached'] >= 10]
    pct = lambda k, xs: f'{k} ({100 * k / len(xs):.1f}%)' if xs else '0'
    out = {
        'templates': len(rows), 'with_instances': len(with_inst), 'with_attached': len(att), 'with_attached_ge10': len(att10),
    }
    print(f"templates {len(rows)}; with instances {len(with_inst)}; attached to papers {len(att)}; >=10 attached {len(att10)}")
    for name, xs in [('attached>=1', att), ('attached>=10', att10)]:
        multi_depth = sum(1 for r in xs if len(r['depths']) > 1)
        multi_route = sum(1 for r in xs if r['n_routes'] > 1)
        indirect = sum(1 for r in xs if 0 not in r['depths'])
        ex_bad = sum(1 for r in xs if r['cov_existence'] < 0.5)
        fr_bad = sum(1 for r in xs if r['cov_frequency'] < 0.5)
        ex_cov = statistics.mean(r['cov_existence'] for r in xs) if xs else 0
        fr_cov = statistics.mean(r['cov_frequency'] for r in xs) if xs else 0
        with_unused = sum(1 for r in xs if r['unused_declared'] > 0)
        share_unused = [r['share_unused'] for r in xs if r['share_unused'] is not None]
        undecl = sum(1 for r in xs if r['undeclared_salient'] > 0)
        subs = sum(1 for r in xs if r['substitutions'])
        print(f"\n[{name}] n={len(xs)}")
        xs_out = {}
        print(f"  not attached directly (instance below contribution): {pct(indirect, xs)}")
        print(f"  instances at >1 depth: {pct(multi_depth, xs)};  >1 route: {pct(multi_route, xs)}")
        print(f"  existence probe reaches <50% of attached: {pct(ex_bad, xs)}; mean coverage {ex_cov:.3f}")
        print(f"  frequency choice reaches <50% of attached: {pct(fr_bad, xs)}; mean coverage {fr_cov:.3f}")
        print(f"  >=1 declared property never stated: {pct(with_unused, xs)}; median share unused {statistics.median(share_unused) if share_unused else 0:.2f}")
        print(f"  >=1 salient undeclared predicate: {pct(undecl, xs)};  label-similar substitution: {pct(subs, xs)}")
        for k in ('xcov_existence', 'xcov_frequency', 'xcov_frequency_runtime'):
            if xs and k in xs[0]:
                bad = sum(1 for r in xs if r[k] < 0.5)
                print(f"  [distinct] {k} reaches <50% of attached: {pct(bad, xs)}; mean {statistics.mean(r[k] for r in xs):.3f}")
                xs_out[k + '_lt50'] = bad
                xs_out[k + '_mean'] = statistics.mean(r[k] for r in xs)
        out[name] = xs_out | dict(n=len(xs), indirect=indirect, multi_depth=multi_depth, multi_route=multi_route,
                         existence_lt50=ex_bad, frequency_lt50=fr_bad, existence_mean_cov=ex_cov, frequency_mean_cov=fr_cov,
                         with_unused_declared=with_unused, median_share_unused=statistics.median(share_unused) if share_unused else 0,
                         with_undeclared_salient=undecl, with_substitution=subs)
    out['rows'] = rows
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    sys.exit(main())
