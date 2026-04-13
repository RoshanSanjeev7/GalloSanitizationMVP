import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { User, Line, Template, Checklist, ChecklistItem } from '../types/index.js';

let counter = 0;
function nextId() {
  counter++;
  return `test-id-${counter}-${Date.now()}`;
}

export function makeUser(overrides: Partial<User> = {}): User {
  const id = nextId();
  return {
    id,
    name: `Test User ${id}`,
    email: `user-${id}@test.com`,
    password: 'testpass123',
    role: 'operator',
    ...overrides,
  };
}

export function makeLine(overrides: Partial<Line> = {}): Line {
  const id = nextId();
  return {
    id,
    name: `Line ${id}`,
    ...overrides,
  };
}

export function makeChecklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    description: 'Test task description',
    machine: null,
    completed: null,
    completedBy: null,
    completedAt: null,
    issue: null,
    images: [],
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  const id = nextId();
  return {
    id,
    title: `Template ${id}`,
    lineId: 'line-1',
    published: true,
    machines: [
      {
        name: 'Machine A',
        categories: [
          {
            name: 'Category 1',
            tasks: [
              { description: 'Task 1', machine: null },
              { description: 'Task 2', machine: null },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function makeChecklist(overrides: Partial<Checklist> = {}): Checklist {
  const id = nextId();
  return {
    id,
    templateId: 'template-1',
    lineId: 'line-1',
    lineName: 'Line 91',
    operatorId: 'operator-1',
    operatorName: 'Test Operator',
    status: 'in_progress',
    startTime: new Date().toISOString(),
    endTime: null,
    submittedAt: null,
    updatedAt: null,
    version: 1,
    machines: [
      {
        name: 'Machine A',
        categories: [
          {
            name: 'Category 1',
            items: [
              makeChecklistItem({ description: 'Task 1' }),
              makeChecklistItem({ description: 'Task 2' }),
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function makeSubmittedChecklist(overrides: Partial<Checklist> = {}): Checklist {
  const now = new Date().toISOString();
  return makeChecklist({
    status: 'submitted',
    endTime: now,
    submittedAt: now,
    ...overrides,
  });
}

export function makeAdminToken(userId = 'admin-1'): string {
  return jwt.sign({ userId, role: 'admin' }, config.jwtSecret, { expiresIn: '1h' });
}

export function makeOperatorToken(userId = 'operator-1'): string {
  return jwt.sign({ userId, role: 'operator' }, config.jwtSecret, { expiresIn: '1h' });
}
