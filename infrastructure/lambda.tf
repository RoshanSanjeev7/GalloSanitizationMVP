# ─── Lambda functions ────────────────────────────────────────────────
# Single function: lambda-api (Express via serverless-http). PDFs are
# rendered synchronously inside this same Lambda by the GET /:id/pdf
# route — no separate worker, no SQS, no S3 cache. The async PDF path
# was removed in favor of on-demand sync generation; see
# wiki/Subsystems/PDF Export.md for rationale.
#
# ARM (Graviton2): ~20% cheaper, often faster cold starts than x86.
# No native deps that lack ARM builds in this app.
#
# Bundling: esbuild produces a tree-shaken bundle <10 MB. PDFKit fonts
# are copied alongside the bundle by build-lambdas.sh so PDFKit's font
# loader can find them at /var/task/data/*.afm.

locals {
  api_dist_dir = "${path.module}/../backend/dist/lambda-api"
}

data "archive_file" "lambda_api" {
  type        = "zip"
  source_dir  = local.api_dist_dir
  output_path = "${path.module}/.artifacts/lambda-api.zip"
}

# ── API Lambda ───────────────────────────────────────────────────────
# Wraps the Express app from backend/src/lambda-api.ts. Receives every
# HTTP request from API Gateway. Memory + timeout are tuned for a
# typical CRUD workload — the sync /pdf endpoint is the hot path that
# actually exercises CPU, and 1024 MB is plenty for it.

resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  role          = aws_iam_role.lambda_api.arn

  filename         = data.archive_file.lambda_api.output_path
  source_code_hash = data.archive_file.lambda_api.output_base64sha256
  # Handler format: <filename-no-ext>.<exported-function>. The bundle
  # script writes the handler as index.mjs and exports `handler`.
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]

  # Publish a new version on every change so provisioned concurrency
  # can target a stable version qualifier. Without `publish = true`,
  # provisioned concurrency would either fail (no version) or silently
  # serve traffic from the wrong version.
  publish = true

  # 1024 MB strikes a balance between cold-start time (smaller is
  # faster up to a point) and steady-state CPU (Lambda gives more vCPU
  # per MB allocated). 30s timeout matches the API Gateway HTTP API
  # cap — large checklists that exceed this should be addressed by
  # paginating the renderer, not by re-introducing async caching.
  memory_size = 1024
  timeout     = 30

  environment {
    variables = {
      NODE_ENV        = var.environment == "prod" ? "production" : var.environment
      JWT_SECRET      = var.jwt_secret
      FRONTEND_ORIGIN = var.frontend_origin
      # AWS_REGION is reserved — Lambda auto-injects it from the
      # function's region. Setting it here yields InvalidParameterValueException.
      WS_MODE = "apigw"
      S3_BUCKET = aws_s3_bucket.images.bucket
      DYNAMODB_TABLE_USERS       = aws_dynamodb_table.users.name
      DYNAMODB_TABLE_LINES       = aws_dynamodb_table.lines.name
      DYNAMODB_TABLE_TEMPLATES   = aws_dynamodb_table.templates.name
      DYNAMODB_TABLE_CHECKLISTS  = aws_dynamodb_table.checklists.name
      DYNAMODB_TABLE_CONNECTIONS = aws_dynamodb_table.connections.name
      DYNAMODB_TABLE_AUDIT_LOG   = aws_dynamodb_table.audit_log.name
      DYNAMODB_TABLE_FACTORIES   = aws_dynamodb_table.factories.name
      DYNAMODB_TABLE_RATE_LIMITS = aws_dynamodb_table.rate_limits.name
      # APIGW_WS_ENDPOINT is wired up once the WebSocket API is
      # provisioned in a follow-up commit. Until then, Express WS
      # broadcasts will log warnings and no-op.
    }
  }
}

# Provisioned concurrency keeps containers warm so login / first-page
# loads don't pay a 500ms cold-start penalty during business hours.
# Set to 0 by default (free tier friendly); production should set
# lambda_api_provisioned_concurrency = 2 in its tfvars.
resource "aws_lambda_provisioned_concurrency_config" "api" {
  count                             = var.lambda_api_provisioned_concurrency > 0 ? 1 : 0
  function_name                     = aws_lambda_function.api.function_name
  qualifier                         = aws_lambda_function.api.version
  provisioned_concurrent_executions = var.lambda_api_provisioned_concurrency
}
