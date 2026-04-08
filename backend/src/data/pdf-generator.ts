import PDFDocument from 'pdfkit';
import type { Checklist } from '../types/index.js';

/**
 * Generate a PDF buffer for a checklist.
 * Extracts the PDF generation logic from checklists.ts so it can be shared
 * between the Express sync endpoint and the Lambda async handler.
 */
export function generatePdfBuffer(checklist: Checklist): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

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
      new Set(allItems.map(i => i.completedBy).filter((n): n is string => n !== null)),
    );

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const LEFT = 50;
    const pageW = doc.page.width - 100;

    const C = {
      dark: '#1a1a1a',
      text: '#333333',
      muted: '#666666',
      light: '#999999',
      border: '#dddddd',
      green: '#16a34a',
      red: '#dc2626',
    };

    let y = 50;

    // Title
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.dark)
      .text(checklist.lineName, LEFT, y, { lineBreak: false });
    y += 26;
    doc.font('Helvetica').fontSize(10).fillColor(C.muted)
      .text(`${statusLabel[checklist.status] || checklist.status}  \u2022  ${formatDate(start)}`, LEFT, y, { lineBreak: false });
    y += 22;

    // Summary
    y += 14;
    const summaryRows: [string, string][] = [
      ['Created By', checklist.operatorName],
      ['Contributors', allContributors.length > 0 ? allContributors.join(', ') : '\u2014'],
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

    doc.end();
  });
}
