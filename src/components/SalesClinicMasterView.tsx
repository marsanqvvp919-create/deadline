import React, { useState, useMemo } from 'react';
import { Order, ClinicItem } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { getSalesRepsList } from '../utils/salesRepMapping';
import {
  Building2,
  Search,
  Filter,
  Award,
  User,
  MapPin,
  ChevronRight,
  Save,
  CheckCircle2,
  Sparkles,
  X
} from 'lucide-react';

interface SalesClinicMasterViewProps {
  orders: Order[];
  clinics: ClinicItem[];
  salesReps: string[];
  onOpenClinicStatus: (clinicName: string) => void;
}

const STORAGE_RANKS_KEY = 'nouki_sales_clinic_ranks_v1';

export const SalesClinicMasterView: React.FC<SalesClinicMasterViewProps> = ({
  orders,
  clinics,
  salesReps: propSalesReps,
  onOpenClinicStatus,
}) => {
  const repsList = useMemo(() => {
    const list = getSalesRepsList();
    return list.length > 0 ? list : ['大谷', '高桑', '大津'];
  }, [propSalesReps]);

  // Rank management state (persisted)
  const [clinicRanks, setClinicRanks] = useState<Record<string, 'S' | 'A' | 'B' | 'C'>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_RANKS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRankFilter, setSelectedRankFilter] = useState<string>('all');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [selectedRankForRepBreakdown, setSelectedRankForRepBreakdown] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const handleRankChange = (clinicName: string, newRank: 'S' | 'A' | 'B' | 'C') => {
    const updated = { ...clinicRanks, [clinicName]: newRank };
    setClinicRanks(updated);
    try {
      localStorage.setItem(STORAGE_RANKS_KEY, JSON.stringify(updated));
    } catch {}
    setSaveSuccessMsg(`${clinicName} のランクを ${newRank} に更新しました`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const getOrderAmount = (o: Order) => {
    return o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount :
      (o.lines || []).reduce((s, l) => s + ((l.unitPrice || 15000) * l.quantity), 0);
  };

  // クリニックごとの売上・受注件数・担当営業・住所を集計
  const clinicAggregateMap = useMemo(() => {
    const map = new Map<string, {
      clinicName: string;
      salesRep: string;
      totalSales: number;
      orderCount: number;
      lastOrderDate: string;
      address: string;
    }>();

    // 1. まず受注データから集計
    orders.forEach((o) => {
      if (!o.customerName || o.quoteExpiredOverWeek) return;
      const name = o.customerName;
      const amt = getOrderAmount(o);
      const rep = o.salesRep || '未割当';

      if (!map.has(name)) {
        map.set(name, {
          clinicName: name,
          salesRep: rep,
          totalSales: amt,
          orderCount: 1,
          lastOrderDate: o.orderDate || '',
          address: '-',
        });
      } else {
        const entry = map.get(name)!;
        entry.totalSales += amt;
        entry.orderCount += 1;
        if (o.orderDate && o.orderDate > entry.lastOrderDate) {
          entry.lastOrderDate = o.orderDate;
        }
        if (rep !== '未割当') entry.salesRep = rep;
      }
    });

    // 2. クリニックマスタから住所や担当営業情報を補完・網羅
    clinics.forEach((c) => {
      const fullAddr = c.address ? `${c.prefecture || ''} ${c.address}`.trim() : (c.prefecture || '-');
      if (!map.has(c.clinicName)) {
        map.set(c.clinicName, {
          clinicName: c.clinicName,
          salesRep: c.salesRep || '未割当',
          totalSales: 0,
          orderCount: 0,
          lastOrderDate: '-',
          address: fullAddr,
        });
      } else {
        const entry = map.get(c.clinicName)!;
        if (fullAddr && fullAddr !== '-') {
          entry.address = fullAddr;
        }
      }
    });

    return Array.from(map.values()).map((item) => {
      let rank = clinicRanks[item.clinicName];
      if (!rank) {
        if (item.totalSales >= 3000000) rank = 'S';
        else if (item.totalSales >= 1500000) rank = 'A';
        else if (item.totalSales >= 500000) rank = 'B';
        else rank = 'C';
      }
      return {
        ...item,
        rank,
      };
    });
  }, [orders, clinics, clinicRanks]);

  const filteredClinics = useMemo(() => {
    return clinicAggregateMap.filter((c) => {
      const matchQuery = c.clinicName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.salesRep.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRank = selectedRankFilter === 'all' || c.rank === selectedRankFilter;
      const matchRep = selectedRepFilter === 'all' || c.salesRep === selectedRepFilter;
      return matchQuery && matchRank && matchRep;
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [clinicAggregateMap, searchQuery, selectedRankFilter, selectedRepFilter]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Page Title & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                クリニックマスタ・ランク管理
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-mono">
                登録医院数: {clinicAggregateMap.length} 院
              </span>
              {saveSuccessMsg && (
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saveSuccessMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              すべてのクリニックの住所・累計売上・受注実績を確認し、個別にランク（S・A・B・C）を割り当て・管理できます。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="医院名・住所・担当者で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>

          {/* Rank Filter */}
          <select
            value={selectedRankFilter}
            onChange={(e) => setSelectedRankFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
          >
            <option value="all">ランク: すべて</option>
            <option value="S">Sランク (VIP)</option>
            <option value="A">Aランク (主力)</option>
            <option value="B">Bランク (標準)</option>
            <option value="C">Cランク (一般)</option>
          </select>

          {/* Rep Filter */}
          <select
            value={selectedRepFilter}
            onChange={(e) => setSelectedRepFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
          >
            <option value="all">担当: すべて</option>
            {repsList.map((r) => (
              <option key={r} value={r}>
                担当: {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clinic Ranks Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {['S', 'A', 'B', 'C'].map((rk) => {
          const matched = clinicAggregateMap.filter((c) => c.rank === rk);
          const rankColors: Record<string, string> = {
            S: 'bg-purple-50 border-purple-200 text-purple-900 hover:border-purple-400',
            A: 'bg-blue-50 border-blue-200 text-blue-900 hover:border-blue-400',
            B: 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:border-emerald-400',
            C: 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-400',
          };

          return (
            <div
              key={rk}
              onClick={() => setSelectedRankForRepBreakdown(rk)}
              className={`p-4 rounded-2xl border ${rankColors[rk]} space-y-2 shadow-2xs cursor-pointer transition hover:shadow-md group flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-sm font-black">{rk} ランク</span>
                <span className="font-mono text-xs px-2 py-0.5 bg-white/80 rounded-full border border-black/5">
                  クリックで担当別内訳
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="text-3xl font-extrabold font-mono">{matched.length}</span>
                <span className="text-xs font-bold opacity-80">院 (クリニック数)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rep Breakdown Modal for Selected Rank */}
      {selectedRankForRepBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  {selectedRankForRepBreakdown}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedRankForRepBreakdown} ランク クリニックの担当営業別内訳
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    該当医院数: {clinicAggregateMap.filter((c) => c.rank === selectedRankForRepBreakdown).length} 院
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRankForRepBreakdown(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {(() => {
                const rankClinics = clinicAggregateMap.filter((c) => c.rank === selectedRankForRepBreakdown);
                const repGroupMap = new Map<string, typeof rankClinics>();
                rankClinics.forEach((c) => {
                  const rep = c.salesRep || '未割当';
                  const list = repGroupMap.get(rep) || [];
                  list.push(c);
                  repGroupMap.set(rep, list);
                });

                if (repGroupMap.size === 0) {
                  return <p className="text-slate-500 text-center py-6">該当するクリニックはありません</p>;
                }

                return Array.from(repGroupMap.entries()).map(([repName, clinicsList]) => (
                  <div key={repName} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        担当: {repName}
                      </span>
                      <span className="font-mono font-bold text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                        {clinicsList.length} 院
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {clinicsList.map((c) => (
                        <div
                          key={c.clinicName}
                          onClick={() => {
                            setSelectedRankForRepBreakdown(null);
                            onOpenClinicStatus(c.clinicName);
                          }}
                          className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 cursor-pointer transition shadow-2xs flex items-center justify-between"
                        >
                          <span className="font-bold text-slate-800 truncate">{c.clinicName}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
              <button
                onClick={() => setSelectedRankForRepBreakdown(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinic Master Table with Address & Rank Editor */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">クリニック一覧・住所・ランク管理 (全 {filteredClinics.length} 院)</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">マスタおよび受注データから自動連携</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">クリニック名</th>
                <th className="py-3 px-4">住所</th>
                <th className="py-3 px-4">顧客ランク</th>
                <th className="py-3 px-4">担当営業</th>
                <th className="py-3 px-4">累計売上実績</th>
                <th className="py-3 px-4">総受注件数</th>
                <th className="py-3 px-4 text-right">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClinics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    条件に一致するクリニックはありません
                  </td>
                </tr>
              ) : (
                filteredClinics.map((clinic) => {
                  return (
                    <tr key={clinic.clinicName} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <button
                          onClick={() => onOpenClinicStatus(clinic.clinicName)}
                          className="text-blue-600 hover:underline text-left cursor-pointer flex items-center gap-1.5"
                        >
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{clinic.clinicName}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={clinic.address}>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{clinic.address}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <select
                          value={clinic.rank}
                          onChange={(e) => handleRankChange(clinic.clinicName, e.target.value as any)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer focus:outline-none ${
                            clinic.rank === 'S' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                            clinic.rank === 'A' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                            clinic.rank === 'B' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                            'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          <option value="S">S (VIP)</option>
                          <option value="A">A (主力)</option>
                          <option value="B">B (標準)</option>
                          <option value="C">C (一般)</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-800">
                          {clinic.salesRep}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {formatCurrency(clinic.totalSales)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        {clinic.orderCount} 件
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onOpenClinicStatus(clinic.clinicName)}
                          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <span>詳細ステータス</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
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
