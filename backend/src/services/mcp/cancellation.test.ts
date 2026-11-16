import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import fetch, { AbortError, Response } from 'node-fetch';
import { externalHttpJson } from '../externalHttp.js';
import { sparqlQuery } from '../orkg/orkgClient.js';
import { buildExternalSparqlSchemaPrompt } from '../sparqlPromptService.js';
import { listAllExternalOrkgTemplates } from '../orkgTemplatesService.js';
import { withMcpExecution } from './executionScope.js';

vi.mock('node-fetch', async (original) => ({
  ...(await original<typeof import('node-fetch')>()),
  default: vi.fn(),
}));
const mockedFetch = vi.mocked(fetch);
beforeEach(() => {
  vi.useFakeTimers();
  mockedFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function respond(value: unknown, status = 200) {
  mockedFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(value), { status })
  );
}
function pending() {
  const body = new PassThrough();
  mockedFetch.mockImplementationOnce(async (_url, options) => {
    options?.signal?.addEventListener('abort', () =>
      body.destroy(new AbortError('stopped'))
    );
    return new Response(body);
  });
  return body;
}

it('bounds sequential nested HTTP operations by one shared deadline', async () => {
  for (let i = 0; i < 2; i++)
    mockedFetch.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return new Response('{}');
    });
  const body = pending();
  const work = withMcpExecution(async () => {
    await externalHttpJson('https://mock.invalid/first');
    await externalHttpJson('https://mock.invalid/second');
    await externalHttpJson('https://mock.invalid/third');
    await externalHttpJson('https://mock.invalid/must-not-start');
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(body.destroyed).toBe(true);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels retry backoff without sending another request', async () => {
  respond({}, 503);
  const work = withMcpExecution(
    () => externalHttpJson('https://mock.invalid', { retries: 2 }),
    [],
    100
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(100);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(mockedFetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts SPARQL response consumption and releases the concurrency slot', async () => {
  const body = pending();
  const work = withMcpExecution(() => sparqlQuery('ASK {}'), [], 100).catch(
    (error) => error
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(body.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  mockedFetch.mockImplementation(async () => new Response('{"boolean":true}'));
  const subsequent = await Promise.all(
    Array.from({ length: 5 }, () => sparqlQuery('ASK {}'))
  );
  expect(subsequent.every((result) => result.boolean === true)).toBe(true);
});

it('stops hierarchy traversal before later lookups or schema discovery', async () => {
  respond({
    id: 'RMock',
    target_class: 'CMock',
    properties: [
      { path: { id: 'P1' }, class: { id: 'CFirst' } },
      { path: { id: 'P2' }, class: { id: 'CSecond' } },
    ],
  });
  const body = pending();
  const work = withMcpExecution(
    () => buildExternalSparqlSchemaPrompt('RMock'),
    [],
    100
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(100);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(body.destroyed).toBe(true);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('disables live schema SPARQL discovery within the public execution scope', async () => {
  respond({ id: 'RMock', target_class: 'CMock', properties: [] });
  const result = await withMcpExecution(
    () => buildExternalSparqlSchemaPrompt('RMock'),
    [],
    100
  );
  expect(result.warnings?.join(' ')).toContain(
    'Live SPARQL paper-link discovery is disabled'
  );
  expect(mockedFetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels catalog pagination without returning a successful partial result', async () => {
  respond({ content: [{ id: 'RMock' }] });
  const body = pending();
  const work = withMcpExecution(
    () => listAllExternalOrkgTemplates({ size: 1 }),
    [],
    100
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(100);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(body.destroyed).toBe(true);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
