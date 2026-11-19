import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/firebase.js', () => ({ db: { collection: vi.fn() } }));
vi.mock('../orkg/orkgClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orkg/orkgClient.js')>()),
  orkgRest: { listTemplates: vi.fn() },
}));
vi.mock('../orkgAskService.js', () => ({
  orkgAskService: {},
  extractOrkgAskGenerateText: vi.fn(),
}));
vi.mock('../atlasTemplateStatsService.js', () => ({
  fetchAtlasTemplateStats: vi.fn(),
}));
vi.mock('../sparqlPromptService.js', () => ({
  buildSparqlSchemaPrompt: vi.fn(),
  buildExternalSparqlSchemaPrompt: vi.fn(),
}));

let catalog: typeof import('../orkgTemplatesService.js');
let client: typeof import('../orkg/orkgClient.js');
let firebase: typeof import('../../config/firebase.js');
let registry: typeof import('./registry.js');
let policy: typeof import('./externalToolPolicy.js');
const names = ['orkg_search_templates', 'atlas_list_templates'];

beforeAll(async () => {
  vi.resetModules();
  catalog = await import('../orkgTemplatesService.js');
  client = await import('../orkg/orkgClient.js');
  firebase = await import('../../config/firebase.js');
  registry = await import('./registry.js');
  policy = await import('./externalToolPolicy.js');
  await import('./tools.js');
});

function respond(value: unknown) {
  vi.mocked(client.orkgRest.listTemplates).mockResolvedValue(
    value as Awaited<ReturnType<typeof client.orkgRest.listTemplates>>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  respond({
    content: [{ id: 'R10', label: 'ORKG template' }],
    totalElements: 1,
  });
  vi.mocked(firebase.db.collection).mockReturnValue({
    get: vi.fn().mockResolvedValue({
      docs: [
        {
          id: 'R186491',
          data: () => ({
            title: 'Private title',
            description: 'Private description',
          }),
        },
        { id: 'RLocal', data: () => ({ title: 'Local template' }) },
      ],
    }),
  } as unknown as ReturnType<typeof firebase.db.collection>);
});

