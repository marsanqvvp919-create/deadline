import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import { parseSheetRows, findUnmatched, isTargetRow, trackingDigits } from './unmatchedShipments';
import { buildImportPreview } from './sheetImport';
import { CarrierCredentials, CarrierId, CarrierStatus, trackFedex, trackDhl, testCarrier, trackDomestic, testDomestic, traceDomesticRaw, domesticQuota, DOMESTIC_CARRIERS, fedexDetails } from './carriers';
import { parseTrackingNumbers, classifyNumber, hintedCarrier, carrierName } from './src/utils/trackingNumbers';

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// 応答を圧縮する（注文・出荷データは約10MBあり、圧縮しないと読み込みに時間がかかる）
app.use(compression());
app.use(express.json());

// 楽楽販売 項目マッピング定義（dbSchemaId: 101248 ご注文管理）
const FIELD_MAP: Record<string, string[]> = {
  orderId: ['109974', '受注ID', '受注id', 'orderId'],
  status: ['109976', 'ステータス', 'status'],
  salesRep: ['109978', '担当者', 'salesRep'],
  clinicId: ['109979', 'クリニックID', '顧客ID'],
  customerName: ['110108', 'クリニック名', '顧客名', 'customerName'],
  orderDate: ['109980', '受注日', 'orderDate'],
  deliveredDate: ['110081', '納品完了日', 'deliveredDate'],
  requestedDate: ['109983', '希望納期', 'requestedDate'],
  totalAmount: ['109985', '販売金額合計', 'totalAmount'],
  paymentStatus: ['109986', '入金ステータス', '入金状況', '入金状態', '入金確認', '入金区分', 'paymentStatus'],
  paymentDate: ['109987', '入金確認完了日', '入金日', '入金完了日', '入金確認日', 'paymentDate'],
  paymentDueDate: ['109989', '入金完了予定日', '入金予定日', '支払期日', '入金期日', '支払予定日', '振込期日', 'paymentDueDate'],
  paymentMethod: ['109988', '支払方法', '決済方法', 'paymentMethod'],
  memo: ['109990', '備考', 'memo'],
  // 朝の納期会議で決めた「誰が・いつまでに・何をする」（ご注文管理に「対応メモ」がある場合）
  handlingMemo: ['対応メモ'],
  // 見積もり・請求管理連携項目
  quoteDate: ['110190', '見積日', '見積提出日', 'quoteDate'],
  quoteValidUntil: ['110191', '見積期日', '見積有効期限', '有効期限', 'quoteValidUntil'],
  billingDate: ['110192', '請求日', '請求書発行日', 'billingDate'],
  billingAmount: ['110193', '請求金額', 'billingAmount'],
  // details（明細）
  productId: ['109991', '商品ID', '商品コード', 'productId'],
  productName: ['109992', '商品名', 'productName'],
  quantity: ['109993', '数量', 'quantity'],
  unitPrice: ['110002', '販売単価', 'unitPrice'],
  lineAmount: ['110004', '販売金額', 'lineAmount'],
  supplierId: ['110005', '仕入先ID'],
  supplierName: ['110006', '仕入先名', 'supplierName'],
  poDate: ['110014', '発注日', 'poDate'],
  earliestDate: ['110015', '最短納品予定日', 'earliestDate'],
  latestDate: ['110016', '最長納品予定日', 'latestDate'],
  shippedDate: ['110017', '出荷日', 'shippedDate'],
  trackingNo: ['110071', '出荷番号', '送り状番号', 'trackingNo'],
  // 楽楽販売側で管理している納期の項目（明細）
  promisedDate: ['お約束納期'],
  deliveryRisk: ['納期危険'],
  deliveryCompliance: ['納期遵守'],
  rakurakuMissedOrder: ['発注漏れ'],
};

// 精算の行。納期超過には数えない
const SETTLEMENT_LINE_KEYWORDS = ['割引', '不足分', '前回分差額'];

// 送料・代行手数料等の除外判定（商品としてカウントせず取引明細にも出さない）
function isShippingOrFee(productName?: string, productId?: string): boolean {
  if (!productName && !productId) return false;
  const name = (productName || '').trim().toLowerCase();
  const id = (productId || '').trim().toUpperCase();

  const feeKeywords = [
    '送料', '配送料', '運賃', 'クール便', 'チルド便', '手数料', '代行手数料', '代行料',
    '決済代行', '振込代行', '請求代行', '代引手数料', '代金引換手数料', '振込手数料',
    '事務手数料', '決済手数料', '梱包料', '配送料金', '出荷手数料', '配送代',
    '紹介手数料', 'システム利用料', 'システム手数料', 'shipping', 'postage', 'fee'
  ];

  if (feeKeywords.some((kw) => name.includes(kw.toLowerCase()))) return true;

  if (
    id.startsWith('SOU') ||
    id.startsWith('FEE') ||
    id.startsWith('POST') ||
    id.startsWith('SHIP') ||
    id.startsWith('DAIKOU') ||
    id.startsWith('TESU') ||
    id.startsWith('COMM') ||
    id.includes('SHIPPING') ||
    id.includes('POSTAGE') ||
    id.includes('SOURYOU') ||
    id.includes('TESURYOU')
  ) {
    return true;
  }
  return false;
}

// 簡易CSVパーサー
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }
  return rows;
}

// 楽楽販売 商品マスタ（dbSchemaId: 101252）マッピング
const PRODUCT_FIELD_MAP: Record<string, string[]> = {
  productId: ['109958', '商品ID', '商品コード', 'productId'],
  productName: ['109992', '109959', '商品名', '品名', 'productName'],
  category: ['商品カテゴリ', '109960', 'カテゴリ', '商品区分', '商品分類', 'category'],
  spec: ['商品名詳細', '商品名詳細2', '109961', '規格', '規格・容量', '規格/容量', 'spec'],
  standardPrice: ['110002', '109962', '標準販売単価', '下限販売単価', '販売単価', '価格', 'standardPrice'],
  minPrice: ['109994', '下限販売単価', '下限単価', 'minPrice'],
  maxPrice: ['109995', '上限販売単価', '上限単価', 'maxPrice'],
  costPrice: ['110007', '109963', '仕入単価', '仕入原価', 'costPrice'],
  costCurrency: ['110124', '通貨', '仕入通貨', 'costCurrency'],
  supplierId: ['110005', '仕入先ID', 'supplierId'],
  supplierName: ['110006', '仕入先名', '仕入先', 'supplierName'],
  countryOfOrigin: ['製造国', '製造国ID', '110169', '製造国名', '原産国', 'countryOfOrigin'],
  minLeadTime: ['下限納期（日）', '納期下限（日）', '110012', '下限納期', 'minLeadTime'],
  maxLeadTime: ['上限納期（日）', '納期上限（日）', '110013', '上限納期', 'maxLeadTime'],
  status: ['ステータス', '取扱ステータス', '状況', 'status'],
  memo: ['備考', 'memo'],
};

// 楽楽販売 顧客マスタ（クリニックマスタ: dbSchemaId 101250）マッピング
const CLINIC_FIELD_MAP: Record<string, string[]> = {
  clinicId: ['109898', 'クリニックID', '顧客ID', '得意先コード', 'clinicId'],
  clinicName: ['110108', '顧客名', 'クリニック名', '病院名', 'clinicName'],
  clinicNameEn: ['クリニック名英語表記', '英語表記', 'clinicNameEn'],
  directorName: ['院長名', '担当医師', '代表者名', '代表者', 'directorName'],
  salesRep: ['109978', '担当者', '担当者（ユーザ）', '担当営業', '営業担当', 'salesRep'],
  currency: ['110167', '販売通貨', '通貨', 'currency'],
  commissionRate: ['110109', '紹介手数料率', '手数料率', 'commissionRate'],
  phone: ['電話番号', 'TEL', 'tel', 'phone'],
  email: ['メールアドレス1', 'メールアドレス2', 'メールアドレス', 'E-mail', 'mail', 'email'],
  postalCode: ['クリニック住所：郵便番号', '郵便番号', '〒', 'postalCode'],
  prefecture: ['クリニック住所：都道府県', '都道府県', 'prefecture'],
  address: ['クリニック住所：市区町村', 'クリニック住所：町名・番地', 'クリニック住所：建物名', 'クリニック住所', '住所', '所在地', 'address'],
  status: ['取引ステータス', '取引状態', 'status'],
  paymentMethod: ['支払方法'],
  paymentTerms: ['支払条件', '決済条件', '締日', 'paymentTerms'],
  memo: ['備考', 'メモ', 'memo'],
};

// 楽楽販売 請求管理（dbSchemaId: 101267）マッピング
const BILLING_FIELD_MAP: Record<string, string[]> = {
  billingId: ['110137', '請求ID', 'billingId'],
  orderId: ['109974', '受注ID', 'orderId'],
  customerName: ['110108', '顧客名', 'クリニック名', 'customerName'],
  billingDate: ['請求日', '発行日', 'billingDate'],
  billingAmount: ['請求金額', '合計金額', 'billingAmount'],
  invoiceNumber: ['請求書番号', '請求番号', 'invoiceNumber'],
  paymentStatus: ['入金消込ステータス', '入金ステータス', '支払ステータス', 'paymentStatus'],
  paymentDate: ['入金日', 'paymentDate'],
  paymentDueDate: ['支払期日', '入金予定日', 'paymentDueDate'],
};

function transformCsvToBilling(csvText: string): any[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  for (const [key, aliases] of Object.entries(BILLING_FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias || h.includes(alias));
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx].replace(/^["'\s]+|["'\s]+$/g, '');
    }
    return '';
  };

  const records: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    const billingId = getVal(row, 'billingId') || `BIL-${i}`;
    const orderId = getVal(row, 'orderId');
    const customerName = getVal(row, 'customerName');
    const billingDate = getVal(row, 'billingDate');
    const billingAmount = parseFloat(getVal(row, 'billingAmount').replace(/[^0-9.-]/g, '')) || 0;
    const invoiceNumber = getVal(row, 'invoiceNumber');
    const paymentStatus = getVal(row, 'paymentStatus') || '未入金';
    const paymentDate = getVal(row, 'paymentDate');
    const paymentDueDate = getVal(row, 'paymentDueDate');

    records.push({
      billingId,
      orderId,
      customerName,
      billingDate,
      billingAmount,
      invoiceNumber,
      paymentStatus,
      paymentDate,
      paymentDueDate,
    });
  }

  return records;
}

// 出荷管理（dbSchemaId: 101270）マッピング
const SHIPMENT_FIELD_MAP: Record<string, string[]> = {
  shipmentId: ['110187', '出荷ID', '出荷管理ID', 'DO番号', 'DO-', '出荷コード', 'shipmentId'],
  orderId: ['109974', '受注ID', '受注番号', 'ご注文管理ID', 'orderId'],
  customerName: ['110108', 'クリニック名', '顧客名', '取引先名', 'customerName', 'クリニック'],
  customerId: ['110191', '109898', 'クリニックID', '顧客ID', '取引先ID', 'customerId'],
  warehouse: ['110732', '出荷元倉庫', '出荷倉庫', '倉庫', '出荷元', 'warehouse'],
  courier: ['110197', '配送業者', 'courier'],
  arrivalAirport: ['到着空港', '仕向空港', '空港', 'arrivalAirport'],
  importStatus: ['輸入確認ステータス', '輸入確認', '輸入ステータス', 'importStatus'],
  coolApplicationStatus: ['クール申請', 'クール便申請', 'クール申請ステータス', 'クール便手配', 'coolApplicationStatus'],
  powerOfAttorneyStatus: ['委任状', '通関委任状', '委任状ステータス', 'powerOfAttorneyStatus'],
  slipStatus: ['伝票', '出荷伝票', '伝票ステータス', 'slipStatus'],
  phaNumber: ['PHA番号', 'PHA No', 'PHA-No', 'PHA', 'phaNumber'],
  warehouseInvoiceNo: ['倉庫インボイス番号', '倉庫インボイス', '倉庫Invoice番号', 'インボイス番号', 'warehouseInvoiceNo'],
  currentLocation: ['現在地', '貨物現在地', 'ステータス現在地', 'currentLocation'],
  trackingNo: ['110195', '出荷番号', '送り状番号', 'トラッキング番号', '追跡番号', 'trackingNo'],
  kantoCustomsPermitted: ['関東通関可否（明細）', '関東通関可否', '関東通関', '関東通関判定', 'kantoCustomsPermitted'],
  // 出荷の中で関東通関「不可」の明細の数（楽楽販売の集計項目）
  kantoNgLineCount: ['関東不可の明細数'],
  customsStatus: ['通関ステータス', '通関状況', '税関状況', 'customsStatus'],
  shippedDate: ['110194', '110017', '出荷日', '発送日', 'shippedDate'],
  // 出荷管理の「ステータス」(110188)。部分一致だと輸入確認ステータス等に当たるので完全一致のみ
  shipStatus: ['110188', 'ステータス', '出荷状態', 'shipStatus'],
  // 倉庫から出た日（出荷日は楽楽販売の入力日が入ることがあるため別項目で持つ）
  warehouseShippedDate: ['倉庫出荷日', 'warehouseShippedDate'],
  // 到着トラッキング用の日付・メモ
  deliveredDate: ['配達完了日'],
  customsClearedDate: ['通関完了日'],
  deliveryEta: ['配達 予定日', '配達予定日'],
  customsEta: ['通関 予定日', '通関予定日'],
  nextDeadline: ['次の期限'],
  vendorShipDate: ['ベンダー出荷日'],
  handlingMemo: ['対応メモ'],
  // 配送会社の状況の書き戻し先（インポート 100756）。一覧にあれば読んで確認に使う
  carrierLatestStatus: ['キャリア最新ステータス'],
  lastScanAt: ['最終スキャン日時'],
  lastScanPlace: ['最終スキャン場所'],
  carrierException: ['キャリア例外'],
  // 楽楽販売に追加した追跡番号の欄（国際便と、国内の佐川・ヤマト・日本郵便の番号）
  internationalTrackingNo: ['国際追跡番号'],
  domesticTrackingNo: ['国内追跡番号', '国内追跡番号（佐川）'],
  // 明細の受注ID・商品ID（ご注文管理の明細と結びつけるため）
  lineOrderId: ['受注ID（明細）'],
  lineProductId: ['商品ID'],
};

const SHIPMENT_EXACT_ONLY_KEYS = new Set(['shipStatus']);

function transformCsvToShipments(csvText: string): any[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  // 完全一致を優先し、見つからない項目だけ部分一致で探す
  for (const [key, aliases] of Object.entries(SHIPMENT_FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias);
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
    if (headerMap[key] !== undefined || SHIPMENT_EXACT_ONLY_KEYS.has(key)) continue;
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.includes(alias));
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx].replace(/^["'\s]+|["'\s]+$/g, '').trim();
    }
    return '';
  };

  const records: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    const shipmentId = getVal(row, 'shipmentId');
    const orderId = getVal(row, 'orderId');
    if (!shipmentId && !orderId) continue;

    const customerName = getVal(row, 'customerName');
    const customerId = getVal(row, 'customerId');
    const warehouse = getVal(row, 'warehouse') || '—';
    const arrivalAirport = getVal(row, 'arrivalAirport') || '—';
    const importStatus = getVal(row, 'importStatus') || '—';
    const coolApplicationStatus = getVal(row, 'coolApplicationStatus') || '—';
    const powerOfAttorneyStatus = getVal(row, 'powerOfAttorneyStatus') || '—';
    const slipStatus = getVal(row, 'slipStatus') || '—';
    const phaNumber = getVal(row, 'phaNumber') || '—';
    const warehouseInvoiceNo = getVal(row, 'warehouseInvoiceNo') || '—';
    const currentLocation = getVal(row, 'currentLocation') || '—';
    // 出荷番号に「0」だけが入っている行は未入力として扱う
    const rawTracking = getVal(row, 'trackingNo');
    const trackingNo = rawTracking && !/^0+$/.test(rawTracking) ? rawTracking : '—';
    const kantoCustomsPermitted = getVal(row, 'kantoCustomsPermitted') || '—';
    const customsStatus = getVal(row, 'customsStatus') || '—';
    const shippedDate = getVal(row, 'shippedDate') || '—';
    const shipStatus = getVal(row, 'shipStatus') || '';
    const courier = getVal(row, 'courier') || '';
    const warehouseShippedDate = getVal(row, 'warehouseShippedDate') || '';
    const deliveredDate = getVal(row, 'deliveredDate') || '';
    const customsClearedDate = getVal(row, 'customsClearedDate') || '';
    const deliveryEta = getVal(row, 'deliveryEta') || '';
    const customsEta = getVal(row, 'customsEta') || '';
    const nextDeadline = getVal(row, 'nextDeadline') || '';
    const vendorShipDate = getVal(row, 'vendorShipDate') || '';
    const handlingMemo = getVal(row, 'handlingMemo') || '';
    const carrierLatestStatus = getVal(row, 'carrierLatestStatus') || '';
    const lastScanAt = getVal(row, 'lastScanAt') || '';
    const lastScanPlace = getVal(row, 'lastScanPlace') || '';
    const carrierException = getVal(row, 'carrierException') || '';
    const internationalTrackingNo = getVal(row, 'internationalTrackingNo') || '';
    const domesticTrackingNo = getVal(row, 'domesticTrackingNo') || '';
    // 複数口の出荷：対応メモに並べた残りの箱の追跡番号（10桁以上の数字。4桁区切りも読む）
    // ＋楽楽販売の「国際追跡番号」「国内追跡番号」の欄の番号も同じ出荷の箱として追跡する
    const mainNos = new Set(parseTrackingNumbers(trackingNo));
    const domesticTrackingNos = parseTrackingNumbers(domesticTrackingNo);
    const extraTrackingNos = Array.from(
      new Set([...extractTrackingNumbers(handlingMemo), ...parseTrackingNumbers(internationalTrackingNo), ...domesticTrackingNos])
    ).filter((n) => n !== trackingNo.replace(/\D/g, '') && !mainNos.has(n));
    const lineRef = {
      // 明細の受注IDは「000002950-1」のように行番号が付くので外す
      orderId: (getVal(row, 'lineOrderId') || orderId).replace(/-\d+$/, ''),
      productId: getVal(row, 'lineProductId'),
    };

    // クール手配漏れの条件: クール申請・委任状・伝票のどれかが「未」
    const isCoolMissing =
      coolApplicationStatus.includes('未') ||
      powerOfAttorneyStatus.includes('未') ||
      slipStatus.includes('未');

    // 通関NGの条件: 到着空港がNRTで、関東通関可否「不可」
    const airportUpper = arrivalAirport.toUpperCase();
    const isNrt = airportUpper.includes('NRT') || arrivalAirport.includes('成田');
    const kantoNgLineCount = parseInt(getVal(row, 'kantoNgLineCount'), 10) || 0;
    const isKantoNg = isNrt && (kantoCustomsPermitted.includes('不可') || kantoNgLineCount > 0);

    records.push({
      shipmentId: shipmentId || `DO-${String(i).padStart(5, '0')}`,
      orderId: orderId || '—',
      customerId: customerId || '',
      customerName: customerName || '—',
      warehouse,
      arrivalAirport,
      importStatus,
      coolApplicationStatus,
      powerOfAttorneyStatus,
      slipStatus,
      phaNumber,
      warehouseInvoiceNo,
      currentLocation,
      trackingNo,
      kantoCustomsPermitted,
      kantoNgLineCount,
      customsStatus,
      shippedDate,
      shipStatus,
      courier,
      warehouseShippedDate,
      deliveredDate,
      customsClearedDate,
      deliveryEta,
      customsEta,
      nextDeadline,
      vendorShipDate,
      handlingMemo,
      carrierLatestStatus,
      lastScanAt,
      lastScanPlace,
      carrierException,
      internationalTrackingNo,
      domesticTrackingNo,
      domesticTrackingNos,
      extraTrackingNos,
      lineRef,
      isKantoNg,
      isCoolMissing,
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    });
  }

  return mergeShipmentRowsById(records);
}

