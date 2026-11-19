import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import fetch from 'node-fetch';
import type { RequestId } from '@modelcontextprotocol/sdk/types.js';
import { ADMIT_QUOTA, RELEASE_QUOTA, RENEW_QUOTA } from './quotaScripts.js';
import { McpLeaseError, startQuotaLease } from './quotaLease.js';
import { MCP_QUOTAS } from '../../config/mcp.js';
export { MCP_QUOTAS } from '../../config/mcp.js';

export class McpQuotaError extends Error {
  constructor(
    readonly code:
      | 'MCP_RATE_LIMITED'
      | 'MCP_CONCURRENCY_LIMIT'
      | 'MCP_QUOTA_UNAVAILABLE',
    readonly retryAfter = MCP_QUOTAS.retryAfterMs / 1000
  ) {
    super(
      code === 'MCP_QUOTA_UNAVAILABLE'
        ? 'MCP quota service unavailable.'
        : 'MCP capacity exceeded. Retry later.'
    );
  }
  get status() {
    return this.code === 'MCP_QUOTA_UNAVAILABLE' ? 503 : 429;
  }
}

function configuration() {
  const url = new URL(process.env.MCP_QUOTA_REDIS_REST_URL ?? '');
  const token = process.env.MCP_QUOTA_REDIS_REST_TOKEN;
  const namespace = process.env.MCP_QUOTA_NAMESPACE;
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !token?.trim() ||
    !namespace ||
    !new RegExp(`^[a-zA-Z0-9_-]{1,${MCP_QUOTAS.namespaceMaxLength}}$`).test(
      namespace
    )
  )
    throw new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
  const prefix = `{${namespace}}:mcp`;
  return {
    url: url.toString(),
    token,
    keys: [
      'requests',
      'tools',
      'expensive',
      'schema',
      'active',
      ...Array.from(
        { length: MCP_QUOTAS.activeTools },
        (_, i) => `lease-${i + 1}`
      ),
    ].map((key) => `${prefix}:${key}`),
  };
}
type Configuration = ReturnType<typeof configuration>;

/** No retries: an ambiguous commit must deny work, not acquire twice. */
async function evaluate(
  config: Configuration,
  script: string,
  keys: string[],
  args: string[],
  signal?: AbortSignal
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, MCP_QUOTAS.storeTimeoutMs);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args]),
      redirect: 'error',
      signal: controller.signal,
      size: MCP_QUOTAS.storeMaxResponseBytes,
    });
    const value = (await response.json()) as { result?: unknown };
    controller.signal.throwIfAborted();
    if (!response.ok || !Array.isArray(value.result)) throw new Error();
    const [status, retry] = value.result;
    if (
      value.result.length !== 2 ||
      !Number.isInteger(status) ||
      ![0, 1, 2, 3, 4].includes(status) ||
      !Number.isInteger(retry) ||
      retry < 0 ||
      retry > MCP_QUOTAS.windowMs
    )
      throw new Error();
    if (status === 4) throw new McpLeaseError();
    if (status !== 0)
      throw new McpQuotaError(
        status === 1
          ? 'MCP_RATE_LIMITED'
          : status === 2
            ? 'MCP_CONCURRENCY_LIMIT'
            : 'MCP_QUOTA_UNAVAILABLE',
        Math.max(1, Math.ceil(retry / 1000))
      );
  } catch (error) {
    if (error instanceof McpQuotaError || error instanceof McpLeaseError)
      throw error;
    // Never return URLs, credentials, provider responses or connection details.
    throw new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function configured() {
  try {
    return configuration();
  } catch {
    throw new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
  }
}

export function consumeMcpRequest(signal?: AbortSignal) {
  const config = configured();
  return evaluate(
    config,
    ADMIT_QUOTA,
    config.keys,
    ['[1,0,0,0]', '[]'],
    signal
  );
}

export function toolQuotaClass(name: unknown) {
  return name === 'orkg_sparql_schema'
    ? 'schema'
    : name === 'orkg_sparql'
      ? 'expensive'
      : 'standard';
}

/** One atomic reservation for a whole batch; never start a partial batch. */
export async function reserveMcpTools(body: unknown, signal?: AbortSignal) {
  const config = configured();
  const calls = (Array.isArray(body) ? body : [body]).filter(
    (message) =>
      message?.method === 'tools/call' &&
      (typeof message.id === 'string' || typeof message.id === 'number')
  );
  const permits = new Map(
    calls.map((call) => [
      call.id as RequestId,
      {
        token: randomUUID(),
        kind: toolQuotaClass(call.params?.name),
        started: false,
      },
    ])
  );
  if (calls.length > MCP_QUOTAS.maxBatch || permits.size !== calls.length)
    throw new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
  const acquiredAt = performance.now();
  if (permits.size) {
    const values = [...permits.values()];
    await evaluate(
      config,
      ADMIT_QUOTA,
      config.keys,
      [
        JSON.stringify([
          0,
          values.length,
          values.filter((p) => p.kind !== 'standard').length,
          values.filter((p) => p.kind === 'schema').length,
        ]),
        JSON.stringify(values.map((p) => [p.token, p.kind])),
      ],
      signal
    );
  }
  const release = async (ids: RequestId[]) => {
    const tokens = ids.flatMap((id) => {
      const permit = permits.get(id);
      return permit ? [permit.token] : [];
    });
    if (!tokens.length) return;
    // Cleanup deliberately uses its own bounded request, even after disconnect.
    try {
      await evaluate(config, RELEASE_QUOTA, config.keys.slice(4), [
        JSON.stringify(tokens),
      ]);
    } catch (error) {
      console.warn('MCP quota cleanup failed; leases will expire in Redis.');
      throw error;
    }
    for (const id of ids) permits.delete(id);
  };
  return {
    async start(id: RequestId) {
      const permit = permits.get(id);
      if (!permit || permit.started)
        throw new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
      permit.started = true;
      return startQuotaLease(
        () =>
          evaluate(config, RENEW_QUOTA, config.keys.slice(4), [
            JSON.stringify([permit.token]),
          ]),
        () => release([id]),
        acquiredAt
      );
    },
    releaseUnused: () =>
      release([...permits].filter(([, p]) => !p.started).map(([id]) => id)),
  };
}

export type McpReservation = Awaited<ReturnType<typeof reserveMcpTools>>;
