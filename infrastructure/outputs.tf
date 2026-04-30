# Outputs you'll wire into the frontend build / app config:
#   - api_gateway_url    → set as VITE_API_BASE in the frontend
#   - frontend_bucket    → S3 sync target for the React build
#   - alerts_topic_arn   → subscribe email/Slack here

output "api_gateway_url" {
  description = "Base URL of the HTTP API. Add /api/... paths to hit Express routes."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "frontend_bucket" {
  description = "S3 bucket name to upload the built React SPA into."
  value       = aws_s3_bucket.frontend.bucket
}

output "images_bucket" {
  description = "S3 bucket for checklist images (presigned-URL upload target)."
  value       = aws_s3_bucket.images.bucket
}

output "pdfs_bucket" {
  description = "S3 bucket for generated PDFs."
  value       = aws_s3_bucket.pdfs.bucket
}

output "pdf_queue_url" {
  description = "SQS queue URL for PDF generation jobs."
  value       = aws_sqs_queue.pdf_queue.url
}

output "alerts_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms. Subscribe email/Slack/PagerDuty here."
  value       = aws_sns_topic.alerts.arn
}

output "api_lambda_function_name" {
  description = "API Lambda function name — useful for `aws lambda update-function-code` deploys."
  value       = aws_lambda_function.api.function_name
}

output "pdf_lambda_function_name" {
  description = "PDF Lambda function name — useful for deployment scripts."
  value       = aws_lambda_function.pdf.function_name
}
