/**
 * Text-to-SPARQL pipeline with ablation switches, built from the production
 * resolver, prompt generator, validator, and SPARQL client (unchanged).
 *
 * Full = resolver (nested) + paper-link discovery + template guidance
 *        + validator + execution-feedback repair (k attempts in total).
 *        An executable empty result is not repaired.
 */

import {
  discoverPaperLinkPath,
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
  TEMPLATE_SPECIFIC_GUIDANCE,
} from '../../../shared/promptGenerator.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sparqlQuery } from '../../src/services/orkg/orkgClient.js';
import { loadTemplateFlow as loadTemplateFlowLive } from '../../src/services/orkg/templateFlow.js';
import { getCanonicalSparqlExamples } from '../../src/config/templateSparqlQueries.js';
import {
  buildTemplateScopeBanner,
  validateTemplateScopedSparql,
} from '../../src/services/sparqlTemplateValidation.js';
import {
  executeSparql,
  extractSparqlBlocks,
  type EvalItem,
  type ResultTable,
} from './common.js';
import { chatCompletion, type ChatMessage } from './openrouter.js';
import {
  EMPTY_RESULT_FEEDBACK,
  shouldRepair,
} from '../../../shared/repairPolicy.js';
import {
  chosenLinkPath,
  diagnoseEmptyResult,
  profileTemplates,
  renderProfileSection,
  type InstanceProfile,
} from '../../../shared/instanceProfile.js';

/**
 * Template definitions frozen to disk on first successful load (like profiles), so runs
 * do not depend on the ORKG REST API and every configuration sees the same definitions.
 */
const FROZEN_FLOWS = join(
  dirname(fileURLToPath(import.meta.url)),
  'data',
  'template-flows-frozen.json'
);
type Flow = Awaited<ReturnType<typeof loadTemplateFlowLive>>;
let frozenFlows: Record<string, Flow> | null = null;
const flowInflight = new Map<string, Promise<Flow>>();
export const loadTemplateFlow = (templateId: string): Promise<Flow> => {
  frozenFlows ??= existsSync(FROZEN_FLOWS)
    ? JSON.parse(readFileSync(FROZEN_FLOWS, 'utf8'))
    : {};
  const hit = frozenFlows![templateId];
  if (hit) return Promise.resolve(hit);
  let p = flowInflight.get(templateId);
  if (!p) {
    p = loadTemplateFlowLive(templateId).then((flow) => {
      const all = existsSync(FROZEN_FLOWS)
        ? JSON.parse(readFileSync(FROZEN_FLOWS, 'utf8'))
        : {};
      all[templateId] = flow;
      writeFileSync(FROZEN_FLOWS, JSON.stringify(all));
      frozenFlows![templateId] = flow;
      return flow;
    });
    p.catch(() => flowInflight.delete(templateId));
    flowInflight.set(templateId, p);
  }
  return p;
};

export type EvalConfig = {
  name: string;
  schema: boolean;
  nesting: boolean;
  link: boolean;
  guidance: boolean;
  validator: boolean;
  attempts: number;
  /** Schema-aware baseline: raw template definitions + plain prompt, no resolver context. */
  rawSchema?: boolean;
  /** Add the paper link pattern and the output convention Full uses to rawSchema. */
  rawFormat?: boolean;
  /** Pre-change policy: an executable empty result is sent back for repair. */
  repairEmpty?: boolean;
  /** Instance profiling: frequency-based paper-to-instance route (replaces the existence probe). */
  profileRoute?: boolean;
  /** Instance profiling: declared-vs-used predicate counts per reachable class in the prompt. */
  profileUsage?: boolean;
  /** Comparator: reachable templates as SHACL shapes (Turtle) + the conventions of schema-dump. */
  shacl?: boolean;
  /** Comparator: ReAct-style agent that explores the graph with SPARQL, given only the target class. */
  explore?: boolean;
  /** Validator target class for configs without a schema (validator-only test). */
  validatorOnly?: boolean /** Matched comparator: Full's prompt with the predicate map replaced by the same definitions as JSON or SHACL. */;
  schemaForm?: 'json' | 'shacl';
  /** Oracle: Profiled plus every paper-to-instance route observed in the dump, as a UNION block. */
  oracleRoutes?: boolean;
};

