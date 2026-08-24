const API_BASE = '/api';

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  return res.json();
}

export async function fetchDailySummary() {
  const res = await fetch(`${API_BASE}/dashboard/daily-summary`);
  return res.json();
}

export async function fetchAuditLogs() {
  const res = await fetch(`${API_BASE}/dashboard/audit-logs`);
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/dashboard/settings`);
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${API_BASE}/dashboard/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  return res.json();
}

export async function fetchMembers(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/members?${query}`);
  return res.json();
}

export async function fetchMemberDetails(id) {
  const res = await fetch(`${API_BASE}/members/${id}`);
  return res.json();
}

export async function createMember(data) {
  const res = await fetch(`${API_BASE}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateMemberStatus(id, status, reason) {
  const res = await fetch(`${API_BASE}/members/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason })
  });
  return res.json();
}

export async function fetchQrSession() {
  const res = await fetch(`${API_BASE}/attendance/qr-session`);
  return res.json();
}

export async function performCheckIn(data) {
  const res = await fetch(`${API_BASE}/attendance/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchAttendanceHistory(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/attendance/history?${query}`);
  return res.json();
}

export async function fetchRedList(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/red-list?${query}`);
  return res.json();
}

export async function recordFollowUp(data) {
  const res = await fetch(`${API_BASE}/red-list/follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function triggerNoShowScan() {
  const res = await fetch(`${API_BASE}/red-list/scan`, { method: 'POST' });
  return res.json();
}

export async function fetchExpiringRenewals(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/renewals/expiring?${query}`);
  return res.json();
}

export async function fetchRenewalOffers(memberId) {
  const res = await fetch(`${API_BASE}/renewals/offers/${memberId}`);
  return res.json();
}

export async function processRenewalPayment(data) {
  const res = await fetch(`${API_BASE}/renewals/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function triggerRenewalScan() {
  const res = await fetch(`${API_BASE}/renewals/scan`, { method: 'POST' });
  return res.json();
}

export async function fetchReceipt(paymentId) {
  const res = await fetch(`${API_BASE}/receipts/renewal/${paymentId}`);
  return res.json();
}

export async function fetchAddOns(type) {
  const res = await fetch(`${API_BASE}/addons${type ? `?type=${type}` : ''}`);
  return res.json();
}

export async function purchaseAddOn(data) {
  const res = await fetch(`${API_BASE}/addons/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function logPtUsage(data) {
  const res = await fetch(`${API_BASE}/addons/log-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchActiveAddonOrders() {
  const res = await fetch(`${API_BASE}/addons/active-orders`);
  return res.json();
}

export async function fetchPlans() {
  const res = await fetch(`${API_BASE}/plans`);
  return res.json();
}
