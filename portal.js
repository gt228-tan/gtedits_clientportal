import { db, ref, onValue, push, remove, update } from "./firebase.js";

// ════════════════════════════════════════════════════════
// 🔐 ADMIN CREDENTIALS — Set yours below, then save
// ════════════════════════════════════════════════════════
const ADMIN_USERNAME = "GT";   // ← change this
const ADMIN_PASSWORD = "GT@123";   // ← change this

// ── Credential algorithm (must match app.js) ──────────
function genUsername(name) { return name; }
function genPassword(name) { return name.slice(0, 2) + "123"; }

// ── State ─────────────────────────────────────────────
let currentUser = null;   // { isAdmin, clientName? }
let allClients = {};
let activeClientId = null;   // for admin work modal
let editingWorkId = null;
let pendingAdvClientId = null, pendingAdvWorkId = null;

// ── DOM: shared ───────────────────────────────────────
const loginScreen = document.getElementById("loginScreen");
const portalScreen = document.getElementById("portalScreen");
const adminScreen = document.getElementById("adminScreen");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const toastEl = document.getElementById("toast");

// ── DOM: client portal ────────────────────────────────
const portalName = document.getElementById("portalName");
const summaryPaid = document.getElementById("summaryPaid");
const summaryPending = document.getElementById("summaryPending");
const summaryTotal = document.getElementById("summaryTotal");
const workBody = document.getElementById("workBody");
const workEmpty = document.getElementById("workEmpty");
const workTable = document.getElementById("workTable");
const greeting = document.getElementById("greeting");

// ── DOM: admin summary ────────────────────────────────
const adminTotalEarned = document.getElementById("adminTotalEarned");
const adminTotalPending = document.getElementById("adminTotalPending");
const adminTotalClients = document.getElementById("adminTotalClients");
const adminClientList = document.getElementById("adminClientList");

// ── DOM: admin add-client form ────────────────────────
const adminClientForm = document.getElementById("adminClientForm");
const adminClientName = document.getElementById("adminClientName");
const adminSubmitBtn = document.getElementById("adminSubmitBtn");

// ── DOM: admin work modal ─────────────────────────────
const adminWorkModal = document.getElementById("adminWorkModal");
const adminWorkModalTitle = document.getElementById("adminWorkModalTitle");
const adminWorkForm = document.getElementById("adminWorkForm");
const adminWorkBody = document.getElementById("adminWorkBody");
const adminWorkTable = document.getElementById("adminWorkTable");
const adminWorkEmpty = document.getElementById("adminWorkEmpty");
const adminWorkSubtotal = document.getElementById("adminWorkSubtotal");
const adminWorkSubmitBtn = document.getElementById("adminWorkSubmitBtn");
const adminCancelWorkEdit = document.getElementById("adminCancelWorkEdit");

// ── DOM: admin advance modal ──────────────────────────
const adminAdvModal = document.getElementById("adminAdvModal");
const adminAdvAmount = document.getElementById("adminAdvAmount");
const adminAdvInfo = document.getElementById("adminAdvInfo");

