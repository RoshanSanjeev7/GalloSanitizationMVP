import { getChecklist, putChecklist } from './data/dynamo.js';
import { uploadImage } from './data/s3.js';
import { generatePdfBuffer } from './data/pdf-generator.js';

interface SQSRecord {
  body: string;
}

interface SQSEvent {
  Records: SQSRecord[];
}

/**
 * Lambda handler for asynchronous PDF generation.
 * Triggered by SQS messages from the Express backend.
 * Generates the PDF, uploads to S3, and updates the checklist record.
 *
 * Idempotency: SQS provides at-least-once delivery, so the same message
 * can arrive twice (e.g. a partial failure during the previous run, or a
 * visibility-timeout expiry while the Lambda was still working). Skipping
 * regeneration when `pdfKey` is already set means the duplicate is a
 * cheap GetItem instead of a full PDF render + S3 upload + DynamoDB
 * write — and avoids racing a half-written object against itself.
 *
 * Re-generation is opt-in via `force: true` on the SQS payload (used by
 * an admin "regenerate PDF" tool that doesn't exist yet but is anticipated).
 */
export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const { checklistId, force } = JSON.parse(record.body) as { checklistId: string; force?: boolean };
    const checklist = await getChecklist(checklistId);
    if (!checklist) continue;

    if (checklist.pdfKey && !force) {
      // Already generated; nothing to do. Return rather than continue so
      // the structured log line is associated with the right record.
      console.log(`[lambda-pdf] skipping ${checklistId} (pdfKey already set)`);
      continue;
    }

    const pdfBuffer = await generatePdfBuffer(checklist);
    const pdfKey = `pdfs/${checklistId}.pdf`;
    await uploadImage(pdfKey, pdfBuffer, 'application/pdf');

    checklist.pdfKey = pdfKey;
    checklist.pdfGeneratedAt = new Date().toISOString();
    await putChecklist(checklist);
  }
}
