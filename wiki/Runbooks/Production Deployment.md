---
tags: [runbook]
created: 2026-04-30
updated: 2026-04-30
---

# Production Deployment

The production AWS stack is defined as Terraform in `infrastructure/`. This page covers what's provisioned, how to deploy it, and what's known to be missing.

## What's provisioned

| Layer | Resource | Purpose |
|---|---|---|
| Data | 8 DynamoDB tables (Users, Lines, Templates, Checklists, Connections, AuditLog, Factories, RateLimits) | All app state. Includes GSIs and TTL. |
| Storage | 3 S3 buckets (frontend-assets, checklist-images, checklist-pdfs) | Static SPA, photos, PDFs. PDF bucket has 90-day lifecycle. |
| Queue | SQS pdf-generation-queue + DLQ | Async PDF jobs from POST /:id/submit. |
| Compute | 2 Lambdas (lambda-api, lambda-pdf) | Express via serverless-http; PDF generator. ARM64, Node 22, esbuild-bundled. |
| API | API Gateway HTTP API → lambda-api | Routes every HTTP request to the API Lambda. |
| Trigger | SQS event source mapping → lambda-pdf | batch_size=1, ReportBatchItemFailures for partial failures. |
| Security | Per-Lambda IAM roles, least privilege | API role: app tables R/W, images R/W, PDFs R, SQS publish. PDF role: checklists R/W, PDFs W, SQS consume. |
| Observability | CloudWatch alarms (DLQ depth > 0, API Lambda errors > 0) → SNS topic | Alerts go through one topic; subscribers (email/Slack) are subscribed out of band. |

## What's not yet provisioned

- **API Gateway WebSocket API** — placeholder only. Requires porting four route handlers (`$connect`, `$disconnect`, `$default`, message router) from `LocalWsBroadcaster`. Most of the message-routing logic is already in place; this is mostly a packaging exercise.
- **CloudFront distribution** for the frontend bucket — straightforward but requires deciding on the domain.
- **Route 53** DNS records — depends on the chosen domain.
- **EventBridge schedules** — none currently needed (presence is event-driven now), but eventually wanted for cleanup jobs.
- **WAF** — depends on threat model.

## Currently deployed (capstone account 724591801208)

| Resource | Value |
|---|---|
| API Gateway | `https://3j62zhgkj3.execute-api.us-west-2.amazonaws.com` |
| Frontend SPA | `http://gallo-sanitization-dev-frontend-724591801208.s3-website-us-west-2.amazonaws.com` |
| Region | `us-west-2` |
| AWS profile | `gallo-cap` (SSO via `aws configure sso`) |
| Identity Center region | `us-east-1` (separate from workload region — this is normal) |

First deployed 2026-04-30; see [[2026-04-30 First AWS Deployment]] devlog.

## Pre-flight

```bash
# Tooling
brew install awscli terraform uv

# AWS SSO (one-time per machine)
aws configure sso
# Profile name: gallo-cap
# SSO region: us-east-1
# Default region: us-west-2

# Verify
aws sts get-caller-identity --profile gallo-cap   # should print account 724591801208
```

## Deployment

```bash
# 1. Build the Lambda artifacts.
cd infrastructure
./build-lambdas.sh

# 2. Set the JWT secret (NEVER commit this).
export TF_VAR_jwt_secret="$(openssl rand -hex 32)"
export AWS_PROFILE=gallo-cap

# 3. Plan + apply (FIRST PASS).
terraform init
terraform plan -var-file=dev.tfvars     # review carefully (~41 resources)
terraform apply -var-file=dev.tfvars

# 4. SECOND PASS: update frontend_origin in dev.tfvars to the actual
#    S3 website URL (now known from the first apply's outputs), re-apply.
#    This is what wires CORS to the real SPA origin.
terraform output frontend_website_url
# Edit dev.tfvars: frontend_origin = "<the URL above>"
terraform apply -var-file=dev.tfvars

# 5. Seed DynamoDB with demo data.
#    NOTE: LOCALSTACK_ENDPOINT="" is REQUIRED — backend/.env has the dev
#    LocalStack URL, and dotenv would load it and silently route the
#    seed at LocalStack (failing with ResourceNotFoundException).
#    Setting it to empty string in the parent env makes dotenv skip it
#    (dotenv won't override already-set vars).
cd ../backend
LOCALSTACK_ENDPOINT="" \
  AWS_PROFILE=gallo-cap \
  AWS_REGION=us-west-2 \
  DYNAMODB_TABLE_USERS="$(cd ../infrastructure && terraform output -raw users_table_name)" \
  DYNAMODB_TABLE_LINES="$(cd ../infrastructure && terraform output -raw lines_table_name)" \
  DYNAMODB_TABLE_TEMPLATES="$(cd ../infrastructure && terraform output -raw templates_table_name)" \
  DYNAMODB_TABLE_CHECKLISTS="$(cd ../infrastructure && terraform output -raw checklists_table_name)" \
  DYNAMODB_TABLE_CONNECTIONS="$(cd ../infrastructure && terraform output -raw connections_table_name)" \
  DYNAMODB_TABLE_AUDIT_LOG="$(cd ../infrastructure && terraform output -raw audit_log_table_name)" \
  DYNAMODB_TABLE_FACTORIES="$(cd ../infrastructure && terraform output -raw factories_table_name)" \
  S3_BUCKET="$(cd ../infrastructure && terraform output -raw images_bucket)" \
  npx tsx src/data/seed-dynamo.ts

# 6. Build + upload frontend.
cd ../frontend
VITE_API_BASE="$(cd ../infrastructure && terraform output -raw api_gateway_url)" npm run build
AWS_PROFILE=gallo-cap aws s3 sync dist "s3://$(cd ../infrastructure && terraform output -raw frontend_bucket)/" --delete

# 7. Smoke test.
curl "$(cd ../infrastructure && terraform output -raw api_gateway_url)/health"
open "$(cd ../infrastructure && terraform output -raw frontend_website_url)"
```

## Operational gotchas (learned the hard way 2026-04-30)

1. **`AWS_REGION` is reserved by Lambda** — never set it in a Lambda env block. Apply fails with `InvalidParameterValueException`. The runtime auto-injects it.

2. **`aws_s3_bucket_lifecycle_configuration` rules need an explicit `filter {}` block** in aws provider 5.x. Prefix-less rules are deprecated and fail apply.

3. **Seed script via `tsx` will silently target LocalStack** if `backend/.env` has `LOCALSTACK_ENDPOINT` set (it does, for local dev). Always invoke with `LOCALSTACK_ENDPOINT=""` prefix when seeding production DynamoDB.

4. **DynamoDB `describe-table` ItemCount lags ~6 hours.** Use `aws dynamodb scan --select COUNT` for real-time counts when verifying a fresh seed.

5. **Two-pass apply is mandatory** — `frontend_origin` isn't known until S3 buckets exist. First apply creates everything with a placeholder; second apply fixes CORS. Don't skip.

## Cost expectations

See [[System Architecture]] for the full cost analysis. Brief recap:

| Traffic level | Monthly cost (rough) |
|---|---|
| MVP / dev (1K req/day) | <$5 (free tier) |
| One facility (100 users) | $20-40 |
| Full Gallo (1000 users) | $150-300 |
| 10× growth | $1.5-3K — Fargate becomes preferable here |

## See also

- [[System Architecture]] -- the runtime topology Terraform provisions
- [[DynamoDB Tables]] -- schema + GSI design that the Terraform mirrors
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- the foundational backend changes that made this stack possible
- [[2026-04-30 First AWS Deployment]] -- the actual first deploy, including the gotchas above
