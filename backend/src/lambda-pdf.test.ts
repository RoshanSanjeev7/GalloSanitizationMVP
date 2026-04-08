import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./data/dynamo.js', () => ({
  getChecklist: vi.fn(),
  putChecklist: vi.fn(),
}));

vi.mock('./data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('pdfs/test.pdf'),
}));

vi.mock('./data/pdf-generator.js', () => ({
  generatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')),
}));

import { handler } from './lambda-pdf.js';
import { getChecklist, putChecklist } from './data/dynamo.js';
import { uploadImage } from './data/s3.js';
import { generatePdfBuffer } from './data/pdf-generator.js';
import { makeChecklist } from './__tests__/factories.js';

describe('Lambda PDF handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates PDF, uploads to S3, and updates checklist', async () => {
    const checklist = makeChecklist({ id: 'cl-1' });
    vi.mocked(getChecklist).mockResolvedValueOnce(checklist);

    await handler({
      Records: [{ body: JSON.stringify({ checklistId: 'cl-1' }) }],
    });

    expect(getChecklist).toHaveBeenCalledWith('cl-1');
    expect(generatePdfBuffer).toHaveBeenCalledWith(checklist);
    expect(uploadImage).toHaveBeenCalledWith('pdfs/cl-1.pdf', expect.any(Buffer), 'application/pdf');
    expect(putChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfKey: 'pdfs/cl-1.pdf',
        pdfGeneratedAt: expect.any(String),
      }),
    );
  });

  it('skips non-existent checklists', async () => {
    vi.mocked(getChecklist).mockResolvedValueOnce(undefined);

    await handler({
      Records: [{ body: JSON.stringify({ checklistId: 'missing' }) }],
    });

    expect(generatePdfBuffer).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('processes multiple records', async () => {
    const cl1 = makeChecklist({ id: 'cl-1' });
    const cl2 = makeChecklist({ id: 'cl-2' });
    vi.mocked(getChecklist)
      .mockResolvedValueOnce(cl1)
      .mockResolvedValueOnce(cl2);

    await handler({
      Records: [
        { body: JSON.stringify({ checklistId: 'cl-1' }) },
        { body: JSON.stringify({ checklistId: 'cl-2' }) },
      ],
    });

    expect(getChecklist).toHaveBeenCalledTimes(2);
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(putChecklist).toHaveBeenCalledTimes(2);
  });
});
