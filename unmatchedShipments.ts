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
  customerId?: string;
  orderId: string;
  customerName: string;
  trackingNo: string;
  shippedDate: string;
  shipStatus?: string;
  warehouse?: string;
  warehouseInvoiceNo?: string;
  courier?: string;
}

export interface OrderLite {
  orderId: string;
  customerName: string;
  status: string;
}

export interface ClinicLike {
  clinicId?: string;
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
  noCandidateReason?: string;
  bulkGroupKey: string | null;
  // 似た名前（表記ゆれ）で顧客マスタ・受注のクリニックを見つけたとき：シートの名前と相手の名前
  nameVariants?: { sheetName: string; matchedName: string }[];
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

const normalizeCache = new Map<string, string>();

/** クリニック名の比較用の正規化（同じ名前を何度も正規化しないよう結果を覚えておく） */
export function normalizeClinicName(value: string): string {
  const cached = normalizeCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = normalizeClinicNameUncached(value);
  if (normalizeCache.size > 50000) normalizeCache.clear();
  normalizeCache.set(value, normalized);
  return normalized;
}

const CORPORATE_PREFIX =
  /(医療法人社団|医療法人財団|社会医療法人|特定医療法人|医療法人|一般社団法人|一般財団法人|社団法人|財団法人|株式会社|有限会社|合同会社|\(医\)|\(株\))/;
const COMMON_WORDS = /(クリニック|clinic|美容外科|美容皮膚科|形成外科|皮膚科|医院|歯科|クリニーク)/g;

function normalizeClinicNameUncached(value: string): string {
  // 全角・半角、大文字・小文字をそろえる
  let v = value.normalize('NFKC').toLowerCase();
  // 法人名を外す：「医療法人社団福進会 しおう…」のように空白で区切られていれば法人名の部分を捨て、
  // 「医療法人社団福進会しおう…」のように続いていれば「…会」までを外す
  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const rest = tokens.filter((t) => !CORPORATE_PREFIX.test(t));
    if (rest.length > 0) v = rest.join('');
  }
  const withoutCorp = v
    .replace(new RegExp(CORPORATE_PREFIX.source + '[^会]{1,10}会(?=.)'), '')
    .replace(new RegExp(CORPORATE_PREFIX.source, 'g'), '');
  // 法人名だけの名前（例：一般社団法人水麗会）は、法人の種類だけを外したものを使う
  v = withoutCorp || v.replace(new RegExp(CORPORATE_PREFIX.source, 'g'), '');
  // 空白・改行・記号を外し、共通の語を外す
  v = v.replace(/[\s・\-ー－.,、。()（）「」'"&＆]/g, '');
  const withoutCommon = v.replace(COMMON_WORDS, '');
  return withoutCommon || v;
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

/** 配送業者で候補を絞る：シートのクーリエと出荷管理の配送業者がどちらも入っていて違うものは外す */
function narrowByCourier<T extends ShipmentLike>(courier: string, candidates: T[]): T[] {
  const c = normalizeWarehouse(courier);
  if (!c) return candidates;
  const filtered = candidates.filter((x) => {
    const v = normalizeWarehouse(x.courier);
    return !v || v.includes(c) || c.includes(v);
  });
  return filtered;
}

/** 2つの文字列の編集距離（1文字の追加・削除・置換を1と数える） */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

type NameMatch = 'exact' | 'similar' | null;

/** クリニック名の比較。一致（または片方がもう片方を含む）なら 'exact'、1〜2文字違いなら 'similar'（表記ゆれ） */
function compareNames(a: string, b: string): NameMatch {
  const na = normalizeClinicName(a);
  const nb = normalizeClinicName(b);
  if (!na || !nb) return null;
  if (na === nb) return 'exact';
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 4 && longer.includes(shorter)) return 'exact';
  // 表記ゆれ：4文字以上は1文字、8文字以上は2文字までの違い（例：マリージュ／マリアージュ、薬師寺参道／薬師参道）
  const allowed = shorter.length >= 8 ? 2 : shorter.length >= 4 ? 1 : 0;
  if (allowed > 0 && editDistance(na, nb, allowed) <= allowed) return 'similar';
  return null;
}

function namesMatch(a: string, b: string): boolean {
  return compareNames(a, b) !== null;
}

/** 同じ日に同じ系列へまとめて送ったもの（例：湘南美容クリニック109個口）のグループ名 */
function seriesKey(clinicName: string): string {
  const n = clinicName.normalize('NFKC').trim();
  // 「湘南美容クリニック 新宿院」→「湘南美容クリニック」、「SBC SHINJUKU」→「sbc」
  const jp = n.match(/^(.+?(クリニック|美容外科|皮膚科))/);
  if (jp) return jp[1].replace(/\s/g, '');
  return (n.split(/\s+/)[0] || n).toLowerCase();
}

/** 追跡番号は照合できたが確認が必要な行 */
export interface MatchedIssue extends SheetShipmentRow {
  issue: 'registered_elsewhere' | 'ship_date_mismatch';
  shipments: ShipmentLike[];
  rakurakuShipDate?: string;
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function findUnmatched(
  sheetRows: SheetShipmentRow[],
  shipments: ShipmentLike[],
  clinics: ClinicLike[],
  today: Date = new Date(),
  orders: OrderLite[] = []
): {
  rows: UnmatchedRow[];
  issues: MatchedIssue[];
  targetCount: number;
  matchedCount: number;
  noTrackingCount: number;
} {
  const shipmentsByTracking = new Map<string, ShipmentLike[]>();
  shipments.forEach((s) =>
    trackingDigits(s.trackingNo || '').forEach((d) => {
      if (!shipmentsByTracking.has(d)) shipmentsByTracking.set(d, []);
      shipmentsByTracking.get(d)!.push(s);
    })
  );
  const issues: MatchedIssue[] = [];
  const shipmentsByCustomer = new Map<string, ShipmentLike[]>();
  shipments.forEach((s) => {
    const key = s.customerName || '';
    if (!shipmentsByCustomer.has(key)) shipmentsByCustomer.set(key, []);
    shipmentsByCustomer.get(key)!.push(s);
  });

  // シートのクリニック名に当たる顧客マスタの行（顧客名・英語表記で照合）
  const resolveClinics = (sheetName: string) =>
    clinics.filter((c) => namesMatch(sheetName, c.clinicName) || (c.clinicNameEn && namesMatch(sheetName, c.clinicNameEn)));

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
    const hits = Array.from(new Set(digits.flatMap((d) => shipmentsByTracking.get(d) || [])));
    if (hits.length > 0) {
      matchedCount++;
      // 別のクリニックの受注に登録済み：シートのクリニック名を顧客マスタで確認でき、
      // 出荷の顧客IDもクリニック名も一致しない場合（受注のクリニック名欄には院長名などが入っていることがあるため、顧客IDで比べる）
      const resolved = resolveClinics(row.clinicName);
      const resolvedIds = new Set(resolved.map((c) => c.clinicId).filter(Boolean));
      const names = [row.clinicName, ...resolved.map((c) => c.clinicName)];
      const sameClinic = hits.some(
        (s) => (s.customerId && resolvedIds.has(s.customerId)) || names.some((n) => namesMatch(n, s.customerName || ''))
      );
      if (!sameClinic && resolved.length > 0) {
        issues.push({ ...row, issue: 'registered_elsewhere', shipments: hits });
        continue;
      }
      // 出荷日のずれ：シートの出荷日と楽楽販売の出荷日が違う
      const sheetDate = parseDate(row.shipDate);
      const rakurakuDates = hits.map((s) => parseDate(s.shippedDate || '')).filter((d): d is Date => !!d);
      if (sheetDate && rakurakuDates.length > 0 && rakurakuDates.every((d) => daysBetween(d, sheetDate) !== 0)) {
        issues.push({ ...row, issue: 'ship_date_mismatch', shipments: hits, rakurakuShipDate: formatYmd(rakurakuDates[0]) });
      }
      continue;
    }

    // シートのクリニック名を、顧客マスタの「顧客名」「クリニック名英語表記」と照合
    // 顧客マスタの「顧客名」「クリニック名英語表記」と比べる。完全に一致するものがあればそれだけを使い、
    // 無いときだけ似た名前（表記ゆれ）を使う
    const nameVariants: { sheetName: string; matchedName: string }[] = [];
    const masterResults = clinics.map((c) => {
      const byName = compareNames(row.clinicName, c.clinicName);
      const byEn = c.clinicNameEn ? compareNames(row.clinicName, c.clinicNameEn) : null;
      const level: NameMatch = byName === 'exact' || byEn === 'exact' ? 'exact' : byName || byEn;
      return { c, level, viaEn: byName !== 'exact' && byName !== 'similar' };
    });
    const exactMasters = masterResults.filter((m) => m.level === 'exact');
    const usedMasters = exactMasters.length > 0 ? exactMasters : masterResults.filter((m) => m.level === 'similar');
    if (exactMasters.length === 0) {
      usedMasters.forEach((m) =>
        nameVariants.push({
          sheetName: row.clinicName,
          matchedName: m.viaEn && m.c.clinicNameEn ? `${m.c.clinicName}（${m.c.clinicNameEn}）` : m.c.clinicName,
        })
      );
    }
    const matchedClinicNames = usedMasters.map((m) => m.c.clinicName);
    const nameSet = [row.clinicName, ...matchedClinicNames];

    const sheetDate = parseDate(row.shipDate);
    const candidates: UnmatchedRow['candidates'] = [];
    const seen = new Set<string>();
    // クリニック名ごとにまとめた出荷から探す（出荷1件ずつ名前を比べると遅いため）
    const clinicShipments: ShipmentLike[] = [];
    const similarGroups: [string, ShipmentLike[]][] = [];
    shipmentsByCustomer.forEach((list, customerName) => {
      const results = nameSet.map((n) => compareNames(n, customerName));
      if (results.includes('exact')) clinicShipments.push(...list);
      else if (results.includes('similar')) similarGroups.push([customerName, list]);
    });
    // 受注のクリニック名でも、完全に一致するものが無いときだけ似た名前を使う
    if (clinicShipments.length === 0) {
      similarGroups.forEach(([customerName, list]) => {
        clinicShipments.push(...list);
        if (!nameVariants.some((v) => v.matchedName.startsWith(customerName))) {
          nameVariants.push({ sheetName: row.clinicName, matchedName: customerName });
        }
      });
    }
    for (const s of clinicShipments) {
      // 出荷管理は明細ごとに行があるので、出荷IDごとに1件にする
      if (seen.has(s.shipmentId)) continue;
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
        : narrowByCourier(row.courier, narrowByWarehouse(row.origin, candidates));

    // 候補が無い理由（どこを直せばよいかを画面で分かるようにする）
    let noCandidateReason: string | undefined;
    if (narrowed.length === 0) {
      const clinicOrders = orders
        .filter((o) => nameSet.some((n) => namesMatch(n, o.customerName || '')))
        .sort((a, b) => b.orderId.localeCompare(a.orderId));
      if (matchedClinicNames.length === 0 && clinicOrders.length === 0) {
        noCandidateReason = '顧客マスタにも受注にも、このクリニック名が見つかりません（名前の表記を確認してください）';
      } else {
        const quotes = clinicOrders.filter((o) => (o.status || '').includes('見積')).slice(0, 3);
        const latest = clinicOrders[0];
        if (quotes.length > 0 && latest && (latest.status || '').includes('見積')) {
          noCandidateReason = `最新の受注 ${quotes.map((o) => o.orderId).join('・')} が「${latest.status}」のままです（受注に進んでいないため出荷がありません）`;
        } else {
          noCandidateReason = '出荷待ちの出荷も、出荷日が近い出荷もありません（楽楽販売に出荷が登録されていない可能性があります）';
        }
      }
    }

    unmatched.push({
      ...row,
      nameVariants: nameVariants.length > 0 ? nameVariants : undefined,
      noCandidateReason,
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
  issues.sort((a, b) => (parseDate(b.shipDate)?.getTime() || 0) - (parseDate(a.shipDate)?.getTime() || 0));
  return { rows: unmatched, issues, targetCount: targets.length, matchedCount, noTrackingCount };
}
