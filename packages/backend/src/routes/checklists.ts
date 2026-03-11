import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getStore, save } from '../data/store.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const store = getStore();
  let checklists = [...store.checklists];

  const { status, operatorId, lineId } = req.query;
  if (status) checklists = checklists.filter(c => c.status === status);
  if (operatorId) checklists = checklists.filter(c => c.operatorId === operatorId);
  if (lineId) checklists = checklists.filter(c => c.lineId === lineId);

  // Sort newest first
  checklists.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  res.json(checklists);
});

router.get('/:id', (req, res) => {
  const store = getStore();
  const checklist = store.checklists.find(c => c.id === req.params.id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }
  res.json(checklist);
});

router.post('/', (req: AuthRequest, res) => {
  const { lineId } = req.body;
  const store = getStore();

  const line = store.lines.find(l => l.id === lineId);
  if (!line) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }

  const user = store.users.find(u => u.id === req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Find a template for this line, or use the first template
  const template = store.templates.find(t => t.lineId === lineId) || store.templates[0];
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
        })),
      })),
    })),
  };

  store.checklists.push(checklist);
  save();
  res.status(201).json(checklist);
});

router.put('/:id/items', (req: AuthRequest, res) => {
  const { machines } = req.body;
  const store = getStore();
  const checklist = store.checklists.find(c => c.id === req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  if (checklist.status !== 'in_progress') {
    res.status(400).json({ error: 'Can only update items on in-progress checklists' });
    return;
  }

  if (Array.isArray(machines)) {
    checklist.machines = machines;
  }

  save();
  res.json(checklist);
});

router.post('/:id/submit', (req: AuthRequest, res) => {
  const store = getStore();
  const checklist = store.checklists.find(c => c.id === req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'submitted';
  checklist.endTime = new Date().toISOString();
  save();
  res.json(checklist);
});

router.post('/:id/approve', (req: AuthRequest, res) => {
  const store = getStore();
  const checklist = store.checklists.find(c => c.id === req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'approved';
  save();
  res.json(checklist);
});

router.post('/:id/deny', (req: AuthRequest, res) => {
  const store = getStore();
  const checklist = store.checklists.find(c => c.id === req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'denied';
  save();
  res.json(checklist);
});

router.delete('/:id', (req: AuthRequest, res) => {
  const store = getStore();
  const idx = store.checklists.findIndex(c => c.id === req.params.id);

  if (idx === -1) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  store.checklists.splice(idx, 1);
  save();
  res.status(204).send();
});

export default router;
