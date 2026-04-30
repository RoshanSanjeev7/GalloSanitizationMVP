// In dev, leave as '/api' so Vite's proxy forwards to the backend on
// localhost:4000. In production builds, set VITE_API_BASE at build time
// to the absolute API Gateway URL — the SPA is served from a different
// origin (S3 / CloudFront) than the API, so relative paths can't reach it.
const API_BASE = import.meta.env.VITE_API_BASE
  ? `${(import.meta.env.VITE_API_BASE as string).replace(/\/$/, '')}/api`
  : '/api';

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
  factoryIds?: string[];
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

// ─── Factories ─────────────────────────────────────────────────────
export interface Factory {
  id: string;
  name: string;
  location: string;
}

async function getFactories(): Promise<Factory[]> {
  return requestWithRetry<Factory[]>('/factories');
}

async function createFactory(data: { name: string; location: string }): Promise<Factory> {
  return request<Factory>('/factories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function deleteFactory(id: string): Promise<void> {
  await request(`/factories/${id}`, { method: 'DELETE' });
}

async function updateUserFactories(userId: string, factoryIds: string[]): Promise<UserPublic> {
  return request<UserPublic>(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ factoryIds }),
  });
}

// ─── Lines ──────────────────────────────────────────────────────────
export interface Line {
  id: string;
  name: string;
  factoryId?: string;
}

async function getLines(): Promise<Line[]> {
  return requestWithRetry<Line[]>('/lines');
}

async function createLine(name: string, factoryId?: string): Promise<Line> {
  return request<Line>('/lines', {
    method: 'POST',
    body: JSON.stringify({ name, factoryId }),
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
  published: boolean;
  machines: MachineTemplate[];
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string | null;
}

async function getTemplates(params: Record<string, string> = {}): Promise<Template[]> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/templates?${query}` : '/templates';
  return requestWithRetry<Template[]>(endpoint);
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

async function publishTemplate(id: string, published: boolean): Promise<Template> {
  return request<Template>(`/templates/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ published }),
  });
}

async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: 'DELETE' });
}

async function restoreTemplate(id: string): Promise<Template> {
  return request<Template>(`/templates/${id}/restore`, { method: 'POST' });
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
/**
 * Upload images for a checklist item using the presigned-URL flow:
 *   1. POST /presign with file metadata → server returns one presigned
 *      PUT URL per file.
 *   2. PUT each file directly to S3 against its URL (no auth header —
 *      the signature embeds the auth, and bytes never touch the API).
 *   3. POST /finalize with the keys → server validates ownership,
 *      atomically appends them to the checklist record, broadcasts WS.
 *
 * If the new path fails (older backend without /presign, network issue
 * with S3 directly), fall back to the legacy multipart endpoint so users
 * never see a hard failure during the rollout.
 */
async function uploadImages(
  checklistId: string,
  machineIdx: number,
  catIdx: number,
  itemIdx: number,
  files: File[],
): Promise<{ images: string[] }> {
  const token = getToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    // Phase 1: presign.
    const presignRes = await fetch(`${API_BASE}/checklists/${checklistId}/images/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        machineIdx,
        catIdx,
        itemIdx,
        files: files.map((f) => ({ name: f.name, mimeType: f.type, size: f.size })),
      }),
    });
    if (!presignRes.ok) {
      // 404 means an older backend without the new route; explicitly
      // fall through. Any other failure (400, 403) is a real validation
      // error and shouldn't be papered over with a slow fallback.
      if (presignRes.status === 404) throw new Error('PRESIGN_NOT_AVAILABLE');
      const data = await presignRes.json().catch(() => ({}));
      throw new Error(data.error || 'Upload presign failed');
    }
    const { uploads } = (await presignRes.json()) as {
      uploads: { key: string; putUrl: string; contentType: string }[];
    };
    if (uploads.length !== files.length) {
      throw new Error('Presign response did not match file count');
    }

    // Phase 2: PUT each file straight to S3. Run in parallel for speed.
    await Promise.all(
      uploads.map((u, i) => {
        const file = files[i];
        if (!file) throw new Error('File array shrank during upload');
        return fetch(u.putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': u.contentType },
          body: file,
        }).then((r) => {
          if (!r.ok) throw new Error(`S3 upload failed for ${file.name}`);
        });
      }),
    );

    // Phase 3: finalize.
    const finalizeRes = await fetch(`${API_BASE}/checklists/${checklistId}/images/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        machineIdx,
        catIdx,
        itemIdx,
        keys: uploads.map((u) => u.key),
      }),
    });
    if (!finalizeRes.ok) {
      const data = await finalizeRes.json().catch(() => ({}));
      throw new Error(data.error || 'Upload finalize failed');
    }
    return finalizeRes.json();
  } catch (err) {
    // Fallback: legacy multipart endpoint. Triggered for "presign not
    // available" specifically; a real validation failure already threw.
    if (!(err instanceof Error) || err.message !== 'PRESIGN_NOT_AVAILABLE') throw err;

    const formData = new FormData();
    formData.append('machineIdx', String(machineIdx));
    formData.append('catIdx', String(catIdx));
    formData.append('itemIdx', String(itemIdx));
    files.forEach((file) => formData.append('images', file));

    const res = await fetch(`${API_BASE}/checklists/${checklistId}/images`, {
      method: 'POST',
      headers: { ...authHeader },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }
    return res.json();
  }
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

// PDF download moved client-side. Use `downloadChecklistPdf` from
// `frontend/src/utils/pdf.ts` directly — it takes a Checklist object
// and triggers a browser download with no server round-trip.

const api = {
  login,
  logout,
  getMe,
  getStoredUser,
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
  getFactories,
  createFactory,
  deleteFactory,
  updateUserFactories,
  getLines,
  createLine,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  publishTemplate,
  deleteTemplate,
  restoreTemplate,
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
  markAllViewed,
  getAuditLogs,
};

export default api;
