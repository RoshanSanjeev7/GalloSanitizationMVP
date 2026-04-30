# ─── API Gateway HTTP API ───────────────────────────────────────────
# HTTP API (v2) rather than REST API (v1): cheaper ($1/M vs $3.50/M
# requests), faster cold starts, and supports the proxy integration
# pattern that lets us route every path to the same Express Lambda.
#
# Note on WebSocket: API Gateway WebSocket is a SEPARATE API type
# from HTTP. It's not provisioned here — landing it requires porting
# the four route handlers from LocalWsBroadcaster (also tracked as a
# follow-up).

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  # CORS handled at the gateway layer rather than in Express. The
  # Express middleware is still in place but with `frontend_origin`
  # already aligned, the gateway-layer config is purely defense in
  # depth (and lets us short-circuit OPTIONS without a Lambda invoke).
  cors_configuration {
    allow_origins  = [var.frontend_origin]
    allow_methods  = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers  = ["Authorization", "Content-Type"]
    expose_headers = ["Content-Length"]
    max_age        = 600
  }
}

# Single proxy integration — every request goes to the API Lambda.
# AWS_PROXY format passes the raw event to Lambda; serverless-http
# decodes it back into an Express request.
resource "aws_apigatewayv2_integration" "http_to_api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

# `$default` catches every method+path that doesn't have an explicit
# route — which is all of them, since we proxy everything.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.http_to_api.id}"
}

# Auto-deploy stage: any change to the API config rolls out without a
# manual deploy step. Fine for a single-environment-per-stack setup.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    # Per-route throttle: belt to API Gateway's account-level limit's
    # suspenders. 1000 burst / 500 sustained is generous for MVP and
    # scales linearly via tfvars override if traffic grows.
    throttling_burst_limit = 1000
    throttling_rate_limit  = 500
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${local.name_prefix}-http-api"
  retention_in_days = var.environment == "prod" ? 30 : 7
}

# Permission for API Gateway to invoke the Lambda. Without this, the
# integration would fail with AccessDeniedException at the gateway.
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
