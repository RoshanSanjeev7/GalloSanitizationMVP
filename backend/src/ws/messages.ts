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

export interface NewSubmissionMessage {
  type: 'new_submission';
  checklistId: string;
  lineName: string;
  operatorName: string;
  submittedAt: string;
}

export interface DashboardRefreshMessage {
  type: 'dashboard_refresh';
  reason: string;
  checklistId: string;
  status: string;
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
  | ErrorMessage
  | NewSubmissionMessage
  | DashboardRefreshMessage;

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
