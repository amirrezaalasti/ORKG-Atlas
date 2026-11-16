import { Parser } from '@traqula/parser-sparql-1-1';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPARQL_POLICY, type SparqlPolicy } from './sparqlPolicy.js';
import { validateSparqlQuery } from './sparqlValidation.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('accepted SPARQL 1.1 queries', () => {
  it.each([
    ['SELECT', 'SELECT * WHERE { ?s ?p ?o }'],
    ['ASK', 'ASK WHERE { ?s ?p ?o }'],
    ['SELECT', 'select ?s where { ?s ?p ?o } limit 10 offset 2'],
    [
      'SELECT',
      'PREFIX ex: <urn:example:> SELECT ?s WHERE { ?s ex:predicate ?o }',
    ],
    [
      'SELECT',
      'SELECT ?s WHERE { { SELECT DISTINCT ?s WHERE { ?s ?p ?o } LIMIT 5 } }',
    ],
    [
      'SELECT',
      'SELECT ?p (COUNT(?s) AS ?count) WHERE { ?s ?p ?o } GROUP BY ?p HAVING (COUNT(?s) > 1) ORDER BY DESC(?count) LIMIT 10 OFFSET 2',
    ],
    [
      'SELECT',
      'PREFIX ex: <urn:example:> SELECT * WHERE { ?s (ex:p|^ex:q)/ex:r* ?o . ?o ex:t+ ?x }',
    ],
    [
      'SELECT',
      'SELECT * WHERE { { ?s ?p ?o } UNION { ?s ?p ?x } OPTIONAL { ?s <urn:label> ?label } MINUS { ?s <urn:excluded> true } FILTER EXISTS { ?s ?p ?o } }',
    ],
    [
      'SELECT',
      'SELECT * WHERE { GRAPH ?g { ?s ?p ?o } VALUES ?s { <urn:s> } BIND(STR(?o) AS ?label) }',
    ],
    ['ASK', 'ASK { FILTER NOT EXISTS { ?s ?p ?o } }'],
    ['ASK', 'ASK { { SELECT ?s WHERE { ?s ?p ?o } } }'],
    [
      'SELECT',
      'BASE <https://example.org/> SELECT * WHERE { <subject> <predicate> ?o }',
    ],
  ])('accepts %s: %s', (queryType, query) => {
    expect(validateSparqlQuery(query)).toEqual({ valid: true, queryType });
  });

  it.each([
    '# SERVICE FROM INSERT DELETE\nSELECT * WHERE { ?s ?p ?o } # FROM NAMED',
    'SELECT * WHERE { ?s ?p "SERVICE FROM FROM NAMED INSERT DELETE CONSTRUCT DESCRIBE" }',
    "SELECT * WHERE { ?s ?p '''SERVICE <https://example.org/private> { INSERT }''' }",
    'SELECT * WHERE { <https://example.org/SERVICE> <urn:FROM> <urn:DELETE> }',
    'PREFIX SERVICE: <urn:FROM:> SELECT * WHERE { ?s SERVICE:INSERT ?o }',
    'SELECT ?SERVICE ?FROM WHERE { ?SERVICE ?FROM ?DELETE }',
  ])('does not treat term or comment content as policy syntax: %s', (query) => {
    expect(validateSparqlQuery(query)).toEqual({
      valid: true,
      queryType: 'SELECT',
    });
  });
});

describe('syntax validation', () => {
  it.each([
    '',
    '   ',
    'SELECT WHERE { ?s ?p ?o }',
    'SELECT * WHERE { ?s ?p ?o',
    'SELECT * WHERE { ?s missing:predicate ?o }',
    'SELECT ?s, ?o WHERE { ?s ?p ?o }',
    'SELECT * WHERE { ?s ?p ?o } trailing-garbage',
    'SELECT * WHERE { ?s ?p ?o } ASK { ?s ?p ?o }',
    'SELECT * WHERE { ?s ?p ?o } ; INSERT DATA { <urn:s> <urn:p> <urn:o> }',
    'UNSUPPORTED WHERE { ?s ?p ?o }',
  ])('rejects malformed or incomplete input: %s', (query) => {
    expect(validateSparqlQuery(query)).toMatchObject({
      valid: false,
      code: 'SPARQL_SYNTAX_ERROR',
      message: expect.stringContaining('PREFIX'),
    });
  });

  it('does not reuse PREFIX declarations from an earlier query', () => {
    expect(
      validateSparqlQuery('PREFIX ex: <urn:example:> ASK { ?s ex:p ?o }').valid
    ).toBe(true);
    expect(validateSparqlQuery('ASK { ?s ex:p ?o }')).toMatchObject({
      valid: false,
      code: 'SPARQL_SYNTAX_ERROR',
    });
    expect(validateSparqlQuery('ASK { ?s ?p ?o }').valid).toBe(true);
  });

  it('never returns a raw parser error, input URL, stack or dump', () => {
    vi.spyOn(Parser.prototype, 'parse').mockImplementationOnce(() => {
      throw new Error(
        'Parse error: https://private.example/token-secret\n at internal.js:42\n raw AST dump'
      );
    });
    const result = validateSparqlQuery('ASK { ?s ?p ?o }');
    expect(result).toMatchObject({ valid: false, code: 'SPARQL_SYNTAX_ERROR' });
    expect(Object.keys(result).sort()).toEqual(['code', 'message', 'valid']);
    expect(JSON.stringify(result)).not.toMatch(
      /https:|token-secret|internal\.js|raw AST|stack/
    );
  });
});