const FULL: EvalConfig = {
  name: 'full',
  schema: true,
  nesting: true,
  link: true,
  guidance: true,
  validator: true,
  attempts: 3,
};

export const CONFIGS: Record<string, EvalConfig> = {
  full: FULL,
  'no-nesting': { ...FULL, name: 'no-nesting', nesting: false },
  'no-link': { ...FULL, name: 'no-link', link: false },
  'no-validator': { ...FULL, name: 'no-validator', validator: false },
  'no-repair': { ...FULL, name: 'no-repair', attempts: 1 },
  'no-guidance': { ...FULL, name: 'no-guidance', guidance: false },
  'repair-empty': { ...FULL, name: 'repair-empty', repairEmpty: true },
  'raw-schema': {
    name: 'raw-schema',
    schema: false,
    nesting: true,
    link: false,
    guidance: false,
    validator: false,
    attempts: 3,
    rawSchema: true,
  },
  'schema-dump': {
    name: 'schema-dump',
    schema: false,
    nesting: true,
    link: false,
    guidance: false,
    validator: false,
    attempts: 3,
    rawSchema: true,
    rawFormat: true,
  },
  profiled: {
    ...FULL,
    name: 'profiled',
    profileRoute: true,
    profileUsage: true,
  },
  'profiled-route': { ...FULL, name: 'profiled-route', profileRoute: true },
  'profiled-usage': { ...FULL, name: 'profiled-usage', profileUsage: true },
  'matched-json': { ...FULL, name: 'matched-json', schemaForm: 'json' },
  'matched-shacl': { ...FULL, name: 'matched-shacl', schemaForm: 'shacl' },
  'profiled-oracle-routes': {
    ...FULL,
    name: 'profiled-oracle-routes',
    profileRoute: true,
    profileUsage: true,
    oracleRoutes: true,
  },
  'shacl-shapes': {
    name: 'shacl-shapes',
    schema: false,
    nesting: true,
    link: false,
    guidance: false,
    validator: false,
    attempts: 3,
    shacl: true,
  },
  'react-explore': {
    name: 'react-explore',
    schema: false,
    nesting: false,
    link: false,
    guidance: false,
    validator: false,
    attempts: 3,
    explore: true,
  },
  'validator-only': {
    name: 'validator-only',
    schema: false,
    nesting: false,
    link: false,
    guidance: false,
    validator: true,
    attempts: 3,
    validatorOnly: true,
  },
  'no-schema': {
    name: 'no-schema',
    schema: false,
    nesting: false,
    link: false,
    guidance: false,
    validator: false,
    attempts: 1,
  },
};

const NO_SCHEMA_PROMPT = `You write SPARQL queries for the Open Research Knowledge Graph (ORKG) triplestore.
Available prefixes:
PREFIX orkgr: <http://orkg.org/orkg/resource/>
PREFIX orkgc: <http://orkg.org/orkg/class/>
PREFIX orkgp: <http://orkg.org/orkg/predicate/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

Write a SPARQL SELECT query that retrieves the data needed to answer the research question.
Output ONLY the query in a \`\`\`sparql code block.`;

const OLD_EMPTY_FEEDBACK =
  'The query executed but returned no rows. Check the predicate paths against the schema and revise the query.';

/**
 * The same template definitions the resolver consumes (root + every reachable
 * sub-template), as compact JSON, with a plain instruction. No scope banner,
 * predicate-map rendering, link path, endpoint rules, examples, or guidance.
 */
const RAW_FORMAT = `
Papers link to their contributions with orkgp:P31 (?paper orkgp:P31 ?contribution).
Return the rows needed to answer the question, one row per paper and answer value: always select
?paper and ?paperLabel together with the answer columns, return human-readable labels
(rdfs:label) rather than resource IDs, and do not aggregate (counting is done afterwards).`;

