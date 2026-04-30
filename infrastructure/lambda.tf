# ─── Lambda functions ────────────────────────────────────────────────
# Two functions: lambda-api (Express via serverless-http) and lambda-pdf
# (SQS-triggered PDF generator). Code zip artifacts come from
# `npm run build:lambda` in the backend workspace.
#
# ARM (Graviton2) for both: ~20% cheaper, often faster cold starts than
# x86. No native deps that lack ARM builds in this app.
#
# Bundling expectation: esbuild produces a tree-shaken bundle <10 MB
# per function. The `archive_file` data source zips the dist directory.

# ── Build artifact paths ─────────────────────────────────────────────
# The backend's build script writes here. If the file is missing,
# `terraform plan` fails fast with a helpful error rather than
# deploying a stale artifact.

locals {
  api_dist_dir = "${path.module}/../backend/dist/lambda-api"
  pdf_dist_dir = "${path.module}/../backend/dist/lambda-pdf"
}

data "archive_file" "lambda_api" {
  type        = "zip"
  source_dir  = local.api_dist_dir
  output_path = "${path.module}/.artifacts/lambda-api.zip"
}

data "archive_file" "lambda_pdf" {
  type        = "zip"
  source_dir  = local.pdf_dist_dir
  output_path = "${path.module}/.artifacts/lambda-pdf.zip"
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
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]

  # Publish a new version on every change so provisioned concurrency
  # can target a stable version qualifier. Without `publish = true`,
  # provisioned concurrency would either fail (no version) or silently
  # serve traffic from the wrong version.
  publish = true

  # 1024 MB strikes a balance between cold-start time (smaller is
  # faster up to a point) and steady-state CPU (Lambda gives more vCPU
  # per MB allocated). 30s timeout matches the API Gateway HTTP API
  # cap — anything slower falls into the async PDF path.
  memory_size = 1024
  timeout     = 30

  environment {
    variables = {
      NODE_ENV                = var.environment == "prod" ? "production" : var.environment
      JWT_SECRET              = var.jwt_secret
      FRONTEND_ORIGIN         = var.frontend_origin
      # AWS_REGION is reserved — Lambda auto-injects it from the
      # function's region. Setting it here yields InvalidParameterValueException.
      WS_MODE                 = "apigw"
      ENABLE_ASYNC_PDF        = tostring(var.enable_async_pdf)
      S3_BUCKET               = aws_s3_bucket.images.bucket
      SQS_QUEUE_URL           = aws_sqs_queue.pdf_queue.url
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

# ── PDF Lambda ───────────────────────────────────────────────────────
# Triggered by SQS messages from POST /:id/submit. Does the heavy
# PDFKit rendering off the request thread. Memory bumped to 1024 MB
# because PDF generation is CPU-bound and Lambda gives proportional
# vCPU.

resource "aws_lambda_function" "pdf" {
  function_name = "${local.name_prefix}-pdf"
  role          = aws_iam_role.lambda_pdf.arn

  filename         = data.archive_file.lambda_pdf.output_path
  source_code_hash = data.archive_file.lambda_pdf.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]

  memory_size = 1024
  timeout     = 60

  environment {
    variables = {
      NODE_ENV   = var.environment == "prod" ? "production" : var.environment
      # AWS_REGION is reserved — Lambda auto-injects it.
      S3_BUCKET  = aws_s3_bucket.pdfs.bucket
      DYNAMODB_TABLE_CHECKLISTS = aws_dynamodb_table.checklists.name
    }
  }
}

# Wires the SQS queue to the PDF Lambda. batch_size=1 +
# batching_window=0 makes submission → PDF feel snappy (no
# coalescing delay).
resource "aws_lambda_event_source_mapping" "pdf_sqs" {
  event_source_arn                   = aws_sqs_queue.pdf_queue.arn
  function_name                      = aws_lambda_function.pdf.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0

  # Don't accept the message as "processed" if the Lambda errored.
  # SQS will retry up to maxReceiveCount before sending to the DLQ.
  function_response_types = ["ReportBatchItemFailures"]
}
