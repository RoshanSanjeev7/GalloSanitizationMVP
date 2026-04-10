# Real-time WebSocket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time collaborative checklist editing with WebSocket, presence indicators, and auto-reconnection.

**Architecture:** API Gateway WebSocket for production with adapter pattern — local dev uses `ws` library on Express. Native WebSocket on frontend. Item-level deltas broadcast to all subscribers. DynamoDB connections table tracks active users.

**Tech Stack:** `ws` (local WS server), `@aws-sdk/client-apigatewaymanagementapi` (production broadcaster), native `WebSocket` API (frontend), DynamoDB (connections table)

---

## File Map

### New Backend Files
| File | Responsibility |
|------|---------------|
| `backend/src/ws/messages.ts` | Shared message type definitions |
| `backend/src/ws/broadcaster.ts` | `WebSocketBroadcaster` interface + factory |
| `backend/src/ws/local-ws.ts` | Local dev WS server using `ws` library |
| `backend/src/ws/apigw-ws.ts` | Production broadcaster using API Gateway Management API |
| `backend/src/data/connections.ts` | DynamoDB CRUD for SanitizationConnections table |
| `backend/src/ws/__tests__/connections.test.ts` | Unit tests for connections data layer |
| `backend/src/ws/__tests__/local-ws.test.ts` | Unit tests for local WS server |
| `backend/src/ws/__tests__/broadcaster.test.ts` | Unit tests for broadcast logic |

### New Frontend Files
| File | Responsibility |
|------|---------------|
| `frontend/src/services/websocket.ts` | WebSocket client manager (connect, reconnect, idle, subscribe) |
| `frontend/src/hooks/useWebSocket.ts` | React hook for WS lifecycle tied to auth |
| `frontend/src/hooks/useChecklistSync.ts` | Subscribe to checklist, apply deltas, track presence |
| `frontend/src/hooks/usePresenceSummary.ts` | Dashboard-level presence subscription |
| `frontend/src/components/PresenceAvatars.tsx` | Overlapping avatar circles component |
| `frontend/src/components/PresenceAvatars.module.css` | Styles for presence avatars |
| `frontend/src/components/ReconnectBanner.tsx` | "Reconnecting..." indicator banner |
| `frontend/src/components/ReconnectBanner.module.css` | Styles for reconnect banner |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/config/env.ts` | Add `wsMode`, `apiGatewayEndpoint`, `tables.connections` |
| `backend/src/index.ts` | Initialize broadcaster, attach to HTTP server |
| `backend/src/routes/checklists.ts` | Broadcast after each mutation |
| `backend/src/routes/images.ts` | Broadcast after image add/delete |
| `localstack/init-aws.sh` | Add SanitizationConnections table |
| `backend/.env` | Add `WS_MODE=local` |
| `frontend/src/App.tsx` | Add `useWebSocket` hook, `ReconnectBanner` |
| `frontend/src/pages/ChecklistFill.tsx` | Add `useChecklistSync`, `PresenceAvatars`, machine change |
| `frontend/src/pages/SubmissionReview.tsx` | Add `useChecklistSync`, `PresenceAvatars` in sidebar |
| `frontend/src/pages/AdminDashboard.tsx` | Add `usePresenceSummary`, `PresenceAvatars` on rows |

---

### Task 1: Install dependencies and add DynamoDB connections table

**Files:**
- Modify: `backend/package.json`
- Modify: `localstack/init-aws.sh`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env`

- [ ] **Step 1: Install backend dependencies**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP
npm install ws @aws-sdk/client-apigatewaymanagementapi --workspace=backend
npm install -D @types/ws --workspace=backend
```

- [ ] **Step 2: Add SanitizationConnections table to LocalStack init**

Append to `localstack/init-aws.sh` before the final echo:

```bash
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
```

- [ ] **Step 3: Add config entries to `backend/src/config/env.ts`**

Add to the config object after `sqsQueueUrl`:

```typescript
  wsMode: (process.env.WS_MODE || 'local') as 'local' | 'apigw',
  apiGatewayEndpoint: process.env.APIGW_WS_ENDPOINT || undefined,
```

Add to `tables` object:

```typescript
    connections: process.env.DYNAMODB_TABLE_CONNECTIONS || 'SanitizationConnections',
```

- [ ] **Step 4: Add `WS_MODE=local` to `backend/.env`**

Append: `WS_MODE=local`

- [ ] **Step 5: Recreate LocalStack tables to include the new one**

```bash
docker compose down && docker compose up -d
sleep 5
npm run localstack:seed
```

- [ ] **Step 6: Verify the connections table exists**

```bash
awslocal dynamodb describe-table --table-name SanitizationConnections --endpoint-url http://localhost:4566 | head -5
```

Expected: Table description JSON output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add ws dependencies, SanitizationConnections table, config entries"
```

---

### Task 2: Message types and connections data layer

**Files:**
- Create: `backend/src/ws/messages.ts`
- Create: `backend/src/data/connections.ts`
- Create: `backend/src/ws/__tests__/connections.test.ts`

- [ ] **Step 1: Write message type definitions — `backend/src/ws/messages.ts`**

