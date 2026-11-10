import { useState, useEffect, useMemo, useRef } from 'react';
import { BRAND_NAME } from '../contexts/AuthContext';
import { db, ref, get, update } from '../firebase';
import { generateCustomInvoicePdf, formatCurrency } from '../generateInvoice';
import { saveInvoice, generateNextInvoiceNumber } from '../api/invoices';
import { showToast } from './Toast';

export default function InvoiceGeneratorModal({
  isOpen,
  onClose,
  clients = {},
  initialClientId = null,
  initialWorkItems = null,
  initialInvoice = null,
  existingInvoices = [],
  onSaved,
}) {
  const [selectedClientId, setSelectedClientId] = useState(initialClientId || '');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [fromName, setFromName] = useState(BRAND_NAME || 'GT Edits');
  const [fromAddress, setFromAddress] = useState('Video Production & Creative Services');
  const [fromEmail, setFromEmail] = useState('gtbtbhay22@gmail.com');

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState('Pending');
  const [items, setItems] = useState([
    { id: '1', desc: 'Reels / Video Editing', qty: 1, rate: 1000, amount: 1000 }
  ]);
  const [advance, setAdvance] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);

  // ── Bank Transaction Details (matching user exact image) ──
  const [bankAccountName, setBankAccountName] = useState(() => {
    return localStorage.getItem('gt_inv_bank_name') || BRAND_NAME || 'GT Edits';
  });
  const [accountNo, setAccountNo] = useState(() => {
    return localStorage.getItem('gt_inv_bank_acc') || '';
  });
  const [ifsc, setIfsc] = useState(() => {
    return localStorage.getItem('gt_inv_bank_ifsc') || '';
  });
  const [bankName, setBankName] = useState(() => {
    return localStorage.getItem('gt_inv_bank_bank') || '';
  });
  const [branch, setBranch] = useState(() => {
    return localStorage.getItem('gt_inv_bank_branch') || '';
  });

  // ── Signature Image (One-time upload, persistent across all forms) ──
  const [signatureImage, setSignatureImage] = useState(() => {
    return localStorage.getItem('gt_invoice_signature') || '';
  });
  const fileInputRef = useRef(null);

  const [signatoryText, setSignatoryText] = useState(`${BRAND_NAME || 'GT Edits'} Authorized`);
  const [notes, setNotes] = useState('Thank you for your business!');

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'form' | 'preview'

  // Load persistent signature & bank defaults from Firebase on mount
  useEffect(() => {
    const loadDefaultsFromFirebase = async () => {
      try {
        const snap = await get(ref(db, 'settings/invoiceDefaults'));
        if (snap.exists()) {
          const defs = snap.val();
          if (defs.signature && !localStorage.getItem('gt_invoice_signature')) {
            setSignatureImage(defs.signature);
            localStorage.setItem('gt_invoice_signature', defs.signature);
          }
          if (defs.bankDetails) {
            const b = defs.bankDetails;
            if (b.name && !localStorage.getItem('gt_inv_bank_name')) {
              setBankAccountName(b.name);
              localStorage.setItem('gt_inv_bank_name', b.name);
            }
            if (b.accountNo && !localStorage.getItem('gt_inv_bank_acc')) {
              setAccountNo(b.accountNo);
              localStorage.setItem('gt_inv_bank_acc', b.accountNo);
            }
            if (b.ifsc && !localStorage.getItem('gt_inv_bank_ifsc')) {
              setIfsc(b.ifsc);
              localStorage.setItem('gt_inv_bank_ifsc', b.ifsc);
            }
            if (b.bank && !localStorage.getItem('gt_inv_bank_bank')) {
              setBankName(b.bank);
              localStorage.setItem('gt_inv_bank_bank', b.bank);
            }
            if (b.branch && !localStorage.getItem('gt_inv_bank_branch')) {
              setBranch(b.branch);
              localStorage.setItem('gt_inv_bank_branch', b.branch);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load invoice defaults from Firebase:', err);
      }
    };
    loadDefaultsFromFirebase();
  }, []);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialInvoice) {
      setSelectedClientId(initialInvoice.clientId || '');
      setClientName(initialInvoice.clientName || '');
      setClientAddress(initialInvoice.clientAddress || initialInvoice.clientEmail || '');
      setFromName(initialInvoice.fromName || initialInvoice.brandName || BRAND_NAME || 'GT Edits');
      setFromAddress(initialInvoice.fromAddress || 'Video Production & Creative Services');
      setFromEmail(initialInvoice.fromEmail || 'gtbtbhay22@gmail.com');

      setInvoiceNumber(initialInvoice.invoiceNumber || '');
      setIssueDate(initialInvoice.issueDate || new Date().toISOString().slice(0, 10));
      setDueDate(initialInvoice.dueDate || '');
      setStatus(initialInvoice.status || 'Pending');
      setItems(initialInvoice.items?.length ? initialInvoice.items : [{ id: '1', desc: '', qty: 1, rate: 0, amount: 0 }]);
      setAdvance(Number(initialInvoice.advance || 0));
      setDiscount(Number(initialInvoice.discount || 0));
      setTax(Number(initialInvoice.tax || 0));

      const bank = initialInvoice.bankDetails || {};
      setBankAccountName(bank.name || initialInvoice.bankAccountName || bankAccountName);
      setAccountNo(bank.accountNo || initialInvoice.accountNo || accountNo);
      setIfsc(bank.ifsc || initialInvoice.ifsc || ifsc);
      setBankName(bank.bank || initialInvoice.bankName || bankName);
      setBranch(bank.branch || initialInvoice.branch || branch);

      if (initialInvoice.signatureImage || initialInvoice.signature) {
        setSignatureImage(initialInvoice.signatureImage || initialInvoice.signature);
      }
      setSignatoryText(initialInvoice.signatoryText || `${initialInvoice.brandName || BRAND_NAME || 'GT Edits'} Authorized`);
      setNotes(initialInvoice.notes || 'Thank you for your business!');
    } else {
      const generatedInvNo = generateNextInvoiceNumber(existingInvoices);
      setInvoiceNumber(generatedInvNo);
      setIssueDate(new Date().toISOString().slice(0, 10));
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setDueDate(d.toISOString().slice(0, 10));
      setStatus('Pending');

      const targetId = initialClientId || Object.keys(clients)[0] || '';
      setSelectedClientId(targetId);

      if (targetId && clients[targetId]) {
        const c = clients[targetId];
        setClientName(c.name || '');
        setClientAddress(c.notificationEmail || c.contactEmail || '');
        importClientPendingItems(targetId);
      } else {
        setItems([{ id: '1', desc: 'Reels / Video Editing', qty: 1, rate: 500, amount: 500 }]);
        setAdvance(0);
      }
    }
  }, [isOpen, initialInvoice, initialClientId]);

  // Handle client selection change
  const handleClientChange = (cid) => {
    setSelectedClientId(cid);
    const client = clients[cid];
    if (client) {
      setClientName(client.name || '');
      setClientAddress(client.notificationEmail || client.contactEmail || '');
      importClientPendingItems(cid);
    }
  };

  // Helper to import unpaid work items from selected client
  const importClientPendingItems = (cid) => {
    const client = clients[cid];
    if (!client || !client.work) return;

    const workEntries = Object.entries(client.work);
    const pendingWork = workEntries.filter(([, w]) => (w.status || 'Pending') !== 'Paid');

    if (pendingWork.length > 0) {
      let totalAdv = 0;
      const imported = pendingWork.map(([wid, w], idx) => {
        const qty = Number(w.qty || 1);
        const rate = Number(w.price || w.amt || 0);
        const lineTotal = qty * rate;
        const adv = Number(w.advance || 0);
        if (adv > 0) totalAdv += adv;

        return {
          id: wid || String(idx + 1),
          desc: w.desc || w.title || 'Creative Deliverable',
          qty,
          rate,
          amount: lineTotal,
        };
      });
      setItems(imported);
      setAdvance(totalAdv);
      showToast(`⚡ Imported ${imported.length} items from ${client.name}!`);
    } else {
      setItems([{ id: '1', desc: 'Creative Deliverable', qty: 1, rate: 0, amount: 0 }]);
      setAdvance(0);
      showToast('ℹ No pending items found for this client');
    }
  };

  // ── Signature Image Upload Handler (Persistent 1-time upload) ──
  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('⚠️ Please upload a valid image file (PNG / JPG)', 'warn');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      setSignatureImage(base64Data);

      // Save to localStorage for instant persistent reuse across all forms
      localStorage.setItem('gt_invoice_signature', base64Data);

      // Also persist to Firebase RTDB under settings/invoiceDefaults
      try {
        await update(ref(db, 'settings/invoiceDefaults'), {
          signature: base64Data,
          updatedAt: Date.now(),
        });
        showToast('✍️ Signature saved! Will appear automatically on all invoices.');
      } catch (err) {
        console.warn('Firebase signature save warning:', err);
        showToast('✍️ Signature saved in browser!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSignature = async () => {
    if (!confirm('Remove saved signature?')) return;
    setSignatureImage('');
    localStorage.removeItem('gt_invoice_signature');
    try {
      await update(ref(db, 'settings/invoiceDefaults'), { signature: null });
      showToast('🗑 Signature removed');
    } catch {
      showToast('🗑 Signature removed from browser');
    }
  };

  // ── Save Bank Defaults (Sync to localStorage and Firebase) ──
  const persistBankDefaults = async (nameVal, accVal, ifscVal, bankVal, branchVal) => {
    localStorage.setItem('gt_inv_bank_name', nameVal);
    localStorage.setItem('gt_inv_bank_acc', accVal);
    localStorage.setItem('gt_inv_bank_ifsc', ifscVal);
    localStorage.setItem('gt_inv_bank_bank', bankVal);
    localStorage.setItem('gt_inv_bank_branch', branchVal);

    try {
      await update(ref(db, 'settings/invoiceDefaults/bankDetails'), {
        name: nameVal,
        accountNo: accVal,
        ifsc: ifscVal,
        bank: bankVal,
        branch: branchVal,
      });
    } catch (err) {
      console.warn('Bank details sync warning:', err);
    }
  };

  // Financial calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.qty || 1);
      const r = Number(item.rate || 0);
      const amt = item.amount != null ? Number(item.amount) : q * r;
      return sum + amt;
    }, 0);
  }, [items]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - Number(advance || 0) - Number(discount || 0) + Number(tax || 0));
  }, [subtotal, advance, discount, tax]);

  // Line item handlers
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: value };
      if (field === 'qty' || field === 'rate') {
        const q = Number(field === 'qty' ? value : target.qty || 1);
        const r = Number(field === 'rate' ? value : target.rate || 0);
        target.amount = q * r;
      }
      next[index] = target;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), desc: '', qty: 1, rate: 0, amount: 0 }
    ]);
  };

  const removeItem = (index) => {
    if (items.length <= 1) {
      setItems([{ id: '1', desc: '', qty: 1, rate: 0, amount: 0 }]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Build the complete invoice payload
  const currentInvoiceData = useMemo(() => {
    return {
      ...(initialInvoice?.id ? { id: initialInvoice.id } : {}),
      invoiceNumber: invoiceNumber.trim() || '001',
      clientId: selectedClientId,
      clientName: clientName.trim() || 'Client',
      clientAddress: clientAddress.trim(),
      clientEmail: clientAddress.trim(),
      fromName: fromName.trim() || BRAND_NAME || 'GT Edits',
      fromAddress: fromAddress.trim(),
      fromEmail: fromEmail.trim(),
      brandName: fromName.trim() || BRAND_NAME || 'GT Edits',
      issueDate,
      dueDate,
      status,
      items: items.map(item => ({
        desc: item.desc || 'Work Item',
        qty: Number(item.qty || 1),
        rate: Number(item.rate || 0),
        amount: Number(item.amount != null ? item.amount : Number(item.qty || 1) * Number(item.rate || 0)),
      })),
      subtotal,
      advance: Number(advance || 0),
      discount: Number(discount || 0),
      tax: Number(tax || 0),
      total: grandTotal,

      // Bank Transaction Details (matching exact user structure)
      bankDetails: {
        name: bankAccountName.trim(),
        accountNo: accountNo.trim(),
        ifsc: ifsc.trim(),
        bank: bankName.trim(),
        branch: branch.trim(),
      },
      bankAccountName: bankAccountName.trim(),
      accountNo: accountNo.trim(),
      ifsc: ifsc.trim(),
      bankName: bankName.trim(),
      branch: branch.trim(),

      // Persistent Signature
      signatureImage,
      signature: signatureImage,
      signatoryText,
      notes,
    };
  }, [
    initialInvoice, invoiceNumber, selectedClientId, clientName, clientAddress,
    fromName, fromAddress, fromEmail, issueDate, dueDate, status, items, subtotal,
    advance, discount, tax, grandTotal, bankAccountName, accountNo, ifsc, bankName,
    branch, signatureImage, signatoryText, notes
  ]);

  // Download PDF Action
  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Auto persist bank details
      persistBankDefaults(bankAccountName, accountNo, ifsc, bankName, branch);
      await generateCustomInvoicePdf(currentInvoiceData);
      showToast('✅ Invoice PDF downloaded!');
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to generate PDF', 'warn');
    } finally {
      setDownloading(false);
    }
  };

  // Save & Issue Action
  const handleSave = async () => {
    if (!selectedClientId) {
      showToast('⚠️ Please select a client', 'warn');
      return;
    }
    if (!invoiceNumber.trim()) {
      showToast('⚠️ Invoice number is required', 'warn');
      return;
    }

    setSaving(true);
    try {
      // Auto persist bank defaults so they stay constant in every form
      persistBankDefaults(bankAccountName, accountNo, ifsc, bankName, branch);

      const saved = await saveInvoice(selectedClientId, currentInvoiceData);
      showToast(`✅ Invoice ${saved.invoiceNumber} saved & issued!`);
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      console.error('Save invoice error:', err);
      showToast(`❌ Save failed: ${err.message}`, 'warn');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const isPaid = status === 'Paid';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inv-modal-wrap">
        
        {/* Modal Top Sticky Header */}
        <div className="inv-modal-header">
          <div className="inv-modal-title-group">
            <span style={{ fontSize: '1.4rem' }}>🧾</span>
            <div>
              <h3 className="inv-modal-title">
                {initialInvoice ? 'Edit Invoice' : 'Create & Issue Invoice'}
              </h3>
              <p className="inv-modal-sub">
                Official invoice generator matching your standard structure & layout
              </p>
            </div>
          </div>

          {/* View Mode Toggle Pill */}
          <div className="inv-view-toggle">
            <button
              type="button"
              className={`inv-view-btn ${viewMode === 'form' ? 'active' : ''}`}
              onClick={() => setViewMode('form')}
            >
              ✏️ Form
            </button>
            <button
              type="button"
              className={`inv-view-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
            >
              ◫ Split
            </button>
            <button
              type="button"
              className={`inv-view-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
            >
              👁 Preview
            </button>
          </div>

          {/* Top Actions */}
          <div className="inv-modal-actions">
            <button
              type="button"
              className="btn-invoice"
              onClick={handleDownload}
              disabled={downloading}
              title="Download official PDF copy"
              style={{ fontWeight: 600, padding: '7px 14px' }}
            >
              {downloading ? '⏳…' : '⬇ Download PDF'}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ fontWeight: 700, padding: '7px 16px' }}
            >
              {saving ? '⏳ Saving…' : '💾 Save & Issue'}
            </button>

            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              title="Close dialog"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className={`inv-modal-body ${viewMode}-view`}>
          
          {/* Left Column: Form Controls */}
          {(viewMode === 'split' || viewMode === 'form') && (
            <div className="inv-form-pane">

              {/* 1. Client Picker Section */}
              <div className="inv-card-section">
                <div className="inv-section-title">
                  <span>Client Information</span>
                  {selectedClientId && (
                    <button
                      type="button"
                      onClick={() => importClientPendingItems(selectedClientId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--green, #16a34a)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0
                      }}
                      title="Import unpaid work items from this client's account"
                    >
                      ⚡ Import Pending Items
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label className="inv-label">Select Client Account</label>
                  <select
                    className="inv-select"
                    value={selectedClientId}
                    onChange={(e) => handleClientChange(e.target.value)}
                  >
                    <option value="">-- Choose a Client --</option>
                    {Object.entries(clients).map(([cid, c]) => {
                      const pendingCount = Object.values(c.work || {}).filter(w => (w.status || 'Pending') !== 'Paid').length;
                      return (
                        <option key={cid} value={cid}>
                          {c.name} {pendingCount > 0 ? `(${pendingCount} pending items)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="inv-grid-2">
                  <div>
                    <label className="inv-label">Client Name (To: Name)</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="e.g. Casper"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Client Address / Email</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="e.g. client@example.com"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 2. From Details & Invoice Meta (Image 1 Header) */}
              <div className="inv-card-section">
                <div className="inv-section-title">Invoice Details & Billed From</div>
                
                <div className="inv-grid-4" style={{ marginBottom: '12px' }}>
                  <div>
                    <label className="inv-label">Invoice #</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="#001"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Date</label>
                    <input
                      type="date"
                      className="inv-input"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Due Date</label>
                    <input
                      type="date"
                      className="inv-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Status</label>
                    <select
                      className="inv-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div className="inv-grid-2">
                  <div>
                    <label className="inv-label">From Name</label>
                    <input
                      type="text"
                      className="inv-input"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">From Address / Tagline</label>
                    <input
                      type="text"
                      className="inv-input"
                      value={fromAddress}
                      onChange={(e) => setFromAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Works / Line Items (Image 1: Works) */}
              <div className="inv-card-section">
                <div className="inv-section-title">
                  <span>Works ({items.length})</span>
                  <button
                    type="button"
                    onClick={addItem}
                    className="btn-secondary"
                    style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                  >
                    ＋ Add Work Item
                  </button>
                </div>

                {/* Table Header Labels */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(130px, 1fr) 60px 85px 80px 30px',
                  gap: '8px',
                  padding: '0 10px 4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  <span>Description</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Rate (₹)</span>
                  <span style={{ textAlign: 'right' }}>Amount</span>
                  <span></span>
                </div>

                {/* Item Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {items.map((item, idx) => (
                    <div key={item.id || idx} className="inv-item-row-card">
                      <input
                        type="text"
                        className="inv-input"
                        placeholder="Deliverable description"
                        value={item.desc}
                        onChange={(e) => handleItemChange(idx, 'desc', e.target.value)}
                      />
                      <input
                        type="number"
                        className="inv-input"
                        placeholder="1"
                        min="1"
                        value={item.qty}
                        onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                        style={{ textAlign: 'center' }}
                      />
                      <input
                        type="number"
                        className="inv-input"
                        placeholder="0"
                        min="0"
                        value={item.rate}
                        onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                        style={{ textAlign: 'right' }}
                      />
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, textAlign: 'right', color: 'var(--text)' }}>
                        ₹{((Number(item.qty || 1) * Number(item.rate || 0))).toLocaleString('en-IN')}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: 0
                        }}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Deductions & Totals */}
              <div className="inv-card-section">
                <div className="inv-section-title">Adjustments & Summary</div>
                <div className="inv-grid-3" style={{ marginBottom: '12px' }}>
                  <div>
                    <label className="inv-label">Advance Deducted (₹)</label>
                    <input
                      type="number"
                      className="inv-input"
                      min="0"
                      value={advance}
                      onChange={(e) => setAdvance(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Discount (₹)</label>
                    <input
                      type="number"
                      className="inv-input"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Tax / GST (₹)</label>
                    <input
                      type="number"
                      className="inv-input"
                      min="0"
                      value={tax}
                      onChange={(e) => setTax(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Subtotal: <strong style={{ color: 'var(--text)' }}>₹{subtotal.toLocaleString('en-IN')}</strong>
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent, #16a34a)' }}>
                    Total Due: ₹{grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* 5. Bank Transaction Details (Exact match to uploaded image) */}
              <div className="inv-card-section">
                <div className="inv-section-title">
                  <span>Bank Transaction Details :</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>
                    💾 Saved once, stays constant for all invoices
                  </span>
                </div>
                
                <div style={{ marginBottom: '10px' }}>
                  <label className="inv-label">Name:</label>
                  <input
                    type="text"
                    className="inv-input"
                    placeholder="Beneficiary / Account Holder Name"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                  />
                </div>

                <div className="inv-grid-2" style={{ marginBottom: '10px' }}>
                  <div>
                    <label className="inv-label">Acc. No:</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="Account Number"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">IFSC CODE:</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="e.g. SBIN0001234"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value)}
                    />
                  </div>
                </div>

                <div className="inv-grid-2">
                  <div>
                    <label className="inv-label">Bank:</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="Bank Name (e.g. State Bank of India)"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Branch :</label>
                    <input
                      type="text"
                      className="inv-input"
                      placeholder="Branch Name / Location"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 6. Signature (One-time upload, stays constant in every form) */}
              <div className="inv-card-section">
                <div className="inv-section-title">
                  <span>Signature (Upload One Time)</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>
                    💾 Persists automatically in every invoice
                  </span>
                </div>

                {signatureImage ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <img
                        src={signatureImage}
                        alt="Saved Signature"
                        style={{ maxHeight: '44px', maxWidth: '160px', objectFit: 'contain' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>
                          ✅ Signature Loaded
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Appears automatically on all invoices & downloads
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="btn-delete-row"
                        onClick={handleRemoveSignature}
                        title="Remove signature"
                        style={{ padding: '5px 8px' }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    border: '2px dashed var(--border-strong, #cbd5e1)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center',
                    background: 'var(--bg3, #f8fafc)',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>✍️</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
                      Upload Your Signature (One Time Only)
                    </div>
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto 10px' }}>
                      Upload a PNG or JPG photo of your handwritten signature. It will be saved and stay constant on every invoice automatically.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      📁 Choose Signature File (PNG/JPG)
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  onChange={handleSignatureUpload}
                  style={{ display: 'none' }}
                />

                <div className="inv-grid-2">
                  <div>
                    <label className="inv-label">Authorized Signatory Name</label>
                    <input
                      type="text"
                      className="inv-input"
                      value={signatoryText}
                      onChange={(e) => setSignatoryText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="inv-label">Footer Email</label>
                    <input
                      type="email"
                      className="inv-input"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <label className="inv-label">Notes & Terms</label>
                  <textarea
                    className="inv-textarea"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}

          {/* Right Column: Live Sheet Preview (Exact Image 1 & Bank Transaction Details specification) */}
          {(viewMode === 'split' || viewMode === 'preview') && (
            <div className="inv-preview-pane">
              <div className="image1-invoice-sheet">
                
                {/* Top Section: Date/Name/Address on left, | INVOICE #001 on right */}
                <div className="img1-top-bar">
                  
                  {/* Top Left Details */}
                  <div>
                    <div className="img1-field-line">
                      <strong>Date:</strong> {issueDate}
                    </div>
                    <div className="img1-field-line">
                      <strong>Name:</strong> {fromName}
                    </div>
                    <div className="img1-field-line">
                      <strong>Address:</strong> {fromAddress}
                    </div>
                    <div className="img1-divider"></div>

                    {/* To Section */}
                    <div className="img1-to-section">
                      <div className="img1-to-title">To:</div>
                      <div className="img1-field-line">
                        <strong>Name:</strong> {clientName || 'Client'}
                      </div>
                      <div className="img1-field-line">
                        <strong>Address:</strong> {clientAddress || '—'}
                      </div>
                      <div className="img1-divider"></div>
                    </div>
                  </div>

                  {/* Top Right: | INVOICE #001 */}
                  <div style={{ textAlign: 'right' }}>
                    <div className="img1-invoice-title">
                      <span className="img1-title-pipe"></span>
                      <span>INVOICE {invoiceNumber.startsWith('#') ? invoiceNumber : '#' + invoiceNumber}</span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span
                        className="img1-status-pill"
                        style={{ background: isPaid ? '#16a34a' : '#ea580c' }}
                      >
                        {status}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Works Section Title */}
                <div className="img1-works-title">Works</div>

                {/* Works Table */}
                <table className="img1-works-table">
                  <thead>
                    <tr>
                      <th style={{ width: '28px', textAlign: 'center' }}>#</th>
                      <th>Deliverable / Work</th>
                      <th className="center" style={{ width: '48px' }}>Qty</th>
                      <th className="right" style={{ width: '85px' }}>Rate</th>
                      <th className="right" style={{ width: '95px' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="center" style={{ color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{it.desc || '—'}</td>
                        <td className="center">{it.qty}</td>
                        <td className="right">₹{Number(it.rate || 0).toLocaleString('en-IN')}</td>
                        <td className="right" style={{ fontWeight: 700 }}>
                          ₹{(Number(it.qty || 1) * Number(it.rate || 0)).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals Breakdown */}
                <div className="img1-summary-box">
                  <div className="img1-summary-row">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {advance > 0 && (
                    <div className="img1-summary-row" style={{ color: '#16a34a' }}>
                      <span>Advance Paid:</span>
                      <span>- ₹{Number(advance).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="img1-summary-row" style={{ color: '#2563eb' }}>
                      <span>Discount:</span>
                      <span>- ₹{Number(discount).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="img1-summary-row">
                      <span>Tax / GST:</span>
                      <span>+ ₹{Number(tax).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className={`img1-total-badge ${isPaid ? 'paid' : ''}`}>
                    <span>{isPaid ? 'TOTAL PAID:' : 'TOTAL DUE:'}</span>
                    <span>₹{grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Bank Transaction Details (matching exact user specification) */}
                <div className="img1-bank-title" style={{ fontWeight: 800 }}>Bank Transaction Details :</div>
                <div className="img1-field-line">
                  <strong>Name:</strong> {bankAccountName}
                </div>
                <div className="img1-field-line">
                  <strong>Acc. No:</strong> {accountNo}
                </div>
                <div className="img1-field-line">
                  <strong>IFSC CODE:</strong> {ifsc}
                </div>
                <div className="img1-field-line">
                  <strong>Bank:</strong> {bankName}
                </div>
                <div className="img1-field-line">
                  <strong>Branch :</strong> {branch}
                </div>
                <div className="img1-divider"></div>

                {notes && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', margin: '4px 0 10px' }}>
                    Note: {notes}
                  </div>
                )}

                {/* Bottom Footer: Sign and Email */}
                <div className="img1-footer-bar">
                  <div className="img1-sign-box">
                    <span>Sign:</span>
                    {signatureImage ? (
                      <span style={{ display: 'inline-block', verticalAlign: 'bottom', marginLeft: '6px' }}>
                        <img
                          src={signatureImage}
                          alt="Signature"
                          style={{ maxHeight: '38px', maxWidth: '140px', objectFit: 'contain', display: 'block' }}
                        />
                      </span>
                    ) : (
                      <span className="img1-sign-line"></span>
                    )}
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginTop: '2px', marginLeft: '40px' }}>
                      {signatoryText}
                    </div>
                  </div>

                  <div className="img1-email-box">
                    Email: <span>{fromEmail}</span>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
