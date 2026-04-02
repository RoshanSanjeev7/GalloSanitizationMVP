# LocalStack AWS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace file-based storage with DynamoDB, add S3 image uploads per checklist item, wrap Express in serverless-http for Lambda, all emulated locally via LocalStack in Docker.

**Architecture:** Single Lambda (Express via serverless-http) behind API Gateway, DynamoDB for all 4 entities, S3 for checklist item photos. LocalStack Docker container emulates all services. For local dev, backend runs directly via tsx against LocalStack endpoints (no Lambda needed for fast iteration).

**Tech Stack:** AWS SDK v3 (DynamoDB, S3), serverless-http, multer, Docker Compose, LocalStack

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `docker-compose.yml` | LocalStack container definition |
| `localstack/init-aws.sh` | Creates DynamoDB tables, S3 bucket on container startup |
| `packages/backend/src/data/dynamo.ts` | DynamoDB client + all CRUD operations for 4 tables |
| `packages/backend/src/data/s3.ts` | S3 client, upload buffer, presigned URL generation |
| `packages/backend/src/data/seed-dynamo.ts` | Seeds DynamoDB with demo data |
| `packages/backend/src/data/dynamo.test.ts` | Unit tests for DynamoDB operations |
| `packages/backend/src/data/s3.test.ts` | Unit tests for S3 operations |
| `packages/backend/src/routes/images.ts` | Image upload/retrieval routes |
| `packages/backend/src/lambda.ts` | Lambda handler entry point |

### Modified files
| File | Changes |
|------|---------|
| `packages/backend/src/types/index.ts` | Add `images: string[]` to `ChecklistItem` |
| `packages/backend/src/config/env.ts` | Add LocalStack endpoint, AWS region, bucket, table names |
| `packages/backend/src/index.ts` | Replace `load()`/`seedIfEmpty()` with DynamoDB init, register image routes |
| `packages/backend/src/routes/auth.ts` | Replace `getStore()` with dynamo calls |
| `packages/backend/src/routes/users.ts` | Replace `getStore()`/`save()` with dynamo calls |
| `packages/backend/src/routes/lines.ts` | Replace `getStore()` with dynamo call |
| `packages/backend/src/routes/templates.ts` | Replace `getStore()`/`save()` with dynamo calls |
| `packages/backend/src/routes/checklists.ts` | Replace `getStore()`/`save()` with dynamo calls, add `images` to item creation |
| `packages/backend/src/middleware/auth.ts` | Remove `getStore` import (unused after migration) |
| `packages/backend/package.json` | Add AWS SDK deps, multer, serverless-http |
| `packages/frontend/src/services/api.ts` | Add `uploadImages()`, `getImageUrl()`, `images` field on `ChecklistItem` |
| `packages/frontend/src/pages/ChecklistFill.tsx` | Add photo upload button + thumbnails per item |
| `packages/frontend/src/pages/ChecklistFill.module.css` | Styles for photo upload area |
| `packages/frontend/src/pages/ChecklistDetail.tsx` | Display uploaded images read-only |
| `packages/frontend/src/pages/SubmissionReview.tsx` | Display uploaded images in review |
| `package.json` | Add localstack scripts |

---

### Task 1: Docker Compose + LocalStack Init Script

**Files:**
- Create: `docker-compose.yml`
- Create: `localstack/init-aws.sh`
- Modify: `package.json`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=dynamodb,s3,lambda,apigateway
      - DEFAULT_REGION=us-west-2
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - "./localstack:/etc/localstack/init/ready.d"
      - "localstack-data:/var/lib/localstack"

volumes:
  localstack-data:
```

- [ ] **Step 2: Create the init script**

```bash
#!/bin/bash
# localstack/init-aws.sh

ENDPOINT="http://localhost:4566"
REGION="us-west-2"

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
```

- [ ] **Step 3: Make init script executable**

Run: `chmod +x localstack/init-aws.sh`

- [ ] **Step 4: Add localstack scripts to root package.json**

Add to `"scripts"` in `package.json`:
```json
"localstack:up": "docker compose up -d",
"localstack:down": "docker compose down",
"localstack:seed": "npm run seed:dynamo --workspace=packages/backend",
"dev:local": "docker compose up -d && sleep 3 && npm run localstack:seed && npm run dev"
```

- [ ] **Step 5: Verify LocalStack starts and tables are created**

Run: `docker compose up -d && sleep 5 && aws --endpoint-url=http://localhost:4566 dynamodb list-tables --region us-west-2`

Expected: Output includes `SanitizationUsers`, `SanitizationLines`, `SanitizationTemplates`, `SanitizationChecklists`

Run: `aws --endpoint-url=http://localhost:4566 s3 ls --region us-west-2`

Expected: Output includes `checklist-images`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml localstack/init-aws.sh package.json
git commit -m "feat: add LocalStack Docker Compose and init script

Creates DynamoDB tables (Users, Lines, Templates, Checklists) with GSIs
and S3 bucket for checklist images on container startup."
```

---

### Task 2: Backend Config + Dependencies

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/src/config/env.ts`
- Modify: `packages/backend/src/types/index.ts`

- [ ] **Step 1: Install AWS SDK dependencies**

Run: `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3 @aws-sdk/s3-request-presigner serverless-http multer --workspace=packages/backend`

Run: `npm install @types/multer --save-dev --workspace=packages/backend`

- [ ] **Step 2: Update env.ts with AWS config**

Replace the entire contents of `packages/backend/src/config/env.ts`:

