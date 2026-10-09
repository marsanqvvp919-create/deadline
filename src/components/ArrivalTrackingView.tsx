import React, { useEffect, useMemo, useState } from 'react';
import { classifyNumber, carrierName, hintedCarrier, domesticTrackingUrl } from '../utils/trackingNumbers';
import { parseYmd, isShippingOrFee } from '../utils';
import { useUrlState } from '../utils/listState';
import { Order, ShipmentItem } from '../types';
import { getConfiguredUrls, getLocalClinics } from '../api';
import { openRakurakuWithCopiedId } from '../utils';
import { Search, Truck, ExternalLink, Snowflake, Copy, RefreshCw, AlertTriangle, Package, PackageCheck, Plane, ShieldCheck, CheckCircle2, HelpCircle, Link2Off } from 'lucide-react';
import { boxesOf, isHandCarried, summarizeBoxes, usableStatus } from '../utils/shipmentTracking';
import { BulkSummary, fetchBulkByOrder } from '../utils/bulk';
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
  // 手持ち（持参）で届けた出荷は、出荷した時点で配達完了
  if (isHandCarried(s)) return 'delivered';
  if (!blank(s.customsClearedDate) || c?.customsCleared) return 'domestic';
  if (IMPORT_IN_PROGRESS.includes(s.importStatus)) return 'import_check';
  return 'in_transit';
}

// 「今の状況」：楽楽販売の段階と配送会社の最新状況を合わせて、出荷ごとに1つに決める（一目でわかる表示用）
type NowStatus = 'attention' | 'waiting' | 'pickup' | 'abroad' | 'customs' | 'domestic' | 'partial' | 'delivered' | 'no_info' | 'bad_number' | 'not_linked';