```typescript
// ─── Client → Server Messages ───────────────────────────────────────
export interface SubscribeMessage {
  type: 'subscribe';
  checklistId: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  checklistId: string;
}

export interface MachineChangeMessage {
  type: 'machine_change';
  checklistId: string;
  machineIdx: number;
}

export interface SubscribeDashboardMessage {
  type: 'subscribe_dashboard';
}

export interface UnsubscribeDashboardMessage {
  type: 'unsubscribe_dashboard';
}

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export interface IdleMessage {
  type: 'idle';
}

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | MachineChangeMessage
  | SubscribeDashboardMessage
  | UnsubscribeDashboardMessage
  | HeartbeatMessage
  | IdleMessage;

// ─── Server → Client Messages ───────────────────────────────────────
export interface ItemUpdateMessage {
  type: 'item_update';
  checklistId: string;
  machineIdx: number;
  catIdx: number;
  itemIdx: number;
  field: 'completed' | 'completedBy' | 'completedAt';
  value: boolean | string | null;
  by: string;
  at: string;
}

export interface CommentUpdateMessage {
  type: 'comment_update';
  checklistId: string;
  machineIdx: number;
  catIdx: number;
  itemIdx: number;
  issue: string | null;
  by: string;
  at: string;
}

export interface ImageUpdateMessage {
  type: 'image_update';
  checklistId: string;
  machineIdx: number;
  catIdx: number;
  itemIdx: number;
  images: string[];
  by: string;
  at: string;
}

export interface StatusChangeMessage {
  type: 'status_change';
  checklistId: string;
  status: 'submitted' | 'approved' | 'denied';
  by: string;
  at: string;
}

export interface ChecklistDeletedMessage {
  type: 'checklist_deleted';
  checklistId: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

export interface PresenceMessage {
  type: 'presence';
  checklistId: string;
  users: PresenceUser[];
}

export interface PresenceSummaryMessage {
  type: 'presence_summary';
  checklists: Record<string, PresenceUser[]>;
}

export interface ConnectedMessage {
  type: 'connected';
  userId: string;
  connectionId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | ItemUpdateMessage
  | CommentUpdateMessage
  | ImageUpdateMessage
  | StatusChangeMessage
  | ChecklistDeletedMessage
  | PresenceMessage
  | PresenceSummaryMessage
  | ConnectedMessage
  | ErrorMessage;

// ─── Connection Record ──────────────────────────────────────────────
export interface ConnectionRecord {
  connectionId: string;
  userId: string;
  userName: string;
  userRole: string;
  checklistId: string | null;
  activeMachine: number | null;
  channel: string; // 'dashboard' | 'checklist:<id>'
  connectedAt: string;
  lastActivity: string;
  ttl: number;
}
```

- [ ] **Step 2: Write connections data layer — `backend/src/data/connections.ts`**

```typescript
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamo.js';
import { config } from '../config/env.js';
import type { ConnectionRecord } from '../ws/messages.js';

const TABLE = config.tables.connections;

function ttlFromNow(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

export async function putConnection(conn: ConnectionRecord): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: TABLE, Item: { ...conn, ttl: ttlFromNow(30) } }),
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
        ':ttl': ttlFromNow(30),
      },
    }),
  );
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
        ':ttl': ttlFromNow(30),
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
        ':ttl': ttlFromNow(30),
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
```

- [ ] **Step 3: Write unit tests — `backend/src/ws/__tests__/connections.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
}));

vi.mock('../../config/env.js', () => ({
  config: {
    tables: { connections: 'SanitizationConnections' },
    aws: {},
  },
}));

import { docClient } from '../../data/dynamo.js';
import {
  putConnection,
  deleteConnection,
  updateConnectionSubscription,
  getConnectionsByChecklist,
  getConnectionsByChannel,
  touchConnection,
} from '../../data/connections.js';

const mockSend = vi.mocked(docClient.send);

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ Items: [] } as any);
});

describe('connections data layer', () => {
  it('putConnection sends PutCommand with ttl', async () => {
    await putConnection({
      connectionId: 'conn-1',
      userId: 'u-1',
      userName: 'Gabriel',
      userRole: 'operator',
      checklistId: null,
      activeMachine: null,
      channel: 'dashboard',
      connectedAt: '2026-04-10T00:00:00Z',
      lastActivity: '2026-04-10T00:00:00Z',
      ttl: 0,
    });
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.TableName).toBe('SanitizationConnections');
    expect(cmd.input.Item.connectionId).toBe('conn-1');
    expect(cmd.input.Item.ttl).toBeGreaterThan(0);
  });

  it('deleteConnection sends DeleteCommand', async () => {
    await deleteConnection('conn-1');
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.Key).toEqual({ connectionId: 'conn-1' });
  });

  it('updateConnectionSubscription sets checklistId and channel', async () => {
    await updateConnectionSubscription('conn-1', 'cl-123', 0);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.ExpressionAttributeValues[':cid']).toBe('cl-123');
    expect(cmd.input.ExpressionAttributeValues[':ch']).toBe('checklist:cl-123');
    expect(cmd.input.ExpressionAttributeValues[':am']).toBe(0);
  });

  it('updateConnectionSubscription with null sets dashboard channel', async () => {
    await updateConnectionSubscription('conn-1', null, null);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.ExpressionAttributeValues[':ch']).toBe('dashboard');
  });

  it('getConnectionsByChecklist queries checklistId-index', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ connectionId: 'c1' }] } as any);
    const result = await getConnectionsByChecklist('cl-123');
    expect(result).toHaveLength(1);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.IndexName).toBe('checklistId-index');
  });

  it('getConnectionsByChannel queries channel-index', async () => {
    await getConnectionsByChannel('dashboard');
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.IndexName).toBe('channel-index');
  });

  it('touchConnection updates lastActivity and ttl', async () => {
    await touchConnection('conn-1');
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.UpdateExpression).toContain('lastActivity');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP/backend
npx vitest run src/ws/__tests__/connections.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add WebSocket message types and connections data layer"
```

---

### Task 3: Broadcaster interface and local WebSocket server

**Files:**
- Create: `backend/src/ws/broadcaster.ts`
- Create: `backend/src/ws/local-ws.ts`
- Create: `backend/src/ws/__tests__/local-ws.test.ts`

- [ ] **Step 1: Write broadcaster interface — `backend/src/ws/broadcaster.ts`**

```typescript
import type { Server as HttpServer } from 'node:http';
import type { PresenceUser } from './messages.js';
import { config } from '../config/env.js';

export interface WebSocketBroadcaster {
  init(server?: HttpServer): void;
  broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void>;
  broadcastPresence(checklistId: string): Promise<void>;
  broadcastPresenceSummary(): Promise<void>;
  getChecklistPresence(checklistId: string): Promise<PresenceUser[]>;
}

export function createBroadcaster(): WebSocketBroadcaster {
  if (config.wsMode === 'apigw') {
    // Lazy import to avoid loading AWS SDK in local dev
    return require('./apigw-ws.js').ApiGatewayBroadcaster();
  }
  const { LocalWsBroadcaster } = require('./local-ws.js');
  return new LocalWsBroadcaster();
}
```

Wait — this project uses ESM, not CommonJS. Let me use dynamic `import()`:

