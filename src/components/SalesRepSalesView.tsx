import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { getSalesRepsList } from '../utils/salesRepMapping';
import {
  Users,
  User,
  CheckCircle2,
  Calendar,
  Settings,
  DollarSign,
  Building2,
  Award,
  ChevronRight,
  X,
  FileText
} from 'lucide-react';

interface SalesRepSalesViewProps {
  orders: Order[];
  salesReps: string[];
  budgets: Record<string, number>;
  salesBasis: 'order' | 'billing' | 'payment_collected';
  selectedMonth: string;
  onSelectMonth: (m: string) => void;
  onOpenBudgetSettings: () => void;
  onSelectOrder: (order: Order) => void;
}

const getNormalizedYearMonth = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = dateStr.trim().replace(/\//g, '-');
  if (cleaned.length >= 7) {
    return cleaned.slice(0, 7);
  }
  return '';
};

export const SalesRepSalesView: React.FC<SalesRepSalesViewProps> = ({
  orders,
  salesReps: propSalesReps,
  budgets,
  salesBasis,
  selectedMonth,
  onSelectMonth,
  onOpenBudgetSettings,
  onSelectOrder,
}) => {
  const repsList = useMemo(() => {
    const list = getSalesRepsList();
    return list.length > 0 ? list : ['大谷', '高桑', '大津'];
  }, [propSalesReps]);

  const [selectedRepForDetail, setSelectedRepForDetail] = useState<{
    repName: string;
    orders: Order[];
    totalSales: number;
  } | null>(null);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const ym = getNormalizedYearMonth(o.orderDate);
      if (ym) set.add(ym);
    });
    if (set.size === 0) {
      set.add('2026-06');
      set.add('2026-07');
      set.add('2026-08');
      set.add('2026-09');
      set.add('2026-10');
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

  const monthOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.quoteExpiredOverWeek) return false;
      const ym = getNormalizedYearMonth(o.orderDate);
      return ym === selectedMonth;
    });
  }, [orders, selectedMonth]);

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

  const clinicRankStats = useMemo(() => {
    const clinicSalesMap = new Map<string, { clinicName: string; totalSales: number; orderCount: number }>();

    monthOrders.forEach((o) => {
      if (!o.customerName || o.quoteExpiredOverWeek) return;
      const name = o.customerName;
      const amt = getOrderAmount(o);
      if (!clinicSalesMap.has(name)) {
        clinicSalesMap.set(name, { clinicName: name, totalSales: 0, orderCount: 0 });
      }
      const entry = clinicSalesMap.get(name)!;
      entry.totalSales += amt;
      entry.orderCount += 1;
    });

    let sRankTotal = 0, sCount = 0;
    let aRankTotal = 0, aCount = 0;
    let bRankTotal = 0, bCount = 0;
    let cRankTotal = 0, cCount = 0;

    clinicSalesMap.forEach((val) => {
      if (val.totalSales >= 1000000) {
        sRankTotal += val.totalSales;
        sCount += 1;
      } else if (val.totalSales >= 500000) {
        aRankTotal += val.totalSales;
        aCount += 1;
      } else if (val.totalSales >= 200000) {
        bRankTotal += val.totalSales;
        bCount += 1;
      } else {
        cRankTotal += val.totalSales;
        cCount += 1;
      }
    });

    return [
      { rank: 'Sランク (月間100万以上)', totalSales: sRankTotal, clinicCount: sCount, color: 'bg-purple-100 text-purple-800 border-purple-300' },
      { rank: 'Aランク (月間50万〜)', totalSales: aRankTotal, clinicCount: aCount, color: 'bg-blue-100 text-blue-800 border-blue-300' },
      { rank: 'Bランク (月間20万〜)', totalSales: bRankTotal, clinicCount: bCount, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      { rank: 'Cランク (月間〜20万)', totalSales: cRankTotal, clinicCount: cCount, color: 'bg-slate-100 text-slate-800 border-slate-300' },
    ];
  }, [monthOrders]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Header & Month Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                営業別売上管理・内訳分析
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                表示月: {selectedMonth}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              各営業担当をクリックすると個別伝票の内訳が表示されます。また下部ではクリニックのランク別売上を集計しています。
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

      {/* Sales Rep Breakdown Table (Clickable for detail) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {selectedMonth}度 営業担当別 実績一覧（行クリックで内訳表示）
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">担当別詳細内訳</span>
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
                <th className="py-3 px-4">達成率</th>
                <th className="py-3 px-4">不足額 (Gap)</th>
                <th className="py-3 px-4 text-right">内訳・アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repStats.map((rep) => {
                const isAchieved = rep.achievementRate >= 100;
                const isGood = rep.achievementRate >= 80;

                return (
                  <tr
                    key={rep.repName}
                    onClick={() => setSelectedRepForDetail({ repName: rep.repName, orders: rep.orders, totalSales: rep.totalSales })}
                    className="hover:bg-indigo-50/60 cursor-pointer transition"
                  >
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
                        isAchieved ? 'bg-emerald-100 text-emerald-800' : isGood ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {rep.achievementRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {rep.shortfall > 0 ? formatCurrency(rep.shortfall) : '達成済 🎉'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRepForDetail({ repName: rep.repName, orders: rep.orders, totalSales: rep.totalSales });
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>内訳を見る</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinic Rank Sales Analysis Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">クリニック ランク別売上実績 (S / A / B / C ランク)</h2>
          </div>
          <span className="text-xs text-slate-500">顧客ごとの累計取引額に基づくランク分類</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {clinicRankStats.map((rk, idx) => (
            <div key={idx} className={`p-4 rounded-xl border ${rk.color} space-y-1.5 shadow-2xs`}>
              <span className="text-xs font-bold block">{rk.rank}</span>
              <span className="text-xl font-bold font-mono block">
                {formatCurrency(rk.totalSales)}
              </span>
              <span className="text-[11px] font-medium block opacity-80">
                対象クリニック数: {rk.clinicCount} 院
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sales Rep Detail Modal / Drawer */}
      {selectedRepForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  担当: {selectedRepForDetail.repName} の売上内訳 ({selectedMonth})
                </h3>
              </div>
              <button
                onClick={() => setSelectedRepForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-slate-500">対象月受注総額: </span>
                <span className="font-bold text-slate-900 text-base">{formatCurrency(selectedRepForDetail.totalSales)}</span>
              </div>
              <div>
                <span className="text-slate-500">受注件数: </span>
                <span className="font-bold text-indigo-600 text-base">{selectedRepForDetail.orders.length} 件</span>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {selectedRepForDetail.orders.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  選択月に該当する受注はありません
                </div>
              ) : (
                selectedRepForDetail.orders.map((ord) => {
                  const amt = getOrderAmount(ord);
                  return (
                    <div
                      key={ord.orderId}
                      onClick={() => {
                        setSelectedRepForDetail(null);
                        onSelectOrder(ord);
                      }}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-sm cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{ord.orderId}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {ord.orderState}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ord.paymentStatus === '入金済' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.paymentStatus || '未入金'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ord.customerName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 block">受注金額</span>
                          <span className="font-mono font-bold text-slate-900 text-sm">{formatCurrency(amt)}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedRepForDetail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
