/**
 * DynamoDB Data Access Layer
 *
 * This file handles all database operations for the app.
 * We use AWS DynamoDB (a NoSQL database) to store:
 * - Users (operators, admins, supervisors)
 * - Lines (production/bottling lines)
 * - Templates (checklist templates that admins create)
 * - Checklists (filled-out checklist instances by operators)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,            // Fetch a single item by its primary key (fast, direct lookup)
  PutCommand,            // Create a new item OR overwrite an existing one
  DeleteCommand,         // Remove an item by its primary key
  ScanCommand,           // Read ALL items in a table (slow & expensive - avoid if possible)
  QueryCommand,          // Find items using an index (fast & efficient)
  UpdateCommand,         // Atomically update specific fields (no read-modify-write race)
  TransactWriteCommand,  // Multi-item atomic transaction (for email uniqueness)
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config/env.js';
import type { User, Line, Template, Checklist, ChecklistMachine, Activity, Factory } from '../types/index.js';

// ─── CLIENT SETUP ───────────────────────────────────────────────────
// Create the low-level DynamoDB client with connection settings
const client = new DynamoDBClient({
  region: config.aws.region,           // AWS region (e.g., 'us-west-2')
  endpoint: config.aws.endpoint,       // Custom endpoint (for LocalStack local dev)
  credentials: config.aws.credentials, // AWS access key & secret
});

// Wrap in DocumentClient - this makes it easier to work with plain JS objects
// Without this, you'd have to manually convert to/from DynamoDB's format like:
//   { id: { S: "123" }, name: { S: "John" } }  <-- DynamoDB format
//   { id: "123", name: "John" }                <-- JS object (what we use)
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }, // Don't save undefined fields
});

// ─── USERS ──────────────────────────────────────────────────────────
// Users table stores: operators, admins, supervisors
// Primary key: id
// Global Secondary Index (GSI): email-index (for login lookup)

export async function getUser(id: string): Promise<User | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.users, Key: { id } })
  );
  return result.Item as User | undefined;
}

// Find a user by email - used for login
// Uses the 'email-index' GSI since email isn't the primary key
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.users,
      IndexName: 'email-index',              // Use the email index
      KeyConditionExpression: 'email = :email', // Find where email matches
      ExpressionAttributeValues: { ':email': email },
      Limit: 5,                              // Fetch a few to skip lock items
    })
  );
  // Filter out EMAIL# lock items — they share the email GSI but are not real users
  const users = (result.Items || []) as User[];
  return users.find(u => !u.id.startsWith('EMAIL#'));
}

// WARNING: Scan reads the entire table, expensive for large datasets
export async function getAllUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.users })
  );
  return ((result.Items || []) as User[]).filter(u => !u.id.startsWith('EMAIL#'));
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

// ─── FACTORIES ─────────────────────────────────────────────────────
// Factories = physical plant locations that contain production lines
// Primary key: id

export async function getAllFactories(): Promise<Factory[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.factories })
  );
  return (result.Items || []) as Factory[];
}

export async function getFactory(id: string): Promise<Factory | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.factories, Key: { id } })
  );
  return result.Item as Factory | undefined;
}

export async function putFactory(factory: Factory): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.factories, Item: factory })
  );
}

export async function deleteFactory(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.factories, Key: { id } })
  );
}

// ─── LINES ──────────────────────────────────────────────────────────
// Lines = production/bottling lines in the facility
// Primary key: id

// Get all production lines
export async function getAllLines(): Promise<Line[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.lines })
  );
  return (result.Items || []) as Line[];
}

// Get a single line by ID
export async function getLine(id: string): Promise<Line | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.lines, Key: { id } })
  );
  return result.Item as Line | undefined;
}

// Create or update a line
export async function putLine(line: Line): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.lines, Item: line })
  );
}

// ─── TEMPLATES ──────────────────────────────────────────────────────
// Templates = checklist templates that admins create
// Operators fill these out to create Checklists
// Primary key: id
// GSI: lineId-index (to find all templates for a specific line)

// Get all templates
export async function getAllTemplates(): Promise<Template[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.templates })
  );
  return (result.Items || []) as Template[];
}

// Get a single template by ID
export async function getTemplate(id: string): Promise<Template | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.templates, Key: { id } })
  );
  return result.Item as Template | undefined;
}

// Find all templates assigned to a specific production line
// Uses the 'lineId-index' GSI for efficient lookup
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

// Create or update a template
export async function putTemplate(template: Template): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.templates, Item: template })
  );
}

// Delete a template
export async function deleteTemplate(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.templates, Key: { id } })
  );
}

// ─── CHECKLISTS ─────────────────────────────────────────────────────
// Checklists = filled-out instances of templates by operators
// Primary key: id
// GSIs: operatorId-index, status-index (for filtering)

// Get a single checklist by ID
export async function getChecklist(id: string): Promise<Checklist | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: config.tables.checklists, Key: { id } })
  );
  return result.Item as Checklist | undefined;
}

// Get ALL checklists (admin view)
export async function getAllChecklists(): Promise<Checklist[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: config.tables.checklists })
  );
  return (result.Items || []) as Checklist[];
}

// Find all checklists submitted by a specific operator
// Uses 'operatorId-index' GSI
// ScanIndexForward: false = newest first (descending order)
export async function getChecklistsByOperator(operatorId: string): Promise<Checklist[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.checklists,
      IndexName: 'operatorId-index',
      KeyConditionExpression: 'operatorId = :operatorId',
      ExpressionAttributeValues: { ':operatorId': operatorId },
      ScanIndexForward: false,  // Sort descending (newest first)
    })
  );
  return (result.Items || []) as Checklist[];
}

// Find all checklists with a specific status (e.g., 'pending', 'approved', 'rejected')
// Uses 'status-index' GSI
// Note: '#status' is used because 'status' is a reserved word in DynamoDB
export async function getChecklistsByStatus(status: string): Promise<Checklist[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.tables.checklists,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },  // Escape reserved word
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,  // Newest first
    })
  );
  return (result.Items || []) as Checklist[];
}

// Create or update a checklist
export async function putChecklist(checklist: Checklist): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: config.tables.checklists, Item: checklist })
  );
}

// Delete a checklist
export async function deleteChecklist(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: config.tables.checklists, Key: { id } })
  );
}

// ─── CONDITIONAL WRITES ────────────────────────────────────────────
// These functions use DynamoDB conditional expressions to prevent race conditions.
// They throw ConditionalCheckFailedException when the condition fails, which
// callers should catch and return HTTP 409.

/**
 * Update a checklist with optimistic concurrency control.
 * Fails with ConditionalCheckFailedException if the stored version
 * doesn't match expectedVersion, preventing lost updates from concurrent edits.
 */
