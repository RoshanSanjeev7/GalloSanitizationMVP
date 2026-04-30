import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getChecklist,
  putChecklist,
  conditionalPutChecklist,
  conditionalStatusTransition,
  conditionalDeleteChecklist,
  markChecklistViewed,
  updateChecklistMachine,
  getAllUsers,
  queryChecklists,
  getLine,
  getUser,
  getTemplatesByLineId,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';
import type { Checklist, ChecklistMachine, Activity } from '../types/index.js';
import { logAudit } from '../data/audit.js';
import { getBroadcaster } from '../utils/broadcast.js';
import {
  PAGINATION_MAX,
  PAGINATION_DEFAULT_CHECKLISTS,
  NOTIF_PAGE_SIZE,
  MARK_VIEWED_BATCH_SIZE,
  MARK_VIEWED_MAX,
} from '../config/constants.js';

const router = Router();

router.use(authMiddleware);

// Validate that a machines payload has the expected structure
function validateMachines(machines: unknown): machines is ChecklistMachine[] {
  if (!Array.isArray(machines)) return false;
  return machines.every((m) => {
    if (typeof m !== 'object' || m === null) return false;
    const machine = m as Record<string, unknown>;
    if (typeof machine.name !== 'string' || !Array.isArray(machine.categories)) return false;
    return (machine.categories as unknown[]).every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const cat = c as Record<string, unknown>;
      if (typeof cat.name !== 'string' || !Array.isArray(cat.items)) return false;
      return (cat.items as unknown[]).every((i) => {
        if (typeof i !== 'object' || i === null) return false;
        const item = i as Record<string, unknown>;
        return (
          typeof item.description === 'string' &&
          (item.completed === null || typeof item.completed === 'boolean') &&
          (item.issue === null || item.issue === undefined || typeof item.issue === 'string') &&
          (!item.images || Array.isArray(item.images))
        );
      });
    });
  });
}

router.get('/', async (req: AuthRequest, res) => {
  const { status, operatorId, lineId, search, date } = req.query as Record<string, string>;
  const limit = Math.min(PAGINATION_MAX, Math.max(1, parseInt(req.query.limit as string, 10) || PAGINATION_DEFAULT_CHECKLISTS));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  // Handle comma-separated statuses (e.g., 'approved,denied' for the completed tab)
  let checklists: Checklist[];
  if (status && status.includes(',')) {
    const statuses = status.split(',');
    const results = await Promise.all(
      statuses.map((s) =>
        queryChecklists({
          status: s.trim(),
          operatorId: operatorId || undefined,
          lineId: lineId || undefined,
        }),
      ),
    );
    checklists = results.flat();
  } else {
    checklists = await queryChecklists({
      status: status || undefined,
      operatorId: operatorId || undefined,
      lineId: lineId || undefined,
    });
  }

  checklists.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // Scope all users (operators AND admins) to their assigned factories
  {
    const currentUser = await getUser(req.userId!);
    if (currentUser?.factoryIds && currentUser.factoryIds.length > 0) {
      const factorySet = new Set(currentUser.factoryIds);
      checklists = checklists.filter((c) => !c.factoryId || factorySet.has(c.factoryId));
    }
  }

  // Apply search filter (case-insensitive match on operatorName or lineName)
  if (search) {
    const searchLower = search.toLowerCase();
    checklists = checklists.filter(
      (c) =>
        c.operatorName.toLowerCase().includes(searchLower) ||
        c.lineName.toLowerCase().includes(searchLower),
    );
  }

  // Apply date filter (YYYY-MM-DD format, matches startTime date portion)
  if (date) {
    checklists = checklists.filter((c) => c.startTime.startsWith(date));
  }

  const total = checklists.length;
  const items = checklists.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  res.json({ items, total, hasMore });
});

router.post('/mark-all-viewed', adminOnly, async (req: AuthRequest, res) => {
  const [submitted, inProgress] = await Promise.all([
    queryChecklists({ status: 'submitted' }),
    queryChecklists({ status: 'in_progress' }),
  ]);
  const unviewed = [...submitted, ...inProgress].filter((c) => !c.viewedAt).slice(0, MARK_VIEWED_MAX);
  const user = await getUser(req.userId!);
  const viewerName = user?.name || 'Admin';
  const now = new Date().toISOString();

  const batchSize = MARK_VIEWED_BATCH_SIZE;
  let count = 0;
  for (let i = 0; i < unviewed.length; i += batchSize) {
    const batch = unviewed.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (c) => {
        try {
          await markChecklistViewed(c.id, now, viewerName);
          count++;
        } catch {
          // Skip individual failures silently
        }
      }),
    );
  }

  res.json({ marked: count });
});

