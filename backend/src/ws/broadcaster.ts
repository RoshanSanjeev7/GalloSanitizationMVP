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
