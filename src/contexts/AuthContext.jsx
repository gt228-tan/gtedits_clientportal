import { createContext, useContext, useState, useEffect } from 'react';
import {
  auth, db,
  ref, get, set,
  onAuthStateChanged, signOut
} from '../firebase';

// ── Constants ──────────────────────────────────────────────
export const ADMIN_EMAIL   = 'gtbtbhay22@gmail.com';
export const CLIENT_DOMAIN = '@gtportal.com';
export const BRAND_NAME    = 'GT Edits';

// Client email: name → slug@gtportal.com
export function clientEmail(name) {
  return name.toLowerCase().replace(/\s+/g, '') + CLIENT_DOMAIN;
}

// Default client password: full name (lowercase, no spaces) + @123
// e.g. "Neha Sottany" → nehasottany@123
export function clientDefaultPass(name) {
  return name.toLowerCase().replace(/\s+/g, '') + '@123';
}

// ── Context ────────────────────────────────────────────────
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ── Provider ───────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(undefined); // undefined = loading
  const [role,         setRole]         = useState(null);       // 'admin' | 'client' | null
  const [clientRecord, setClientRecord] = useState(null);       // { clientId, name }
  const [loading,      setLoading]      = useState(true);

  async function resolveRole(user) {
    if (!user) {
      setCurrentUser(null); setRole(null); setClientRecord(null);
      setLoading(false);
      return;
    }

    try {
      // ── 1️⃣  Admin check (by email — no DB read needed) ──────
      if (user.email === ADMIN_EMAIL) {
        setCurrentUser(user);
        setRole('admin');
        setClientRecord(null);
        setLoading(false);
        return;
      }

      // ── 2️⃣  Client — look up in /clients/ by Firebase UID ──
      let clientId   = null;
      let clientName = null;

      try {
        const snap = await get(ref(db, 'clients'));
        if (snap.exists()) {
          const clients = snap.val();

          // Match by uid (fast path for existing accounts)
          let match = Object.entries(clients).find(([, c]) => c.uid === user.uid);

          // Fallback: match by email slug (for accounts without uid stored)
          if (!match && user.email?.endsWith(CLIENT_DOMAIN)) {
            const slug = user.email.slice(0, -CLIENT_DOMAIN.length).split('_')[0];
            match = Object.entries(clients).find(([, c]) =>
              c.name && c.name.toLowerCase().replace(/\s+/g, '') === slug
            );
            // Auto-link uid if found via slug
            if (match) {
              set(ref(db, `clients/${match[0]}/uid`), user.uid).catch(() => {});
            }
          }

          if (match) {
            [clientId, { name: clientName }] = match;
          }
        }
      } catch (dbErr) {
        console.warn('Client lookup error:', dbErr.code);
      }

      if (clientId) {
        setCurrentUser(user);
        setRole('client');
        setClientRecord({ clientId, name: clientName });
        setLoading(false);
        return;
      }

      // ── 3️⃣  Unknown — sign out ──────────────────────────────
      await signOut(auth).catch(() => {});
      setCurrentUser(null); setRole(null); setClientRecord(null);

    } catch (err) {
      console.error('resolveRole error:', err);
      setCurrentUser(null); setRole(null); setClientRecord(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, resolveRole);
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null); setRole(null); setClientRecord(null);
  };

  // Helper: get a fresh Firebase ID token for backend API calls
  const getToken = async () => {
    if (!currentUser) throw new Error('Not authenticated');
    return currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, role, clientRecord, loading, logout, getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}
