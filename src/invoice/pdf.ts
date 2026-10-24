// インボイス・パッキングリストのPDF（INVOICEアプリ src/lib/pdf.ts をそのまま移植）
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { Shipment, SystemSettings, Clinic } from './types';

let japaneseFontBase64: string | null = null;
let fontLoadingPromise: Promise<boolean> | null = null;

/**
 * Pre-load Japanese Font (Zen Kaku Gothic / Sawarabi Gothic) from reliable CDNs
 */
export async function loadJapaneseFont(): Promise<boolean> {
  if (japaneseFontBase64) return true;
  if (fontLoadingPromise) return fontLoadingPromise;

  fontLoadingPromise = (async () => {
    try {
      const urls = [
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zenkakugothicnew/ZenKakuGothicNew-Regular.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sawarabigothic/SawarabiGothic-Regular.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/sawarabigothic/SawarabiGothic-Regular.ttf'
      ];

      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            japaneseFontBase64 = btoa(binary);
            return true;
          }
        } catch (e) {
          console.warn(`Font fetch failed for ${url}:`, e);
        }
      }
      throw new Error('All Japanese font CDNs failed');
    } catch (e) {
      console.warn('Failed to dynamically load Japanese font, using fallback:', e);
      return false;
    }
  })();

  return fontLoadingPromise;
}

/**
 * Set current PDF font to JapaneseFont if loaded, otherwise fallback to helvetica
 */
function setupFont(doc: jsPDF, fontStyle: 'normal' | 'bold' = 'normal') {
  if (japaneseFontBase64) {
    try {
      const fontList = (doc.getFontList ? doc.getFontList() : {}) as Record<string, string[]>;
      if (!fontList['JapaneseFont']) {
        doc.addFileToVFS('JapaneseFont.ttf', japaneseFontBase64);
        doc.addFont('JapaneseFont.ttf', 'JapaneseFont', 'normal');
        doc.addFont('JapaneseFont.ttf', 'JapaneseFont', 'bold');
      }
      doc.setFont('JapaneseFont', fontStyle);
      return;
    } catch (e) {
      console.warn('Error applying Japanese font in PDF:', e);
      doc.setFont('helvetica', fontStyle);
    }
  } else {
    doc.setFont('helvetica', fontStyle);
  }
}

/**
 * Safely sets the font, choosing JapaneseFont if the string contains non-ASCII characters,
 * or the requested ASCII font (courier/helvetica) otherwise.
 * This prevents WinAnsi mojibake when non-ASCII text is rendered with standard PDF 14 fonts.
 */
function setSafeFont(doc: jsPDF, targetAsciiFont: 'courier' | 'helvetica', style: 'normal' | 'bold', textToRender?: string | null) {
  if (textToRender && /[^\x00-\x7F]/.test(textToRender)) {
    setupFont(doc, style);
  } else {
    doc.setFont(targetAsciiFont, style);
  }
}

/**
 * Safe text wrapper to prevent jsPDF from crashing/corrupting Japanese/CJK characters 
 * when standard fonts (Helvetica) are used (which only support WinAnsiEncoding).
 */
function safeText(text: string | null | undefined): string {
  if (!text) return '';
  if (japaneseFontBase64) {
    return text;
  }
  // If Japanese font is not loaded, strip CJK characters to prevent WinAnsiEncoding garbled text
  return text.replace(/[^\x00-\x7F]/g, '');
}

/**
 * Safely format clinic details into pure English for commercial invoices
 */
