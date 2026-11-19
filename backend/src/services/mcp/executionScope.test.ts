import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  EXTERNAL_MCP_LIMITS,
  checkExecution,
  executionSignal,
  withMcpExecution,
} from './executionScope.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('uses conservative production defaults and clears timers on success', async () => {
  expect(EXTERNAL_MCP_LIMITS).toMatchObject({
    maxResponseBytes: 3 * 1024 * 1024,
    toolTimeoutMs: 20_000,
  });
  expect(
    await withMcpExecution(async () => {
      expect(executionSignal()?.aborted).toBe(false);
      return 'done';
    })
  ).toBe('done');
  expect(executionSignal()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts real work and waits for asynchronous cleanup before returning a timeout', async () => {
  let cleaned = false;
  let settled = false;
  const work = withMcpExecution(
    () =>
      new Promise((_resolve, reject) => {
        executionSignal()!.addEventListener(
          'abort',
          () => {
            setTimeout(() => {
              cleaned = true;
              reject(new Error('operation stopped'));
            }, 5);
          },
          { once: true }
        );
      }),
    [],
    20
  ).catch((error) => {
    settled = true;
    return error;
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(settled).toBe(false);
  expect(cleaned).toBe(false);
  await vi.advanceTimersByTimeAsync(5);
  expect(await work).toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(cleaned).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects pre-cancelled work and removes parent listeners', async () => {
  const parent = new AbortController();
  parent.abort();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  const operation = vi.fn();
  await expect(
    withMcpExecution(operation, [parent.signal])
  ).rejects.toMatchObject({ code: 'MCP_TOOL_CANCELLED' });
  expect(operation).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('checks elapsed time after synchronous work even before the timer can fire', async () => {
  const work = withMcpExecution(async () => {
    vi.setSystemTime(Date.now() + 21_000);
    return 'too late';
  });
  await expect(work).rejects.toMatchObject({ code: 'MCP_TOOL_TIMEOUT' });
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps cancellation request-local and leaves out-of-scope callers unchanged', async () => {
  const first = new AbortController();
  const second = new AbortController();
  let secondSignal: AbortSignal | undefined;
  let finishSecond!: () => void;
  const cancelled = withMcpExecution(
    () =>
      new Promise((_resolve, reject) => {
        executionSignal()!.addEventListener(
          'abort',
          () => reject(new Error('stopped')),
          { once: true }
        );
      }),
    [first.signal]
  ).catch((error) => error);
  const successful = withMcpExecution(
    () =>
      new Promise<void>((resolve) => {
        secondSignal = executionSignal();
        finishSecond = resolve;
      }),
    [second.signal]
  );
  first.abort();
  expect(await cancelled).toMatchObject({ code: 'MCP_TOOL_CANCELLED' });
  expect(secondSignal?.aborted).toBe(false);
  finishSecond();
  await successful;
  expect(executionSignal()).toBeUndefined();
  expect(() => checkExecution()).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
