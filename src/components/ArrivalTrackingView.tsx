import React, { useEffect, useMemo, useState } from 'react';
import { detectCarrier, courierMismatch } from '../utils/tracking';
import { parseYmd } from '../utils';
import { useUrlState } from '../utils/listState';
import { Order, ShipmentItem } from '../types';
import { getConfiguredUrls, getLocalClinics } from '../api';
import { openRakurakuWithCopiedId } from '../utils';
import { Search, Truck, ExternalLink, Snowflake, Copy, RefreshCw, AlertTriangle, Package, Plane, ShieldCheck, CheckCircle2, HelpCircle } from 'lucide-react';
import { CARRIER_STATUS_LABEL, CARRIER_STATUS_STYLE, CarrierStatus, CarrierStatusSnapshot, digitsOf, fetchCarrierStatuses, fetchSavedCarrierStatuses } from '../utils/carriers';

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

// 段階は楽楽販売の項目を基本に、配送会社（DHLなど）の最新状況で先に進める
function stageOf(s: TrackingShipment, c?: CarrierStatus): Stage {
  if (!blank(s.deliveredDate) || c?.status === 'delivered') return 'delivered';
  if ((s.shipStatus || '').includes('出荷待ち')) return 'waiting';
  if (!blank(s.customsClearedDate) || c?.customsCleared) return 'domestic';
  if (IMPORT_IN_PROGRESS.includes(s.importStatus)) return 'import_check';
  return 'in_transit';
}

// 「今の状況」：楽楽販売の段階と配送会社の最新状況を合わせて、出荷ごとに1つに決める（一目でわかる表示用）
type NowStatus = 'attention' | 'waiting' | 'pickup' | 'abroad' | 'customs' | 'domestic' | 'delivered' | 'no_info';

