import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dynamo module before importing seedIfEmpty
vi.mock('./dynamo.js', () => ({
  getAllUsers: vi.fn(),
  putUser: vi.fn(),
  putLine: vi.fn(),
  putTemplate: vi.fn(),
  putChecklist: vi.fn(),
  putFactory: vi.fn(),
}));

import { seedIfEmpty } from './seed-dynamo.js';
import { getAllUsers, putUser, putLine, putTemplate, putChecklist, putFactory } from './dynamo.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('seedIfEmpty', () => {
  it('seeds database when no users exist', async () => {
    vi.mocked(getAllUsers).mockResolvedValue([]);

    await seedIfEmpty();

    expect(putFactory).toHaveBeenCalledTimes(4); // Modesto, Livingston, Fresno, Dry Creek
    expect(putUser).toHaveBeenCalledTimes(3); // admin + 2 operators
    expect(putLine).toHaveBeenCalledTimes(3); // Line 91, 92, 93
    expect(putTemplate).toHaveBeenCalledTimes(3); // one template per line
    expect(putChecklist).toHaveBeenCalledTimes(56); // 11 hand-written + 45 generated historical checklists
  });

  it('skips seeding when users already exist', async () => {
    vi.mocked(getAllUsers).mockResolvedValue([
      { id: '1', name: 'Existing', email: 'e@test.com', password: 'x', role: 'admin' as const },
    ]);

    await seedIfEmpty();

    expect(putUser).not.toHaveBeenCalled();
    expect(putLine).not.toHaveBeenCalled();
    expect(putTemplate).not.toHaveBeenCalled();
  });

  it('uses conditional puts that do not throw on duplicate', async () => {
    vi.mocked(getAllUsers).mockResolvedValue([]);
    // Simulate ConditionalCheckFailedException (item already exists)
    const condError = new Error('Conditional check failed');
    condError.name = 'ConditionalCheckFailedException';
    vi.mocked(putUser).mockRejectedValue(condError);

    // Should NOT throw — conditional failures are silently ignored
    await expect(seedIfEmpty()).resolves.not.toThrow();
  });

  it('propagates non-conditional errors', async () => {
    vi.mocked(getAllUsers).mockResolvedValue([]);
    const realError = new Error('Connection refused');
    vi.mocked(putUser).mockRejectedValue(realError);

    await expect(seedIfEmpty()).rejects.toThrow('Connection refused');
  });
});
