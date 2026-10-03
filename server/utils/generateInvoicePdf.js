const PDFDocument = require('pdfkit');

/**
 * Generates an itemized remaining payment invoice PDF buffer for a client.
 *
 * @param {Object} options
 * @param {string} options.clientName Name of the client
 * @param {Object} options.work Map or array of work items from client RTDB record
 * @param {string} [options.brandName] Brand name (default: 'GT Edits')
 * @returns {Promise<Buffer>} PDF Buffer
 */
function generateInvoicePdfBuffer({ clientName, work, brandName = 'GT Edits' }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', (err) => reject(err));

      const NAVY = '#1a237e';
      const RED = '#d30000';
      const BLACK = '#111827';
      const GREY = '#6b7280';

      doc.rect(40, 40, 160, 36).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('INVOICE', 52, 48);

      const currentMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

      doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold').text(`From : ${brandName}`, 40, 95);
      // doc.font('Helvetica').fontSize(9).fillColor(GREY).text('(GT Edits Portal)', 40, 110);

      doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold').text(`To : ${clientName || 'Client'}`, 320, 95, { align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`Month : ${currentMonth}`, 320, 110, { align: 'right' });

      const tableTop = 140;
      doc.rect(40, tableTop, 515, 24).fill(NAVY);

      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('ITEM / DESCRIPTION', 50, tableTop + 7);
      doc.text('QTY', 280, tableTop + 7, { width: 40, align: 'center' });
      doc.text('RATE', 330, tableTop + 7, { width: 70, align: 'right' });
      doc.text('REMAINING DUE', 430, tableTop + 7, { width: 110, align: 'right' });

      const allItems = Array.isArray(work) ? work : Object.values(work || {});
      const remainingItems = allItems.filter(w => w && typeof w === 'object' && (w.status || 'Pending') !== 'Paid');
      let grandTotal = 0;
      let y = tableTop + 24;

      remainingItems.forEach((w) => {
        if (y > 720) {
          doc.addPage();
          y = 40;
        }

        const qty = Number(w.qty || 1);
        const rate = Number(w.price || w.amt || 0);
        const lineTotal = qty * rate;
        const status = w.status || 'Pending';
        const advAmt = Number(w.advance || 0);
        const dueAmt = status === 'Pending' ? lineTotal
                     : status === 'Advance' ? Math.max(0, lineTotal - advAmt) : 0;

        grandTotal += dueAmt;

        const descText = status === 'Advance' && advAmt > 0
          ? `${w.desc || w.title || 'Work Item'} (Adv. Rs. ${advAmt.toLocaleString('en-US')} paid)`
          : (w.desc || w.title || 'Work Item');

        doc.rect(40, y, 515, 24).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

        doc.fillColor(BLACK).fontSize(9).font('Helvetica');
        doc.text(descText, 50, y + 7, { width: 220, ellipsis: true });
        doc.text(String(qty), 280, y + 7, { width: 40, align: 'center' });
        doc.text(`Rs. ${rate.toLocaleString('en-US')}`, 330, y + 7, { width: 70, align: 'right' });
        doc.text(`Rs. ${dueAmt.toLocaleString('en-US')}`, 430, y + 7, { width: 110, align: 'right' });

        y += 24;
      });

      if (remainingItems.length === 0) {
        doc.rect(40, y, 515, 24).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fillColor(GREY).fontSize(9).font('Helvetica-Oblique').text('No outstanding unpaid items', 50, y + 7);
        y += 24;
      }

      if (y > 720) {
        doc.addPage();
        y = 40;
      }

      doc.rect(40, y, 515, 28).fill(RED);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL REMAINING DUE', 50, y + 8);
      doc.text(`Rs. ${grandTotal.toLocaleString('en-US')}`, 430, y + 8, { width: 110, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePdfBuffer };
