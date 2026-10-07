import { useState, useEffect } from 'react';
import { fetchAllRequests, updateRequestStatus, updateWorkRequest, deleteRequest } from '../api/workRequests';
import { showToast } from './Toast';

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected', 'Revision'];

const STATUS_BADGE = {
  Pending: { emoji: '🕐', cls: 'wr-badge-pending' },
  Approved: { emoji: '✅', cls: 'wr-badge-approved' },
  Rejected: { emoji: '❌', cls: 'wr-badge-rejected' },
  Revision: { emoji: '🔄', cls: 'wr-badge-revision' },
};

export const FREQUENT_REJECT_REASONS = [
  {
    id: 'budget_schedule',
    title: 'Budget / Schedule Mismatch',
    line1: 'The proposed budget or deadline does not match our scope for this project.',
    line2: 'Please re-submit with revised timeframe or reach out to adjust project scope.'
  },
  {
    id: 'incomplete_brief',
    title: 'Incomplete Materials / Brief',
    line1: 'Required media assets, drive links, or project guidelines are missing.',
    line2: 'Kindly re-submit with complete assets and details so we can re-evaluate.'
  },
  {
    id: 'capacity_full',
    title: 'Schedule Fully Booked',
    line1: 'Our editing team is currently at full capacity for the requested dates.',
    line2: 'Please select a later deadline or check back for upcoming open slots.'
  }
];

