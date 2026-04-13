import { v4 as uuid } from 'uuid';
import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamo.js';
import { config } from '../config/env.js';

const TABLE = config.tables.auditLog;

export interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  timestamp: string;
}

export async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        id: uuid(),
        ...entry,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

export async function getAuditLogs(filters: {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AuditEntry[]; total: number; hasMore: boolean }> {
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = Math.max(0, filters.offset || 0);

  let items: AuditEntry[];

  if (filters.userId) {
    // Use userId-index
    const params: any = {
      TableName: TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': filters.userId } as Record<string, unknown>,
      ScanIndexForward: false,
    };
    if (filters.startDate && filters.endDate) {
      params.KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
      params.ExpressionAttributeNames = { '#ts': 'timestamp' };
      params.ExpressionAttributeValues[':start'] = filters.startDate;
      params.ExpressionAttributeValues[':end'] = filters.endDate;
    } else if (filters.startDate) {
      params.KeyConditionExpression += ' AND #ts >= :start';
      params.ExpressionAttributeNames = { '#ts': 'timestamp' };
      params.ExpressionAttributeValues[':start'] = filters.startDate;
    }
    const result = await docClient.send(new QueryCommand(params));
    items = (result.Items || []) as AuditEntry[];
  } else if (filters.action) {
    // Use timestamp-index (action is the partition key)
    const params: any = {
      TableName: TABLE,
      IndexName: 'timestamp-index',
      KeyConditionExpression: '#action = :act',
      ExpressionAttributeNames: { '#action': 'action' } as Record<string, string>,
      ExpressionAttributeValues: { ':act': filters.action } as Record<string, unknown>,
      ScanIndexForward: false,
    };
    if (filters.startDate && filters.endDate) {
      params.KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
      params.ExpressionAttributeNames['#ts'] = 'timestamp';
      params.ExpressionAttributeValues[':start'] = filters.startDate;
      params.ExpressionAttributeValues[':end'] = filters.endDate;
    }
    const result = await docClient.send(new QueryCommand(params));
    items = (result.Items || []) as AuditEntry[];
  } else {
    // Fallback: scan all
    const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
    items = ((result.Items || []) as AuditEntry[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  // Apply date filter for scan results
  if (!filters.userId && !filters.action && filters.startDate) {
    items = items.filter((i) => i.timestamp >= filters.startDate!);
  }
  if (!filters.userId && !filters.action && filters.endDate) {
    items = items.filter((i) => i.timestamp <= filters.endDate!);
  }

  const total = items.length;
  const paged = items.slice(offset, offset + limit);
  return { items: paged, total, hasMore: offset + limit < total };
}
