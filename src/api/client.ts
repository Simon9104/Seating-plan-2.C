import type { AdminSummary, AuditEntry, PublicSeating, SeatingState } from '../../shared/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (method !== 'GET' && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...options, method, headers, credentials: 'same-origin' });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export interface LoginResult {
  admin: { username: string; displayName: string };
  csrfToken: string;
}

export const api = {
  getSeating: () => request<PublicSeating>('/seating'),

  login: (username: string, password: string) =>
    request<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<LoginResult>('/auth/me'),

  getState: () => request<SeatingState>('/admin/state'),
  updateRoster: (index: number, value: string) =>
    request<SeatingState>('/admin/roster', { method: 'POST', body: JSON.stringify({ index, value }) }),
  toggleLock: () => request<SeatingState>('/admin/roster/lock', { method: 'POST' }),
  shuffle: () => request<SeatingState>('/admin/shuffle', { method: 'POST' }),
  rotate: () => request<SeatingState>('/admin/rotate', { method: 'POST' }),
  clearHistory: () => request<SeatingState>('/admin/clear-history', { method: 'POST' }),
  saveDefault: () => request<SeatingState>('/admin/default/save', { method: 'POST' }),
  resetDefault: () => request<SeatingState>('/admin/default/reset', { method: 'POST' }),
  addRule: (name: string, table: number, seat: string) =>
    request<SeatingState>('/admin/rules', { method: 'POST', body: JSON.stringify({ name, table, seat }) }),
  removeRule: (id: number) => request<SeatingState>(`/admin/rules/${id}`, { method: 'DELETE' }),
  addAvoidPair: (a: string, b: string) =>
    request<SeatingState>('/admin/avoid-pairs', { method: 'POST', body: JSON.stringify({ a, b }) }),
  removeAvoidPair: (id: number) => request<SeatingState>(`/admin/avoid-pairs/${id}`, { method: 'DELETE' }),
  restoreHistory: (id: number) => request<SeatingState>(`/admin/history/${id}/restore`, { method: 'POST' }),
  swapSeats: (from: number, to: number) =>
    request<SeatingState>('/admin/seats/swap', { method: 'POST', body: JSON.stringify({ from, to }) }),

  auditLog: (limit: number, offset: number) =>
    request<{ entries: AuditEntry[] }>(`/admin/audit-log?limit=${limit}&offset=${offset}`),
  listAdmins: () => request<{ admins: AdminSummary[] }>('/admin/admins'),
  createAdmin: (payload: { username: string; displayName: string; password: string; currentPassword: string }) =>
    request<{ ok: true }>('/admin/admins', { method: 'POST', body: JSON.stringify(payload) }),
  removeAdmin: (username: string) =>
    request<void>(`/admin/admins/${encodeURIComponent(username)}`, { method: 'DELETE' })
};
