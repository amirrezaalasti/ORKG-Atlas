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
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { verifyKeycloakToken } from '../config/keycloak.js';
import * as policy from '../services/mcp/externalToolPolicy.js';
import { toolRegistry } from '../services/mcp/tools.js';
import legacyRouter from './mcp.js';
import { consumeMcpRequest, reserveMcpTools } from '../services/mcp/quota.js';
import externalRouter, {
  EXTERNAL_MCP_PATH,
  EXTERNAL_MCP_BODY_LIMIT,
} from './mcpExternal.js';

vi.mock('../config/keycloak.js', () => ({ verifyKeycloakToken: vi.fn() }));
vi.mock('../config/firebase.js', () => ({ db: { collection: vi.fn() } }));
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

const blocked = [
  'orkg_ask_search',
  'orkg_ask_search_by_paper',
  'orkg_ask',
  'orkg_ask_generate',
  'orkg_ask_synthesize',
  'atlas_template_stats',
  'atlas_search_dynamic_questions',
];
const chart = {
  type: 'bar',
  xKey: 'label',
  yKeys: ['count'],
  data: [{ label: 'Test', count: '3' }],
};
let http: HttpServer;
let base: string;
let url: string;
beforeAll(async () => {
  const app = express();
  // Simulate identity from unrelated upstream middleware; MCP must ignore it.
  app.use((req, _res, next) => {
    Object.assign(req, {
      userId: 'inherited-user',
      userEmail: 'inherited@example.test',
      isAdmin: true,
      isGuest: false,
      conversationId: 'inherited-conversation',
    });
    next();
  });
  app.use(EXTERNAL_MCP_PATH, externalRouter);
  // Model the broad application middleware that MCP must not inherit.
  app.use((_req, res, next) => {
    res.setHeader('X-Application-Middleware', 'reached');
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/mcp', legacyRouter);
  await new Promise<void>((resolve, reject) => {
    http = app.listen(0, '127.0.0.1', resolve);
    http.once('error', reject);
  });
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  url = base + EXTERNAL_MCP_PATH;
});
beforeEach(() => {
  vi.mocked(consumeMcpRequest).mockClear();
  vi.mocked(reserveMcpTools).mockClear();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DISABLE_AUTH', 'true');
  vi.stubEnv('MCP_EXTERNAL_ENABLED', 'true');
  vi.mocked(verifyKeycloakToken)
    .mockReset()
    .mockRejectedValue(
      new Error('Authentication must not run for external MCP')
    );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  if (http)
    await new Promise<void>((resolve) => {
      http.close(() => resolve());
      http.closeAllConnections();
    });
});
interface RpcReply {
  result: {
    protocolVersion: string;
    isError: boolean;
    structuredContent: Record<string, unknown>;
    content: Array<{ type: string; text: string }>;
  };
  error: { code: number };
}
async function rpc(
  method: string,
  params: unknown = {},
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { response, body: (await response.json()) as RpcReply };
}

it('connects the official SDK anonymously and exposes only the external policy', async () => {
  const client = new Client({ name: 'anonymous-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      policy.listExternalTools({ isAdmin: false }).map((tool) => tool.name)
    );
    for (const name of blocked)
      expect(tools.map((tool) => tool.name)).not.toContain(name);
    const result = await client.callTool({
      name: 'render_chart',
      arguments: chart,
    });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      render: 'chart_spec',
      data: { data: [{ label: 'Test', count: 3 }] },
    });
    expect(verifyKeycloakToken).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it.each(blocked)(
  'denies direct external execution of %s even with spoofed context',
  async (name) => {
    const registryCall = vi.spyOn(toolRegistry, 'call');
    const { response, body } = await rpc('tools/call', {
      name,
      arguments: { isAdmin: true, externalMcp: false },
    });
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual({
      ok: false,
      error: `Tool ${name} is not available for external MCP access`,
    });
    expect(registryCall).not.toHaveBeenCalled();
  }
);

it.each(['2025-11-25', '2025-06-18'])(
  'negotiates protocol %s without a session',
  async (protocolVersion) => {
    const { response, body } = await rpc('initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(response.status).toBe(200);
    expect(body.result.protocolVersion).toBe(protocolVersion);
    expect(response.headers.has('mcp-session-id')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('x-application-middleware')).toBe(false);
  }
);

it('handles unknown methods and unsupported protocol-version headers through the SDK', async () => {
  expect((await rpc('unknown/method')).body.error.code).toBe(-32601);
  expect(
    (await rpc('tools/list', {}, { 'MCP-Protocol-Version': '2099-01-01' }))
      .response.status
  ).toBe(400);
});

it('acknowledges anonymous notifications without a response body', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  expect(response.status).toBe(202);
  expect(await response.text()).toBe('');
});

it.each([undefined, '', 'false', '1', 'TRUE'])(
  'is inaccessible without explicit enablement: %s',
  async (enabled) => {
    if (enabled === undefined) delete process.env.MCP_EXTERNAL_ENABLED;
    else vi.stubEnv('MCP_EXTERNAL_ENABLED', enabled);
    const registryCall = vi.spyOn(toolRegistry, 'call');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'render_chart', arguments: chart },
      }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('x-application-middleware')).toBe(false);
    expect(verifyKeycloakToken).not.toHaveBeenCalled();
    expect(registryCall).not.toHaveBeenCalled();
    expect(consumeMcpRequest).not.toHaveBeenCalled();
    expect(reserveMcpTools).not.toHaveBeenCalled();
  }
);

