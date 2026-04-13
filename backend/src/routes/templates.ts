import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllTemplates,
  getTemplate,
  putTemplate,
  queryChecklists,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../data/audit.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const templates = await getAllTemplates();
  const includeDeleted = req.query.includeDeleted === 'true' && req.userRole === 'admin';

  let filtered = includeDeleted ? templates : templates.filter(t => !t.deleted);

  // Operators only see published templates
  if (req.userRole !== 'admin') {
    filtered = filtered.filter(t => t.published !== false);
  }
  res.json(filtered);
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
  const template = { id: uuid(), title, lineId, machines, published: false, createdAt: now, updatedAt: now };
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

// Publish or unpublish a template
router.post('/:id/publish', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id as string);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const { published } = req.body;
  (template as any).published = published !== false;
  (template as any).updatedAt = new Date().toISOString();
  await putTemplate(template);
  res.json(template);
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: published !== false ? 'template_published' : 'template_unpublished', targetType: 'template', targetId: template.id, detail: `${published !== false ? 'Published' : 'Unpublished'} template "${template.title}"` }).catch(() => {});
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

  // Soft delete: mark as deleted with 30-day TTL for auto-cleanup
  const now = new Date();
  (template as any).deleted = true;
  (template as any).deletedAt = now.toISOString();
  (template as any).deleteTtl = Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60; // 30 days
  await putTemplate(template);

  res.status(204).send();
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'template_deleted', targetType: 'template', targetId: req.params.id as string, detail: `Soft-deleted template "${template.title}" (restoreable for 30 days)` }).catch(() => {});
});

router.post('/:id/restore', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id as string);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  if (!template.deleted) {
    res.status(400).json({ error: 'Template is not deleted' });
    return;
  }

  (template as any).deleted = false;
  (template as any).deletedAt = null;
  delete (template as any).deleteTtl;
  await putTemplate(template);

  res.json(template);
  logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'template_restored', targetType: 'template', targetId: template.id, detail: `Restored template "${template.title}"` }).catch(() => {});
});

export default router;
