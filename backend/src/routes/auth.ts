import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { getStore } from '../data/store.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const store = getStore();
  const user = store.users.find(u => u.email === email);

  if (!user || user.password !== password) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  const { password: _, ...userPublic } = user;
  res.json({ user: userPublic, token });
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const store = getStore();
  const user = store.users.find(u => u.id === req.userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

export default router;
