/**
 * generateInvoice.js
 * Replicates the exact invoice template provided by the user.
 * Uses jsPDF + jspdf-autotable (browser-native, no polyfills needed).
 */
import jsPDF     from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Palette (matches template) ─────────────────────────────
const NAVY  = [26,  35, 126];  // dark navy blue header / INVOICE bg
const RED   = [211,  0,   0];  // grand-total row
const BLACK = [0,    0,   0];
const WHITE = [255, 255, 255];
const GREY  = [180, 180, 180]; // table grid lines

// ── Amount helper — uses Rs. prefix (Helvetica doesn't support ₹ glyph) ──
const Rs = (n) => {
  const num = Number(n || 0);
  // Standard comma grouping: 1,210 / 12,540 etc.
  return 'Rs. ' + num.toLocaleString('en-US');
};

// ── Main export ────────────────────────────────────────────
export function generateInvoice({ clientName, work, brandName }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210;
      const M  = 14;   // left/right margin
      const CW = PW - M * 2; // content width = 182mm

      // ── 1. "INVOICE" title block ─────────────────────────
      doc.setFillColor(...NAVY);
      doc.rect(M, 16, 58, 13, 'F');          // blue rectangle
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(21);
      doc.text('INVOICE', M + 4, 26);

      // ── 2. From / To section ─────────────────────────────
      const currentMonth = new Date().toLocaleString('en-IN', { month: 'long' });

      // From (left column)
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('From : ' + brandName, M, 42);
      doc.setFont('helvetica', 'normal');
      doc.text('(GT Edits)', M, 49);

      // To (right column)
      doc.setFont('helvetica', 'bold');
      doc.text('To:  ' + clientName,      PW - M, 42, { align: 'right' });
      doc.text('Month : ' + currentMonth, PW - M, 49, { align: 'right' });

      // ── 3. Table (Only remaining unpaid/advance items) ──────
      const allItems = Object.values(work || {});
      const remainingItems = allItems.filter(w => (w.status || 'Pending') !== 'Paid');
      let grandTotal = 0;

      const tableRows = remainingItems.map((w) => {
        const qty       = Number(w.qty || 1);
        const rate      = Number(w.price || w.amt || 0);
        const lineTotal = qty * rate;
        const status    = w.status || 'Pending';
        const advAmt    = Number(w.advance || 0);
        const dueAmt    = status === 'Pending' ? lineTotal
                        : status === 'Advance' ? Math.max(0, lineTotal - advAmt) : 0;

        grandTotal += dueAmt;

        const descText = status === 'Advance' && advAmt > 0
          ? `${w.desc || ''} (Adv. Rs. ${advAmt.toLocaleString('en-US')} paid)`
          : (w.desc || '');

        return [
          descText,
          String(qty),
          Rs(rate),
          '',           // gap column (matches template)
          Rs(dueAmt),
        ];
      });

      // Pad with empty rows so the table looks full (min 5 rows like template)
      const minRows = 5;
      while (tableRows.length < minRows) {
        tableRows.push(['', '', '', '', '']);
      }

      // Column widths must sum to CW (182mm)
      // ITEM=62 | Qty=32 | Rate=28 | gap=26 | Total=34  → 182 ✓
      autoTable(doc, {
        startY:  62,
        margin:  { left: M, right: M },

        head: [['ITEM', 'Quantity', 'Rate', '', 'Total']],
        body: tableRows,
        foot: [['', '', '', '', Rs(grandTotal)]],

        columnStyles: {
          0: { cellWidth: 62, halign: 'left'   },
          1: { cellWidth: 32, halign: 'center' },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 26, halign: 'center' }, // blank gap column
          4: { cellWidth: 34, halign: 'right'  },
        },

        headStyles: {
          fillColor:   NAVY,
          textColor:   WHITE,
          fontStyle:   'bold',
          fontSize:    10.5,
          cellPadding: 3.5,
          lineColor:   WHITE,
          lineWidth:   0.3,
        },

        bodyStyles: {
          fontSize:    9.5,
          textColor:   BLACK,
          cellPadding: 3.5,
          lineColor:   GREY,
          lineWidth:   0.3,
          minCellHeight: 12,
        },

        footStyles: {
          fillColor:   RED,
          textColor:   WHITE,
          fontStyle:   'bold',
          fontSize:    12,
          cellPadding: 3.5,
          halign:      'right',
          lineColor:   RED,
          lineWidth:   0,
        },

        theme:    'grid',
        showFoot: 'lastPage',
      });

      // ── 4. Save ──────────────────────────────────────────
      const filename = `Invoice_${clientName.replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
