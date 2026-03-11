import { Router } from 'express';
import { getStore } from '../data/store.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (_req, res) => {
  const store = getStore();
  res.json(store.lines);
});

export default router;
