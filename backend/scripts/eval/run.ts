/**
 * Run the RQ2 evaluation. Appends one JSON record per (item, config, run) to a
 * JSONL log and stops before exceeding the budget.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/eval/run.ts \
 *     --model google/gemini-2.5-flash --configs full,no-schema \
 *     [--dataset data/curated-cqs.json] [--runs 1] [--limit N] [--budget 1.00] [--out runs/x.jsonl]
 *
 * Re-running with the same --out skips records that already exist (resumable).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { mapLimit, type EvalItem } from './common.js';
import { CONFIGS, runItem } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    configs: { type: 'string', default: 'full' },
    dataset: {
      type: 'string',
      default: join(here, 'data', 'curated-cqs.json'),
    },
    runs: { type: 'string', default: '1' },
    limit: { type: 'string' },
    budget: { type: 'string', default: '1.00' },
    concurrency: { type: 'string', default: '3' },
    out: { type: 'string' },
  },
});

if (!values.model) {
  console.error('--model is required (OpenRouter model id)');
  process.exit(1);
}
const model = values.model;
const configs = values.configs!.split(',').map((c) => {
  const cfg = CONFIGS[c.trim()];
  if (!cfg)
    throw new Error(
      `Unknown config "${c}". Known: ${Object.keys(CONFIGS).join(', ')}`
    );
  return cfg;
});
const runs = Number(values.runs);
const budget = Number(values.budget);
const datasetPath = resolve(values.dataset!);
let { items } = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
  items: EvalItem[];
};
if (values.limit) items = items.slice(0, Number(values.limit));

const outPath = resolve(
  values.out ?? join(here, 'runs', `${model.replace(/[^\w.-]+/g, '_')}.jsonl`)
);
mkdirSync(dirname(outPath), { recursive: true });

const done = new Set<string>();
let spent = 0;
if (existsSync(outPath)) {
  for (const line of readFileSync(outPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (!r.error) done.add(`${r.itemId}|${r.config}|${r.model}|${r.run}`);
  }
}

type Job = { item: EvalItem; cfg: (typeof configs)[number]; run: number };
const jobs: Job[] = [];
for (let run = 1; run <= runs; run++)
  for (const cfg of configs)
    for (const item of items)
      if (!done.has(`${item.id}|${cfg.name}|${model}|${run}`))
        jobs.push({ item, cfg, run });

console.log(
  `${jobs.length} jobs (${done.size} already done) · model ${model} · budget $${budget.toFixed(2)} → ${outPath}`
);

let stopped = false;
await mapLimit(jobs, Number(values.concurrency), async ({ item, cfg, run }) => {
  if (stopped) return;
  if (spent >= budget) {
    stopped = true;
    console.log(`Budget of $${budget.toFixed(2)} reached; stopping.`);
    return;
  }
  const rec = await runItem(item, cfg, model, run);
  spent += rec.costUsd;
  appendFileSync(outPath, JSON.stringify(rec) + '\n');
  const status = rec.error
    ? `ERROR ${rec.error.slice(0, 80)}`
    : `${rec.executable ? 'exec' : 'fail'} ${rec.nonEmpty ? 'rows' : 'empty'} repairs=${rec.repairs}`;
  console.log(
    `[${cfg.name}] ${item.id} r${run}: ${status} · $${rec.costUsd.toFixed(4)} · total $${spent.toFixed(3)}`
  );
});

console.log(`Done. Spent $${spent.toFixed(4)} in this invocation.`);
