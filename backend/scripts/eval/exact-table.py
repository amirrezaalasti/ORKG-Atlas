"""Main results: strict exact rate (primary) and strict F1 for every principal
configuration and question set, with paired two-level bootstrap intervals
(questions, then runs within a question) for the differences.

    python3 scripts/eval/exact-table.py        (from backend/; after build-results-data.py)
Writes runs/summary/page/exact-table.csv and runs/summary/exact-table.json.
"""
import collections, csv, glob, json, os, random, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(HERE, 'runs', 'summary', 'page', 'clean')
SETS = ['sampled', 'stress', 'curated', 'ood']

def per_item(s):
    base = os.path.join(CLEAN, f'x-{s}')
    files = sorted(glob.glob(os.path.join(CLEAN, f'{s}-*.jsonl')))
    subprocess.run(['npx', 'tsx', os.path.join(HERE, 'analyze.ts'), *files, '--gold', os.path.join(HERE, 'data', f'gold-results-{s}.json'),
                    '--strict', '--summary', base + '-s.json', '--dump', base + '-d.json'], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=os.path.dirname(os.path.dirname(HERE)))
    d = collections.defaultdict(lambda: collections.defaultdict(list))
    for l in open(base + '-d.json'):
        r = json.loads(l)
        d[(r['model'], r['config'])][r['item']].append(r['f1'])
    return d

def boot(a, b, stat, B=2000, seed=11):
    items = sorted(set(a) & set(b))
    rng = random.Random(seed)
    point = sum(stat(a[i]) - stat(b[i]) for i in items) / len(items)
    out = []
    for _ in range(B):
        tot = 0.0
        for _ in items:
            i = items[rng.randrange(len(items))]
            ra = [a[i][rng.randrange(len(a[i]))] for _ in a[i]]
            rb = [b[i][rng.randrange(len(b[i]))] for _ in b[i]]
            tot += stat(ra) - stat(rb)
        out.append(tot / len(items))
    out.sort()
    return point, out[int(.025 * B)], out[int(.975 * B)]

f1 = lambda v: sum(v) / len(v)
ex = lambda v: sum(x >= 0.999 for x in v) / len(v)
rows, js = [], {}
for s in SETS:
    d = per_item(s)
    ref = {'full': d[('deepseek-v4-flash', 'full')], 'profiled': d[('deepseek-v4-flash', 'profiled')]}
    for (m, c), items in sorted(d.items()):
        r = {'set': s, 'model': m, 'config': c, 'questions': len(items),
             'exact': round(sum(ex(v) for v in items.values()) / len(items), 3),
             'f1': round(sum(f1(v) for v in items.values()) / len(items), 3)}
        for refname, refd in ref.items():
            if (m, c) == ('deepseek-v4-flash', refname) or not set(items) & set(refd):
                continue
            pe, le, he = boot(items, refd, ex)
            pf, lf, hf = boot(items, refd, f1)
            r[f'd_exact_{refname}'] = [round(pe, 3), round(le, 3), round(he, 3)]
            r[f'd_f1_{refname}'] = [round(pf, 3), round(lf, 3), round(hf, 3)]
        rows.append(r)
        print(s, m, c, r['exact'], r['f1'], r.get('d_exact_full'), r.get('d_exact_profiled'), flush=True)
json.dump(rows, open(os.path.join(HERE, 'runs', 'summary', 'exact-table.json'), 'w'), indent=1)
with open(os.path.join(HERE, 'runs', 'summary', 'page', 'exact-table.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['set', 'model', 'config', 'questions', 'exact', 'f1', 'd_exact_full', 'ci_low', 'ci_high', 'd_f1_full', 'f1_ci_low', 'f1_ci_high',
                'd_exact_profiled', 'p_ci_low', 'p_ci_high'])
    for r in rows:
        e, g, p = r.get('d_exact_full', ['', '', '']), r.get('d_f1_full', ['', '', '']), r.get('d_exact_profiled', ['', '', ''])
        w.writerow([r['set'], r['model'], r['config'], r['questions'], r['exact'], r['f1'], *e, *g, *p])
