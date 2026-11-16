import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/firebase.js', () => ({ db: { collection: vi.fn() } }));
vi.mock('../orkg/orkgClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orkg/orkgClient.js')>()),
  orkgRest: Object.fromEntries(
    [
      'getResource',
      'searchResources',
      'getPaper',
      'listPapers',
      'getStatementsBundle',
      'getStatementsBySubject',
      'getComparison',
      'listComparisons',
      'getTemplate',
    ].map((name) => [name, vi.fn()])
  ),
}));
vi.mock('../orkgAskService.js', () => ({
  orkgAskService: {
    semanticSearch: vi.fn(),
    searchByPaper: vi.fn(),
    generate: vi.fn(),
    synthesizeAbstracts: vi.fn(),
  },
  extractOrkgAskGenerateText: vi.fn(),
}));
vi.mock('../atlasTemplateStatsService.js', () => ({
  fetchAtlasTemplateStats: vi.fn(),
}));
vi.mock('../sparqlPromptService.js', () => ({
  buildSparqlSchemaPrompt: vi.fn(),
  buildExternalSparqlSchemaPrompt: vi.fn(),
}));

let registry: typeof import('./registry.js');
let policy: typeof import('./externalToolPolicy.js');
let client: typeof import('../orkg/orkgClient.js');
let ask: typeof import('../orkgAskService.js');
let stats: typeof import('../atlasTemplateStatsService.js');
const secret =
  'https://internal.test token=SECRET raw body stack Firestore configuration';
beforeAll(async () => {
  vi.resetModules();
  registry = await import('./registry.js');
  policy = await import('./externalToolPolicy.js');
  client = await import('../orkg/orkgClient.js');
  ask = await import('../orkgAskService.js');
  stats = await import('../atlasTemplateStatsService.js');
  await import('./tools.js');
});
beforeEach(() => {
  vi.resetAllMocks();
});

it('discovers exactly the 16 registered external tools regardless of supplied privileges', () => {
  const names = [
    'atlas_list_templates',
    'orkg_build_graph',
    'orkg_get_comparison',
    'orkg_get_paper',
    'orkg_get_resource',
    'orkg_get_statements_bundle',
    'orkg_get_statements_by_subject',
    'orkg_get_template',
    'orkg_search_comparisons',
    'orkg_search_papers',
    'orkg_search_resources',
    'orkg_search_templates',
    'orkg_sparql',
    'orkg_sparql_schema',
    'render_chart',
    'render_graph',
  ];
  for (const ctx of [
    {},
    { isAdmin: true, externalMcp: false, userId: 'forged' },
  ])
    expect(policy.listExternalTools(ctx).map((tool) => tool.name)).toEqual(
      names
    );
});

const restCases = [
  ['orkg_get_resource', 'getResource', { id: 'R1' }],
  ['orkg_search_resources', 'searchResources', { query: 'test' }],
  ['orkg_get_paper', 'getPaper', { id: 'R1' }],
  ['orkg_search_papers', 'listPapers', { title: 'test' }],
  ['orkg_get_statements_bundle', 'getStatementsBundle', { resourceId: 'R1' }],
  [
    'orkg_get_statements_by_subject',
    'getStatementsBySubject',
    { subjectId: 'R1' },
  ],
  ['orkg_get_comparison', 'getComparison', { id: 'R1' }],
  ['orkg_search_comparisons', 'listComparisons', { title: 'test' }],
  ['orkg_get_template', 'getTemplate', { id: 'R1' }],
  ['orkg_build_graph', 'getStatementsBundle', { resourceId: 'R1' }],
] as const;

it.each(restCases)(
  'sanitizes external %s and preserves internal errors',
  async (name, method, args) => {
    vi.mocked(client.orkgRest[method]).mockRejectedValue(new Error(secret));
    expect(await policy.callExternalTool(name, args, {})).toEqual({
      ok: false,
      error: 'ORKG data could not be retrieved. Please retry later.',
      details: { code: 'ORKG_REST_ERROR' },
    });
    expect(vi.mocked(client.orkgRest[method]).mock.calls[0].at(-1)).toEqual({
      externalMcp: true,
    });
    expect(await registry.toolRegistry.call(name, args, {})).toEqual(
      registry.fail(secret)
    );
  }
);

