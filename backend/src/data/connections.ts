import {
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamo.js';
import { config } from '../config/env.js';
import type { ConnectionRecord } from '../ws/messages.js';
import { CONNECTION_TTL_MINUTES } from '../config/constants.js';

const TABLE = config.tables.connections;

function ttlFromNow(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

export async function putConnection(conn: ConnectionRecord): Promise<void> {
  // Strip null values — DynamoDB GSIs can't index null key attributes
  const item: Record<string, unknown> = { ...conn, ttl: ttlFromNow(CONNECTION_TTL_MINUTES) };
  for (const key of Object.keys(item)) {
    if (item[key] === null) delete item[key];
  }
  await docClient.send(
    new PutCommand({ TableName: TABLE, Item: item }),
  );
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: TABLE, Key: { connectionId } }),
  );
}

export async function updateConnectionSubscription(
  connectionId: string,
  checklistId: string | null,
  activeMachine: number | null,
): Promise<void> {
  const channel = checklistId ? `checklist:${checklistId}` : 'dashboard';
  if (checklistId) {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { connectionId },
        UpdateExpression: 'SET checklistId = :cid, activeMachine = :am, channel = :ch, lastActivity = :now, #ttl = :ttl',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':cid': checklistId,
          ':am': activeMachine,
          ':ch': channel,
          ':now': new Date().toISOString(),
          ':ttl': ttlFromNow(CONNECTION_TTL_MINUTES),
        },
      }),
    );
  } else {
    // Remove checklistId and activeMachine — can't store null in GSI key attributes
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { connectionId },
        UpdateExpression: 'REMOVE checklistId, activeMachine SET channel = :ch, lastActivity = :now, #ttl = :ttl',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':ch': channel,
          ':now': new Date().toISOString(),
          ':ttl': ttlFromNow(CONNECTION_TTL_MINUTES),
        },
      }),
    );
  }
}

export async function updateConnectionMachine(
  connectionId: string,
  activeMachine: number,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { connectionId },
      UpdateExpression: 'SET activeMachine = :am, lastActivity = :now, #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':am': activeMachine,
        ':now': new Date().toISOString(),
        ':ttl': ttlFromNow(CONNECTION_TTL_MINUTES),
      },
    }),
  );
}

export async function touchConnection(connectionId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { connectionId },
      UpdateExpression: 'SET lastActivity = :now, #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
        ':ttl': ttlFromNow(CONNECTION_TTL_MINUTES),
      },
    }),
  );
}

export async function getConnectionsByChecklist(checklistId: string): Promise<ConnectionRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'checklistId-index',
      KeyConditionExpression: 'checklistId = :cid',
      ExpressionAttributeValues: { ':cid': checklistId },
    }),
  );
  return (result.Items || []) as ConnectionRecord[];
}

export async function getConnectionsByChannel(channel: string): Promise<ConnectionRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'channel-index',
      KeyConditionExpression: 'channel = :ch',
      ExpressionAttributeValues: { ':ch': channel },
    }),
  );
  return (result.Items || []) as ConnectionRecord[];
}

export async function getAllConnections(): Promise<ConnectionRecord[]> {
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLE }),
  );
  return (result.Items || []) as ConnectionRecord[];
}
