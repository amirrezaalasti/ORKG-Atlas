import type { Request, RequestHandler, Response } from 'express';
import {
  consumeMcpRequest,
  reserveMcpTools,
  McpQuotaError,
} from '../services/mcp/quota.js';

function guard(
  operation: (req: Request, res: Response, signal: AbortSignal) => Promise<void>
): RequestHandler {
  return async (req, res, next) => {
    const controller = new AbortController();
    const httpSignal = res.locals.mcpHttpSignal as AbortSignal | undefined;
    const onAbort = () => controller.abort();
    if (httpSignal?.aborted) onAbort();
    else httpSignal?.addEventListener('abort', onAbort, { once: true });
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', onClose);
    try {
      await operation(req, res, controller.signal);
      if (!res.destroyed && !res.writableEnded) next();
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      const failure =
        error instanceof McpQuotaError
          ? error
          : new McpQuotaError('MCP_QUOTA_UNAVAILABLE');
      res.setHeader('Retry-After', failure.retryAfter);
      res.status(failure.status).json({
        jsonrpc: '2.0',
        id:
          !Array.isArray(req.body) &&
          (typeof req.body?.id === 'string' || typeof req.body?.id === 'number')
            ? req.body.id
            : null,
        error: {
          code: -32000,
          message: failure.message,
          data: { code: failure.code, retryAfter: failure.retryAfter },
        },
      });
    } finally {
      res.off('close', onClose);
      httpSignal?.removeEventListener('abort', onAbort);
    }
  };
}

// Charge HTTP requests before parsing, independent of any client identity/IP.
export const limitMcpRequests = guard(async (_req, _res, signal) => {
  await consumeMcpRequest(signal);
});
export const reserveMcpToolQuota = guard(async (req, res, signal) => {
  const reservation = await reserveMcpTools(req.body, signal);
  res.locals.mcpReservation = reservation;
  if (signal.aborted) await reservation.releaseUnused();
});