it.each([
  ['orkg_ask_search', 'semanticSearch', { query: 'test' }],
  ['orkg_ask_search_by_paper', 'searchByPaper', { paperId: 'R1' }],
] as const)(
  'retains %s handler sanitization for internal registry callers using external mode',
  async (name, method, args) => {
    vi.mocked(ask.orkgAskService[method]).mockRejectedValue(new Error(secret));
    // The handler mode remains supported internally despite the external ban.
    expect(
      await registry.toolRegistry.call(name, args, { externalMcp: true })
    ).toEqual({
      ok: false,
      error: 'ORKG Ask search could not be completed. Please retry later.',
      details: { code: 'ORKG_ASK_ERROR' },
    });
    expect(
      vi.mocked(ask.orkgAskService[method]).mock.calls[0][
        method === 'searchByPaper' ? 1 : 2
      ]
    ).toEqual({
      externalMcp: true,
    });
    expect(await registry.toolRegistry.call(name, args, {})).toEqual(
      registry.fail(secret)
    );
    expect(ask.orkgAskService.generate).not.toHaveBeenCalled();
    expect(ask.orkgAskService.synthesizeAbstracts).not.toHaveBeenCalled();
  }
);

it.each([
  ['orkg_ask_search', 'semanticSearch', { query: 'test', limit: 1 }, 'items'],
  [
    'orkg_ask_search_by_paper',
    'searchByPaper',
    { paperId: 'R1', limit: 1 },
    'relatedItems',
  ],
] as const)(
  'keeps %s registered internally but rejects external access before service calls',
  async (name, method, args, itemsKey) => {
    expect(registry.toolRegistry.get(name)).toBeDefined();
    expect(policy.listExternalTools({}).map((tool) => tool.name)).not.toContain(
      name
    );
    expect(await policy.callExternalTool(name, args, {})).toEqual(
      registry.fail(`Tool ${name} is not available for external MCP access`)
    );
    expect(ask.orkgAskService[method]).not.toHaveBeenCalled();

    vi.mocked(ask.orkgAskService[method]).mockResolvedValue({
      uuid: 'test',
      timestamp: 'test',
      payload: {
        items: [{ id: 'test-item' }],
        total_hits: 1,
        has_more: false,
        offset: 0,
      },
    });
    const result = await registry.toolRegistry.call(name, args, {});
    expect(result).toMatchObject({
      ok: true,
      data: { [itemsKey]: [{ id: 'test-item' }] },
    });
    expect(ask.orkgAskService[method]).toHaveBeenCalledTimes(1);
    expect(ask.orkgAskService.generate).not.toHaveBeenCalled();
    expect(ask.orkgAskService.synthesizeAbstracts).not.toHaveBeenCalled();
  }
);

it('keeps the real statistics tool internal and rejects external calls before service access', async () => {
  expect(registry.toolRegistry.get('atlas_template_stats')).toBeDefined();
  expect(policy.listExternalTools({}).map((tool) => tool.name)).not.toContain(
    'atlas_template_stats'
  );
  expect(
    (
      await policy.callExternalTool(
        'atlas_template_stats',
        { templateId: 'R1' },
        {}
      )
    ).ok
  ).toBe(false);
  expect(stats.fetchAtlasTemplateStats).not.toHaveBeenCalled();
  vi.mocked(stats.fetchAtlasTemplateStats).mockRejectedValue(new Error(secret));
  expect(
    await registry.toolRegistry.call(
      'atlas_template_stats',
      { templateId: 'R1' },
      {}
    )
  ).toEqual(registry.fail(secret));
  expect(stats.fetchAtlasTemplateStats).toHaveBeenCalledTimes(1);
});

