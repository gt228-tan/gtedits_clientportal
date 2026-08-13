import { useState, useEffect, Fragment } from 'react';
import { db, ref, push, update, remove } from '../firebase';
import { showToast } from './Toast';
import { buildWorkSections, formatDate, getSectionMetaForSave, compareWorkDates } from '../utils';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function WorkModal({ clientId, clientName, work, onClose, onAdvance }) {
  const [desc,      setDesc]      = useState('');
  const [qty,       setQty]       = useState(1);
  const [price,     setPrice]     = useState('');
  const [date,      setDate]      = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState(null);
  const [busy,      setBusy]      = useState(false);

  const workPath = `clients/${clientId}/work`;

  const resetForm = () => {
    setDesc(''); setQty(1); setPrice('');
    setDate(new Date().toISOString().split('T')[0]);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!desc.trim() || isNaN(parseFloat(price))) {
      showToast('⚠️ Fill description and price', 'warn'); return;
    }
    setBusy(true);
    const workEntries = Object.entries(work || {});
    const sectionMeta = getSectionMetaForSave(date, workEntries, editingId);
    const entry = {
      desc: desc.trim(),
      qty:  parseInt(qty) || 1,
      price: parseFloat(price),
      date,
      status: editingId
        ? (work[editingId]?.status || 'Pending')
        : 'Pending',
      sectionKey:   sectionMeta.key,
      sectionLabel: sectionMeta.label,
      sectionType:  sectionMeta.type
    };

    try {
      if (editingId) {
        await update(ref(db, `${workPath}/${editingId}`), entry);
        showToast('✅ Item updated!');
      } else {
        await push(ref(db, workPath), entry);
        showToast('✅ Work added!');
      }
      resetForm();
    } catch (err) {
      console.error(err); showToast('❌ Save failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (wid) => {
    const w = work[wid];
    if (!w) return;
    setEditingId(wid);
    setDesc(w.desc || '');
    setQty(w.qty || 1);
    setPrice(w.price || w.amt || '');
    setDate(w.date || new Date().toISOString().split('T')[0]);
  };

  const handleDelete = async (wid) => {
    if (!confirm('Remove this item?')) return;
    try {
      await remove(ref(db, `${workPath}/${wid}`));
      showToast('🗑️ Item removed');
      if (editingId === wid) resetForm();
    } catch (err) { showToast('❌ Delete failed', 'warn'); }
  };

  const handleChangeStatus = (wid, newStatus) => {
    if (newStatus === 'Advance') { onAdvance(wid); return; }
    update(ref(db, `${workPath}/${wid}`), { status: newStatus, advance: 0 })
      .then(() => showToast(newStatus === 'Paid' ? '✅ Marked Paid' : '↩️ Marked Pending'))
      .catch(() => showToast('❌ Update failed', 'warn'));
  };

  const [workTab, setWorkTab] = useState('Remaining'); // 'Remaining' | 'Paid' | 'All'

  // Subtotal
  const subtotal = Object.values(work || {}).reduce(
    (s, w) => s + (Number(w.qty || 1) * Number(w.price || w.amt || 0)), 0
  );

  const workItems     = Object.entries(work || {}).map(([wid, w]) => ({ wid, ...w }));
  const remainingWork = workItems.filter(w => (w.status || 'Pending') !== 'Paid');
  const paidWork      = workItems.filter(w => (w.status || 'Pending') === 'Paid');
  const displayWork   = workTab === 'Remaining' ? remainingWork : workTab === 'Paid' ? paidWork : workItems;
  const sections      = buildWorkSections(displayWork);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box work-modal-box">

        <div className="modal-header">
          <h3>Work Items — {clientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Add / Edit form */}
        <div className="work-form-wrap">
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="work-form-grid">
              <div className="form-group fg-desc">
                <label htmlFor="wm-desc">Description</label>
                <input id="wm-desc" type="text" placeholder="e.g. Instagram Reels"
                  value={desc} onChange={e => setDesc(e.target.value)} required />
              </div>
              <div className="form-group fg-qty">
                <label htmlFor="wm-qty">Qty</label>
                <input id="wm-qty" type="number" min="1"
                  value={qty} onChange={e => setQty(e.target.value)} required />
              </div>
              <div className="form-group fg-price">
                <label htmlFor="wm-price">Price / unit (₹)</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">₹</span>
                  <input id="wm-price" type="number" placeholder="300" min="0"
                    value={price} onChange={e => setPrice(e.target.value)} required />
                </div>
              </div>
              <div className="form-group fg-date">
                <label htmlFor="wm-date">Date</label>
                <input id="wm-date" type="date"
                  value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div className="work-form-actions">
              <button type="submit" className="btn-add-work" disabled={busy}>
                {editingId ? '✅ Update Item' : '＋ Add Item'}
              </button>
              {editingId && (
                <button type="button" className="btn-cancel-work" onClick={resetForm}>
                  ✕ Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Category Tabs */}
        <div className="wr-tabs" style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className={`wr-tab ${workTab === 'Remaining' ? 'active' : ''}`}
            onClick={() => setWorkTab('Remaining')}
          >
            ⏳ Remaining Payment ({remainingWork.length})
          </button>
          <button
            type="button"
            className={`wr-tab ${workTab === 'Paid' ? 'active' : ''}`}
            onClick={() => setWorkTab('Paid')}
          >
            ✅ Paid ({paidWork.length})
          </button>
          <button
            type="button"
            className={`wr-tab ${workTab === 'All' ? 'active' : ''}`}
            onClick={() => setWorkTab('All')}
          >
            📋 All Items ({workItems.length})
          </button>
        </div>

        {/* Work table */}
        <div className="work-table-wrap">
          {displayWork.length === 0 ? (
            <div id="adminWorkEmpty" className="work-empty">
              No {workTab === 'Remaining' ? 'remaining payment' : workTab === 'Paid' ? 'paid' : ''} items found.
            </div>
          ) : (
            <table className="work-table">
              <thead>
                <tr>
                  <th>#</th><th>Description</th><th>Qty</th>
                  <th>Price</th><th>Total</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sections.map(section => (
                  <Fragment key={section.key}>
                    <tr className="section-header">
                      <td colSpan={7}>{section.label}</td>
                    </tr>
                    {section.rows.map((w, i) => {
                      const q = Number(w.qty || 1);
                      const p = Number(w.price || w.amt || 0);
                      const lineTotal = q * p;
                      const wStatus = w.status || 'Pending';
                      const isAdv   = wStatus === 'Advance';
                      const advAmt  = Number(w.advance || 0);
                      const sc      = wStatus.toLowerCase();
                      return (
                        <tr key={w.wid}>
                          <td className="col-num">{i + 1}</td>
                          <td className="col-desc">
                            {w.desc}
                            {w.date && <><br /><small className="row-date">{formatDate(w.date)}</small></>}
                          </td>
                          <td className="col-num">{q}</td>
                          <td className="col-amt">₹{p.toLocaleString('en-IN')}</td>
                          <td className="col-amt col-total">₹{lineTotal.toLocaleString('en-IN')}</td>
                          <td className="col-status">
                            <select
                              className={`work-status-select s-${sc}`}
                              value={wStatus}
                              onChange={ev => handleChangeStatus(w.wid, ev.target.value)}
                            >
                              <option value="Pending">⏳ Pending</option>
                              <option value="Advance">💰 Advance</option>
                              <option value="Paid">💚 Paid</option>
                            </select>
                            {isAdv && (
                              <span className="adv-remain">
                                ₹{advAmt.toLocaleString('en-IN')} paid · ₹{(lineTotal - advAmt).toLocaleString('en-IN')} due
                              </span>
                            )}
                          </td>
                          <td className="col-actions">
                            <button className="btn-row-action edit" title="Edit" onClick={() => handleEdit(w.wid)}>✏️</button>
                            <button className="btn-row-action del"  title="Delete" onClick={() => handleDelete(w.wid)}>🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Subtotal */}
        <div className="work-summary">
          <div className="work-summary-row total-row">
            <span>Subtotal</span>
            <span>₹{subtotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
