"""Catalogue-wide instance profile from an ORKG N-Triples dump (RQ1b).

For every template in the frozen catalogue snapshot this computes, offline and
without load on the public SPARQL endpoint:
  * n_instances: resources typed with the template's target class;
  * attachment: instances reachable from a paper's contribution (object of
    orkgp:P31) at depth 0 (the contribution itself), 1 or 2 hops, per route
    (predicate sequence), with distinct instance counts;
  * used: for every predicate, the number of instances stating it.

Three streaming passes over the dump; only IRIs/predicates of interest are kept.

  python3 catalogue/profile_dump.py <dump.nt> [--out data/catalogue-profile-dump.json]
"""
import argparse, collections, gzip, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ORKG_C = 'http://orkg.org/orkg/class/'
ORKG_P = 'http://orkg.org/orkg/predicate/'
RDF_TYPE = '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>'
P31 = f'<{ORKG_P}P31>'
SKIP_P = {RDF_TYPE, '<http://www.w3.org/2000/01/rdf-schema#label>'}


def triples(path):
    op = gzip.open if path.endswith('.gz') else open
    with op(path, 'rt', encoding='utf-8', errors='replace') as f:
        for line in f:
            if not line or line[0] != '<':
                continue
            i = line.find(' ')
            j = line.find(' ', i + 1)
            if i < 0 or j < 0:
                continue
            s, p, o = line[:i], line[i + 1:j], line[j + 1:].rstrip()
            if o.endswith(' .'):
                o = o[:-2]
            yield s, p, o


def short_p(p):
    p = p.strip('<>')
    return p[len(ORKG_P):] if p.startswith(ORKG_P) else p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dump')
    ap.add_argument('--snapshot', default=os.path.join(HERE, '..', 'data', 'orkg-templates-2026-08-28.json.gz'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'catalogue-profile-dump.json'))
    a = ap.parse_args()
    templates = json.load(gzip.open(a.snapshot))
    target = {f'<{ORKG_C}{t["target_class"]["id"]}>' for t in templates if t.get('target_class')}

    t0 = time.time()
    # Pass 1: instances of target classes, and contributions (objects of P31).
    inst_classes = collections.defaultdict(set)
    contributions = set()
    pred_labels = {}
    LABEL = '<http://www.w3.org/2000/01/rdf-schema#label>'
    for s, p, o in triples(a.dump):
        if p == RDF_TYPE and o in target:
            inst_classes[s].add(o)
        elif p == P31 and o.startswith('<'):
            contributions.add(o)
        elif p == LABEL and s.startswith(f'<{ORKG_P}'):
            lab = o[1:o.rfind('"')] if o.startswith('"') else o
            pred_labels[short_p(s)] = lab
    print(f'pass1 {time.time()-t0:.0f}s: {len(inst_classes)} instances, {len(contributions)} contributions', flush=True)

    # Pass 2: predicate usage of instances; in-edges of instances (one hop).
    used = collections.defaultdict(collections.Counter)      # class -> pred -> #instances
    seen_use = set()
    in_edges = collections.defaultdict(list)                 # instance -> [(subject, pred)]
    for s, p, o in triples(a.dump):
        if s in inst_classes and p not in SKIP_P:
            key = (s, p)
            if key not in seen_use:
                seen_use.add(key)
                for c in inst_classes[s]:
                    used[c][short_p(p)] += 1
        if o in inst_classes and p != RDF_TYPE:
            in_edges[o].append((s, p))
    del seen_use
    middles = {s for edges in in_edges.values() for s, _ in edges if s not in contributions}
    print(f'pass2 {time.time()-t0:.0f}s: {len(in_edges)} instances with in-edges, {len(middles)} middle nodes', flush=True)

    # Pass 3: edges contribution -> middle node (for two-hop routes).
    mid_in = collections.defaultdict(list)                   # middle -> [pred from a contribution]
    for s, p, o in triples(a.dump):
        if o in middles and s in contributions:
            mid_in[o].append(p)
    print(f'pass3 {time.time()-t0:.0f}s', flush=True)

    # Routes per class.
    n_inst = collections.Counter()
    routes = collections.defaultdict(lambda: collections.defaultdict(set))  # class -> route -> {instances}
    attached = collections.defaultdict(set)
    combos = collections.defaultdict(collections.Counter)  # class -> (depth, keys) -> distinct instances
    for x, classes in inst_classes.items():
        rs = set()
        if x in contributions:
            rs.add(('',))
        for s, p in in_edges.get(x, ()):
            if s in contributions:
                rs.add((short_p(p),))
            for h in mid_in.get(s, ()):
                rs.add((short_p(h), short_p(p)))
        for c in classes:
            n_inst[c] += 1
            for r in rs:
                routes[c][r].add(x)
            if rs:
                attached[c].add(x)
            for d in (1, 2):
                keys = tuple(sorted('>'.join(r) for r in rs if r != ('',) and len(r) == d))
                if keys:
                    combos[c][(d, keys)] += 1

    out = {}
    for t in templates:
        if not t.get('target_class'):
            continue
        c = f'<{ORKG_C}{t["target_class"]["id"]}>'
        rr = [{'depth': 0 if r == ('',) else len(r), 'route': [] if r == ('',) else list(r), 'n': len(xs)}
              for r, xs in routes[c].items()]
        rr.sort(key=lambda r: -r['n'])
        out[t['id']] = {
            'target_class': t['target_class']['id'],
            'n_instances': n_inst[c],
            'n_attached': len(attached[c]),
            'routes': rr[:40],
            # Per-instance route signatures: overlap-free coverage of any predicate set.
            'combos': [{'depth': d, 'keys': list(k), 'n': n} for (d, k), n in combos[c].most_common()],
            'used': dict(used[c]),
        }
    json.dump({'dump': os.path.basename(a.dump), 'templates': out, 'predicate_labels': pred_labels}, open(a.out, 'w'))
    print(f'done {time.time()-t0:.0f}s -> {a.out}')


if __name__ == '__main__':
    sys.exit(main())
