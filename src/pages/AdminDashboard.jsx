import { useState, useEffect, useCallback, useRef } from 'react';
import {
  db, secondaryAuth,
  ref, onValue, push, remove, update, set, get,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword
} from '../firebase';
import { clientEmail, clientDefaultPass, BRAND_NAME, useAuth } from '../contexts/AuthContext';
import Toast, { showToast } from '../components/Toast';
import WorkModal from '../components/WorkModal';
import AdvanceModal from '../components/AdvanceModal';
import CredentialModal from '../components/CredentialModal';
import ClientPreviewModal from '../components/ClientPreviewModal';
import WorkRequestsPanel from '../components/WorkRequestsPanel';
import ProjectDeliverablesSection from '../components/ProjectDeliverablesSection';
import DeliverablePreviewModal from '../components/DeliverablePreviewModal';
import ThemeToggle from '../components/ThemeToggle';
import { fetchProjects, createProject, deleteProject, updateProjectStatus, fetchRevisions, sendClientPaymentReminder } from '../api/projects';

import { API_BASE } from '../api/config';

const PROJECT_STATUS_LABELS = {
  work_request: { label: 'Work Request', color: 'muted' },
  approved: { label: 'Project Created', color: 'muted' },
  project_created: { label: 'Project Created', color: 'muted' },
  in_progress: { label: 'In Progress', color: 'amber' },
  deliverable_uploaded: { label: 'Deliverable Uploaded', color: 'blue' },
  awaiting_client_response: { label: 'Awaiting Client Response', color: 'amber' },
  awaiting_client_approval: { label: 'Awaiting Client Response', color: 'amber' },
  approved_by_client: { label: 'Completed', color: 'green' },
  revision_requested: { label: 'Revision Requested', color: 'red' },
  in_revision: { label: 'In Revision', color: 'amber' },
  completed: { label: 'Completed', color: 'green' },
};

