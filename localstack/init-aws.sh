#!/bin/bash
ENDPOINT="http://localhost:4566"
REGION="us-west-2"
export AWS_DEFAULT_REGION="$REGION"

echo "Creating DynamoDB tables..."

# Users table
awslocal dynamodb create-table \
  --table-name SanitizationUsers \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "email-index",
      "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'

# Lines table
awslocal dynamodb create-table \
  --table-name SanitizationLines \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Templates table
awslocal dynamodb create-table \
  --table-name SanitizationTemplates \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=lineId,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "lineId-index",
      "KeySchema": [{"AttributeName": "lineId", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'

awslocal dynamodb update-time-to-live \
  --table-name SanitizationTemplates \
  --time-to-live-specification Enabled=true,AttributeName=deleteTtl

# Checklists table
awslocal dynamodb create-table \
  --table-name SanitizationChecklists \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=operatorId,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=startTime,AttributeType=S \
    AttributeName=lineId,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "operatorId-index",
      "KeySchema": [
        {"AttributeName": "operatorId", "KeyType": "HASH"},
        {"AttributeName": "startTime", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "status-index",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "startTime", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "lineId-status-index",
      "KeySchema": [
        {"AttributeName": "lineId", "KeyType": "HASH"},
        {"AttributeName": "status", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'

# WebSocket connections table
awslocal dynamodb create-table \
  --table-name SanitizationConnections \
  --attribute-definitions \
    AttributeName=connectionId,AttributeType=S \
    AttributeName=checklistId,AttributeType=S \
    AttributeName=channel,AttributeType=S \
  --key-schema AttributeName=connectionId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "checklistId-index",
      "KeySchema": [{"AttributeName": "checklistId", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "channel-index",
      "KeySchema": [{"AttributeName": "channel", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'

awslocal dynamodb update-time-to-live \
  --table-name SanitizationConnections \
  --time-to-live-specification Enabled=true,AttributeName=ttl

# Audit log table
awslocal dynamodb create-table \
  --table-name SanitizationAuditLog \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=action,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "timestamp-index",
      "KeySchema": [
        {"AttributeName": "action", "KeyType": "HASH"},
        {"AttributeName": "timestamp", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "userId-index",
      "KeySchema": [
        {"AttributeName": "userId", "KeyType": "HASH"},
        {"AttributeName": "timestamp", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]'

# Factories table
awslocal dynamodb create-table \
  --table-name SanitizationFactories \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Rate limit counters. Each row is one key (e.g. "ip:1.2.3.4" or
# "user:u123:login") in one window. The `ttl` attribute lets DynamoDB
# auto-evict expired counters so the table stays small even at scale.
awslocal dynamodb create-table \
  --table-name SanitizationRateLimits \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

awslocal dynamodb update-time-to-live \
  --table-name SanitizationRateLimits \
  --time-to-live-specification "Enabled=true, AttributeName=ttl" 2>/dev/null || true

echo "Creating S3 bucket..."
awslocal s3 mb s3://checklist-images

echo "Creating SQS queue..."
awslocal sqs create-queue --queue-name pdf-generation-queue

echo "LocalStack init complete."
