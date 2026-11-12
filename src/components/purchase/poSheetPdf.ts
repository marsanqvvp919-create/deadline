import { jsPDF } from 'jspdf';
import { loadJapaneseFont, setupFont } from '../../invoice/pdf';

// 発注書（仕入先に LINE・WhatsApp・メールで添付して送る PDF）。英語を主に、商品名はそのまま（日本語も出る）

export interface SheetData {
  vendor: { supplierId: string; name: string; email: string; phone: string; master: { contactName?: string } | null };
  from: { company: string; address: string; contact: string } | null;
  pos: {
    poId: string;
    poDate: string;
    orderId: string;
    dest: { kind: 'warehouse' | 'tbd' | 'direct'; label: string; name: string; address: string; attn: string; phone: string };
    lines: { key: string; productName: string; poQty: number; qty: number }[];
  }[];
}

export async function buildPoSheetPdf(d: SheetData, opts: { sheetDate: string; portalUrl?: string; note?: string }): Promise<jsPDF> {
  await loadJapaneseFont();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const L = 15;
  const R = W - 15;
  let y = 16;
  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 16;
    }
  };
  const text = (t: string, x: number, yy: number, o?: any) => doc.text(t, x, yy, o);

  // 見出し
  doc.setFillColor(49, 46, 129);
  doc.rect(0, 0, W, 6, 'F');
  setupFont(doc, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(30, 27, 75);
  text('PURCHASE ORDER', L, y + 6);
  setupFont(doc, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  text(`Date: ${opts.sheetDate}`, R, y + 2, { align: 'right' });
  text(`PO: ${d.pos.map((p) => p.poId).join(', ')}`.slice(0, 90), R, y + 7, { align: 'right' });
  y += 16;

  // 発行元・宛先
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(L, y, 86, 26, 2, 2);
  doc.roundedRect(L + 94, y, 86, 26, 2, 2);
  setupFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  text('FROM', L + 3, y + 5);
  text('TO (SUPPLIER)', L + 97, y + 5);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  text(d.from?.company || 'No1', L + 3, y + 11);
  text(d.vendor.name, L + 97, y + 11);
  setupFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.splitTextToSize([d.from?.address, d.from?.contact].filter(Boolean).join('\n') || '', 80).slice(0, 3).forEach((ln: string, i: number) => text(ln, L + 3, y + 16 + i * 3.6));
  doc
    .splitTextToSize([d.vendor.master?.contactName ? `Attn: ${d.vendor.master.contactName}` : '', d.vendor.email, d.vendor.phone].filter(Boolean).join('\n'), 80)
    .slice(0, 3)
    .forEach((ln: string, i: number) => text(ln, L + 97, y + 16 + i * 3.6));
  y += 32;

  let grand = 0;
  for (const po of d.pos) {
    ensure(40);
    // 発注ごとの見出しと送り先
    doc.setFillColor(238, 242, 255);
    doc.rect(L, y, R - L, 7, 'F');
    setupFont(doc, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(49, 46, 129);
    text(po.poId, L + 2, y + 5);
    setupFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    text(`PO date ${po.poDate || '-'}`, L + 40, y + 5);
    y += 10;
    setupFont(doc, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const destHead =
      po.dest.kind === 'direct' ? 'SHIP TO: Direct to clinic – we will send the address separately' : po.dest.kind === 'tbd' ? `SHIP TO: ${po.dest.label} (to be confirmed – please check with us before shipping)` : `SHIP TO: ${po.dest.label}`;
    text(destHead, L + 2, y);
    setupFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const addr = po.dest.kind === 'direct' ? [] : [po.dest.name, po.dest.address, [po.dest.attn && `Attn: ${po.dest.attn}`, po.dest.phone && `Tel: ${po.dest.phone}`].filter(Boolean).join('  ')].filter(Boolean);
    const addrLines: string[] = addr.length ? doc.splitTextToSize(addr.join('\n'), R - L - 4) : [];
    addrLines.slice(0, 4).forEach((ln, i) => text(ln, L + 2, y + 4 + i * 3.6));
    y += 4 + Math.min(addrLines.length, 4) * 3.6 + 2;

    // 明細
    ensure(10);
    doc.setFillColor(30, 41, 59);
    doc.rect(L, y, R - L, 6.5, 'F');
    setupFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    text('No.', L + 2, y + 4.5);
    text('Item', L + 12, y + 4.5);
    text('Qty', R - 2, y + 4.5, { align: 'right' });
    y += 6.5;
    setupFont(doc, 'normal');
    po.lines.forEach((l, i) => {
      const nameLines: string[] = doc.splitTextToSize(l.productName, R - L - 40);
      const h = Math.max(6.5, nameLines.length * 4 + 2.5);
      ensure(h);
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(L, y, R - L, h, 'F');
      }
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      text(String(i + 1), L + 2, y + 4.5);
      nameLines.forEach((ln, j) => text(ln, L + 12, y + 4.5 + j * 4));
      setupFont(doc, 'bold');
      doc.setFontSize(11);
      text(String(l.qty), R - 2, y + 4.8, { align: 'right' });
      setupFont(doc, 'normal');
      grand += l.qty;
      y += h;
    });
    doc.setDrawColor(203, 213, 225);
    doc.line(L, y, R, y);
    y += 7;
  }

  ensure(30);
  setupFont(doc, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  text(`Total quantity: ${grand}`, R, y, { align: 'right' });
  y += 8;
  setupFont(doc, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const notes = [
    'Please confirm this order and let us know the expected shipping date.',
    'When you ship, please send us the tracking number' + (opts.portalUrl ? ` or press "Shipped" on your page: ${opts.portalUrl}` : '.'),
    'If you cannot ship the full quantity, please tell us before shipping.',
    opts.note || '',
  ].filter(Boolean);
  doc.splitTextToSize(notes.join('\n'), R - L).forEach((ln: string) => {
    ensure(5);
    text(ln, L, y);
    y += 4.2;
  });
  return doc;
}
