---
tags: [runbook]
created: 2026-04-09
updated: 2026-04-13
---

# Running Tests

The project has two test suites: Vitest for unit/integration tests and Playwright for end-to-end tests.

## Unit Tests (Vitest)

```bash
npm test
```

Runs approximately 300 tests: ~170 backend and ~130 frontend. These test individual functions and components in isolation. Backend tests cover the data layer (dynamo operations, conditional writes), route handlers (with mocked DynamoDB), and utility functions. Frontend tests cover components, hooks, and the api service.

Tests run fast (typically under 10 seconds) and do not require LocalStack or any running services. The `VITEST` environment variable is set automatically by Vitest, and the backend's `index.ts` checks it before starting the server, so imports in tests do not trigger side effects.

## E2E Tests (Playwright)

```bash
npm run test:e2e       # Headless mode
npm run test:e2e:ui    # Playwright UI mode (interactive)
```

Runs ~92 tests in Playwright. These test the full application through the browser: logging in, creating checklists, filling items, submitting, approving, managing users. The tests exercise [[Concurrency Scenarios]] like dual-submit, dual-approve, and concurrent editing.

**Prerequisites:** The app must be running (`npm run dev`) and LocalStack must be seeded. E2E tests talk to the real running application.

### Data Mutation

E2E tests create users, checklists, and modify data. After a full run, the demo data may be in an unexpected state. Reseed:

```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

The `docker compose down` is necessary because `seedIfEmpty` checks if users exist -- stale test data causes a false positive. See [[Troubleshooting]].

### Timeouts

E2E tests have a 30-second default timeout. If tests timeout, it usually means no in-progress checklists exist, LocalStack is slow, or the backend is not running.

## Running Specific Tests

```bash
npx playwright test tests/checklist.spec.ts     # Specific test file
npx playwright test -g "admin can approve"       # Tests matching a pattern
npx vitest run backend/src/__tests__/some.test.ts  # Specific unit test
```

## See also

- [[Local Dev Setup]] -- prerequisites for running tests
- [[Concurrency Scenarios]] -- what the bulletproof E2E tests verify
- [[Demo Credentials]] -- the accounts E2E tests use
