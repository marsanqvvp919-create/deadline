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
  arrivedJapan?: boolean;
  customsCleared?: boolean;
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

export async function fetchCarrierStatuses(
  items: { trackingNo: string; courier?: string }[],
  force = false
): Promise<TrackResponse> {
  const res = await fetch('/api/carriers/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, force }),
  });
  return res.json();
}

export function digitsOf(trackingNo?: string): string {
  return (trackingNo || '').replace(/\D/g, '');
}

export interface CarrierStatusSnapshot {
  statuses: CarrierStatus[];
  dhl: { usedToday: number; budget: number; lastAutoRunAt: string | null; autoEnabled: boolean };
  fedex?: { lastAutoRunAt: string | null; autoEnabled: boolean; lastError: string | null };
}

/** サーバーが自動取得して持っている最新状況（配送会社には問い合わせない） */
export async function fetchSavedCarrierStatuses(): Promise<CarrierStatusSnapshot | null> {
  try {
    const res = await fetch('/api/carriers/statuses');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