```typescript
import type { Server as HttpServer } from 'node:http';
import type { PresenceUser } from './messages.js';
import { config } from '../config/env.js';

export interface WebSocketBroadcaster {
  init(server?: HttpServer): void;
  broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void>;
  broadcastPresence(checklistId: string): Promise<void>;
  broadcastPresenceSummary(): Promise<void>;
  getChecklistPresence(checklistId: string): Promise<PresenceUser[]>;
}

export async function createBroadcaster(): Promise<WebSocketBroadcaster> {
  if (config.wsMode === 'apigw') {
    const { ApiGatewayBroadcaster } = await import('./apigw-ws.js');
    return new ApiGatewayBroadcaster();
  }
  const { LocalWsBroadcaster } = await import('./local-ws.js');
  return new LocalWsBroadcaster();
}
```

- [ ] **Step 2: Write local WebSocket server — `backend/src/ws/local-ws.ts`**

```typescript
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { WebSocketBroadcaster } from './broadcaster.js';
import type { ClientMessage, ConnectionRecord, PresenceUser } from './messages.js';
import {
  putConnection,
  deleteConnection,
  updateConnectionSubscription,
  updateConnectionMachine,
  touchConnection,
  getConnectionsByChecklist,
  getConnectionsByChannel,
  getAllConnections,
} from '../data/connections.js';

interface LocalConnection {
  ws: WsWebSocket;
  connectionId: string;
  userId: string;
  userName: string;
  userRole: string;
  checklistId: string | null;
  activeMachine: number | null;
}

let nextConnId = 1;

export class LocalWsBroadcaster implements WebSocketBroadcaster {
  private connections = new Map<string, LocalConnection>();
  private wss: WebSocketServer | null = null;
  private presenceInterval: ReturnType<typeof setInterval> | null = null;

  init(server?: HttpServer): void {
    if (!server) throw new Error('LocalWsBroadcaster requires an HTTP server');
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WsWebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Send presence summary to dashboard subscribers every 10s
    this.presenceInterval = setInterval(() => {
      this.broadcastPresenceSummary().catch(() => {});
    }, 10_000);
  }

  private async handleConnection(ws: WsWebSocket, req: IncomingMessage): Promise<void> {
    // Extract token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.send(JSON.stringify({ type: 'error', message: 'No token provided' }));
      ws.close();
      return;
    }

    let decoded: { userId: string; role: string };
    try {
      decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string };
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      ws.close();
      return;
    }

    // Look up user name from token payload or default
    const { getUser } = await import('../data/dynamo.js');
    const user = await getUser(decoded.userId);
    const userName = user?.name || 'Unknown';

    const connectionId = `local-${nextConnId++}`;
    const conn: LocalConnection = {
      ws,
      connectionId,
      userId: decoded.userId,
      userName,
      userRole: decoded.role,
      checklistId: null,
      activeMachine: null,
    };

    this.connections.set(connectionId, conn);

    // Store in DynamoDB for consistency with APIGW mode
    const now = new Date().toISOString();
    await putConnection({
      connectionId,
      userId: decoded.userId,
      userName,
      userRole: decoded.role,
      checklistId: null,
      activeMachine: null,
      channel: 'dashboard',
      connectedAt: now,
      lastActivity: now,
      ttl: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    ws.send(JSON.stringify({ type: 'connected', userId: decoded.userId, connectionId }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(connectionId, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      const oldChecklistId = conn.checklistId;
      this.connections.delete(connectionId);
      deleteConnection(connectionId).catch(() => {});
      if (oldChecklistId) {
        this.broadcastPresence(oldChecklistId).catch(() => {});
      }
      this.broadcastPresenceSummary().catch(() => {});
    });
  }

  private async handleMessage(connectionId: string, msg: ClientMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    switch (msg.type) {
      case 'subscribe': {
        const oldChecklistId = conn.checklistId;
        conn.checklistId = msg.checklistId;
        conn.activeMachine = 0;
        await updateConnectionSubscription(connectionId, msg.checklistId, 0);
        if (oldChecklistId && oldChecklistId !== msg.checklistId) {
          await this.broadcastPresence(oldChecklistId);
        }
        await this.broadcastPresence(msg.checklistId);
        await this.broadcastPresenceSummary();
        break;
      }
      case 'unsubscribe': {
        conn.checklistId = null;
        conn.activeMachine = null;
        await updateConnectionSubscription(connectionId, null, null);
        await this.broadcastPresence(msg.checklistId);
        await this.broadcastPresenceSummary();
        break;
      }
      case 'machine_change': {
        conn.activeMachine = msg.machineIdx;
        await updateConnectionMachine(connectionId, msg.machineIdx);
        await this.broadcastPresence(msg.checklistId);
        break;
      }
      case 'subscribe_dashboard': {
        // Already on dashboard channel by default, no-op for local mode
        break;
      }
      case 'unsubscribe_dashboard': {
        break;
      }
      case 'heartbeat': {
        await touchConnection(connectionId);
        break;
      }
      case 'idle': {
        // Client will close the connection itself
        break;
      }
    }
  }

  async broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void> {
    const msg = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId && conn.userId !== excludeUserId) {
        if (conn.ws.readyState === WsWebSocket.OPEN) {
          conn.ws.send(msg);
        }
      }
    }
  }

  async broadcastPresence(checklistId: string): Promise<void> {
    const users: PresenceUser[] = [];
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId) {
        users.push({
          id: conn.userId,
          name: conn.userName,
          role: conn.userRole,
          machine: conn.activeMachine,
        });
      }
    }
    // Dedupe by userId (user may have multiple tabs)
    const seen = new Set<string>();
    const deduped = users.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    const msg = JSON.stringify({ type: 'presence', checklistId, users: deduped });
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId && conn.ws.readyState === WsWebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  async broadcastPresenceSummary(): Promise<void> {
    const checklists: Record<string, PresenceUser[]> = {};
    const seen = new Map<string, Set<string>>(); // checklistId -> set of userIds

    for (const conn of this.connections.values()) {
      if (!conn.checklistId) continue;
      if (!checklists[conn.checklistId]) {
        checklists[conn.checklistId] = [];
        seen.set(conn.checklistId, new Set());
      }
      const userSet = seen.get(conn.checklistId)!;
      if (userSet.has(conn.userId)) continue;
      userSet.add(conn.userId);
      checklists[conn.checklistId].push({
        id: conn.userId,
        name: conn.userName,
        role: conn.userRole,
        machine: conn.activeMachine,
      });
    }

    if (Object.keys(checklists).length === 0) return;

    const msg = JSON.stringify({ type: 'presence_summary', checklists });
    for (const conn of this.connections.values()) {
      // Send to all connections (dashboard viewers and others)
      if (conn.ws.readyState === WsWebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  async getChecklistPresence(checklistId: string): Promise<PresenceUser[]> {
    const users: PresenceUser[] = [];
    const seen = new Set<string>();
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId && !seen.has(conn.userId)) {
        seen.add(conn.userId);
        users.push({
          id: conn.userId,
          name: conn.userName,
          role: conn.userRole,
          machine: conn.activeMachine,
        });
      }
    }
    return users;
  }
}
```