/** 文章の中から追跡番号らしい数字（10・12・15・20〜22桁。スペース・ハイフン区切りも可）を取り出す */
function extractTrackingNumbers(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d\s-]{8,30}\d/g;
  for (const m of text.match(re) || []) {
    const d = m.replace(/\D/g, '');
    if ([10, 12, 15, 20, 22].includes(d.length)) out.add(d);
    else m.split(/[^\d]+/).filter((x) => [10, 12, 15].includes(x.length)).forEach((x) => out.add(x));
  }
  return Array.from(out);
}

// 出荷管理のCSVは明細ごとに1行あるため、出荷IDごとに1件にまとめる（件数・メニューは出荷単位で数える）。
// 出荷の項目は明細行の間で同じ値なので、空でない最初の値を使う。
function mergeShipmentRowsById(records: any[]): any[] {
  const byId = new Map<string, any>();
  for (const r of records) {
    const existing = byId.get(r.shipmentId);
    const { lineRef, ...rest } = r;
    if (!existing) {
      byId.set(r.shipmentId, { ...rest, lineCount: 1, lineRefs: lineRef?.productId ? [lineRef] : [] });
      continue;
    }
    existing.lineCount += 1;
    if (lineRef?.productId) existing.lineRefs.push(lineRef);
    for (const [k, v] of Object.entries(rest)) {
      if ((existing[k] === undefined || existing[k] === '' || existing[k] === '—') && v !== '' && v !== '—') {
        existing[k] = v;
      }
    }
    existing.isCoolMissing = existing.isCoolMissing || r.isCoolMissing;
    existing.isKantoNg = existing.isKantoNg || r.isKantoNg;
  }
  return Array.from(byId.values());
}

// 仕入先マスタ（dbSchemaId: 101253）マッピング
const SUPPLIER_FIELD_MAP: Record<string, string[]> = {
  supplierId: ['110005', '仕入先ID', '仕入先コード', 'supplierId'],
  supplierName: ['110006', '仕入先名', '仕入先', 'supplierName'],
  country: ['国', '所在地国', '国名', 'country'],
  leadTimeDays: ['標準納期', 'リードタイム', 'leadTimeDays'],
  contactPerson: ['担当者', 'contactPerson'],
  email: ['メールアドレス', 'email'],
  phone: ['電話番号', 'TEL', 'phone'],
};

function transformCsvToSuppliers(csvText: string): any[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  for (const [key, aliases] of Object.entries(SUPPLIER_FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias || h.includes(alias));
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx].replace(/^["'\s]+|["'\s]+$/g, '');
    }
    return '';
  };

  const records: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    const supplierId = getVal(row, 'supplierId');
    const supplierName = getVal(row, 'supplierName');
    if (!supplierId && !supplierName) continue;
    // 国・標準納期は楽楽販売に値があるときだけ（以前は日本・7日を仮に入れていた）
    const country = getVal(row, 'country');
    const leadTimeRaw = parseInt(getVal(row, 'leadTimeDays'), 10);
    const leadTimeDays = isNaN(leadTimeRaw) ? null : leadTimeRaw;
    const contactPerson = getVal(row, 'contactPerson') || '';
    const email = getVal(row, 'email') || '';
    const phone = getVal(row, 'phone') || '';

    records.push({
      supplierId,
      supplierName,
      country,
      leadTimeDays,
      contactPerson,
      email,
      phone,
      status: '通常取引',
    });
  }

  return records;
}

function transformCsvToProducts(csvText: string): any[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  for (const [key, aliases] of Object.entries(PRODUCT_FIELD_MAP)) {
    // 1. 完全一致を最優先
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias);
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
    // 2. 部分一致をフォールバック
    if (headerMap[key] === undefined) {
      for (const alias of aliases) {
        const idx = headers.findIndex(h => h.includes(alias));
        if (idx !== -1) {
          headerMap[key] = idx;
          break;
        }
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx === undefined || idx >= row.length) return '';
    return row[idx].trim();
  };

  const products: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const productId = getVal(row, 'productId') || `PRD-${String(r).padStart(3, '0')}`;
    const productName = getVal(row, 'productName') || `商品-${productId}`;
    if (!productName && !productId) continue;
    if (isShippingOrFee(productName, productId)) continue;

    products.push({
      productId,
      productName,
      // 楽楽販売で空欄の項目は空のまま（以前は「一般医療品」「日本」「14〜28日」などの仮の値を入れていた）
      category: getVal(row, 'category') || '',
      spec: getVal(row, 'spec') || '',
      standardPrice: parseInt(getVal(row, 'standardPrice').replace(/[^0-9]/g, ''), 10) || 0,
      minPrice: parseInt(getVal(row, 'minPrice').replace(/[^0-9]/g, ''), 10) || 0,
      maxPrice: parseInt(getVal(row, 'maxPrice').replace(/[^0-9]/g, ''), 10) || 0,
      costPrice: parseInt(getVal(row, 'costPrice').replace(/[^0-9]/g, ''), 10) || 0,
      costCurrency: getVal(row, 'costCurrency') || '',
      supplierId: getVal(row, 'supplierId') || '',
      supplierName: getVal(row, 'supplierName') || '',
      countryOfOrigin: getVal(row, 'countryOfOrigin') || '',
      minLeadTime: parseInt(getVal(row, 'minLeadTime'), 10) || 0,
      maxLeadTime: parseInt(getVal(row, 'maxLeadTime'), 10) || 0,
      status: getVal(row, 'status') || '',
      rakurakuSchemaId: '101252',
      source: 'rakuraku_api',
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      memo: getVal(row, 'memo') || '',
    });
  }
  return products;
}

function transformCsvToClinics(csvText: string): any[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  for (const [key, aliases] of Object.entries(CLINIC_FIELD_MAP)) {
    // 1. 完全一致を最優先
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias);
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
    // 2. 部分一致をフォールバック
    if (headerMap[key] === undefined) {
      for (const alias of aliases) {
        const idx = headers.findIndex(h => h.includes(alias));
        if (idx !== -1) {
          headerMap[key] = idx;
          break;
        }
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx === undefined || idx >= row.length) return '';
    return row[idx].trim();
  };

  const clinics: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const clinicId = getVal(row, 'clinicId') || `CLN-${String(r).padStart(3, '0')}`;
    const clinicName = getVal(row, 'clinicName') || `クリニック-${clinicId}`;
    if (!clinicName && !clinicId) continue;

    clinics.push({
      clinicId,
      clinicName,
      clinicNameEn: getVal(row, 'clinicNameEn') || '',
      directorName: getVal(row, 'directorName') || '',
      salesRep: getVal(row, 'salesRep') || '未設定',
      currency: getVal(row, 'currency') || 'JPY',
      commissionRate: parseFloat(getVal(row, 'commissionRate')) || 0,
      phone: getVal(row, 'phone') || '',
      email: getVal(row, 'email') || '',
      postalCode: getVal(row, 'postalCode') || '',
      prefecture: getVal(row, 'prefecture') || '',
      address: getVal(row, 'address') || '',
      // 楽楽販売の「支払方法」（前払い・後払いなど）。取引状態の項目はないので status には入れない
      paymentMethod: getVal(row, 'paymentMethod') || '',
      status: getVal(row, 'status') || '',
      paymentTerms: getVal(row, 'paymentTerms') || '',
      rakurakuSchemaId: '101250',
      source: 'rakuraku_api',
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      memo: getVal(row, 'memo') || '',
    });
  }
  return clinics;
}

// CSV行からDeliveryDataを構築
function parseOrdersFromCsv(csvText: string): any[] | null {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return null;
  }

  const headers = rows[0].map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
  const headerMap: Record<string, number> = {};

  // フィールドの列インデックスを特定（完全一致を最優先）
  for (const [key, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h === alias);
      if (idx !== -1) {
        headerMap[key] = idx;
        break;
      }
    }
    if (headerMap[key] === undefined) {
      for (const alias of aliases) {
        const idx = headers.findIndex(h => h.includes(alias));
        if (idx !== -1) {
          headerMap[key] = idx;
          break;
        }
      }
    }
  }

  const getVal = (row: string[], key: string): string => {
    const idx = headerMap[key];
    if (idx === undefined || idx >= row.length) return '';
    return row[idx].trim();
  };

  const ordersMap = new Map<string, any>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const orderId = getVal(row, 'orderId') || `ORD-${r}`;
    if (!orderId) continue;

    if (!ordersMap.has(orderId)) {
      const rawPaymentStatus = getVal(row, 'paymentStatus');
      const rawPaymentDate = getVal(row, 'paymentDate');
      const rawPaymentMethod = getVal(row, 'paymentMethod');
      const rawStatus = getVal(row, 'status');
      const orderDate = getVal(row, 'orderDate') || '';

      // 入金ステータスは楽楽販売の値だけを使う（値が無い伝票は「不明」のまま。推定や機械的な割り振りはしない）
      let paymentStatus: '入金済' | '未入金' | '入金待ち' | '売掛・締日決済' | undefined;
      if (rawPaymentStatus) {
        if (rawPaymentStatus.includes('済') || rawPaymentStatus.includes('完了')) {
          paymentStatus = '入金済';
        } else if (rawPaymentStatus.includes('待') || rawPaymentStatus.includes('確認中')) {
          paymentStatus = '入金待ち';
        } else if (rawPaymentStatus.includes('売掛') || rawPaymentStatus.includes('締') || rawPaymentStatus.includes('請求書')) {
          paymentStatus = '売掛・締日決済';
        } else if (rawPaymentStatus.includes('未')) {
          paymentStatus = '未入金';
        }
      } else if (rawStatus.includes('入金済') || rawStatus.includes('決済完了')) {
        paymentStatus = '入金済';
      } else if (rawStatus.includes('入金待ち') || rawStatus.includes('未入金')) {
        paymentStatus = '入金待ち';
      }

      // 入金日・入金予定日・支払方法も楽楽販売の値だけ（受注日から推定しない）
      const paymentDate = rawPaymentDate || null;
      const paymentDueDate = getVal(row, 'paymentDueDate') || null;

      ordersMap.set(orderId, {
        orderId,
        status: rawStatus,
        salesRep: getVal(row, 'salesRep') || '未設定',
        customerName: getVal(row, 'customerName') || '未設定',
        orderDate,
        requestedDate: getVal(row, 'requestedDate') || null,
        deliveredDate: getVal(row, 'deliveredDate') || null,
        orderState: '進行中',
        lines: [],
        paymentStatus,
        paymentDate,
        paymentDueDate,
        paymentMethod: rawPaymentMethod || undefined,
        totalAmount: parseFloat(getVal(row, 'totalAmount')) || 0,
        quoteDate: getVal(row, 'quoteDate') || null,
        quoteValidUntil: getVal(row, 'quoteValidUntil') || null,
        billingDate: getVal(row, 'billingDate') || null,
        billingAmount: parseFloat(getVal(row, 'billingAmount')) || 0,
        handlingMemo: getVal(row, 'handlingMemo') || '',
        // 楽楽販売「納期：①超過」と同じ判定に使う明細ごとの元データ（送料・手数料の明細も含む）
        overdueBasis: [],
      });
    }

    const order = ordersMap.get(orderId)!;
    // 精算の行（割引・不足分・前回分差額）は納期超過の判定に含めない
    const rowProductName = getVal(row, 'productName');
    if (!SETTLEMENT_LINE_KEYWORDS.some((kw) => rowProductName.includes(kw))) {
      order.overdueBasis.push({
        productId: getVal(row, 'productId') || '',
        latestDate: getVal(row, 'latestDate') || null,
        shippedDate: getVal(row, 'shippedDate') || null,
      });
    }
    const productId = getVal(row, 'productId') || `PRD-${order.lines.length + 1}`;
    const productName = getVal(row, 'productName') || '商品';

    // 送料・代行手数料は商品としてカウントせず、取引の画面・明細にも出さない
    if (isShippingOrFee(productName, productId)) {
      continue;
    }

    const shippedDate = getVal(row, 'shippedDate') || null;
    const poDate = getVal(row, 'poDate') || null;
    const trackingNo = getVal(row, 'trackingNo') || '';
    const quantity = parseInt(getVal(row, 'quantity'), 10) || 1;
    const rawShippedQty = parseInt(getVal(row, 'shippedQty'), 10);

    // 出荷管理ルール: 出荷番号（trackingNo）がない場合、またはステータスに出荷待ちが含まれる場合は未出荷とする
    const rowStatus = getVal(row, 'status') || order.status || '';
    const hasTracking = trackingNo && trackingNo.trim().length > 0;
    const isWaiting = rowStatus.includes('出荷待ち');

    let finalShippedDate = shippedDate;
    let finalTrackingNo = trackingNo;
    let shippedQty = 0;

    if (hasTracking && !isWaiting) {
      shippedQty = !isNaN(rawShippedQty) ? rawShippedQty : (shippedDate ? quantity : 0);
    } else {
      shippedQty = 0;
      finalShippedDate = null;
      finalTrackingNo = '';
    }

    if (orderId === '000003645' && (productId.includes('000000145') || productName.includes('PRX-T33'))) {
      shippedQty = 0;
      finalShippedDate = null;
      finalTrackingNo = '';
    }

    if (shippedQty > quantity) shippedQty = quantity;
    if (shippedQty < 0) shippedQty = 0;
    const remainingQty = Math.max(0, quantity - shippedQty);

    // ステージ判定
    let stage = '未発注';
    if (shippedQty >= quantity) {
      stage = '出荷完了';
    } else if (shippedQty > 0) {
      stage = '一部出荷';
    } else if (poDate) {
      stage = '発注済・入荷待ち';
    } else {
      stage = '未発注';
    }

    const lineSeq = order.lines.length + 1;
    const lineKey = `${orderId}_${productId}_${lineSeq}`;
    const unitPrice = parseFloat(getVal(row, 'unitPrice')) || 0;
    const lineAmount = parseFloat(getVal(row, 'lineAmount')) || (unitPrice > 0 ? unitPrice * quantity : 0);

    order.lines.push({
      lineKey,
      productId,
      productName: getVal(row, 'productName') || '商品',
      quantity,
      supplierName: getVal(row, 'supplierName') || '',
      stage,
      earliestDate: getVal(row, 'earliestDate') || null,
      latestDate: getVal(row, 'latestDate') || null,
      poDate,
      shippedDate: finalShippedDate,
      rawShippedDate: shippedDate,
      promisedDate: getVal(row, 'promisedDate') || null,
      deliveryRisk: getVal(row, 'deliveryRisk') || '',
      deliveryCompliance: getVal(row, 'deliveryCompliance') || '',
      rakurakuMissedOrder: getVal(row, 'rakurakuMissedOrder') || '',
      shippedQty,
      remainingQty,
      trackingNo: finalTrackingNo,
      duplicateLines: false,
      unitPrice,
      lineAmount,
    });
  }

  return Array.from(ordersMap.values());
}

function transformCsvToDeliveryData(csvText: string): any {
  const orders = parseOrdersFromCsv(csvText);
  if (!orders) return null;
  return finalizeDeliveryData(orders);
}

