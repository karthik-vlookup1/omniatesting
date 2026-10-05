/** Tenant rent statement as a PDF (pdfkit, pure JS, A4). */
import PDFDocument from 'pdfkit';
import type { TenantStatement } from './statement.service.js';

const gbp = (p: number): string => {
  const abs = Math.abs(p);
  const s = `£${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
  return p < 0 ? `-${s}` : s;
};
/** Balances: a credit balance reads '£12.00 CR'. */
const bal = (p: number): string => (p < 0 ? `${gbp(-p)} CR` : gbp(p));

const MARGIN = 40;
const X = { date: 40, desc: 110, debit: 330, credit: 400, balance: 470 };
const W = { date: 65, desc: 215, money: 65 };

export function buildTenantStatementPdf(
  s: TenantStatement,
  { compress = true }: { compress?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      compress,
      bufferPages: true,
      info: { Title: `Rent statement ${s.tenancy.tid} ${s.from} to ${s.to}`, Author: 'Omnia Recon' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const limit = () => doc.page.height - 60;
    const row = (y: number, cols: [string, string, string, string, string], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.text(cols[0], X.date, y, { width: W.date, lineBreak: false });
      doc.text(cols[1], X.desc, y, { width: W.desc, lineBreak: false, ellipsis: true });
      doc.text(cols[2], X.debit, y, { width: W.money, align: 'right', lineBreak: false });
      doc.text(cols[3], X.credit, y, { width: W.money, align: 'right', lineBreak: false });
      doc.text(cols[4], X.balance, y, { width: W.money + 20, align: 'right', lineBreak: false });
    };
    /** Draws the column header at y and returns the y of the first row below it. */
    const columnHeader = (y: number): number => {
      row(y, ['Date', 'Description', 'Debit', 'Credit', 'Balance'], true);
      return y + 14;
    };
    /** Starts a new page (repeating the column header) when y is past the bottom margin. */
    const next = (y: number): number => {
      if (y <= limit()) return y;
      doc.addPage();
      return columnHeader(MARGIN);
    };

    doc.font('Helvetica-Bold').fontSize(16).text('Rent statement', MARGIN, MARGIN);
    doc.font('Helvetica').fontSize(10);
    doc.text(`TID: ${s.tenancy.tid}`);
    doc.text(`Tenant: ${s.tenancy.tenant ?? ''}`);
    doc.text(`Property: ${s.tenancy.propertyRef ?? ''}`);
    doc.text(`Branch: ${s.tenancy.branch ?? ''}`);
    doc.text(`Period: ${s.from} to ${s.to}`);
    doc.text(`Generated: ${s.generatedAt}`);
    let y = doc.y + 10;

    if (s.payers.length === 0) doc.text('No rent activity up to the end of this period.', MARGIN, y);
    for (const p of s.payers) {
      if (y > limit() - 60) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font('Helvetica-Bold').fontSize(12).text(p.label, MARGIN, y, { lineBreak: false });
      y = columnHeader(y + 20);
      y = next(y);
      row(y, [s.from, 'Opening balance', '', '', bal(p.openingPence)], true);
      y += 14;
      for (const l of p.lines) {
        y = next(y);
        row(y, [l.date, l.description, l.debitPence === null ? '' : gbp(l.debitPence), l.creditPence === null ? '' : gbp(l.creditPence), bal(l.balancePence)]);
        y += 14;
      }
      y = next(y);
      row(y, [s.to, 'Closing balance', '', '', bal(p.closingPence)], true);
      y += 28;
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).text(`Generated ${s.generatedAt} by Omnia Recon`, MARGIN, doc.page.height - 40, {
        width: doc.page.width - 2 * MARGIN,
        align: 'center',
        lineBreak: false,
      });
    }
    doc.end();
  });
}
