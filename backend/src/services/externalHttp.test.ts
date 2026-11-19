import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import fetch, { AbortError, Response, type ResponseInit } from 'node-fetch';
import { externalHttpJson, EXTERNAL_HTTP_LIMITS } from './externalHttp.js';
import { orkgRest } from './orkg/orkgClient.js';
import { orkgAskService } from './orkgAskService.js';

vi.mock('node-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node-fetch')>()),
  default: vi.fn(),
}));
const mockedFetch = vi.mocked(fetch);
const url = 'https://private.test/token';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ORKG_ASK_API_BASE', 'https://ask.test');
  vi.stubEnv('ORKG_API_BASE', 'https://orkg.test/api');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
// node-fetch's Body supports size, though ResponseInit omits it in its types.
function response(
  body: string | Readable,
  init: ResponseInit & { size?: number }
) {
  return new Response(body, init);
}
function respond(body: string | Readable, status = 200, length?: string) {
  mockedFetch.mockImplementationOnce(async (_url, options) =>
    response(body, {
      status,
      size: options?.size,
      headers: length ? { 'Content-Length': length } : {},
    })
  );
}

it.each([undefined, '1', 'invalid', '999999999'])(
  'uses actual bytes regardless of Content-Length %s',
  async (length) => {
    respond('{"ok":true}', 200, length);
    expect(await externalHttpJson(url)).toEqual({ ok: true });
  }
);
it('accepts exactly the byte boundary', async () => {
  respond('"' + 'x'.repeat(EXTERNAL_HTTP_LIMITS.maxResponseBytes - 2) + '"');
  expect((await externalHttpJson<string>(url)).length).toBe(
    EXTERNAL_HTTP_LIMITS.maxResponseBytes - 2
  );
});
it.each([200, 503])(
  'rejects oversized streamed bodies, including HTTP %s errors',
  async (status) => {
    respond(
      Readable.from([Buffer.alloc(3_000_000), Buffer.alloc(2_000_001)]),
      status,
      '1'
    );
    await expect(externalHttpJson(url, { retries: 2 })).rejects.toMatchObject({
      code: 'EXTERNAL_HTTP_RESPONSE_TOO_LARGE',
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  }
);
it('counts UTF-8 bytes before JSON parsing', async () => {
  respond('"' + 'é'.repeat(2_500_000) + '"');
  await expect(externalHttpJson(url)).rejects.toMatchObject({
    code: 'EXTERNAL_HTTP_RESPONSE_TOO_LARGE',
  });
});
it('sanitizes malformed JSON', async () => {
  respond('private URL and secret body');
  await expect(externalHttpJson(url)).rejects.toMatchObject({
    code: 'EXTERNAL_HTTP_INVALID_JSON',
    message: 'Upstream returned an invalid JSON response.',
  });
});
it('sanitizes network failures', async () => {
  mockedFetch.mockRejectedValue(new Error(url + ' credentials'));
  await expect(externalHttpJson(url)).rejects.toMatchObject({
    code: 'EXTERNAL_HTTP_UPSTREAM_ERROR',
    message: 'External data could not be retrieved. Please retry later.',
  });
});
function pendingBody() {
  const body = new PassThrough();
  mockedFetch.mockImplementationOnce(async (_url, options) => {
    options?.signal?.addEventListener('abort', () =>
      body.destroy(new AbortError('private abort details'))
    );
    return response(body, { size: options?.size });
  });
  return body;
}
it('times out while reading the body and aborts the stream', async () => {
  vi.useFakeTimers();
  const body = pendingBody();
  const result = expect(externalHttpJson(url)).rejects.toMatchObject({
    code: 'EXTERNAL_HTTP_TIMEOUT',
  });
  await vi.advanceTimersByTimeAsync(EXTERNAL_HTTP_LIMITS.timeoutMs);
  await result;
  expect(body.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('honors cancellation during body reading', async () => {
  const controller = new AbortController();
  const body = pendingBody();
  const result = expect(
    externalHttpJson(url, { signal: controller.signal })
  ).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_ABORTED' });
  await Promise.resolve();
  controller.abort();
  await result;
  expect(body.destroyed).toBe(true);
});
it('rejects pre-aborted requests without HTTP', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    externalHttpJson(url, { signal: controller.signal })
  ).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_ABORTED' });
  expect(mockedFetch).not.toHaveBeenCalled();
});
it('does not reset the total deadline for retry backoff', async () => {
  vi.useFakeTimers();
  mockedFetch.mockImplementationOnce(async (_url, options) => {
    await new Promise((resolve) =>
      setTimeout(resolve, EXTERNAL_HTTP_LIMITS.timeoutMs - 100)
    );
    return response('unavailable', { status: 503, size: options?.size });
  });
  const result = expect(
    externalHttpJson(url, { retries: 2 })
  ).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(EXTERNAL_HTTP_LIMITS.timeoutMs);
  await result;
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});
it('retries transient HTTP failures within the budget', async () => {
  respond('unavailable', 503);
  respond('{"id":"R1"}');
  expect(await externalHttpJson(url, { retries: 2 })).toEqual({ id: 'R1' });
  expect(mockedFetch).toHaveBeenCalledTimes(2);
});
it('applies REST protection only with the explicit server option', async () => {
  respond('{"id":"R1"}');
  await orkgRest.getResource('R1', { externalMcp: true });
  expect(mockedFetch.mock.calls[0][1]?.size).toBe(
    EXTERNAL_HTTP_LIMITS.maxResponseBytes
  );
  respond('{"id":"R1"}');
  await orkgRest.getResource('R1');
  expect(mockedFetch.mock.calls[1][1]?.size).toBeUndefined();
});
it('bounds both Ask paper retrieval and semantic search without generation', async () => {
  respond('{"id":"R1","title":"Research"}');
  respond('{"payload":{"items":[]}}');
  await orkgAskService.searchByPaper('R1', { externalMcp: true });
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  for (const [, options] of mockedFetch.mock.calls)
    expect(options?.size).toBe(EXTERNAL_HTTP_LIMITS.maxResponseBytes);
});
it('preserves internal Ask native-fetch behavior', async () => {
  const nativeFetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '{"payload":{"items":[]}}',
  });
  vi.stubGlobal('fetch', nativeFetch);
  await orkgAskService.semanticSearch('research');
  expect(nativeFetch).toHaveBeenCalledTimes(1);
  expect(mockedFetch).not.toHaveBeenCalled();
  expect(nativeFetch.mock.calls[0][1]).not.toHaveProperty('signal');
});

it.each([
  '../R1',
  'R1/../../admin',
  'R1?secret=x',
  'R1#fragment',
  'R%2f1',
  ' R1',
  '..',
])('rejects unsafe external paper ID %s before HTTP', async (id) => {
  await expect(
    orkgAskService.searchByPaper(id, { externalMcp: true })
  ).rejects.toThrow('Invalid ORKG paper ID');
  expect(mockedFetch).not.toHaveBeenCalled();
});
it.each([undefined, 1, 30])(
  'forwards the external Ask limit %s to the HTTP search',
  async (limit) => {
    respond('{"id":"R123","title":"Research"}');
    respond('{"payload":{"items":[]}}');
    await orkgAskService.searchByPaper('R123', { externalMcp: true }, limit);
    expect(String(mockedFetch.mock.calls[0][0])).toBe(
      'https://orkg.test/api/papers/R123'
    );
    const searchUrl = new URL(String(mockedFetch.mock.calls[1][0]));
    expect(searchUrl.searchParams.get('limit')).toBe(String(limit ?? 10));
  }
);
it('preserves internal paper search default even with an external-only limit argument', async () => {
  const nativeFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":"R1","title":"Research"}',
    })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => '{"payload":{"items":[]}}',
    });
  vi.stubGlobal('fetch', nativeFetch);
  await orkgAskService.searchByPaper('R1', undefined, 30);
  expect(new URL(nativeFetch.mock.calls[1][0]).searchParams.get('limit')).toBe(
    '10'
  );
  expect(mockedFetch).not.toHaveBeenCalled();
});
