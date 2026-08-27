import { useState } from 'react';
import { showToast } from './Toast';
import { deleteDeliverable, toggleDeliverableDownload, sendPaymentReminder } from '../api/deliverables';

const STATUS_CONFIG = {
  awaiting_approval:  { label: 'Awaiting Client Approval', color: 'amber',  icon: '🟡' },
  approved:           { label: 'Approved',                  color: 'green',  icon: '✅' },
  revision_requested: { label: 'Revision Requested',        color: 'red',    icon: '🔴' },
  superseded:         { label: 'Superseded',                color: 'muted',  icon: '⚫' },
  draft:              { label: 'Draft',                     color: 'muted',  icon: '⚪' },
};

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024)          return `${b} B`;
  if (b < 1024 * 1024)   return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DeliverableCard({
  deliverable,
  token,
  onPreview,
  onDownload,
  onDeleted,
  isAdmin = false,
  isSuperseded = false,
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [allowed, setAllowed]   = useState(deliverable.allowDownload !== false);
  const cfg = STATUS_CONFIG[deliverable.status] || STATUS_CONFIG.draft;

  const handleDelete = async () => {
    if (!confirm(`Delete "${deliverable.name}" (v${deliverable.version})? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDeliverable(deliverable._id, token);
      showToast('🗑️ Deliverable deleted');
      onDeleted?.();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
      setDeleting(false);
    }
  };

  const handleToggleDownload = async () => {
    setToggling(true);
    try {
      const nextState = !allowed;
      await toggleDeliverableDownload(deliverable._id, nextState, token);
      setAllowed(nextState);
      showToast(`Client download ${nextState ? 'enabled 🔓' : 'disabled 🔒'}`);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setToggling(false);
    }
  };

  const handlePaymentReminder = async () => {
    if (!confirm(`Send payment reminder email with remaining payment invoice attachment to client for "${deliverable.name}"?`)) return;
    setSendingReminder(true);
    try {
      const res = await sendPaymentReminder(deliverable._id, token);
      showToast(`📧 ${res.message || 'Payment reminder sent successfully!'}`);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setSendingReminder(false);
    }
  };


  return (
    <div className={`dlv-card ${isSuperseded ? 'dlv-card--superseded' : ''}`}>
      {/* Header row */}
      <div className="dlv-card-header">
        <div className="dlv-card-title-row">
          <span className="dlv-card-name">{deliverable.name}</span>
          <span className={`dlv-version-chip version-chip--${cfg.color}`}>
            Version {deliverable.version}
          </span>
        </div>
        <span className={`dlv-status-badge dlv-status--${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Meta row */}
      <div className="dlv-card-meta">
        <span className="dlv-meta-item">
          <span className="dlv-meta-label">Type</span>
          <span className="dlv-meta-value">
            {deliverable.type === 'file' ? '📁 File' : '🔗 External Link'}
          </span>
        </span>

        {deliverable.type === 'file' && (
          <>
            <span className="dlv-meta-item">
              <span className="dlv-meta-label">File</span>
              <span className="dlv-meta-value dlv-filename">{deliverable.originalFileName}</span>
            </span>
            {deliverable.fileSize && (
              <span className="dlv-meta-item">
                <span className="dlv-meta-label">Size</span>
                <span className="dlv-meta-value">{formatBytes(deliverable.fileSize)}</span>
              </span>
            )}
          </>
        )}

        <span className="dlv-meta-item">
          <span className="dlv-meta-label">Uploaded</span>
          <span className="dlv-meta-value">{formatDate(deliverable.createdAt)}</span>
        </span>
      </div>

      {/* Description */}
      {deliverable.description && (
        <p className="dlv-card-desc">{deliverable.description}</p>
      )}

      {/* Actions */}
      <div className="dlv-card-actions">
        {deliverable.type === 'file' && (
          <>
            <button
              className="dlv-btn dlv-btn--outline"
              onClick={() => onPreview?.(deliverable)}
            >
              👁 Preview
            </button>
            <button
              className="dlv-btn dlv-btn--primary"
              onClick={() => onDownload?.(deliverable)}
            >
              ⬇ Download
            </button>
          </>
        )}

        {deliverable.type === 'link' && (
          <a
            href={deliverable.url}
            target="_blank"
            rel="noopener noreferrer"
            className="dlv-btn dlv-btn--primary"
          >
            🔗 Open Link
          </a>
        )}

        {isAdmin && deliverable.type === 'file' && (
          <button
            className={`dlv-btn ${allowed ? 'dlv-btn--toggle-allowed' : 'dlv-btn--toggle-blocked'}`}
            onClick={handleToggleDownload}
            disabled={toggling}
            title="Toggle whether client can download this deliverable file"
          >
            {toggling ? '…' : allowed ? '🔓 Download Allowed' : '🔒 Download Blocked'}
          </button>
        )}



        {isAdmin && (
          <button
            className="dlv-btn dlv-btn--danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? '…' : '🗑️ Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

