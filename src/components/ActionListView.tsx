import React, { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { AlertItem, Order, ShipmentItem } from '../types';
import { useUrlState } from '../utils/listState';
import { isStaleUnpaid, STALE_UNPAID_DAYS } from '../utils/delayCalculation';
import { isShippingOrFee, openRakurakuWithCopiedId } from '../utils';
import { isQuoteOrder } from '../utils/salesCalculations';
import { getConfiguredUrls } from '../api';
import { boxesOf, isHandCarried } from '../utils/shipmentTracking';
import { CarrierStatus, fetchSavedCarrierStatuses } from '../utils/carriers';
import { carrierName, hintedCarrier } from '../utils/trackingNumbers';
import { BulkSummary, fetchBulkByOrder } from '../utils/bulk';

// やることリスト：楽楽販売のデータの抜け・止まっているものを、直す場所ごとにまとめる。
// 納期超過・配送の問題は「朝の納期会議」で扱うので、ここには入れない。

type RuleId = 'B1' | 'B2' | 'stuck_status' | 'no_supplier' | 'no_tracking' | 'bad_tracking' | 'wrong_carrier';

const RULES: { id: RuleId; label: string; description: string; fix: string; kind: 'order' | 'shipment' }[] = [
  { id: 'B1', label: '未発注（3日以上）', description: '受注日から3日以上たっても未発注の明細がある伝票', fix: '発注して、楽楽販売の発注管理に登録する', kind: 'order' },
  { id: 'B2', label: '納期未設定', description: '最短・最長納品予定日が未入力の明細がある伝票', fix: 'ご注文管理の明細に最短・最長納品予定日を入れる', kind: 'order' },
  { id: 'stuck_status', label: 'ステータスが止まっている', description: '明細はすべて出荷完了なのに、伝票のステータスが「受注済み」「発注済み」のまま', fix: 'ご注文管理のステータスを「出荷済み」にする', kind: 'order' },
  { id: 'no_supplier', label: '仕入先が空', description: '仕入先が入っていない明細がある伝票（発注先が分からない）', fix: 'ご注文管理の明細に仕入先を入れる', kind: 'order' },
  { id: 'no_tracking', label: '出荷済みなのに追跡番号なし', description: `出荷済みの出荷（${60}日以内）で、出荷番号・国際追跡番号・国内追跡番号がどれも空`, fix: '出荷管理の「国際追跡番号」か「国内追跡番号」に番号を入れる', kind: 'shipment' },
  { id: 'wrong_carrier', label: '配送業者の登録違い', description: '楽楽販売の「配送業者」と、追跡番号から分かった配送会社が違う出荷', fix: '出荷管理の「配送業者」を正しい会社に直す', kind: 'shipment' },
  { id: 'bad_tracking', label: '追跡番号が読めない', description: '出荷番号の桁数が合わず、自動で振り分けられなかった', fix: '出荷管理の「国際追跡番号」か「国内追跡番号」に正しい番号を入れる', kind: 'shipment' },
];

// 番号のない出荷のうち、手渡し・キャンセルなどの説明が書いてあるものは対象外
const NO_NUMBER_OK = /手渡し|手持ち|キャンセル|返金|ココミル|直送|引き取り|引取|納品済|買取/;
const NO_TRACKING_DAYS = 60;

interface Row {
  id: string; // 楽楽販売で開くときの ID（受注ID か 出荷ID）
  order?: Order;
  orderId: string;
  shipmentId?: string;
  clinic: string;
  salesRep: string;
  status: string;
  date: string;
  detail: string;
}

const daysAgo = (ymd?: string | null) => {
  const m = String(ymd || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Math.floor((Date.now() - t) / 86400000);
};

export const ActionListView: React.FC<{
  orders: Order[];
  alerts: AlertItem[];
  shipments: ShipmentItem[];
  onSelectOrder: (order: Order) => void;
  repFilter?: string;
  onClearRepFilter?: () => void;
}> = ({ orders, alerts, shipments, onSelectOrder, repFilter, onClearRepFilter }) => {
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const [rule, setRule] = useUrlState<string>('rule', 'B1');
  const [copied, setCopied] = useState<string | null>(null);
  const [irregular, setIrregular] = useState<{ shipmentId: string; trackingNo: string }[] | null>(null);
  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus> | null>(null);
  const [bulkByOrder, setBulkByOrder] = useState<Map<string, BulkSummary>>(new Map());
  useEffect(() => {
    fetchBulkByOrder().then(setBulkByOrder);
  }, []);
  useEffect(() => {
    fetchSavedCarrierStatuses().then((snap) => {
      const map: Record<string, CarrierStatus> = {};
      (snap?.statuses || []).forEach((r) => (map[r.trackingNo] = r));
      setCarrierStatus(map);
    });
  }, []);

  // 自動で振り分けられなかった追跡番号（サーバーが判定したもの）
  useEffect(() => {
    fetch('/api/rakuraku/split-tracking')
      .then((r) => r.json())
      .then((j) => setIrregular(Array.isArray(j?.irregular) ? j.irregular : []))
      .catch(() => setIrregular([]));
  }, []);

  // 受注から60日以上たって未入金の伝票は対象外
  const excludedOrderIds = useMemo(() => new Set(orders.filter((o) => isStaleUnpaid(o)).map((o) => o.orderId)), [orders]);

  const byRule = useMemo(() => {
    const result = {} as Record<RuleId, Row[]>;
    const orderRow = (o: Order | undefined, orderId: string, salesRep: string, n: number, unit: string): Row => ({
      id: orderId,
      order: o,
      orderId,
      clinic: o?.customerName || '—',
      salesRep: salesRep || o?.salesRep || '',
      status: o?.status || '—',
      date: o?.orderDate || '—',
      detail: `${n}${unit}`,
    });

    // 未発注（3日以上）・納期未設定：これまでのアラートと同じ判定
    (['B1', 'B2'] as const).forEach((id) => {
      const m = new Map<string, { a: AlertItem; n: number }>();
      alerts
        .filter((a) => a.ruleId === id && !excludedOrderIds.has(a.orderId))
        .forEach((a) => m.set(a.orderId, { a, n: (m.get(a.orderId)?.n || 0) + 1 }));
      result[id] = Array.from(m.values()).map(({ a, n }) => orderRow(orderById.get(a.orderId), a.orderId, a.salesRep, n, '明細'));
    });

    const live = orders.filter((o) => !isQuoteOrder(o) && !excludedOrderIds.has(o.orderId));
    result.stuck_status = live
      .filter((o) => {
        const lines = o.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
        return ['受注済み', '発注済み'].includes(o.status) && lines.length > 0 && lines.every((l) => l.stage === '出荷完了');
      })
      .map((o) => orderRow(o, o.orderId, o.salesRep, o.lines.length, '明細すべて出荷完了'));
    result.no_supplier = live
      .map((o) => ({ o, n: o.lines.filter((l) => !isShippingOrFee(l.productName, l.productId) && !String(l.supplierName || '').trim()).length }))
      .filter((x) => x.n > 0)
      .map(({ o, n }) => orderRow(o, o.orderId, o.salesRep, n, '明細'));

    // 出荷の行（出荷管理は明細ごとに同じ出荷が並ぶので、出荷IDで1件にする）
    const seen = new Set<string>();
    const shipRow = (s: ShipmentItem, detail: string): Row => {
      const o = orderById.get(s.orderId);
      return {
        id: s.shipmentId,
        order: o,
        orderId: s.orderId && s.orderId !== '—' ? s.orderId : '',
        shipmentId: s.shipmentId,
        clinic: o?.customerName || (s.customerName && s.customerName !== '—' ? s.customerName : '—'),
        salesRep: o?.salesRep || '',
        status: s.shipStatus || '—',
        date: s.shippedDate && s.shippedDate !== '—' ? s.shippedDate : '—',
        detail,
      };
    };
    result.no_tracking = [];
    shipments.forEach((s) => {
      if (seen.has(s.shipmentId) || !(s.shipStatus || '').includes('出荷済')) return;
      seen.add(s.shipmentId);
      const age = daysAgo(s.shippedDate);
      if (age === null || age > NO_TRACKING_DAYS) return;
      if (boxesOf(s).length > 0 || isHandCarried(s) || NO_NUMBER_OK.test(s.trackingNo || '')) return;
      // 一括発注の配送で院ごとに追跡している受注は対象外
      if (bulkByOrder.has(s.orderId)) return;
      result.no_tracking.push(shipRow(s, s.trackingNo && s.trackingNo !== '—' ? `出荷番号「${s.trackingNo}」` : '番号なし'));
    });
    // 配送業者の登録違い：番号で見つかった配送会社と、楽楽販売の「配送業者」が違う
    result.wrong_carrier = [];
    const seenWrong = new Set<string>();
    shipments.forEach((s) => {
      if (!carrierStatus || seenWrong.has(s.shipmentId) || !(s.shipStatus || '').includes('出荷済')) return;
      seenWrong.add(s.shipmentId);
      const hint = hintedCarrier(s.courier);
      if (!hint) return;
      const found = boxesOf(s).map((d) => carrierStatus[d]).filter((c) => c && c.lookup === 'found');
      const other = found.find((c) => c!.carrier !== hint);
      if (other) result.wrong_carrier.push(shipRow(s, `楽楽販売は${carrierName(hint)}／番号は${carrierName(other.carrier)}（${other.trackingNo}）`));
    });
    const shipById = new Map(shipments.map((s) => [s.shipmentId, s]));
    result.bad_tracking = (irregular || []).map((x) => {
      const s = shipById.get(x.shipmentId);
      return s ? shipRow(s, `出荷番号「${x.trackingNo}」`) : { id: x.shipmentId, orderId: '', shipmentId: x.shipmentId, clinic: '—', salesRep: '', status: '—', date: '—', detail: `出荷番号「${x.trackingNo}」` };
    });

    // 担当営業で絞り込み（ダッシュボードから開いたとき）
    if (repFilter) (Object.keys(result) as RuleId[]).forEach((k) => (result[k] = result[k].filter((r) => r.salesRep === repFilter)));
    (Object.keys(result) as RuleId[]).forEach((k) => result[k].sort((a, b) => String(b.date).localeCompare(String(a.date))));
    return result;
  }, [alerts, orderById, orders, shipments, excludedOrderIds, irregular, repFilter, carrierStatus, bulkByOrder]);

  const current = RULES.find((r) => r.id === rule) || RULES[0];
  const rows = byRule[current.id] || [];

  const openInRakuraku = (id: string) => {
    openRakurakuWithCopiedId(rakurakuBaseUrl, id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">やることリスト（データの抜け）</h2>
          <p className="text-xs text-slate-500 mt-1">
            楽楽販売で入力が抜けている・止まっているものを、直す場所ごとにまとめています。直すと次の更新（15分ごと）でこのリストから消えます。
            納期超過と配送の問題は「朝の納期会議」で見てください。受注から{STALE_UNPAID_DAYS}日以上たって未入金の伝票と見積は対象外です。
          </p>
          {repFilter && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
              担当営業「{repFilter}」の分だけを表示中
              {onClearRepFilter && (
                <button type="button" onClick={onClearRepFilter} className="underline text-blue-700">
                  全員を表示
                </button>
              )}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {RULES.map((r) => {
            const n =
              (r.id === 'bad_tracking' && irregular === null) || (r.id === 'wrong_carrier' && carrierStatus === null) ? null : byRule[r.id]?.length || 0;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRule(r.id)}
                className={`text-left p-3 rounded-xl border ${rule === r.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <span className="text-xs font-bold text-slate-700 block">{r.label}</span>
                <span className={`text-2xl font-bold font-mono ${n ? 'text-amber-600' : 'text-emerald-600'}`}>{n ?? '…'}</span>
                <span className="text-[10px] text-slate-500 ml-1">件</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-100 text-xs">
          <p className="font-bold text-slate-900">{current.label}：{current.description}</p>
          <p className="text-slate-600 mt-0.5">直し方：{current.fix}</p>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm font-bold text-emerald-700">「{current.label}」に当たるものはありません</p>
        ) : (
          <div className="data-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-4">{current.kind === 'shipment' ? '出荷ID・受注ID' : '受注ID'}</th>
                  <th className="py-2.5 px-3">クリニック</th>
                  <th className="py-2.5 px-3">担当営業</th>
                  <th className="py-2.5 px-3">ステータス</th>
                  <th className="py-2.5 px-3">{current.kind === 'shipment' ? '出荷日' : '受注日'}</th>
                  <th className="py-2.5 px-3">内容</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="py-2.5 px-4">
                      {r.shipmentId && <div className="font-mono font-bold text-slate-800">{r.shipmentId}</div>}
                      {r.order ? (
                        <button type="button" onClick={() => onSelectOrder(r.order!)} className="font-mono font-bold text-blue-700 hover:underline">
                          {r.orderId}
                        </button>
                      ) : (
                        <span className="font-mono text-slate-500">{r.orderId || ''}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{r.clinic}</td>
                    <td className="py-2.5 px-3">{r.salesRep || '未設定'}</td>
                    <td className="py-2.5 px-3">{r.status}</td>
                    <td className="py-2.5 px-3 font-mono">{r.date}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.detail}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => openInRakuraku(r.id)}
                        className="rakuraku-open-btn"
                        title={`${r.shipmentId ? '出荷ID' : '受注ID'}をコピーして楽楽販売を開きます`}
                      >
                        <Copy className="w-3 h-3" />
                        {copied === r.id ? 'コピー済み' : '楽楽販売で開く'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
