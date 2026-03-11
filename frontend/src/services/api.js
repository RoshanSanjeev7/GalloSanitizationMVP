const API_BASE = "http://127.0.0.1:5000/api";

// Helper to get stored user
const getStoredUser = () => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
};

// Helper for fetch with common options
const request = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(url, config);

  // If response is 204 No Content, return null
  if (res.status === 204) return null;

  // Try to parse JSON, fall back to text
  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const error = new Error(typeof data === 'object' ? (data.message || data.error || 'Request failed') : data);
    error.status = res.status;
    throw error;
  }

  return data;
};

// ─── Auth ───────────────────────────────────────────────────────────
const login = async (email, password) => {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data && data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
  }
  return data;
};

const logout = () => {
  localStorage.removeItem('user');
};

const getMe = async () => {
  const data = await request('/auth/me');
  return data;
};

// ─── Users ──────────────────────────────────────────────────────────
const getUsers = async () => {
  const data = await request('/users');
  return data;
};

const createUser = async (userData) => {
  const data = await request('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  return data;
};

const updateUserRole = async (id, role) => {
  const data = await request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
  return data;
};

const deleteUser = async (id) => {
  const data = await request(`/users/${id}`, {
    method: 'DELETE',
  });
  return data;
};

// ─── Lines ──────────────────────────────────────────────────────────
const getLines = async () => {
  const data = await request('/lines');
  return data;
};

// ─── Templates ──────────────────────────────────────────────────────
const getTemplates = async () => {
  const data = await request('/templates');
  return data;
};

const getTemplate = async (id) => {
  const data = await request(`/templates/${id}`);
  return data;
};

const createTemplate = async (templateData) => {
  const data = await request('/templates', {
    method: 'POST',
    body: JSON.stringify(templateData),
  });
  return data;
};

const deleteTemplate = async (id) => {
  const data = await request(`/templates/${id}`, {
    method: 'DELETE',
  });
  return data;
};

// ─── Checklists ─────────────────────────────────────────────────────
const getChecklists = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/checklists?${query}` : '/checklists';
  const data = await request(endpoint);
  return data;
};

const getChecklist = async (id) => {
  const data = await request(`/checklists/${id}`);
  return data;
};

const createChecklist = async (checklistData) => {
  const data = await request('/checklists', {
    method: 'POST',
    body: JSON.stringify(checklistData),
  });
  return data;
};

const updateChecklistItems = async (id, items) => {
  const data = await request(`/checklists/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
  return data;
};

const submitChecklist = async (id) => {
  const data = await request(`/checklists/${id}/submit`, {
    method: 'POST',
  });
  return data;
};

const approveChecklist = async (id) => {
  const data = await request(`/checklists/${id}/approve`, {
    method: 'POST',
  });
  return data;
};

const denyChecklist = async (id) => {
  const data = await request(`/checklists/${id}/deny`, {
    method: 'POST',
  });
  return data;
};

const deleteChecklist = async (id) => {
  const data = await request(`/checklists/${id}`, {
    method: 'DELETE',
  });
  return data;
};

const api = {
  // Auth
  login,
  logout,
  getMe,
  getStoredUser,
  // Users
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
  // Lines
  getLines,
  // Templates
  getTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  // Checklists
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
