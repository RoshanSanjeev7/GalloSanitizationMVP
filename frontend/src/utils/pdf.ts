/**
 * Client-side PDF generation for checklists.
 *
 * Replaces the deleted server-side `/pdf` route. Runs entirely in the
 * browser — no API call, no Lambda invocation, no S3 cache. Generation
 * is synchronous (typically <100ms even for 50+ items) and the resulting
 * Blob is handed straight to a `<a download>` for the user.
 *
 * Why client-side: PDF rendering is CPU work that doesn't need to live
 * on shared infrastructure for a small admin tool. Keeping it in the
 * browser eliminates a whole category of issues — cold starts, rate
 * limiting, byte-encoding bugs, "the spam-click did nothing" UX. The
 * checklist data is already loaded into the page's React state, so the
 * generator just walks the same object the UI is rendering from.
 *
 * Layout mirrors what the server-side PDFKit renderer used to produce:
 *   - Page 1: title + status, summary table, per-machine progress bars,
 *             notes & issues (if any)
 *   - Pages 2+: one page per machine, with categories listed as
 *               sections containing task items, status indicators,
 *               completedBy/completedAt stamps, and any issue notes.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Checklist } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────
// Letter size at 72 DPI = 612 × 792 points. jsPDF defaults to 'a4' if
// `format` is omitted, so we explicitly request letter to match the
// previous server-side output.
const PAGE_FORMAT = 'letter';
const MARGIN = 50;

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
};

const COLORS = {
  dark: '#1a1a1a',
  text: '#333333',
  muted: '#666666',
  light: '#999999',
  border: '#dddddd',
  green: '#16a34a',
  red: '#dc2626',
} as const;

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatStamp(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function setColor(doc: jsPDF, hex: string): void {
  // jsPDF wants RGB tuples for setTextColor; convert from #rrggbb.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  doc.setTextColor(r, g, b);
}

function setFill(doc: jsPDF, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  doc.setFillColor(r, g, b);
}

function drawLine(doc: jsPDF, y: number, pageW: number): void {
  setFill(doc, COLORS.border);
  doc.setDrawColor(221, 221, 221);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + pageW, y);
}

function drawStatusGlyph(doc: jsPDF, x: number, y: number, status: boolean | null): void {
  if (status === true) {
    setColor(doc, COLORS.green);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('✓', x, y);
  } else if (status === false) {
    setColor(doc, COLORS.red);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('✗', x, y);
  } else {
    setColor(doc, COLORS.light);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('—', x, y);
  }
}

/**
 * Build the checklist PDF and return it as a Blob ready for download.
 * Synchronous; on a typical checklist (~50 items, 5 machines) this
 * completes in well under 100ms on a modern laptop.
 */
