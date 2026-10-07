import React, { useMemo } from 'react';
import { Order, AlertItem, WeeklyHistoryItem, ViewTab } from '../types';
import { formatDate, isShippingOrFee, formatNumber } from '../utils';
import { isEligibleForOverdue } from '../utils/salesCalculations';
import { isOrderDelayed, isLineDelayed, getLineDelayDays } from '../utils/delayCalculation';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShoppingCart,
  Building2,
  AlertOctagon,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface DeliveryDashboardViewProps {
  orders: Order[];
  alerts: AlertItem[];
  weeklyDelayHistory?: WeeklyHistoryItem[];
  onNavigateToTab: (tab: ViewTab) => void;
  onSelectOrderLine?: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus: (clinicName: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DeliveryDashboardView: React.FC<DeliveryDashboardViewProps> = ({
  orders,
  alerts,
  weeklyDelayHistory = [],
  onNavigateToTab,
  onSelectOrderLine,
  onOpenClinicStatus,
  onRefresh,
  isRefreshing = false,
}) => {
  // 基準日
  const todayStr = '2026-09-24';
  const today = new Date(todayStr + 'T00:00:00+09:00');
  const thisYearMonth = '2026-09';

  // 1. 全商品明細のフラット化（送料・手数料除外）
  const allLines = useMemo(() => {
    return orders.flatMap((o) =>
      o.lines
        .filter((l) => !isShippingOrFee(l.productName, l.productId))
        .map((l) => ({
          ...l,
          orderId: o.orderId,
          salesRep: o.salesRep,
          orderCustomer: o.customerName,
          orderState: o.orderState,
        }))
    );
  }, [orders]);

  const incompleteLines = useMemo(() => {
    return allLines.filter((l) => l.stage !== '出荷完了');
  }, [allLines]);

  const delayedLines = useMemo(() => {
    return allLines.filter((l) => {
      const parent = orders.find((o) => o.orderId === l.orderId);
      return isLineDelayed(l, parent);
    });
  }, [allLines, orders]);

  // 今月の納期遵守率
  const completedThisMonth = useMemo(() => {
    return allLines.filter((l) => {
      if (l.stage !== '出荷完了' || !l.shippedDate) return false;
      return l.shippedDate.replace(/\//g, '-').startsWith(thisYearMonth);
    });
  }, [allLines, thisYearMonth]);

  const onTimeShippedCount = useMemo(() => {
    return completedThisMonth.filter((l) => {
      if (!l.latestDate || !l.shippedDate) return false;
      return l.shippedDate <= l.latestDate;
    }).length;
  }, [completedThisMonth]);

  const onTimeRate = useMemo(() => {
    return completedThisMonth.length > 0
      ? Math.round((onTimeShippedCount / completedThisMonth.length) * 100)
      : null;
  }, [completedThisMonth, onTimeShippedCount]);

  // 納期遵守率ゲージデータ
  const deliveryGaugeData = [
    { name: '遵守', value: onTimeRate ?? 0 },
    { name: '未達', value: onTimeRate !== null ? Math.max(0, 100 - onTimeRate) : 100 },
  ];
  const DELIVERY_COLORS = ['#4f46e5', '#e2e8f0'];

  // 入金済みの未発注品目
  const paidUnorderedCount = useMemo(() => {
    return incompleteLines.filter((l) => {
      if (l.stage !== '未発注') return false;
      const parent = orders.find((o) => o.orderId === l.orderId);
      return !parent || parent.paymentStatus === '入金済';
    }).length;
  }, [incompleteLines, orders]);

  // 未出荷クリニック数
  const unshippedClinicsCount = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.orderState === '全明細出荷済' || o.orderState === '納品完了') return;
      const hasUnshipped = o.lines.some((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return false;
        return l.stage !== '出荷完了';
      });
      if (hasUnshipped && o.customerName) {
        set.add(o.customerName);
      }
    });
    return set.size;
  }, [orders]);

  // 最長納期超過案件数（ordersの中で delayed lines があるもの）
  const overdueOrdersCount = useMemo(() => {
    const set = new Set<string>();
    delayedLines.forEach((l) => set.add(l.orderId));
    return set.size;
  }, [delayedLines]);

  const totalAlertsCount = alerts.length;
  const highSeverityAlertsCount = alerts.filter((a) => a.severity === '高').length;

  // 仕入先別集計
  const supplierSummaryList = useMemo(() => {
    const map = new Map<
      string,
      { supplier: string; incomplete: number; delayed: number; totalDelayDays: number }
    >();
    incompleteLines.forEach((l) => {
      const sup = l.supplierName || '未指定';
      if (!map.has(sup)) {
        map.set(sup, { supplier: sup, incomplete: 0, delayed: 0, totalDelayDays: 0 });
      }
      const entry = map.get(sup)!;
      entry.incomplete++;
      const parent = orders.find((o) => o.orderId === l.orderId);
      if (isLineDelayed(l, parent)) {
        entry.delayed++;
        const days = getLineDelayDays(l);
        entry.totalDelayDays += Math.max(0, days);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => b.delayed - a.delayed || b.incomplete - a.incomplete
    );
  }, [incompleteLines, orders]);

  // 週次遅延グラフデータ
  const historyData = weeklyDelayHistory && weeklyDelayHistory.length > 0 ? weeklyDelayHistory : [];
  const maxDelayed = Math.max(...historyData.map((d) => d.delayed), 15);
  const chartHeight = 130;
  const chartWidth = 580;
  const paddingLeft = 35;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 25;

  const points = historyData.map((d, index) => {
    const x =
      paddingLeft +
      (index / Math.max(1, historyData.length - 1)) *
        (chartWidth - paddingLeft - paddingRight);
    const y =
      paddingTop +
      (1 - d.delayed / maxDelayed) * (chartHeight - paddingTop - paddingBottom);
    return { x, y, ...d };
  });

  const pathString =
    points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      : '';

  const areaString =
    points.length > 0
      ? `${pathString} L ${points[points.length - 1].x} ${
          chartHeight - paddingBottom
        } L ${points[0].x} ${chartHeight - paddingBottom} Z`
      : '';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
              納期系・進行管理セクション
            </span>
            <span className="text-xs text-slate-300 font-mono">基準日: 2026年9月24日</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Truck className="w-7 h-7 text-indigo-400" />
            納期・進行管理ダッシュボード
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            発注・入荷・出荷遅延、仕入先別納品パフォーマンス、納期超過アラートを一元監視・コントロールします。
          </p>
        </div>
        <div className="flex items-center gap-3 self-end md:self-center">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 shadow transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              再同期
            </button>
          )}
          <button
            onClick={() => onNavigateToTab('overdue')}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
          >
            納期超過一覧へ
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Executive KPI Progress Gauge Card (Recharts) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">今月納期遵守状況</span>
            <span className="text-xs text-slate-500 font-mono">対象完了品目: {completedThisMonth.length}件</span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-3">
            <span>{onTimeRate}%</span>
            <span className="text-sm font-semibold text-emerald-600 font-sans">
              (遵守: {onTimeShippedCount}件 / 全完了: {completedThisMonth.length}件)
            </span>
          </div>
          <p className="text-xs text-slate-600">
            今月の納期遵守率をRechartsの進捗ゲージで可視化しています。遅延ゼロおよび早期出荷の徹底を推進します。
          </p>
        </div>
        <div className="w-44 h-28 shrink-0 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={deliveryGaugeData}
                cx="50%"
                cy="75%"
                startAngle={180}
                endAngle={0}
                innerRadius={42}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {deliveryGaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={DELIVERY_COLORS[index % DELIVERY_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute bottom-1 text-center">
            <span className="text-base font-black text-indigo-600 font-mono">
              {onTimeRate !== null ? `${onTimeRate}%` : 'データなし'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* On-time Rate */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">今月納期遵守率</span>
            {onTimeRate !== null && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                <ArrowUpRight className="w-3 h-3" />遵守率
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {onTimeRate !== null ? (
              <span>{onTimeRate}%</span>
            ) : (
              <span className="text-lg font-bold text-slate-400">データなし</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {completedThisMonth.length > 0
                ? `完了 ${completedThisMonth.length}件中 ${onTimeShippedCount}件遵守`
                : '当月の出荷完了データなし'}
            </span>
          </div>
        </div>

        {/* Delayed Items */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer hover:border-rose-300" onClick={() => onNavigateToTab('overdue')}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">遅延明細数</span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              <ArrowDownRight className="w-3 h-3" />-4件 減少傾向
            </span>
          </div>
          <div className="text-2xl font-black text-rose-600 tracking-tight">
            {delayedLines.length} <span className="text-sm font-normal text-slate-600">品目</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-rose-600 font-medium">
            <span>納期超過・未出荷</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Paid Unordered */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer hover:border-amber-300" onClick={() => onNavigateToTab('procurement')}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">入金済・未発注品目</span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              早急発注推奨
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 tracking-tight">
            {paidUnorderedCount} <span className="text-sm font-normal text-slate-600">品目</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-amber-600 font-medium">
            <span>要発注手配</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Total Alerts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer hover:border-indigo-300" onClick={() => onNavigateToTab('alerts')}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">アクティブアラート</span>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
              高重要度: {highSeverityAlertsCount}件
            </span>
          </div>
          <div className="text-2xl font-black text-indigo-600 tracking-tight">
            {totalAlertsCount} <span className="text-sm font-normal text-slate-600">件</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-indigo-600 font-medium">
            <span>要対応リスク監視中</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div
          onClick={() => onNavigateToTab('procurement')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
              <ShoppingCart className="w-5 h-5" />
            </div>
            {paidUnorderedCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-800 font-bold rounded-full">{paidUnorderedCount}件</span>
            )}
          </div>
          <h3 className="font-bold text-slate-900 text-sm">発注管理</h3>
          <p className="text-xs text-slate-500 mt-1">入金済・未発注品目の仕入先発注アクション管理</p>
        </div>

        <div
          onClick={() => onNavigateToTab('unshipped_clinics')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-500 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
              <Truck className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold rounded-full">{unshippedClinicsCount}施設</span>
          </div>
          <h3 className="font-bold text-slate-900 text-sm">未出荷クリニック</h3>
          <p className="text-xs text-slate-500 mt-1">発注残・未出荷商品のクリニック別状況把握</p>
        </div>

        <div
          onClick={() => onNavigateToTab('overdue')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-rose-500 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
              <AlertTriangle className="w-5 h-5" />
            </div>
            {overdueOrdersCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-rose-100 text-rose-700 font-bold rounded-full">{overdueOrdersCount}件超過</span>
            )}
          </div>
          <h3 className="font-bold text-slate-900 text-sm">最長納期超過</h3>
          <p className="text-xs text-slate-500 mt-1">納期超過案件の遅延日数・原因別フォローアップ</p>
        </div>

        <div
          onClick={() => onNavigateToTab('completed')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-600 transition" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">完了伝票</h3>
          <p className="text-xs text-slate-500 mt-1">出荷完了・納品完了済みの伝票履歴検索</p>
        </div>

        <div
          onClick={() => onNavigateToTab('alerts')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-500 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 font-bold rounded-full">{totalAlertsCount}件</span>
          </div>
          <h3 className="font-bold text-slate-900 text-sm">アラート一覧</h3>
          <p className="text-xs text-slate-500 mt-1">遅延・間近・漏れの全自動検出アラート一覧</p>
        </div>
      </div>

      {/* Weekly Delay History & Supplier Delay Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Delay History Chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">週次遅延件数推移（過去12週）</h3>
              <p className="text-xs text-slate-500">週ごとの納期遅延発生件数のトレンド</p>
            </div>
            <span className="px-2 py-1 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded">
              最大: {maxDelayed}件
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col items-center justify-center">
            {historyData.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-36">
                  <defs>
                    <linearGradient id="deliveryDelayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                    const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                    return (
                      <line
                        key={idx}
                        x1={paddingLeft}
                        y1={y}
                        x2={chartWidth - paddingRight}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />
                    );
                  })}
                  {areaString && <path d={areaString} fill="url(#deliveryDelayGrad)" />}
                  {pathString && (
                    <path d={pathString} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
                  )}
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4" fill="#4f46e5" stroke="#ffffff" strokeWidth="2" />
                      <text
                        x={p.x}
                        y={chartHeight - 8}
                        fontSize="9"
                        fill="#64748b"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {p.weekEnd.slice(5)}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                履歴データがありません
              </div>
            )}
          </div>
        </div>

        {/* Supplier Delay Summary */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">仕入先別 納期遅延状況</h3>
              <p className="text-xs text-slate-500">仕入先ごとの進行中品目数と遅延品目数</p>
            </div>
            <span className="text-xs font-bold text-indigo-600">{supplierSummaryList.length} 仕入先</span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {supplierSummaryList.slice(0, 5).map((sup) => (
              <div
                key={sup.supplier}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60 hover:bg-slate-100 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {sup.supplier.slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{sup.supplier}</div>
                    <div className="text-[10px] text-slate-500">進行中品目: {sup.incomplete}件</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sup.delayed > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                      遅延 {sup.delayed}件
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                      遅延なし
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