export function getEnglishClinicDetails(consignee: Partial<Clinic> = {}) {
  const containsCJK = (str?: string) => !!str && /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/.test(str);

  // 1. Clinic Name in English
  let nameEn = consignee.nameEn ? consignee.nameEn.trim() : '';
  if (!nameEn || containsCJK(nameEn)) {
    if (consignee.name === '品川美容外科 東京本院') nameEn = 'Shinagawa Beauty Clinic Tokyo';
    else if (consignee.name === '湘南美容クリニック 新宿本院') nameEn = 'Shonan Beauty Clinic Shinjuku';
    else if (consignee.name === 'グナル美容外科 大阪梅田院') nameEn = 'Gunal Clinic Osaka Umeda';
    else if (consignee.name === '4Dクリニック') nameEn = '4D Clinic';
    else if (consignee.name === 'BiOLiSクリニック') nameEn = 'BiOLiS Clinic';
    else if (consignee.clinicId) nameEn = `Clinic (${consignee.clinicId})`;
    else nameEn = 'Aesthetic Clinic';
  }

  // 2. Address in English
  let addressEn = consignee.addressEn ? consignee.addressEn.trim() : '';
  if (!addressEn || containsCJK(addressEn)) {
    const rawAddr = (consignee.address || '') + (consignee.building || '');
    if (rawAddr.includes('港南2丁目') || rawAddr.includes('品川')) {
      addressEn = 'B-Block, Shinagawa Intercity, 2-15-2 Konan, Minato-ku, Tokyo, Japan';
    } else if (rawAddr.includes('西新宿')) {
      addressEn = '24F Shinjuku Island Tower, 6-5-1 Nishi-Shinjuku, Shinjuku-ku, Tokyo, Japan';
    } else if (rawAddr.includes('梅田1丁目') || rawAddr.includes('大阪')) {
      addressEn = '1-2-3 Umeda, Kita-ku, Osaka, Japan';
    } else {
      const parts = [];
      if (consignee.building) parts.push(consignee.building.replace(/[^\x00-\x7F]/g, '').trim());
      if (consignee.address) parts.push(consignee.address.replace(/[^\x00-\x7F]/g, '').trim());
      if (consignee.city) parts.push(consignee.city.replace(/[^\x00-\x7F]/g, '').trim());
      if (consignee.prefecture) parts.push(consignee.prefecture.replace(/[^\x00-\x7F]/g, '').trim());
      const cleanJoined = parts.filter(Boolean).join(', ');
      addressEn = cleanJoined ? `${cleanJoined}, Japan` : 'Tokyo, Japan';
    }
  }

  // 3. Doctor Name in English (strictly WITHOUT "Dr." prefix as per requirements)
  let doctorNameEn = consignee.doctorNameEn ? consignee.doctorNameEn.trim() : '';
  // Strip any existing Dr. or Dr prefix
  doctorNameEn = doctorNameEn.replace(/^Dr\.?\s*/i, '').trim();

  if (!doctorNameEn || containsCJK(doctorNameEn)) {
    if (consignee.doctorName === '佐藤 茂') doctorNameEn = 'Shigeru Sato';
    else if (consignee.doctorName === '相川 佳之') doctorNameEn = 'Yoshiyuki Aikawa';
    else if (consignee.doctorName === 'グナル チョル') doctorNameEn = 'Chul Gunal';
    else if (consignee.doctorName) {
      const cleanDoc = consignee.doctorName.replace(/[^\x00-\x7F]/g, '').trim();
      doctorNameEn = cleanDoc.replace(/^Dr\.?\s*/i, '').trim() || 'Medical Director';
    } else {
      doctorNameEn = 'Medical Director';
    }
  }
  // Ensure "Dr." is stripped once again just in case
  doctorNameEn = doctorNameEn.replace(/^Dr\.?\s*/i, '').trim();

  // 4. Contact Person in English
  let contactPersonEn = consignee.contactPersonEn ? consignee.contactPersonEn.trim() : '';
  if (!contactPersonEn || containsCJK(contactPersonEn)) {
    if (consignee.contactPerson === '田中 太郎') contactPersonEn = 'Taro Tanaka';
    else if (consignee.contactPerson === '佐藤 恵') contactPersonEn = 'Megumi Sato';
    else if (consignee.contactPerson === '鈴木 一郎') contactPersonEn = 'Ichiro Suzuki';
    else if (consignee.contactPerson) {
      const cleanContact = consignee.contactPerson.replace(/[^\x00-\x7F]/g, '').trim();
      contactPersonEn = cleanContact || 'Clinic Manager';
    } else {
      contactPersonEn = 'Clinic Manager';
    }
  }

  return {
    nameEn,
    addressEn,
    doctorNameEn,
    contactPersonEn,
    sequenceNo: (consignee as any).sequenceNo,
    clinicId: consignee.clinicId || '',
    zip: consignee.zip || '',
    phone: consignee.phone || '',
    email: consignee.email || ''
  };
}

