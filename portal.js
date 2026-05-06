
import { db, ref, onValue } from "./firebase.js";

function generateUsername(name) {
  return name;
}
function generatePassword(name) {
  return name.slice(0, 2) + "123";
}

// ── State ──────────────────────────────────────────────────
let currentUser = null;   // { username, clientName }
let allClients  = {};     // snapshot from Firebase

// ── DOM refs ───────────────────────────────────────────────
const loginScreen    = document.getElementById("loginScreen");
const portalScreen   = document.getElementById("portalScreen");
const loginForm      = document.getElementById("loginForm");
const loginError     = document.getElementById("loginError");
const logoutBtn      = document.getElementById("logoutBtn");
const portalName     = document.getElementById("portalName");
const summaryPaid    = document.getElementById("summaryPaid");
const summaryPending = document.getElementById("summaryPending");
const summaryTotal   = document.getElementById("summaryTotal");
const workBody       = document.getElementById("workBody");
const workEmpty      = document.getElementById("workEmpty");
const workTable      = document.getElementById("workTable");
const toastEl        = document.getElementById("toast");
const greeting       = document.getElementById("greeting");

// ── Firebase — live listener ───────────────────────────────
onValue(ref(db, "clients"), (snapshot) => {
  allClients = snapshot.val() || {};
  if (currentUser) renderPortal();
}, (err) => {
  console.error("Firebase error:", err);
  showToast("⚠️ Connection error — retrying…", "warn");
});

// ── Login ──────────────────────────────────────────────────
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const inputUser = document.getElementById("inputUser").value.trim().toLowerCase();
  const inputPass = document.getElementById("inputPass").value;

  // Find a Firebase client whose name matches the input (case-insensitive)
  const matchEntry = Object.entries(allClients).find(([, c]) =>
    c.name && c.name.toLowerCase() === inputUser.toLowerCase()
  );

  if (!matchEntry) {
    showLoginError("❌ No account found with that username.");
    return;
  }

  const [, clientData] = matchEntry;
  const expectedPassword = generatePassword(clientData.name);

  if (inputPass !== expectedPassword) {
    showLoginError("❌ Incorrect password.");
    return;
  }

  loginError.style.display = "none";
  currentUser = { username: inputUser, clientName: clientData.name };
  showPortal();
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
  shakeForm();
}

function shakeForm() {
  const box = document.querySelector(".login-box");
  box.classList.remove("shake");
  void box.offsetWidth; // reflow
  box.classList.add("shake");
}

// ── Logout ─────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
  currentUser = null;
  loginScreen.style.display  = "flex";
  portalScreen.style.display = "none";
  loginForm.reset();
});

// ── Show Portal ────────────────────────────────────────────
function showPortal() {
  loginScreen.style.display  = "none";
  portalScreen.style.display = "flex";
  portalName.textContent = currentUser.clientName;
  setGreeting();
  renderPortal();
}

function setGreeting() {

  greeting.textContent = `Hello, ${currentUser.clientName} 👋`;
}

// ── Render Portal ──────────────────────────────────────────
function renderPortal() {
  // Find the matching client entry in Firebase by name (case-insensitive)
  const entry = Object.entries(allClients).find(
    ([, c]) => c.name?.toLowerCase() === currentUser.clientName.toLowerCase()
  );

  if (!entry) {
    workEmpty.style.display = "block";
    workTable.style.display = "none";
    summaryPaid.textContent    = "₹0";
    summaryPending.textContent = "₹0";
    summaryTotal.textContent   = "₹0";
    return;
  }

  const [, client] = entry;
  const work = client.work ? Object.values(client.work) : [];

  // ── Totals ─────────────────────────────────────────────
  let paid = 0, pending = 0, total = 0;
  work.forEach(w => {
    const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
    total += amt;
    if (w.status === "Paid") {
      paid += amt;
    } else if (w.status === "Advance") {
      const adv = Number(w.advance || 0);
      paid    += adv;
      pending += (amt - adv);
    } else {
      pending += amt;
    }
  });

  summaryPaid.textContent    = "₹" + paid.toLocaleString("en-IN");
  summaryPending.textContent = "₹" + pending.toLocaleString("en-IN");
  summaryTotal.textContent   = "₹" + total.toLocaleString("en-IN");

  // ── Work Table ─────────────────────────────────────────
  if (work.length === 0) {
    workEmpty.style.display = "block";
    workTable.style.display = "none";
    return;
  }
  workEmpty.style.display = "none";
  workTable.style.display = "";

  workBody.innerHTML = work.map((w, i) => {
    const qty       = Number(w.qty   || 1);
    const price     = Number(w.price || w.amt || 0);
    const lineTotal = qty * price;
    const status    = w.status || "Pending";
    const advAmt    = Number(w.advance || 0);
    const isAdv     = status === "Advance";

    // What the client still owes on this item
    let amountDue = 0;
    if (status === "Pending")  amountDue = lineTotal;
    else if (isAdv)            amountDue = lineTotal - advAmt;

    const statusBadge = `<span class="badge badge-${status.toLowerCase()}">${
      status === "Pending" ? "⏳ Pending"
      : status === "Advance" ? "💰 Advance"
      : "✅ Paid"
    }</span>`;

    const dueCell = amountDue > 0
      ? `<span class="due-highlight">₹${amountDue.toLocaleString("en-IN")}</span>`
      : `<span class="due-clear">—</span>`;

    return `
    <tr>
      <td class="col-num" data-label="#">${i + 1}</td>
      <td class="col-desc" data-label="Description">
        ${escHtml(w.desc)}
        ${w.date ? `<br><small class="row-date">${formatDate(w.date)}</small>` : ""}
      </td>
      <td class="col-num" data-label="Qty">${qty}</td>
      <td class="col-amt" data-label="Unit Price">₹${price.toLocaleString("en-IN")}</td>
      <td class="col-amt col-total" data-label="Total">₹${lineTotal.toLocaleString("en-IN")}</td>
      <td class="col-status" data-label="Status">${statusBadge}</td>
      <td class="col-amt col-due" data-label="Amount Due">${dueCell}</td>
    </tr>`;
  }).join("");
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = "success") {
  toastEl.textContent = msg;
  toastEl.className   = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}

// ── Helpers ────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day} ${months[parseInt(m)-1]} ${y}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