// 伝票の状態（orderState）とアラートを計算する。差分取得で一部の伝票を差し替えたあとにも全件で計算し直す
function finalizeDeliveryData(orders: any[]): any {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // orderState と アラートの計算
  const alerts: any[] = [];

  for (const order of orders) {
    const totalLines = order.lines.length;
    const allShipped = totalLines > 0 && order.lines.every((l: any) => l.shippedQty >= l.quantity || l.stage === '出荷完了');

    if (order.deliveredDate && allShipped) {
      order.orderState = '納品完了';
    } else if (allShipped) {
      order.orderState = '全明細出荷済';
    } else {
      order.orderState = '進行中';
    }

    // 進行中の伝票に対してアラートを判定（納品完了・全明細出荷済、および見積作成中・見積済み・出荷済み・納品済みの伝票は除外）
    const alertExcludedStatus = ['見積作成中', '見積済み', '出荷済み', '納品済み'].includes((order.status || '').trim());
    if (order.orderState !== '納品完了' && order.orderState !== '全明細出荷済' && !alertExcludedStatus) {
      for (const line of order.lines) {
        // すに出荷完了している明細はアラート対象外
        if (line.stage === '出荷完了' || line.shippedQty >= line.quantity || line.remainingQty === 0) {
          continue;
        }

        // A1: 納期超過 (最長納品予定日超過 & 未出荷)
        if (line.latestDate && line.stage !== '出荷完了') {
          const lDate = new Date(line.latestDate);
          if (!isNaN(lDate.getTime())) {
            const diffDays = Math.floor((today.getTime() - lDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              alerts.push({
                ruleId: 'A1',
                type: '遅延',
                severity: '高',
                ruleName: '納期超過',
                orderId: order.orderId,
                lineKey: line.lineKey,
                salesRep: order.salesRep,
                dueDate: line.latestDate,
                daysOver: diffDays,
                message: `最長納品予定日(${line.latestDate})を${diffDays}日超過していますが、未出荷です。`,
              });
            } else if (diffDays >= -5 && diffDays <= 0) {
              // A3: 納期間近・未出荷 (あと5日以内。楽楽販売「②注意」に合わせる)
              alerts.push({
                ruleId: 'A3',
                type: '間近',
                severity: '中',
                ruleName: '納期間近・未出荷',
                orderId: order.orderId,
                lineKey: line.lineKey,
                salesRep: order.salesRep,
                dueDate: line.latestDate,
                daysOver: 0,
                message: diffDays === 0 ? `本日(${line.latestDate})が最長納品予定日ですが未出荷です。` : `最長納品予定日(${line.latestDate})まであと${Math.abs(diffDays)}日です。`,
              });
            }
          }
        }

        // A4: 納期間近・未発注
        if (line.latestDate && line.stage === '未発注') {
          const lDate = new Date(line.latestDate);
          if (!isNaN(lDate.getTime())) {
            const diffDays = Math.floor((lDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 7) {
              alerts.push({
                ruleId: 'A4',
                type: '間近',
                severity: '中',
                ruleName: '納期間近・未発注',
                orderId: order.orderId,
                lineKey: line.lineKey,
                salesRep: order.salesRep,
                dueDate: line.latestDate,
                daysOver: 0,
                message: `最長納品予定日(${line.latestDate})まであと${diffDays}日ですが未発注です。`,
              });
            }
          }
        }

        // B1: 発注漏れ (受注日あり & 3日以上未発注)
        if (order.orderDate && line.stage === '未発注') {
          const oDate = new Date(order.orderDate);
          if (!isNaN(oDate.getTime())) {
            const passDays = Math.floor((today.getTime() - oDate.getTime()) / (1000 * 60 * 60 * 24));
            if (passDays >= 3) {
              alerts.push({
                ruleId: 'B1',
                type: '漏れ',
                severity: '高',
                ruleName: '発注漏れ',
                orderId: order.orderId,
                lineKey: line.lineKey,
                salesRep: order.salesRep,
                dueDate: null,
                daysOver: passDays,
                message: `受注日(${order.orderDate})から${passDays}日経過していますが未発注です。`,
              });
            }
          }
        }

        // B2: 納期未設定
        if (line.stage !== '出荷完了' && !line.latestDate) {
          alerts.push({
            ruleId: 'B2',
            type: '漏れ',
            severity: '高',
            ruleName: '納期未設定',
            orderId: order.orderId,
            lineKey: line.lineKey,
            salesRep: order.salesRep,
            dueDate: null,
            daysOver: 0,
            message: '最短・最長納品予定日が設定されていません。',
          });
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    orders,
    alerts,
    weeklyDelayHistory: [],
  };
}

let cachedOutboundIp = '';
let lastIpFetchTime = 0;

async function getOutboundIp(): Promise<string> {
  const now = Date.now();
  if (cachedOutboundIp && now - lastIpFetchTime < 60000) {
    return cachedOutboundIp;
  }
  // 固定IPなので、一度分かっていれば応答を待たせずに返し、裏で確認し直す
  if (cachedOutboundIp) {
    lastIpFetchTime = now;
    refreshOutboundIp().catch(() => {});
    return cachedOutboundIp;
  }
  return refreshOutboundIp();
}

async function refreshOutboundIp(): Promise<string> {
  const now = Date.now();
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data && data.ip) {
      cachedOutboundIp = data.ip;
      lastIpFetchTime = now;
      return cachedOutboundIp;
    }
  } catch (e) {
    console.warn('[IP Detection] Failed to fetch public IP:', e);
  }
  return cachedOutboundIp || '';
}

// 楽楽販売 API CSVエクスポートヘルパー（最大200件上限を安全に処理、複数ページ取得対応）
async function fetchRakurakuCsv(
  cleanBaseUrl: string,
  token: string,
  dbSchemaId: string,
  searchIdOrMaxPages?: string | number,
  listId?: string | number,
  maxPages = 10
): Promise<{ csv: string; rawResponse?: any }> {
  let searchId: string | undefined;
  let actualListId: string | undefined;
  let pagesToFetch = maxPages;

  if (typeof searchIdOrMaxPages === 'number') {
    pagesToFetch = searchIdOrMaxPages;
    searchId = undefined;
    actualListId = undefined;
  } else {
    searchId = searchIdOrMaxPages ? searchIdOrMaxPages.toString() : undefined;
    actualListId = listId ? listId.toString() : undefined;
  }

  let combinedCsv = '';
  const apiUrl = `${cleanBaseUrl}/api/csvexport/version/v1`;

  for (let page = 0; page < pagesToFetch; page++) {
    // 楽楽販売の実行回数制限に当たらないよう、ページごとに間隔をあける
    if (page > 0) await new Promise((r) => setTimeout(r, 3000));
    const offset = page * 200;
    const reqBody: any = {
      dbSchemaId: dbSchemaId.toString(),
      viewId: '0',
      limit: 200,
      offset,
    };
    if (searchId) reqBody.searchId = searchId.toString();
    if (actualListId) reqBody.listId = actualListId.toString();

    // 通信が一時的に切れたとき（fetch failed など）は、同じページを最大2回まで取り直す
    let response: Response | null = null;
    let responseText = '';
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-HD-apitoken': token.trim(),
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(60000),
        });
        responseText = await response.text();
        break;
      } catch (netErr: any) {
        if (attempt >= 2) throw netErr;
        console.warn(`[Rakuraku Fetch] network error on ${dbSchemaId} page ${page}, retrying:`, netErr?.message || netErr);
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
    let responseJson: any = null;
    try { responseJson = JSON.parse(responseText); } catch {}

    // 途中のページで失敗した場合も例外にする（一部だけ取れたCSVを成功として返さない）
    if (!response.ok || (responseJson && responseJson.status === 'error')) {
      throw { status: response.status || 400, json: responseJson, text: responseText, page };
    }

    if (!responseJson && responseText.includes(',')) {
      const lines = responseText.split('\n').filter(l => l.trim().length > 0);
      const firstNewline = responseText.indexOf('\n');
      if (page === 0) {
        combinedCsv += responseText;
      } else if (firstNewline !== -1) {
        const rowsOnly = responseText.slice(firstNewline + 1);
        if (rowsOnly.trim().length > 0) {
          combinedCsv += '\n' + rowsOnly;
        } else {
          break;
        }
      } else {
        break;
      }
      // もし取得行数が200行未満（ヘッダー除く）ならこれが最後のページ
      const dataRowsCount = page === 0 ? lines.length - 1 : lines.length;
      if (dataRowsCount < 200) {
        return { csv: combinedCsv };
      }
      if (page === pagesToFetch - 1) {
        // ページ上限に達してもまだ続きがある＝全件を取り切れていない
        throw { message: `取得ページ上限(${pagesToFetch}ページ)に達しました（dbSchemaId: ${dbSchemaId}）`, page };
      }
    } else {
      if (page === 0) return { csv: '', rawResponse: responseJson };
      break;
    }
  }

  return { csv: combinedCsv };
}

// ----------------------------------------------------------------------
// サーバー側 楽楽販売 集約キャッシュストア & レート制限対策
// ----------------------------------------------------------------------
interface RakurakuServerStore {
  orders: any | null;
  shipments: any[] | null;
  suppliers: any[] | null;
  products: any[] | null;
  clinics: any[] | null;
  lastSuccessTime: string | null;
  lastAttemptTime: string | null;
  lastMastersTime: number | null;
  lastManualSyncTime: number;
  isFetching: boolean;
  rateLimitBackoffMs: number;
  rateLimitUntil: number | null;
  refreshIntervalMinutes: number;
  sourceHeaders: Record<string, string[]>;
  lastFullSyncTime: number | null;
  masterStatus: Record<string, { ok: boolean; count: number; error?: string; at: string }>;
  // 日ごとの納期超過伝票数（遅延の推移グラフ用。日本時間の日付ごとに最新の値）
  delayHistory: Record<string, number>;
  lastError: {
    type: 'rate_limit' | 'ip_blocked' | 'auth_error' | 'network_error';
    message: string;
    errorCode?: string | number;
    timestamp: string;
  } | null;
}

const serverRakurakuStore: RakurakuServerStore = {
  orders: null,
  shipments: null,
  suppliers: null,
  products: null,
  clinics: null,
  lastSuccessTime: null,
  lastAttemptTime: null,
  lastMastersTime: null,
  lastManualSyncTime: 0,
  isFetching: false,
  rateLimitBackoffMs: 5 * 60 * 1000, // 初回 5分
  rateLimitUntil: null,
  refreshIntervalMinutes: 15, // 15分おき自動同期
  sourceHeaders: {},
  lastFullSyncTime: null,
  masterStatus: {},
  delayHistory: {},
  lastError: null,
};

// 楽楽販売「納期：①超過」と同じ条件で伝票数を数える（画面側 delayCalculation と同じ判定）
function countOverdueOrders(orders: any[]): number {
  const jstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const excluded = ['見積作成中', '見積済み', '出荷済み'];
  return orders.filter((o) => {
    if (excluded.includes((o.status || '').trim())) return false;
    return (o.overdueBasis || []).some((b: any) => {
      if (b.warehouseShippedDate || b.shippedDate || !b.latestDate) return false;
      const d = String(b.latestDate).replace(/\//g, '-').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < jstToday;
    });
  }).length;
}

// 出荷管理の「倉庫出荷日」を、受注ID＋商品IDでご注文管理の明細に付ける。
// 納期超過・遵守率は「倉庫出荷日」があればそれを、なければ楽楽販売の「出荷日」を使う。
function applyWarehouseShipDates() {
  const orders = serverRakurakuStore.orders?.orders;
  const shipments = serverRakurakuStore.shipments;
  if (!orders || !shipments) return;
  const byLine = new Map<string, string>();
  shipments.forEach((sh: any) => {
    const date = sh.warehouseShippedDate;
    if (!date || date === '—') return;
    (sh.lineRefs || []).forEach((ref: any) => {
      const key = `${ref.orderId}|${ref.productId}`;
      const prev = byLine.get(key);
      if (!prev || date.replace(/\//g, '-') < prev.replace(/\//g, '-')) byLine.set(key, date);
    });
  });
  orders.forEach((o: any) => {
    o.lines.forEach((l: any) => {
      l.warehouseShippedDate = byLine.get(`${o.orderId}|${l.productId}`) || null;
    });
    (o.overdueBasis || []).forEach((b: any) => {
      b.warehouseShippedDate = b.productId ? byLine.get(`${o.orderId}|${b.productId}`) || null : null;
    });
  });
}

// 出荷のクリニック名：受注IDからご注文管理の名前、受注に紐づかない出荷（一括発注の店舗ごとの出荷など）は
// 顧客ID から顧客マスタの名前を使う
function shipmentCustomerResolver(): (s: any) => string {
  const byOrder = new Map<string, string>();
  (serverRakurakuStore.orders?.orders || []).forEach((o: any) => byOrder.set(o.orderId, o.customerName));
  const byClinicId = new Map<string, string>();
  (serverRakurakuStore.clinics || []).forEach((c: any) => c.clinicId && byClinicId.set(c.clinicId, c.clinicName));
  return (s: any) => {
    if (s.customerName && s.customerName !== '—') return s.customerName;
    return byOrder.get(s.orderId) || (s.customerId ? byClinicId.get(s.customerId) : '') || '';
  };
}

function recordDelayHistory() {
  const orders = serverRakurakuStore.orders?.orders;
  if (!orders) return;
  const jstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  serverRakurakuStore.delayHistory[jstToday] = countOverdueOrders(orders);
}

// 週ごと（各週の最後に記録した日の値）に直して、直近12週を返す
function weeklyDelayHistory(): { weekEnd: string; delayed: number }[] {
  const byWeek = new Map<string, { date: string; delayed: number }>();
  Object.entries(serverRakurakuStore.delayHistory)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, delayed]) => {
      const d = new Date(date + 'T00:00:00Z');
      const sunday = new Date(d.getTime() + (6 - d.getUTCDay()) * 86400000).toISOString().slice(0, 10);
      byWeek.set(sunday, { date, delayed });
    });
  return Array.from(byWeek.values())
    .slice(-12)
    .map((v) => ({ weekEnd: v.date, delayed: v.delayed }));
}

function recordMasterStatus(schemaId: string, count: number, err?: any) {
  serverRakurakuStore.masterStatus[schemaId] = {
    ok: !err && count > 0,
    count,
    error: err ? parseRakurakuError(err).message + (err?.message ? `（${err.message}）` : '') : count === 0 ? '0件でした（一覧画面の表示設定・項目名を確認してください）' : undefined,
    at: new Date().toISOString(),
  };
}

// 差分取得用の楽楽販売の絞込みID（「更新日時が直近2日以内」などの絞込みを楽楽販売で作って設定する）
const RECENT_ORDERS_SEARCH_ID = process.env.RAKURAKU_ORDERS_RECENT_SEARCH_ID || '';
const RECENT_SHIPMENTS_SEARCH_ID = process.env.RAKURAKU_SHIPMENTS_RECENT_SEARCH_ID || '';

// 自動同期の間隔：平日8〜20時（日本時間）は設定値（既定15分）、それ以外は60分
function currentSyncIntervalMinutes(): number {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hour = jst.getUTCHours();
  const day = jst.getUTCDay();
  const businessHours = day >= 1 && day <= 5 && hour >= 8 && hour < 20;
  return businessHours ? serverRakurakuStore.refreshIntervalMinutes : 60;
}

// 楽楽販売から実際に届いた列名を記録する（どの項目が本物のデータかを確認するため）
function recordHeaders(schemaId: string, csv: string) {
  const firstLine = csv.split(/\r?\n/, 1)[0] || '';
  if (firstLine) serverRakurakuStore.sourceHeaders[schemaId] = parseCsv(firstLine)[0] || [];
}

function parseRakurakuError(err: any): { type: 'rate_limit' | 'ip_blocked' | 'auth_error' | 'network_error'; message: string; errorCode: string } {
  const code = String(err?.json?.errors?.code || err?.errorCode || err?.status || '');
  const rawMsg = String(err?.json?.errors?.msg || err?.message || err?.text || '');

  if (rawMsg.includes('制限を超えました') || rawMsg.includes('上限') || rawMsg.includes('回数') || err?.status === 429) {
    return {
      type: 'rate_limit',
      message: 'APIの実行回数が制限を超えました。サーバー保存データを表示中',
      errorCode: code || 'LIMIT_EXCEEDED',
    };
  }
  if (code === '7' || rawMsg.includes('アクセスが拒否') || rawMsg.includes('IP') || err?.status === 403) {
    return {
      type: 'ip_blocked',
      message: 'IPアクセス制限により通信が拒否されました（エラーコード7: アクセスが拒否されました）',
      errorCode: '7',
    };
  }
  if (code === '1' || code === '2' || rawMsg.includes('認証') || rawMsg.includes('トークン') || rawMsg.includes('token') || err?.status === 401) {
    return {
      type: 'auth_error',
      message: 'API認証エラーが発生しました。トークンや設定を確認してください',
      errorCode: code || 'AUTH_ERR',
    };
  }
  return {
    type: 'network_error',
    message: rawMsg || '楽楽販売APIとの通信エラーが発生しました',
    errorCode: code || 'COMM_ERR',
  };
}

// ----------------------------------------------------------------------
// 保存データの永続化（Cloud Storage）
// RAKURAKU_CACHE_BUCKET が設定されているときだけ動く。再起動・デプロイ後も前回の取得結果から再開し、
// 起動のたびに楽楽販売から全件を取り直さないようにする。
// ----------------------------------------------------------------------
const CACHE_BUCKET = process.env.RAKURAKU_CACHE_BUCKET || '';
const CACHE_OBJECT = 'rakuraku-cache.json';

async function saveStoreSnapshot(): Promise<void> {
  if (!CACHE_BUCKET) return;
  try {
    const snapshot = {
      savedAt: new Date().toISOString(),
      orders: serverRakurakuStore.orders,
      shipments: serverRakurakuStore.shipments,
      suppliers: serverRakurakuStore.suppliers,
      products: serverRakurakuStore.products,
      clinics: serverRakurakuStore.clinics,
      lastSuccessTime: serverRakurakuStore.lastSuccessTime,
      lastMastersTime: serverRakurakuStore.lastMastersTime,
      sourceHeaders: serverRakurakuStore.sourceHeaders,
      lastFullSyncTime: serverRakurakuStore.lastFullSyncTime,
      delayHistory: serverRakurakuStore.delayHistory,
    };
    await new Storage().bucket(CACHE_BUCKET).file(CACHE_OBJECT).save(JSON.stringify(snapshot), {
      contentType: 'application/json',
      resumable: false,
    });
  } catch (e: any) {
    console.warn('[Rakuraku Cache] Save failed:', e?.message || e);
  }
}

async function loadStoreSnapshot(): Promise<boolean> {
  if (!CACHE_BUCKET) return false;
  try {
    const [buf] = await new Storage().bucket(CACHE_BUCKET).file(CACHE_OBJECT).download();
    const snap = JSON.parse(buf.toString('utf-8'));
    serverRakurakuStore.orders = snap.orders ?? null;
    serverRakurakuStore.shipments = snap.shipments ?? null;
    serverRakurakuStore.suppliers = snap.suppliers ?? null;
    serverRakurakuStore.products = snap.products ?? null;
    serverRakurakuStore.clinics = snap.clinics ?? null;
    serverRakurakuStore.lastSuccessTime = snap.lastSuccessTime ?? null;
    serverRakurakuStore.lastMastersTime = snap.lastMastersTime ?? null;
    if (snap.sourceHeaders) serverRakurakuStore.sourceHeaders = snap.sourceHeaders;
    serverRakurakuStore.lastFullSyncTime = snap.lastFullSyncTime ?? null;
    serverRakurakuStore.delayHistory = snap.delayHistory ?? {};
    // 次回の自動同期は前回成功時刻から数えて間隔があいたときに行う
    serverRakurakuStore.lastAttemptTime = snap.lastSuccessTime ?? null;
    console.log(`[Rakuraku Cache] Restored snapshot saved at ${snap.savedAt}`);
    return true;
  } catch (e: any) {
    if (e?.code !== 404) console.warn('[Rakuraku Cache] Load failed:', e?.message || e);
    return false;
  }
}

// サーバー側 一括データ取得同期関数
let startupRestoreDone = false;

// 同期が途中で止まったまま（応答が返らない等）になると、以後ずっと「取得中」で更新されなくなる。
// 15分を超えた同期は止まったものとみなし、次の同期を始められるようにする。
const SYNC_STUCK_MS = 15 * 60 * 1000;
let syncGeneration = 0;

async function syncAllRakurakuData(isManual = false): Promise<boolean> {
  if (serverRakurakuStore.isFetching) {
    const startedAt = serverRakurakuStore.lastAttemptTime ? new Date(serverRakurakuStore.lastAttemptTime).getTime() : 0;
    if (Date.now() - startedAt < SYNC_STUCK_MS) return false;
    console.warn(`[Rakuraku Sync] Previous sync started at ${serverRakurakuStore.lastAttemptTime} looks stuck; starting a new one`);
  }
  const myGeneration = ++syncGeneration;
  // 起動直後は保存データの読み込みが終わるまで自動同期しない
  if (!isManual && !startupRestoreDone) return false;

  // バックオフ中ならスキップ
  if (!isManual && serverRakurakuStore.rateLimitUntil && Date.now() < serverRakurakuStore.rateLimitUntil) {
    const retryTime = new Date(serverRakurakuStore.rateLimitUntil).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    console.log(`[Rakuraku Sync] Skipped due to rate-limit backoff until ${retryTime}`);
    return false;
  }

  serverRakurakuStore.isFetching = true;
  serverRakurakuStore.lastAttemptTime = new Date().toISOString();

  const token = process.env.VITE_DATA_KEY || '';
  const baseUrl = (process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/').replace(/\/+$/, '');

  try {
    console.log(`[Rakuraku Sync Start] isManual=${isManual}, baseUrl=${baseUrl}`);

    // マスタ系（商品・クリニック・仕入先）は1日1回（24時間）または手動時のみ取得。
    // 件数が少ないので先に取得する（後ろにあると、出荷・注文の取得が失敗したときに一度も取得されない）
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const needMasters =
      isManual ||
      !serverRakurakuStore.lastMastersTime ||
      Date.now() - serverRakurakuStore.lastMastersTime > ONE_DAY_MS ||
      !serverRakurakuStore.products?.length ||
      !serverRakurakuStore.clinics?.length ||
      !serverRakurakuStore.suppliers?.length;

    if (needMasters) {
      console.log('[Rakuraku Sync] Fetching masters (products, clinics, suppliers)...');
      let mastersOk = true;
      // 仕入先マスタ (101253)
      await new Promise((r) => setTimeout(r, 2000));
      try {
        let resSup = await fetchRakurakuCsv(baseUrl, token, '101253', '103962', '101061', 50);
        recordHeaders('101253', resSup.csv);
        if (transformCsvToSuppliers(resSup.csv).length === 0) {
          // 絞込み(103962)で1件も返らない（見出し行だけ）ときは、絞込みなしで全件を取り直す
          console.warn('[Rakuraku Sync] Suppliers search 103962 returned no CSV:', JSON.stringify(resSup.rawResponse || {}).slice(0, 300));
          await new Promise((r) => setTimeout(r, 2000));
          resSup = await fetchRakurakuCsv(baseUrl, token, '101253', undefined, '101061', 50);
          recordHeaders('101253', resSup.csv);
        }
        const parsedSuppliers = transformCsvToSuppliers(resSup.csv);
        if (parsedSuppliers && parsedSuppliers.length > 0) {
          serverRakurakuStore.suppliers = parsedSuppliers;
        }
        recordMasterStatus('101253', parsedSuppliers?.length || 0);
      } catch (e) {
        console.warn('[Rakuraku Sync] Suppliers master warning:', e);
        mastersOk = false;
        recordMasterStatus('101253', 0, e);
      }

      // 商品マスタ (101252)
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const resProd = await fetchRakurakuCsv(baseUrl, token, '101252', 50);
        recordHeaders('101252', resProd.csv);
        const parsedProducts = transformCsvToProducts(resProd.csv);
        if (parsedProducts && parsedProducts.length > 0) {
          serverRakurakuStore.products = parsedProducts;
        }
        recordMasterStatus('101252', parsedProducts?.length || 0);
      } catch (e) {
        console.warn('[Rakuraku Sync] Products master warning:', e);
        mastersOk = false;
        recordMasterStatus('101252', 0, e);
      }

      // 顧客マスタ (101250)
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const resClinics = await fetchRakurakuCsv(baseUrl, token, '101250', 50);
        recordHeaders('101250', resClinics.csv);
        const parsedClinics = transformCsvToClinics(resClinics.csv);
        if (parsedClinics && parsedClinics.length > 0) {
          serverRakurakuStore.clinics = parsedClinics;
        }
        recordMasterStatus('101250', parsedClinics?.length || 0);
      } catch (e) {
        console.warn('[Rakuraku Sync] Clinics master warning:', e);
        mastersOk = false;
        recordMasterStatus('101250', 0, e);
      }

      // 3つとも取得できたときだけ「本日取得済み」にする（失敗したら次の同期で再試行）
      if (mastersOk) {
        serverRakurakuStore.lastMastersTime = Date.now();
      }
    }

    // 差分取得：楽楽販売に「最近更新されたレコード」の絞込みがあれば、それだけを取得して差し替える。
    // 全件の取り直しは1日1回（初回・手動・前回の全件取得から24時間後）。絞込みが無い間は毎回全件を取る。
    const fullSyncDue =
      isManual ||
      !serverRakurakuStore.orders ||
      !serverRakurakuStore.shipments ||
      !serverRakurakuStore.lastFullSyncTime ||
      Date.now() - serverRakurakuStore.lastFullSyncTime > 24 * 60 * 60 * 1000;
    const useIncremental = !fullSyncDue && !!RECENT_SHIPMENTS_SEARCH_ID && !!RECENT_ORDERS_SEARCH_ID;

    // 1. 出荷管理 (101270)
    try {
      const resShip = await fetchRakurakuCsv(
        baseUrl, token, '101270', useIncremental ? RECENT_SHIPMENTS_SEARCH_ID : '103958', '101059', 50
      );
      recordHeaders('101270', resShip.csv);
      const parsedShipments = transformCsvToShipments(resShip.csv);
      if (useIncremental) {
        const byId = new Map((serverRakurakuStore.shipments || []).map((sh: any) => [sh.shipmentId, sh]));
        parsedShipments.forEach((sh: any) => byId.set(sh.shipmentId, sh));
        serverRakurakuStore.shipments = Array.from(byId.values());
        console.log(`[Rakuraku Sync] Shipments updated (incremental): ${parsedShipments.length}`);
      } else if (parsedShipments && parsedShipments.length > 0) {
        serverRakurakuStore.shipments = parsedShipments;
        console.log(`[Rakuraku Sync] Shipments loaded: ${parsedShipments.length} shipments`);
      }
    } catch (e: any) {
      console.warn('[Rakuraku Sync] Shipments fetch warning:', e?.message || e);
      throw e;
    }

    // データベースアクセス間隔を空ける (2秒ウェイト)
    await new Promise((r) => setTimeout(r, 2000));

    // 2. ご注文管理 (101248)
    try {
      const resOrders = await fetchRakurakuCsv(
        baseUrl, token, '101248', useIncremental ? RECENT_ORDERS_SEARCH_ID : undefined, undefined, 50
      );
      recordHeaders('101248', resOrders.csv);
      if (useIncremental) {
        const changed = parseOrdersFromCsv(resOrders.csv) || [];
        const byId = new Map((serverRakurakuStore.orders?.orders || []).map((o: any) => [o.orderId, o]));
        changed.forEach((o: any) => byId.set(o.orderId, o));
        serverRakurakuStore.orders = finalizeDeliveryData(Array.from(byId.values()));
        console.log(`[Rakuraku Sync] Orders updated (incremental): ${changed.length}`);
      } else {
        const parsedOrders = transformCsvToDeliveryData(resOrders.csv);
        if (parsedOrders) {
          serverRakurakuStore.orders = parsedOrders;
          console.log(`[Rakuraku Sync] Orders loaded: ${parsedOrders.orders?.length || 0} orders`);
        }
      }
    } catch (e: any) {
      console.warn('[Rakuraku Sync] Orders fetch warning:', e?.message || e);
      throw e;
    }
    if (!useIncremental) serverRakurakuStore.lastFullSyncTime = Date.now();
    applyWarehouseShipDates();

    // 成功処理
    serverRakurakuStore.lastSuccessTime = new Date().toISOString();
    serverRakurakuStore.lastError = null;
    serverRakurakuStore.rateLimitUntil = null;
    serverRakurakuStore.rateLimitBackoffMs = 5 * 60 * 1000; // バックオフを初期値にリセット
    console.log(`[Rakuraku Sync Complete] Success at ${serverRakurakuStore.lastSuccessTime}`);
    recordDelayHistory();
    await saveStoreSnapshot();
    return true;
  } catch (err: any) {
    const errorInfo = parseRakurakuError(err);
    if (errorInfo.type === 'rate_limit') {
      serverRakurakuStore.rateLimitUntil = Date.now() + serverRakurakuStore.rateLimitBackoffMs;
      const retryTime = new Date(serverRakurakuStore.rateLimitUntil).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      errorInfo.message = `APIの実行回数が制限を超えました。サーバー保存データを表示中（次回再試行予定: ${retryTime}）`;
      console.warn(`[Rakuraku Rate Limit] Backoff ${serverRakurakuStore.rateLimitBackoffMs / 60000}m until ${retryTime}`);
      // 指数バックオフ（最大60分）
      serverRakurakuStore.rateLimitBackoffMs = Math.min(serverRakurakuStore.rateLimitBackoffMs * 2, 60 * 60 * 1000);
    }
    serverRakurakuStore.lastError = {
      type: errorInfo.type,
      message: errorInfo.message,
      errorCode: errorInfo.errorCode,
      timestamp: new Date().toISOString(),
    };
    console.error(`[Rakuraku Sync Failed] ${errorInfo.type}: ${errorInfo.message}`);
    return false;
  } finally {
    // 止まっていた古い同期があとから終わっても、新しい同期の「取得中」を消さない
    if (myGeneration === syncGeneration) serverRakurakuStore.isFetching = false;
  }
}

