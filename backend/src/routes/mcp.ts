/**
 * MCP-like JSON-RPC router for ORKG Atlas tools.
 *
 * Endpoints:
 *   GET  /api/mcp/tools/list   → manifest of available tools (name, schema, description)
 *   POST /api/mcp/tools/call   → invoke a tool with `{ name, arguments }` and get a typed envelope
 *   POST /api/mcp/rpc          → JSON-RPC 2.0 dispatcher (tools/list, tools/call)
 *
 * The route shares Keycloak auth with the rest of the API. Anonymous calls in
 * dev are still rejected so we never accidentally expose unauthenticated
 * Firestore writes through tool handlers.
 */

import { Router, type Response } from 'express';
import {
  validateKeycloakToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { toolRegistry } from '../services/mcp/tools.js';

const router = Router();

router.get(
  '/tools/list',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const tools = toolRegistry.list({ includeAdmin: !!req.isAdmin });
    res.json({
      protocol: 'orkg-atlas-mcp/1',
      tools,
    });
  }
);

router.post(
  '/tools/call',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, arguments: args, conversationId } = req.body || {};
    if (typeof name !== 'string' || name.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: 'Field "name" is required.' });
    }
    const result = await toolRegistry.call(name, args ?? {}, {
      userId: req.userId,
      userEmail: req.userEmail,
      isAdmin: req.isAdmin,
      conversationId:
        typeof conversationId === 'string' ? conversationId : undefined,
    });
    res.json(result);
  }
);

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: { name?: string; arguments?: unknown };
}

router.post(
  '/rpc',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as JsonRpcRequest | JsonRpcRequest[];
    const requests = Array.isArray(body) ? body : [body];
    const responses = await Promise.all(
      requests.map(async (r) => {
        if (!r || r.jsonrpc !== '2.0' || typeof r.method !== 'string') {
          return {
            jsonrpc: '2.0',
            id: r?.id ?? null,
            error: { code: -32600, message: 'Invalid Request' },
          };
        }
        if (r.method === 'tools/list') {
          return {
            jsonrpc: '2.0',
            id: r.id ?? null,
            result: {
              tools: toolRegistry.list({ includeAdmin: !!req.isAdmin }),
            },
          };
        }
        if (r.method === 'tools/call') {
          const result = await toolRegistry.call(
            r.params?.name ?? '',
            r.params?.arguments ?? {},
            {
              userId: req.userId,
              userEmail: req.userEmail,
              isAdmin: req.isAdmin,
            }
          );
          return { jsonrpc: '2.0', id: r.id ?? null, result };
        }
        return {
          jsonrpc: '2.0',
          id: r.id ?? null,
          error: { code: -32601, message: `Method not found: ${r.method}` },
        };
      })
    );
    res.json(Array.isArray(body) ? responses : responses[0]);
  }
);

export default router;
