const BOT_API = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('session_token');
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BOT_API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────
export async function requestOtp(chatId: string) {
  return apiFetch('/web-api/auth/request-otp', {
    method: 'POST', body: JSON.stringify({ chatId }),
  });
}

export async function verifyOtp(chatId: string, otp: string) {
  const data = await apiFetch('/web-api/auth/verify-otp', {
    method: 'POST', body: JSON.stringify({ chatId, otp }),
  });
  if (data.token) localStorage.setItem('session_token', data.token);
  if (data.user)  localStorage.setItem('user_info', JSON.stringify(data.user));
  return data;
}

export async function logout() {
  try { await apiFetch('/web-api/auth/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('session_token');
  localStorage.removeItem('user_info');
}

export async function getMe() {
  return apiFetch('/web-api/auth/me');
}

// ── Orders ────────────────────────────────────────────────────
export async function getOrders() {
  return apiFetch('/web-api/orders');
}

export async function addOrder(code: string, name?: string, partner?: string) {
  return apiFetch('/web-api/orders', {
    method: 'POST', body: JSON.stringify({ code, name, partner }),
  });
}

export async function renameOrder(code: string, name: string) {
  return apiFetch(`/web-api/orders/${encodeURIComponent(code)}`, {
    method: 'PUT', body: JSON.stringify({ name }),
  });
}

export async function deleteOrder(code: string) {
  return apiFetch(`/web-api/orders/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

// ── Balance ───────────────────────────────────────────────────
export async function getBalance() {
  return apiFetch('/web-api/balance');
}

// ── API Keys ──────────────────────────────────────────────────
export async function getApiKeys() {
  return apiFetch('/web-api/api-keys');
}

export async function createApiKey(label?: string) {
  return apiFetch('/web-api/api-keys', {
    method: 'POST', body: JSON.stringify({ label }),
  });
}

export async function deleteApiKey(keyPrefix: string) {
  return apiFetch(`/web-api/api-keys/${keyPrefix}`, { method: 'DELETE' });
}

export async function resetApiKeys() {
  return apiFetch('/web-api/api-keys/reset', { method: 'POST' });
}
