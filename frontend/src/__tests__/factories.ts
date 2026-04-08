import type { Checklist, ChecklistItem, ChecklistMachine, ChecklistCategory } from '../services/api';

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  role: 'operator' | 'admin';
}

export interface Line {
  id: string;
  name: string;
}

let counter = 0;
function nextId() {
  counter++;
  return `test-id-${counter}`;
}

export function makeUserPublic(overrides: Partial<UserPublic> = {}): UserPublic {
  const id = nextId();
  return {
    id,
    name: `Test User`,
    email: `user-${id}@test.com`,
    role: 'operator',
    ...overrides,
  };
}

export function makeChecklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    description: 'Test task',
    machine: null,
    completed: null,
    completedBy: null,
    completedAt: null,
    issue: null,
    images: [],
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
    startTime: '2026-04-07T00:30:00.000Z',
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

export function makeLine(overrides: Partial<Line> = {}): Line {
  const id = nextId();
  return {
    id,
    name: `Line ${id}`,
    ...overrides,
  };
}
