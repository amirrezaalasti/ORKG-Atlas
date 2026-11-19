import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { OrkgTemplate } from '../orkg/orkgClient.js';
import type { SparqlSchemaPromptResult } from '../sparqlPromptService.js';
import {
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
} from '../../../../shared/promptGenerator.js';
import { getCanonicalSparqlExamples } from '../../config/templateSparqlQueries.js';
import { buildTemplateScopeBanner } from '../sparqlTemplateValidation.js';
import {
  EXTERNAL_MCP_LIMITS,
  PUBLIC_SPARQL_LIMITS,
  SPARQL_LIMITS,
} from '../../config/mcp.js';

vi.mock('../../config/firebase.js', () => ({ db: {} }));
vi.mock('../atlasTemplateStatsService.js', () => ({
  fetchAtlasTemplateStats: vi.fn(),
}));
vi.mock('../orkgTemplatesService.js', () => ({ listOrkgTemplates: vi.fn() }));
vi.mock('../orkgAskService.js', () => ({
  orkgAskService: {
    generate: vi.fn(),
    synthesizeAbstracts: vi.fn(),
    semanticSearch: vi.fn(),
  },
  extractOrkgAskGenerateText: vi.fn(),
}));
vi.mock('../orkg/orkgClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orkg/orkgClient.js')>()),
  orkgRest: { getTemplate: vi.fn(), getStatements: vi.fn() },
  sparqlQuery: vi.fn(),
}));

let registry: typeof import('./registry.js');
let policy: typeof import('./externalToolPolicy.js');
let client: typeof import('../orkg/orkgClient.js');
let flow: typeof import('../orkg/templateFlow.js');
let ask: typeof import('../orkgAskService.js');
let root: OrkgTemplate;

beforeAll(async () => {
  vi.resetModules();
  registry = await import('./registry.js');
  policy = await import('./externalToolPolicy.js');
  client = await import('../orkg/orkgClient.js');
  flow = await import('../orkg/templateFlow.js');
  ask = await import('../orkgAskService.js');
  await import('./tools.js');
});

beforeEach(() => {
  vi.resetAllMocks();
  root = {
    id: 'R1',
    label: 'Test template',
    target_class: { id: 'C1' },
    properties: [{ path: { id: 'P1', label: 'Metric' } }],
  };
  vi.mocked(client.orkgRest.getTemplate).mockImplementation(async () => root);
  vi.mocked(client.orkgRest.getStatements).mockResolvedValue({ content: [] });
  vi.mocked(client.sparqlQuery).mockResolvedValue({
    results: { bindings: [{ x: { value: 'urn:instance' } }] },
  });
});

afterEach(() => {
  expect(ask.orkgAskService.generate).not.toHaveBeenCalled();
  expect(ask.orkgAskService.synthesizeAbstracts).not.toHaveBeenCalled();
  expect(ask.orkgAskService.semanticSearch).not.toHaveBeenCalled();
});

async function externalGuidance() {
  const result = await policy.callExternalTool(
    'orkg_sparql_schema',
    { templateId: 'R1', researchQuestion: 'How many papers?' },
    {}
  );
  if (!result.ok) throw new Error(result.error);
  expect(result.render).toBe('text');
  expect(client.sparqlQuery).not.toHaveBeenCalled();
  return result.data as SparqlSchemaPromptResult;
}

