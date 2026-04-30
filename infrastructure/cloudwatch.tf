# ─── CloudWatch alarms ──────────────────────────────────────────────
# One alarm covers the system-health signal we care about most:
#
#   - API Lambda error rate — catches uncaught exceptions and
#     auth-broken-by-deployment scenarios. Threshold is "any errors
#     in a 5-minute window" since the Lambda should normally be
#     error-free.
#
# The PDF DLQ alarm was removed when the async PDF path was
# decommissioned (no SQS = no DLQ).
#
# Alerts go to an SNS topic; consumers (email, Slack, PagerDuty) are
# subscribed out of band so the topic stays as the routing seam.

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
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
