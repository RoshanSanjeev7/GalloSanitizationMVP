# ─── S3 buckets ─────────────────────────────────────────────────────
# Three buckets:
#   - frontend-assets  : the built React SPA, served via CloudFront.
#   - checklist-images : photos uploaded directly from the browser
#                        via presigned PUT URLs.
#   - checklist-pdfs   : Lambda-generated PDF exports, served via
#                        presigned GET URLs from /pdf/status.
#
# All buckets are private + SSE-S3. The frontend bucket is fronted by
# CloudFront (provisioned in cloudfront.tf — TODO) which terminates
# public access; the data buckets are reached only via presigned URLs.
#
# Bucket names must be globally unique, so we suffix them with the
# AWS account ID via a data source — keeps `terraform apply` idempotent
# even if someone in another account deploys the same stack.

data "aws_caller_identity" "current" {}

locals {
  bucket_suffix = data.aws_caller_identity.current.account_id
}

# ── Frontend assets ──────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = "${local.name_prefix}-frontend-${local.bucket_suffix}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Checklist images ─────────────────────────────────────────────────
# CORS opens up the presigned-URL upload flow — the browser PUTs
# directly to S3 from app.gallo-sanitization.com. Without CORS the
# upload would fail with a preflight error.
resource "aws_s3_bucket" "images" {
  bucket        = "${local.name_prefix}-images-${local.bucket_suffix}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET"]
    allowed_origins = [var.frontend_origin]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ── Checklist PDFs ───────────────────────────────────────────────────
# Lifecycle rule: drop PDFs after 90 days. Regenerating them is cheap
# (idempotent Lambda) so we don't pay storage for old exports nobody
# is downloading.
resource "aws_s3_bucket" "pdfs" {
  bucket        = "${local.name_prefix}-pdfs-${local.bucket_suffix}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "pdfs" {
  bucket                  = aws_s3_bucket.pdfs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pdfs" {
  bucket = aws_s3_bucket.pdfs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "pdfs" {
  bucket = aws_s3_bucket.pdfs.id

  rule {
    id     = "expire-old-pdfs"
    status = "Enabled"
    expiration {
      days = 90
    }
  }
}
