# ─── DynamoDB tables ─────────────────────────────────────────────────
# Eight tables backing the application. Schemas mirror what
# localstack/init-aws.sh provisions for dev — keeping them in lockstep
# means dev and prod don't drift. See wiki/Architecture/DynamoDB Tables.md
# for the schema documentation.
#
# Billing mode: PAY_PER_REQUEST on every table. At MVP scale (low write
# throughput, bursty reads) it's both cheaper and simpler than
# provisioned capacity. Migrate specific hot tables to provisioned only
# if RCU/WCU consumption shows up as a real cost line.

# ── Users ────────────────────────────────────────────────────────────
# Holds real user records AND synthetic EMAIL#<email> lock items that
# enforce email uniqueness via TransactWrite. The `email-index` GSI is
# what `getUserByEmail` queries; lock items share the GSI and are filtered
# client-side.
resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-Users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ── Lines ────────────────────────────────────────────────────────────
# Production lines belong to a factory. No GSIs — small table, scanned in full.
resource "aws_dynamodb_table" "lines" {
  name         = "${local.name_prefix}-Lines"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ── Templates ────────────────────────────────────────────────────────
# `lineId-index` lets the operator-side checklist creation find the
# active template for a given line in one query.
resource "aws_dynamodb_table" "templates" {
  name         = "${local.name_prefix}-Templates"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "lineId"
    type = "S"
  }

  global_secondary_index {
    name            = "lineId-index"
    hash_key        = "lineId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ── Checklists ───────────────────────────────────────────────────────
# Hottest table in the app. Three GSIs cover the dashboard's filter
# combinations — see wiki/Subsystems/DynamoDB Access Patterns.md.
resource "aws_dynamodb_table" "checklists" {
  name         = "${local.name_prefix}-Checklists"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "operatorId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "lineId"
    type = "S"
  }
  attribute {
    name = "lineId-status"
    type = "S"
  }

  global_secondary_index {
    name            = "operatorId-index"
    hash_key        = "operatorId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "lineId-status-index"
    hash_key        = "lineId-status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "lineId-index"
    hash_key        = "lineId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  # DynamoDB Stream is consumed by the cross-instance fan-out Lambda
  # planned for the WebSocket production path (see B4 in the bulletproofing
  # plan). Enabled here so the stream ARN exists from day one even if
  # the consumer Lambda comes later.
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}

# ── Connections ──────────────────────────────────────────────────────
# WebSocket connection registry. `checklistId-index` and
# `channel-index` cover the broadcast-path lookups. TTL on `ttl`
# evicts stale records 30 minutes after disconnect as a backstop to the
# server-side ping/pong reaper.
resource "aws_dynamodb_table" "connections" {
  name         = "${local.name_prefix}-Connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }
  attribute {
    name = "checklistId"
    type = "S"
  }
  attribute {
    name = "channel"
    type = "S"
  }

  global_secondary_index {
    name            = "checklistId-index"
    hash_key        = "checklistId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "channel-index"
    hash_key        = "channel"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

# ── Audit Log ────────────────────────────────────────────────────────
# Append-only event log. Two GSIs: one keyed by user (for "what did
# this user do?"), one keyed by action type (for "show me all
# approve events").
resource "aws_dynamodb_table" "audit_log" {
  name         = "${local.name_prefix}-AuditLog"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "action"
    type = "S"
  }
  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "timestamp-index"
    hash_key        = "action"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ── Factories ────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "factories" {
  name         = "${local.name_prefix}-Factories"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ── Rate Limits ──────────────────────────────────────────────────────
# Counters for express-rate-limit's DynamoDB store. TTL on `ttl`
# auto-evicts expired counters so the table stays small even at high
# request rates. No GSIs — only ever queried by primary key.
resource "aws_dynamodb_table" "rate_limits" {
  name         = "${local.name_prefix}-RateLimits"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