export function generateChecklistPdf(checklist: Checklist): Blob {
  const doc = new jsPDF({ unit: 'pt', format: PAGE_FORMAT, compress: true });

  const pageW = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const pageH = doc.internal.pageSize.getHeight();

  // ── Aggregate stats (same shape the server used) ────────────────────
  const start = new Date(checklist.startTime);
  const end = checklist.endTime ? new Date(checklist.endTime) : null;
  const durationMin = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;

  const allItems = checklist.machines.flatMap((m) => m.categories.flatMap((c) => c.items));
  const doneCount = allItems.filter((i) => i.completed === true).length;
  const issueCount = allItems.filter((i) => i.completed === false).length;
  const pendingCount = allItems.filter((i) => i.completed === null).length;

  const allContributors = Array.from(
    new Set(
      allItems
        .map((i) => i.completedBy)
        .filter((n): n is string => typeof n === 'string' && n.length > 0),
    ),
  );

  const allNotes = checklist.machines.flatMap((m) =>
    m.categories.flatMap((c) =>
      c.items
        .filter((i) => i.issue)
        .map((i) => ({
          machine: m.name,
          task: i.description,
          note: i.issue!,
          status: i.completed,
        })),
    ),
  );

  // ─── PAGE 1: Summary ──────────────────────────────────────────────
  let y = MARGIN;

  // Title
  setColor(doc, COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(checklist.lineName, MARGIN, y);
  y += 26;

  // Status + date subtitle
  setColor(doc, COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${STATUS_LABEL[checklist.status] || checklist.status}  •  ${formatDate(start)}`, MARGIN, y);
  y += 22;
  drawLine(doc, y, pageW);
  y += 14;

  // Summary key-value rows
  const summaryRows: Array<[string, string]> = [
    ['Created By', checklist.operatorName],
    ['Contributors', allContributors.length > 0 ? allContributors.join(', ') : '—'],
    ['Start', formatTime(start)],
    ['End', end ? formatTime(end) : '—'],
    ['Duration', end ? `${durationMin} min` : 'In progress'],
    ['Completed', `${doneCount} of ${allItems.length}`],
    ['Issues', String(issueCount)],
    ['Pending', String(pendingCount)],
  ];
  for (const [label, value] of summaryRows) {
    setColor(doc, COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, MARGIN, y);

    setColor(doc, COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    // Wrap long contributor lists to avoid bleeding off the page.
    const valueLines = doc.splitTextToSize(value, pageW - 120);
    doc.text(valueLines, MARGIN + 120, y);
    y += 16 + (valueLines.length > 1 ? (valueLines.length - 1) * 11 : 0);
  }

  // ── Machine progress bars ───────────────────────────────────────────
  y += 4;
  drawLine(doc, y, pageW);
  y += 14;
  setColor(doc, COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Machine Progress', MARGIN, y);
  y += 20;

  for (const machine of checklist.machines) {
    const items = machine.categories.flatMap((c) => c.items);
    const done = items.filter((i) => i.completed !== null).length;
    const pct = items.length > 0 ? (done / items.length) * 100 : 0;

    setColor(doc, COLORS.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(machine.name, MARGIN, y);
    setColor(doc, COLORS.muted);
    doc.text(`${done}/${items.length}`, MARGIN + pageW, y, { align: 'right' });
    y += 6;

    // Bar background
    setFill(doc, COLORS.border);
    doc.rect(MARGIN, y, pageW, 5, 'F');
    if (pct > 0) {
      setFill(doc, pct === 100 ? COLORS.green : COLORS.dark);
      doc.rect(MARGIN, y, Math.max((pageW * pct) / 100, 3), 5, 'F');
    }
    y += 16;
  }

  // ── Notes & Issues ──────────────────────────────────────────────────
  if (allNotes.length > 0) {
    y += 6;
    drawLine(doc, y, pageW);
    y += 14;
    setColor(doc, COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Notes & Issues (${allNotes.length})`, MARGIN, y);
    y += 18;

    for (const note of allNotes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(note.note, pageW - 10);
      const noteH = noteLines.length * 11;
      // Bail to a fresh page if this note doesn't fit in the remaining space.
      if (y + noteH + 30 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }

      setColor(doc, COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(note.task, MARGIN, y);
      setColor(doc, COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(note.machine, MARGIN + pageW, y, { align: 'right' });
      y += 14;

      setColor(doc, COLORS.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(noteLines, MARGIN + 10, y);
      y += noteH + 10;
    }
  }

  // ─── DETAIL PAGES: one per machine ────────────────────────────────
  for (const machine of checklist.machines) {
    doc.addPage();
    let cy = MARGIN;

    // Machine header
    setColor(doc, COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(machine.name, MARGIN, cy);
    cy += 22;

    const machineItems = machine.categories.flatMap((c) => c.items);
    const machineDone = machineItems.filter((i) => i.completed !== null).length;
    setColor(doc, COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${machineDone} of ${machineItems.length} tasks completed`, MARGIN, cy);
    cy += 12;
    drawLine(doc, cy, pageW);
    cy += 12;

    for (const category of machine.categories) {
      const catDone = category.items.filter((i) => i.completed !== null).length;

      if (cy > pageH - 80) {
        doc.addPage();
        cy = MARGIN;
      }

      setColor(doc, COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(category.name, MARGIN, cy);
      setColor(doc, COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${catDone}/${category.items.length}`, MARGIN + pageW, cy, { align: 'right' });
      cy += 12;
      drawLine(doc, cy, pageW);
      cy += 8;

      for (const item of category.items) {
        // Pre-measure so we can break to a new page atomically
        // (no half-rendered items split across pages).
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const descLines = doc.splitTextToSize(item.description, pageW - 40);
        const descH = descLines.length * 11;
        let itemH = Math.max(descH, 14);
        if (item.completedBy) itemH += 12;
        let issueLines: string[] = [];
        if (item.issue) {
          doc.setFontSize(8);
          issueLines = doc.splitTextToSize(item.issue, pageW - 50);
          itemH += issueLines.length * 10 + 6;
        }
        if (cy + itemH > pageH - MARGIN) {
          doc.addPage();
          cy = MARGIN;
        }

        // Status glyph + description
        drawStatusGlyph(doc, MARGIN, cy + 8, item.completed);
        setColor(doc, COLORS.text);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(descLines, MARGIN + 22, cy + 8);
        let lineY = cy + Math.max(descH, 14);

        // completedBy stamp
        if (item.completedBy) {
          const ts = item.completedAt ? formatStamp(new Date(item.completedAt)) : '';
          setColor(doc, COLORS.light);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(`${item.completedBy}${ts ? ' — ' + ts : ''}`, MARGIN + 22, lineY + 8);
          lineY += 12;
        }

        // Issue text (italics, red)
        if (item.issue) {
          setColor(doc, COLORS.red);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.text(issueLines, MARGIN + 22, lineY + 8);
          lineY += issueLines.length * 10 + 6;
        }

        cy = lineY + 4;
      }

      cy += 10;
    }
  }

  // jsPDF returns a Blob via `output('blob')`. The autoTable import is
  // included as a side-effect import for future use (e.g. converting the
  // summary rows to a real table), even though the current layout uses
  // hand-drawn rows for parity with the previous server output.
  void autoTable;

  return doc.output('blob');
}

/**
 * Convenience: triggers a browser download for the generated PDF.
 * Same UX the server-side download had — file lands in the user's
 * downloads folder with a sensible filename.
 */
export function downloadChecklistPdf(checklist: Checklist): void {
  const blob = generateChecklistPdf(checklist);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${checklist.lineName}-checklist-${checklist.id.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Brief delay before revoking so the download has time to start.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
