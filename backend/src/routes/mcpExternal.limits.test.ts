import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import express from 'express';
import {
  createServer,
  request,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolRegistry } from '../services/mcp/tools.js';
import { ok } from '../services/mcp/registry.js';
import * as policy from '../services/mcp/externalToolPolicy.js';
import { EXTERNAL_MCP_LIMITS } from '../services/mcp/executionScope.js';
import externalRouter, { EXTERNAL_MCP_PATH } from './mcpExternal.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { reserveMcpTools } from '../services/mcp/quota.js';
import { executionSignal } from '../services/mcp/executionScope.js';

vi.mock('../services/mcp/quota.js', async (original) => ({
  ...(await original<typeof import('../services/mcp/quota.js')>()),
  consumeMcpRequest: vi.fn().mockResolvedValue(undefined),
  reserveMcpTools: vi.fn(async () => ({
    start: async () => ({
      signal: new AbortController().signal,
      check: () => {},
      release: async () => {},
    }),
    releaseUnused: async () => {},
  })),
}));
vi.mock('../config/mcp.js', async (original) => {
  const actual = await original<typeof import('../config/mcp.js')>();
  return {
    ...actual,
    EXTERNAL_MCP_LIMITS: { ...actual.EXTERNAL_MCP_LIMITS, toolTimeoutMs: 100 },
    MCP_HTTP_TIMEOUT_MS: 350,
  };
});

const chart = {
  type: 'bar',
  xKey: 'label',
  yKeys: ['count'],
  data: [{ label: 'Test', count: 3 }],
};
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};
let server: HttpServer;
let upstream: HttpServer;
let url: string;
let upstreamURL: string;
let started: () => void;
let startedPromise: Promise<void>;
const pending = new Set<ServerResponse>();

