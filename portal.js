import {
  db, auth, secondaryAuth, authReady,
  ref, onValue, push, remove, update, set, get,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut
} from "./firebase.js";

// ════════════════════════════════════════════════════════
// 🔐 AUTH CONFIG
// ════════════════════════════════════════════════════════
// Admin email — set this to whichever email you created
// in Firebase Console → Authentication → Users.
// The password itself lives only in Firebase Auth (never in this file).
const ADMIN_EMAIL = "gtbtbhay22@gmail.com";

// Email domain used for client accounts (name → email).
const CLIENT_DOMAIN = "@gtportal.com";

// Default temp password given to new clients.
// Clients should be advised to change it after first login.
function clientEmail(name) {
  return name.toLowerCase().replace(/\s+/g, "") + CLIENT_DOMAIN;
}
function clientDefaultPass(name) {
  return name.slice(0, 2).toLowerCase() + "@123";
}

// ── State ─────────────────────────────────────────────
let currentUser  = null;   // { isAdmin, clientName? }
let allClients   = {};
let activeClientId  = null;
let editingWorkId   = null;
let pendingAdvClientId = null, pendingAdvWorkId = null;
let dbUnsubscribe   = null;   // detach listener on logout

// ── DOM: shared ───────────────────────────────────────
const loginScreen  = document.getElementById("loginScreen");
const portalScreen = document.getElementById("portalScreen");
const adminScreen  = document.getElementById("adminScreen");
const loginForm    = document.getElementById("loginForm");
const loginError   = document.getElementById("loginError");
const toastEl      = document.getElementById("toast");
const loginBtn     = loginForm.querySelector("button[type='submit']");

// ── DOM: client portal ────────────────────────────────
const portalName      = document.getElementById("portalName");
const summaryPaid     = document.getElementById("summaryPaid");
const summaryPending  = document.getElementById("summaryPending");
const summaryTotal    = document.getElementById("summaryTotal");
const workBody        = document.getElementById("workBody");
const workEmpty       = document.getElementById("workEmpty");
const workTable       = document.getElementById("workTable");
const greeting        = document.getElementById("greeting");

// ── DOM: admin summary ────────────────────────────────
const adminTotalEarned  = document.getElementById("adminTotalEarned");
const adminTotalPending = document.getElementById("adminTotalPending");
const adminTotalClients = document.getElementById("adminTotalClients");
const adminClientList   = document.getElementById("adminClientList");

// ── DOM: admin add-client form ────────────────────────
const adminClientForm  = document.getElementById("adminClientForm");
const adminClientName  = document.getElementById("adminClientName");
const adminSubmitBtn   = document.getElementById("adminSubmitBtn");

// ── DOM: admin work modal ─────────────────────────────
const adminWorkModal       = document.getElementById("adminWorkModal");
const adminWorkModalTitle  = document.getElementById("adminWorkModalTitle");
const adminWorkForm        = document.getElementById("adminWorkForm");
const adminWorkBody        = document.getElementById("adminWorkBody");
const adminWorkTable       = document.getElementById("adminWorkTable");
const adminWorkEmpty       = document.getElementById("adminWorkEmpty");
const adminWorkSubtotal    = document.getElementById("adminWorkSubtotal");
const adminWorkSubmitBtn   = document.getElementById("adminWorkSubmitBtn");
const adminCancelWorkEdit  = document.getElementById("adminCancelWorkEdit");

// ── DOM: admin advance modal ──────────────────────────
const adminAdvModal  = document.getElementById("adminAdvModal");
const adminAdvAmount = document.getElementById("adminAdvAmount");
const adminAdvInfo   = document.getElementById("adminAdvInfo");

// ════════════════════════════════════════════════════════
// DB LISTENER  (set up after login, torn down on logout)
// ════════════════════════════════════════════════════════
function setupDbListener() {
  if (dbUnsubscribe) dbUnsubscribe();   // detach any previous listener
  dbUnsubscribe = onValue(ref(db, "clients"), (snapshot) => {
    allClients = snapshot.val() || {};
    Object.keys(allClients).forEach(id => {
      if (!allClients[id].work) allClients[id].work = {};
    });
    if (!currentUser) return;
    if (currentUser.isAdmin) renderAdmin();
    else renderPortal();
  }, (err) => {
    console.error("Firebase error:", err);
    showToast("⚠️ Connection error — retrying…", "warn");
  });
}