it.each(['', 'Bearer invalid', 'Bearer', 'Basic invalid'])(
  'ignores authorization headers instead of authenticating: %j',
  async (authorization) => {
    const list = vi.spyOn(policy, 'listExternalTools');
    const { response } = await rpc(
      'tools/list',
      {},
      { Authorization: authorization }
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('www-authenticate')).toBe(false);
    expect(list).toHaveBeenCalledWith({ isAdmin: false });
    expect(verifyKeycloakToken).not.toHaveBeenCalled();
  }
);

it('keeps simultaneous requests anonymous despite inherited identity, headers and argument privileges', async () => {
  const call = vi.spyOn(policy, 'callExternalTool');
  const registryCall = vi.spyOn(toolRegistry, 'call');
  const replies = await Promise.all(
    ['test-user-a', 'test-user-b'].map((userId) =>
      rpc(
        'tools/call',
        {
          name: 'render_chart',
          arguments: {
            ...chart,
            userId: 'forged',
            userEmail: 'forged@example.test',
            conversationId: 'forged-conversation',
            isAdmin: true,
            externalMcp: false,
          },
        },
        {
          Authorization: `Bearer ${userId}`,
          'x-user-id': userId,
          'x-user-email': `${userId}@example.test`,
          'x-guest-id': 'forged-guest',
          'x-api-key': 'test-only-key',
          'x-is-admin': 'true',
        }
      )
    )
  );
  expect(replies.every(({ body }) => body.result.isError === false)).toBe(true);
  expect(call.mock.calls.map(([, , ctx]) => ctx)).toEqual([
    { isAdmin: false },
    { isAdmin: false },
  ]);
  expect(registryCall.mock.calls.map(([, , ctx]) => ctx)).toEqual([
    { isAdmin: false, externalMcp: true },
    { isAdmin: false, externalMcp: true },
  ]);
  expect(verifyKeycloakToken).not.toHaveBeenCalled();
});

it.each(['GET', 'HEAD', 'DELETE', 'PUT', 'OPTIONS'])(
  'returns 405 for anonymous unsupported method %s',
  async (method) => {
    const response = await fetch(url, {
      method,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  }
);

it.each([
  'https://orkg-atlas.vercel.app',
  'https://untrusted.vercel.app',
  'null',
])(
  'rejects browser origin %s before the application-wide CORS policy',
  async (origin) => {
    const { response } = await rpc('tools/list', {}, { Origin: origin });
    expect(response.status).toBe(403);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect(response.headers.has('x-application-middleware')).toBe(false);
    expect(verifyKeycloakToken).not.toHaveBeenCalled();
  }
);

it('enforces its JSON type and smaller body boundary before the global parser', async () => {
  const headers = {
    'Content-Type': 'application/json',
  };
  const large = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ value: 'x'.repeat(EXTERNAL_MCP_BODY_LIMIT) }),
  });
  expect(large.status).toBe(413);
  expect(large.headers.has('x-application-middleware')).toBe(false);
  const malformed = await fetch(url, {
    method: 'POST',
    headers,
    body: '{ private body',
  });
  expect(malformed.status).toBe(400);
  expect(await malformed.text()).not.toContain('private');
  const nonJSON = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: '{}',
  });
  expect(nonJSON.status).toBe(415);
});

