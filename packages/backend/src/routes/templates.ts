import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getStore, save } from '../data/store.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (_req, res) => {
  const store = getStore();
  res.json(store.templates);
});

router.get('/:id', (req, res) => {
  const store = getStore();
  const template = store.templates.find(t => t.id === req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

router.post('/', adminOnly, (req: AuthRequest, res) => {
  const { title, lineId, machines } = req.body;

  if (!title || !lineId || !machines) {
    res.status(400).json({ error: 'title, lineId, and machines are required' });
    return;
  }

  const template = { id: uuid(), title, lineId, machines };
  const store = getStore();
  store.templates.push(template);
  save();

  res.status(201).json(template);
});

router.delete('/:id', adminOnly, (req: AuthRequest, res) => {
  const store = getStore();
  const idx = store.templates.findIndex(t => t.id === req.params.id);

  if (idx === -1) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  store.templates.splice(idx, 1);
  save();
  res.status(204).send();
});

export default router;
