#!/usr/bin/env bash
# Open-weight evaluation plan for the paper (resumable: run.ts skips finished records).
#
#   OPENROUTER_API_KEY=$(cat ~/.openrouter_key) bash scripts/eval/run-plan.sh smoke
#   OPENROUTER_API_KEY=$(cat ~/.openrouter_key) bash scripts/eval/run-plan.sh main  [model]
#   OPENROUTER_API_KEY=$(cat ~/.openrouter_key) bash scripts/eval/run-plan.sh sweep
#
# Run from backend/. Every invocation of run.ts stops at its --budget (US$).
set -euo pipefail
cd "$(dirname "$0")/../.."

MODELS=(
  "qwen/qwen3.6-35b-a3b"
  "deepseek/deepseek-v4-flash"
  "google/gemma-4-31b-it"
  "mistralai/mistral-small-2603"
  "openai/gpt-oss-120b"
)
MAIN="${2:-deepseek/deepseek-v4-flash}"
D=scripts/eval/data
OUT=scripts/eval/runs/ow
mkdir -p "$OUT"
short() { echo "${1##*/}"; }

orkg_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://orkg.org/api/templates/R186491)" = 200 ] &&
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -G https://orkg.org/triplestore/sparql \
      --data-urlencode 'query=SELECT ?s WHERE { ?s a <http://orkg.org/orkg/class/C27001> } LIMIT 1')" = 200 ]
}
wait_orkg() { # block until ORKG answers; checks every 10 min
  until orkg_up; do echo "ORKG down at $(date '+%H:%M'); waiting"; sleep 600; done
}

run() { # model configs dataset runs budget out [limit]
  wait_orkg
  local extra=()
  [ -n "${7:-}" ] && extra=(--limit "$7")
  npx tsx scripts/eval/run.ts --model "$1" --configs "$2" --dataset "$3" --runs "$4" \
    --budget "$5" --concurrency 10 --out "$6" ${extra[@]+"${extra[@]}"} 2>&1 | grep -v -i -E "deprecat|trace-dep" | tail -2
}

case "${1:-}" in
  smoke)
    # 5 sampled questions, 1 run: every model on Full + Profiled; main model on all new configs.
    for m in "${MODELS[@]}"; do
      echo "== smoke $(short "$m")"
      run "$m" full,profiled "$D/sampled-cqs.json" 1 0.30 "$OUT/smoke-$(short "$m").jsonl" 5
    done
    echo "== smoke main configs $(short "$MAIN")"
    run "$MAIN" schema-dump,shacl-shapes,react-explore,validator-only,no-schema "$D/sampled-cqs.json" 1 0.30 "$OUT/smoke-$(short "$MAIN")-configs.jsonl" 5
    ;;
  main)
    # Configuration comparison on the main model, 3 runs.
    m="$MAIN"; s=$(short "$m")
    run "$m" full,profiled,profiled-route,profiled-usage,schema-dump,shacl-shapes,react-explore,no-schema,raw-schema "$D/sampled-cqs.json" 3 4.00 "$OUT/sampled-$s.jsonl"
    run "$m" full,profiled,profiled-route,profiled-usage,schema-dump,shacl-shapes,react-explore,no-schema "$D/stress-cqs.json" 3 2.00 "$OUT/stress-$s.jsonl"
    run "$m" full,profiled,no-nesting,no-link,no-validator,no-repair,no-guidance,schema-dump,shacl-shapes,react-explore,raw-schema,no-schema,validator-only "$D/curated-cqs.json" 3 2.50 "$OUT/curated-$s.jsonl"
    run "$m" full,profiled,no-nesting,no-link,schema-dump,shacl-shapes,react-explore,raw-schema,no-schema,validator-only "$D/ood-cqs.json" 3 1.50 "$OUT/ood-$s.jsonl"
    run "$m" full,profiled,repair-empty "$D/empty-cqs.json" 3 0.30 "$OUT/empty-$s.jsonl"
    ;;
  sweep)
    # Full + Profiled for every model on every set, 3 runs (the main model's are reused).
    for m in "${MODELS[@]}"; do
      s=$(short "$m")
      for set in curated ood empty sampled stress; do
        echo "== $s $set"
        run "$m" full,profiled "$D/$set-cqs.json" 3 1.50 "$OUT/$set-$s.jsonl"
      done
    done
    ;;
  *)
    echo "usage: run-plan.sh smoke|main|sweep [main-model]"; exit 1 ;;
esac
