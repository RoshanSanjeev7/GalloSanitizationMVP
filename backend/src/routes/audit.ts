import { Router } from 'express';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import { getAuditLogs } from '../data/audit.js';

const router = Router();

router.use(authMiddleware);

// Only admins can view the audit log
router.get('/', adminOnly, async (req: AuthRequest, res) => {
  const { userId, action, startDate, endDate } = req.query as Record<string, string>;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  const result = await getAuditLogs({
    userId: userId || undefined,
    action: action || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit,
    offset,
  });

  res.json(result);
});

export default router;
