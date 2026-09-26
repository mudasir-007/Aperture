import { Router } from 'express';
import { getDb } from '../db/database';

const router = Router();

router.get('/', (_req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

export default router;
