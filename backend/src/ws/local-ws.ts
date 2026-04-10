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
