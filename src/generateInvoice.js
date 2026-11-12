/**
 * generateInvoice.js
 * Generates official PDF invoices matching the exact structure from user specification:
 *
 *  - Top Right: | INVOICE #001
 *  - Top Left:
 *      Date: ...
 *      Name: ...
 *      Address: ...
 *      ───────
 *  - To Section:
 *      To:
 *      Name: ...
 *      Address: ...
 *      ───────
 *  - Works Section (Table with line items, subtotal, advance, total)
 *  - Bank Transaction Details :
 *      Name:
 *      Acc. No:
 *      IFSC CODE:
 *      Bank:
 *      Branch :
 *      ───────
 *  - Bottom Footer:
 *      Sign: [Signature Image] ───────          Email: ...
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Color Palette ───────────────────────────────────────────
const BLACK      = [20,  24,  33];   // #141821 - Deep modern dark
const GREY_DARK  = [75,  85,  99];   // #4b5563 - Subdued text
const GREY_LIGHT = [248, 249, 250];  // #f8f9fa - Row fill
const BORDER_COL = [209, 213, 219];  // #d1d5db - Divider & grid borders
const GREEN      = [22,  163, 74];   // #16a34a - Paid badge
const RED        = [220, 38,  38];   // #dc2626 - Balance due highlight
const WHITE      = [255, 255, 255];

// ── Currency Formatter (Helvetica safe) ─────────────────────
export const formatCurrency = (n) => {
  const num = Number(n || 0);
  return 'Rs. ' + num.toLocaleString('en-IN');
};

const Rs = formatCurrency;

/**
 * Generates an invoice PDF exactly matching the Image 1 structure
 * @param {Object} invoice
 * @param {Object} [options]
 * @param {boolean} [options.save=true] If false, generates PDF without triggering browser download
 */
