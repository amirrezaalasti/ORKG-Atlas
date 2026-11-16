import { afterEach, expect, it, vi } from 'vitest';
import { EXTERNAL_MCP_LIMITS, PUBLIC_SPARQL_LIMITS } from '../../config/mcp.js';
import { executionSignal, withMcpExecution } from './executionScope.js';
import { checkPublicSparql } from './publicSparql.js';
import { validateSparqlQuery } from '../sparql/sparqlValidation.js';

const triple = 'orkgr:R1 orkgp:P1 ?value';
afterEach(() => {
  vi.useRealTimers();
});
it.each([
  `SELECT ?value WHERE { ${triple} } LIMIT 1`,
  `SELECT * WHERE { ${triple} } LIMIT 100 OFFSET 0`,
  'SELECT * WHERE { <http://orkg.org/orkg/resource/R1> <urn:p> "SERVICE FROM" } LIMIT 10',
])('accepts a small resource-anchored query: %s', (query) => {
  expect(() => checkPublicSparql(query)).not.toThrow();
});

it.each([
  `ASK { ${triple} }`,
  'ASK {}',
  `SELECT ?value WHERE { ${triple} }`,
  `SELECT ?value WHERE { ${triple} } LIMIT 101`,
  `SELECT ?value WHERE { ${triple} } LIMIT 0`,
  `SELECT ?value WHERE { ${triple} } LIMIT 1 OFFSET 1000000`,
  `SELECT (COUNT(?value) AS ?n) WHERE { ${triple} } LIMIT 1`,
  `SELECT DISTINCT ?value WHERE { ${triple} } LIMIT 1`,
  `SELECT ?value WHERE { ${triple} } ORDER BY ?value LIMIT 1`,
  `SELECT ?value WHERE { ${triple} . ?value orkgp:P2 ?x } LIMIT 1`,
  `SELECT ?value WHERE { ${triple} FILTER(REGEX(STR(?value),".*")) } LIMIT 1`,
  'SELECT * WHERE { ?s ?p ?o } LIMIT 1',
  'SELECT * WHERE { orkgr:R1 ?p ?o } LIMIT 1',
  'SELECT * WHERE { orkgr:R1 orkgp:P1* ?o } LIMIT 1',
  'SELECT * WHERE { ?s a orkgc:C1 } LIMIT 1',
  'SELECT * WHERE { GRAPH ?g { orkgr:R1 orkgp:P1 ?o } } LIMIT 1',
  'SELECT * WHERE { SERVICE <https://example.test> { orkgr:R1 orkgp:P1 ?o } } LIMIT 1',
  'SELECT * FROM <https://example.test> WHERE { orkgr:R1 orkgp:P1 ?o } LIMIT 1',
  'PREFIX orkgr: <urn:other:> SELECT ?o WHERE { orkgr:R1 orkgp:P1 ?o } LIMIT 1',
  'INSERT DATA { orkgr:R1 orkgp:P1 "x" }',
  'SELECT WHERE {',
  'ASK { { SELECT ?s WHERE { ?s ?p ?o } LIMIT 1 } }',
  `ASK {} # ${'x'.repeat(2000)}`,
  null,
])('fails closed for costly/unsupported public query: %s', (query) => {
  expect(() => checkPublicSparql(query)).toThrow('Public SPARQL requires');
});

it('leaves the shared SELECT/ASK policy available to internal/demo callers', () => {
  const query = 'SELECT * WHERE { ?s ?p ?o } LIMIT 1';
  expect(validateSparqlQuery(query)).toMatchObject({
    valid: true,
    queryType: 'SELECT',
  });
  expect(() => checkPublicSparql(query)).toThrow();
  expect(validateSparqlQuery('ASK {}')).toMatchObject({
    valid: true,
    queryType: 'ASK',
  });
  expect(() => checkPublicSparql('ASK {}')).toThrow();
});

it('measures the public query boundary in UTF-8 bytes without rewriting input', () => {
  const base = `SELECT ?value WHERE { ${triple} } LIMIT 1 # `;
  const remaining =
    PUBLIC_SPARQL_LIMITS.maxQueryBytes - Buffer.byteLength(base);
  const query =
    base + 'é'.repeat(Math.floor(remaining / 2)) + 'x'.repeat(remaining % 2);
  expect(Buffer.byteLength(query)).toBe(PUBLIC_SPARQL_LIMITS.maxQueryBytes);
  expect(() => checkPublicSparql(query)).not.toThrow();
  expect(() => checkPublicSparql(query + 'x')).toThrow();
});

it('uses the configured ten-second execution deadline and waits for cancellation', async () => {
  vi.useFakeTimers();
  let stopped = false;
  const work = withMcpExecution(
    () => {
      checkPublicSparql(`SELECT ?value WHERE { ${triple} } LIMIT 1`);
      return new Promise((_resolve, reject) =>
        executionSignal()!.addEventListener(
          'abort',
          () => {
            stopped = true;
            reject(new Error('stopped'));
          },
          { once: true }
        )
      );
    },
    [],
    EXTERNAL_MCP_LIMITS.sparqlTimeoutMs
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(EXTERNAL_MCP_LIMITS.sparqlTimeoutMs);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(stopped).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
