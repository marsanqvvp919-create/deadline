import { Order, ShipmentItem } from '../types';
import { CarrierStatus } from './carriers';
import { BoxSummary, daysSinceLastScan, summarizeBoxes } from './shipmentTracking';
import { isOrderDelayed } from './delayCalculation';

// 朝の納期会議とメニューの「要対応」バッジで同じ数え方をするための共通の計算。

/** 最後のスキャンからこの日数以上動きがなければ「止まっている」 */
export const STALL_DAYS = 3;

export type StallKind = 'problem' | 'label_only';

export interface StallInfo {
  /** problem＝配送会社の例外か、輸送中のまま動きがない／label_only＝送り状を作っただけで集荷されていない */
  kind: StallKind;
  sum: BoxSummary;
  idle: number | null;
}

/** 出荷済みでまだ届いていない出荷が、止まっているかどうか */
export function stallOf(s: ShipmentItem, carrierStatus: Record<string, CarrierStatus>): StallInfo | null {
  if (!(s.shipStatus || '').includes('出荷済')) return null;
  const sum = summarizeBoxes(s, carrierStatus);
  const c = sum.rep;
  if (!c || c.status === 'delivered') return null;
  const idle = daysSinceLastScan(c);
  if (c.status === 'exception') return { kind: 'problem', sum, idle };
  if (idle === null || idle < STALL_DAYS) return null;
  return { kind: c.status === 'pre_transit' ? 'label_only' : 'problem', sum, idle };
}

/** 要対応＝納期超過の伝票＋配送で問題が起きている出荷（同じ伝票は1件として数える） */
export function attentionCounts(orders: Order[], shipments: ShipmentItem[], carrierStatus: Record<string, CarrierStatus>) {
  const overdueIds = new Set(orders.filter((o) => isOrderDelayed(o)).map((o) => o.orderId));
  let problem = 0;
  let problemOnly = 0;
  shipments.forEach((s) => {
    if (stallOf(s, carrierStatus)?.kind !== 'problem') return;
    problem++;
    if (!overdueIds.has(s.orderId)) problemOnly++;
  });
  return { overdue: overdueIds.size, problem, total: overdueIds.size + problemOnly };
}