export default function WorkRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // request being reviewed
  const [rejectingModal, setRejectingModal] = useState(null); // request being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // ── Edit Scope State (Step 6 in newiddea.txt) ───────────────────
  const [editingScope, setEditingScope] = useState(false);
  const [scopeForm, setScopeForm] = useState({
    title: '',
    budget: '',
    deadline: '',
    remarks: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAllRequests();
      setRequests(data);
    } catch {
      showToast('❌ Failed to load requests', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = tab === 'All'
    ? requests
    : requests.filter(r => r.status === tab);

  const handleAction = async (status, reqObj = selected, customNote = note) => {
    const target = reqObj || selected;
    if (!target) return;
    setBusy(true);
    try {
      await updateRequestStatus(target._id, status, customNote);
      showToast(status === 'Approved' ? '🎉 Marked as Approved & Project Created!' : `✅ Marked as ${status}`);
      setSelected(null);
      setEditingScope(false);
      setRejectingModal(null);
      setRejectReason('');
      setNote('');
      load();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };

  const openRejectModal = (reqObj) => {
    setRejectingModal(reqObj);
    setRejectReason(reqObj.adminNote || '');
  };

  const handleOpenReview = (r) => {
    setSelected(r);
    setNote(r.adminNote || '');
    setEditingScope(false);
    setScopeForm({
      title: r.title || '',
      budget: r.budget ? String(r.budget) : '0',
      deadline: r.deadline ? new Date(r.deadline).toISOString().split('T')[0] : '',
      remarks: r.remarks || '',
    });
  };

  const handleSaveScopeEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await updateWorkRequest(selected._id, {
        title: scopeForm.title.trim(),
        budget: Number(scopeForm.budget) || 0,
        deadline: scopeForm.deadline,
        remarks: scopeForm.remarks.trim(),
      });
      setSelected(updated);
      setEditingScope(false);
      showToast('💾 Scope details updated!');
      load();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this work request?')) return;
    try {
      await deleteRequest(id);
      showToast('🗑️ Deleted');
      load();
    } catch {
      showToast('❌ Delete failed', 'warn');
    }
  };

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  return (
    <section className="admin-section">
      <div className="wr-panel-header">
        <h2 className="section-title">
          📨 Work Requests
          {pendingCount > 0 && (
            <span className="wr-notif-badge">{pendingCount}</span>
          )}
        </h2>
        <button className="wr-refresh-btn" onClick={load} title="Refresh">🔄</button>
      </div>

      {/* Status filter tabs */}
      <div className="wr-tabs">
        {STATUS_TABS.map(t => (
          <button
            key={t}
            className={`wr-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Pending' && pendingCount > 0 && (
              <span className="wr-tab-count">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div className="work-empty"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="work-empty">
            <div className="empty-icon">📭</div>
            <p>No {tab === 'All' ? '' : tab.toLowerCase() + ' '}requests yet.</p>
          </div>
        ) : (
          <table className="work-table wr-admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Title</th>
                <th>Category</th>
                <th>Type</th>
                <th>Game / Platform</th>
                <th>Budget</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.Pending;
                return (
                  <tr key={r._id}>
                    <td className="col-num" data-label="#">{i + 1}</td>
                    <td data-label="Client">{r.clientName}</td>
                    <td data-label="Title">
                      <strong className="wr-title-text">{r.title || '—'}</strong>
                      {r.aiGenerated && (
                        <div style={{ marginTop: '2px' }}>
                          <span className="ai-confidence-chip" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            ✨ AI ({r.aiConfidence || 94}%)
                          </span>
                        </div>
                      )}
                    </td>
                    <td data-label="Category">
                      <span className={`wr-cat-chip ${r.category === 'Gaming' ? 'chip-gaming' : 'chip-other'}`}>
                        {r.category === 'Gaming' ? '🎮' : '🎬'} {r.category}
                      </span>
                    </td>
                    <td data-label="Type">{r.type}</td>
                    <td className="text-muted" data-label="Game / Platform">
                      {r.gameName || r.specifications?.platform || '—'}
                    </td>
                    <td data-label="Budget">₹{Number(r.budget).toLocaleString('en-IN')}</td>
                    <td data-label="Deadline">{new Date(r.deadline).toLocaleDateString('en-IN')}</td>
                    <td data-label="Status">
                      <span className={`wr-status-badge ${badge.cls}`}>
                        {badge.emoji} {r.status}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div className="wr-action-btns">
                        <button
                          type="button"
                          className="wr-btn-pill wr-btn-pill-view"
                          onClick={() => handleOpenReview(r)}
                          title="Review"
                        >
                          👁
                        </button>
                        {r.status !== 'Rejected' && (
                          <button
                            type="button"
                            className="wr-btn-pill wr-btn-pill-reject"
                            onClick={() => openRejectModal(r)}
                            title="Reject Request"
                          >
                            ✕
                          </button>
                        )}
                        <button
                          type="button"
                          className="wr-btn-pill wr-btn-pill-del"
                          onClick={() => handleDelete(r._id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail / Review Modal (Steps 6 & 7 in newiddea.txt) ── */}
      {selected && !rejectingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="wr-detail-modal">
            <div className="wr-modal-header">
              <div>
                <h2 className="wr-modal-title">
                  {selected.aiGenerated ? '✨ AI-Assisted Work Request' : '📋 Request Detail'}
                </h2>
                <p className="wr-modal-sub">Client: <strong>{selected.clientName}</strong></p>
              </div>
              <button className="wr-close-btn" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* AI Highlight Banner */}
            {selected.aiGenerated && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                    🤖 Gemini AI Summary
                  </span>
                  <span className="ai-confidence-chip">
                    ✨ {selected.aiConfidence || 94}% AI Confidence
                  </span>
                </div>
                {selected.aiOriginalPrompt && (
                  <p style={{ margin: '4px 0', fontSize: '0.84rem', color: '#14532d', fontStyle: 'italic' }}>
                    "{selected.aiOriginalPrompt}"
                  </p>
                )}
              </div>
            )}

            {!editingScope ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 1. Project Overview Card */}
                <div className="wr-modal-card">
                  {selected.title && (
                    <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                      <span className="wr-detail-label">Project Title</span>
                      <h3 className="wr-detail-title" style={{ fontSize: '1.15rem', fontWeight: 800, margin: '4px 0 0' }}>
                        📌 {selected.title}
                      </h3>
                    </div>
                  )}

                  <div className="wr-detail-grid">
                    <div className="wr-detail-item">
                      <span className="wr-detail-label">Category</span>
                      <span>{selected.category === 'Gaming' ? '🎮' : '🎬'} {selected.category}</span>
                    </div>

                    <div className="wr-detail-item">
                      <span className="wr-detail-label">Type & Quantity</span>
                      <span>{selected.quantity || 1} × {selected.type}</span>
                    </div>

                    <div className="wr-detail-item">
                      <span className="wr-detail-label">Budget</span>
                      <span style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>
                        ₹{Number(selected.budget).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="wr-detail-item">
                      <span className="wr-detail-label">Deadline</span>
                      <span>{new Date(selected.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>

                    <div className="wr-detail-item wr-detail-full">
                      <span className="wr-detail-label">Current Status</span>
                      <div style={{ marginTop: '2px' }}>
                        <span className={`wr-status-badge ${STATUS_BADGE[selected.status]?.cls}`}>
                          {STATUS_BADGE[selected.status]?.emoji} {selected.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. AI Specifications */}
                {selected.aiGenerated && selected.specifications && (
                  <div className="wr-modal-card">
                    <span className="wr-section-label">⚙️ Specifications</span>
                    <div className="ai-specs-grid">
                      {selected.specifications.duration && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Duration</span>
                          <span className="ai-spec-pill-val">{selected.specifications.duration}</span>
                        </div>
                      )}
                      {selected.specifications.style && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Style</span>
                          <span className="ai-spec-pill-val">{selected.specifications.style}</span>
                        </div>
                      )}
                      {selected.specifications.platform && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Platform</span>
                          <span className="ai-spec-pill-val">{selected.specifications.platform}</span>
                        </div>
                      )}
                      <div className="ai-spec-pill">
                        <span className="ai-spec-pill-label">Subtitles</span>
                        <span className="ai-spec-pill-val">{selected.specifications.subtitles ? 'Yes (Included)' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Deliverables Breakdown */}
                {selected.deliverablesList && selected.deliverablesList.length > 0 && (
                  <div className="wr-modal-card">
                    <span className="wr-section-label">📦 Deliverables ({selected.deliverablesList.length} Items)</span>
                    <div className="ai-deliverables-list">
                      {selected.deliverablesList.map((d, idx) => (
                        <div key={idx} className="ai-deliverable-item">
                          <span>🎬 {d.name}</span>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{d.notes || d.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Required Assets Checklist */}
                {selected.requiredAssets && selected.requiredAssets.length > 0 && (
                  <div className="wr-modal-card">
                    <span className="wr-section-label">📋 Required Assets Checklist</span>
                    <div className="ai-assets-list">
                      {selected.requiredAssets.map((asset, idx) => (
                        <span key={idx} className="ai-asset-tag">✓ {asset}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Materials / Reference */}
                {(selected.materials || selected.image) && (
                  <div className="wr-modal-card">
                    <span className="wr-section-label">🔗 Materials & Reference</span>
                    {selected.materials && (
                      <div style={{ marginBottom: selected.image ? '10px' : 0 }}>
                        <a href={selected.materials} target="_blank" rel="noreferrer" className="wr-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          🔗 Open Materials Link
                        </a>
                      </div>
                    )}
                    {selected.image && (
                      <div style={{ marginTop: '8px' }}>
                        <a href={selected.image} target="_blank" rel="noreferrer">
                          <img
                            src={selected.image}
                            alt="Reference Attachment"
                            style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid #cbd5e1', objectFit: 'contain' }}
                          />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Remarks / Brief Details */}
                {selected.remarks && (
                  <div className="wr-modal-card">
                    <span className="wr-section-label">📝 Remarks / Brief Details</span>
                    <div className="wr-remarks-box">{selected.remarks}</div>
                  </div>
                )}

                {/* 7. Admin Note Input */}
                <div className="wr-field">
                  <label className="wr-label" htmlFor="admin-note" style={{ fontWeight: 700, color: '#334155' }}>
                    Admin Note (optional)
                  </label>
                  <textarea
                    id="admin-note"
                    className="wr-textarea"
                    rows={2}
                    placeholder="Add a note or revision guidance for the client…"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>

                {/* 8. Action Buttons */}
                <div className="wr-detail-actions">
                  <button
                    type="button"
                    className="wr-btn-approve"
                    onClick={() => handleAction('Approved', selected, note)}
                    disabled={busy}
                  >
                    ✅ Approve & Create Project
                  </button>
                  <button
                    type="button"
                    className="wr-btn-action-edit"
                    onClick={() => setEditingScope(true)}
                    disabled={busy}
                  >
                    ✏️ Edit Scope
                  </button>
                  <button
                    type="button"
                    className="wr-btn-reject"
                    onClick={() => openRejectModal(selected)}
                    disabled={busy}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ) : (
              /* Inline Edit Mode for Admin (Step 6) */
              <form onSubmit={handleSaveScopeEdit} style={{ marginTop: '12px' }}>
                <div className="wr-field">
                  <label className="wr-label">Project Title</label>
                  <input
                    type="text"
                    className="wr-input"
                    value={scopeForm.title}
                    onChange={e => setScopeForm(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>

                <div className="wr-row-2">
                  <div className="wr-field">
                    <label className="wr-label">Budget (₹)</label>
                    <input
                      type="number"
                      className="wr-input"
                      value={scopeForm.budget}
                      onChange={e => setScopeForm(prev => ({ ...prev, budget: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="wr-field">
                    <label className="wr-label">Deadline</label>
                    <input
                      type="date"
                      className="wr-input"
                      value={scopeForm.deadline}
                      onChange={e => setScopeForm(prev => ({ ...prev, deadline: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="wr-field">
                  <label className="wr-label">Remarks / Scope Adjustments</label>
                  <textarea
                    className="wr-textarea"
                    rows={3}
                    value={scopeForm.remarks}
                    onChange={e => setScopeForm(prev => ({ ...prev, remarks: e.target.value }))}
                  />
                </div>

                <div className="wr-detail-actions" style={{ marginTop: '16px' }}>
                  <button type="submit" className="wr-btn-approve" disabled={busy}>
                    💾 Save Changes
                  </button>
                  <button
                    type="button"
                    className="wr-btn-cancel"
                    onClick={() => setEditingScope(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Rejection Modal ── */}
      {rejectingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRejectingModal(null)}>
          <div className="wr-detail-modal wr-reject-modal">
            <div className="wr-modal-header">
              <div>
                <h2 className="wr-modal-title" style={{ color: '#dc2626' }}>❌ Reject Work Request</h2>
                <p className="wr-modal-sub">{rejectingModal.clientName} — {rejectingModal.title || rejectingModal.type}</p>
              </div>
              <button className="wr-close-btn" onClick={() => setRejectingModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '0 0 10px' }}>
              Select a reason below or write a custom message to inform the client:
            </p>

            <div className="wr-reject-reasons-list">
              {FREQUENT_REJECT_REASONS.map(r => (
                <div
                  key={r.id}
                  className="wr-reject-reason-card"
                  onClick={() => setRejectReason(`${r.line1} ${r.line2}`)}
                >
                  <strong>{r.title}</strong>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>{r.line1}</p>
                </div>
              ))}
            </div>

            <div className="wr-field" style={{ marginTop: '12px' }}>
              <label className="wr-label">Rejection Message to Client</label>
              <textarea
                className="wr-textarea"
                rows={3}
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>

            <div className="wr-detail-actions">
              <button
                className="wr-btn-reject"
                onClick={() => handleAction('Rejected', rejectingModal, rejectReason)}
                disabled={busy}
              >
                Confirm Rejection
              </button>
              <button
                type="button"
                className="wr-btn-cancel"
                onClick={() => setRejectingModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
