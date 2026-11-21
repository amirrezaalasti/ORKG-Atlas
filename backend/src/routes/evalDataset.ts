import { Router, Request, Response } from 'express';
import {
  getDataset,
  getItem,
  isDatasetId,
  listDatasets,
} from '../services/evalDatasetService.js';

const router = Router();

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to read the evaluation set';

const statusFor = (error: unknown): number => {
  const text = message(error);
  if (text.startsWith('Unknown model')) return 400;
  if (text.startsWith('Unknown')) return 404;
  if (text.includes('not found') || text.includes('missing')) return 404;
  return 500;
};

/**
 * @swagger
 * /api/eval-dataset:
 *   get:
 *     summary: List Atlas evaluation datasets
 *     tags:
 *       - Evaluation
 *     responses:
 *       '200':
 *         description: Dataset cards with question counts and headline scores
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ datasets: listDatasets() });
  } catch (error) {
    res.status(statusFor(error)).json({ error: message(error) });
  }
});

/**
 * @swagger
 * /api/eval-dataset/{set}/item:
 *   get:
 *     summary: Gold answer page and per-config scores for one question
 *     tags:
 *       - Evaluation
 *     parameters:
 *       - in: path
 *         name: set
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 */
router.get('/:set/item', (req: Request, res: Response) => {
  const set = req.params.set;
  if (!isDatasetId(set)) {
    res.status(404).json({ error: 'Unknown dataset' });
    return;
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) {
    res.status(400).json({ error: 'Question id is required' });
    return;
  }
  const model =
    typeof req.query.model === 'string' ? req.query.model : undefined;
  const query = Number(req.query.query ?? 0);
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 25);
  try {
    res.json(
      getItem(
        set,
        id,
        model,
        Number.isFinite(query) ? query : 0,
        Number.isFinite(offset) ? offset : 0,
        Number.isFinite(limit) ? limit : 25
      )
    );
  } catch (error) {
    res.status(statusFor(error)).json({ error: message(error) });
  }
});

/**
 * @swagger
 * /api/eval-dataset/{set}:
 *   get:
 *     summary: Questions, answer sizes, and score table for one dataset
 *     tags:
 *       - Evaluation
 *     parameters:
 *       - in: path
 *         name: set
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 */
router.get('/:set', (req: Request, res: Response) => {
  const set = req.params.set;
  if (!isDatasetId(set)) {
    res.status(404).json({ error: 'Unknown dataset' });
    return;
  }
  const model =
    typeof req.query.model === 'string' ? req.query.model : undefined;
  try {
    res.json(getDataset(set, model));
  } catch (error) {
    res.status(statusFor(error)).json({ error: message(error) });
  }
});

export default router;
