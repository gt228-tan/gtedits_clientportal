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
import { fetchProjects, createProject, deleteProject, updateProject, updateProjectStatus, fetchRevisions, sendClientPaymentReminder } from '../api/projects';
import { getSectionMetaForSave } from '../utils';

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
  const [syncDriveBusy, setSyncDriveBusy] = useState(false);
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
  const [newProjectAmount, setNewProjectAmount] = useState('');
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

      // Auto-create dedicated Google Drive folder for the new client
      try {
        const driveRes = await fetch(`${API_BASE}/drive/create-client-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: newRef.key,
            clientName: name,
            clientEmail: notifEmail
          })
        }).then(r => r.json()).catch(() => null);

        if (driveRes?.success && driveRes.folderUrl) {
          await update(ref(db, `clients/${newRef.key}`), {
            driveFolderId: driveRes.folderId,
            driveFolderUrl: driveRes.folderUrl
          });
          showToast('🎉 Client added & Google Drive folder created!');
        } else if (driveRes && driveRes.configured === false) {
          showToast('🎉 Client added! (Configure Google Drive in server/.env for auto-folders)', 'info');
        } else {
          showToast('🎉 Client added!');
        }
      } catch (driveErr) {
        console.warn('Google Drive auto-creation warning:', driveErr);
        showToast('🎉 Client added!');
      }

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

  const handleCreateDriveFolder = async (clientId, clientName, clientEmail) => {
    try {
      showToast(`⏳ Creating Google Drive folder for ${clientName}...`, 'info');
      const res = await fetch(`${API_BASE}/drive/create-client-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientName, clientEmail: clientEmail || '' })
      });
      const data = await res.json();
      if (data.success && data.folderUrl) {
        await update(ref(db, `clients/${clientId}`), {
          driveFolderId: data.folderId,
          driveFolderUrl: data.folderUrl
        });
        showToast(`🎉 Google Drive folder created and linked for ${clientName}!`);
      } else {
        showToast(`⚠️ ${data.message || data.error || 'Could not create Drive folder'}`, 'warn');
      }
    } catch (err) {
      showToast(`❌ Drive creation error: ${err.message}`, 'error');
    }
  };

  const handleSyncAllDriveFolders = async () => {
    const missing = Object.entries(clients).filter(([_, c]) => !c.driveFolderUrl);
    if (missing.length === 0) {
      showToast('✅ All clients already have Google Drive folders linked!', 'info');
      return;
    }

    const confirmSync = window.confirm(
      `Create and link Google Drive folders for ${missing.length} existing client${missing.length > 1 ? 's' : ''}?`
    );
    if (!confirmSync) return;

    setSyncDriveBusy(true);
    showToast(`⏳ Creating Drive folders for ${missing.length} existing client${missing.length > 1 ? 's' : ''}...`, 'info');

    try {
      const payload = missing.map(([id, c]) => ({
        clientId: id,
        clientName: c.name || 'Client',
        clientEmail: c.notificationEmail || c.contactEmail || ''
      }));

      const res = await fetch(`${API_BASE}/drive/batch-create-client-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: payload })
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.created)) {
        let updatedCount = 0;
        for (const item of data.created) {
          if (item.clientId && item.folderUrl) {
            await update(ref(db, `clients/${item.clientId}`), {
              driveFolderId: item.folderId,
              driveFolderUrl: item.folderUrl
            });
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          showToast(`🎉 Successfully created Google Drive folders for ${updatedCount} client${updatedCount > 1 ? 's' : ''}!`);
        }
        if (data.failedCount > 0) {
          showToast(`⚠️ ${data.failedCount} folder(s) could not be created. Check server logs.`, 'warn');
        }
      } else {
        showToast(`❌ Batch sync error: ${data.error || data.message || 'Failed to create folders'}`, 'warn');
      }
    } catch (err) {
      console.error('Batch drive sync error:', err);
      showToast(`❌ Drive sync error: ${err.message}`, 'error');
    } finally {
      setSyncDriveBusy(false);
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
      const parsedAmount = parseFloat(newProjectAmount) || 0;
      await createProject({
        firebaseClientId: createForClient.firebaseClientId,
        clientFirebaseUid: createForClient.clientFirebaseUid,
        clientName: createForClient.clientName,
        title: newProjectTitle.trim(),
        description: newProjectDesc,
        driveFolderUrl: newProjectDriveUrl.trim(),
        amount: parsedAmount,
        budget: parsedAmount,
      }, token);
      showToast('🎉 Project created!');
      setShowCreateProject(false);
      setNewProjectTitle('');
      setNewProjectAmount('');
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
      const proj = projects.find(p => p._id === id) || selectedProject || {};
      let projectAmount = Number(proj.amount || proj.budget || 0);
      let workId = proj.workId || null;

      // ── If project is completed, add directly to client's work section! ──
      if (status === 'completed') {
        const targetClientId = proj.firebaseClientId || Object.keys(clients).find(k =>
          clients[k]?.uid === proj.clientFirebaseUid ||
          (clients[k]?.name && clients[k].name.toLowerCase() === (proj.clientName || '').toLowerCase())
        );

        if (targetClientId) {
          // If project amount is not yet specified, prompt admin
          if (projectAmount <= 0) {
            const entered = prompt(
              `Project "${proj.title}" does not have an amount / price set.\n` +
              `Enter amount to add to ${proj.clientName || 'client'}'s work section (₹):`,
              ''
            );
            if (entered !== null && entered.trim() !== '') {
              const parsed = parseFloat(entered.trim());
              if (!isNaN(parsed) && parsed >= 0) {
                projectAmount = parsed;
              }
            }
          }

          if (projectAmount > 0) {
            const clientObj = clients[targetClientId] || {};
            const clientWork = clientObj.work || {};

            // Check if already in work section (by projectId, workId, or exact title)
            const existingEntry = Object.entries(clientWork).find(([wid, w]) => {
              if (w.projectId && w.projectId === id) return true;
              if (workId && wid === workId) return true;
              if (w.desc && w.desc.trim().toLowerCase() === proj.title.trim().toLowerCase()) return true;
              return false;
            });

            if (existingEntry) {
              const [existingWid, existingW] = existingEntry;
              workId = existingWid;
              await update(ref(db, `clients/${targetClientId}/work/${existingWid}`), {
                projectId: id,
                desc: proj.title.trim(),
                price: Number(existingW.price || existingW.amt) > 0 ? Number(existingW.price || existingW.amt) : projectAmount,
              });
            } else {
              const today = new Date().toISOString().split('T')[0];
              const workEntries = Object.entries(clientWork);
              const sectionMeta = getSectionMetaForSave(today, workEntries, null);
              const entry = {
                desc: proj.title.trim(),
                qty: 1,
                price: projectAmount,
                date: today,
                status: 'Pending',
                projectId: id,
                sectionKey: sectionMeta.key,
                sectionLabel: sectionMeta.label,
                sectionType: sectionMeta.type,
              };

              const newWorkRef = await push(ref(db, `clients/${targetClientId}/work`), entry);
              workId = newWorkRef.key;
            }
          }
        }
      }

      const updated = await updateProjectStatus(id, status, token, {
        amount: projectAmount,
        workId: workId,
      });

      if (status === 'completed' && projectAmount > 0) {
        showToast(`✅ Status completed & ₹${projectAmount.toLocaleString('en-IN')} added to ${proj.clientName || 'client'}'s work!`);
      } else {
        showToast('✅ Status updated!');
      }

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
  const missingDriveClientsCount = clientEntries.filter(([_, c]) => !c.driveFolderUrl).length;

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
        <div className="sidebar-header-row">
          <div className="sidebar-brand">
            <span className="sidebar-logo-emblem">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </span>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">{BRAND_NAME}</span>
              <span className="sidebar-brand-badge">ADMIN</span>
            </div>
          </div>

          <div className="sidebar-header-actions">
            <ThemeToggle compact={true} />
            <div className="header-mobile-avatar" title={`Admin: ${BRAND_NAME}`}>
              <span>{BRAND_NAME.charAt(0).toUpperCase()}</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Navigation</span>

          <button
            className={`sidebar-item${activeTab === 'dashboard' ? ' active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSelectedProject(null); }}
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
            className={`sidebar-item${activeTab === 'projects' ? ' active' : ''}`}
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </span>
            <span className="sidebar-item-label">Projects</span>
            {revisionCount > 0 && (
              <span className="wr-sidebar-badge badge-revision">
                {revisionCount}
              </span>
            )}
          </button>

          <button
            className={`sidebar-item${activeTab === 'requests' ? ' active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            <span className="sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            <span className="sidebar-item-label">Work Requests</span>
            {pendingCount > 0 && (
              <span className="wr-sidebar-badge badge-pending">{pendingCount}</span>
            )}
          </button>
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


      <main className="admin-main">

        <div className="admin-topbar">
          <div className="admin-topbar-inner">
            <div className="admin-topbar-title-group">
              <h1 className="admin-topbar-title">
                {activeTab === 'requests' ? 'Work Requests'
                  : activeTab === 'projects' ? (selectedProject ? selectedProject.title : 'Projects')
                    : 'Dashboard'}
              </h1>
              <p className="admin-topbar-sub">Welcome back, {BRAND_NAME} 👋</p>
            </div>

            <div className="admin-topbar-actions">
              {/* Topbar Search Pill */}
              <div className="topbar-search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search anything…"
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

              {/* Action Button: Create / Add Client */}
              {activeTab === 'dashboard' && (
                <button
                  type="button"
                  className="btn-create-pill"
                  onClick={() => {
                    const el = document.getElementById('quick-add-client-input');
                    if (el) {
                      el.focus();
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                >
                  <span className="btn-create-icon">＋</span> Add Client
                </button>
              )}

              {activeTab === 'projects' && !selectedProject && (
                <button
                  type="button"
                  className="btn-create-pill"
                  onClick={() => setShowCreateProject(true)}
                >
                  <span className="btn-create-icon">＋</span> Create Project
                </button>
              )}

              {activeTab === 'projects' && selectedProject && (
                <button className="btn-secondary" onClick={() => setSelectedProject(null)}>
                  ← All Projects
                </button>
              )}

              {/* Notification Bell */}
              <button
                type="button"
                className="topbar-icon-btn"
                title={`${pendingCount} pending requests, ${revisionCount} revisions`}
                onClick={() => {
                  if (revisionCount > 0) { setActiveTab('projects'); setSelectedProject(null); }
                  else if (pendingCount > 0) { setActiveTab('requests'); }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {(pendingCount > 0 || revisionCount > 0) && (
                  <span className="topbar-notif-dot" />
                )}
              </button>

              {/* User Avatar */}
              <div className="topbar-user-avatar" title={`Admin: ${BRAND_NAME}`}>
                <span>{BRAND_NAME.charAt(0).toUpperCase()}</span>
              </div>

              <button className="btn-logout-topbar" onClick={logout} title="Sign Out">
                🔒 Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* ── Dashboard tab ── */}
        {activeTab === 'dashboard' && (
          <>
            <div className="bento-overview-card">
              <div className="bento-overview-header">
                <div className="bento-overview-title-group">
                  <h2 className="bento-overview-title">Overview</h2>
                  <span className="bento-live-badge">
                    <span className="live-dot" /> Live Updates
                  </span>
                </div>
                <div className="bento-timeframe-pill">
                  <span>All time</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <div className="bento-stats-grid">
                {/* Revenue Card */}
                <div className="bento-stat-card stat-card-earned">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                        <path d="M12 18V6" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Total Revenue Earned</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className="bento-stat-val">₹{totalEarned.toLocaleString('en-IN')}</span>
                    <span className="bento-trend-pill trend-up">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                      Collected
                    </span>
                  </div>
                </div>

                {/* Pending Payments Card */}
                <div className="bento-stat-card stat-card-pending">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap icon-pending">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Pending Payments</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className="bento-stat-val val-pending">₹{totalPending.toLocaleString('en-IN')}</span>
                    <span className="bento-trend-pill trend-warning">
                      Due
                    </span>
                  </div>
                </div>

                {/* Active Clients Card */}
                <div className="bento-stat-card stat-card-clients">
                  <div className="bento-stat-top">
                    <div className="bento-stat-icon-wrap icon-clients">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <span className="bento-stat-label">Active Clients</span>
                  </div>
                  <div className="bento-stat-bottom">
                    <span className="bento-stat-val">{clientEntries.length}</span>
                    <span className="bento-trend-pill trend-neutral">
                      In Portal
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Client Setup / Avatars banner strip */}
              <div className="bento-client-strip">
                <div className="bento-client-strip-info">
                  <div className="bento-client-avatars">
                    {clientEntries.slice(0, 5).map(([id, c]) => (
                      <div key={id} className="bento-avatar-chip" title={c.name}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {clientEntries.length > 5 && (
                      <div className="bento-avatar-chip avatar-more" title={`${clientEntries.length - 5} more clients`}>
                        +{clientEntries.length - 5}
                      </div>
                    )}
                  </div>
                  <div className="bento-client-strip-text">
                    <strong>Quick Client Setup</strong>
                    <span>Add client name & notification email to instantly create portal credentials & drive</span>
                  </div>
                </div>

                <form className="bento-quick-add-form" onSubmit={handleAddClient} autoComplete="off">
                  <input
                    id="quick-add-client-input"
                    type="text"
                    placeholder="Client name…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    required
                  />
                  <input
                    type="email"
                    placeholder="Notification Email (optional)…"
                    value={newNotificationEmail}
                    onChange={e => setNewNotificationEmail(e.target.value)}
                  />
                  <button type="submit" className="btn-add-client" disabled={addBusy}>
                    {addBusy ? 'Creating…' : '＋ Add Client'}
                  </button>
                </form>
              </div>
            </div>

            <section className="admin-section">
              <div className="admin-clients-header">
                <div className="admin-clients-title-group">
                  <h2 className="section-title" style={{ margin: 0 }}>
                    {clientFilter === 'due' ? '💳 Clients with Payment Due' : '👥 All Clients'}
                  </h2>
                  <span className={`client-count-pill ${clientFilter === 'due' ? 'pill-due' : ''}`}>
                    {filteredClientEntries.length} {filteredClientEntries.length === 1 ? 'client' : 'clients'}
                  </span>
                  {missingDriveClientsCount > 0 && (
                    <button
                      type="button"
                      className="btn-drive-sync"
                      onClick={handleSyncAllDriveFolders}
                      disabled={syncDriveBusy}
                      title={`Create Google Drive folders for ${missingDriveClientsCount} existing client${missingDriveClientsCount > 1 ? 's' : ''}`}
                    >
                      {syncDriveBusy ? (
                        <>⏳ Syncing Drive Folders…</>
                      ) : (
                        <>📂 Sync Drive for Existing Clients ({missingDriveClientsCount})</>
                      )}
                    </button>
                  )}
                </div>

                <div className="admin-clients-filters">
                  <div className="client-search-box">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search client"
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
                      onCreateDriveFolder={handleCreateDriveFolder}
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
                      onClick={() => {
                        const clientObj = clients[p.firebaseClientId] || Object.values(clients).find(c => (c.uid && c.uid === p.clientFirebaseUid) || (c.name && c.name.toLowerCase() === (p.clientName || '').toLowerCase()));
                        setSelectedProject({
                          ...p,
                          driveFolderUrl: p.driveFolderUrl || clientObj?.driveFolderUrl || '',
                          clientEmail: clientObj?.notificationEmail || clientObj?.contactEmail || '',
                        });
                      }}
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
            onProjectUpdated={(updated) => { setSelectedProject(updated); loadProjects(); }}
            statusLabels={PROJECT_STATUS_LABELS}
            clients={clients}
            client={clients[selectedProject.firebaseClientId] || Object.values(clients).find(c => (c.uid && c.uid === selectedProject.clientFirebaseUid) || (c.name && c.name.toLowerCase() === (selectedProject.clientName || '').toLowerCase()))}
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
          driveFolderUrl={clients[previewTarget.clientId]?.driveFolderUrl}
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
                <label>Amount / Price (₹) <span className="opt">(optional)</span></label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 500"
                    value={newProjectAmount}
                    onChange={e => setNewProjectAmount(e.target.value)}
                    disabled={createBusy}
                  />
                </div>
                <span className="dlv-hint" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  When status is set to Completed, this amount is directly added to the client's work section.
                </span>
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
function ProjectDetailView({ project, getToken, onDelete, onStatusChange, onProjectUpdated, statusLabels, client, clients }) {
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

  const handleEditProjectAmount = async () => {
    const currentAmt = Number(project.amount || project.budget || 0);
    const entered = prompt(`Edit amount / price for "${project.title}" (₹):`, currentAmt || '');
    if (entered === null) return;
    const parsed = parseFloat(entered.trim());
    if (isNaN(parsed) || parsed < 0) {
      showToast('⚠️ Please enter a valid number', 'warn');
      return;
    }
    try {
      const t = await getToken();
      const updated = await updateProject(project._id, { amount: parsed, budget: parsed }, t);
      showToast(`✅ Price updated to ₹${parsed.toLocaleString('en-IN')}`);
      if (onProjectUpdated) onProjectUpdated(updated);

      // If already added to client's work section, sync the price there too!
      const cid = project.firebaseClientId;
      if (cid && clients?.[cid]?.work) {
        const matchEntry = Object.entries(clients[cid].work).find(([wid, w]) =>
          (w.projectId && w.projectId === project._id) || (project.workId && wid === project.workId)
        );
        if (matchEntry) {
          await update(ref(db, `clients/${cid}/work/${matchEntry[0]}`), { price: parsed });
        }
      }
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    }
  };

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
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Project Amount:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>
              ₹{(Number(project.amount || project.budget || 0)).toLocaleString('en-IN')}
            </span>
            <button
              type="button"
              className="dlv-btn dlv-btn--outline"
              style={{ padding: '2px 8px', fontSize: '12px' }}
              onClick={handleEditProjectAmount}
            >
              ✏️ Edit Price
            </button>
          </div>
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
          client={client}
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
function ClientCard({ id, client, onOpenWork, onShowCred, onSetupAuth, onReset, onUpdateEmail, onCreateDriveFolder, onPreview, onDelete, onCreateProject, onSendReminder, isSendingReminder }) {
  const [menuOpen, setMenuOpen] = useState(null); // 'top' | 'bottom' | null
  const [copied, setCopied] = useState(false);
  const topMenuRef = useRef(null);
  const bottomMenuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      const activeRef = menuOpen === 'top' ? topMenuRef : bottomMenuRef;
      if (activeRef.current && !activeRef.current.contains(e.target)) {
        setMenuOpen(null);
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

  const renderDropdown = (placement) => (
    <div className={`clean-card-dropdown dropdown-${placement}`}>
      <div className="clean-dropdown-header">Client Settings</div>

      <button
        type="button"
        className="clean-dropdown-item"
        onClick={() => {
          setMenuOpen(null);
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
          setMenuOpen(null);
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
          setMenuOpen(null);
          onUpdateEmail();
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Notifications
      </button>

      {client.driveFolderUrl ? (
        <a
          href={client.driveFolderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="clean-dropdown-item"
          onClick={() => setMenuOpen(null)}
          style={{ textDecoration: 'none' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open Drive Folder
        </a>
      ) : (
        <button
          type="button"
          className="clean-dropdown-item"
          onClick={() => {
            setMenuOpen(null);
            onCreateDriveFolder(id, client.name, client.notificationEmail);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          Create Drive Folder
        </button>
      )}

      <div className="clean-dropdown-divider" />

      <button
        type="button"
        className="clean-dropdown-item item-danger"
        onClick={() => {
          setMenuOpen(null);
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
  );

  return (
    <div className={`clean-client-card${menuOpen ? ' has-menu-open' : ''}`}>
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

              {client.driveFolderUrl ? (
                <a
                  href={client.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clean-meta-item"
                  title="Open Google Drive folder for this client"
                  style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                >
                  📂 Drive Folder ↗
                </a>
              ) : (
                <span
                  className="clean-meta-item"
                  onClick={() => onCreateDriveFolder(id, client.name, client.notificationEmail)}
                  title="Create Google Drive folder for this client"
                  style={{ cursor: 'pointer' }}
                >
                  📂 <span style={{ color: '#ea580c', fontWeight: 600 }}>+ Create Drive</span>
                </span>
              )}
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

          <div className="clean-menu-anchor" ref={topMenuRef}>
            <button
              type="button"
              className="clean-more-dot-btn"
              onClick={() => setMenuOpen(prev => (prev === 'top' ? null : 'top'))}
              title="More options"
              aria-expanded={menuOpen === 'top'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {menuOpen === 'top' && renderDropdown('top')}
          </div>
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
      <div className="clean-card-actions-bar">
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

        <div className="clean-menu-anchor" ref={bottomMenuRef}>
          <button
            type="button"
            className="clean-btn-card-more"
            onClick={() => setMenuOpen(prev => (prev === 'bottom' ? null : 'bottom'))}
            title="More client actions"
            aria-expanded={menuOpen === 'bottom'}
          >
            <span>••• More</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {menuOpen === 'bottom' && renderDropdown('bottom')}
        </div>
      </div>
    </div>
  );
}


