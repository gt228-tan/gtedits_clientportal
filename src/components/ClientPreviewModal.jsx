import { buildWorkSections, computeTotals, formatDate } from '../utils';
import { generateInvoice } from '../generateInvoice';
import { BRAND_NAME }      from '../contexts/AuthContext';
import { showToast }       from './Toast';
import { useState, Fragment } from 'react';

export default function ClientPreviewModal({ clientName, work, onClose }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [workTab, setWorkTab] = useState('Remaining'); // 'Remaining' | 'Paid' | 'All'

  const workArr       = Object.entries(work || {}).map(([id, w]) => ({ id, ...w }));
  const totals        = computeTotals(workArr);
  const remainingWork = workArr.filter(w => (w.status || 'Pending') !== 'Paid');
  const paidWork      = workArr.filter(w => (w.status || 'Pending') === 'Paid');
  const displayWork   = workTab === 'Remaining' ? remainingWork : workTab === 'Paid' ? paidWork : workArr;
  const sections      = buildWorkSections(displayWork);

  const handleDownload = async () => {
    setPdfBusy(true);
    try {
      await generateInvoice({ clientName, work, brandName: BRAND_NAME });
      showToast('✅ Invoice downloaded!');
    } catch (err) {
      showToast('❌ PDF failed', 'warn');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 900, padding: '1.75rem' }}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h3>👁 Viewing — {clientName}</h3>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.15rem' }}>
              Admin preview · Client sees exactly this
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
            <button className="btn-invoice" onClick={handleDownload} disabled={pdfBusy}>
              {pdfBusy ? '⏳…' : '⬇ Invoice'}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="summary-row" style={{ padding: '.85rem 0', gap: '.75rem' }}>
          <div className="sum-card sum-total" style={{ flex: 1 }}>
            <div className="sum-icon">📦</div>
            <div>
              <p className="sum-label">Total Value</p>
              <p className="sum-value">Rs. {totals.total.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="sum-card sum-paid" style={{ flex: 1 }}>
            <div className="sum-icon">✅</div>
            <div>
              <p className="sum-label">Paid</p>
              <p className="sum-value">Rs. {totals.paid.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="sum-card sum-pending" style={{ flex: 1 }}>
            <div className="sum-icon">⏳</div>
            <div>
              <p className="sum-label">Due</p>
              <p className="sum-value">Rs. {totals.pending.toLocaleString('en-US')}</p>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="wr-tabs" style={{ margin: '12px 0 10px' }}>
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
            📋 All Items ({workArr.length})
          </button>
        </div>

        {/* Work table */}
        <div className="table-wrap">
          {displayWork.length === 0 ? (
            <div className="work-empty">
              <div className="empty-icon">📭</div>
              <p>No {workTab === 'Remaining' ? 'remaining payment' : workTab === 'Paid' ? 'paid' : ''} work items.</p>
            </div>
          ) : (
            <table className="work-table">
              <thead>
                <tr>
                  <th>#</th><th>Description</th><th>Qty</th>
                  <th>Unit Price</th><th>Total</th><th>Status</th><th>Amount Due</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(section => (
                  <Fragment key={section.key}>
                    <tr className="section-header">
                      <td colSpan={7}>{section.label}</td>
                    </tr>
                    {section.rows.map((w, i) => {
                      const qty       = Number(w.qty || 1);
                      const price     = Number(w.price || w.amt || 0);
                      const lineTotal = qty * price;
                      const status    = w.status || 'Pending';
                      const advAmt    = Number(w.advance || 0);
                      const amtDue    = status === 'Pending' ? lineTotal
                                      : status === 'Advance' ? lineTotal - advAmt : 0;

                      return (
                        <tr key={w.id}>
                          <td className="col-num"    data-label="#">{i + 1}</td>
                          <td className="col-desc"   data-label="Description">
                            {w.desc}
                            {w.date && <><br /><small className="row-date">{formatDate(w.date)}</small></>}
                          </td>
                          <td className="col-num"    data-label="Qty">{qty}</td>
                          <td className="col-amt"    data-label="Unit Price">Rs. {price.toLocaleString('en-US')}</td>
                          <td className="col-amt col-total" data-label="Total">Rs. {lineTotal.toLocaleString('en-US')}</td>
                          <td className="col-status" data-label="Status">
                            <span className={`badge badge-${status.toLowerCase()}`}>
                              {status === 'Pending' ? '⏳ Pending'
                               : status === 'Advance' ? '💰 Advance'
                               : '✅ Paid'}
                            </span>
                          </td>
                          <td className="col-amt col-due" data-label="Amount Due">
                            {amtDue > 0
                              ? <span className="due-highlight">Rs. {amtDue.toLocaleString('en-US')}</span>
                              : <span className="due-clear">—</span>
                            }
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

        {/* Footer note */}
        <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
          🛡️ Admin preview — client's login credentials: <strong>{clientName.toLowerCase().replace(/\s+/g, '')}@gtportal.com</strong>
          &nbsp;/&nbsp;<strong>{clientName.toLowerCase().replace(/\s+/g, '')}@123</strong>
        </p>
      </div>
    </div>
  );
}