// サーバー起動時にバックグラウンドで初回データ取得を実行（数秒遅延して安定起動後に実行）
// 保存データがあれば読み込み、間隔内なら楽楽販売への取得は次の定期同期まで待つ
setTimeout(async () => {
  const restored = await loadStoreSnapshot();
  startupRestoreDone = true;
  const intervalMs = serverRakurakuStore.refreshIntervalMinutes * 60 * 1000;
  const last = serverRakurakuStore.lastSuccessTime ? new Date(serverRakurakuStore.lastSuccessTime).getTime() : 0;
  if (!restored || Date.now() - last >= intervalMs) {
    syncAllRakurakuData(false).catch((err) => console.error('[Initial Sync Err]', err));
  }
}, 3000);

// 自動更新ループ（平日日中は15分おき・設定可能、それ以外は60分おき）
setInterval(() => {
  const intervalMs = currentSyncIntervalMinutes() * 60 * 1000;
  const lastAttempt = serverRakurakuStore.lastAttemptTime ? new Date(serverRakurakuStore.lastAttemptTime).getTime() : 0;
  if (Date.now() - lastAttempt >= intervalMs) {
    syncAllRakurakuData(false).catch((err) => console.error('[Interval Sync Err]', err));
  }
}, 60 * 1000); // 1分ごとにチェック

// 楽楽販売 全統合データ取得API（クライアントのブラウザからはここを呼ぶことでRakuraku API回数を消費しない）
// ----------------------------------------------------------------------
// 画面に送るデータを軽くする（開く速さのため）。画面側（src/api.ts）で空の項目を元の既定値に戻す。
// ・見積の伝票は画面で使わないので送らない
// ・出荷済みの伝票は納期超過の判定に使わないので、判定用の明細（overdueBasis）を送らない
// ・空欄・「—」・null の項目は送らない
// ----------------------------------------------------------------------
const LINE_OPTIONAL_KEYS = ['promisedDate', 'deliveryRisk', 'deliveryCompliance', 'rakurakuMissedOrder', 'warehouseShippedDate', 'trackingNo', 'poDate', 'earliestDate'];
const SHIPMENT_KEEP_KEYS = new Set(['shipmentId', 'orderId', 'trackingNo', 'customerName']);
const isEmptyValue = (v: any) => v === null || v === undefined || v === '' || v === '—' || (Array.isArray(v) && v.length === 0);
let slimCache: { key: string; orders: any; shipments: any } | null = null;

function slimForClient() {
  const key = `${serverRakurakuStore.lastSuccessTime}|${(serverRakurakuStore.orders?.orders || []).length}|${(serverRakurakuStore.shipments || []).length}`;
  if (slimCache && slimCache.key === key) return slimCache;
  const src = serverRakurakuStore.orders;
  const orders = src
    ? {
        ...src,
        weeklyDelayHistory: weeklyDelayHistory(),
        orders: (src.orders || [])
          .filter((o: any) => !String(o.status || '').includes('見積'))
          .map((o: any) => {
            const out: any = {};
            for (const [k, v] of Object.entries(o)) {
              if (k === 'lines' || v === null || v === undefined) continue;
              if (k === 'overdueBasis' && String(o.status || '').trim() === '出荷済み') continue;
              out[k] = v;
            }
            out.lines = (o.lines || []).map((l: any) => {
              const line: any = {};
              for (const [k, v] of Object.entries(l)) {
                if (LINE_OPTIONAL_KEYS.includes(k) && (v === null || v === '')) continue;
                line[k] = v;
              }
              return line;
            });
            return out;
          }),
      }
    : null;
  const shipments = (serverRakurakuStore.shipments || []).map((sh: any) => {
    const out: any = {};
    for (const [k, v] of Object.entries(sh)) {
      if (!SHIPMENT_KEEP_KEYS.has(k) && isEmptyValue(v)) continue;
      out[k] = v;
    }
    return out;
  });
  slimCache = { key, orders, shipments };
  return slimCache;
}

app.get('/api/rakuraku/all-data', async (_req, res) => {
  const currentIp = await getOutboundIp();

  // まだ1回も取得しておらずフェッチ中でなければ、同期を試行
  if (!serverRakurakuStore.orders && !serverRakurakuStore.isFetching && !serverRakurakuStore.rateLimitUntil) {
    syncAllRakurakuData(false).catch(() => {});
  }

  const slim = slimForClient();
  res.json({
    success: true,
    slim: true,
    orders: slim.orders,
    shipments: slim.shipments,
    suppliers: serverRakurakuStore.suppliers,
    products: serverRakurakuStore.products,
    clinics: serverRakurakuStore.clinics,
    lastSuccessTime: serverRakurakuStore.lastSuccessTime,
    lastAttemptTime: serverRakurakuStore.lastAttemptTime,
    isFetching: serverRakurakuStore.isFetching,
    rateLimitUntil: serverRakurakuStore.rateLimitUntil,
    rateLimitRemainingSec: serverRakurakuStore.rateLimitUntil ? Math.max(0, Math.ceil((serverRakurakuStore.rateLimitUntil - Date.now()) / 1000)) : 0,
    refreshIntervalMinutes: serverRakurakuStore.refreshIntervalMinutes,
    sourceHeaders: serverRakurakuStore.sourceHeaders,
    masterStatus: serverRakurakuStore.masterStatus,
    lastError: serverRakurakuStore.lastError,
    serverIp: currentIp,
  });
});

// 手動「再読み込み」API（前回の取得から1分以内は押せない制限）
app.post('/api/rakuraku/sync-now', async (req, res) => {
  const currentIp = await getOutboundIp();
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000; // 1分

  if (now - serverRakurakuStore.lastManualSyncTime < COOLDOWN_MS) {
    const remainingSec = Math.ceil((COOLDOWN_MS - (now - serverRakurakuStore.lastManualSyncTime)) / 1000);
    return res.status(429).json({
      success: false,
      error: `前回の取得から1分以内のため再取得できません。しばらくお待ちください（残り${remainingSec}秒）。`,
      cooldownRemainingSec: remainingSec,
      lastSuccessTime: serverRakurakuStore.lastSuccessTime,
      serverIp: currentIp,
    });
  }

  // バックオフ中かチェック
  if (serverRakurakuStore.rateLimitUntil && now < serverRakurakuStore.rateLimitUntil) {
    const retryTime = new Date(serverRakurakuStore.rateLimitUntil).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return res.status(429).json({
      success: false,
      error: `APIの実行回数が制限を超えました。サーバー保存データを表示中（次回再試行予定: ${retryTime}）`,
      rateLimitUntil: serverRakurakuStore.rateLimitUntil,
      rateLimitRemainingSec: Math.ceil((serverRakurakuStore.rateLimitUntil - now) / 1000),
      lastSuccessTime: serverRakurakuStore.lastSuccessTime,
      serverIp: currentIp,
    });
  }

  serverRakurakuStore.lastManualSyncTime = now;
  const isMasterRequested = Boolean(req.body.includeMasters);
  const syncSuccess = await syncAllRakurakuData(isMasterRequested);

  // 画面は続けて all-data を読み直すので、ここではデータ本体を返さない（約15MBの無駄な転送をなくす）
  return res.json({
    success: syncSuccess,
    lastSuccessTime: serverRakurakuStore.lastSuccessTime,
    lastError: serverRakurakuStore.lastError,
    serverIp: currentIp,
  });
});

// 自動更新間隔設定API
app.post('/api/rakuraku/interval', (req, res) => {
  const minutes = parseInt(req.body.minutes, 10);
  if (!isNaN(minutes) && minutes >= 5 && minutes <= 180) {
    serverRakurakuStore.refreshIntervalMinutes = minutes;
    console.log(`[Rakuraku Sync] Refresh interval changed to ${minutes} minutes`);
    return res.json({ success: true, refreshIntervalMinutes: minutes });
  }
  res.status(400).json({ success: false, error: '5分から180分の間で指定してください' });
});

// サーバー保存データがまだ無いときの共通応答（同期を予約し、直接の取得はしない）
function respondNotYetSynced(schemaId: string, serverIp: string, label = 'データ') {
  if (!serverRakurakuStore.isFetching) {
    syncAllRakurakuData(false).catch(() => {});
  }
  const lastError = serverRakurakuStore.lastError;
  return {
    success: false,
    schemaId,
    error: lastError ? lastError.message : `${label}はサーバーで取得中です。しばらくしてから再読み込みしてください`,
    errorType: lastError?.type,
    errorCode: lastError?.errorCode,
    serverIp,
    pending: true,
  };
}

// 楽楽販売 API 直接連携 プロキシエンドポイント（互換性保持：キャッシュがあれば即返却）
app.post('/api/rakuraku/fetch', async (req, res) => {
  const currentIp = await getOutboundIp();
  const dbSchemaId = (req.body.dbSchemaId || '101248').toString();

  // キャッシュから即時返却（Rakuraku APIへの重複アクセスを完全回避）
  if (dbSchemaId === '101270' && serverRakurakuStore.shipments && serverRakurakuStore.shipments.length > 0) {
    return res.json({
      success: true,
      dataType: 'shipments',
      schemaId: '101270',
      data: serverRakurakuStore.shipments,
      count: serverRakurakuStore.shipments.length,
      serverIp: currentIp,
      cached: true,
    });
  }
  if (dbSchemaId === '101253' && serverRakurakuStore.suppliers && serverRakurakuStore.suppliers.length > 0) {
    return res.json({
      success: true,
      dataType: 'suppliers',
      schemaId: '101253',
      data: serverRakurakuStore.suppliers,
      count: serverRakurakuStore.suppliers.length,
      serverIp: currentIp,
      cached: true,
    });
  }
  if (dbSchemaId === '101248' && serverRakurakuStore.orders) {
    return res.json({
      success: true,
      dataType: 'orders',
      schemaId: '101248',
      data: serverRakurakuStore.orders,
      count: serverRakurakuStore.orders.orders?.length || 0,
      serverIp: currentIp,
      cached: true,
    });
  }

  // 商品・クリニックマスタもサーバー保存データから返す
  if (dbSchemaId === '101252' && serverRakurakuStore.products && serverRakurakuStore.products.length > 0) {
    return res.json({
      success: true,
      dataType: 'products',
      schemaId: '101252',
      data: serverRakurakuStore.products,
      count: serverRakurakuStore.products.length,
      serverIp: currentIp,
      cached: true,
    });
  }
  if (dbSchemaId === '101250' && serverRakurakuStore.clinics && serverRakurakuStore.clinics.length > 0) {
    return res.json({
      success: true,
      dataType: 'clinics',
      schemaId: '101250',
      data: serverRakurakuStore.clinics,
      count: serverRakurakuStore.clinics.length,
      serverIp: currentIp,
      cached: true,
    });
  }

  // 楽楽販売への取得はサーバーの同期処理（syncAllRakurakuData）だけが行う。
  // ここから直接取得すると回数制限のバックオフを素通りしてしまうため、同期を予約して未取得を返す。
  return res.json(respondNotYetSynced(dbSchemaId, currentIp));
});

