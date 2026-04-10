import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { getUserByEmail, getUser } from '../data/dynamo.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await getUserByEmail(email);

  if (!user || user.password !== password) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: '8h' }
  );

  const { password: _, ...userPublic } = user;
  res.json({ user: userPublic, token });
});

router.post('/refresh', authMiddleware, async (req: AuthRequest, res) => {
  const user = await getUser(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: '8h' },
  );

  const { password: _, ...userPublic } = user;
  res.json({ user: userPublic, token });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await getUser(req.userId!);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

export default router;