export async function conditionalPutChecklist(
  checklist: Checklist,
  expectedVersion: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.tables.checklists,
      Item: { ...checklist, version: expectedVersion + 1 },
      ConditionExpression: '#v = :ev',
      ExpressionAttributeNames: { '#v': 'version' },
      ExpressionAttributeValues: { ':ev': expectedVersion },
    }),
  );
}

/**
 * Atomically transition a checklist's status.
 * Requires BOTH the version AND current status to match, preventing
 * race conditions like two admins approving/denying simultaneously.
 */
export async function conditionalStatusTransition(
  checklist: Checklist,
  expectedStatus: string,
  expectedVersion: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.tables.checklists,
      Item: { ...checklist, version: expectedVersion + 1 },
      ConditionExpression: '#v = :ev AND #s = :es',
      ExpressionAttributeNames: { '#v': 'version', '#s': 'status' },
      ExpressionAttributeValues: { ':ev': expectedVersion, ':es': expectedStatus },
    }),
  );
}

/**
 * Atomically mark a checklist as viewed without read-modify-write.
 * Uses UpdateCommand so it doesn't interfere with concurrent item edits.
 */
export async function markChecklistViewed(
  id: string,
  viewedAt: string,
  viewedBy: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.tables.checklists,
      Key: { id },
      UpdateExpression: 'SET viewedAt = :at, viewedBy = :by',
      ExpressionAttributeValues: { ':at': viewedAt, ':by': viewedBy },
    }),
  );
}

/**
 * Atomically update a single machine within a checklist.
 * Uses DynamoDB UpdateCommand to SET machines[N] so operators on
 * different machines never conflict with each other.
 */
export async function updateChecklistMachine(
  checklistId: string,
  machineIdx: number,
  machine: ChecklistMachine,
  expectedVersion: number,
  updatedAt: string,
  activities?: Activity[],
): Promise<number> {
  const newVersion = expectedVersion + 1;
  let updateExpr = `SET machines[${machineIdx}] = :machine, #v = :nv, updatedAt = :ua, viewedAt = :null, viewedBy = :null`;
  const exprValues: Record<string, unknown> = {
    ':machine': machine,
    ':nv': newVersion,
    ':ua': updatedAt,
    ':ev': expectedVersion,
    ':null': null,
  };

  if (activities && activities.length > 0) {
    updateExpr += ', activities = list_append(if_not_exists(activities, :empty), :acts)';
    exprValues[':empty'] = [];
    exprValues[':acts'] = activities;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.tables.checklists,
      Key: { id: checklistId },
      UpdateExpression: updateExpr,
      ConditionExpression: '#v = :ev',
      ExpressionAttributeNames: { '#v': 'version' },
      ExpressionAttributeValues: exprValues,
    }),
  );
  return newVersion;
}

