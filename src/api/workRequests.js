import { API_BASE } from './config';

const BASE = `${API_BASE}/work-requests`;

/** Client: submit a new work request */
export async function submitWorkRequest(data) {
  const res = await fetch(BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to submit request');
  }
  return res.json();
}

/** Client: fetch their own requests */
export async function fetchClientRequests(clientId) {
  const res = await fetch(`${BASE}/client/${clientId}`);
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

/** Admin: fetch all requests, optionally filtered by status */
export async function fetchAllRequests(status = '') {
  const url = status ? `${BASE}?status=${status}` : BASE;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

/** Admin: update status + optional adminNote */
export async function updateRequestStatus(id, status, adminNote = '') {
  const res = await fetch(`${BASE}/${id}/status`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status, adminNote }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update status');
  }
  return res.json();
}

/** Admin: update entire request scope/fields */
export async function updateWorkRequest(id, data) {
  const res = await fetch(`${BASE}/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update request');
  }
  return res.json();
}

/** Admin: delete a request */
export async function deleteRequest(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete request');
  return res.json();
}

/** Client: Call Gemini AI Planner endpoint to analyze brief and generate plan */
export async function analyzeWorkPrompt({ prompt, clarifications = [], clientName = '' }) {
  const res = await fetch(`${API_BASE}/ai-planner/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt, clarifications, clientName }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to analyze request with AI');
  }
  return data;
}

