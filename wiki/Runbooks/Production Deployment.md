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

## Deployment

```bash
# 1. Build the Lambda artifacts.
cd infrastructure
./build-lambdas.sh

# 2. Set the JWT secret (NEVER commit this).
export TF_VAR_jwt_secret="$(openssl rand -hex 32)"

# 3. Plan + apply.
terraform init
terraform plan -var-file=dev.tfvars     # review carefully
terraform apply -var-file=dev.tfvars

# 4. Read outputs and wire into the frontend.
terraform output api_gateway_url        # → set as VITE_API_BASE in frontend build
terraform output frontend_bucket        # → aws s3 sync the frontend dist here
```

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
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- the foundational backend changes that make this stack possible