describe('external schema guidance with real template and mapping services', () => {
  it('uses the known target class, mapping and central limits without unrestricted retrieval instructions', async () => {
    const data = await externalGuidance();
    expect(data).toMatchObject({
      templateId: 'R1',
      targetClassId: 'C1',
      predicateCount: 1,
    });
    expect(data.warnings?.join(' ')).toContain(
      'Live SPARQL paper-link discovery is disabled'
    );
    expect(data.sparqlPrompt).toContain(
      'No verified paper-to-template pattern is available.'
    );
    expect(data.sparqlPrompt).toContain('"predicateId":"P1"');
    expect(data.sparqlPrompt).toContain('How many papers?');
    for (const text of [
      String(SPARQL_LIMITS.maxOutputRows),
      String(PUBLIC_SPARQL_LIMITS.maxQueryBytes),
      String(EXTERNAL_MCP_LIMITS.sparqlTimeoutMs),
      String(EXTERNAL_MCP_LIMITS.schemaTimeoutMs),
      'data.total',
      'meta.rdfBindings',
      'truncation',
    ]) {
      expect(data.sparqlPrompt).toContain(text);
    }
    expect(data.sparqlPrompt).not.toMatch(
      /DO NOT use LIMIT|return ALL rows|processing function|C27001/i
    );
  });

  it('returns a sanitized error for an unknown template', async () => {
    vi.mocked(client.orkgRest.getTemplate).mockRejectedValue(
      new client.OrkgUpstreamError(
        'https://private.example/secret',
        404,
        'private body'
      )
    );
    const result = await policy.callExternalTool(
      'orkg_sparql_schema',
      { templateId: 'R404' },
      {}
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('templateId'),
      details: { code: 'SPARQL_SCHEMA_UNAVAILABLE' },
    });
    expect(JSON.stringify(result)).not.toMatch(/private|https:|stack/);
    expect(client.sparqlQuery).not.toHaveBeenCalled();
  });

  it.each([undefined, '', { id: '' }])(
    'does not invent a missing target class: %j',
    async (target_class) => {
      root.target_class = target_class;
      const data = await externalGuidance();
      expect(data.targetClassId).toBeUndefined();
      expect(data.warnings).toContain(
        'Target class could not be established. Do not invent a class or generate a template-scoped query until it is resolved.'
      );
      expect(data.sparqlPrompt).not.toContain('C27001');
      expect(data.sparqlPrompt).not.toContain('?contribution a orkgc:');
      expect(client.sparqlQuery).not.toHaveBeenCalled();
    }
  );

  it('reports absent properties and predicate IDs', async () => {
    root.properties = [];
    expect((await externalGuidance()).warnings?.join(' ')).toContain(
      'No properties'
    );
    root.properties = [{}];
    expect((await externalGuidance()).warnings?.join(' ')).toContain(
      'no predicate ID'
    );
  });

  it.each(['lookup failure', 'child failure', 'no matching subtemplate'])(
    'reports incomplete hierarchy: %s',
    async (failure) => {
      root.properties![0].class = { id: 'C2' };
      if (failure === 'lookup failure')
        vi.mocked(client.orkgRest.getStatements).mockRejectedValue(
          new Error('private upstream error')
        );
      if (failure === 'child failure') {
        vi.mocked(client.orkgRest.getStatements).mockResolvedValue({
          content: [{ subject: { id: 'R2', classes: ['NodeShape'] } }],
        } as Awaited<ReturnType<typeof client.orkgRest.getStatements>>);
        vi.mocked(client.orkgRest.getTemplate).mockImplementation(
          async (id) => {
            if (id === 'R2') throw new Error('private upstream error');
            return root;
          }
        );
      }
      const data = await externalGuidance();
      expect(data.targetClassId).toBe('C1');
      expect(data.warnings?.length).toBeGreaterThan(0);
      expect(data.sparqlPrompt).toContain(data.warnings![0]);
      expect(data.sparqlPrompt).not.toContain('private upstream error');
      if (failure === 'child failure')
        await expect(flow.loadTemplateFlow('R1')).rejects.toThrow(
          'private upstream error'
        );
    }
  );

  it('includes loaded child relationships and reports ambiguous/truncated lookups', async () => {
    root.properties![0].class = { id: 'C2' };
    vi.mocked(client.orkgRest.getStatements).mockResolvedValue({
      totalElements: 3,
      content: ['R2', 'R3'].map((id) => ({
        subject: { id, classes: ['NodeShape'] },
      })),
    } as Awaited<ReturnType<typeof client.orkgRest.getStatements>>);
    vi.mocked(client.orkgRest.getTemplate).mockImplementation(async (id) =>
      id === 'R1'
        ? root
        : {
            id,
            label: 'Child',
            target_class: 'C2',
            properties: [{ path: { id: 'P2' } }],
          }
    );
    const data = await externalGuidance();
    expect(data.sparqlPrompt).toContain('"subtemplate_id":"R2"');
    expect(data.sparqlPrompt).toContain('"predicateId":"P2"');
    expect(data.warnings?.join(' ')).toMatch(/truncated/);
    expect(data.warnings?.join(' ')).toMatch(/Multiple subtemplates/);
  });

  it('does not assume a direct link when discovery finds none', async () => {
    vi.mocked(client.sparqlQuery).mockResolvedValue({
      results: { bindings: [] },
    });
    const data = await externalGuidance();
    expect(data.warnings?.join(' ')).toContain(
      'Paper-to-template path could not be established'
    );
    expect(data.sparqlPrompt).not.toContain('?paper orkgp:P31 ?contribution');
  });

  it('does not start nested paper-link discovery for external guidance', async () => {
    vi.mocked(client.sparqlQuery)
      .mockResolvedValueOnce({ results: { bindings: [] } })
      .mockResolvedValueOnce({
        results: {
          bindings: [{ p1: { value: 'http://orkg.org/orkg/predicate/P2' } }],
        },
      });
    const data = await externalGuidance();
    expect(data.sparqlPrompt).not.toContain(
      '?paperContribution orkgp:P2 ?contribution'
    );
    expect(data.sparqlPrompt).not.toContain('?paper orkgp:P31 ?contribution');
  });

  it.each([true, false])(
    'preserves the exact internal prompt path, including its existing fallback (missing class: %s)',
    async (missing) => {
      if (missing) root.target_class = undefined;
      const loaded = await flow.loadTemplateFlow('R1');
      expect(loaded).not.toHaveProperty('warnings');
      const expected = (
        buildTemplateScopeBanner({
          templateId: 'R1',
          targetClassId: loaded.targetClassId,
          templateLabel: root.label,
          paperLinkPath: missing ? null : [],
        }) +
        generateDynamicSPARQLPrompt(
          generateTemplateMapping(loaded.templates),
          'R1',
          root.label,
          loaded.targetClassId,
          missing ? null : []
        ) +
        getCanonicalSparqlExamples('R1', loaded.targetClassId)
      ).replace('[Research Question]', 'Question');
      const result = await registry.toolRegistry.call(
        'orkg_sparql_schema',
        {
          templateId: 'R1',
          researchQuestion: 'Question',
          externalMcp: true,
          isAdmin: true,
        },
        {}
      );
      if (!result.ok) throw new Error(result.error);
      const data = result.data as SparqlSchemaPromptResult;
      expect(data.sparqlPrompt).toBe(expected);
      expect(data).not.toHaveProperty('warnings');
    }
  );

  it('forces external context without granting administrator privileges from arguments', async () => {
    const ctx = { externalMcp: false, isAdmin: false };
    const result = await policy.callExternalTool(
      'orkg_sparql_schema',
      { templateId: 'R1', externalMcp: false, isAdmin: true },
      ctx
    );
    expect(result).toMatchObject({
      ok: true,
      data: { sparqlPrompt: expect.stringContaining('# External ORKG') },
    });
    expect(ctx).toEqual({ externalMcp: false, isAdmin: false });
    const handler = vi.fn();
    const definition = registry.toolRegistry.get('orkg_get_resource')!;
    const original = {
      adminOnly: definition.adminOnly,
      handler: definition.handler,
    };
    definition.adminOnly = true;
    definition.handler = handler;
    try {
      expect(
        await policy.callExternalTool(
          'orkg_get_resource',
          { id: 'R1', isAdmin: true },
          {}
        )
      ).toMatchObject({ ok: false, error: expect.stringContaining('admin') });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      Object.assign(definition, original);
    }
  });
});
