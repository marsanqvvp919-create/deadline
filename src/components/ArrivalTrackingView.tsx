import React, { useMemo, useState } from 'react';
import { useUrlState } from '../utils/listState';
import { Order, ShipmentItem } from '../types';
import { getConfiguredUrls, getLocalClinics } from '../api';
import { openRakurakuWithCopiedId } from '../utils';
import { Search, Truck, ExternalLink, Snowflake, Copy, RefreshCw } from 'lucide-react';
import { CARRIER_STATUS_LABEL, CARRIER_STATUS_STYLE, CarrierStatus, digitsOf, fetchCarrierStatuses } from '../utils/carriers';

// 出荷管理（101270）の実データから、出荷ごとに「今どの段階か」を表示する。
// 段階は楽楽販売の項目（ステータス・輸入確認ステータス・通関完了日・配達完了日）から決める。

type Stage = 'waiting' | 'import_check' | 'in_transit' | 'domestic' | 'delivered';

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'waiting', label: '出荷待ち', hint: 'ステータスが出荷待ち' },
  { id: 'import_check', label: '輸入確認中', hint: '輸入確認ステータスが交付済み以外' },
  { id: 'in_transit', label: '輸送・通関中', hint: '出荷済みで通関完了日が空欄' },
  { id: 'domestic', label: '国内配送中', hint: '通関完了日あり・配達完了日が空欄' },
  { id: 'delivered', label: '配達完了', hint: '配達完了日あり' },
];

const IMPORT_IN_PROGRESS = ['下書き', '申請中', '決済待ち', '交付待ち', '差戻し'];

type TrackingShipment = ShipmentItem & {
  courier?: string;
  shipStatus?: string;
  deliveredDate?: string;
  customsClearedDate?: string;
  deliveryEta?: string;
  customsEta?: string;
  nextDeadline?: string;
  handlingMemo?: string;
  warehouseShippedDate?: string;
};

const blank = (v?: string) => !v || v === '—';

function stageOf(s: TrackingShipment): Stage {
  if (!blank(s.deliveredDate)) return 'delivered';
  if ((s.shipStatus || '').includes('出荷待ち')) return 'waiting';
  if (!blank(s.customsClearedDate)) return 'domestic';
  if (IMPORT_IN_PROGRESS.includes(s.importStatus)) return 'import_check';
  return 'in_transit';
}

