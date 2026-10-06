import React, { useState, useMemo } from 'react';
import { Order, PeriodFilter } from '../types';
import { formatCurrency, formatNumber, formatDate, isShippingOrFee } from '../utils';
import { getSalesRepsList } from '../utils/salesRepMapping';
import {
  TrendingUp,
  Target,
  DollarSign,
  Award,
  AlertCircle,
  Sparkles,
  Building2,
  User,
  Calendar,
  CheckCircle2,
  ArrowUpRight,
  Filter,
  Download,
  Settings,
  ChevronRight,
  ExternalLink,
  Zap,
  FileText,
  CreditCard,
  Clock,
  BarChart3
} from 'lucide-react';

interface SalesManagementViewProps {
  orders: Order[];
  salesReps: string[];
  onSelectOrder: (order: Order) => void;
  onOpenClinicStatus: (clinicName: string) => void;
}

const STORAGE_BUDGET_KEY = 'nouki_sales_budgets_v1';

export const SalesManagementView: React.FC<SalesManagementViewProps> = ({
  orders,
  salesReps: propSalesReps,
  onSelectOrder,
  onOpenClinicStatus,
}) => {
  const repsList = useMemo(() => {
    const list = getSalesRepsList();
    return list.length > 0 ? list : ['大谷', '高桑', '大津'];
  }, [propSalesReps]);

  // Budget settings state (persisted)
  const [budgets, setBudgets] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_BUDGET_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const defaults: Record<string, number> = {
      company: 15000000, // 1500万円
    };
    repsList.forEach((r) => {
      defaults[r] = 5000000;
    });
    return defaults;
  });

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, number>>(budgets);

  // Basis selection: order | billing | payment_collected
  const [salesBasis, setSalesBasis] = useState<'order' | 'billing' | 'payment_collected'>('payment_collected');

  // Selected Month (Default to 2026-09)
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');

  const handleSaveBudgets = () => {
    setBudgets(tempBudgets);
    try {
      localStorage.setItem(STORAGE_BUDGET_KEY, JSON.stringify(tempBudgets));
    } catch {}
    setIsEditingBudget(false);
  };

  // 全利用可能な月リストの抽出
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.orderDate) set.add(o.orderDate.slice(0, 7));
      if (o.billingDate) set.add(o.billingDate.slice(0, 7));
      if (o.paymentDate) set.add(o.paymentDate.slice(0, 7));
    });
    set.add('2026-06');
    set.add('2026-07');
    set.add('2026-08');
    set.add('2026-09');
    set.add('2026-10');
    set.add('2026-11');
    set.add('2026-12');
    return Array.from(set).sort().reverse();
  }, [orders]);

  // 各オーダーの金額算出ヘルパー
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

  // 選択月のデータに限定して抽出
  const monthOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.quoteExpiredOverWeek) return false;
      const refDate = salesBasis === 'payment_collected' ? (o.paymentDate || o.orderDate) :
                      salesBasis === 'billing' ? (o.billingDate || o.orderDate) :
                      o.orderDate;
      if (!refDate) return false;
      return refDate.startsWith(selectedMonth);
    });
  }, [orders, selectedMonth, salesBasis]);

  // 選択月の3ベース総額
  const summaryBases = useMemo(() => {
    let orderTotal = 0;
    let billingTotal = 0;
    let paymentCollectedTotal = 0;

    orders.forEach((o) => {
      if (o.quoteExpiredOverWeek) return;
      const refDate = o.orderDate || '';
      if (refDate.startsWith(selectedMonth)) {
        orderTotal += getOrderAmount(o);
        billingTotal += getBillingAmount(o);
        paymentCollectedTotal += getPaidAmount(o);
      }
    });

    return { orderTotal, billingTotal, paymentCollectedTotal };
  }, [orders, selectedMonth]);

  const companyBudget = budgets['company'] || 15000000;
  
  // 選択月の選択ベース売上実績
  const companyTotalSales = useMemo(() => {
    return monthOrders.reduce((sum, o) => sum + getBasisAmount(o, salesBasis), 0);
  }, [monthOrders, salesBasis]);

  const companyAchievementRate = companyBudget > 0 ? (companyTotalSales / companyBudget) * 100 : 0;
  const companyShortfall = Math.max(0, companyBudget - companyTotalSales);

  // 月別トレンドデータ（全利用可能な月ごとの推移）
  const monthlyTrendData = useMemo(() => {
    return availableMonths.map((m) => {
      let mOrders = orders.filter((o) => !o.quoteExpiredOverWeek && (o.orderDate || '').startsWith(m));
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

  // 営業担当別の集計（選択月中）
  const repStats = useMemo(() => {
    const map = new Map<string, {
      repName: string;
      totalSales: number;
      orderCount: number;
      clinicSet: Set<string>;
      orders: Order[];
      orderSales: number;
      billingSales: number;
      paymentSales: number;
    }>();

    repsList.forEach((r) => {
      map.set(r, { repName: r, totalSales: 0, orderCount: 0, clinicSet: new Set(), orders: [], orderSales: 0, billingSales: 0, paymentSales: 0 });
    });

    map.set('未割当', { repName: '未割当', totalSales: 0, orderCount: 0, clinicSet: new Set(), orders: [], orderSales: 0, billingSales: 0, paymentSales: 0 });

    monthOrders.forEach((o) => {
      const rep = o.salesRep && map.has(o.salesRep) ? o.salesRep : '未割当';
      if (!map.has(rep)) {
        map.set(rep, { repName: rep, totalSales: 0, orderCount: 0, clinicSet: new Set(), orders: [], orderSales: 0, billingSales: 0, paymentSales: 0 });
      }
      const entry = map.get(rep)!;
      
      const ordAmt = getOrderAmount(o);
      const billAmt = getBillingAmount(o);
      const paidAmt = getPaidAmount(o);
      const currentSelectedAmt = getBasisAmount(o, salesBasis);

      entry.totalSales += currentSelectedAmt;
      entry.orderSales += ordAmt;
      entry.billingSales += billAmt;
      entry.paymentSales += paidAmt;

      entry.orderCount += 1;
      if (o.customerName) entry.clinicSet.add(o.customerName);
      entry.orders.push(o);
    });

    return Array.from(map.values()).map((item) => {
      const target = budgets[item.repName] || 5000000;
      const rate = target > 0 ? (item.totalSales / target) * 100 : 0;
      const shortfall = Math.max(0, target - item.totalSales);
      return {
        ...item,
        clinicCount: item.clinicSet.size,
        target,
        achievementRate: rate,
        shortfall,
      };
    });
  }, [monthOrders, repsList, budgets, salesBasis]);

  // 選択月の未入金・回収予測
  const billingForecast = useMemo(() => {
    let billedUnpaidTotal = 0;
    monthOrders.forEach((o) => {
      const amt = getBillingAmount(o);
      const paid = getPaidAmount(o);
      if (paid === 0) {
        billedUnpaidTotal += amt;
      }
    });
    return { expectedNextMonthCash: billedUnpaidTotal };
  }, [monthOrders]);

  // スマートサジェスト
  const smartSuggestions = useMemo(() => {
    const clinicLastOrderMap = new Map<string, {
      clinicName: string;
      salesRep: string;
      lastOrderDate: string;
      orderCount: number;
      totalAmount: number;
      avgAmount: number;
    }>();

    orders.forEach((o) => {
      if (!o.customerName || o.quoteExpiredOverWeek) return;
      const name = o.customerName;
      const rep = o.salesRep || '未割当';
      const amount = getOrderAmount(o);

      if (!clinicLastOrderMap.has(name)) {
        clinicLastOrderMap.set(name, {
          clinicName: name,
          salesRep: rep,
          lastOrderDate: o.orderDate,
          orderCount: 1,
          totalAmount: amount,
          avgAmount: amount,
        });
      } else {
        const entry = clinicLastOrderMap.get(name)!;
        entry.orderCount += 1;
        entry.totalAmount += amount;
        entry.avgAmount = entry.totalAmount / entry.orderCount;
        if (o.orderDate > entry.lastOrderDate) {
          entry.lastOrderDate = o.orderDate;
          entry.salesRep = rep;
        }
      }
    });

    const today = new Date('2026-09-24T00:00:00');
    const candidates: Array<{
      clinicName: string;
      salesRep: string;
      lastOrderDate: string;
      daysSinceLastOrder: number;
      estimatedOrderAmount: number;
      reason: string;
    }> = [];

    clinicLastOrderMap.forEach((val) => {
      if (!val.lastOrderDate) return;
      const lastDate = new Date(val.lastOrderDate.split('T')[0] + 'T00:00:00');
      const diffTime = today.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 25 && diffDays <= 75) {
        candidates.push({
          clinicName: val.clinicName,
          salesRep: val.salesRep,
          lastOrderDate: val.lastOrderDate,
          daysSinceLastOrder: diffDays,
          estimatedOrderAmount: Math.round(val.avgAmount > 0 ? val.avgAmount : 120000),
          reason: `前回発注（${val.lastOrderDate}）から ${diffDays}日経過。平均発注スパンに合致するリピート有力候補`,
        });
      }
    });

    return candidates.sort((a, b) => b.estimatedOrderAmount - a.estimatedOrderAmount);
  }, [orders]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Page Title & Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                営業売上管理・月別推移 & 請求入金分析
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                表示月: {selectedMonth}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                対象件数: {monthOrders.length} 件
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              月毎の売上推移（入金済ベース・請求ベース・受注ベース）を一覧確認し、任意の月を選択して詳細な内訳や予算達成率を分析できます。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>

          {/* Basis Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setSalesBasis('payment_collected')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                salesBasis === 'payment_collected' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              入金済ベース
            </button>
            <button
              onClick={() => setSalesBasis('billing')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                salesBasis === 'billing' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              請求ベース
            </button>
            <button
              onClick={() => setSalesBasis('order')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                salesBasis === 'order' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              受注ベース
            </button>
          </div>

          <button
            onClick={() => {
              setTempBudgets(budgets);
              setIsEditingBudget(!isEditingBudget);
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{isEditingBudget ? '予算設定を閉じる' : '当月予算変更'}</span>
          </button>
        </div>
      </div>

      {/* Budget Editor Drawer */}
      {isEditingBudget && (
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-lg border border-indigo-800 space-y-4 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-sm">予算目標の設定</h3>
            </div>
            <span className="text-xs text-indigo-300">各担当および全社の目標金額（円）を変更できます</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-800/90 border border-indigo-700/60 p-3.5 rounded-xl space-y-1.5">
              <label className="block font-bold text-indigo-200">全社 合計目標予算</label>
              <input
                type="number"
                step="100000"
                value={tempBudgets['company'] || 0}
                onChange={(e) => setTempBudgets({ ...tempBudgets, company: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-900 border border-indigo-600 rounded-lg font-mono text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {repsList.map((rep) => (
              <div key={rep} className="bg-slate-800/90 border border-slate-700 p-3.5 rounded-xl space-y-1.5">
                <label className="block font-bold text-slate-300">担当: {rep} 予算</label>
                <input
                  type="number"
                  step="100000"
                  value={tempBudgets[rep] || 0}
                  onChange={(e) => setTempBudgets({ ...tempBudgets, [rep]: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-800/80">
            <button
              onClick={() => setIsEditingBudget(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleSaveBudgets}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
            >
              予算を保存する
            </button>
          </div>
        </div>
      )}

      {/* Monthly Trend Table (月別推移一覧) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">月別 売上推移一覧（各月クリックで切り替え）</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">全期間の月別実績比較</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">対象月</th>
                <th className="py-3 px-4">入金済実績 (回収)</th>
                <th className="py-3 px-4">請求ベース実績</th>
                <th className="py-3 px-4">受注ベース実績</th>
                <th className="py-3 px-4">月間予算目標</th>
                <th className="py-3 px-4">達成率</th>
                <th className="py-3 px-4">受注件数</th>
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
                    onClick={() => setSelectedMonth(m.month)}
                    className={`hover:bg-indigo-50/50 cursor-pointer transition ${
                      isSelected ? 'bg-indigo-50/80 font-bold' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                      <span>{m.month} 月</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-700 font-bold">
                      {formatCurrency(m.paymentCollectedTotal)}
                    </td>
                    <td className="py-3 px-4 font-mono text-blue-700">
                      {formatCurrency(m.billingTotal)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800">
                      {formatCurrency(m.orderTotal)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {formatCurrency(m.target)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        isAchieved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {m.achievementRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {m.orderCount} 件
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMonth(m.month);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isSelected ? '表示中' : 'この月を選択'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Month Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setSalesBasis('payment_collected')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            salesBasis === 'payment_collected' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>{selectedMonth} 入金済ベース (Collection)</span>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-bold text-emerald-700 font-mono block">
            {formatCurrency(summaryBases.paymentCollectedTotal)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            選択月の入金済み金額
          </span>
        </div>

        <div
          onClick={() => setSalesBasis('billing')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            salesBasis === 'billing' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>{selectedMonth} 請求ベース (Billing)</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-bold text-blue-700 font-mono block">
            {formatCurrency(summaryBases.billingTotal)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            選択月の発行済み請求総額
          </span>
        </div>

        <div
          onClick={() => setSalesBasis('order')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            salesBasis === 'order' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>{selectedMonth} 受注ベース (Order)</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-2xl font-bold text-slate-900 font-mono block">
            {formatCurrency(summaryBases.orderTotal)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            選択月の全受注伝票総額
          </span>
        </div>
      </div>

      {/* Selected Month KPI Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              {selectedMonth}度 売上予算・達成状況（選択中: <span className="text-emerald-700 font-bold">{salesBasis === 'payment_collected' ? '入金済ベース' : salesBasis === 'billing' ? '請求ベース' : '受注ベース'}</span>）
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {selectedMonth} 実績集計
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">{selectedMonth} 実績 (Actual)</span>
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrency(companyTotalSales)}
            </span>
            <span className="text-[11px] text-slate-500 block">
              対象伝票数: {monthOrders.length} 件
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">月間予算目標 (Budget)</span>
            <span className="text-2xl font-bold text-indigo-600 font-mono">
              {formatCurrency(companyBudget)}
            </span>
            <span className="text-[11px] text-slate-400 block">
              設定目標値
            </span>
          </div>

          <div className={`border p-4 rounded-xl space-y-1 ${
            companyAchievementRate >= 100
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : companyAchievementRate >= 80
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <span className="text-xs font-semibold block opacity-80">予算達成率 (Achievement)</span>
            <span className="text-2xl font-bold font-mono">
              {companyAchievementRate.toFixed(1)}%
            </span>
            <span className="text-[11px] font-medium block">
              {companyAchievementRate >= 100 ? '🎉 目標達成クリア！' : `あと ${formatCurrency(companyShortfall)} 不足`}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">未入金・回収予定残 (Forecast)</span>
            <span className="text-2xl font-bold text-blue-700 font-mono">
              {formatCurrency(billingForecast.expectedNextMonthCash)}
            </span>
            <span className="text-[11px] text-slate-500 block">
              未回収残高
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-750">{selectedMonth}度 全体達成プログレス</span>
            <span className="font-mono text-indigo-600">{companyAchievementRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                companyAchievementRate >= 100
                  ? 'bg-emerald-500'
                  : companyAchievementRate >= 80
                  ? 'bg-amber-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, companyAchievementRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sales Rep Breakdown Table (Selected Month) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {selectedMonth}度 営業担当別 実績一覧（入金済ベース / 請求ベース / 受注ベース）
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">選択月の担当別内訳</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">担当営業</th>
                <th className="py-3 px-4">入金済実績 (回収)</th>
                <th className="py-3 px-4">請求ベース実績</th>
                <th className="py-3 px-4">受注ベース実績</th>
                <th className="py-3 px-4">月間予算目標</th>
                <th className="py-3 px-4">達成率 (選択中)</th>
                <th className="py-3 px-4">不足額 (Gap)</th>
                <th className="py-3 px-4 text-right">進捗ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repStats.map((rep) => {
                const isAchieved = rep.achievementRate >= 100;
                const isGood = rep.achievementRate >= 80;

                return (
                  <tr key={rep.repName} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                        {rep.repName.slice(0, 1)}
                      </div>
                      <span>{rep.repName}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                      {formatCurrency(rep.paymentSales)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-blue-700">
                      {formatCurrency(rep.billingSales)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                      {formatCurrency(rep.orderSales)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {formatCurrency(rep.target)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold">
                      <span className={`px-2 py-1 rounded-md text-xs ${
                        isAchieved
                          ? 'bg-emerald-100 text-emerald-800'
                          : isGood
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {rep.achievementRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {rep.shortfall > 0 ? formatCurrency(rep.shortfall) : '達成済 🎉'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isAchieved ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          目標達成
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          推進中
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Smart Suggestions Section */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-700/60 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/50 border border-indigo-400/40 rounded-xl text-indigo-200">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>目標達成に向けたスマート発注サジェスト（不足ギャップ提案）</span>
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                {selectedMonth}度の残り不足予算（{formatCurrency(companyShortfall)}）を穴埋めするため、過去の発注スパンから「現在発注間隔が空いているクリニック」を自動抽出しました。
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold bg-indigo-800/80 border border-indigo-600 px-3 py-1.5 rounded-xl text-indigo-200 shrink-0">
            提案候補: {smartSuggestions.length} 院
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {smartSuggestions.slice(0, 6).map((sug, idx) => (
            <div
              key={idx}
              className="bg-slate-800/90 border border-indigo-700/60 rounded-xl p-4 space-y-3 shadow-sm hover:border-indigo-500 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => onOpenClinicStatus(sug.clinicName)}
                  className="font-bold text-sm text-blue-300 hover:text-white hover:underline text-left cursor-pointer flex items-center gap-1"
                >
                  <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="truncate">{sug.clinicName}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </button>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900 text-indigo-200 border border-indigo-700 shrink-0">
                  担当: {sug.salesRep}
                </span>
              </div>

              <div className="text-xs text-slate-300 space-y-1 font-mono bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/80">
                <div className="flex justify-between">
                  <span className="text-slate-400">想定受注金額:</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(sug.estimatedOrderAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">経過日数:</span>
                  <span className="font-bold text-amber-300">{sug.daysSinceLastOrder} 日経過 (前回: {formatDate(sug.lastOrderDate)})</span>
                </div>
              </div>

              <p className="text-[11px] text-indigo-200 leading-relaxed bg-indigo-950/60 p-2 rounded border border-indigo-900">
                💡 <b>サジェスト根拠:</b> {sug.reason}。今月中のリピート発注のご案内により目標達成を強力にサポートします。
              </p>

              <div className="flex items-center justify-end pt-1">
                <button
                  onClick={() => onOpenClinicStatus(sug.clinicName)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <span>商品ステータス・発注履歴を確認</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
