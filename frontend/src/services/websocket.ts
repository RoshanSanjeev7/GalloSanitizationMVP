import type { ServerMessage } from '../types/websocket';

type MessageHandler = (data: ServerMessage) => void;
type FrameDirection = 'in' | 'out';
type FrameTap = (dir: FrameDirection, msg: unknown) => void;

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
  private frameTaps = new Set<FrameTap>();
  /**
   * When the server announces a graceful shutdown it includes a
   * `reconnectAfterMs` hint. We honor it on the very next reconnect so
   * every client doesn't slam the new server at the same instant —
   * straight exponential backoff would still produce a thundering-herd
   * because every connection started from `reconnectAttempt = 0`.
   * Cleared after one use; subsequent reconnects use normal backoff.
   */
  private nextReconnectDelayHintMs: number | null = null;

  get connected(): boolean { return this._connected; }
  get reconnecting(): boolean { return this._reconnecting; }

  onStatusChange(fn: () => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private notifyStatus(): void {
    this.statusListeners.forEach((fn) => fn());
  }

  // Debug tap: fires for every frame in either direction. Used by WsDebugPanel.
  onFrame(fn: FrameTap): () => void {
    this.frameTaps.add(fn);
    return () => { this.frameTaps.delete(fn); };
  }

  private tap(dir: FrameDirection, msg: unknown): void {
    if (this.frameTaps.size === 0) return;
    this.frameTaps.forEach((fn) => { try { fn(dir, msg); } catch { /* ignore tap errors */ } });
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
        this.tap('in', data);
        // ── Server shutdown hint ─────────────────────────────────
        // Stash the requested delay BEFORE running listeners; the
        // socket will close right after this message and `onclose`
        // will pick it up to schedule the next reconnect.
        if (data.type === 'server_shutdown' && typeof data.reconnectAfterMs === 'number') {
          // Add a small random jitter on top of the hinted delay so
          // 100 clients don't all reconnect at exactly hint-ms.
          const jitter = Math.floor(Math.random() * 2000);
          this.nextReconnectDelayHintMs = data.reconnectAfterMs + jitter;
        }
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
      this.tap('out', msg);
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
    let waitMs: number;
    if (this.nextReconnectDelayHintMs !== null) {
      // Server gave us an explicit hint (graceful shutdown). Respect it
      // verbatim and reset the exponential-backoff counter so a normal
      // restart doesn't compound into a long wait.
      waitMs = this.nextReconnectDelayHintMs;
      this.nextReconnectDelayHintMs = null;
      this.reconnectAttempt = 0;
    } else {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), MAX_RECONNECT_DELAY);
      const jitter = delay * 0.2 * Math.random();
      waitMs = delay + jitter;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.openSocket();
    }, waitMs);
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
