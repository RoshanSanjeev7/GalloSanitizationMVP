# LocalStack AWS Migration Design

## Summary

Migrate the Bottling Sanitation Hub backend from file-based storage (`data.json`) to AWS services emulated locally via LocalStack:

- **DynamoDB** — replaces `data.json` for all 4 entities (Users, Lines, Templates, Checklists)
- **Lambda + API Gateway** — hosts the Express backend via `serverless-http`
- **S3** — stores photos uploaded per checklist item

LocalStack runs in Docker (exception to the no-Docker guideline — it's a dev tool, not the app itself).

## Architecture

```
Browser (React on :3000)
  |
  v
Vite dev proxy (/api -> localhost:4566)
  |
  v
LocalStack API Gateway
  |
  v
Lambda (Express app via serverless-http)
  |
  +--> DynamoDB (Users, Lines, Templates, Checklists tables)
  +--> S3 (checklist-images bucket)
```

For local dev, the backend can also run directly via `tsx watch` against LocalStack's DynamoDB and S3 endpoints (without Lambda), keeping the fast feedback loop. Lambda packaging is for deployment parity testing.

## DynamoDB Table Design

### Users Table
- **Table name**: `SanitizationUsers`
- **Partition key**: `id` (S)
- **GSI `email-index`**: partition key `email` (S) — for login lookup

### Lines Table
- **Table name**: `SanitizationLines`
- **Partition key**: `id` (S)

### Templates Table
- **Table name**: `SanitizationTemplates`
- **Partition key**: `id` (S)
- **GSI `lineId-index`**: partition key `lineId` (S) — for line-based template lookup

### Checklists Table
- **Table name**: `SanitizationChecklists`
- **Partition key**: `id` (S)
- **GSI `operatorId-index`**: partition key `operatorId` (S), sort key `startTime` (S)
- **GSI `status-index`**: partition key `status` (S), sort key `startTime` (S)
- **GSI `lineId-status-index`**: partition key `lineId` (S), sort key `status` (S)

## S3 Bucket

- **Bucket name**: `checklist-images`
- **Object key format**: `{checklistId}/{machineIdx}-{catIdx}-{itemIdx}/{timestamp}-{filename}`
- Presigned URLs for upload and retrieval (no public access)

## Type Changes

`ChecklistItem` gains an `images` field:

```typescript
export interface ChecklistItem {
  description: string;
  machine: string | null;
  completed: boolean | null;
  completedBy: string | null;
  completedAt: string | null;
  issue: string | null;
  images: string[];  // S3 object keys
}
```

## Backend Changes

### New files
- `src/data/dynamo.ts` — DynamoDB client and table operations (replaces `store.ts`)
- `src/data/s3.ts` — S3 client, upload, presigned URL generation
- `src/lambda.ts` — Lambda handler entry point wrapping Express with `serverless-http`
- `src/data/seed-dynamo.ts` — seeds DynamoDB tables with demo data (replaces `seed.ts`)

### Modified files
- `src/config/env.ts` — add `LOCALSTACK_ENDPOINT`, `AWS_REGION`, `S3_BUCKET`, table name env vars
- `src/routes/checklists.ts` — add image upload/retrieval endpoints, update item operations to handle images
- `src/types/index.ts` — add `images: string[]` to `ChecklistItem`
- `src/index.ts` — initialize DynamoDB client instead of loading `data.json`
- `src/middleware/auth.ts` — no changes (JWT stays the same)

### New API endpoints
- `POST /api/checklists/:id/images` — upload image(s) for a checklist item. Accepts multipart form data with `machineIdx`, `catIdx`, `itemIdx` fields and `images` file(s). Returns updated S3 keys.
- `GET /api/checklists/:id/images/:key(*)` — returns a presigned S3 URL for the image

### Data access pattern
Each route handler calls `dynamo.ts` functions directly (e.g., `getUser(id)`, `queryChecklistsByOperator(operatorId)`) rather than loading the entire store into memory. This is a shift from the current "load all, filter in JS" approach to per-query DynamoDB operations.

## Frontend Changes

### Modified files
- `src/services/api.ts` — add `uploadImages()` and `getImageUrl()` functions
- `src/pages/ChecklistFill.tsx` — add "Add Photo" button per checklist item below the comment area, with thumbnail previews of uploaded images and ability to remove them
- `src/pages/ChecklistDetail.tsx` — display uploaded images (read-only thumbnails, click to expand)
- `src/pages/SubmissionReview.tsx` — display uploaded images in review view

### Photo upload UX
- Each checklist item shows an "Add Photo" button (camera icon) below the comment field
- Clicking opens the device file picker (accept images only)
- Multiple files can be selected at once
- Thumbnails appear below the button after upload
- Each thumbnail has an X to remove (deletes from S3)
- Upload happens immediately on file selection (not deferred to form submit)

## LocalStack Setup

### docker-compose.yml (project root)
- Single `localstack` service using `localstack/localstack:latest`
- Ports: `4566:4566` (gateway)
- Environment: `SERVICES=dynamodb,s3,lambda,apigateway`, `DEFAULT_REGION=us-west-2`
- Volume mount: `./localstack/init-aws.sh:/etc/localstack/init/ready.d/init-aws.sh`

### localstack/init-aws.sh
Runs on container startup:
1. Creates all 4 DynamoDB tables with GSIs
2. Creates the `checklist-images` S3 bucket
3. (Optional) Deploys the Lambda function and wires API Gateway

### New package.json scripts
- `localstack:up` — starts LocalStack via docker compose
- `localstack:down` — stops LocalStack
- `localstack:seed` — seeds DynamoDB tables with demo data
- `dev:local` — starts LocalStack, seeds data, then runs frontend + backend in dev mode

### Environment variables (.env)
```
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=checklist-images
DYNAMODB_TABLE_USERS=SanitizationUsers
DYNAMODB_TABLE_LINES=SanitizationLines
DYNAMODB_TABLE_TEMPLATES=SanitizationTemplates
DYNAMODB_TABLE_CHECKLISTS=SanitizationChecklists
```

## Dependencies to Add

### Backend
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `serverless-http`
- `multer` + `@types/multer` (multipart file upload handling)

### Root / Dev
- No new deps (Docker Compose is a system tool)

## Testing

- Unit tests for `dynamo.ts` operations using LocalStack endpoint
- Unit tests for `s3.ts` upload/presign
- Update existing E2E tests to work with DynamoDB-backed backend
- Add E2E test for photo upload flow in `checklist-fill.spec.ts`

## Migration Path

1. Set up LocalStack + Docker Compose
2. Implement `dynamo.ts` with all CRUD operations
3. Implement `s3.ts` with upload/presign
4. Swap route handlers from `store.ts` to `dynamo.ts`
5. Add image upload endpoints and frontend UI
6. Update seed script for DynamoDB
7. Add `lambda.ts` entry point
8. Update tests
