"""Instance profile of every ORKG template (schema-data reconciliation, RQ1b).

For each template in the frozen catalogue snapshot, queries the live ORKG SPARQL
endpoint for
  * n_instances: distinct resources typed with the target class;
  * attachment: distinct instances reachable from a paper (?p orkgp:P31 ?c) at
    depth 0 (the contribution itself) or 1 hop, with per-predicate instance counts
    (two-hop routes are left to the run-time profiler: the query is too expensive
    to run over the whole catalogue on the public endpoint);
  * used: for every predicate used by instances, the number of instances using it.
Declared-vs-used reconciliation is computed offline by analyse_profile.py.

Resumable: appends one JSON line per template to the output file.

  python3 catalogue/profile_catalogue.py [--out data/catalogue-profile.jsonl] [--workers 4]
"""
import argparse, gzip, json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ENDPOINT = 'https://orkg.org/triplestore/sparql'
P = ('PREFIX orkgp: <http://orkg.org/orkg/predicate/> '
     'PREFIX orkgc: <http://orkg.org/orkg/class/> ')
ORKG = 'http://orkg.org/orkg/predicate/'


def sparql(q, tries=4):
    data = urllib.parse.urlencode({'query': q}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(ENDPOINT, data=data, headers={
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'orkg-template-profile/1.0'})
            j = json.load(urllib.request.urlopen(req, timeout=120))
            return [{k: v['value'] for k, v in b.items()} for b in j['results']['bindings']]
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(3 * 2 ** i)
    raise RuntimeError(f'{err}')


def short(uri):
    return uri.replace(ORKG, '') if uri.startswith(ORKG) else uri


def profile(t):
    cls = t['target_class']['id']
    c = f'<http://orkg.org/orkg/class/{cls}>'
    out = {'id': t['id'], 'target_class': cls}
    n = int(sparql(P + f'SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a {c} }}')[0]['n'])
    out['n_instances'] = n
    if n == 0:
        return out
    direct = sparql(P + f'SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?p orkgp:P31 ?x . ?x a {c} }}')
    one = sparql(P + f'SELECT ?h (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a {c} . ?k ?h ?x . ?p orkgp:P31 ?k }} GROUP BY ?h')
    out['attachment'] = ([{'depth': 0, 'first_hop': '', 'n': int(direct[0]['n'])}] if int(direct[0]['n']) else []) + \
        sorted([{'depth': 1, 'first_hop': short(r['h']), 'n': int(r['n'])} for r in one], key=lambda r: -r['n'])
    tot = sparql(P + f'''SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a {c} .
      {{ ?p orkgp:P31 ?x }} UNION {{ ?k ?h ?x . ?p orkgp:P31 ?k }} }}''')
    out['n_attached'] = int(tot[0]['n'])  # within one hop of a contribution
    used = sparql(P + f'SELECT ?pred (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a {c} ; ?pred ?o }} GROUP BY ?pred')
    out['used'] = {short(r['pred']): int(r['n']) for r in used}
    time.sleep(0.5)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snapshot', default=os.path.join(HERE, '..', 'data', 'orkg-templates-2026-08-28.json.gz'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'catalogue-profile.jsonl'))
    ap.add_argument('--workers', type=int, default=2)
    a = ap.parse_args()
    templates = json.load(gzip.open(a.snapshot))
    done = set()
    if os.path.exists(a.out):
        for line in open(a.out):
            if line.strip():
                r = json.loads(line)
                if 'error' not in r:
                    done.add(r['id'])
    todo = [t for t in templates if t['id'] not in done and t.get('target_class')]
    print(f'{len(todo)} to profile, {len(done)} done', flush=True)

    def job(t):
        try:
            r = profile(t)
        except Exception as e:  # noqa: BLE001
            r = {'id': t['id'], 'error': str(e)[:300]}
        return r

    with ThreadPoolExecutor(a.workers) as ex, open(a.out, 'a') as f:
        for i, r in enumerate(ex.map(job, todo)):
            f.write(json.dumps(r) + '\n'); f.flush()
            if i % 50 == 0:
                print(i, r['id'], r.get('n_instances'), r.get('error', ''), flush=True)
    print('done')


if __name__ == '__main__':
    sys.exit(main())
