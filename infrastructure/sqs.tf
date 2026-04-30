# ─── SQS ────────────────────────────────────────────────────────────
# pdf-generation-queue + DLQ for the async PDF Lambda. See
# wiki/Subsystems/PDF Export.md for the producer/consumer flow.
#
# Visibility timeout is 6× the Lambda timeout so SQS doesn't
# redeliver a still-running message — cheap insurance against the
# "duplicate PDF generation" bug class. The Lambda's own idempotency
# guard (skip if pdfKey set) is the real defense, but layered.

resource "aws_sqs_queue" "pdf_dlq" {
  name = "${local.name_prefix}-pdf-generation-dlq"

  # 14 days is the SQS maximum. DLQs should hold long enough for an
  # operator to investigate without losing messages while they're
  # still on vacation.
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "pdf_queue" {
  name                       = "${local.name_prefix}-pdf-generation-queue"
  visibility_timeout_seconds = 360 # 6 × the 60s Lambda timeout

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.pdf_dlq.arn
    # Three failed attempts is enough to distinguish "transient blip"
    # from "actually broken" while not retrying forever.
    maxReceiveCount = 3
  })
}
