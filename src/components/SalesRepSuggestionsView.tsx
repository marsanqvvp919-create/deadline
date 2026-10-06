import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { getSalesRepsList } from '../utils/salesRepMapping';
import {
  Zap,
  Building2,
  ExternalLink,
  ChevronRight,
  User,
  Calendar
} from 'lucide-react';

interface SalesRepSuggestionsViewProps {
  orders: Order[];
  salesReps: string[];
  budgets: Record<string, number>;
  selectedMonth: string;
  onSelectMonth: (m: string) => void;
  onOpenClinicStatus: (clinicName: string) => void;
}

export const SalesRepSuggestionsView: React.FC<SalesRepSuggestionsViewProps> = ({
  orders,
  salesReps: propSalesReps,
  budgets,
  selectedMonth,
  onSelectMonth,
  onOpenClinicStatus,
}) => {
  const repsList = useMemo(() => {
    const list = getSalesRepsList();
    return list.length > 0 ? list : ['大谷', '高桑', '大津'];
  }, [propSalesReps]);

  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');

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
    return Array.from(set).sort().reverse();
  }, [orders]);

  const getOrderAmount = (o: Order) => {
    return o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount :
      (o.lines || []).reduce((s, l) => s + ((l.unitPrice || 15000) * l.quantity), 0);
  };

  // スマートサジェスト候補の抽出
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

  const filteredSuggestions = useMemo(() => {
    if (selectedRepFilter === 'all') return smartSuggestions;
    return smartSuggestions.filter((s) => s.salesRep === selectedRepFilter);
  }, [smartSuggestions, selectedRepFilter]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Header & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                営業別 発注サジェスト（リピート・ギャップ補填）
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                対象月: {selectedMonth}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              各営業担当の担当クリニックごとに、発注期間の空いたリピート有力候補を自動抽出し、目標達成に向けたアプローチ先を提案します。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Rep Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold">
            <User className="w-4 h-4 text-slate-500" />
            <select
              value={selectedRepFilter}
              onChange={(e) => setSelectedRepFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">担当営業: 全員</option>
              {repsList.map((r) => (
                <option key={r} value={r}>
                  担当: {r}
                </option>
              ))}
            </select>
          </div>

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
        </div>
      </div>

      {/* Suggestions Cards Grid */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-700/60 space-y-5">
        <div className="flex items-center justify-between border-b border-indigo-800/80 pb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-300" />
            <h2 className="text-base font-bold text-white">
              サジェスト提案一覧 ({filteredSuggestions.length} 院)
            </h2>
          </div>
          <span className="text-xs font-mono bg-indigo-900 text-indigo-200 px-3 py-1 rounded-xl border border-indigo-700">
            {selectedRepFilter === 'all' ? '全担当営業の対象クリニック' : `担当: ${selectedRepFilter}`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredSuggestions.length === 0 ? (
            <div className="col-span-3 py-12 text-center text-slate-400">
              該当するサジェスト候補はありません
            </div>
          ) : (
            filteredSuggestions.map((sug, idx) => (
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
                  💡 <b>提案根拠:</b> {sug.reason}。今月中のリピート発注の打診にお役立てください。
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};
