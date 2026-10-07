// 「◆出荷ステータス」シートと楽楽販売の出荷管理（101270）の照合
// シートは読み取りのみ。楽楽販売への書き込みも行わない。

export interface SheetShipmentRow {
  rowNumber: number;      // シート上の行番号（1始まり）
  origin: string;         // A列: 出荷元
  shipDate: string;       // B列: 出荷日（YYYY/MM/DD）
  courier: string;        // C列: クーリエ
  invoiceNo: string;      // D列: INVOICE NO.
  clinicName: string;     // E列: クリニック名
  trackingNo: string;     // F列: 追跡番号
  notShipped: boolean;    // I列: 未出荷
  memo: string;           // N列: メモ（配達完了など）
}

export interface ShipmentLike {
  shipmentId: string;
  orderId: string;
  customerName: string;
  trackingNo: string;
  shippedDate: string;
  shipStatus?: string;
  warehouse?: string;
  warehouseInvoiceNo?: string;
}

export interface ClinicLike {
  clinicName: string;
  clinicNameEn?: string;
}

export type CandidateKind = 'single' | 'multiple' | 'none';
export type CandidateReason = 'インボイス番号が一致' | '出荷待ち' | '出荷日が近い';

function normalizeInvoice(value?: string): string {
  const v = (value || '').normalize('NFKC').toUpperCase().replace(/[\s\-_/]/g, '');
  return v === '—' ? '' : v;
}

export interface UnmatchedRow extends SheetShipmentRow {
  candidates: (ShipmentLike & { reason: CandidateReason })[];
  kind: CandidateKind;
  matchedClinicNames: string[];
  bulkGroupKey: string | null;
}

const EXCLUDED_MEMO_WORDS = ['配達完了', 'キャンセル', '荷送人へ返送', '返却'];
const TARGET_DAYS = 30;
const NEAR_SHIP_DAYS = 7;
const BULK_MIN_ROWS = 3;

/** シートの値の配列（1行目は見出し）を行データにする */
export function parseSheetRows(values: string[][]): SheetShipmentRow[] {
  const rows: SheetShipmentRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const cell = (idx: number) => String(r[idx] ?? '').trim();
    if (!cell(1) && !cell(4) && !cell(5)) continue;
    rows.push({
      rowNumber: i + 1,
      origin: cell(0),
      shipDate: cell(1),
      courier: cell(2),
      invoiceNo: cell(3),
      clinicName: cell(4),
      trackingNo: cell(5),
      notShipped: cell(8).toUpperCase() === 'TRUE',
      memo: cell(13),
    });
  }
  return rows;
}

function parseDate(value: string): Date | null {
  const m = value.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

/** 照合の対象行：直近30日以内に出荷し、メモに完了系の語がない行と、未出荷の行 */
export function isTargetRow(row: SheetShipmentRow, today: Date): boolean {
  if (row.notShipped) return true;
  if (EXCLUDED_MEMO_WORDS.some((w) => row.memo.includes(w))) return false;
  const d = parseDate(row.shipDate);
  if (!d) return false;
  const age = daysBetween(today, d);
  return age >= 0 && age <= TARGET_DAYS;
}

/**
 * 追跡番号から数字だけを取り出す。
 * 全体の数字（区切りのスペースやハイフンを除いたもの）と、8桁以上の個々の番号（複数記載に対応）を返す
 */
export function trackingDigits(value: string): string[] {
  const all = value.replace(/\D/g, '');
  const parts = (value.match(/\d+/g) || []).filter((d) => d.length >= 8);
  return [...new Set([all, ...parts])].filter((d) => d.length >= 8);
}

/** クリニック名の比較用の正規化 */
export function normalizeClinicName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・\-ー－.,、。()（）「」'"]/g, '')
    .replace(/医療法人(社団|財団)?/g, '')
    .replace(/(clinic|クリニック|美容外科|美容皮膚科|皮膚科|医院)/g, '');
}

function normalizeWarehouse(value?: string): string {
  const v = (value || '').normalize('NFKC').toLowerCase().replace(/\s/g, '');
  return v === '—' || v === '-' ? '' : v;
}

/**
 * 出荷元で候補を絞る：シートの出荷元と出荷管理の出荷元倉庫がどちらも入っていて違うものは外し、
 * 一致するものがあればそれだけを残す（出荷元倉庫が空の古い出荷は判断できないので残す）
 */
function narrowByWarehouse<T extends ShipmentLike>(origin: string, candidates: T[]): T[] {
  const o = normalizeWarehouse(origin);
  if (!o) return candidates;
  const notConflicting = candidates.filter((c) => {
    const w = normalizeWarehouse(c.warehouse);
    return !w || w === o;
  });
  const exact = notConflicting.filter((c) => normalizeWarehouse(c.warehouse) === o);
  return exact.length > 0 ? exact : notConflicting;
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeClinicName(a);
  const nb = normalizeClinicName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 4 && longer.includes(shorter);
}

