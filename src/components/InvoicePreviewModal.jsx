import { useState } from 'react';
import { generateCustomInvoicePdf, formatCurrency } from '../generateInvoice';
import { updateInvoiceStatus, deleteInvoice } from '../api/invoices';
import { showToast } from './Toast';

export default function InvoicePreviewModal({
  invoice,
  isAdmin = false,
  onClose,
  onStatusChange,
  onDelete,
}) {
  const [downloading, setDownloading] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (!invoice) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateCustomInvoicePdf(invoice);
      showToast('✅ Invoice downloaded successfully!');
    } catch (err) {
      console.error('Download error:', err);
      showToast('❌ Failed to download invoice PDF', 'warn');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleToggleStatus = async () => {
    if (!isAdmin || !invoice.clientId || !invoice.id) return;
    setUpdating(true);
    const newStatus = invoice.status === 'Paid' ? 'Pending' : 'Paid';
    try {
      await updateInvoiceStatus(invoice.clientId, invoice.id, newStatus);
      showToast(`✅ Invoice marked as ${newStatus}!`);
      if (onStatusChange) onStatusChange(newStatus);
    } catch (err) {
      console.error(err);
      showToast('❌ Status update failed', 'warn');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !invoice.clientId || !invoice.id) return;
    if (!confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber || 'this invoice'}?`)) return;
    try {
      await deleteInvoice(invoice.clientId, invoice.id);
      showToast('🗑 Invoice deleted');
      if (onDelete) onDelete(invoice.id);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to delete invoice', 'warn');
    }
  };

  const isPaid = (invoice.status || 'Pending').toLowerCase() === 'paid';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const invoiceNo = String(invoice.invoiceNumber || '001');

  // Bank Transaction Details
  const bank = typeof invoice.bankDetails === 'object' && invoice.bankDetails !== null
    ? invoice.bankDetails
    : {
        name: invoice.bankAccountName || invoice.name || invoice.fromName || 'GT Edits',
        accountNo: invoice.accountNo || invoice.accNo || '',
        ifsc: invoice.ifsc || invoice.ifscCode || '',
        bank: invoice.bankName || invoice.bank || '',
        branch: invoice.branch || '',
      };

  const sigImg = invoice.signatureImage || invoice.signature || localStorage.getItem('gt_invoice_signature');

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inv-modal-wrap" style={{ maxWidth: 840 }}>
        
        {/* Top Control Bar */}
        <div className="inv-modal-header">
          <div className="inv-header-main">
            <div className="inv-modal-title-group">
              <span className="inv-title-icon" style={{ fontSize: '1.25rem' }}>🧾</span>
              <div>
                <h3 className="inv-modal-title">
                  INVOICE {invoiceNo.startsWith('#') ? invoiceNo : '#' + invoiceNo}
                </h3>
                <p className="inv-modal-sub">
                  Issued to {invoice.clientName} · {invoice.issueDate || 'N/A'}
                </p>
              </div>
            </div>
            <button className="modal-close inv-mobile-close" onClick={onClose} title="Close">✕</button>
          </div>

          <div className="inv-modal-actions">
            <button
              className="btn-invoice inv-action-btn"
              onClick={handleDownload}
              disabled={downloading}
              title="Download official PDF copy"
              style={{ fontWeight: 600, padding: '7px 12px' }}
            >
              {downloading ? '⏳…' : '⬇ PDF'}
            </button>

            <button
              className="btn-secondary inv-action-btn"
              onClick={handlePrint}
              title="Print Invoice"
              style={{ padding: '7px 12px', fontSize: '0.85rem' }}
            >
              🖨 Print
            </button>

            {isAdmin && (
              <button
                className={`btn-secondary inv-action-btn ${isPaid ? 'btn-paid-toggle' : ''}`}
                onClick={handleToggleStatus}
                disabled={updating}
                style={{
                  padding: '7px 12px',
                  fontSize: '0.82rem',
                  borderColor: isPaid ? 'var(--green, #16a34a)' : 'var(--border)',
                  color: isPaid ? 'var(--green, #16a34a)' : 'var(--text)'
                }}
              >
                {isPaid ? '✓ Paid' : '○ Mark Paid'}
              </button>
            )}

            {isAdmin && (
              <button
                className="btn-delete-row inv-action-btn"
                onClick={handleDelete}
                title="Delete invoice"
                style={{ padding: '7px 10px' }}
              >
                🗑
              </button>
            )}

            <button className="modal-close inv-desktop-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Invoice Body (Sheet formatted as Image 1) */}
        <div className="inv-preview-pane" style={{ padding: '24px 20px', maxHeight: '82vh', overflowY: 'auto' }}>
          <div className="image1-invoice-sheet invoice-paper-sheet" style={{ width: '100%', maxWidth: '640px' }}>
            
            {/* Top Bar: Date, Name, Address on Left; | INVOICE #001 on Right */}
            <div className="img1-top-bar">
              <div>
                <div className="img1-field-line">
                  <strong>Date:</strong> {invoice.issueDate || 'N/A'}
                </div>
                <div className="img1-field-line">
                  <strong>Name:</strong> {invoice.fromName || invoice.brandName || 'GT Edits'}
                </div>
                <div className="img1-field-line">
                  <strong>Address:</strong> {invoice.fromAddress || 'Video Production & Creative Services'}
                </div>
                <div className="img1-divider"></div>

                {/* To: Section */}
                <div className="img1-to-section">
                  <div className="img1-to-title">To:</div>
                  <div className="img1-field-line">
                    <strong>Name:</strong> {invoice.clientName || 'Client'}
                  </div>
                  <div className="img1-field-line">
                    <strong>Address:</strong> {invoice.clientAddress || invoice.clientEmail || '—'}
                  </div>
                  <div className="img1-divider"></div>
                </div>
              </div>

              {/* Top Right: | INVOICE #001 */}
              <div style={{ textAlign: 'right' }}>
                <div className="img1-invoice-title">
                  <span className="img1-title-pipe"></span>
                  <span>INVOICE {invoiceNo.startsWith('#') ? invoiceNo : '#' + invoiceNo}</span>
                </div>
                <div style={{ marginTop: '5px' }}>
                  <span
                    className="img1-status-pill"
                    style={{ background: isPaid ? '#16a34a' : '#ea580c' }}
                  >
                    {invoice.status || 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Works Section */}
            <div className="img1-works-title">Works</div>

            <div className="img1-table-wrapper">
              <table className="img1-works-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px', textAlign: 'center' }}>#</th>
                    <th>Deliverable / Description</th>
                    <th className="center" style={{ width: '50px' }}>Qty</th>
                    <th className="right" style={{ width: '90px' }}>Rate</th>
                    <th className="right" style={{ width: '100px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="center" style={{ color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{it.desc || '—'}</td>
                      <td className="center">{it.qty}</td>
                      <td className="right">₹{Number(it.rate || it.price || 0).toLocaleString('en-IN')}</td>
                      <td className="right" style={{ fontWeight: 700 }}>
                        ₹{((Number(it.qty || 1) * Number(it.rate || it.price || 0))).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Breakdown */}
            <div className="img1-summary-box">
              <div className="img1-summary-row">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal || invoice.total)}</span>
              </div>
              {Number(invoice.advance || 0) > 0 && (
                <div className="img1-summary-row" style={{ color: '#16a34a' }}>
                  <span>Advance Paid:</span>
                  <span>- {formatCurrency(invoice.advance)}</span>
                </div>
              )}
              {Number(invoice.discount || 0) > 0 && (
                <div className="img1-summary-row" style={{ color: '#2563eb' }}>
                  <span>Discount:</span>
                  <span>- {formatCurrency(invoice.discount)}</span>
                </div>
              )}
              {Number(invoice.tax || 0) > 0 && (
                <div className="img1-summary-row">
                  <span>Tax / GST:</span>
                  <span>+ {formatCurrency(invoice.tax)}</span>
                </div>
              )}
              <div className={`img1-total-badge ${isPaid ? 'paid' : ''}`}>
                <span>{isPaid ? 'TOTAL PAID:' : 'TOTAL DUE:'}</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>

            {/* Bank Transaction Details (exact match to specification) */}
            <div className="img1-bank-title" style={{ fontWeight: 800 }}>Bank Transaction Details :</div>
            <div className="img1-field-line">
              <strong>Name:</strong> {bank.name || invoice.fromName || 'GT Edits'}
            </div>
            <div className="img1-field-line">
              <strong>Acc. No:</strong> {bank.accountNo || bank.accNo || '—'}
            </div>
            <div className="img1-field-line">
              <strong>IFSC CODE:</strong> {bank.ifsc || '—'}
            </div>
            <div className="img1-field-line">
              <strong>Bank:</strong> {bank.bank || bank.bankName || '—'}
            </div>
            <div className="img1-field-line">
              <strong>Branch :</strong> {bank.branch || '—'}
            </div>
            <div className="img1-divider"></div>

            {invoice.notes && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', margin: '4px 0 10px' }}>
                Note: {invoice.notes}
              </div>
            )}

            {/* Bottom Footer: Sign and Email */}
            <div className="img1-footer-bar">
              <div className="img1-sign-box">
                <span>Sign:</span>
                {sigImg ? (
                  <span style={{ display: 'inline-block', verticalAlign: 'bottom', marginLeft: '6px' }}>
                    <img
                      src={sigImg}
                      alt="Signature"
                      style={{ maxHeight: '38px', maxWidth: '140px', objectFit: 'contain', display: 'block' }}
                    />
                  </span>
                ) : (
                  <span className="img1-sign-line"></span>
                )}
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginTop: '2px', marginLeft: '40px' }}>
                  {invoice.signatoryText || `${invoice.fromName || invoice.brandName || 'GT Edits'} Authorized`}
                </div>
              </div>

              <div className="img1-email-box">
                Email: <span>{invoice.fromEmail || 'contact@gtedits.com'}</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
