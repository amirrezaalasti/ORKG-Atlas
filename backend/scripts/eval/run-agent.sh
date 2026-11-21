#!/usr/bin/env bash
# Agent-CLI condition: Claude Code (logged-in account, no OpenRouter) answers every
# question with only the Atlas MCP tools. Resumable; a second pass retries infra errors.
#
#   bash scripts/eval/run-agent.sh haiku [runs] [budget-per-set]
set -euo pipefail
cd "$(dirname "$0")/../.."
MODEL="${1:-haiku}"; RUNS="${2:-3}"; BUDGET="${3:-3.00}"
OUT=scripts/eval/runs/agent
mkdir -p "$OUT"
for pass in 1 2; do
  echo "=== $MODEL pass $pass $(date '+%F %H:%M')"
  for set in curated ood empty stress sampled; do
    npx tsx scripts/eval/agent-cli.ts --cli claude --model "$MODEL" \
      --dataset "scripts/eval/data/$set-cqs.json" --runs "$RUNS" --budget "$BUDGET" \
      --concurrency 3 --out "$OUT/$set-claude-$MODEL.jsonl" 2>&1 | grep -v -i deprecat | tail -1
  done
done
echo "=== $MODEL ALL DONE $(date '+%F %H:%M')"
