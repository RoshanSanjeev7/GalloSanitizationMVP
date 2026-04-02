import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllUsers,
  getUserByEmail,
  putUser,
  getUser,
  deleteUser as deleteUserDynamo,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const users = await getAllUsers();
  const usersPublic = users.map(({ password, ...rest }) => rest);
  res.json(usersPublic);
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'name, email, password, and role are required' });
    return;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const user = { id: uuid(), name, email, password, role };
  await putUser(user);

  const { password: _, ...userPublic } = user;
  res.status(201).json(userPublic);
});

router.put('/:id', adminOnly, async (req: AuthRequest, res) => {
  const { role } = req.body;
  const user = await getUser(req.params.id as string);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (role) user.role = role;
  await putUser(user);

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const user = await getUser(req.params.id as string);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await deleteUserDynamo(req.params.id as string);
  res.status(204).send();
});

export default router;