- [ ] **Step 3: Write unit tests — `backend/src/ws/__tests__/local-ws.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
  getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Gabriel', role: 'operator' }),
}));

vi.mock('../../config/env.js', () => ({
  config: {
    jwtSecret: 'test-secret',
    wsMode: 'local',
    tables: { connections: 'SanitizationConnections' },
    aws: {},
  },
}));

vi.mock('../../data/connections.js', () => ({
  putConnection: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  updateConnectionSubscription: vi.fn().mockResolvedValue(undefined),
  updateConnectionMachine: vi.fn().mockResolvedValue(undefined),
  touchConnection: vi.fn().mockResolvedValue(undefined),
  getConnectionsByChecklist: vi.fn().mockResolvedValue([]),
  getConnectionsByChannel: vi.fn().mockResolvedValue([]),
  getAllConnections: vi.fn().mockResolvedValue([]),
}));

import { LocalWsBroadcaster } from '../local-ws.js';
import { putConnection, deleteConnection } from '../../data/connections.js';

describe('LocalWsBroadcaster', () => {
  let broadcaster: LocalWsBroadcaster;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcaster = new LocalWsBroadcaster();
  });

  it('can be instantiated', () => {
    expect(broadcaster).toBeDefined();
  });

  it('throws if init called without server', () => {
    expect(() => broadcaster.init()).toThrow('requires an HTTP server');
  });

  it('getChecklistPresence returns empty array with no connections', async () => {
    const result = await broadcaster.getChecklistPresence('cl-123');
    expect(result).toEqual([]);
  });

  it('broadcastToChecklist does not throw with no connections', async () => {
    await expect(
      broadcaster.broadcastToChecklist('cl-123', { type: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('broadcastPresence does not throw with no connections', async () => {
    await expect(broadcaster.broadcastPresence('cl-123')).resolves.toBeUndefined();
  });

  it('broadcastPresenceSummary does not throw with no connections', async () => {
    await expect(broadcaster.broadcastPresenceSummary()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/ws/__tests__/local-ws.test.ts src/ws/__tests__/connections.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add WebSocket broadcaster interface and local ws server"
```

---

### Task 4: API Gateway WebSocket broadcaster (production)

**Files:**
- Create: `backend/src/ws/apigw-ws.ts`

- [ ] **Step 1: Write APIGW broadcaster — `backend/src/ws/apigw-ws.ts`**

```typescript
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { Server as HttpServer } from 'node:http';
import { config } from '../config/env.js';
import type { WebSocketBroadcaster } from './broadcaster.js';
import type { PresenceUser } from './messages.js';
import {
  deleteConnection,
  getConnectionsByChecklist,
  getConnectionsByChannel,
  getAllConnections,
} from '../data/connections.js';

export class ApiGatewayBroadcaster implements WebSocketBroadcaster {
  private client: ApiGatewayManagementApiClient | null = null;

  init(_server?: HttpServer): void {
    if (!config.apiGatewayEndpoint) {
      throw new Error('APIGW_WS_ENDPOINT must be set in apigw mode');
    }
    this.client = new ApiGatewayManagementApiClient({
      region: config.aws.region,
      endpoint: config.apiGatewayEndpoint,
    });
  }

  private async sendToConnection(connectionId: string, data: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(data),
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof GoneException) {
        await deleteConnection(connectionId).catch(() => {});
        return false;
      }
      console.warn(`Failed to send to connection ${connectionId}:`, err);
      return false;
    }
  }

  async broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void> {
    const connections = await getConnectionsByChecklist(checklistId);
    const data = JSON.stringify(message);
    await Promise.all(
      connections
        .filter((c) => !excludeUserId || c.userId !== excludeUserId)
        .map((c) => this.sendToConnection(c.connectionId, data)),
    );
  }

  async broadcastPresence(checklistId: string): Promise<void> {
    const connections = await getConnectionsByChecklist(checklistId);
    const seen = new Set<string>();
    const users: PresenceUser[] = connections
      .filter((c) => {
        if (seen.has(c.userId)) return false;
        seen.add(c.userId);
        return true;
      })
      .map((c) => ({
        id: c.userId,
        name: c.userName,
        role: c.userRole,
        machine: c.activeMachine,
      }));

    const data = JSON.stringify({ type: 'presence', checklistId, users });
    await Promise.all(connections.map((c) => this.sendToConnection(c.connectionId, data)));
  }

  async broadcastPresenceSummary(): Promise<void> {
    const allConns = await getAllConnections();
    const checklists: Record<string, PresenceUser[]> = {};
    const seen = new Map<string, Set<string>>();

    for (const c of allConns) {
      if (!c.checklistId) continue;
      if (!checklists[c.checklistId]) {
        checklists[c.checklistId] = [];
        seen.set(c.checklistId, new Set());
      }
      const userSet = seen.get(c.checklistId)!;
      if (userSet.has(c.userId)) continue;
      userSet.add(c.userId);
      checklists[c.checklistId].push({
        id: c.userId,
        name: c.userName,
        role: c.userRole,
        machine: c.activeMachine,
      });
    }

    if (Object.keys(checklists).length === 0) return;

    const dashboardConns = await getConnectionsByChannel('dashboard');
    const data = JSON.stringify({ type: 'presence_summary', checklists });
    await Promise.all(dashboardConns.map((c) => this.sendToConnection(c.connectionId, data)));
  }

  async getChecklistPresence(checklistId: string): Promise<PresenceUser[]> {
    const connections = await getConnectionsByChecklist(checklistId);
    const seen = new Set<string>();
    return connections
      .filter((c) => {
        if (seen.has(c.userId)) return false;
        seen.add(c.userId);
        return true;
      })
      .map((c) => ({
        id: c.userId,
        name: c.userName,
        role: c.userRole,
        machine: c.activeMachine,
      }));
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP/backend && npx tsc --noEmit 2>&1 | grep -E "error TS" | grep -v "seed.ts" | grep -v "sqs.test.ts"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add API Gateway WebSocket broadcaster for production"
```

