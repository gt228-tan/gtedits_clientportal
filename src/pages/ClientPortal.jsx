import { useState, useEffect, useCallback, Fragment } from 'react';
import { db, ref, onValue, push } from '../firebase';
import { useAuth, BRAND_NAME } from '../contexts/AuthContext';
import Toast, { showToast } from '../components/Toast';
import ChangePasswordModal from '../components/ChangePasswordModal';
import WorkRequestForm from '../components/WorkRequestForm';
import DeliverablePreviewModal from '../components/DeliverablePreviewModal';
import ThemeToggle from '../components/ThemeToggle';
import { generateInvoice } from '../generateInvoice';
import { buildWorkSections, computeTotals, formatDate, getSectionMetaForSave } from '../utils';
import { fetchClientRequests } from '../api/workRequests';
import { fetchClientProjects } from '../api/projects';
import { fetchClientDeliverables, approveDeliverable, requestRevision, downloadDeliverable } from '../api/deliverables';

const STATUS_CONFIG = {
  // Deliverable statuses
  awaiting_approval: { label: 'Awaiting Your Approval', color: 'amber', icon: '🟡' },
  approved: { label: 'Approved', color: 'green', icon: '✅' },
  revision_requested: { label: 'Revision Requested', color: 'red', icon: '🔴' },
  superseded: { label: 'Superseded', color: 'muted', icon: '⚫' },
  draft: { label: 'Draft', color: 'muted', icon: '⚪' },

  // Project statuses
  project_created: { label: 'Project Created', color: 'muted', icon: '📁' },
  awaiting_client_response: { label: 'Awaiting Client Response', color: 'amber', icon: '🟡' },
  awaiting_client_approval: { label: 'Awaiting Client Response', color: 'amber', icon: '🟡' },
  completed: { label: 'Completed', color: 'green', icon: '✅' },
  approved_by_client: { label: 'Completed', color: 'green', icon: '✅' },
};

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateLong(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClientPortal() {
  const { clientRecord, currentUser, logout, getToken } = useAuth();
  const { clientId, name } = clientRecord || {};

  const [client, setClient] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  // ── Projects state ─────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'projects'
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [dlvLoading, setDlvLoading] = useState(false);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [revisionModal, setRevisionModal] = useState(null); // deliverable being revised
  const [revisionDesc, setRevisionDesc] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
      const data = await fetchClientProjects(token);
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
      const data = await fetchClientDeliverables(selectedProject._id, token);
      setDeliverables(data);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setDlvLoading(false);
    }
  }, [selectedProject, getToken]);

  useEffect(() => { loadDeliverables(); }, [loadDeliverables]);

  const [workTab, setWorkTab] = useState('Remaining');
  const work = client ? Object.entries(client.work || {}).map(([id, w]) => ({ id, ...w })) : [];
  const totals = computeTotals(work);
  const remainingWork = work.filter(w => (w.status || 'Pending') !== 'Paid');
  const paidWork = work.filter(w => (w.status || 'Pending') === 'Paid');
  const displayWork = workTab === 'Remaining' ? remainingWork : workTab === 'Paid' ? paidWork : work;
  const sections = buildWorkSections(displayWork);

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

      // If the project has an amount, ensure it is in the client's work section!
      const projAmount = Number(selectedProject?.amount || selectedProject?.budget || 0);
      if (projAmount > 0 && clientId) {
        const clientWork = client?.work || {};
        const existingEntry = Object.entries(clientWork).find(([wid, w]) => {
          if (w.projectId && w.projectId === selectedProject._id) return true;
          if (selectedProject.workId && wid === selectedProject.workId) return true;
          if (w.desc && w.desc.trim().toLowerCase() === selectedProject.title.trim().toLowerCase()) return true;
          return false;
        });

        if (!existingEntry) {
          const today = new Date().toISOString().split('T')[0];
          const workEntries = Object.entries(clientWork);
          const sectionMeta = getSectionMetaForSave(today, workEntries, null);
          const entry = {
            desc: selectedProject.title.trim(),
            qty: 1,
            price: projAmount,
            date: today,
            status: 'Pending',
            projectId: selectedProject._id,
            sectionKey: sectionMeta.key,
            sectionLabel: sectionMeta.label,
            sectionType: sectionMeta.type,
          };
          await push(ref(db, `clients/${clientId}/work`), entry);
        }
      }

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
        <div className="sidebar-header-row">
          <div className="sidebar-brand">
            <div className="sidebar-brand-inner">
              <span className="sidebar-brand-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <div className="sidebar-brand-text">
                <span className="sidebar-brand-title">EditDesk</span>
                <span className="sidebar-brand-badge" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'rgba(37, 99, 235, 0.2)' }}>CLIENT</span>
              </div>
            </div>
          </div>

          <div className="sidebar-header-actions">
            <ThemeToggle compact={true} />
            <div className="header-mobile-avatar" title={`Client: ${name || 'User'}`}>
              <span>{(name || 'C').charAt(0).toUpperCase()}</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Navigation</span>

          <button
            type="button"
            className={`sidebar-item${activeTab === 'payments' ? ' active' : ''}`}
            onClick={() => { setActiveTab('payments'); setSelectedProject(null); }}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            <span className="sidebar-item-label">Dashboard</span>
          </button>

          <button
            type="button"
            className={`sidebar-item${activeTab === 'projects' ? ' active' : ''}`}
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </span>
            <span className="sidebar-item-label">My Projects</span>
            {pendingApprovalCount > 0 && (
              <span className="wr-sidebar-badge badge-pending">{pendingApprovalCount}</span>
            )}
          </button>

          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setActiveTab('payments');
              setSelectedProject(null);
              setTimeout(() => {
                document.getElementById('requests-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            <span className="sidebar-item-label">My Requests</span>
            {myRequests.length > 0 && (
              <span className="wr-sidebar-badge badge-neutral" style={{ marginLeft: 'auto' }}>{myRequests.length}</span>
            )}
          </button>

          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setActiveTab('payments');
              setSelectedProject(null);
              setTimeout(() => {
                document.getElementById('qr-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1" />
                <rect width="5" height="5" x="16" y="3" rx="1" />
                <rect width="5" height="5" x="3" y="16" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
            </span>
            <span className="sidebar-item-label">QR Pay</span>
          </button>

          {client?.driveFolderUrl && (
            <a
              href={client.driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-item"
              style={{ textDecoration: 'none' }}
            >
              <span className="sidebar-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="sidebar-item-label">Google Drive</span>
            </a>
          )}
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle />
          <button className="sidebar-logout-btn" onClick={logout} title="Sign Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="admin-main">

        {/* Top bar */}
        <div className="admin-topbar">
          <div className="admin-topbar-inner">
            <div className="admin-topbar-title-group">
              <h1 className="admin-topbar-title">
                {activeTab === 'projects' && selectedProject
                  ? selectedProject.title
                  : activeTab === 'projects'
                    ? 'My Projects'
                    : 'My Payments'}
              </h1>
              <p className="admin-topbar-sub">Hello, {name} 👋 {activeTab === 'payments' ? "Here's your work summary." : 'Your projects.'}</p>
            </div>

            <div className="admin-topbar-actions">
              {activeTab === 'projects' && selectedProject && (
                <button className="btn-secondary" onClick={() => setSelectedProject(null)}>
                  ← All Projects
                </button>
              )}
              {activeTab === 'payments' && (
                <>
                  <button className="btn-invoice" onClick={() => setShowChangePass(true)} title="Change account password">
                    🔑 Change Password
                  </button>
                  <button className="btn-invoice" onClick={handleDownloadInvoice} disabled={pdfBusy} title="Download official PDF invoice">
                    {pdfBusy ? '⏳ Generating…' : '⬇ Invoice'}
                  </button>
                  {client?.driveFolderUrl && (
                    <a
                      href={client.driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-invoice"
                      title="Open your Google Drive assets folder"
                    >
                      📂 Drive Folder ↗
                    </a>
                  )}
                  <button className="btn-create-pill" onClick={() => setShowRequestForm(true)} title="Submit a new work request">
                    <span className="btn-create-icon">＋</span> New Request
                  </button>
                </>
              )}

              {/* User Avatar */}
              <div className="topbar-user-avatar" title={`Client: ${name || 'User'}`}>
                <span>{(name || 'C').charAt(0).toUpperCase()}</span>
              </div>

              <button className="btn-logout-topbar" onClick={logout} title="Sign Out">
                🔒 Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* ── Payments tab ── */}
        {activeTab === 'payments' && (
          <>
            <div className="bento-overview-card">
              <div className="bento-overview-header">
                <div className="bento-overview-title-group">
                  <h2 className="bento-overview-title">Financial Overview</h2>
                  <span className="bento-live-badge">
                    <span className="live-dot" /> Live Updates
                  </span>
                </div>
                <div className="bento-timeframe-pill">
                  <span>Work & Payment Summary</span>
                </div>
              </div>

              <div className="bento-stats-grid">
                {/* Total Work Value Card */}
                <div className="bento-stat-card stat-card-clients">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap icon-clients">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        <path d="m3.3 7 8.7 5 8.7-5" />
                        <path d="M12 22V12" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Total Work Value</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className="bento-stat-val">₹{totals.total.toLocaleString('en-IN')}</span>
                    <span className="bento-trend-pill trend-neutral">
                      {work.length} {work.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </div>
                </div>

                {/* Amount Paid Card */}
                <div className="bento-stat-card stat-card-earned">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Amount Paid</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className="bento-stat-val">₹{totals.paid.toLocaleString('en-IN')}</span>
                    <span className="bento-trend-pill trend-up">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                      Paid
                    </span>
                  </div>
                </div>

                {/* Amount Due Card */}
                <div className="bento-stat-card stat-card-pending">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap icon-pending">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Amount Due</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className={`bento-stat-val ${totals.pending > 0 ? 'val-pending' : ''}`}>
                      ₹{totals.pending.toLocaleString('en-IN')}
                    </span>
                    <span className={`bento-trend-pill ${totals.pending > 0 ? 'trend-warning' : 'trend-up'}`}>
                      {totals.pending > 0 ? 'Payment Due' : 'All Settled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <section className="admin-section">
              <div className="admin-clients-header">
                <div className="admin-clients-title-group">
                  <h2 className="section-title" style={{ margin: 0 }}>📋 Work Items</h2>
                  <span className="client-count-pill">
                    {displayWork.length} {displayWork.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="client-filter-group" role="tablist">
                  <button
                    type="button"
                    className={`filter-pill-btn pill-btn-due ${workTab === 'Remaining' ? 'active' : ''}`}
                    onClick={() => setWorkTab('Remaining')}
                  >
                    <span>⏳ Remaining</span>
                    <span className={`pill-count ${remainingWork.length > 0 ? 'count-warning' : ''}`}>{remainingWork.length}</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${workTab === 'Paid' ? 'active' : ''}`}
                    onClick={() => setWorkTab('Paid')}
                  >
                    <span>✅ Paid</span>
                    <span className="pill-count">{paidWork.length}</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${workTab === 'All' ? 'active' : ''}`}
                    onClick={() => setWorkTab('All')}
                  >
                    <span>📋 All</span>
                    <span className="pill-count">{work.length}</span>
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
                            const qty = Number(w.qty || 1);
                            const price = Number(w.price || w.amt || 0);
                            const lineTotal = qty * price;
                            const status = w.status || 'Pending';
                            const advAmt = Number(w.advance || 0);
                            const amtDue = status === 'Pending' ? lineTotal
                              : status === 'Advance' ? lineTotal - advAmt : 0;
                            return (
                              <tr key={w.id}>
                                <td className="col-num" data-label="#">{i + 1}</td>
                                <td className="col-desc" data-label="Description">
                                  {w.desc}
                                  {w.date && <><br /><small className="row-date">{formatDate(w.date)}</small></>}
                                </td>
                                <td className="col-num" data-label="Qty">{qty}</td>
                                <td className="col-amt" data-label="Unit Price">₹{price.toLocaleString('en-IN')}</td>
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
              <div className="admin-clients-header">
                <div className="admin-clients-title-group">
                  <h2 className="section-title" style={{ margin: 0 }}>📨 My Work Requests</h2>
                  <span className="client-count-pill">{myRequests.length}</span>
                </div>
                <button className="btn-create-pill" onClick={() => setShowRequestForm(true)}>
                  <span className="btn-create-icon">＋</span> New Request
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
                          {r.title && <div className="wr-client-card-title" style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px' }}>📌 {r.title}</div>}
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
                        <span>📅 {new Date(r.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
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
              <div className="admin-clients-title-group" style={{ marginBottom: '14px' }}>
                <h2 className="section-title" style={{ margin: 0 }}>📱 Pay via QR Code</h2>
                <span className="client-count-pill" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'rgba(26, 158, 88, 0.2)' }}>Instant UPI</span>
              </div>
              <div className="clean-client-card" style={{ maxWidth: '440px', padding: '24px', alignItems: 'center', textAlign: 'center' }}>
                <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 500 }}>
                  Scan with any UPI app (Google Pay, PhonePe, Paytm) to complete payment directly.
                </p>
                <div style={{ background: '#ffffff', padding: '14px', borderRadius: '16px', border: '1px solid var(--border)', display: 'inline-block', boxShadow: 'var(--shadow-sm)' }}>
                  <img src="/receive_money_image.png" alt="Payment QR Code" style={{ maxWidth: '240px', width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }} />
                </div>
                {totals.pending > 0 && (
                  <div style={{ marginTop: '16px', padding: '8px 18px', borderRadius: '9999px', background: 'var(--peach-bg)', color: 'var(--peach)', fontWeight: 700, fontSize: '0.85rem' }}>
                    Outstanding Due: ₹{totals.pending.toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ── Projects tab: list view ── */}
        {activeTab === 'projects' && !selectedProject && (
          <section className="admin-section">
            <div className="admin-clients-header">
              <div className="admin-clients-title-group">
                <h2 className="section-title" style={{ margin: 0 }}>📁 My Projects</h2>
                <span className="client-count-pill">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
              </div>
            </div>

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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <p className="proj-card-date" style={{ margin: 0 }}>
                          Created {formatDateLong(p.createdAt)}
                        </p>
                        {p.driveFolderUrl && (
                          <a
                            href={p.driveFolderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ padding: '6px 14px', fontSize: '0.8rem', textDecoration: 'none', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid rgba(26, 158, 88, 0.25)', borderRadius: '9999px', fontWeight: 700 }}
                            onClick={e => e.stopPropagation()}
                          >
                            📁 Drive Folder ↗
                          </a>
                        )}
                      </div>
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
                <div className="dlv-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <h3 className="dlv-section-title">📦 Deliverables</h3>
                  {selectedProject.driveFolderUrl && (
                    <a
                      href={selectedProject.driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: '6px 14px', fontSize: '0.85rem', textDecoration: 'none', background: '#16a34a', color: '#fff', borderRadius: '6px', fontWeight: 700 }}
                    >
                      📁 View Project Drive Folder ↗
                    </a>
                  )}
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
          driveFolderUrl={client?.driveFolderUrl}
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