// ════════════════════════════════════════════════════════
// SESSION RESTORE  (runs on page load)
// ════════════════════════════════════════════════════════
authReady.then(async (user) => {
  if (!user) return;   // no prior session — show login screen (default)
  try {
    await resolveRole(user);
  } catch (err) {
    console.error("Session restore failed:", err);
    await signOut(auth);
  }
}).catch(() => showToast("⚠️ Auth error — refresh the page", "warn"));

async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    // Stamp / refresh admin UID in DB (idempotent)
    await set(ref(db, "adminUid"), user.uid).catch(() => {});
    currentUser = { isAdmin: true };
    setupDbListener();
    showAdminPanel();
  } else {
    // 1️⃣ Try matching by Firebase UID (new clients created after auth update)
    const snap = await get(ref(db, "clients"));
    const clients = snap.val() || {};
    let match = Object.entries(clients).find(([, c]) => c.uid === user.uid);

    // 2️⃣ Fallback: match by name derived from email (existing/legacy clients)
    //    e.g. user.email = "rahul@gtportal.com" → slug = "rahul"
    //    find client whose name.toLowerCase().replace(spaces,'') === slug
    if (!match && user.email && user.email.endsWith(CLIENT_DOMAIN)) {
      const slug = user.email.slice(0, -CLIENT_DOMAIN.length);
      match = Object.entries(clients).find(([, c]) =>
        c.name && c.name.toLowerCase().replace(/\s+/g, "") === slug
      );
      if (match) {
        // Auto-link the uid so future logins use the fast UID path
        update(ref(db, `clients/${match[0]}`), { uid: user.uid }).catch(() => {});
      }
    }

    if (!match) { await signOut(auth); return; }   // uid not in DB → force logout
    currentUser = { isAdmin: false, clientName: match[1].name };
    allClients  = clients;
    Object.keys(allClients).forEach(id => {
      if (!allClients[id].work) allClients[id].work = {};
    });
    setupDbListener();
    showPortal();
  }
}

// ════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputUser = document.getElementById("inputUser").value.trim();
  const inputPass = document.getElementById("inputPass").value;

  // Derive email:
  //   "GT" or "Admin" → admin email
  //   anything else   → client email pattern (name@gtportal.com)
  const isAdminAttempt = inputUser.toLowerCase() === "gt" ||
                         inputUser.toLowerCase() === "admin";
  const email = isAdminAttempt ? ADMIN_EMAIL : clientEmail(inputUser);

  setLoginBusy(true);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, inputPass);
    loginError.style.display = "none";
    await resolveRole(cred.user);
  } catch (err) {
    console.error("Login error:", err.code, err.message);

    // ── Legacy client migration ──────────────────────────
    // Firebase Auth v10 returns "auth/invalid-credential" for both
    // wrong-password AND user-not-found. We attempt legacy migration
    // for clients only (not admin), so any failed client login gets
    // a chance to auto-migrate from the old DB-only auth system.
    if (!isAdminAttempt &&
        (err.code === "auth/user-not-found" ||
         err.code === "auth/invalid-credential")) {
      await tryMigrateLegacyClient(inputUser, inputPass, email);
    } else {
      const msg = err.code === "auth/too-many-requests"
        ? "❌ Too many attempts — try again later."
        : "❌ Invalid username or password.";
      showLoginError(msg);
    }
  } finally {
    setLoginBusy(false);
  }
});

