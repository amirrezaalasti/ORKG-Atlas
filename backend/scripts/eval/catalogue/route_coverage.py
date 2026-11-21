"""Distinct-instance coverage of the runtime-selected paper-to-instance route (frozen
profiles) against the union of every route observed in the dump, for the stress-route
templates and the OOD Ecological Study System example. Small COUNT queries, sequential.

    python3 catalogue/route_coverage.py --out runs/route-coverage.json   (from scripts/eval)
"""
import argparse, json, time, urllib.parse, urllib.request
ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
EP = 'https://orkg.org/triplestore/sparql'
P = 'http://orkg.org/orkg/predicate/'
prof = json.load(open('data/profiles-frozen.json'))
dump = json.load(open('data/catalogue-profile-dump.json'))['templates']
ids = [i['templateId'] for i in json.load(open('data/stress-cqs.json'))['items'] if i.get('stress') == 'route'] + ['R593670']

def count(where):
    q = 'SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ' + where + ' }'
    for t in range(3):
        try:
            req = urllib.request.Request(EP + '?' + urllib.parse.urlencode({'query': q}), headers={'Accept': 'application/sparql-results+json'})
            r = json.load(urllib.request.urlopen(req, timeout=180))
            return int(r['results']['bindings'][0]['n']['value'])
        except Exception as e:
            err = str(e); time.sleep(10 * (t + 1))
    return None

def chosen_pattern(chosen):
    if chosen == []: return '?p <%sP31> ?x .' % P
    lines = ['?p <%sP31> ?n0 .' % P]
    for i, preds in enumerate(chosen):
        nxt = '?x' if i == len(chosen) - 1 else f'?n{i+1}'
        vals = ' '.join(f'<{P}{x}>' for x in preds)
        lines.append(f'VALUES ?h{i} {{ {vals} }} ?n{i} ?h{i} {nxt} .')
    return ' '.join(lines)

def union_pattern(routes):
    parts = []
    for r in routes:
        if r['depth'] == 0: parts.append(f'{{ ?p <{P}P31> ?x . }}')
        elif r['depth'] == 1: parts.append(f'{{ ?p <{P}P31> ?k . ?k <{P}{r["route"][0]}> ?x . }}')
        else: parts.append(f'{{ ?p <{P}P31> ?k . ?k <{P}{r["route"][0]}> ?m . ?m <{P}{r["route"][1]}> ?x . }}')
    return ' UNION '.join(parts)

out = []
for tid in ids:
    pa, d = prof[tid]['attachment'], dump[tid]
    cls = f'?x a <http://orkg.org/orkg/class/{d["target_class"]}> . '
    routes = [r for r in d['routes'] if r['n'] > 0][:12]
    row = {'template': tid, 'attached_dump': d['n_attached'], 'chosen': pa['chosen'], 'estimated_coverage': pa['chosenCoverage'],
           'runtime_attached': pa['attached'],
           'chosen_distinct': count(cls + chosen_pattern(pa['chosen'])),
           'all_routes_distinct': count(cls + union_pattern(routes)), 'n_routes': len(routes)}
    out.append(row); print(row, flush=True); time.sleep(2)
json.dump(out, open(a.out, 'w'), indent=1)
