/**
 * Agent-CLI condition: an off-the-shelf agent CLI answers each question with only
 * the Atlas tools (served over MCP by src/mcp-stdio.ts) and a one-paragraph
 * instruction — no pipeline, no repair loop, no prompt engineering beyond that.
 * The agent's final SPARQL is executed and written as a normal RunRecord, so
 * analyze.ts scores it exactly like the pipeline configurations.
 *
 *   npx tsx scripts/eval/agent-cli.ts --cli claude --model haiku \
 *     --dataset scripts/eval/data/curated-cqs.json --runs 1 --limit 3 \
 *     --budget 1.00 --out scripts/eval/runs/agent/curated-claude-haiku.jsonl
 *   npx tsx scripts/eval/agent-cli.ts --cli cursor --model <cursor-model> ...
 *
 * The agent runs in an empty sandbox directory with every built-in tool disabled
 * (Claude: --tools ""; Cursor: ask mode), so it can reach ORKG only via MCP.
 */
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeSparql,
  extractSparqlBlocks,
  mapLimit,
  type EvalItem,
} from './common.js';
import type { RunRecord } from './pipeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const cli = (opt('--cli') ?? 'claude') as 'claude' | 'cursor';
const model = opt('--model') ?? (cli === 'claude' ? 'haiku' : 'auto');
const dataset = resolve(
  opt('--dataset') ?? join(here, 'data', 'curated-cqs.json')
);
const runs = Number(opt('--runs') ?? 1);
const limit = opt('--limit') ? Number(opt('--limit')) : undefined;
const budget = Number(opt('--budget') ?? 1);
const concurrency = Number(opt('--concurrency') ?? 3);
const timeoutMs = Number(opt('--timeout') ?? 600) * 1000;
const out = resolve(
  opt('--out') ?? join(here, 'runs', 'agent', `${cli}-${model}.jsonl`)
);
/** --task rows: the pipeline's task (retrieve the rows the answer is computed from) instead of "answer the question". */
const task = (opt('--task') ?? 'answer') as 'answer' | 'rows';
const config =
  (cli === 'claude' ? 'claude-code' : 'cursor-agent') +
  (task === 'rows' ? '-rows' : '');
/**
 * --provider openrouter: Claude Code with a non-Anthropic model through OpenRouter's
 * Anthropic-compatible endpoint (needs OPENROUTER_API_KEY), so the agent can run the
 * pipeline's model. Claude Code's reported cost then assumes Anthropic prices; the
 * provider-billed cost is read from OpenRouter's key usage before and after the run.
 */
const provider = (opt('--provider') ?? 'anthropic') as
  | 'anthropic'
  | 'openrouter';
const profilesPath = resolve(
  opt('--profiles') ?? join(here, 'data', 'profiles-frozen.json')
);
const modelId =
  provider === 'openrouter' ? `${cli}/openrouter/${model}` : `${cli}/${model}`;
const openrouterKey = process.env.OPENROUTER_API_KEY;
if (provider === 'openrouter' && !openrouterKey)
  throw new Error('--provider openrouter needs OPENROUTER_API_KEY');
const keyUsage = async (): Promise<number> => {
  if (provider !== 'openrouter') return NaN;
  const r = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${openrouterKey}` },
  });
  return ((await r.json()) as { data?: { usage?: number } }).data?.usage ?? NaN;
};

export const AGENT_TOOLS = [
  'orkg_sparql_schema',
  'orkg_sparql',
  'orkg_get_template',
  'orkg_search_templates',
  'orkg_get_resource',
  'orkg_search_resources',
  'orkg_get_statements_by_subject',
];

/** The whole "pipeline": what a user would type into the CLI. */
export const agentPrompt = (item: EvalItem & { templateTitle?: string }) =>
  `Answer this question about the Open Research Knowledge Graph (ORKG) using the ORKG Atlas tools.\n\n` +
  `Template: ${item.templateId}${item.templateTitle ? ` ("${item.templateTitle}")` : ''}\n` +
  `Question: ${item.question}\n\n` +
  (task === 'rows'
    ? `Finish with the single SPARQL query that retrieves the data needed to answer the question, ` +
      `following the instructions returned by orkg_sparql_schema, in a \`\`\`sparql code block.`
    : `Finish with the single SPARQL query that answers the question, in a \`\`\`sparql code block.`);

