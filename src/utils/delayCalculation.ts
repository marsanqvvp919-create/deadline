import { Order, OrderLine } from '../types';

/**
 * 納期超過（遅延）判定の統一関数
 * トップKPI（納期超過件数）と担当営業別・仕入先別の遅延件数を完全に一致させるための正規ルール
 */

/**
 * 明細が納期超過しているかを判定
 */
export function isLineDelayed(line: OrderLine, order?: Order, referenceDate?: Date): boolean {
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
