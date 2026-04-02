import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getChecklist,
  putChecklist,
  deleteChecklist as deleteChecklistDynamo,
  queryChecklists,
  getLine,
  getUser,
  getTemplatesByLineId,
  getAllTemplates,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { status, operatorId, lineId } = req.query as Record<string, string>;
  let checklists = await queryChecklists({
    status: status || undefined,
    operatorId: operatorId || undefined,
    lineId: lineId || undefined,
  });

  checklists.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  res.json(checklists);
});

router.get('/:id', async (req, res) => {
  const checklist = await getChecklist(req.params.id as string);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }
  res.json(checklist);
});

router.post('/', async (req: AuthRequest, res) => {
  const { lineId } = req.body;

  const line = await getLine(lineId);
  if (!line) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }

  const user = await getUser(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let templates = await getTemplatesByLineId(lineId);
  if (templates.length === 0) {
    templates = await getAllTemplates();
  }
  const template = templates[0];
  if (!template) {
    res.status(400).json({ error: 'No template available for this line' });
    return;
  }

  const checklist = {
    id: uuid(),
    templateId: template.id,
    lineId: line.id,
    lineName: line.name,
    operatorId: user.id,
    operatorName: user.name,
    status: 'in_progress' as const,
    startTime: new Date().toISOString(),
    endTime: null,
    machines: template.machines.map(m => ({
      name: m.name,
      categories: m.categories.map(c => ({
        name: c.name,
        items: c.tasks.map(t => ({
          description: t.description,
          machine: t.machine,
          completed: null,
          completedBy: null,
          completedAt: null,
          issue: null,
          images: [],
        })),
      })),
    })),
  };

  await putChecklist(checklist);
  res.status(201).json(checklist);
});

router.put('/:id/items', async (req: AuthRequest, res) => {
  const { machines } = req.body;
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const user = await getUser(req.userId!);
  const isAdmin = user?.role === 'admin';

  if (checklist.status !== 'in_progress' && !(isAdmin && checklist.status === 'submitted')) {
    res.status(400).json({ error: 'Cannot update items on this checklist' });
    return;
  }

  if (Array.isArray(machines)) {
    checklist.machines = machines;
  }

  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'submitted';
  checklist.endTime = new Date().toISOString();
  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/approve', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'approved';
  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/deny', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'denied';
  await putChecklist(checklist);
  res.json(checklist);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  await deleteChecklistDynamo(req.params.id as string);
  res.status(204).send();
});

export default router;
