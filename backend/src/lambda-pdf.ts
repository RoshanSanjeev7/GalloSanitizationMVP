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
 */
export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const { checklistId } = JSON.parse(record.body);
    const checklist = await getChecklist(checklistId);
    if (!checklist) continue;

    const pdfBuffer = await generatePdfBuffer(checklist);
    const pdfKey = `pdfs/${checklistId}.pdf`;
    await uploadImage(pdfKey, pdfBuffer, 'application/pdf');

    checklist.pdfKey = pdfKey;
    checklist.pdfGeneratedAt = new Date().toISOString();
    await putChecklist(checklist);
  }
}
