// ============================================================
// firebase.js — Client Portal  (same project as admin panel)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, remove, update }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Keep in sync with ../firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyCry6lkG2eeu7GbiIb_JcjsYyy_v9kXd6s",
  authDomain: "client-tracker-b9331.firebaseapp.com",
  projectId: "client-tracker-b9331",
  storageBucket: "client-tracker-b9331.firebasestorage.app",
  messagingSenderId: "632716508065",
  appId: "1:632716508065:web:8d15a6ed8bd77fa32629e0",
  databaseURL: "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

export { db, ref, onValue, push, remove, update };
