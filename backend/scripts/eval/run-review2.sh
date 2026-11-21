#!/usr/bin/env bash
# Second revision round (Nov 2026 review, concerns 2, 4, 6):
#   routes  - Profiled on the questions whose route changed with distinct-instance coverage
#   agent   - Claude Code driving DeepSeek V4 Flash (the pipeline's model) via OpenRouter
#   para    - label-free paraphrases of the sampled questions (then review by hand!)
#   pararun - Full and Profiled on the reviewed paraphrases
# Each step has a smoke variant (append "-smoke"); run it first and check the cost.
#
#   OPENROUTER_API_KEY=... bash scripts/eval/run-review2.sh routes-smoke
set -uo pipefail
cd "$(dirname "$0")/../.."
# The key may come from the environment, backend/.env, or the repo's .env (all gitignored).
for f in .env ../.env; do
  [ -n "${OPENROUTER_API_KEY:-}" ] && break
  [ -f "$f" ] || continue
  OPENROUTER_API_KEY=$(grep -E '^(VITE_)?OPEN_?ROUTER_API_KEY=' "$f" | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r')
done
export OPENROUTER_API_KEY
: "${OPENROUTER_API_KEY:?set OPENROUTER_API_KEY in the environment or .env}"
E=scripts/eval
OUT=$E/runs/review2
mkdir -p "$OUT"
M=deepseek/deepseek-v4-flash
V2=$PWD/$E/data/profiles-frozen-v2.json
quiet() { grep -v -i deprecat | tail -"${1:-1}"; }
orkg_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://orkg.org/api/templates/R186491)" = 200 ] &&
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -G https://orkg.org/triplestore/sparql \
      --data-urlencode 'query=SELECT ?s WHERE { ?s a <http://orkg.org/orkg/class/C27001> } LIMIT 1')" = 200 ]
}
wait_orkg() { until orkg_up; do echo "ORKG down at $(date '+%H:%M'); waiting"; sleep 600; done; }

case "${1:-}" in
  routes-smoke)
    ATLAS_FROZEN_PROFILES=$V2 npx tsx $E/run.ts --model $M --configs profiled --dataset $E/data/fixed-routes-ood-cqs.json \
      --runs 1 --budget 0.10 --out $OUT/smoke-routes.jsonl 2>&1 | quiet 3;;
  routes)
    for set in sampled stress ood; do
      ATLAS_FROZEN_PROFILES=$V2 npx tsx $E/run.ts --model $M --configs profiled --dataset $E/data/fixed-routes-$set-cqs.json \
        --runs 3 --budget 0.50 --concurrency 10 --out $OUT/fixed-routes-$set-deepseek-v4-flash.jsonl 2>&1 | quiet
    done;;
  agent-smoke)
    npx tsx $E/agent-cli.ts --cli claude --provider openrouter --model $M --dataset $E/data/sampled-cqs.json \
      --limit 2 --runs 1 --budget 1.00 --concurrency 2 --out $OUT/smoke-agent.jsonl 2>&1 | quiet 4;;
  agent)
    for set in sampled stress curated ood; do
      npx tsx $E/agent-cli.ts --cli claude --provider openrouter --model $M --dataset $E/data/$set-cqs.json \
        --runs 3 --budget "${BUDGET:-10.00}" --concurrency 3 --out $OUT/$set-claude-openrouter-deepseek-v4-flash.jsonl 2>&1 | quiet 2
    done;;
  para-smoke)
    npx tsx $E/paraphrase-sampled.ts --limit 5 2>&1 | quiet; cat $E/data/sampled-para-review.md;;
  para)
    npx tsx $E/paraphrase-sampled.ts 2>&1 | quiet
    echo "Now check $E/data/sampled-para-review.md by hand and fix data/sampled-para-cqs.json before 'pararun'.";;
  pararun)
    npx tsx $E/run.ts --model $M --configs full,profiled --dataset $E/data/sampled-para-cqs.json \
      --runs 3 --budget 1.00 --concurrency 5 --out $OUT/sampled-para-deepseek-v4-flash.jsonl 2>&1 | quiet;;
  resume)
    # Wait for ORKG, then finish both runs one after the other; two passes retry
    # runs that failed for infrastructure reasons (both scripts skip completed runs).
    for pass in 1 2; do
      wait_orkg; echo "== pass $pass pararun $(date '+%H:%M')"; bash "$0" pararun
      for set in sampled stress curated ood; do
        wait_orkg; echo "== pass $pass agent $set $(date '+%H:%M')"
        npx tsx $E/agent-cli.ts --cli claude --provider openrouter --model $M --dataset $E/data/$set-cqs.json \
          --runs 3 --budget "${BUDGET:-100}" --concurrency 3 --out $OUT/$set-claude-openrouter-deepseek-v4-flash.jsonl 2>&1 | quiet 2
      done
    done; echo "=== RESUME DONE $(date)";;
  *) echo "usage: $0 {routes|agent|para|pararun}[-smoke] | resume"; exit 1;;
esac
