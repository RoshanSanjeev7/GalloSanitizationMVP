import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getStore, save } from '../data/store.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const store = getStore();
  const users = store.users.map(({ password, ...rest }) => rest);
  res.json(users);
});

router.post('/', adminOnly, (req: AuthRequest, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'name, email, password, and role are required' });
    return;
  }

  const store = getStore();
  if (store.users.find(u => u.email === email)) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const user = { id: uuid(), name, email, password, role };
  store.users.push(user);
  save();

  const { password: _, ...userPublic } = user;
  res.status(201).json(userPublic);
});

router.put('/:id', adminOnly, (req: AuthRequest, res) => {
  const { role } = req.body;
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (role) user.role = role;
  save();

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

router.delete('/:id', adminOnly, (req: AuthRequest, res) => {
  const store = getStore();
  const idx = store.users.findIndex(u => u.id === req.params.id);

  if (idx === -1) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  store.users.splice(idx, 1);
  save();
  res.status(204).send();
});

export default router;
