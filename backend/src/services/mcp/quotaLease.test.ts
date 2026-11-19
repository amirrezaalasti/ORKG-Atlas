import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MCP_QUOTAS } from './quotaScripts.js';
import { McpLeaseError, startQuotaLease } from './quotaLease.js';
import { McpQuotaError } from './quota.js';
import {
  checkExecution,
  executionSignal,
  withMcpExecution,
} from './executionScope.js';
import {EXTERNAL_MCP_LIMITS} from '../../config/mcp.js'

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('budgets the maximum execution deadline, cleanup and a margin for bounded store I/O', () => {
  expect(MCP_QUOTAS.leaseMs).toBe(55_000);
  expect(MCP_QUOTAS.leaseMs).toBe(
    Math.max(
      EXTERNAL_MCP_LIMITS.toolTimeoutMs,
      EXTERNAL_MCP_LIMITS.sparqlTimeoutMs,
      EXTERNAL_MCP_LIMITS.schemaTimeoutMs
    ) +
      MCP_QUOTAS.cleanupAllowanceMs +
      MCP_QUOTAS.leaseSafetyMs
  );
  expect(
    MCP_QUOTAS.renewEveryMs +
      MCP_QUOTAS.storeTimeoutMs +
      MCP_QUOTAS.leaseSafetyMs
  ).toBeLessThan(MCP_QUOTAS.leaseMs);
});

it('verifies ownership before starting, renews without overlap and releases once', async () => {
  const renew = vi.fn().mockResolvedValue(undefined),
    drop = vi.fn().mockResolvedValue(undefined);
  const lease = await startQuotaLease(renew, drop, performance.now());
  expect(renew).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(MCP_QUOTAS.renewEveryMs);
  expect(renew).toHaveBeenCalledTimes(2);
  await lease.release();
  await lease.release();
  expect(drop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(lease.check).toThrow(McpLeaseError);
});

it('refuses a delayed/expired start without renewing or doing work', async () => {
  const renew = vi.fn(),
    drop = vi.fn().mockResolvedValue(undefined);
  await expect(
    startQuotaLease(renew, drop, performance.now() - MCP_QUOTAS.leaseMs)
  ).rejects.toMatchObject({ code: 'MCP_LEASE_LOST' });
  expect(renew).not.toHaveBeenCalled();
  expect(drop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([new McpQuotaError('MCP_QUOTA_UNAVAILABLE'), new McpLeaseError()])(
  'cancels supported work when renewal fails with $code and does not retry',
  async (failure) => {
    const renew = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(failure);
    const drop = vi.fn().mockResolvedValue(undefined);
    const lease = await startQuotaLease(renew, drop, performance.now());
    let stopped = false;
    const work = withMcpExecution(
      () =>
        new Promise((_resolve, reject) => {
          executionSignal()!.addEventListener(
            'abort',
            () => {
              stopped = true;
              reject(new Error('stopped'));
            },
            { once: true }
          );
        }),
      [lease.signal],
      20_000,
      lease.check
    ).catch((e) => e);
    await vi.advanceTimersByTimeAsync(MCP_QUOTAS.renewEveryMs);
    expect(await work).toBe(failure);
    expect(stopped).toBe(true);
    await expect(lease.release()).rejects.toBe(failure);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('rejects a late ownership acknowledgement instead of reviving an expired local lease', async () => {
  let acknowledge!: () => void;
  const drop = vi.fn().mockResolvedValue(undefined);
  const starting = startQuotaLease(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
    drop,
    performance.now()
  );
  vi.setSystemTime(Date.now() + MCP_QUOTAS.leaseMs);
  acknowledge();
  await expect(starting).rejects.toMatchObject({ code: 'MCP_LEASE_LOST' });
  expect(drop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects stale ownership and aborts the execution scope before timers get a turn', async () => {
  const renew = vi.fn().mockResolvedValue(undefined),
    drop = vi.fn().mockResolvedValue(undefined);
  const lease = await startQuotaLease(renew, drop, performance.now());
  const work = withMcpExecution(
    async () => {
      vi.setSystemTime(Date.now() + MCP_QUOTAS.leaseMs);
      expect(() => checkExecution()).toThrow(McpLeaseError);
      expect(executionSignal()?.aborted).toBe(true);
    },
    [lease.signal],
    20_000,
    lease.check
  );
  await expect(work).rejects.toMatchObject({ code: 'MCP_LEASE_LOST' });
  await vi.advanceTimersByTimeAsync(MCP_QUOTAS.renewEveryMs);
  expect(renew).toHaveBeenCalledTimes(1); // No resurrection after the pause.
  await expect(lease.release()).rejects.toMatchObject({
    code: 'MCP_LEASE_LOST',
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('waits for an in-flight renewal before owner-conditional release', async () => {
  let finish!: () => void;
  const renew = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
  const drop = vi.fn().mockResolvedValue(undefined);
  const lease = await startQuotaLease(renew, drop, performance.now());
  await vi.advanceTimersByTimeAsync(MCP_QUOTAS.renewEveryMs);
  await vi.advanceTimersByTimeAsync(MCP_QUOTAS.renewEveryMs * 2);
  expect(renew).toHaveBeenCalledTimes(2);
  const releasing = lease.release();
  expect(drop).not.toHaveBeenCalled();
  finish();
  await releasing;
  expect(drop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('continues renewal through cleanup longer than the original lease and then stops', async () => {
  const renew = vi.fn().mockResolvedValue(undefined),
    drop = vi.fn().mockResolvedValue(undefined);
  const lease = await startQuotaLease(renew, drop, performance.now());
  let cleaned = false;
  const work = withMcpExecution(
    () =>
      new Promise((_resolve, reject) => {
        executionSignal()!.addEventListener(
          'abort',
          () => {
            setTimeout(() => {
              cleaned = true;
              reject(new Error('cleanup complete'));
            }, 40_000);
          },
          { once: true }
        );
      }),
    [lease.signal],
    20_000,
    lease.check
  )
    .finally(() => lease.release())
    .catch((e) => e);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(cleaned).toBe(true);
  expect(renew.mock.calls.length).toBeGreaterThanOrEqual(6);
  expect(drop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