describe('default-deny query types', () => {
  it.each([
    'INSERT DATA { <urn:s> <urn:p> <urn:o> }',
    'DELETE DATA { <urn:s> <urn:p> <urn:o> }',
    'DELETE WHERE { ?s ?p ?o }',
    'DELETE { ?s ?p ?o } INSERT { ?s ?p <urn:new> } WHERE { ?s ?p ?o }',
    'LOAD <https://example.org/data>',
    'CLEAR ALL',
    'DROP ALL',
    'CREATE GRAPH <urn:g>',
    'ADD DEFAULT TO GRAPH <urn:g>',
    'MOVE GRAPH <urn:a> TO GRAPH <urn:b>',
    'COPY DEFAULT TO GRAPH <urn:g>',
    'INSERT DATA { <urn:s> <urn:p> <urn:o> }; CLEAR ALL',
    'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
    'DESCRIBE <urn:s>',
    '# only a comment',
  ])('rejects non-allowlisted operations: %s', (query) => {
    expect(validateSparqlQuery(query)).toMatchObject({
      valid: false,
      code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
    });
  });

  it.each([
    { type: 'query', subType: 'future-query' },
    { type: 'future-operation' },
  ])('fails closed for a future parser operation: %j', (ast) => {
    vi.spyOn(Parser.prototype, 'parse').mockReturnValueOnce(
      ast as unknown as ReturnType<Parser['parse']>
    );
    expect(validateSparqlQuery('ASK { ?s ?p ?o }')).toMatchObject({
      valid: false,
      code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
    });
  });
});

describe('recursive SERVICE rejection', () => {
  const service = 'SERVICE <https://example.org/private> { ?s ?p ?o }';

  it.each([
    `SELECT * WHERE { ${service} }`,
    `ASK { ${service} }`,
    'SELECT * WHERE { SERVICE SILENT <https://example.org/private> { ?s ?p ?o } }',
    'SELECT * WHERE { SERVICE ?endpoint { ?s ?p ?o } }',
    `SELECT * WHERE { OPTIONAL { ${service} } }`,
    `SELECT * WHERE { { ?s ?p ?o } UNION { ${service} } }`,
    `SELECT * WHERE { { SELECT * WHERE { ${service} } } }`,
    `SELECT * WHERE { ?s ?p ?o FILTER EXISTS { ${service} } }`,
    `SELECT * WHERE { ?s ?p ?o FILTER NOT EXISTS { ${service} } }`,
    `SELECT * WHERE { ?s ?p ?o MINUS { ${service} } }`,
    `SELECT * WHERE { GRAPH <urn:g> { ${service} } }`,
    `SELECT * WHERE { BIND(EXISTS { ${service} } AS ?found) }`,
    `SELECT (EXISTS { ${service} } AS ?found) WHERE { ?s ?p ?o }`,
    `SELECT * WHERE { ?s ?p ?o } ORDER BY (EXISTS { ${service} })`,
    `SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o } HAVING (EXISTS { ${service} })`,
    `SELECT * WHERE { OPTIONAL { { ?s ?p ?o } UNION { { SELECT * WHERE { FILTER EXISTS { ${service} } } } } } }`,
    'select * where { service <urn:endpoint> { ?s ?p ?o } }',
  ])('rejects SERVICE anywhere in the AST: %s', (query) => {
    expect(validateSparqlQuery(query)).toEqual({
      valid: false,
      code: 'SPARQL_GRAPH_PATTERN_FORBIDDEN',
      message:
        'SERVICE graph patterns are not permitted. Remove this graph pattern, including nested occurrences.',
    });
  });
});

describe('dataset clauses', () => {
  it.each([
    'SELECT * FROM <https://example.org/data> WHERE { ?s ?p ?o }',
    'SELECT * FROM NAMED <https://example.org/data> WHERE { GRAPH ?g { ?s ?p ?o } }',
    'ASK FROM <urn:g> WHERE { ?s ?p ?o }',
    'ASK FROM NAMED <urn:g> WHERE { GRAPH ?g { ?s ?p ?o } }',
    'SELECT * FROM <urn:a> FROM NAMED <urn:b> WHERE { ?s ?p ?o }',
    'PREFIX ex: <urn:example:> SELECT * FROM ex:graph WHERE { ?s ?p ?o }',
  ])('rejects dataset selection: %s', (query) => {
    expect(validateSparqlQuery(query)).toMatchObject({
      valid: false,
      code: 'SPARQL_DATASET_FORBIDDEN',
    });
  });
});

