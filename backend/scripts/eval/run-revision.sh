#!/usr/bin/env bash
# Revision runs (Nov 2026 review): matched-information comparators and oracle routes.
#   OPENROUTER_API_KEY=... bash scripts/eval/run-revision.sh pipeline
#   bash scripts/eval/run-revision.sh agent            (Claude account, no OpenRouter key)
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=scripts/eval/runs
orkg_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://orkg.org/api/templates/R186491)" = 200 ] &&
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -G https://orkg.org/triplestore/sparql \
      --data-urlencode 'query=SELECT ?s WHERE { ?s a <http://orkg.org/orkg/class/C27001> } LIMIT 1')" = 200 ]
}
wait_orkg() { until orkg_up; do echo "ORKG down at $(date '+%H:%M'); waiting"; sleep 600; done; }
M=deepseek/deepseek-v4-flash
case "${1:-}" in
  pipeline)
    for pass in 1 2; do
      for set in sampled stress curated ood; do
        cfgs=matched-json,matched-shacl
        [ "$set" = sampled ] || [ "$set" = stress ] && cfgs=$cfgs,profiled-oracle-routes
        wait_orkg; echo "== pass $pass $set $cfgs $(date '+%H:%M')"
        npx tsx scripts/eval/run.ts --model $M --configs $cfgs --dataset scripts/eval/data/$set-cqs.json --runs 3 \
          --budget 1.00 --concurrency 20 --out $OUT/ow/$set-deepseek-v4-flash.jsonl 2>&1 | grep -v -i deprecat | tail -1
      done
    done; echo "=== PIPELINE DONE $(date)";;
  agent)
    for pass in 1 2; do
      for set in curated ood; do
        wait_orkg; echo "== pass $pass $set $(date '+%H:%M')"
        npx tsx scripts/eval/agent-cli.ts --cli claude --model haiku --task rows --dataset scripts/eval/data/$set-cqs.json \
          --runs 3 --budget 1.00 --concurrency 3 --out $OUT/agent/$set-claude-haiku-rows.jsonl 2>&1 | grep -v -i deprecat | tail -1
      done
    done; echo "=== AGENT DONE $(date)";;
esac
