import { closeSync, existsSync, openSync, readFileSync, readSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface RunScore {
  config: string;
  exact: number;
  f1: number;
}

export interface ConfigScore {
  config: string;
  runs: number;
  exactRate: number;
  meanF1: number;
}

export const CONFIG_ORDER = [
  'full',
  'profiled',
  'profiled-route',
  'profiled-usage',
  'profiled-oracle-routes',
  'matched-json',
  'matched-shacl',
  'no-schema',
  'raw-schema',
  'schema-dump',
  'shacl-shapes',
  'react-explore',
  'no-nesting',
  'no-link',
  'no-validator',
  'no-repair',
  'no-guidance',
  'validator-only',
  'repair-empty',
  'claude-code',
  'cursor-agent',
];

const PREFERRED_MODEL = 'deepseek-v4-flash';

interface DatasetSpec {
  id: string;
  label: string;
  blurb: string;
  questions: string;
  gold: string;
  summary: string;
  dump: string | null;
}

const DATASETS: DatasetSpec[] = [
  {
    id: 'sampled',
    label: 'Sampled',
    blurb: 'Questions over 40 templates drawn from the ORKG catalogue.',
    questions: 'sampled-cqs.json',
    gold: 'gold-results-sampled.json',
    summary: 'sampled-strict.json',
    dump: 'sampled-strict-dump.json',
  },
  {
    id: 'curated',
    label: 'Curated',
    blurb:
      'Hand-written questions for the Empirical Research Practice and NLP4RE dashboards.',
    questions: 'curated-cqs.json',
    gold: 'gold-results-curated.json',
    summary: 'curated-strict.json',
    dump: 'curated-strict-dump.json',
  },
  {
    id: 'ood',
    label: 'Out of domain',
    blurb: 'Questions on templates Atlas was not given guidance for.',
    questions: 'ood-cqs.json',
    gold: 'gold-results-ood.json',
    summary: 'ood-strict.json',
    dump: 'ood-strict-dump.json',
  },
  {
    id: 'stress',
    label: 'Stress',
    blurb: 'Harder route, mismatch, and unused-field questions.',
    questions: 'stress-cqs.json',
    gold: 'gold-results-stress.json',
    summary: 'stress-strict.json',
    dump: 'stress-strict-dump.json',
  },
  {
    id: 'empty',
    label: 'Empty answers',
    blurb: 'Questions whose correct answer is an empty table or a zero count.',
    questions: 'empty-cqs.json',
    gold: 'gold-results-empty.json',
    summary: 'empty.json',
    dump: null,
  },
];

interface CqFile {
  source?: string;
  count?: number;
  items: CqItem[];
}

interface CqItem {
  id: string;
  question: string;
  title?: string;
  templateId?: string;
  templateTitle?: string;
  field?: string;
  kind?: string;
  stress?: string;
  expectEmpty?: boolean;
  goldQueries?: string[];
}

interface GoldFile {
  frozenAt?: string;
  endpoint?: string;
  items: GoldItem[];
}

interface GoldItem {
  id: string;
  results?: GoldResult[];
}

interface GoldResult {
  ok?: boolean;
  vars?: string[];
  rows?: Record<string, string>[];
  error?: string;
}

interface SummaryRow {
  label?: string;
  model: string;
  config: string;
  n: number;
  exactRate: number;
  f1: number;
}

interface ExactRow {
  set: string;
  model: string;
  config: string;
  questions: number;
  exact: number;
  f1: number;
}

interface DumpRow {
  model: string;
  config: string;
  item: string;
  exact: number;
  f1: number;
}

export interface DatasetCard {
  id: string;
  label: string;
  blurb: string;
  questionCount: number;
  frozenAt: string | null;
  headlineModel: string | null;
  headlineExact: number | null;
  headlineF1: number | null;
}

export interface QuestionSummary {
  id: string;
  question: string;
  title: string | null;
  templateId: string | null;
  templateTitle: string | null;
  field: string | null;
  kind: string | null;
  stress: string | null;
  expectEmpty: boolean;
  answerColumns: string[];
  answerRows: number;
  queryCount: number;
  exactRate: number | null;
  meanF1: number | null;
}

export interface ResultRow {
  model: string;
  config: string;
  questions: number;
  exact: number;
  f1: number;
}

export interface DatasetView {
  id: string;
  label: string;
  blurb: string;
  source: string | null;
  frozenAt: string | null;
  endpoint: string | null;
  model: string;
  models: string[];
  questions: QuestionSummary[];
  results: ResultRow[];
}

export interface ItemView extends QuestionSummary {
  model: string;
  goldQueries: string[];
  queries: Array<{
    index: number;
    ok: boolean;
    columns: string[];
    rowCount: number;
    error: string | null;
  }>;
  queryIndex: number;
  offset: number;
  limit: number;
  rows: Record<string, string>[];
  scores: ConfigScore[];
}

const jsonCache = new Map<string, unknown>();
const ndjsonCache = new Map<string, DumpRow[]>();

export function configRank(config: string): number {
  const index = CONFIG_ORDER.indexOf(config);
  return index === -1 ? CONFIG_ORDER.length : index;
}

export function summarizeRuns(rows: RunScore[]): ConfigScore[] {
  const acc = new Map<string, { runs: number; exact: number; f1: number }>();
  for (const row of rows) {
    const cur = acc.get(row.config) ?? { runs: 0, exact: 0, f1: 0 };
    cur.runs += 1;
    cur.exact += Number(row.exact) === 1 ? 1 : 0;
    cur.f1 += Number(row.f1) || 0;
    acc.set(row.config, cur);
  }
  return [...acc.entries()]
    .map(([config, value]) => ({
      config,
      runs: value.runs,
      exactRate: value.runs ? value.exact / value.runs : 0,
      meanF1: value.runs ? value.f1 / value.runs : 0,
    }))
    .sort(
      (a, b) =>
        configRank(a.config) - configRank(b.config) ||
        a.config.localeCompare(b.config)
    );
}

function peekText(file: string): string | null {
  if (!existsSync(file)) return null;
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(480);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function goldMeta(spec: DatasetSpec): {
  frozenAt: string | null;
  endpoint: string | null;
} {
  const head = peekText(path.join(evalRoot(), 'data', spec.gold)) ?? '';
  return {
    frozenAt: head.match(/"frozenAt":\s*"([^"]+)"/)?.[1] ?? null,
    endpoint: head.match(/"endpoint":\s*"([^"]+)"/)?.[1] ?? null,
  };
}

function evalRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../scripts/eval'),
    path.resolve(process.cwd(), 'scripts/eval'),
    path.resolve(process.cwd(), 'backend/scripts/eval'),
  ];
  const found = candidates.find((dir) =>
    existsSync(path.join(dir, 'data', 'sampled-cqs.json'))
  );
  if (!found) {
    throw new Error('Evaluation data was not found on this server');
  }
  return found;
}

function readJson<T>(relativePath: string): T | null {
  const file = path.join(evalRoot(), relativePath);
  if (!existsSync(file)) return null;
  const hit = jsonCache.get(file);
  if (hit) return hit as T;
  const value = JSON.parse(readFileSync(file, 'utf8')) as T;
  jsonCache.set(file, value);
  return value;
}

function readDump(name: string | null): DumpRow[] {
  if (!name) return [];
  const file = path.join(evalRoot(), 'runs/summary/now', name);
  if (!existsSync(file)) return [];
  const hit = ndjsonCache.get(file);
  if (hit) return hit;
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DumpRow);
  ndjsonCache.set(file, rows);
  return rows;
}

function specOrThrow(id: string): DatasetSpec {
  const spec = DATASETS.find((item) => item.id === id);
  if (!spec) throw new Error('Unknown dataset');
  return spec;
}

export function isDatasetId(id: string): boolean {
  return DATASETS.some((item) => item.id === id);
}

