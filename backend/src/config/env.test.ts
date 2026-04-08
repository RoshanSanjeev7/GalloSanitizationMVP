import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock dotenv so it doesn't load the .env file
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

describe('env config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('uses default port 4000 when PORT not set', async () => {
    delete process.env.PORT;
    const { config } = await import('./env.js');
    expect(config.port).toBe(4000);
  });

  it('parses PORT from environment', async () => {
    process.env.PORT = '5000';
    const { config } = await import('./env.js');
    expect(config.port).toBe(5000);
  });

  it('uses default JWT secret when JWT_SECRET not set', async () => {
    delete process.env.JWT_SECRET;
    const { config } = await import('./env.js');
    expect(config.jwtSecret).toBe('dev-secret-change-in-production');
  });

  it('sets credentials when LOCALSTACK_ENDPOINT is set', async () => {
    process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
    const { config } = await import('./env.js');
    expect(config.aws.endpoint).toBe('http://localhost:4566');
    expect(config.aws.credentials).toEqual({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
  });

  it('has undefined credentials when LOCALSTACK_ENDPOINT is not set', async () => {
    delete process.env.LOCALSTACK_ENDPOINT;
    const { config } = await import('./env.js');
    expect(config.aws.endpoint).toBeUndefined();
    expect(config.aws.credentials).toBeUndefined();
  });

  it('uses default table names', async () => {
    const { config } = await import('./env.js');
    expect(config.tables.users).toBe('SanitizationUsers');
    expect(config.tables.lines).toBe('SanitizationLines');
    expect(config.tables.templates).toBe('SanitizationTemplates');
    expect(config.tables.checklists).toBe('SanitizationChecklists');
  });
});
