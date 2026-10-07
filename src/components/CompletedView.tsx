import React, { useState } from 'react';
import { Order, PeriodFilter } from '../types';
import { formatDate, isWithinPeriod, isShippingOrFee } from '../utils';
import {
  CheckCircle2,
  Clock,
  Building2,
  User,
  Calendar,
  Truck,
  FileCheck,
  Check,
  X,
  AlertCircle,
  Globe,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface CompletedViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onUpdateOrderStatus?: (orderIds: string[], updates: Partial<Order>) => void;
}

export const CompletedView: React.FC<CompletedViewProps> = ({ orders, onSelectOrder, onUpdateOrderStatus }) => {
  // タブ：「納品完了」 / 「納品確認待ち（全明細出荷済）」
  const [activeTab, setActiveTab] = useState<'delivered' | 'awaiting_confirmation'>('delivered');

  // 完了伝票内での期間フィルタ（既定: 直近30日）
  const [completedPeriod, setCompletedPeriod] = useState<PeriodFilter>('30d');

  // チェックされた受注IDのセット
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // 全明細出荷済（納品完了日が空で、全カードが出荷完了）
  const awaitingOrders = orders.filter((o) => o.orderState === '全明細出荷済');

  // 納品完了（納品完了日に日付がある）
  const deliveredOrders = orders.filter((o) => o.orderState === '納品完了');

  // 対象タブに応じたリスト
  const targetList = activeTab === 'delivered' ? deliveredOrders : awaitingOrders;

  // 期間フィルタリング（納品日または最終出荷日で判定）
  const filteredList = targetList.filter((ord) => {
    const referenceDate =
      ord.deliveredDate ||
      ord.lines.map((l) => l.shippedDate).filter(Boolean).sort().reverse()[0] ||
      ord.orderDate;
    return isWithinPeriod(referenceDate, completedPeriod);
  });

  const handleToggleSelectAll = () => {
    if (selectedOrderIds.size === filteredList.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredList.map((o) => o.orderId)));
    }
  };

  const handleToggleSelectOrder = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedOrderIds);
    if (next.has(orderId)) {
      next.delete(orderId);
    } else {
      next.add(orderId);
    }
    setSelectedOrderIds(next);
  };

  const handleBatchMarkAsDelivered = () => {
    if (selectedOrderIds.size === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const ids = Array.from(selectedOrderIds);
    if (onUpdateOrderStatus) {
      onUpdateOrderStatus(ids, {
        orderState: '納品完了',
        deliveredDate: todayStr,
      });
    }
    setSelectedOrderIds(new Set());
  };

  const handleBatchRevertToAwaiting = () => {
    if (selectedOrderIds.size === 0) return;
    const ids = Array.from(selectedOrderIds);
    if (onUpdateOrderStatus) {
      onUpdateOrderStatus(ids, {
        orderState: '全明細出荷済',
        deliveredDate: null as any,
      });
    }
    setSelectedOrderIds(new Set());
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            <span>出荷伝票一覧（納品・配送完了管理）</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            配送・出荷が完了した出荷伝票の履歴、および納品確認待ち案件のチェック・ステータス移行を行います
          </p>
        </div>

        {/* Tab Switcher & Period Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setActiveTab('delivered');
                setSelectedOrderIds(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'delivered'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              納品完了（出荷伝票）
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono font-bold">
                {deliveredOrders.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('awaiting_confirmation');
                setSelectedOrderIds(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'awaiting_confirmation'
                  ? 'bg-white text-sky-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              納品確認待ち
              <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded font-mono font-bold">
                {awaitingOrders.length}
              </span>
            </button>
          </div>

          {/* Period Filter for Completed View */}
          <div className="min-w-[120px]">
            <select
              value={completedPeriod}
              onChange={(e) => setCompletedPeriod(e.target.value as PeriodFilter)}
              className="text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition"
            >
              <option value="30d">直近30日（既定）</option>
              <option value="7d">直近7日</option>
              <option value="this_month">今月</option>
              <option value="90d">直近90日</option>
              <option value="all">全期間</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info notice & Batch Actions */}
      {activeTab === 'awaiting_confirmation' && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">配送完了の確認・出荷伝票への移行:</span> 配送完了が確認できた伝票にチェックをつけ、右側のボタンを押すと一括で「納品完了」ステータスに切り替わり、出荷伝票一覧へ反映されます。
            </div>
          </div>
          <button
            onClick={handleBatchMarkAsDelivered}
            disabled={selectedOrderIds.size === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>チェックした伝票を納品完了にする ({selectedOrderIds.size}件)</span>
          </button>
        </div>
      )}

      {activeTab === 'delivered' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">納品未完了伝票の差し戻し:</span> まだ納品されていない伝票にチェックをつけ、右側のボタンを押すと「納品確認待ち」の状態に戻すことができます。
            </div>
          </div>
          <button
            onClick={handleBatchRevertToAwaiting}
            disabled={selectedOrderIds.size === 0}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            <span>チェックした伝票を納品確認待ちに戻す ({selectedOrderIds.size}件)</span>
          </button>
        </div>
      )}

      {/* Completed Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="data-table-wrap overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredList.length > 0 && selectedOrderIds.size === filteredList.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 font-semibold">受注ID</th>
                <th className="py-3 px-4 font-semibold">顧客名</th>
                <th className="py-3 px-3 font-semibold">担当営業</th>
                <th className="py-3 px-3 font-semibold">受注日</th>
                <th className="py-3 px-3 font-semibold">最終出荷日</th>
                <th className="py-3 px-3 font-semibold">納品完了日</th>
                <th className="py-3 px-3 font-semibold text-center">希望納期遵守</th>
                <th className="py-3 px-4 font-semibold">明細内訳</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    対象となる出荷伝票はありません
                  </td>
                </tr>
              ) : (
                filteredList.map((ord) => {
                  const isChecked = selectedOrderIds.has(ord.orderId);

                  // 最終出荷日の計算
                  const shippedDates = ord.lines
                    .map((l) => l.shippedDate)
                    .filter(Boolean) as string[];
                  const latestShippedDate = shippedDates.sort().reverse()[0] || null;

                  // 希望納期に間に合ったかどうかの判定
                  let metRequestedDate: boolean | null = null;
                  if (ord.requestedDate) {
                    const finishDate = ord.deliveredDate || latestShippedDate;
                    if (finishDate) {
                      metRequestedDate = finishDate <= ord.requestedDate;
                    }
                  }

                  return (
                    <tr
                      key={ord.orderId}
                      onClick={() => onSelectOrder(ord)}
                      className={`hover:bg-blue-50/40 cursor-pointer transition ${
                        isChecked ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleSelectOrder(ord.orderId, e as any)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {ord.orderId}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ord.customerName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{ord.salesRep}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {formatDate(ord.orderDate)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {formatDate(latestShippedDate)}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {ord.deliveredDate ? (
                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            {formatDate(ord.deliveredDate)}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                            確認待ち
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {metRequestedDate === null ? (
                          <span className="text-slate-400 text-[11px]">希望日なし</span>
                        ) : metRequestedDate ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <Check className="w-3 h-3" />
                            間に合った
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            <X className="w-3 h-3" />
                            遅れ
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500">
                        <span className="truncate block max-w-xs">
                          {ord.lines
                            .filter((l) => !isShippingOrFee(l.productName, l.productId))
                            .map((l) => l.productName)
                            .join(' / ') || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
