import { Order, OrderLine } from '../types';
import { isShippingOrFee } from '../utils';

/**
 * 納期超過（遅延）判定の統一関数
 *
 * 楽楽販売 ご注文管理「納期：①超過」と同じ条件で判定する:
 * - 明細の最長納品予定日が今日より前
 * - その明細の出荷日が空欄
 * - 伝票のステータスが「見積作成中」「見積済み」「出荷済み」ではない
 * 伝票数はこの条件に当たる明細を1つでも持つ伝票の数（楽楽販売の一覧件数と一致させる）。
 */

export const RAKURAKU_OVERDUE_LIST_URL =
  'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/recordlist/list/dbgId/100145/dbSchemaId/101248/menuId/102243';

const OVERDUE_EXCLUDED_STATUSES = ['見積作成中', '見積済み', '出荷済み'];

export function isOverdueExcludedStatus(status?: string): boolean {
  return OVERDUE_EXCLUDED_STATUSES.includes((status || '').trim());
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isBeforeToday(dateStr: string | null | undefined, referenceDate?: Date): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return false;
  return startOfDay(target) < startOfDay(referenceDate || new Date());
}

/** 明細の出荷日（楽楽販売の値をそのまま使う。古いキャッシュでは補正後の値で代用） */
function lineShippedDate(line: OrderLine): string | null {
  return line.rawShippedDate !== undefined ? line.rawShippedDate : line.shippedDate;
}

/**
 * 明細が納期超過しているかを判定（単一の真実）
 */
// 精算の行（割引・不足分・前回分差額）は納期超過に数えない
const SETTLEMENT_LINE_KEYWORDS = ['割引', '不足分', '前回分差額'];

export function isSettlementLine(line: OrderLine): boolean {
  return SETTLEMENT_LINE_KEYWORDS.some((kw) => (line.productName || '').includes(kw));
}

export function isLineDelayed(line: OrderLine, order?: Order, referenceDate?: Date): boolean {
  if (isSettlementLine(line)) return false;
  if (order && isOverdueExcludedStatus(order.status)) return false;
  if (lineShippedDate(line)) return false;
  return isBeforeToday(line.latestDate, referenceDate);
}

/**
 * 伝票が納期超過しているかを判定（送料・手数料を含む全明細で判定し、楽楽販売の件数と一致させる）
 */
export function isOrderDelayed(order: Order, referenceDate?: Date): boolean {
  if (isOverdueExcludedStatus(order.status)) return false;
  if (order.overdueBasis && order.overdueBasis.length > 0) {
    return order.overdueBasis.some((b) => !b.shippedDate && isBeforeToday(b.latestDate, referenceDate));
  }
  return order.lines.some((l) => isLineDelayed(l, order, referenceDate));
}

/**
 * 納期超過伝票の内訳（楽楽販売のステータス別）
 * 受注済み（未発注）のまま期限切れのものは「発注漏れ」として扱う
 */
export type OverdueCategory = '発注済み' | '発注漏れ' | 'その他';

export function getOverdueCategory(order: Order): OverdueCategory {
  const status = (order.status || '').trim();
  if (status.startsWith('発注済')) return '発注済み';
  if (status.startsWith('受注済')) return '発注漏れ';
  return 'その他';
}

export interface OverdueBreakdown {
  total: number;
  ordered: number;   // 発注済み
  unordered: number; // 受注済み（未発注）＝発注漏れ
  other: number;
}

export function getOverdueBreakdown(orders: Order[], referenceDate?: Date): OverdueBreakdown {
  const result: OverdueBreakdown = { total: 0, ordered: 0, unordered: 0, other: 0 };
  orders.forEach((o) => {
    if (!isOrderDelayed(o, referenceDate)) return;
    result.total++;
    const category = getOverdueCategory(o);
    if (category === '発注済み') result.ordered++;
    else if (category === '発注漏れ') result.unordered++;
    else result.other++;
  });
  return result;
}

/** 納期間近の日数。楽楽販売の「納期：②注意」（5日以内）に合わせる */
export const APPROACHING_DAYS = 5;

