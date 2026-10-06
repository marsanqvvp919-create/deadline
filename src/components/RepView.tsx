import React, { useState } from 'react';
import { Order, AlertItem, OrderLine } from '../types';
import { formatDate, getRemainingDaysInfo, getOrderProgress, isShippingOrFee } from '../utils';
import {
  User,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  Package,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckSquare
} from 'lucide-react';

interface RepViewProps {
  orders: Order[];
  alerts: AlertItem[];
  salesReps: string[];
  currentRep: string;
  onSelectRep: (rep: string) => void;
  onSelectOrderLine: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string) => void;
}

export const RepView: React.FC<RepViewProps> = ({
  orders,
  alerts,
  salesReps,
  currentRep,
  onSelectRep,
  onSelectOrderLine,
  onOpenClinicStatus,
}) => {
  // アコーディオン展開状態（orderIdのセット）
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  // 選択中の営業（未選択なら最初の営業を既定表示）
  const activeRep = currentRep || salesReps[0] || '未設定';

  // 該当営業の伝票一覧
  const repOrders = orders.filter((o) => (o.salesRep || '未設定') === activeRep);

  // 該当営業のアラート一覧
  const repAlerts = alerts.filter((a) => (a.salesRep || '未設定') === activeRep);

  // 「今日やること」: 重要度（高→中→低）→ dueDate の近い順でソートし最大10件
  const severityOrder: Record<string, number> = { 高: 1, 中: 2, 低: 3 };
  const todayTasks = [...repAlerts]
    .sort((a, b) => {
      const pA = severityOrder[a.severity] || 9;
      const pB = severityOrder[b.severity] || 9;
      if (pA !== pB) return pA - pB;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 10);

  const toggleExpand = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Rep Selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <span>営業担当別ワークスペース</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            自分の担当案件の工程状況と、優先対応すべきアラートを確認します
          </p>
        </div>

        {/* Rep Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">担当切替:</span>
          {salesReps.map((rep) => {
            const isCurrent = rep === activeRep;
            const repAlertCount = alerts.filter(
              (a) => (a.salesRep || '未設定') === rep && a.severity === '高'
            ).length;

            return (
              <button
                key={rep}
                onClick={() => onSelectRep(rep)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{rep}</span>
                {repAlertCount > 0 && (
                  <span
                    className={`text-[10px] px-1 rounded font-mono ${
                      isCurrent ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {repAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 「今日やること」アラート（最大10件） */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">
              今日やること（優先対応アラート）
            </h2>
            <span className="text-xs text-slate-500 font-mono font-medium">
              ({todayTasks.length}件)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">重要度・期限順</span>
        </div>

        <div className="p-4">
          {todayTasks.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="font-semibold text-slate-700">対応が必要なアラートはありません！</p>
              <p className="text-slate-400 text-[11px]">すべての納期・工程が順調に進行しています。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {todayTasks.map((alt, idx) => {
                const targetOrder = orders.find((o) => o.orderId === alt.orderId);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (targetOrder) onSelectOrderLine(targetOrder, alt.lineKey);
                    }}
                    className={`p-3.5 rounded-lg border text-xs cursor-pointer hover:shadow-xs transition flex flex-col justify-between ${
                      alt.severity === '高'
                        ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300 text-rose-950'
                        : alt.severity === '中'
                        ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300 text-amber-950'
                        : 'bg-orange-50/50 border-orange-200 hover:border-orange-300 text-orange-950'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            alt.severity === '高'
                              ? 'bg-rose-600 text-white'
                              : alt.severity === '中'
                              ? 'bg-amber-600 text-white'
                              : 'bg-orange-500 text-white'
                          }`}
                        >
                          重要度: {alt.severity}・{alt.ruleName}
                        </span>
                        <span className="font-mono text-slate-600 text-[11px] font-semibold">
                          {alt.orderId}
                        </span>
                      </div>
                      {targetOrder?.customerName && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mt-1 mb-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{targetOrder.customerName}</span>
                        </div>
                      )}
                      <p className="font-semibold text-slate-900 leading-snug mt-1">
                        {alt.message}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span>期日: {formatDate(alt.dueDate)}</span>
                      {alt.daysOver > 0 ? (
                        <span className="font-bold text-rose-600">{alt.daysOver}日超過中</span>
                      ) : (
                        <span className="text-amber-700 font-medium">期日間近</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 担当伝票一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {activeRep} の担当伝票一覧
            </h2>
            <span className="text-xs text-slate-500 font-mono">({repOrders.length}件)</span>
          </div>
          <span className="text-[11px] text-slate-400">クリックで明細展開 / 詳細表示</span>
        </div>

        <div className="divide-y divide-slate-100">
          {repOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              担当伝票はありません
            </div>
          ) : (
            repOrders.map((ord, idx) => {
              const progress = getOrderProgress(ord);
              const isExpanded = !!expandedOrders[ord.orderId];

              // 商品明細のみ抽出（送料・代行手数料は商品として扱わない）
              const prodLines = (ord.lines || []).filter((l) => !isShippingOrFee(l.productName, l.productId));

              // 未完了明細数
              const incompleteCount = prodLines.filter((l) => l.stage !== '出荷完了').length;

              // 最長の最長納品予定日
              const pendingDates = prodLines
                .filter((l) => l.stage !== '出荷完了' && l.latestDate)
                .map((l) => l.latestDate as string)
                .sort();
              const nearestDue = pendingDates.length > 0 ? pendingDates[pendingDates.length - 1] : null;
              const dueInfo = getRemainingDaysInfo(nearestDue);

              // 伝票に関連するアラート数
              const ordAlertsCount = alerts.filter((a) => a.orderId === ord.orderId).length;

              return (
                <div key={`${ord.orderId}_${idx}`} className="hover:bg-slate-50/60 transition">
                  {/* Row Summary */}
                  <div
                    onClick={() => onSelectOrderLine(ord)}
                    className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-[240px]">
                      <button
                        onClick={(e) => toggleExpand(ord.orderId, e)}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono text-slate-900">
                            {ord.orderId}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium">
                            {ord.status}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              ord.orderState === '納品完了'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.orderState === '全明細出荷済'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ord.orderState}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 font-medium mt-0.5 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <button
                            onClick={(e) => {
                              if (onOpenClinicStatus) {
                                e.stopPropagation();
                                onOpenClinicStatus(ord.customerName);
                              }
                            }}
                            className="hover:text-indigo-600 hover:underline cursor-pointer text-left font-medium"
                            title="この取引先の商品ステータス一覧を開く"
                          >
                            {ord.customerName}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex items-center gap-4 sm:gap-6 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px]">未完了商品</span>
                        <span className="font-mono font-bold text-slate-800">
                          {incompleteCount} / {prodLines.length} 点
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">最寄り期限</span>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-800">
                            {formatDate(nearestDue)}
                          </span>
                          {nearestDue && incompleteCount > 0 && (
                            <span
                              className={`text-[10px] font-bold px-1 rounded ${
                                dueInfo.isOverdue
                                  ? 'bg-rose-100 text-rose-700'
                                  : dueInfo.isUrgent
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {dueInfo.text}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">アラート</span>
                        <span
                          className={`font-bold font-mono ${
                            ordAlertsCount > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {ordAlertsCount > 0 ? `${ordAlertsCount}件` : 'なし'}
                        </span>
                      </div>

                      <div className="hidden md:block text-right">
                        <span className="text-slate-400 block text-[10px]">進捗</span>
                        <span className="text-xs font-semibold text-blue-700">
                          {progress.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Lines Accordion */}
                  {isExpanded && (
                    <div className="px-10 pb-4 bg-slate-50/50">
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3 font-semibold">商品名</th>
                              <th className="py-2 px-3 font-semibold">工程</th>
                              <th className="py-2 px-3 font-semibold text-right">数量</th>
                              <th className="py-2 px-3 font-semibold">仕入先</th>
                              <th className="py-2 px-3 font-semibold">最長予定日</th>
                              <th className="py-2 px-3 font-semibold">出荷状況</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {prodLines.map((l: OrderLine, lIdx: number) => {
                              const lineRemain = getRemainingDaysInfo(l.latestDate);
                              return (
                                <tr
                                  key={`${l.lineKey}_${lIdx}`}
                                  onClick={() => onSelectOrderLine(ord, l.lineKey)}
                                  className="hover:bg-blue-50/50 cursor-pointer"
                                >
                                  <td className="py-2.5 px-3 font-medium text-slate-900">
                                    {l.productName}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                        l.stage === '出荷完了'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : l.stage === '一部出荷'
                                          ? 'bg-sky-100 text-sky-800'
                                          : l.stage === '発注済・入荷待ち'
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : 'bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {l.stage}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    {l.quantity}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    {l.supplierName || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    <div className="flex items-center gap-1.5">
                                      <span>{formatDate(l.latestDate)}</span>
                                      {l.stage !== '出荷完了' && (
                                        <span
                                          className={`text-[9px] font-bold px-1 rounded ${
                                            lineRemain.isOverdue
                                              ? 'bg-rose-100 text-rose-700'
                                              : lineRemain.isUrgent
                                              ? 'bg-amber-100 text-amber-700'
                                              : 'text-slate-400'
                                          }`}
                                        >
                                          {lineRemain.text}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    出荷: {l.shippedQty} / 残: {l.remainingQty}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
