import React, { useState, useEffect, useMemo } from 'react';
import { Order, AlertItem, WeeklyHistoryItem, ViewTab } from '../types';
import { formatDate, formatDateTime, isShippingOrFee, getElapsedTimeInfo, ElapsedTimeInfo } from '../utils';
import { calculateComprehensiveSalesMetrics, isEligibleForOverdue } from '../utils/salesCalculations';
import { isOrderDelayed, isLineDelayed, getLineDelayDays, getOverdueBreakdown, RAKURAKU_OVERDUE_LIST_URL } from '../utils/delayCalculation';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ChevronRight,
  Package,
  Layers,
  Calendar,
  ShoppingCart,
  Truck,
  CreditCard,
  Building2,
  AlertOctagon,
  RefreshCw,
  ExternalLink,
  Eye,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface DashboardViewProps {
  orders: Order[];
  alerts: AlertItem[];
  weeklyDelayHistory?: WeeklyHistoryItem[];
  onSelectRepForView: (repName: string) => void;
  onNavigateToTab: (tab: ViewTab) => void;
  generatedAt?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onSelectOrder?: (order: Order, lineKey?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  alerts,
  weeklyDelayHistory = [],
  onSelectRepForView,
  onNavigateToTab,
  generatedAt,
  onRefresh,
  isRefreshing = false,
  onSelectOrder,
}) => {
  // 経過時間インジケーター用の定期再レンダリング（15秒毎）
  const [ticker, setTicker] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // 経過時間情報の計算（実時間）
  const freshness = useMemo(() => {
    return getElapsedTimeInfo(generatedAt, 0);
  }, [generatedAt, ticker]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const thisYearMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // 売上・請求残・見積メトリクス（見積期日1週間超過は除外）
  const salesMetrics = useMemo(() => {
    return calculateComprehensiveSalesMetrics(orders);
  }, [orders]);

  // 1. 全商品明細のフラット化（送料・各種代行手数料は商品として扱わないため除外）
  const allLines = orders.flatMap((o) =>
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

  // 未完了明細（stage !== '出荷完了'）
  const incompleteLines = allLines.filter((l) => l.stage !== '出荷完了');

  // 統一された納期超過判定（伝票・明細）
  const delayedOrders = useMemo(() => {
    return orders.filter((o) => isOrderDelayed(o));
  }, [orders]);

  const overdueBreakdown = useMemo(() => getOverdueBreakdown(orders), [orders]);

  const delayedLines = useMemo(() => {
    return allLines.filter((l) => {
      const parent = orders.find((o) => o.orderId === l.orderId);
      return isLineDelayed(l, parent);
    });
  }, [allLines, orders]);

  // 10日以内に期限の明細（今日 <= latestDate <= 10日後）
  const tenDaysLater = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
  const urgentLines = incompleteLines.filter((l) => {
    if (!l.latestDate) return false;
    const target = new Date(l.latestDate);
    return target.getTime() >= today.getTime() && target.getTime() <= tenDaysLater.getTime();
  });

  // 同日+1日 〜 10日後までの納品予定クリニック数（ユニーククリニック件数）
  const upcomingClinicsCount = useMemo(() => {
    const set = new Set<string>();
    incompleteLines.forEach((l) => {
      if (!l.latestDate) return;
      const target = new Date(l.latestDate + 'T00:00:00+09:00');
      if (target.getTime() > today.getTime() && target.getTime() <= tenDaysLater.getTime()) {
        if (l.orderCustomer) set.add(l.orderCustomer);
      }
    });
    return set.size;
  }, [incompleteLines, today, tenDaysLater]);

  // 漏れアラート件数
  const leakageAlertsCount = alerts.filter((a) => a.type === '漏れ').length;
  const missedOrderLinesCount = alerts.filter((a) => a.ruleId === 'B1').length;
  const missingDueDateLinesCount = alerts.filter((a) => a.ruleId === 'B2').length;

  // 入金済みの未発注品目 (送料・手数料は除外)
  const paidUnorderedLines = incompleteLines.filter((l) => {
    if (l.stage !== '未発注') return false;
    if (isShippingOrFee(l.productName, l.productId)) return false;
    const parent = orders.find((o) => o.orderId === l.orderId);
    return !parent || parent.paymentStatus === '入金済';
  });

  // 現在発注があり出荷できていないクリニック数
  const unshippedClinicsSet = new Set<string>();
  orders.forEach((o) => {
    if (o.orderState === '全明細出荷済' || o.orderState === '納品完了') return;
    const hasUnshipped = o.lines.some((l) => {
      if (isShippingOrFee(l.productName, l.productId)) return false;
      return l.stage !== '出荷完了';
    });
    if (hasUnshipped && o.customerName) {
      unshippedClinicsSet.add(o.customerName);
    }
  });
  const unshippedClinicsCount = unshippedClinicsSet.size;

  // 入金予定日を過ぎて入金がないクリニック数
  const overduePaymentClinicsSet = new Set<string>();
  let totalOverduePaymentAmount = 0;
  orders.forEach((o) => {
    const payStatus = o.paymentStatus || '入金済';
    if (payStatus === '入金済') return;
    if (!o.paymentDueDate) return;

    const dueDate = new Date(o.paymentDueDate + 'T00:00:00+09:00');
    if (!isNaN(dueDate.getTime()) && dueDate < today && o.customerName) {
      overduePaymentClinicsSet.add(o.customerName);
      let amount = o.totalAmount || 0;
      if (amount === 0 && o.lines.length > 0) {
        amount = o.lines.reduce((s, l) => s + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);
      }
      totalOverduePaymentAmount += amount;
    }
  });
  const overduePaymentClinicsCount = overduePaymentClinicsSet.size;

  // 今月の納期遵守率
  // （今月出荷完了した明細のうち shippedDate <= latestDate の割合）
  const completedThisMonth = allLines.filter((l) => {
    if (l.stage !== '出荷完了' || !l.shippedDate) return false;
    return l.shippedDate.startsWith(thisYearMonth);
  });

  const onTimeShippedCount = completedThisMonth.filter((l) => {
    if (!l.latestDate || !l.shippedDate) return false;
    return l.shippedDate <= l.latestDate;
  }).length;

  const onTimeRate =
    completedThisMonth.length > 0
      ? Math.round((onTimeShippedCount / completedThisMonth.length) * 100)
      : 100;

  // 2. 担当営業別の集計
  const salesRepMap = new Map<
    string,
    {
      rep: string;
      incomplete: number;
      delayedOrders: Set<string>;
      delayedLines: number;
      leakage: number;
      completedThisMonth: number;
      onTimeThisMonth: number;
    }
  >();

  // Initialize from orders
  orders.forEach((o) => {
    const rep = o.salesRep || '未設定';
    if (!salesRepMap.has(rep)) {
      salesRepMap.set(rep, {
        rep,
        incomplete: 0,
        delayedOrders: new Set<string>(),
        delayedLines: 0,
        leakage: 0,
        completedThisMonth: 0,
        onTimeThisMonth: 0,
      });
    }
  });

  // 担当別の納期超過（isLineDelayed統一: ○件○明細）
  incompleteLines.forEach((l) => {
    const rep = l.salesRep || '未設定';
    const entry = salesRepMap.get(rep);
    if (!entry) return;
    const parent = orders.find((o) => o.orderId === l.orderId);
    if (isLineDelayed(l, parent)) {
      entry.delayedLines++;
      entry.delayedOrders.add(l.orderId);
    }
  });

  allLines.forEach((l) => {
    const rep = l.salesRep || '未設定';
    const entry = salesRepMap.get(rep);
    if (!entry) return;

    if (l.stage !== '出荷完了') {
      entry.incomplete++;
    } else if (l.shippedDate && l.shippedDate.startsWith(thisYearMonth)) {
      entry.completedThisMonth++;
      if (l.latestDate && l.shippedDate <= l.latestDate) {
        entry.onTimeThisMonth++;
      }
    }
  });

  // Count leakage per rep
  alerts.forEach((a) => {
    if (a.type === '漏れ') {
      const rep = a.salesRep || '未設定';
      const entry = salesRepMap.get(rep);
      if (entry) entry.leakage++;
    }
  });

  const repSummaryList = Array.from(salesRepMap.values()).sort(
    (a, b) => b.delayedLines - a.delayedLines || b.incomplete - a.incomplete
  );

  // 3. 仕入先別の集計
  const supplierMap = new Map<
    string,
    {
      supplier: string;
      incomplete: number;
      delayedOrders: Set<string>;
      delayedLines: number;
      totalDelayDays: number;
    }
  >();

  incompleteLines.forEach((l) => {
    const sup = l.supplierName || '未指定';
    if (!supplierMap.has(sup)) {
      supplierMap.set(sup, {
        supplier: sup,
        incomplete: 0,
        delayedOrders: new Set<string>(),
        delayedLines: 0,
        totalDelayDays: 0,
      });
    }
    const entry = supplierMap.get(sup)!;
    entry.incomplete++;

    const parent = orders.find((o) => o.orderId === l.orderId);
    if (isLineDelayed(l, parent)) {
      entry.delayedLines++;
      entry.delayedOrders.add(l.orderId);
      const days = getLineDelayDays(l);
      entry.totalDelayDays += Math.max(0, days);
    }
  });

  const supplierSummaryList = Array.from(supplierMap.values()).sort(
    (a, b) => b.delayedLines - a.delayedLines || b.incomplete - a.incomplete
  );

  // 4. 週次遅延推移グラフ用のSVG計算（過去12週）
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

  // カード内用の更新経過時間インジケーターコンポーネント
  // 更新時刻のバッジ。ページ見出しでは常に表示し、カードではデータが古いときだけ警告として出す
  const FreshnessBadge = ({ info, always = false }: { info: ElapsedTimeInfo; always?: boolean }) =>
    !always && info.status === 'fresh' ? null : (
    <span
      title={info.description}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${info.badgeBg} ${info.badgeText} ${info.badgeBorder} shadow-2xs transition-all select-none`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${info.dotBg} ${
          info.status === 'fresh' ? 'animate-pulse' : ''
        } ring-2 ${info.dotRing}`}
      />
      <span>{info.elapsedText}</span>
    </span>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title & Context Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              全体ダッシュボード
            </h1>
            <FreshnessBadge info={freshness} always />
          </div>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            <span>全伝票・商品明細の進捗状況と遅延リスクを俯瞰します</span>
            <span className="text-slate-300">|</span>
            <span className="text-[11px] text-slate-500 font-mono">
              データ基準日時: {formatDateTime(generatedAt)}
            </span>
            <span className="text-[11px] text-slate-400">
              (※30分以上で黄色、1時間以上で赤色)
            </span>
          </p>
        </div>

        {/* Right Actions: Sync Time Display & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>最終同期: <strong className="text-slate-900">{formatDateTime(generatedAt)}</strong></span>
            <FreshnessBadge info={freshness} />
          </div>

          {/* Sync / Refresh tactile button */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg border border-blue-500 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? '取得中...' : 'データを今すぐ更新'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards (5 Cards) - Enhanced Button-like Touch & Visual Freshness Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* 1. 未完了明細数 */}
        <div
          onClick={() => onNavigateToTab('unshipped_clinics')}
          className="bg-white p-4 rounded-xl border-2 border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-md active:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                  <Package className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-700">未完了商品数</span>
              </div>
              <FreshnessBadge info={freshness} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold font-mono text-slate-900 group-hover:text-blue-600 transition">
                {incompleteLines.length}
              </span>
              <span className="text-xs text-slate-400 font-semibold">品目</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block leading-tight">
              出荷未完了の商品（発注残）
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 group-hover:text-blue-600 transition font-medium">
              未出荷管理へ
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-blue-600 bg-slate-100 group-hover:bg-blue-50 border border-slate-300 group-hover:border-blue-300 px-2 py-0.5 rounded-md shadow-2xs transition">
              <span>表示</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </span>
          </div>
        </div>

        {/* 2. 納期超過件数 */}
        <div
          onClick={() => onNavigateToTab('overdue')}
          className="bg-white p-4 rounded-xl border-2 border-rose-200 hover:border-rose-400 bg-rose-50/20 shadow-xs hover:shadow-md active:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-rose-900">納期超過</span>
              </div>
              <FreshnessBadge info={freshness} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold font-mono text-rose-600">
                {delayedOrders.length}
              </span>
              <span className="text-xs text-rose-600 font-bold">件</span>
              <span className="text-sm font-bold text-rose-700 font-mono ml-1">
                （{delayedLines.length}明細）
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block leading-tight">
              最長納品予定日超過・未出荷
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-rose-100 flex items-center justify-between">
            <span className="text-[10px] text-rose-700 transition font-medium">
              超過一覧へ
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-900 bg-rose-100 group-hover:bg-rose-200 border border-rose-300 px-2 py-0.5 rounded-md shadow-2xs transition">
              <span>表示</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </span>
          </div>
        </div>

        {/* 3. 納期間近（10日以内） */}
        <div
          onClick={() => onNavigateToTab('unshipped_clinics')}
          className="bg-white p-4 rounded-xl border-2 border-amber-200 hover:border-amber-400 bg-amber-50/20 shadow-xs hover:shadow-md active:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-amber-100 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-amber-900">納期間近（10日以内）</span>
              </div>
              <FreshnessBadge info={freshness} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold font-mono text-amber-600">
                {urgentLines.length}
              </span>
              <span className="text-xs text-amber-600 font-bold">品目</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block leading-tight">
              10日以内に納品予定の未出荷品
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between">
            <span className="text-[10px] text-amber-700 transition font-medium">
              間近案件へ
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 group-hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-md shadow-2xs transition">
              <span>表示</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </span>
          </div>
        </div>

        {/* 4. 漏れ件数 */}
        <div
          onClick={() => onNavigateToTab('alerts')}
          className="bg-white p-4 rounded-xl border-2 border-orange-200 hover:border-orange-400 bg-orange-50/20 shadow-xs hover:shadow-md active:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-orange-100 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-orange-900">漏れ件数</span>
              </div>
              <FreshnessBadge info={freshness} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold font-mono text-orange-600">
                {leakageAlertsCount}
              </span>
              <span className="text-xs text-orange-600 font-bold">明細</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold text-orange-800">
              <span className="px-1.5 py-0.5 rounded bg-orange-100">発注漏れ {missedOrderLinesCount}</span>
              <span className="px-1.5 py-0.5 rounded bg-orange-100">納期未設定 {missingDueDateLinesCount}</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block leading-tight">
              受注日から3日以上たっても未発注の明細と、納品予定日が未入力の明細（見積・出荷済みの伝票は除く）
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-orange-100 flex items-center justify-between">
            <span className="text-[10px] text-orange-700 transition font-medium">
              漏れ案件へ
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-900 bg-orange-100 group-hover:bg-orange-200 border border-orange-300 px-2 py-0.5 rounded-md shadow-2xs transition">
              <span>表示</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </span>
          </div>
        </div>

        {/* 5. 今月の納期遵守率 */}
        <div
          onClick={() => onNavigateToTab('completed')}
          className="bg-white p-4 rounded-xl border-2 border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 shadow-xs hover:shadow-md active:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-emerald-900">今月の遵守率</span>
              </div>
              <FreshnessBadge info={freshness} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              {completedThisMonth.length > 0 ? (
                <>
                  <span className="text-2xl font-extrabold font-mono text-emerald-700">
                    {onTimeRate}%
                  </span>
                  <span className="text-xs text-emerald-600 font-medium">
                    ({onTimeShippedCount}/{completedThisMonth.length}件)
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold text-slate-400">
                  データなし
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block leading-tight">
              出荷日 ≦ 最長納品予定日
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center justify-between">
            <span className="text-[10px] text-emerald-700 transition font-medium">
              納品完了実績
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-100 group-hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs transition">
              <span>表示</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </span>
          </div>
        </div>
      </div>



      {/* Quick Action Alert Cards Grid - Tactile Button Affordance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Banner 1: 発注管理 (入金済みの未発注) */}
        <div
          onClick={() => onNavigateToTab('procurement')}
          className="bg-gradient-to-br from-amber-500/10 via-white to-white border-2 border-amber-300 hover:border-amber-400 hover:shadow-md active:translate-y-0.5 p-4.5 rounded-2xl flex flex-col justify-between cursor-pointer transition shadow-xs group"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <FreshnessBadge info={freshness} />
                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 shadow-2xs">
                  発注管理
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                入金済・未発注商品
              </h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-amber-600">
                  {paidUnorderedLines.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">品目 (※送料・手数料除外)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                入金確認が完了した未発注商品。メーカーへの即時手配が可能です。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-full mt-4 py-2 px-3 bg-white hover:bg-amber-50 active:bg-amber-100 border border-amber-300 hover:border-amber-400 rounded-lg text-xs font-bold text-amber-900 flex items-center justify-between shadow-xs transition active:translate-y-px"
          >
            <span>発注管理を開く</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
          </button>
        </div>

        {/* Banner 2: 未出荷クリニック (発注残管理) */}
        <div
          onClick={() => onNavigateToTab('unshipped_clinics')}
          className="bg-gradient-to-br from-indigo-500/10 via-white to-white border-2 border-indigo-200 hover:border-indigo-400 hover:shadow-md active:translate-y-0.5 p-4.5 rounded-2xl flex flex-col justify-between cursor-pointer transition shadow-xs group"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                <Truck className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <FreshnessBadge info={freshness} />
                <span className="text-[10px] font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-300 shadow-2xs">
                  出荷進捗
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                未出荷クリニック
              </h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-indigo-600">
                  {unshippedClinicsCount}
                </span>
                <span className="text-xs text-slate-500 font-medium">施設が発注残あり</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                現在注文があり全商品が出荷完了していないクリニックの進捗一覧。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-full mt-4 py-2 px-3 bg-white hover:bg-indigo-50 active:bg-indigo-100 border border-indigo-300 hover:border-indigo-400 rounded-lg text-xs font-bold text-indigo-900 flex items-center justify-between shadow-xs transition active:translate-y-px"
          >
            <span>未出荷クリニック一覧へ</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
          </button>
        </div>

        {/* Banner 3: 納期超過アラート管理 */}
        <div
          onClick={() => onNavigateToTab('overdue')}
          className="bg-gradient-to-br from-rose-500/10 via-white to-white border-2 border-rose-300 hover:border-rose-400 hover:shadow-md active:translate-y-0.5 p-4.5 rounded-2xl flex flex-col justify-between cursor-pointer transition shadow-xs group"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <FreshnessBadge info={freshness} />
                <span className="text-[10px] font-bold text-rose-900 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300 shadow-2xs">
                  納期超過
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                納期超過・遅延管理
              </h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-rose-600">
                  {delayedOrders.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  件（{delayedLines.length}明細）
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                  発注済み {overdueBreakdown.ordered}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    overdueBreakdown.unordered > 0 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  発注漏れ {overdueBreakdown.unordered}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                  その他 {overdueBreakdown.other}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
                楽楽販売「納期：①超過」と同じ条件（最長納品予定日が過ぎ、出荷日が空欄の明細がある伝票）。
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 py-2 px-3 bg-white hover:bg-rose-50 active:bg-rose-100 border border-rose-300 hover:border-rose-400 rounded-lg text-xs font-bold text-rose-900 flex items-center justify-between shadow-xs transition active:translate-y-px"
            >
              <span>納期超過一覧を開く</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </button>
            <a
              href={RAKURAKU_OVERDUE_LIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1 shadow-xs transition"
              title="楽楽販売の「納期：①超過・②注意」一覧を開く"
            >
              楽楽販売で開く
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Content Grid: 営業別テーブル & グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: 営業別の表 (8 cols on lg) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">担当営業別の状況</h2>
                <FreshnessBadge info={freshness} />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                行をクリックすると該当営業の詳細ビューに切り替わります（※実営業担当者の集計）
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToTab('clinics')}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 px-2.5 py-1 rounded-lg transition flex items-center gap-1 shadow-2xs active:translate-y-px cursor-pointer"
              >
                <span>クリニックマスタ</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-400 font-medium">遅延件数順</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">担当営業</th>
                  <th className="py-2.5 px-3 font-semibold text-right">未完了数</th>
                  <th className="py-2.5 px-3 font-semibold text-right">遅延数</th>
                  <th className="py-2.5 px-3 font-semibold text-right">漏れ数</th>
                  <th className="py-2.5 px-4 font-semibold text-right">当月遵守率</th>
                  <th className="py-2.5 px-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repSummaryList.map((item) => {
                  const rate =
                    item.completedThisMonth > 0
                      ? Math.round((item.onTimeThisMonth / item.completedThisMonth) * 100)
                      : null;
                  return (
                    <tr
                      key={item.rep}
                      onClick={() => onSelectRepForView(item.rep)}
                      className="hover:bg-blue-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                        <span>{item.rep}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                        {item.incomplete} 件
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-bold ${
                            item.delayedLines > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {item.delayedOrders.size > 0
                            ? `${item.delayedOrders.size}件（${item.delayedLines}明細）`
                            : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-semibold ${
                            item.leakage > 0 ? 'text-orange-600' : 'text-slate-400'
                          }`}
                        >
                          {item.leakage} 件
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {rate !== null ? (
                          <span
                            className={
                              rate < 90
                                ? 'text-rose-600 font-bold'
                                : rate < 95
                                ? 'text-amber-600 font-bold'
                                : 'text-emerald-700 font-bold'
                            }
                          >
                            {rate}%
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">
                            データなし
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-white group-hover:bg-blue-600 text-slate-700 group-hover:text-white rounded border border-slate-300 group-hover:border-blue-600 font-bold text-[10px] shadow-2xs transition active:translate-y-px">
                          <span>詳細</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                  <td className="py-2.5 px-4 font-bold">合計</td>
                  <td className="py-2.5 px-3 text-right font-mono">{incompleteLines.length} 件</td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                    {delayedOrders.length}件（{delayedLines.length}明細）
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-orange-700">{alerts.filter(a => a.type === '漏れ').length} 件</td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {onTimeRate !== null ? `${onTimeRate}%` : 'データなし'}
                  </td>
                  <td className="py-2.5 px-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right: 週次遅延推移グラフ (Phase 3 Requirement) (5 cols on lg) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                  遅延明細数の推移（過去12週）
                </h2>
                <FreshnessBadge info={freshness} />
              </div>
              <span className="text-[11px] text-slate-400">各週末時点</span>
            </div>

            {/* SVG Trend Line Chart */}
            <div className="w-full overflow-hidden bg-slate-50 rounded-lg p-2 border border-slate-200">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-36 overflow-visible"
              >
                {/* Horizontal Grid lines */}
                {[0, 5, 10, 15].map((val) => {
                  const y =
                    paddingTop +
                    (1 - val / maxDelayed) * (chartHeight - paddingTop - paddingBottom);
                  return (
                    <g key={val}>
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={chartWidth - paddingRight}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={paddingLeft - 6}
                        y={y + 3}
                        fontSize="9"
                        fill="#94a3b8"
                        textAnchor="end"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Shaded Area */}
                {areaString && (
                  <path d={areaString} fill="url(#blueGradient)" opacity={0.35} />
                )}

                {/* Gradient Def */}
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Line */}
                {pathString && (
                  <path
                    d={pathString}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Data Points */}
                {points.map((p, idx) => (
                  <g key={idx} className="group">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      className="fill-white stroke-blue-600 stroke-2 hover:r-5 transition-all cursor-pointer"
                    />
                    <text
                      x={p.x}
                      y={p.y - 7}
                      fontSize="9"
                      fontWeight="bold"
                      fill="#1e293b"
                      textAnchor="middle"
                    >
                      {p.delayed}
                    </text>
                    {/* X axis week labels (every other point or first & last) */}
                    {(idx === 0 || idx === 5 || idx === points.length - 1) && (
                      <text
                        x={p.x}
                        y={chartHeight - 6}
                        fontSize="8"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        {p.weekEnd.slice(5)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>今週の遅延数: <strong>{delayedLines.length}件</strong></span>
          </div>
        </div>

      </div>

      {/* Supplier Summary Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">仕入先別の状況</h2>
              <FreshnessBadge info={freshness} />
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">遅延件数順</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">仕入先名</th>
                <th className="py-2.5 px-3 font-semibold text-right">未完了数</th>
                <th className="py-2.5 px-3 font-semibold text-right">遅延数</th>
                <th className="py-2.5 px-4 font-semibold text-right">平均遅延日数</th>
                <th className="py-2.5 px-4 font-semibold text-slate-500">ステータス所見</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierSummaryList.map((item) => {
                const avgDays =
                  item.delayedLines > 0 ? (item.totalDelayDays / item.delayedLines).toFixed(1) : '0';
                return (
                  <tr key={item.supplier} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.supplier}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                      {item.incomplete} 件
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      <span
                        className={`font-bold ${
                          item.delayedLines > 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {item.delayedOrders.size > 0
                          ? `${item.delayedOrders.size}件（${item.delayedLines}明細）`
                          : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                      {item.delayedLines > 0 ? `${avgDays} 日` : '-'}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      {item.delayedLines >= 3 ? (
                        <span className="text-rose-600 font-semibold">遅延頻発・要注意</span>
                      ) : item.delayedLines > 0 ? (
                        <span className="text-amber-600">一部納品遅れあり</span>
                      ) : (
                        <span className="text-emerald-700">順調・納期遵守中</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
              <tr>
                <td className="py-2.5 px-4 font-bold">合計</td>
                <td className="py-2.5 px-3 text-right font-mono">{incompleteLines.length} 件</td>
                <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                  {delayedOrders.length}件（{delayedLines.length}明細）
                </td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {delayedLines.length > 0
                    ? `${(supplierSummaryList.reduce((acc, s) => acc + s.totalDelayDays, 0) / delayedLines.length).toFixed(1)} 日`
                    : '-'}
                </td>
                <td className="py-2.5 px-4 text-[11px] text-slate-500"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Integrated Delivery Progress Schedule Timeline Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-indigo-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>納期進捗スケジュール・タイムライン一覧</span>
              </h2>
            </div>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              進行中の全注文明細の最長納品予定日および進捗ステージを一覧でタイムライン確認できます
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">受注ID</th>
                <th className="py-2.5 px-3 font-semibold">クリニック名</th>
                <th className="py-2.5 px-3 font-semibold">商品名</th>
                <th className="py-2.5 px-3 font-semibold">担当営業</th>
                <th className="py-2.5 px-3 font-semibold">工程ステージ</th>
                <th className="py-2.5 px-3 font-semibold">最長納期</th>
                <th className="py-2.5 px-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incompleteLines.slice(0, 10).map((line) => {
                const parent = orders.find((o) => o.orderId === line.orderId);
                return (
                  <tr
                    key={line.lineKey}
                    onClick={() => parent && onSelectOrder?.(parent, line.lineKey)}
                    className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 group-hover:underline">
                      {line.orderId}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {line.orderCustomer}
                    </td>
                    <td className="py-3 px-3 text-slate-800 font-medium truncate max-w-xs">
                      {line.productName}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {line.salesRep || '未設定'}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        line.stage === '出荷完了' ? 'bg-emerald-100 text-emerald-800' :
                        line.stage === '一部出荷' ? 'bg-sky-100 text-sky-800' :
                        line.stage === '発注済・入荷待ち' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {line.stage}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">
                      {formatDate(line.latestDate)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white group-hover:bg-indigo-600 text-slate-700 group-hover:text-white rounded border border-slate-300 group-hover:border-indigo-600 font-bold text-[10px] shadow-2xs transition">
                        <span>詳細</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Delayed Orders Detail Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-rose-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                要対応・超過伝票のクイック詳細
              </h2>
              <FreshnessBadge info={freshness} />
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5">
              行をクリックすると、該当伝票の詳細内容や進捗をいつでも確認・操作できます
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('overdue')}
            className="text-xs font-bold text-rose-700 hover:text-rose-800 bg-white border border-rose-300 px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-xs active:translate-y-px cursor-pointer"
          >
            <span>超過管理へ移動</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">受注ID</th>
                <th className="py-2.5 px-3 font-semibold">クリニック名</th>
                <th className="py-2.5 px-3 font-semibold">担当営業</th>
                <th className="py-2.5 px-3 font-semibold">商品・明細</th>
                <th className="py-2.5 px-3 font-semibold">最長納期</th>
                <th className="py-2.5 px-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders
                .filter((o) => {
                  const hasDelayedLine = o.lines.some((l) => {
                    if (l.stage === '出荷完了' || isShippingOrFee(l.productName, l.productId)) return false;
                    if (!l.latestDate) return false;
                    return new Date(l.latestDate + 'T00:00:00+09:00') < today && isEligibleForOverdue(o);
                  });
                  return hasDelayedLine;
                })
                .slice(0, 8)
                .map((ord) => (
                  <tr
                    key={ord.orderId}
                    onClick={() => onSelectOrder?.(ord)}
                    className="hover:bg-rose-50/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 group-hover:underline">
                      {ord.orderId}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {ord.customerName}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {ord.salesRep || '未設定'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-xs">
                      {ord.lines.map((l) => l.productName).join(', ')}
                    </td>
                    <td className="py-3 px-3 font-mono text-rose-600 font-bold">
                      {formatDate(ord.lines.reduce((max, l) => (!max || (l.latestDate && l.latestDate > max)) ? l.latestDate : max, null as string | null))}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white group-hover:bg-rose-600 text-slate-700 group-hover:text-white rounded border border-slate-300 group-hover:border-rose-600 font-bold text-[10px] shadow-2xs transition">
                        <span>詳細を見る</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