it.each([
  'EXTERNAL_HTTP_RESPONSE_TOO_LARGE',
  'EXTERNAL_HTTP_TIMEOUT',
  'EXTERNAL_HTTP_ABORTED',
  'EXTERNAL_HTTP_INVALID_JSON',
  'EXTERNAL_HTTP_UPSTREAM_ERROR',
] as const)(
  'preserves sanitized HTTP code %s in external REST and internal Ask handler envelopes',
  async (code) => {
    const { ExternalHttpError } = await import('../externalHttp.js');
    const error = new ExternalHttpError(code);
    vi.mocked(client.orkgRest.getResource).mockRejectedValue(error);
    vi.mocked(ask.orkgAskService.semanticSearch).mockRejectedValue(error);
    for (const [name, args] of [
      ['orkg_get_resource', { id: 'R1' }],
      ['orkg_ask_search', { query: 'test' }],
    ] as const) {
      const result =
        name === 'orkg_ask_search'
          ? await registry.toolRegistry.call(name, args, { externalMcp: true })
          : await policy.callExternalTool(name, args, {});
      expect(result).toEqual(registry.fail(error.message, { code }));
    }
  }
);

it.each([1, 10, 30])(
  'retains external-mode Ask limit %s and result bounds for internal registry callers',
  async (limit) => {
    vi.mocked(ask.orkgAskService.searchByPaper).mockResolvedValue({
      uuid: 'test',
      timestamp: 'test',
      payload: {
        items: Array.from({ length: 40 }, (_, i) => ({ id: String(i) })),
        total_hits: 40,
        has_more: true,
        offset: 0,
      },
    });
    const result = await registry.toolRegistry.call(
      'orkg_ask_search_by_paper',
      { paperId: 'R1', limit },
      { externalMcp: true }
    );
    expect(ask.orkgAskService.searchByPaper).toHaveBeenCalledWith(
      'R1',
      { externalMcp: true },
      limit
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(
        (result.data as { relatedItems: unknown[] }).relatedItems
      ).toHaveLength(limit);
  }
);

it.each([120, 121, 150, 200])(
  'processes all %s externally requested graph statements',
  async (count) => {
    const statements = Array.from({ length: count }, (_, i) => ({
      id: 'S' + i,
      subject: { id: 'R1', _class: 'resource' as const },
      predicate: { id: 'P1' },
      object: { id: 'R' + (i + 2), _class: 'resource' as const },
    }));
    vi.mocked(client.orkgRest.getStatementsBundle).mockResolvedValue({
      statements,
    });
    const args = { resourceId: 'R1', maxStatements: count };
    const result = await policy.callExternalTool('orkg_build_graph', args, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { edges: unknown[] }).edges).toHaveLength(count);
      expect(result.meta).toEqual({
        totalStatements: count,
        returnedStatements: count,
        truncated: false,
      });
    }
    const internal = await registry.toolRegistry.call(
      'orkg_build_graph',
      args,
      {}
    );
    if (internal.ok) {
      expect((internal.data as { edges: unknown[] }).edges).toHaveLength(120);
      expect(internal.meta).toBeUndefined();
    } else throw new Error('Internal graph failed');
  }
);

it.each([undefined, 150, 200])(
  'reports graph truncation with requested limit %s',
  async (maxStatements) => {
    vi.mocked(client.orkgRest.getStatementsBundle).mockResolvedValue({
      statements: Array.from({ length: 210 }, (_, i) => ({
        subject: { id: 'R1', _class: 'resource' as const },
        predicate: { id: 'P1' },
        object: { id: 'R' + (i + 2), _class: 'resource' as const },
      })),
    });
    const result = await policy.callExternalTool(
      'orkg_build_graph',
      { resourceId: 'R1', maxStatements },
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta).toEqual({
        totalStatements: 210,
        returnedStatements: maxStatements ?? 120,
        truncated: true,
      });
      expect(result.summary).toContain('from 210 statements');
    }
  }
);

