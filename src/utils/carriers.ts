// 配送会社（FedEx・DHL）の追跡APIの結果をサーバーから受け取る。認証情報はサーバーだけが持つ。

export type NormalizedStatus = 'delivered' | 'in_transit' | 'exception' | 'pre_transit' | 'unknown';

export interface CarrierStatus {
  carrier: 'fedex' | 'dhl';
  trackingNo: string;
  status: NormalizedStatus;
  statusText: string;
  lastEventAt?: string;
  lastLocation?: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  fetchedAt: string;
  error?: string;
}

export const CARRIER_STATUS_LABEL: Record<NormalizedStatus, string> = {
  delivered: '配達完了',
  in_transit: '輸送中',
  exception: '要確認（通関・配達の例外）',
  pre_transit: '集荷前',
  unknown: '不明',
};

export const CARRIER_STATUS_STYLE: Record<NormalizedStatus, string> = {
  delivered: 'bg-emerald-100 text-emerald-800',
  in_transit: 'bg-blue-100 text-blue-800',
  exception: 'bg-rose-100 text-rose-800',
  pre_transit: 'bg-slate-100 text-slate-700',
  unknown: 'bg-slate-100 text-slate-500',
};

export interface TrackResponse {
  results: CarrierStatus[];
  errors: Record<string, string>;
  configured: { fedex: boolean; dhl: boolean };
}

export async function fetchCarrierStatuses(items: { trackingNo: string; courier?: string }[]): Promise<TrackResponse> {
  const res = await fetch('/api/carriers/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return res.json();
}

export function digitsOf(trackingNo?: string): string {
  return (trackingNo || '').replace(/\D/g, '');
}
