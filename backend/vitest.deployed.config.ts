import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the deployed-AWS smoke suite.
 *
 * IMPORTANT: this config is NOT used by `npm test`. It hits real AWS
 * (Lambda invocations, DynamoDB, API Gateway, CloudWatch Logs) and is
 * only invoked via `npm run test:deployed` after a deploy.
 *
 * Cost-optimization rules baked in:
 *   - serial test execution (no parallel Lambda invocations)
 *   - 60s default timeout (cold-starts can hit 1-2s; CW log queries
 *     can take 5-10s on first poll)
 *   - tests under tests/deployed/ — no overlap with the local unit suite
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['../tests/deployed/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Serial execution: each Lambda invocation is sequential to avoid
    // tripping rate limiters or producing hard-to-attribute CloudWatch
    // entries.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
