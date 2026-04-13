import type { Request } from 'express';
import type { WebSocketBroadcaster } from '../ws/broadcaster.js';

export function getBroadcaster(req: Request): WebSocketBroadcaster | null {
  return req.app.get('broadcaster') || null;
}
