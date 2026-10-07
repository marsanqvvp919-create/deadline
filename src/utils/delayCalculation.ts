import { Order, OrderLine } from '../types';
import { isShippingOrFee } from '../utils';

/**
 * 納期超過（遅延）判定の統一関数
 * 
 * ユーザー指定の厳密な定義:
 * 「納期超過」は「納品予定日が今日より前で、かつ未出荷の明細」と定義し、
 * isLineDelayed の1か所だけで判定する。
 * 表示は「○件（○明細）」の形にそろえる（○件は伝票の数、○明細は商品明細の数）。
 */

/**
 * 明細が納期超過しているかを判定（単一の真実）
 */
export function isLineDelayed(line: OrderLine, order?: Order, referenceDate?: Date): boolean {
  // 送料・各種手数料は明細カウントから除外
  if (isShippingOrFee(line.productName, line.productId)) return false;

  // すでに出荷完了または納品済みの明細は遅延とみなさない
  if (line.stage === '出荷完了') return false;
  if (line.shippedQty >= line.quantity && line.quantity > 0) return false;
  if (order && (order.deliveredDate || order.orderState === '納品完了')) return false;

  if (!line.latestDate) return false;

  const targetDate = new Date(line.latestDate);
  if (isNaN(targetDate.getTime())) return false;

  const ref = referenceDate || new Date();
  const refStartOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const targetStartOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();

  // 納品予定日が今日より前（今日を含まず、昨日以前）
  return targetStartOfDay < refStartOfDay;
}

/**
 * 伝票が納期超過しているかを判定（1明細でも納期超過があれば遅延伝票）
 */
export function isOrderDelayed(order: Order, referenceDate?: Date): boolean {
  if (order.deliveredDate || order.orderState === '納品完了') return false;
  return order.lines.some((l) => isLineDelayed(l, order, referenceDate));
}

/**
 * 納期間近（10日以内）の明細判定（納期超過と合算しない別指標）
 */
export function isLineApproaching(line: OrderLine, order?: Order, referenceDate?: Date, days: number = 10): boolean {
  if (isShippingOrFee(line.productName, line.productId)) return false;
  if (line.stage === '出荷完了') return false;
  if (line.shippedQty >= line.quantity && line.quantity > 0) return false;
  if (order && (order.deliveredDate || order.orderState === '納品完了')) return false;

  if (!line.latestDate) return false;

  const targetDate = new Date(line.latestDate);
  if (isNaN(targetDate.getTime())) return false;

  const ref = referenceDate || new Date();
  const refStartOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const targetStartOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();

  // 今日以降 かつ 10日以内（超過しているものは含めない）
  const maxApproachingMs = refStartOfDay + days * 24 * 60 * 60 * 1000;
  return targetStartOfDay >= refStartOfDay && targetStartOfDay <= maxApproachingMs;
}

/**
 * 伝票が納期間近（10日以内）かを判定（納期超過伝票は除外）
 */
export function isOrderApproaching(order: Order, referenceDate?: Date, days: number = 10): boolean {
  if (order.deliveredDate || order.orderState === '納品完了') return false;
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
    let orderHasDelayed = false;
    o.lines.forEach((l) => {
      if (isLineDelayed(l, o, referenceDate)) {
        linesCount++;
        orderHasDelayed = true;
      }
    });
    if (orderHasDelayed) {
      ordersCount++;
    }
  });

  return { ordersCount, linesCount };
}

/**
 * 納期間近（10日以内）の集計（超過とは合算しない）
 */
export function getApproachingCounts(orders: Order[], referenceDate?: Date, days: number = 10): DelayCounts {
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