const NOW_STATUS: Record<NowStatus, { label: string; hint: string; color: string; soft: string; border: string; Icon: React.FC<{ className?: string }> }> = {
  attention: { label: '要確認', hint: '配送会社が通関・配達の例外を返している', color: 'bg-rose-600 text-white', soft: 'bg-rose-50 text-rose-800 border-rose-200', border: 'border-l-rose-500', Icon: AlertTriangle },
  waiting: { label: '出荷待ち', hint: '楽楽販売のステータスが出荷待ち', color: 'bg-slate-500 text-white', soft: 'bg-slate-50 text-slate-700 border-slate-200', border: 'border-l-slate-400', Icon: Package },
  pickup: { label: '集荷待ち', hint: '送り状は作成済み。配送会社の集荷前', color: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-800 border-amber-200', border: 'border-l-amber-400', Icon: Package },
  abroad: { label: '海外から輸送中', hint: '配送会社が輸送中（まだ日本の拠点に着いていない）', color: 'bg-indigo-600 text-white', soft: 'bg-indigo-50 text-indigo-800 border-indigo-200', border: 'border-l-indigo-500', Icon: Plane },
  customs: { label: '日本で通関中', hint: '日本の拠点に到着し、通関が終わっていない', color: 'bg-blue-600 text-white', soft: 'bg-blue-50 text-blue-800 border-blue-200', border: 'border-l-blue-500', Icon: ShieldCheck },
  domestic: { label: '国内配送中', hint: '通関が終わり、配達前', color: 'bg-teal-600 text-white', soft: 'bg-teal-50 text-teal-800 border-teal-200', border: 'border-l-teal-500', Icon: Truck },
  delivered: { label: '配達完了', hint: '配送会社または楽楽販売で配達完了', color: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 text-emerald-800 border-emerald-200', border: 'border-l-emerald-500', Icon: CheckCircle2 },
  no_info: { label: '状況未取得', hint: '出荷済みだが、配送会社の状況をまだ取得していない（FedEx は未連携）', color: 'bg-slate-200 text-slate-700', soft: 'bg-slate-50 text-slate-600 border-slate-200', border: 'border-l-slate-300', Icon: HelpCircle },
};
const NOW_ORDER: NowStatus[] = ['attention', 'waiting', 'pickup', 'abroad', 'customs', 'domestic', 'delivered', 'no_info'];

function nowStatusOf(stage: Stage, c?: CarrierStatus): NowStatus {
  if (c?.status === 'exception') return 'attention';
  if (stage === 'delivered') return 'delivered';
  if (stage === 'waiting') return 'waiting';
  if (stage === 'domestic') return 'domestic';
  if (c?.status === 'pre_transit') return 'pickup';
  if (c?.status === 'in_transit') return c.arrivedJapan ? 'customs' : 'abroad';
  return 'no_info';
}

// 「3時間前」「2日前」
function ago(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `${min}分前`;
  if (min < 48 * 60) return `${Math.round(min / 60)}時間前`;
  return `${Math.round(min / 1440)}日前`;
}
const ymd = (v?: string) => (v ? String(v).slice(0, 10).replace(/-/g, '/') : '');

function toDate(v?: string): Date | null {
  if (blank(v)) return null;
  return parseYmd(String(v));
}

// 配送会社は番号の形を優先して判定する（楽楽販売の配送業者に入力違いがあるため）
function carrierOf(courier: string | undefined, trackingNo: string) {
  const digits = (trackingNo || '').replace(/\D/g, '');
  const info = detectCarrier(trackingNo, courier);
  const known = info.carrierCode === 'fedex' || info.carrierCode === 'dhl';
  return {
    label: known ? info.carrier : courier || '配送業者未設定',
    url: known && digits.length >= 8 ? info.trackingUrl : null,
    mismatch: courierMismatch(trackingNo, courier),
  };
}

// 追跡の対象：出荷待ちと、出荷日から21日以内でまだ配達完了していない出荷、直近7日に配達完了した出荷
// 配達完了日がまだ楽楽販売で入力されていないため、出荷から21日を過ぎたものは表示しない
const ACTIVE_DAYS = 21;
const RECENT_DELIVERED_DAYS = 7;

export const ArrivalTrackingView: React.FC<{ orders: Order[]; shipments: ShipmentItem[] }> = ({ orders, shipments }) => {
  const [stageFilter, setStageFilter] = useUrlState<NowStatus | 'all'>('now', 'all');
  const [warehouseFilter, setWarehouseFilter] = useUrlState<string>('wh', 'all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // 配送会社APIから取得した最新状況（追跡番号の数字 → 結果）
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus>>({});
  const [carrierLoading, setCarrierLoading] = useState(false);
  const [carrierMessage, setCarrierMessage] = useState<string | null>(null);
  const [dhlInfo, setDhlInfo] = useState<CarrierStatusSnapshot['dhl'] | null>(null);
  const { rakurakuBaseUrl } = getConfiguredUrls();

  // 画面を開いたら、サーバーが自動取得した最新状況を読み込む（配送会社には問い合わせない）
  useEffect(() => {
    fetchSavedCarrierStatuses().then((snap) => {
      if (!snap) return;
      const map: Record<string, CarrierStatus> = {};
      snap.statuses.forEach((r) => (map[r.trackingNo] = r));
      setCarrierStatus((prev) => ({ ...map, ...prev }));
      setDhlInfo(snap.dhl);
    });
  }, []);

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
      .map((s) => {
        const c = carrierStatus[digitsOf(s.trackingNo)];
        const stage = stageOf(s, c);
        return { s, c, stage, now: nowStatusOf(stage, c), shipped: toDate(s.warehouseShippedDate) || toDate(s.shippedDate) };
      })
      .filter(({ s, c, stage, shipped }) => {
        if (stage === 'waiting') return true;
        if (stage === 'delivered') {
          const d = toDate(s.deliveredDate) || toDate(c?.deliveredAt || c?.lastEventAt);
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
      // 要確認を先頭に、あとは新しい出荷から
      .sort(
        (a, b) =>
          Number(b.now === 'attention') - Number(a.now === 'attention') ||
          (b.shipped?.getTime() || 0) - (a.shipped?.getTime() || 0)
      );
  }, [shipments, customerByOrder, clinicById, carrierStatus]);


  const warehouses = useMemo(
    () => Array.from(new Set(items.map((i) => i.s.warehouse).filter((w) => !blank(w)))) as string[],
    [items]
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(NOW_ORDER.map((k) => [k, 0])) as Record<NowStatus, number>;
    items.forEach((i) => c[i.now]++);
    return c;
  }, [items]);

  const visible = items.filter((i) => {
    if (stageFilter !== 'all' && i.now !== stageFilter) return false;
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
      // 取得できた件数を先に出し、未設定・回数制限などのお知らせは後ろに添える
      const notes = errs.map((e) => (e.includes('未設定') ? `${e}（メニュー「配送会社API連携」で設定できます）` : e));
      setCarrierMessage([`${json.results.length}件の最新状況を取得しました`, ...notes].join('／'));
      fetchSavedCarrierStatuses().then((snap) => snap && setDhlInfo(snap.dhl));
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
        {/* 今の状況ごとの件数（押すと絞り込み） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {NOW_ORDER.map((k) => {
            const st = NOW_STATUS[k];
            const active = stageFilter === k;
            return (
              <button
                key={k}
                type="button"
                title={st.hint}
                onClick={() => setStageFilter(active ? 'all' : k)}
                className={`text-left p-2.5 rounded-xl border transition ${active ? `${st.color} border-transparent` : `${st.soft}`} ${counts[k] === 0 && !active ? 'opacity-50' : ''}`}
              >
                <span className="text-[11px] font-bold flex items-center gap-1">
                  <st.Icon className="w-3.5 h-3.5" />
                  {st.label}
                </span>
                <span className="text-2xl font-bold font-mono">{counts[k]}</span>
                <span className="text-[10px] ml-1 opacity-80">件</span>
              </button>
            );
          })}
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
            <input autoComplete="off"
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
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dhlInfo?.autoEnabled && (
            <span className="text-slate-500">
              DHL は2時間ごとに自動で取得しています（最終 {dhlInfo.lastAutoRunAt ? new Date(dhlInfo.lastAutoRunAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—'}・今日 {dhlInfo.usedToday}/{dhlInfo.budget}回）
            </span>
          )}
        </div>
        {carrierMessage && <p className="text-xs text-slate-600">{carrierMessage}</p>}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          {shipments.length === 0 ? '出荷管理のデータを読み込めていません' : '該当する出荷はありません'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.slice(0, 300).map(({ s, c, now, customerName }) => {
            const st = NOW_STATUS[now];
            const carrier = carrierOf(s.courier, s.trackingNo);
            const trackUrl = carrier.url;
            const coolPending = s.isCoolMissing;
            const eta = c && c.status !== 'delivered' ? ymd(c.estimatedDelivery) : '';
            const deliveredOn = now === 'delivered' ? ymd(c?.deliveredAt || c?.lastEventAt) || ymd(s.deliveredDate) : '';
            const shippedOn = blank(s.warehouseShippedDate) ? (blank(s.shippedDate) ? '' : s.shippedDate) : s.warehouseShippedDate;
            return (
              <div key={s.shipmentId} className={`bg-white border border-slate-200 border-l-4 ${st.border} rounded-2xl shadow-xs flex flex-col overflow-hidden`}>
                {/* 今の状況（いちばん大きく） */}
                <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${st.color}`}>
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <st.Icon className="w-4 h-4" />
                    {st.label}
                  </span>
                  <span className="text-xs font-bold text-right">
                    {deliveredOn ? `${deliveredOn} 配達` : eta ? `配達予定 ${eta}` : !blank(s.deliveryEta) ? `配達予定 ${s.deliveryEta}` : ''}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {s.shipmentId} ／ {s.orderId && s.orderId !== '—' ? `受注 ${s.orderId}` : '受注の紐づけなし'}
                    </div>
                  </div>

                  {/* 配送会社の最新の記録 */}
                  {c ? (
                    <div className={`text-[11px] rounded-lg border px-2.5 py-1.5 ${st.soft}`}>
                      <div className="font-bold">{c.statusText}</div>
                      <div className="opacity-80">
                        {[c.lastLocation, c.lastEventAt ? ago(c.lastEventAt) : ''].filter(Boolean).join('・')}
                      </div>
                    </div>
                  ) : (
                    now === 'no_info' && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        {carrier.label === 'DHL' ? 'DHL の状況はまだ取得していません（自動取得を待つか、上のボタンで取得）' : `${carrier.label} の状況は取得できません`}
                      </div>
                    )
                  )}

                  <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <span>出荷日 {shippedOn || '—'}</span>
                    <span>出荷元 {blank(s.warehouse) ? '—' : s.warehouse}</span>
                    <span>到着空港 {blank(s.arrivalAirport) ? '—' : s.arrivalAirport}</span>
                    <span>輸入確認 {blank(s.importStatus) ? '—' : s.importStatus}</span>
                    {!blank(s.nextDeadline) && <span className="text-amber-700 font-bold col-span-2">次の期限 {s.nextDeadline}</span>}
                  </div>

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
                      {carrier.label} {blank(s.trackingNo) ? '' : s.trackingNo}
                    </span>
                    {carrier.mismatch && (
                      <span className="text-amber-700 font-bold shrink-0" title="番号の形と、楽楽販売の配送業者が合いません">
                        （楽楽販売では{s.courier}）
                      </span>
                    )}
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