```typescript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    endpoint: process.env.LOCALSTACK_ENDPOINT || undefined,
    credentials: process.env.LOCALSTACK_ENDPOINT
      ? { accessKeyId: 'test', secretAccessKey: 'test' }
      : undefined,
  },
  s3Bucket: process.env.S3_BUCKET || 'checklist-images',
  tables: {
    users: process.env.DYNAMODB_TABLE_USERS || 'SanitizationUsers',
    lines: process.env.DYNAMODB_TABLE_LINES || 'SanitizationLines',
    templates: process.env.DYNAMODB_TABLE_TEMPLATES || 'SanitizationTemplates',
    checklists: process.env.DYNAMODB_TABLE_CHECKLISTS || 'SanitizationChecklists',
  },
};
```

- [ ] **Step 3: Create backend .env file**

Create `packages/backend/.env`:

```
PORT=4000
JWT_SECRET=dev-secret-change-in-production
FRONTEND_ORIGIN=http://localhost:3000
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-west-2
S3_BUCKET=checklist-images
DYNAMODB_TABLE_USERS=SanitizationUsers
DYNAMODB_TABLE_LINES=SanitizationLines
DYNAMODB_TABLE_TEMPLATES=SanitizationTemplates
DYNAMODB_TABLE_CHECKLISTS=SanitizationChecklists
```

- [ ] **Step 4: Add `images` field to ChecklistItem type**

In `packages/backend/src/types/index.ts`, update the `ChecklistItem` interface:

```typescript
export interface ChecklistItem {
  description: string;
  machine: string | null;
  completed: boolean | null;
  completedBy: string | null;
  completedAt: string | null;
  issue: string | null;
  images: string[];
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/package.json package-lock.json packages/backend/src/config/env.ts packages/backend/.env packages/backend/src/types/index.ts
git commit -m "feat: add AWS SDK deps and config for LocalStack

Adds DynamoDB, S3, serverless-http, multer dependencies.
Updates env.ts with table names, S3 bucket, and LocalStack endpoint.
Adds images field to ChecklistItem type."
```

---

### Task 3: DynamoDB Data Layer

**Files:**
- Create: `packages/backend/src/data/dynamo.ts`

- [ ] **Step 1: Write the DynamoDB client and all CRUD operations**

Create `packages/backend/src/data/dynamo.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config/env.js';
import type { User, Line, Template, Checklist } from '../types/index.js';

const client = new DynamoDBClient({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: config.aws.credentials,
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ─── Users ─────────────────────────────────────────────────────────

export async function getUser(id: string): Promise<User | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.users, Key: { id } })
  );
  return result.Item as User | undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.users,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  );
  return result.Items?.[0] as User | undefined;
}

export async function getAllUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.users })
  );
  return (result.Items || []) as User[];
}

export async function putUser(user: User): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.users, Item: user })
  );
}

export async function deleteUser(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.users, Key: { id } })
  );
}

// ─── Lines ─────────────────────────────────────────────────────────

export async function getAllLines(): Promise<Line[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.lines })
  );
  return (result.Items || []) as Line[];
}

export async function getLine(id: string): Promise<Line | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.lines, Key: { id } })
  );
  return result.Item as Line | undefined;
}

export async function putLine(line: Line): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.lines, Item: line })
  );
}

// ─── Templates ─────────────────────────────────────────────────────

export async function getAllTemplates(): Promise<Template[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.templates })
  );
  return (result.Items || []) as Template[];
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.templates, Key: { id } })
  );
  return result.Item as Template | undefined;
}

export async function getTemplatesByLineId(lineId: string): Promise<Template[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.templates,
      IndexName: 'lineId-index',
      KeyConditionExpression: 'lineId = :lineId',
      ExpressionAttributeValues: { ':lineId': lineId },
    })
  );
  return (result.Items || []) as Template[];
}

export async function putTemplate(template: Template): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.templates, Item: template })
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.templates, Key: { id } })
  );
}

// ─── Checklists ────────────────────────────────────────────────────

export async function getChecklist(id: string): Promise<Checklist | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.checklists, Key: { id } })
  );
  return result.Item as Checklist | undefined;
}

export async function getAllChecklists(): Promise<Checklist[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.checklists })
  );
  return (result.Items || []) as Checklist[];
}

export async function getChecklistsByOperator(operatorId: string): Promise<Checklist[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.checklists,
      IndexName: 'operatorId-index',
      KeyConditionExpression: 'operatorId = :operatorId',
      ExpressionAttributeValues: { ':operatorId': operatorId },
      ScanIndexForward: false,
    })
  );
  return (result.Items || []) as Checklist[];
}

export async function getChecklistsByStatus(status: string): Promise<Checklist[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.checklists,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
    })
  );
  return (result.Items || []) as Checklist[];
}

export async function putChecklist(checklist: Checklist): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.checklists, Item: checklist })
  );
}

export async function deleteChecklist(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.checklists, Key: { id } })
  );
}

export async function queryChecklists(filters: {
  status?: string;
  operatorId?: string;
  lineId?: string;
}): Promise<Checklist[]> {
  // Use the most selective GSI available, then filter in-memory for remaining criteria
  if (filters.operatorId) {
    let results = await getChecklistsByOperator(filters.operatorId);
    if (filters.status) results = results.filter(c => c.status === filters.status);
    if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
    return results;
  }
  if (filters.status) {
    let results = await getChecklistsByStatus(filters.status);
    if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
    return results;
  }
  // No selective filter — scan
  let results = await getAllChecklists();
  if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
  return results;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/data/dynamo.ts
git commit -m "feat: add DynamoDB data layer with all CRUD operations

Covers Users (with email GSI), Lines, Templates (with lineId GSI),
and Checklists (with operatorId, status, lineId-status GSIs).
Uses AWS SDK v3 DocumentClient."
```

