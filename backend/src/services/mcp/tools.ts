/**
 * ORKG tool implementations registered with the MCP-like registry.
 *
 * Each tool returns a ToolResultEnvelope so the chat client can pick a
 * matching inline component (resource card, paper card, chart, etc.). All
 * tools share the same `OrkgClient` and Firestore admin clients used by the
 * rest of the backend.
 */

import { z } from 'zod';
import { db } from '../../config/firebase.js';
import {
  orkgRest,
  sparqlQuery,
  orkgPublicLink,
  type OrkgPaper,
  type OrkgResource,
  type OrkgComparison,
  type OrkgStatement,
  type OrkgTemplate,
} from '../orkg/orkgClient.js';
import {
  orkgAskService,
  extractOrkgAskGenerateText,
  type OrkgPaperForDisplay,
} from '../orkgAskService.js';
import { fail, ok, toolRegistry } from './registry.js';
import { buildSparqlSchemaPrompt } from '../sparqlPromptService.js';
import { fetchAtlasTemplateStats } from '../atlasTemplateStatsService.js';
import { listOrkgTemplates } from '../orkgTemplatesService.js';
import { loadTemplateFlow } from '../orkg/templateFlow.js';
import { validateTemplateScopedSparql } from '../sparqlTemplateValidation.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const summarisePaper = (p: OrkgPaper): string => {
  const year = p.publication_info?.published_year;
  const authors = (p.authors || [])
    .map((a) => a.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return [p.title, authors && `by ${authors}`, year && `(${year})`]
    .filter(Boolean)
    .join(' ');
};

const ORKG_ASK_ITEM_URL = 'https://ask.orkg.org/item/';

const mapAskItems = (
  items: Array<{
    id: string;
    title?: string;
    abstract?: string;
    year?: number;
    doi?: string;
  }>
) =>
  items.map((i) => ({
    id: i.id,
    title: i.title,
    abstract: i.abstract,
    year: i.year,
    doi: i.doi,
    link: i.id ? `${ORKG_ASK_ITEM_URL}${i.id}` : undefined,
  }));

const statementsToGraphSpec = (
  resourceId: string,
  statements: OrkgStatement[],
  rootLabel?: string
) => {
  const seen = new Set<string>();
  const nodes: Array<{
    id: string;
    label?: string;
    kind?: 'resource' | 'literal' | 'class' | 'predicate';
  }> = [];
  const edges: Array<{
    source: string;
    target: string;
    label?: string;
    predicateId?: string;
  }> = [];

  const addNode = (
    id: string,
    label?: string,
    kind?: 'resource' | 'literal' | 'class' | 'predicate'
  ) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, label, kind });
  };

  const limit = Math.min(120, statements.length);
  for (let i = 0; i < limit; i++) {
    const s = statements[i];
    const subjKind =
      s.subject._class === 'literal'
        ? ('literal' as const)
        : ('resource' as const);
    const objKind =
      s.object._class === 'literal'
        ? ('literal' as const)
        : ('resource' as const);
    addNode(s.subject.id, s.subject.label, subjKind);
    addNode(s.object.id, s.object.label, objKind);
    edges.push({
      source: s.subject.id,
      target: s.object.id,
      label: s.predicate.label || s.predicate.id,
      predicateId: s.predicate.id,
    });
  }

  return {
    rootId: resourceId,
    rootLabel: rootLabel || resourceId,
    nodes,
    edges,
  };
};

