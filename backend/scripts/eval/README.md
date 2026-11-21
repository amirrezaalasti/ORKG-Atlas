# RQ2 evaluation harness

Text-to-SPARQL evaluation of Atlas against curated CQ–SPARQL gold pairs. The
pipeline (`pipeline.ts`) calls the production resolver, prompt generator,
validator, and SPARQL client unchanged; only the ablation switches are added here.

```bash
cd backend
# 1. Extract gold pairs from a Firestore backup → data/curated-cqs.json
npx tsx scripts/eval/extract-gold.ts ../backups/firebase-backup-<date>.json
# 2. Execute and freeze gold results → data/gold-results-curated.json
npx tsx scripts/eval/freeze-gold.ts
# 3. Run (resumable; stops at --budget USD, cost as reported by OpenRouter)
OPENROUTER_API_KEY=... npx tsx scripts/eval/run.ts \
  --model anthropic/claude-haiku-5.5 --configs full,no-schema --budget 1.00
# 4. Score
npx tsx scripts/eval/score.ts scripts/eval/runs/*.jsonl --per-item
```

Configurations: `full`, `no-nesting`, `no-link`, `no-validator`, `no-repair`,
`no-guidance`, `no-schema`, `raw-schema`, `schema-dump`, `repair-empty` (see
`CONFIGS` in `pipeline.ts`). Repair is triggered by a missing query, a validator
rejection, or an endpoint error, for up to 3 attempts in total (`no-repair`: 1); an
executable empty result is kept (`repair-empty` restores the earlier policy).
`raw-schema` / `schema-dump` are schema-aware prompting baselines: the template
definitions the resolver collects, as JSON, in a plain prompt (`schema-dump` adds the
P31 link and the output convention).

Question sets (`data/`): `curated-cqs.json` (26), `ood-cqs.json` (20 questions, five
non-RE templates, no guidance), `empty-cqs.json` (10 questions whose correct answer is
empty or zero), each with a frozen `gold-results-*.json`.

```bash
# Paper statistics: exact rates, two-level bootstrap CIs, per-template breakdown
npx tsx scripts/eval/analyze.ts runs/v2-ood-haiku-5.5.jsonl --gold scripts/eval/data/gold-results-ood.json --by-template [--agg]
npx tsx scripts/eval/analyze.ts runs/v2-empty-haiku-5.5.jsonl --gold scripts/eval/data/gold-results-empty.json --empty
# Blind scorer audit sample (audit/sample.md, audit/key.json); judgements in audit/judgements.jsonl
npx tsx scripts/eval/audit-sample.ts <runs.jsonl>:<gold.json>:<dataset.json> ... --n 40
```

Paper tables come from the `v2-*` logs (Haiku, all configs) and the `v3-*` logs
(model comparison, Full config: Sonnet 5.5, Mistral Small 3.2, gpt-oss-120b), all on
the current code:

```
npx tsx scripts/eval/analyze.ts runs/v2-curated-haiku-5.5.jsonl runs/v3-curated-*.jsonl --gold scripts/eval/data/gold-results-curated.json
```

Run logs store each run's full final result table so it can be re-scored offline;
that is why they are large (about 50 KB median, up to 2 MB per run). They gzip ~11x.
Older logs (`ablation-*`, `models-*`) are from the earlier prompt/repair version; do not pass old and new logs
for the same config to one `analyze.ts` call (later files overwrite earlier ones).

Scoring (`scoreTables` in `common.ts`): each gold answer column is aligned with
the best-matching predicted column; values are compared as (paper, value) pairs;
binary columns as the set of papers where the flag holds. Identity columns
(paper, label, contribution, year) are not scored on their own.

## Instance profiling, new question sets, scorer validation (Nov 2026 revision)

Catalogue-wide schema–data divergence (RQ1) is computed **offline from the ORKG RDF
dump**, never with catalogue-wide queries against the public endpoint (those congest it):

```bash
curl -o /tmp/orkg.nt https://orkg.org/files/rdf-dumps/rdf-export-orkg.nt     # 14 Nov 2026: 947 MB
python3 catalogue/profile_dump.py /tmp/orkg.nt          # -> data/catalogue-profile-dump.json (~30 s)
python3 catalogue/analyse_profile.py --json runs/catalogue-divergence.json
```

