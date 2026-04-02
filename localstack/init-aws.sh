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

echo "Creating S3 bucket..."
awslocal s3 mb s3://checklist-images

echo "LocalStack init complete."
