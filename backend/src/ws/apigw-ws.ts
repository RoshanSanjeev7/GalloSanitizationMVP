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

  async broadcastToDashboard(message: object): Promise<void> {
    const dashboardConns = await getConnectionsByChannel('dashboard');
    const data = JSON.stringify(message);
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