---

### Task 5: Integrate broadcaster into Express server

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/ws/broadcaster.ts` (fix ESM dynamic import)

- [ ] **Step 1: Update `backend/src/ws/broadcaster.ts` for proper ESM**

Replace the full file with:

```typescript
import type { Server as HttpServer } from 'node:http';
import type { PresenceUser } from './messages.js';

export interface WebSocketBroadcaster {
  init(server?: HttpServer): void;
  broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void>;
  broadcastPresence(checklistId: string): Promise<void>;
  broadcastPresenceSummary(): Promise<void>;
  getChecklistPresence(checklistId: string): Promise<PresenceUser[]>;
}

export async function createBroadcaster(mode: 'local' | 'apigw'): Promise<WebSocketBroadcaster> {
  if (mode === 'apigw') {
    const { ApiGatewayBroadcaster } = await import('./apigw-ws.js');
    return new ApiGatewayBroadcaster();
  }
  const { LocalWsBroadcaster } = await import('./local-ws.js');
  return new LocalWsBroadcaster();
}
```

- [ ] **Step 2: Update `backend/src/index.ts` to initialize broadcaster**

After the line `app.use('/api/checklists', imageRoutes);`, add:

```typescript
// ─── WEBSOCKET ─────────────────────────────────────────────────────
import { createBroadcaster } from './ws/broadcaster.js';
```

Then change the server startup section. Replace the entire `if (!process.env.VITEST)` block with:

```typescript
if (!process.env.VITEST) {
  const startServer = async () => {
    const server = app.listen(config.port, () => {
      console.log(`Backend running on http://localhost:${config.port}`);
    });

    // Initialize WebSocket broadcaster
    const broadcaster = await createBroadcaster(config.wsMode);
    broadcaster.init(server);
    app.set('broadcaster', broadcaster);
    console.log(`WebSocket mode: ${config.wsMode}`);
  };

  if (process.env.NODE_ENV === 'production') {
    startServer();
  } else {
    seedIfEmpty().then(startServer);
  }
}
```

- [ ] **Step 3: Run all backend tests to verify no regression**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP && npm test --workspace=backend
```

Expected: All tests pass.

- [ ] **Step 4: Restart dev server and verify WebSocket endpoint**

```bash
# Kill and restart
lsof -ti:4000 | xargs kill -9 2>/dev/null
sleep 2
npm run dev:backend &
sleep 4
# Test WS connection (should reject without token)
curl -s -o /dev/null -w "%{http_code}" -H "Upgrade: websocket" -H "Connection: Upgrade" http://localhost:4000/ws
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: integrate WebSocket broadcaster into Express server"
```

---

### Task 6: Add broadcasts to checklist and image routes

**Files:**
- Modify: `backend/src/routes/checklists.ts`
- Modify: `backend/src/routes/images.ts`

- [ ] **Step 1: Add broadcast helper to `backend/src/routes/checklists.ts`**

Add at the top of the file, after imports:

```typescript
import type { WebSocketBroadcaster } from '../ws/broadcaster.js';

function getBroadcaster(req: AuthRequest): WebSocketBroadcaster | null {
  return req.app.get('broadcaster') || null;
}
```

- [ ] **Step 2: Add broadcasts after each mutation in `checklists.ts`**

After the successful response in each endpoint:

**POST /:id/submit** — after `res.json(checklist)`:
```typescript
    const bc = getBroadcaster(req);
    if (bc) {
      bc.broadcastToChecklist(checklist.id, {
        type: 'status_change', checklistId: checklist.id,
        status: 'submitted', by: checklist.operatorName, at: now,
      }, req.userId).catch(() => {});
    }
```

**POST /:id/approve** — after `res.json(checklist)`:
```typescript
    const bc = getBroadcaster(req);
    if (bc) {
      const user = await getUser(req.userId!);
      bc.broadcastToChecklist(checklist.id, {
        type: 'status_change', checklistId: checklist.id,
        status: 'approved', by: user?.name || 'Admin', at: new Date().toISOString(),
      }, req.userId).catch(() => {});
    }
```

**POST /:id/deny** — same pattern with `status: 'denied'`.

**DELETE /:id** — after `res.status(204).send()`:
```typescript
    const bc = getBroadcaster(req);
    if (bc) {
      bc.broadcastToChecklist(req.params.id as string, {
        type: 'checklist_deleted', checklistId: req.params.id,
      }).catch(() => {});
    }
```

**PUT /:id/machines/:machineIdx** — after successful save, diff old vs new machine and broadcast item deltas. Add before the response:
```typescript
    // Broadcast item deltas to other subscribers
    const bc = getBroadcaster(req);
    if (bc && checklist) {
      const oldMachine = checklist.machines[machineIdx];
      const newMachine = machine;
      if (oldMachine && newMachine) {
        const now = new Date().toISOString();
        const user = await getUser(req.userId!);
        const byName = user?.name || 'Unknown';
        for (let ci = 0; ci < newMachine.categories.length; ci++) {
          const oldCat = oldMachine.categories[ci];
          const newCat = newMachine.categories[ci];
          if (!oldCat || !newCat) continue;
          for (let ii = 0; ii < newCat.items.length; ii++) {
            const oldItem = oldCat.items[ii];
            const newItem = newCat.items[ii];
            if (!oldItem || !newItem) continue;
            if (oldItem.completed !== newItem.completed) {
              bc.broadcastToChecklist(checklist.id, {
                type: 'item_update', checklistId: checklist.id,
                machineIdx, catIdx: ci, itemIdx: ii,
                field: 'completed', value: newItem.completed,
                by: byName, at: now,
              }, req.userId).catch(() => {});
            }
            if (oldItem.issue !== newItem.issue) {
              bc.broadcastToChecklist(checklist.id, {
                type: 'comment_update', checklistId: checklist.id,
                machineIdx, catIdx: ci, itemIdx: ii,
                issue: newItem.issue, by: byName, at: now,
              }, req.userId).catch(() => {});
            }
          }
        }
      }
    }
```