// ── Legacy client migration ───────────────────────────
// Runs when a client's email is NOT found in Firebase Auth.
// Steps:
//   1. Sign in anonymously to get DB read access
//   2. Find client in DB by name (case-insensitive)
//   3. Verify their old-style OR new-style password
//   4. Auto-create their Firebase Auth account (via secondaryAuth)
//   5. Link the new UID back to their DB record
//   6. Sign in properly with the real account
async function tryMigrateLegacyClient(inputUser, inputPass, email) {
  try {
    // Step 1 — anonymous sign-in for temporary DB access
    await signInAnonymously(auth);

    // Step 2 — find client by name
    const snap    = await get(ref(db, "clients"));
    const clients = snap.val() || {};
    const match   = Object.entries(clients).find(([, c]) =>
      c.name && c.name.toLowerCase() === inputUser.toLowerCase()
    );

    if (!match) {
      await signOut(auth);
      showLoginError("❌ No account found with that username.");
      return;
    }

    const [clientId, clientData] = match;

    // Step 3 — accept old password (first2+123) OR new (first2.lower+@123)
    const oldPass = clientData.name.slice(0, 2) + "123";
    const newPass = clientDefaultPass(clientData.name);
    if (inputPass !== oldPass && inputPass !== newPass) {
      await signOut(auth);
      showLoginError("❌ Incorrect password.");
      return;
    }

    // Step 4 — create Firebase Auth account (secondary app → admin stays signed in)
    showToast("🔄 Setting up your account…");
    let finalEmail    = email;
    let finalPassword = newPass;   // always normalise to new format

    let newUid;
    try {
      const newCred = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, finalPassword);
      newUid = newCred.user.uid;
    } catch (createErr) {
      if (createErr.code === "auth/email-already-in-use") {
        // Account exists (e.g. from a previous partial migration).
        // We can't get the UID here without the password — just sign in.
        // Fall through and try signInWithEmailAndPassword below.
        newUid = clientData.uid || null;
      } else {
        throw createErr;
      }
    }

    // Step 5 — sign out anonymous session, sign in as the real client
    await signOut(auth);
    const realCred = await signInWithEmailAndPassword(auth, finalEmail, finalPassword);

    // Step 6 — link UID to DB record now that we're signed in as the real client
    // The client's real uid can write to their own record once resolveRole
    // has set up the DB listener. We do this before resolveRole so the
    // UID is in DB for future fast-path lookups.
    if (newUid && newUid !== clientData.uid) {
      // Temporarily set uid so resolveRole's email-fallback links it automatically
      await update(ref(db, `clients/${clientId}`), { uid: newUid }).catch(() => {});
    }

    loginError.style.display = "none";
    await resolveRole(realCred.user);
    showToast(`✅ Welcome, ${clientData.name}!`);

  } catch (migrateErr) {
    console.error("Migration error:", migrateErr.code, migrateErr.message);
    await signOut(auth).catch(() => {});

    if (migrateErr.code === "auth/too-many-requests") {
      showLoginError("❌ Too many attempts — try again later.");
    } else {
      showLoginError("❌ Invalid username or password.");
    }
  }
}

function setLoginBusy(busy) {
  loginBtn.disabled = busy;
  loginBtn.textContent = busy ? "Signing in…" : "Sign In →";
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
  const box = document.querySelector(".login-box");
  box.classList.remove("shake");
  void box.offsetWidth;
  box.classList.add("shake");
}

// ── Logout ────────────────────────────────────────────
document.querySelectorAll(".logout-btn").forEach(btn =>
  btn.addEventListener("click", async () => {
    if (dbUnsubscribe) { dbUnsubscribe(); dbUnsubscribe = null; }
    await signOut(auth);
    currentUser = activeClientId = editingWorkId = null;
    loginScreen.style.display  = "flex";
    portalScreen.style.display = "none";
    adminScreen.style.display  = "none";
    loginForm.reset();
  })
);

// ════════════════════════════════════════════════════════
// CLIENT PORTAL VIEW
// ════════════════════════════════════════════════════════
function showPortal() {
  loginScreen.style.display  = "none";
  portalScreen.style.display = "flex";
  adminScreen.style.display  = "none";
  portalName.textContent = currentUser.clientName;
  greeting.textContent   = `Hello, ${currentUser.clientName} 👋`;
  renderPortal();
}

