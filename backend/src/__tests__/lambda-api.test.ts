/**
 * Unit tests for the HTTP-API Lambda wrapper.
 *
 * The handler itself is thin — `serverless-http` does the heavy lifting —
 * but the cold-start bootstrap is critical:
 *   - It must run exactly once even under concurrent invocations
 *   - A broadcaster init failure must NOT crash the Lambda
 *   - The `binary` option must be set so PDFs / images / octet-stream
 *     responses don't get UTF-8 mangled by API Gateway
 *
 * These three properties are cheap to test by mocking serverless-http
 * and the broadcaster module, then driving multiple concurrent calls
 * to `handler()`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('../config/env.js', () => ({
  config: {
    wsMode: 'apigw',
    aws: { region: 'us-west-2' },
    apiGatewayEndpoint: 'https://test.example.com/prod',
    tables: { connections: 'TestConnections', users: 'TestUsers' },
  },
}));

let createAppCallCount = 0;
vi.mock('../app.js', () => ({
  createApp: () => {
    createAppCallCount += 1;
    return {
      // Minimal Express stand-in — `set` is what bootstrap uses.
      set: vi.fn(),
    };
  },
}));

const mockBroadcasterInit = vi.fn();
let createBroadcasterShouldThrow = false;
vi.mock('../ws/broadcaster.js', () => ({
  createBroadcaster: vi.fn(async () => {
    if (createBroadcasterShouldThrow) {
      throw new Error('broadcaster boot failed');
    }
    return { init: mockBroadcasterInit };
  }),
}));

// Capture the options serverless() was called with so we can assert
// `binary` is wired up. The returned handler echoes back the event so
// each test can verify it survived the wrapper.
const mockServerlessOptions: { binary?: string[] } = {};
vi.mock('serverless-http', () => ({
  default: (_app: unknown, opts?: { binary?: string[] }) => {
    if (opts?.binary) mockServerlessOptions.binary = opts.binary;
    return async (event: object) => ({ statusCode: 200, event });
  },
}));

// We must import the handler AFTER mocks are set up, AND we need to
// reset its module cache between tests so the bootstrap re-runs. The
// helper below does both.
async function freshHandler(): Promise<{ handler: (event: object, ctx: object) => Promise<unknown> }> {
  vi.resetModules();
  // Re-import lambda-api with current mocks in place.
  return await import('../lambda-api.js') as { handler: (event: object, ctx: object) => Promise<unknown> };
}

// ── Test suite ───────────────────────────────────────────────────────

describe('lambda-api handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAppCallCount = 0;
    createBroadcasterShouldThrow = false;
    delete mockServerlessOptions.binary;
  });

  it('serverless-http is configured with binary content-types', async () => {
    const { handler } = await freshHandler();
    await handler({ requestContext: { http: { method: 'GET', path: '/health' } } }, {});
    expect(mockServerlessOptions.binary).toEqual(
      expect.arrayContaining(['application/pdf']),
    );
    expect(mockServerlessOptions.binary).toEqual(
      expect.arrayContaining(['image/*']),
    );
  });

  it('bootstraps the app exactly once across concurrent invocations', async () => {
    const { handler } = await freshHandler();
    // Fire three invocations during the same cold-start window. The
    // single-flight pattern means createApp() must run just once.
    await Promise.all([
      handler({}, {}),
      handler({}, {}),
      handler({}, {}),
    ]);
    expect(createAppCallCount).toBe(1);
  });

  it('reuses the bootstrapped handler on warm invocations', async () => {
    const { handler } = await freshHandler();
    await handler({}, {});
    await handler({}, {});
    await handler({}, {});
    // Still only one createApp() call after three sequential warms.
    expect(createAppCallCount).toBe(1);
  });

  it('continues serving HTTP requests when the broadcaster fails to initialize', async () => {
    createBroadcasterShouldThrow = true;
    const { handler } = await freshHandler();

    // Bootstrap should swallow the broadcaster failure and return a
    // working handler. If the catch block at lambda-api.ts:50-53
    // regressed, this would throw and the test would fail.
    const result = await handler({ requestContext: { http: { method: 'GET', path: '/health' } } }, {});
    expect(result).toBeDefined();
    expect((result as { statusCode: number }).statusCode).toBe(200);
  });

  it('initializes the broadcaster on a happy bootstrap', async () => {
    const { handler } = await freshHandler();
    await handler({}, {});
    expect(mockBroadcasterInit).toHaveBeenCalledTimes(1);
  });
});