/**
 * 納期間近（5日以内）の明細判定（納期超過と合算しない別指標）
 */
export function isLineApproaching(line: OrderLine, order?: Order, referenceDate?: Date, days: number = APPROACHING_DAYS): boolean {
  if (isSettlementLine(line)) return false;
  if (isShippingOrFee(line.productName, line.productId)) return false;
  if (order && isOverdueExcludedStatus(order.status)) return false;
  if (lineShippedDate(line)) return false;

  if (!line.latestDate) return false;

  const targetDate = new Date(line.latestDate);
  if (isNaN(targetDate.getTime())) return false;

  const ref = referenceDate || new Date();
  const refStartOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const targetStartOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();

  // 今日以降 かつ 5日以内（超過しているものは含めない）
  const maxApproachingMs = refStartOfDay + days * 24 * 60 * 60 * 1000;
  return targetStartOfDay >= refStartOfDay && targetStartOfDay <= maxApproachingMs;
}

/**
 * 伝票が納期間近（5日以内）かを判定（納期超過伝票は除外）
 */
export function isOrderApproaching(order: Order, referenceDate?: Date, days: number = APPROACHING_DAYS): boolean {
  if (isOverdueExcludedStatus(order.status)) return false;
  // 納期超過伝票とは合算しない
  if (isOrderDelayed(order, referenceDate)) return false;
  return order.lines.some((l) => isLineApproaching(l, order, referenceDate, days));
}

/**
 * 遅延日数を計算（0以上の整数。遅延していなければ0）
 */
export function getLineDelayDays(line: OrderLine, referenceDate?: Date): number {
  if (!isLineDelayed(line, undefined, referenceDate) || !line.latestDate) return 0;

  const targetDate = new Date(line.latestDate);
  const ref = referenceDate || new Date();
  const refStartOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const targetStartOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();

  const diffMs = refStartOfDay - targetStartOfDay;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * 伝票の最大遅延日数を計算
 */
export function getOrderMaxDelayDays(order: Order, referenceDate?: Date): number {
  if (!isOrderDelayed(order, referenceDate)) return 0;
  let maxDays = 0;
  order.lines.forEach((l) => {
    const days = getLineDelayDays(l, referenceDate);
    if (days > maxDays) maxDays = days;
  });
  return maxDays;
}

/**
 * 納期超過の集計（○件、○明細）
 */
export interface DelayCounts {
  ordersCount: number; // 伝票数（○件）
  linesCount: number;  // 商品明細数（○明細）
}

export function getDelayCounts(orders: Order[], referenceDate?: Date): DelayCounts {
  let ordersCount = 0;
  let linesCount = 0;

  orders.forEach((o) => {
    // 伝票数は楽楽販売「①超過」と同じく、送料・手数料を含む全明細で判定する
    if (!isOrderDelayed(o, referenceDate)) return;
    ordersCount++;
    o.lines.forEach((l) => {
      if (isLineDelayed(l, o, referenceDate)) linesCount++;
    });
  });

  return { ordersCount, linesCount };
}

/**
 * 納期間近（5日以内）の集計（超過とは合算しない）
 */
export function getApproachingCounts(orders: Order[], referenceDate?: Date, days: number = APPROACHING_DAYS): DelayCounts {
  let ordersCount = 0;
  let linesCount = 0;

  orders.forEach((o) => {
    // 納期超過伝票は除外
    if (isOrderDelayed(o, referenceDate)) return;

    let orderHasApproaching = false;
    o.lines.forEach((l) => {
      if (isLineApproaching(l, o, referenceDate, days)) {
        linesCount++;
        orderHasApproaching = true;
      }
    });
    if (orderHasApproaching) {
      ordersCount++;
    }
  });

  return { ordersCount, linesCount };
}

/**
 * 統一フォーマット表示文字列生成: ○件（○明細）
 */
export function formatDelayString(counts: DelayCounts): string {
  return `${counts.ordersCount}件（${counts.linesCount}明細）`;
}
