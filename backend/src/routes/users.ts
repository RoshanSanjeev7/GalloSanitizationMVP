import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllUsers,
  getUserByEmail,
  putUser,
  getUser,
  deleteUser as deleteUserDynamo,
  createUserWithEmailLock,
  deleteUserWithEmailLock,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  const users = await getAllUsers();
  const usersPublic = users.map(({ password, ...rest }) => rest);

  const total = usersPublic.length;
  const items = usersPublic.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  res.json({ items, total, hasMore });
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'name, email, password, and role are required' });
    return;
  }

  const user = { id: uuid(), name, email, password, role };
  try {
    await createUserWithEmailLock(user);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TransactionCanceledException') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    throw err;
  }

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

  // Prevent demoting the last admin
  if (role && role !== 'admin' && user.role === 'admin') {
    const allUsers = await getAllUsers();
    const adminCount = allUsers.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot demote the last admin' });
      return;
    }
  }

  if (role) user.role = role;
  await putUser(user);

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  // Prevent self-deletion
  if (req.userId === req.params.id) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  const user = await getUser(req.params.id as string);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Prevent deleting the last admin
  if (user.role === 'admin') {
    const allUsers = await getAllUsers();
    const adminCount = allUsers.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot delete the last admin' });
      return;
    }
  }

  try {
    await deleteUserWithEmailLock(user.id, user.email);
  } catch (err: unknown) {
    // Fallback to simple delete if email lock doesn't exist (legacy users)
    await deleteUserDynamo(user.id);
  }
  res.status(204).send();
});

export default router;
