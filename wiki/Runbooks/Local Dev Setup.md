---
tags: [runbook]
created: 2026-04-09
updated: 2026-04-13
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

This starts a LocalStack container that emulates DynamoDB, S3, and SQS on port 4566. The `docker-compose.yml` mounts `localstack/init-aws.sh` as an init script, which creates all six [[DynamoDB Tables]] and the S3 bucket automatically.

Wait for LocalStack to be healthy (`docker compose ps` -- typically 10-15 seconds).

### 4. Seed demo data

```bash
npm run localstack:seed
```

This runs `backend/src/data/seed-dynamo.ts`, populating the tables with 3 users (see [[Demo Credentials]]), production lines, and checklist templates. The seed script uses `seedIfEmpty` logic -- it checks if users already exist before seeding. See [[Troubleshooting]] for false positive scenarios.

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

Runs steps 3, 4, and 5 in sequence: starts LocalStack, waits for healthy, seeds, and starts dev servers.

## Common Issues

If something does not work, check [[Troubleshooting]] for common problems like port conflicts, seed failures, and LocalStack connectivity.

## See also

- [[Environment Variables]] -- all configurable values
- [[Demo Credentials]] -- test accounts to log in with
- [[Running Tests]] -- verifying the app works after setup