/**
 * Atomically append image keys to a checklist item.
 * Uses list_append so it doesn't overwrite concurrent edits to other items.
 */
export async function appendChecklistImages(
  checklistId: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
  newKeys: string[],
  activity: Activity,
): Promise<void> {
  const imgPath = `machines[${machineIdx}].categories[${catIdx}].items[${itemIdx}].images`;
  await docClient.send(
    new UpdateCommand({
      TableName: config.tables.checklists,
      Key: { id: checklistId },
      UpdateExpression: `SET ${imgPath} = list_append(if_not_exists(${imgPath}, :empty), :keys), viewedAt = :null, viewedBy = :null, activities = list_append(if_not_exists(activities, :empty), :act)`,
      ExpressionAttributeValues: {
        ':keys': newKeys,
        ':empty': [],
        ':null': null,
        ':act': [activity],
      },
    }),
  );
}

/**
 * Atomically remove an image key from a checklist item.
 * Reads then conditionally writes — there's no DynamoDB "remove from list by value".
 */
export async function removeChecklistImage(
  checklistId: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
  remainingImages: string[],
): Promise<void> {
  const imgPath = `machines[${machineIdx}].categories[${catIdx}].items[${itemIdx}].images`;
  await docClient.send(
    new UpdateCommand({
      TableName: config.tables.checklists,
      Key: { id: checklistId },
      UpdateExpression: `SET ${imgPath} = :imgs`,
      ExpressionAttributeValues: { ':imgs': remainingImages },
    }),
  );
}

/**
 * Delete a checklist only if it exists (prevents silent double-delete).
 */
export async function conditionalDeleteChecklist(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: config.tables.checklists,
      Key: { id },
      ConditionExpression: 'attribute_exists(id)',
    }),
  );
}

// ─── USER EMAIL UNIQUENESS ─────────────────────────────────────────
// DynamoDB GSIs don't enforce uniqueness. We use a transaction to atomically
// create both the user item AND an EMAIL#<email> lock item. If the email
// already exists, the transaction fails.

/**
 * Create a user with atomic email uniqueness guarantee.
 * Creates two items in a transaction: the user and an EMAIL#<email> lock.
 */
export async function createUserWithEmailLock(user: User): Promise<void> {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tables.users,
            Item: user,
            ConditionExpression: 'attribute_not_exists(id)',
          },
        },
        {
          Put: {
            TableName: config.tables.users,
            Item: { id: `EMAIL#${user.email}`, email: user.email, _lockType: 'email_uniqueness' },
            ConditionExpression: 'attribute_not_exists(id)',
          },
        },
      ],
    }),
  );
}

/**
 * Delete a user and its email lock item atomically.
 */
export async function deleteUserWithEmailLock(id: string, email: string): Promise<void> {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: config.tables.users,
            Key: { id },
          },
        },
        {
          Delete: {
            TableName: config.tables.users,
            Key: { id: `EMAIL#${email}` },
          },
        },
      ],
    }),
  );
}

/**
 * Query checklists with multiple optional filters
 *
 * Strategy: Use the most selective index available, then filter in-memory
 * - If operatorId provided: use operatorId-index, then filter by status/lineId
 * - Else if status provided: use status-index, then filter by lineId
 * - Else: scan all and filter by lineId
 *
 * This is a trade-off - DynamoDB can only query ONE index at a time,
 * so we pick the best index and filter the rest in JavaScript
 */
export async function queryChecklists(filters: {
  status?: string;
  operatorId?: string;
  lineId?: string;
}): Promise<Checklist[]> {
  // Priority 1: Use operatorId index if provided
  if (filters.operatorId) {
    let results = await getChecklistsByOperator(filters.operatorId);
    if (filters.status) results = results.filter(c => c.status === filters.status);
    if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
    return results;
  }

  // Priority 2: Use status index if provided
  if (filters.status) {
    let results = await getChecklistsByStatus(filters.status);
    if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
    return results;
  }

  // Fallback: Scan all and filter
  let results = await getAllChecklists();
  if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
  return results;
}
