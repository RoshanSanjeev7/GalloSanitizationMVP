import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getAllLines, putLine } from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const lines = await getAllLines();
  res.json(lines);
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Line name is required' });
    return;
  }

  const line = { id: uuid(), name: name.trim() };
  await putLine(line);
  res.status(201).json(line);
});

export default router;