describe('external ORKG catalog service', () => {
  it.each([100, 500])(
    'caps requested size %s at 100 and forwards the search/page',
    async (size) => {
      respond({
        content: Array.from({ length: 100 }, (_, i) => ({ id: `R${i}` })),
        totalElements: 900,
      });
      const result = await catalog.listExternalOrkgTemplates({
        query: '  metric  ',
        page: 3,
        size,
      });
      expect(result.items).toHaveLength(100);
      expect(result.page).toBe(3);
      expect(result.total).toBe(900);
      expect(client.orkgRest.listTemplates).toHaveBeenCalledWith(
        {
          q: 'metric',
          page: 3,
          size: 100,
        },
        { externalMcp: true }
      );
    }
  );

  it('preserves order and projects approved fields without local fallbacks', async () => {
    respond({
      content: [
        {
          id: 'R186491',
          target_class: null,
          label: null,
          description: null,
          privateField: 'secret',
        },
        {
          id: 'R2',
          label: 'Second',
          description: 'Public description',
          target_class: { id: 'C2', privateField: 'secret' },
          inAtlas: true,
        },
        { id: 'R3', target_class: 'C3', created_by: 'secret' },
      ],
    });
    expect(await catalog.listExternalOrkgTemplates()).toStrictEqual({
      items: [
        { id: 'R186491', link: 'https://orkg.org/template/R186491' },
        {
          id: 'R2',
          label: 'Second',
          description: 'Public description',
          targetClassId: 'C2',
          link: 'https://orkg.org/template/R2',
        },
        { id: 'R3', targetClassId: 'C3', link: 'https://orkg.org/template/R3' },
      ],
      page: 0,
    });
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it('keeps later and empty pages free of repeated local templates', async () => {
    respond({ content: [{ id: 'R1' }] });
    const first = await catalog.listExternalOrkgTemplates({ page: 0, size: 1 });
    respond({ content: [{ id: 'R2' }] });
    const second = await catalog.listExternalOrkgTemplates({
      page: 1,
      size: 1,
    });
    respond({ content: [], totalElements: 2 });
    expect(
      await catalog.listExternalOrkgTemplates({ page: 2, size: 1 })
    ).toEqual({ items: [], total: 2, page: 2 });
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
      'R1',
      'R2',
    ]);
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it.each([0, 12, 1000])(
    'preserves valid upstream total %s',
    async (totalElements) => {
      respond({ content: [], totalElements });
      expect((await catalog.listExternalOrkgTemplates()).total).toBe(
        totalElements
      );
    }
  );

  it.each([
    undefined,
    null,
    '12',
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    {},
    [],
  ])(
    'omits unknown or invalid total %j without estimating it',
    async (totalElements) => {
      respond({ content: [{ id: 'R1' }], totalElements });
      expect(await catalog.listExternalOrkgTemplates()).not.toHaveProperty(
        'total'
      );
    }
  );

  it.each([
    [],
    { content: null },
    { content: {} },
    { content: [null] },
    { content: [{}] },
    { content: [{ id: ' ' }] },
    { content: [{ id: 12 }] },
    { content: [{ id: 'R1', label: {} }] },
    { content: [{ id: 'R1', description: [] }] },
    { content: [{ id: 'R1', target_class: 12 }] },
  ])('rejects malformed pages: %j', async (response) => {
    respond(response);
    await expect(catalog.listExternalOrkgTemplates()).rejects.toMatchObject({
      code: 'TEMPLATE_CATALOG_INVALID_RESPONSE',
      message:
        'ORKG template catalog returned an invalid or oversized page. Please retry later.',
    });
  });

  it.each([1, 50, 100])(
    'rejects an upstream page exceeding size %s instead of truncating it',
    async (size) => {
      respond({
        content: Array.from({ length: size + 1 }, (_, i) => ({ id: `R${i}` })),
      });
      await expect(
        catalog.listExternalOrkgTemplates({ size })
      ).rejects.toMatchObject({ code: 'TEMPLATE_CATALOG_INVALID_RESPONSE' });
    }
  );

  it('sanitizes upstream exceptions', async () => {
    vi.mocked(client.orkgRest.listTemplates).mockRejectedValue(
      new Error(
        'https://private.example/secret raw body FIREBASE_SERVICE_ACCOUNT_KEY stack'
      )
    );
    await expect(catalog.listExternalOrkgTemplates()).rejects.toMatchObject({
      code: 'TEMPLATE_CATALOG_UPSTREAM_ERROR',
      message: 'ORKG template catalog could not be loaded. Please retry later.',
    });
  });
});

describe('real template tools and policy', () => {
  it.each(names)(
    'selects only ORKG data externally for %s despite client flags',
    async (name) => {
      const result = await policy.callExternalTool(
        name,
        {
          query: '  metric  ',
          externalMcp: false,
          isAdmin: true,
          page: 2,
          size: 3,
        },
        {}
      );
      expect(result).toMatchObject({
        ok: true,
        render: 'templates',
        data: { page: 2, items: [{ id: 'R10' }] },
      });
      expect(client.orkgRest.listTemplates).toHaveBeenCalledWith(
        {
          q: 'metric',
          page: 2,
          size: 3,
        },
        { externalMcp: true }
      );
      expect(firebase.db.collection).not.toHaveBeenCalled();
    }
  );

  it.each(names)(
    'preserves internal merging for %s and ignores client external flags',
    async (name) => {
      const result = await registry.toolRegistry.call(
        name,
        { query: 'unmatched', size: 1, externalMcp: true },
        {}
      );
      if (!result.ok) throw new Error(result.error);
      const data = result.data as {
        items: Array<{ id: string; inAtlas: boolean }>;
        total: number;
        page: number;
      };
      // Existing internal additions, duplicate and upstream total are intentionally retained.
      expect(data.items.map((item) => item.id)).toEqual([
        'R1544125',
        'R186491',
        'R10',
        'R186491',
        'RLocal',
      ]);
      expect(data).toMatchObject({ total: 1, page: 0 });
      expect(data.items[0].inAtlas).toBe(true);
      expect(firebase.db.collection).toHaveBeenCalledWith('Templates');
    }
  );

  it('rejects whitespace-only external searches before any service call', async () => {
    expect(
      await policy.callExternalTool(
        'orkg_search_templates',
        { query: ' \t ' },
        {}
      )
    ).toEqual({
      ok: false,
      error: 'Provide a non-empty template search query.',
      details: { code: 'TEMPLATE_CATALOG_INVALID_QUERY' },
    });
    expect(client.orkgRest.listTemplates).not.toHaveBeenCalled();
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it('treats whitespace-only external listing filters as absent', async () => {
    expect(
      await policy.callExternalTool(
        'atlas_list_templates',
        { query: ' \t ' },
        {}
      )
    ).toMatchObject({
      ok: true,
      summary: '1 ORKG templates on this page of 1.',
    });
    expect(client.orkgRest.listTemplates).toHaveBeenCalledWith(
      {
        q: undefined,
        page: 0,
        size: 50,
      },
      { externalMcp: true }
    );
  });

  it.each(names)(
    'preserves internal whitespace query behavior for %s',
    async (name) => {
      const result = await registry.toolRegistry.call(name, { query: ' ' }, {});
      expect(result).toMatchObject({
        ok: true,
        summary: expect.stringContaining('“ ”'),
      });
      expect(firebase.db.collection).toHaveBeenCalled();
    }
  );

  it.each(names)('keeps input size validation for %s', async (name) => {
    expect(
      await policy.callExternalTool(name, { query: 'test', size: 101 }, {})
    ).toMatchObject({ ok: false, error: `Invalid arguments for ${name}` });
    expect(client.orkgRest.listTemplates).not.toHaveBeenCalled();
  });

  it.each(names)(
    'returns sanitized external errors and unchanged internal errors for %s',
    async (name) => {
      const secret =
        'https://private.example/secret FIREBASE_SERVICE_ACCOUNT_KEY raw body stack';
      vi.mocked(client.orkgRest.listTemplates).mockRejectedValue(
        new Error(secret)
      );
      const result = await policy.callExternalTool(name, { query: 'test' }, {});
      expect(result).toEqual({
        ok: false,
        error:
          'ORKG template catalog could not be retrieved. Please retry later.',
        details: { code: 'TEMPLATE_CATALOG_UPSTREAM_ERROR' },
      });
      expect(
        await registry.toolRegistry.call(name, { query: 'test' }, {})
      ).toEqual({ ok: false, error: secret, details: undefined });
      respond({ content: [{ id: 'R1', label: { secret } }] });
      expect(
        await policy.callExternalTool(name, { query: 'test' }, {})
      ).toMatchObject({
        ok: false,
        details: { code: 'TEMPLATE_CATALOG_INVALID_RESPONSE' },
      });
    }
  );

  it('overrides only external descriptions without changing internal definitions or schemas', () => {
    const before = registry.toolRegistry.list();
    const definitions = names.map((name) => registry.toolRegistry.get(name)!);
    const descriptions = definitions.map(
      (definition) => definition.description
    );
    const external = policy.listExternalTools({});
    for (const name of names) {
      const published = external.find((tool) => tool.name === name)!;
      const internal = before.find((tool) => tool.name === name)!;
      expect(published.description).toContain('public ORKG catalog');
      expect(published.description).toContain('no Atlas-only or Firestore');
      expect(published.description).toContain('total is omitted when unknown');
      expect({ ...published, description: internal.description }).toEqual(
        internal
      );
    }
    expect(registry.toolRegistry.list()).toEqual(before);
    expect(definitions.map((definition) => definition.description)).toEqual(
      descriptions
    );
  });
});

describe('bounded external all-templates mode', () => {
  it.each([undefined, false])(
    'preserves one-page output for all=%s',
    async (all) => {
      const result = await policy.callExternalTool(
        'atlas_list_templates',
        { all },
        {}
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).not.toHaveProperty('truncated');
      expect(client.orkgRest.listTemplates).toHaveBeenCalledTimes(1);
    }
  );

  it('loads successive pages from the requested start and keeps the filter', async () => {
    vi.mocked(client.orkgRest.listTemplates)
      .mockResolvedValueOnce({
        content: [{ id: 'R3' }, { id: 'R4' }],
        totalElements: 5,
      })
      .mockResolvedValueOnce({ content: [{ id: 'R5' }], totalElements: 5 });
    const result = await policy.callExternalTool(
      'atlas_list_templates',
      { all: true, page: 1, size: 2, query: ' metric ' },
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        page: 1,
        total: 5,
        truncated: false,
      });
      expect(result.data).not.toHaveProperty('continuation');
      expect(result.summary).toContain('catalog end reached');
    }
    expect(
      vi.mocked(client.orkgRest.listTemplates).mock.calls.map((call) => call[0])
    ).toEqual([
      { q: 'metric', page: 1, size: 2 },
      { q: 'metric', page: 2, size: 2 },
    ]);
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it('returns an empty successful catalog without inventing a total', async () => {
    respond({ content: [] });
    expect(await catalog.listAllExternalOrkgTemplates()).toEqual({
      items: [],
      page: 0,
      truncated: false,
    });
  });

  it('stops at 1000 entries without fetching another page', async () => {
    vi.mocked(client.orkgRest.listTemplates).mockImplementation(
      async (params) => ({
        content: Array.from({ length: 100 }, (_, i) => ({
          id: 'R' + ((params.page ?? 0) * 100 + i),
        })),
      })
    );
    const result = await catalog.listAllExternalOrkgTemplates({ size: 100 });
    expect(result.items).toHaveLength(1000);
    expect(result).toMatchObject({
      truncated: true,
      stopReason: 'item_limit',
      continuation: { page: 10 },
    });
    expect(client.orkgRest.listTemplates).toHaveBeenCalledTimes(10);
  });

  it('reports an oversized first projected page without silently slicing it', async () => {
    respond({ content: [{ id: 'R1', description: 'x'.repeat(5_000_000) }] });
    const result = await catalog.listAllExternalOrkgTemplates();
    expect(result).toMatchObject({
      items: [],
      truncated: true,
      stopReason: 'size_limit',
      continuation: { page: 0 },
    });
  });

  it.each([undefined, -1, '5'])(
    'omits invalid or missing total %s',
    async (totalElements) => {
      respond({ content: [], totalElements });
      expect(await catalog.listAllExternalOrkgTemplates()).not.toHaveProperty(
        'total'
      );
    }
  );

  it('returns an explicit tool error for a contradictory first page', async () => {
    respond({ content: [{ id: 'R1' }], totalElements: 10 });
    const result = await policy.callExternalTool(
      'atlas_list_templates',
      { all: true },
      {}
    );
    expect(result).toMatchObject({
      ok: false,
      details: { code: 'TEMPLATE_CATALOG_INVALID_RESPONSE' },
    });
    expect(result).not.toHaveProperty('data');
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it('returns only accepted pages and resumes the invalid page through the public tool', async () => {
    const mock = vi.mocked(client.orkgRest.listTemplates);
    mock
      .mockResolvedValueOnce({
        content: [{ id: 'R1' }, { id: 'R2' }],
        totalElements: 4,
      })
      .mockResolvedValueOnce({ content: [{ id: 'R3' }], totalElements: 4 });
    const first = await policy.callExternalTool(
      'atlas_list_templates',
      { all: true, size: 2 },
      {}
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    const data = first.data as Awaited<
      ReturnType<typeof catalog.listAllExternalOrkgTemplates>
    >;
    expect(data.items.map((item) => item.id)).toEqual(['R1', 'R2']);
    expect(data).toMatchObject({
      stopReason: 'invalid_response',
      continuation: { page: 1 },
    });
    mock
      .mockResolvedValueOnce({
        content: [{ id: 'R3' }, { id: 'R4' }],
        totalElements: 4,
      })
      .mockResolvedValueOnce({ content: [], totalElements: 4 });
    const resumed = await policy.callExternalTool(
      'atlas_list_templates',
      data.continuation,
      {}
    );
    expect(resumed).toMatchObject({
      ok: true,
      data: { truncated: false, items: [{ id: 'R3' }, { id: 'R4' }] },
    });
    expect(mock.mock.calls.map(([params]) => params.page)).toEqual([
      0, 1, 1, 2,
    ]);
    expect(firebase.db.collection).not.toHaveBeenCalled();
  });

  it('returns explicit partial results after a later malformed page', async () => {
    const mock = vi.mocked(client.orkgRest.listTemplates);
    mock.mockResolvedValueOnce({ content: [{ id: 'R1' }] });
    mock.mockResolvedValueOnce({ content: null } as unknown as Awaited<
      ReturnType<typeof client.orkgRest.listTemplates>
    >);
    const result = await catalog.listAllExternalOrkgTemplates({ size: 1 });
    expect(result).toMatchObject({
      truncated: true,
      stopReason: 'invalid_response',
      continuation: { page: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/private|secret/);
  });

  it('preserves sanitized first-page upstream errors', async () => {
    vi.mocked(client.orkgRest.listTemplates).mockRejectedValue(
      new Error('private URL')
    );
    const result = await policy.callExternalTool(
      'atlas_list_templates',
      { all: true },
      {}
    );
    expect(result).toMatchObject({
      ok: false,
      details: { code: 'TEMPLATE_CATALOG_UPSTREAM_ERROR' },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('ignores all internally and keeps the merged catalog contract', async () => {
    const a = await registry.toolRegistry.call('atlas_list_templates', {}, {});
    const b = await registry.toolRegistry.call(
      'atlas_list_templates',
      { all: true },
      {}
    );
    expect(b).toEqual(a);
    expect(firebase.db.collection).toHaveBeenCalledTimes(2);
    expect(client.orkgRest.listTemplates).toHaveBeenCalledTimes(2);
  });

  it('publishes the optional boolean with false default and rejects invalid types', async () => {
    const tool = policy
      .listExternalTools({})
      .find((tool) => tool.name === 'atlas_list_templates')!;
    expect(tool.inputSchema).toMatchObject({
      properties: { all: { type: 'boolean', default: false } },
    });
    expect(tool.description).toContain('all=true');
    expect(
      (await policy.callExternalTool(tool.name, { all: 'true' }, {})).ok
    ).toBe(false);
    expect(client.orkgRest.listTemplates).not.toHaveBeenCalled();
  });
});

it('omits changing totals across pages', async () => {
  vi.mocked(client.orkgRest.listTemplates)
    .mockResolvedValueOnce({ content: [{ id: 'R1' }], totalElements: 2 })
    .mockResolvedValueOnce({ content: [{ id: 'R2' }], totalElements: 3 })
    .mockResolvedValueOnce({ content: [], totalElements: 2 });
  const result = await catalog.listAllExternalOrkgTemplates({ size: 1 });
  expect(result).not.toHaveProperty('total');
  expect(result.truncated).toBe(false);
});

it('keeps a first-page deadline failure in the sanitized error contract', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(client.orkgRest.listTemplates).mockImplementation(
      (_params, http) =>
        new Promise((_resolve, reject) => {
          http?.signal?.addEventListener('abort', () =>
            reject(new Error('private timeout'))
          );
        })
    );
    const promise = policy.callExternalTool(
      'atlas_list_templates',
      { all: true },
      {}
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await promise).toMatchObject({
      ok: false,
      details: { code: 'TEMPLATE_CATALOG_UPSTREAM_ERROR' },
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
