import { Router, type Response } from 'express';
import {
  validateKeycloakToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import {
  browserSessionBack,
  browserSessionForward,
  clickBrowserSession,
  closeBrowserSession,
  createBrowserSession,
  getBrowserFrame,
  isLiveBrowserAvailable,
  isLiveBrowserConfigured,
  navigateBrowserSession,
} from '../services/browserSessionService.js';

const router = Router();

router.get(
  '/status',
  validateKeycloakToken,
  async (_req: AuthenticatedRequest, res: Response) => {
    const configured = isLiveBrowserConfigured();
    const available = configured ? await isLiveBrowserAvailable() : false;
    res.json({
      configured,
      available,
      hint: available
        ? 'Live browser ready'
        : configured
          ? 'Install Playwright: npx playwright install chromium'
          : 'Set ENABLE_LIVE_BROWSER=true in backend .env',
    });
  }
);

router.post(
  '/sessions',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url } = req.body ?? {};
      if (typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }
      const frame = await createBrowserSession(url.trim(), req.userId);
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(503).json({ error: message });
    }
  }
);

router.get(
  '/sessions/:sessionId',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const frame = await getBrowserFrame(req.params.sessionId, req.userId);
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: message });
    }
  }
);

router.post(
  '/sessions/:sessionId/navigate',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url } = req.body ?? {};
      if (typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }
      const frame = await navigateBrowserSession(
        req.params.sessionId,
        url.trim(),
        req.userId
      );
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  '/sessions/:sessionId/click',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { x, y } = req.body ?? {};
      if (typeof x !== 'number' || typeof y !== 'number') {
        return res.status(400).json({ error: 'x and y are required numbers' });
      }
      const frame = await clickBrowserSession(
        req.params.sessionId,
        x,
        y,
        req.userId
      );
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  '/sessions/:sessionId/back',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const frame = await browserSessionBack(req.params.sessionId, req.userId);
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  '/sessions/:sessionId/forward',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const frame = await browserSessionForward(
        req.params.sessionId,
        req.userId
      );
      res.json(frame);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  }
);

router.delete(
  '/sessions/:sessionId',
  validateKeycloakToken,
  async (req: AuthenticatedRequest, res: Response) => {
    await closeBrowserSession(req.params.sessionId, req.userId);
    res.status(204).send();
  }
);

export default router;
