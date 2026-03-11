const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function getStoredUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

async function request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${API_BASE}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
    ...options,
  };

  const res = await fetch(url, config);

  if (res.status === 204) return null as T;

  const contentType = res.headers.get('content-type');
  let data: unknown;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const msg = typeof data === 'object' && data !== null
      ? (data as Record<string, string>).message || (data as Record<string, string>).error || 'Request failed'
      : String(data);
    const error = new Error(msg) as Error & { status: number };
    error.status = res.status;
    throw error;
  }

  return data as T;
}

// ─── Auth ───────────────────────────────────────────────────────────
export interface UserPublic {
  id: string;
  name: string;
  email: string;
  role: 'operator' | 'admin';
}

interface LoginResponse {
  user: UserPublic;
  token: string;
}

async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data && data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('token', data.token);
  }
  return data;
}

function logout(): void {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}

async function getMe(): Promise<UserPublic> {
  return request<UserPublic>('/auth/me');
}

// ─── Users ──────────────────────────────────────────────────────────
async function getUsers(): Promise<UserPublic[]> {
  return request<UserPublic[]>('/users');
}

async function createUser(userData: {
  name: string;
  email: string;
  password: string;
  role: string;
}): Promise<UserPublic> {
  return request<UserPublic>('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

async function updateUserRole(id: string, role: string): Promise<UserPublic> {
  return request<UserPublic>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

async function deleteUser(id: string): Promise<void> {
  await request(`/users/${id}`, { method: 'DELETE' });
}

// ─── Lines ──────────────────────────────────────────────────────────
export interface Line {
  id: string;
  name: string;
}

async function getLines(): Promise<Line[]> {
  return request<Line[]>('/lines');
}

// ─── Templates ──────────────────────────────────────────────────────
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
  machines: MachineTemplate[];
}

async function getTemplates(): Promise<Template[]> {
  return request<Template[]>('/templates');
}

async function getTemplate(id: string): Promise<Template> {
  return request<Template>(`/templates/${id}`);
}

async function createTemplate(templateData: {
  title: string;
  lineId: string;
  machines: MachineTemplate[];
}): Promise<Template> {
  return request<Template>('/templates', {
    method: 'POST',
    body: JSON.stringify(templateData),
  });
}

async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: 'DELETE' });
}

// ─── Checklists ─────────────────────────────────────────────────────
export interface ChecklistItem {
  description: string;
  machine: string | null;
  completed: boolean | null;
  completedBy: string | null;
  completedAt: string | null;
  issue: string | null;
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
  operatorId: string;
  operatorName: string;
  status: 'in_progress' | 'submitted' | 'approved' | 'denied';
  startTime: string;
  endTime: string | null;
  machines: ChecklistMachine[];
}

async function getChecklists(params: Record<string, string> = {}): Promise<Checklist[]> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/checklists?${query}` : '/checklists';
  return request<Checklist[]>(endpoint);
}

async function getChecklist(id: string): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}`);
}

async function createChecklist(checklistData: { lineId: string }): Promise<Checklist> {
  return request<Checklist>('/checklists', {
    method: 'POST',
    body: JSON.stringify(checklistData),
  });
}

async function updateChecklistItems(
  id: string,
  machines: ChecklistMachine[]
): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ machines }),
  });
}

async function submitChecklist(id: string): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}/submit`, { method: 'POST' });
}

async function approveChecklist(id: string): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}/approve`, { method: 'POST' });
}

async function denyChecklist(id: string): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}/deny`, { method: 'POST' });
}

async function deleteChecklist(id: string): Promise<void> {
  await request(`/checklists/${id}`, { method: 'DELETE' });
}

const api = {
  login,
  logout,
  getMe,
  getStoredUser,
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
  getLines,
  getTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  getChecklists,
  getChecklist,
  createChecklist,
  updateChecklistItems,
  submitChecklist,
  approveChecklist,
  denyChecklist,
  deleteChecklist,
};

export default api;
