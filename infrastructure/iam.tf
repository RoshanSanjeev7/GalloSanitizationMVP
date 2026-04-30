# ─── IAM ────────────────────────────────────────────────────────────
# Single execution role for the API Lambda. Bare-minimum permissions —
# least privilege. When something blows up in production with an
# AccessDenied error, the fix is to widen one specific statement here,
# not blanket-grant.
#
# The PDF Lambda role + SQS-related statements were removed when the
# async PDF path was decommissioned. PDFs now render synchronously
# inside the API Lambda (no separate worker, no S3 cache, no SQS).

# ── Trust policy ────────────────────────────────────────────────────
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
# Reads + writes every app DynamoDB table and the images S3 bucket.
# The PDFs bucket and SQS queue are gone.

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
    sid = "AppTablesReadWrite"
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
}

resource "aws_iam_role_policy" "lambda_api_inline" {
  name   = "${local.name_prefix}-lambda-api-inline"
  role   = aws_iam_role.lambda_api.id
  policy = data.aws_iam_policy_document.lambda_api_inline.json
}
