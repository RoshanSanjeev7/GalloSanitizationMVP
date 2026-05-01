# ─── WebSocket API Gateway + WS Lambda ──────────────────────────────
# A separate API Gateway from the HTTP API — WebSocket is a different
# protocol type (`WEBSOCKET`) and can't share the HTTP API resource.
#
# Architecture (mirroring local-ws.ts but Lambda-shaped):
#   Browser <-WS-> API Gateway WebSocket <-> Lambda (lambda-ws.ts)
#                                              |
#                                              +-> DynamoDB Connections
#
# Three routes, all backed by the same Lambda which dispatches by
# `requestContext.routeKey`:
#   - $connect    — auth via JWT in ?token=...; record connection
#   - $disconnect — remove connection
#   - $default    — handle subscribe / machine_change / heartbeat / etc.
#
# The API Lambda (HTTP routes) gets `APIGW_WS_ENDPOINT` so it can post
# real-time updates back to clients via the Management API when a
# checklist mutates (item update, comment, status change).

# ── Lambda artifact + function ──────────────────────────────────────

locals {
  ws_dist_dir = "${path.module}/../backend/dist/lambda-ws"
}

data "archive_file" "lambda_ws" {
  type        = "zip"
  source_dir  = local.ws_dist_dir
  output_path = "${path.module}/.artifacts/lambda-ws.zip"
}

resource "aws_lambda_function" "ws" {
  function_name = "${local.name_prefix}-ws"
  role          = aws_iam_role.lambda_ws.arn

  filename         = data.archive_file.lambda_ws.output_path
  source_code_hash = data.archive_file.lambda_ws.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]

  # WebSocket events are tiny (single message at a time) and the only
  # work is DDB I/O + a few PostToConnection calls. 256 MB is plenty;
  # 10s timeout is generous (typical event handles in <100ms).
  memory_size = 256
  timeout     = 10

  environment {
    variables = {
      JWT_SECRET                 = var.jwt_secret
      DYNAMODB_TABLE_USERS       = aws_dynamodb_table.users.name
      DYNAMODB_TABLE_CONNECTIONS = aws_dynamodb_table.connections.name
    }
  }
}

# ── IAM role for the WS Lambda ──────────────────────────────────────
# Smaller surface than the API Lambda: only Users (for JWT-userId
# lookup at $connect) and Connections (CRUD for subscriber tracking).
# It also needs `execute-api:ManageConnections` to PostToConnection
# back to clients on the same WebSocket API.

resource "aws_iam_role" "lambda_ws" {
  name               = "${local.name_prefix}-lambda-ws"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_ws_basic" {
  role       = aws_iam_role.lambda_ws.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_ws_inline" {
  statement {
    sid = "ConnectionsAndUsers"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/*",
      aws_dynamodb_table.users.arn,
      "${aws_dynamodb_table.users.arn}/index/*",
    ]
  }

  statement {
    sid       = "PostToConnection"
    actions   = ["execute-api:ManageConnections"]
    resources = ["${aws_apigatewayv2_api.ws.execution_arn}/*/*"]
  }
}

resource "aws_iam_role_policy" "lambda_ws_inline" {
  name   = "${local.name_prefix}-lambda-ws-inline"
  role   = aws_iam_role.lambda_ws.id
  policy = data.aws_iam_policy_document.lambda_ws_inline.json
}

# Also grant the API Lambda permission to post back to WebSocket clients,
# so HTTP route handlers can broadcast updates (item_update, status_change,
# etc.) via the ApiGatewayBroadcaster.
resource "aws_iam_role_policy" "lambda_api_ws_post" {
  name = "${local.name_prefix}-lambda-api-ws-post"
  role = aws_iam_role.lambda_api.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid      = "PostToWsConnection",
      Effect   = "Allow",
      Action   = "execute-api:ManageConnections",
      Resource = "${aws_apigatewayv2_api.ws.execution_arn}/*/*",
    }]
  })
}

# ── WebSocket API + routes + integrations ───────────────────────────

resource "aws_apigatewayv2_api" "ws" {
  name                       = "${local.name_prefix}-ws-api"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.type"
}

resource "aws_apigatewayv2_integration" "ws_to_lambda" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_connect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_to_lambda.id}"
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_to_lambda.id}"
}

resource "aws_apigatewayv2_route" "ws_default" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ws_to_lambda.id}"
}

resource "aws_apigatewayv2_stage" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "ws_apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvokeWS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}
