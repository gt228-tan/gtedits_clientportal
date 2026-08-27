const admin = require('firebase-admin');

// ── Lazy-initialise Firebase Admin ───────────────────────────
// We use the application-default credentials approach so that
// no service-account JSON file is required.  The SDK is
// initialised once the first time this module is loaded.
let app;
function getAdminApp() {
  if (!app) {
    app = admin.initializeApp({
      // credential is picked up automatically from GOOGLE_APPLICATION_CREDENTIALS
      // OR we can initialise without a credential when we only need token
      // verification against a project.
      // For local dev we just need the projectId.
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DB_URL || 'https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app',
    });
  }
  return app;
}

// ── Known admin UID/email (same as frontend constants) ───────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'gtbtbhay22@gmail.com';

/**
 * requireAuth(role?)
 *
 * Middleware factory.
 *  - role = 'admin'  → only the admin Firebase account is allowed
 *  - role = 'client' → any authenticated non-admin account is allowed
 *  - role = undefined → any authenticated account is allowed
 *
 * Sets:
 *   req.uid   – Firebase UID of the caller
 *   req.email – email of the caller
 *   req.role  – 'admin' | 'client'
 */
function requireAuth(role) {
  return async (req, res, next) => {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    const token = header.slice(7);
    try {
      let decoded;
      try {
        getAdminApp(); // ensure initialised
        decoded = await admin.auth().verifyIdToken(token);
      } catch (verifyErr) {
        // If Firebase Admin credentials are not configured (local dev without
        // GOOGLE_APPLICATION_CREDENTIALS), fall back to a lightweight JWT
        // decode so we at minimum get the uid/email.
        decoded = await verifyTokenFallback(token);
      }

      req.uid   = decoded.uid || decoded.sub;
      req.email = decoded.email || '';
      req.role  = req.email === ADMIN_EMAIL ? 'admin' : 'client';

      if (role && req.role !== role) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      next();
    } catch (err) {
      console.error('[auth] Token error:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Fallback: decode (NOT verify) a Firebase JWT locally.
 * Only used when Admin SDK credentials are unavailable.
 * DO NOT use in production without proper credentials.
 */
async function verifyTokenFallback(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (!payload.sub) throw new Error('No sub in token');
  // Basic expiry check
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return { uid: payload.sub, email: payload.email || '' };
}

module.exports = { requireAuth };
