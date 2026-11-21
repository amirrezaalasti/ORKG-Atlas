# Cursor runs: ORKG Atlas tools in an agent CLI

Run 1 is done (answers moved to `runs/agent/cursor-raw/`). Runs 2 and 3 are needed for
both models (GLM-5.2 high, DeepSeek V4.1 Flash high) so Cursor has three runs like Claude Code.

Setup (once):

1. In Cursor: File → Open Folder → this folder (`cursor-sandbox`) on its own, not the repo.
2. Settings → MCP: enable the `atlas` server and check that it lists 7 tools.
3. Pick the model in the chat's model picker. Use exactly the same model and reasoning
   setting as run 1.
4. Agent mode. Turn off web search, auto-run for terminal commands, and codebase indexing /
   memories if offered (each run must not see earlier runs).

For each model × run (R = 2, 3) × batch (N = 1–6): open a **new chat** and paste the prompt
below, setting `N`, `R` and `MODEL` (`glm-5.2-high` or `deepseek-v4.1-flash-high`).
After a model's run R is complete, move its `answers-MODEL-runR.jsonl` out of this folder
(to `../runs/agent/cursor-raw/`) before starting the next run.

---

Read `questions/batch-N.json`. For each question in it, in order:

1. Answer the question about the Open Research Knowledge Graph (ORKG) using only the
   `atlas` MCP tools (no web search, no terminal, no other files). Treat each question
   independently; do not reuse queries from earlier questions.
2. Decide on the single SPARQL query that answers it.
3. Append one line to `answers-MODEL-runR.jsonl`:
   `{"id": "<question id>", "model": "MODEL", "run": R, "sparql": "<query>"}`
   (valid JSON on one line; escape quotes and newlines in the query).

Do not stop until every question in the batch has a line in `answers-MODEL-runR.jsonl`.
If you cannot find an answer, write your best query anyway.

---

When all batches are done, tell Claude; it scores each file with:

    npx tsx scripts/eval/agent-cli.ts --import scripts/eval/runs/agent/cursor-raw/answers-MODEL-runR.jsonl \
      --cli cursor --model MODEL --out scripts/eval/runs/agent/<set>-cursor-MODEL.jsonl