function preferredModel(models: string[]): string {
  if (models.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
  return [...models].sort()[0] ?? PREFERRED_MODEL;
}

function summaryRows(spec: DatasetSpec): SummaryRow[] {
  return (
    readJson<SummaryRow[]>(`runs/summary/now/${spec.summary}`)?.filter(
      (row) => !row.label || row.label === 'all'
    ) ?? []
  );
}

function headline(rows: SummaryRow[]): {
  model: string | null;
  exact: number | null;
  f1: number | null;
} {
  const full = rows.filter((row) => row.config === 'full');
  const chosen =
    full.find((row) => row.model === PREFERRED_MODEL) ?? full[0] ?? null;
  return {
    model: chosen?.model ?? null,
    exact: chosen?.exactRate ?? null,
    f1: chosen?.f1 ?? null,
  };
}

function resultRows(spec: DatasetSpec, summaries: SummaryRow[]): ResultRow[] {
  const exact = readJson<ExactRow[]>('runs/summary/exact-table.json');
  const fromTable = (exact ?? []).filter((row) => row.set === spec.id);
  const rows =
    fromTable.length > 0
      ? fromTable.map((row) => ({
          model: row.model,
          config: row.config,
          questions: row.questions,
          exact: row.exact,
          f1: row.f1,
        }))
      : summaries.map((row) => ({
          model: row.model,
          config: row.config,
          questions: row.n,
          exact: row.exactRate,
          f1: row.f1,
        }));
  return rows.sort(
    (a, b) =>
      a.model.localeCompare(b.model) ||
      configRank(a.config) - configRank(b.config)
  );
}

function goldById(spec: DatasetSpec): Map<string, GoldItem> {
  const gold = readJson<GoldFile>(`data/${spec.gold}`);
  return new Map((gold?.items ?? []).map((item) => [item.id, item]));
}

function fullScore(
  dump: DumpRow[],
  model: string,
  itemId: string
): { exactRate: number; meanF1: number } | null {
  const rows = dump.filter(
    (row) => row.model === model && row.item === itemId && row.config === 'full'
  );
  const [score] = summarizeRuns(rows);
  return score ? { exactRate: score.exactRate, meanF1: score.meanF1 } : null;
}

function toSummary(
  item: CqItem,
  gold: GoldItem | undefined,
  score: { exactRate: number; meanF1: number } | null
): QuestionSummary {
  const results = gold?.results ?? [];
  const first = results[0];
  return {
    id: item.id,
    question: item.question,
    title: item.title ?? null,
    templateId: item.templateId ?? null,
    templateTitle: item.templateTitle ?? null,
    field: item.field?.trim() ? item.field : null,
    kind: item.kind ?? null,
    stress: item.stress ?? null,
    expectEmpty: Boolean(item.expectEmpty),
    answerColumns: first?.vars ?? [],
    answerRows: results.reduce(
      (sum, result) => sum + (result.rows?.length ?? 0),
      0
    ),
    queryCount: Math.max(item.goldQueries?.length ?? 0, results.length),
    exactRate: score?.exactRate ?? null,
    meanF1: score?.meanF1 ?? null,
  };
}

export function listDatasets(): DatasetCard[] {
  return DATASETS.map((spec) => {
    const questions = readJson<CqFile>(`data/${spec.questions}`);
    const head = headline(summaryRows(spec));
    return {
      id: spec.id,
      label: spec.label,
      blurb: spec.blurb,
      questionCount: questions?.items.length ?? questions?.count ?? 0,
      frozenAt: goldMeta(spec).frozenAt,
      headlineModel: head.model,
      headlineExact: head.exact,
      headlineF1: head.f1,
    };
  });
}

const viewCache = new Map<string, DatasetView>();

export function getDataset(id: string, requestedModel?: string): DatasetView {
  const cacheKey = `${id}:${requestedModel ?? ''}`;
  const cached = viewCache.get(cacheKey);
  if (cached) return cached;

  const spec = specOrThrow(id);
  const questions = readJson<CqFile>(`data/${spec.questions}`);
  if (!questions) throw new Error(`Question file for ${id} is missing`);
  const goldFile = readJson<GoldFile>(`data/${spec.gold}`);
  const gold = new Map((goldFile?.items ?? []).map((item) => [item.id, item]));
  const summaries = summaryRows(spec);
  const dump = readDump(spec.dump);
  const models = [
    ...new Set([
      ...dump.map((row) => row.model),
      ...summaries.map((row) => row.model),
    ]),
  ].sort((a, b) => {
    if (a === PREFERRED_MODEL) return -1;
    if (b === PREFERRED_MODEL) return 1;
    return a.localeCompare(b);
  });
  if (requestedModel && !models.includes(requestedModel)) {
    throw new Error(`Unknown model: ${requestedModel}`);
  }
  const model = requestedModel || preferredModel(models);
  const view: DatasetView = {
    id: spec.id,
    label: spec.label,
    blurb: spec.blurb,
    source: questions.source ?? null,
    frozenAt: goldFile?.frozenAt ?? null,
    endpoint: goldFile?.endpoint ?? null,
    model,
    models,
    questions: questions.items.map((item) =>
      toSummary(item, gold.get(item.id), fullScore(dump, model, item.id))
    ),
    results: resultRows(spec, summaries),
  };
  viewCache.set(cacheKey, view);
  viewCache.set(`${id}:${view.model}`, view);
  return view;
}

export function getItem(
  id: string,
  itemId: string,
  requestedModel: string | undefined,
  queryIndex: number,
  offset: number,
  limit: number
): ItemView {
  const spec = specOrThrow(id);
  const questions = readJson<CqFile>(`data/${spec.questions}`);
  const item = questions?.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Unknown question');
  const view = getDataset(id, requestedModel);
  const summary = view.questions.find((entry) => entry.id === itemId);
  if (!summary) throw new Error('Unknown question');
  const gold = goldById(spec).get(itemId);
  const results = gold?.results ?? [];
  const queries = results.map((result, index) => ({
    index,
    ok: result.ok !== false,
    columns: result.vars ?? [],
    rowCount: result.rows?.length ?? 0,
    error: result.error ?? null,
  }));
  if (queries.length === 0 && (item.goldQueries?.length ?? 0) > 0) {
    item.goldQueries?.forEach((_, index) => {
      queries.push({
        index,
        ok: false,
        columns: [],
        rowCount: 0,
        error: null,
      });
    });
  }
  const safeLimit = Math.min(100, Math.max(1, limit));
  const safeOffset = Math.max(0, offset);
  const safeQuery = Math.min(
    Math.max(0, queryIndex),
    Math.max(0, queries.length - 1)
  );
  const selected = results[safeQuery];
  const rows = (selected?.rows ?? []).slice(safeOffset, safeOffset + safeLimit);
  const dump = readDump(spec.dump).filter(
    (row) => row.model === view.model && row.item === itemId
  );
  return {
    ...summary,
    model: view.model,
    goldQueries: item.goldQueries ?? [],
    queries,
    queryIndex: safeQuery,
    offset: safeOffset,
    limit: safeLimit,
    rows,
    scores: summarizeRuns(dump),
  };
}