function toDate(v?: string): Date | null {
  if (blank(v)) return null;
  const d = new Date(String(v).replace(/\//g, '-').slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function carrierTrackingUrl(courier: string | undefined, trackingNo: string): string | null {
  const digits = (trackingNo || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const c = (courier || '').toLowerCase();
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${digits}`;
  if (c.includes('dhl')) return `https://www.dhl.com/jp-ja/home/tracking.html?tracking-id=${digits}`;
  return null;
}

// 追跡の対象：出荷待ちと、出荷日から21日以内でまだ配達完了していない出荷、直近7日に配達完了した出荷
// 配達完了日がまだ楽楽販売で入力されていないため、出荷から21日を過ぎたものは表示しない
const ACTIVE_DAYS = 21;
const RECENT_DELIVERED_DAYS = 7;

export const ArrivalTrackingView: React.FC<{ orders: Order[]; shipments: ShipmentItem[] }> = ({ orders, shipments }) => {
  const [stageFilter, setStageFilter] = useUrlState<Stage | 'all'>('stage', 'all');
  const [warehouseFilter, setWarehouseFilter] = useUrlState<string>('wh', 'all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // 配送会社APIから取得した最新状況（追跡番号の数字 → 結果）
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus>>({});
  const [carrierLoading, setCarrierLoading] = useState(false);
  const [carrierMessage, setCarrierMessage] = useState<string | null>(null);
  const { rakurakuBaseUrl } = getConfiguredUrls();

  const clinicById = useMemo(() => {
    const m = new Map<string, string>();
    getLocalClinics().forEach((c) => c.clinicId && m.set(c.clinicId, c.clinicName));
    return m;
  }, []);

  const customerByOrder = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach((o) => m.set(o.orderId, o.customerName));
    return m;
  }, [orders]);

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (shipments as TrackingShipment[])
      .map((s) => ({ s, stage: stageOf(s), shipped: toDate(s.warehouseShippedDate) || toDate(s.shippedDate) }))
      .filter(({ s, stage, shipped }) => {
        if (stage === 'waiting') return true;
        if (stage === 'delivered') {
          const d = toDate(s.deliveredDate);
          return !!d && (today.getTime() - d.getTime()) / 86400000 <= RECENT_DELIVERED_DAYS;
        }
        return !!shipped && (today.getTime() - shipped.getTime()) / 86400000 <= ACTIVE_DAYS;
      })
      .map((x) => ({
        ...x,
        // 受注に紐づかない出荷（一括発注の店舗ごとの出荷など）は顧客IDから顧客マスタの名前を使う
        customerName:
          customerByOrder.get(x.s.orderId) ||
          (x.s.customerId ? clinicById.get(x.s.customerId) : '') ||
          '（クリニック名不明）',
      }))
      .sort((a, b) => (b.shipped?.getTime() || 0) - (a.shipped?.getTime() || 0));
  }, [shipments, customerByOrder, clinicById]);

  const warehouses = useMemo(
    () => Array.from(new Set(items.map((i) => i.s.warehouse).filter((w) => !blank(w)))) as string[],
    [items]
  );

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { waiting: 0, import_check: 0, in_transit: 0, domestic: 0, delivered: 0 };
    items.forEach((i) => c[i.stage]++);
    return c;
  }, [items]);

  const visible = items.filter((i) => {
    if (stageFilter !== 'all' && i.stage !== stageFilter) return false;
    if (warehouseFilter !== 'all' && i.s.warehouse !== warehouseFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [i.customerName, i.s.shipmentId, i.s.orderId, i.s.trackingNo].some((v) => (v || '').toLowerCase().includes(q));
  });

  // 表示中の出荷（最大120件）について、配送会社の最新状況を取得する
  const loadCarrierStatus = async () => {
    setCarrierLoading(true);
    setCarrierMessage(null);
    try {
      const items = visible
        .slice(0, 120)
        .filter((v) => digitsOf(v.s.trackingNo).length >= 8)
        .map((v) => ({ trackingNo: v.s.trackingNo, courier: v.s.courier }));
      const json = await fetchCarrierStatuses(items);
      const map: Record<string, CarrierStatus> = { ...carrierStatus };
      json.results.forEach((r) => (map[r.trackingNo] = r));
      setCarrierStatus(map);
      const errs = Object.values(json.errors);
      setCarrierMessage(
        errs.length > 0
          ? errs.join('／') + '（メニュー「配送会社API連携」で設定できます）'
          : `${json.results.length}件の最新状況を取得しました`
      );
    } catch (e: any) {
      setCarrierMessage(`取得できませんでした：${e?.message || e}`);
    } finally {
      setCarrierLoading(false);
    }
  };

  const copyAndOpen = (shipmentId: string) => {
    openRakurakuWithCopiedId(rakurakuBaseUrl, shipmentId);
    setCopied(shipmentId);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">到着トラッキング</h2>
          <p className="text-xs text-slate-500 mt-1">
            楽楽販売の出荷管理から、出荷ごとに今どの段階かを表示します。対象は出荷待ちと、出荷から{ACTIVE_DAYS}日以内でまだ配達完了していない出荷、直近{RECENT_DELIVERED_DAYS}日に配達完了した出荷です。
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STAGES.map((st) => (
            <button
              key={st.id}
              type="button"
              title={st.hint}
              onClick={() => setStageFilter(stageFilter === st.id ? 'all' : st.id)}
              className={`text-left p-3 rounded-xl border ${stageFilter === st.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <span className="text-[11px] font-semibold text-slate-600 block">{st.label}</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{counts[st.id]}</span>
              <span className="text-[10px] text-slate-500 ml-1">件</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">すべての出荷元</option>
            {warehouses.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="クリニック名・出荷ID・受注ID・追跡番号"
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
            />
          </div>
          <span className="text-xs text-slate-500">{visible.length}件</span>
          <button
            type="button"
            onClick={loadCarrierStatus}
            disabled={carrierLoading}
            className="ml-auto px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carrierLoading ? 'animate-spin' : ''}`} /> 配送会社から最新状況を取得
          </button>
        </div>
        {carrierMessage && <p className="text-xs text-slate-600">{carrierMessage}</p>}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          {shipments.length === 0 ? '出荷管理のデータを読み込めていません' : '該当する出荷はありません'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.slice(0, 300).map(({ s, stage, customerName }) => {
            const stageIndex = STAGES.findIndex((x) => x.id === stage);
            const trackUrl = carrierTrackingUrl(s.courier, s.trackingNo);
            const coolPending = s.isCoolMissing;
            return (
              <div key={s.shipmentId} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {s.shipmentId} ／ {s.orderId && s.orderId !== '—' ? `受注 ${s.orderId}` : '受注の紐づけなし'}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-900 text-white shrink-0">
                    {STAGES[stageIndex].label}
                  </span>
                </div>

                {/* 段階のバー */}
                <div>
                  <div className="flex gap-1">
                    {STAGES.map((st, i) => (
                      <div
                        key={st.id}
                        className={`h-1.5 flex-1 rounded-full ${i <= stageIndex ? (stage === 'delivered' ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    {STAGES.map((st) => (
                      <span key={st.id}>{st.label}</span>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>出荷元 {blank(s.warehouse) ? '—' : s.warehouse}</span>
                  <span>到着空港 {blank(s.arrivalAirport) ? '—' : s.arrivalAirport}</span>
                  <span>出荷日 {blank(s.warehouseShippedDate) ? (blank(s.shippedDate) ? '—' : s.shippedDate) : s.warehouseShippedDate}</span>
                  <span>輸入確認 {blank(s.importStatus) ? '—' : s.importStatus}</span>
                  {!blank(s.customsEta) && stageIndex < 3 && <span>通関予定 {s.customsEta}</span>}
                  {!blank(s.deliveryEta) && stageIndex < 4 && <span>配達予定 {s.deliveryEta}</span>}
                  {!blank(s.deliveredDate) && <span className="text-emerald-700 font-bold">配達完了 {s.deliveredDate}</span>}
                  {!blank(s.nextDeadline) && <span className="text-amber-700 font-bold">次の期限 {s.nextDeadline}</span>}
                </div>

                {carrierStatus[digitsOf(s.trackingNo)] && (
                  <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${CARRIER_STATUS_STYLE[carrierStatus[digitsOf(s.trackingNo)].status]}`}>
                      {s.courier || '配送会社'}：{CARRIER_STATUS_LABEL[carrierStatus[digitsOf(s.trackingNo)].status]}
                    </span>
                    <span className="text-slate-600">{carrierStatus[digitsOf(s.trackingNo)].statusText}</span>
                    {carrierStatus[digitsOf(s.trackingNo)].lastLocation && (
                      <span className="text-slate-500">／ {carrierStatus[digitsOf(s.trackingNo)].lastLocation}</span>
                    )}
                  </div>
                )}

                {coolPending && (
                  <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1">
                    <Snowflake className="w-3 h-3" />
                    クール手配が未完了（申請 {s.coolApplicationStatus}／委任状 {s.powerOfAttorneyStatus}／伝票 {s.slipStatus}）
                  </div>
                )}
                {!blank(s.handlingMemo) && <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2 py-1">{s.handlingMemo}</div>}

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 min-w-0">
                    <Truck className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {s.courier || '配送業者未設定'} {blank(s.trackingNo) ? '' : s.trackingNo}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {trackUrl && (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-[11px] font-bold text-slate-700 flex items-center gap-1"
                      >
                        配送状況 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => copyAndOpen(s.shipmentId)}
                      className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1"
                      title="出荷IDをコピーして楽楽販売を開きます"
                    >
                      <Copy className="w-3 h-3" />
                      {copied === s.shipmentId ? 'コピー済み' : '楽楽販売で開く'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {visible.length > 300 && (
        <p className="text-xs text-slate-500 text-center">表示は新しい順に300件までです。出荷元や検索で絞り込んでください。</p>
      )}
    </div>
  );
};
