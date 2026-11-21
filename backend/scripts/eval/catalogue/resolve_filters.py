"""Turn the 'filter' placeholders of the sampled set into concrete questions.

For each placeholder, the value distribution of the filter property over the
template's attached instances is read from the live endpoint (one aggregate
query, sequential), and the most frequent value held by 15-70% of instances
is chosen. Placeholders without such a value are dropped.

  python3 catalogue/resolve_filters.py [data/sampled-cqs.json]
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from profile_catalogue import sparql, P  # noqa: E402
from build_sampled import pred, esc, value_pattern  # noqa: E402

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'data', 'sampled-cqs.json')
d = json.load(open(path))
items = []
for it in d['items']:
    if it['kind'] != 'filter' or it.get('question'):
        items.append(it); continue
    f = it['filter']
    q = (P + 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> '
         f"SELECT ?val (COUNT(DISTINCT ?x) AS ?n) WHERE {{ {f['block']} {value_pattern('?x', f['on'], 'val')} }} "
         'GROUP BY ?val ORDER BY DESC(?n) LIMIT 50')
    tot_q = P + f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ {f['block']} }}"
    try:
        rows, tot = sparql(q), int(sparql(tot_q)[0]['n'])
    except Exception as e:  # noqa: BLE001
        print('skip', it['id'], e); continue
    cand = [r for r in rows if 0.15 * tot <= int(r['n']) <= 0.7 * tot and 0 < len(r['val']) <= 80]
    if not cand:
        print('drop', it['id'], 'no value in 15-70% band'); continue
    v = cand[0]['val']
    it = dict(it)
    it['question'] = (f'For the papers described with the "{f["templateLabel"]}" template whose {f["onLabel"]} is '
                      f'"{v}", what {f["selectLabel"]} does each paper report?')
    it['goldQueries'] = [
        f"SELECT DISTINCT ?paper ?value WHERE {{\n  {f['block']}\n  {value_pattern('?x', f['on'], 'f')}\n"
        f"  FILTER(LCASE(STR(?f)) = \"{esc(v.lower())}\")\n  {value_pattern('?x', f['select'], 'value')}\n}}"]
    it['filterValue'] = v
    del it['filter']
    items.append(it)
    print('ok', it['id'], repr(v), cand[0]['n'], '/', tot, flush=True)
d['items'] = items
d['count'] = len(items)
d['kinds'] = {}
for it in items:
    d['kinds'][it['kind']] = d['kinds'].get(it['kind'], 0) + 1
json.dump(d, open(path, 'w'), indent=1)
print(d['count'], d['kinds'])
