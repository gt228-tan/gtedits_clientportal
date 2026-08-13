import { useState, useEffect } from 'react';
import { fetchPreviewBlobUrl, downloadDeliverable } from '../api/deliverables';
import { showToast } from './Toast';

// File types the browser can natively render
const PREVIEWABLE_IMAGES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const PREVIEWABLE_VIDEO  = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const PREVIEWABLE_PDF    = ['application/pdf'];

function canPreview(mimeType) {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return (
    PREVIEWABLE_IMAGES.some(t => m === t) ||
    PREVIEWABLE_VIDEO.some(t => m === t) ||
    PREVIEWABLE_PDF.some(t => m === t)
  );
}

function getPreviewType(mimeType) {
  if (!mimeType) return 'unsupported';
  const m = mimeType.toLowerCase();
  if (PREVIEWABLE_IMAGES.some(t => m === t)) return 'image';
  if (PREVIEWABLE_VIDEO.some(t => m === t))  return 'video';
  if (PREVIEWABLE_PDF.some(t => m === t))    return 'pdf';
  return 'unsupported';
}

export default function DeliverablePreviewModal({ deliverable, token, onClose }) {
  const [blobUrl,     setBlobUrl]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [downloading, setDownloading] = useState(false);

  const previewable  = canPreview(deliverable.mimeType);
  const previewType  = getPreviewType(deliverable.mimeType);

  useEffect(() => {
    if (!previewable) { setLoading(false); return; }

    let revoked = false;
    fetchPreviewBlobUrl(deliverable._id, token)
      .then(({ blobUrl: url }) => {
        if (!revoked) setBlobUrl(url);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [deliverable._id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (deliverable.allowDownload === false) {
      showToast('🔒 Download is disabled by Admin for this deliverable', 'warn');
      return;
    }
    setDownloading(true);
    try {
      await downloadDeliverable(deliverable._id, deliverable.originalFileName, token);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="modal-card dlv-preview-modal">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">👁 Preview</h2>
            <p className="modal-sub">{deliverable.name} · Version {deliverable.version}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {deliverable.allowDownload !== false ? (
              <button
                className="dlv-btn dlv-btn--primary"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? 'Downloading…' : '⬇ Download'}
              </button>
            ) : (
              <button
                className="dlv-btn dlv-btn--disabled"
                disabled
                title="Download disabled by Admin"
                style={{ background: '#f1f5f9', color: '#94a3b8', border: '1px solid #cbd5e1', cursor: 'not-allowed' }}
              >
                🔒 Download Disabled
              </button>
            )}
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Preview area */}
        <div className="dlv-preview-body" onContextMenu={e => e.preventDefault()}>
          {loading && (
            <div className="dlv-preview-loading">
              <div className="spinner" />
              <p>Loading preview…</p>
            </div>
          )}

          {!loading && error && (
            <div className="dlv-preview-unsupported">
              <span className="dlv-unsupported-icon">⚠️</span>
              <p>Failed to load preview: {error}</p>
              {deliverable.allowDownload !== false && (
                <button className="dlv-btn dlv-btn--primary" onClick={handleDownload}>
                  ⬇ Download File
                </button>
              )}
            </div>
          )}

          {!loading && !error && !previewable && (
            <div className="dlv-preview-unsupported">
              <span className="dlv-unsupported-icon">📄</span>
              <p className="dlv-unsupported-title">Preview unavailable</p>
              <p className="dlv-unsupported-sub">
                This file type ({deliverable.mimeType || 'unknown'}) cannot be previewed in the browser.
              </p>
              {deliverable.allowDownload !== false && (
                <button className="dlv-btn dlv-btn--primary" onClick={handleDownload} disabled={downloading}>
                  {downloading ? 'Downloading…' : '⬇ Download File'}
                </button>
              )}
            </div>
          )}

          {!loading && !error && blobUrl && previewType === 'image' && (
            <div className="dlv-preview-image-wrap" onContextMenu={e => e.preventDefault()}>
              <img
                src={blobUrl}
                alt={deliverable.name}
                className="dlv-preview-image"
                onContextMenu={e => e.preventDefault()}
                onDragStart={e => e.preventDefault()}
                style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
              />
            </div>
          )}

          {!loading && !error && blobUrl && previewType === 'video' && (
            <div className="dlv-preview-video-wrap" onContextMenu={e => e.preventDefault()}>
              <video
                src={blobUrl}
                controls
                controlsList="nodownload"
                className="dlv-preview-video"
                autoPlay={false}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
          )}

          {!loading && !error && blobUrl && previewType === 'pdf' && (
            <iframe
              src={blobUrl}
              title={deliverable.name}
              className="dlv-preview-pdf"
            />
          )}
        </div>
      </div>
    </div>
  );
}

