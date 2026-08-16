import { useState, useEffect } from 'react';
import { fetchAllRequests, updateRequestStatus, deleteRequest } from '../api/workRequests';
import { showToast } from './Toast';

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected', 'Revision'];

const STATUS_BADGE = {
  Pending:  { emoji: '🕐', cls: 'wr-badge-pending'  },
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
  const [tab,      setTab]      = useState('All');
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);   // request being reviewed
  const [rejectingModal, setRejectingModal] = useState(null); // request being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [note,     setNote]     = useState('');
  const [busy,     setBusy]     = useState(false);

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
                <th>Game</th>
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
                    <td data-label="Title"><strong style={{ color: '#0f1714' }}>{r.title || '—'}</strong></td>
                    <td data-label="Category">
                      <span className={`wr-cat-chip ${r.category === 'Gaming' ? 'chip-gaming' : 'chip-other'}`}>
                        {r.category === 'Gaming' ? '🎮' : '🎬'} {r.category}
                      </span>
                    </td>
                    <td data-label="Type">{r.type}</td>
                    <td className="text-muted" data-label="Game">{r.gameName || '—'}</td>
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
                          className="wr-btn-action wr-btn-view"
                          onClick={() => { setSelected(r); setNote(r.adminNote || ''); }}
                          title="Review"
                        >
                          👁 Review
                        </button>
                        {r.status !== 'Rejected' && (
                          <button
                            className="wr-btn-action wr-btn-del"
                            style={{ background: '#fee2e2', color: '#dc2626' }}
                            onClick={() => openRejectModal(r)}
                            title="Reject Request"
                          >
                            ❌ Reject
                          </button>
                        )}
                        <button
                          className="wr-btn-action wr-btn-del"
                          onClick={() => handleDelete(r._id)}
                          title="Delete"
                        >
                          🗑️ Delete
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

      {/* ── Detail / Review Modal ─────────────────────────── */}
      {selected && !rejectingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="wr-detail-modal">
            <div className="wr-modal-header">
              <div>
                <h2 className="wr-modal-title">📋 Request Detail</h2>
                <p className="wr-modal-sub">{selected.clientName}</p>
              </div>
              <button className="wr-close-btn" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="wr-detail-grid">
              {selected.title && (
                <div className="wr-detail-item wr-detail-full">
                  <span className="wr-detail-label">Title</span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f1714' }}>📌 {selected.title}</span>
                </div>
              )}
              <div className="wr-detail-item">
                <span className="wr-detail-label">Category</span>
                <span>{selected.category === 'Gaming' ? '🎮' : '🎬'} {selected.category}</span>
              </div>
              <div className="wr-detail-item">
                <span className="wr-detail-label">Type</span>
                <span>{selected.type}</span>
              </div>
              {selected.gameName && (
                <div className="wr-detail-item">
                  <span className="wr-detail-label">Game</span>
                  <span>{selected.gameName}</span>
                </div>
              )}
              <div className="wr-detail-item">
                <span className="wr-detail-label">Budget</span>
                <span>₹{Number(selected.budget).toLocaleString('en-IN')}</span>
              </div>
              <div className="wr-detail-item">
                <span className="wr-detail-label">Deadline</span>
                <span>{new Date(selected.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="wr-detail-item">
                <span className="wr-detail-label">Status</span>
                <span className={`wr-status-badge ${STATUS_BADGE[selected.status]?.cls}`}>
                  {STATUS_BADGE[selected.status]?.emoji} {selected.status}
                </span>
              </div>
              {selected.materials && (
                <div className="wr-detail-item wr-detail-full">
                  <span className="wr-detail-label">Materials</span>
                  <a href={selected.materials} target="_blank" rel="noreferrer" className="wr-link">
                    🔗 Open Link
                  </a>
                </div>
              )}
              {selected.image && (
                <div className="wr-detail-item wr-detail-full">
                  <span className="wr-detail-label">Attached Reference Image</span>
                  <div style={{ marginTop: '6px' }}>
                    <a href={selected.image} target="_blank" rel="noreferrer">
                      <img
                        src={selected.image}
                        alt="Client Reference Attachment"
                        style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '10px', border: '1px solid #cbd5e1', objectFit: 'contain' }}
                      />
                    </a>
                  </div>
                </div>
              )}
              {selected.remarks && (
                <div className="wr-detail-item wr-detail-full">
                  <span className="wr-detail-label">Remarks</span>
                  <span className="wr-remarks-text">{selected.remarks}</span>
                </div>
              )}
            </div>

            {/* Admin note */}
            <div className="wr-field" style={{ marginTop: '1rem' }}>
              <label className="wr-label" htmlFor="admin-note">Admin Note (optional)</label>
              <textarea
                id="admin-note"
                className="wr-textarea"
                rows={2}
                placeholder="Add a note for the client (e.g. revision instructions)…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="wr-detail-actions">
              <button
                className="wr-btn-approve"
                onClick={() => handleAction('Approved', selected, note)}
                disabled={busy}
              >
                ✅ Approve
              </button>
              <button
                className="wr-btn-reject"
                onClick={() => openRejectModal(selected)}
                disabled={busy}
              >
                ❌ Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection Modal with Textarea & 3 Frequent Replies ────── */}
      {rejectingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRejectingModal(null)}>
          <div className="wr-detail-modal wr-reject-modal">
            <div className="wr-modal-header">
              <div>
                <h2 className="wr-modal-title" style={{ color: '#dc2626' }}>❌ Reject Work Request</h2>
                <p className="wr-modal-sub">
                  Client: <strong>{rejectingModal.clientName}</strong> &bull; {rejectingModal.title || rejectingModal.type}
                </p>
              </div>
              <button className="wr-close-btn" onClick={() => setRejectingModal(null)}>✕</button>
            </div>

            {/* Frequent Quick Replies (3 Options, 2 lines each) */}
            <div className="wr-frequent-replies-wrap">
              <label className="wr-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span>⚡ Frequent Replies</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>(Click to insert into text area below)</span>
              </label>
              <div className="wr-frequent-grid">
                {FREQUENT_REJECT_REASONS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="wr-frequent-card"
                    onClick={() => setRejectReason(`${item.line1}\n${item.line2}`)}
                  >
                    <div className="wr-frequent-title">💬 {item.title}</div>
                    <div className="wr-frequent-line">{item.line1}</div>
                    <div className="wr-frequent-line">{item.line2}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea for Rejection Reason (custom writing or edited frequent reply) */}
            <div className="wr-field" style={{ marginTop: '1rem' }}>
              <label className="wr-label" htmlFor="reject-reason">
                Rejection Reason <span className="wr-required">*</span>
              </label>
              <textarea
                id="reject-reason"
                className="wr-textarea"
                rows={4}
                placeholder="Write custom rejection reason here, or pick a frequent reply above..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                autoFocus
              />
            </div>

            {/* Modal actions */}
            <div className="wr-detail-actions" style={{ marginTop: '1.25rem' }}>
              <button
                className="wr-btn-cancel"
                onClick={() => setRejectingModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="wr-btn-reject"
                onClick={() => handleAction('Rejected', rejectingModal, rejectReason)}
                disabled={busy || !rejectReason.trim()}
              >
                ❌ Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

