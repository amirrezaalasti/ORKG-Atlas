import { performance } from 'node:perf_hooks';
import { MCP_QUOTAS } from '../../config/mcp.js';

export class McpLeaseError extends Error {
  readonly code = 'MCP_LEASE_LOST';
  constructor() {
    super('MCP concurrency lease lost. Retry later.');
  }
}

/** Local safety check is conservative; only Redis TTLs recover crashed owners. */
export async function startQuotaLease(
  renew: () => Promise<void>,
  drop: () => Promise<void>,
  acquiredAt: number
) {
  const controller = new AbortController();
  let validUntil = acquiredAt + MCP_QUOTAS.leaseMs - MCP_QUOTAS.leaseSafetyMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopping = false;
  let closed = false;
  let releasePromise: Promise<void> | undefined;
  const check = () => {
    if (closed || performance.now() >= validUntil)
      controller.abort(new McpLeaseError());
    controller.signal.throwIfAborted();
  };
  const refresh = async () => {
    check(); // A stalled process must not revive an expired ownership claim.
    const sentAt = performance.now();
    await renew();
    check(); // Also reject late acknowledgements after local validity elapsed.
    validUntil = sentAt + MCP_QUOTAS.leaseMs - MCP_QUOTAS.leaseSafetyMs;
  };
  const schedule = () => {
    timer = setTimeout(() => {
      pending = refresh()
        .catch((error: unknown) => controller.abort(error))
        .finally(() => {
          pending = undefined;
          if (!stopping && !controller.signal.aborted) schedule();
        });
    }, MCP_QUOTAS.renewEveryMs);
  };
  try {
    await refresh(); // Verify ownership before any tool work, including delayed starts.
  } catch (error) {
    await drop().catch(() => {}); // Owner-conditional cleanup; Redis expiry is the fallback.
    throw error;
  }
  schedule();
  return {
    signal: controller.signal,
    check,
    release() {
      releasePromise ??= (async () => {
        stopping = true;
        clearTimeout(timer);
        await pending; // Prevent an in-flight renewal racing with release.
        try {
          await drop();
          check();
        } finally {
          closed = true;
        }
      })();
      return releasePromise;
    },
  };
}
