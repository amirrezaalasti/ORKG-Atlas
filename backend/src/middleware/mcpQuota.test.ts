import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  consumeMcpRequest,
  reserveMcpTools,
  McpQuotaError,
} from '../services/mcp/quota.js';
import { limitMcpRequests, reserveMcpToolQuota } from './mcpQuota.js';

vi.mock('../services/mcp/quota.js', async (original) => ({
  ...(await original<typeof import('../services/mcp/quota.js')>()),
  consumeMcpRequest: vi.fn(),
  reserveMcpTools: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});
function response() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    locals: {},
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  });
}
it.each([
  [new McpQuotaError('MCP_RATE_LIMITED', 12), 429, 12],
  [new McpQuotaError('MCP_CONCURRENCY_LIMIT'), 429, 1],
  [new Error('private URL and credentials'), 503, 1],
] as const)(
  'maps admission failure to a safe HTTP response',
  async (error, status, retry) => {
    vi.mocked(consumeMcpRequest).mockRejectedValue(error);
    const res = response(),
      next = vi.fn();
    await limitMcpRequests({} as Request, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', retry);
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(
      /private|credentials/
    );
    expect(res.listenerCount('close')).toBe(0);
  }
);

it.each([{ body: { id: 'request' } }, { body: [{ id: 'batch' }] }])(
  'correlates only single parsed requests on failure',
  async ({ body }) => {
    vi.mocked(reserveMcpTools).mockRejectedValue(
      new McpQuotaError('MCP_RATE_LIMITED')
    );
    const res = response(),
      next = vi.fn();
    await reserveMcpToolQuota(
      { body } as Request,
      res as unknown as Response,
      next
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: Array.isArray(body) ? null : 'request' })
    );
  }
);

it('cancels store I/O on disconnect and removes the close listener', async () => {
  const res = response(),
    next = vi.fn();
  let signal: AbortSignal | undefined;
  vi.mocked(consumeMcpRequest).mockImplementation(
    (parent) =>
      new Promise((_resolve, reject) => {
        signal = parent;
        parent!.addEventListener('abort', () => reject(new Error('stopped')), {
          once: true,
        });
      })
  );
  const pending = limitMcpRequests(
    {} as Request,
    res as unknown as Response,
    next
  );
  res.destroyed = true;
  res.emit('close');
  await pending;
  expect(signal?.aborted).toBe(true);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
  expect(res.listenerCount('close')).toBe(0);
});

it('releases unused reservations if the caller disconnects during admission', async () => {
  const res = response(),
    next = vi.fn();
  const reservation = {
    start: vi.fn(),
    releaseUnused: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(reserveMcpTools).mockImplementation(async () => {
    res.destroyed = true;
    res.emit('close');
    return reservation;
  });
  await reserveMcpToolQuota(
    { body: {} } as Request,
    res as unknown as Response,
    next
  );
  expect(reservation.releaseUnused).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  expect(res.listenerCount('close')).toBe(0);
});

it('aborts admission on the HTTP lifecycle deadline without a second response or next()', async () => {
  const res = response(),
    next = vi.fn();
  const controller = new AbortController();
  Object.assign(res.locals, { mcpHttpSignal: controller.signal });
  vi.mocked(consumeMcpRequest).mockImplementation(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new Error('deadline')), {
          once: true,
        });
      })
  );
  const work = limitMcpRequests(
    {} as Request,
    res as unknown as Response,
    next
  );
  res.writableEnded = true;
  controller.abort();
  await work;
  expect(next).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
  expect(res.listenerCount('close')).toBe(0);
});

it('releases an unused reservation acknowledged after the HTTP lifecycle deadline', async () => {
  const res = response(),
    next = vi.fn();
  const controller = new AbortController();
  Object.assign(res.locals, { mcpHttpSignal: controller.signal });
  const reservation = {
    start: vi.fn(),
    releaseUnused: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(reserveMcpTools).mockImplementation(async (_body, signal) => {
    expect(signal?.aborted).toBe(false);
    res.writableEnded = true;
    controller.abort();
    expect(signal?.aborted).toBe(true);
    return reservation;
  });
  await reserveMcpToolQuota(
    { body: {} } as Request,
    res as unknown as Response,
    next
  );
  expect(reservation.releaseUnused).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
});