function renderPortal() {
  const entry = Object.entries(allClients).find(
    ([, c]) => c.name?.toLowerCase() === currentUser.clientName.toLowerCase()
  );
  if (!entry) {
    workEmpty.style.display = "block";
    workTable.style.display = "none";
    summaryPaid.textContent = summaryPending.textContent = summaryTotal.textContent = "₹0";
    return;
  }
  const [, client] = entry;
  const work = Object.entries(client.work || {}).map(([id, w]) => ({ id, ...w }));
  let paid = 0, pending = 0, total = 0;
  work.forEach(w => {
    const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
    total += amt;
    if (w.status === "Paid") { paid += amt; }
    else if (w.status === "Advance") { const adv = Number(w.advance || 0); paid += adv; pending += (amt - adv); }
    else { pending += amt; }
  });
  summaryPaid.textContent    = "₹" + paid.toLocaleString("en-IN");
  summaryPending.textContent = "₹" + pending.toLocaleString("en-IN");
  summaryTotal.textContent   = "₹" + total.toLocaleString("en-IN");

  if (work.length === 0) {
    workEmpty.style.display = "block"; workTable.style.display = "none"; return;
  }
  workEmpty.style.display = "none"; workTable.style.display = "";

  const sections = buildWorkSections(work);
  workBody.innerHTML = sections.map((section) => {
    const sectionRows = section.rows.map((w, i) => {
      const qty = Number(w.qty || 1), price = Number(w.price || w.amt || 0);
      const lineTotal = qty * price;
      const status  = w.status || "Pending";
      const advAmt  = Number(w.advance || 0);
      const amtDue  = status === "Pending" ? lineTotal : status === "Advance" ? lineTotal - advAmt : 0;
      const badge   = `<span class="badge badge-${status.toLowerCase()}">${status === "Pending" ? "⏳ Pending" : status === "Advance" ? "💰 Advance" : "✅ Paid"
        }</span>`;
      const dueCell = amtDue > 0
        ? `<span class="due-highlight">₹${amtDue.toLocaleString("en-IN")}</span>`
        : `<span class="due-clear">—</span>`;
      return `<tr>
        <td class="col-num" data-label="#">${i + 1}</td>
        <td class="col-desc" data-label="Description">${escHtml(w.desc)}${w.date ? `<br><small class="row-date">${formatDate(w.date)}</small>` : ""}</td>
        <td class="col-num" data-label="Qty">${qty}</td>
        <td class="col-amt" data-label="Unit Price">₹${price.toLocaleString("en-IN")}</td>
        <td class="col-amt col-total" data-label="Total">₹${lineTotal.toLocaleString("en-IN")}</td>
        <td class="col-status" data-label="Status">${badge}</td>
        <td class="col-amt col-due" data-label="Amount Due">${dueCell}</td>
      </tr>`;
    }).join("");

    return `<tr class="section-header"><td colspan="7">${escHtml(section.label)}</td></tr>${sectionRows}`;
  }).join("");
}

// ════════════════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════════════════
function showAdminPanel() {
  loginScreen.style.display  = "none";
  portalScreen.style.display = "none";
  adminScreen.style.display  = "block";
  renderAdmin();
}

function renderAdmin() {
  // Summary
  let earned = 0, pending = 0;
  Object.values(allClients).forEach(c => {
    Object.values(c.work || {}).forEach(w => {
      const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
      if (w.status === "Paid") { earned += amt; }
      else if (w.status === "Advance") { const adv = Number(w.advance || 0); earned += adv; pending += (amt - adv); }
      else { pending += amt; }
    });
  });
  adminTotalEarned.textContent  = "₹" + earned.toLocaleString("en-IN");
  adminTotalPending.textContent = "₹" + pending.toLocaleString("en-IN");
  adminTotalClients.textContent = Object.keys(allClients).length;

  // Client cards
  const entries = Object.entries(allClients);
  if (entries.length === 0) {
    adminClientList.innerHTML = `<div class="admin-empty"><div class="empty-icon">📋</div><p>No clients yet. Add your first client above.</p></div>`;
    return;
  }
  adminClientList.innerHTML = entries.map(([id, c]) => {
    const work = Object.values(c.work || {});
    let paidAmt = 0, pendingAmt = 0;
    work.forEach(w => {
      const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
      if (w.status === "Paid") { paidAmt += amt; }
      else if (w.status === "Advance") { paidAmt += Number(w.advance || 0); pendingAmt += (amt - Number(w.advance || 0)); }
      else { pendingAmt += amt; }
    });
    const email   = clientEmail(c.name);
    const hasAuth = !!c.uid;   // false for clients added before auth update
    return `
    <div class="admin-client-card${hasAuth ? "" : " card-no-auth"}">
      <div class="admin-card-left">
        <div class="admin-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="admin-card-info">
          <h3 class="admin-card-name">${escHtml(c.name)}</h3>
          ${!hasAuth ? `<div class="no-auth-badge">⚠️ No login account yet</div>` : ""}
          <div class="admin-card-stats">
            <span class="astat">📦 ${work.length} items</span>
            <span class="astat paid-stat">💰 ₹${paidAmt.toLocaleString("en-IN")}</span>
            <span class="astat pend-stat">⏳ ₹${pendingAmt.toLocaleString("en-IN")}</span>
          </div>
          <div class="admin-cred-row">
            <span class="cred-chip">👤 ${escHtml(c.name)}</span>
            <span class="cred-chip">📧 ${escHtml(email)}</span>
          </div>
        </div>
      </div>
      <div class="admin-card-actions">
        ${!hasAuth
          ? `<button class="btn-setup-auth" onclick="adminSetupClientAuth('${id}','${escHtml(c.name)}')">🔑 Setup Login</button>`
          : `<button class="btn-cred" onclick="adminShowCred('${escHtml(c.name)}')">🔐</button>`
        }
        <button class="btn-work" onclick="adminOpenWork('${id}')">📋 Work</button>
        <button class="btn-delete-card" onclick="adminDeleteClient('${id}')">🗑️</button>
      </div>
    </div>`;
  }).join("");
}