/** 同じ日に同じ系列へまとめて送ったもの（例：湘南美容クリニック109個口）のグループ名 */
function seriesKey(clinicName: string): string {
  const n = clinicName.normalize('NFKC').trim();
  // 「湘南美容クリニック 新宿院」→「湘南美容クリニック」、「SBC SHINJUKU」→「sbc」
  const jp = n.match(/^(.+?(クリニック|美容外科|皮膚科))/);
  if (jp) return jp[1].replace(/\s/g, '');
  return (n.split(/\s+/)[0] || n).toLowerCase();
}

export function findUnmatched(
  sheetRows: SheetShipmentRow[],
  shipments: ShipmentLike[],
  clinics: ClinicLike[],
  today: Date = new Date()
): { rows: UnmatchedRow[]; targetCount: number; matchedCount: number; noTrackingCount: number } {
  const knownTracking = new Set<string>();
  shipments.forEach((s) => trackingDigits(s.trackingNo || '').forEach((d) => knownTracking.add(d)));

  const shipmentsByInvoice = new Map<string, ShipmentLike[]>();
  shipments.forEach((s) => {
    const key = normalizeInvoice(s.warehouseInvoiceNo);
    if (!key) return;
    if (!shipmentsByInvoice.has(key)) shipmentsByInvoice.set(key, []);
    shipmentsByInvoice.get(key)!.push(s);
  });

  const targets = sheetRows.filter((r) => isTargetRow(r, today));
  let matchedCount = 0;
  let noTrackingCount = 0;
  const unmatched: UnmatchedRow[] = [];

  for (const row of targets) {
    const digits = trackingDigits(row.trackingNo);
    if (digits.length === 0) {
      noTrackingCount++;
      continue;
    }
    if (digits.some((d) => knownTracking.has(d))) {
      matchedCount++;
      continue;
    }

    // シートのクリニック名を、顧客マスタの「顧客名」「クリニック名英語表記」と照合
    const matchedClinicNames = clinics
      .filter((c) => namesMatch(row.clinicName, c.clinicName) || (c.clinicNameEn && namesMatch(row.clinicName, c.clinicNameEn)))
      .map((c) => c.clinicName);
    const nameSet = [row.clinicName, ...matchedClinicNames];

    const sheetDate = parseDate(row.shipDate);
    const candidates: UnmatchedRow['candidates'] = [];
    const seen = new Set<string>();
    for (const s of shipments) {
      // 出荷管理は明細ごとに行があるので、出荷IDごとに1件にする
      if (seen.has(s.shipmentId)) continue;
      if (!nameSet.some((n) => namesMatch(n, s.customerName || ''))) continue;
      // そのクリニックの出荷待ち（出荷状態が出荷待ち、または出荷日が空欄）と、出荷日が近い出荷済みを候補にする
      const sd = parseDate(s.shippedDate || '');
      if ((s.shipStatus || '').includes('出荷待ち') || !sd) {
        seen.add(s.shipmentId);
        candidates.push({ ...s, reason: '出荷待ち' });
        continue;
      }
      if (sheetDate && Math.abs(daysBetween(sd, sheetDate)) <= NEAR_SHIP_DAYS) {
        seen.add(s.shipmentId);
        candidates.push({ ...s, reason: '出荷日が近い' });
      }
    }

    // シートのINVOICE NO.が出荷管理の倉庫インボイス番号と一致すれば、その出荷が最有力（クリニック名に関係なく）
    const invoiceHits = shipmentsByInvoice.get(normalizeInvoice(row.invoiceNo)) || [];
    const narrowed =
      invoiceHits.length > 0
        ? invoiceHits.map((s) => ({ ...s, reason: 'インボイス番号が一致' as const }))
        : narrowByWarehouse(row.origin, candidates);

    unmatched.push({
      ...row,
      candidates: narrowed,
      kind: narrowed.length === 0 ? 'none' : narrowed.length === 1 ? 'single' : 'multiple',
      matchedClinicNames,
      bulkGroupKey: null,
    });
  }

  // 一括配送のまとめ：同じ出荷日・同じ系列で3行以上
  const groups = new Map<string, UnmatchedRow[]>();
  unmatched.forEach((r) => {
    const key = `${r.shipDate}__${seriesKey(r.clinicName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  groups.forEach((rows, key) => {
    if (rows.length >= BULK_MIN_ROWS) rows.forEach((r) => (r.bulkGroupKey = key));
  });

  unmatched.sort((a, b) => (parseDate(b.shipDate)?.getTime() || 0) - (parseDate(a.shipDate)?.getTime() || 0));
  return { rows: unmatched, targetCount: targets.length, matchedCount, noTrackingCount };
}