const normaliseSparqlBindings = (
  bindings: Array<
    Record<string, { value: string; type?: string; datatype?: string }>
  >
): Array<Record<string, string>> => {
  return bindings.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v?.value ?? '';
    }
    return out;
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// SPARQL
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_sparql_schema',
  title: 'Get SPARQL schema prompt for template',
  description:
    'REQUIRED before orkg_sparql for template-scoped questions. ' +
    'Resolve templateId first (atlas_list_templates / orkg_search_templates) if the user did not give one. ' +
    'Returns sparqlPrompt with predicates, hierarchy, rules, and canonical examples. ' +
    'Returns templateId, targetClassId (contribution class), and sparqlPrompt. ' +
    'Pass researchQuestion, then write SPARQL and call orkg_sparql with the same templateId.',
  category: 'ORKG',
  schema: z.object({
    templateId: z.string().min(2),
    researchQuestion: z.string().optional(),
  }),
  async handler({ templateId, researchQuestion }) {
    try {
      const result = await buildSparqlSchemaPrompt(
        templateId,
        researchQuestion
      );
      return ok('text', result, {
        summary: `SPARQL schema for template ${result.templateLabel ?? templateId} (${result.predicateCount} predicates, class ${result.targetClassId ?? 'n/a'}).`,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_sparql',
  title: 'Run SPARQL query',
  description:
    'Run a read-only SPARQL SELECT/ASK query against the ORKG triplestore. ' +
    'Use for cross-paper analytics not covered by atlas_template_stats (trends by year, method distributions, custom filters). ' +
    'Do not use for total template paper count — use atlas_template_stats (precomputed). ' +
    'For template-scoped analytics: call orkg_sparql_schema(templateId) first, then orkg_sparql(query, templateId) with the SAME templateId so contribution class is validated. ' +
    'Prefer orkg_get_* / orkg_ask_* / orkg_build_graph when they already answer the question. ' +
    'Missing PREFIX declarations for orkgp:/orkgc:/orkgr: (or p:/c:/r:) are auto-added. ' +
    'ORDER BY: use `ORDER BY ?year` or `ORDER BY DESC(?count)` — never `?year ASC` or `?year ?count DESC`. ' +
    'Traverse template hierarchy for methods (e.g. contribution → P56008 data collection → P1005 method → P94003 method type → rdfs:label). ' +
    'Returns rows as a list of {variable: value} objects (max 1000 rows).',
  category: 'ORKG',
  schema: z.object({
    query: z.string().min(5),
    /** Same templateId as orkg_sparql_schema — validates contribution class (orkgc:C…). */
    templateId: z.string().min(2).optional(),
    /** Maximum rows to return after running the query; serves as a guard rail. */
    rowLimit: z.number().int().positive().max(1000).optional(),
  }),
  async handler({ query, templateId, rowLimit }) {
    try {
      let validationCtx;
      if (templateId) {
        const { targetClassId } = await loadTemplateFlow(templateId);
        validationCtx = { templateId, targetClassId };
      }
      const validation = validateTemplateScopedSparql(query, validationCtx);
      if (validation) {
        return fail(`${validation.message} ${validation.hint}`);
      }

      const result = await sparqlQuery(query, { readonly: true });
      const rawBindings = result.results?.bindings ?? [];
      const limited = rowLimit
        ? rawBindings.slice(0, rowLimit)
        : rawBindings.slice(0, 1000);
      const rows = normaliseSparqlBindings(limited);
      const vars = result.head?.vars ?? (rows[0] ? Object.keys(rows[0]) : []);
      return ok(
        'sparql_results',
        { vars, rows, total: rawBindings.length, query },
        {
          summary: `SPARQL returned ${rows.length} rows${rawBindings.length > rows.length ? ` (truncated from ${rawBindings.length})` : ''}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Resources
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_get_resource',
  title: 'Get ORKG resource by ID',
  description:
    'Fetch metadata for an ORKG resource (paper, problem, contribution, comparison, etc.) by its ID (e.g. R186491).',
  category: 'ORKG',
  schema: z.object({
    id: z.string().min(2),
  }),
  async handler({ id }) {
    try {
      const resource = await orkgRest.getResource(id);
      return ok(
        'resource',
        {
          ...resource,
          link: orkgPublicLink('resource', resource.id),
        },
        {
          summary: `Resource ${resource.id}: ${resource.label ?? '(no label)'}`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_search_resources',
  title: 'Search ORKG resources',
  description:
    'Free-text search across ORKG resources. Optionally filter by class names (e.g. ["Paper"]). Pagination supported.',
  category: 'ORKG',
  schema: z.object({
    query: z.string().min(1),
    classes: z.array(z.string()).optional(),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
    exact: z.boolean().optional(),
  }),
  async handler({ query, classes, page, size, exact }) {
    try {
      const res = await orkgRest.searchResources({
        q: query,
        classes,
        page,
        size,
        exact,
      });
      const items: OrkgResource[] = (res.content || []).map((r) => ({
        ...r,
        link: orkgPublicLink('resource', r.id),
      }));
      return ok(
        'resources',
        { items, total: res.totalElements, page: res.number ?? page ?? 0 },
        {
          summary: `${items.length} resources for “${query}”${res.totalElements != null ? ` of ${res.totalElements}` : ''}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Papers
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_get_paper',
  title: 'Get ORKG paper by ID',
  description:
    'Fetch a paper from ORKG with title, authors, DOI, year, and abstract.',
  category: 'ORKG',
  schema: z.object({
    id: z.string().min(2),
  }),
  async handler({ id }) {
    try {
      const paper = await orkgRest.getPaper(id);
      return ok(
        'paper',
        { ...paper, link: orkgPublicLink('paper', paper.id) },
        { summary: summarisePaper(paper) }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_search_papers',
  title: 'Search ORKG papers',
  description:
    'Search papers in ORKG by title or DOI (use either). Returns paginated paper cards including authors and year.',
  category: 'ORKG',
  schema: z.object({
    title: z.string().optional(),
    doi: z.string().optional(),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
  }),
  async handler({ title, doi, page, size }) {
    if (!title && !doi) return fail('Provide title or doi.');
    try {
      const res = await orkgRest.listPapers({ title, doi, page, size });
      const items = (res.content || []).map((p) => ({
        ...p,
        link: orkgPublicLink('paper', p.id),
      }));
      return ok(
        'papers',
        { items, total: res.totalElements, page: page ?? 0 },
        { summary: `${items.length} papers found.` }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Statements
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_get_statements_bundle',
  title: 'Get statements bundle',
  description:
    'Fetch the recursive statements bundle for an ORKG resource (typically a paper). Returns subjects, predicates, and objects suitable for graph visualisation.',
  category: 'ORKG',
  schema: z.object({
    resourceId: z.string().min(2),
    maxLevel: z.number().int().positive().max(10).optional(),
    sample: z.number().int().positive().max(500).optional(),
  }),
  async handler({ resourceId, maxLevel, sample }) {
    try {
      const bundle = await orkgRest.getStatementsBundle(resourceId, {
        maxLevel,
      });
      const allStatements = bundle.statements || [];
      const limited: OrkgStatement[] = sample
        ? allStatements.slice(0, sample)
        : allStatements.slice(0, 200);
      return ok(
        'statements',
        { resourceId, statements: limited, total: allStatements.length },
        {
          summary: `${allStatements.length} statements for ${resourceId}${limited.length < allStatements.length ? ` (showing ${limited.length})` : ''}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_get_statements_by_subject',
  title: 'List statements by subject',
  description:
    'Paginated list of direct statements (subject → predicate → object) for a resource.',
  category: 'ORKG',
  schema: z.object({
    subjectId: z.string().min(2),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
  }),
  async handler({ subjectId, page, size }) {
    try {
      const res = await orkgRest.getStatementsBySubject(subjectId, {
        page,
        size,
      });
      return ok(
        'statements',
        {
          resourceId: subjectId,
          statements: res.content || [],
          total: res.totalElements,
        },
        {
          summary: `${res.content?.length ?? 0} direct statements for ${subjectId}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Comparisons
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_get_comparison',
  title: 'Get ORKG comparison',
  description:
    'Fetch an ORKG comparison by ID, including its contributions and predicates.',
  category: 'ORKG',
  schema: z.object({ id: z.string().min(2) }),
  async handler({ id }) {
    try {
      const comp: OrkgComparison = await orkgRest.getComparison(id);
      return ok(
        'comparison',
        { ...comp, link: orkgPublicLink('comparison', comp.id) },
        { summary: comp.title ?? `Comparison ${comp.id}` }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_search_comparisons',
  title: 'Search ORKG comparisons',
  description: 'Search ORKG comparisons by title.',
  category: 'ORKG',
  schema: z.object({
    title: z.string().min(1),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
  }),
  async handler({ title, page, size }) {
    try {
      const res = await orkgRest.listComparisons({ title, page, size });
      const items = (res.content || []).map((c) => ({
        ...c,
        link: orkgPublicLink('comparison', c.id),
      }));
      return ok(
        'comparisons',
        { items, total: res.totalElements, page: page ?? 0 },
        { summary: `${items.length} comparisons matching “${title}”.` }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_get_template',
  title: 'Get ORKG template',
  description:
    'Fetch raw ORKG template JSON by ID. For SPARQL generation, prefer orkg_sparql_schema(templateId) which loads subtemplates and returns the full dynamic schema prompt.',
  category: 'ORKG',
  schema: z.object({ id: z.string().min(2) }),
  async handler({ id }) {
    try {
      const tpl: OrkgTemplate = await orkgRest.getTemplate(id);
      return ok(
        'template',
        { ...tpl, link: orkgPublicLink('template', tpl.id) },
        { summary: tpl.label ?? `Template ${tpl.id}` }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_search_templates',
  title: 'Search ORKG templates',
  description: 'Search ORKG templates by label.',
  category: 'ORKG',
  schema: z.object({
    query: z.string().min(1),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
  }),
  async handler({ query, page, size }) {
    try {
      const result = await listOrkgTemplates({ query, page, size });
      return ok('templates', result, {
        summary: `${result.items.length} templates matching “${query}”.`,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// ORKG Ask
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'orkg_ask_search',
  title: 'ORKG Ask: semantic search',
  description:
    'Run a semantic search over scientific literature via ORKG Ask. Best for open-ended literature queries that benefit from vector similarity. Returns papers with links to ask.orkg.org.',
  category: 'ORKG Ask',
  schema: z.object({
    query: z.string().min(1),
    limit: z.number().int().positive().max(50).optional(),
  }),
  async handler({ query, limit }) {
    try {
      const result = await orkgAskService.semanticSearch(query, {
        limit: limit ?? 10,
      });
      const items = mapAskItems(result.payload.items);
      return ok(
        'papers',
        { items, total: result.payload.total_hits, page: 0 },
        { summary: `${items.length} matching items via ORKG Ask.` }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_ask_search_by_paper',
  title: 'ORKG Ask: related papers for an ORKG paper',
  description:
    'Given an ORKG paper ID (e.g. R12345), fetch the paper from ORKG and find semantically related literature in ORKG Ask. ' +
    'Use when the user asks about a specific paper, wants related work, or before synthesising an answer grounded in that paper.',
  category: 'ORKG Ask',
  schema: z.object({
    paperId: z.string().min(2),
    limit: z.number().int().positive().max(30).optional(),
  }),
  async handler({ paperId, limit }) {
    try {
      const result = await orkgAskService.searchByPaper(paperId);
      const related = mapAskItems(result.payload.items.slice(0, limit ?? 10));
      const source = result.orkgPaper as OrkgPaperForDisplay | undefined;
      return ok(
        'ask_paper_related',
        {
          sourcePaper: source
            ? {
                ...source,
                link: orkgPublicLink('paper', source.id),
              }
            : { id: paperId, link: orkgPublicLink('paper', paperId) },
          relatedItems: related,
          totalHits: result.payload.total_hits,
        },
        {
          summary: source?.title
            ? `“${source.title}”: ${related.length} related papers in ORKG Ask.`
            : `${related.length} related papers for ${paperId}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_ask_synthesize',
  title: 'ORKG Ask: synthesise abstracts',
  description:
    'Synthesise a citable, literature-grounded answer for a research question from ORKG Ask item IDs. ' +
    'Obtain item IDs from orkg_ask_search or orkg_ask_search_by_paper first. Best for “what does the literature say about …?”',
  category: 'ORKG Ask',
  schema: z.object({
    question: z.string().min(3),
    itemIds: z.array(z.string()).min(1).max(20),
  }),
  async handler({ question, itemIds }) {
    try {
      const result = (await orkgAskService.synthesizeAbstracts(
        question,
        itemIds
      )) as {
        payload?: { synthesis?: string };
        synthesis?: string;
      };
      const synthesis = result.payload?.synthesis ?? result.synthesis ?? '';
      return ok(
        'ask_synthesis',
        { question, itemIds, synthesis },
        {
          summary: synthesis
            ? synthesis.slice(0, 200)
            : 'No synthesis returned.',
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'orkg_ask_generate',
  title: 'ORKG Ask: answer a question',
  description:
    'Use the ORKG Ask LLM to answer a research question in natural language (e.g. explain a concept, summarise findings, interpret SPARQL results). ' +
    'Optionally pass systemContext with paper abstracts, SPARQL rows, or prior tool output. ' +
    'For literature-grounded answers with citations, prefer orkg_ask_synthesize after orkg_ask_search.',
  category: 'ORKG Ask',
  schema: z.object({
    prompt: z.string().min(3),
    systemContext: z.string().optional(),
  }),
  async handler({ prompt, systemContext }) {
    try {
      const raw = (await orkgAskService.generate(prompt, {
        system: systemContext?.trim() || undefined,
      })) as Record<string, unknown>;
      const answer = extractOrkgAskGenerateText(raw);
      if (!answer) {
        return fail(
          'ORKG Ask returned an empty response. Try again or use orkg_ask_synthesize with item IDs.'
        );
      }
      return ok(
        'ask_answer',
        { prompt, answer, systemContext: systemContext?.trim() || undefined },
        { summary: answer.slice(0, 240) }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

/** Unified ORKG Ask entry point — routes to search / paper / synthesize / generate. */
const OrkgAskUnifiedSchema = z.object({
  action: z.enum(['search', 'search_by_paper', 'synthesize', 'generate']),
  query: z.string().optional(),
  paperId: z.string().optional(),
  question: z.string().optional(),
  prompt: z.string().optional(),
  itemIds: z.array(z.string()).optional(),
  systemContext: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

toolRegistry.register({
  name: 'orkg_ask',
  title: 'ORKG Ask (unified)',
  description:
    'Single entry point for ORKG Ask. action=search needs query; search_by_paper needs paperId; ' +
    'synthesize needs question+itemIds; generate needs prompt (optional systemContext).',
  category: 'ORKG Ask',
  schema: OrkgAskUnifiedSchema,
  async handler(args) {
    switch (args.action) {
      case 'search': {
        if (!args.query?.trim()) return fail('orkg_ask search requires query.');
        const tool = toolRegistry.get('orkg_ask_search');
        if (!tool) return fail('orkg_ask_search not registered');
        return tool.handler({ query: args.query, limit: args.limit }, {});
      }
      case 'search_by_paper': {
        if (!args.paperId?.trim())
          return fail('orkg_ask search_by_paper requires paperId.');
        const tool = toolRegistry.get('orkg_ask_search_by_paper');
        if (!tool) return fail('orkg_ask_search_by_paper not registered');
        return tool.handler({ paperId: args.paperId, limit: args.limit }, {});
      }
      case 'synthesize': {
        if (!args.question?.trim())
          return fail('orkg_ask synthesize requires question.');
        if (!args.itemIds?.length)
          return fail('orkg_ask synthesize requires itemIds.');
        const tool = toolRegistry.get('orkg_ask_synthesize');
        if (!tool) return fail('orkg_ask_synthesize not registered');
        return tool.handler(
          { question: args.question, itemIds: args.itemIds },
          {}
        );
      }
      case 'generate': {
        if (!args.prompt?.trim())
          return fail('orkg_ask generate requires prompt.');
        const tool = toolRegistry.get('orkg_ask_generate');
        if (!tool) return fail('orkg_ask_generate not registered');
        return tool.handler(
          { prompt: args.prompt, systemContext: args.systemContext },
          {}
        );
      }
      default:
        return fail('Unknown orkg_ask action');
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Atlas-internal: Templates & statistics
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'atlas_list_templates',
  title: 'List ORKG templates',
  description:
    'List templates from the ORKG API (paginated catalog) merged with Atlas metadata. ' +
    'Call when you need to pick a templateId — not limited to EmpiRE/NLP4RE. ' +
    'Use optional query to filter by name; increase page/size for more results. ' +
    'Then orkg_get_template(id) or orkg_sparql_schema(id) for the chosen template.',
  category: 'Atlas',
  schema: z.object({
    query: z.string().optional(),
    page: z.number().int().nonnegative().optional(),
    size: z.number().int().positive().max(100).optional(),
  }),
  async handler({ query, page, size }) {
    try {
      const result = await listOrkgTemplates({ query, page, size });
      return ok('templates', result, {
        summary: query
          ? `${result.items.length} ORKG templates matching “${query}”${result.total != null ? ` (${result.total} total)` : ''}.`
          : `${result.items.length} ORKG templates on this page${result.total != null ? ` of ${result.total}` : ''}.`,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'atlas_template_stats',
  title: 'Get template statistics (Atlas)',
  description:
    'Only for template-level totals (paper count, venue count, statement totals). ' +
    'Only for templates with precomputed Atlas statistics in Firestore (not all ORKG templates). ' +
    'Returns precomputed Firestore stats — faster and authoritative vs ad-hoc SPARQL COUNT. ' +
    'Use for precomputed totals after you know templateId (see atlas_list_templates). ' +
    'Use for: "how many papers does [template] have?", venue counts, statement totals. ' +
    'Omit statisticId to load the default document (empire-statistics / nlp4re-statistics). ' +
    'Use SPARQL only when the question needs a breakdown not present here (e.g. by year, by method type).',
  category: 'Atlas',
  schema: z.object({
    templateId: z.string().min(2),
    statisticId: z.string().optional(),
  }),
  async handler({ templateId, statisticId }) {
    try {
      const result = await fetchAtlasTemplateStats(templateId, statisticId);
      const label = result.templateLabel ?? result.templateId;
      const summaryParts = [
        result.paperCount != null ? `${result.paperCount} papers` : null,
        result.venueCount != null ? `${result.venueCount} venues` : null,
      ].filter(Boolean);

      const sourceNote =
        result.paperCountSource &&
        result.paperCountSource !== result.statisticId
          ? ` (from ${result.paperCountSource})`
          : '';

      return ok('stats', result, {
        summary:
          summaryParts.length > 0
            ? `${label} (${result.templateId}): ${summaryParts.join(', ')}${sourceNote}.`
            : `Statistics for ${label} (${result.templateId}).`,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Atlas-internal: Dynamic questions
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'atlas_search_dynamic_questions',
  title: 'Search saved dynamic questions',
  description:
    'List Atlas dynamic questions for a template. Useful for suggesting follow-up queries that other users have already crafted.',
  category: 'Atlas',
  schema: z.object({
    templateId: z.string().optional(),
    text: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  async handler({ templateId, text, limit }) {
    try {
      let query = db.collection('DynamicQuestions') as FirebaseFirestore.Query;
      if (templateId) query = query.where('templateId', '==', templateId);
      const snap = await query.limit(limit ?? 25).get();
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (text) {
        const lc = text.toLowerCase();
        items = items.filter((i) => {
          const obj = i as Record<string, unknown>;
          const name = typeof obj.name === 'string' ? obj.name : '';
          const state = obj.state as { question?: string } | undefined;
          return (
            name.toLowerCase().includes(lc) ||
            (state?.question || '').toLowerCase().includes(lc)
          );
        });
      }
      return ok(
        'dynamic_questions',
        { items },
        {
          summary: `${items.length} dynamic questions${templateId ? ` for ${templateId}` : ''}.`,
        }
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Visualisation helper
// ──────────────────────────────────────────────────────────────────────────────

const ChartCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.record(z.unknown())),
]);

const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'scatter', 'area']),
  title: z.string().optional(),
  xKey: z.string(),
  yKeys: z.array(z.string()).min(1).max(10),
  data: z.array(z.record(ChartCellSchema)).max(2000),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  stacked: z.boolean().optional(),
});

toolRegistry.register({
  name: 'orkg_build_graph',
  title: 'Build knowledge graph from ORKG resource',
  description:
    'Fetch an ORKG statements bundle for a resource (paper, contribution, etc.) and render it as an interactive knowledge graph in the chat. ' +
    'Prefer this over manually calling render_graph when the user wants to see how a paper or resource is structured in ORKG.',
  category: 'Visualisation',
  schema: z.object({
    resourceId: z.string().min(2),
    maxLevel: z.number().int().positive().max(10).optional(),
    maxStatements: z.number().int().positive().max(200).optional(),
    rootLabel: z.string().optional(),
  }),
  async handler({ resourceId, maxLevel, maxStatements, rootLabel }) {
    try {
      const bundle = await orkgRest.getStatementsBundle(resourceId, {
        maxLevel,
      });
      const all = bundle.statements || [];
      const limited = all.slice(0, maxStatements ?? 120);
      if (limited.length === 0) {
        return fail(`No statements found for ${resourceId}.`);
      }
      const spec = statementsToGraphSpec(resourceId, limited, rootLabel);
      return ok('graph', spec, {
        summary: `Knowledge graph for ${resourceId}: ${spec.nodes.length} nodes, ${spec.edges.length} edges${all.length > limited.length ? ` (from ${all.length} statements)` : ''}.`,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
});

toolRegistry.register({
  name: 'render_chart',
  title: 'Render a scientific chart',
  description:
    'ONLY way to show charts in chat. The UI renders an interactive Recharts card from this spec — do not also paste markdown images or base64 in your text. ' +
    'Provide type (bar|line|area|pie|scatter), xKey, yKeys (numeric fields), title, optional axis labels, and data: array of row objects from SPARQL/stats. ' +
    'Use human-readable label columns for xKey (e.g. metric_label from rdfs:label), never bare R… IDs. ' +
    'Example row: { "metric_label": "F1-score", "count": 42 }. Optional itemsInGroup per row for clickable bar → papers list. ' +
    'Use after aggregated SPARQL (orkg_sparql).',
  category: 'Visualisation',
  schema: ChartSpecSchema,
  async handler(spec) {
    const normalized = {
      ...spec,
      data: spec.data.map((row) => {
        const out: Record<string, string | number | boolean | null> = {
          ...row,
        };
        for (const y of spec.yKeys) {
          const v = out[y];
          if (
            typeof v === 'string' &&
            v.trim() !== '' &&
            !Number.isNaN(Number(v))
          ) {
            out[y] = Number(v);
          }
        }
        return out;
      }),
    };
    return ok('chart_spec', normalized, {
      summary: `${spec.type} chart titled “${spec.title ?? 'Chart'}” with ${normalized.data.length} rows.`,
    });
  },
});

const GraphSpecSchema = z.object({
  rootId: z.string(),
  rootLabel: z.string().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        kind: z.enum(['resource', 'literal', 'class', 'predicate']).optional(),
      })
    )
    .max(500),
  edges: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        label: z.string().optional(),
        predicateId: z.string().optional(),
      })
    )
    .max(2000),
});

toolRegistry.register({
  name: 'render_graph',
  title: 'Render a custom knowledge graph',
  description:
    'Produce a node/edge graph specification the chat UI renders inline (React Flow). ' +
    'Use for custom RDF/ORKG visualisations when you already have explicit nodes and edges. ' +
    'For ORKG statement bundles, prefer orkg_build_graph(resourceId) instead.',
  category: 'Visualisation',
  schema: GraphSpecSchema,
  async handler(spec) {
    return ok('graph', spec, {
      summary: `Graph with ${spec.nodes.length} nodes and ${spec.edges.length} edges.`,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Tool registry sanity export
// ──────────────────────────────────────────────────────────────────────────────

export { toolRegistry };