describe('central policy configuration', () => {
  it('defines the complete default policy and protects it from mutation', () => {
    expect(SPARQL_POLICY).toEqual({
      allowedQueryTypes: ['SELECT', 'ASK'],
      forbiddenGraphPatterns: ['SERVICE'],
      datasetClauses: { FROM: false, 'FROM NAMED': false },
    });
    for (const value of [SPARQL_POLICY, ...Object.values(SPARQL_POLICY)]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('can restrict allowed query types, including nested queries', () => {
    const policy: SparqlPolicy = {
      ...SPARQL_POLICY,
      allowedQueryTypes: ['ASK'],
    };
    expect(validateSparqlQuery('ASK { ?s ?p ?o }', policy).valid).toBe(true);
    for (const query of [
      'SELECT * WHERE { ?s ?p ?o }',
      'ASK { { SELECT * WHERE { ?s ?p ?o } } }',
    ]) {
      expect(validateSparqlQuery(query, policy)).toMatchObject({
        valid: false,
        code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
      });
    }
  });

  it('denies every query when the allowlist is empty', () => {
    expect(
      validateSparqlQuery('ASK { ?s ?p ?o }', {
        ...SPARQL_POLICY,
        allowedQueryTypes: [],
      })
    ).toMatchObject({ valid: false, code: 'SPARQL_QUERY_TYPE_FORBIDDEN' });
  });

  it('can explicitly enable another query form without permitting updates', () => {
    const policy: SparqlPolicy = {
      ...SPARQL_POLICY,
      allowedQueryTypes: [...SPARQL_POLICY.allowedQueryTypes, 'CONSTRUCT'],
    };
    expect(
      validateSparqlQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }', policy)
    ).toEqual({ valid: true, queryType: 'CONSTRUCT' });
    expect(validateSparqlQuery('CLEAR ALL', policy)).toMatchObject({
      valid: false,
      code: 'SPARQL_QUERY_TYPE_FORBIDDEN',
    });
  });

  it('applies configured graph pattern restrictions', () => {
    expect(
      validateSparqlQuery('SELECT * WHERE { OPTIONAL { ?s ?p ?o } }', {
        ...SPARQL_POLICY,
        forbiddenGraphPatterns: [
          ...SPARQL_POLICY.forbiddenGraphPatterns,
          'OPTIONAL',
        ],
      })
    ).toMatchObject({ valid: false, code: 'SPARQL_GRAPH_PATTERN_FORBIDDEN' });
    expect(
      validateSparqlQuery('ASK { SERVICE <urn:endpoint> { ?s ?p ?o } }', {
        ...SPARQL_POLICY,
        forbiddenGraphPatterns: [],
      })
    ).toEqual({ valid: true, queryType: 'ASK' });
  });

  it.each(['FROM', 'FROM NAMED'] as const)(
    'can enable %s independently without weakening other rules',
    (clause) => {
      const policy: SparqlPolicy = {
        ...SPARQL_POLICY,
        datasetClauses: { ...SPARQL_POLICY.datasetClauses, [clause]: true },
      };
      expect(
        validateSparqlQuery(`ASK ${clause} <urn:g> { ?s ?p ?o }`, policy)
      ).toEqual({ valid: true, queryType: 'ASK' });
      const other = clause === 'FROM' ? 'FROM NAMED' : 'FROM';
      expect(
        validateSparqlQuery(`ASK ${other} <urn:g> { ?s ?p ?o }`, policy)
      ).toMatchObject({ valid: false, code: 'SPARQL_DATASET_FORBIDDEN' });
      expect(
        validateSparqlQuery(
          `ASK ${clause} <urn:g> { SERVICE <urn:endpoint> { ?s ?p ?o } }`,
          policy
        )
      ).toMatchObject({ valid: false, code: 'SPARQL_GRAPH_PATTERN_FORBIDDEN' });
      expect(
        validateSparqlQuery(`ASK ${clause} <urn:g> { ?s ?p ?o }`)
      ).toMatchObject({
        valid: false,
        code: 'SPARQL_DATASET_FORBIDDEN',
      });
    }
  );
});

it('parses the unchanged full query and performs no HTTP execution', () => {
  const parse = vi.spyOn(Parser.prototype, 'parse');
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Offline test'));
  const query = '\nSELECT * WHERE { ?s ?p ?o } # keep this comment\n';
  expect(validateSparqlQuery(query)).toEqual({
    valid: true,
    queryType: 'SELECT',
  });
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse).toHaveBeenCalledWith(query);
  expect(fetch).not.toHaveBeenCalled();
});