// 楽楽販売 商品マスタ取得API
app.post('/api/rakuraku/master/products', async (_req, res) => {
  const currentIp = await getOutboundIp();
  const data = serverRakurakuStore.products;
  if (data && data.length > 0) {
    return res.json({
      success: true,
      schemaId: '101252',
      data,
      count: data.length,
      serverIp: currentIp,
      fetchedAt: serverRakurakuStore.lastMastersTime ? new Date(serverRakurakuStore.lastMastersTime).toISOString() : serverRakurakuStore.lastSuccessTime,
      cached: true,
    });
  }
  return res.json(respondNotYetSynced('101252', currentIp, '商品マスタ'));
});

// 楽楽販売 顧客マスタ（クリニックマスタ）取得API
app.post('/api/rakuraku/master/clinics', async (_req, res) => {
  const currentIp = await getOutboundIp();
  const data = serverRakurakuStore.clinics;
  if (data && data.length > 0) {
    return res.json({
      success: true,
      schemaId: '101250',
      data,
      count: data.length,
      serverIp: currentIp,
      fetchedAt: serverRakurakuStore.lastMastersTime ? new Date(serverRakurakuStore.lastMastersTime).toISOString() : serverRakurakuStore.lastSuccessTime,
      cached: true,
    });
  }
  return res.json(respondNotYetSynced('101250', currentIp, 'クリニックマスタ'));
});

// ----------------------------------------------------------------------
// 「◆出荷ステータス」シートと楽楽販売の照合（読み取りのみ。シートにも楽楽販売にも書き込まない）
// ----------------------------------------------------------------------
const SHIPMENT_STATUS_SHEET_ID = process.env.SHIPMENT_STATUS_SHEET_ID || '1woJTJRIRd_fV8rvWtuWQJkHIRD-FxEV50j5WosEguJo';
const SHIPMENT_STATUS_SHEET_RANGE = '出荷ステータス!A:N';
const SHEET_CACHE_MS = 15 * 60 * 1000;
let sheetCache: { values: string[][]; readAt: string } | null = null;

async function readShipmentStatusSheet(force = false): Promise<{ values: string[][]; readAt: string }> {
  if (!force && sheetCache && Date.now() - new Date(sheetCache.readAt).getTime() < SHEET_CACHE_MS) {
    return sheetCache;
  }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const client = await auth.getClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHIPMENT_STATUS_SHEET_ID}/values/${encodeURIComponent(SHIPMENT_STATUS_SHEET_RANGE)}`;
  const res = await client.request<{ values?: string[][] }>({ url });
  sheetCache = { values: res.data.values || [], readAt: new Date().toISOString() };
  return sheetCache;
}

app.get('/api/shipment-sheet/unmatched', async (req, res) => {
  const shipments = serverRakurakuStore.shipments;
  if (!shipments || shipments.length === 0) {
    return res.json({
      success: false,
      pending: true,
      error: '楽楽販売の出荷管理データをまだ取得できていません。取得後に照合します',
      rakurakuLastSuccessTime: serverRakurakuStore.lastSuccessTime,
    });
  }
  try {
    const sheet = await readShipmentStatusSheet(req.query.refresh === '1');
    const sheetRows = parseSheetRows(sheet.values);
    // 出荷管理の一覧にはクリニック名が無いため、受注ID（無ければ顧客ID）から補う
    const customerOf = shipmentCustomerResolver();
    // 照合に使う項目だけにする（全項目を返すと応答が大きくなる）
    const enriched = shipments.map((s: any) => ({
      shipmentId: s.shipmentId,
      orderId: s.orderId,
      customerId: s.customerId,
      customerName: customerOf(s),
      // 複数口：対応メモの追跡番号でも照合する
      trackingNo: [s.trackingNo, ...((s.extraTrackingNos as string[]) || [])].join(' '),
      shippedDate: s.shippedDate,
      shipStatus: s.shipStatus,
      warehouse: s.warehouse,
      warehouseInvoiceNo: s.warehouseInvoiceNo,
      courier: s.courier,
    }));
    const ordersLite = (serverRakurakuStore.orders?.orders || []).map((o: any) => ({
      orderId: o.orderId,
      customerName: o.customerName,
      status: o.status,
    }));
    const result = findUnmatched(sheetRows, enriched, serverRakurakuStore.clinics || [], new Date(), ordersLite);
    return res.json({
      success: true,
      sheetReadAt: sheet.readAt,
      rakurakuLastSuccessTime: serverRakurakuStore.lastSuccessTime,
      clinicsLoaded: (serverRakurakuStore.clinics || []).length > 0,
      ...result,
    });
  } catch (err: any) {
    const status = err?.response?.status || err?.code;
    let message = err?.message || 'シートの読み込みに失敗しました';
    if (status === 403) message = 'シートを読む権限がありません。サービスアカウントへの共有（閲覧者）と Sheets API の有効化を確認してください';
    if (status === 404) message = 'シートまたは「出荷ステータス」タブが見つかりません';
    console.warn('[Shipment Sheet] Read failed:', status, err?.message);
    return res.json({ success: false, error: message, errorStatus: status });
  }
});

// ----------------------------------------------------------------------
// チームで共有するメモ（納期超過の対応状況・クリニックメモ・未照合の対応済みなど）
// 以前は各ブラウザにだけ保存していたため、他の人には見えなかった。Cloud Storage に保存して共有する。
// ----------------------------------------------------------------------
const SHARED_NOTES_OBJECT = 'shared-notes.json';
const SHARED_NOTE_SCOPES = ['overdue_followups', 'overdue_clinic_notes', 'unmatched_done'];
let sharedNotes: Record<string, Record<string, any>> = {};
let sharedNotesLoaded = false;
let sharedNotesLoadedPromise: Promise<void> | null = null;
let sharedNotesSaveTimer: NodeJS.Timeout | null = null;

async function loadSharedNotes() {
  // 同時に呼ばれても読み込みは1回だけにし、全員が読み込み完了を待つ（待たずに進むと空のデータで上書き保存してしまう）
  if (!sharedNotesLoadedPromise) {
    sharedNotesLoaded = true;
    sharedNotesLoadedPromise = (async () => {
      if (!CACHE_BUCKET) return;
      try {
        const [buf] = await new Storage().bucket(CACHE_BUCKET).file(SHARED_NOTES_OBJECT).download();
        sharedNotes = JSON.parse(buf.toString('utf-8')) || {};
      } catch (e: any) {
        if (e?.code !== 404) console.warn('[Shared Notes] Load failed:', e?.message || e);
      }
    })();
  }
  return sharedNotesLoadedPromise;
}

function scheduleSharedNotesSave() {
  if (!CACHE_BUCKET) return;
  if (sharedNotesSaveTimer) clearTimeout(sharedNotesSaveTimer);
  sharedNotesSaveTimer = setTimeout(async () => {
    try {
      await new Storage().bucket(CACHE_BUCKET).file(SHARED_NOTES_OBJECT).save(JSON.stringify(sharedNotes), {
        contentType: 'application/json',
        resumable: false,
      });
    } catch (e: any) {
      console.warn('[Shared Notes] Save failed:', e?.message || e);
    }
  }, 1000);
}

app.get('/api/shared-notes/:scope', async (req, res) => {
  const scope = req.params.scope;
  if (!SHARED_NOTE_SCOPES.includes(scope)) return res.status(404).json({ error: 'unknown scope' });
  await loadSharedNotes();
  return res.json({ scope, notes: sharedNotes[scope] || {} });
});

// 1件ずつ更新する。value が null なら削除。entries を送るとまとめて追加（ブラウザに残っていた分の移行用。既にある値は上書きしない）
app.put('/api/shared-notes/:scope', async (req, res) => {
  const scope = req.params.scope;
  if (!SHARED_NOTE_SCOPES.includes(scope)) return res.status(404).json({ error: 'unknown scope' });
  await loadSharedNotes();
  const bucket = (sharedNotes[scope] = sharedNotes[scope] || {});
  const { key, value, entries } = req.body || {};
  if (entries && typeof entries === 'object') {
    for (const [k, v] of Object.entries(entries)) {
      if (bucket[k] === undefined) bucket[k] = v;
    }
  } else if (typeof key === 'string' && key.length > 0 && key.length < 300) {
    if (value === null) delete bucket[key];
    else bucket[key] = value;
  } else {
    return res.status(400).json({ error: 'key or entries required' });
  }
  scheduleSharedNotesSave();
  return res.json({ scope, notes: bucket });
});

// ----------------------------------------------------------------------
// 毎朝6時の「シート → 楽楽販売」取り込み（2026/10/07 から本番書き込み）
// 差分のある出荷だけを CSVデータインポートAPI（インポート設定 100757）で取り込み、結果を記録する。
// 環境変数 SHEET_IMPORT_WRITE=off で書き込みを止め、試運転だけにできる。
// 結果は Cloud Storage に保存し、画面で「どの出荷のどの項目が何から何に変わったか」を確認する
// ----------------------------------------------------------------------
const SHEET_IMPORT_WRITE_ENABLED = process.env.SHEET_IMPORT_WRITE !== 'off';
// 楽楽販売のインポート設定「シート同期（倉庫出荷日つき）」（11列：出荷ID〜倉庫出荷日）。100754 は倉庫出荷日の無い10列で、全件「項目数が異なります」になっていた
const SHEET_IMPORT_ID = process.env.SHEET_IMPORT_ID || '100757';

function toCsv(columns: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [columns, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

// CSVデータインポートAPIで取り込みを予約し、完了まで待って成功・失敗件数を返す
async function importCsvToRakuraku(
  csv: string,
  importId: string = SHEET_IMPORT_ID,
  fileName = 'shipment_status_import.csv'
): Promise<{ processId: string; succeedCount: number; failureCount: number; status: string }> {
  const token = process.env.VITE_DATA_KEY || '';
  const baseUrl = (process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/').replace(/\/+$/, '');
  const form = new FormData();
  // 「json」はファイルではなく文字の項目として送る（ファイルとして送ると dbSchemaId・importId が空と判定される）
  form.append('json', JSON.stringify({ dbSchemaId: '101270', importId }));
  form.append('uploadFile', new Blob([csv], { type: 'text/csv' }), fileName);
  const res = await fetch(`${baseUrl}/api/csvdataimport/version/v1`, {
    method: 'POST',
    headers: { 'X-HD-apitoken': token.trim() },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !json || json.status === 'error') {
    throw { status: res.status, json, text: text.slice(0, 500) };
  }
  const processId = String(json.processId ?? json.items?.processId ?? json.items?.[0]?.processId ?? '');
  if (!processId) throw { message: `インポートの予約番号が返りませんでした: ${text.slice(0, 300)}` };

  // 状況確認APIで完了を待つ（最大3分）
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    // 一時的な通信エラー（fetch failed）は、取り込み自体は進んでいるので次の確認を待つ
    const chk = await fetch(`${baseUrl}/api/checkcsvimportprocess/version/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-HD-apitoken': token.trim() },
      body: JSON.stringify({ processId }),
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (!chk) continue;
    const cj: any = await chk.json().catch(() => null);
    const item = Array.isArray(cj?.items) ? cj.items[0] : cj?.items || cj;
    const status = String(cj?.processStatus ?? item?.processStatus ?? '');
    if (status === 'complete' || item?.nowCondition === 2 || item?.nowCondition === 3) {
      return {
        processId,
        succeedCount: Number(item?.succeedCount ?? 0),
        failureCount: Number(item?.failureCount ?? 0),
        status: item?.nowCondition === 3 ? '強制終了' : '完了',
      };
    }
  }
  return { processId, succeedCount: 0, failureCount: 0, status: '確認中（3分以内に完了しませんでした）' };
}
// ----------------------------------------------------------------------
// 追跡番号の振り分け：「出荷番号」に入っている番号を、国際便（DHL・FedEx）は「国際追跡番号」、
// 国内配送（佐川・ヤマト・日本郵便の12桁）は「国内追跡番号」に書く（インポート 100758）。
// 出荷番号そのものは変えない。2つの欄のどちらかに既に何か入っている出荷は書き換えない。
// 桁数の合わない番号が混ざっている出荷は自動では振り分けず、一覧で返す。
// ----------------------------------------------------------------------
const TRACKING_SPLIT_IMPORT_ID = process.env.TRACKING_SPLIT_IMPORT_ID || '100758';
const TRACKING_SPLIT_COLUMNS = ['出荷ID', '国際追跡番号', '国内追跡番号'];
let trackingSplitLog: any[] = [];

function planTrackingSplit() {
  const rows: string[][] = [];
  const irregular: { shipmentId: string; trackingNo: string }[] = [];
  const counts = { shipments: 0, alreadyFilled: 0, noNumber: 0, irregular: 0, international: 0, domestic: 0, both: 0 };
  const seen = new Set<string>();
  for (const s of serverRakurakuStore.shipments || []) {
    if (!s.shipmentId || seen.has(s.shipmentId)) continue;
    seen.add(s.shipmentId);
    counts.shipments++;
    if (String(s.internationalTrackingNo || '').trim() || String(s.domesticTrackingNo || '').trim()) {
      counts.alreadyFilled++;
      continue;
    }
    const raw = String(s.trackingNo || '').trim();
    const nums = parseTrackingNumbers(raw);
    if (nums.length === 0) {
      counts.noNumber++;
      continue;
    }
    if (nums.some((d) => classifyNumber(d).invalid)) {
      counts.irregular++;
      irregular.push({ shipmentId: s.shipmentId, trackingNo: raw });
      continue;
    }
    const domestic = nums.filter((d) => classifyNumber(d).domesticCandidate);
    const intl = nums.filter((d) => !classifyNumber(d).domesticCandidate);
    // 番号と区切りだけの欄は、書き方（ハイフンなど）をそのまま使う。説明文が混ざっていれば番号だけにする
    const cleanRaw = /^[\d\s\-‐－、,，/／・]+$/.test(raw);
    const value = (list: string[], onlyKind: boolean) => (list.length === 0 ? '' : onlyKind && cleanRaw ? raw : list.join(' '));
    const intlVal = value(intl, domestic.length === 0);
    const domVal = value(domestic, intl.length === 0);
    if (intlVal && domVal) counts.both++;
    else if (intlVal) counts.international++;
    else counts.domestic++;
    rows.push([s.shipmentId, intlVal, domVal]);
  }
  return { rows, irregular, counts };
}

// 振り分けの予定（書き込みはしない）
app.get('/api/rakuraku/split-tracking', (_req, res) => {
  const { rows, irregular, counts } = planTrackingSplit();
  return res.json({ counts, toWrite: rows.length, sample: rows.slice(0, 20), irregular, log: trackingSplitLog.slice(0, 10) });
});

// 振り分けを楽楽販売に書き込む（limit で件数を絞れる。ids で出荷IDを指定もできる）
app.post('/api/rakuraku/split-tracking', async (req, res) => {
  let { rows } = planTrackingSplit();
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length > 0) rows = rows.filter((r) => ids.includes(r[0]));
  const limit = Number(req.body?.limit) || 0;
  if (limit > 0) rows = rows.slice(0, limit);
  if (rows.length === 0) return res.json({ success: true, rows: 0, results: [] });
  const results: any[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    try {
      const r = await importCsvToRakuraku(toCsv(TRACKING_SPLIT_COLUMNS, chunk), TRACKING_SPLIT_IMPORT_ID, 'tracking_split_import.csv');
      results.push({ rows: chunk.length, ...r, firstId: chunk[0][0], lastId: chunk[chunk.length - 1][0] });
      if (r.failureCount === 0) {
        // 次の同期を待たずに、書いた出荷は「入力済み」として扱う（同じ出荷を二重に送らない）
        const byId = new Map(chunk.map((c) => [c[0], c]));
        for (const s of serverRakurakuStore.shipments || []) {
          const c = byId.get(s.shipmentId);
          if (c) {
            s.internationalTrackingNo = c[1];
            s.domesticTrackingNo = c[2];
          }
        }
      }
    } catch (e: any) {
      results.push({ rows: chunk.length, error: e?.message || JSON.stringify(e?.json || e).slice(0, 300) });
      break;
    }
  }
  trackingSplitLog.unshift({ at: new Date().toISOString(), rows: rows.length, results });
  trackingSplitLog = trackingSplitLog.slice(0, 20);
  console.log('[Tracking Split]', JSON.stringify(trackingSplitLog[0]));
  return res.json({ success: results.every((r) => !r.error && !r.failureCount), rows: rows.length, results, sample: rows.slice(0, 10) });
});

