const API_BASE = '/api';
const SESSION_KEY = 'samrat_staff_session';

function readStorage(storage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || !session?.expiresAt || !session?.user) return null;
    return session;
  } catch {
    return null;
  }
}

export function getStoredSession() {
  return readStorage(sessionStorage) || readStorage(localStorage);
}

export function storeSession(authPayload, rememberMe) {
  const session = {
    token: authPayload.token,
    expiresAt: authPayload.expiresAt,
    user: authPayload.user,
    rememberMe: Boolean(rememberMe)
  };
  clearStoredSession();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearStoredSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

function emitUnauthorized(code = 'AUTH_REQUIRED') {
  window.dispatchEvent(new CustomEvent('samrat:unauthorized', { detail: { code } }));
}

async function apiRequest(path, options = {}) {
  const { auth = true, suppressAuthEvent = false, ...fetchOptions } = options;
  const session = getStoredSession();

  if (auth && session && Date.parse(session.expiresAt) <= Date.now()) {
    clearStoredSession();
    if (!suppressAuthEvent) emitUnauthorized('SESSION_EXPIRED');
    return { success: false, error: 'Your session has expired.', code: 'SESSION_EXPIRED' };
  }

  const headers = new Headers(fetchOptions.headers || {});
  // A string body (e.g. CSV text) keeps whatever Content-Type the caller set.
  if (fetchOptions.body && !headers.has('Content-Type') && typeof fetchOptions.body !== 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (auth && session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  let data;
  try {
    data = await response.json();
  } catch {
    data = { success: false, error: 'The server returned an invalid response.' };
  }

  if (response.status === 401 && auth && !suppressAuthEvent) {
    clearStoredSession();
    emitUnauthorized(data.code || 'AUTH_REQUIRED');
  }
  return { ...data, httpStatus: response.status };
}

async function apiTextRequest(path, options = {}) {
  const { auth = true, suppressAuthEvent = false, ...fetchOptions } = options;
  const session = getStoredSession();

  if (auth && session && Date.parse(session.expiresAt) <= Date.now()) {
    clearStoredSession();
    if (!suppressAuthEvent) emitUnauthorized('SESSION_EXPIRED');
    return { success: false, error: 'Your session has expired.', code: 'SESSION_EXPIRED' };
  }

  const headers = new Headers(fetchOptions.headers || {});
  if (auth && session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  const text = await response.text();
  if (!response.ok) {
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON error body */ }
    return { success: false, error: parsed?.error || 'The server returned an error.', httpStatus: response.status };
  }
  return { success: true, text, httpStatus: response.status };
}

export async function loginUser({ username, password, rememberMe }) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    auth: false,
    suppressAuthEvent: true,
    body: JSON.stringify({ username, password, rememberMe })
  });
  if (result.success) storeSession(result, rememberMe);
  return result;
}

export async function requestForgotPassword(identifier) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    auth: false,
    suppressAuthEvent: true,
    body: JSON.stringify({ identifier })
  });
}

export async function fetchCurrentUser() {
  return apiRequest('/auth/me');
}

export async function logoutUser() {
  try {
    return await apiRequest('/auth/logout', { method: 'POST', suppressAuthEvent: true });
  } finally {
    clearStoredSession();
  }
}

export async function logoutAllSessions() {
  const result = await apiRequest('/auth/logout-all', { method: 'POST' });
  if (result.success) clearStoredSession();
  return result;
}

export async function changePassword(currentPassword, newPassword) {
  return apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function fetchStats() {
  return apiRequest('/dashboard/stats');
}

export async function fetchDailySummary() {
  return apiRequest('/dashboard/daily-summary');
}

export async function fetchAuditLogs() {
  return apiRequest('/dashboard/audit-logs');
}

export async function fetchSettings() {
  return apiRequest('/dashboard/settings');
}

export async function updateSettings(settings) {
  return apiRequest('/dashboard/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export async function fetchMembers(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
  return apiRequest(`/members${query ? `?${query}` : ''}`);
}

export async function fetchMemberDetails(id) {
  return apiRequest(`/members/${id}`);
}

export async function createMember(data) {
  return apiRequest('/members', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMemberStatus(id, status, reason) {
  return apiRequest(`/members/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason })
  });
}

export async function fetchMemberImportTemplate() {
  return apiTextRequest('/members/import/sample');
}

export async function previewMemberImport(csv, duplicateMode = 'update') {
  return apiRequest('/members/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv, duplicateMode })
  });
}

export async function importMembersFromCsv(csv, duplicateMode = 'update') {
  return apiRequest('/members/import', {
    method: 'POST',
    body: JSON.stringify({ csv, duplicateMode })
  });
}

export async function fetchQrSession() {
  return apiRequest('/attendance/qr-session');
}

export async function performCheckIn(data) {
  return apiRequest('/attendance/check-in', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchAttendanceHistory(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiRequest(`/attendance/history${query ? `?${query}` : ''}`);
}

export async function fetchRedList(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
  return apiRequest(`/red-list${query ? `?${query}` : ''}`);
}

export async function recordFollowUp(data) {
  return apiRequest('/red-list/follow-up', { method: 'POST', body: JSON.stringify(data) });
}

export async function triggerNoShowScan() {
  return apiRequest('/red-list/scan', { method: 'POST' });
}

export async function fetchExpiringRenewals(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiRequest(`/renewals/expiring${query ? `?${query}` : ''}`);
}

export async function fetchRenewalOffers(memberId) {
  return apiRequest(`/renewals/offers/${memberId}`);
}

export async function processRenewalPayment(data) {
  return apiRequest('/renewals/process', { method: 'POST', body: JSON.stringify(data) });
}

export async function triggerRenewalScan() {
  return apiRequest('/renewals/scan', { method: 'POST' });
}

export async function fetchReceipt(paymentId) {
  return apiRequest(`/receipts/renewal/${paymentId}`);
}

export async function fetchAddOns(type) {
  return apiRequest(`/addons${type ? `?type=${encodeURIComponent(type)}` : ''}`);
}

export async function purchaseAddOn(data) {
  return apiRequest('/addons/purchase', { method: 'POST', body: JSON.stringify(data) });
}

export async function logPtUsage(data) {
  return apiRequest('/addons/log-usage', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchActiveAddonOrders() {
  return apiRequest('/addons/active-orders');
}

export async function fetchPlans() {
  return apiRequest('/plans');
}

export async function fetchStaffUsers() {
  return apiRequest('/users');
}

export async function createStaffUser(data) {
  return apiRequest('/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStaffUser(id, data) {
  return apiRequest(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function resetStaffPassword(id, password) {
  return apiRequest(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
}
