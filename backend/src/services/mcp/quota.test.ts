import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fetch, { AbortError, Response } from 'node-fetch';
import { PassThrough } from 'node:stream';
import { consumeMcpRequest, reserveMcpTools, MCP_QUOTAS } from './quota.js';
import { ADMIT_QUOTA, RELEASE_QUOTA, RENEW_QUOTA } from './quotaScripts.js';

vi.mock('node-fetch', async (original) => ({
  ...(await original<typeof import('node-fetch')>()),
  default: vi.fn(),
}));
const http = vi.mocked(fetch);
beforeEach(() => {
  vi.stubEnv('MCP_QUOTA_REDIS_REST_URL', 'https://quota.example.test');
  vi.stubEnv('MCP_QUOTA_REDIS_REST_TOKEN', 'test-only-token');
  vi.stubEnv('MCP_QUOTA_NAMESPACE', 'test');
  http
    .mockReset()
    .mockImplementation(async () => new Response('{"result":[0,0]}'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const call = (id: number, name = 'render_chart') => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name },
});
const command = (index: number) =>
  JSON.parse(String(http.mock.calls[index][1]?.body));

it('uses shared atomic keys and server-controlled weighted batch costs', async () => {
  await consumeMcpRequest();
  await reserveMcpTools([
    call(1),
    call(2, 'orkg_sparql'),
    call(3, 'orkg_sparql_schema'),
  ]);
  const request = command(0),
    batch = command(1);
  expect(request.slice(0, 3)).toEqual(['EVAL', ADMIT_QUOTA, 9]);
  expect(request.slice(3, 12)).toEqual(
    [
      'requests',
      'tools',
      'expensive',
      'schema',
      'active',
      'lease-1',
      'lease-2',
      'lease-3',
      'lease-4',
    ].map((k) => `{test}:mcp:${k}`)
  );
  expect(batch.slice(3, 12)).toEqual(request.slice(3, 12));
  expect(JSON.parse(request[12])).toEqual([1, 0, 0, 0]);
  expect(JSON.parse(batch[12])).toEqual([0, 3, 2, 1]);
  expect(new Set(JSON.parse(batch[13]).map((p: string[]) => p[0])).size).toBe(
    3
  );
  expect(http.mock.calls[0][1]).toMatchObject({
    redirect: 'error',
    size: 4096,
  });
});

it('releases only settled or unused permits and refuses duplicate starts', async () => {
  const reservation = await reserveMcpTools([call(1), call(2)]);
  const permits = JSON.parse(command(0)[13]);
  const lease = await reservation.start(1);
  expect(command(1)[1]).toBe(RENEW_QUOTA);
  expect(JSON.parse(command(1)[8])).toEqual([permits[0][0]]);
  await expect(reservation.start(1)).rejects.toThrow(
    'quota service unavailable'
  );
  await reservation.releaseUnused();
  expect(command(2)).toEqual([
    'EVAL',
    RELEASE_QUOTA,
    5,
    '{test}:mcp:active',
    ...[1, 2, 3, 4].map((i) => `{test}:mcp:lease-${i}`),
    JSON.stringify([permits[1][0]]),
  ]);
  await lease.release();
  expect(JSON.parse(command(3)[8])).toEqual([permits[0][0]]);
  await lease.release();
  await reservation.releaseUnused();
  expect(http).toHaveBeenCalledTimes(4);
});

it.each([
  [1, 59_001, 'MCP_RATE_LIMITED', 60, 429],
  [2, 1000, 'MCP_CONCURRENCY_LIMIT', 1, 429],
  [3, 1000, 'MCP_QUOTA_UNAVAILABLE', 1, 503],
])(
  'maps store status %s to a safe failure',
  async (status, retry, code, retryAfter, httpStatus) => {
    http.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: [status, retry] }))
    );
    await expect(consumeMcpRequest()).rejects.toMatchObject({
      code,
      retryAfter,
      status: httpStatus,
    });
    expect(http).toHaveBeenCalledTimes(1);
  }
);

