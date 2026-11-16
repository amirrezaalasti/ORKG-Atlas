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
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import nodeFetch, { Response } from 'node-fetch';
import { MCP_QUOTAS } from '../services/mcp/quota.js';
import {
  ADMIT_QUOTA,
  RELEASE_QUOTA,
  RENEW_QUOTA,
} from '../services/mcp/quotaScripts.js';
import { reserveMcpTools } from '../services/mcp/quota.js';
import { toolRegistry } from '../services/mcp/tools.js';
import { ok } from '../services/mcp/registry.js';
import { executionSignal } from '../services/mcp/executionScope.js';
import * as execution from '../services/mcp/executionScope.js';
import { EXTERNAL_MCP_LIMITS } from '../config/mcp.js';
import router, { EXTERNAL_MCP_PATH } from './mcpExternal.js';

vi.mock('node-fetch', async (original) => ({
  ...(await original<typeof import('node-fetch')>()),
  default: vi.fn(),
}));
vi.mock('../config/mcp.js', async (original) => {
  const actual = await original<typeof import('../config/mcp.js')>();
  return {
    ...actual,
    EXTERNAL_MCP_LIMITS: { ...actual.EXTERNAL_MCP_LIMITS, toolTimeoutMs: 500 },
  };
});
let server: Server, url: string;
let counts: number[];
const active = new Map<string, string>();
const expires = new Map<string, number>();
const http = vi.mocked(nodeFetch);
// Contract mock for atomic Redis admission. No provider/network or Lua engine.
function store(command: unknown[]) {
  for (const [owner, deadline] of expires) {
    if (deadline <= Date.now()) {
      active.delete(owner);
      expires.delete(owner);
    }
  }
  const script = command[1];
  const args = command.slice(3 + Number(command[2]));
  if (script === RELEASE_QUOTA) {
    for (const token of JSON.parse(String(args[0]))) {
      active.delete(token);
      expires.delete(token);
    }
    return [0, 0];
  }
  if (script === RENEW_QUOTA) {
    const owners: string[] = JSON.parse(String(args[0]));
    if (owners.some((owner) => !active.has(owner))) return [4, 1000];
    for (const owner of owners)
      expires.set(owner, Date.now() + MCP_QUOTAS.leaseMs);
    return [0, 0];
  }
  expect(script).toBe(ADMIT_QUOTA);
  const costs: number[] = JSON.parse(String(args[0]));
  const permits: string[][] = JSON.parse(String(args[1]));
  const kinds = [...active.values()];
  if (
    active.size + permits.length > MCP_QUOTAS.activeTools ||
    kinds.filter((k) => k !== 'standard').length + costs[2] >
      MCP_QUOTAS.activeExpensive ||
    kinds.filter((k) => k === 'schema').length + costs[3] >
      MCP_QUOTAS.activeSchema
  )
    return [2, 1000];
  if (costs.some((cost, i) => counts[i] + cost > [60, 30, 6, 2][i]))
    return [1, 60000];
  counts = counts.map((count, i) => count + costs[i]);
  for (const [token, kind] of permits) {
    active.set(token, kind);
    expires.set(token, Date.now() + MCP_QUOTAS.leaseMs);
  }
  return [0, 0];
}
beforeAll(async () => {
  const app = express();
  app.use(EXTERNAL_MCP_PATH, router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${EXTERNAL_MCP_PATH}`;
});
beforeEach(() => {
  vi.stubEnv('MCP_EXTERNAL_ENABLED', 'true');
  vi.stubEnv('MCP_QUOTA_REDIS_REST_URL', 'https://quota.example.test');
  vi.stubEnv('MCP_QUOTA_REDIS_REST_TOKEN', 'test-only-token');
  vi.stubEnv('MCP_QUOTA_NAMESPACE', 'abuse-test');
  counts = [0, 0, 0, 0];
  active.clear();
  expires.clear();
  http
    .mockReset()
    .mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify({ result: store(JSON.parse(String(options?.body))) })
        )
    );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
});
const chart = {
  type: 'bar',
  xKey: 'label',
  yKeys: ['n'],
  data: [{ label: 'Test', n: 1 }],
};
function message(name = 'render_chart', id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments:
        name === 'orkg_sparql'
          ? { query: 'SELECT ?o WHERE { orkgr:R1 orkgp:P1 ?o } LIMIT 1' }
          : name === 'orkg_sparql_schema'
            ? { templateId: 'RMock' }
            : chart,
    },
  };
}
async function rpc(
  body: unknown = message(),
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as {
      result: {
        isError: boolean;
        structuredContent: { details: { code: string } };
      };
      error: { code: number; data: { code: string } };
    },
  };
}

it('admits normal anonymous requests and releases settled work', async () => {
  const { response, body } = await rpc();
  expect(response.status).toBe(200);
  expect(body.result.isError).toBe(false);
  expect(counts).toEqual([1, 1, 0, 0]);
  expect(active.size).toBe(0);
});

it.each([
  ['render_chart', EXTERNAL_MCP_LIMITS.toolTimeoutMs],
  ['orkg_sparql', EXTERNAL_MCP_LIMITS.sparqlTimeoutMs],
  ['orkg_sparql_schema', EXTERNAL_MCP_LIMITS.schemaTimeoutMs],
] as const)(
  'connects the configured %s deadline and lease check',
  async (name, timeout) => {
    const scope = vi.spyOn(execution, 'withMcpExecution');
    vi.spyOn(toolRegistry.get(name)!, 'handler').mockResolvedValue(
      ok('text', {})
    );
    const { response, body } = await rpc(message(name));
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(false);
    expect(scope).toHaveBeenCalledWith(
      expect.any(Function),
      expect.arrayContaining([expect.any(AbortSignal)]),
      timeout,
      expect.any(Function)
    );
    expect(active.size).toBe(0);
  }
);

it('shares request quotas despite spoofed forwarding, identity and auth headers', async () => {
  const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  for (let i = 0; i < MCP_QUOTAS.requestsPerMinute; i++)
    expect((await rpc(list)).response.status).toBe(200);
  const { response, body } = await rpc(list, {
    'X-Forwarded-For': '203.0.113.99',
    'X-Real-IP': '203.0.113.98',
    'X-Vercel-Forwarded-For': '203.0.113.97',
    Forwarded: 'for=203.0.113.96',
    'X-User-Id': 'admin',
    'X-Is-Admin': 'true',
    Authorization: 'Bearer ignored',
    Cookie: 'session=ignored',
  });
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('60');
  expect(body.error.data.code).toBe('MCP_RATE_LIMITED');
  expect(
    http.mock.calls.every(
      ([, options]) => !String(options?.body).includes('203.0.113')
    )
  ).toBe(true);
});

it('rejects a whole weighted batch when its tool budget is exhausted', async () => {
  counts[1] = MCP_QUOTAS.toolsPerMinute - 1;
  const invoke = vi.spyOn(toolRegistry, 'call');
  const { response, body } = await rpc([
    message('render_chart', 1),
    message('render_chart', 2),
  ]);
  expect(response.status).toBe(429);
  expect(body.error.data.code).toBe('MCP_RATE_LIMITED');
  expect(invoke).not.toHaveBeenCalled();
  expect(active.size).toBe(0);
  expect(counts[1]).toBe(MCP_QUOTAS.toolsPerMinute - 1);
});

it.each([
  ['orkg_sparql', 2, 6],
  ['orkg_sparql_schema', 1, 2],
] as const)(
  'applies stricter %s quotas and active-invocation caps',
  async (name, capacity, rate) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handler = vi
      .spyOn(toolRegistry.get(name)!, 'handler')
      .mockImplementation(async () => {
        await pending;
        return ok('text', {});
      });
    const running = Array.from({ length: capacity }, () => rpc(message(name)));
    try {
      await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(capacity));
      const rejected = await rpc(message(name));
      expect(rejected.response.status).toBe(429);
      expect(rejected.response.headers.get('retry-after')).toBe('1');
      expect(rejected.body.error.data.code).toBe('MCP_CONCURRENCY_LIMIT');
    } finally {
      finish();
      await Promise.all(running);
    }
    expect(active.size).toBe(0);
    counts[name === 'orkg_sparql' ? 2 : 3] = rate;
    expect((await rpc(message(name))).body.error.data.code).toBe(
      'MCP_RATE_LIMITED'
    );
  }
);

it('enforces the shared cap across distinct concurrent HTTP requests', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handler = vi
    .spyOn(toolRegistry.get('render_chart')!, 'handler')
    .mockImplementation(async () => {
      await pending;
      return ok('chart_spec', chart);
    });
  const running = Array.from({ length: 4 }, () => rpc());
  try {
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(4));
    expect((await rpc()).body.error.data.code).toBe('MCP_CONCURRENCY_LIMIT');
    expect(active.size).toBe(4);
  } finally {
    finish();
    await Promise.all(running);
  }
  expect(active.size).toBe(0);
});

it.each(['missing', 'offline', 'malformed', 'uninitialized'])(
  'fails closed when required infrastructure is %s',
  async (reason) => {
    const invoke = vi.spyOn(toolRegistry, 'call');
    if (reason === 'missing') delete process.env.MCP_QUOTA_REDIS_REST_TOKEN;
    else if (reason === 'offline')
      http.mockRejectedValue(new Error('private connection diagnostic'));
    else
      http.mockResolvedValue(
        new Response(
          reason === 'malformed' ? 'private response' : '{"result":[3,1000]}'
        )
      );
    const { response, body } = await rpc();
    expect(response.status).toBe(503);
    expect(body.error.data.code).toBe('MCP_QUOTA_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('private');
    expect(invoke).not.toHaveBeenCalled();
  }
);

it('bounds batch size before tool reservation', async () => {
  const invoke = vi.spyOn(toolRegistry, 'call');
  const { response, body } = await rpc(
    Array.from({ length: 5 }, (_, i) => message('render_chart', i))
  );
  expect(response.status).toBe(400);
  expect(body.error.code).toBe(-32600);
  expect(invoke).not.toHaveBeenCalled();
  expect(active.size).toBe(0);
  expect(http).toHaveBeenCalledTimes(1);
});

it('releases unused permits on SDK protocol rejection', async () => {
  const { response } = await rpc(message(), { Accept: 'application/json' });
  expect(response.status).toBe(406);
  expect(active.size).toBe(0);
});

it.each(['SELECT * WHERE { ?s ?p ?o } LIMIT 1', 'ASK {}'])(
  'rejects forbidden public SPARQL before any tool/upstream execution: %s',
  async (query) => {
    const invoke = vi.spyOn(toolRegistry, 'call');
    const call = message('orkg_sparql');
    call.params.arguments = { query };
    const { response, body } = await rpc(call);
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.details.code).toBe(
      'MCP_SPARQL_COST_REJECTED'
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(active.size).toBe(0);
  }
);

it('holds a permit through timeout cancellation and asynchronous cleanup', async () => {
  let cleaned = false;
  vi.spyOn(toolRegistry.get('render_chart')!, 'handler').mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        executionSignal()!.addEventListener(
          'abort',
          () => {
            setTimeout(() => {
              expect(active.size).toBe(1);
              cleaned = true;
              reject(new Error('stopped'));
            }, 10);
          },
          { once: true }
        );
      })
  );
  const { response, body } = await rpc();
  expect(response.status).toBe(200);
  expect(body.result.structuredContent.details.code).toBe('MCP_TOOL_TIMEOUT');
  expect(cleaned).toBe(true);
  expect(active.size).toBe(0);
});

it('does not execute after an ambiguous admission commit or reset its reserved permit', async () => {
  const invoke = vi.spyOn(toolRegistry, 'call');
  http.mockImplementation(async (_url, options) => {
    const command = JSON.parse(String(options?.body));
    const result = store(command);
    if (command[1] === ADMIT_QUOTA && JSON.parse(command[12])[1] > 0)
      throw new Error('lost commit acknowledgement');
    return new Response(JSON.stringify({ result }));
  });
  expect((await rpc()).response.status).toBe(503);
  expect(invoke).not.toHaveBeenCalled();
  expect(active.size).toBe(1);
  expect(http).toHaveBeenCalledTimes(2);
});

it('returns an error and retains capacity if permit release cannot be confirmed', async () => {
  const logging = vi.spyOn(console, 'warn').mockImplementation(() => {});
  http.mockImplementation(async (_url, options) => {
    const command = JSON.parse(String(options?.body));
    if (command[1] === RELEASE_QUOTA) throw new Error('release unavailable');
    return new Response(JSON.stringify({ result: store(command) }));
  });
  const { body } = await rpc();
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent.details.code).toBe(
    'MCP_QUOTA_UNAVAILABLE'
  );
  expect(active.size).toBe(1);
  expect(logging).toHaveBeenCalledWith(
    'MCP quota cleanup failed; leases will expire in Redis.'
  );
});

it('recovers expired crash leases and ignores late releases from old owners with the same request ids', async () => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  const body = Array.from({ length: 4 }, (_, i) => message('render_chart', i));
  const crashed = await reserveMcpTools(body);
  const old = await crashed.start(0);
  const oldOwners = [...active.keys()];
  // Simulate process death: no release, renewal or local recovery callbacks run.
  vi.clearAllTimers();
  await vi.advanceTimersByTimeAsync(MCP_QUOTAS.leaseMs + 1);
  const replacement = await reserveMcpTools(body);
  const newOwners = [...active.keys()];
  expect(active.size).toBe(4);
  expect(newOwners.every((owner) => !oldOwners.includes(owner))).toBe(true);
  await expect(old.release()).rejects.toMatchObject({ code: 'MCP_LEASE_LOST' });
  await crashed.releaseUnused();
  expect([...active.keys()]).toEqual(newOwners);
  await replacement.releaseUnused();
  expect(active.size).toBe(0);
});

it('does not start work if the Redis owner verification rejects an expired lease', async () => {
  const invoke = vi.spyOn(toolRegistry, 'call');
  http.mockImplementation(async (_url, options) => {
    const command = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        result: command[1] === RENEW_QUOTA ? [4, 1000] : store(command),
      })
    );
  });
  const { body } = await rpc();
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent.details.code).toBe('MCP_LEASE_LOST');
  expect(invoke).not.toHaveBeenCalled();
  expect(active.size).toBe(0);
});
