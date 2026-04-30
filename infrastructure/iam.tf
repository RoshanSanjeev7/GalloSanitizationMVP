# ─── IAM ────────────────────────────────────────────────────────────
# Two execution roles, one per Lambda. Each has the bare-minimum
# permissions to do its job — least privilege all the way down.
# When something blows up in production with an AccessDenied error,
# the fix is to widen one specific statement here, not blanket-grant.

# ── Trust policy (shared) ────────────────────────────────────────────
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ── API Lambda ───────────────────────────────────────────────────────
# Reads + writes every app DynamoDB table, reads + writes the image
# and PDF S3 buckets (the latter only for the sync /pdf fallback path),
# publishes to the PDF SQS queue.

resource "aws_iam_role" "lambda_api" {
  name               = "${local.name_prefix}-lambda-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_api_basic" {
  role       = aws_iam_role.lambda_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_api_inline" {
  # All app tables + their indexes. CRUD-shaped: API does reads,
  # writes, and conditional updates.
  statement {
    sid     = "AppTablesReadWrite"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactGetItems",
      "dynamodb:TransactWriteItems",
    ]
    resources = [
      aws_dynamodb_table.users.arn,
      "${aws_dynamodb_table.users.arn}/index/*",
      aws_dynamodb_table.lines.arn,
      aws_dynamodb_table.templates.arn,
      "${aws_dynamodb_table.templates.arn}/index/*",
      aws_dynamodb_table.checklists.arn,
      "${aws_dynamodb_table.checklists.arn}/index/*",
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/*",
      aws_dynamodb_table.audit_log.arn,
      "${aws_dynamodb_table.audit_log.arn}/index/*",
      aws_dynamodb_table.factories.arn,
      aws_dynamodb_table.rate_limits.arn,
    ]
  }

  # Image bucket: full object-level CRUD because the API mints
  # presigned URLs (read AND write) for the browser.
  statement {
    sid       = "ImagesReadWrite"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.images.arn}/*"]
  }

  # PDF bucket: read-only for the API. Only the PDF Lambda writes here.
  statement {
    sid       = "PdfsRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.pdfs.arn}/*"]
  }

  # SQS publish only — the API queues PDF generation jobs but never
  # consumes from this queue.
  statement {
    sid       = "QueuePdfPublish"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.pdf_queue.arn]
  }
}

resource "aws_iam_role_policy" "lambda_api_inline" {
  name   = "${local.name_prefix}-lambda-api-inline"
  role   = aws_iam_role.lambda_api.id
  policy = data.aws_iam_policy_document.lambda_api_inline.json
}

# ── PDF Lambda ───────────────────────────────────────────────────────
# Reads checklists, writes the pdfKey back, uploads to the PDFs
# bucket, and consumes from the SQS queue.

resource "aws_iam_role" "lambda_pdf" {
  name               = "${local.name_prefix}-lambda-pdf"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_pdf_basic" {
  role       = aws_iam_role.lambda_pdf.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_pdf_inline" {
  # Checklists table only — PDF lambda reads the source and writes
  # back pdfKey/pdfGeneratedAt. No other table access needed.
  statement {
    sid     = "ChecklistReadWrite"
    actions = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.checklists.arn]
  }

  # PDF bucket: write only.
  statement {
    sid       = "PdfsWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.pdfs.arn}/*"]
  }

  # SQS event source mapping calls these on our behalf. Receive +
  # Delete = consume message. GetQueueAttributes is required for the
  # event source mapping itself to function. ChangeMessageVisibility
  # is required by `function_response_types = ["ReportBatchItemFailures"]`
  # — when the Lambda reports a partial failure, AWS extends the
  # visibility of the failed records so they get redelivered cleanly.
  statement {
    sid     = "QueuePdfConsume"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.pdf_queue.arn]
  }
}

resource "aws_iam_role_policy" "lambda_pdf_inline" {
  name   = "${local.name_prefix}-lambda-pdf-inline"
  role   = aws_iam_role.lambda_pdf.id
  policy = data.aws_iam_policy_document.lambda_pdf_inline.json
}