---

### Task 4: DynamoDB Data Layer Tests

**Files:**
- Create: `packages/backend/src/data/dynamo.test.ts`

- [ ] **Step 1: Write tests for DynamoDB operations**

Create `packages/backend/src/data/dynamo.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getUser,
  getUserByEmail,
  getAllUsers,
  putUser,
  deleteUser as deleteUserDynamo,
  getAllLines,
  getLine,
  putLine,
  getAllTemplates,
  getTemplate,
  getTemplatesByLineId,
  putTemplate,
  deleteTemplate as deleteTemplateDynamo,
  getChecklist,
  getAllChecklists,
  putChecklist,
  deleteChecklist as deleteChecklistDynamo,
  queryChecklists,
} from './dynamo.js';
import type { User, Line, Template, Checklist } from '../types/index.js';

/*
  These tests require LocalStack running:
    docker compose up -d
  They hit real DynamoDB tables via the LocalStack endpoint.
*/

const testUser: User = {
  id: 'test-user-1',
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
  role: 'operator',
};

const testLine: Line = { id: 'test-line-1', name: 'Test Line' };

const testTemplate: Template = {
  id: 'test-template-1',
  title: 'Test Template',
  lineId: 'test-line-1',
  machines: [
    {
      name: 'Machine A',
      categories: [
        { name: 'Category 1', tasks: [{ description: 'Task 1', machine: null }] },
      ],
    },
  ],
};

const testChecklist: Checklist = {
  id: 'test-checklist-1',
  templateId: 'test-template-1',
  lineId: 'test-line-1',
  lineName: 'Test Line',
  operatorId: 'test-user-1',
  operatorName: 'Test User',
  status: 'in_progress',
  startTime: new Date().toISOString(),
  endTime: null,
  machines: [
    {
      name: 'Machine A',
      categories: [
        {
          name: 'Category 1',
          items: [
            {
              description: 'Task 1',
              machine: null,
              completed: null,
              completedBy: null,
              completedAt: null,
              issue: null,
              images: [],
            },
          ],
        },
      ],
    },
  ],
};

describe('DynamoDB operations (requires LocalStack)', () => {
  describe('Users', () => {
    it('puts and gets a user by id', async () => {
      await putUser(testUser);
      const user = await getUser('test-user-1');
      expect(user).toBeDefined();
      expect(user!.name).toBe('Test User');
      expect(user!.email).toBe('test@example.com');
    });

    it('gets a user by email via GSI', async () => {
      const user = await getUserByEmail('test@example.com');
      expect(user).toBeDefined();
      expect(user!.id).toBe('test-user-1');
    });

    it('lists all users', async () => {
      const users = await getAllUsers();
      expect(users.length).toBeGreaterThanOrEqual(1);
    });

    it('deletes a user', async () => {
      await deleteUserDynamo('test-user-1');
      const user = await getUser('test-user-1');
      expect(user).toBeUndefined();
    });
  });

  describe('Lines', () => {
    it('puts and gets a line', async () => {
      await putLine(testLine);
      const line = await getLine('test-line-1');
      expect(line).toBeDefined();
      expect(line!.name).toBe('Test Line');
    });

    it('lists all lines', async () => {
      const lines = await getAllLines();
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Templates', () => {
    it('puts and gets a template', async () => {
      await putTemplate(testTemplate);
      const template = await getTemplate('test-template-1');
      expect(template).toBeDefined();
      expect(template!.title).toBe('Test Template');
    });

    it('queries templates by lineId', async () => {
      const templates = await getTemplatesByLineId('test-line-1');
      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect(templates[0].lineId).toBe('test-line-1');
    });

    it('deletes a template', async () => {
      await deleteTemplateDynamo('test-template-1');
      const template = await getTemplate('test-template-1');
      expect(template).toBeUndefined();
    });
  });

  describe('Checklists', () => {
    it('puts and gets a checklist', async () => {
      await putChecklist(testChecklist);
      const cl = await getChecklist('test-checklist-1');
      expect(cl).toBeDefined();
      expect(cl!.operatorName).toBe('Test User');
      expect(cl!.machines[0].categories[0].items[0].images).toEqual([]);
    });

    it('queries checklists with filters', async () => {
      const byOperator = await queryChecklists({ operatorId: 'test-user-1' });
      expect(byOperator.length).toBeGreaterThanOrEqual(1);

      const byStatus = await queryChecklists({ status: 'in_progress' });
      expect(byStatus.length).toBeGreaterThanOrEqual(1);
    });

    it('deletes a checklist', async () => {
      await deleteChecklistDynamo('test-checklist-1');
      const cl = await getChecklist('test-checklist-1');
      expect(cl).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests (requires LocalStack running)**

Run: `cd packages/backend && npx vitest run src/data/dynamo.test.ts`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/data/dynamo.test.ts
git commit -m "test: add DynamoDB data layer integration tests

Tests all CRUD operations and GSI queries against LocalStack."
```

---

### Task 5: S3 Image Service

**Files:**
- Create: `packages/backend/src/data/s3.ts`

- [ ] **Step 1: Write the S3 service**

Create `packages/backend/src/data/s3.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

const s3 = new S3Client({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: config.aws.credentials,
  forcePathStyle: true, // Required for LocalStack
});

export async function uploadImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getImageUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function deleteImage(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/data/s3.ts
git commit -m "feat: add S3 image service for upload, presign, and delete"
```

---

### Task 6: S3 Service Tests