const NOW_STATUS: Record<NowStatus, { label: string; hint: string; color: string; soft: string; border: string; Icon: React.FC<{ className?: string }> }> = {
  attention: { label: '要確認', hint: '配送会社が通関・配達の例外を返している', color: 'bg-rose-600 text-white', soft: 'bg-rose-50 text-rose-800 border-rose-200', border: 'border-l-rose-500', Icon: AlertTriangle },
  waiting: { label: '出荷待ち', hint: '楽楽販売のステータスが出荷待ち', color: 'bg-slate-500 text-white', soft: 'bg-slate-50 text-slate-700 border-slate-200', border: 'border-l-slate-400', Icon: Package },
  pickup: { label: '集荷待ち', hint: '送り状は作成済み。配送会社の集荷前', color: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-800 border-amber-200', border: 'border-l-amber-400', Icon: Package },
  abroad: { label: '海外から輸送中', hint: '配送会社が輸送中（まだ日本の拠点に着いていない）', color: 'bg-indigo-600 text-white', soft: 'bg-indigo-50 text-indigo-800 border-indigo-200', border: 'border-l-indigo-500', Icon: Plane },
  customs: { label: '日本で通関中', hint: '日本の拠点に到着し、通関が終わっていない', color: 'bg-blue-600 text-white', soft: 'bg-blue-50 text-blue-800 border-blue-200', border: 'border-l-blue-500', Icon: ShieldCheck },
  domestic: { label: '国内配送中', hint: '通関が終わり、配達前', color: 'bg-teal-600 text-white', soft: 'bg-teal-50 text-teal-800 border-teal-200', border: 'border-l-teal-500', Icon: Truck },
  partial: { label: '一部配達', hint: '複数口の出荷で、一部の箱だけ配達完了（残りの箱の追跡番号は楽楽販売の対応メモ）', color: 'bg-lime-600 text-white', soft: 'bg-lime-50 text-lime-800 border-lime-200', border: 'border-l-lime-500', Icon: PackageCheck },
  delivered: { label: '配達完了', hint: '配送会社または楽楽販売で配達完了', color: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 text-emerald-800 border-emerald-200', border: 'border-l-emerald-500', Icon: CheckCircle2 },
  no_info: { label: '未取得', hint: 'APIでつないでいる配送会社の出荷で、まだ状況を取得していない（DHL は2時間ごとに自動で取得）', color: 'bg-slate-200 text-slate-700', soft: 'bg-slate-50 text-slate-600 border-slate-200', border: 'border-l-slate-300', Icon: HelpCircle },
  bad_number: { label: '番号の誤り?', hint: 'DHL・FedEx のどちらにも該当がない追跡番号（入力ミスの可能性）', color: 'bg-fuchsia-600 text-white', soft: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200', border: 'border-l-fuchsia-500', Icon: AlertTriangle },
  not_linked: { label: 'API対象外', hint: 'ヤマト・佐川などの国内配送、国際郵便、追跡番号がない出荷など、DHL・FedEx のAPIで追えない出荷', color: 'bg-slate-100 text-slate-600', soft: 'bg-slate-50 text-slate-500 border-slate-200', border: 'border-l-slate-200', Icon: Link2Off },
};
const NOW_ORDER: NowStatus[] = ['attention', 'waiting', 'pickup', 'abroad', 'customs', 'domestic', 'partial', 'delivered', 'no_info', 'bad_number', 'not_linked'];

// 段階は配送会社APIの結果を優先する（配達完了 → 配達完了、配達中・国内配送店に到着 → 国内配送中、通関 → 日本で通関中）
function nowStatusOf(stage: Stage, c: CarrierStatus | undefined, lookup: LookupKind, partial = false): NowStatus {
  if (c?.status === 'exception') return 'attention';
  if (partial) return 'partial';
  if (stage === 'delivered') return 'delivered';
  if (stage === 'waiting') return 'waiting';
  if (stage === 'domestic' || c?.domestic) return 'domestic';
  if (c?.status === 'pre_transit') return 'pickup';
  if (c?.status === 'in_transit') return c.arrivedJapan ? 'customs' : 'abroad';
  if (lookup === 'not_found') return 'bad_number';
  if (lookup === 'pending') return 'no_info';
  return 'not_linked';
}

// 出荷の追跡番号の照会結果：found（どれかの箱が取れた）・pending（まだ照会していない）・not_found（両社とも該当なし）・none（照会しない）
type LookupKind = 'found' | 'pending' | 'not_found' | 'none';
function lookupKindOf(boxes: string[], statuses: Record<string, CarrierStatus>): LookupKind {
  if (boxes.length === 0) return 'none';
  const ls = boxes.map((d) => statuses[d]?.lookup || (statuses[d] ? 'found' : classifyNumber(d).primary ? 'pending' : 'invalid'));
  if (ls.includes('found')) return 'found';
  if (ls.includes('pending') || ls.includes('retrying')) return 'pending';
  if (ls.includes('not_found') || ls.includes('invalid')) return 'not_found';
  return 'none';
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
// 並び順
type SortKey = 'status' | 'newest' | 'oldest' | 'eta' | 'idle' | 'clinic';
const SORT_LABEL: Record<SortKey, string> = {
  status: '並び順：状況（要確認が先）',
  newest: '並び順：出荷日が新しい順',
  oldest: '並び順：出荷日が古い順',
  eta: '並び順：配達予定が近い順',
  idle: '並び順：最終スキャンが古い順（止まっている順）',
  clinic: '並び順：クリニック名順',
};
type SortItem = { now: NowStatus; c?: CarrierStatus; shipped: Date | null; customerName: string };
const time = (v?: string | null) => (v ? new Date(v).getTime() || 0 : 0);
const SORTERS: Record<SortKey, (a: SortItem, b: SortItem) => number> = {
  status: (a, b) => NOW_ORDER.indexOf(a.now) - NOW_ORDER.indexOf(b.now) || (b.shipped?.getTime() || 0) - (a.shipped?.getTime() || 0),
  newest: (a, b) => (b.shipped?.getTime() || 0) - (a.shipped?.getTime() || 0),
  oldest: (a, b) => (a.shipped?.getTime() || Infinity) - (b.shipped?.getTime() || Infinity),
  eta: (a, b) => (time(a.c?.estimatedDelivery) || Infinity) - (time(b.c?.estimatedDelivery) || Infinity),
  idle: (a, b) => (time(a.c?.lastEventAt) || Infinity) - (time(b.c?.lastEventAt) || Infinity),
  clinic: (a, b) => a.customerName.localeCompare(b.customerName, 'ja'),
};

const ymd = (v?: string) => (v ? String(v).slice(0, 10).replace(/-/g, '/') : '');

function toDate(v?: string): Date | null {
  if (blank(v)) return null;
  return parseYmd(String(v));
}

// 運送会社は追跡番号の形（と照会の結果）で決める。楽楽販売の「配送業者」と違えば「配送業者の登録違い」
function carrierOf(s: TrackingShipment, c: CarrierStatus | undefined, boxes: string[]) {
  const first = boxes[0];
  const code = c?.carrier || (first ? classifyNumber(first).primary : null);
  const label = isHandCarried(s) ? '手持ち（持参）' : carrierName(code) || s.courier || '配送業者未設定';
  const hint = hintedCarrier(s.courier);
  const url =
    first && code === 'fedex'
      ? `https://www.fedex.com/fedextrack/?trknbr=${first}`
      : first && code === 'dhl'
        ? `https://www.dhl.com/jp-ja/home/tracking.html?tracking-id=${first}`
        : first
          ? domesticTrackingUrl(code || hintedCarrier(s.courier), first)
          : null;
  const intl = (x: string | null | undefined) => x === 'dhl' || x === 'fedex';
  return { label, url, mismatch: !!(hint && code && c && intl(hint) && intl(code) && hint !== code) };
}

// 追跡の対象：出荷待ちと、出荷日から21日以内でまだ配達完了していない出荷、直近7日に配達完了した出荷
// 配達完了日がまだ楽楽販売で入力されていないため、出荷から21日を過ぎたものは表示しない
const ACTIVE_DAYS = 21;
const RECENT_DELIVERED_DAYS = 7;

export const ArrivalTrackingView: React.FC<{
  orders: Order[];
  shipments: ShipmentItem[];
  onSelectOrder?: (order: Order, lineKey?: string) => void;
}> = ({ orders, shipments, onSelectOrder }) => {
  const [stageFilter, setStageFilter] = useUrlState<NowStatus | 'all'>('now', 'all');
  const [warehouseFilter, setWarehouseFilter] = useUrlState<string>('wh', 'all');
  const [sortKey, setSortKey] = useUrlState<SortKey>('sort', 'status');
  // カードごとの更新中の出荷ID
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // 配送会社APIから取得した最新状況（追跡番号の数字 → 結果）
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus>>({});
  const [carrierLoading, setCarrierLoading] = useState(false);
  const [carrierMessage, setCarrierMessage] = useState<string | null>(null);
  const [dhlInfo, setDhlInfo] = useState<CarrierStatusSnapshot['dhl'] | null>(null);
  const [fedexInfo, setFedexInfo] = useState<CarrierStatusSnapshot['fedex'] | null>(null);
  // 最初は要対応（例外・3日以上動きなし・直近3日に配達完了）だけを出す。ほかは絞り込みとページ分けで見る
  const [view, setView] = useUrlState<'focus' | 'all'>('view', 'focus');
  const [repFilter, setRepFilter] = useUrlState<string>('rep2', 'all');
  const [issueFilter, setIssueFilter] = useUrlState<'' | 'mismatch' | 'bad' | 'scope'>('issue', '');
  const [page, setPage] = useState(0);
  const { rakurakuBaseUrl } = getConfiguredUrls();
  // 一括発注の配送で院ごとに追跡している受注（楽楽販売の出荷には追跡番号がない）
  const [bulkByOrder, setBulkByOrder] = useState<Map<string, BulkSummary>>(new Map());
  useEffect(() => {
    fetchBulkByOrder().then(setBulkByOrder);
  }, []);

  // 画面を開いたら、サーバーが自動取得した最新状況を読み込む（配送会社には問い合わせない）
  // 開いたまま置いておいても新しい結果が出るよう、5分ごとと、画面に戻ってきたときにも読み直す
  useEffect(() => {
    const load = () =>
      fetchSavedCarrierStatuses().then((snap) => {
        if (!snap) return;
        const map: Record<string, CarrierStatus> = {};
        snap.statuses.forEach((r) => (map[r.trackingNo] = r));
        // 取得日時の新しいほうを使う
        setCarrierStatus((prev) => {
          const next = { ...prev };
          Object.values(map).forEach((r) => {
            const old = next[r.trackingNo];
            if (!old || new Date(r.fetchedAt) >= new Date(old.fetchedAt)) next[r.trackingNo] = r;
          });
          return next;
        });
        setDhlInfo(snap.dhl);
        setFedexInfo(snap.fedex || null);
      });
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
  const repByOrder = useMemo(() => new Map(orders.map((o) => [o.orderId, o.salesRep])), [orders]);
  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach((o) => o.lines.forEach((l) => l.productId && !m.has(l.productId) && m.set(l.productId, l.productName)));
    return m;
  }, [orders]);
  // 受注に紐づかない出荷で、押して中身を開いている出荷ID
  const [expanded, setExpanded] = useState<string | null>(null);

  // この出荷の中身：明細の受注ID・商品ID（出荷管理の明細）から、受注日と商品名・数量を出す
  const contentsOf = (s: TrackingShipment) => {
    const refs: { orderId: string; productId: string }[] = ((s as any).lineRefs || []).filter((r: any) => r?.productId);
    const orderIds = Array.from(new Set([...(refs.map((r) => r.orderId).filter(Boolean)), s.orderId].filter((id) => id && id !== '—')));
    const ordersHere = orderIds.map((id) => orderById.get(id)).filter((o): o is Order => !!o);
    const items =
      refs.length > 0
        ? refs.map((r) => {
            const line = orderById.get(r.orderId)?.lines.find((l) => l.productId === r.productId);
            return { name: line?.productName || productNameById.get(r.productId) || `商品ID ${r.productId}`, qty: line?.quantity, lineKey: line?.lineKey, orderId: r.orderId };
          })
        : (ordersHere[0]?.lines || [])
            .filter((l) => !isShippingOrFee(l.productName, l.productId))
            .map((l) => ({ name: l.productName, qty: l.quantity, lineKey: l.lineKey, orderId: ordersHere[0].orderId }));
    return { order: ordersHere[0], orderDates: ordersHere.map((o) => o.orderDate).filter(Boolean), items };
  };

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (shipments as TrackingShipment[])
      .map((s) => {
        // 配送会社で「見つからない」だった番号は、状況がないものとして扱う
        // 複数口は箱ごとの状況をまとめる（全部届いたら配達完了、一部なら一部配達）
        const box = summarizeBoxes(s, carrierStatus);
        const c = box.rep;
        const stage = stageOf(s, c);
        const boxes = boxesOf(s);
        const lookup = lookupKindOf(boxes, carrierStatus);
        const carrier = carrierOf(s, c, boxes);
        const rep = repByOrder.get(s.orderId) || '';
        const bulk = boxes.length === 0 && (s.shipStatus || '').includes('出荷済') ? bulkByOrder.get(s.orderId) : undefined;
        // 一括発注：全院に届いたら配達完了、それまでは国内配送中として扱う
        const bulkStage: Stage | null = bulk ? (bulk.total > 0 && bulk.delivered >= bulk.total ? 'delivered' : 'domestic') : null;
        const st = bulkStage || stage;
        return { s, c, box, boxes, lookup, carrier, rep, bulk, stage: st, now: bulkStage === 'delivered' ? 'delivered' as NowStatus : bulkStage ? 'domestic' as NowStatus : nowStatusOf(stage, c, lookup, box.partial), shipped: toDate(s.warehouseShippedDate) || toDate(s.shippedDate) };
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
  }, [shipments, customerByOrder, clinicById, carrierStatus, repByOrder]);


  const warehouses = useMemo(
    () => Array.from(new Set(items.map((i) => i.s.warehouse).filter((w) => !blank(w)))) as string[],
    [items]
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(NOW_ORDER.map((k) => [k, 0])) as Record<NowStatus, number>;
    items.forEach((i) => c[i.now]++);
    return c;
  }, [items]);

  const reps = useMemo(() => Array.from(new Set(items.map((i) => i.rep).filter(Boolean))).sort(), [items]);

  // 要対応：キャリア例外・最終スキャンから3日以上動きなし・直近3日に配達完了
  const focusOf = (i: (typeof items)[number]) => {
    if (i.now === 'attention') return true;
    const c = i.c;
    if (c && c.status !== 'delivered' && c.lastEventAt && Date.now() - new Date(c.lastEventAt).getTime() >= 3 * 86400000) return true;
    if (i.now === 'delivered') {
      const d = toDate(i.s.deliveredDate) || toDate(c?.deliveredAt || c?.lastEventAt);
      return !!d && Date.now() - d.getTime() <= 3 * 86400000;
    }
    return false;
  };
  const focusCount = useMemo(() => items.filter(focusOf).length, [items]);
  const issueCounts = useMemo(
    () => ({
      mismatch: items.filter((i) => i.carrier.mismatch).length,
      bad: items.filter((i) => i.now === 'bad_number').length,
      scope: items.filter((i) => i.now === 'not_linked').length,
    }),
    [items]
  );

  // 絞り込み（状況・問題・出荷元・担当・検索）を選んだら「すべて」から探す
  const narrowed = stageFilter !== 'all' || issueFilter !== '' || warehouseFilter !== 'all' || repFilter !== 'all' || !!query.trim();
  const visible = useMemo(
    () =>
      items
        .filter((i) => {
          if (view === 'focus' && !narrowed && !focusOf(i)) return false;
          if (stageFilter !== 'all' && i.now !== stageFilter) return false;
          if (issueFilter === 'mismatch' && !i.carrier.mismatch) return false;
          if (issueFilter === 'bad' && i.now !== 'bad_number') return false;
          if (issueFilter === 'scope' && i.now !== 'not_linked') return false;
          if (warehouseFilter !== 'all' && i.s.warehouse !== warehouseFilter) return false;
          if (repFilter !== 'all' && i.rep !== repFilter) return false;
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return [i.customerName, i.s.shipmentId, i.s.orderId, i.s.trackingNo].some((v) => (v || '').toLowerCase().includes(q));
        })
        .sort(SORTERS[sortKey] || SORTERS.status),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, view, narrowed, stageFilter, issueFilter, warehouseFilter, repFilter, query, sortKey]
  );
  const PAGE_SIZE = 50;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => setPage(0), [view, stageFilter, issueFilter, warehouseFilter, repFilter, query, sortKey]);
  const pageItems = visible.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // カードの更新ボタン：その出荷の箱だけを配送会社に問い合わせる
  const refreshOne = async (s: TrackingShipment) => {
    const nos = boxesOf(s);
    if (nos.length === 0) return;
    setRefreshing((r) => ({ ...r, [s.shipmentId]: true }));
    try {
      const json = await fetchCarrierStatuses(
        nos.slice(0, 5).map((n) => ({ trackingNo: n, courier: s.courier })),
        true
      );
      setCarrierStatus((prev) => {
        const next = { ...prev };
        json.results.forEach((r) => (next[r.trackingNo] = r));
        return next;
      });
      const errs = Object.values(json.errors || {});
      if (errs.length > 0) setCarrierMessage(`${s.shipmentId}：${errs.join('／')}`);
    } catch (e: any) {
      setCarrierMessage(`${s.shipmentId}：取得できませんでした（${e?.message || e}）`);
    } finally {
      setRefreshing((r) => ({ ...r, [s.shipmentId]: false }));
    }
  };

  // 表示中の出荷（最大120件）について、配送会社の最新状況を取得する
  const loadCarrierStatus = async () => {
    setCarrierLoading(true);
    setCarrierMessage(null);
    try {
      // 今のページの出荷の箱（複数口も含む）を問い合わせる
      const items = pageItems
        .flatMap((v) => v.boxes.map((n) => ({ trackingNo: n, courier: v.s.courier })))
        .slice(0, 120);
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
        {/* 最初は要対応だけ。「すべて」で全件を絞り込み・ページ分けで見る */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
            {([
              ['focus', `要対応 ${focusCount}件`, '配送会社の例外・最終スキャンから3日以上動きなし・直近3日に配達完了'],
              ['all', `すべて ${items.length}件`, '段階・出荷元・担当で絞り込み、50件ずつ表示'],
            ] as const).map(([k, label, hint]) => (
              <button
                key={k}
                type="button"
                title={hint}
                onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === k ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {([
            ['mismatch', '配送業者の登録違い', issueCounts.mismatch, '追跡番号の形と楽楽販売の「配送業者」が違う（照会は番号の形で行っています）'],
            ['bad', '追跡番号の誤りの可能性', issueCounts.bad, 'DHL・FedEx のどちらにも該当がない'],
            ['scope', 'API対象外', issueCounts.scope, '国内配送（12桁で7・8始まりでない番号）・国際郵便・番号なしなど'],
          ] as const).map(([k, label, n, hint]) => (
            <button
              key={k}
              type="button"
              title={hint}
              onClick={() => setIssueFilter(issueFilter === k ? '' : k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                issueFilter === k ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200'
              } ${n === 0 ? 'opacity-50' : ''}`}
            >
              {label} {n}件
            </button>
          ))}
        </div>

        {/* 今の状況ごとの件数（全件で数える。押すと絞り込み） */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">すべての担当</option>
            {reps.map((r) => (
              <option key={r} value={r}>
                {r}
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
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
            title="並び順"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">{visible.length}件</span>
          <button
            type="button"
            onClick={loadCarrierStatus}
            disabled={carrierLoading}
            className="ml-auto px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carrierLoading ? 'animate-spin' : ''}`} /> このページの最新状況を取得
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fedexInfo?.autoEnabled && (
            <span className={fedexInfo.lastError ? 'text-rose-700 font-bold' : 'text-slate-500'}>
              {fedexInfo.lastError
                ? `FedEx の自動取得でエラー：${fedexInfo.lastError}（配送会社API連携で確認してください）`
                : `FedEx は2時間ごとに自動で取得しています（最終 ${fedexInfo.lastAutoRunAt ? new Date(fedexInfo.lastAutoRunAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—'}）`}
            </span>
          )}
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
          {pageItems.map(({ s, c, box, boxes, carrier, now, customerName, bulk }) => {
            const st = NOW_STATUS[now];
            const trackUrl = carrier.url;
            const coolPending = s.isCoolMissing;
            const eta = c && c.status !== 'delivered' ? ymd(c.estimatedDelivery) : '';
            const deliveredOn = now === 'delivered' ? ymd(c?.deliveredAt || c?.lastEventAt) || ymd(s.deliveredDate) : '';
            const shippedOn = blank(s.warehouseShippedDate) ? (blank(s.shippedDate) ? '' : s.shippedDate) : s.warehouseShippedDate;
            const contents = contentsOf(s);
            return (
              <div key={s.shipmentId} className={`group bg-white border border-slate-200 border-l-4 ${st.border} rounded-2xl shadow-xs flex flex-col overflow-hidden`}>
                {/* 今の状況（いちばん大きく） */}
                <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${st.color}`}>
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <st.Icon className="w-4 h-4" />
                    {st.label}
                    {box.total > 1 && (
                      <span className="text-xs font-bold opacity-90">（{box.delivered}/{box.total}箱 配達）</span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-right">
                    {deliveredOn ? `${deliveredOn} 配達` : eta ? `配達予定 ${eta}` : !blank(s.deliveryEta) ? `配達予定 ${s.deliveryEta}` : ''}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  {/* 押すと伝票の詳細（いつ受注の、どんな商品か）を開く */}
                  <button
                    type="button"
                    onClick={() => {
                      if (contents.order && onSelectOrder) onSelectOrder(contents.order, contents.items.find((i) => i.lineKey)?.lineKey);
                      else setExpanded(expanded === s.shipmentId ? null : s.shipmentId);
                    }}
                    className="min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-slate-50 group"
                    title={contents.order ? '押すと伝票の詳細を開きます' : '押すと出荷の中身を表示します'}
                  >
                    <div className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-700">{customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {s.shipmentId} ／ {s.orderId && s.orderId !== '—' ? `受注 ${s.orderId}` : '受注の紐づけなし'}
                    </div>
                    <div className="text-[11px] text-slate-700 mt-1">
                      {contents.orderDates.length > 0 && <span className="font-bold">受注日 {contents.orderDates.map((d) => d.replace(/-/g, '/')).join('・')}　</span>}
                      {contents.items.length > 0 ? (
                        <span>
                          {contents.items
                            .slice(0, 2)
                            .map((i) => `${i.name}${i.qty ? ` ×${i.qty}` : ''}`)
                            .join('、')}
                          {contents.items.length > 2 && ` ほか${contents.items.length - 2}点`}
                        </span>
                      ) : (
                        <span className="text-slate-400">商品の情報なし</span>
                      )}
                      <span className="text-blue-600 font-bold ml-1">{contents.order ? '詳細 ›' : expanded === s.shipmentId ? '閉じる' : '中身 ›'}</span>
                    </div>
                  </button>
                  {expanded === s.shipmentId && !contents.order && (
                    <ul className="text-[11px] text-slate-700 bg-slate-50 rounded-lg px-3 py-2 space-y-0.5 list-disc list-inside">
                      {contents.items.length > 0 ? (
                        contents.items.map((i, idx) => (
                          <li key={idx}>
                            {i.name}
                            {i.qty ? ` ×${i.qty}` : ''}
                            {i.orderId && <span className="text-slate-400 font-mono ml-1">（受注 {i.orderId}）</span>}
                          </li>
                        ))
                      ) : (
                        <li>楽楽販売の出荷管理に明細がありません</li>
                      )}
                    </ul>
                  )}

                  {/* 配送会社の最新の記録 */}
                  {c ? (
                    <div className={`text-[11px] rounded-lg border px-2.5 py-1.5 ${st.soft}`}>
                      <div className="font-bold">{c.statusText}</div>
                      <div className="opacity-80">
                        {[c.lastLocation, c.lastEventAt ? ago(c.lastEventAt) : ''].filter(Boolean).join('・')}
                      </div>
                    </div>
                  ) : (
                    (now === 'no_info' || now === 'not_linked' || now === 'bad_number') && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        {now === 'no_info' && boxes.some((d) => carrierStatus[d]?.lookup === 'retrying')
                          ? (() => {
                              const r = boxes.map((d) => carrierStatus[d]).find((c) => c?.lookup === 'retrying')!;
                              return `${carrierName(r.carrier)}の照会が、運送会社側の一時的な不具合（メンテナンスなど）で失敗しました。時間をおいて自動で取り直します`;
                            })()
                          : now === 'no_info'
                          ? carrier.label === 'DHL'
                            ? dhlInfo && dhlInfo.usedToday >= dhlInfo.budget - 40
                              ? `DHL の今日の取得回数（${dhlInfo.usedToday}/${dhlInfo.budget}回）が上限近くのため、自動取得は明日の朝7時以降になります。急ぐときは右下の更新ボタンで取得できます（残り${Math.max(0, dhlInfo.budget - dhlInfo.usedToday)}回）`
                              : 'DHL の状況はまだ取得していません（2時間ごとの自動取得で順番に取得します。急ぐときは右下の更新ボタン）'
                            : `${carrier.label} の状況はまだ取得していません（上のボタンで取得）`
                          : now === 'bad_number'
                            ? '追跡番号の誤りの可能性：どの運送会社にも該当がありません。楽楽販売の追跡番号を確認してください'
                            : boxes.length === 0
                              ? '追跡番号がありません（または国際郵便など、DHL・FedEx 以外の番号）'
                              : '国内配送（佐川・ヤマトなど）の番号の可能性があります。「配送会社API連携」で荷物追跡APIを設定すると状況を取得します'}
                      </div>
                    )
                  )}

                  {bulk && (
                    <div className="text-[11px] text-indigo-800 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                      一括発注の配送「{bulk.title}」で院ごとに追跡しています（{bulk.total}院のうち配達完了 {bulk.delivered}院）
                    </div>
                  )}

                  <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <span>出荷日 {shippedOn || '—'}</span>
                    <span>出荷元 {blank(s.warehouse) ? '—' : s.warehouse}</span>
                    <span>到着空港 {blank(s.arrivalAirport) ? '—' : s.arrivalAirport}</span>
                    <span>輸入確認 {blank(s.importStatus) ? '—' : s.importStatus}</span>
                    {box.total > 1 && (
                      <span className="col-span-2 font-mono text-[10px] text-slate-500">
                        残りの箱 {(s.extraTrackingNos || []).map((n) => `${n}${usableStatus(carrierStatus[n])?.status === 'delivered' ? '✓' : ''}`).join('、')}
                      </span>
                    )}
                    <span className="col-span-2 font-mono">
                      追跡 {carrier.label} {blank(s.trackingNo) ? '—' : s.trackingNo}
                      {carrier.mismatch && (
                        <span className="text-amber-700 font-bold font-sans" title="追跡番号は別の運送会社のものです。楽楽販売の値は書き換えていません">
                          （配送業者の登録違い：楽楽販売は{s.courier}）
                        </span>
                      )}
                    </span>
                    {!blank(s.nextDeadline) && <span className="text-amber-700 font-bold col-span-2">次の期限 {s.nextDeadline}</span>}
                  </div>

                {coolPending && (
                  <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1">
                    <Snowflake className="w-3 h-3" />
                    クール手配が未完了（申請 {s.coolApplicationStatus}／委任状 {s.powerOfAttorneyStatus}／伝票 {s.slipStatus}）
                  </div>
                )}
                {!blank(s.handlingMemo) && <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2 py-1">{s.handlingMemo}</div>}

                <div className="mt-auto flex items-center justify-end gap-2 pt-1">
                  {boxes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => refreshOne(s)}
                      disabled={!!refreshing[s.shipmentId]}
                      className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      title="この出荷の最新状況を配送会社から取得"
                      aria-label="この出荷の最新状況を取得"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing[s.shipmentId] ? 'animate-spin text-blue-600' : ''}`} />
                    </button>
                  )}
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
                      className="rakuraku-open-btn"
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
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold disabled:opacity-40"
          >
            前へ
          </button>
          <span className="text-slate-600">
            {currentPage + 1} / {pageCount} ページ（{visible.length}件）
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
};
