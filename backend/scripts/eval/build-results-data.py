"""Build the result tables behind the evaluation-results page.

Reads the run logs (runs/ow, runs/agent), drops runs that failed for
infrastructure reasons (ORKG fetch / DNS / socket errors: scored on completed
runs only), scores them with analyze.ts (strict scorer, paired bootstrap CIs),
and writes CSV tables to runs/summary/page/.

  python3 scripts/eval/build-results-data.py      (from backend/)
"""
import collections, csv, glob, json, os, random, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'runs', 'summary', 'page')
TMP = os.path.join(OUT, 'clean')
os.makedirs(TMP, exist_ok=True)

LABEL = {
    'deepseek-v4-flash': 'DeepSeek V4 Flash', 'gemma-4-31b-it': 'Gemma 4 31B',
    'gpt-oss-120b': 'gpt-oss-120b', 'mistral-small-2603': 'Mistral Small',
    'qwen3.6-35b-a3b': 'Qwen 3.6 35B-A3B', 'haiku': 'Claude Haiku', 'sonnet': 'Claude Sonnet',
    'glm-5.2-high': 'GLM-5.2', 'deepseek-v4.1-flash-high': 'DeepSeek V4.1 Flash',
}
CONFIG = {
    'full': 'Atlas Full', 'profiled': 'Atlas Profiled', 'profiled-route': 'Profiled: route only',
    'profiled-usage': 'Profiled: usage only', 'schema-dump': 'Schema dump in prompt',
    'shacl-shapes': 'SHACL shapes in prompt', 'react-explore': 'ReAct exploration',
    'raw-schema': 'Raw template JSON', 'no-schema': 'No schema', 'validator-only': 'Validator only',
    'no-nesting': 'No nesting', 'no-link': 'No paper link', 'no-validator': 'No validator',
    'no-repair': 'No repair', 'no-guidance': 'No guidance', 'repair-empty': 'Repair empty results',
    'claude-code': 'Claude Code', 'cursor-agent': 'Cursor', 'claude-code-rows': 'Claude Code (pipeline task)',
    'matched-json': 'Full prompt, JSON definitions', 'matched-shacl': 'Full prompt, SHACL shapes',
    'profiled-oracle-routes': 'Profiled + all observed routes (oracle)',
}
SETS = ['sampled', 'stress', 'curated', 'ood']


def clean(path):
    """Copy a run log without failed (infrastructure) records; count what was dropped."""
    recs = [json.loads(l) for l in open(path) if l.strip()]
    ok = [r for r in recs if not r.get('error')]
    keys_all = {(r['itemId'], r['config'], r['run']) for r in recs}
    keys_ok = {(r['itemId'], r['config'], r['run']) for r in ok}
    dst = os.path.join(TMP, os.path.basename(path))
    with open(dst, 'w') as f:
        for r in ok:
            f.write(json.dumps(r) + '\n')
    per_cfg = collections.defaultdict(lambda: [0, 0])
    for k in keys_all:
        per_cfg[k[1]][1] += 1
        per_cfg[k[1]][0] += k in keys_ok
    return dst, per_cfg