router.get('/notifications', adminOnly, async (req: AuthRequest, res) => {
  const limit = Math.min(PAGINATION_MAX, Math.max(1, parseInt(req.query.limit as string, 10) || NOTIF_PAGE_SIZE));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  const [submitted, inProgress] = await Promise.all([
    queryChecklists({ status: 'submitted' }),
    queryChecklists({ status: 'in_progress' }),
  ]);

  const combined = [...submitted, ...inProgress];
  combined.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const unviewedCount = combined.filter((c) => !c.viewedAt).length;
  const total = combined.length;
  const items = combined.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  res.json({ items, total, unviewedCount, hasMore });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  // Auto-mark as viewed when admin first opens a submitted or in_progress checklist
  if (req.userRole === 'admin' && (checklist.status === 'submitted' || checklist.status === 'in_progress') && !checklist.viewedAt) {
    const user = await getUser(req.userId!);
    await markChecklistViewed(checklist.id, new Date().toISOString(), user?.name || 'Admin');
    checklist.viewedAt = new Date().toISOString();
    checklist.viewedBy = user?.name || 'Admin';
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

  // Check if there's already an in-progress checklist for this line
  const existing = await queryChecklists({ status: 'in_progress', lineId });
  if (existing.length > 0) {
    res.status(409).json({ error: `An in-progress checklist already exists for ${line.name}. Complete or submit it before creating a new one.`, existingId: existing[0].id });
    return;
  }

  const templates = await getTemplatesByLineId(lineId);
  // Operators can only use published templates
  const template = req.userRole === 'admin'
    ? templates[0]
    : templates.find(t => t.published !== false);
  if (!template) {
    res.status(400).json({ error: 'No published template available for this line. Ask an admin to create and publish one.' });
    return;
  }

  const checklist: Record<string, unknown> = {
    id: uuid(),
    templateId: template.id,
    lineId: line.id,
    lineName: line.name,
    operatorId: user.id,
    operatorName: user.name,
    status: 'in_progress' as const,
    startTime: new Date().toISOString(),
    endTime: null,
    submittedAt: null,
    updatedAt: null,
    version: 1,
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

  // Stamp the factory from the line onto the checklist
  if (line.factoryId) checklist.factoryId = line.factoryId;

  const typedChecklist = checklist as unknown as Checklist;
  await putChecklist(typedChecklist);
  res.status(201).json(typedChecklist);
  // Fire-and-forget: audit/broadcast failures must not block the HTTP response
  logAudit({ userId: req.userId!, userName: user.name, userRole: req.userRole!, action: 'checklist_created', targetType: 'checklist', targetId: typedChecklist.id, detail: `Created checklist for ${line.name}` }).catch(() => {});
});

router.put('/:id/machines/:machineIdx', async (req: AuthRequest, res) => {
  const machineIdx = parseInt(req.params.machineIdx as string, 10);
  const { machine, version } = req.body;
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const isAdmin = req.userRole === 'admin';

  if (checklist.status !== 'in_progress' && !(isAdmin && checklist.status === 'submitted')) {
    res.status(400).json({ error: 'Cannot update items on this checklist' });
    return;
  }

  if (isNaN(machineIdx) || machineIdx < 0 || machineIdx >= checklist.machines.length) {
    res.status(400).json({ error: 'Invalid machine index' });
    return;
  }

  // Detect new comments by comparing old machine items vs new machine items
  const activities: Activity[] = [];
  const oldItems = checklist.machines[machineIdx].categories.flatMap(c => c.items);
  const typedMachine = machine as ChecklistMachine;
  const newItems = typedMachine.categories.flatMap(c => c.items);
  const oldComments = new Set(oldItems.map(i => i.issue).filter(Boolean));
  const newComments = newItems.map(i => i.issue).filter((c): c is string => c !== null && c !== undefined);
  const addedComments = newComments.filter((c) => !oldComments.has(c));

  if (addedComments.length > 0) {
    const user = await getUser(req.userId!);
    activities.push({
      type: 'comment',
      by: user?.name || 'Unknown',
      at: new Date().toISOString(),
      detail: addedComments[0],
    });
  }

  try {
    await updateChecklistMachine(
      checklist.id,
      machineIdx,
      machine,
      version,
      new Date().toISOString(),
      activities.length > 0 ? activities : undefined,
    );
    const newVersion = version + 1;
    res.json({ version: newVersion });

    // Broadcast diffs for changed items
    const bc = getBroadcaster(req);
    if (bc) {
      const oldCats = checklist.machines[machineIdx].categories;
      const newCats = machine.categories;
      const user = activities.length > 0 ? activities[0].by : (await getUser(req.userId!))?.name || 'Unknown';
      for (let catIdx = 0; catIdx < newCats.length; catIdx++) {
        const oldCat = oldCats[catIdx];
        const newCat = newCats[catIdx];
        if (!oldCat || !newCat) continue;
        for (let itemIdx = 0; itemIdx < newCat.items.length; itemIdx++) {
          const oldItem = oldCat.items[itemIdx];
          const newItem = newCat.items[itemIdx];
          if (!oldItem || !newItem) continue;
          if (oldItem.completed !== newItem.completed) {
            // Fire-and-forget: broadcast failures must not block the HTTP response
            bc.broadcastToChecklist(checklist.id, { type: 'item_update', checklistId: checklist.id, machineIdx, catIdx, itemIdx, completed: newItem.completed, completedBy: newItem.completedBy, completedAt: newItem.completedAt, by: user, at: new Date().toISOString() }, req.userId).catch(() => {});
          }
          if (oldItem.issue !== newItem.issue) {
            // Fire-and-forget
            bc.broadcastToChecklist(checklist.id, { type: 'comment_update', checklistId: checklist.id, machineIdx, catIdx, itemIdx, issue: newItem.issue, by: user, at: new Date().toISOString() }, req.userId).catch(() => {});
          }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(409).json({ error: 'Checklist has been modified by another user. Please refresh.' });
      return;
    }
    throw err;
  }
});

router.put('/:id/items', async (req: AuthRequest, res) => {
  const { machines, version } = req.body;
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const isAdmin = req.userRole === 'admin';

  if (checklist.status !== 'in_progress' && !(isAdmin && checklist.status === 'submitted')) {
    res.status(400).json({ error: 'Cannot update items on this checklist' });
    return;
  }

  // Optimistic concurrency: fast-fail if version doesn't match
  if (version !== undefined && checklist.version !== version) {
    res.status(409).json({ error: 'Checklist has been modified by another user. Please refresh.' });
    return;
  }

  const expectedVersion = checklist.version;

  // Validate and detect new comments by comparing old and new machines
  if (Array.isArray(machines) && !validateMachines(machines)) {
    res.status(400).json({ error: 'Invalid machines structure' });
    return;
  }
  if (Array.isArray(machines) && validateMachines(machines)) {
    const oldItems = checklist.machines.flatMap(m => m.categories.flatMap(c => c.items));
    const newItems = machines.flatMap(m => m.categories.flatMap(c => c.items));
    const oldComments = new Set(oldItems.map(i => i.issue).filter(Boolean));
    const newComments = newItems.map(i => i.issue).filter((c): c is string => c !== null && c !== undefined);
    const addedComments = newComments.filter((c) => !oldComments.has(c));

    if (addedComments.length > 0) {
      if (!checklist.activities) checklist.activities = [];
      const user = await getUser(req.userId!);
      checklist.activities.push({
        type: 'comment',
        by: user?.name || 'Unknown',
        at: new Date().toISOString(),
        detail: addedComments[0],
      });
      // Reset viewedAt so admin sees it as new activity
      checklist.viewedAt = null;
      checklist.viewedBy = null;
    }

    checklist.machines = machines;
  }

  checklist.updatedAt = new Date().toISOString();

  try {
    await conditionalPutChecklist(checklist, expectedVersion);
    checklist.version = expectedVersion + 1;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(409).json({ error: 'Checklist has been modified by another user. Please refresh.' });
      return;
    }
    throw err;
  }
  res.json(checklist);
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found or has been deleted' });
    return;
  }

  if (checklist.status !== 'in_progress') {
    res.status(400).json({ error: 'Only in-progress checklists can be submitted' });
    return;
  }

  const now = new Date().toISOString();
  checklist.status = 'submitted';
  checklist.endTime = now;
  checklist.submittedAt = now;

  try {
    await conditionalStatusTransition(checklist, 'in_progress', checklist.version);
    checklist.version = checklist.version + 1;
    res.json(checklist);
    // Fire-and-forget: audit/broadcast failures must not block the HTTP response
    logAudit({ userId: req.userId!, userName: checklist.operatorName, userRole: req.userRole!, action: 'checklist_submitted', targetType: 'checklist', targetId: checklist.id, detail: `Submitted ${checklist.lineName} checklist` }).catch(() => {});

    const bc = getBroadcaster(req);
    if (bc) {
      // Fire-and-forget
      bc.broadcastToChecklist(checklist.id, { type: 'status_change', checklistId: checklist.id, status: 'submitted', by: checklist.operatorName, at: checklist.submittedAt }, req.userId).catch(() => {});
      // Also notify dashboard subscribers
      bc.broadcastToDashboard({
        type: 'new_submission',
        checklistId: checklist.id,
        lineName: checklist.lineName,
        operatorName: checklist.operatorName,
        submittedAt: now,
      }).catch(() => {});
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(409).json({ error: 'This checklist was already submitted or modified. Please refresh.' });
      return;
    }
    throw err;
  }
});

router.post('/:id/approve', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found or has been deleted' });
    return;
  }

  if (checklist.status !== 'submitted') {
    res.status(400).json({ error: 'Only submitted checklists can be approved' });
    return;
  }

  checklist.status = 'approved';

  try {
    await conditionalStatusTransition(checklist, 'submitted', checklist.version);
    checklist.version = checklist.version + 1;
    res.json(checklist);
    const bc = getBroadcaster(req);
    const approver = await getUser(req.userId!);
    // Fire-and-forget: audit/broadcast failures must not block the HTTP response
    logAudit({ userId: req.userId!, userName: approver?.name || 'Admin', userRole: 'admin', action: 'checklist_approved', targetType: 'checklist', targetId: checklist.id, detail: `Approved ${checklist.lineName} checklist` }).catch(() => {});
    if (bc) {
      // Fire-and-forget
      bc.broadcastToChecklist(checklist.id, { type: 'status_change', checklistId: checklist.id, status: 'approved', by: approver?.name || 'Admin', at: new Date().toISOString() }, req.userId).catch(() => {});
      bc.broadcastToDashboard({
        type: 'dashboard_refresh',
        reason: 'status_changed',
        checklistId: checklist.id,
        status: 'approved',
      }).catch(() => {});
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(409).json({ error: 'This checklist has already been reviewed by another admin.' });
      return;
    }
    throw err;
  }
});

