import fetch, { AbortError, FetchError, type Response } from 'node-fetch';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-fetch', async () => ({
  ...(await vi.importActual<typeof import('node-fetch')>('node-fetch')),
  default: vi.fn(),
}));
vi.mock('../../config/firebase.js', () => ({ db: {} }));
vi.mock('../orkgAskService.js', () => ({
  orkgAskService: {},
  extractOrkgAskGenerateText: vi.fn(),
}));
vi.mock('../atlasTemplateStatsService.js', () => ({
  fetchAtlasTemplateStats: vi.fn(),
}));
vi.mock('../orkgTemplatesService.js', () => ({ listOrkgTemplates: vi.fn() }));
vi.mock('../orkg/templateFlow.js', () => ({ loadTemplateFlow: vi.fn() }));

let registry: typeof import('./registry.js');
let templateFlow: typeof import('../orkg/templateFlow.js');
const mockFetch = vi.mocked(fetch);

beforeAll(async () => {
  vi.resetModules();
  registry = await import('./registry.js');
  templateFlow = await import('../orkg/templateFlow.js');
  // Exercise the real SPARQL tool, registry, client and validator together.
  await import('./tools.js');
});
beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(templateFlow.loadTemplateFlow).mockReset();
});

function respond(data: unknown, status = 200) {
  mockFetch.mockResolvedValue({
    ok: status === 200,
    status,
    text: async () => JSON.stringify(data),
  } as Response);
}

