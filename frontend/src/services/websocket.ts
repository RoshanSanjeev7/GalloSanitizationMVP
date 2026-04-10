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