// ── Add Client ────────────────────────────────────────
adminClientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = adminClientName.value.trim();
  if (!name) { showToast("⚠️ Client name required", "warn"); return; }

  const email    = clientEmail(name);
  const password = clientDefaultPass(name);

  adminSubmitBtn.disabled    = true;
  adminSubmitBtn.textContent = "Creating…";

  try {
    // Create Firebase Auth account via secondary app (so admin stays signed in)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid  = cred.user.uid;

    // Save client record to DB (with their Firebase Auth UID)
    await push(ref(db, "clients"), { name, uid, work: {} });

    showToast("🎉 Client added!");
    adminShowCred(name);          // show credentials modal
    adminClientForm.reset();
  } catch (err) {
    console.error(err);
    if (err.code === "auth/email-already-in-use") {
      showToast(`⚠️ "${name}" already has an account`, "warn");
    } else {
      showToast("❌ Failed to create client — check console", "warn");
    }
  } finally {
    adminSubmitBtn.disabled    = false;
    adminSubmitBtn.textContent = "Add Client";
  }
});

// ── Setup login for existing (legacy) clients ─────────
// Called when a client card shows "⚠️ No login account yet".
// Creates a Firebase Auth account via secondary app (admin stays signed in)
// and writes the uid back to the DB record.
window.adminSetupClientAuth = async (id, name) => {
  const email    = clientEmail(name);
  const password = clientDefaultPass(name);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await update(ref(db, `clients/${id}`), { uid: cred.user.uid });
    showToast(`✅ Login created for ${name}!`);
    adminShowCred(name);
  } catch (err) {
    console.error("Setup auth error:", err);
    if (err.code === "auth/email-already-in-use") {
      // Auth account already exists (e.g. created from a previous attempt)
      // — just show creds, the email-fallback in resolveRole will handle the match
      showToast(`ℹ️ Account already exists — credentials unchanged`, "warn");
      adminShowCred(name);
    } else {
      showToast(`❌ Failed to create login: ${err.message}`, "warn");
    }
  }
};

// ── Delete Client ─────────────────────────────────────
window.adminDeleteClient = (id) => {
  if (!confirm("Remove this client and all their work?\n")) return;
  remove(ref(db, "clients/" + id))
    .then(() => showToast("🗑️ Client removed"))
    .catch(err => { console.error(err); showToast("❌ Delete failed", "warn"); });
};

// ── Credential modal ──────────────────────────────────
window.adminShowCred = (name) => {
  const email    = clientEmail(name);
  const password = clientDefaultPass(name);
  document.getElementById("adminCredUser").textContent  = name;
  document.getElementById("adminCredEmail").textContent = email;
  document.getElementById("adminCredPass").textContent  = password;
  document.getElementById("adminCredModal").style.display = "flex";
};
document.getElementById("adminCredClose").addEventListener("click", () => {
  document.getElementById("adminCredModal").style.display = "none";
});
document.getElementById("adminCredModal").addEventListener("click", e => {
  if (e.target === document.getElementById("adminCredModal"))
    document.getElementById("adminCredModal").style.display = "none";
});
window.adminCopyCredText = () => {
  const name  = document.getElementById("adminCredUser").textContent;
  const email = document.getElementById("adminCredEmail").textContent;
  const pass  = document.getElementById("adminCredPass").textContent;
  navigator.clipboard.writeText(`Username: ${name}\nEmail: ${email}\nPassword: ${pass}`)
    .then(() => showToast("📋 Credentials copied!"));
};

// ════════════════════════════════════════════════════════
// ADMIN — WORK MODAL
// ════════════════════════════════════════════════════════
window.adminOpenWork = (clientId) => {
  activeClientId = clientId;
  editingWorkId  = null;
  adminWorkModalTitle.textContent = `Work Items — ${allClients[clientId].name}`;
  adminWorkModal.style.display    = "flex";
  document.body.style.overflow    = "hidden";
  resetAdminWorkForm();
  refreshAdminWork();
};