beforeAll(async () => {
  // A real local socket that never finishes its JSON body; no ORKG requests.
  upstream = createServer((_req, res) => {
    pending.add(res);
    res.once('close', () => pending.delete(res));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"id":');
    started();
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, '127.0.0.1', resolve)
  );
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const app = express();
  app.use(EXTERNAL_MCP_PATH, externalRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${EXTERNAL_MCP_PATH}`;
});
beforeEach(() => {
  vi.stubEnv('MCP_EXTERNAL_ENABLED', 'true');
  vi.stubEnv('ORKG_API_BASE', upstreamURL);
  startedPromise = new Promise((resolve) => {
    started = resolve;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  for (const listener of [server, upstream]) {
    if (listener)
      await new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      });
  }
});
async function rpc(method: string, params: unknown = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 'limits-test', method, params }),
  });
  const text = await response.text();
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  return {
    response,
    text,
    body: JSON.parse(text) as {
      id: string;
      error: { code: number; data: { code: string } };
      result: {
        isError: boolean;
        structuredContent: { details?: { code: string } };
      };
    },
  };
}

it('preserves successful requests and closes the SDK transport once', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  const { response, body } = await rpc('tools/call', {
    name: 'render_chart',
    arguments: chart,
  });
  expect(response.status).toBe(200);
  expect(body.result.isError).toBe(false);
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it('replaces the whole oversized duplicated result with a small matching JSON-RPC error', async () => {
  const value = { value: 'é'.repeat(EXTERNAL_MCP_LIMITS.maxResponseBytes / 4) };
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  vi.spyOn(toolRegistry.get('render_chart')!, 'handler').mockResolvedValue(
    ok('chart_spec', value)
  );
  const { response, body, text } = await rpc('tools/call', {
    name: 'render_chart',
    arguments: chart,
  });
  expect(response.status).toBe(200);
  expect(body.id).toBe('limits-test');
  expect(body.error.code).toBe(-32603);
  expect(body.error.data.code).toBe('MCP_RESPONSE_TOO_LARGE');
  expect(body).not.toHaveProperty('result');
  expect(Buffer.byteLength(text)).toBeLessThan(256);
});

it('also limits discovery responses rather than just tool data', async () => {
  vi.spyOn(policy, 'listExternalTools').mockReturnValue([
    {
      name: 'render_chart',
      title: 'Test',
      description: 'x'.repeat(EXTERNAL_MCP_LIMITS.maxResponseBytes),
      inputSchema: { type: 'object' },
    },
  ]);
  const { response, body } = await rpc('tools/list');
  expect(response.status).toBe(200);
  expect(body.error.data.code).toBe('MCP_RESPONSE_TOO_LARGE');
});

it('sanitizes unexpected discovery errors and closes the SDK transport', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  vi.spyOn(policy, 'listExternalTools').mockImplementation(() => {
    throw new Error('https://private.example/secret discovery diagnostic');
  });
  const { response, body, text } = await rpc('tools/list');
  expect(response.status).toBe(200);
  expect(body.id).toBe('limits-test');
  expect(body.error.code).toBe(-32603);
  expect(text).not.toMatch(/private|secret|diagnostic/);
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('aborts the downstream socket before reporting a tool deadline error and cleans up', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  const { response, body } = await rpc('tools/call', {
    name: 'orkg_get_resource',
    arguments: { id: 'RPending' },
  });
  expect(response.status).toBe(200);
  expect(body.id).toBe('limits-test');
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent.details?.code).toBe('MCP_TOOL_TIMEOUT');
  await vi.waitFor(() => {
    expect(pending.size).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

it('cancels downstream work and closes the transport when the HTTP client disconnects', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  const call = request(url, { method: 'POST', headers });
  call.on('error', () => {}); // Expected local socket hang-up.
  call.end(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'disconnect',
      method: 'tools/call',
      params: { name: 'orkg_get_resource', arguments: { id: 'RPending' } },
    })
  );
  await startedPromise;
  call.destroy();
  await vi.waitFor(() => {
    expect(pending.size).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

async function batch(ids = [1, 2]) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      ids.map((id) => ({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'render_chart', arguments: chart },
      }))
    ),
  });
  const text = await response.text();
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
    EXTERNAL_MCP_LIMITS.maxResponseBytes
  );
  return {
    response,
    text,
    body: JSON.parse(text) as Array<{
      id: number;
      result: { isError: boolean };
      error: { data: { code: string } };
    }>,
  };
}

it('preserves successful SDK batch replies', async () => {
  const { response, body } = await batch();
  expect(response.status).toBe(200);
  expect(body.map((reply) => reply.id)).toEqual([1, 2]);
  expect(body.every((reply) => reply.result.isError === false)).toBe(true);
});

it.each([
  ['tools/list', [1]],
  ['tools/list', [1, 2]],
  ['tools/call', [1]],
  ['tools/call', [1, 2]],
] as const)(
  'completes %s cancellation for request ids %j and cleans up once',
  async (method, ids) => {
    const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
    const cleaned = new Set<number>();
    const releases = ids.map((id) =>
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        cleaned.add(id);
      })
    );
    const releaseUnused = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn(async (id: number | string) => ({
      signal: new AbortController().signal,
      check: () => {},
      release: releases[ids.findIndex((expected) => expected === id)],
    }));
    vi.mocked(reserveMcpTools).mockResolvedValueOnce({ start, releaseUnused });
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(1_000),
      body: JSON.stringify([
        ...ids.map((id) => ({
          jsonrpc: '2.0',
          id,
          method,
          params:
            method === 'tools/call'
              ? { name: 'render_chart', arguments: chart }
              : {},
        })),
        {
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 1 },
        },
      ]),
    });
    const body = await response.json();
    const replies = Array.isArray(body) ? body : [body];
    expect(response.status).toBe(200);
    expect(replies.map((reply) => reply.id)).toEqual([...ids]);
    if (method === 'tools/list') {
      expect(replies[0]).toMatchObject({
        error: { data: { code: 'MCP_REQUEST_CANCELLED' } },
      });
      expect(start).not.toHaveBeenCalled();
    } else {
      expect(replies[0]).toMatchObject({
        result: {
          isError: true,
          structuredContent: { details: { code: 'MCP_TOOL_CANCELLED' } },
        },
      });
      for (const release of releases) expect(release).toHaveBeenCalledOnce();
      expect(cleaned.size).toBe(ids.length);
    }
    if (ids.length > 1) {
      expect(replies[1]).toHaveProperty('result');
      expect(replies[1]).not.toHaveProperty('error');
      if (method === 'tools/call')
        expect(replies[1].result.isError).toBe(false);
    }
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
      expect(releaseUnused).toHaveBeenCalledOnce();
    });
  }
);

it('ignores cancellation of an unknown id before a later request uses it', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(1_000),
    body: JSON.stringify([
      {
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 1 },
      },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'render_chart', arguments: chart },
      },
    ]),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: 1,
    result: { isError: false },
  });
});

it('completes a batch in which every request is cancelled', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(1_000),
    body: JSON.stringify([
      ...[1, 2].map((id) => ({ jsonrpc: '2.0', id, method: 'tools/list' })),
      ...[1, 2].map((requestId) => ({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId },
      })),
    ]),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    [1, 2].map((id) => ({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: expect.stringContaining('MCP request cancelled.'),
        data: { code: 'MCP_REQUEST_CANCELLED' },
      },
    }))
  );
});

it('terminates the HTTP lifecycle and closes transport when the SDK produces no reply', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  vi.spyOn(StreamableHTTPServerTransport.prototype, 'send').mockResolvedValue();
  const release = vi.fn().mockResolvedValue(undefined);
  const releaseUnused = vi.fn().mockResolvedValue(undefined);
  vi.mocked(reserveMcpTools).mockResolvedValueOnce({
    start: vi.fn(async () => ({
      signal: new AbortController().signal,
      check: () => {},
      release,
    })),
    releaseUnused,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(1_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'suppressed',
      method: 'tools/call',
      params: { name: 'render_chart', arguments: chart },
    }),
  });
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({
    jsonrpc: '2.0',
    id: null,
    error: { data: { code: 'MCP_HTTP_TIMEOUT' } },
  });
  await vi.waitFor(() => {
    expect(close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(releaseUnused).toHaveBeenCalledOnce();
  });
});

it('bounds an unfinished body upload before SDK setup', async () => {
  const connect = vi.spyOn(Server.prototype, 'connect');
  const call = request(url, { method: 'POST', headers });
  try {
    const response = new Promise<number | undefined>((resolve, reject) => {
      call.once('error', reject);
      call.once('response', (res) => {
        res.resume();
        res.once('end', () => resolve(res.statusCode));
      });
    });
    call.setTimeout(1_000, () =>
      call.destroy(new Error('test client timed out'))
    );
    call.write('{"jsonrpc":');
    expect(await response).toBe(504);
    expect(connect).not.toHaveBeenCalled();
  } finally {
    call.destroy();
  }
});

it('closes a transport whose SDK startup never settles at the HTTP deadline', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  vi.spyOn(
    StreamableHTTPServerTransport.prototype,
    'start'
  ).mockImplementationOnce(() => new Promise(() => {}));
  const releaseUnused = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn();
  vi.mocked(reserveMcpTools).mockResolvedValueOnce({ start, releaseUnused });
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(1_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'startup',
      method: 'tools/list',
    }),
  });
  expect(response.status).toBe(504);
  await response.text();
  await vi.waitFor(() => {
    expect(close).toHaveBeenCalledOnce();
    expect(releaseUnused).toHaveBeenCalledOnce();
  });
  expect(start).not.toHaveBeenCalled();
});

it('ends HTTP and closes transport without releasing a tool still performing cancellation cleanup', async () => {
  const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
  const release = vi.fn().mockResolvedValue(undefined);
  const releaseUnused = vi.fn().mockResolvedValue(undefined);
  vi.mocked(reserveMcpTools).mockResolvedValueOnce({
    start: vi.fn(async () => ({
      signal: new AbortController().signal,
      check: () => {},
      release,
    })),
    releaseUnused,
  });
  let finish!: () => void;
  let aborted = false;
  vi.spyOn(
    toolRegistry.get('orkg_sparql_schema')!,
    'handler'
  ).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        finish = () => reject(new Error('cleanup complete'));
        executionSignal()!.addEventListener(
          'abort',
          () => {
            aborted = true;
          },
          { once: true }
        );
      })
  );
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(1_000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'cleanup',
        method: 'tools/call',
        params: { name: 'orkg_sparql_schema', arguments: { templateId: 'R1' } },
      }),
    });
    expect(response.status).toBe(504);
    await response.text();
    expect(aborted).toBe(true);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(release).not.toHaveBeenCalled();
  } finally {
    finish();
  }
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  expect(close).toHaveBeenCalledOnce();
  expect(releaseUnused).toHaveBeenCalledOnce();
});

it('limits the aggregate batch even when each individual response fits', async () => {
  const value = { value: 'x'.repeat(EXTERNAL_MCP_LIMITS.maxResponseBytes / 4) };
  vi.spyOn(toolRegistry.get('render_chart')!, 'handler').mockResolvedValue(
    ok('chart_spec', value)
  );
  const { response, body, text } = await batch();
  expect(response.status).toBe(200);
  expect(body.map((reply) => reply.id)).toEqual([1, 2]);
  expect(
    body.every((reply) => reply.error.data.code === 'MCP_RESPONSE_TOO_LARGE')
  ).toBe(true);
  expect(Buffer.byteLength(text)).toBeLessThan(512);
});

it('rejects duplicate batch ids before executing ambiguous requests', async () => {
  const registryCall = vi.spyOn(toolRegistry, 'call');
  const { response, text } = await batch([1, 1]);
  expect(response.status).toBe(400);
  const body = JSON.parse(text) as { id: null; error: { code: number } };
  expect(body.id).toBeNull();
  expect(body.error.code).toBe(-32600);
  expect(registryCall).not.toHaveBeenCalled();
});

it.each(['handler setup', 'transport start', 'connect before attachment'])(
  'sanitizes %s failures and releases unused reservations',
  async (failure) => {
    const close = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
    if (failure === 'handler setup')
      vi.spyOn(Server.prototype, 'setRequestHandler').mockImplementationOnce(
        () => {
          throw new Error('private setup diagnostic');
        }
      );
    if (failure === 'transport start')
      vi.spyOn(
        StreamableHTTPServerTransport.prototype,
        'start'
      ).mockRejectedValueOnce(new Error('private transport diagnostic'));
    if (failure === 'connect before attachment')
      vi.spyOn(Server.prototype, 'connect').mockRejectedValueOnce(
        new Error('private connect diagnostic')
      );
    const releaseUnused = vi.fn().mockResolvedValue(undefined);
    vi.mocked(reserveMcpTools).mockResolvedValueOnce({
      start: vi.fn(),
      releaseUnused,
    });
    const { response, body, text } = await rpc('tools/list');
    expect(response.status).toBe(500);
    expect(body.error.code).toBe(-32603);
    expect(text).not.toContain('private');
    await vi.waitFor(() => expect(releaseUnused).toHaveBeenCalledOnce());
    expect(close).toHaveBeenCalledTimes(failure === 'handler setup' ? 0 : 1);
  }
);

it('sanitizes unexpected ownership errors before any tool starts', async () => {
  vi.mocked(reserveMcpTools).mockResolvedValueOnce({
    start: vi.fn().mockRejectedValue(new Error('private lease diagnostic')),
    releaseUnused: vi.fn().mockResolvedValue(undefined),
  });
  const invoke = vi.spyOn(toolRegistry, 'call');
  const { response, body, text } = await rpc('tools/call', {
    name: 'render_chart',
    arguments: chart,
  });
  expect(response.status).toBe(200);
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent.details?.code).toBe(
    'EXTERNAL_TOOL_EXECUTION_ERROR'
  );
  expect(text).not.toContain('private');
  expect(invoke).not.toHaveBeenCalled();
});
