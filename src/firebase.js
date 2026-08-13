// ============================================================
// firebase.js — Client Portal (npm SDK for Vite)
// ============================================================

import { initializeApp } from 'firebase/app';
import {
  getDatabase, ref, onValue, push, remove, update, set, get
} from 'firebase/database';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCry6lkG2eeu7GbiIb_JcjsYyy_v9kXd6s",
  authDomain: "client-tracker-b9331.firebaseapp.com",
  projectId: "client-tracker-b9331",
  storageBucket: "client-tracker-b9331.firebasestorage.app",
  messagingSenderId: "632716508065",
  appId: "1:632716508065:web:8d15a6ed8bd77fa32629e0",
  databaseURL: "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Primary app (admin + client sessions)
const app = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// Secondary app — used ONLY to create new client accounts
// without signing out the currently-logged-in admin.
const secondaryApp  = initializeApp(firebaseConfig, 'Secondary');
export const secondaryAuth = getAuth(secondaryApp);

export {
  ref, onValue, push, remove, update, set, get,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
};