**Files:**
- Create: `packages/backend/src/data/s3.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/backend/src/data/s3.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { uploadImage, getImageUrl, deleteImage } from './s3.js';

describe('S3 operations (requires LocalStack)', () => {
  const testKey = 'test-checklist/0-0-0/test-image.png';
  const testBuffer = Buffer.from('fake-png-data');

  it('uploads an image and returns the key', async () => {
    const key = await uploadImage(testKey, testBuffer, 'image/png');
    expect(key).toBe(testKey);
  });

  it('generates a presigned URL for the image', async () => {
    const url = await getImageUrl(testKey);
    expect(url).toContain('checklist-images');
    expect(url).toContain('test-image.png');
  });

  it('deletes an image', async () => {
    await deleteImage(testKey);
    // Getting a presigned URL still works (it's just a URL), but the object is gone
    // This is expected S3 behavior — presigning doesn't check existence
    const url = await getImageUrl(testKey);
    expect(url).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/backend && npx vitest run src/data/s3.test.ts`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/data/s3.test.ts
git commit -m "test: add S3 image service integration tests"
```

---

### Task 7: Image Upload Route

**Files:**
- Create: `packages/backend/src/routes/images.ts`

- [ ] **Step 1: Write the image routes**

Create `packages/backend/src/routes/images.ts`:

```typescript
import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { uploadImage, getImageUrl, deleteImage } from '../data/s3.js';
import { getChecklist, putChecklist } from '../data/dynamo.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// Upload images for a checklist item
router.post(
  '/:id/images',
  upload.array('images', 10),
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const machineIdx = parseInt(req.body.machineIdx, 10);
    const catIdx = parseInt(req.body.catIdx, 10);
    const itemIdx = parseInt(req.body.itemIdx, 10);

    const checklist = await getChecklist(id);
    if (!checklist) {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }

    const machine = checklist.machines[machineIdx];
    if (!machine) {
      res.status(400).json({ error: 'Invalid machine index' });
      return;
    }

    const category = machine.categories[catIdx];
    if (!category) {
      res.status(400).json({ error: 'Invalid category index' });
      return;
    }

    const item = category.items[itemIdx];
    if (!item) {
      res.status(400).json({ error: 'Invalid item index' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const newKeys: string[] = [];
    for (const file of files) {
      const timestamp = Date.now();
      const key = `${id}/${machineIdx}-${catIdx}-${itemIdx}/${timestamp}-${file.originalname}`;
      await uploadImage(key, file.buffer, file.mimetype);
      newKeys.push(key);
    }

    if (!item.images) item.images = [];
    item.images.push(...newKeys);
    await putChecklist(checklist);

    res.json({ images: item.images });
  }
);

// Get a presigned URL for an image
router.get('/:id/images/*', async (req: AuthRequest, res) => {
  // The key is everything after /images/
  const key = req.params[0];
  if (!key) {
    res.status(400).json({ error: 'Image key required' });
    return;
  }

  const url = await getImageUrl(key);
  res.json({ url });
});

// Delete an image from a checklist item
router.delete('/:id/images', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { key, machineIdx, catIdx, itemIdx } = req.body;

  const checklist = await getChecklist(id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const item = checklist.machines[machineIdx]?.categories[catIdx]?.items[itemIdx];
  if (!item) {
    res.status(400).json({ error: 'Invalid item index' });
    return;
  }

  await deleteImage(key);
  item.images = (item.images || []).filter((k: string) => k !== key);
  await putChecklist(checklist);

  res.json({ images: item.images });
});

export default router;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/images.ts
git commit -m "feat: add image upload/retrieval/delete routes

POST /:id/images — upload multiple images for a checklist item
GET /:id/images/* — get presigned URL for an image
DELETE /:id/images — remove an image from a checklist item"
```

---

### Task 8: Migrate Route Handlers to DynamoDB

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/src/routes/users.ts`
- Modify: `packages/backend/src/routes/lines.ts`
- Modify: `packages/backend/src/routes/templates.ts`
- Modify: `packages/backend/src/routes/checklists.ts`
- Modify: `packages/backend/src/middleware/auth.ts`

- [ ] **Step 1: Migrate auth.ts**

Replace `packages/backend/src/routes/auth.ts`:

```typescript
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { getUserByEmail, getUser } from '../data/dynamo.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await getUserByEmail(email);

  if (!user || user.password !== password) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  const { password: _, ...userPublic } = user;
  res.json({ user: userPublic, token });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await getUser(req.userId!);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

export default router;
```

- [ ] **Step 2: Migrate users.ts**

Replace `packages/backend/src/routes/users.ts`:

```typescript
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllUsers,
  getUserByEmail,
  putUser,
  getUser,
  deleteUser as deleteUserDynamo,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const users = await getAllUsers();
  const usersPublic = users.map(({ password, ...rest }) => rest);
  res.json(usersPublic);
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'name, email, password, and role are required' });
    return;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const user = { id: uuid(), name, email, password, role };
  await putUser(user);

  const { password: _, ...userPublic } = user;
  res.status(201).json(userPublic);
});

router.put('/:id', adminOnly, async (req: AuthRequest, res) => {
  const { role } = req.body;
  const user = await getUser(req.params.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (role) user.role = role;
  await putUser(user);

  const { password: _, ...userPublic } = user;
  res.json(userPublic);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const user = await getUser(req.params.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await deleteUserDynamo(req.params.id);
  res.status(204).send();
});

export default router;
```

- [ ] **Step 3: Migrate lines.ts**

Replace `packages/backend/src/routes/lines.ts`:

```typescript
import { Router } from 'express';
import { getAllLines } from '../data/dynamo.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const lines = await getAllLines();
  res.json(lines);
});

export default router;
```

- [ ] **Step 4: Migrate templates.ts**

Replace `packages/backend/src/routes/templates.ts`:

```typescript
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getAllTemplates,
  getTemplate,
  putTemplate,
  deleteTemplate as deleteTemplateDynamo,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const templates = await getAllTemplates();
  res.json(templates);
});

router.get('/:id', async (req, res) => {
  const template = await getTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { title, lineId, machines } = req.body;

  if (!title || !lineId || !machines) {
    res.status(400).json({ error: 'title, lineId, and machines are required' });
    return;
  }

  const template = { id: uuid(), title, lineId, machines };
  await putTemplate(template);

  res.status(201).json(template);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const template = await getTemplate(req.params.id);

  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  await deleteTemplateDynamo(req.params.id);
  res.status(204).send();
});

export default router;
```

- [ ] **Step 5: Migrate checklists.ts**

Replace `packages/backend/src/routes/checklists.ts`:

```typescript
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import {
  getChecklist,
  putChecklist,
  deleteChecklist as deleteChecklistDynamo,
  queryChecklists,
  getLine,
  getUser,
  getTemplatesByLineId,
  getAllTemplates,
} from '../data/dynamo.js';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { status, operatorId, lineId } = req.query as Record<string, string>;
  let checklists = await queryChecklists({
    status: status || undefined,
    operatorId: operatorId || undefined,
    lineId: lineId || undefined,
  });

  // Sort newest first
  checklists.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  res.json(checklists);
});

router.get('/:id', async (req, res) => {
  const checklist = await getChecklist(req.params.id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }
  res.json(checklist);
});

router.post('/', async (req: AuthRequest, res) => {
  const { lineId } = req.body;

  const line = await getLine(lineId);
  if (!line) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }

  const user = await getUser(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Find a template for this line, or use the first template
  let templates = await getTemplatesByLineId(lineId);
  if (templates.length === 0) {
    templates = await getAllTemplates();
  }
  const template = templates[0];
  if (!template) {
    res.status(400).json({ error: 'No template available for this line' });
    return;
  }

  const checklist = {
    id: uuid(),
    templateId: template.id,
    lineId: line.id,
    lineName: line.name,
    operatorId: user.id,
    operatorName: user.name,
    status: 'in_progress' as const,
    startTime: new Date().toISOString(),
    endTime: null,
    machines: template.machines.map(m => ({
      name: m.name,
      categories: m.categories.map(c => ({
        name: c.name,
        items: c.tasks.map(t => ({
          description: t.description,
          machine: t.machine,
          completed: null,
          completedBy: null,
          completedAt: null,
          issue: null,
          images: [],
        })),
      })),
    })),
  };

  await putChecklist(checklist);
  res.status(201).json(checklist);
});

router.put('/:id/items', async (req: AuthRequest, res) => {
  const { machines } = req.body;
  const checklist = await getChecklist(req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const user = await getUser(req.userId!);
  const isAdmin = user?.role === 'admin';

  // Operators can only edit in_progress, admins can also edit submitted
  if (checklist.status !== 'in_progress' && !(isAdmin && checklist.status === 'submitted')) {
    res.status(400).json({ error: 'Cannot update items on this checklist' });
    return;
  }

  if (Array.isArray(machines)) {
    checklist.machines = machines;
  }

  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'submitted';
  checklist.endTime = new Date().toISOString();
  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/approve', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'approved';
  await putChecklist(checklist);
  res.json(checklist);
});

router.post('/:id/deny', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  checklist.status = 'denied';
  await putChecklist(checklist);
  res.json(checklist);
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const checklist = await getChecklist(req.params.id);

  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  await deleteChecklistDynamo(req.params.id);
  res.status(204).send();
});

export default router;
```

- [ ] **Step 6: Remove getStore import from auth middleware**

Replace `packages/backend/src/middleware/auth.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
```

- [ ] **Step 7: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/routes/ packages/backend/src/middleware/auth.ts
git commit -m "feat: migrate all route handlers from data.json to DynamoDB

All routes now use async dynamo.ts functions instead of
synchronous getStore()/save() calls."
```

---

### Task 9: DynamoDB Seed Script + Update index.ts

**Files:**
- Create: `packages/backend/src/data/seed-dynamo.ts`
- Modify: `packages/backend/src/index.ts`
- Modify: `packages/backend/package.json`

- [ ] **Step 1: Create the DynamoDB seed script**

Create `packages/backend/src/data/seed-dynamo.ts`. This reuses the same demo data structure as the existing `seed.ts` but writes to DynamoDB:

```typescript
import { v4 as uuid } from 'uuid';
import type { User, Line, Template, MachineTemplate } from '../types/index.js';
import { getAllUsers, putUser, putLine, putTemplate, getAllLines } from './dynamo.js';

// Reuse the same machine definitions from seed.ts
// (import the full machine list — this is the same data, just targeting DynamoDB)

const machines: MachineTemplate[] = [
  {
    name: 'FILLER',
    categories: [
      {
        name: 'Prep',
        tasks: [
          { description: 'Remove cap sorter lid and blow out debris underneath sorter detail & sanitize.', machine: null },
          { description: 'Sweep debris, caps & corks from 2nd level of filler room (top of filler room)', machine: null },
          { description: 'Blow out, clean & sanitize cap and cork hoppers (loading hoppers)', machine: null },
        ],
      },
      {
        name: 'Clean',
        tasks: [
          { description: 'Remove all filler/rinser bottling handling parts and filler guard doors.', machine: null },
          { description: 'Remove sealing rubbers and place in a clean 5 gallon bucket.', machine: null },
          { description: 'Foam on top of filler and underneath filler completely & from rinser in feed to filler discharge.', machine: null },
          { description: 'Foam conveyors & floor, bottling handling parts and sealing rubbers inside 5 gallon bucket.', machine: null },
          { description: 'Scrub the Filler Valves/Block.', machine: null },
          { description: 'Pressure wash filler pedestals, filler base, filler carousel wall, bottling handling parts.', machine: null },
          { description: 'Disconnect butt tub, remove pan, clean debris, foam and rinse.', machine: null },
          { description: 'Blow out debris and corks from cork sorter and sanitize.', machine: null },
          { description: 'Scrub brass plate of corker (simple green/scratch pads) & remove excess grease from plungers', machine: null },
          { description: 'Clean lower part of corker removing glass, corks and scrub pedestals.', machine: null },
          { description: 'Blow down capper flat surface, cap chute and sanitize chute.', machine: null },
          { description: 'Clean lower part of capper removing glass, grease, caps and scrub pedestals', machine: null },
          { description: 'Sweep floor & clean drains.', machine: null },
          { description: 'Install bottle handling parts, sealing rubbers, grippers and CIP cups.', machine: null },
          { description: 'SSP & call L5/TL for ATP filler swab and cleanliness verification.', machine: null },
        ],
      },
      {
        name: 'Outside',
        tasks: [
          { description: 'Foam, scrub and pressure wash conveyors and rails from filler discharge to dynac A.', machine: null },
          { description: 'Clean hoods, plastics covers from 90 turn to filler infeed', machine: null },
          { description: 'Sweep debris, glass, caps, corks from 90 turn to dynac A & mop.', machine: null },
          { description: 'Clean CarboQC unit and table & filler carts.', machine: null },
        ],
      },
    ],
  },
  {
    name: 'FW SKID',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Check FW skid for leaks', machine: null },
          { description: 'Clean and sanitize FW skid area', machine: null },
        ],
      },
    ],
  },
  {
    name: 'FOILER',
    categories: [
      {
        name: 'Tasks',
        tasks: [
          { description: 'Clean foiler heads and remove debris', machine: null },
          { description: 'Sanitize foiler contact surfaces', machine: null },
        ],
      },
    ],
  },
];

export async function seedIfEmpty(): Promise<void> {
  const existingUsers = await getAllUsers();
  if (existingUsers.length > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding DynamoDB with demo data...');

  // Users
  const admin: User = {
    id: uuid(),
    name: 'Admin User',
    email: 'admin@gallo.com',
    password: 'admin123',
    role: 'admin',
  };
  const op1: User = {
    id: uuid(),
    name: 'John Operator',
    email: 'john@gallo.com',
    password: 'operator123',
    role: 'operator',
  };
  const op2: User = {
    id: uuid(),
    name: 'Jane Operator',
    email: 'jane@gallo.com',
    password: 'operator123',
    role: 'operator',
  };

  await Promise.all([putUser(admin), putUser(op1), putUser(op2)]);

  // Lines
  const line91 = { id: uuid(), name: 'Line 91' };
  const line92 = { id: uuid(), name: 'Line 92' };

  await Promise.all([putLine(line91), putLine(line92)]);

  // Templates
  const template91: Template = {
    id: uuid(),
    title: 'Deep Clean',
    lineId: line91.id,
    machines,
  };
  const template92: Template = {
    id: uuid(),
    title: 'Deep Clean',
    lineId: line92.id,
    machines,
  };

  await Promise.all([putTemplate(template91), putTemplate(template92)]);

  console.log('DynamoDB seeding complete.');
  console.log('  Admin: admin@gallo.com / admin123');
  console.log('  Operator 1: john@gallo.com / operator123');
  console.log('  Operator 2: jane@gallo.com / operator123');
}
```

Note: The seed script above uses a shortened machine list for readability. The implementing engineer should copy the full machine list from the existing `packages/backend/src/data/seed.ts` (all 10 machines with all tasks) into this file's `machines` array.

- [ ] **Step 2: Update index.ts to use DynamoDB**

Replace `packages/backend/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { seedIfEmpty } from './data/seed-dynamo.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import imageRoutes from './routes/images.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/checklists', imageRoutes);

// Seed on startup, then listen
seedIfEmpty().then(() => {
  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
});

export { app };
```

- [ ] **Step 3: Add seed:dynamo script to backend package.json**

Add to `packages/backend/package.json` scripts:

```json
"seed:dynamo": "tsx src/data/seed-dynamo.ts"
```

Note: The seed script needs a standalone entry point too. Add this block at the bottom of `seed-dynamo.ts`:

```typescript
// Allow running as standalone script
const isMain = process.argv[1]?.endsWith('seed-dynamo.ts') || process.argv[1]?.endsWith('seed-dynamo.js');
if (isMain) {
  seedIfEmpty().then(() => process.exit(0)).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 5: Test with LocalStack running**

Run: `docker compose up -d && sleep 5 && cd packages/backend && npx tsx src/data/seed-dynamo.ts`

Expected: Output shows "Seeding DynamoDB with demo data..." and credential info

Run: `aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name SanitizationUsers --region us-west-2 --query 'Count'`

Expected: `3`

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/data/seed-dynamo.ts packages/backend/src/index.ts packages/backend/package.json
git commit -m "feat: add DynamoDB seed script and update server entry point

Replaces data.json load/seed with DynamoDB seeding.
Registers image upload routes on /api/checklists."
```

---

### Task 10: Lambda Entry Point

**Files:**
- Create: `packages/backend/src/lambda.ts`

- [ ] **Step 1: Create the Lambda handler**

Create `packages/backend/src/lambda.ts`:

```typescript
import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import imageRoutes from './routes/images.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/checklists', imageRoutes);

export const handler = serverless(app);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/backend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lambda.ts
git commit -m "feat: add Lambda entry point wrapping Express with serverless-http"
```

---

### Task 11: Frontend API + Type Updates

**Files:**
- Modify: `packages/frontend/src/services/api.ts`

- [ ] **Step 1: Add images field to ChecklistItem and add upload/retrieval functions**

In `packages/frontend/src/services/api.ts`, update the `ChecklistItem` interface:

```typescript
export interface ChecklistItem {
  description: string;
  machine: string | null;
  completed: boolean | null;
  completedBy: string | null;
  completedAt: string | null;
  issue: string | null;
  images: string[];
}
```

Add these functions before the `const api = {` line:

```typescript
// ─── Images ────────────────────────────────────────────────────────
async function uploadImages(
  checklistId: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
  files: File[],
): Promise<{ images: string[] }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('machineIdx', String(machineIdx));
  formData.append('catIdx', String(catIdx));
  formData.append('itemIdx', String(itemIdx));
  files.forEach((file) => formData.append('images', file));

  const res = await fetch(`${API_BASE}/checklists/${checklistId}/images`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Upload failed');
  }

  return res.json();
}

async function getImageUrl(checklistId: string, key: string): Promise<string> {
  const data = await request<{ url: string }>(`/checklists/${checklistId}/images/${key}`);
  return data.url;
}

async function deleteImage(
  checklistId: string,
  key: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
): Promise<{ images: string[] }> {
  return request<{ images: string[] }>(`/checklists/${checklistId}/images`, {
    method: 'DELETE',
    body: JSON.stringify({ key, machineIdx, catIdx, itemIdx }),
  });
}
```

Add them to the exported api object:

```typescript
const api = {
  login,
  logout,
  getMe,
  getStoredUser,
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
  getLines,
  getTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  getChecklists,
  getChecklist,
  createChecklist,
  updateChecklistItems,
  submitChecklist,
  approveChecklist,
  denyChecklist,
  deleteChecklist,
  uploadImages,
  getImageUrl,
  deleteImage,
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/services/api.ts
git commit -m "feat: add image upload/retrieval/delete API functions

Adds uploadImages, getImageUrl, deleteImage to frontend API client.
Updates ChecklistItem type with images field."
```

---

### Task 12: Photo Upload UI in ChecklistFill

**Files:**
- Modify: `packages/frontend/src/pages/ChecklistFill.tsx`
- Modify: `packages/frontend/src/pages/ChecklistFill.module.css`

- [ ] **Step 1: Add photo upload styles**

Append to `packages/frontend/src/pages/ChecklistFill.module.css`:

```css
.photo-section {
  margin-top: 8px;
  margin-left: 26px;
}

.photo-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary);
  background: none;
  border: 1px dashed var(--border);
  border-radius: var(--radius-xs);
  cursor: pointer;
  padding: 6px 10px;
  transition: border-color 0.15s;
}

.photo-add-btn:hover {
  border-color: var(--primary);
}

.photo-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.photo-thumb-wrapper {
  position: relative;
  width: 64px;
  height: 64px;
}

.photo-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
}

.photo-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--red);
  color: var(--white);
  border: none;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-uploading {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
```

- [ ] **Step 2: Update ChecklistFill.tsx with photo upload functionality**

In `packages/frontend/src/pages/ChecklistFill.tsx`, make these changes:

Add `useRef` to the React import:

```typescript
import React, { useEffect, useState, useRef } from 'react';
```

Add a state for image URLs and uploading status after the existing state declarations:

```typescript
const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
const [uploading, setUploading] = useState<Record<string, boolean>>({});
const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
```

Add these functions after the existing `buildMachines` function:

```typescript
const loadImageUrl = async (imageKey: string) => {
  if (imageUrls[imageKey]) return;
  if (!id) return;
  const url = await api.getImageUrl(id, imageKey);
  setImageUrls((prev) => ({ ...prev, [imageKey]: url }));
};

const handlePhotoUpload = async (catIdx: number, itemIdx: number, files: FileList) => {
  if (!id) return;
  const key = itemKey(catIdx, itemIdx);
  setUploading((prev) => ({ ...prev, [key]: true }));

  const result = await api.uploadImages(id, activeMachine, catIdx, itemIdx, Array.from(files));

  // Update the local machines state with new images
  setMachines((prev) =>
    prev.map((m, mi) => {
      if (mi !== activeMachine) return m;
      return {
        ...m,
        categories: m.categories.map((c, ci) => {
          if (ci !== catIdx) return c;
          return {
            ...c,
            items: c.items.map((item, ii) => {
              if (ii !== itemIdx) return item;
              return { ...item, images: result.images };
            }),
          };
        }),
      };
    })
  );

  setUploading((prev) => ({ ...prev, [key]: false }));
};

const handlePhotoDelete = async (catIdx: number, itemIdx: number, imageKey: string) => {
  if (!id) return;

  const result = await api.deleteImage(id, imageKey, activeMachine, catIdx, itemIdx);

  setMachines((prev) =>
    prev.map((m, mi) => {
      if (mi !== activeMachine) return m;
      return {
        ...m,
        categories: m.categories.map((c, ci) => {
          if (ci !== catIdx) return c;
          return {
            ...c,
            items: c.items.map((item, ii) => {
              if (ii !== itemIdx) return item;
              return { ...item, images: result.images };
            }),
          };
        }),
      };
    })
  );
};
```

In the JSX, after the comment input/box section (after the closing of `{item.issue && !showComment[key] && (...)}`), add the photo section:

```tsx
{/* Photo upload */}
<div className={s.photoSection}>
  <input
    type="file"
    accept="image/*"
    multiple
    style={{ display: 'none' }}
    ref={(el) => { fileInputRefs.current[key] = el; }}
    onChange={(e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePhotoUpload(catIdx, itemIdx, e.target.files);
        e.target.value = '';
      }
    }}
  />
  <button
    className={s.photoAddBtn}
    onClick={() => fileInputRefs.current[key]?.click()}
  >
    + Add Photo
  </button>

  {uploading[key] && (
    <div className={s.photoUploading}>Uploading...</div>
  )}

  {item.images && item.images.length > 0 && (
    <div className={s.photoThumbs}>
      {item.images.map((imgKey) => {
        if (!imageUrls[imgKey]) loadImageUrl(imgKey);
        return (
          <div key={imgKey} className={s.photoThumbWrapper}>
            {imageUrls[imgKey] ? (
              <img
                className={s.photoThumb}
                src={imageUrls[imgKey]}
                alt="Uploaded"
                onClick={() => window.open(imageUrls[imgKey], '_blank')}
                style={{ cursor: 'pointer' }}
              />
            ) : (
              <div className={s.photoThumb} style={{ background: '#f3f4f6' }} />
            )}
            <button
              className={s.photoRemoveBtn}
              onClick={() => handlePhotoDelete(catIdx, itemIdx, imgKey)}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/ChecklistFill.tsx packages/frontend/src/pages/ChecklistFill.module.css
git commit -m "feat: add photo upload UI to checklist items

Each item gets an 'Add Photo' button with multi-file upload,
thumbnail previews, click-to-expand, and delete capability."
```

---

### Task 13: Display Images in ChecklistDetail and SubmissionReview

**Files:**
- Modify: `packages/frontend/src/pages/ChecklistDetail.tsx`
- Modify: `packages/frontend/src/pages/SubmissionReview.tsx`

- [ ] **Step 1: Add image display to ChecklistDetail.tsx**

In `ChecklistDetail.tsx`, add `useState` for imageUrls and a loadImageUrl function (same pattern as ChecklistFill):

After the existing state declarations, add:

```typescript
const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

const loadImageUrl = async (imageKey: string) => {
  if (imageUrls[imageKey]) return;
  if (!id) return;
  const url = await api.getImageUrl(id, imageKey);
  setImageUrls((prev) => ({ ...prev, [imageKey]: url }));
};
```

In the no-print item rendering section (around line 177 where `{item.issue && (` block ends), add after the issue box:

```tsx
{item.images && item.images.length > 0 && (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
    {item.images.map((imgKey) => {
      if (!imageUrls[imgKey]) loadImageUrl(imgKey);
      return (
        <img
          key={imgKey}
          src={imageUrls[imgKey] || ''}
          alt="Checklist photo"
          style={{
            width: 48,
            height: 48,
            objectFit: 'cover',
            borderRadius: 4,
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => imageUrls[imgKey] && window.open(imageUrls[imgKey], '_blank')}
        />
      );
    })}
  </div>
)}
```

- [ ] **Step 2: Add image display to SubmissionReview.tsx**

Apply the same pattern. Add after the existing state declarations:

```typescript
const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

const loadImageUrl = async (imageKey: string) => {
  if (imageUrls[imageKey]) return;
  if (!id) return;
  const url = await api.getImageUrl(id, imageKey);
  setImageUrls((prev) => ({ ...prev, [imageKey]: url }));
};
```

In both the edit-mode and read-only item rendering, add after any issue/comment display:

```tsx
{item.images && item.images.length > 0 && (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
    {item.images.map((imgKey) => {
      if (!imageUrls[imgKey]) loadImageUrl(imgKey);
      return (
        <img
          key={imgKey}
          src={imageUrls[imgKey] || ''}
          alt="Checklist photo"
          style={{
            width: 48,
            height: 48,
            objectFit: 'cover',
            borderRadius: 4,
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => imageUrls[imgKey] && window.open(imageUrls[imgKey], '_blank')}
        />
      );
    })}
  </div>
)}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/ChecklistDetail.tsx packages/frontend/src/pages/SubmissionReview.tsx
git commit -m "feat: display uploaded images in checklist detail and review views

Shows thumbnail previews with click-to-expand for images
attached to checklist items."
```

---

### Task 14: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Start LocalStack**

Run: `docker compose up -d && sleep 5`

- [ ] **Step 2: Verify DynamoDB tables exist**

Run: `aws --endpoint-url=http://localhost:4566 dynamodb list-tables --region us-west-2`

Expected: All 4 tables listed

- [ ] **Step 3: Seed the database**

Run: `cd packages/backend && npx tsx src/data/seed-dynamo.ts`

Expected: "Seeding DynamoDB with demo data..." + credential output

- [ ] **Step 4: Start the backend**

Run: `cd packages/backend && npm run dev`

Expected: "Backend running on http://localhost:4000"

- [ ] **Step 5: Test health check**

Run: `curl http://localhost:4000/health`

Expected: `{"status":"ok"}`

- [ ] **Step 6: Test login**

Run: `curl -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@gallo.com","password":"admin123"}'`

Expected: JSON with `user` and `token` fields

- [ ] **Step 7: Start the frontend and test the full flow**

Run: `cd packages/frontend && npm run dev`

Open `http://localhost:3000` in browser. Verify:
1. Login works with demo credentials
2. Operator dashboard shows checklists
3. Creating a new checklist works
4. Filling out checklist items works
5. Photo upload button appears and uploads work
6. Submitting a checklist works
7. Admin can review and approve/deny

- [ ] **Step 8: Run existing tests**

Run: `npm test`

Expected: Unit tests pass (some may need updates if they relied on data.json — fix as needed)

- [ ] **Step 9: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
