---
tags: [devlog, deployment]
created: 2026-04-30
updated: 2026-04-30
---

# 2026-04-30 First AWS Deployment

The serverless stack went live in AWS account `724591801208` (`aws-cse120-capstone-01r`, UC Merced capstone). Backend on Lambda + API Gateway HTTP API; frontend on S3 static website hosting; demo data seeded; full login + authenticated query flow verified end-to-end.

## What's deployed

| Component | URL / ARN |
|---|---|
| **API Gateway HTTP API** | `https://3j62zhgkj3.execute-api.us-west-2.amazonaws.com` |
| **Frontend SPA** | `http://gallo-sanitization-dev-frontend-724591801208.s3-website-us-west-2.amazonaws.com` |
| **API Lambda** | `gallo-sanitization-dev-api` (Node 22 ARM64, 1024 MB, 30s timeout) |
| **PDF Lambda** | `gallo-sanitization-dev-pdf` (Node 22 ARM64, 1024 MB, 60s timeout) |
| **DynamoDB tables** | 8: Users, Lines, Templates, Checklists, Connections, AuditLog, Factories, RateLimits — all prefixed `gallo-sanitization-dev-` |
| **S3 buckets** | 3: `gallo-sanitization-dev-frontend-724591801208` (public), `-images-...` (private), `-pdfs-...` (private, 90d lifecycle) |
| **SQS** | `gallo-sanitization-dev-pdf-generation-queue` + DLQ |
| **CloudWatch alarms** | DLQ-not-empty, API Lambda errors → SNS topic `gallo-sanitization-dev-alerts` |
| **AWS Budget** | `gallo-mvp-monthly-50` ($50/mo, email at 50% and 100%) |

41 Terraform resources, applied from [[Production Deployment]].

## Verification (end-to-end)

```bash
# API health
$ curl https://3j62zhgkj3.execute-api.us-west-2.amazonaws.com/health
{"status":"ok"}

# Admin login (full path: SPA → APIGW → Lambda → DynamoDB → JWT signing)
$ curl -X POST .../api/auth/login -d '{"email":"ymartinez@gallo.com","password":"admin123"}'
{"user":{"role":"admin","name":"Yolanda Martinez",...},"token":"eyJ..."}

# Authenticated paginated query
$ curl -H "Authorization: Bearer $TOKEN" .../api/checklists?limit=2
{"items":[...],"total":56,"hasMore":true}

# Factory list
$ curl -H "Authorization: Bearer $TOKEN" .../api/factories
[{"name":"Modesto Winery"},{"name":"Livingston Winery"},{"name":"Fresno Winery"},{"name":"Dry Creek Facility"}]
```

## Demo credentials (for the deployed app)

Same as local dev — see [[Demo Credentials]]. Seeded by `seed-dynamo.ts` against the prod tables.

## What had to change during deploy

Three Terraform / code fixes hit during the first apply, all committed in `5a16a3b`:

1. **`AWS_REGION` is reserved by Lambda.** The Terraform set it as a Lambda env var; apply failed with `InvalidParameterValueException: Lambda was unable to configure your environment variables because the environment variables you have provided contains reserved keys`. Fix: removed it. Lambda auto-injects it from the function's region; the SDK and `config/env.ts` already read it from there.

2. **`aws_s3_bucket_lifecycle_configuration` in provider 5.x requires an explicit `filter` or `prefix`.** Original Terraform had a rule with `expiration { days = 90 }` and no filter; the prefix-less form is deprecated. Fix: added `filter {}` (empty block = applies to all objects in the bucket).

3. **Frontend build was blocked by a pre-existing TS error in `render-helpers.tsx`.** `@reduxjs/toolkit`'s `configureStore` type inference got stricter at some point; the existing `reducer: { auth: authReducer }` no longer matches `Reducer<>`. Fix: cast to `as any` — the file is a test helper, never used at runtime.

## Two operational gotchas worth remembering

**Seed script silently routes to LocalStack.** `backend/.env` has `LOCALSTACK_ENDPOINT=http://localhost:4566` for local dev, and `dotenv.config()` in `config/env.ts` loads it automatically when running `npx tsx src/data/seed-dynamo.ts`. Without intervention, the seed targets a non-running LocalStack instead of real AWS — fails with `ResourceNotFoundException`. Fix: invoke the seed with `LOCALSTACK_ENDPOINT=""` in front, which dotenv won't override (it skips already-set vars). Document this in [[Production Deployment]].

**DynamoDB `ItemCount` lags by ~6 hours.** `aws dynamodb describe-table` reports `ItemCount: 0` immediately after seeding, which looks like a failed seed. To verify counts immediately use `aws dynamodb scan --select COUNT` instead.

## What's NOT live yet

Same gaps documented in [[Production Deployment]]:
- **WebSocket API Gateway** — backend is `WS_MODE=apigw` but `APIGW_WS_ENDPOINT` is unset, so the broadcaster init fails gracefully (try/catch added in `lambda-api.ts` for exactly this) and real-time presence/sync is disabled. Everything else works.
- **CloudFront** — frontend is served via the raw S3 website endpoint over HTTP. Fine for testing, not production.
- **Custom domain / Route 53** — same.
- **WAF** — none.

## Cost expectations after first day

Account is on AWS free tier for most services; expected first-month cost is under $5. The SSO assumed-role usage doesn't accrue cost. The $50/mo budget alarm is the hard guardrail with a 50%-threshold email warning.

## Files changed this deployment

- `infrastructure/lambda.tf` — removed `AWS_REGION` from both Lambda env blocks
- `infrastructure/s3.tf` — added `filter {}` to PDF lifecycle, plus the website hosting + public-read added in the deploy-prep commit
- `infrastructure/outputs.tf` — added `frontend_website_url` + per-table outputs
- `frontend/src/__tests__/render-helpers.tsx` — cast configureStore reducer
- `frontend/.gitignore` — added `*.tsbuildinfo`
- `frontend/src/services/api.ts` — `VITE_API_BASE` support (deploy-prep)
- `backend/src/lambda-api.ts` — try/catch around broadcaster init (deploy-prep)
- `backend/package.json` — `esbuild` devDependency (deploy-prep)
- `.mcp.json` — registered `awslabs/aws-api-mcp-server` for deploy verification
- `.claude/settings.json` — `enableAllProjectMcpServers: true`

## See also

- [[Production Deployment]] — the runbook, now updated with actual outputs and operational gotchas
- [[2026-04-30 Lambda Readiness and WS Hardening]] — the foundational changes that enabled this deploy
- [[System Architecture]] — the topology Terraform provisions