type FlowTemplates = Awaited<ReturnType<typeof loadTemplateFlow>>['templates'];

/** The reachable template definitions as compact JSON (raw-schema, schema-dump, matched-json). */
const templateDefsJson = (templates: FlowTemplates): string =>
  JSON.stringify(
    templates.map((t) => ({
      id: t.id,
      label: t.label,
      target_class: t.target_class?.id,
      properties: (t.properties ?? []).map((p) => ({
        path: p.path?.id,
        label: p.path?.label || p.label,
        class: p.class?.id,
        datatype: (p as { datatype?: { id?: string } }).datatype?.id,
        min_count: p.min_count,
        max_count: p.max_count,
      })),
    }))
  );

/** The reachable template definitions as SHACL node shapes in Turtle (shacl-shapes, matched-shacl). */
const templateShapesTurtle = (templates: FlowTemplates): string => {
  const esc = (x?: string | null) => JSON.stringify(x ?? '');
  return templates
    .map((t) => {
      const props = (t.properties ?? [])
        .filter((p) => p.path?.id)
        .map((p) => {
          const parts = [
            `sh:path orkgp:${p.path!.id}`,
            `sh:name ${esc(p.path!.label || p.label)}`,
          ];
          if (p.class?.id) parts.push(`sh:class orkgc:${p.class.id}`);
          const dt = (p as { datatype?: { id?: string } }).datatype?.id;
          if (dt) parts.push(`sh:datatype ${esc(dt)}`);
          if (p.min_count != null) parts.push(`sh:minCount ${p.min_count}`);
          if (p.max_count != null) parts.push(`sh:maxCount ${p.max_count}`);
          return `  sh:property [ ${parts.join(' ; ')} ]`;
        });
      return [
        `orkgr:${t.id} a sh:NodeShape ;`,
        `  rdfs:label ${esc(t.label)} ;`,
        `  sh:targetClass orkgc:${t.target_class?.id} ${props.length ? ';' : '.'}`,
        props.join(' ;\n') + (props.length ? ' .' : ''),
      ].join('\n');
    })
    .join('\n\n');
};

/** Schema section for the matched comparators: same definitions, different form, same surrounding prompt. */
const matchedSchemaSection = (
  templates: FlowTemplates,
  form: 'json' | 'shacl'
): string =>
  form === 'json'
    ? `\n\n#### Template Definitions\n\nThe definitions of this template and of every template reachable from it, as returned by the ORKG template API (property paths are ORKG predicate IDs, classes are ORKG class IDs):\n\n${templateDefsJson(templates)}\n`
    : `\n\n#### Template Shapes\n\nThis template and every template reachable from it as SHACL node shapes (sh:class links a property to another shape's target class):\n\n\`\`\`turtle\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n${templateShapesTurtle(templates)}\n\`\`\`\n`;

const buildRawSchemaPrompt = async (
  templateId: string,
  format = false
): Promise<string> => {
  const { templates, targetClassId } = await loadTemplateFlow(templateId);
  return `${NO_SCHEMA_PROMPT}

The question is about ORKG template ${templateId} (target class ${targetClassId}). Below are the
definitions of this template and of every template reachable from it, as returned by the ORKG
template API (property paths are ORKG predicate IDs, classes are ORKG class IDs):
${templateDefsJson(templates)}${format ? `\n${RAW_FORMAT}` : ''}`;
};

/**
 * Comparator in the style of shape-grounded prompting (TEXT2SPARQL'25): the
 * reachable template definitions serialised as SHACL node shapes in Turtle,
 * plus the same paper-link and output conventions schema-dump states.
 */
const buildShaclPrompt = async (templateId: string): Promise<string> => {
  const { templates, targetClassId } = await loadTemplateFlow(templateId);
  const shapes = templateShapesTurtle(templates);
  return `${NO_SCHEMA_PROMPT}

The question is about instances of the SHACL node shape orkgr:${templateId} (target class orkgc:${targetClassId}).
The shapes graph below describes these instances and every shape reachable from them (sh:class links a property to another shape's target class):
\`\`\`turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
${shapes}
\`\`\`
${RAW_FORMAT}`;
};

