import React, { useMemo } from 'react';
import { AlertItem, Order } from '../types';
import { useUrlState } from '../utils/listState';
import { isOrderDelayed, isLineDelayed, getOrderMaxDelayDays, isStaleUnpaid, STALE_UNPAID_DAYS } from '../utils/delayCalculation';

// 要対応リスト：納期超過・未発注（3日以上）・納期未設定のある伝票を、ルールごとにまとめて表示する（朝会用）。
// 1つの伝票に複数の明細が当たっていても1行にまとめる。

const RULES: { id: string; label: string; description: string; tone: string }[] = [
  { id: 'B1', label: '未発注（3日以上）', description: '受注日から3日以上たっても未発注の明細がある伝票', tone: 'rose' },
  { id: 'A1', label: '納期超過', description: '最長納品予定日を過ぎて未出荷の明細がある伝票', tone: 'rose' },
  { id: 'B2', label: '納期未設定', description: '最短・最長納品予定日が未入力の明細がある伝票', tone: 'amber' },
];

interface Row {
  order: Order | undefined;
  orderId: string;
  salesRep: string;
  lines: number;
  maxDays: number;
}

export const ActionListView: React.FC<{
  orders: Order[];
  alerts: AlertItem[];
  onSelectOrder: (order: Order) => void;
  repFilter?: string;
  onClearRepFilter?: () => void;
}> = ({ orders, alerts, onSelectOrder, repFilter, onClearRepFilter }) => {
  const [rule, setRule] = useUrlState<string>('rule', 'B1');
  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);

  // 受注から60日以上たって未入金の伝票は対象外
  const excludedOrderIds = useMemo(
    () => new Set(orders.filter((o) => isStaleUnpaid(o)).map((o) => o.orderId)),
    [orders]
  );

  const byRule = useMemo(() => {
    const result: Record<string, Row[]> = {};
    RULES.forEach(({ id }) => {
      const m = new Map<string, Row>();
      alerts
        .filter((a) => a.ruleId === id && !excludedOrderIds.has(a.orderId))
        .forEach((a) => {
          const row = m.get(a.orderId) || {
            order: orderById.get(a.orderId),
            orderId: a.orderId,
            salesRep: a.salesRep,
            lines: 0,
            maxDays: 0,
          };
          row.lines++;
          row.maxDays = Math.max(row.maxDays, a.daysOver || 0);
          m.set(a.orderId, row);
        });
      result[id] = Array.from(m.values()).sort((x, y) => y.maxDays - x.maxDays);
    });
    // 納期超過は、他の画面と同じ判定（楽楽販売「①超過」と同じ条件）で数える
    result['A1'] = orders
      .filter((o) => isOrderDelayed(o) && !excludedOrderIds.has(o.orderId))
      .map((o) => ({
        order: o,
        orderId: o.orderId,
        salesRep: o.salesRep,
        lines: o.lines.filter((l) => isLineDelayed(l, o)).length,
        maxDays: getOrderMaxDelayDays(o),
      }))
      .sort((x, y) => y.maxDays - x.maxDays);
    return result;
  }, [alerts, orderById, orders, excludedOrderIds]);

  // 対象外にした伝票のうち、要対応の理由があったものの数（画面の注記用）
  const excludedCount = useMemo(() => {
    const ids = new Set<string>();
    alerts.forEach((a) => {
      if (['B1', 'B2'].includes(a.ruleId) && excludedOrderIds.has(a.orderId)) ids.add(a.orderId);
    });
    orders.forEach((o) => {
      if (excludedOrderIds.has(o.orderId) && isOrderDelayed(o)) ids.add(o.orderId);
    });
    return ids.size;
  }, [alerts, orders, excludedOrderIds]);

  const current = RULES.find((r) => r.id === rule) || RULES[0];
  const rows = byRule[current.id] || [];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">要対応リスト</h2>
          <p className="text-xs text-slate-500 mt-1">
            対応が必要な伝票を、理由ごとにまとめています（見積・出荷済みの伝票は除く）。行を押すと伝票の詳細が開きます。
            <br />
            受注から{STALE_UNPAID_DAYS}日以上たって未入金の伝票（{excludedCount}件）は対象外にしています。
            そのため納期超過の件数は、ダッシュボード（楽楽販売「①超過」と同じ数）より少なくなることがあります。
          </p>
          {repFilter && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
              担当営業「{repFilter}」の伝票だけを表示中
              {onClearRepFilter && (
                <button type="button" onClick={onClearRepFilter} className="underline text-blue-700">
                  全員を表示
                </button>
              )}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {RULES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRule(r.id)}
              className={`text-left p-3 rounded-xl border ${rule === r.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <span className="text-xs font-bold text-slate-700 block">{r.label}</span>
              <span className={`text-2xl font-bold font-mono ${r.tone === 'rose' ? 'text-rose-600' : 'text-amber-600'}`}>
                {byRule[r.id]?.length || 0}
              </span>
              <span className="text-[10px] text-slate-500 ml-1">件</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{r.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {rows.length === 0 ? (
          <p className="p-6 text-sm font-bold text-emerald-700">「{current.label}」に当たる伝票はありません</p>
        ) : (
          <div className="data-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-4">受注ID</th>
                  <th className="py-2.5 px-3">クリニック</th>
                  <th className="py-2.5 px-3">担当営業</th>
                  <th className="py-2.5 px-3">ステータス</th>
                  <th className="py-2.5 px-3">受注日</th>
                  <th className="py-2.5 px-3 text-right">該当明細</th>
                  <th className="py-2.5 px-3 text-right">{current.id === 'A1' ? '超過日数' : current.id === 'B1' ? '受注からの日数' : ''}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr
                    key={r.orderId}
                    onClick={() => r.order && onSelectOrder(r.order)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-700">{r.orderId}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{r.order?.customerName || '—'}</td>
                    <td className="py-2.5 px-3">{r.salesRep || '未設定'}</td>
                    <td className="py-2.5 px-3">{r.order?.status || '—'}</td>
                    <td className="py-2.5 px-3 font-mono">{r.order?.orderDate || '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{r.lines}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                      {current.id === 'B2' ? '' : `${r.maxDays}日`}
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
