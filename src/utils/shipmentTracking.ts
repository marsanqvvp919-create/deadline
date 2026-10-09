import { ShipmentItem } from '../types';
import { CarrierStatus, CARRIER_STATUS_LABEL } from './carriers';
import { parseTrackingNumbers, carrierName } from './trackingNumbers';

// 出荷ごとの箱（代表の出荷番号＋対応メモに並べた残りの箱の追跡番号）と、その配送状況をまとめる。
// 複数口（湘南美容の一括配送など）は、全部の箱が配達完了になったときだけ「配達完了」にする。

export function boxesOf(s: Pick<ShipmentItem, 'trackingNo' | 'extraTrackingNos'>): string[] {
  // 出荷番号の欄の番号（複数・4桁区切り・下4桁の省略にも対応）＋対応メモの番号
  return Array.from(new Set([...parseTrackingNumbers(s.trackingNo), ...(s.extraTrackingNos || [])]));
}

/** 手持ち（持参・手渡し）で届けた出荷：配送業者が「手持ち（持参）」か、追跡番号の欄に番号がなく「手持ち・手渡し・持参」と書いてある */
export function isHandCarried(s: { courier?: string; trackingNo?: string }): boolean {
  if (/手持ち|持参|手渡し/.test(s.courier || '')) return true;
  return parseTrackingNumbers(s.trackingNo).length === 0 && /手持ち|持参|手渡し/.test(s.trackingNo || '');
}

/** 「見つからない」だった番号は状況なしとして扱う */
export function usableStatus(c?: CarrierStatus): CarrierStatus | undefined {
  return c && c.status !== 'unknown' && !c.notFound ? c : undefined;
}

export interface BoxSummary {
  total: number; // 箱の数
  fetched: number; // 状況が取れた箱の数
  delivered: number; // 配達完了の箱の数
  /** 代表の状況：全部届いていれば配達完了、そうでなければ要確認 → まだ届いていない箱のうち最新の記録 */
  rep?: CarrierStatus;
  partial: boolean; // 一部だけ配達
}

export function summarizeBoxes(
  s: Pick<ShipmentItem, 'trackingNo' | 'extraTrackingNos'>,
  statuses: Record<string, CarrierStatus>
): BoxSummary {
  const boxes = boxesOf(s);
  const list = boxes.map((d) => usableStatus(statuses[d])).filter((c): c is CarrierStatus => !!c);
  const delivered = list.filter((c) => c.status === 'delivered').length;
  const latest = (arr: CarrierStatus[]) =>
    arr.slice().sort((a, b) => String(b.lastEventAt || '').localeCompare(String(a.lastEventAt || '')))[0];
  let rep: CarrierStatus | undefined;
  if (boxes.length > 0 && delivered === boxes.length) rep = latest(list);
  else {
    const notDelivered = list.filter((c) => c.status !== 'delivered');
    rep = latest(notDelivered.filter((c) => c.status === 'exception')) || latest(notDelivered) || undefined;
  }
  return {
    total: boxes.length,
    fetched: list.length,
    delivered,
    rep,
    partial: boxes.length > 1 && delivered > 0 && delivered < boxes.length,
  };
}

/** 一覧に出す短い文言（例：「DHL 輸送中（通関情報が更新されました）」「一部配達（2/5箱）」） */
export function boxSummaryText(sum: BoxSummary): string {
  if (!sum.rep && sum.total === 0) return '追跡番号なし';
  if (!sum.rep) return '状況未取得';
  const carrier = carrierName(sum.rep.carrier);
  if (sum.partial) return `${carrier} 一部配達（${sum.delivered}/${sum.total}箱）`;
  const boxes = sum.total > 1 ? `（${sum.total}箱）` : '';
  const label = CARRIER_STATUS_LABEL[sum.rep.status];
  return `${carrier} ${label}${boxes}${sum.rep.statusText && sum.rep.statusText !== label ? `：${sum.rep.statusText}` : ''}`;
}

/** 最後のスキャンからの日数（記録がなければ null） */
export function daysSinceLastScan(c?: CarrierStatus): number | null {
  if (!c?.lastEventAt) return null;
  const t = new Date(c.lastEventAt).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
