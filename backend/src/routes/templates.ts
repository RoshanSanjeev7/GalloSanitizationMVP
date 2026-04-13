import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllTemplates,
  getTemplate,
  putTemplate,
  deleteTemplate as deleteTemplateDynamo,
  queryChecklists,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../data/audit.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const templates = await getAllTemplates();
  res.json(templates);
});

router.get('/:id', async (req, res) => {
  const template = await getTemplate(req.params.id as string);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { title, lineId, machines } = req.body;

  if (!title || !lineId || !machines) {
    res.status(400).json({ error: 'title, lineId, and machines are required' });
    return;
  }

  const now = new Date().toISOString();
  const template = { id: uuid(), title, lineId, machines, createdAt: now, updatedAt: now };
  await putTemplate(template);

  res.status(201).json(template);
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'template_created', targetType: 'template', targetId: template.id, detail: `Created template "${template.title}"` }).catch(() => {});
});

router.put('/:id', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id as string);

  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const { title, lineId, machines } = req.body;
  if (title) template.title = title;
  if (lineId) template.lineId = lineId;
  if (machines) template.machines = machines;
  (template as any).updatedAt = new Date().toISOString();

  await putTemplate(template);
  res.json(template);
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'template_updated', targetType: 'template', targetId: template.id, detail: `Updated template "${template.title}"` }).catch(() => {});
});

// Check for active checklists before deleting (returns warning, not error)
router.get('/:id/check-delete', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id as string);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const inProgress = await queryChecklists({ status: 'in_progress' });
  const activeCount = inProgress.filter(c => c.templateId === template.id).length;

  if (activeCount > 0) {
    res.json({ warning: `${activeCount} checklist${activeCount > 1 ? 's are' : ' is'} in progress using this template`, count: activeCount });
  } else {
    res.json({ warning: null, count: 0 });
  }
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id as string);

  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  await deleteTemplateDynamo(req.params.id as string);
  res.status(204).send();
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'template_deleted', targetType: 'template', targetId: req.params.id as string, detail: `Deleted template "${template.title}"` }).catch(() => {});
});

export default router;
