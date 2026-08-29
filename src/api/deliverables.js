import { API_BASE as API } from './config';

// ── Helper ─────────────────────────────────────────────────
async function apiRequest(method, path, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  const opts = { method, headers };

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body; // Let browser set multipart boundary
  }

  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || res.statusText);
  }
  return res.json();
}

// ── Admin: Upload file deliverable (Direct Google Drive Upload with progress) ──
export async function uploadFileDeliverable(projectId, formData, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/projects/${projectId}/deliverables/file`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ message: 'Uploaded successfully' });
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || xhr.statusText));
        } catch {
          reject(new Error(xhr.statusText || 'Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network upload error'));
    xhr.send(formData);
  });
}

// ── Admin: Add link deliverable ────────────────────────────
export async function uploadLinkDeliverable(projectId, data, token) {
  return apiRequest('POST', `/projects/${projectId}/deliverables/link`, token, data);
}

// ── Admin: List all deliverables for a project ─────────────
export async function fetchProjectDeliverables(projectId, token) {
  return apiRequest('GET', `/projects/${projectId}/deliverables`, token);
}

// ── Admin: Get single deliverable ─────────────────────────
export async function fetchDeliverable(deliverableId, token) {
  return apiRequest('GET', `/deliverables/${deliverableId}`, token);
}

// ── Admin: Delete deliverable ─────────────────────────────
export async function deleteDeliverable(deliverableId, token) {
  return apiRequest('DELETE', `/deliverables/${deliverableId}`, token);
}

// ── Admin: Toggle client download permission ──────────────
export async function toggleDeliverableDownload(deliverableId, allowDownload, token) {
  return apiRequest('PATCH', `/deliverables/${deliverableId}/toggle-download`, token, { allowDownload });
}

// ── Admin: Send payment reminder email with invoice attachment ──
export async function sendPaymentReminder(deliverableId, token, pdfBase64) {
  return apiRequest('POST', `/deliverables/${deliverableId}/send-payment-reminder`, token, { pdfBase64 });
}


// ── Client: List deliverables for own project ─────────────
export async function fetchClientDeliverables(projectId, token) {
  return apiRequest('GET', `/client/projects/${projectId}/deliverables`, token);
}

// ── Client: Approve deliverable ───────────────────────────
export async function approveDeliverable(deliverableId, token) {
  return apiRequest('POST', `/deliverables/${deliverableId}/approve`, token);
}

// ── Client: Request revision ──────────────────────────────
export async function requestRevision(deliverableId, data, token) {
  return apiRequest('POST', `/deliverables/${deliverableId}/request-revision`, token, data);
}

// ── Download URL (authenticated via token in query string is
//    not ideal; we redirect to the endpoint and let fetch handle it) ─
export function getDownloadUrl(deliverableId) {
  return `${API}/deliverables/${deliverableId}/download`;
}

export function getPreviewUrl(deliverableId) {
  return `${API}/deliverables/${deliverableId}/preview`;
}

// ── Trigger a file download with auth header ──────────────
export async function downloadDeliverable(deliverableId, fileName, token) {
  const res = await fetch(`${API}/deliverables/${deliverableId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Download failed');

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Fetch a preview blob URL ──────────────────────────────
export async function fetchPreviewBlobUrl(deliverableId, token) {
  const res = await fetch(`${API}/deliverables/${deliverableId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Preview failed');
  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), mimeType: blob.type };
}