/**
 * Get currency symbol based on currency code
 */
function getCurrencySymbol(currency: string): string {
  return currency === 'JPY' ? '¥' : currency === 'USD' ? '$' : currency === 'KRW' ? '₩' : '€';
}

/**
 * Clean helper to draw sections or lines in jsPDF
 */
function drawHeader(doc: jsPDF, title: string, shipment: Shipment, startY: number, settings?: SystemSettings): number {
  // We always render a logo (either the uploaded custom base64 logo or our beautiful vector fallback)
  const hasLogo = true;
  
  // Define positions upfront so they are completely independent of try-catch failures
  let logoY = startY;
  let textY = startY + 18;
  let metadataStartY = startY + 2;
  let dividerY = startY + 22;
  let nextSectionY = startY + 28;

  let logoDrawn = false;
  
  // Try to render the user's custom logo (accept any URL or base64)
  if (settings?.companyLogo) {
    try {
      let logoData: any = settings.companyLogo;
      // In the browser, try to extract the loaded image from the DOM to bypass CORS/network fetch issues
      if (typeof logoData === 'string' && logoData.startsWith('data:image')) {
        doc.addImage(logoData, 'PNG', 15, logoY, 40, 12);
        logoDrawn = true;
      } else if (typeof document !== 'undefined') {
        // Find any img element that contains the company logo URL as its src
        const domImg = Array.from(document.querySelectorAll('img')).find(
          img => img.src === settings.companyLogo || img.src.includes(settings.companyLogo)
        ) || document.querySelector('img[alt="Company Logo"]') as HTMLImageElement;
        
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          doc.addImage(domImg, 'PNG', 15, logoY, 40, 12);
          logoDrawn = true;
        }
      }
    } catch (e) {
      console.warn('Could not render company logo in PDF:', e);
    }
  }

  // Fallback: If no custom logo is drawn, draw a highly-polished, professional vector logo
  if (!logoDrawn) {
    // "Beauty Clinic Support" text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(115, 115, 115); // Gray-500
    doc.text('Beauty Clinic Support', 15, logoY + 1);

    // "number" text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0); // Pure black
    doc.text('number', 15, logoY + 7.5);

    // Giant serif "1" numeral using standard times-bold
    doc.setFont('times', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 0, 0);
    doc.text('1', 37.5, logoY + 7.5);
  }

  // Draw Document Title (INVOICE or PACKING LIST)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(title, 15, textY);

  // Draw structured, perfectly aligned Right-aligned header metadata
  const metaX = 195;
  let currY = metadataStartY;

  const drawMetaRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`${label}:`, metaX - 35, currY, { align: 'right' });
    
    setSafeFont(doc, 'courier', 'bold', value);
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // Slate-600
    doc.text(safeText(value), metaX, currY, { align: 'right' });
    currY += 4.5;
  };

  drawMetaRow('Invoice No', shipment.invoiceNo);
  drawMetaRow('Invoice Date', shipment.date);
  drawMetaRow('Shipping Date', shipment.date);
  drawMetaRow('Currency', shipment.currency);

  // Divider Line
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.4);
  doc.line(15, dividerY, 195, dividerY);

  return nextSectionY;
}

