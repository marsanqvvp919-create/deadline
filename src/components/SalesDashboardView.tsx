import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency, formatDate, recentYearMonths } from '../utils';
import { getSalesRepsList } from '../utils/salesRepMapping';
import {
  TrendingUp,
  Target,
  BarChart3,
  Calendar,
  Settings,
  FileText,
  CreditCard,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

interface SalesDashboardViewProps {
  orders: Order[];
  salesReps: string[];
  budgets: Record<string, number>;
  salesBasis: 'order' | 'billing' | 'payment_collected';
  selectedMonth: string;
  onSelectMonth: (m: string) => void;
  onOpenBudgetSettings: () => void;
  onOpenClinicStatus: (clinicName: string) => void;
  onNavigateToRepSales?: (month: string) => void;
}

// 日付正規化ヘルパー（2026/09 と 2026-09 を確実に統合する）
const getNormalizedYearMonth = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = dateStr.trim().replace(/\//g, '-');
  if (cleaned.length >= 7) {
    return cleaned.slice(0, 7);
  }
  return '';
};

export const SalesDashboardView: React.FC<SalesDashboardViewProps> = ({
  orders,
  salesReps: propSalesReps,
  budgets,
  salesBasis,
  selectedMonth,
  onSelectMonth,
  onOpenBudgetSettings,
  onNavigateToRepSales,
}) => {
  const repsList = useMemo(() => {
    const list = getSalesRepsList();
    return list.length > 0 ? list : ['大谷', '高桑', '大津'];
  }, [propSalesReps]);

  // 重複のない正規化された月リストを抽出
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const ym = getNormalizedYearMonth(o.orderDate);
      if (ym) set.add(ym);
    });
    if (set.size === 0) {
      recentYearMonths(5).forEach((m) => set.add(m));
    }
    return Array.from(set).sort().reverse();
  }, [orders]);

  const getOrderAmount = (o: Order) => {
    return o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount :
      (o.lines || []).reduce((s, l) => s + ((l.unitPrice || 15000) * l.quantity), 0);
  };

  const getBillingAmount = (o: Order) => {
    return o.billingAmount !== undefined && o.billingAmount !== null ? o.billingAmount : getOrderAmount(o);
  };

  const getPaidAmount = (o: Order) => {
    const billAmt = getBillingAmount(o);
    if (o.paymentStatus === '入金済' || o.paymentDate || o.billingStatus === '入金済') {
      return billAmt;
    }
    if (o.billingStatus === '一部入金') {
      return Math.round(billAmt * 0.5);
    }
    return 0;
  };

  const getBasisAmount = (o: Order, basis: 'order' | 'billing' | 'payment_collected') => {
    const ordAmt = getOrderAmount(o);
    const billAmt = getBillingAmount(o);
    const paidAmt = getPaidAmount(o);

    if (basis === 'order') return ordAmt;
    if (basis === 'billing') return billAmt;
    if (basis === 'payment_collected') return paidAmt;
    return ordAmt;
  };

  // 選択月の注文データ（正規化月一致で抽出）
  const monthOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.quoteExpiredOverWeek) return false;
      const ym = getNormalizedYearMonth(o.orderDate);
      return ym === selectedMonth;
    });
  }, [orders, selectedMonth]);

  const summaryBases = useMemo(() => {
    let orderTotal = 0;
    let billingTotal = 0;
    let paymentCollectedTotal = 0;

    monthOrders.forEach((o) => {
      orderTotal += getOrderAmount(o);
      billingTotal += getBillingAmount(o);
      paymentCollectedTotal += getPaidAmount(o);
    });

    return { orderTotal, billingTotal, paymentCollectedTotal };
  }, [monthOrders]);

  const companyBudget = budgets['company'] || 0;
  
  const companyTotalSales = useMemo(() => {
    return monthOrders.reduce((sum, o) => sum + getBasisAmount(o, salesBasis), 0);
  }, [monthOrders, salesBasis]);

  const companyAchievementRate = companyBudget > 0 ? (companyTotalSales / companyBudget) * 100 : 0;
  const companyShortfall = Math.max(0, companyBudget - companyTotalSales);

  const monthlyTrendData = useMemo(() => {
    return availableMonths.map((m) => {
      const mOrders = orders.filter((o) => !o.quoteExpiredOverWeek && getNormalizedYearMonth(o.orderDate) === m);
      let ordTot = 0;
      let billTot = 0;
      let paidTot = 0;

      mOrders.forEach((o) => {
        ordTot += getOrderAmount(o);
        billTot += getBillingAmount(o);
        paidTot += getPaidAmount(o);
      });

      const target = companyBudget;
      const currentSelectedVal = salesBasis === 'order' ? ordTot : salesBasis === 'billing' ? billTot : paidTot;
      const rate = target > 0 ? (currentSelectedVal / target) * 100 : 0;

      return {
        month: m,
        orderTotal: ordTot,
        billingTotal: billTot,
        paymentCollectedTotal: paidTot,
        selectedVal: currentSelectedVal,
        target,
        achievementRate: rate,
        orderCount: mOrders.length,
      };
    });
  }, [orders, availableMonths, companyBudget, salesBasis]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Header & Month Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                売上・回収ダッシュボード
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                表示月: {selectedMonth}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              全社の月別売上推移（入金済ベース・請求ベース・受注ベース）および当月目標達成状況を俯瞰します。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => onSelectMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onOpenBudgetSettings}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>予算設定</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              {selectedMonth}度 予算達成状況（現在選択基準: <span className="text-emerald-700 font-bold">{salesBasis === 'payment_collected' ? '入金済ベース' : salesBasis === 'billing' ? '請求ベース' : '受注ベース'}</span>）
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">実績 (Actual)</span>
            <span className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(companyTotalSales)}</span>
            <span className="text-[11px] text-slate-500 block">対象伝票数: {monthOrders.length} 件</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">月間予算目標 (Budget)</span>
            <span className="text-2xl font-bold text-indigo-600 font-mono">{companyBudget > 0 ? formatCurrency(companyBudget) : '未設定'}</span>
            <span className="text-[11px] text-slate-400 block">{companyBudget > 0 ? '設定目標値' : '「予算設定」から入力してください'}</span>
          </div>
          <div className={`border p-4 rounded-xl space-y-1 ${
            companyAchievementRate >= 100 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <span className="text-xs font-semibold block opacity-80">予算達成率 (Achievement)</span>
            <span className="text-2xl font-bold font-mono">{companyBudget > 0 ? `${companyAchievementRate.toFixed(1)}%` : '—'}</span>
            <span className="text-[11px] font-medium block">
              {companyBudget <= 0 ? '予算が未設定です' : companyAchievementRate >= 100 ? '🎉 目標達成クリア！' : `あと ${formatCurrency(companyShortfall)} 不足`}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700">{selectedMonth}度 達成プログレス</span>
            <span className="font-mono text-indigo-600">{companyAchievementRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                companyAchievementRate >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, companyAchievementRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Monthly Trend Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">月別 売上・回収推移一覧</h2>
          </div>
          <span className="text-xs text-indigo-700 font-semibold bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
            💡 対象月をクリックするとその月の「営業別売上」に直接遷移します
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">対象月</th>
                <th className="py-3 px-4">入金済実績 (回収)</th>
                <th className="py-3 px-4">請求ベース</th>
                <th className="py-3 px-4">受注ベース</th>
                <th className="py-3 px-4">月間予算</th>
                <th className="py-3 px-4">達成率</th>
                <th className="py-3 px-4 text-right">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyTrendData.map((m) => {
                const isSelected = m.month === selectedMonth;
                const isAchieved = m.achievementRate >= 100;
                return (
                  <tr
                    key={m.month}
                    onClick={() => {
                      onSelectMonth(m.month);
                      if (onNavigateToRepSales) onNavigateToRepSales(m.month);
                    }}
                    className={`hover:bg-indigo-50/50 cursor-pointer transition ${isSelected ? 'bg-indigo-50/80 font-bold' : ''}`}
                    title="クリックしてこの月の営業別売上に遷移"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{m.month} 月</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-indigo-600 text-white rounded font-sans">表示中</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-700 font-bold">{formatCurrency(m.paymentCollectedTotal)}</td>
                    <td className="py-3 px-4 font-mono text-blue-700">{formatCurrency(m.billingTotal)}</td>
                    <td className="py-3 px-4 font-mono text-slate-800">{formatCurrency(m.orderTotal)}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{m.target > 0 ? formatCurrency(m.target) : '未設定'}</td>
                    <td className="py-3 px-4 font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${isAchieved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {m.target > 0 ? `${m.achievementRate.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMonth(m.month);
                          if (onNavigateToRepSales) onNavigateToRepSales(m.month);
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer inline-flex items-center gap-1 shadow-xs ml-auto"
                      >
                        <span>営業別売上へ</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
