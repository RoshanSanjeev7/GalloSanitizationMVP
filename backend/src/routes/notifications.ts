import { Router } from 'express';
import { getStore, save } from '../data/store.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const store = getStore();
  const userId = req.userId!;

  const items = store.notifications
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(n => ({
      id: n.id,
      checklistId: n.checklistId,
      checklistLineName: n.checklistLineName,
      operatorName: n.operatorName,
      createdAt: n.createdAt,
      read: n.readBy.includes(userId),
    }));

  res.json(items);
});

router.get('/unread-count', (req: AuthRequest, res) => {
  const store = getStore();
  const userId = req.userId!;
  const count = store.notifications.filter(n => !n.readBy.includes(userId)).length;
  res.json({ count });
});

router.post('/:id/read', (req: AuthRequest, res) => {
  const store = getStore();
  const userId = req.userId!;
  const notification = store.notifications.find(n => n.id === req.params.id);

  if (!notification) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  if (!notification.readBy.includes(userId)) {
    notification.readBy.push(userId);
    save();
  }

  res.json({ success: true });
});

export default router;
