import React, { useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency, formatDate } from '../utils';
import {
  Clock,
  Building2,
  Phone,
  Mail,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Calendar
} from 'lucide-react';

interface ReorderPredictionViewProps {
  orders: Order[];
  onOpenClinicStatus: (clinicName: string) => void;
}

export const ReorderPredictionView: React.FC<ReorderPredictionViewProps> = ({
  orders,
  onOpenClinicStatus,
}) => {
  const getOrderAmount = (o: Order) => {
    return o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount :
      (o.lines || []).reduce((s, l) => s + ((l.unitPrice || 15000) * l.quantity), 0);
  };

  // クリニックごとの最終注文日と注文頻度を予測
  const clinicReorderList = useMemo(() => {
    const map = new Map<string, {
      clinicName: string;
      salesRep: string;
      lastOrderDate: string;
      orderCount: number;
      totalSpend: number;
    }>();

    const today = new Date();

    orders.forEach((o) => {
      if (!o.customerName || o.quoteExpiredOverWeek) return;
      const name = o.customerName;
      const amt = getOrderAmount(o);
      const rep = o.salesRep || '未割当';
      const oDate = o.orderDate || '';

      if (!map.has(name)) {
        map.set(name, {
          clinicName: name,
          salesRep: rep,
          lastOrderDate: oDate,
          orderCount: 1,
          totalSpend: amt,
        });
      } else {
        const entry = map.get(name)!;
        entry.orderCount += 1;
        entry.totalSpend += amt;
        if (oDate && oDate > entry.lastOrderDate) {
          entry.lastOrderDate = oDate;
          if (rep !== '未割当') entry.salesRep = rep;
        }
      }
    });

    return Array.from(map.values()).map((item) => {
      let daysAgo = 30;
      if (item.lastOrderDate) {
        const last = new Date(item.lastOrderDate);
        if (!isNaN(last.getTime())) {
          daysAgo = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      // 定期リピート予測ステータス
      let prediction = '定期発注サイクル中';
      let badgeColor = 'bg-slate-100 text-slate-800 border-slate-300';

      if (daysAgo >= 35) {
        prediction = '🔴 再発注推奨タイミング (要フォロー)';
        badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
      } else if (daysAgo >= 25) {
        prediction = '🟡 間もなく発注サイクル';
        badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
      } else {
        prediction = '🟢 順調に稼働中';
        badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      }

      return {
        ...item,
        daysAgo,
        prediction,
        badgeColor,
      };
    }).sort((a, b) => b.daysAgo - a.daysAgo);
  }, [orders]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                定期購入・リピート予測アナリティクス
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                自動サイクル検知
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              クリニックごとの前回発注からの経過日数と平均サイクルを分析し、そろそろ追加発注の可能性がある医院を自動検知してリマインドします。
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">クリニック別 発注サイクル・リピート予測一覧</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">経過日数順に表示</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">クリニック名</th>
                <th className="py-3 px-4">担当営業</th>
                <th className="py-3 px-4">前回最終注文日</th>
                <th className="py-3 px-4">経過日数</th>
                <th className="py-3 px-4">累計発注件数</th>
                <th className="py-3 px-4 text-right">リピート予測ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clinicReorderList.map((item) => (
                <tr key={item.clinicName} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <button
                      onClick={() => onOpenClinicStatus(item.clinicName)}
                      className="text-blue-600 hover:underline text-left cursor-pointer flex items-center gap-1.5"
                    >
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{item.clinicName}</span>
                    </button>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-700">
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-800">
                      {item.salesRep}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">{formatDate(item.lastOrderDate)}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{item.daysAgo} 日経過</td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">{item.orderCount} 件</td>
                  <td className="py-3.5 px-4 text-right font-semibold">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${item.badgeColor} inline-block`}>
                      {item.prediction}
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