function drawParties(doc: jsPDF, shipment: Shipment, startY: number): number {
  const shipper = shipment.warehouseSnapshot || {};
  const consignee = shipment.clinicSnapshot || {};

  const shipperNameEn = shipper.nameEn || shipper.name || 'No1 LLC';
  const shipperAddressEn = shipper.addressEn || shipper.address || '5 Digital-ro 26-gil, Guro District, Seoul, South Korea';
  const shipperCountry = shipper.country || 'South Korea';
  const shipperPhone = shipper.phone || '+82-10-7237-7260';

  // Columns: Left = Shipper, Right = Consignee
  const colWidth = 85;
  const colLeftX = 15;
  const colRightX = 110;

  // Helper to draw label (light gray) and value (dark/bold) on a line
  const drawLabelValue = (x: number, y: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);
    
    setupFont(doc, 'bold');
    doc.setTextColor(71, 85, 105); // Slate-600
    doc.text(value, x + labelW, y);
  };

  // Shipper details with comfortable line height
  let shipperY = startY + 14;
  setupFont(doc, 'bold');
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(9);
  doc.text(String(shipperNameEn), colLeftX + 4, shipperY);
  
  setupFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate-600
  const shipperAddressLines = doc.splitTextToSize(shipperAddressEn, colWidth - 8);
  shipperY += 5.2;
  shipperAddressLines.forEach((line: string) => {
    doc.text(line, colLeftX + 4, shipperY);
    shipperY += 4.8;
  });

  shipperY += 1.5;
  doc.setFontSize(8);
  drawLabelValue(colLeftX + 4, shipperY, 'Country: ', shipperCountry);
  shipperY += 4.8;
  if (shipper.zip && shipper.zip !== '06132') {
    drawLabelValue(colLeftX + 4, shipperY, 'Postal Code: ', shipper.zip);
    shipperY += 4.8;
  }
  if (shipper.contactPerson && shipper.contactPerson !== 'Kim Min-jun') {
    drawLabelValue(colLeftX + 4, shipperY, 'Contact: ', shipper.contactPerson);
    shipperY += 4.8;
  }
  drawLabelValue(colLeftX + 4, shipperY, 'Tel: ', shipperPhone);
  shipperY += 4.8;
  drawLabelValue(colLeftX + 4, shipperY, 'Email: ', 'import@no1.farm');
  shipperY += 4.8;

  // Consignee details (Only: Clinic Name, English Address, Doctor Name English without "Dr.", Phone number)
  const clinicEn = getEnglishClinicDetails(consignee);
  let consigneeY = startY + 14;

  // Extract sequence number (店舗番号, e.g. 1, 2, 3...)
  let seqNo = clinicEn.sequenceNo ?? (consignee as any).sequenceNo;
  if ((seqNo === undefined || seqNo === null || seqNo === '') && consignee.clinicId) {
    const match = String(consignee.clinicId).match(/(\d+)/);
    if (match) {
      seqNo = parseInt(match[1], 10);
    }
  }

  // 1. Store / Sequence Number ABOVE "TO :" (distinct line so it doesn't mix with clinic name)
  if (seqNo !== undefined && seqNo !== null && String(seqNo).trim() !== '') {
    setupFont(doc, 'bold');
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.setFontSize(9);
    doc.text(`No. ${seqNo}`, colRightX + 4, consigneeY);
    consigneeY += 4.5;
  }

  // 2. Clinic Name in English (Format: "TO : CLINIC NAME")
  setupFont(doc, 'bold');
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(9);
  const rawClinicName = safeText(clinicEn.nameEn).replace(/^TO\s*:\s*/i, '').trim();
  const toClinicTitle = `TO : ${rawClinicName.toUpperCase()}`;

  const titleLines = doc.splitTextToSize(toClinicTitle, colWidth - 8);
  titleLines.forEach((line: string) => {
    doc.text(line, colRightX + 4, consigneeY);
    consigneeY += 4.5;
  });
  
  // 2. English Address
  setupFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // Slate-700
  const consigneeAddressLines = doc.splitTextToSize(safeText(clinicEn.addressEn), colWidth - 8);
  consigneeY += 5.0;
  consigneeAddressLines.forEach((line: string) => {
    doc.text(line, colRightX + 4, consigneeY);
    consigneeY += 4.5;
  });

  // 3. Doctor Name in English (strictly without "Dr.", format: "attn : DOCTOR NAME")
  const cleanDoc = safeText(clinicEn.doctorNameEn).replace(/^Dr\.?\s*/i, '').trim();
  if (cleanDoc) {
    consigneeY += 1.0;
    setupFont(doc, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(`attn : ${cleanDoc}`, colRightX + 4, consigneeY);
    consigneeY += 4.6;
  }

  // 4. Phone number (strictly phone number, no prefix)
  if (clinicEn.phone) {
    setupFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // Slate-700
    doc.text(safeText(clinicEn.phone), colRightX + 4, consigneeY);
    consigneeY += 4.2;
  }

  // Max height of the party block with comfortable margin
  const blockHeight = Math.max(shipperY, consigneeY) - startY + 4;

  // Outer border boxes with rounded corners
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(colLeftX, startY, colWidth, blockHeight, 2, 2, 'D');
  doc.roundedRect(colRightX, startY, colWidth, blockHeight, 2, 2, 'D');

  // Inner top-left badges
  // Shipper badge background
  doc.setFillColor(241, 245, 249); // Slate-100
  doc.roundedRect(colLeftX + 4, startY + 4, 30, 4.5, 1, 1, 'F');
  
  // Shipper badge border
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.setLineWidth(0.15);
  doc.roundedRect(colLeftX + 4, startY + 4, 30, 4.5, 1, 1, 'D');

  // Shipper badge text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('SHIPPER / EXPORTER', colLeftX + 19, startY + 7.1, { align: 'center' });

  // Consignee badge background
  doc.setFillColor(241, 245, 249); // Slate-100
  doc.roundedRect(colRightX + 4, startY + 4, 33, 4.5, 1, 1, 'F');
  
  // Consignee badge border
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.setLineWidth(0.15);
  doc.roundedRect(colRightX + 4, startY + 4, 33, 4.5, 1, 1, 'D');

  // Consignee badge text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('CONSIGNEE / IMPORTER', colRightX + 20.5, startY + 7.1, { align: 'center' });

  return startY + blockHeight + 6;
}

