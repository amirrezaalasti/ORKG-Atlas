import { Router, Response } from 'express';
import {
  orkgAskService,
  OrkgUpstreamHttpError,
  extractOrkgAskGenerateText,
} from '../services/orkgAskService.js';
import {
  validateKeycloakTokenOrOrkgAskConfigured,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/orkg-ask:
 *   post:
 *     summary: Ask ORKG ASK a research question
 *     description: Uses ORKG ASK LLM API to generate an answer with citations
 *     tags: [ORKG ASK]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *                 description: The research question to ask
 *               max_results:
 *                 type: number
 *                 description: Maximum number of citations to return (default = 10)
 *                 default: 10
 *               temperature:
 *                 type: number
 *                 description: Temperature for LLM generation (default = 0.3)
 *                 default: 0.3
 *     responses:
 *       200:
 *         description: Successful response with answer and citations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                 citations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       authors:
 *                         type: array
 *                         items:
 *                           type: string
 *                       year:
 *                         type: number
 *                       venue:
 *                         type: string
 *                       url:
 *                         type: string
 *                       abstract:
 *                         type: string
 *                       relevance_score:
 *                         type: number
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post(
  '/search-by-paper',
  validateKeycloakTokenOrOrkgAskConfigured,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceId } = req.body;

      if (!resourceId || typeof resourceId !== 'string' || !resourceId.trim()) {
        return res.status(400).json({
          error: 'resourceId is required and must be a non-empty string',
        });
      }

      const result = await orkgAskService.searchByPaper(resourceId.trim());
      res.json(result);
    } catch (error) {
      console.error('ORKG ASK search-by-paper error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      if (error instanceof OrkgUpstreamHttpError) {
        return res.status(error.upstreamStatus).json({ error: errorMessage });
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * @swagger
 * /api/orkg-ask/generate:
 *   post:
 *     summary: Generate an LLM response from a prompt
 *     description: Pass an arbitrary prompt to the ORKG Ask API
 *     tags: [ORKG ASK]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The prompt
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post(
  '/synthesize',
  validateKeycloakTokenOrOrkgAskConfigured,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { question, itemIds } = req.body;

      if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({
          error: 'question is required and must be a non-empty string',
        });
      }
      const ids = Array.isArray(itemIds)
        ? itemIds.filter(
            (id): id is string | number =>
              typeof id === 'string' || typeof id === 'number'
          )
        : [];
      if (ids.length === 0) {
        return res.status(400).json({
          error: 'itemIds is required and must be a non-empty array',
        });
      }

      const result = await orkgAskService.synthesizeAbstracts(
        question.trim(),
        ids
      );
      res.json(result);
    } catch (error) {
      console.error('ORKG ASK synthesize error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/generate',
  validateKeycloakTokenOrOrkgAskConfigured,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { prompt, systemContext } = req.body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
          error: 'Prompt is required and must be a non-empty string',
        });
      }

      const result = (await orkgAskService.generate(prompt.trim(), {
        system:
          typeof systemContext === 'string' && systemContext.trim()
            ? systemContext.trim()
            : undefined,
      })) as Record<string, unknown>;

      // Log raw response in dev to debug structure (LLMRawResponse: { uuid, timestamp, payload })
      if (process.env.NODE_ENV !== 'production') {
        const payload = result?.payload as Record<string, unknown> | undefined;
        const logPayload = payload
          ? JSON.stringify(payload).slice(0, 500)
          : 'no payload';
        console.log(
          'ORKG generate payload keys:',
          payload ? Object.keys(payload) : []
        );
        console.log('ORKG generate payload (truncated):', logPayload);
      }

      const finalText = extractOrkgAskGenerateText(result);

      // ORKG can return empty payload {} per API docs; surface a clear error
      if (!finalText && result?.uuid && result?.payload !== undefined) {
        return res.status(502).json({
          error:
            'ORKG Ask returned an empty response. Try again later or switch to OpenAI.',
        });
      }
      res.json({ text: finalText });
    } catch (error) {
      console.error('ORKG ASK generate error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ error: errorMessage });
    }
  }
);

export default router;
