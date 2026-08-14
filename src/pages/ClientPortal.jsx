import { useState, useEffect, useCallback, Fragment } from 'react';
import { db, ref, onValue } from '../firebase';
import { useAuth, BRAND_NAME } from '../contexts/AuthContext';
import Toast, { showToast }   from '../components/Toast';
import ChangePasswordModal    from '../components/ChangePasswordModal';
import WorkRequestForm        from '../components/WorkRequestForm';
import DeliverablePreviewModal from '../components/DeliverablePreviewModal';
import { generateInvoice }   from '../generateInvoice';
import { buildWorkSections, computeTotals, formatDate } from '../utils';
import { fetchClientRequests } from '../api/workRequests';
import { fetchClientProjects } from '../api/projects';
import { fetchClientDeliverables, approveDeliverable, requestRevision, downloadDeliverable } from '../api/deliverables';

const STATUS_CONFIG = {
  // Deliverable statuses
  awaiting_approval:        { label: 'Awaiting Your Approval', color: 'amber', icon: '🟡' },
  approved:                 { label: 'Approved',               color: 'green', icon: '✅' },
  revision_requested:       { label: 'Revision Requested',     color: 'red',   icon: '🔴' },
  superseded:               { label: 'Superseded',             color: 'muted', icon: '⚫' },
  draft:                    { label: 'Draft',                  color: 'muted', icon: '⚪' },

  // Project statuses
  project_created:          { label: 'Project Created',        color: 'muted', icon: '📁' },
  awaiting_client_response: { label: 'Awaiting Client Response', color: 'amber', icon: '🟡' },
  awaiting_client_approval: { label: 'Awaiting Client Response', color: 'amber', icon: '🟡' },
  completed:                { label: 'Completed',              color: 'green', icon: '✅' },
  approved_by_client:       { label: 'Completed',              color: 'green', icon: '✅' },
};

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024)          return `${b} B`;
  if (b < 1024 * 1024)   return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateLong(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClientPortal() {
  const { clientRecord, currentUser, logout, getToken } = useAuth();
  const { clientId, name } = clientRecord || {};

  const [client,           setClient]           = useState(null);
  const [pdfBusy,          setPdfBusy]          = useState(false);
  const [showChangePass,   setShowChangePass]   = useState(false);
  const [showRequestForm,  setShowRequestForm]  = useState(false);
  const [myRequests,       setMyRequests]       = useState([]);

  // ── Projects state ─────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState('payments'); // 'payments' | 'projects'
  const [projects,        setProjects]        = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [deliverables,    setDeliverables]    = useState([]);
  const [dlvLoading,      setDlvLoading]      = useState(false);
  const [previewTarget,   setPreviewTarget]   = useState(null);
  const [revisionModal,   setRevisionModal]   = useState(null); // deliverable being revised
  const [revisionDesc,    setRevisionDesc]    = useState('');
  const [actionBusy,      setActionBusy]      = useState(false);
  const [downloading,     setDownloading]     = useState(false);

  // ── Real-time client data ──────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    const unsub = onValue(ref(db, `clients/${clientId}`), (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (!val.work) val.work = {};
        setClient(val);
      }
    });
    return unsub;
  }, [clientId]);

  // ── Fetch client's own work requests ────────────────────────
  const loadRequests = useCallback(async () => {
    if (!clientId) return;
    try {
      const data = await fetchClientRequests(clientId);
      setMyRequests(data);
    } catch { /* server may not be up yet */ }
  }, [clientId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // ── Load projects ──────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const token = await getToken();
      const data  = await fetchClientProjects(token);
      setProjects(data);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setProjectsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (activeTab === 'projects') loadProjects();
  }, [activeTab, loadProjects]);

  // ── Load deliverables for selected project ─────────────────
  const loadDeliverables = useCallback(async () => {
    if (!selectedProject) return;
    setDlvLoading(true);
    try {
      const token = await getToken();
      const data  = await fetchClientDeliverables(selectedProject._id, token);
      setDeliverables(data);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setDlvLoading(false);
    }
  }, [selectedProject, getToken]);

  useEffect(() => { loadDeliverables(); }, [loadDeliverables]);

  const [workTab, setWorkTab] = useState('Remaining');
  const work          = client ? Object.entries(client.work || {}).map(([id, w]) => ({ id, ...w })) : [];
  const totals        = computeTotals(work);
  const remainingWork = work.filter(w => (w.status || 'Pending') !== 'Paid');
  const paidWork      = work.filter(w => (w.status || 'Pending') === 'Paid');
  const displayWork   = workTab === 'Remaining' ? remainingWork : workTab === 'Paid' ? paidWork : work;
  const sections      = buildWorkSections(displayWork);

  const handleDownloadInvoice = async () => {
    if (!client) { showToast('⚠️ No data to export', 'warn'); return; }
    setPdfBusy(true);
    try {
      await generateInvoice({ clientName: name, work: client.work || {}, brandName: BRAND_NAME });
      showToast('✅ Invoice downloaded!');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('❌ Failed to generate PDF', 'warn');
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Client: approve deliverable ────────────────────────────
  const handleApprove = async (d) => {
    if (!confirm('Approve this deliverable?')) return;
    setActionBusy(true);
    try {
      const token = await getToken();
      await approveDeliverable(d._id, token);
      showToast('✅ Deliverable approved!');
      loadDeliverables();
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setActionBusy(false);
    }
  };

  // ── Client: request revision ───────────────────────────────
  const handleRevisionSubmit = async (e) => {
    e.preventDefault();
    if (!revisionDesc.trim()) { showToast('⚠️ Please describe the revision', 'warn'); return; }
    setActionBusy(true);
    try {
      const token = await getToken();
      await requestRevision(revisionModal._id, { description: revisionDesc.trim(), clientName: name }, token);
      showToast('✅ Revision requested!');
      setRevisionModal(null);
      setRevisionDesc('');
      loadDeliverables();
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setActionBusy(false);
    }
  };

  // ── Download file ──────────────────────────────────────────
  const handleDownload = async (d) => {
    if (d.allowDownload === false) {
      showToast('🔒 Download is disabled by Admin for this deliverable', 'warn');
      return;
    }
    if (downloading) return;
    setDownloading(true);
    try {
      const token = await getToken();
      await downloadDeliverable(d._id, d.originalFileName, token);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setDownloading(false);
    }
  };

  // ── Preview ────────────────────────────────────────────────
  const handlePreview = async (d) => {
    const token = await getToken();
    setPreviewTarget({ ...d, _token: token });
  };

  // Pending approval count for badge
  const pendingApprovalCount = projects.filter(p => ['awaiting_client_response', 'awaiting_client_approval'].includes(p.status)).length;

  return (
    <div className="admin-layout">
      <Toast />

      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="sidebar-logo">
          <span>⚡</span> GT Portal
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">NAVIGATION</div>
          <button
            className={`sidebar-item${activeTab === 'payments' ? ' active' : ''}`}
            onClick={() => { setActiveTab('payments'); setSelectedProject(null); }}
          >
            <span>📋</span> Dashboard
          </button>
          <button
            className={`sidebar-item${activeTab === 'projects' ? ' active' : ''}`}
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
          >
            <span>📁</span> My Projects
            {pendingApprovalCount > 0 && (
              <span className="wr-sidebar-badge">{pendingApprovalCount}</span>
            )}
          </button>
          <button className="sidebar-item"
            onClick={() => {
              setActiveTab('payments');
              setSelectedProject(null);
              setTimeout(() => {
                document.getElementById('requests-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
          >
            <span>📨</span> My Requests
          </button>
          <button className="sidebar-item"
            onClick={() => {
              setActiveTab('payments');
              setSelectedProject(null);
              setTimeout(() => {
                document.getElementById('qr-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
          >
            <span>📱</span> QR Pay
          </button>
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="admin-main">

        {/* Top bar */}
        <div className="admin-topbar">
          <div className="admin-topbar-inner">
            <div>
              <h1>
                {activeTab === 'projects' && selectedProject
                  ? selectedProject.title
                  : activeTab === 'projects'
                    ? 'My Projects'
                    : 'My Payments'}
              </h1>
              <p>Hello, {name} 👋 {activeTab === 'payments' ? "Here's your work summary." : 'Your projects.'}</p>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {activeTab === 'projects' && selectedProject && (
                <button className="btn-secondary" onClick={() => setSelectedProject(null)}>
                  ← Projects
                </button>
              )}
              {activeTab === 'payments' && (
                <>
                  <button className="btn-invoice" onClick={() => setShowChangePass(true)}>
                    🔑 Change Password
                  </button>
                  <button className="btn-invoice" onClick={handleDownloadInvoice} disabled={pdfBusy}>
                    {pdfBusy ? '⏳ Generating…' : '⬇ Invoice'}
                  </button>
                  <button className="btn-new-request" onClick={() => setShowRequestForm(true)}>
                    ✏️ New Request
                  </button>
                </>
              )}
              <button className="btn-logout-topbar" onClick={logout}>
                🔒 Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* ── Payments tab ── */}
        {activeTab === 'payments' && (
          <>
            <section className="summary-row" style={{ padding: '1.25rem 2rem 0' }}>
              <div className="sum-card sum-total">
                <div className="sum-icon">📦</div>
                <div>
                  <p className="sum-label">Total Work Value</p>
                  <p className="sum-value">₹{totals.total.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <div className="sum-card sum-paid">
                <div className="sum-icon">✅</div>
                <div>
                  <p className="sum-label">Amount Paid</p>
                  <p className="sum-value">₹{totals.paid.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <div className="sum-card sum-pending">
                <div className="sum-icon">⏳</div>
                <div>
                  <p className="sum-label">Amount Due</p>
                  <p className="sum-value">₹{totals.pending.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </section>

            <section className="admin-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>📋 Work Items</h2>
                <div className="wr-tabs" style={{ margin: 0 }}>
                  <button className={`wr-tab ${workTab === 'Remaining' ? 'active' : ''}`} onClick={() => setWorkTab('Remaining')}>
                    ⏳ Remaining ({remainingWork.length})
                  </button>
                  <button className={`wr-tab ${workTab === 'Paid' ? 'active' : ''}`} onClick={() => setWorkTab('Paid')}>
                    ✅ Paid ({paidWork.length})
                  </button>
                  <button className={`wr-tab ${workTab === 'All' ? 'active' : ''}`} onClick={() => setWorkTab('All')}>
                    📋 All ({work.length})
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                {displayWork.length === 0 ? (
                  <div className="work-empty">
                    <div className="empty-icon">📭</div>
                    <p>No {workTab === 'Remaining' ? 'remaining payment' : workTab === 'Paid' ? 'paid' : ''} work items.</p>
                  </div>
                ) : (
                  <table className="work-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Amount Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map(section => (
                        <Fragment key={section.key}>
                          <tr className="section-header">
                            <td colSpan={7}>{section.label}</td>
                          </tr>
                          {section.rows.map((w, i) => {
                            const qty       = Number(w.qty || 1);
                            const price     = Number(w.price || w.amt || 0);
                            const lineTotal = qty * price;
                            const status    = w.status || 'Pending';
                            const advAmt    = Number(w.advance || 0);
                            const amtDue    = status === 'Pending' ? lineTotal
                                            : status === 'Advance' ? lineTotal - advAmt : 0;
                            return (
                              <tr key={w.id}>
                                <td className="col-num"  data-label="#">{i + 1}</td>
                                <td className="col-desc" data-label="Description">
                                  {w.desc}
                                  {w.date && <><br /><small className="row-date">{formatDate(w.date)}</small></>}
                                </td>
                                <td className="col-num"  data-label="Qty">{qty}</td>
                                <td className="col-amt"  data-label="Unit Price">₹{price.toLocaleString('en-IN')}</td>
                                <td className="col-amt col-total" data-label="Total">₹{lineTotal.toLocaleString('en-IN')}</td>
                                <td className="col-status" data-label="Status">
                                  <span className={`badge badge-${status.toLowerCase()}`}>
                                    {status === 'Pending' ? '⏳ Pending'
                                     : status === 'Advance' ? '💰 Advance'
                                     : '✅ Paid'}
                                  </span>
                                </td>
                                <td className="col-amt col-due" data-label="Amount Due">
                                  {amtDue > 0
                                    ? <span className="due-highlight">₹{amtDue.toLocaleString('en-IN')}</span>
                                    : <span className="due-clear">—</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="admin-section" id="requests-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>📨 My Work Requests</h2>
                <button className="btn-new-request" onClick={() => setShowRequestForm(true)}>
                  ✏️ New Request
                </button>
              </div>
              {myRequests.length === 0 ? (
                <div className="work-empty">
                  <div className="empty-icon">📭</div>
                  <p>No requests submitted yet.</p>
                </div>
              ) : (
                <div className="wr-client-list">
                  {myRequests.map(r => (
                    <div key={r._id} className="wr-client-card">
                      <div className="wr-client-card-top">
                        <div>
                          {r.title && <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f1714', marginBottom: '4px' }}>📌 {r.title}</div>}
                          <span className={`wr-cat-chip ${r.category === 'Gaming' ? 'chip-gaming' : 'chip-other'}`}>
                            {r.category === 'Gaming' ? '🎮' : '🎬'} {r.category}
                          </span>
                          <span className="wr-client-type">{r.type}</span>
                          {r.gameName && <span className="wr-gamename">· {r.gameName}</span>}
                        </div>
                        <span className={`wr-status-badge ${r.status === 'Approved' ? 'wr-badge-approved' : r.status === 'Rejected' ? 'wr-badge-rejected' : r.status === 'Revision' ? 'wr-badge-revision' : 'wr-badge-pending'}`}>
                          {r.status === 'Approved' ? '✅ Approved' : r.status === 'Rejected' ? '❌ Rejected' : r.status === 'Revision' ? '🔄 Revision' : '🕐 Pending'}
                        </span>
                      </div>
                      <div className="wr-client-card-body">
                        <span>💰 ₹{Number(r.budget).toLocaleString('en-IN')}</span>
                        <span>📅 {new Date(r.deadline).toLocaleDateString('en-IN')}</span>
                        {r.materials && (
                          <a href={r.materials} target="_blank" rel="noreferrer" className="wr-link">🔗 Materials</a>
                        )}
                      </div>
                      {r.adminNote && (
                        <div className="wr-admin-note">
                          <strong>📝 Admin Note:</strong> {r.adminNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-section" id="qr-section">
              <h2 className="section-title">📱 Pay via QR Code</h2>
              <div className="qr-card" style={{ margin: 0 }}>
                <p className="qr-sub">Scan with any UPI app to make your payment.</p>
                <img src="/receive_money_image.png" alt="Payment QR Code" className="qr-image" />
              </div>
            </section>
          </>
        )}

        {/* ── Projects tab: list view ── */}
        {activeTab === 'projects' && !selectedProject && (
          <section className="admin-section">
            {projectsLoading && (
              <div className="admin-empty"><div className="spinner" /><p>Loading projects…</p></div>
            )}
            {!projectsLoading && projects.length === 0 && (
              <div className="admin-empty">
                <div className="empty-icon">📁</div>
                <p>No projects yet. Your admin will create one for you.</p>
              </div>
            )}
            {!projectsLoading && projects.length > 0 && (
              <div className="proj-list">
                {projects.map(p => {
                  const sc = STATUS_CONFIG[p.status] || { label: p.status, color: 'muted', icon: '⚪' };
                  const needsAction = ['awaiting_client_response', 'awaiting_client_approval'].includes(p.status);
                  return (
                    <div
                      key={p._id}
                      className={`proj-card ${needsAction ? 'proj-card--action' : ''}`}
                      onClick={() => setSelectedProject(p)}
                    >
                      <div className="proj-card-header">
                        <div>
                          <h3 className="proj-card-title">{p.title}</h3>
                          {needsAction && (
                            <p className="proj-action-notice">⚡ Action Required: Please review the latest deliverable.</p>
                          )}
                        </div>
                        <span className={`dlv-status-badge dlv-status--${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                      {p.description && <p className="proj-card-desc">{p.description}</p>}
                      <p className="proj-card-date">
                        Created {formatDateLong(p.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Project detail view ── */}
        {activeTab === 'projects' && selectedProject && (
          <section className="admin-section">
            {/* Status banner */}
            {['awaiting_client_response', 'awaiting_client_approval'].includes(selectedProject.status) && (
              <div className="dlv-action-banner">
                ⚡ <strong>Action Required:</strong> Please review the latest deliverable below and approve or request changes.
              </div>
            )}
            {['completed', 'approved_by_client'].includes(selectedProject.status) && (
              <div className="dlv-success-banner">
                ✅ Deliverable approved and project completed. Thank you!
              </div>
            )}
            {selectedProject.status === 'revision_requested' && (
              <div className="dlv-warning-banner">
                🔴 Revision requested. Your admin will upload a new version soon.
              </div>
            )}

            {/* Deliverables */}
            {dlvLoading && (
              <div className="dlv-empty"><div className="spinner" /><p>Loading deliverables…</p></div>
            )}

            {!dlvLoading && deliverables.length === 0 && (
              <div className="dlv-empty">
                <div className="empty-icon">📭</div>
                <p>No deliverables uploaded yet.</p>
              </div>
            )}

            {!dlvLoading && deliverables.length > 0 && (
              <div className="dlv-section">
                <div className="dlv-section-header">
                  <h3 className="dlv-section-title">📦 Deliverables</h3>
                </div>

                {deliverables.map((d, idx) => {
                  const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.draft;
                  const isLatest = idx === 0;
                  const isSuperseded = d.status === 'superseded';

                  return (
                    <div key={d._id} className={`dlv-card client-dlv-card ${isSuperseded ? 'dlv-card--superseded' : ''}`}>
                      <div className="dlv-card-header">
                        <div className="dlv-card-title-row">
                          <span className="dlv-card-name">{d.name}</span>
                          <span className={`dlv-version-chip version-chip--${cfg.color}`}>
                            Version {d.version} {isLatest && !isSuperseded ? '· Latest' : ''}
                          </span>
                        </div>
                        <span className={`dlv-status-badge dlv-status--${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>

                      <div className="dlv-card-meta">
                        <span className="dlv-meta-item">
                          <span className="dlv-meta-label">Type</span>
                          <span className="dlv-meta-value">{d.type === 'file' ? '📁 File' : '🔗 External Link'}</span>
                        </span>
                        {d.type === 'file' && d.fileSize && (
                          <span className="dlv-meta-item">
                            <span className="dlv-meta-label">Size</span>
                            <span className="dlv-meta-value">{formatBytes(d.fileSize)}</span>
                          </span>
                        )}
                        <span className="dlv-meta-item">
                          <span className="dlv-meta-label">Uploaded</span>
                          <span className="dlv-meta-value">{formatDateLong(d.createdAt)}</span>
                        </span>
                      </div>

                      {d.description && <p className="dlv-card-desc">{d.description}</p>}

                      {/* Image preview thumbnail */}
                      {d.type === 'file' && d.mimeType?.startsWith('image/') && !isSuperseded && (
                        <div className="dlv-thumb-wrap" onClick={() => handlePreview(d)} style={{ cursor: 'pointer' }}>
                          <div className="dlv-thumb-placeholder">🖼️ Click Preview to view image</div>
                        </div>
                      )}

                      <div className="dlv-card-actions">
                        {d.type === 'file' && (
                          <>
                            <button className="dlv-btn dlv-btn--outline" onClick={() => handlePreview(d)}>
                              👁 Preview
                            </button>
                            {d.allowDownload === false ? (
                              <button
                                className="dlv-btn dlv-btn--disabled"
                                disabled
                                title="Download disabled by Admin"
                                style={{ background: '#f1f5f9', color: '#94a3b8', border: '1px solid #cbd5e1', cursor: 'not-allowed' }}
                              >
                                🔒 Download Disabled
                              </button>
                            ) : (
                              <button className="dlv-btn dlv-btn--primary" onClick={() => handleDownload(d)} disabled={downloading}>
                                {downloading ? '…' : '⬇ Download'}
                              </button>
                            )}
                          </>
                        )}
                        {d.type === 'link' && (
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dlv-btn dlv-btn--primary"
                          >
                            🔗 Open Deliverable
                          </a>
                        )}

                        {/* Approval buttons — only for latest awaiting_approval */}
                        {isLatest && d.status === 'awaiting_approval' && (
                          <>
                            <button
                              className="dlv-btn dlv-btn--approve"
                              onClick={() => handleApprove(d)}
                              disabled={actionBusy}
                            >
                              {actionBusy ? '…' : '✓ Approve'}
                            </button>
                            <button
                              className="dlv-btn dlv-btn--revise"
                              onClick={() => { setRevisionModal(d); setRevisionDesc(''); }}
                              disabled={actionBusy}
                            >
                              ↻ Request Revision
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <footer className="portal-footer" style={{ marginLeft: 0 }}>
          <p>By <a href="https://instagram.com/gt._.edits">@gt._.edits</a></p>
        </footer>
      </main>

      {/* ── Modals ── */}
      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}

      {showRequestForm && (
        <WorkRequestForm
          clientId={clientId}
          clientFirebaseUid={currentUser?.uid}
          clientName={name}
          onClose={() => setShowRequestForm(false)}
          onSubmitted={loadRequests}
        />
      )}

      {/* Revision modal */}
      {revisionModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !actionBusy && setRevisionModal(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">↻ Request Revision</h2>
              {!actionBusy && (
                <button className="modal-close-btn" onClick={() => setRevisionModal(null)}>✕</button>
              )}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
              Requesting revision for <strong>{revisionModal.name}</strong> (Version {revisionModal.version})
            </p>
            <form className="dlv-form" onSubmit={handleRevisionSubmit}>
              <div className="dlv-form-field">
                <label>Describe what needs to change <span className="req">*</span></label>
                <textarea
                  rows={4}
                  placeholder="Please change the thumbnail colors, the text is too small…"
                  value={revisionDesc}
                  onChange={e => setRevisionDesc(e.target.value)}
                  disabled={actionBusy}
                  required
                />
              </div>
              <div className="dlv-form-actions">
                <button type="button" className="btn-secondary" onClick={() => setRevisionModal(null)} disabled={actionBusy}>
                  Cancel
                </button>
                <button type="submit" className="dlv-btn dlv-btn--revise" disabled={actionBusy}>
                  {actionBusy ? 'Submitting…' : '↻ Submit Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewTarget && (
        <DeliverablePreviewModal
          deliverable={previewTarget}
          token={previewTarget._token}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