describe('SPARQL tool compatibility', () => {
  it.each([
    ['SPARQL_QUERY_TOO_LARGE', 'ASK {} #' + 'x'.repeat(50_000), undefined],
    [
      'SPARQL_RESPONSE_TOO_LARGE',
      'ASK {}',
      new FetchError(
        'https://private.example/secret upstream body',
        'max-size'
      ),
    ],
    [
      'SPARQL_TIMEOUT',
      'ASK {}',
      new AbortError('https://private.example/secret'),
    ],
  ])(
    'returns the structured resource error %s',
    async (code, query, upstreamError) => {
      if (upstreamError) mockFetch.mockRejectedValueOnce(upstreamError);
      const result = await registry.toolRegistry.call(
        'orkg_sparql',
        { query },
        {}
      );
      expect(result).toEqual({
        ok: false,
        error: expect.any(String),
        details: { code },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /https:|private\.example|upstream body|stack/
      );
      if (!upstreamError) expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('returns a structured concurrency error without changing successful calls', async () => {
    const releases: Array<() => void> = [];
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() =>
            resolve({
              ok: true,
              text: async () => '{"boolean":true}',
            } as Response)
          );
        })
    );
    const query = 'ASK {}';
    const pending = Array.from({ length: 5 }, () =>
      registry.toolRegistry.call('orkg_sparql', { query }, {})
    );
    expect(
      await registry.toolRegistry.call('orkg_sparql', { query }, {})
    ).toEqual({
      ok: false,
      error:
        'SPARQL execution is busy. Retry after an active request completes.',
      details: { code: 'SPARQL_CONCURRENCY_LIMIT' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(5);
    releases.forEach((release) => release());
    expect((await Promise.all(pending)).every((result) => result.ok)).toBe(
      true
    );
  });

  it.each([
    ['SELECT WHERE {', 'SPARQL_SYNTAX_ERROR'],
    ['SELECT * { ?s ?p ?o } ORDER BY ?s ASC', 'SPARQL_SYNTAX_ERROR'],
    ['DELETE WHERE { ?s ?p ?o }', 'SPARQL_QUERY_TYPE_FORBIDDEN'],
    [
      'ASK { SERVICE <https://private.example/secret> { ?s ?p ?o } }',
      'SPARQL_GRAPH_PATTERN_FORBIDDEN',
    ],
    [
      'SELECT * FROM <https://private.example/secret> { ?s ?p ?o }',
      'SPARQL_DATASET_FORBIDDEN',
    ],
  ])(
    'returns a normal tool error with a stable code: %s',
    async (query, code) => {
      const result = await registry.toolRegistry.call(
        'orkg_sparql',
        { query },
        {}
      );
      expect(result).toEqual({
        ok: false,
        error: expect.any(String),
        details: { code },
      });
      if (result.ok) throw new Error('Expected tool error');
      expect(result.error.length).toBeGreaterThan(20);
      expect(JSON.stringify(result)).not.toMatch(
        /private\.example|https:|stack|Token sequences/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('preserves SELECT normalization, metadata, original query and rowLimit', async () => {
    const query = 'SELECT ?label ?count WHERE { ?label ?p ?count }';
    respond({
      head: { vars: ['label', 'count'] },
      results: {
        bindings: [
          {
            label: { value: 'Example', type: 'literal' },
            count: {
              value: '42',
              datatype: 'http://www.w3.org/2001/XMLSchema#integer',
            },
          },
          {
            label: { value: 'Second', type: 'literal' },
            count: { value: '7' },
          },
        ],
      },
    });
    const result = await registry.toolRegistry.call(
      'orkg_sparql',
      { query, rowLimit: 1 },
      {}
    );
    expect(result).toEqual({
      ok: true,
      render: 'sparql_results',
      data: {
        vars: ['label', 'count'],
        rows: [{ label: 'Example', count: '42' }],
        total: 2,
        query,
      },
      summary: 'SPARQL returned 1 rows (truncated from 2).',
      meta: {
        rdfBindings: [
          {
            label: { value: 'Example', type: 'literal' },
            count: {
              value: '42',
              datatype: 'http://www.w3.org/2001/XMLSchema#integer',
            },
          },
        ],
      },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the default 1000-row limit and variable fallback', async () => {
    respond({
      results: {
        bindings: Array.from({ length: 1001 }, () => ({
          s: { value: 'urn:s' },
        })),
      },
    });
    const result = await registry.toolRegistry.call(
      'orkg_sparql',
      { query: 'SELECT ?s { ?s ?p ?o }' },
      {}
    );
    expect(result).toMatchObject({
      ok: true,
      data: { vars: ['s'], total: 1001 },
      summary: 'SPARQL returned 1000 rows (truncated from 1001).',
    });
    if (!result.ok) throw new Error('Expected success');
    expect((result.data as { rows: unknown[] }).rows).toHaveLength(1000);
    expect(result.meta?.rdfBindings).toEqual(
      Array.from({ length: 1000 }, () => ({ s: { value: 'urn:s' } }))
    );
  });

  it.each([true, false])(
    'preserves ASK %s as a real boolean with compatibility fields',
    async (boolean) => {
      respond({ boolean });
      const query = 'ASK { ?s ?p ?o }';
      expect(
        await registry.toolRegistry.call(
          'orkg_sparql',
          { query, rowLimit: 1 },
          {}
        )
      ).toEqual({
        ok: true,
        render: 'sparql_results',
        data: { vars: [], rows: [], total: 0, query, boolean },
        summary: `SPARQL ASK returned ${boolean}.`,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['ASK {}', {}],
    ['ASK {}', { boolean: 'false' }],
    ['ASK {}', { results: { bindings: [] } }],
    ['ASK {}', { boolean: true, results: { bindings: [] } }],
    ['SELECT * { ?s ?p ?o }', { boolean: false }],
    ['SELECT * { ?s ?p ?o }', { results: {} }],
    [
      'SELECT * { ?s ?p ?o }',
      { results: { bindings: [{ s: { value: 12 } }] } },
    ],
    ['ASK {}', 'https://private.example/secret'],
  ])(
    'returns a sanitized response error for %s with %j',
    async (query, body) => {
      respond(body);
      const result = await registry.toolRegistry.call(
        'orkg_sparql',
        { query },
        {}
      );
      expect(result).toEqual({
        ok: false,
        error: expect.any(String),
        details: { code: 'SPARQL_INVALID_RESPONSE' },
      });
      if (result.ok) throw new Error('Expected response error');
      expect(result.error).toContain('SPARQL');
      expect(JSON.stringify(result)).not.toMatch(
        /https:|private\.example|stack/
      );
    }
  );

  it('returns invalid JSON as a structured response error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => 'https://private.example/secret invalid JSON',
    } as Response);
    expect(
      await registry.toolRegistry.call('orkg_sparql', { query: 'ASK {}' }, {})
    ).toEqual({
      ok: false,
      error: 'SPARQL response is not valid JSON. Please retry later.',
      details: { code: 'SPARQL_INVALID_RESPONSE' },
    });
  });

  it('keeps empty SELECT results successful and distinct from ASK false', async () => {
    const query = 'SELECT ?s WHERE { ?s ?p ?o }';
    respond({ head: { vars: ['s'] }, results: { bindings: [] } });
    expect(
      await registry.toolRegistry.call('orkg_sparql', { query }, {})
    ).toEqual({
      ok: true,
      render: 'sparql_results',
      data: { vars: ['s'], rows: [], total: 0, query },
      summary: 'SPARQL returned 0 rows.',
      meta: { rdfBindings: [] },
    });
  });

  it('preserves RDF terms separately from unchanged normalized rows', async () => {
    const query = 'SELECT * WHERE { ?s ?p ?o }';
    const bindings = [
      {
        number: {
          value: '9007199254740993',
          datatype: 'http://www.w3.org/2001/XMLSchema#integer',
          type: 'literal',
        },
        label: { value: 'Größe 😀', 'xml:lang': 'de', type: 'literal' },
        uri: { value: 'urn:example:s', type: 'uri' },
        blank: { value: 'b1', type: 'bnode' },
        empty: { value: '', type: 'literal' },
        plain: { value: 'text' },
      },
      {},
    ];
    respond({
      head: {
        vars: ['number', 'label', 'uri', 'blank', 'empty', 'plain', 'unbound'],
      },
      results: { bindings },
    });
    expect(
      await registry.toolRegistry.call('orkg_sparql', { query }, {})
    ).toEqual({
      ok: true,
      render: 'sparql_results',
      data: {
        vars: ['number', 'label', 'uri', 'blank', 'empty', 'plain', 'unbound'],
        rows: [
          {
            number: '9007199254740993',
            label: 'Größe 😀',
            uri: 'urn:example:s',
            blank: 'b1',
            empty: '',
            plain: 'text',
          },
          {},
        ],
        total: 2,
        query,
      },
      summary: 'SPARQL returned 2 rows.',
      meta: { rdfBindings: bindings },
    });
  });

  it('includes only RDF term fields for returned rows, not unrelated upstream data', async () => {
    respond({
      debug: 'upstream diagnostics',
      head: { vars: ['s'], link: ['https://private.example/secret'] },
      results: {
        diagnostics: 'upstream diagnostics',
        bindings: [
          { s: { value: 'first', type: 'literal', debug: 'private' } },
          { s: { value: 'second' } },
          { s: { value: 'truncated', type: 'literal', 'xml:lang': 'en' } },
        ],
      },
    });
    const result = await registry.toolRegistry.call(
      'orkg_sparql',
      { query: 'SELECT ?s WHERE { ?s ?p ?o }', rowLimit: 2 },
      {}
    );
    if (!result.ok) throw new Error('Expected success');
    expect(result.meta).toStrictEqual({
      rdfBindings: [
        { s: { value: 'first', type: 'literal' } },
        { s: { value: 'second' } },
      ],
    });
    expect(result.data).toMatchObject({
      rows: [{ s: 'first' }, { s: 'second' }],
      total: 3,
    });
  });

  it.each([
    'SELECT * { ?c a orkgr:R1 }',
    'SELECT * { ?c a orkgc:C2 }',
    'SELECT * { ?paper orkgp:P31 ?c }',
  ])(
    'classifies template scope mismatches before execution: %s',
    async (query) => {
      vi.mocked(templateFlow.loadTemplateFlow).mockResolvedValue({
        templates: [],
        targetClassId: 'C1',
      });
      const result = await registry.toolRegistry.call(
        'orkg_sparql',
        { query, templateId: 'https://private.example/secret' },
        {}
      );
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('orkg_sparql_schema'),
        details: { code: 'TEMPLATE_SCOPE_MISMATCH' },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /https:|private\.example|stack/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('preserves matching template-scoped execution', async () => {
    vi.mocked(templateFlow.loadTemplateFlow).mockResolvedValue({
      templates: [],
      targetClassId: 'C1',
    });
    respond({ boolean: false });
    const query = 'ASK { ?paper orkgp:P31 ?c . ?c a orkgc:C1 }';
    expect(
      await registry.toolRegistry.call(
        'orkg_sparql',
        { query, templateId: 'R1' },
        {}
      )
    ).toMatchObject({
      ok: true,
      data: { boolean: false, query },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sanitizes and classifies template-loading failures', async () => {
    vi.mocked(templateFlow.loadTemplateFlow).mockRejectedValue(
      new Error('template fetch failed at https://private.example/secret')
    );
    expect(
      await registry.toolRegistry.call(
        'orkg_sparql',
        { query: 'ASK {}', templateId: 'R1' },
        {}
      )
    ).toEqual({
      ok: false,
      error: 'SPARQL request failed. Please check the query or retry later.',
      details: { code: 'SPARQL_EXECUTION_ERROR' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not expose upstream response bodies in tool errors', async () => {
    respond('https://private.example/secret raw upstream dump', 503);
    expect(
      await registry.toolRegistry.call(
        'orkg_sparql',
        { query: 'ASK { ?s ?p ?o }' },
        {}
      )
    ).toEqual({
      ok: false,
      error: 'SPARQL request failed (503). Please retry later.',
      details: { code: 'SPARQL_UPSTREAM_ERROR' },
    });
  });

  it('does not expose transport exception URLs or stack traces', async () => {
    mockFetch.mockRejectedValue(
      new Error('fetch failed at https://private.example/secret')
    );
    expect(
      await registry.toolRegistry.call(
        'orkg_sparql',
        { query: 'ASK { ?s ?p ?o }' },
        {}
      )
    ).toEqual({
      ok: false,
      error: 'SPARQL request failed. Please check the query or retry later.',
      details: { code: 'SPARQL_EXECUTION_ERROR' },
    });
  });
});

it.each([true, false])(
  'forwards external hierarchy warnings for ASK=%s without changing internal results',
  async (ask) => {
    vi.mocked(templateFlow.loadTemplateFlow).mockResolvedValue({
      templates: [],
      targetClassId: 'C1',
      warnings: [
        'Template hierarchy lookup limit reached; schema information is incomplete.',
      ],
    });
    respond(
      ask
        ? { boolean: true }
        : { head: { vars: [] }, results: { bindings: [] } }
    );
    const policy = await import('./externalToolPolicy.js');
    const args = {
      query: ask ? 'ASK {}' : 'SELECT * WHERE {}',
      templateId: 'R1',
    };
    const external = await policy.callExternalTool('orkg_sparql', args, {});
    expect(external.ok).toBe(true);
    if (external.ok)
      expect(external.meta?.hierarchyWarnings).toEqual([
        'Template hierarchy lookup limit reached; schema information is incomplete.',
      ]);
    const internal = await registry.toolRegistry.call('orkg_sparql', args, {});
    expect(internal.ok).toBe(true);
    if (internal.ok) expect(internal.meta?.hierarchyWarnings).toBeUndefined();
  }
);