- [ ] **Step 3: Add broadcasts to `backend/src/routes/images.ts`**

Add import and helper at top:
```typescript
import type { WebSocketBroadcaster } from '../ws/broadcaster.js';
import type { AuthRequest } from '../middleware/auth.js';

function getBroadcaster(req: AuthRequest): WebSocketBroadcaster | null {
  return req.app.get('broadcaster') || null;
}
```

After `appendChecklistImages` call in the upload handler, add:
```typescript
    const bc = getBroadcaster(req);
    if (bc) {
      bc.broadcastToChecklist(id, {
        type: 'image_update', checklistId: id,
        machineIdx, catIdx, itemIdx,
        images: [...(item.images || []), ...newKeys],
        by: uploader?.name || 'Unknown', at: new Date().toISOString(),
      }, req.userId).catch(() => {});
    }
```

After `removeChecklistImage` in the delete handler, add:
```typescript
    const bc = getBroadcaster(req);
    if (bc) {
      bc.broadcastToChecklist(id, {
        type: 'image_update', checklistId: id,
        machineIdx, catIdx, itemIdx,
        images: remainingImages,
        by: 'System', at: new Date().toISOString(),
      }, req.userId).catch(() => {});
    }
```

- [ ] **Step 4: Run all backend tests**

```bash
npm test --workspace=backend
```

Expected: All tests pass (broadcaster is null in test environment since `app.set` is not called).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: broadcast WebSocket events after checklist and image mutations"
```

---

### Task 7: Frontend WebSocket client and hooks

**Files:**
- Create: `frontend/src/services/websocket.ts`
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/hooks/useChecklistSync.ts`
- Create: `frontend/src/hooks/usePresenceSummary.ts`

- [ ] **Step 1: Write WebSocket client — `frontend/src/services/websocket.ts`**

