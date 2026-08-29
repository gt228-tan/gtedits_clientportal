import { API_BASE as API } from './config';

async function apiRequest(method, path, token, body) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const opts    = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Admin: create project for a client ───────────────────
export async function createProject(data, token) {
  return apiRequest('POST', '/projects', token, data);
}

// ── Admin: list all projects (optional ?firebaseClientId=) ─
export async function fetchProjects(token, firebaseClientId) {
  const qs = firebaseClientId ? `?firebaseClientId=${encodeURIComponent(firebaseClientId)}` : '';
  return apiRequest('GET', `/projects${qs}`, token);
}

// ── Admin: get single project ────────────────────────────
export async function fetchProject(projectId, token) {
  return apiRequest('GET', `/projects/${projectId}`, token);
}

// ── Admin: update project details (driveFolderUrl, title, etc) ──
export async function updateProject(projectId, data, token) {
  return apiRequest('PATCH', `/projects/${projectId}`, token, data);
}

// ── Admin: update project status ─────────────────────────
export async function updateProjectStatus(projectId, status, token) {
  return apiRequest('PATCH', `/projects/${projectId}/status`, token, { status });
}

// ── Admin: delete project ─────────────────────────────────
export async function deleteProject(projectId, token) {
  return apiRequest('DELETE', `/projects/${projectId}`, token);
}

// ── Admin: get revision requests for a project ────────────
export async function fetchRevisions(projectId, token) {
  return apiRequest('GET', `/projects/${projectId}/revisions`, token);
}


export async function sendClientPaymentReminder(clientId, token, clientData) {
  return apiRequest('POST', `/clients/${clientId}/send-payment-reminder`, token, clientData ? { clientData } : undefined);
}

export async function fetchClientProjects(token) {
  return apiRequest('GET', '/projects/client/mine', token);
}

