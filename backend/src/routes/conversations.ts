/**
 * REST routes for chat conversations.
 *
 * All routes go through `validateKeycloakToken`, which in public-access mode
 * admits anonymous callers under their per-browser guest id. Read access to a
 * conversation is granted to its owner — a signed-in user or the guest id that
 * created it; the GET-by-share-token route is intentionally permissive
 * (read-only) for shared chat links.
 *
 * Each handler is wrapped in try/catch so an unexpected Firestore error
 * surfaces as a 500 instead of crashing the dev server (Express 4 does not
 * auto-forward async-handler rejections to the error middleware).
 */

import { Router, type Response, type NextFunction } from 'express';
import {
  validateKeycloakToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { chatService } from '../services/chatService.js';

const router = Router();

const ensureOwnerOrAdmin = async (
  req: AuthenticatedRequest,
  conversationId: string,
  res: Response
) => {
  const conv = await chatService.getConversation(conversationId);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return null;
  }
  if (conv.ownerId !== req.userId && !req.isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return conv;
};

const handleError = (res: Response, err: unknown, prefix: string) => {
  console.error(`${prefix}:`, err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
};

/** Wrap an async Express handler so rejections become a 500 instead of crashing. */
const safe =
  <Req extends AuthenticatedRequest = AuthenticatedRequest>(
    fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
  ) =>
  (req: Req, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (!res.headersSent) handleError(res, err, 'Conversations route error');
      else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    });
  };

router.get(
  '/',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Unauthenticated' });
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const items = await chatService.listConversations(req.userId, limit);
    res.json({ items });
  })
);

router.post(
  '/',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Unauthenticated' });
    const { title, templateId, provider, model } = req.body || {};
    const conv = await chatService.createConversation({
      ownerId: req.userId,
      title,
      templateId,
      provider,
      model,
    });
    res.status(201).json(conv);
  })
);

router.get(
  '/share/:token',
  safe(async (req, res) => {
    const conv = await chatService.getConversationByShareToken(
      req.params.token
    );
    if (!conv)
      return res.status(404).json({ error: 'Shared conversation not found' });
    const messages = await chatService.listMessages(conv.id, 500);
    res.json({ conversation: conv, messages, readonly: true });
  })
);

router.get(
  '/:id',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    const conv = await ensureOwnerOrAdmin(req, req.params.id, res);
    if (!conv) return;
    const messages = await chatService.listMessages(conv.id, 500);
    res.json({ conversation: conv, messages });
  })
);

router.patch(
  '/:id',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    const conv = await ensureOwnerOrAdmin(req, req.params.id, res);
    if (!conv) return;
    const { title, templateId, provider, model } = req.body || {};
    await chatService.updateConversation(conv.id, {
      title,
      templateId,
      provider,
      model,
    });
    const updated = await chatService.getConversation(conv.id);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    const conv = await ensureOwnerOrAdmin(req, req.params.id, res);
    if (!conv) return;
    await chatService.deleteConversation(conv.id);
    res.status(204).send();
  })
);

router.post(
  '/:id/share',
  validateKeycloakToken,
  safe(async (req: AuthenticatedRequest, res) => {
    const conv = await ensureOwnerOrAdmin(req, req.params.id, res);
    if (!conv) return;
    const enable = req.body?.enable !== false;
    const token = await chatService.toggleShare(conv.id, enable);
    res.json({ shareToken: token, enabled: !!token });
  })
);

export default router;