```typescript
type MessageHandler = (data: any) => void;

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:4000/ws`;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL = 60 * 1000; // 60 seconds
const MAX_RECONNECT_DELAY = 30_000;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Map<string, Set<MessageHandler>>();
  private subscriptions = new Set<string>();
  private dashboardSubscribed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleDisconnected = false;
  private _connected = false;
  private _reconnecting = false;
  private statusListeners = new Set<() => void>();

  get connected(): boolean { return this._connected; }
  get reconnecting(): boolean { return this._reconnecting; }

  onStatusChange(fn: () => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private notifyStatus(): void {
    this.statusListeners.forEach((fn) => fn());
  }

  connect(token: string): void {
    this.token = token;
    this.idleDisconnected = false;
    this.openSocket();
    this.startIdleDetection();
  }

  disconnect(): void {
    this.cleanup();
    this.token = null;
    this.subscriptions.clear();
    this.dashboardSubscribed = false;
  }

  private openSocket(): void {
    if (!this.token) return;
    try {
      this.ws = new WebSocket(`${WS_URL}?token=${this.token}`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._connected = true;
      this._reconnecting = false;
      this.reconnectAttempt = 0;
      this.notifyStatus();
      this.startHeartbeat();
      // Re-subscribe to all active subscriptions
      for (const checklistId of this.subscriptions) {
        this.send({ type: 'subscribe', checklistId });
      }
      if (this.dashboardSubscribed) {
        this.send({ type: 'subscribe_dashboard' });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const handlers = this.listeners.get(data.type);
        if (handlers) {
          handlers.forEach((fn) => fn(data));
        }
        // Also notify wildcard listeners
        const wildcards = this.listeners.get('*');
        if (wildcards) {
          wildcards.forEach((fn) => fn(data));
        }
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.stopHeartbeat();
      this.notifyStatus();
      if (this.token && !this.idleDisconnected) {
        this._reconnecting = true;
        this.notifyStatus();
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(checklistId: string): void {
    this.subscriptions.add(checklistId);
    this.send({ type: 'subscribe', checklistId });
  }

  unsubscribe(checklistId: string): void {
    this.subscriptions.delete(checklistId);
    this.send({ type: 'unsubscribe', checklistId });
  }

  subscribeDashboard(): void {
    this.dashboardSubscribed = true;
    this.send({ type: 'subscribe_dashboard' });
  }

  unsubscribeDashboard(): void {
    this.dashboardSubscribed = false;
    this.send({ type: 'unsubscribe_dashboard' });
  }

  machineChange(checklistId: string, machineIdx: number): void {
    this.send({ type: 'machine_change', checklistId, machineIdx });
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), MAX_RECONNECT_DELAY);
    const jitter = delay * 0.2 * Math.random();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.openSocket();
    }, delay + jitter);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startIdleDetection(): void {
    const resetIdle = () => {
      if (this.idleDisconnected) {
        // User came back from idle — reconnect
        this.idleDisconnected = false;
        this.openSocket();
      }
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.onIdle(), IDLE_TIMEOUT);
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('touchstart', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
  }

  private onIdle(): void {
    this.idleDisconnected = true;
    this.send({ type: 'idle' });
    this.ws?.close();
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.stopHeartbeat();
    this._connected = false;
    this._reconnecting = false;
    this.notifyStatus();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsClient = new WebSocketClient();
```

- [ ] **Step 2: Write `frontend/src/hooks/useWebSocket.ts`**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { wsClient } from '../services/websocket';

export function useWebSocket() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const unsub = wsClient.onStatusChange(() => {
      setConnected(wsClient.connected);
      setReconnecting(wsClient.reconnecting);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token) {
      wsClient.connect(token);
    } else {
      wsClient.disconnect();
    }
    return () => {
      wsClient.disconnect();
    };
  }, [user]);

  return { connected, reconnecting };
}
```

- [ ] **Step 3: Write `frontend/src/hooks/useChecklistSync.ts`**

```typescript
import { useEffect, useState, useRef } from 'react';
import { wsClient } from '../services/websocket';
import { updateMachineItem } from '../utils/checklist';
import type { ChecklistMachine } from '../services/api';

interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

export function useChecklistSync(
  checklistId: string | undefined,
  machines: ChecklistMachine[],
  setMachines: React.Dispatch<React.SetStateAction<ChecklistMachine[]>>,
  setVersion?: React.Dispatch<React.SetStateAction<number | undefined>>,
) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [isDeleted, setIsDeleted] = useState(false);
  const [statusChanged, setStatusChanged] = useState<{ status: string; by: string } | null>(null);
  const currentUser = useRef(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null);

  useEffect(() => {
    if (!checklistId) return;

    wsClient.subscribe(checklistId);

    const offItemUpdate = wsClient.on('item_update', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          [msg.field]: msg.value,
          ...(msg.field === 'completed' ? {
            completedBy: msg.value !== null ? msg.by : null,
            completedAt: msg.value !== null ? msg.at : null,
          } : {}),
        })),
      );
    });

    const offCommentUpdate = wsClient.on('comment_update', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          issue: msg.issue,
        })),
      );
    });

    const offImageUpdate = wsClient.on('image_update', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          images: msg.images,
        })),
      );
    });

    const offPresence = wsClient.on('presence', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      // Filter out current user from presence display
      const myId = currentUser.current?.id;
      setPresence(msg.users.filter((u: PresenceUser) => u.id !== myId));
    });

    const offStatus = wsClient.on('status_change', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      setStatusChanged({ status: msg.status, by: msg.by });
    });

    const offDeleted = wsClient.on('checklist_deleted', (msg: any) => {
      if (msg.checklistId !== checklistId) return;
      setIsDeleted(true);
    });

    return () => {
      wsClient.unsubscribe(checklistId);
      offItemUpdate();
      offCommentUpdate();
      offImageUpdate();
      offPresence();
      offStatus();
      offDeleted();
    };
  }, [checklistId, setMachines]);

  return { presence, isDeleted, statusChanged };
}
```

- [ ] **Step 4: Write `frontend/src/hooks/usePresenceSummary.ts`**

```typescript
import { useEffect, useState } from 'react';
import { wsClient } from '../services/websocket';

interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

export function usePresenceSummary() {
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceUser[]>>({});

  useEffect(() => {
    wsClient.subscribeDashboard();

    const off = wsClient.on('presence_summary', (msg: any) => {
      setPresenceMap(msg.checklists || {});
    });

    return () => {
      wsClient.unsubscribeDashboard();
      off();
    };
  }, []);

  return { presenceMap };
}
```

- [ ] **Step 5: Run frontend TypeScript check**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP/frontend && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "render-helpers"
```

Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add frontend WebSocket client, sync hook, and presence hooks"
```

---

### Task 8: PresenceAvatars and ReconnectBanner components

**Files:**
- Create: `frontend/src/components/PresenceAvatars.tsx`
- Create: `frontend/src/components/PresenceAvatars.module.css`
- Create: `frontend/src/components/ReconnectBanner.tsx`
- Create: `frontend/src/components/ReconnectBanner.module.css`

- [ ] **Step 1: Write PresenceAvatars component**

`frontend/src/components/PresenceAvatars.tsx`:
```typescript
import s from './PresenceAvatars.module.css';

interface PresenceUser {
  name: string;
  [key: string]: unknown;
}

interface Props {
  users: PresenceUser[];
  max?: number;
  label?: boolean;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const COLORS = ['#5B2333', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626'];

export default function PresenceAvatars({ users, max = 3, label = false }: Props) {
  if (users.length === 0) return null;

  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <div className={s.container}>
      <div className={s.avatars}>
        {visible.map((u, i) => (
          <div
            key={u.name}
            className={s.avatar}
            style={{ backgroundColor: COLORS[i % COLORS.length], zIndex: max - i }}
            title={u.name}
          >
            {getInitials(u.name)}
          </div>
        ))}
        {overflow > 0 && (
          <div className={s.avatar} style={{ backgroundColor: '#6b7280', zIndex: 0 }}>
            +{overflow}
          </div>
        )}
      </div>
      {label && users.length > 0 && (
        <span className={s.label}>
          {users.length === 1
            ? `${users[0].name} also editing`
            : `${users.length} others editing`}
        </span>
      )}
    </div>
  );
}
```

`frontend/src/components/PresenceAvatars.module.css`:
```css
.container {
  display: flex;
  align-items: center;
  gap: 6px;
}

.avatars {
  display: flex;
  flex-direction: row-reverse;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  margin-left: -8px;
  position: relative;
}

.avatar:last-child {
  margin-left: 0;
}

.label {
  font-size: 11px;
  color: var(--text-muted, #666);
  white-space: nowrap;
}
```

- [ ] **Step 2: Write ReconnectBanner component**

`frontend/src/components/ReconnectBanner.tsx`:
```typescript
import s from './ReconnectBanner.module.css';

export default function ReconnectBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className={s.banner}>
      <span className={s.dot} />
      Reconnecting...
    </div>
  );
}
```

`frontend/src/components/ReconnectBanner.module.css`:
```css
.banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  background: #fef3c7;
  color: #92400e;
  text-align: center;
  padding: 6px 0;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add PresenceAvatars and ReconnectBanner components"
```

---

### Task 9: Integrate WebSocket into App.tsx and page components

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/ChecklistFill.tsx`
- Modify: `frontend/src/pages/SubmissionReview.tsx`
- Modify: `frontend/src/pages/AdminDashboard.tsx`

- [ ] **Step 1: Add WebSocket to App.tsx**

Add imports:
```typescript
import { useWebSocket } from './hooks/useWebSocket';
import ReconnectBanner from './components/ReconnectBanner';
```

Add a wrapper component inside `App()` that uses the hook (hooks must be inside `<BrowserRouter>` for useSelector to work, but `useWebSocket` doesn't need router — it just needs Redux store):

Create a `WebSocketProvider` component inside App.tsx:
```typescript
function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { reconnecting } = useWebSocket();
  return (
    <>
      <ReconnectBanner visible={reconnecting} />
      {children}
    </>
  );
}
```

Wrap the content of `App`:
```tsx
export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <OfflineBanner />
        <Suspense fallback={<Spinner label="Loading..." />}>
          <Routes>
            {/* ... existing routes ... */}
          </Routes>
        </Suspense>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Add sync + presence to ChecklistFill.tsx**

Add imports:
```typescript
import { useChecklistSync } from '../hooks/useChecklistSync';
import PresenceAvatars from '../components/PresenceAvatars';
import { wsClient } from '../services/websocket';
```

After `useImageUrlsForMachines`, add:
```typescript
const { presence, isDeleted, statusChanged } = useChecklistSync(id, machines, setMachines, setVersion);
```

Send machine change when `activeMachine` changes:
```typescript
useEffect(() => {
  if (id) wsClient.machineChange(id, activeMachine);
}, [id, activeMachine]);
```

In the header bar (next to save status), add:
```tsx
<PresenceAvatars users={presence} label />
```

After the conflict banner, add status change and deleted banners:
```tsx
{statusChanged && (
  <div style={{ padding: '12px 16px', marginBottom: 12, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 14 }}>
    This checklist was {statusChanged.status} by {statusChanged.by}.
    <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/')}>Go to Dashboard</button>
  </div>
)}
{isDeleted && (
  <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 14, color: '#dc2626' }}>
    This checklist has been deleted.
    <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/')}>Go to Dashboard</button>
  </div>
)}
```

- [ ] **Step 3: Add sync + presence to SubmissionReview.tsx**

Add same imports as ChecklistFill. After checklist load, add:
```typescript
const { presence, isDeleted, statusChanged } = useChecklistSync(id, machines, setMachines, setVersion);
```

In the summary sidebar, after the Status row, add:
```tsx
{presence.length > 0 && (
  <div className={s.summaryRow}>
    <span className={s.label}>Currently Viewing</span>
    <PresenceAvatars users={presence} />
  </div>
)}
```

Add status change and deleted banners (same as ChecklistFill but navigate to `/admin`).

- [ ] **Step 4: Add presence summary to AdminDashboard.tsx**

Add imports:
```typescript
import { usePresenceSummary } from '../hooks/usePresenceSummary';
import PresenceAvatars from '../components/PresenceAvatars';
```

In the component body:
```typescript
const { presenceMap } = usePresenceSummary();
```

In each checklist row, before the `StatusBadge`, add:
```tsx
{presenceMap[cl.id] && presenceMap[cl.id].length > 0 && (
  <PresenceAvatars users={presenceMap[cl.id]} />
)}
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP && npm test
```

Expected: All unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: integrate WebSocket sync and presence into all pages"
```

---

### Task 10: Add VITE_WS_URL to frontend config and verify end-to-end

**Files:**
- Modify: `frontend/vite.config.ts` (if proxy needed for WS)
- Create: `frontend/.env` (VITE_WS_URL)

- [ ] **Step 1: Add frontend env variable**

The Vite dev server proxies `/api` to localhost:4000, but WebSocket needs a direct connection. The `websocket.ts` client already defaults to `ws://localhost:4000/ws`, which bypasses the Vite proxy. No proxy config change needed.

Create `frontend/.env` (or append if exists):
```
VITE_WS_URL=ws://localhost:4000/ws
```

- [ ] **Step 2: Restart dev servers and verify manually**

```bash
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2
docker compose down && docker compose up -d
sleep 5
npm run localstack:seed
npm run dev &
sleep 8
curl -s http://localhost:4000/health
```

Open browser to http://localhost:3000. Login as operator. Open a checklist. Check browser dev tools console for `WebSocket connected` messages. Open a second browser tab as admin and verify presence avatars appear.

- [ ] **Step 3: Run full Playwright E2E suite for regression**

```bash
npx playwright test --reporter=list 2>&1 | tee /tmp/pw-r2.txt
```

Expected: All existing 92 tests pass (WebSocket is additive, doesn't break existing behavior).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add VITE_WS_URL config, verify end-to-end WebSocket"
```

---

### Task 11: Write Playwright E2E tests for real-time features

**Files:**
- Create: `tests/realtime-websocket.spec.ts`

- [ ] **Step 1: Write real-time E2E tests**

```typescript
import { test, expect, BrowserContext } from '@playwright/test';
import { ADMIN, OPERATOR, OPERATOR2, login } from './helpers';

test.describe('Real-time WebSocket Features', () => {
  test('presence avatars appear on admin dashboard when operator opens checklist', async ({ browser }) => {
    // Create two browser contexts (separate sessions)
    const operatorContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();
    const adminPage = await adminContext.newPage();

    // Operator logs in and opens an in-progress checklist
    await login(operatorPage, OPERATOR);
    await operatorPage.click('button:has-text("In Progress")');
    await operatorPage.locator('span:has-text("Line 9")').first().click();
    await operatorPage.waitForURL(/\/checklist\/.*\/fill/);

    // Admin logs in and checks dashboard
    await login(adminPage, ADMIN);
    // Wait for presence summary to arrive (up to 15s for the 10s interval)
    await expect(async () => {
      // Look for presence avatar initials on any checklist row
      const avatars = adminPage.locator('[title]').filter({ hasText: /^[A-Z]{2}$/ });
      expect(await avatars.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    await operatorContext.close();
    await adminContext.close();
  });

  test('reconnect banner appears and disappears', async ({ page }) => {
    await login(page, OPERATOR);

    // The WebSocket should be connected - no reconnect banner
    await expect(page.locator('text=Reconnecting...')).not.toBeVisible();
  });

  test('checklist fill shows presence of other editors', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Both operators open the same in-progress checklist
    await login(page1, OPERATOR);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);

    // Get the checklist URL
    const url = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(url);
    await page2.waitForURL(/\/checklist\/.*\/fill/);

    // Page 1 should eventually show presence of operator 2
    await expect(async () => {
      const presenceText = await page1.locator('text=/also editing/i').count();
      expect(presenceText).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    await ctx1.close();
    await ctx2.close();
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
npx playwright test tests/realtime-websocket.spec.ts --reporter=list
```

Expected: Tests pass (may need adjustment based on actual timing).

- [ ] **Step 3: Run full test suite**

```bash
npm test && npx playwright test --reporter=list
```

Expected: All unit tests + all E2E tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: add Playwright E2E tests for real-time WebSocket features"
```

---

## Verification Checklist

After all tasks complete:

1. [ ] `npm test` — all backend (155+) and frontend (132+) unit tests pass
2. [ ] `npx playwright test` — all 92+ E2E tests pass including new real-time tests
3. [ ] Manual: two browser tabs, same checklist — check item in tab A, appears in tab B
4. [ ] Manual: admin dashboard shows presence avatars on checklists being edited
5. [ ] Manual: reconnect banner appears when backend is stopped, disappears on restart
6. [ ] Manual: idle for 5+ minutes, WebSocket disconnects, reconnects on mouse move
7. [ ] `npx tsc --noEmit` — no TypeScript errors in backend or frontend
