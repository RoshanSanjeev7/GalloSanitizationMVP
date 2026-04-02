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
  let results = await getAllChecklists();
  if (filters.lineId) results = results.filter(c => c.lineId === filters.lineId);
  return results;
}