// ── sandbox: empty working directory with only the MCP config ───────────────
const sandbox = mkdtempSync(join(tmpdir(), `atlas-${cli}-`));
const mcpServer = {
  // `cwd` is not honoured by every client; cd explicitly so .env and node_modules resolve.
  command: '/bin/sh',
  args: [
    '-c',
    `cd '${backend}' && exec ./node_modules/.bin/tsx src/mcp-stdio.ts 2>/dev/null`,
  ],
  // Same frozen profiles as the pipeline configurations, so only the driver differs.
  env: {
    ATLAS_MCP_TOOLS: AGENT_TOOLS.join(','),
    ATLAS_FROZEN_PROFILES: profilesPath,
  },
};
const mcpConfigPath = join(sandbox, 'mcp.json');
writeFileSync(
  mcpConfigPath,
  JSON.stringify({ mcpServers: { atlas: mcpServer } }, null, 2)
);
if (cli === 'cursor') {
  mkdirSync(join(sandbox, '.cursor'), { recursive: true });
  writeFileSync(
    join(sandbox, '.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { atlas: mcpServer } }, null, 2)
  );
}

const cliArgs = (prompt: string): [string, string[]] =>
  cli === 'claude'
    ? [
        'claude',
        [
          '-p',
          prompt,
          '--model',
          model,
          '--output-format',
          'json',
          '--mcp-config',
          mcpConfigPath,
          '--strict-mcp-config',
          '--tools',
          '',
          '--allowedTools',
          AGENT_TOOLS.map((t) => `mcp__atlas__${t}`).join(','),
          '--setting-sources',
          '',
          '--no-session-persistence',
          // With OpenRouter the estimate uses Anthropic prices, so it is only a loose cap.
          '--max-budget-usd',
          provider === 'openrouter' ? '5.00' : '0.50',
        ],
      ]
    : [
        'cursor-agent',
        [
          '-p',
          prompt,
          '--model',
          model,
          '--output-format',
          'json',
          '--mode',
          'ask',
          '--approve-mcps',
        ],
      ];

const runCli = (prompt: string) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (res) => {
      const [cmd, a] = cliArgs(prompt);
      // Clean environment: no inherited Claude Code session state, no LLM provider keys
      // (Claude Code authenticates with the logged-in account; OpenRouter is not used).
      const env: Record<string, string | undefined> = Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) =>
            !/^(CLAUDE|CLAUDECODE|ANTHROPIC|OPENROUTER|VITE_OPEN_ROUTER)/.test(
              k
            )
        )
      );
      if (provider === 'openrouter')
        Object.assign(env, {
          ANTHROPIC_BASE_URL: 'https://openrouter.ai/api',
          ANTHROPIC_AUTH_TOKEN: openrouterKey,
          ANTHROPIC_API_KEY: '',
          // Background calls (titles, summaries) use the same model, never an Anthropic one.
          ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: model,
          ANTHROPIC_SMALL_FAST_MODEL: model,
        });
      const p = spawn(cmd, a, {
        cwd: sandbox,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => (stdout += d));
      p.stderr.on('data', (d) => (stderr += d));
      const t = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
      p.on('close', (code) => {
        clearTimeout(t);
        res({ code, stdout, stderr });
      });
    }
  );