function refreshAdminWork() {
  if (!activeClientId) return;
  const work = allClients[activeClientId]?.work || {};
  renderAdminWorkTable(work);
  const sub = Object.values(work).reduce((s, w) => s + (Number(w.qty || 1) * Number(w.price || w.amt || 0)), 0);
  adminWorkSubtotal.textContent = "₹" + sub.toLocaleString("en-IN");
}

function renderAdminWorkTable(work) {
  const entries = Object.entries(work).map(([wid, w]) => ({ wid, ...w }));
  if (entries.length === 0) {
    adminWorkTable.style.display = "none"; adminWorkEmpty.style.display = "block"; return;
  }
  adminWorkTable.style.display = ""; adminWorkEmpty.style.display = "none";
  const sections = buildWorkSections(entries);
  adminWorkBody.innerHTML = sections.map((section) => {
    const sectionRows = section.rows.map((w) => {
      const qty = Number(w.qty || 1), price = Number(w.price || w.amt || 0);
      const lineTotal = qty * price;
      const wStatus = w.status || "Pending";
      const isAdv   = wStatus === "Advance";
      const advAmt  = Number(w.advance || 0);
      const sc      = wStatus.toLowerCase();
      const statusCell = `
        <select class="work-status-select s-${sc}" onchange="adminChangeStatus('${activeClientId}','${w.wid}',this.value)">
          <option value="Pending" ${wStatus === "Pending" ? "selected" : ""}>⏳ Pending</option>
          <option value="Advance" ${wStatus === "Advance" ? "selected" : ""}>💰 Advance</option>
          <option value="Paid"    ${wStatus === "Paid"    ? "selected" : ""}>💚 Paid</option>
        </select>
        ${isAdv ? `<span class="adv-remain">₹${advAmt.toLocaleString("en-IN")} paid · ₹${(lineTotal - advAmt).toLocaleString("en-IN")} due</span>` : ""}`;
      return `<tr>
        <td class="col-num">${section.rows.indexOf(w) + 1}</td>
        <td class="col-desc">${escHtml(w.desc)}${w.date ? `<br><small class="row-date">${formatDate(w.date)}</small>` : ""}</td>
        <td class="col-num">${qty}</td>
        <td class="col-amt">₹${price.toLocaleString("en-IN")}</td>
        <td class="col-amt col-total">₹${lineTotal.toLocaleString("en-IN")}</td>
        <td class="col-status">${statusCell}</td>
        <td class="col-actions">
          <button class="btn-row-action edit" onclick="adminEditWork('${w.wid}')" title="Edit">✏️</button>
          <button class="btn-row-action del"  onclick="adminDeleteWork('${activeClientId}','${w.wid}')" title="Delete">🗑️</button>
        </td>
      </tr>`;
    }).join("");

    return `<tr class="section-header"><td colspan="7">${escHtml(section.label)}</td></tr>${sectionRows}`;
  }).join("");
}

adminWorkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const desc  = document.getElementById("adminWorkDesc").value.trim();
  const qty   = parseInt(document.getElementById("adminWorkQty").value) || 1;
  const price = parseFloat(document.getElementById("adminWorkPrice").value);
  const date  = document.getElementById("adminWorkDate").value || new Date().toISOString().split("T")[0];
  if (!desc || isNaN(price)) { showToast("⚠️ Fill description and price", "warn"); return; }
  const workEntries  = Object.entries(allClients[activeClientId]?.work || {});
  const sectionMeta  = getSectionMetaForSave(date, workEntries, editingWorkId);
  const entry = {
    desc, qty, price, date,
    status: editingWorkId
      ? (allClients[activeClientId]?.work?.[editingWorkId]?.status || "Pending")
      : "Pending",
    sectionKey:   sectionMeta.key,
    sectionLabel: sectionMeta.label,
    sectionType:  sectionMeta.type
  };
  if (editingWorkId) {
    update(ref(db, `clients/${activeClientId}/work/${editingWorkId}`), entry)
      .then(() => { showToast("✅ Item updated!"); resetAdminWorkForm(); refreshAdminWork(); renderAdmin(); })
      .catch(err => { console.error(err); showToast("❌ Save failed", "warn"); });
  } else {
    push(ref(db, `clients/${activeClientId}/work`), entry)
      .then(() => { showToast("✅ Work added!"); resetAdminWorkForm(); refreshAdminWork(); renderAdmin(); })
      .catch(err => { console.error(err); showToast("❌ Save failed", "warn"); });
  }
});