router.post('/:id/deny', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found or has been deleted' });
    return;
  }

  if (checklist.status !== 'submitted') {
    res.status(400).json({ error: 'Only submitted checklists can be denied' });
    return;
  }

  checklist.status = 'denied';

  try {
    await conditionalStatusTransition(checklist, 'submitted', checklist.version);
    checklist.version = checklist.version + 1;
    res.json(checklist);
    const bc = getBroadcaster(req);
    const denier = await getUser(req.userId!);
    // Fire-and-forget: audit/broadcast failures must not block the HTTP response
    logAudit({ userId: req.userId!, userName: denier?.name || 'Admin', userRole: 'admin', action: 'checklist_denied', targetType: 'checklist', targetId: checklist.id, detail: `Denied ${checklist.lineName} checklist` }).catch(() => {});
    if (bc) {
      // Fire-and-forget
      bc.broadcastToChecklist(checklist.id, { type: 'status_change', checklistId: checklist.id, status: 'denied', by: denier?.name || 'Admin', at: new Date().toISOString() }, req.userId).catch(() => {});
      bc.broadcastToDashboard({
        type: 'dashboard_refresh',
        reason: 'status_changed',
        checklistId: checklist.id,
        status: 'denied',
      }).catch(() => {});
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(409).json({ error: 'This checklist has already been reviewed by another admin.' });
      return;
    }
    throw err;
  }
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  try {
    await conditionalDeleteChecklist(req.params.id as string);
    res.status(204).send();
    // Fire-and-forget: audit/broadcast failures must not block the HTTP response
    logAudit({ userId: req.userId!, userName: 'Admin', userRole: 'admin', action: 'checklist_deleted', targetType: 'checklist', targetId: req.params.id as string, detail: 'Deleted checklist' }).catch(() => {});
    const bc = getBroadcaster(req);
    // Fire-and-forget
    if (bc) bc.broadcastToChecklist(req.params.id as string, { type: 'checklist_deleted', checklistId: req.params.id }, req.userId).catch(() => {});
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }
    throw err;
  }
});


export default router;