// ── import: answers produced interactively (Cursor app) → RunRecords ────────
const importPath = opt('--import');
if (importPath) {
  const sets = ['curated', 'ood', 'stress', 'sampled', 'empty'];
  const itemById = new Map<string, EvalItem>();
  for (const s of sets) {
    const f = join(here, 'data', `${s}-cqs.json`);
    if (existsSync(f))
      for (const it of JSON.parse(readFileSync(f, 'utf8')).items)
        itemById.set(it.id, it);
  }
  mkdirSync(dirname(out), { recursive: true });
  const lines = readFileSync(resolve(importPath), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const seen = new Map<string, number>();
  for (const line of lines) {
    const a = JSON.parse(line) as { id: string; sparql: string; run?: number };
    const it = itemById.get(a.id);
    if (!it) {
      console.error(`unknown id ${a.id}`);
      continue;
    }
    const run = a.run ?? (seen.get(a.id) ?? 0) + 1;
    seen.set(a.id, run);
    const rec: RunRecord = {
      itemId: it.id,
      dataset: it.dataset,
      templateId: it.templateId,
      config,
      model: modelId,
      run,
      finalQueries: [a.sparql],
      finalTables: [],
      executable: false,
      nonEmpty: false,
      attempts: [],
      repairs: 0,
      validatorRejections: 0,
      costUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
    };
    const ex = await executeSparql(a.sparql);
    if (ex.ok)
      Object.assign(rec, {
        executable: true,
        finalTables: [ex.table],
        nonEmpty: ex.table.rows.length > 0,
      });
    appendFileSync(out, JSON.stringify(rec) + '\n');
    console.error(
      `[${config}] ${it.id} r${run}: ${rec.executable ? (rec.nonEmpty ? 'rows' : 'empty') : 'not executable'}`
    );
  }
  process.exit(0);
}

// ── main ────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(dataset, 'utf8'));
let items: (EvalItem & { templateTitle?: string })[] = data.items;
if (limit) items = items.slice(0, limit);

mkdirSync(dirname(out), { recursive: true });
const done = new Set<string>();
let spent = 0;
if (existsSync(out)) {
  for (const line of readFileSync(out, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as RunRecord;
    spent += r.costUsd || 0;
    if (!r.error) done.add(`${r.itemId}|${r.run}`);
  }
}

const jobs = items
  .flatMap((it) => Array.from({ length: runs }, (_, k) => ({ it, run: k + 1 })))
  .filter(({ it, run }) => !done.has(`${it.id}|${run}`));
console.error(
  `${modelId}: ${jobs.length} jobs, sandbox ${sandbox}, spent so far $${spent.toFixed(3)}`
);
const usageBefore = await keyUsage();

await mapLimit(jobs, concurrency, async ({ it, run }) => {
  if (spent >= budget) return;
  const started = Date.now();
  const rec: RunRecord & { turns?: number; answer?: string } = {
    itemId: it.id,
    dataset: it.dataset,
    templateId: it.templateId,
    config,
    model: modelId,
    run,
    finalQueries: [],
    finalTables: [],
    executable: false,
    nonEmpty: false,
    attempts: [],
    repairs: 0,
    validatorRejections: 0,
    costUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
  };
  const { code, stdout, stderr } = await runCli(agentPrompt(it));
  rec.latencyMs = Date.now() - started;
  let text = stdout;
  try {
    const j = JSON.parse(stdout);
    text = j.result ?? j.text ?? stdout;
    rec.costUsd = j.total_cost_usd ?? 0;
    rec.turns = j.num_turns;
    rec.promptTokens =
      (j.usage?.input_tokens ?? 0) +
      (j.usage?.cache_read_input_tokens ?? 0) +
      (j.usage?.cache_creation_input_tokens ?? 0);
    rec.completionTokens = j.usage?.output_tokens ?? 0;
    if (j.is_error)
      rec.error = `cli: ${String(j.result ?? j.subtype).slice(0, 200)}`;
  } catch {
    if (code !== 0)
      rec.error = `cli exit ${code}: ${(stderr || stdout).slice(0, 300)}`;
  }
  spent += rec.costUsd;
  rec.answer = String(text).slice(-4000);
  const blocks = extractSparqlBlocks(String(text));
  const query = blocks[blocks.length - 1];
  if (query && !rec.error) {
    rec.finalQueries = [query];
    const ex = await executeSparql(query);
    if (ex.ok) {
      rec.executable = true;
      rec.finalTables = [ex.table];
      rec.nonEmpty = ex.table.rows.length > 0;
    } else if (/fetch failed|aborted|terminated|50\d/i.test(ex.error)) {
      rec.error = `exec: ${ex.error.slice(0, 200)}`; // infrastructure: retried on resume
    }
  } else if (!rec.error && !query) {
    rec.executable = false; // agent gave no query: scored as a failure, not retried
  }
  appendFileSync(out, JSON.stringify(rec) + '\n');
  console.error(
    `[${config}] ${it.id} r${run}: ${rec.error ? 'ERROR ' + rec.error.slice(0, 80) : rec.executable ? (rec.nonEmpty ? 'rows' : 'empty') : 'no/invalid query'}` +
      ` turns=${rec.turns ?? '?'} · $${rec.costUsd.toFixed(4)} · total $${spent.toFixed(3)}`
  );
});
console.error(`Done. Spent $${spent.toFixed(3)} total for ${out}`);
if (provider === 'openrouter')
  console.error(
    `OpenRouter key usage during this run: $${((await keyUsage()) - usageBefore).toFixed(4)} (includes any concurrent use of the key)`
  );