window.adminEditWork = (wid) => {
  const w = allClients[activeClientId]?.work?.[wid];
  if (!w) return;
  editingWorkId = wid;
  document.getElementById("adminWorkDesc").value  = w.desc;
  document.getElementById("adminWorkQty").value   = w.qty || 1;
  document.getElementById("adminWorkPrice").value = w.price || w.amt || "";
  document.getElementById("adminWorkDate").value  = w.date || "";
  adminWorkSubmitBtn.textContent          = "✅ Update Item";
  adminCancelWorkEdit.style.display       = "inline-block";
};

window.adminDeleteWork = (clientId, workId) => {
  remove(ref(db, `clients/${clientId}/work/${workId}`))
    .then(() => {
      showToast("🗑️ Item removed");
      if (activeClientId === clientId) { refreshAdminWork(); renderAdmin(); }
    })
    .catch(err => { console.error(err); showToast("❌ Delete failed", "warn"); });
};

window.adminChangeStatus = (clientId, workId, newStatus) => {
  if (newStatus === "Advance") {
    openAdminAdvance(clientId, workId);
  } else {
    update(ref(db, `clients/${clientId}/work/${workId}`), { status: newStatus, advance: 0 })
      .then(() => {
        showToast(newStatus === "Paid" ? "✅ Marked Paid" : "↩️ Marked Pending");
        if (activeClientId === clientId) { refreshAdminWork(); renderAdmin(); }
      })
      .catch(err => { console.error(err); showToast("❌ Update failed", "warn"); refreshAdminWork(); });
  }
};

adminCancelWorkEdit.addEventListener("click", resetAdminWorkForm);
function resetAdminWorkForm() {
  adminWorkForm.reset();
  document.getElementById("adminWorkQty").value = 1;
  editingWorkId = null;
  adminWorkSubmitBtn.textContent    = "＋ Add Item";
  adminCancelWorkEdit.style.display = "none";
}

document.getElementById("adminCloseWork").addEventListener("click", closeAdminWorkModal);
document.getElementById("adminCloseWork2").addEventListener("click", closeAdminWorkModal);
adminWorkModal.addEventListener("click", e => { if (e.target === adminWorkModal) closeAdminWorkModal(); });
function closeAdminWorkModal() {
  adminWorkModal.style.display = "none";
  document.body.style.overflow = "";
  activeClientId = editingWorkId = null;
}

// ════════════════════════════════════════════════════════
// ADMIN — ADVANCE MODAL
// ════════════════════════════════════════════════════════
function openAdminAdvance(clientId, workId) {
  const w = allClients[clientId]?.work?.[workId];
  const lineTotal = w ? (Number(w.qty || 1) * Number(w.price || w.amt || 0)) : 0;
  pendingAdvClientId = clientId; pendingAdvWorkId = workId;
  adminAdvAmount.value = w?.advance || "";
  adminAdvInfo.textContent = `Total: ₹${lineTotal.toLocaleString("en-IN")}`;
  adminAdvModal.style.display = "flex";
  setTimeout(() => adminAdvAmount.focus(), 50);
}
function closeAdminAdvance(cancelled) {
  adminAdvModal.style.display = "none";
  if (cancelled) refreshAdminWork();
  pendingAdvClientId = pendingAdvWorkId = null;
}
document.getElementById("adminAdvConfirmBtn").addEventListener("click", () => {
  const amount = parseFloat(adminAdvAmount.value);
  if (isNaN(amount) || amount < 0) { showToast("⚠️ Enter a valid amount", "warn"); return; }
  update(ref(db, `clients/${pendingAdvClientId}/work/${pendingAdvWorkId}`), { status: "Advance", advance: amount })
    .then(() => { showToast("💰 Advance saved!"); closeAdminAdvance(); refreshAdminWork(); renderAdmin(); })
    .catch(err => { console.error(err); showToast("❌ Save failed", "warn"); });
});
document.getElementById("adminAdvCancelBtn").addEventListener("click", () => closeAdminAdvance(true));
adminAdvModal.addEventListener("click", e => { if (e.target === adminAdvModal) closeAdminAdvance(true); });
adminAdvAmount.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("adminAdvConfirmBtn").click(); });