it('preserves empty graph bundle errors', async () => {
  vi.mocked(client.orkgRest.getStatementsBundle).mockResolvedValue({
    statements: [],
  });
  expect(
    await policy.callExternalTool('orkg_build_graph', { resourceId: 'R1' }, {})
  ).toEqual(registry.fail('No statements found for R1.'));
});

const chart = (value: unknown) => ({
  type: 'bar',
  xKey: 'label',
  yKeys: ['value'],
  data: [{ label: 'A', value }],
});
it.each([42, 0, -2.5, '42', '1e3', null])(
  'preserves valid chart value %s',
  async (value) => {
    const result = await policy.callExternalTool(
      'render_chart',
      chart(value),
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect((result.data as { data: unknown[] }).data).toEqual([
        {
          label: 'A',
          value: typeof value === 'string' ? Number(value) : value,
        },
      ]);
  }
);
it.each([Infinity, -Infinity, '1e309', '-1e309', 'Infinity'])(
  'rejects external non-finite chart value %s',
  async (value) => {
    expect(
      await policy.callExternalTool('render_chart', chart(value), {})
    ).toEqual(
      registry.fail('Chart data must contain only finite numeric values.', {
        code: 'CHART_INVALID_NUMBER',
      })
    );
    const internal = await registry.toolRegistry.call(
      'render_chart',
      chart(value),
      {}
    );
    expect(internal.ok).toBe(true);
  }
);
it('keeps existing Zod rejection of NaN', async () => {
  const result = await policy.callExternalTool('render_chart', chart(NaN), {});
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.error).toBe('Invalid arguments for render_chart');
});
it('preserves absent chart values', async () => {
  const result = await policy.callExternalTool(
    'render_chart',
    {
      ...chart(1),
      data: [{ label: 'A' }],
    },
    {}
  );
  expect(result.ok).toBe(true);
  if (result.ok)
    expect((result.data as { data: unknown[] }).data).toEqual([{ label: 'A' }]);
});
it('rejects non-finite numbers in nested chart metadata', async () => {
  const args = {
    ...chart(1),
    data: [{ value: 1, itemsInGroup: [{ count: Infinity }] }],
  };
  expect((await policy.callExternalTool('render_chart', args, {})).ok).toBe(
    false
  );
});
it('overrides external visualization descriptions without changing internal metadata or schemas', () => {
  const before = registry.toolRegistry.list();
  const external = policy.listExternalTools({});
  for (const name of ['orkg_build_graph', 'render_chart', 'render_graph']) {
    const original = before.find((tool) => tool.name === name)!;
    const published = external.find((tool) => tool.name === name)!;
    expect(published.description).toContain(
      'Rendering is the responsibility of the client'
    );
    expect(published.description).not.toMatch(
      /Recharts|React Flow|interactive|chat UI/
    );
    expect(published).toEqual({
      ...original,
      description: published.description,
    });
    expect(published.description).not.toBe(original.description);
  }
  expect(registry.toolRegistry.list()).toEqual(before);
});

it('still loads Firestore for internal saved-question execution', async () => {
  const { db } = await import('../../config/firebase.js');
  const query = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      docs: [{ id: 'Q1', data: () => ({ name: 'Research question' }) }],
    }),
  };
  vi.mocked(db.collection).mockReturnValue(
    query as unknown as ReturnType<typeof db.collection>
  );
  const result = await registry.toolRegistry.call(
    'atlas_search_dynamic_questions',
    {
      templateId: 'R1',
      text: 'research',
      limit: 5,
    },
    {}
  );
  expect(db.collection).toHaveBeenCalledWith('DynamicQuestions');
  expect(query.where).toHaveBeenCalledWith('templateId', '==', 'R1');
  expect(query.limit).toHaveBeenCalledWith(5);
  expect(result).toMatchObject({
    ok: true,
    render: 'dynamic_questions',
    data: { items: [{ id: 'Q1', name: 'Research question' }] },
  });
});