export default function AdminDashboard() {
  const { logout, getToken } = useAuth();
  const [clients, setClients] = useState({});
  const [workTarget, setWorkTarget] = useState(null);
  const [advTarget, setAdvTarget] = useState(null);
  const [credTarget, setCredTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [newNotificationEmail, setNewNotificationEmail] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');  // 'dashboard' | 'requests' | 'projects'

  const [pendingCount, setPendingCount] = useState(0);

  // ── Projects state ─────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null); // project detail view
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createForClient, setCreateForClient] = useState(null); // { firebaseClientId, clientFirebaseUid, clientName }
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectDriveUrl, setNewProjectDriveUrl] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // ── Client Filter state ────────────────────────────────────
  const [clientFilter, setClientFilter] = useState('all'); // 'all' | 'due'
  const [clientSearch, setClientSearch] = useState('');
  const [sortBy, setSortBy] = useState('due_desc'); // 'due_desc' | 'newest' | 'total_desc' | 'name_asc'

  // ── Real-time listener on /clients/ ───────────────────────
  useEffect(() => {
    const unsub = onValue(ref(db, 'clients'), (snap) => {
      const val = snap.val() || {};
      Object.keys(val).forEach(id => { if (!val[id].work) val[id].work = {}; });
      setClients(val);
    }, (err) => {
      console.error('DB listener error:', err);
      showToast('⚠️ Connection error', 'warn');
    });
    return unsub;
  }, []);

  // ── Poll pending work request count ───────────────────────
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch(`${API_BASE}/work-requests?status=Pending`);
        if (!res.ok) return;
        const data = await res.json();
        setPendingCount(data.length);
      } catch { /* server not up yet */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Load projects ──────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const token = await getToken();
      const data = await fetchProjects(token);
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

  const revisionCount = projects.filter(p => p.status === 'revision_requested').length;

  // ── Derived summary ────────────────────────────────────────
  let totalEarned = 0, totalPending = 0;
  Object.values(clients).forEach(c => {
    Object.values(c.work || {}).forEach(w => {
      const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
      if (w.status === 'Paid') { totalEarned += amt; }
      else if (w.status === 'Advance') { const adv = Number(w.advance || 0); totalEarned += adv; totalPending += (amt - adv); }
      else { totalPending += amt; }
    });
  });

  // ── Add client ─────────────────────────────────────────────
  const handleAddClient = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { showToast('⚠️ Client name required', 'warn'); return; }

    const email = clientEmail(name);
    const password = clientDefaultPass(name);
    setAddBusy(true);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = cred.user.uid;
      const notifEmail = newNotificationEmail.trim();
      const newRef = await push(ref(db, 'clients'), {
        name,
        contactEmail: notifEmail,
        notificationEmail: notifEmail,
        uid: newUid,
        work: {}
      });

      if (notifEmail) {
        fetch(`${API_BASE}/work-requests/client-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: newRef.key, clientName: name, contactEmail: notifEmail })
        }).catch(() => { });
      }

      showToast('🎉 Client added!');
      setCredTarget({ name, email, password });
      setNewName('');
      setNewNotificationEmail('');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        showToast(`⚠️ "${name}" already has an account`, 'warn');
      } else {
        showToast('❌ Failed to create client', 'warn');
      }
    } finally {
      setAddBusy(false);
    }
  };

  const handleUpdateNotificationEmail = async (id, currentEmail) => {
    const input = prompt('Enter Notification Email for client (used for emails):', currentEmail || '');
    if (input === null) return;
    const notifEmail = input.trim();
    try {
      await update(ref(db, `clients/${id}`), {
        contactEmail: notifEmail,
        notificationEmail: notifEmail
      });

      const clientObj = clients[id];
      if (notifEmail) {
        fetch(`${API_BASE}/work-requests/client-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: id, clientName: clientObj?.name || '', contactEmail: notifEmail })
        }).catch(() => { });
      }

      showToast('✉️ Notification email updated!');
    } catch (err) {
      console.error(err);
      showToast('❌ Update failed', 'warn');
    }
  };

  const handleUpdateCalendlyUrl = async (id, currentUrl) => {
    const input = prompt('Enter Calendly Meeting Link for client (or leave blank to use default):', currentUrl || '');
    if (input === null) return;
    try {
      await update(ref(db, `clients/${id}`), {
        calendlyUrl: input.trim()
      });
      showToast('📅 Client meeting link updated!');
    } catch (err) {
      console.error(err);
      showToast('❌ Update failed', 'warn');
    }
  };

  const handleSetGlobalCalendly = async () => {
    try {
      const snap = await get(ref(db, 'settings/calendlyUrl'));
      const current = snap.exists() ? snap.val() : (import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com');
      const input = prompt('Enter default Calendly Meeting Link for all clients:', current);
      if (input === null) return;
      await set(ref(db, 'settings/calendlyUrl'), input.trim());
      showToast('📅 Default Calendly link saved!');
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to update default meeting link', 'warn');
    }
  };

  const handleSetupAuth = async (id, name) => {
    const email = clientEmail(name);
    const password = clientDefaultPass(name);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      await update(ref(db, `clients/${id}`), { uid: cred.user.uid });
      showToast(`✅ Login created for ${name}!`);
      setCredTarget({ name, email, password });
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        await handleResetPassword(id, name, true);
      } else {
        showToast(`❌ Failed: ${err.message}`, 'warn');
      }
    }
  };

  const handleResetPassword = async (id, name, silent = false) => {
    const email = clientEmail(name);
    const newDefault = clientDefaultPass(name);
    const candidates = [
      name.slice(0, 2).toLowerCase() + '@123',
      name.slice(0, 3).toLowerCase() + '@123',
      newDefault,
    ];

    let signedIn = false;
    for (const pwd of candidates) {
      try {
        await signInWithEmailAndPassword(secondaryAuth, email, pwd);
        signedIn = true;
        break;
      } catch (_) { /* try next */ }
    }

    if (!signedIn) {
      showToast(`❌ Cannot reset — unknown current password for ${name}`, 'warn');
      return;
    }

    try {
      await updatePassword(secondaryAuth.currentUser, newDefault);
      showToast(`✅ Password reset to default for ${name}!`);
      setCredTarget({ name, email, password: newDefault });
    } catch (err) {
      showToast(`❌ Reset failed: ${err.message}`, 'warn');
    }
  };

  const handleDeleteClient = (id) => {
    if (!confirm('Remove this client and all their work?')) return;
    remove(ref(db, `clients/${id}`))
      .then(() => showToast('🗑️ Client removed'))
      .catch(() => showToast('❌ Delete failed', 'warn'));
  };

  // ── Create project ─────────────────────────────────────────
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) { showToast('⚠️ Project title required', 'warn'); return; }
    if (!createForClient) { showToast('⚠️ Client required', 'warn'); return; }

    setCreateBusy(true);
    try {
      const token = await getToken();
      await createProject({
        firebaseClientId: createForClient.firebaseClientId,
        clientFirebaseUid: createForClient.clientFirebaseUid,
        clientName: createForClient.clientName,
        title: newProjectTitle.trim(),
        description: newProjectDesc,
        driveFolderUrl: newProjectDriveUrl.trim(),
      }, token);
      showToast('🎉 Project created!');
      setShowCreateProject(false);
      setNewProjectTitle('');
      setNewProjectDesc('');
      setNewProjectDriveUrl('');
      setCreateForClient(null);
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setCreateBusy(false);
    }
  };

  // ── Delete project ─────────────────────────────────────────
  const handleDeleteProject = async (id) => {
    if (!confirm('Delete this project and all its deliverables?')) return;
    try {
      const token = await getToken();
      await deleteProject(id, token);
      showToast('🗑️ Project deleted');
      setSelectedProject(null);
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    }
  };



  const handleSendPaymentReminder = async (clientId, clientName, clientObj) => {
    const client = clientObj || clients[clientId] || {};
    let email = (client.notificationEmail || client.contactEmail || '').trim();

    // If client does not have a real notification email configured, prompt admin to enter it!
    if (!email || email.includes('gtportal.com')) {
      const entered = prompt(
        `Client "${clientName}" does not have a notification email configured.\nPlease enter client's email to send the payment reminder:`,
        ''
      );
      if (!entered || !entered.trim()) {
        showToast('⚠️ Payment reminder cancelled (no email provided)', 'warn');
        return;
      }
      email = entered.trim();

      // Automatically save to RTDB & Mongo
      try {
        await update(ref(db, `clients/${clientId}`), {
          contactEmail: email,
          notificationEmail: email,
        });
        fetch(`${API_BASE}/work-requests/client-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientName, contactEmail: email })
        }).catch(() => { });
        showToast('✉️ Notification email saved!');
      } catch (err) {
        console.warn('Could not auto-save email to RTDB:', err);
      }
      client.notificationEmail = email;
      client.contactEmail = email;
    }

    if (!confirm(`Send payment reminder email with remaining payment invoice attachment to ${clientName} (${email})?`)) return;
    setSendingReminderId(clientId);
    try {
      const token = await getToken();
      const payload = {
        ...client,
        name: clientName,
        contactEmail: email,
        notificationEmail: email,
      };
      const res = await sendClientPaymentReminder(clientId, token, payload);
      showToast(`📧 ${res.message || 'Payment reminder sent successfully!'}`);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setSendingReminderId(null);
    }
  };


  const handleStatusChange = async (id, status) => {
    try {
      const token = await getToken();
      const updated = await updateProjectStatus(id, status, token);
      showToast('✅ Status updated!');
      setSelectedProject(updated);
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    }
  };

  const getClientDueAmount = (c) => {
    let pendingAmt = 0;
    const workItems = Array.isArray(c?.work) ? c.work : Object.values(c?.work || {});
    workItems.forEach(w => {
      if (!w) return;
      const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
      if (w.status === 'Paid') {
        // paid
      } else if (w.status === 'Advance') {
        const adv = Number(w.advance || 0);
        pendingAmt += Math.max(0, amt - adv);
      } else {
        pendingAmt += amt;
      }
    });
    return pendingAmt;
  };

  const getClientTotalValue = (c) => {
    let total = 0;
    const workItems = Array.isArray(c?.work) ? c.work : Object.values(c?.work || {});
    workItems.forEach(w => {
      if (!w) return;
      total += Number(w.qty || 1) * Number(w.price || w.amt || 0);
    });
    return total;
  };

  const clientEntries = Object.entries(clients);
  const dueClientsCount = clientEntries.filter(([_, c]) => getClientDueAmount(c) > 0).length;

  const filteredClientEntries = clientEntries.filter(([_, c]) => {
    if (clientFilter === 'due' && getClientDueAmount(c) <= 0) {
      return false;
    }
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase().trim();
      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const emailMatch = (c.notificationEmail || c.contactEmail || '').toLowerCase().includes(q);
      if (!nameMatch && !emailMatch) return false;
    }
    return true;
  });

  // Sort results in descending order
  const sortedClientEntries = [...filteredClientEntries].sort((a, b) => {
    const [idA, clientA] = a;
    const [idB, clientB] = b;

    if (sortBy === 'due_desc') {
      const dueA = getClientDueAmount(clientA);
      const dueB = getClientDueAmount(clientB);
      if (dueB !== dueA) return dueB - dueA; // Descending by due amount (highest due first)
      return idB.localeCompare(idA); // Descending by newest if due amount equal
    }

    if (sortBy === 'newest') {
      return idB.localeCompare(idA); // Descending by creation time (newest first)
    }

    if (sortBy === 'total_desc') {
      const totA = getClientTotalValue(clientA);
      const totB = getClientTotalValue(clientB);
      if (totB !== totA) return totB - totA; // Descending by total value
      return idB.localeCompare(idA);
    }

    if (sortBy === 'name_asc') {
      return (clientA.name || '').localeCompare(clientB.name || '');
    }

    // Default: descending by due amount
    const dueA = getClientDueAmount(clientA);
    const dueB = getClientDueAmount(clientB);
    if (dueB !== dueA) return dueB - dueA;
    return idB.localeCompare(idA);
  });

  return (
    <div className="admin-layout">
      <Toast />

      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-brand">
            <span>GT</span> {BRAND_NAME}
          </div>
          <button className="btn-logout-sidebar" onClick={logout} title="Sign Out">
            🔒 Sign Out
          </button>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Menu</span>

          <button
            className={`sidebar-item${activeTab === 'dashboard' ? ' active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSelectedProject(null); }}
          >
            <span>🏠</span> Dashboard
          </button>
          <button
            className={`sidebar-item${activeTab === 'projects' ? ' active' : ''}`}
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
          >
            <span>📁</span> Projects
            {revisionCount > 0 && (
              <span className="wr-sidebar-badge" style={{ background: '#dc2626', color: '#ffffff' }}>
                {revisionCount}
              </span>
            )}
          </button>
          <button
            className={`sidebar-item${activeTab === 'requests' ? ' active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            <span>📨</span> Work Requests
            {pendingCount > 0 && (
              <span className="wr-sidebar-badge">{pendingCount}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle />
        </div>
      </aside>


      <main className="admin-main">

        <div className="admin-topbar">
          <div className="admin-topbar-inner">
            <div>
              <h1>
                {activeTab === 'requests' ? 'Work Requests'
                  : activeTab === 'projects' ? (selectedProject ? selectedProject.title : 'Projects')
                    : 'Admin Dashboard'}
              </h1>
              <p>Welcome back, {BRAND_NAME} 👋</p>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              {activeTab === 'projects' && selectedProject && (
                <button className="btn-secondary" onClick={() => setSelectedProject(null)}>
                  ← All Projects
                </button>
              )}
              {/* <button className="btn-secondary" onClick={handleSetGlobalCalendly} title="Configure default Calendly meeting URL">
                📅 Calendly Link
              </button> */}
              <button className="btn-logout-topbar" onClick={logout}>
                🔒 Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* ── Dashboard tab ── */}
        {activeTab === 'dashboard' && (
          <>
            <section className="summary-row">
              <div className="sum-card sum-paid">
                <div>
                  <p className="sum-label">Total Revenue Earned</p>
                  <p className="sum-value">₹{totalEarned.toLocaleString('en-IN')}</p>
                </div>
                <div className="sum-icon">✅</div>
              </div>
              <div className="sum-card sum-pending">
                <div>
                  <p className="sum-label">Pending Payments</p>
                  <p className="sum-value">₹{totalPending.toLocaleString('en-IN')}</p>
                </div>
                <div className="sum-icon">⏳</div>
              </div>
              <div className="sum-card sum-total">
                <div>
                  <p className="sum-label">Active Clients</p>
                  <p className="sum-value">{clientEntries.length}</p>
                </div>
                <div className="sum-icon">👥</div>
              </div>
            </section>

            <section className="admin-add-section">
              <h2 className="section-title">➕ Add New Client</h2>
              <form className="admin-add-form" onSubmit={handleAddClient} autoComplete="off">
                <div className="admin-form-row">
                  <input
                    type="text"
                    placeholder="Client name…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    required
                  />
                  <input
                    type="email"
                    placeholder="Notification Email (e.g. client@gmail.com)…"
                    value={newNotificationEmail}
                    onChange={e => setNewNotificationEmail(e.target.value)}
                  />
                  <button type="submit" className="btn-add-client" disabled={addBusy}>
                    {addBusy ? 'Creating…' : 'Add Client'}
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-section">
              <div className="admin-clients-header">
                <div className="admin-clients-title-group">
                  <h2 className="section-title" style={{ margin: 0 }}>
                    {clientFilter === 'due' ? '💳 Clients with Payment Due' : '👥 All Clients'}
                  </h2>
                  <span className={`client-count-pill ${clientFilter === 'due' ? 'pill-due' : ''}`}>
                    {filteredClientEntries.length} {filteredClientEntries.length === 1 ? 'client' : 'clients'}
                  </span>
                </div>

                <div className="admin-clients-filters">
                  <div className="client-search-box">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search client or email…"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                    />
                    {clientSearch && (
                      <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => setClientSearch('')}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="client-filter-group" role="tablist">
                    <button
                      type="button"
                      className={`filter-pill-btn ${clientFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setClientFilter('all')}
                    >
                      <span>👥 All</span>
                      <span className="pill-count">{clientEntries.length}</span>
                    </button>

                    <button
                      type="button"
                      className={`filter-pill-btn pill-btn-due ${clientFilter === 'due' ? 'active' : ''}`}
                      onClick={() => setClientFilter('due')}
                    >
                      <span>💳 Payment Due</span>
                      <span className={`pill-count ${dueClientsCount > 0 ? 'count-warning' : ''}`}>
                        {dueClientsCount}
                      </span>
                    </button>
                  </div>

                  {/* Sort Dropdown */}
                  <div className="client-sort-box">
                    <span className="sort-label">Sort:</span>
                    <select
                      className="client-sort-select"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      title="Sort order for client list"
                    >
                      <option value="due_desc">💰 Due Amount (High → Low ↓)</option>
                      <option value="newest">🕒 Newest Added First (↓)</option>
                      <option value="total_desc">📦 Total Value (High → Low ↓)</option>
                      <option value="name_asc">🔤 Name (A → Z)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="admin-client-list">
                {sortedClientEntries.length === 0 ? (
                  <div className="admin-empty">
                    <div className="empty-icon">{clientFilter === 'due' ? '🎉' : '📋'}</div>
                    <p>
                      {clientFilter === 'due'
                        ? 'No clients have pending payment due! All client payments are up to date.'
                        : clientSearch
                          ? `No clients found matching "${clientSearch}".`
                          : 'No clients yet. Add your first client above.'}
                    </p>
                    {(clientFilter === 'due' || clientSearch) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginTop: '12px', fontSize: '0.85rem' }}
                        onClick={() => { setClientFilter('all'); setClientSearch(''); }}
                      >
                        Show All Clients
                      </button>
                    )}
                  </div>
                ) : (
                  sortedClientEntries.map(([id, c]) => (
                    <ClientCard
                      key={id}
                      id={id}
                      client={c}
                      onOpenWork={() => setWorkTarget({ clientId: id, clientName: c.name })}
                      onShowCred={() => setCredTarget({
                        name: c.name,
                        email: clientEmail(c.name),
                        password: clientDefaultPass(c.name)
                      })}
                      onPreview={() => setPreviewTarget({ clientId: id, clientName: c.name })}
                      onSetupAuth={() => handleSetupAuth(id, c.name)}
                      onReset={() => handleResetPassword(id, c.name)}
                      onUpdateEmail={() => handleUpdateNotificationEmail(id, c.notificationEmail || c.contactEmail)}
                      onUpdateCalendly={() => handleUpdateCalendlyUrl(id, c.calendlyUrl)}
                      onDelete={() => handleDeleteClient(id)}
                      onSendReminder={() => handleSendPaymentReminder(id, c.name, c)}
                      isSendingReminder={sendingReminderId === id}
                      onCreateProject={() => {

                        setCreateForClient({
                          firebaseClientId: id,
                          clientFirebaseUid: c.uid || '',
                          clientName: c.name,
                        });
                        setShowCreateProject(true);
                        setActiveTab('projects');
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {/* ── Projects tab ── */}
        {activeTab === 'projects' && !selectedProject && (
          <section className="admin-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>📁 All Projects</h2>
              <button className="btn-new-request" onClick={() => setShowCreateProject(true)}>
                ＋ New Project
              </button>
            </div>

            {projectsLoading && (
              <div className="admin-empty">
                <div className="spinner" />
                <p>Loading projects…</p>
              </div>
            )}

            {!projectsLoading && projects.length === 0 && (
              <div className="admin-empty">
                <div className="empty-icon">📁</div>
                <p>No projects yet.</p>
                <button className="btn-new-request" onClick={() => setShowCreateProject(true)}>
                  ＋ Create First Project
                </button>
              </div>
            )}

            {!projectsLoading && projects.length > 0 && (
              <div className="proj-list">
                {projects.map(p => {
                  const sc = PROJECT_STATUS_LABELS[p.status] || { label: p.status, color: 'muted' };
                  const isRevision = p.status === 'revision_requested';
                  return (
                    <div
                      key={p._id}
                      className="proj-card"
                      onClick={() => setSelectedProject(p)}
                      style={isRevision ? { border: '1.5px solid #fca5a5', background: '#fff8f8' } : {}}
                    >
                      <div className="proj-card-header">
                        <div>
                          <p className="proj-card-client">{p.clientName}</p>
                          <h3 className="proj-card-title">{p.title}</h3>
                        </div>
                        <span className={`dlv-status-badge dlv-status--${sc.color}`}>
                          {sc.label}
                        </span>
                      </div>
                      {p.description && <p className="proj-card-desc">{p.description}</p>}
                      {isRevision && p.latestRevision && (
                        <div
                          className="proj-card-revision-box"
                          style={{
                            background: '#fef2f2',
                            borderLeft: '3px solid #dc2626',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            marginTop: '8px',
                            fontSize: '0.85rem'
                          }}
                        >
                          <strong style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            🔄 Revision Requested (v{p.latestRevision.deliverableVersion}):
                          </strong>
                          <p style={{ color: '#475569', margin: '2px 0 0 0', fontStyle: 'italic', wordBreak: 'break-word' }}>
                            "{p.latestRevision.description}"
                          </p>
                        </div>
                      )}
                      <p className="proj-card-date">
                        Created {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
          <ProjectDetailView
            project={selectedProject}
            getToken={getToken}
            onDelete={handleDeleteProject}
            onStatusChange={handleStatusChange}
            statusLabels={PROJECT_STATUS_LABELS}
          />
        )}

        {/* Work Requests panel */}
        {activeTab === 'requests' && <WorkRequestsPanel />}

        <footer className="portal-footer" style={{ marginLeft: 0 }}>
          <p>By <a href="https://instagram.com/gt._.edits">@gt._.edits</a></p>
        </footer>
      </main>

      {/* ── Modals ── */}
      {workTarget && (
        <WorkModal
          clientId={workTarget.clientId}
          clientName={workTarget.clientName}
          work={clients[workTarget.clientId]?.work || {}}
          onClose={() => setWorkTarget(null)}
          onAdvance={(workId) => setAdvTarget({ clientId: workTarget.clientId, workId })}
        />
      )}

      {advTarget && (
        <AdvanceModal
          clientId={advTarget.clientId}
          workId={advTarget.workId}
          work={clients[advTarget.clientId]?.work || {}}
          onClose={() => setAdvTarget(null)}
        />
      )}

      {credTarget && (
        <CredentialModal
          name={credTarget.name}
          email={credTarget.email}
          password={credTarget.password}
          onClose={() => setCredTarget(null)}
        />
      )}

      {previewTarget && (
        <ClientPreviewModal
          clientName={previewTarget.clientName}
          work={clients[previewTarget.clientId]?.work || {}}
          calendlyUrl={clients[previewTarget.clientId]?.calendlyUrl}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Create project modal */}
      {showCreateProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !createBusy && setShowCreateProject(false)}>
          <div className="modal-card" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 className="modal-title">📁 New Project</h2>
              {!createBusy && (
                <button className="modal-close-btn" onClick={() => setShowCreateProject(false)}>✕</button>
              )}
            </div>
            <form className="dlv-form" onSubmit={handleCreateProject}>
              {/* Client picker (if not pre-selected) */}
              {!createForClient ? (
                <div className="dlv-form-field">
                  <label>Select Client <span className="req">*</span></label>
                  <select
                    onChange={e => {
                      const id = e.target.value;
                      if (!id) return;
                      const c = clients[id];
                      setCreateForClient({ firebaseClientId: id, clientFirebaseUid: c.uid || '', clientName: c.name });
                    }}
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>-- Choose a client --</option>
                    {Object.entries(clients).map(([id, c]) => (
                      <option key={id} value={id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="dlv-form-field">
                  <label>Client</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="dlv-meta-value" style={{ fontWeight: 700 }}>{createForClient.clientName}</span>
                    <button type="button" className="dlv-btn dlv-btn--outline" style={{ padding: '2px 8px', fontSize: '12px' }}
                      onClick={() => setCreateForClient(null)}>Change</button>
                  </div>
                </div>
              )}
              <div className="dlv-form-field">
                <label>Project Title <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Valorant Thumbnail #24"
                  value={newProjectTitle}
                  onChange={e => setNewProjectTitle(e.target.value)}
                  disabled={createBusy}
                  required
                />
              </div>
              <div className="dlv-form-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>Google Drive Folder Link <span className="opt">(optional)</span></label>
                  <a
                    href="https://drive.google.com/drive/u/0/my-drive"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: '#16a34a', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    Create Drive Folder ↗
                  </a>
                </div>
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={newProjectDriveUrl}
                  onChange={e => setNewProjectDriveUrl(e.target.value)}
                  disabled={createBusy}
                />
                <span className="dlv-hint" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Paste Google Drive folder URL. Once saved, it will never ask for the drive link again!
                </span>
              </div>
              <div className="dlv-form-field">
                <label>Description <span className="opt">(optional)</span></label>
                <textarea
                  rows={2}
                  placeholder="Brief project notes…"
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  disabled={createBusy}
                />
              </div>
              <div className="dlv-form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateProject(false)} disabled={createBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={createBusy}>
                  {createBusy ? 'Creating…' : '📁 Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Detail View ────────────────────────────────────────
function ProjectDetailView({ project, getToken, onDelete, onStatusChange, statusLabels }) {
  const [token, setToken] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [previewTarget, setPreviewTarget] = useState(null);
  const sc = statusLabels[project.status] || { label: project.status, color: 'muted' };

  useEffect(() => {
    getToken().then(t => {
      setToken(t);
      fetchRevisions(project._id, t).then(setRevisions).catch(console.error);
    }).catch(console.error);
  }, [project._id, getToken]);

  const NEXT_STATUSES = [
    'work_request', 'approved', 'project_created', 'in_progress',
    'deliverable_uploaded', 'awaiting_client_approval', 'approved_by_client',
    'revision_requested', 'in_revision', 'completed',
  ].filter(s => s !== project.status);

  return (
    <section className="admin-section">
      {/* Project meta card */}
      <div className="proj-detail-meta">
        <div className="proj-detail-meta-left">
          <p className="proj-card-client">{project.clientName}</p>
          <h2 className="proj-detail-title">{project.title}</h2>
          {project.description && <p className="proj-card-desc">{project.description}</p>}
        </div>
        <div className="proj-detail-meta-right">
          <span className={`dlv-status-badge dlv-status--${sc.color}`}>{sc.label}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <select
              className="dlv-status-select"
              defaultValue=""
              onChange={e => { if (e.target.value) onStatusChange(project._id, e.target.value); e.target.value = ''; }}
            >
              <option value="" disabled>Change status…</option>
              {NEXT_STATUSES.map(s => (
                <option key={s} value={s}>{statusLabels[s]?.label || s}</option>
              ))}
            </select>
            <button className="dlv-btn dlv-btn--danger" onClick={() => onDelete(project._id)}>
              🗑️ Delete Project
            </button>
          </div>
        </div>
      </div>

      {/* Revision feedback panel */}
      {revisions.length > 0 && (
        <div className="proj-revisions-section" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px' }}>
          <h4 style={{ color: '#dc2626', margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔄 Client Revision Requests ({revisions.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {revisions.map(r => (
              <div key={r._id} style={{ background: '#ffffff', border: '1px solid #fee2e2', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#991b1b' }}>
                    Version {r.deliverableVersion} Feedback ({r.clientName || 'Client'})
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p style={{ margin: '0 0 8px 0', fontSize: '0.92rem', color: '#1e293b', whiteSpace: 'pre-wrap' }}>"{r.description}"</p>

                {/* Deliverable for this revision version */}
                {r.deliverable && (
                  <div style={{ marginTop: '8px', padding: '10px 12px', background: '#f8faf8', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '1.1rem' }}>{r.deliverable.type === 'file' ? '📁' : '🔗'}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: '0.85rem', color: '#0f1714', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.deliverable.name} (v{r.deliverable.version})
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {r.deliverable.type === 'file' ? (r.deliverable.originalFileName || 'File') : r.deliverable.url}
                        </span>
                      </div>
                    </div>
                    {r.deliverable.type === 'file' ? (
                      <button
                        className="dlv-btn dlv-btn--outline"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={() => setPreviewTarget(r.deliverable)}
                      >
                        👁 Preview v{r.deliverable.version}
                      </button>
                    ) : (
                      <a
                        href={r.deliverable.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dlv-btn dlv-btn--primary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        🔗 Open Link
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deliverables section */}
      {token && (
        <ProjectDeliverablesSection
          project={project}
          token={token}
          isAdmin={true}
        />
      )}
      {!token && <div className="dlv-empty"><div className="spinner" /><p>Authenticating…</p></div>}

      {/* Deliverable preview modal for revision version */}
      {previewTarget && token && (
        <DeliverablePreviewModal
          deliverable={previewTarget}
          token={token}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </section>
  );
}

// ── Client Card ────────────────────────────────────────────
function ClientCard({ id, client, onOpenWork, onShowCred, onSetupAuth, onReset, onUpdateEmail, onUpdateCalendly, onPreview, onDelete, onCreateProject, onSendReminder, isSendingReminder }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const work = Object.values(client.work || {});
  let paidAmt = 0, pendingAmt = 0;
  work.forEach(w => {
    const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
    if (w.status === 'Paid') { paidAmt += amt; }
    else if (w.status === 'Advance') { paidAmt += Number(w.advance || 0); pendingAmt += amt - Number(w.advance || 0); }
    else { pendingAmt += amt; }
  });
  const hasAuth = !!client.uid;
  const email = clientEmail(client.name);
  const totalVal = paidAmt + pendingAmt;
  const notifEmail = client.notificationEmail || client.contactEmail || '';
  const paidPercent = totalVal > 0 ? Math.min(100, Math.round((paidAmt / totalVal) * 100)) : 100;

  const handleCopyEmail = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedLogin = email.length > 16 ? email.slice(0, 10) + '...' : email;

  return (
    <div className="clean-client-card">
      {/* ── Top Header Row ── */}
      <div className="clean-card-header">
        <div className="clean-card-left">
          <div className="clean-avatar">{client.name.charAt(0).toUpperCase()}</div>
          <div className="clean-info">
            <h3 className="clean-name">{client.name}</h3>

            <div className="clean-login-row">
              <span>🔑 Login: <span title={email}>{truncatedLogin}</span></span>
              <button
                type="button"
                className="clean-copy-btn"
                onClick={handleCopyEmail}
                title={copied ? "Copied!" : "Copy login email"}
              >
                {copied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            <div className="clean-meta-row">
              <span
                className="clean-meta-item"
                onClick={onUpdateEmail}
                title="Click to edit notification email"
              >
                ✉️ Email: <span style={{ color: notifEmail ? '#0f172a' : '#ea580c', fontWeight: 600 }}>{notifEmail || 'Set Notification'}</span>
              </span>
              <span
                className="clean-meta-item"
                onClick={onUpdateCalendly}
                title="Click to edit Calendly meeting link"
              >
                📅 Meet: <span>{client.calendlyUrl ? 'Custom Link' : 'Default Calendly'}</span> ✏️
              </span>
            </div>
          </div>
        </div>

        <div className="clean-card-right">
          {pendingAmt > 0 ? (
            <div className="clean-due-badge" title="Outstanding payment due">
              <div className="clean-due-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="#ffedd5" />
                  <line x1="12" y1="9" x2="12" y2="13" stroke="#ea580c" strokeWidth="2" />
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="#ea580c" strokeWidth="3" />
                </svg>
              </div>
              <div className="clean-due-text">
                <span className="clean-due-amount">₹{pendingAmt.toLocaleString('en-IN')} Due</span>
                <span className="clean-due-sub">Payment pending</span>
              </div>
            </div>
          ) : (
            <div className="clean-settled-badge" title="All payments settled">
              <div className="clean-settled-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="clean-due-text">
                <span className="clean-settled-amount">₹0 Due</span>
                <span className="clean-settled-sub">Paid in full</span>
              </div>
            </div>
          )}

          <span className={`clean-status-pill ${hasAuth ? 'status-active' : 'status-pending'}`}>
            <span className="clean-status-dot" />
            {hasAuth ? 'Active' : 'Pending'}
          </span>

          <button
            type="button"
            className="clean-more-dot-btn"
            onClick={() => setMenuOpen(prev => !prev)}
            title="More options"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Middle Metrics & Payment Progress Container ── */}
      <div className="clean-stats-container">
        <div className="clean-stats-grid">
          <div className="clean-stat-item">
            <span className="clean-stat-label">📦 ITEMS</span>
            <span className="clean-stat-value">{work.length}</span>
          </div>
          <div className="clean-stat-item">
            <span className="clean-stat-label">🪙 TOTAL</span>
            <span className="clean-stat-value">₹{totalVal.toLocaleString('en-IN')}</span>
          </div>
          <div className="clean-stat-item">
            <span className="clean-stat-label">✔️ PAID</span>
            <span className="clean-stat-value val-paid">₹{paidAmt.toLocaleString('en-IN')}</span>
          </div>
          <div className="clean-stat-item">
            <span className="clean-stat-label">⚠️ DUE</span>
            <span className="clean-stat-value val-due">₹{pendingAmt.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="clean-stats-divider" />

        <div className="clean-payment-progress">
          <span className="clean-payment-title">Payment</span>
          <span className="clean-payment-subtitle">
            ₹{paidAmt.toLocaleString('en-IN')} paid • ₹{pendingAmt.toLocaleString('en-IN')} due
          </span>
          <div className="clean-progress-row">
            <div className="clean-progress-track">
              <div
                className="clean-progress-bar"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
            <span className="clean-progress-percent">{paidPercent}%</span>
          </div>
        </div>
      </div>

      {/* ── Bottom Action Buttons Bar ── */}
      <div className="clean-card-actions-bar" ref={menuRef}>
        <button
          type="button"
          className="clean-btn-view-client"
          onClick={onPreview}
          title="Preview Client Portal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View Client
        </button>

        <button
          type="button"
          className="clean-btn-card-action"
          onClick={onCreateProject}
          title="Create Project"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          Project
        </button>

        <button
          type="button"
          className="clean-btn-card-action"
          onClick={onOpenWork}
          title="Open Work Deliverables"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          Work
        </button>

        <button
          type="button"
          className="clean-btn-card-reminder"
          onClick={onSendReminder}
          disabled={isSendingReminder}
          title="Send Payment Reminder Email with Invoice Attachment"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {isSendingReminder ? 'Sending…' : 'Reminder'}
        </button>

        <button
          type="button"
          className="clean-btn-card-more"
          onClick={() => setMenuOpen(prev => !prev)}
          title="More client actions"
        >
          <span>••• More</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* ── Dropdown Menu (Client Settings) ── */}
        {menuOpen && (
          <div className="clean-card-dropdown">
            <div className="clean-dropdown-header">Client Settings</div>

            <button
              type="button"
              className="clean-dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                if (hasAuth) { onShowCred(); }
                else { onSetupAuth(); }
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="15.5" r="5.5" />
                <path d="m21 2-9.6 9.6" />
                <path d="m15.5 7.5 3 3L22 7l-3-3" />
              </svg>
              {hasAuth ? 'Credentials' : 'Setup Credentials'}
            </button>

            <button
              type="button"
              className="clean-dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                onReset();
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset Password
            </button>

            <button
              type="button"
              className="clean-dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                onUpdateEmail();
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Notifications
            </button>

            <button
              type="button"
              className="clean-dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                onUpdateCalendly();
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              Calendly
            </button>

            <div className="clean-dropdown-divider" />

            <button
              type="button"
              className="clean-dropdown-item item-danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete Client
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

