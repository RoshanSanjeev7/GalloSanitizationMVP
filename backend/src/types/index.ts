export interface Factory {
  id: string;
  name: string;
  location: string;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'operator' | 'admin';
  factoryIds?: string[];
}

export interface Line {
  id: string;
  name: string;
  factoryId?: string;
}

export interface TaskTemplate {
  description: string;
  machine: string | null;
}

export interface CategoryTemplate {
  name: string;
  tasks: TaskTemplate[];
}

export interface MachineTemplate {
  name: string;
  categories: CategoryTemplate[];
}

export interface Template {
  id: string;
  title: string;
  lineId: string;
  published: boolean;
  machines: MachineTemplate[];
  deleted?: boolean;
  deletedAt?: string | null;
  deleteTtl?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistItem {
  description: string;
  machine: string | null;
  completed: boolean | null;
  completedBy: string | null;
  completedAt: string | null;
  issue: string | null;
  images: string[];
}

export interface ChecklistCategory {
  name: string;
  items: ChecklistItem[];
}

export interface ChecklistMachine {
  name: string;
  categories: ChecklistCategory[];
}

export interface Checklist {
  id: string;
  templateId: string;
  lineId: string;
  lineName: string;
  factoryId?: string;
  operatorId: string;
  operatorName: string;
  status: 'in_progress' | 'submitted' | 'approved' | 'denied';
  startTime: string;
  endTime: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  version: number;
  pdfKey?: string;
  pdfGeneratedAt?: string | null;
  viewedAt?: string | null;
  viewedBy?: string | null;
  activities?: Activity[];
  machines: ChecklistMachine[];
}

export interface Activity {
  type: 'comment' | 'image' | 'submit' | 'created';
  by: string;
  at: string;
  detail?: string;
}

export type UserPublic = Omit<User, 'password'>;
