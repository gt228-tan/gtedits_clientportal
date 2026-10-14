import { buildWorkSections, computeTotals, formatDate } from '../utils';
import { generateInvoice } from '../generateInvoice';
import { BRAND_NAME }      from '../contexts/AuthContext';
import { showToast }       from './Toast';
import { useState, Fragment } from 'react';

export default function ClientPreviewModal({ clientName, work, driveFolderUrl, onClose }) {
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
            {driveFolderUrl && (
              <a
                href={driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-invoice"
                title="Open client Google Drive folder"
              >
                📂 Drive Folder
              </a>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="bento-stats-grid" style={{ margin: '14px 0 18px', gap: '12px' }}>
          <div className="bento-stat-card stat-card-clients" style={{ padding: '14px 16px', gap: '8px' }}>
            <div className="bento-stat-top">
              <div className="bento-stat-icon-wrap icon-clients" style={{ width: '28px', height: '28px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                  <path d="M12 22V12" />
                </svg>
              </div>
              <span className="bento-stat-label" style={{ fontSize: '0.75rem' }}>Total Value</span>
            </div>
            <div className="bento-stat-bottom">
              <span className="bento-stat-val" style={{ fontSize: '1.45rem' }}>₹{totals.total.toLocaleString('en-IN')}</span>
              <span className="bento-trend-pill trend-neutral">{workArr.length} items</span>
            </div>
          </div>

          <div className="bento-stat-card stat-card-earned" style={{ padding: '14px 16px', gap: '8px' }}>
            <div className="bento-stat-top">
              <div className="bento-stat-icon-wrap" style={{ width: '28px', height: '28px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <span className="bento-stat-label" style={{ fontSize: '0.75rem' }}>Paid</span>
            </div>
            <div className="bento-stat-bottom">
              <span className="bento-stat-val" style={{ fontSize: '1.45rem' }}>₹{totals.paid.toLocaleString('en-IN')}</span>
              <span className="bento-trend-pill trend-up">Paid</span>
            </div>
          </div>

          <div className="bento-stat-card stat-card-pending" style={{ padding: '14px 16px', gap: '8px' }}>
            <div className="bento-stat-top">
              <div className="bento-stat-icon-wrap icon-pending" style={{ width: '28px', height: '28px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <span className="bento-stat-label" style={{ fontSize: '0.75rem' }}>Due</span>
            </div>
            <div className="bento-stat-bottom">
              <span className={`bento-stat-val ${totals.pending > 0 ? 'val-pending' : ''}`} style={{ fontSize: '1.45rem' }}>₹{totals.pending.toLocaleString('en-IN')}</span>
              <span className={`bento-trend-pill ${totals.pending > 0 ? 'trend-warning' : 'trend-up'}`}>{totals.pending > 0 ? 'Due' : 'Clear'}</span>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="client-filter-group" role="tablist" style={{ margin: '14px 0 12px' }}>
          <button
            type="button"
            className={`filter-pill-btn pill-btn-due ${workTab === 'Remaining' ? 'active' : ''}`}
            onClick={() => setWorkTab('Remaining')}
          >
            <span>⏳ Remaining</span>
            <span className={`pill-count ${remainingWork.length > 0 ? 'count-warning' : ''}`}>{remainingWork.length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${workTab === 'Paid' ? 'active' : ''}`}
            onClick={() => setWorkTab('Paid')}
          >
            <span>✅ Paid</span>
            <span className="pill-count">{paidWork.length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${workTab === 'All' ? 'active' : ''}`}
            onClick={() => setWorkTab('All')}
          >
            <span>📋 All Items</span>
            <span className="pill-count">{workArr.length}</span>
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
