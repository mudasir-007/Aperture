import { Router } from 'express';
import { query } from '../db/database';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;