it.each([
  '',
  'http://quota.example.test',
  'https://user:password@quota.example.test',
  'https://quota.example.test/?token=test',
  'https://quota.example.test/redirect',
])('fails closed on invalid quota configuration: %s', async (url) => {
  vi.stubEnv('MCP_QUOTA_REDIS_REST_URL', url);
  await expect(async () => consumeMcpRequest()).rejects.toMatchObject({
    code: 'MCP_QUOTA_UNAVAILABLE',
  });
  expect(http).not.toHaveBeenCalled();
});
it.each(['MCP_QUOTA_REDIS_REST_TOKEN', 'MCP_QUOTA_NAMESPACE'])(
  'requires %s',
  async (key) => {
    delete process.env[key];
    await expect(async () => consumeMcpRequest()).rejects.toMatchObject({
      code: 'MCP_QUOTA_UNAVAILABLE',
    });
    expect(http).not.toHaveBeenCalled();
  }
);
it.each([
  '{"error":"private provider diagnostic"}',
  '{"result":[0]}',
  '{"result":[5,0]}',
  '{"result":[1,999999999]}',
  'not JSON',
])('rejects invalid provider replies without disclosure: %s', async (body) => {
  http.mockResolvedValueOnce(new Response(body));
  await expect(consumeMcpRequest()).rejects.toMatchObject({
    code: 'MCP_QUOTA_UNAVAILABLE',
    message: 'MCP quota service unavailable.',
  });
});

it('does not retry ambiguous commits or fall back to local state', async () => {
  http.mockRejectedValue(new Error('private URL and credential diagnostic'));
  await expect(consumeMcpRequest()).rejects.toMatchObject({
    code: 'MCP_QUOTA_UNAVAILABLE',
  });
  expect(http).toHaveBeenCalledTimes(1);
});

it.each([
  [call(1), call(1)],
  Array.from({ length: MCP_QUOTAS.maxBatch + 1 }, (_, i) => call(i)),
])(
  'rejects ambiguous or oversized tool batches before Redis admission',
  async (...messages) => {
    await expect(reserveMcpTools(messages)).rejects.toMatchObject({
      code: 'MCP_QUOTA_UNAVAILABLE',
    });
    expect(http).not.toHaveBeenCalled();
  }
);

it('denies lease ownership loss without starting or retrying work', async () => {
  const reservation = await reserveMcpTools(call(1));
  http.mockResolvedValueOnce(new Response('{"result":[4,1000]}'));
  await expect(reservation.start(1)).rejects.toMatchObject({
    code: 'MCP_LEASE_LOST',
  });
  expect(command(1)[1]).toBe(RENEW_QUOTA);
  expect(command(2)[1]).toBe(RELEASE_QUOTA);
  expect(http).toHaveBeenCalledTimes(3);
});

it('uses a fresh owner even when independent invocations reuse a JSON-RPC id', async () => {
  const first = await reserveMcpTools(call(1));
  const second = await reserveMcpTools(call(1));
  expect(JSON.parse(command(0)[13])[0][0]).not.toBe(
    JSON.parse(command(1)[13])[0][0]
  );
  await first.releaseUnused();
  await second.releaseUnused();
});

it.each(['timeout', 'disconnect'])(
  'aborts store body reads on %s and clears timers/listeners',
  async (reason) => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const body = new PassThrough();
    http.mockImplementationOnce(async (_url, options) => {
      options?.signal?.addEventListener('abort', () =>
        body.destroy(new AbortError('stopped'))
      );
      return new Response(body);
    });
    const work = consumeMcpRequest(parent.signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    if (reason === 'timeout')
      await vi.advanceTimersByTimeAsync(MCP_QUOTAS.storeTimeoutMs);
    else parent.abort();
    expect(await work).toMatchObject({ code: 'MCP_QUOTA_UNAVAILABLE' });
    expect(body.destroyed).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  }
);
