import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getChecklist: vi.fn(),
  putChecklist: vi.fn(),
  appendChecklistImages: vi.fn().mockResolvedValue(undefined),
  removeChecklistImage: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue({ id: 'op-1', name: 'Test User', email: 'test@test.com', password: 'x', role: 'operator' }),
  // Other dynamo exports needed by other routes mounted on the same app
  queryChecklists: vi.fn().mockResolvedValue([]),
  conditionalPutChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalStatusTransition: vi.fn().mockResolvedValue(undefined),
  conditionalDeleteChecklist: vi.fn().mockResolvedValue(undefined),
  markChecklistViewed: vi.fn().mockResolvedValue(undefined),
  updateChecklistMachine: vi.fn().mockResolvedValue(undefined),
  deleteChecklist: vi.fn().mockResolvedValue(undefined),
  getLine: vi.fn().mockResolvedValue(undefined),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  putUser: vi.fn().mockResolvedValue(undefined),
  createUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  deleteUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  getAllLines: vi.fn().mockResolvedValue([]),
  putLine: vi.fn().mockResolvedValue(undefined),
  getTemplate: vi.fn().mockResolvedValue(undefined),
  putTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  docClient: {},
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('mock-key'),
  getImageUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com/image.jpg'),
  getImageUrls: vi.fn().mockImplementation(async (keys: string[]) => {
    const { getImageUrl: mockGetUrl } = await import('../data/s3.js');
    const entries = await Promise.all(keys.map(async (k: string) => [k, await mockGetUrl(k)]));
    return Object.fromEntries(entries);
  }),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com/signed.jpg'),
}));

import { app } from '../index.js';
import { getChecklist, putChecklist, appendChecklistImages, removeChecklistImage } from '../data/dynamo.js';
import { uploadImage, getImageUrl, deleteImage } from '../data/s3.js';
import { makeChecklist, makeAdminToken, makeOperatorToken } from '../__tests__/factories.js';

const mockedGetChecklist = getChecklist as ReturnType<typeof vi.fn>;
const mockedPutChecklist = putChecklist as ReturnType<typeof vi.fn>;
const mockedAppendChecklistImages = appendChecklistImages as ReturnType<typeof vi.fn>;
const mockedRemoveChecklistImage = removeChecklistImage as ReturnType<typeof vi.fn>;
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

      // Each key should follow the expected format (now includes a random UUID segment)
      for (const key of res.body.images) {
        expect(key).toMatch(new RegExp(`^${checklist.id}/0-0-0/.+-photo[12]\\.png$`));
      }

      expect(mockedUploadImage).toHaveBeenCalledTimes(2);
      expect(mockedAppendChecklistImages).toHaveBeenCalledTimes(1);
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

  // ── POST /api/checklists/:id/image-urls (batch) ──────────────────

  describe('POST /api/checklists/:id/image-urls', () => {
    it('returns presigned URLs for all provided keys', async () => {
      mockedGetImageUrl
        .mockResolvedValueOnce('https://url1.example.com')
        .mockResolvedValueOnce('https://url2.example.com');

      const res = await request(app)
        .post('/api/checklists/cl-1/image-urls')
        .set('Authorization', `Bearer ${token}`)
        .send({ keys: ['cl-1/key1.jpg', 'cl-1/key2.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.urls).toEqual({
        'cl-1/key1.jpg': 'https://url1.example.com',
        'cl-1/key2.jpg': 'https://url2.example.com',
      });
      expect(mockedGetImageUrl).toHaveBeenCalledTimes(2);
    });

    it('returns 400 for empty keys array', async () => {
      const res = await request(app)
        .post('/api/checklists/cl-1/image-urls')
        .set('Authorization', `Bearer ${token}`)
        .send({ keys: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('keys array required');
    });

    it('returns 400 when keys is not provided', async () => {
      const res = await request(app)
        .post('/api/checklists/cl-1/image-urls')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('caps at 50 keys', async () => {
      const keys = Array.from({ length: 60 }, (_, i) => `cl-1/key${i}.jpg`);
      mockedGetImageUrl.mockResolvedValue('https://url.example.com');

      const res = await request(app)
        .post('/api/checklists/cl-1/image-urls')
        .set('Authorization', `Bearer ${token}`)
        .send({ keys });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.urls)).toHaveLength(50);
      expect(mockedGetImageUrl).toHaveBeenCalledTimes(50);
    });
  });

  // ── DELETE /api/checklists/:id/images ─────────────────────────────

  describe('DELETE /api/checklists/:id/images', () => {
    it('should return 404 when checklist not found', async () => {
      mockedGetChecklist.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/checklists/no-such-id/images')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'no-such-id/some-key', machineIdx: 0, catIdx: 0, itemIdx: 0 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });

    it('should return 400 when item index is invalid', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValue(checklist);

      const res = await request(app)
        .delete(`/api/checklists/${checklist.id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: `${checklist.id}/some-key`, machineIdx: 0, catIdx: 0, itemIdx: 99 });

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

      const res = await request(app)
        .delete('/api/checklists/cl-1/images')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: keyToDelete, machineIdx: 0, catIdx: 0, itemIdx: 0 });

      expect(res.status).toBe(200);
      expect(res.body.images).toEqual([keyToKeep]);
      expect(mockedDeleteImage).toHaveBeenCalledWith(keyToDelete);
      expect(mockedRemoveChecklistImage).toHaveBeenCalledTimes(1);
    });
  });
});