it('preserves tool errors and sanitizes unexpected handler failures', async () => {
  const invalid = await rpc('tools/call', {
    name: 'render_chart',
    arguments: {},
  });
  expect(invalid.body.result.isError).toBe(true);
  vi.spyOn(toolRegistry.get('render_chart')!, 'handler').mockRejectedValue(
    new Error('private handler diagnostic')
  );
  const failed = await rpc('tools/call', {
    name: 'render_chart',
    arguments: chart,
  });
  expect(failed.body.result.isError).toBe(true);
  expect(JSON.parse(failed.body.result.content[0].text)).toEqual(
    failed.body.result.structuredContent
  );
  expect(JSON.stringify(failed.body)).not.toContain('private');
});

it('leaves the legacy API behavior intact when the external transport is disabled', async () => {
  vi.stubEnv('MCP_EXTERNAL_ENABLED', 'false');
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer test-token' },
  });
  expect(response.status).toBe(404);
  expect(verifyKeycloakToken).not.toHaveBeenCalled();
  const legacy = await fetch(`${base}/api/mcp/tools/list`);
  expect(legacy.status).toBe(200);
  const body = (await legacy.json()) as {
    protocol: string;
    tools: Array<{ name: string }>;
  };
  expect(body.protocol).toBe('orkg-atlas-mcp/1');
  expect(body.tools.map((tool) => tool.name)).toContain('orkg_ask_search');
});

it('keeps legacy authentication independent of anonymous external access', async () => {
  vi.stubEnv('DISABLE_AUTH', 'false');
  const { response } = await rpc('tools/list');
  expect(response.status).toBe(200);
  expect(response.headers.has('www-authenticate')).toBe(false);
  const legacy = await fetch(`${base}/api/mcp/tools/list`);
  expect(legacy.status).toBe(401);
  expect(await legacy.json()).toEqual({
    error: 'Missing or invalid authorization header',
  });
  expect(verifyKeycloakToken).not.toHaveBeenCalled();
});

it.each(['tools/call', 'rpc'])(
  'preserves safe internal %s execution while external MCP is disabled',
  async (path) => {
    vi.stubEnv('MCP_EXTERNAL_ENABLED', 'false');
    const params = { name: 'render_chart', arguments: chart };
    const response = await fetch(`${base}/api/mcp/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        path === 'rpc'
          ? { jsonrpc: '2.0', id: 7, method: 'tools/call', params }
          : params
      ),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result?: unknown };
    expect(path === 'rpc' ? body.result : body).toMatchObject({
      ok: true,
      render: 'chart_spec',
      data: { data: [{ label: 'Test', count: 3 }] },
    });
    expect(consumeMcpRequest).not.toHaveBeenCalled();
    expect(reserveMcpTools).not.toHaveBeenCalled();
  }
);

it('mounts after Helmet and before broad middleware without a demo dependency', () => {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const mount = source.indexOf('app.use(EXTERNAL_MCP_PATH, externalMcpRouter)');
  expect(mount).toBeGreaterThan(0);
  expect(mount).toBeGreaterThan(source.indexOf('helmet({'));
  for (const middleware of [
    'app.use(compression()',
    'app.use(cors(corsOptions))',
    "app.use(express.json({ limit: '10mb' }))",
    "app.use('/api/', createRateLimiter())",
    "app.use('/api/mcp', mcpRouter)",
  ])
    expect(mount).toBeLessThan(source.indexOf(middleware));
  expect(source).not.toContain('mcpLocalDemo');
  expect(
    readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')
  ).not.toContain('mcpExternal');
});
