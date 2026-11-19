/** Default-disabled, anonymous MCP transport. Infrastructure validation is required before enablement. */
import {
  Router,
  json,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  isJSONRPCRequest,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  type Tool,
  type RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import {
  callExternalTool,
  listExternalTools,
} from '../services/mcp/externalToolPolicy.js';
import { BoundedMcpTransport } from '../services/mcp/boundedTransport.js';
import {
  McpExecutionError,
  withMcpExecution,
} from '../services/mcp/executionScope.js';
import {
  fail,
  externalToolExecutionFailure,
} from '../services/mcp/registry.js';
import {
  EXTERNAL_MCP_LIMITS,
  MCP_HTTP_TIMEOUT_MS,
  MCP_QUOTAS,
  PUBLIC_SPARQL_LIMITS,
} from '../config/mcp.js';
import '../services/mcp/tools.js';
import { McpLeaseError } from '../services/mcp/quotaLease.js';
import {
  limitMcpRequests,
  reserveMcpToolQuota,
} from '../middleware/mcpQuota.js';
import { McpQuotaError, type McpReservation } from '../services/mcp/quota.js';
import {
  checkPublicSparql,
  PublicSparqlError,
} from '../services/mcp/publicSparql.js';

export const EXTERNAL_MCP_PATH = '/api/mcp/stream';
export const EXTERNAL_MCP_BODY_LIMIT = EXTERNAL_MCP_LIMITS.maxRequestBytes;
const router = Router();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.MCP_EXTERNAL_ENABLED !== 'true') {
    res.sendStatus(404);
    return;
  }
  // Keep browser origins denied until a dedicated MCP CORS policy is ready.
  if (req.headers.origin !== undefined) {
    res.status(403).json({ error: 'Browser origins are not enabled for MCP.' });
    return;
  }
  next();
});
router.post(
  '/',
  (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'MCP requests require application/json.' });
      return;
    }
    next();
  },
  (req, res, next) => {
    const controller = new AbortController();
    res.locals.mcpHttpSignal = controller.signal;
    const cleanup = () => {
      clearTimeout(timer);
      res.off('finish', cleanup);
      res.off('close', onClose);
    };
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
      cleanup();
    };
    const timer = setTimeout(() => {
      controller.abort();
      if (res.destroyed) return;
      if (!res.headersSent) {
        // Stop an incomplete upload after flushing the deadline response.
        if (!req.complete) res.once('finish', () => req.destroy());
        res.status(504).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32000,
            message: 'MCP HTTP lifecycle deadline exceeded.',
            data: { code: 'MCP_HTTP_TIMEOUT' },
          },
        });
      } else if (!res.writableEnded) res.destroy();
    }, MCP_HTTP_TIMEOUT_MS);
    res.once('finish', cleanup);
    res.once('close', onClose);
    next();
  },
  limitMcpRequests,
  json({ limit: EXTERNAL_MCP_BODY_LIMIT }),
  (req, res, next) => {
    if (Array.isArray(req.body)) {
      if (req.body.length > MCP_QUOTAS.maxBatch) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: `MCP batches are limited to ${MCP_QUOTAS.maxBatch} messages.`,
          },
        });
        return;
      }
      const ids = req.body
        .filter(
          (message) =>
            message &&
            typeof message.method === 'string' &&
            (typeof message.id === 'string' || typeof message.id === 'number')
        )
        .map((message) => message.id);
      // Ambiguous ids cannot be safely correlated when buffering batch replies.
      if (new Set(ids).size !== ids.length) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Duplicate MCP request id.' },
        });
        return;
      }
    }
    next();
  },
  reserveMcpToolQuota,
  async (req: Request, res: Response) => {
    // Anonymous and unprivileged, regardless of headers, body or request identity.
    const ctx = { isAdmin: false };
    const reservation = res.locals.mcpReservation as McpReservation;
    const httpSignal = res.locals.mcpHttpSignal as AbortSignal;
    const disconnected = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) disconnected.abort();
    };
    res.once('close', onClose);
    let server: Server | undefined;
    let transport: BoundedMcpTransport | undefined;
    try {
      server = new Server(
        { name: 'orkg-atlas-external-mcp', version: '0.1.0' },
        { capabilities: { tools: {} } }
      );
      const cancellations = new Map<RequestId, AbortController>();
      const cancellationSignal = (id: RequestId) => {
        let controller = cancellations.get(id);
        if (!controller) {
          controller = new AbortController();
          cancellations.set(id, controller);
        }
        return controller;
      };
      // Cancellation is observed below before the SDK's deferred handlers. Keep
      // the SDK reply enabled so cancellation errors can complete JSON batches.
      server.setNotificationHandler(
        CancelledNotificationSchema,
        async () => {}
      );
      server.setRequestHandler(
        ListToolsRequestSchema,
        async (_request, extra) => {
          if (cancellationSignal(extra.requestId).signal.aborted)
            throw new McpError(-32000, 'MCP request cancelled.', {
              code: 'MCP_REQUEST_CANCELLED',
            });
          try {
            return {
              tools: listExternalTools(ctx).map((tool) => ({
                name: tool.name,
                title: tool.title,
                description:
                  tool.name === 'orkg_sparql'
                    ? `Public SELECT only: one fixed-predicate triple anchored to an ORKG resource subject. SELECT requires LIMIT ${PUBLIC_SPARQL_LIMITS.minSelectLimit}–${PUBLIC_SPARQL_LIMITS.maxSelectLimit}, no nonzero OFFSET. Query maximum ${PUBLIC_SPARQL_LIMITS.maxQueryBytes} bytes; complex analytics are disabled.`
                    : tool.name === 'orkg_sparql_schema'
                      ? 'Load bounded template hierarchy guidance. Live SPARQL paper-link discovery is disabled on the public endpoint; unresolved paths must not be inferred.'
                      : tool.description,
                inputSchema: tool.inputSchema as Tool['inputSchema'],
              })),
            };
          } catch {
            throw new McpError(
              ErrorCode.InternalError,
              'MCP tool discovery failed.'
            );
          }
        }
      );
      const toolReply = (
        result: Awaited<ReturnType<typeof callExternalTool>>
      ) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
        isError: !result.ok,
      });
      server.setRequestHandler(
        CallToolRequestSchema,
        async (request, extra) => {
          try {
            const lease = await reservation.start(extra.requestId);
            try {
              return await withMcpExecution(
                async () => {
                  if (request.params.name === 'orkg_sparql')
                    checkPublicSparql(request.params.arguments?.query);
                  return toolReply(
                    await callExternalTool(
                      request.params.name,
                      request.params.arguments,
                      ctx
                    )
                  );
                },
                [
                  httpSignal,
                  disconnected.signal,
                  extra.signal,
                  cancellationSignal(extra.requestId).signal,
                  lease.signal,
                ],
                request.params.name === 'orkg_sparql_schema'
                  ? EXTERNAL_MCP_LIMITS.schemaTimeoutMs
                  : request.params.name === 'orkg_sparql'
                    ? EXTERNAL_MCP_LIMITS.sparqlTimeoutMs
                    : EXTERNAL_MCP_LIMITS.toolTimeoutMs,
                lease.check
              );
            } finally {
              // Never return capacity until the invocation and cancellation cleanup settle.
              await lease.release();
            }
          } catch (error) {
            if (
              error instanceof McpExecutionError ||
              error instanceof McpLeaseError ||
              error instanceof McpQuotaError ||
              error instanceof PublicSparqlError
            ) {
              return toolReply(fail(error.message, { code: error.code }));
            }
            return toolReply(externalToolExecutionFailure());
          }
        }
      );
      transport = new BoundedMcpTransport(req.body, httpSignal);
      await server.connect(transport);
      const receive = transport.onmessage;
      transport.onmessage = (message, extra) => {
        if (isJSONRPCRequest(message)) cancellationSignal(message.id);
        else if (
          'method' in message &&
          message.method === 'notifications/cancelled'
        ) {
          const cancelled = CancelledNotificationSchema.safeParse(message);
          // Unknown/future ids must not cancel a later request in the batch.
          if (
            cancelled.success &&
            cancelled.data.params.requestId !== undefined
          )
            cancellations.get(cancelled.data.params.requestId)?.abort();
        }
        receive?.(message, extra);
      };
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent && !res.destroyed) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'MCP request failed.' },
        });
      } else if (!res.writableEnded) res.end();
    } finally {
      res.off('close', onClose);
      disconnected.abort();
      const attached = server?.transport === transport;
      await server?.close().catch(() => {});
      if (transport && !attached) await transport.close().catch(() => {});
      await reservation.releaseUnused().catch(() => {
        console.warn(
          'MCP quota cleanup failed; unused leases will expire in Redis.'
        );
      });
    }
  }
);
router.all('/', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.sendStatus(405);
});
router.use(
  (
    err: { type?: string },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    void _next;
    if (res.writableEnded || res.destroyed) return;
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'MCP request body too large.' });
    } else if (err.type === 'entity.parse.failed') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    } else {
      res.status(500).json({ error: 'MCP request failed.' });
    }
  }
);

export default router;