// ════════════════════════════════════════════════════════
// TOAST & HELPERS
// ════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = "success") {
  toastEl.textContent = msg;
  toastEl.className   = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day} ${months[parseInt(m) - 1]} ${y}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function normalizeDate(dateValue) {
  if (!dateValue) return null;
  const [y, m, d] = String(dateValue).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function compareWorkDates(a, b) {
  const da = normalizeDate(a);
  const db = normalizeDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

function getIsoWeekKey(dateValue) {
  const date = normalizeDate(dateValue) || new Date();
  const temp = new Date(date);
  temp.setHours(0, 0, 0, 0);
  const day = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - day);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((temp - yearStart) / 86400000) + 1;
  const week      = Math.ceil(dayOfYear / 7);
  return `${temp.getFullYear()}-${week}`;
}

function getMonthKey(dateValue) {
  const date = normalizeDate(dateValue) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildSectionLabel(dateValue, type) {
  const date = normalizeDate(dateValue) || new Date();
  if (type === "month") {
    return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const week = getIsoWeekKey(dateValue);
  const [, weekNo] = week.split("-");
  return `Week ${weekNo} • ${date.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
}

function getWorkSectionMeta(dateValue, previousItem) {
  const monthKey = getMonthKey(dateValue);
  const weekKey  = getIsoWeekKey(dateValue);

  if (!previousItem) {
    return { key: `month:${monthKey}`, label: buildSectionLabel(dateValue, "month"), type: "month" };
  }

  const prevMonthKey = getMonthKey(previousItem.date);
  const prevWeekKey  = getIsoWeekKey(previousItem.date);

  if (monthKey !== prevMonthKey) {
    return { key: `month:${monthKey}`, label: buildSectionLabel(dateValue, "month"), type: "month" };
  }
  if (weekKey !== prevWeekKey) {
    return { key: `week:${weekKey}`, label: buildSectionLabel(dateValue, "week"), type: "week" };
  }
  return {
    key:   previousItem.sectionKey   || `week:${weekKey}`,
    label: previousItem.sectionLabel || buildSectionLabel(dateValue, "week"),
    type:  previousItem.sectionType  || "week"
  };
}

function getSectionMetaForSave(dateValue, existingWorkEntries, currentWorkId) {
  const items  = existingWorkEntries
    .filter(([id]) => id !== currentWorkId)
    .map(([id, item]) => ({ id, ...item }));
  const latest = [...items].sort((a, b) => compareWorkDates(a.date, b.date)).pop();
  return getWorkSectionMeta(dateValue, latest);
}

function buildWorkSections(items) {
  const sorted = [...items].sort((a, b) => compareWorkDates(a.date, b.date));
  const sections = [];
  let currentSection = null;
  let previousItem   = null;

  sorted.forEach((item) => {
    const meta = getWorkSectionMeta(item.date, previousItem);
    if (!currentSection || currentSection.key !== meta.key) {
      currentSection = { key: meta.key, label: meta.label, rows: [] };
      sections.push(currentSection);
    }
    currentSection.rows.push(item);
    previousItem = item;
  });

  return sections;
}

// ════════════════════════════════════════════════════════
// INVOICE PDF DOWNLOAD
// ════════════════════════════════════════════════════════
window.downloadInvoice = () => {
  if (!currentUser || currentUser.isAdmin) return;

  const entry = Object.entries(allClients).find(
    ([, c]) => c.name?.toLowerCase() === currentUser.clientName.toLowerCase()
  );
  if (!entry) { showToast("⚠️ No data to export", "warn"); return; }
  const [, client] = entry;
  const work = Object.values(client.work || {});

  document.getElementById("invClientName").textContent = client.name;
  document.getElementById("invDate").textContent = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric"
  });

  let total = 0;
  document.getElementById("invTableBody").innerHTML = work.map((w, i) => {
    const qty       = Number(w.qty   || 1);
    const price     = Number(w.price || w.amt || 0);
    const lineTotal = qty * price;
    total += lineTotal;
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(w.desc)}</td>
      <td>${w.date ? formatDate(w.date) : "—"}</td>
      <td>${qty}</td>
      <td>₹${price.toLocaleString("en-IN")}</td>
      <td>₹${lineTotal.toLocaleString("en-IN")}</td>
    </tr>`;
  }).join("");

  document.getElementById("invSubtotal").textContent   = "₹" + total.toLocaleString("en-IN");
  document.getElementById("invGrandTotal").textContent = "₹" + total.toLocaleString("en-IN");

  const area = document.getElementById("invoicePrintArea");
  area.style.display = "block";
  window.print();
  area.style.display = "none";
};
