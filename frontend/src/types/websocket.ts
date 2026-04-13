export interface ItemUpdateMessage {
  type: 'item_update';
  checklistId: string;
  machineIdx: number;
  catIdx: number;
  itemIdx: number;
  completed?: boolean | null;
  completedBy?: string | null;
  completedAt?: string | null;
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

export interface PresenceMessage {
  type: 'presence';
  checklistId: string;
  users: PresenceUser[];
}

export interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

export interface StatusChangeMessage {
  type: 'status_change';
  checklistId: string;
  status: string;
  by: string;
  at: string;
}

export interface ChecklistDeletedMessage {
  type: 'checklist_deleted';
  checklistId: string;
}

export interface PresenceSummaryMessage {
  type: 'presence_summary';
  checklists: Record<string, PresenceUser[]>;
}

export interface NewSubmissionMessage {
  type: 'new_submission';
  checklistId: string;
  lineName: string;
  operatorName: string;
  submittedAt: string;
}

export type ServerMessage =
  | ItemUpdateMessage
  | CommentUpdateMessage
  | ImageUpdateMessage
  | PresenceMessage
  | StatusChangeMessage
  | ChecklistDeletedMessage
  | PresenceSummaryMessage
  | NewSubmissionMessage;
