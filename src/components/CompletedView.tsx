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
}

export const CompletedView: React.FC<CompletedViewProps> = ({ orders, onSelectOrder }) => {
  // タブ：「納品完了」 / 「納品確認待ち（全明細出荷済）」
  const [activeTab, setActiveTab] = useState<'delivered' | 'awaiting_confirmation'>('delivered');

  // 完了伝票内での期間フィルタ（既定: 直近30日）
  const [completedPeriod, setCompletedPeriod] = useState<PeriodFilter>('30d');

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
            全明細の出荷が終わった伝票の一覧です（納品完了かどうかは楽楽販売の「納品完了日」で決まります）
          </p>
        </div>

        {/* Tab Switcher & Period Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setActiveTab('delivered');
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

      {/* 納品完了は楽楽販売の「納品完了日」で決まる（この画面からは変更しない） */}
      <p className="text-xs text-slate-500 px-1">
        {activeTab === 'awaiting_confirmation'
          ? '全明細が出荷済みで、楽楽販売の「納品完了日」がまだ空欄の伝票です。納品を確認したら楽楽販売で納品完了日を入力してください（次の同期で「納品完了」に移ります）。'
          : '楽楽販売で「納品完了日」が入力された伝票です。'}
        納期遵守は、各明細の出荷日（倉庫出荷日があればそちら）が最長納品予定日以内かで判定します。
      </p>

      {/* Completed Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="data-table-wrap overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">受注ID</th>
                <th className="py-3 px-4 font-semibold">顧客名</th>
                <th className="py-3 px-3 font-semibold">担当営業</th>
                <th className="py-3 px-3 font-semibold">受注日</th>
                <th className="py-3 px-3 font-semibold">最終出荷日</th>
                <th className="py-3 px-3 font-semibold">納品完了日</th>
                <th className="py-3 px-3 font-semibold text-center">納期遵守</th>
                <th className="py-3 px-4 font-semibold">明細内訳</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    対象となる出荷伝票はありません
                  </td>
                </tr>
              ) : (
                filteredList.map((ord) => {
                  // 最終出荷日（倉庫出荷日があればそちら）
                  const productLines = ord.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
                  const shipDateOf = (l: (typeof ord.lines)[number]) => l.warehouseShippedDate || l.shippedDate;
                  const shippedDates = productLines
                    .map((l) => shipDateOf(l))
                    .filter(Boolean)
                    .map((d) => String(d).replace(/\//g, '-')) as string[];
                  const latestShippedDate = shippedDates.sort().reverse()[0] || null;

                  // 納期遵守：最長納品予定日のある明細が、すべてその日までに出荷されたか
                  const judged = productLines.filter((l) => l.latestDate && shipDateOf(l));
                  const metRequestedDate: boolean | null =
                    judged.length === 0
                      ? null
                      : judged.every(
                          (l) => String(shipDateOf(l)).replace(/\//g, '-') <= String(l.latestDate).replace(/\//g, '-')
                        );

                  return (
                    <tr
                      key={ord.orderId}
                      onClick={() => onSelectOrder(ord)}
                      className="hover:bg-blue-50/40 cursor-pointer transition"
                    >
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
                          <span className="text-slate-400 text-[11px]">予定日なし</span>
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
