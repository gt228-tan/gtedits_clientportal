const ClientEmail = require('../models/ClientEmail');

const DATABASE_URL = process.env.FIREBASE_DB_URL || "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/";

// ── Firebase Admin SDK for authenticated RTDB reads ──────────
let adminDb = null;
function getAdminDb() {
  if (adminDb) return adminDb;
  try {
    const admin = require('firebase-admin');
    // Ensure Firebase Admin is initialized (auth.js may already have done this)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: DATABASE_URL.replace(/\/+$/, ''),
      });
    }
    adminDb = admin.database();
    return adminDb;
  } catch (err) {
    console.warn('[EmailLookup] Firebase Admin DB init failed, will use REST fallback:', err.message);
    return null;
  }
}

function isRealEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.endsWith('@gtportal.com') || trimmed.endsWith('@gtportal.io') || trimmed.includes('gtportal.com')) {
    return false;
  }
  return trimmed.includes('@');
}

/**
 * Read a single client record from Firebase RTDB.
 * Tries Admin SDK first, falls back to unauthenticated REST.
 */
async function readClientFromRTDB(clientId) {
  // Try Firebase Admin SDK (authenticated)
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref(`clients/${clientId}`).once('value');
      if (snap.exists()) return snap.val();
    } catch (err) {
      console.warn(`[EmailLookup] Admin SDK read failed for clientId "${clientId}":`, err.message);
    }
  }

  // Fallback: unauthenticated REST
  try {
    const url = `${DATABASE_URL.replace(/\/+$/, '')}/clients/${encodeURIComponent(clientId)}.json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    }
  } catch (err) {
    console.warn(`[EmailLookup] REST read failed for clientId "${clientId}":`, err.message);
  }

  return null;
}

/**
 * Read ALL client records from Firebase RTDB.
 * Tries Admin SDK first, falls back to unauthenticated REST.
 */
async function readAllClientsFromRTDB() {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref('clients').once('value');
      if (snap.exists()) return snap.val();
    } catch (err) {
      console.warn('[EmailLookup] Admin SDK read-all failed:', err.message);
    }
  }

  // Fallback: unauthenticated REST
  try {
    const url = `${DATABASE_URL.replace(/\/+$/, '')}/clients.json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    }
  } catch (err) {
    console.warn('[EmailLookup] REST read-all failed:', err.message);
  }

  return null;
}

async function getClientContactEmail(clientId, clientFirebaseUid, clientName = '') {
  console.log(`[EmailLookup] Starting lookup for clientId="${clientId}", uid="${clientFirebaseUid}", name="${clientName}"`);

  // 1. Try MongoDB ClientEmail collection (fastest & most reliable)
  try {
    const query = [];
    if (clientId)   query.push({ clientId });
    if (clientName) query.push({ clientName: new RegExp(`^${clientName.trim()}$`, 'i') });

    if (query.length > 0) {
      const record = await ClientEmail.findOne({ $or: query });
      if (record && isRealEmail(record.contactEmail)) {
        const email = record.contactEmail.trim();
        console.log(`[EmailLookup] ✅ Found MongoDB notification email "${email}" for client "${clientName || clientId}"`);
        return email;
      } else {
        console.log(`[EmailLookup] MongoDB: ${record ? `found record but email "${record.contactEmail}" is not a real email` : 'no record found'}`);
      }
    }
  } catch (err) {
    console.warn(`[EmailLookup] MongoDB search error:`, err.message);
  }

  // 2. Direct RTDB lookup by clientId (using Admin SDK with REST fallback)
  if (clientId) {
    try {
      const c = await readClientFromRTDB(clientId);
      if (c) {
        const customEmail = c.contactEmail || c.notificationEmail;
        console.log(`[EmailLookup] RTDB direct lookup for "${clientId}" returned contactEmail="${c.contactEmail}", notificationEmail="${c.notificationEmail}"`);
        if (isRealEmail(customEmail)) {
          const email = customEmail.trim();
          console.log(`[EmailLookup] ✅ Found RTDB notification email "${email}" for clientId "${clientId}"`);
          // Sync to MongoDB for future queries
          ClientEmail.findOneAndUpdate(
            { clientId },
            { clientId, clientName: c?.name || clientName, contactEmail: email },
            { upsert: true }
          ).catch(() => {});
          return email;
        }
      } else {
        console.log(`[EmailLookup] RTDB direct lookup returned null for clientId "${clientId}"`);
      }
    } catch (err) {
      console.warn(`[EmailLookup] Direct RTDB lookup error for clientId ${clientId}:`, err.message);
    }
  }

  // 3. Fetch all clients from RTDB to find matching client record by key, UID, or name
  try {
    const allClients = await readAllClientsFromRTDB();
    if (allClients) {
      for (const [key, c] of Object.entries(allClients)) {
        if (!c) continue;
        const matchesKey  = key === clientId;
        const matchesUid  = clientFirebaseUid && c.uid === clientFirebaseUid;
        const matchesName = clientName && c.name && c.name.trim().toLowerCase() === clientName.trim().toLowerCase();

        if (matchesKey || matchesUid || matchesName) {
          const customEmail = c.contactEmail || c.notificationEmail;
          if (isRealEmail(customEmail)) {
            const email = customEmail.trim();
            console.log(`[EmailLookup] ✅ Found notification email "${email}" from RTDB client record "${c.name}" (key: ${key})`);
            // Sync to MongoDB for future queries
            ClientEmail.findOneAndUpdate(
              { clientId: key },
              { clientId: key, clientName: c.name || clientName, contactEmail: email },
              { upsert: true }
            ).catch(() => {});
            return email;
          } else {
            console.log(`[EmailLookup] RTDB match found for "${c.name}" (key: ${key}) but email is not real: "${customEmail}"`);
          }
        }
      }
      console.log(`[EmailLookup] RTDB all-clients scan: no match found for clientId="${clientId}", uid="${clientFirebaseUid}", name="${clientName}"`);
    } else {
      console.log(`[EmailLookup] RTDB all-clients: could not read clients collection`);
    }
  } catch (err) {
    console.warn(`[EmailLookup] RTDB all-clients search error:`, err.message);
  }

  console.warn(`[EmailLookup] ❌ No real notification email set for client "${clientName || clientId}". Email NOT sent.`);
  return '';
}

module.exports = { getClientContactEmail, isRealEmail };
