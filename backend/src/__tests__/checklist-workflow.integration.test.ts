import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Checklist } from '../types/index.js';

// ─── Mocks ──────────────────────────────────────────────────────────
// Must be declared before importing app so module-level calls are no-ops.

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  queryChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn().mockResolvedValue(undefined),
  putChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalPutChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalStatusTransition: vi.fn().mockResolvedValue(undefined),
  conditionalDeleteChecklist: vi.fn().mockResolvedValue(undefined),
  markChecklistViewed: vi.fn().mockResolvedValue(undefined),
  updateChecklistMachine: vi.fn().mockResolvedValue(undefined),
  appendChecklistImages: vi.fn().mockResolvedValue(undefined),
  removeChecklistImage: vi.fn().mockResolvedValue(undefined),
  deleteChecklist: vi.fn().mockResolvedValue(undefined),
  getLine: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue(undefined),
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
  uploadImage: vi.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
}));

import { app } from '../index.js';
import {
  getChecklist,
  putChecklist,
  conditionalPutChecklist,
  conditionalStatusTransition,
  getLine,
  getUser,
  getTemplatesByLineId,
} from '../data/dynamo.js';
import {
  makeAdminToken,
  makeOperatorToken,
  makeUser,
  makeLine,
  makeTemplate,
  makeChecklist,
} from './factories.js';

const mockedGetChecklist = vi.mocked(getChecklist);
const mockedPutChecklist = vi.mocked(putChecklist);
const mockedConditionalPutChecklist = vi.mocked(conditionalPutChecklist);
const mockedConditionalStatusTransition = vi.mocked(conditionalStatusTransition);
const mockedGetLine = vi.mocked(getLine);
const mockedGetUser = vi.mocked(getUser);
const mockedGetTemplatesByLineId = vi.mocked(getTemplatesByLineId);

/**
 * Integration test: full checklist lifecycle
 *
 * Tests the multi-step workflow from creation through approval,
 * tracking state across requests via a local variable.
 */
describe('Checklist workflow integration', () => {
  const adminToken = makeAdminToken('admin-1');
  const operatorToken = makeOperatorToken('operator-1');

  const operatorUser = makeUser({ id: 'operator-1', name: 'Test Operator', role: 'operator' });
  const adminUser = makeUser({ id: 'admin-1', name: 'Test Admin', role: 'admin' });
  const line = makeLine({ id: 'line-1', name: 'Line 91' });
  const template = makeTemplate({ lineId: 'line-1' });

  // This variable tracks the checklist state across sequential requests.
  let currentChecklist: Checklist;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('step 1: operator creates a checklist (201, status in_progress)', async () => {
    mockedGetLine.mockResolvedValueOnce(line);
    mockedGetUser.mockResolvedValueOnce(operatorUser);
    mockedGetTemplatesByLineId.mockResolvedValueOnce([template]);

    // Capture what putChecklist receives so we can track state
    mockedPutChecklist.mockImplementationOnce(async (cl) => {
      currentChecklist = { ...cl } as Checklist;
    });

    const res = await request(app)
      .post('/api/checklists')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ lineId: 'line-1' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.endTime).toBeNull();
    expect(res.body.submittedAt).toBeNull();

    // Store the response as our tracked state
    currentChecklist = res.body as Checklist;
  });

  it('step 2: operator updates items (200, updatedAt set)', async () => {
    mockedGetChecklist.mockResolvedValueOnce({ ...currentChecklist });
    mockedGetUser.mockResolvedValueOnce(operatorUser);

    const updatedMachines = [
      {
        name: 'Machine A',
        categories: [
          {
            name: 'Category 1',
            items: [
              {
                description: 'Task 1',
                machine: null,
                completed: true,
                completedBy: 'Test Operator',
                completedAt: new Date().toISOString(),
                issue: null,
                images: [],
              },
              {
                description: 'Task 2',
                machine: null,
                completed: null,
                completedBy: null,
                completedAt: null,
                issue: null,
                images: [],
              },
            ],
          },
        ],
      },
    ];

    const res = await request(app)
      .put(`/api/checklists/${currentChecklist.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ machines: updatedMachines });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBeTruthy();
    expect(conditionalPutChecklist).toHaveBeenCalledOnce();
    currentChecklist = res.body as Checklist;
  });

  it('step 3: operator submits the checklist (200, status submitted, submittedAt set)', async () => {
    mockedGetChecklist.mockResolvedValueOnce({ ...currentChecklist });

    const res = await request(app)
      .post(`/api/checklists/${currentChecklist.id}/submit`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.endTime).toBeTruthy();
    expect(conditionalStatusTransition).toHaveBeenCalled();
    currentChecklist = res.body as Checklist;
  });

  it('step 4: admin can update items on a submitted checklist (200)', async () => {
    mockedGetChecklist.mockResolvedValueOnce({ ...currentChecklist });
    mockedGetUser.mockResolvedValueOnce(adminUser);

    const adminEditMachines = [
      {
        name: 'Machine A',
        categories: [
          {
            name: 'Category 1',
            items: [
              {
                description: 'Task 1',
                machine: null,
                completed: true,
                completedBy: 'Test Operator',
                completedAt: new Date().toISOString(),
                issue: null,
                images: [],
              },
              {
                description: 'Task 2',
                machine: null,
                completed: true,
                completedBy: 'Test Admin',
                completedAt: new Date().toISOString(),
                issue: 'Minor wear noted',
                images: [],
              },
            ],
          },
        ],
      },
    ];

    const res = await request(app)
      .put(`/api/checklists/${currentChecklist.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ machines: adminEditMachines });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBeTruthy();
    currentChecklist = res.body as Checklist;
  });

  it('step 5: operator cannot update items on a submitted checklist (400)', async () => {
    mockedGetChecklist.mockResolvedValueOnce({ ...currentChecklist });
    mockedGetUser.mockResolvedValueOnce(operatorUser);

    const res = await request(app)
      .put(`/api/checklists/${currentChecklist.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ machines: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot update items on this checklist');
  });

  it('step 6: admin approves the checklist (200, status approved)', async () => {
    mockedGetChecklist.mockResolvedValueOnce({ ...currentChecklist });

    const res = await request(app)
      .post(`/api/checklists/${currentChecklist.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(conditionalStatusTransition).toHaveBeenCalled();
    currentChecklist = res.body as Checklist;
  });

  it('step 7: operator cannot approve a checklist (403)', async () => {
    const res = await request(app)
      .post(`/api/checklists/${currentChecklist.id}/approve`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });
});
