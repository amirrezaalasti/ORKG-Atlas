import fetch, { AbortError, Response } from 'node-fetch';
import { PassThrough, Readable } from 'node:stream';
import { Parser } from '@traqula/parser-sparql-1-1';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSparqlPrefixes, sparqlQuery } from './orkgClient.js';
import * as validation from '../sparql/sparqlValidation.js';
import { buildSparqlSchemaPrompt } from '../sparqlPromptService.js';
import { loadTemplateFlow } from './templateFlow.js';
import { SPARQL_LIMITS } from '../sparql/sparqlPolicy.js';

vi.mock('node-fetch', async () => ({
  ...(await vi.importActual<typeof import('node-fetch')>('node-fetch')),
  default: vi.fn(),
}));
vi.mock('./templateFlow.js', () => ({
  loadTemplateFlow: vi.fn(),
}));

const mockFetch = vi.mocked(fetch);
const emptyResult = { head: { vars: ['s'] }, results: { bindings: [] } };

function respond(data: unknown, status = 200) {
  mockFetch.mockResolvedValue({
    ok: status === 200,
    status,
    text: async () => JSON.stringify(data),
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(loadTemplateFlow).mockResolvedValue({
    templates: [],
    targetClassId: 'C123',
  });
  respond(emptyResult);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SPARQL execution boundary', () => {
  it.each([
    ['SELECT * WHERE { ?s ?p ?o }', emptyResult],
    ['ASK { ?s ?p ?o }', { boolean: true }],
    ['ASK { ?s ?p ?o }', { boolean: false }],
  ])(
    'validates exactly the query transmitted by POST: %s',
    async (query, result) => {
      respond(result);
      const validate = vi.spyOn(validation, 'validateSparqlQuery');
      expect(await sparqlQuery(query)).toEqual(result);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][1];
      const transmitted = new URLSearchParams(String(request?.body)).get(
        'query'
      );
      expect(validate).toHaveBeenCalledTimes(1);
      expect(validate).toHaveBeenCalledWith(transmitted);
      expect(validate.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetch.mock.invocationCallOrder[0]
      );
      expect(transmitted).toBe(ensureSparqlPrefixes(query));
      expect(request).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
        },
      });
    }
  );

  describe.each([undefined, true, false])('readonly=%s', (readonly) => {
    it.each([
      ['SELECT WHERE {', 'SPARQL_SYNTAX_ERROR'],
      ['', 'SPARQL_SYNTAX_ERROR'],
      [
        'INSERT DATA { <urn:s> <urn:p> <urn:o> }',
        'SPARQL_QUERY_TYPE_FORBIDDEN',
      ],
      ['DELETE WHERE { ?s ?p ?o }', 'SPARQL_QUERY_TYPE_FORBIDDEN'],
      [
        'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
        'SPARQL_QUERY_TYPE_FORBIDDEN',
      ],
      ['DESCRIBE <urn:s>', 'SPARQL_QUERY_TYPE_FORBIDDEN'],
      [
        'SELECT * WHERE { SERVICE <urn:endpoint> { ?s ?p ?o } }',
        'SPARQL_GRAPH_PATTERN_FORBIDDEN',
      ],
      [
        'ASK { OPTIONAL { FILTER EXISTS { SERVICE <urn:endpoint> { ?s ?p ?o } } } }',
        'SPARQL_GRAPH_PATTERN_FORBIDDEN',
      ],
      ['SELECT * FROM <urn:g> WHERE { ?s ?p ?o }', 'SPARQL_DATASET_FORBIDDEN'],
      ['ASK FROM NAMED <urn:g> { ?s ?p ?o }', 'SPARQL_DATASET_FORBIDDEN'],
    ])('rejects before HTTP: %s', async (query, code) => {
      await expect(sparqlQuery(query, { readonly })).rejects.toMatchObject({
        name: 'SparqlValidationError',
        code,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it.each(['ORDER BY ?s ASC', 'ORDER BY ?s ?o DESC'])(
    'rejects unsupported ordering without automatic repair: %s',
    async (order) => {
      await expect(
        sparqlQuery(`SELECT * WHERE { ?s ?p ?o } ${order}`)
      ).rejects.toMatchObject({
        code: 'SPARQL_SYNTAX_ERROR',
        message: expect.stringContaining('ORDER BY DESC(?x)'),
      });
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('preserves literals, comments, IRIs and all original query whitespace', async () => {
    const query = `\n# DELETE SERVICE ORDER BY ?year ASC\nSELECT * WHERE {
      <urn:SERVICE> <urn:DELETE> "ORDER BY ?year ASC SERVICE DELETE r:label" .
      ?s ?p '''PREFIX r: <urn:fake:>\nORDER BY ?s DESC'''
    }\n`;
    await sparqlQuery(query);
    const transmitted = new URLSearchParams(
      String(mockFetch.mock.calls[0][1]?.body)
    ).get('query');
    expect(transmitted?.endsWith(query)).toBe(true);
    expect(transmitted).toContain('PREFIX r: <http://orkg.org/orkg/resource/>');
  });

  it.each([
    'PREFIX r: <urn:custom:> PREFIX p: <urn:custom-p:> SELECT * { r:x p:y ?o }',
    '# PREFIX r: <urn:fake:>\nBASE <https://example.org/> PREFIX r: <custom/> SELECT * { r:x p:P1 ?o }',
    'prefix r: <urn:custom:> SELECT * { r:x p:P1 ?o }',
    String.raw`PREFIX \u0072: <urn:custom:> SELECT * { r:x p:P1 ?o }`,
  ])('respects actual prefix declarations: %s', async (query) => {
    const final = ensureSparqlPrefixes(query);
    expect(final.endsWith(query)).toBe(true);
    expect(final).not.toContain('PREFIX r: <http://orkg.org/orkg/resource/>');
    await expect(sparqlQuery(query)).resolves.toEqual(emptyResult);
  });

  it('adds all missing standard aliases once and is idempotent', async () => {
    const query =
      'SELECT * { orkgr:R1 orkgp:P1 ?o . ?o a orkgc:C1 ; rdfs:label ?label }';
    const prepared = ensureSparqlPrefixes(query);
    expect(ensureSparqlPrefixes(prepared)).toBe(prepared);
    expect(prepared.match(/^PREFIX /gm)).toHaveLength(10);
    await expect(sparqlQuery(query)).resolves.toEqual(emptyResult);
  });

  it('does not invent unknown namespaces', async () => {
    await expect(sparqlQuery('ASK { missing:s ?p ?o }')).rejects.toMatchObject({
      code: 'SPARQL_SYNTAX_ERROR',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('executes all three existing backend schema discovery queries offline', async () => {
    const result = await buildSparqlSchemaPrompt('R123');
    expect(result.targetClassId).toBe('C123');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const queries = mockFetch.mock.calls.map(([, request]) =>
      new URLSearchParams(String(request?.body)).get('query')
    );
    expect(queries[0]).toContain('LIMIT 1');
    expect(queries[1]).toContain('SELECT DISTINCT ?p1');
    expect(queries[2]).toContain('GROUP BY ?p1 ?p2 ORDER BY DESC(?n)');
  });

  it('keeps HTTP errors readable without embedding upstream bodies', async () => {
    respond('https://private.example/secret upstream dump', 503);
    await expect(sparqlQuery('ASK { ?s ?p ?o }')).rejects.toMatchObject({
      status: 503,
      message: 'SPARQL request failed (503). Please retry later.',
    });
  });
});

describe('SPARQL upstream response structure', () => {
  const select = 'SELECT * WHERE { ?s ?p ?o }';
  const ask = 'ASK { ?s ?p ?o }';

  it.each(
    [null, [], true, 42, 'https://private.example/secret'].map((body) => ({
      body,
    }))
  )('rejects a non-object response: $body', async ({ body }) => {
    respond(body);
    await expect(sparqlQuery(select)).rejects.toMatchObject({
      code: 'SPARQL_INVALID_RESPONSE',
      message: 'SPARQL response must be a JSON result object.',
    });
  });

  it.each(
    [null, 'true', 'false', 0, 1, [], {}].map((boolean) => ({ boolean }))
  )('rejects an invalid ASK boolean: $boolean', async ({ boolean }) => {
    respond({ boolean });
    await expect(sparqlQuery(ask)).rejects.toMatchObject({
      code: 'SPARQL_INVALID_RESPONSE',
      message: expect.stringContaining('ASK'),
    });
  });

  it.each(
    [
      {},
      { head: {} },
      { results: { bindings: [] } },
      { boolean: true, results: { bindings: [] } },
      { boolean: false, results: null },
    ].map((body) => ({ body }))
  )('rejects missing or conflicting ASK results: $body', async ({ body }) => {
    respond(body);
    await expect(sparqlQuery(ask)).rejects.toMatchObject({
      code: 'SPARQL_INVALID_RESPONSE',
    });
  });

  it.each(
    [
      {},
      { results: null },
      { results: [] },
      { results: {} },
      { results: { bindings: null } },
      { results: { bindings: {} } },
      { boolean: false },
      { boolean: true, results: { bindings: [] } },
      { boolean: null, results: { bindings: [] } },
    ].map((body) => ({ body }))
  )(
    'rejects missing or conflicting SELECT bindings: $body',
    async ({ body }) => {
      respond(body);
      await expect(sparqlQuery(select)).rejects.toMatchObject({
        code: 'SPARQL_INVALID_RESPONSE',
        message: expect.stringContaining('SELECT'),
      });
    }
  );

  it.each(
    [
      null,
      [],
      'private result text',
      { s: null },
      { s: [] },
      { s: 'text' },
      { s: {} },
      { s: { value: false } },
      { s: { value: 42 } },
    ].map((row) => ({ row }))
  )('rejects malformed binding containers: $row', async ({ row }) => {
    respond({ results: { bindings: [row] } });
    await expect(sparqlQuery(select)).rejects.toMatchObject({
      code: 'SPARQL_INVALID_RESPONSE',
      message:
        'Invalid SPARQL SELECT binding: expected objects containing string values.',
    });
  });

  it.each([null, [], { vars: 's' }, { vars: [1] }].map((head) => ({ head })))(
    'rejects malformed headers without requiring a header: $head',
    async ({ head }) => {
      respond({ head, results: { bindings: [] } });
      await expect(sparqlQuery(select)).rejects.toMatchObject({
        code: 'SPARQL_INVALID_RESPONSE',
      });
    }
  );

  it('preserves SELECT values, metadata, ordering and unbound variables', async () => {
    const body = {
      head: { vars: ['label', 'number', 'uri', 'blank', 'unbound'] },
      results: {
        bindings: [
          {
            label: { type: 'literal', value: 'Größe 😀', 'xml:lang': 'de' },
            number: {
              type: 'literal',
              value: '9007199254740993',
              datatype: 'http://www.w3.org/2001/XMLSchema#integer',
            },
            uri: { type: 'uri', value: 'urn:example:s' },
            blank: { type: 'bnode', value: 'b1' },
          },
          { label: { type: 'literal', value: '' } },
          {},
        ],
      },
    };
    respond(body);
    expect(await sparqlQuery(select)).toEqual(body);
  });

  it.each([
    { results: { bindings: [] } },
    { head: {}, results: { bindings: [] } },
  ])(
    'accepts empty SELECT bindings without requiring head.vars: %j',
    async (body) => {
      respond(body);
      expect(await sparqlQuery(select)).toEqual(body);
    }
  );

  it('checks the already parsed query type, including prefixed ASK', async () => {
    respond({ head: {}, boolean: false });
    const parse = vi.spyOn(Parser.prototype, 'parse');
    expect(
      await sparqlQuery(
        '# SELECT is only a comment\nPREFIX ex: <urn:example:> ASK { ex:s ?p ?o }'
      )
    ).toEqual({ head: {}, boolean: false });
    // Prefix preparation and final validation only; no classification reparse.
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it.each([ask, select])(
    'releases all slots after invalid responses to %s',
    async (query) => {
      respond({});
      for (let i = 0; i <= SPARQL_LIMITS.maxConcurrentRequests; i++) {
        await expect(sparqlQuery(query)).rejects.toMatchObject({
          code: 'SPARQL_INVALID_RESPONSE',
        });
      }
      const result = query === ask ? { boolean: false } : emptyResult;
      respond(result);
      expect(
        await Promise.all(
          Array.from({ length: SPARQL_LIMITS.maxConcurrentRequests }, () =>
            sparqlQuery(query)
          )
        )
      ).toEqual(
        Array.from(
          { length: SPARQL_LIMITS.maxConcurrentRequests },
          () => result
        )
      );
    }
  );
});

describe('SPARQL resource limits', () => {
  const query = 'ASK { ?s ?p ?o }';
  const askResult = { boolean: true };

  beforeEach(() => respond(askResult));

  function respondWithStream(stream: Readable, status = 200) {
    mockFetch.mockImplementationOnce(async (_url, options) => {
      expect(options?.size).toBe(SPARQL_LIMITS.maxResponseBytes);
      // Mimic node-fetch's AbortSignal wiring, but consume a real local body.
      const abort = () =>
        stream.destroy(new AbortError('private upstream URL'));
      options?.signal?.addEventListener('abort', abort);
      stream.once('close', () =>
        options?.signal?.removeEventListener('abort', abort)
      );
      // node-fetch supports size here, but omits it from ResponseInit's type.
      const responseOptions = { size: options?.size, status };
      return new Response(stream, responseOptions);
    });
  }

  it('uses the provisional central budgets', () => {
    expect(SPARQL_LIMITS).toEqual({
      maxQueryBytes: 50_000,
      maxResponseBytes: 5_000_000,
      maxConcurrentRequests: 5,
      timeoutMs: 25_000,
      maxOutputRows: 1_000,
    });
  });

  it.each(['a', 'é', '😀'])(
    'checks UTF-8 query boundaries using %s',
    async (character) => {
      const base = ensureSparqlPrefixes(query) + '\n#';
      const remaining = SPARQL_LIMITS.maxQueryBytes - Buffer.byteLength(base);
      const width = Buffer.byteLength(character);
      const exact =
        base +
        character.repeat(Math.floor(remaining / width)) +
        ' '.repeat(remaining % width);
      expect(Buffer.byteLength(exact)).toBe(SPARQL_LIMITS.maxQueryBytes);
      const below =
        base +
        character.repeat(Math.floor((remaining - 1) / width)) +
        ' '.repeat((remaining - 1) % width);
      expect(Buffer.byteLength(below)).toBe(SPARQL_LIMITS.maxQueryBytes - 1);
      await expect(sparqlQuery(below)).resolves.toEqual(askResult);
      await expect(sparqlQuery(exact)).resolves.toEqual(askResult);
      const parse = vi.spyOn(validation, 'parseSparqlQuery');
      await expect(sparqlQuery(exact + ' ')).rejects.toMatchObject({
        code: 'SPARQL_QUERY_TOO_LARGE',
      });
      expect(parse).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }
  );

  it('counts automatically injected prefixes before final validation and HTTP', async () => {
    const raw =
      query +
      '\n#' +
      ' '.repeat(SPARQL_LIMITS.maxQueryBytes - query.length - 2);
    expect(Buffer.byteLength(raw)).toBe(SPARQL_LIMITS.maxQueryBytes);
    const validate = vi.spyOn(validation, 'validateSparqlQuery');
    await expect(sparqlQuery(raw)).rejects.toMatchObject({
      code: 'SPARQL_QUERY_TOO_LARGE',
    });
    expect(validate).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(sparqlQuery(query)).resolves.toEqual(askResult);
  });

  it.each([-1, 0, 1])(
    'enforces the response byte boundary (%i)',
    async (delta) => {
      const json = '{"boolean":true}';
      const payload =
        json + ' '.repeat(SPARQL_LIMITS.maxResponseBytes - json.length + delta);
      const stream = Readable.from([Buffer.from(payload)]);
      respondWithStream(stream);
      if (delta > 0) {
        await expect(sparqlQuery(query)).rejects.toMatchObject({
          code: 'SPARQL_RESPONSE_TOO_LARGE',
        });
        expect(stream.destroyed).toBe(true);
      } else {
        await expect(sparqlQuery(query)).resolves.toEqual({ boolean: true });
      }
      // Every completion path must leave a slot available.
      await expect(sparqlQuery(query)).resolves.toEqual(askResult);
    }
  );

  it.each([200, 503])(
    'bounds chunked response bodies, including HTTP %i',
    async (status) => {
      const stream = Readable.from([
        Buffer.alloc(SPARQL_LIMITS.maxResponseBytes - 1, ' '),
        Buffer.from('é'), // Two bytes: exceeds the budget by one.
      ]);
      respondWithStream(stream, status);
      await expect(sparqlQuery(query)).rejects.toMatchObject({
        code: 'SPARQL_RESPONSE_TOO_LARGE',
        message: `SPARQL response exceeds ${SPARQL_LIMITS.maxResponseBytes} bytes. Narrow the query or request fewer fields.`,
      });
      expect(stream.destroyed).toBe(true);
      await expect(sparqlQuery(query)).resolves.toEqual(askResult);
    }
  );

  it.each([undefined, 10, 100_000, Infinity, NaN, 0, -1])(
    'bounds timeout %s while the response body is still arriving',
    async (timeoutMs) => {
      vi.useFakeTimers();
      const stream = new PassThrough();
      respondWithStream(stream);
      const pending = sparqlQuery(query, { timeoutMs });
      const failure = expect(pending).rejects.toMatchObject({
        code: 'SPARQL_TIMEOUT',
        message: 'SPARQL request timed out. Simplify the query or retry later.',
      });
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      stream.write('{"boolean":');
      const effective = timeoutMs === 10 ? 10 : SPARQL_LIMITS.timeoutMs;
      await vi.advanceTimersByTimeAsync(effective - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await failure;
      expect(stream.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await expect(sparqlQuery(query)).resolves.toEqual(askResult);
    }
  );

  it('rejects the sixth request immediately and holds slots through parsing', async () => {
    const streams = Array.from(
      { length: SPARQL_LIMITS.maxConcurrentRequests },
      () => new PassThrough()
    );
    streams.forEach((stream) => respondWithStream(stream));
    const pending = streams.map(() => sparqlQuery(query));
    await expect(sparqlQuery(query)).rejects.toMatchObject({
      code: 'SPARQL_CONCURRENCY_LIMIT',
    });
    expect(mockFetch).toHaveBeenCalledTimes(5);

    const parse = JSON.parse;
    let duringParsing: Promise<void> | undefined;
    vi.spyOn(JSON, 'parse').mockImplementationOnce((text: string) => {
      duringParsing = expect(sparqlQuery(query)).rejects.toMatchObject({
        code: 'SPARQL_CONCURRENCY_LIMIT',
      });
      return parse(text);
    });
    streams[0].end('{"boolean":true}');
    await expect(pending[0]).resolves.toEqual({ boolean: true });
    expect(duringParsing).toBeDefined();
    await duringParsing;
    await expect(sparqlQuery(query)).resolves.toEqual(askResult);
    streams.slice(1).forEach((stream) => stream.end('{"boolean":false}'));
    await Promise.all(pending);

    // A complete second batch proves success paths release every slot.
    await expect(
      Promise.all(streams.map(() => sparqlQuery(query)))
    ).resolves.toHaveLength(5);
  });

  it.each(['syntax', 'policy', 'http', 'json', 'network'])(
    'releases every slot after repeated %s failures',
    async (kind) => {
      for (let i = 0; i < SPARQL_LIMITS.maxConcurrentRequests + 1; i++) {
        if (kind === 'http') respondWithStream(Readable.from(['error']), 503);
        if (kind === 'json') respondWithStream(Readable.from(['not JSON']));
        if (kind === 'network')
          mockFetch.mockRejectedValueOnce(new Error('offline'));
        const input =
          kind === 'syntax'
            ? 'SELECT WHERE {'
            : kind === 'policy'
              ? 'DELETE WHERE { ?s ?p ?o }'
              : query;
        const expected =
          kind === 'syntax'
            ? { code: 'SPARQL_SYNTAX_ERROR' }
            : kind === 'policy'
              ? { code: 'SPARQL_QUERY_TYPE_FORBIDDEN' }
              : kind === 'http'
                ? { status: 503 }
                : kind === 'json'
                  ? { code: 'SPARQL_INVALID_RESPONSE' }
                  : { message: 'offline' };
        await expect(sparqlQuery(input)).rejects.toMatchObject(expected);
      }
      await expect(
        Promise.all(Array.from({ length: 5 }, () => sparqlQuery(query)))
      ).resolves.toHaveLength(5);
    }
  );
});
