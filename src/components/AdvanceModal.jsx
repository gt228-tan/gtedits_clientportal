import { useState, useEffect, useRef } from 'react';
import { db, ref, update } from '../firebase';
import { showToast } from './Toast';

export default function AdvanceModal({ clientId, workId, work, onClose }) {
  const [amount, setAmount] = useState('');
  const inputRef = useRef(null);

  const w = work?.[workId];
  const lineTotal = w ? (Number(w.qty || 1) * Number(w.price || w.amt || 0)) : 0;

  useEffect(() => {
    if (w) setAmount(w.advance || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [workId]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { showToast('⚠️ Enter a valid amount', 'warn'); return; }
    try {
      await update(ref(db, `clients/${clientId}/work/${workId}`), {
        status: 'Advance',
        advance: amt
      });
      showToast('💰 Advance saved!');
      onClose();
    } catch (err) {
      console.error(err); showToast('❌ Save failed', 'warn');
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSave(); };

  return (
    <div className="adv-overlay" onClick={e => e.target === e.currentTarget && onClose(true)}>
      <div className="adv-box">
        <div className="adv-icon">💰</div>
        <h4 className="adv-title">Advance Payment</h4>
        <p className="adv-sub">How much has been paid in advance?</p>
        <div className="adv-input-wrap">
          <span className="adv-prefix">₹</span>
          <input
            ref={inputRef}
            type="number"
            placeholder="0"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="adv-work-info">Total: ₹{lineTotal.toLocaleString('en-IN')}</div>
        <div className="adv-actions">
          <button className="btn-adv-confirm" onClick={handleSave}>Save Advance</button>
          <button className="btn-adv-cancel"  onClick={() => onClose(true)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