const EXPLORE_PROMPT = (
  templateId: string,
  targetClassId: string
) => `${NO_SCHEMA_PROMPT.replace(
  'Write a SPARQL SELECT query that retrieves the data needed to answer the research question.\nOutput ONLY the query in a \`\`\`sparql code block.',
  ''
)}
The question is about instances of the ORKG class orkgc:${targetClassId} (described by template orkgr:${templateId}).
You do not know the schema. Explore the graph step by step with small SPARQL queries (e.g. which predicates instances use, their labels, sample values, how papers reach instances), then write the final query.
${RAW_FORMAT}

Each turn, reply with exactly one of:
EXPLORE
\`\`\`sparql
<an exploratory query; at most 20 rows are shown to you>
\`\`\`
or
FINAL
\`\`\`sparql
<the query that answers the question>
\`\`\`
You have at most ${EXPLORE_STEPS} exploration steps.`;
const EXPLORE_STEPS = 8;

const shaclPromptCache = new Map<string, Promise<string>>();

const rawPromptCache = new Map<string, Promise<string>>();

type TemplateContext = {
  targetClassId?: string;
  basePrompt: string;
  paperLinkPath?: string[][] | null;
};

const profileCache = new Map<string, Promise<InstanceProfile>>();
/** Profiles are frozen to disk on first use, like gold results, so every run sees the same profile. */
const FROZEN_PROFILES =
  process.env.ATLAS_FROZEN_PROFILES ??
  join(dirname(fileURLToPath(import.meta.url)), 'data', 'profiles-frozen.json');
const readFrozen = (): Record<string, InstanceProfile> =>
  existsSync(FROZEN_PROFILES)
    ? JSON.parse(readFileSync(FROZEN_PROFILES, 'utf8'))
    : {};
const profileRows = async (query: string) => {
  const res = await sparqlQuery(query, { timeoutMs: 120_000 });
  return (res.results?.bindings ?? []).map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
  );
};
/** Instance profile of a template (root + reachable classes), cached per template. */
export const instanceProfile = (
  templateId: string
): Promise<InstanceProfile> => {
  let p = profileCache.get(templateId);
  if (!p) {
    p = (async () => {
      const frozen = readFrozen()[templateId];
      if (frozen) return frozen;
      const { templates, targetClassId } = await loadTemplateFlow(templateId);
      const prof = await withRetry(
        () => profileTemplates(templates, targetClassId ?? '', profileRows),
        3
      );
      if (!prof.incomplete) {
        const all = readFrozen();
        all[templateId] = {
          ...prof,
          frozenAt: new Date().toISOString(),
        } as InstanceProfile;
        writeFileSync(FROZEN_PROFILES, JSON.stringify(all));
      }
      return prof;
    })();
    p.catch(() => profileCache.delete(templateId));
    profileCache.set(templateId, p);
  }
  return p;
};

const promptCache = new Map<string, Promise<TemplateContext>>();

/** Oracle routes: every paper-to-instance route observed in the dump (the routes gold queries union over). */
let dumpRoutes: Record<
  string,
  {
    target_class: string;
    n_attached: number;
    routes: { depth: number; route: string[]; n: number }[];
  }
> | null = null;
const oracleRouteSection = (templateId: string): string => {
  dumpRoutes ??= JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'data',
        'catalogue-profile-dump.json'
      ),
      'utf8'
    )
  ).templates;
  const p = dumpRoutes![templateId];
  const routes = (p?.routes ?? []).filter((r) => r.n > 0).slice(0, 12);
  if (!p || routes.length === 0) return '';
  const pred = (x: string) => `<http://orkg.org/orkg/predicate/${x}>`;
  const parts = routes.map((r) =>
    r.depth === 0
      ? '{ ?paper orkgp:P31 ?contribution . }'
      : r.depth === 1
        ? `{ ?paper orkgp:P31 ?k . ?k ${pred(r.route[0])} ?contribution . }`
        : `{ ?paper orkgp:P31 ?k . ?k ${pred(r.route[0])} ?m . ?m ${pred(r.route[1])} ?contribution . }`
  );
  return `
## All Observed Paper-to-Instance Routes
A full scan of the data found ${p.n_attached} instances of orkgc:${p.target_class} attached to papers, along the routes below. To reach all of them, use this UNION block in place of the single paper-to-instance path given above:
\`\`\`sparql
${parts.join('\nUNION ')}
?contribution a orkgc:${p.target_class} .
\`\`\`
`;
};

