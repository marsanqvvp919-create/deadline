import React, { useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency } from '../utils';
import {
  Award,
  Trophy,
  Users,
  TrendingUp,
  Target,
  Sparkles,
  CheckCircle2,
  Crown
} from 'lucide-react';

interface RepRankingViewProps {
  orders: Order[];
  salesReps: string[];
  budgets: Record<string, number>;
  selectedMonth: string;
}

export const RepRankingView: React.FC<RepRankingViewProps> = ({
  orders,
  salesReps,
  budgets,
  selectedMonth,
}) => {
  const getOrderAmount = (o: Order) => {
    return o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount :
      (o.lines || []).reduce((s, l) => s + ((l.unitPrice || 15000) * l.quantity), 0);
  };

  const rankings = useMemo(() => {
    const map = new Map<string, { totalSales: number; orderCount: number }>();
    orders.forEach((o) => {
      if (o.quoteExpiredOverWeek) return;
      const rep = o.salesRep || '未割当';
      const amt = getOrderAmount(o);
      const curr = map.get(rep) || { totalSales: 0, orderCount: 0 };
      map.set(rep, {
        totalSales: curr.totalSales + amt,
        orderCount: curr.orderCount + 1,
      });
    });

    return salesReps.map((rep) => {
      const data = map.get(rep) || { totalSales: 0, orderCount: 0 };
      const target = budgets[rep] || 0;
      const achievementRate = target > 0 ? (data.totalSales / target) * 100 : 0;

      return {
        rep,
        totalSales: data.totalSales,
        orderCount: data.orderCount,
        target,
        achievementRate,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [orders, salesReps, budgets]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                営業担当別パフォーマンスランキング & 表彰ボード
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 font-mono">
                {selectedMonth} 成果ランキング
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              当月の営業メンバーの売上実績および目標達成率をリアルタイムでランキング集計し、優秀者の表彰を行います。
            </p>
          </div>
        </div>
      </div>

      {/* Podium Cards (Top 3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rankings.slice(0, 3).map((item, idx) => {
          const rankColors = [
            'bg-gradient-to-br from-amber-50 to-yellow-100 border-yellow-300 text-yellow-900',
            'bg-gradient-to-br from-slate-50 to-slate-200 border-slate-300 text-slate-900',
            'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200 text-orange-900',
          ];
          const rankCrowns = ['👑 MVP (1位)', '🥈 2位', '🥉 3位'];

          return (
            <div key={item.rep} className={`rounded-2xl border p-5 space-y-3 shadow-sm ${rankColors[idx]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2.5 py-1 bg-white/80 rounded-full border border-black/10">
                  {rankCrowns[idx]}
                </span>
                <Crown className={`w-5 h-5 ${idx === 0 ? 'text-yellow-600' : idx === 1 ? 'text-slate-500' : 'text-orange-600'}`} />
              </div>
              <div>
                <h3 className="text-lg font-bold">{item.rep} 営業</h3>
                <span className="text-2xl font-bold font-mono block mt-1">
                  {formatCurrency(item.totalSales)}
                </span>
              </div>
              <div className="space-y-1 pt-2 border-t border-black/10 text-xs font-semibold flex items-center justify-between">
                <span>目標達成率:</span>
                <span className="font-mono text-sm">{item.target > 0 ? `${item.achievementRate.toFixed(1)}%` : '予算未設定'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Ranking Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">営業メンバー パフォーマンスランキング一覧</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4 w-16 text-center">順位</th>
                <th className="py-3 px-4">担当営業</th>
                <th className="py-3 px-4">実績売上</th>
                <th className="py-3 px-4">目標予算</th>
                <th className="py-3 px-4">受注件数</th>
                <th className="py-3 px-4 text-right">達成率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rankings.map((item, idx) => {
                const rankNum = idx + 1;
                const isAchieved = item.achievementRate >= 100;
                return (
                  <tr key={item.rep} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-center">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${
                        rankNum === 1 ? 'bg-yellow-400 text-yellow-950 font-bold' :
                        rankNum === 2 ? 'bg-slate-300 text-slate-900 font-bold' :
                        rankNum === 3 ? 'bg-orange-300 text-orange-950 font-bold' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {rankNum}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{item.rep}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{formatCurrency(item.totalSales)}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{item.target > 0 ? formatCurrency(item.target) : '未設定'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">{item.orderCount} 件</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${isAchieved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {item.target > 0 ? `${item.achievementRate.toFixed(1)}%` : '—'}
                      </span>
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
