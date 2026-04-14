---
tags: [runbook]
created: 2026-04-09
updated: 2026-04-13
---

# Environment Variables

All backend environment variables are loaded in `backend/src/config/env.ts` via `dotenv`. The config object provides defaults for every value, so the app runs out of the box in development with just the `.env` file.

## Backend (backend/.env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOCALSTACK_ENDPOINT` | `undefined` | LocalStack endpoint (e.g., `http://localhost:4566`). When set, the AWS SDK uses this instead of real AWS and triggers dummy credentials. |
| `AWS_REGION` | `us-west-2` | AWS region for DynamoDB, S3, SQS |
| `JWT_SECRET` | `dev-secret-change-in-production` | Secret for signing/verifying JWTs. See [[Authentication]]. Must be changed in production. |
| `PORT` | `4000` | Express server port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed CORS origin. Must match the frontend's URL exactly. |
| `S3_BUCKET` | `checklist-images` | S3 bucket name for [[Image Handling]] |
| `SQS_QUEUE_URL` | `http://localhost:4566/000000000000/pdf-generation-queue` | SQS queue for async [[PDF Export]] |
| `WS_MODE` | `local` | `local` or `apigw`. Selects the WebSocket broadcaster. See [[WebSocket Adapter Pattern]]. |
| `APIGW_WS_ENDPOINT` | `undefined` | API Gateway WebSocket management URL. Only needed when `WS_MODE=apigw`. |
| `NODE_ENV` | `undefined` | Controls [[Rate Limiting]] (production only) and seed behavior (skipped in production) |
| `DYNAMODB_TABLE_USERS` | `SanitizationUsers` | Overrides the Users table name |
| `DYNAMODB_TABLE_LINES` | `SanitizationLines` | Overrides the Lines table name |
| `DYNAMODB_TABLE_TEMPLATES` | `SanitizationTemplates` | Overrides the Templates table name |
| `DYNAMODB_TABLE_CHECKLISTS` | `SanitizationChecklists` | Overrides the Checklists table name |
| `DYNAMODB_TABLE_CONNECTIONS` | `SanitizationConnections` | Overrides the Connections table name |
| `DYNAMODB_TABLE_AUDIT_LOG` | `SanitizationAuditLog` | Overrides the Audit Log table name |

The table name overrides exist so different environments (staging, production) can use different table names within the same AWS account.

## Frontend (Vite)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_WS_URL` | `ws://${window.location.hostname}:4000/ws` | WebSocket server URL. In production, points to API Gateway. |

Vite requires frontend env vars to be prefixed with `VITE_`. The default dynamically constructs the URL from the current hostname, which works for both `localhost` and LAN access.

## Minimal Dev .env

For [[Local Dev Setup]], this is the minimum `backend/.env`:

```
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-west-2
JWT_SECRET=dev-secret-change-in-production
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
S3_BUCKET=checklist-images
```

Everything else uses its default value, which is correct for local development with LocalStack.

## See also

- [[Authentication]] -- JWT_SECRET configuration
- [[WebSocket Adapter Pattern]] -- WS_MODE controls which broadcaster loads
- [[Local Dev Setup]] -- where to put the .env file
