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
import { orkgAskService } from '../orkgAskService.js';
import { fail, ok, toolRegistry } from './registry.js';

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
  name: 'orkg_sparql',
  title: 'Run SPARQL query',
  description:
    'Run a read-only SPARQL SELECT/ASK query against the ORKG triplestore. ' +
    'Standard ORKG prefixes (r:, c:, p:, rdfs:, xsd:) are auto-prepended if missing. ' +
    'Returns rows as a list of {variable: value} objects (max 1000 rows).',
  category: 'ORKG',
  schema: z.object({
    query: z.string().min(5),
    /** Maximum rows to return after running the query; serves as a guard rail. */
    rowLimit: z.number().int().positive().max(1000).optional(),
  }),
  async handler({ query, rowLimit }) {
    try {
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
    'Fetch an ORKG template (definition of a contribution’s structured properties) by ID. Useful to ground SPARQL generation in the template’s predicates and target class.',
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
      const res = await orkgRest.listTemplates({ q: query, page, size });
      const items = (res.content || []).map((t) => ({
        ...t,
        link: orkgPublicLink('template', t.id),
      }));
      return ok(
        'resources',
        { items, total: res.totalElements, page: page ?? 0 },
        {
          summary: `${items.length} templates matching “${query}”.`,
        }
      );
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
    'Run a semantic search over scientific literature via ORKG Ask. Best for open-ended literature queries that benefit from vector similarity.',
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
      const items = result.payload.items.map((i) => ({
        id: i.id,
        title: i.title,
        abstract: i.abstract,
        year: i.year,
        doi: i.doi,
        link: i.id ? `https://ask.orkg.org/item/${i.id}` : undefined,
      }));
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
  name: 'orkg_ask_synthesize',
  title: 'ORKG Ask: synthesise abstracts',
  description:
    'Synthesise a citable answer for a research question from a list of ORKG Ask item IDs (use orkg_ask_search first to get them).',
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

// ──────────────────────────────────────────────────────────────────────────────
// Atlas-internal: Statistics
// ──────────────────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'atlas_template_stats',
  title: 'Get template statistics (Atlas)',
  description:
    'Fetch precomputed Firestore statistics for a known Atlas template (e.g. R186491 EmpiRE, R1544125 NLP4RE).',
  category: 'Atlas',
  schema: z.object({
    templateId: z.string().min(2),
    statisticId: z.string().optional(),
  }),
  async handler({ templateId, statisticId }) {
    try {
      const ref = db
        .collection('Templates')
        .doc(templateId)
        .collection('Statistics');
      if (statisticId) {
        const snap = await ref.doc(statisticId).get();
        if (!snap.exists)
          return fail(`Statistic ${statisticId} not found for ${templateId}.`);
        return ok('stats', { templateId, statisticId, data: snap.data() });
      }
      const snap = await ref.get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return ok(
        'stats',
        { templateId, statistics: data },
        {
          summary: `${data.length} statistic documents for ${templateId}.`,
        }
      );
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

const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'scatter', 'area']),
  title: z.string().optional(),
  xKey: z.string(),
  yKeys: z.array(z.string()).min(1).max(10),
  data: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(2000),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  stacked: z.boolean().optional(),
});

toolRegistry.register({
  name: 'render_chart',
  title: 'Render an inline chart',
  description:
    'Produce a chart specification the chat UI renders inline using Recharts. ' +
    'Provide chart `type`, `xKey`, `yKeys`, and a `data` array of row objects. ' +
    'Use this when the user wants to visualise tabular data the LLM derives from SPARQL or Atlas tools.',
  category: 'Visualisation',
  schema: ChartSpecSchema,
  async handler(spec) {
    return ok('chart_spec', spec, {
      summary: `${spec.type} chart titled “${spec.title ?? 'Chart'}” with ${spec.data.length} rows.`,
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
  title: 'Render an inline knowledge graph',
  description:
    'Produce a node/edge graph specification the chat UI renders inline (React Flow). ' +
    'Use this when statements bundles or template structures should be visualised as a graph.',
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
