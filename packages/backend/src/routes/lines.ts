import { Router } from 'express';
import { getAllLines } from '../data/dynamo.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const lines = await getAllLines();
  res.json(lines);
});

export default router;
