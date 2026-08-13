import { forwardRef } from 'react';
import { formatDate } from '../utils';

const InvoicePrint = forwardRef(({ clientName, work, brandName }, ref) => {
  let total = 0;
  const rows = Object.values(work || []).map((w, i) => {
    const qty       = Number(w.qty || 1);
    const price     = Number(w.price || w.amt || 0);
    const lineTotal = qty * price;
    total += lineTotal;
    return { i, w, qty, price, lineTotal };
  });

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return (
    <div ref={ref} id="invoicePrintArea">
      <div className="inv-page">
        <header className="inv-header">
          <div className="inv-brand">
            <span className="inv-brand-icon">⚡</span>
            <div>
              <h1 className="inv-brand-name">{brandName}</h1>
            </div>
          </div>
          <div className="inv-meta">
            <p className="inv-label">INVOICE</p>
            <p className="inv-date">{today}</p>
          </div>
        </header>

        <div className="inv-parties">
          <div className="inv-from">
            <p className="inv-section-label">From</p>
            <p className="inv-party-name">{brandName}</p>
          </div>
          <div className="inv-to">
            <p className="inv-section-label">Bill To</p>
            <p className="inv-party-name">{clientName}</p>
          </div>
        </div>

        <table className="inv-table">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th>Date</th>
              <th>Qty</th><th>Unit Price</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, w, qty, price, lineTotal }) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{w.desc}</td>
                <td>{w.date ? formatDate(w.date) : '—'}</td>
                <td>{qty}</td>
                <td>₹{price.toLocaleString('en-IN')}</td>
                <td>₹{lineTotal.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <div className="inv-total-row">
            <span>Subtotal</span>
            <span>₹{total.toLocaleString('en-IN')}</span>
          </div>
          <div className="inv-total-row inv-grand-total">
            <span>Grand Total</span>
            <span>₹{total.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <footer className="inv-footer">
          <p>Thank you for your business! 🙏</p>
        </footer>
      </div>
    </div>
  );
});

InvoicePrint.displayName = 'InvoicePrint';
export default InvoicePrint;
