/**
 * WebSocket wire-format message types.
 *
 * This file is the single source of truth for every frame that moves over
 * the `/ws` connection in either direction. Every concrete message is a
 * discriminated union member keyed by its `type` string, so callers can
 * narrow with a simple `switch (msg.type)`.
 *
 * Field conventions:
 *   - `checklistId` / `machineIdx` / `catIdx` / `itemIdx` identify a specific
 *     cell in the checklist grid (checklist → machine → category → item).
 *   - `by` is the userId of the actor; `at` is an ISO-8601 timestamp.
 *   - These shapes are mirrored on the frontend — changes here require a
 *     matching frontend update.
 */

// ─── Client → Server Messages ───────────────────────────────────────
// Frames the browser sends to the backend. All client messages are routed
// through `LocalWsBroadcaster.handleMessage` (local mode) or the equivalent
// API Gateway handler (production).

/** Client started viewing a specific checklist and wants live updates for it. */
export interface SubscribeMessage {
  type: 'subscribe';
  checklistId: string;
}

/** Client stopped viewing a checklist (e.g. navigated away). */
export interface UnsubscribeMessage {
  type: 'unsubscribe';
  checklistId: string;
}

/**
 * Client switched focus to a different machine within the same checklist.
 * Used to drive the "who is working on which machine" presence indicator.
 */
export interface MachineChangeMessage {
  type: 'machine_change';
  checklistId: string;
  machineIdx: number;
}

/** Client wants to receive dashboard-level events (new submissions, etc). */
export interface SubscribeDashboardMessage {
  type: 'subscribe_dashboard';
}

/** Client no longer wants dashboard events. */
export interface UnsubscribeDashboardMessage {
  type: 'unsubscribe_dashboard';
}

/**
 * Periodic keep-alive. Server uses it to refresh the connection's TTL in
 * DynamoDB so idle-but-alive clients are not swept by the expiry reaper.
 */
export interface HeartbeatMessage {
  type: 'heartbeat';
}

/**
 * Client has gone idle and will close the socket itself.
 * Acts as a hint — no server-side state change is required.
 */
export interface IdleMessage {
  type: 'idle';
}

/** Discriminated union of every legal client → server frame. */
export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | MachineChangeMessage
  | SubscribeDashboardMessage
  | UnsubscribeDashboardMessage
  | HeartbeatMessage
  | IdleMessage;

// ─── Server → Client Messages ───────────────────────────────────────
// Frames the backend pushes to browsers. Every mutation that changes
// shared checklist state has a corresponding server message so other
// viewers can render the update without polling.

/**
 * A single field on a checklist item changed (checkbox toggled, completedBy
 * updated, etc). Granular rather than whole-item so concurrent edits on
 * different fields don't clobber each other on the receiving side.
 */
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

/**
 * An operator added/edited/cleared the "issue" note on an item.
 * `issue === null` means the note was removed.
 */
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

/**
 * The set of uploaded photo S3 keys attached to an item changed.
 * Full array is sent (not a delta) so receivers replace their local copy.
 */
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

/** Checklist moved to a new workflow state (submitted / approved / denied). */
export interface StatusChangeMessage {
  type: 'status_change';
  checklistId: string;
  status: 'submitted' | 'approved' | 'denied';
  by: string;
  at: string;
}

/** An admin deleted a checklist; viewers should close/redirect. */
export interface ChecklistDeletedMessage {
  type: 'checklist_deleted';
  checklistId: string;
}

/**
 * One user present in a checklist view.
 * `machine` is the machine index they are currently focused on, or null if
 * they haven't focused a machine yet.
 */
export interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

/** Full list of users currently viewing a given checklist. */
export interface PresenceMessage {
  type: 'presence';
  checklistId: string;
  users: PresenceUser[];
}

/**
 * Aggregated "who is where" map for the admin dashboard, keyed by
 * checklistId. Sent periodically and on presence changes.
 */
export interface PresenceSummaryMessage {
  type: 'presence_summary';
  checklists: Record<string, PresenceUser[]>;
}

/**
 * Handshake confirmation sent immediately after a successful JWT auth.
 * Tells the client which connectionId the server assigned.
 */
export interface ConnectedMessage {
  type: 'connected';
  userId: string;
  connectionId: string;
}

/**
 * Server-side error surfaced to the client.
 *
 * `code` is a stable machine-readable tag the client can branch on
 * (e.g. show a "you're going too fast" toast for `RATE_LIMITED` vs.
 * a logout for `TOKEN_EXPIRED`). `message` stays as the human-readable
 * fallback for older clients that don't recognize a given code.
 *
 * `retryAfterMs` is populated for transient errors (rate limiting) so the
 * client can back off intelligently instead of guessing.
 */
export interface ErrorMessage {
  type: 'error';
  message: string;
  code?:
    | 'INVALID_JSON'
    | 'INVALID_PAYLOAD'
    | 'UNKNOWN_TYPE'
    | 'RATE_LIMITED'
    | 'TOKEN_EXPIRED'
    | 'TOO_MANY_STRIKES';
  retryAfterMs?: number;
}

/**
 * Server is restarting; clients should reconnect after `reconnectAfterMs`.
 * Sent to every connection right before SIGTERM-driven shutdown so the
 * frontend can avoid a thundering-herd reconnect storm and show a friendly
 * "reconnecting..." UI instead of an error toast.
 */
export interface ServerShutdownMessage {
  type: 'server_shutdown';
  reconnectAfterMs: number;
}

/** An operator submitted a checklist — admins on the dashboard should react. */
export interface NewSubmissionMessage {
  type: 'new_submission';
  checklistId: string;
  lineName: string;
  operatorName: string;
  submittedAt: string;
}

/**
 * Generic "something changed, refetch" nudge for the dashboard when a
 * granular message type would be overkill or ambiguous. `reason` is a
 * free-form tag for logging/debugging.
 */
export interface DashboardRefreshMessage {
  type: 'dashboard_refresh';
  reason: string;
  checklistId: string;
  status: string;
}

/** Discriminated union of every legal server → client frame. */
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
  | ServerShutdownMessage
  | NewSubmissionMessage
  | DashboardRefreshMessage;

// ─── Connection Record ──────────────────────────────────────────────
/**
 * Persisted shape of a WebSocket connection, stored in the
 * SanitizationConnections DynamoDB table.
 *
 * Mirrored by both the local `ws`-based broadcaster and the production
 * API Gateway broadcaster so any code that reads the table works the
 * same in either environment.
 *
 * Lifecycle:
 *   - Written on connect (`putConnection`).
 *   - Updated on `subscribe` / `machine_change` / `heartbeat`.
 *   - Deleted on socket close; `ttl` is the backstop if close is missed.
 */
export interface ConnectionRecord {
  connectionId: string;
  userId: string;
  userName: string;
  userRole: string;
  // null while the user is on the dashboard rather than inside a specific checklist.
  checklistId: string | null;
  // null when no machine is focused yet within the current checklist.
  activeMachine: number | null;
  // Logical channel the client is subscribed to — 'dashboard' for overview
  // viewers, or 'checklist:<id>' for checklist-specific subscribers.
  channel: string; // 'dashboard' | 'checklist:<id>'
  connectedAt: string;
  lastActivity: string;
  // Unix epoch seconds. DynamoDB auto-deletes records past this time so
  // dropped connections don't leak if we miss the close event.
  ttl: number;
}
