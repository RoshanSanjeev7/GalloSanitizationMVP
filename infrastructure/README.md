# Infrastructure (Terraform)

Production AWS infrastructure for the Gallo Sanitization MVP, defined as Terraform. Deploys the fully-serverless hosting model documented in [[wiki/Architecture/System Architecture]] and the [[wiki/DevLog/2026-04-30 Lambda Readiness and WS Hardening]] devlog.

## What this provisions

| Resource | Purpose |
|---|---|
| 8 DynamoDB tables | All seven app tables + the rate-limit counter table. Includes GSIs and TTL settings. |
| 3 S3 buckets | `frontend-assets`, `checklist-images`, `checklist-pdfs` (with 90-day lifecycle on PDFs). |
| 1 SQS queue + DLQ | `pdf-generation-queue` and its dead-letter queue. |
| 2 Lambda functions | `lambda-api` (Express via serverless-http, behind API Gateway HTTP API) and `lambda-pdf` (SQS-triggered PDF generator). |
| 1 API Gateway HTTP API | Routes `/{proxy+}` to `lambda-api`. The browser hits this. |
| 1 IAM role per Lambda | Least-privilege scoping: DynamoDB access only to the app tables, S3 only to the app buckets, SQS only to the PDF queue. |
| 1 SQS event source mapping | Wires the queue to `lambda-pdf` with batch size 1 for snappy delivery. |
| CloudWatch alarms | DLQ depth > 0 and Lambda error rate. |

## What's NOT yet provisioned (follow-up work)

- **API Gateway WebSocket API** — placeholder only. The four route Lambdas (`$connect`, `$disconnect`, `$default`, message handlers) need to be ported from `LocalWsBroadcaster` first (they share most of the message-routing code; mostly a packaging exercise).
- **CloudFront distribution** for the frontend S3 bucket — straightforward addition once you decide on the domain.
- **Route 53 records** — depends on which domain you're using.
- **EventBridge schedules** for any cron-driven Lambdas (presence summary is now event-driven so this isn't urgent — but cleanup jobs eventually want it).
- **WAF rules** — depending on threat model.

## Layout

```
infrastructure/
  README.md           — this file
  versions.tf         — Terraform + provider version constraints
  variables.tf        — environment, region, project_name, etc.
  outputs.tf          — the URLs / ARNs you'll wire into the app's env vars
  providers.tf        — AWS provider config
  dynamodb.tf         — all 8 tables
  s3.tf               — buckets + policies
  sqs.tf              — pdf-generation-queue + DLQ
  lambda.tf           — both Lambda functions, packaging, env vars
  iam.tf              — Lambda execution roles + per-resource policies
  apigateway.tf       — HTTP API + integration + permissions
  cloudwatch.tf       — alarms
```

## Usage

```bash
# 1. Build the Lambda artifacts (one-time per code change)
cd ../backend
npm run build:lambda     # produces dist/lambda-api.zip and dist/lambda-pdf.zip

# 2. Deploy
cd ../infrastructure
terraform init
terraform plan -var environment=dev    # review the plan
terraform apply -var environment=dev   # actually deploy

# 3. Read the outputs and wire into the frontend
terraform output api_gateway_url    # set as VITE_API_BASE in the frontend build
terraform output frontend_bucket    # upload the built frontend assets here
```

The `npm run build:lambda` script is added in the same PR as this Terraform code; it runs esbuild with tree-shaken `@aws-sdk` imports so the deployment package stays well under the 50 MB Lambda zip limit.

## Multi-environment

`environment` is a Terraform variable (`dev`, `staging`, `prod`). All resources are name-prefixed with the environment so `terraform workspace select prod && terraform apply` produces a fully-isolated `prod` stack. Use separate AWS accounts via the `AWS_PROFILE` env var for production.

## Cost expectations

At MVP traffic (single facility, 100 users): **<$30/month** — most of which is DynamoDB on-demand (~$15) and provisioned concurrency on `lambda-api` (~$15 for two warm containers during business hours). At zero traffic outside business hours: **~$5/month** flat.

See [[wiki/Architecture/System Architecture]] for the full cost model and crossover analysis vs Fargate.