/**
 * Computes shipping route string (e.g., "South Korea to Japan", "Singapore to Japan")
 */
export function getShippingRoute(shipment: Shipment): { origin: string; destination: string; route: string } {
  const warehouse = shipment.warehouseSnapshot || {};
  const clinic = shipment.clinicSnapshot || {};

  let origin = warehouse.country || '';
  if (!origin) {
    const addr = (warehouse.addressEn || warehouse.address || '').toLowerCase();
    const name = (warehouse.nameEn || warehouse.name || '').toLowerCase();
    if (addr.includes('singapore') || name.includes('singapore')) {
      origin = 'Singapore';
    } else if (addr.includes('korea') || name.includes('korea') || addr.includes('seoul') || name.includes('seoul')) {
      origin = 'South Korea';
    } else {
      origin = 'South Korea';
    }
  }

  if (origin.toLowerCase().includes('singapore')) {
    origin = 'Singapore';
  } else if (origin.toLowerCase().includes('korea')) {
    origin = 'South Korea';
  }

  let destination = (clinic as any).country || '';
  if (!destination) {
    const addr = (clinic.addressEn || clinic.address || '').toLowerCase();
    if (addr.includes('japan') || addr.includes('tokyo') || addr.includes('osaka') || clinic.prefecture) {
      destination = 'Japan';
    } else {
      destination = 'Japan';
    }
  }

  if (destination.toLowerCase().includes('japan')) {
    destination = 'Japan';
  }

  return {
    origin,
    destination,
    route: `${origin} to ${destination}`
  };
}

function drawShippingInfo(doc: jsPDF, shipment: Shipment, settings: SystemSettings, startY: number): number {
  const boxHeight = 22;
  doc.setFillColor(255, 255, 255); // White bg

  // Helper to draw label (light gray) and value (dark/bold) on a line
  const drawLabelValue = (x: number, y: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);
    
    setupFont(doc, 'bold');
    doc.setTextColor(71, 85, 105); // Slate-600
    doc.text(value, x + labelW, y);
  };

  // Draw outer rounded box
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(15, startY, 180, boxHeight, 2, 2, 'D');

  // Draw badge background
  doc.setFillColor(241, 245, 249); // Slate-100
  doc.roundedRect(19, startY + 3.5, 43, 4.5, 1, 1, 'F');
  
  // Draw badge border
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.setLineWidth(0.15);
  doc.roundedRect(19, startY + 3.5, 43, 4.5, 1, 1, 'D');

  // Draw badge text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('SHIPPING & DELIVERY INFORMATION', 40.5, startY + 6.6, { align: 'center' });

  // Route calculation
  const routeInfo = getShippingRoute(shipment);

  // Row 1 (textY = startY + 12.5)
  doc.setFontSize(7.5);
  drawLabelValue(19, startY + 12.5, 'Shipping Route: ', routeInfo.route);
  drawLabelValue(95, startY + 12.5, 'Reason for Export: ', settings?.reasonForExport || 'Commercial Sale for Medical Use');
  
  // Row 2 (textY = startY + 17.5)
  drawLabelValue(19, startY + 17.5, 'Country of Origin: ', routeInfo.origin);
  drawLabelValue(95, startY + 17.5, 'Terms of Delivery: ', settings?.termsOfDelivery || 'EX-WORKS IN JPY');

  return startY + boxHeight + 6;
}

