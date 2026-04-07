import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import PDFDocument from 'pdfkit';
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
import type { Checklist } from '../types/index.js';

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
    submittedAt: null,
    updatedAt: null,
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

  checklist.updatedAt = new Date().toISOString();
  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id as string);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const now = new Date().toISOString();
  checklist.status = 'submitted';
  checklist.endTime = now;
  checklist.submittedAt = now;
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

/**
 * PDF Export Endpoint
 *
 * Generates a downloadable PDF report for a completed checklist.
 * Uses PDFKit to stream the PDF directly to the response.
 *
 * The PDF includes:
 * - Page 1: Header, summary info, completion stats, machine progress overview
 * - Subsequent pages: One page per machine with all categories and task details
 */
router.get('/:id/pdf', adminOnly, async (req, res) => {
  const checklist = await getChecklist(req.params.id as string) as Checklist | null;

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const statusLabel: Record<string, string> = {
    in_progress: 'In Progress',
    submitted: 'Submitted',
    approved: 'Approved',
    denied: 'Denied',
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const start = new Date(checklist.startTime);
  const end = checklist.endTime ? new Date(checklist.endTime) : null;
  const durationMs = end ? end.getTime() - start.getTime() : 0;
  const durationMin = Math.round(durationMs / 60000);

  const allItems = checklist.machines.flatMap(m => m.categories.flatMap(c => c.items));
  const doneCount = allItems.filter(i => i.completed === true).length;
  const issueCount = allItems.filter(i => i.completed === false).length;
  const pendingCount = allItems.filter(i => i.completed === null).length;

  const allContributors = Array.from(
    new Set(allItems.map(i => i.completedBy).filter((n): n is string => n !== null))
  );

  const allNotes = checklist.machines.flatMap(m =>
    m.categories.flatMap(c =>
      c.items.filter(i => i.issue).map(i => ({
        machine: m.name,
        task: i.description,
        note: i.issue!,
        status: i.completed,
      }))
    )
  );

  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${checklist.lineName}-checklist-${checklist.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const LEFT = 50;
  const pageW = doc.page.width - 100;
  const pageH = doc.page.height;

  const C = {
    dark: '#1a1a1a',
    text: '#333333',
    muted: '#666666',
    light: '#999999',
    border: '#dddddd',
    green: '#16a34a',
    red: '#dc2626',
  };

  // Thin horizontal line
  const drawLine = (y: number) => {
    doc.save().strokeColor(C.border).lineWidth(0.5)
      .moveTo(LEFT, y).lineTo(LEFT + pageW, y).stroke().restore();
  };

  // Status indicator: checkmark, X, or dash
  const drawStatus = (x: number, y: number, status: boolean | null) => {
    if (status === true) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.green).text('\u2713', x, y, { lineBreak: false });
    } else if (status === false) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.red).text('\u2717', x, y, { lineBreak: false });
    } else {
      doc.font('Helvetica').fontSize(11).fillColor(C.light).text('\u2014', x, y, { lineBreak: false });
    }
  };

  // =============================================
  // PAGE 1: SUMMARY
  // =============================================

  let y = 50;

  // Title
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.dark)
    .text(checklist.lineName, LEFT, y, { lineBreak: false });
  y += 26;
  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text(`${statusLabel[checklist.status] || checklist.status}  \u2022  ${formatDate(start)}`, LEFT, y, { lineBreak: false });
  y += 22;
  drawLine(y);

  // Summary table
  y += 14;
  const summaryRows: [string, string][] = [
    ['Created By', checklist.operatorName],
    ['Contributors', allContributors.length > 0 ? allContributors.join(', ') : '\u2014'],
    ['Start', `${formatTime(start)}`],
    ['End', end ? `${formatTime(end)}` : '\u2014'],
    ['Duration', end ? `${durationMin} min` : 'In progress'],
    ['Completed', `${doneCount} of ${allItems.length}`],
    ['Issues', String(issueCount)],
    ['Pending', String(pendingCount)],
  ];

  for (const [label, value] of summaryRows) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(label, LEFT, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark).text(value, LEFT + 120, y, { lineBreak: false });
    y += 16;
  }

  // Machine progress
  y += 10;
  drawLine(y);
  y += 14;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.dark).text('Machine Progress', LEFT, y, { lineBreak: false });
  y += 20;

  for (const machine of checklist.machines) {
    const items = machine.categories.flatMap(c => c.items);
    const done = items.filter(i => i.completed !== null).length;
    const pct = items.length > 0 ? (done / items.length) * 100 : 0;

    doc.font('Helvetica').fontSize(9).fillColor(C.text).text(machine.name, LEFT, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`${done}/${items.length}`, LEFT + pageW - 36, y, { width: 36, align: 'right', lineBreak: false });
    y += 14;

    // Simple progress bar
    doc.rect(LEFT, y, pageW, 5).fill(C.border);
    if (pct > 0) {
      doc.rect(LEFT, y, Math.max((pageW * pct) / 100, 3), 5).fill(pct === 100 ? C.green : C.dark);
    }
    y += 16;
  }

  // Notes & Issues
  if (allNotes.length > 0) {
    y += 6;
    drawLine(y);
    y += 14;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.dark).text(`Notes & Issues (${allNotes.length})`, LEFT, y, { lineBreak: false });
    y += 18;

    for (const note of allNotes) {
      doc.font('Helvetica').fontSize(9);
      const noteH = doc.heightOfString(note.note, { width: pageW - 10 });
      if (y + noteH + 20 > pageH - 50) { doc.addPage(); y = 50; }

      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark).text(note.task, LEFT, y, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(note.machine, LEFT + pageW - 70, y, { width: 70, align: 'right', lineBreak: false });
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor(C.text).text(note.note, LEFT + 10, y, { width: pageW - 10 });
      y += noteH + 10;
    }
  }

  // =============================================
  // DETAIL PAGES: ONE PER MACHINE
  // =============================================
  for (const machine of checklist.machines) {
    doc.addPage();

    let cy = 50;

    // Machine header
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.dark).text(machine.name, LEFT, cy, { lineBreak: false });
    cy += 22;

    const machineItems = machine.categories.flatMap(c => c.items);
    const machineDone = machineItems.filter(i => i.completed !== null).length;
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text(`${machineDone} of ${machineItems.length} tasks completed`, LEFT, cy, { lineBreak: false });
    cy += 16;
    drawLine(cy);
    cy += 12;

    for (const category of machine.categories) {
      const catDone = category.items.filter(i => i.completed !== null).length;

      if (cy > pageH - 80) { doc.addPage(); cy = 50; }

      // Category header
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.dark)
        .text(category.name, LEFT, cy, { lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(C.muted)
        .text(`${catDone}/${category.items.length}`, LEFT + pageW - 40, cy + 1, { width: 40, align: 'right', lineBreak: false });
      cy += 18;
      drawLine(cy);
      cy += 8;

      // Task items
      for (const item of category.items) {
        doc.font('Helvetica').fontSize(9);
        const descH = doc.heightOfString(item.description, { width: pageW - 40 });
        let itemH = Math.max(descH, 14);
        if (item.completedBy) itemH += 12;
        if (item.issue) {
          doc.font('Helvetica').fontSize(8);
          itemH += doc.heightOfString(item.issue, { width: pageW - 50 }) + 6;
        }

        if (cy + itemH > pageH - 50) { doc.addPage(); cy = 50; }

        // Status + description
        drawStatus(LEFT, cy, item.completed);
        doc.font('Helvetica').fontSize(9).fillColor(C.text)
          .text(item.description, LEFT + 22, cy, { width: pageW - 40 });
        let lineY = cy + Math.max(descH, 14);

        // Stamp
        if (item.completedBy) {
          const timestamp = item.completedAt
            ? new Date(item.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            : '';
          doc.font('Helvetica').fontSize(7).fillColor(C.light)
            .text(`${item.completedBy}${timestamp ? ' \u2014 ' + timestamp : ''}`, LEFT + 22, lineY, { lineBreak: false });
          lineY += 12;
        }

        // Issue
        if (item.issue) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.red)
            .text(item.issue, LEFT + 22, lineY, { width: pageW - 50 });
          doc.font('Helvetica').fontSize(8);
          lineY += doc.heightOfString(item.issue, { width: pageW - 50 }) + 6;
        }

        cy = lineY + 4;
      }

      cy += 10;
    }
  }

  doc.end();
});

export default router;