The dump profile also stores per-instance route signatures (`combos`), so route coverage is
counted over distinct instances; `analyse_profile.py` then adds `xcov_*` figures, including
`xcov_frequency_runtime` under the deployed profiler's two-hop rule. Profiles for the
evaluated templates are frozen with
`npx tsx scripts/eval/freeze-profiles-dump.ts data/*-cqs.json [--profile <dump profile>] [--out <file>]`.

Question sets built from the profile (deterministic, seed 2027):

```bash
python3 catalogue/build_sampled.py --n 40 --seed 2027   # data/sampled-cqs.json (40 random templates)
python3 catalogue/build_sampled.py --stress --seed 2027 # data/stress-cqs.json (route / mismatch / unused)
python3 catalogue/resolve_filters.py                    # picks filter values (live endpoint, sequential)
npx tsx scripts/eval/freeze-gold.ts scripts/eval/data/sampled-cqs.json scripts/eval/data/gold-results-sampled.json
npx tsx scripts/eval/freeze-gold.ts scripts/eval/data/stress-cqs.json  scripts/eval/data/gold-results-stress.json
```

Frozen instance profiles (`data/profiles-frozen.json`) for every evaluated template; the
pipeline reads them instead of profiling live. Built from the dump with live template
definitions (`--snapshot` uses the August catalogue snapshot instead) and checked against
live profiles in `data/profiles-live-check.json`:

```bash
npx tsx freeze-profiles-dump.ts data/{curated,ood,empty,sampled,stress}-cqs.json --check data/profiles-live-check.json
npx tsx profile-template.ts R593670        # print the prompt section of one profile
```

New configurations (`pipeline.ts`): `profiled` (frequency route + usage section),
`profiled-route`, `profiled-usage`, `shacl-shapes` (SHACL Turtle in the prompt, after
Wardenga et al.), `react-explore` (≤8 exploratory queries, after Brei et al.),
`validator-only` (no schema, validator hints). Every run record gets `emptyDiagnosis`.

Scoring and validation:

```bash
npx tsx scripts/eval/validate-scorer.ts --json scripts/eval/runs/scorer-validation.json   # metamorphic checks
npx tsx scripts/eval/analyze.ts <runs> --gold <gold> [--strict] [--summary out.json]     # strict = 1:1 columns, extra columns penalised
npx tsx scripts/eval/analyze-diagnosis.ts <runs> --sets data/empty-cqs.json,...           # empty-result diagnosis vs truth
python3 scripts/eval/breakdown.py      # per-kind exact rates + return-nothing baseline -> paper/sections/table-subsets.tex
SCORER_FLAGS=boolean npx tsx scripts/eval/analyze.ts ...   # sensitivity: flags only for boolean-like columns
```

Items with empty gold (empty set, `unused` kinds) are scored as correct abstention
automatically. Paper figures: `python3 paper/figures/scripts/eval_figures.py` reads
`runs/catalogue-divergence.json`, `runs/scorer-validation.json`, and `runs/summary/*.json`.

## Review revision (Nov 2026)

```bash
# Matched comparators (Full's prompt with JSON / SHACL definitions instead of the predicate map),
# oracle routes (every route observed in the dump), Haiku with the pipeline's task wording:
OPENROUTER_API_KEY=... bash scripts/eval/run-revision.sh pipeline
bash scripts/eval/run-revision.sh agent              # Claude account, no OpenRouter key
python3 catalogue/route_coverage.py --out runs/route-coverage.json   # distinct coverage of the chosen route
python3 scripts/eval/build-results-data.py && python3 scripts/eval/exact-table.py   # from backend/
python3 paper/figures/scripts/main_table.py          # Table 2 (from paper/: figures/scripts/main_table.py)
```

Template definitions are frozen in `data/template-flows-frozen.json` on first load (like
profiles), so runs no longer call the ORKG REST API. `exact-table.py` reports strict exact
rate and F1 with two-level bootstrap intervals (questions, then runs) for every condition.
