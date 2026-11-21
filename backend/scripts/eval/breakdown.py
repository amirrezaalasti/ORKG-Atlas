"""Per-subset breakdown (review concern 3): exact rate by question kind / stress type,
split by empty vs non-empty gold, with a trivial "return nothing" baseline.

    python3 scripts/eval/breakdown.py      (from backend/; after exact-table.py)
Writes runs/summary/breakdown.json and runs/summary/page/breakdown.csv.
"""
import collections, csv, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
CLEAN = os.path.join(HERE, 'runs', 'summary', 'page', 'clean')
SETS = ['sampled', 'stress', 'curated', 'ood']
ex = lambda v: sum(x >= 0.999 for x in v) / len(v)

def subset(it, s):
    if s == 'stress': return it.get('kind')            # attr (route) / unused / mismatch (substitution)
    if s == 'sampled': return it.get('kind')
    return 'all'

rows, js = [], {}
for s in SETS:
    items = {i['id']: i for i in json.load(open(os.path.join(HERE, 'data', f'{s}-cqs.json')))['items']}
    gold = {g['id']: g['results'] for g in json.load(open(os.path.join(HERE, 'data', f'gold-results-{s}.json')))['items']}
    gempty = {i: all(len(t.get('rows', [])) == 0 for t in gold.get(i, [])) for i in items}
    d = collections.defaultdict(lambda: collections.defaultdict(list))
    for l in open(os.path.join(CLEAN, f'x-{s}-d.json')):
        r = json.loads(l); d[(r['model'], r['config'])][r['item']].append(r['f1'])
    groups = collections.defaultdict(list)
    for i, it in items.items():
        if i not in gold: continue
        g = subset(it, s)
        groups[(g, 'empty' if gempty[i] else 'nonempty')].append(i)
        groups[(g, 'any')].append(i)
        groups[('ALL', 'empty' if gempty[i] else 'nonempty')].append(i)
        groups[('ALL', 'any')].append(i)
    systems = [('return-nothing', None)] + sorted(d)
    for (g, e), ids in sorted(groups.items()):
        for sysk in systems:
            if sysk[0] == 'return-nothing':
                vals = [1.0 if gempty[i] else 0.0 for i in ids]; name = ('-', 'return-nothing')
            else:
                per = d[sysk]; vals = [ex(per[i]) for i in ids if i in per]; name = sysk
                if not vals: continue
            r = {'set': s, 'subset': g, 'gold': e, 'n': len(ids), 'model': name[0], 'config': name[1],
                 'exact': round(sum(vals) / len(vals), 3)}
            rows.append(r)
            js.setdefault(s, []).append(r)
os.makedirs(os.path.join(HERE, 'runs', 'summary', 'page'), exist_ok=True)
json.dump(js, open(os.path.join(HERE, 'runs', 'summary', 'breakdown.json'), 'w'), indent=1)
with open(os.path.join(HERE, 'runs', 'summary', 'page', 'breakdown.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

# LaTeX per-subset table (paper/sections/table-subsets.tex).
ROWS = [('-', 'return-nothing', 'Return nothing'),
        ('deepseek-v4-flash', 'schema-dump', 'Schema-dump'),
        ('deepseek-v4-flash', 'full', 'Full'), ('deepseek-v4-flash', 'profiled', 'Profiled'),
        ('deepseek-v4-flash', 'profiled-oracle-routes', 'Oracle-routes'),
        ('haiku', 'claude-code', 'CC, Haiku'), ('sonnet', 'claude-code', 'CC, Sonnet'),
        ('deepseek-v4-flash', 'claude-code', 'CC, DeepSeek'),
        ('glm-5.2-high', 'cursor-agent', 'Cursor, GLM'), ('deepseek-v4.1-flash-high', 'cursor-agent', 'Cursor, DeepSeek')]
COLS = [('sampled', 'attr', 'any'), ('sampled', 'count', 'any'), ('sampled', 'filter', 'any'), ('sampled', 'nested', 'any'),
        ('sampled', 'unused', 'any'), ('stress', 'attr', 'any'), ('stress', 'mismatch', 'any'), ('stress', 'unused', 'any'),
        ('stress', 'ALL', 'nonempty')]
idx = {(r['set'], r['subset'], r['gold'], r['model'], r['config']): r for r in rows}
n = {c: next((r['n'] for r in rows if (r['set'], r['subset'], r['gold']) == c), 0) for c in COLS}
fmt = lambda v: '--' if v is None else f'{v:.2f}'.lstrip('0') if v < 1 else '1.0'
tex = [r'\begin{table}[t]', r'\centering\scriptsize\setlength{\tabcolsep}{2.6pt}',
       r'\caption{Strict exact rate per question kind, three runs; pipeline rows use DeepSeek~V4 Flash, '
       r'CC is Claude Code. Unstated-property questions have empty gold, which \emph{Return nothing} '
       r'answers exactly.}', r'\label{tab:subsets}',
       r'\begin{tabular}{@{}lccccc|cccc@{}}', r'\toprule',
       r' & \multicolumn{5}{c|}{Sampled} & \multicolumn{4}{c}{Stress} \\',
       r' & Attr. & Count & Filter & Nest. & Unst. & Route & Subst. & Unst. & Non-empty \\',
       ' & ' + ' & '.join(f'({n[c]})' for c in COLS) + r' \\', r'\midrule']
for m, c, label in ROWS:
    vals = [idx.get((s, sub, g, m, c), {}).get('exact') for s, sub, g in COLS]
    if all(v is None for v in vals): continue
    tex.append(label + ' & ' + ' & '.join(fmt(v) for v in vals) + r' \\')
tex += [r'\bottomrule', r'\end{tabular}', r'\end{table}']
open(os.path.join(HERE, '..', '..', '..', 'paper', 'sections', 'table-subsets.tex'), 'w').write('\n'.join(tex) + '\n')