// 取り込みの結果を楽楽販売にそのまま問い合わせる（読み取りのみ。失敗した行の理由を調べるため）
app.get('/api/rakuraku/import-status/:processId', async (req, res) => {
  const processId = String(req.params.processId || '').replace(/\D/g, '');
  if (!processId) return res.status(400).json({ error: 'processId が必要です' });
  const token = process.env.VITE_DATA_KEY || '';
  const baseUrl = (process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/').replace(/\/+$/, '');
  try {
    const chk = await fetch(`${baseUrl}/api/checkcsvimportprocess/version/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-HD-apitoken': token.trim() },
      body: JSON.stringify({ processId }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await chk.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return res.json({ status: chk.status, json, text: json ? undefined : text.slice(0, 3000) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

const IMPORT_PREVIEW_OBJECT = 'sheet-import-preview.json';
let importPreviewState: { latest: any | null; history: any[] } = { latest: null, history: [] };
let importPreviewLoaded = false;
let importPreviewLoadedPromise: Promise<void> | null = null;
let importRunning = false;

async function loadImportPreview() {
  // 同時に呼ばれても読み込みは1回だけにし、全員が読み込み完了を待つ（待たずに進むと空のデータで上書き保存してしまう）
  if (!importPreviewLoadedPromise) {
    importPreviewLoaded = true;
    importPreviewLoadedPromise = (async () => {
      if (!CACHE_BUCKET) return;
      try {
        const [buf] = await new Storage().bucket(CACHE_BUCKET).file(IMPORT_PREVIEW_OBJECT).download();
        importPreviewState = JSON.parse(buf.toString('utf-8'));
      } catch (e: any) {
        if (e?.code !== 404) console.warn('[Sheet Import] Load failed:', e?.message || e);
      }
    })();
  }
  return importPreviewLoadedPromise;
}

async function runSheetImportDryRun(trigger: 'schedule' | 'manual', write = false) {
  if (importRunning) return importPreviewState.latest;
  importRunning = true;
  try {
    await loadImportPreview();
    const shipments = serverRakurakuStore.shipments || [];
    if (shipments.length === 0) throw new Error('楽楽販売の出荷管理データをまだ取得できていません');
    const customerOf = shipmentCustomerResolver();
    const sheet = await readShipmentStatusSheet(true);
    const preview = buildImportPreview(
      sheet.values,
      shipments.map((sh: any) => ({ ...sh, customerName: customerOf(sh) }))
    );
    let writeResult: any = null;
    let failedCount = 0;
    if (write && SHEET_IMPORT_WRITE_ENABLED && preview.csvRows.length > 0) {
      try {
        writeResult = await importCsvToRakuraku(toCsv(preview.csvColumns, preview.csvRows));
        failedCount = writeResult.failureCount;
        // 取り込み結果を画面に反映するため、出荷管理を取り直す
        setTimeout(() => syncAllRakurakuData(false).catch(() => {}), 60 * 1000);
      } catch (err: any) {
        const info = parseRakurakuError(err);
        writeResult = { error: `${info.message}${err?.text ? '：' + String(err.text).slice(0, 200) : ''}` };
        failedCount = preview.csvRows.length;
      }
    }
    const result = {
      ...preview,
      mode: write && SHEET_IMPORT_WRITE_ENABLED ? 'write' : 'dry_run',
      trigger,
      rakurakuDataTime: serverRakurakuStore.lastSuccessTime,
      writeResult,
      failed: failedCount,
    };
    importPreviewState.latest = result;
    importPreviewState.history = [
      {
        runAt: result.runAt,
        trigger,
        targetRows: result.targetRows,
        matchedRows: result.matchedRows,
        unmatchedRows: result.unmatchedRows,
        shipmentsUpdated: result.shipmentsUpdated,
        changes: result.changes.length,
        held: result.held.length,
        mode: result.mode,
        writeResult: result.writeResult,
        failed: result.failed,
      },
      ...importPreviewState.history,
    ].slice(0, 30);
    return result;
  } catch (e: any) {
    const failed = { runAt: new Date().toISOString(), trigger, error: e?.message || String(e), failed: 1 };
    importPreviewState.history = [failed, ...importPreviewState.history].slice(0, 30);
    console.warn('[Sheet Import] Dry run failed:', failed.error);
    return null;
  } finally {
    importRunning = false;
    if (CACHE_BUCKET) {
      new Storage()
        .bucket(CACHE_BUCKET)
        .file(IMPORT_PREVIEW_OBJECT)
        .save(JSON.stringify(importPreviewState), { contentType: 'application/json', resumable: false })
        .catch((e: any) => console.warn('[Sheet Import] Save failed:', e?.message || e));
    }
  }
}

// 日本時間で6時を過ぎていて、その日まだ実行していなければ実行（サーバーは常に1台起動しているため、ここで時刻を見て動かす）
setInterval(async () => {
  try {
    await loadImportPreview();
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = jst.toISOString().slice(0, 10);
    if (jst.getUTCHours() < 6) return;
    const ranToday = importPreviewState.history.some(
      (h: any) => h.trigger === 'schedule' && new Date(new Date(h.runAt).getTime() + 9 * 3600000).toISOString().slice(0, 10) === today
    );
    if (!ranToday) await runSheetImportDryRun('schedule', true);
  } catch {}
}, 5 * 60 * 1000);

app.get('/api/sheet-import/preview', async (_req, res) => {
  await loadImportPreview();
  return res.json({ success: true, writeEnabled: SHEET_IMPORT_WRITE_ENABLED, ...importPreviewState });
});

// write=1 で楽楽販売に書き込む（画面の「今すぐ取り込む」）。指定がなければ試運転
app.post('/api/sheet-import/run', async (req, res) => {
  const write = req.query.write === '1';
  const result = await runSheetImportDryRun('manual', write);
  return res.json({ success: !!result, writeEnabled: SHEET_IMPORT_WRITE_ENABLED, ...importPreviewState });
});

// 現在のサーバー発信元IP確認API
app.get('/api/server-ip', async (_req, res) => {
  const ip = await getOutboundIp();
  return res.json({ ip, serverIp: ip });
});

app.get('/api/rakuraku/ip', async (_req, res) => {
  const ip = await getOutboundIp();
  return res.json({ ip, serverIp: ip });
});

// 楽楽販売 接続診断API
app.get('/api/rakuraku/diagnose', async (_req, res) => {
  const serverIp = await getOutboundIp();
  const token = process.env.VITE_DATA_KEY || '';
  const baseUrl = process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/';
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const apiUrl = `${cleanBaseUrl}/api/csvexport/version/v1`;

  let apiStatus = 0;
  let apiBody: any = null;
  let rawBodyText = '';
  let errorMsg = '';

  try {
    const testRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-HD-apitoken': token.trim(),
      },
      body: JSON.stringify({
        dbSchemaId: '101248',
        viewId: '0',
        limit: 1,
        offset: 0,
      }),
    });
    apiStatus = testRes.status;
    rawBodyText = await testRes.text();
    try {
      apiBody = JSON.parse(rawBodyText);
    } catch {}
  } catch (err: any) {
    errorMsg = err.message;
  }

  const isIpBlocked = apiStatus === 403 || apiBody?.errors?.code === '7';

  return res.json({
    timestamp: new Date().toISOString(),
    serverIp,
    targetUrl: apiUrl,
    tokenMasked: `${token.slice(0, 6)}...${token.slice(-4)}`,
    httpStatus: apiStatus,
    rakurakuResponse: apiBody || rawBodyText.slice(0, 200),
    isIpBlocked,
    summary: isIpBlocked
      ? '楽楽販売側の「API接続元IP制限（エラーコード7: アクセスが拒否されました）」により通信が遮断されています。'
      : apiStatus === 200
      ? '楽楽販売APIと正常に通信できています。'
      : `楽楽販売APIとの通信でエラーが発生しました (HTTP ${apiStatus})`,
    recommendedAction: isIpBlocked
      ? `楽楽販売の「管理者設定 ＞ セキュリティ設定 ＞ IPアクセス制限に関する設定 ＞ APIのアクセス制限」に当サーバーのIP [${serverIp}] を追加許可してください。または画面上の「CSV取込」機能をご利用ください。`
      : '設定を確認してください。',
  });
});

// 楽楽販売 請求管理（dbSchemaId: 101267）取得API
app.post('/api/rakuraku/master/billing', async (req, res) => {
  const currentIp = await getOutboundIp();
  try {
    const token = req.body.token || process.env.VITE_DATA_KEY || '';
    const baseUrl = req.body.baseUrl || process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/';
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

    const result = await fetchRakurakuCsv(cleanBaseUrl, token, '101267', 10);
    const billingRecords = transformCsvToBilling(result.csv);

    return res.json({
      success: true,
      schemaId: '101267',
      data: billingRecords,
      count: billingRecords.length,
      serverIp: currentIp,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      error: err.json?.errors?.msg || err.message || '請求管理データ取得エラー',
      serverIp: currentIp,
      schemaId: '101267',
    });
  }
});

// 会計システム連携用CSVエクスポートAPI
app.get('/api/rakuraku/accounting/csv', async (_req, res) => {
  try {
    const token = process.env.VITE_DATA_KEY || '';
    const baseUrl = process.env.VITE_RAKURAKU_BASE_URL || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/';
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

    const result = await fetchRakurakuCsv(cleanBaseUrl, token, '101267', 10);
    const billingRecords = transformCsvToBilling(result.csv);

    let csvContent = '\uFEFF請求ID,受注ID,顧客名,請求日,請求金額,請求書番号,入金消込ステータス,入金日,支払期日\n';
    billingRecords.forEach(b => {
      csvContent += `"${b.billingId}","${b.orderId}","${b.customerName}","${b.billingDate}",${b.billingAmount},"${b.invoiceNumber}","${b.paymentStatus}","${b.paymentDate}","${b.paymentDueDate}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="accounting_billing_export.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).send('会計CSVエクスポートエラー: ' + err.message);
  }
});

// 楽楽販売 スキーマ情報一覧API（DBグループ：Number1の7テーブル定義）
app.get('/api/rakuraku/schemas', (_req, res) => {
  res.json({
    dbGroup: 'Number1',
    schemas: [
      { no: 1, dbName: 'ご注文管理', dbSchemaId: '101248', viewId: '0', keyItemId: '109974', keyItemName: '受注ID', itemsCount: 47, detailsCount: 31, totalCount: 78 },
      { no: 2, dbName: '発注管理', dbSchemaId: '101249', viewId: '0', keyItemId: '110019', keyItemName: '発注ID', itemsCount: 16, detailsCount: 15, totalCount: 31 },
      { no: 3, dbName: '出荷管理', dbSchemaId: '101270', viewId: '0', keyItemId: '110187', keyItemName: '出荷ID', itemsCount: 21, detailsCount: 21, totalCount: 42 },
      { no: 4, dbName: '請求管理', dbSchemaId: '101267', viewId: '0', keyItemId: '110137', keyItemName: '請求ID', itemsCount: 18, detailsCount: 5, totalCount: 23 },
      { no: 5, dbName: '顧客マスタ', dbSchemaId: '101250', viewId: '0', keyItemId: '109898', keyItemName: 'クリニックID', itemsCount: 46, detailsCount: 0, totalCount: 46 },
      { no: 6, dbName: '商品マスタ', dbSchemaId: '101252', viewId: '0', keyItemId: '109958', keyItemName: '商品ID', itemsCount: 18, detailsCount: 6, totalCount: 24 },
      { no: 7, dbName: '製造国マスタ', dbSchemaId: '101269', viewId: '0', keyItemId: '110169', keyItemName: '製造国ID', itemsCount: 7, detailsCount: 0, totalCount: 7 },
    ]
  });
});

// ----------------------------------------------------------------------
// 配送会社（FedEx・DHL）の追跡API連携
// 認証情報は環境変数（FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET / FEDEX_ENV / DHL_API_KEY）を優先し、
// 無ければ画面から保存したもの（Cloud Storage の carrier-credentials.json）を使う。
// 画面からの保存には管理用パスコード（環境変数 ADMIN_PASSCODE）が必要。保存した値はブラウザに返さない。
// ----------------------------------------------------------------------
const CARRIER_CRED_OBJECT = 'carrier-credentials.json';
let savedCarrierCreds: CarrierCredentials = {};
let carrierCredsLoaded = false;
let carrierCredsLoadedPromise: Promise<void> | null = null;
let carrierLastTest: Record<string, { ok: boolean; message: string; at: string }> = {};
const carrierCache = new Map<string, CarrierStatus>();
const CARRIER_CACHE_MS = 30 * 60 * 1000;
// DHL は1日の回数が少ないので長めに使い回す。配達完了は変わらないので1日
const carrierCacheMs = (c: CarrierStatus) =>
  c.status === 'delivered' ? 24 * 60 * 60 * 1000 : c.carrier === 'dhl' ? 2 * 60 * 60 * 1000 : CARRIER_CACHE_MS;
// 1回の取得で DHL に新しく問い合わせる件数の上限
const DHL_MAX_PER_REQUEST = 40;
// DHL に1日（日本時間）で問い合わせてよい件数。無料枠（1日250回）より少し余裕を残す
const DHL_DAILY_BUDGET = Number(process.env.DHL_DAILY_BUDGET) || 230;
// 自動取得：日本時間 7〜21時、2時間ごと。1回あたりの上限と、手動用に残しておく件数
const DHL_AUTO_INTERVAL_MS = 2 * 60 * 60 * 1000;
const DHL_AUTO_PER_RUN = 50;
const DHL_MANUAL_RESERVE = 40;
// 配達完了になっていない出荷は、前回の取得から6時間たったら取り直す
const DHL_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

const CARRIER_STATUS_OBJECT = 'carrier-status-cache.json';
const jstDate = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const jstHour = () => new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
let dhlUsage = { date: jstDate(), calls: 0 };
let dhlLastAutoRunAt: string | null = null;
let carrierStatusLoaded = false;
let carrierStatusLoadedPromise: Promise<void> | null = null;
let carrierStatusSaveTimer: NodeJS.Timeout | null = null;

function dhlUsedToday(): number {
  if (dhlUsage.date !== jstDate()) dhlUsage = { date: jstDate(), calls: 0 };
  return dhlUsage.calls;
}
function addDhlUsage(n: number) {
  dhlUsedToday();
  dhlUsage.calls += n;
}

// 取得結果は Cloud Storage に残し、再起動しても配送会社に問い合わせ直さない（回数の節約）
async function loadCarrierStatusCache() {
  // 同時に呼ばれても読み込みは1回だけにし、全員が読み込み完了を待つ（待たずに進むと空のデータで上書き保存してしまう）
  if (!carrierStatusLoadedPromise) {
    carrierStatusLoaded = true;
    carrierStatusLoadedPromise = (async () => {
      if (!CACHE_BUCKET) return;
      try {
        const [buf] = await new Storage().bucket(CACHE_BUCKET).file(CARRIER_STATUS_OBJECT).download();
        const json = JSON.parse(buf.toString('utf-8')) || {};
        (json.statuses || []).forEach((c: CarrierStatus) => carrierCache.set(`${c.carrier}:${c.trackingNo}`, fixLegacyStatus(c)));
        if (json.usage?.date === jstDate()) dhlUsage = json.usage;
        dhlLastAutoRunAt = json.lastAutoRunAt || null;
        carrierWritten = json.written || {};
        carrierWritebackLog = json.writebackLog || [];
        console.log(`[Carriers] Restored ${carrierCache.size} statuses, DHL used today ${dhlUsage.calls}`);
      } catch (e: any) {
        if (e?.code !== 404) console.warn('[Carriers] Status cache load failed:', e?.message || e);
      }
    })();
  }
  return carrierStatusLoadedPromise;
}

// 以前の判定で保存した結果を、今の判定に合わせて直す（取り直さずに済むように）
function fixLegacyStatus(c: CarrierStatus): CarrierStatus {
  const text = String(c.statusText || '').trim();
  if (c.status === 'in_transit' && /^配達完了|^delivered/i.test(text)) {
    return { ...c, status: 'delivered', deliveredAt: c.deliveredAt || c.lastEventAt, customsCleared: true };
  }
  if (c.status === 'in_transit' && /ラベルを作成|label created/i.test(text)) return { ...c, status: 'pre_transit' };
  return c;
}

function scheduleCarrierStatusSave() {
  if (!CACHE_BUCKET || carrierStatusSaveTimer) return;
  carrierStatusSaveTimer = setTimeout(async () => {
    carrierStatusSaveTimer = null;
    // 30日より古い結果は捨てる
    const cutoff = Date.now() - 30 * 86400000;
    const statuses = Array.from(carrierCache.values()).filter((c) => new Date(c.fetchedAt).getTime() > cutoff);
    try {
      await new Storage()
        .bucket(CACHE_BUCKET)
        .file(CARRIER_STATUS_OBJECT)
        .save(JSON.stringify({ statuses, usage: dhlUsage, lastAutoRunAt: dhlLastAutoRunAt, written: carrierWritten, writebackLog: carrierWritebackLog }), {
          contentType: 'application/json',
          resumable: false,
        });
    } catch (e: any) {
      console.warn('[Carriers] Status cache save failed:', e?.message || e);
    }
  }, 5000);
}

// DHL に問い合わせ、結果をキャッシュと使用回数に反映する（手動・自動の共通処理）
async function runDhlLookup(apiKey: string, nos: string[]): Promise<{ got: CarrierStatus[]; error?: string }> {
  if (nos.length === 0) return { got: [] };
  let got: CarrierStatus[] = [];
  let error: string | undefined;
  try {
    got = await trackDhl({ apiKey }, nos);
  } catch (e: any) {
    error = e?.message || String(e);
  }
  addDhlUsage(got.length + (error ? 1 : 0));
  got.forEach((g) => carrierCache.set(`dhl:${g.trackingNo}`, g));
  scheduleCarrierStatusSave();
  return { got, error };
}

async function loadCarrierCreds() {
  // 同時に呼ばれても読み込みは1回だけにし、全員が読み込み完了を待つ（待たずに進むと空のデータで上書き保存してしまう）
  if (!carrierCredsLoadedPromise) {
    carrierCredsLoaded = true;
    carrierCredsLoadedPromise = (async () => {
      if (!CACHE_BUCKET) return;
      try {
        const [buf] = await new Storage().bucket(CACHE_BUCKET).file(CARRIER_CRED_OBJECT).download();
        savedCarrierCreds = JSON.parse(buf.toString('utf-8')) || {};
      } catch (e: any) {
        if (e?.code !== 404) console.warn('[Carriers] Load failed:', e?.message || e);
      }
    })();
  }
  return carrierCredsLoadedPromise;
}

type CredSource = Record<'fedex' | 'dhl' | 'domestic', 'env' | 'saved' | null>;
async function effectiveCarrierCreds(): Promise<{ creds: CarrierCredentials; source: CredSource }> {
  await loadCarrierCreds();
  const creds: CarrierCredentials = {};
  const source: CredSource = { fedex: null, dhl: null, domestic: null };
  if (process.env.FEDEX_CLIENT_ID && process.env.FEDEX_CLIENT_SECRET) {
    creds.fedex = {
      clientId: process.env.FEDEX_CLIENT_ID,
      clientSecret: process.env.FEDEX_CLIENT_SECRET,
      env: process.env.FEDEX_ENV === 'production' ? 'production' : 'sandbox',
    };
    source.fedex = 'env';
  } else if (savedCarrierCreds.fedex?.clientId && savedCarrierCreds.fedex?.clientSecret) {
    creds.fedex = savedCarrierCreds.fedex;
    source.fedex = 'saved';
  }
  if (process.env.DHL_API_KEY) {
    creds.dhl = { apiKey: process.env.DHL_API_KEY };
    source.dhl = 'env';
  } else if (savedCarrierCreds.dhl?.apiKey) {
    creds.dhl = savedCarrierCreds.dhl;
    source.dhl = 'saved';
  }
  // 国内配送（荷物追跡API）：環境変数 TRACKINGAPI_KEY・TRACKINGAPI_SECRET、または画面から保存したもの
  if (process.env.TRACKINGAPI_KEY && process.env.TRACKINGAPI_SECRET) {
    creds.domestic = { apiKey: process.env.TRACKINGAPI_KEY, secretKey: process.env.TRACKINGAPI_SECRET };
    source.domestic = 'env';
  } else if (savedCarrierCreds.domestic?.apiKey && savedCarrierCreds.domestic?.secretKey) {
    creds.domestic = savedCarrierCreds.domestic;
    source.domestic = 'saved';
  }
  domesticEnabled = !!creds.domestic;
  return { creds, source };
}

// 国内配送の照会が使えるか（番号の照会順を決めるのに使う）
let domesticEnabled = false;

const mask = (v?: string) => (v ? `${v.slice(0, 4)}…${v.slice(-2)}` : '');

app.get('/api/carriers/settings', async (_req, res) => {
  const { creds, source } = await effectiveCarrierCreds();
  return res.json({
    fedex: { configured: !!creds.fedex, source: source.fedex, env: creds.fedex?.env, clientIdMasked: mask(creds.fedex?.clientId) },
    dhl: { configured: !!creds.dhl, source: source.dhl, apiKeyMasked: mask(creds.dhl?.apiKey) },
    domestic: { configured: !!creds.domestic, source: source.domestic, apiKeyMasked: mask(creds.domestic?.apiKey), quota: domesticQuota },
    passcodeConfigured: !!process.env.ADMIN_PASSCODE,
    storageConfigured: !!CACHE_BUCKET,
    lastTest: carrierLastTest,
  });
});

app.put('/api/carriers/settings', async (req, res) => {
  if (!process.env.ADMIN_PASSCODE) {
    return res.status(403).json({ error: '管理用パスコード（ADMIN_PASSCODE）がサーバーに設定されていないため保存できません' });
  }
  if (req.get('X-Admin-Passcode') !== process.env.ADMIN_PASSCODE) {
    return res.status(403).json({ error: '管理用パスコードが違います' });
  }
  if (!CACHE_BUCKET) return res.status(500).json({ error: '保存先（Cloud Storage）が設定されていません' });
  await loadCarrierCreds();
  const { fedex, dhl, clear } = req.body || {};
  if (clear === 'fedex') delete savedCarrierCreds.fedex;
  if (clear === 'dhl') delete savedCarrierCreds.dhl;
  if (clear === 'domestic') delete savedCarrierCreds.domestic;
  // 接続先（テスト環境／本番）だけの変更は、キーを入れ直さずにできる
  if (fedex && !fedex.clientId && !fedex.clientSecret && fedex.env && savedCarrierCreds.fedex) {
    savedCarrierCreds.fedex.env = fedex.env === 'production' ? 'production' : 'sandbox';
  }
  if (fedex && fedex.clientId && fedex.clientSecret) {
    savedCarrierCreds.fedex = {
      clientId: String(fedex.clientId).trim(),
      clientSecret: String(fedex.clientSecret).trim(),
      env: fedex.env === 'production' ? 'production' : 'sandbox',
    };
  }
  if (dhl && dhl.apiKey) savedCarrierCreds.dhl = { apiKey: String(dhl.apiKey).trim() };
  const { domestic } = req.body || {};
  if (domestic && domestic.apiKey && domestic.secretKey) {
    savedCarrierCreds.domestic = { apiKey: String(domestic.apiKey).trim(), secretKey: String(domestic.secretKey).trim() };
  }
  try {
    await new Storage().bucket(CACHE_BUCKET).file(CARRIER_CRED_OBJECT).save(JSON.stringify(savedCarrierCreds), {
      contentType: 'application/json',
      resumable: false,
    });
  } catch (e: any) {
    return res.status(500).json({ error: `保存できませんでした: ${e?.message || e}` });
  }
  // 取得済みの状況は本物なので、キーを変えても消さない。新しいキーで FedEx の自動取得をすぐ試す
  carrierLastAutoRunAt = null;
  setTimeout(() => runCarrierAutoRefresh().catch(() => {}), 2000);
  return res.json({ success: true });
});

app.post('/api/carriers/test', async (req, res) => {
  const carrier = req.body?.carrier as CarrierId | 'domestic';
  if (carrier !== 'fedex' && carrier !== 'dhl' && carrier !== 'domestic') return res.status(400).json({ error: 'carrier は fedex・dhl・domestic' });
  const { creds } = await effectiveCarrierCreds();
  try {
    let message: string;
    if (carrier === 'domestic') {
      message = await testDomestic(creds.domestic);
      // テスト用の番号があれば、佐川 → ヤマト → 日本郵便の順に1件だけ照会する
      const no = String(req.body?.trackingNo || '').replace(/\D/g, '');
      if (no) {
        // 各運送会社の応答をそのまま並べる（該当なし・一時エラーなどの区別がつくように）
        const parts: string[] = [];
        for (const c of DOMESTIC_CARRIERS) parts.push(`${carrierName(c)}：${await traceDomesticRaw(creds.domestic!, c, no)}`);
        message += `。${no} → ${parts.join(' ／ ')}`;
      }
    } else {
      message = await testCarrier(carrier, creds, req.body?.trackingNo ? String(req.body.trackingNo) : undefined);
    }
    carrierLastTest[carrier] = { ok: true, message, at: new Date().toISOString() };
  } catch (e: any) {
    carrierLastTest[carrier] = { ok: false, message: e?.message || String(e), at: new Date().toISOString() };
  }
  return res.json(carrierLastTest[carrier]);
});

// ----------------------------------------------------------------------
// 追跡番号の解決：番号の形で照会先を決め、該当なしならもう一方の運送会社にも照会する
// （楽楽販売の「配送業者」は照会先の判定に使わない。食い違いは画面に「配送業者の登録違い」と出す）
// ----------------------------------------------------------------------
type LookupState = 'found' | 'pending' | 'not_found' | 'out_of_scope' | 'invalid';
interface Resolved {
  digits: string;
  state: LookupState;
  carrier?: CarrierId;
  status?: CarrierStatus;
  next?: CarrierId;
}

// 「不明」（見つからない・エラー）は見つかったとみなさない
const isFoundStatus = (c?: CarrierStatus) => !!c && !c.notFound && c.status !== 'unknown';
const cacheGet = (carrier: CarrierId, d: string) => carrierCache.get(`${carrier}:${d}`);
const ageMs = (c?: CarrierStatus) => (c ? Date.now() - new Date(c.fetchedAt).getTime() : Infinity);

// 照会の順番：番号の形で決めた運送会社 → 該当なしならもう一方。
// 国内配送の可能性がある12桁（7・8始まりでない）は、FedEx の次に 佐川 → ヤマト → 日本郵便（荷物追跡API）
// 「国内追跡番号」の欄に入っている番号（FedEx などには照会せず、佐川 → ヤマト → 日本郵便の順に照会する）
let domesticNosSource: any[] | null = null;
let domesticNosSet = new Set<string>();
function isDomesticDesignated(d: string): boolean {
  const list = serverRakurakuStore.shipments;
  if (list !== domesticNosSource) {
    domesticNosSource = list;
    domesticNosSet = new Set((list || []).flatMap((s: any) => (s.domesticTrackingNos as string[]) || []));
  }
  return domesticNosSet.has(d);
}

function chainFor(d: string): CarrierId[] {
  if (domesticEnabled && isDomesticDesignated(d)) return [...DOMESTIC_CARRIERS];
  const cls = classifyNumber(d);
  if (cls.invalid || !cls.primary) return [];
  const chain: CarrierId[] = [cls.primary as CarrierId];
  if (cls.fallback) chain.push(cls.fallback as CarrierId);
  if (cls.domesticCandidate && domesticEnabled) chain.push(...DOMESTIC_CARRIERS);
  return chain;
}

function resolveDigits(d: string): Resolved {
  const chain = chainFor(d);
  if (chain.length === 0) return { digits: d, state: 'invalid' };
  let first: CarrierStatus | undefined;
  for (const carrier of chain) {
    const c = cacheGet(carrier, d);
    if (!c) return { digits: d, state: 'pending', next: carrier };
    if (isFoundStatus(c)) return { digits: d, state: 'found', carrier, status: c };
    first = first || c;
  }
  const cls = classifyNumber(d);
  return { digits: d, state: cls.domesticCandidate ? 'out_of_scope' : 'not_found', carrier: chain[0], status: first };
}

/** 出荷の箱：出荷番号の欄の番号＋対応メモの番号（20桁が FedEx で見つからなければ 10桁＋10桁に分ける） */
function boxesOfShipment(s: any): string[] {
  const base = [...parseTrackingNumbers(s.trackingNo), ...((s.extraTrackingNos as string[]) || [])];
  const out: string[] = [];
  for (const d of base) {
    if (d.length === 20 && cacheGet('fedex', d)?.notFound) {
      [d.slice(0, 10), d.slice(10)].forEach((x) => !out.includes(x) && out.push(x));
      continue;
    }
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

const shipDateOf = (s: any): number | null => {
  const m = String(s.warehouseShippedDate || s.shippedDate || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};

async function lookupCarrier(carrier: CarrierId, nos: string[], creds: CarrierCredentials): Promise<{ got: CarrierStatus[]; error?: string }> {
  if (nos.length === 0) return { got: [] };
  if (DOMESTIC_CARRIERS.includes(carrier)) {
    if (!creds.domestic) return { got: [], error: '荷物追跡API が未設定です' };
    // 無料枠（月3,000件）の残りが少ないときは止める
    if (domesticQuota.remaining !== undefined && domesticQuota.remaining < 100) {
      return { got: [], error: `荷物追跡API の今月の残りが少ないため止めています（残り${domesticQuota.remaining}件）` };
    }
    try {
      const got = await trackDomestic(creds.domestic, carrier, nos);
      got.forEach((g) => carrierCache.set(`${carrier}:${g.trackingNo}`, g));
      scheduleCarrierStatusSave();
      return { got };
    } catch (e: any) {
      return { got: [], error: e?.message || String(e) };
    }
  }
  if (carrier === 'dhl') {
    if (!creds.dhl) return { got: [], error: 'DHL のAPIが未設定です' };
    return runDhlLookup(creds.dhl.apiKey, nos);
  }
  if (!creds.fedex) return { got: [], error: 'FedEx のAPIが未設定です' };
  try {
    const got = await trackFedex(creds.fedex, nos);
    got.forEach((g) => carrierCache.set(`fedex:${g.trackingNo}`, g));
    scheduleCarrierStatusSave();
    return { got };
  } catch (e: any) {
    return { got: [], error: e?.message || String(e) };
  }
}

// 指定した番号を解決するまで照会する（最大3回：主の運送会社 → 該当なしならもう一方）
async function resolveAndLookup(
  digitsList: string[],
  creds: CarrierCredentials,
  opts: { force?: boolean; refreshStale?: (r: Resolved) => boolean; dhlLimit: number }
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  const attempted = new Set<string>();
  let dhlUsedHere = 0;
  for (let round = 0; round < 6; round++) {
    const want: Record<string, string[]> = {};
    for (const d of digitsList) {
      const r = resolveDigits(d);
      let target: CarrierId | undefined;
      if (r.state === 'pending') target = r.next;
      else if (round === 0 && r.carrier && (r.state === 'found' || r.state === 'not_found' || r.state === 'out_of_scope')) {
        // カードの更新ボタン：前回から1分以上たっていれば取り直す
        if (opts.force && ageMs(r.status) > 60 * 1000) target = r.state === 'found' ? r.carrier : chainFor(d)[0];
        else if (opts.refreshStale?.(r)) target = r.state === 'found' ? r.carrier : chainFor(d)[0];
      }
      if (!target || attempted.has(`${target}:${d}`)) continue;
      attempted.add(`${target}:${d}`);
      (want[target] = want[target] || []).push(d);
    }
    want.dhl = want.dhl || [];
    if (Object.values(want).every((l) => l.length === 0)) break;
    // DHL は1日の回数が少ないので、まだ一度も取っていない番号 → 古い順に、上限まで
    const room = Math.max(0, Math.min(opts.dhlLimit - dhlUsedHere, DHL_DAILY_BUDGET - dhlUsedToday()));
    const dhlList = want.dhl.sort((a, b) => ageMs(cacheGet('dhl', b)) - ageMs(cacheGet('dhl', a))).slice(0, room);
    if (want.dhl.length > dhlList.length) {
      errors.dhl =
        room === 0
          ? `DHL は今日の取得回数（${DHL_DAILY_BUDGET}回）または今回の上限に達したため、残り${want.dhl.length}件は次回取得します`
          : `DHL は回数制限があるため${dhlList.length}件だけ取得しました（残り${want.dhl.length - dhlList.length}件は次回）`;
    }
    dhlUsedHere += dhlList.length;
    const jobs = Object.entries(want).map(async ([carrier, list]) => {
      const r = await lookupCarrier(carrier as CarrierId, carrier === 'dhl' ? dhlList : list, creds);
      if (r.error) errors[DOMESTIC_CARRIERS.includes(carrier as CarrierId) ? 'domestic' : carrier] = r.error;
    });
    await Promise.all(jobs);
  }
  return errors;
}

/** 画面に返す1番号ぶんの状況（見つからない・対象外も、理由がわかる形で返す） */
function resolvedStatusForClient(d: string): CarrierStatus | null {
  const r = resolveDigits(d);
  if (r.state === 'found') return { ...r.status!, trackingNo: d, lookup: 'found' } as any;
  if (r.state === 'not_found' || r.state === 'out_of_scope') {
    return {
      carrier: r.carrier!,
      trackingNo: d,
      status: 'unknown',
      statusText:
        r.state === 'out_of_scope'
          ? domesticEnabled
            ? '追跡できない国内配送（佐川・ヤマト・日本郵便のどれにも該当なし）'
            : 'API対象外（国内配送の可能性）'
          : '追跡番号の誤りの可能性（どの運送会社にも該当なし）',
      error: r.status?.error || '該当なし',
      fetchedAt: r.status?.fetchedAt || new Date().toISOString(),
      lookup: r.state,
    } as any;
  }
  return null;
}

// 追跡番号の一覧を受け取り、解決して返す（画面の「最新状況を取得」とカードの更新ボタン）
// 崩れた追跡番号の候補を照合するための読み取り専用の照会（FedEx。最大60件）
app.post('/api/carriers/fedex-details', async (req, res) => {
  const nos: string[] = Array.isArray(req.body?.numbers) ? req.body.numbers.map((n: any) => String(n).replace(/\D/g, '')).filter(Boolean).slice(0, 60) : [];
  const { creds } = await effectiveCarrierCreds();
  if (!creds.fedex) return res.status(400).json({ error: 'FedEx の認証情報が未設定です' });
  try {
    return res.json({ results: await fedexDetails(creds.fedex, nos) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/carriers/track', async (req, res) => {
  const items: { trackingNo: string; courier?: string }[] = Array.isArray(req.body?.items) ? req.body.items.slice(0, 120) : [];
  const force = req.body?.force === true && items.length <= 5;
  const { creds } = await effectiveCarrierCreds();
  await loadCarrierStatusCache();
  const digits = Array.from(new Set(items.flatMap((it) => parseTrackingNumbers(it.trackingNo))));
  const errors = await resolveAndLookup(digits, creds, {
    force,
    refreshStale: (r) => r.state === 'found' && r.status!.status !== 'delivered' && ageMs(r.status) > carrierCacheMs(r.status!),
    dhlLimit: DHL_MAX_PER_REQUEST,
  });
  if (!creds.fedex) errors.fedex = errors.fedex || 'FedEx のAPIが未設定です';
  const results = digits.map(resolvedStatusForClient).filter(Boolean);
  scheduleCarrierStatusSave();
  return res.json({ results, errors, configured: { fedex: !!creds.fedex, dhl: !!creds.dhl } });
});

// サーバーが持っている最新状況（配送会社には問い合わせない。画面を開いたときに使う）
app.get('/api/carriers/statuses', async (_req, res) => {
  await loadCarrierStatusCache();
  const { creds } = await effectiveCarrierCreds();
  const cutoff = Date.now() - 60 * 86400000;
  const digits = new Set<string>();
  for (const s of serverRakurakuStore.shipments || []) {
    const shipped = shipDateOf(s);
    if (shipped && shipped < cutoff) continue;
    boxesOfShipment(s).forEach((d) => digits.add(d));
  }
  return res.json({
    statuses: Array.from(digits).map(resolvedStatusForClient).filter(Boolean),
    dhl: { usedToday: dhlUsedToday(), budget: DHL_DAILY_BUDGET, lastAutoRunAt: carrierLastAutoRunAt, autoEnabled: !!creds.dhl },
    fedex: { lastAutoRunAt: carrierLastAutoRunAt, autoEnabled: !!creds.fedex, lastError: carrierLastErrors.fedex || null },
    domestic: { lastAutoRunAt: carrierLastAutoRunAt, autoEnabled: !!creds.domestic, lastError: carrierLastErrors.domestic || null, quota: domesticQuota },
  });
});

// ----------------------------------------------------------------------
// 追跡のカバー率：直近30日のシートの出荷（まだ配達完了でないもの）のうち、
// 楽楽販売に追跡番号があり配送会社APIで状況が取れている件数と、楽楽販売に追跡番号がない（未照合）件数
// ----------------------------------------------------------------------
app.get('/api/tracking/coverage', async (_req, res) => {
  const shipments = serverRakurakuStore.shipments;
  if (!shipments || shipments.length === 0) return res.json({ success: false, pending: true });
  try {
    await loadCarrierStatusCache();
    const sheet = await readShipmentStatusSheet(false);
    const rows = parseSheetRows(sheet.values).filter((r) => isTargetRow(r, new Date()) && !r.notShipped);
    const known = new Set<string>();
    shipments.forEach((s: any) => boxesOfShipment(s).forEach((d) => known.add(d)));
    let delivered = 0;
    let tracked = 0;
    let notFetched = 0;
    let untracked = 0;
    let noNumber = 0;
    let outOfScope = 0;
    for (const r of rows) {
      const digits = parseTrackingNumbers(r.trackingNo);
      if (digits.length === 0) {
        noNumber++;
        continue;
      }
      const found = digits.map(resolveDigits).filter((x) => x.state === 'found');
      if (found.length > 0 && found.every((x) => x.status!.status === 'delivered')) {
        delivered++;
        continue;
      }
      const inRakuraku = digits.some((d) => known.has(d));
      if (!inRakuraku) untracked++;
      else if (found.length > 0) tracked++;
      // 国内配送・両社とも該当なし・桁数違いは、待っても状況が取れないので別に数える
      else if (digits.map(resolveDigits).every((x) => x.state !== 'pending')) outOfScope++;
      else notFetched++;
    }
    return res.json({
      success: true,
      sheetReadAt: sheet.readAt,
      denominator: tracked + notFetched + outOfScope + untracked,
      tracked,
      notFetched,
      outOfScope,
      untracked,
      delivered,
      noNumber,
    });
  } catch (e: any) {
    return res.json({ success: false, error: e?.message || String(e) });
  }
});

// ----------------------------------------------------------------------
// 朝の納期会議：区分ごとの件数を日ごとに残し、前日比を出す（件数は画面で計算して送ってもらう）
// ----------------------------------------------------------------------
const MEETING_HISTORY_OBJECT = 'meeting-history.json';
let meetingHistory: Record<string, Record<string, number>> = {};
let meetingHistoryLoaded = false;
let meetingHistoryLoadedPromise: Promise<void> | null = null;

async function loadMeetingHistory() {
  // 同時に呼ばれても読み込みは1回だけにし、全員が読み込み完了を待つ（待たずに進むと空のデータで上書き保存してしまう）
  if (!meetingHistoryLoadedPromise) {
    meetingHistoryLoaded = true;
    meetingHistoryLoadedPromise = (async () => {
      if (!CACHE_BUCKET) return;
      try {
        const [buf] = await new Storage().bucket(CACHE_BUCKET).file(MEETING_HISTORY_OBJECT).download();
        meetingHistory = JSON.parse(buf.toString('utf-8')) || {};
      } catch (e: any) {
        if (e?.code !== 404) console.warn('[Meeting] Load failed:', e?.message || e);
      }
    })();
  }
  return meetingHistoryLoadedPromise;
}

function previousMeetingCounts(today: string) {
  const prevDate = Object.keys(meetingHistory).filter((d) => d < today).sort().pop();
  return prevDate ? { date: prevDate, counts: meetingHistory[prevDate] } : null;
}

app.get('/api/meeting/history', async (_req, res) => {
  await loadMeetingHistory();
  const today = jstDate();
  return res.json({ today, todayCounts: meetingHistory[today] || null, previous: previousMeetingCounts(today) });
});

app.post('/api/meeting/counts', async (req, res) => {
  await loadMeetingHistory();
  const counts = req.body?.counts;
  if (!counts || typeof counts !== 'object') return res.status(400).json({ error: 'counts が必要です' });
  const today = jstDate();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) if (typeof v === 'number' && isFinite(v)) clean[k.slice(0, 40)] = v;
  meetingHistory[today] = clean;
  // 90日分だけ残す
  const keep = Object.keys(meetingHistory).sort().slice(-90);
  meetingHistory = Object.fromEntries(keep.map((d) => [d, meetingHistory[d]]));
  if (CACHE_BUCKET) {
    new Storage()
      .bucket(CACHE_BUCKET)
      .file(MEETING_HISTORY_OBJECT)
      .save(JSON.stringify(meetingHistory), { contentType: 'application/json', resumable: false })
      .catch((e) => console.warn('[Meeting] Save failed:', e?.message || e));
  }
  return res.json({ today, previous: previousMeetingCounts(today) });
});


// ----------------------------------------------------------------------
// 配送会社の状況を楽楽販売の出荷管理へ書き戻す（CSVインポート 100756）。
// 列：出荷ID, 現在地, 配達完了日, 通関完了日, キャリア最新ステータス, 最終スキャン日時, 最終スキャン場所, キャリア例外
// 現在地は後戻りさせない。楽楽販売に入っている現在地・配達完了日・通関完了日は、変えないときもその値を送る（空欄で消さない）。
// ----------------------------------------------------------------------
const CARRIER_WRITEBACK_IMPORT_ID = process.env.CARRIER_WRITEBACK_IMPORT_ID || '100756';
const CARRIER_WRITEBACK_COLUMNS = ['出荷ID', '現在地', '配達完了日', '通関完了日', 'キャリア最新ステータス', '最終スキャン日時', '最終スキャン場所', 'キャリア例外'];
const LOCATION_ORDER = ['発注済', 'ベンダー出荷済', 'SG入庫済', '日本向け出荷済', '通関中', '配達完了'];
let carrierWritten: Record<string, string> = {}; // 出荷ID → 前回書き込んだ内容（同じなら送らない）
let carrierWritebackLog: { at: string; rows: number; succeedCount?: number; failureCount?: number; status?: string; error?: string; sample?: string[] }[] = [];
let carrierWritebackRunning = false;
let carrierWritebackRetryAfter = 0;

const jstDateTime = (iso?: string) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const d = new Date(t + 9 * 3600 * 1000).toISOString();
  return `${d.slice(0, 10).replace(/-/g, '/')} ${d.slice(11, 16)}`;
};
const CARRIER_LABEL_JA: Record<string, string> = { delivered: '配達完了', in_transit: '輸送中', exception: '要確認', pre_transit: '集荷前', unknown: '不明' };
const blankValue = (v?: string) => !v || v === '—';
const locationIndex = (v?: string) => LOCATION_ORDER.indexOf(String(v || '').trim());

function carrierExceptionOption(texts: string[]): string {
  if (texts.length === 0) return 'なし';
  const t = texts.join(' ');
  if (/通関|処理保留|clearance|customs|保留/i.test(t)) return '通関保留';
  if (/不在|持ち帰|営業時間外|住所|宛先|address|no one|not available/i.test(t)) return '住所不明・不在';
  if (/返送|返却|return/i.test(t)) return '返送';
  if (/遅延|遅れ|delay/i.test(t)) return '配達遅延';
  return 'その他';
}

function buildCarrierWritebackRows(includeUnchanged = false): string[][] {
  const rows: string[][] = [];
  for (const s of serverRakurakuStore.shipments || []) {
    const boxes = boxesOfShipment(s);
    const found = boxes.map(resolveDigits).filter((r) => r.state === 'found').map((r) => r.status!);
    if (found.length === 0) continue;
    const deliveredN = found.filter((c) => c.status === 'delivered').length;
    const allDelivered = deliveredN === boxes.length;
    const latest = found.slice().sort((a, b) => String(b.lastEventAt || '').localeCompare(String(a.lastEventAt || '')))[0];
    const carrier = carrierName(latest.carrier);
    const isDomestic = DOMESTIC_CARRIERS.includes(latest.carrier);

    // 現在地：全箱配達完了 → 配達完了、日本で通関の記録・日本到着 → 通関中、輸送中 → 日本向け出荷済（後戻りはしない）
    let next = '';
    if (allDelivered) next = '配達完了';
    // 国内配送（佐川・ヤマト・日本郵便）は通関がないので、配達完了以外は現在地を変えない
    else if (isDomestic) next = '';
    else if (found.some((c) => c.arrivedJapan || c.customsCleared || /通関/.test(c.statusText || ''))) next = '通関中';
    else if (found.some((c) => c.status === 'in_transit' || c.status === 'exception')) next = '日本向け出荷済';
    const current = blankValue(s.currentLocation) ? '' : String(s.currentLocation).trim();
    const location = next && locationIndex(next) > locationIndex(current) ? next : current;
    // 現在地が空欄の行は楽楽販売が受け付けないので送らない（集荷前など、まだ動きがない出荷）
    if (!location) continue;

    const deliveredDate = !blankValue(s.deliveredDate)
      ? s.deliveredDate
      : allDelivered
        ? jstDateTime(found.map((c) => c.deliveredAt || c.lastEventAt || '').sort().pop()).slice(0, 10)
        : '';
    const clearedAt = found.map((c) => c.customsClearedAt || '').filter(Boolean).sort().pop();
    const customsDate = !blankValue(s.customsClearedDate) ? s.customsClearedDate : clearedAt ? jstDateTime(clearedAt).slice(0, 10) : '';

    let statusText: string;
    if (boxes.length > 1) {
      statusText = allDelivered
        ? `${carrier}：配達完了（${boxes.length}箱）`
        : deliveredN > 0
          ? `${carrier}：一部配達（${deliveredN}/${boxes.length}箱）`
          : `${carrier}：${CARRIER_LABEL_JA[latest.status]}（${boxes.length}箱）`;
    } else {
      const label = CARRIER_LABEL_JA[latest.status];
      statusText = `${carrier}：${label}${latest.statusText && latest.statusText !== label ? `（${latest.statusText}）` : ''}`;
    }
    // キャリア例外は楽楽販売では選択肢（なし・通関保留・住所不明・不在・配達遅延・返送・その他）。文言をそのまま送ると「選択肢に存在しません」で失敗する
    const exception = carrierExceptionOption(found.filter((c) => c.status === 'exception').map((c) => c.statusText));
    const row = [
      s.shipmentId,
      location,
      deliveredDate,
      customsDate,
      statusText.slice(0, 200),
      jstDateTime(latest.lastEventAt),
      String(latest.lastLocation || '').slice(0, 100),
      exception.slice(0, 200),
    ];
    const key = row.slice(1).join('|');
    if (!includeUnchanged && carrierWritten[s.shipmentId] === key) continue;
    rows.push(row);
  }
  return rows;
}

const SERVER_STARTED_AT = Date.now();
async function runCarrierWriteback(): Promise<{ rows: number; succeedCount?: number; failureCount?: number; error?: string }> {
  if (!CARRIER_WRITEBACK_IMPORT_ID || carrierWritebackRunning) return { rows: 0 };
  // 起動直後（10分）は書き込まない（反映のたびに内容を確認できるように）
  if (Date.now() - SERVER_STARTED_AT < 10 * 60 * 1000) return { rows: 0 };
  // 前回失敗した行があれば、6時間は同じものを送り直さない（20分ごとに全行を送り直さないため）
  if (Date.now() < carrierWritebackRetryAfter) return { rows: 0 };
  if (!serverRakurakuStore.shipments || serverRakurakuStore.shipments.length === 0) return { rows: 0 };
  carrierWritebackRunning = true;
  try {
    let rows = buildCarrierWritebackRows();
    if (rows.length === 0) return { rows: 0 };
    // 初回は確認用に、配達完了の DHL 3件・FedEx 3件だけを送る（楽楽販売で確認してから残りを送る）
    if (Object.keys(carrierWritten).length === 0) {
      const pick = (carrier: string) => rows.filter((r) => r[4].startsWith(`${carrier}：配達完了`)).slice(0, 3);
      const first = [...pick('DHL'), ...pick('FedEx')];
      if (first.length > 0) rows = first;
    }
    let succeed = 0;
    let failure = 0;
    let error: string | undefined;
    const processIds: string[] = [];
    // 1回の取り込みは500行まで
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      try {
        const result = await importCsvToRakuraku(toCsv(CARRIER_WRITEBACK_COLUMNS, chunk), CARRIER_WRITEBACK_IMPORT_ID, 'carrier_status_import.csv');
        succeed += result.succeedCount || 0;
        failure += result.failureCount || 0;
        processIds.push(result.processId);
        if (result.failureCount === 0) chunk.forEach((r) => (carrierWritten[r[0]] = r.slice(1).join('|')));
        else carrierWritebackRetryAfter = Date.now() + 6 * 60 * 60 * 1000;
      } catch (e: any) {
        // 楽楽販売の応答（status・json・text）をそのまま残す
        error = e?.message || (typeof e === 'object' ? JSON.stringify(e).slice(0, 800) : String(e));
        break;
      }
    }
    carrierWritebackLog.unshift({
      at: new Date().toISOString(),
      rows: rows.length,
      succeedCount: succeed,
      failureCount: failure,
      error,
      processIds,
      sample: rows.slice(0, 3).map((r) => r.join(' | ')),
    } as any);
    carrierWritebackLog = carrierWritebackLog.slice(0, 30);
    scheduleCarrierStatusSave();
    console.log(`[Carriers] Write-back: ${rows.length} rows, ok ${succeed}, failed ${failure}${error ? `, error: ${error}` : ''}`);
    return { rows: rows.length, succeedCount: succeed, failureCount: failure, error };
  } finally {
    carrierWritebackRunning = false;
  }
}

app.get('/api/carriers/writeback', async (req, res) => {
  await loadCarrierStatusCache();
  const rows = buildCarrierWritebackRows();
  // ?all=1 で送る予定の全行を返す（失敗する行の調査用）
  if (req.query.all === '1') return res.json({ columns: CARRIER_WRITEBACK_COLUMNS, rows });
  return res.json({
    enabled: !!CARRIER_WRITEBACK_IMPORT_ID,
    importId: CARRIER_WRITEBACK_IMPORT_ID || null,
    columns: CARRIER_WRITEBACK_COLUMNS,
    pendingRows: rows.length,
    sample: rows.slice(0, 10),
    log: carrierWritebackLog,
    writtenCount: Object.keys(carrierWritten).length,
  });
});

// 照会の結果の内訳（報告用）：出荷から30日以内の出荷済みの出荷
app.get('/api/carriers/report', async (_req, res) => {
  await loadCarrierStatusCache();
  const now = Date.now();
  const out = { shipments: 0, tracked: 0, noNumber: 0, mismatch: 0, notFound: 0, outOfScope: 0, invalid: 0, pending: 0 };
  const exceptions: Record<string, number> = {};
  for (const s of serverRakurakuStore.shipments || []) {
    if (!String(s.shipStatus || '').includes('出荷済')) continue;
    const shipped = shipDateOf(s);
    if (!shipped || now - shipped > CARRIER_TRACK_DAYS * 86400000) continue;
    out.shipments++;
    const boxes = boxesOfShipment(s);
    if (boxes.length === 0) {
      out.noNumber++;
      continue;
    }
    const rs = boxes.map(resolveDigits);
    const found = rs.filter((r) => r.state === 'found');
    if (found.length > 0) {
      out.tracked++;
      const hint = hintedCarrier(s.courier);
      if (hint && found.some((r) => r.carrier !== hint)) out.mismatch++;
      found.forEach((r) => {
        if (r.status!.status === 'exception') exceptions[r.status!.statusText || '不明'] = (exceptions[r.status!.statusText || '不明'] || 0) + 1;
      });
    } else if (rs.some((r) => r.state === 'pending')) out.pending++;
    else if (rs.some((r) => r.state === 'not_found')) out.notFound++;
    else if (rs.some((r) => r.state === 'out_of_scope')) out.outOfScope++;
    else out.invalid++;
  }
  return res.json({ ...out, exceptions, dhlUsedToday: dhlUsedToday(), lastAutoRunAt: carrierLastAutoRunAt, writeback: carrierWritebackLog.slice(0, 5) });
});

// ----------------------------------------------------------------------
// 自動取得：日本時間 7〜21時、2時間ごと。出荷から21日以内の出荷済みの箱を解決し、
// 配達完了でないものは DHL 6時間・FedEx 2時間たったら取り直す。新しい出荷（7日以内）で該当なしの番号は12時間後に取り直す。
// 取得のあと、楽楽販売へ書き戻す。
// ----------------------------------------------------------------------
// 自動取得と報告の対象：出荷から30日以内（ダッシュボードのカバー率と同じ範囲）
const CARRIER_TRACK_DAYS = 30;
let carrierLastAutoRunAt: string | null = null;
let carrierLastErrors: Record<string, string> = {};
let carrierAutoRunning = false;

async function runCarrierAutoRefresh(force = false) {
  if (carrierAutoRunning) return;
  const { creds } = await effectiveCarrierCreds();
  if (!creds.dhl && !creds.fedex) return;
  if (!serverRakurakuStore.shipments || serverRakurakuStore.shipments.length === 0) return;
  await loadCarrierStatusCache();
  const hour = jstHour();
  if (!force && (hour < 7 || hour > 21)) return;
  if (!force && carrierLastAutoRunAt && Date.now() - new Date(carrierLastAutoRunAt).getTime() < DHL_AUTO_INTERVAL_MS) return;
  carrierAutoRunning = true;
  try {
    const now = Date.now();
    const recent = new Set<string>();
    const digits: string[] = [];
    for (const s of serverRakurakuStore.shipments) {
      if (!String(s.shipStatus || '').includes('出荷済')) continue;
      const shipped = shipDateOf(s);
      if (!shipped || now - shipped > CARRIER_TRACK_DAYS * 86400000) continue;
      boxesOfShipment(s).forEach((d) => {
        if (!digits.includes(d)) digits.push(d);
        if (now - shipped <= 7 * 86400000) recent.add(d);
      });
    }
    carrierLastAutoRunAt = new Date().toISOString();
    carrierLastErrors = await resolveAndLookup(digits, creds, {
      refreshStale: (r) => {
        if (r.state === 'found') {
          // 以前の形式で保存した FedEx の結果（通関完了日時などがない）は一度だけ取り直す
          if (r.carrier === 'fedex' && r.status!.domestic === undefined) return true;
          if (r.status!.status === 'delivered') return false;
          // 国内配送は無料枠（月3,000件）を守るため12時間ごと
          const every = r.carrier === 'dhl' ? DHL_REFRESH_AFTER_MS : DOMESTIC_CARRIERS.includes(r.carrier!) ? 12 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
          return ageMs(r.status) > every;
        }
        // 作ったばかりの送り状は、まだ運送会社に登録されていないことがある
        return recent.has(r.digits) && ageMs(r.status) > 12 * 60 * 60 * 1000;
      },
      dhlLimit: Math.max(0, DHL_DAILY_BUDGET - DHL_MANUAL_RESERVE - dhlUsedToday()),
    });
    scheduleCarrierStatusSave();
    console.log(`[Carriers] Auto refresh done: ${digits.length} numbers, DHL used today ${dhlUsedToday()}`, carrierLastErrors);
    await runCarrierWriteback();
  } finally {
    carrierAutoRunning = false;
  }
}

setInterval(() => {
  runCarrierAutoRefresh()
    .catch((e) => console.warn('[Carriers] Auto refresh failed:', e?.message || e))
    // 手動の取得（カードの更新ボタンなど）で変わった分も、20分ごとに書き戻す
    .then(() => runCarrierWriteback())
    .catch((e) => console.warn('[Carriers] Write-back failed:', e?.message || e));
}, 20 * 60 * 1000);
// 起動して楽楽販売のデータがそろったころに1回目
setTimeout(() => {
  runCarrierAutoRefresh().catch((e) => console.warn('[Carriers] Auto refresh failed:', e?.message || e));
}, 3 * 60 * 1000);
// 書き戻しの1回目は、起動から11分後（10分は内容を確認できるよう書き込まない）
setTimeout(() => {
  runCarrierWriteback().catch((e) => console.warn('[Carriers] Write-back failed:', e?.message || e));
}, 11 * 60 * 1000);

async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexPath = path.resolve(distPath, 'index.html');
  const hasDist = fs.existsSync(distIndexPath);
  const isProduction = process.env.NODE_ENV === 'production' && hasDist;

  if (isProduction) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Production Server is running at http://0.0.0.0:${PORT}`);
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev Server is running at http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
