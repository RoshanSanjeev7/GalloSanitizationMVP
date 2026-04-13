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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Check if the JWT is expiring within 10 minutes and refresh proactively. */
let refreshPromise: Promise<void> | null = null;

async function refreshTokenIfNeeded(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    if (expiresAt - Date.now() > 30 * 60 * 1000) return; // More than 30min left
  } catch {
    return;
  }

  // Prevent concurrent refreshes
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch {
      // Refresh failed — let the next request handle 401
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Retry wrapper for GET requests with exponential backoff (1s, 2s, 4s). */
async function requestWithRetry<T = unknown>(endpoint: string, options: RequestInit = {}, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await request<T>(endpoint, options);
    } catch (err: unknown) {
      // Don't retry aborted requests
      if (err instanceof Error && err.name === 'AbortError') throw err;
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      const isRetryable = !status || status >= 500;
      const isLast = attempt === maxRetries - 1;
      if (!isRetryable || isLast) throw err;
      await delay(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

async function request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Proactively refresh token if expiring soon (skip for refresh endpoint itself)
  if (!endpoint.includes('/auth/refresh')) {
    await refreshTokenIfNeeded();
  }
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
  return requestWithRetry<UserPublic>('/auth/me');
}

// ─── Users ──────────────────────────────────────────────────────────
async function getUsers(): Promise<UserPublic[]> {
  const data = await requestWithRetry<{ items: UserPublic[]; total: number; hasMore: boolean }>('/users');
  return data.items;
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
  return requestWithRetry<Line[]>('/lines');
}

async function createLine(name: string): Promise<Line> {
  return request<Line>('/lines', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
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
  createdAt?: string;
  updatedAt?: string;
}

async function getTemplates(): Promise<Template[]> {
  return requestWithRetry<Template[]>('/templates');
}

async function getTemplate(id: string): Promise<Template> {
  return requestWithRetry<Template>(`/templates/${id}`);
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

async function updateTemplate(id: string, data: { title?: string; lineId?: string; machines?: MachineTemplate[] }): Promise<Template> {
  return request<Template>(`/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
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
  operatorId: string;
  operatorName: string;
  status: 'in_progress' | 'submitted' | 'approved' | 'denied';
  startTime: string;
  endTime: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  version: number;
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

export interface ChecklistResponse {
  items: Checklist[];
  total: number;
  hasMore: boolean;
}

async function getChecklists(params: Record<string, string> = {}, signal?: AbortSignal): Promise<ChecklistResponse> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/checklists?${query}` : '/checklists';
  return requestWithRetry<ChecklistResponse>(endpoint, signal ? { signal } : {});
}

async function getNotifications(params: Record<string, string> = {}): Promise<ChecklistResponse & { unviewedCount: number }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/checklists/notifications?${query}` : '/checklists/notifications';
  return requestWithRetry<ChecklistResponse & { unviewedCount: number }>(endpoint);
}

async function getChecklist(id: string): Promise<Checklist> {
  return requestWithRetry<Checklist>(`/checklists/${id}`);
}

async function createChecklist(checklistData: { lineId: string }): Promise<Checklist> {
  return request<Checklist>('/checklists', {
    method: 'POST',
    body: JSON.stringify(checklistData),
  });
}

async function updateChecklistItems(
  id: string,
  machines: ChecklistMachine[],
  version?: number,
): Promise<Checklist> {
  return request<Checklist>(`/checklists/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ machines, ...(version !== undefined ? { version } : {}) }),
  });
}

async function updateChecklistMachine(
  id: string,
  machineIdx: number,
  machine: ChecklistMachine,
  version?: number,
): Promise<{ version: number }> {
  return request<{ version: number }>(`/checklists/${id}/machines/${machineIdx}`, {
    method: 'PUT',
    body: JSON.stringify({ machine, ...(version !== undefined ? { version } : {}) }),
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

// ─── Images ────────────────────────────────────────────────────────
async function uploadImages(
  checklistId: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
  files: File[],
): Promise<{ images: string[] }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('machineIdx', String(machineIdx));
  formData.append('catIdx', String(catIdx));
  formData.append('itemIdx', String(itemIdx));
  files.forEach((file) => formData.append('images', file));

  const res = await fetch(`${API_BASE}/checklists/${checklistId}/images`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Upload failed');
  }

  return res.json();
}

async function getImageUrl(checklistId: string, key: string): Promise<string> {
  const data = await request<{ url: string }>(`/checklists/${checklistId}/images/${key}`);
  return data.url;
}

async function getImageUrls(checklistId: string, keys: string[]): Promise<Record<string, string>> {
  const data = await request<{ urls: Record<string, string> }>(`/checklists/${checklistId}/image-urls`, {
    method: 'POST',
    body: JSON.stringify({ keys }),
  });
  return data.urls;
}

async function deleteImage(
  checklistId: string,
  key: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
): Promise<{ images: string[] }> {
  return request<{ images: string[] }>(`/checklists/${checklistId}/images`, {
    method: 'DELETE',
    body: JSON.stringify({ key, machineIdx, catIdx, itemIdx }),
  });
}

async function markAllViewed(): Promise<{ marked: number }> {
  return request<{ marked: number }>('/checklists/mark-all-viewed', { method: 'POST' });
}

// ─── Audit ─────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  timestamp: string;
}

export interface AuditResponse {
  items: AuditEntry[];
  total: number;
  hasMore: boolean;
}

async function getAuditLogs(params: Record<string, string> = {}): Promise<AuditResponse> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/audit?${query}` : '/audit';
  return requestWithRetry<AuditResponse>(endpoint);
}

async function downloadChecklistPdf(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/checklists/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error('Failed to download PDF');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `checklist-${id.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
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
  createLine,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getChecklists,
  getNotifications,
  getChecklist,
  createChecklist,
  updateChecklistItems,
  updateChecklistMachine,
  submitChecklist,
  approveChecklist,
  denyChecklist,
  deleteChecklist,
  uploadImages,
  getImageUrl,
  getImageUrls,
  deleteImage,
  downloadChecklistPdf,
  markAllViewed,
  getAuditLogs,
};

export default api;
