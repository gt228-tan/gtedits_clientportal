import { db, ref, push, set, update, remove, get } from '../firebase';

/**
 * Generates next sequential invoice number like #001 (matching Image 1)
 * @param {Array|Object} existingInvoices
 * @returns {string}
 */
export function generateNextInvoiceNumber(existingInvoices = []) {
  const invoicesList = Array.isArray(existingInvoices)
    ? existingInvoices
    : Object.values(existingInvoices || {});

  let maxSeq = 0;
  invoicesList.forEach(inv => {
    if (inv && inv.invoiceNumber) {
      const clean = String(inv.invoiceNumber).replace(/[^0-9]/g, '');
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `#${nextSeq}`;
}

/**
 * Saves a new invoice or updates an existing invoice for a client in Firebase RTDB
 * @param {string} clientId
 * @param {Object} invoiceData
 * @returns {Promise<Object>} saved invoice with id
 */
export async function saveInvoice(clientId, invoiceData) {
  if (!clientId) throw new Error('Client ID is required');

  const now = Date.now();
  const invoicePayload = {
    ...invoiceData,
    clientId,
    updatedAt: now,
  };

  if (invoiceData.id) {
    const invRef = ref(db, `clients/${clientId}/invoices/${invoiceData.id}`);
    await update(invRef, invoicePayload);
    return { ...invoicePayload, id: invoiceData.id };
  } else {
    invoicePayload.createdAt = now;
    const listRef = ref(db, `clients/${clientId}/invoices`);
    const newRef = push(listRef);
    invoicePayload.id = newRef.key;
    await set(newRef, invoicePayload);
    return invoicePayload;
  }
}

/**
 * Updates the status of an invoice
 * @param {string} clientId
 * @param {string} invoiceId
 * @param {string} status 'Pending' | 'Paid' | 'Draft'
 */
export async function updateInvoiceStatus(clientId, invoiceId, status) {
  if (!clientId || !invoiceId) throw new Error('Client ID and Invoice ID are required');
  const invRef = ref(db, `clients/${clientId}/invoices/${invoiceId}`);
  await update(invRef, {
    status,
    updatedAt: Date.now(),
  });
}

/**
 * Deletes an invoice from Firebase RTDB
 * @param {string} clientId
 * @param {string} invoiceId
 */
export async function deleteInvoice(clientId, invoiceId) {
  if (!clientId || !invoiceId) throw new Error('Client ID and Invoice ID are required');
  const invRef = ref(db, `clients/${clientId}/invoices/${invoiceId}`);
  await remove(invRef);
}

