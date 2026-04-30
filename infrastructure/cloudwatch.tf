# ─── CloudWatch alarms ──────────────────────────────────────────────
# Two alarms cover the most common "something's wrong" signals:
#
#   1. PDF DLQ depth > 0 — at-least-once delivery + 3-retry redrive
#      means anything in the DLQ is a real failure that warrants
#      investigation. An admin tool to inspect & retry DLQ messages
#      is on the follow-up list.
#
#   2. API Lambda error rate — catches uncaught exceptions and
#      auth-broken-by-deployment scenarios. Threshold is "any errors
#      in a 5-minute window" since the Lambda should normally be
#      error-free.
#
# Alerts go to an SNS topic; consumers (email, Slack, PagerDuty) are
# subscribed out of band so the topic stays as the routing seam.

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

resource "aws_cloudwatch_metric_alarm" "pdf_dlq_messages" {
  alarm_name          = "${local.name_prefix}-pdf-dlq-not-empty"
  alarm_description   = "Messages have landed in the PDF generation DLQ — investigate Lambda errors."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  period              = 60
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.pdf_dlq.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_errors" {
  alarm_name          = "${local.name_prefix}-api-lambda-errors"
  alarm_description   = "API Lambda is throwing errors. Check CloudWatch Logs."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  period              = 300
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}
