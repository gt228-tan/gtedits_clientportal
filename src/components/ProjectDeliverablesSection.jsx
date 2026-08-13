import { useState, useEffect, useCallback } from 'react';
import { showToast } from './Toast';
import DeliverableCard         from './DeliverableCard';
import DeliverableUploadModal  from './DeliverableUploadModal';
import DeliverablePreviewModal from './DeliverablePreviewModal';
import { fetchProjectDeliverables, downloadDeliverable } from '../api/deliverables';

export default function ProjectDeliverablesSection({ project, token, isAdmin = false }) {
  const [deliverables,  setDeliverables]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showUpload,    setShowUpload]    = useState(false);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [downloading,   setDownloading]   = useState(false);

  const loadDeliverables = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectDeliverables(project._id, token);
      setDeliverables(data);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setLoading(false);
    }
  }, [project._id, token]);

  useEffect(() => { loadDeliverables(); }, [loadDeliverables]);

  const handleDownload = async (d) => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadDeliverable(d._id, d.originalFileName, token);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setDownloading(false);
    }
  };

  // Latest deliverable (non-superseded)
  const latest = deliverables.find(d => d.status !== 'superseded');
  const history = deliverables.filter(d => d.status === 'superseded');

  return (
    <div className="dlv-section">
      {/* Section header */}
      <div className="dlv-section-header">
        <h3 className="dlv-section-title">📦 Deliverables</h3>
        {isAdmin && (
          <button className="btn-add-dlv" onClick={() => setShowUpload(true)}>
            ＋ Add Deliverable
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="dlv-empty">
          <div className="spinner" />
          <p>Loading deliverables…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && deliverables.length === 0 && (
        <div className="dlv-empty">
          <div className="empty-icon">📭</div>
          <p>No deliverables yet.</p>
          {isAdmin && (
            <button className="btn-add-dlv" onClick={() => setShowUpload(true)}>
              ＋ Add First Deliverable
            </button>
          )}
        </div>
      )}

      {/* Latest deliverable */}
      {!loading && latest && (
        <div className="dlv-latest-wrap">
          <div className="dlv-section-group-label">LATEST</div>
          <DeliverableCard
            deliverable={latest}
            token={token}
            isAdmin={isAdmin}
            onPreview={setPreviewTarget}
            onDownload={handleDownload}
            onDeleted={loadDeliverables}
          />
        </div>
      )}

      {/* Version history */}
      {!loading && history.length > 0 && (
        <details className="dlv-history">
          <summary className="dlv-history-toggle">
            Previous Deliverables ({history.length})
          </summary>
          <div className="dlv-history-list">
            {history.map(d => (
              <DeliverableCard
                key={d._id}
                deliverable={d}
                token={token}
                isAdmin={isAdmin}
                isSuperseded
                onPreview={setPreviewTarget}
                onDownload={handleDownload}
                onDeleted={loadDeliverables}
              />
            ))}
          </div>
        </details>
      )}

      {/* Upload modal */}
      {showUpload && (
        <DeliverableUploadModal
          projectId={project._id}
          token={token}
          onClose={() => setShowUpload(false)}
          onUploaded={loadDeliverables}
        />
      )}

      {/* Preview modal */}
      {previewTarget && (
        <DeliverablePreviewModal
          deliverable={previewTarget}
          token={token}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
