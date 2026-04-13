---
tags:
  - runbook
---

# Running Tests

The project has two test suites: Vitest for unit/integration tests and Playwright for end-to-end tests.

## Unit Tests (Vitest)

```bash
npm test
```

Runs approximately 300 tests: ~170 backend and ~130 frontend. These test individual functions and components in isolation. Backend tests cover the data layer (dynamo operations, conditional writes), route handlers (with mocked DynamoDB), and utility functions. Frontend tests cover components, hooks, and the api service.

Tests run fast (typically under 10 seconds) and don't require LocalStack or any running services.

The `VITEST` environment variable is set automatically by Vitest. The backend's `index.ts` checks `if (!process.env.VITEST)` before starting the server and seeding, so imports of the `app` object in tests don't trigger side effects.

## E2E Tests (Playwright)

```bash
npm run test:e2e       # Headless mode
npm run test:e2e:ui    # Playwright UI mode (interactive)
```

Runs ~92 tests in Playwright. These test the full application through the browser: logging in, creating checklists, filling items, submitting, approving, managing users, etc. The tests exercise [[Concurrency Scenarios]] like dual-submit, dual-approve, and concurrent editing.

**Prerequisites:** The app must be running (`npm run dev`) and LocalStack must be seeded. E2E tests talk to the real running application.

### Known Issue: Data Mutation

E2E tests create users, checklists, and modify data. After a full E2E run, the demo data may be in an unexpected state. The fix is to reseed:

```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

The `docker compose down` is necessary because `seedIfEmpty` checks if users exist -- if E2E tests created extra users, the seed script sees existing data and skips seeding. Tearing down LocalStack and restarting clears all tables.

### Timeouts

E2E tests have a 30-second default timeout. If tests timeout waiting for elements, it usually means:
- No in-progress checklists exist (the operator dashboard shows an empty state)
- LocalStack is slow to respond (first few seconds after startup)
- The backend is not running

## Running Specific Tests

```bash
# Run a specific test file
npx playwright test tests/checklist.spec.ts

# Run tests matching a pattern
npx playwright test -g "admin can approve"

# Unit tests for a specific file
npx vitest run backend/src/__tests__/bulletproof.test.ts
```

## See also

- [[Local Dev Setup]] -- prerequisites for running tests
- [[Concurrency Scenarios]] -- what the bulletproof E2E tests verify
