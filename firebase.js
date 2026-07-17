// ============================================================
// firebase.js — Client Portal  (Email/Password auth)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, remove, update, set, get }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCry6lkG2eeu7GbiIb_JcjsYyy_v9kXd6s",
  authDomain: "client-tracker-b9331.firebaseapp.com",
  projectId: "client-tracker-b9331",
  storageBucket: "client-tracker-b9331.firebasestorage.app",
  messagingSenderId: "632716508065",
  appId: "1:632716508065:web:8d15a6ed8bd77fa32629e0",
  databaseURL: "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// ── Primary app (used for admin + client sessions) ────────
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// ── Secondary app — used ONLY to create new client accounts
// without signing out the currently-logged-in admin.
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// ── authReady: resolves once Firebase tells us the current
// auth state (user object if already signed in, null if not).
const authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub(); // fire only once
    resolve(user);
  });
});

export {
  db, auth, secondaryAuth, authReady,
  ref, onValue, push, remove, update, set, get,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut
};
