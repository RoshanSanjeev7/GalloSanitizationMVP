import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getChecklist: vi.fn(),
  putChecklist: vi.fn(),
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('mock-key'),
  getImageUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com/image.jpg'),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../index.js';
import { getChecklist, putChecklist } from '../data/dynamo.js';
import { uploadImage, getImageUrl, deleteImage } from '../data/s3.js';
import { makeChecklist, makeAdminToken, makeOperatorToken } from '../__tests__/factories.js';

const mockedGetChecklist = getChecklist as ReturnType<typeof vi.fn>;
const mockedPutChecklist = putChecklist as ReturnType<typeof vi.fn>;
const mockedUploadImage = uploadImage as ReturnType<typeof vi.fn>;
const mockedGetImageUrl = getImageUrl as ReturnType<typeof vi.fn>;
const mockedDeleteImage = deleteImage as ReturnType<typeof vi.fn>;

describe('Image routes', () => {
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();
    token = makeOperatorToken();
  });

  // ── POST /api/checklists/:id/images ──────────────────────────────

  describe('POST /api/checklists/:id/images', () => {
    it('should return 404 when checklist not found', async () => {
      mockedGetChecklist.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/checklists/no-such-id/images')
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '0')
        .field('catIdx', '0')
        .field('itemIdx', '0')
        .attach('images', Buffer.from('fake-png'), 'photo.png');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });

    it('should return 400 when machine index is invalid', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '99')
        .field('catIdx', '0')
        .field('itemIdx', '0')
        .attach('images', Buffer.from('fake-png'), 'photo.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid machine index');
    });

    it('should return 400 when category index is invalid', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '0')
        .field('catIdx', '99')
        .field('itemIdx', '0')
        .attach('images', Buffer.from('fake-png'), 'photo.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid category index');
    });

    it('should return 400 when item index is invalid', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '0')
        .field('catIdx', '0')
        .field('itemIdx', '99')
        .attach('images', Buffer.from('fake-png'), 'photo.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid item index');
    });

    it('should return 400 when no files are uploaded', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '0')
        .field('catIdx', '0')
        .field('itemIdx', '0');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No files uploaded');
    });

    it('should upload files and return updated images array', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);
      mockedPutChecklist.mockResolvedValue(undefined);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .field('machineIdx', '0')
        .field('catIdx', '0')
        .field('itemIdx', '0')
        .attach('images', Buffer.from('fake-png-1'), 'photo1.png')
        .attach('images', Buffer.from('fake-png-2'), 'photo2.png');

      expect(res.status).toBe(200);
      expect(res.body.images).toHaveLength(2);

      // Each key should follow the expected format
      for (const key of res.body.images) {
        expect(key).toMatch(new RegExp(`^${checklist.id}/0-0-0/\\d+-photo[12]\\.png$`));
      }

      expect(mockedUploadImage).toHaveBeenCalledTimes(2);
      expect(mockedPutChecklist).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /api/checklists/:id/images/* ─────────────────────────────

  describe('GET /api/checklists/:id/images/*', () => {
    it('should return a presigned URL for a valid key', async () => {
      const url = 'https://presigned-url.example.com/image.jpg';
      mockedGetImageUrl.mockResolvedValue(url);

      const res = await request(app)
        .get('/api/checklists/cl-1/images/cl-1/0-0-0/12345-photo.png')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBe(url);
      expect(mockedGetImageUrl).toHaveBeenCalledWith('cl-1/0-0-0/12345-photo.png');
    });
  });

  // ── DELETE /api/checklists/:id/images ─────────────────────────────

  describe('DELETE /api/checklists/:id/images', () => {
    it('should return 404 when checklist not found', async () => {
      mockedGetChecklist.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/checklists/no-such-id/images')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'some-key', machineIdx: 0, catIdx: 0, itemIdx: 0 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });

    it('should return 400 when item index is invalid', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .delete(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'some-key', machineIdx: 0, catIdx: 0, itemIdx: 99 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid item index');
    });

    it('should delete image and return filtered images array', async () => {
      const keyToDelete = 'cl-1/0-0-0/12345-photo.png';
      const keyToKeep = 'cl-1/0-0-0/67890-other.png';

      const checklist = makeChecklist({
        id: 'cl-1',
        machines: [
          {
            name: 'Machine A',
            categories: [
              {
                name: 'Category 1',
                items: [
                  {
                    description: 'Task 1',
                    machine: null,
                    completed: null,
                    completedBy: null,
                    completedAt: null,
                    issue: null,
                    images: [keyToDelete, keyToKeep],
                  },
                ],
              },
            ],
          },
        ],
      });

      mockedGetChecklist.mockResolvedValue(checklist);
      mockedPutChecklist.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/checklists/cl-1/images')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: keyToDelete, machineIdx: 0, catIdx: 0, itemIdx: 0 });

      expect(res.status).toBe(200);
      expect(res.body.images).toEqual([keyToKeep]);
      expect(mockedDeleteImage).toHaveBeenCalledWith(keyToDelete);
      expect(mockedPutChecklist).toHaveBeenCalledTimes(1);
    });
  });
});