const runSparqlRows = async (query: string) => {
  const res = await sparqlQuery(query);
  return (res.results?.bindings ?? []).map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
  );
};

/** Mirrors buildSparqlSchemaPrompt, with each component switchable. */
const buildTemplatePrompt = async (
  templateId: string,
  cfg: EvalConfig
): Promise<TemplateContext> => {
  const { templates, targetClassId } = await loadTemplateFlow(templateId);
  const root = templates.find((t) => t.id === templateId) ?? templates[0];
  const mapping = generateTemplateMapping(cfg.nesting ? templates : [root]);
  const profile =
    (cfg.profileRoute || cfg.profileUsage) && targetClassId
      ? await instanceProfile(templateId)
      : null;
  const paperLinkPath =
    cfg.profileRoute && profile?.attachment
      ? chosenLinkPath(profile)
      : cfg.link && targetClassId
        ? await discoverPaperLinkPath(targetClassId, runSparqlRows)
        : null;

  const savedGuidance = TEMPLATE_SPECIFIC_GUIDANCE[templateId];
  if (!cfg.guidance) delete TEMPLATE_SPECIFIC_GUIDANCE[templateId];
  try {
    const basePrompt =
      buildTemplateScopeBanner({
        templateId,
        targetClassId,
        templateLabel: root?.label,
        paperLinkPath,
      }) +
      generateDynamicSPARQLPrompt(
        mapping,
        templateId,
        root?.label,
        targetClassId,
        paperLinkPath,
        cfg.schemaForm
          ? matchedSchemaSection(
              cfg.nesting ? templates : [root],
              cfg.schemaForm
            )
          : undefined
      ) +
      getCanonicalSparqlExamples(templateId, targetClassId) +
      (cfg.profileUsage && profile
        ? `\n${renderProfileSection(profile)}\n`
        : '') +
      (cfg.oracleRoutes ? oracleRouteSection(templateId) : '');
    return { targetClassId, basePrompt, paperLinkPath };
  } finally {
    if (savedGuidance) TEMPLATE_SPECIFIC_GUIDANCE[templateId] = savedGuidance;
  }
};

const withRetry = async <T>(fn: () => Promise<T>, tries = 4): Promise<T> => {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 3000 * 2 ** i));
    }
  }
  throw lastErr;
};

const templateContext = (templateId: string, cfg: EvalConfig) => {
  const key = `${templateId}|${cfg.nesting}|${cfg.link}|${cfg.guidance}|${cfg.profileRoute === true}|${cfg.profileUsage === true}|${cfg.schemaForm ?? ''}|${cfg.oracleRoutes === true}`;
  let p = promptCache.get(key);
  if (!p) {
    p = withRetry(() => buildTemplatePrompt(templateId, cfg));
    // Evict failures so a transient ORKG outage does not poison later items.
    p.catch(() => promptCache.delete(key));
    promptCache.set(key, p);
  }
  return p;
};

export type AttemptLog = {
  attempt: number;
  queries: string[];
  outcome: 'ok' | 'no_query' | 'validator_reject' | 'exec_error' | 'empty';
  feedback?: string;
  rowCounts?: number[];
  finishReason?: string;
};

export type RunRecord = {
  itemId: string;
  dataset: string;
  templateId: string;
  config: string;
  model: string;
  run: number;
  finalQueries: string[];
  finalTables: ResultTable[];
  executable: boolean;
  nonEmpty: boolean;
  attempts: AttemptLog[];
  repairs: number;
  validatorRejections: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** Profile-based explanation of an empty final result (data gap vs unknown). */
  emptyDiagnosis?: { kind: string; predicates?: string[] };
  /** ReAct comparator: exploratory queries issued before the final one. */
  exploreSteps?: number;
  error?: string;
};

