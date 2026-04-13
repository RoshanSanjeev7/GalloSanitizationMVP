---
tags:
  - runbook
---

# Local Dev Setup

Getting the app running from a fresh clone. Prerequisites: Docker Desktop and Node.js 22+.

## Step-by-Step

### 1. Install dependencies

```bash
npm install
```

This installs both `backend/` and `frontend/` workspaces via npm workspaces. The root `package.json` orchestrates both.

### 2. Create backend .env

Create `backend/.env` with the following content:

```
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-west-2
JWT_SECRET=dev-secret-change-in-production
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
S3_BUCKET=checklist-images
```

See [[Environment Variables]] for what each value does and what other variables are available.

### 3. Start LocalStack

```bash
docker compose up -d
```

This starts a LocalStack container that emulates DynamoDB, S3, and SQS on port 4566. The `docker-compose.yml` mounts `localstack/init-aws.sh` as an init script, which creates all six [[DynamoDB Tables]] and the S3 bucket automatically when the container starts.

Wait for LocalStack to be healthy. You can check with `docker compose ps` -- the status should show `healthy`. This typically takes 10-15 seconds.

### 4. Seed demo data

```bash
npm run localstack:seed
```

This runs `backend/src/data/seed-dynamo.ts`, which populates the tables with:
- 3 users (1 admin, 2 operators) -- see [[Demo Credentials]]
- 3 production lines (Red Wine Bottling, White Wine Bottling, Sparkling)
- 3 checklist templates (one per line)

The seed script uses `seedIfEmpty` logic -- it checks if users already exist before seeding. If data is present, it skips. Note: this check can give a false positive after E2E tests modify the data. See [[Troubleshooting]] for that scenario.

### 5. Start dev servers

```bash
npm run dev
```

This starts both the backend (port 4000) and frontend (port 3000) in parallel. The frontend dev server (Vite) proxies `/api` requests to `localhost:4000`.

Open `http://localhost:3000` and log in with one of the [[Demo Credentials]].

## One-Command Shortcut

```bash
npm run dev:local
```

This runs steps 3, 4, and 5 in sequence: `docker compose up -d`, waits for healthy, seeds, and starts dev servers.

## Common Issues

If something doesn't work, check [[Troubleshooting]] for common problems like port conflicts, seed failures, and LocalStack connectivity.

## See also

- [[Environment Variables]] -- all configurable values
- [[Demo Credentials]] -- test accounts to log in with
- [[Running Tests]] -- verifying the app works after setup
