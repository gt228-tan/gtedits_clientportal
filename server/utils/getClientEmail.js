const ClientEmail = require('../models/ClientEmail');

const DATABASE_URL = process.env.FIREBASE_DB_URL || "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/";

let adminDb = null;
function getAdminDb() {
  if (adminDb) return adminDb;
  try {
    const admin = require('firebase-admin');
    
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


async function readClientFromRTDB(clientId, authToken = null) {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref(`clients/${clientId}`).once('value');
      if (snap.exists()) return snap.val();
    } catch (err) {
      console.warn(`[EmailLookup] Admin SDK read failed for clientId "${clientId}":`, err.message);
    }
  }

  // Fallback: REST request (with auth query param or header if token provided)
  try {
    const base = DATABASE_URL.replace(/\/+$/, '');
    const authQuery = authToken ? `?auth=${encodeURIComponent(authToken)}` : '';
    const url = `${base}/clients/${encodeURIComponent(clientId)}.json${authQuery}`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    } else {
      console.warn(`[EmailLookup] REST read for clientId "${clientId}" returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[EmailLookup] REST read failed for clientId "${clientId}":`, err.message);
  }

  return null;
}

async function readAllClientsFromRTDB(authToken = null) {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref('clients').once('value');
      if (snap.exists()) return snap.val();
    } catch (err) {
      console.warn('[EmailLookup] Admin SDK read-all failed:', err.message);
    }
  }

  try {
    const base = DATABASE_URL.replace(/\/+$/, '');
    const authQuery = authToken ? `?auth=${encodeURIComponent(authToken)}` : '';
    const url = `${base}/clients.json${authQuery}`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    } else {
      console.warn(`[EmailLookup] REST read-all returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[EmailLookup] REST read-all failed:', err.message);
  }

  return null;
}

async function getClientContactEmail(clientId, clientFirebaseUid, clientName = '', authToken = null, directEmail = null) {
  console.log(`[EmailLookup] Starting lookup for clientId="${clientId}", uid="${clientFirebaseUid}", name="${clientName}", directEmail="${directEmail || ''}"`);

  // 0. Direct email passed from payload/request
  if (directEmail && isRealEmail(directEmail)) {
    const cleanEmail = directEmail.trim();
    console.log(`[EmailLookup] ✅ Using direct valid email: "${cleanEmail}"`);
    // Upsert into MongoDB ClientEmail so future lookups are fast
    const upsertQuery = [];
    if (clientId && clientId.trim()) upsertQuery.push({ clientId: clientId.trim() });
    if (clientName && clientName.trim()) upsertQuery.push({ clientName: new RegExp(`^${clientName.trim()}$`, 'i') });

    if (upsertQuery.length > 0) {
      ClientEmail.findOneAndUpdate(
        { $or: upsertQuery },
        { clientId: clientId || '', clientName: clientName || '', contactEmail: cleanEmail },
        { upsert: true, returnDocument: 'after' }
      ).catch(e => console.warn('[EmailLookup] Failed saving direct email to Mongo:', e.message));
    }
    return cleanEmail;
  }

  // 1. Check MongoDB ClientEmail collection
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

  // 2. Direct RTDB lookup
  if (clientId) {
    try {
      const c = await readClientFromRTDB(clientId, authToken);
      if (c) {
        const customEmail = c.notificationEmail || c.contactEmail || c.email;
        console.log(`[EmailLookup] RTDB direct lookup for "${clientId}" returned contactEmail="${c.contactEmail}", notificationEmail="${c.notificationEmail}", email="${c.email}"`);
        if (isRealEmail(customEmail)) {
          const email = customEmail.trim();
          console.log(`[EmailLookup] ✅ Found RTDB notification email "${email}" for clientId "${clientId}"`);
          // Sync to MongoDB for future queries
          ClientEmail.findOneAndUpdate(
            { clientId },
            { clientId, clientName: c?.name || clientName, contactEmail: email },
            { upsert: true, returnDocument: 'after' }
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

  // 3. RTDB all-clients scan
  try {
    const allClients = await readAllClientsFromRTDB(authToken);
    if (allClients) {
      for (const [key, c] of Object.entries(allClients)) {
        if (!c) continue;
        const matchesKey  = key === clientId;
        const matchesUid  = clientFirebaseUid && c.uid === clientFirebaseUid;
        const matchesName = clientName && c.name && c.name.trim().toLowerCase() === clientName.trim().toLowerCase();

        if (matchesKey || matchesUid || matchesName) {
          const customEmail = c.notificationEmail || c.contactEmail || c.email;
          if (isRealEmail(customEmail)) {
            const email = customEmail.trim();
            console.log(`[EmailLookup] ✅ Found notification email "${email}" from RTDB client record "${c.name}" (key: ${key})`);
           
            ClientEmail.findOneAndUpdate(
              { clientId: key },
              { clientId: key, clientName: c.name || clientName, contactEmail: email },
              { upsert: true, returnDocument: 'after' }
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

  // 4. Mongo Project records fallback
  try {
    const Project = require('../models/Project');
    const proj = await Project.findOne({
      $or: [
        { firebaseClientId: clientId },
        { clientName: new RegExp(`^${(clientName || '').trim()}$`, 'i') }
      ]
    });
    if (proj?.clientEmail && isRealEmail(proj.clientEmail)) {
      const email = proj.clientEmail.trim();
      console.log(`[EmailLookup] ✅ Found email "${email}" from Project record for "${clientName || clientId}"`);
      return email;
    }
  } catch (projErr) {
    // ignore
  }

  console.warn(`[EmailLookup] ❌ No real notification email set for client "${clientName || clientId}". Email NOT sent.`);
  return '';
}

module.exports = { getClientContactEmail, isRealEmail, readClientFromRTDB, readAllClientsFromRTDB };