// ── Firebase live listener ────────────────────────────
onValue(ref(db, "clients"), (snapshot) => {
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

// ════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const inputUser = document.getElementById("inputUser").value.trim();
  const inputPass = document.getElementById("inputPass").value;

  // Admin check
  if (inputUser === ADMIN_USERNAME && inputPass === ADMIN_PASSWORD) {
    loginError.style.display = "none";
    currentUser = { isAdmin: true };
    showAdminPanel();
    return;
  }

  // Client check (case-insensitive name match)
  const match = Object.entries(allClients).find(([, c]) =>
    c.name && c.name.toLowerCase() === inputUser.toLowerCase()
  );
  if (!match) { showLoginError("❌ No account found with that username."); return; }

  const [, clientData] = match;
  if (inputPass !== genPassword(clientData.name)) {
    showLoginError("❌ Incorrect password.");
    return;
  }

  loginError.style.display = "none";
  currentUser = { isAdmin: false, clientName: clientData.name };
  showPortal();
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
  const box = document.querySelector(".login-box");
  box.classList.remove("shake");
  void box.offsetWidth;
  box.classList.add("shake");
}

// Shared logout
document.querySelectorAll(".logout-btn").forEach(btn =>
  btn.addEventListener("click", () => {
    currentUser = activeClientId = editingWorkId = null;
    loginScreen.style.display = "flex";
    portalScreen.style.display = "none";
    adminScreen.style.display = "none";
    loginForm.reset();
  })
);

// ════════════════════════════════════════════════════════
// CLIENT PORTAL VIEW
// ════════════════════════════════════════════════════════
function showPortal() {
  loginScreen.style.display = "none";
  portalScreen.style.display = "flex";
  adminScreen.style.display = "none";
  portalName.textContent = currentUser.clientName;
  greeting.textContent = `Hello, ${currentUser.clientName} 👋`;
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
  const work = Object.values(client.work || {});
  let paid = 0, pending = 0, total = 0;
  work.forEach(w => {
    const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
    total += amt;
    if (w.status === "Paid") { paid += amt; }
    else if (w.status === "Advance") { const adv = Number(w.advance || 0); paid += adv; pending += (amt - adv); }
    else { pending += amt; }
  });
  summaryPaid.textContent = "₹" + paid.toLocaleString("en-IN");
  summaryPending.textContent = "₹" + pending.toLocaleString("en-IN");
  summaryTotal.textContent = "₹" + total.toLocaleString("en-IN");

  if (work.length === 0) {
    workEmpty.style.display = "block"; workTable.style.display = "none"; return;
  }
  workEmpty.style.display = "none"; workTable.style.display = "";

  workBody.innerHTML = work.map((w, i) => {
    const qty = Number(w.qty || 1), price = Number(w.price || w.amt || 0);
    const lineTotal = qty * price;
    const status = w.status || "Pending";
    const advAmt = Number(w.advance || 0);
    const amtDue = status === "Pending" ? lineTotal : status === "Advance" ? lineTotal - advAmt : 0;
    const badge = `<span class="badge badge-${status.toLowerCase()}">${status === "Pending" ? "⏳ Pending" : status === "Advance" ? "💰 Advance" : "✅ Paid"
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
}

// ════════════════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════════════════
function showAdminPanel() {
  loginScreen.style.display = "none";
  portalScreen.style.display = "none";
  adminScreen.style.display = "block";
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
  adminTotalEarned.textContent = "₹" + earned.toLocaleString("en-IN");
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
    return `
    <div class="admin-client-card">
      <div class="admin-card-left">
        <div class="admin-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="admin-card-info">
          <h3 class="admin-card-name">${escHtml(c.name)}</h3>
          <div class="admin-card-stats">
            <span class="astat">📦 ${work.length} items</span>
            <span class="astat paid-stat">💰 ₹${paidAmt.toLocaleString("en-IN")}</span>
            <span class="astat pend-stat">⏳ ₹${pendingAmt.toLocaleString("en-IN")}</span>
          </div>
          <div class="admin-cred-row">
            <span class="cred-chip">👤 ${escHtml(c.name)}</span>
            <span class="cred-chip">🔒 ${escHtml(genPassword(c.name))}</span>
          </div>
        </div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-work" onclick="adminOpenWork('${id}')">📋 Work</button>
        <button class="btn-cred" onclick="adminShowCred('${escHtml(c.name)}')">🔐</button>
        <button class="btn-delete-card" onclick="adminDeleteClient('${id}')">🗑️</button>
      </div>
    </div>`;
  }).join("");
}

// ── Add Client ────────────────────────────────────────
adminClientForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = adminClientName.value.trim();
  if (!name) { showToast("⚠️ Client name required", "warn"); return; }
  adminSubmitBtn.disabled = true;
  adminSubmitBtn.textContent = "Saving…";
  push(ref(db, "clients"), { name, work: {} })
    .then(() => {
      showToast("🎉 Client added!");
      adminShowCred(name);
      adminClientForm.reset();
    })
    .catch(err => { console.error(err); showToast("❌ Save failed — check Firebase rules", "warn"); })
    .finally(() => { adminSubmitBtn.disabled = false; adminSubmitBtn.textContent = "Add Client"; });
});

// ── Delete Client ─────────────────────────────────────
window.adminDeleteClient = (id) => {
  if (!confirm("Remove this client and all their work?")) return;
  remove(ref(db, "clients/" + id))
    .then(() => showToast("🗑️ Client removed"))
    .catch(err => { console.error(err); showToast("❌ Delete failed", "warn"); });
};

// ── Credential modal ──────────────────────────────────
window.adminShowCred = (name) => {
  document.getElementById("adminCredUser").textContent = genUsername(name);
  document.getElementById("adminCredPass").textContent = genPassword(name);
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
  const u = document.getElementById("adminCredUser").textContent;
  const p = document.getElementById("adminCredPass").textContent;
  navigator.clipboard.writeText(`Username: ${u}\nPassword: ${p}`)
    .then(() => showToast("📋 Credentials copied!"));
};

// ════════════════════════════════════════════════════════
// ADMIN — WORK MODAL
// ════════════════════════════════════════════════════════
window.adminOpenWork = (clientId) => {
  activeClientId = clientId;
  editingWorkId = null;
  adminWorkModalTitle.textContent = `Work Items — ${allClients[clientId].name}`;
  adminWorkModal.style.display = "flex";
  document.body.style.overflow = "hidden";
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
  const entries = Object.entries(work);
  if (entries.length === 0) {
    adminWorkTable.style.display = "none"; adminWorkEmpty.style.display = "block"; return;
  }
  adminWorkTable.style.display = ""; adminWorkEmpty.style.display = "none";
  adminWorkBody.innerHTML = entries.map(([wid, w], i) => {
    const qty = Number(w.qty || 1), price = Number(w.price || w.amt || 0);
    const lineTotal = qty * price;
    const wStatus = w.status || "Pending";
    const isAdv = wStatus === "Advance";
    const advAmt = Number(w.advance || 0);
    const sc = wStatus.toLowerCase();
    const statusCell = `
      <select class="work-status-select s-${sc}" onchange="adminChangeStatus('${activeClientId}','${wid}',this.value)">
        <option value="Pending" ${wStatus === "Pending" ? "selected" : ""}>⏳ Pending</option>
        <option value="Advance" ${wStatus === "Advance" ? "selected" : ""}>💰 Advance</option>
        <option value="Paid"    ${wStatus === "Paid" ? "selected" : ""}>💚 Paid</option>
      </select>
      ${isAdv ? `<span class="adv-remain">₹${advAmt.toLocaleString("en-IN")} paid · ₹${(lineTotal - advAmt).toLocaleString("en-IN")} due</span>` : ""}`;
    return `<tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-desc">${escHtml(w.desc)}${w.date ? `<br><small class="row-date">${formatDate(w.date)}</small>` : ""}</td>
      <td class="col-num">${qty}</td>
      <td class="col-amt">₹${price.toLocaleString("en-IN")}</td>
      <td class="col-amt col-total">₹${lineTotal.toLocaleString("en-IN")}</td>
      <td class="col-status">${statusCell}</td>
      <td class="col-actions">
        <button class="btn-row-action edit" onclick="adminEditWork('${wid}')" title="Edit">✏️</button>
        <button class="btn-row-action del"  onclick="adminDeleteWork('${activeClientId}','${wid}')" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

adminWorkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const desc = document.getElementById("adminWorkDesc").value.trim();
  const qty = parseInt(document.getElementById("adminWorkQty").value) || 1;
  const price = parseFloat(document.getElementById("adminWorkPrice").value);
  const date = document.getElementById("adminWorkDate").value || new Date().toISOString().split("T")[0];
  if (!desc || isNaN(price)) { showToast("⚠️ Fill description and price", "warn"); return; }
  const entry = {
    desc, qty, price, date,
    status: editingWorkId
      ? (allClients[activeClientId]?.work?.[editingWorkId]?.status || "Pending")
      : "Pending"
  };
  if (editingWorkId) {
    update(ref(db, `clients/${activeClientId}/work/${editingWorkId}`), entry)
      .then(() => { showToast("✅ Item updated!"); resetAdminWorkForm(); })
      .catch(err => { console.error(err); showToast("❌ Save failed", "warn"); });
  } else {
    push(ref(db, `clients/${activeClientId}/work`), entry)
      .then(() => { showToast("✅ Work added!"); resetAdminWorkForm(); })
      .catch(err => { console.error(err); showToast("❌ Save failed", "warn"); });
  }
});

window.adminEditWork = (wid) => {
  const w = allClients[activeClientId]?.work?.[wid];
  if (!w) return;
  editingWorkId = wid;
  document.getElementById("adminWorkDesc").value = w.desc;
  document.getElementById("adminWorkQty").value = w.qty || 1;
  document.getElementById("adminWorkPrice").value = w.price || w.amt || "";
  document.getElementById("adminWorkDate").value = w.date || "";
  adminWorkSubmitBtn.textContent = "✅ Update Item";
  adminCancelWorkEdit.style.display = "inline-block";
};

window.adminDeleteWork = (clientId, workId) => {
  remove(ref(db, `clients/${clientId}/work/${workId}`))
    .then(() => showToast("🗑️ Item removed"))
    .catch(err => { console.error(err); showToast("❌ Delete failed", "warn"); });
};

window.adminChangeStatus = (clientId, workId, newStatus) => {
  if (newStatus === "Advance") {
    openAdminAdvance(clientId, workId);
  } else {
    update(ref(db, `clients/${clientId}/work/${workId}`), { status: newStatus, advance: 0 })
      .then(() => showToast(newStatus === "Paid" ? "✅ Marked Paid" : "↩️ Marked Pending"))
      .catch(err => { console.error(err); showToast("❌ Update failed", "warn"); refreshAdminWork(); });
  }
};

adminCancelWorkEdit.addEventListener("click", resetAdminWorkForm);
function resetAdminWorkForm() {
  adminWorkForm.reset();
  document.getElementById("adminWorkQty").value = 1;
  editingWorkId = null;
  adminWorkSubmitBtn.textContent = "＋ Add Item";
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
    .then(() => { showToast("💰 Advance saved!"); closeAdminAdvance(); })
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
  toastEl.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[parseInt(m) - 1]} ${y}`;
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