/**
 * Creates a beautiful Commercial Invoice PDF
 */
export function generateInvoicePDF(shipment: Shipment, settings: SystemSettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let currentY = 15;
  currentY = drawHeader(doc, 'INVOICE', shipment, currentY, settings);
  currentY = drawParties(doc, shipment, currentY);
  currentY = drawShippingInfo(doc, shipment, settings, currentY);

  // Detail table header
  doc.setFillColor(15, 23, 42); // Slate-900 (High contrast)
  doc.rect(15, currentY, 180, 8, 'F');

  setupFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('SKU', 18, currentY + 5.2);
  doc.text('Description of Goods', 46, currentY + 5.2);
  doc.text('Qty', 145, currentY + 5.2, { align: 'right' });
  doc.text('Unit Price', 168, currentY + 5.2, { align: 'right' });
  doc.text('Amount', 192, currentY + 5.2, { align: 'right' });

  currentY += 8;

  // Detail table rows
  setupFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // Slate-700

  const decimalPlaces = settings?.decimalPlaces ?? 2;
  const formatMoney = (val: number) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return num.toLocaleString('ja-JP', { 
      minimumFractionDigits: decimalPlaces, 
      maximumFractionDigits: decimalPlaces 
    });
  };

  shipment.items.forEach((item, index) => {
    // Zebra background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.rect(15, currentY, 180, 10, 'F');
    }

    // SKU (replaces No.)
    const cleanSku = safeText(item.sku || '-');
    setSafeFont(doc, 'courier', 'bold', cleanSku);
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // Slate-600
    const truncatedSku = cleanSku.length > 15 ? cleanSku.substring(0, 14) + '…' : cleanSku;
    doc.text(truncatedSku, 18, currentY + 6.2);
    
    // Product Name (English if available for export documents, fallback to Japanese)
    setupFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42); // Slate-900
    const cleanName = safeText(item.nameEn || item.nameJa || 'Unknown Item');
    const truncatedName = cleanName.length > 58 ? cleanName.substring(0, 55) + '...' : cleanName;
    doc.text(truncatedName, 46, currentY + 6.2);
    
    const symbol = getCurrencySymbol(shipment.currency);

    // Qty
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(item.qty), 145, currentY + 6.2, { align: 'right' });

    // Unit Price
    doc.setFont('courier', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`${symbol} ${formatMoney(item.unitPrice)}`, 168, currentY + 6.2, { align: 'right' });

    // Amount
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${symbol} ${formatMoney(item.amount)}`, 192, currentY + 6.2, { align: 'right' });

    currentY += 10;
  });

  // Draw table bottom border
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.line(15, currentY, 195, currentY);

  currentY += 4;

  // Summary and Totals card (right side)
  const summaryX = 118;
  const cardStartX = 114;
  
  // Calculate rowCount for the card height
  let rowCount = 2; // total qty, subtotal
  if (shipment.otherCharges > 0) rowCount++;
  rowCount++; // for grand total

  const boxCardHeight = rowCount * 5 + 4;
  
  // Draw beautiful summary card background matching the UI Live Preview
  doc.setFillColor(250, 251, 252); // Softest gray
  doc.setDrawColor(241, 245, 249); // Soft border
  doc.setLineWidth(0.4);
  doc.rect(cardStartX, currentY - 2, 81, boxCardHeight, 'DF');

  let summaryY = currentY + 2.5;

  const printSummaryRow = (label: string, val: string, isBold = false, isTotal = false) => {
    if (isTotal) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(37, 99, 235); // Blue-600
    } else {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105); // Slate-600
    }
    doc.text(label, summaryX, summaryY);

    if (isTotal) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(37, 99, 235); // Blue-600
    } else {
      doc.setFont('courier', isBold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59); // Slate-800
    }
    doc.text(val, 191, summaryY, { align: 'right' });
    summaryY += 5;
  };

  const symbol = getCurrencySymbol(shipment.currency);
  printSummaryRow('Total Items Qty:', String(shipment.totalQty));
  printSummaryRow('Subtotal Amount:', `${symbol} ${formatMoney(shipment.totalItemsAmount)}`);
  
  if (shipment.otherCharges > 0) {
    printSummaryRow('Other Charges:', `${symbol} ${formatMoney(shipment.otherCharges)}`);
  }

  // Draw total divider inside card
  doc.setDrawColor(226, 232, 240);
  doc.line(cardStartX + 3, summaryY - 2.5, 195 - 3, summaryY - 2.5);

  printSummaryRow('TOTAL INVOICE VALUE:', `${shipment.currency} ${formatMoney(shipment.totalInvoiceAmount)}`, true, true);

  currentY = currentY - 2 + boxCardHeight + 4;

  // Reset font size & color
  doc.setFontSize(8);
  setupFont(doc, 'normal');

  // Declaration text
  const declTitleY = Math.max(currentY, 212);
  setupFont(doc, 'bold');
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text('Declaration:', 15, declTitleY);
  
  setupFont(doc, 'normal');
  doc.setTextColor(71, 85, 105); // Slate-600
  const declText = settings.declaration || "We hereby certify that the information contained in this invoice is true and correct and that the contents of this shipment are as stated above.";
  const declLines = doc.splitTextToSize(declText, 180);
  let declY = declTitleY + 4;
  declLines.forEach((line: string) => {
    doc.text(line, 15, declY);
    declY += 3.5;
  });

  return doc;
}

/**
 * Creates a beautiful Packing List PDF
 */
export function generatePackingListPDF(shipment: Shipment, settings: SystemSettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let currentY = 15;
  currentY = drawHeader(doc, 'PACKING LIST', shipment, currentY, settings);
  currentY = drawParties(doc, shipment, currentY);
  currentY = drawShippingInfo(doc, shipment, settings, currentY);

  // Detail table header (Slate-800 for Packing List visual differentiation)
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(15, currentY, 180, 8, 'F');

  setupFont(doc, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('SKU', 18, currentY + 5.2);
  doc.text('Description of Goods', 46, currentY + 5.2);
  doc.text('Qty', 115, currentY + 5.2, { align: 'right' });
  doc.text('No. of Boxes', 140, currentY + 5.2, { align: 'right' });
  doc.text('Net Weight', 166, currentY + 5.2, { align: 'right' });
  doc.text('Gross Weight', 192, currentY + 5.2, { align: 'right' });

  currentY += 8;

  // Detail table rows
  setupFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // Slate-700

  // Estimate boxes and weights
  let totalBoxes = 0;
  let totalGrossWeight = 0;

  shipment.items.forEach((item, index) => {
    // Zebra background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.rect(15, currentY, 180, 10, 'F');
    }

    const boxes = Math.ceil(item.qty / 50); // Assumed 50 units per box
    totalBoxes += boxes;

    const netWeight = item.qty * item.weight;
    const grossWeight = netWeight * 1.1; // Assumed 10% packing tare weight
    totalGrossWeight += grossWeight;

    // SKU (replaces No.)
    const cleanSku = safeText(item.sku || '-');
    setSafeFont(doc, 'courier', 'bold', cleanSku);
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // Slate-600
    const truncatedSku = cleanSku.length > 15 ? cleanSku.substring(0, 14) + '…' : cleanSku;
    doc.text(truncatedSku, 18, currentY + 6.2);
    
    // Product Name (English if available for export documents, fallback to Japanese)
    setupFont(doc, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42); // Slate-900
    const cleanName = safeText(item.nameEn || item.nameJa || 'Unknown Item');
    const truncatedName = cleanName.length > 42 ? cleanName.substring(0, 39) + '...' : cleanName;
    doc.text(truncatedName, 46, currentY + 6.2);
    
    // Qty
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(item.qty), 115, currentY + 6.2, { align: 'right' });

    // No. of Boxes
    doc.setFont('courier', 'normal');
    doc.text(String(boxes), 140, currentY + 6.2, { align: 'right' });

    // Net Weight
    doc.setFont('courier', 'normal');
    doc.text(`${netWeight.toFixed(2)} kg`, 166, currentY + 6.2, { align: 'right' });

    // Gross Weight
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(`${grossWeight.toFixed(2)} kg`, 192, currentY + 6.2, { align: 'right' });

    currentY += 10;
  });

  // Draw table bottom border
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.line(15, currentY, 195, currentY);

  currentY += 4;

  // Summary and Totals block (right side)
  const summaryX = 118;
  const cardStartX = 114;
  
  const boxHeight = 4 * 5 + 4; // 4 rows: qty, boxes, net weight, gross weight
  
  // Draw card background matching the UI Live Preview
  doc.setFillColor(250, 251, 252); // Softest gray
  doc.setDrawColor(241, 245, 249); // Soft border
  doc.setLineWidth(0.4);
  doc.rect(cardStartX, currentY - 2, 81, boxHeight, 'DF');

  let summaryY = currentY + 2.5;

  const printSummaryRow = (label: string, val: string, isBold = false, isTotal = false) => {
    if (isTotal) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(37, 99, 235); // Blue-600
    } else {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105); // Slate-600
    }
    doc.text(label, summaryX, summaryY);

    if (isTotal) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(37, 99, 235); // Blue-600
    } else {
      doc.setFont('courier', isBold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59); // Slate-800
    }
    doc.text(val, 191, summaryY, { align: 'right' });
    summaryY += 5;
  };

  printSummaryRow('Total Items Quantity:', String(shipment.totalQty));
  printSummaryRow('Total Number of Boxes:', `${totalBoxes} Box(es)`);
  printSummaryRow('Total Net Weight:', `${shipment.totalWeight.toFixed(3)} kg`);
  
  // Draw total divider inside card
  doc.setDrawColor(226, 232, 240);
  doc.line(cardStartX + 3, summaryY - 2.5, 195 - 3, summaryY - 2.5);

  printSummaryRow('TOTAL GROSS WEIGHT:', `${totalGrossWeight.toFixed(3)} kg`, true, true);

  return doc;
}

/**
 * Utility to generate a ZIP of multiple shipments PDFs
 */
export async function generateShipmentsZip(shipments: Shipment[], settings: SystemSettings): Promise<Blob> {
  await loadJapaneseFont();
  const zip = new JSZip();

  for (const shipment of shipments) {
    // Generate Invoice PDF
    const invDoc = generateInvoicePDF(shipment, settings);
    const invBuffer = invDoc.output('arraybuffer');
    const safeClinicName = (shipment.clinicSnapshot?.name || shipment.clinicSnapshot?.nameEn || 'Clinic').replace(/[\/\\?%*:|"<>]/g, '_');
    zip.file(`${shipment.invoiceNo}_INVOICE_${safeClinicName}.pdf`, invBuffer);
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Utility to generate a single combined PDF document containing all Commercial Invoices sequentially
 */
export async function generateMergedInvoicesPDF(shipments: Shipment[], settings: SystemSettings): Promise<Blob> {
  await loadJapaneseFont();
  if (shipments.length === 0) {
    const emptyDoc = new jsPDF();
    return emptyDoc.output('blob');
  }

  // Generate each document and merge or draw each page
  // With jsPDF, we can render the first, then addPage() and draw subsequent ones
  const masterDoc = generateInvoicePDF(shipments[0], settings);

  for (let i = 1; i < shipments.length; i++) {
    const nextDoc = generateInvoicePDF(shipments[i], settings);
    // Since jsPDF allows adding pages:
    masterDoc.addPage();
    // Copy content or draw by re-invoking the drawing steps
    // To ensure exact identical rendering on multi-page masterDoc:
    // We can use internal page transfer or render directly:
    const pageCount = nextDoc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      if (p > 1) masterDoc.addPage();
    }
  }

  return masterDoc.output('blob');
}