export function generateCustomInvoicePdf(invoice, options = { save: true }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210;
      const PH = 297;
      const M  = 16;           // 16mm margin
      const CW = PW - M * 2;   // 178mm content width

      // Normalize fields
      let invoiceNo = String(invoice.invoiceNumber || '001').trim();
      if (!invoiceNo.startsWith('#') && !invoiceNo.toUpperCase().startsWith('INV')) {
        invoiceNo = '#' + invoiceNo;
      }

      const issueDate = invoice.issueDate || new Date().toISOString().slice(0, 10);
      const fromName = invoice.fromName || invoice.brandName || 'GT Edits';
      const fromAddress = invoice.fromAddress || 'Video Production & Creative Services';
      const fromEmail = invoice.fromEmail || 'gtbtbhay22@gmail.com';

      const clientName = invoice.clientName || 'Client';
      const clientAddress = invoice.clientAddress || invoice.clientEmail || 'Client Account';
      const status = (invoice.status || 'Pending').toUpperCase();
      const isPaid = status === 'PAID';

      // Visibility Flags
      const hideClientAddress = Boolean(invoice.hideClientAddress);
      const hideFromAddress   = Boolean(invoice.hideFromAddress);
      const hideBankDetails   = Boolean(invoice.hideBankDetails);
      const hideNotes         = Boolean(invoice.hideNotes);
      const hideSignature     = Boolean(invoice.hideSignature);
      const hideEmail         = Boolean(invoice.hideEmail);
      const hideDueDate       = Boolean(invoice.hideDueDate);

      // Bank Transaction Details (matching exact user structure)
      const bank = typeof invoice.bankDetails === 'object' && invoice.bankDetails !== null
        ? invoice.bankDetails
        : {
            name: invoice.bankAccountName || invoice.accountHolderName || invoice.name || fromName,
            accountNo: invoice.accountNo || invoice.accNo || '',
            ifsc: invoice.ifsc || invoice.ifscCode || '',
            bank: invoice.bankName || invoice.bank || '',
            branch: invoice.branch || '',
          };

      // ── 1. Top Section: Top Right INVOICE #001 ────────────────
      const topY = 22;

      // Draw vertical bar next to INVOICE # (matching Image 1: | INVOICE #001)
      const invTitleText = `INVOICE ${invoiceNo}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...BLACK);

      const titleWidth = doc.getTextWidth(invTitleText);
      const rightX = PW - M;
      const titleStartX = rightX - titleWidth;

      // Vertical Accent Bar
      doc.setFillColor(...BLACK);
      doc.rect(titleStartX - 4.5, topY - 5.5, 2.2, 7.5, 'F');
      doc.text(invTitleText, titleStartX, topY);

      // Status Badge under Invoice #
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      const badgeBg = isPaid ? GREEN : [234, 88, 12];
      doc.setFillColor(...badgeBg);
      doc.roundedRect(rightX - 24, topY + 4, 24, 6, 1.2, 1.2, 'F');
      doc.setTextColor(...WHITE);
      doc.text(status, rightX - 12, topY + 8.2, { align: 'center' });

      // ── 2. Top Left: Date, Name, Address (Image 1) ───────────
      let curY = topY - 4;

      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('Date:', M, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(` ${issueDate}`, M + 12, curY);

      if (invoice.dueDate && !hideDueDate) {
        curY += 5.5;
        doc.setFont('helvetica', 'bold');
        doc.text('Due Date:', M, curY);
        doc.setFont('helvetica', 'normal');
        doc.text(` ${invoice.dueDate}`, M + 18, curY);
      }

      curY += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Name:', M, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(` ${fromName}`, M + 14, curY);

      if (!hideFromAddress && fromAddress) {
        curY += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Address:', M, curY);
        doc.setFont('helvetica', 'normal');
        const addressLines = doc.splitTextToSize(` ${fromAddress}`, 80);
        doc.text(addressLines, M + 17, curY);
        curY += (addressLines.length * 4.8);
      }

      // Underline / Divider under From
      curY += 1.5;
      doc.setDrawColor(...BORDER_COL);
      doc.setLineWidth(0.3);
      doc.line(M, curY, M + 70, curY);

      // ── 3. To Section: To, Name, Address (Image 1) ───────────
      curY += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BLACK);
      doc.text('To:', M, curY);

      curY += 5.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('Name:', M, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(` ${clientName}`, M + 14, curY);

      if (!hideClientAddress && clientAddress) {
        curY += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Address:', M, curY);
        doc.setFont('helvetica', 'normal');
        const toAddressLines = doc.splitTextToSize(` ${clientAddress}`, 80);
        doc.text(toAddressLines, M + 17, curY);
        curY += (toAddressLines.length * 4.8);
      }

      // Underline / Divider under To
      curY += 1.5;
      doc.line(M, curY, M + 70, curY);

      // ── 4. Works Section (Image 1: Big box "Works") ─────────
      curY += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...BLACK);
      doc.text('Works', M, curY);

      const rawItems = Array.isArray(invoice.items) && invoice.items.length > 0
        ? invoice.items
        : [{ desc: 'Video Editing & Deliverables', qty: 1, rate: Number(invoice.total || 0), amount: Number(invoice.total || 0) }];

      let calculatedSubtotal = 0;
      const tableRows = rawItems.map((item, idx) => {
        const qty = Number(item.qty || 1);
        const rate = Number(item.rate || item.price || item.amt || 0);
        const lineTotal = item.amount != null ? Number(item.amount) : qty * rate;
        calculatedSubtotal += lineTotal;

        return [
          String(idx + 1),
          item.desc || item.title || 'Work Item',
          String(qty),
          Rs(rate),
          Rs(lineTotal),
        ];
      });

      // Min 2 rows
      while (tableRows.length < 2) {
        tableRows.push(['', '', '', '', '']);
      }

      autoTable(doc, {
        startY: curY + 2.5,
        margin: { left: M, right: M },
        head: [['#', 'DESCRIPTION', 'QTY', 'RATE', 'AMOUNT']],
        body: tableRows,

        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 92, halign: 'left'   },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 26, halign: 'right'  },
          4: { cellWidth: 30, halign: 'right'  },
        },

        headStyles: {
          fillColor:   BLACK,
          textColor:   WHITE,
          fontStyle:   'bold',
          fontSize:    9,
          cellPadding: 3.5,
          lineColor:   BLACK,
          lineWidth:   0.2,
        },

        bodyStyles: {
          fontSize:    8.8,
          textColor:   BLACK,
          cellPadding: 3.5,
          lineColor:   BORDER_COL,
          lineWidth:   0.2,
          minCellHeight: 9,
        },

        alternateRowStyles: {
          fillColor: GREY_LIGHT,
        },

        theme: 'grid',
      });

      let afterTableY = doc.lastAutoTable.finalY + 4;

      // ── Totals Breakdown (Right-Aligned) ────────────────────
      const subtotal = invoice.subtotal != null ? Number(invoice.subtotal) : calculatedSubtotal;
      const advance  = Number(invoice.advance || 0);
      const discount = Number(invoice.discount || 0);
      const tax      = Number(invoice.tax || 0);
      const grandTotal = invoice.total != null ? Number(invoice.total) : Math.max(0, subtotal - advance - discount + tax);

      const summaryBoxW = 75;
      const summaryBoxX = PW - M - summaryBoxW;
      let sumY = afterTableY;

      const renderSummaryItem = (lbl, valStr, bold = false, color = BLACK) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(...color);
        doc.text(lbl, summaryBoxX, sumY);
        doc.text(valStr, PW - M, sumY, { align: 'right' });
        sumY += 5.5;
      };

      renderSummaryItem('Subtotal:', Rs(subtotal));
      if (advance > 0) {
        renderSummaryItem('Advance Paid:', `- ${Rs(advance)}`, false, GREEN);
      }
      if (discount > 0) {
        renderSummaryItem('Discount:', `- ${Rs(discount)}`, false, [37, 99, 235]);
      }
      if (tax > 0) {
        renderSummaryItem('Tax / GST:', `+ ${Rs(tax)}`);
      }

      // Grand Total Highlight Bar
      doc.setFillColor(...(isPaid ? BLACK : RED));
      doc.roundedRect(summaryBoxX - 2, sumY - 1, summaryBoxW + 2, 8, 1, 1, 'F');
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(isPaid ? 'TOTAL PAID:' : 'TOTAL DUE:', summaryBoxX + 2, sumY + 4.5);
      doc.text(Rs(grandTotal), PW - M - 2, sumY + 4.5, { align: 'right' });

      // ── 5. Bank Transaction Details (Exact layout from user image) ─────
      let bankY = Math.max(afterTableY, sumY + 12);

      if (!hideBankDetails) {
        // Check if we need space before footer
        if (bankY > PH - 52) {
          doc.addPage();
          bankY = 24;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...BLACK);
        doc.text('Bank Transaction Details :', M, bankY);

        bankY += 5.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...GREY_DARK);
        doc.text('Name:', M, bankY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(` ${bank.name || bank.accountHolderName || fromName}`, M + 14, bankY);

        bankY += 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREY_DARK);
        doc.text('Acc. No:', M, bankY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(` ${bank.accountNo || bank.accNo || ''}`, M + 16, bankY);

        bankY += 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREY_DARK);
        doc.text('IFSC CODE:', M, bankY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(` ${bank.ifsc || bank.ifscCode || ''}`, M + 21, bankY);

        bankY += 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREY_DARK);
        doc.text('Bank:', M, bankY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(` ${bank.bank || bank.bankName || ''}`, M + 12, bankY);

        bankY += 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREY_DARK);
        doc.text('Branch :', M, bankY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(` ${bank.branch || ''}`, M + 16, bankY);

        // Divider under Bank Details (Image 1)
        bankY += 2;
        doc.setDrawColor(...BORDER_COL);
        doc.line(M, bankY, M + 70, bankY);
      }

      if (!hideNotes && invoice.notes) {
        bankY += (hideBankDetails ? 0 : 5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...GREY_DARK);
        doc.text(`Note: ${invoice.notes}`, M, bankY);
      }

      // ── 6. Bottom Footer: Sign & Email (Image 1) ────────────
      const footerLineY = PH - 24;
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.4);
      doc.line(M, footerLineY, PW - M, footerLineY);

      const footerContentY = footerLineY + 11;

      // Bottom Left: Sign: _____________________
      if (!hideSignature) {
        doc.setTextColor(...BLACK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text('Sign:', M, footerContentY);

        // If user uploaded a signature image, draw it cleanly above/on the sign line
        const sigImg = invoice.signatureImage || invoice.signature;
        if (sigImg && typeof sigImg === 'string' && sigImg.startsWith('data:image')) {
          try {
            doc.addImage(sigImg, 'PNG', M + 12, footerContentY - 11, 38, 10);
          } catch (imgErr) {
            console.warn('Signature image embed failed:', imgErr);
          }
        }

        doc.setLineWidth(0.3);
        doc.setDrawColor(...BORDER_COL);
        doc.line(M + 12, footerContentY + 1, M + 65, footerContentY + 1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY_DARK);
        doc.text(invoice.signatoryText || `${fromName} Authorized`, M + 12, footerContentY + 5.5);
      }

      // Bottom Right: Email: [email]
      if (!hideEmail && fromEmail) {
        doc.setTextColor(...BLACK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const emailLabel = 'Email:';
        const emailVal = ` ${fromEmail}`;
        const fullEmailStr = emailLabel + emailVal;

        doc.text(fullEmailStr, PW - M, footerContentY, { align: 'right' });
      }

      // Save PDF
      const sanitizedClient = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Invoice_${invoiceNo.replace('#', '')}_${sanitizedClient}.pdf`;
      if (!options || options.save !== false) {
        doc.save(filename);
      }

      // Generate base64 data URI string for email attachments
      let pdfBase64 = null;
      try {
        pdfBase64 = doc.output('datauristring');
      } catch (outErr) {
        console.warn('doc.output datauristring error:', outErr);
      }

      resolve({ filename, pdfBase64, doc });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Legacy statement generator — creates PDF of unpaid/remaining work items.
 * Maintained for backward compatibility with existing buttons.
 */
export function generateInvoice({ clientName, work, brandName = 'GT Edits' }) {
  const allItems = Object.values(work || {});
  const remainingItems = allItems.filter(w => (w.status || 'Pending') !== 'Paid');

  let subtotal = 0;
  let totalAdvance = 0;

  const items = remainingItems.map(w => {
    const qty = Number(w.qty || 1);
    const rate = Number(w.price || w.amt || 0);
    const lineTotal = qty * rate;
    const adv = Number(w.advance || 0);
    const isAdv = (w.status || 'Pending') === 'Advance';

    subtotal += lineTotal;
    if (isAdv) totalAdvance += adv;

    return {
      desc: isAdv && adv > 0
        ? `${w.desc || 'Work Item'} (Adv. Rs. ${adv.toLocaleString('en-IN')} paid)`
        : (w.desc || 'Work Item'),
      qty,
      rate,
      amount: isAdv ? Math.max(0, lineTotal - adv) : lineTotal,
    };
  });

  const dueTotal = Math.max(0, subtotal - totalAdvance);

  return generateCustomInvoicePdf({
    invoiceNumber: `#${Date.now().toString().slice(-4)}`,
    clientName,
    brandName,
    items,
    subtotal,
    advance: totalAdvance,
    total: dueTotal,
    status: dueTotal === 0 ? 'Paid' : 'Pending',
    notes: 'Outstanding account statement. Thank you for your business!',
  });
}