export const runItem = async (
  item: EvalItem,
  cfg: EvalConfig,
  model: string,
  run: number
): Promise<RunRecord> => {
  const started = Date.now();
  const record: RunRecord = {
    itemId: item.id,
    dataset: item.dataset,
    templateId: item.templateId,
    config: cfg.name,
    model,
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

  try {
    let system: string;
    let targetClassId: string | undefined;
    if (cfg.rawSchema) {
      const rawKey = `${item.templateId}|${cfg.rawFormat === true}`;
      let p = rawPromptCache.get(rawKey);
      if (!p) {
        p = withRetry(() =>
          buildRawSchemaPrompt(item.templateId, cfg.rawFormat === true)
        );
        p.catch(() => rawPromptCache.delete(rawKey));
        rawPromptCache.set(rawKey, p);
      }
      system = await p;
    } else if (cfg.shacl) {
      let p = shaclPromptCache.get(item.templateId);
      if (!p) {
        p = withRetry(() => buildShaclPrompt(item.templateId));
        p.catch(() => shaclPromptCache.delete(item.templateId));
        shaclPromptCache.set(item.templateId, p);
      }
      system = await p;
    } else if (cfg.explore) {
      targetClassId = (await withRetry(() => loadTemplateFlow(item.templateId)))
        .targetClassId;
      system = EXPLORE_PROMPT(item.templateId, targetClassId ?? '');
    } else if (cfg.schema) {
      const ctx = await templateContext(item.templateId, cfg);
      targetClassId = ctx.targetClassId;
      system = ctx.basePrompt.replace('[Research Question]', item.question);
    } else {
      system = NO_SCHEMA_PROMPT;
      if (cfg.validatorOnly)
        targetClassId = (
          await withRetry(() => loadTemplateFlow(item.templateId))
        ).targetClassId;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `Research question: ${item.question}` },
    ];

    // ReAct comparator: explore with SPARQL until the model commits to a FINAL query.
    let pending: Awaited<ReturnType<typeof chatCompletion>> | undefined;
    if (cfg.explore) {
      record.exploreSteps = 0;
      for (let step = 0; step <= EXPLORE_STEPS; step++) {
        const c = await chatCompletion(model, messages);
        record.costUsd += c.costUsd;
        record.promptTokens += c.promptTokens;
        record.completionTokens += c.completionTokens;
        const isFinal = /\bFINAL\b/.test(c.text) || !/\bEXPLORE\b/.test(c.text);
        if (isFinal) {
          pending = c;
          break;
        }
        messages.push({ role: 'assistant', content: c.text });
        record.exploreSteps++;
        const q = extractSparqlBlocks(c.text)[0];
        let obs = 'No query found in your EXPLORE step.';
        if (q) {
          const r = await executeSparql(q, 30_000);
          if (!r.ok) obs = `Error: ${r.error.slice(0, 400)}`;
          else {
            const head = r.table.vars.join('\t');
            const rows = r.table.rows
              .slice(0, 20)
              .map((row) => r.table.vars.map((v) => row[v] ?? '').join('\t'));
            obs =
              `${r.table.rows.length} rows${r.table.rows.length > 20 ? ' (first 20 shown)' : ''}:\n${[head, ...rows].join('\n')}`.slice(
                0,
                3000
              );
          }
        }
        const left = EXPLORE_STEPS - record.exploreSteps;
        messages.push({
          role: 'user',
          content: `Result:\n${obs}\n\n${left > 0 ? `${left} exploration steps left.` : 'No exploration steps left: reply with FINAL and the query now.'}`,
        });
      }
    }

    for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
      const completion = pending ?? (await chatCompletion(model, messages));
      const fresh = pending === undefined;
      pending = undefined;
      if (!fresh) {
        // cost of the FINAL turn was already added in the exploration loop
        record.costUsd -= completion.costUsd;
        record.promptTokens -= completion.promptTokens;
        record.completionTokens -= completion.completionTokens;
      }
      record.costUsd += completion.costUsd;
      record.promptTokens += completion.promptTokens;
      record.completionTokens += completion.completionTokens;
      messages.push({ role: 'assistant', content: completion.text });

      const queries = extractSparqlBlocks(completion.text);
      const log: AttemptLog = {
        attempt,
        queries,
        outcome: 'ok',
        finishReason: completion.finishReason,
      };
      record.attempts.push(log);
      record.finalQueries = queries;
      record.finalTables = [];
      record.executable = false;
      record.nonEmpty = false;

      if (queries.length === 0) {
        log.outcome = 'no_query';
        log.feedback =
          'Your answer contained no SPARQL query. Return the query in a ```sparql code block.';
      } else {
        if (cfg.validator) {
          const issues = queries
            .map((q) =>
              validateTemplateScopedSparql(q, {
                templateId: item.templateId,
                targetClassId,
              })
            )
            .filter((x): x is NonNullable<typeof x> => !!x);
          if (issues.length > 0) {
            record.validatorRejections++;
            log.outcome = 'validator_reject';
            log.feedback = `The query was rejected by the template validator: ${issues[0].message} ${issues[0].hint}`;
          }
        }
        if (log.outcome === 'ok') {
          const results = await Promise.all(
            queries.map((q) => executeSparql(q))
          );
          const firstError = results.find((r) => !r.ok);
          // An unavailable endpoint is not the model's fault: abort the run as an
          // infrastructure error (retried on resume) instead of feeding it back for repair.
          if (
            firstError &&
            !firstError.ok &&
            /failed \((50\d|429)\)|fetch failed|aborted|terminated|ECONN|ETIMEDOUT/i.test(
              firstError.error
            )
          )
            throw new Error(`infra: ${firstError.error.slice(0, 200)}`);
          if (firstError && !firstError.ok) {
            log.outcome = 'exec_error';
            log.feedback = `The SPARQL endpoint returned an error: ${firstError.error.slice(0, 500)}`;
          } else {
            const tables = results.map((r) =>
              r.ok ? r.table : { vars: [], rows: [] }
            );
            record.finalTables = tables;
            record.executable = true;
            log.rowCounts = tables.map((t) => t.rows.length);
            record.nonEmpty = tables.some((t) => t.rows.length > 0);
            if (!record.nonEmpty) {
              log.outcome = 'empty';
              log.feedback = cfg.repairEmpty
                ? OLD_EMPTY_FEEDBACK
                : EMPTY_RESULT_FEEDBACK;
            }
          }
        }
      }

      const repairSignal =
        log.outcome === 'empty'
          ? 'empty'
          : log.outcome === 'no_query'
            ? 'no_query'
            : log.outcome === 'validator_reject'
              ? 'validator'
              : log.outcome === 'exec_error'
                ? 'execution_error'
                : 'ok';
      const repair =
        shouldRepair(repairSignal) ||
        (cfg.repairEmpty === true && repairSignal === 'empty');
      if (!repair || attempt === cfg.attempts) break;
      record.repairs++;
      messages.push({
        role: 'user',
        content: log.feedback ?? 'Revise the query.',
      });
    }
    if (record.executable && !record.nonEmpty && record.finalQueries.length) {
      try {
        const prof = await instanceProfile(item.templateId);
        const d = diagnoseEmptyResult(record.finalQueries.join('\n'), prof);
        record.emptyDiagnosis = {
          kind: d.kind,
          predicates: d.kind === 'data-gap' ? d.predicates : undefined,
        };
      } catch {
        /* diagnosis is optional */
      }
    }
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err);
  }

  record.latencyMs = Date.now() - started;
  return record;
};

/** The system prompt a schema-based configuration builds for a template (for inspection; no LLM call). */
export const promptFor = async (
  templateId: string,
  cfgName: string
): Promise<string> =>
  (await templateContext(templateId, CONFIGS[cfgName])).basePrompt;
