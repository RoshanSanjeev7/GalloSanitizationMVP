import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getAllFactories, getFactory, putFactory, deleteFactory } from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// GET /api/factories — list all factories
router.get('/', async (_req, res) => {
  const factories = await getAllFactories();
  res.json(factories);
});

// GET /api/factories/:id — get a single factory
router.get('/:id', async (req, res) => {
  const factory = await getFactory(req.params.id as string);
  if (!factory) {
    res.status(404).json({ error: 'Factory not found' });
    return;
  }
  res.json(factory);
});

// POST /api/factories — create a factory (admin only)
router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { name, location } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Factory name is required' });
    return;
  }

  const factory = {
    id: uuid(),
    name: name.trim(),
    location: (location || '').trim(),
    createdAt: new Date().toISOString(),
  };

  await putFactory(factory);
  res.status(201).json(factory);
});

// PUT /api/factories/:id — update a factory (admin only)
router.put('/:id', adminOnly, async (req: AuthRequest, res) => {
  const factory = await getFactory(req.params.id as string);
  if (!factory) {
    res.status(404).json({ error: 'Factory not found' });
    return;
  }

  const { name, location } = req.body;
  if (name !== undefined) factory.name = name.trim();
  if (location !== undefined) factory.location = location.trim();

  await putFactory(factory);
  res.json(factory);
});

// DELETE /api/factories/:id — delete a factory (admin only)
router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const factory = await getFactory(req.params.id as string);
  if (!factory) {
    res.status(404).json({ error: 'Factory not found' });
    return;
  }

  await deleteFactory(factory.id);
  res.status(204).send();
});

export default router;