def analyze(files, gold, extra):
    base = os.path.join(TMP, 'out')
    subprocess.run(['npx', 'tsx', os.path.join(HERE, 'analyze.ts'), *files, '--gold', gold, *extra,
                    '--summary', base + '-s.json', '--dump', base + '-d.json'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=os.path.dirname(os.path.dirname(HERE)))
    summary = [r for r in json.load(open(base + '-s.json')) if r['label'] == 'all']
    dump = collections.defaultdict(lambda: collections.defaultdict(list))
    for l in open(base + '-d.json'):
        r = json.loads(l)
        dump[(r['model'], r['config'])][r['item']].append(r['f1'])
    return summary, {k: {i: sum(v) / len(v) for i, v in m.items()} for k, m in dump.items()}


def paired(a, b, seed=7, B=4000):
    items = sorted(set(a) & set(b))
    diffs = [a[i] - b[i] for i in items]
    rng = random.Random(seed)
    bs = sorted(sum(rng.choice(diffs) for _ in diffs) / len(diffs) for _ in range(B))
    return (len(items), sum(diffs) / len(diffs), bs[int(0.025 * B)], bs[int(0.975 * B)],
            sum(d > 1e-3 for d in diffs), sum(d < -1e-3 for d in diffs))


def write(name, header, rows):
    with open(os.path.join(OUT, name), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f'{name}: {len(rows)} rows')


r3 = lambda x: '' if x is None else round(x, 3)
configs, agents, models = [], [], []
for s in SETS:
    files, coverage = [], {}
    for p in sorted(glob.glob(os.path.join(HERE, 'runs', 'ow', f'{s}-*.jsonl')) +
                    glob.glob(os.path.join(HERE, 'runs', 'agent', f'{s}-*.jsonl'))):
        dst, per = clean(p)
        files.append(dst)
        recs = [json.loads(l) for l in open(p) if l.strip()]
        model = recs[0]['model'].split('/')[-1] if recs else ''
        for cfg, (ok, tot) in per.items():
            coverage[(model, cfg)] = (ok, tot)
    summary, dump = analyze(files, os.path.join(HERE, 'data', f'gold-results-{s}.json'), ['--strict'])
    for r in summary:
        ok, tot = coverage.get((r['model'], r['config']), (0, 0))
        row = [s, LABEL.get(r['model'], r['model']), CONFIG.get(r['config'], r['config']), r['config'], r['n'],
               r3(r['f1']), r3(r['f1Sd']), r3(r['exactRate']), r3(r['delta']),
               r3(r['ci'][0] if r['ci'] else None), r3(r['ci'][1] if r['ci'] else None),
               ok, tot, round(ok / tot, 3) if tot else '', round(r['costPerQ'], 5)]
        if r['model'] == 'deepseek-v4-flash':
            configs.append(row)
        if r['config'] in ('full', 'profiled') and r['model'] not in ('haiku', 'sonnet'):
            models.append(row)
    ref_p, ref_f = dump[('deepseek-v4-flash', 'profiled')], dump[('deepseek-v4-flash', 'full')]
    for (m, c), per_item in dump.items():
        if c not in ('claude-code', 'cursor-agent', 'claude-code-rows'):
            continue
        sm = next(x for x in summary if x['model'] == m and x['config'] == c)
        n, dp, lp, hp, bp, wp = paired(per_item, ref_p)
        _, df, lf, hf, bf, wf = paired(per_item, ref_f)
        runs = {'haiku': 3, 'sonnet': 3}.get(m, 1)
        agents.append([s, CONFIG[c].split(' (')[0], LABEL.get(m, m), f'{CONFIG[c]} · {LABEL.get(m, m)}', runs, n, r3(sm['f1']),
                       r3(sm['exactRate']), r3(dp), r3(lp), r3(hp), bp, wp, r3(df), r3(lf), r3(hf),
                       round(sm['costPerQ'], 4)])
    for key, lab in [(('deepseek-v4-flash', 'full'), 'Atlas Full · DeepSeek V4 Flash'),
                     (('deepseek-v4-flash', 'profiled'), 'Atlas Profiled · DeepSeek V4 Flash')]:
        sm = next(x for x in summary if (x['model'], x['config']) == key)
        agents.append([s, 'Atlas pipeline', 'DeepSeek V4 Flash', lab, 3, sm['n'], r3(sm['f1']), r3(sm['exactRate']),
                       '', '', '', '', '', '', '', '', round(sm['costPerQ'], 4)])

H = ['set', 'model', 'config', 'config_id', 'questions', 'f1', 'f1_sd_runs', 'exact', 'delta_vs_full',
     'ci_low', 'ci_high', 'runs_ok', 'runs_planned', 'coverage', 'cost_per_q_usd']
write('deepseek-configs.csv', H, configs)
write('models-full-vs-profiled.csv', H, models)
write('agent-cli.csv', ['set', 'driver', 'model', 'label', 'runs', 'questions', 'f1', 'exact',
                        'delta_vs_profiled', 'ci_low_p', 'ci_high_p', 'better_p', 'worse_p',
                        'delta_vs_full', 'ci_low_f', 'ci_high_f', 'cost_per_q_usd'], agents)

# Empty-answer set: abstention rate.
files = [clean(p)[0] for p in sorted(glob.glob(os.path.join(HERE, 'runs', 'ow', 'empty-*.jsonl')))]
summary, _ = analyze(files, os.path.join(HERE, 'data', 'gold-results-empty.json'), ['--empty'])
write('empty-abstention.csv', ['model', 'config', 'questions', 'abstention'],
      [[LABEL.get(r['model'], r['model']), CONFIG.get(r['config'], r['config']), r['n'], r3(r['f1'])] for r in summary])

# Catalogue divergence (RQ1).
d = json.load(open(os.path.join(HERE, 'runs', 'catalogue-divergence.json')))
a = d['attached>=1']
n = a['n']
write('catalogue-divergence.csv', ['finding', 'templates', 'of', 'share'], [
    [lab, v, n, round(v / n, 3)] for lab, v in [
        ('Instances attached below the contribution', a['indirect']),
        ('Instances reached along more than one route', a['multi_route']),
        ('Instances at more than one depth', a['multi_depth']),
        ('Declared property no instance states', a['with_unused_declared']),
        ('Undeclared predicate on at least 10% of instances', a['with_undeclared_salient']),
        ('Undeclared predicate replaces a declared one', a['with_substitution']),
        ('Existence probe reaches under half the instances', a['existence_lt50']),
        ('Frequency choice reaches under half the instances', a['frequency_lt50']),
    ]])
