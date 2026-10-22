import React, { useState, useMemo } from 'react';
import { yen } from '../portalData';
import {
  OrderRecord,
  CLINICS_MASTER,
  BATCHES_LIST
} from '../portalData';
import { portalGroupName } from '../portalData';
import {
  BarChart3,
  Layers,
  Package,
  Building2,
  Search,
  Download,
  TrendingUp,
  Award
} from 'lucide-react';

interface OverallHistoryViewProps {
  batchOrdersMap: Record<string, OrderRecord[]>;
  onSelectClinic: (clinicId: string) => void;
  onSelectBatch?: (batchId: string) => void;
}

export const OverallHistoryView: React.FC<OverallHistoryViewProps> = ({
  batchOrdersMap,
  onSelectClinic,
  onSelectBatch,
}) => {
  const [search, setSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');

  // Flatten all orders across all batches
  const allOrdersList = useMemo(() => {
    const list: OrderRecord[] = [];
    Object.values(batchOrdersMap).forEach((orders) => {
      list.push(...orders);
    });
    return list;
  }, [batchOrdersMap]);

  // Grand totals
  const totalBatchesCount = BATCHES_LIST.length;
  const grandTotalOrdersCount = allOrdersList.length;
  const grandTotalUnits = allOrdersList.reduce((acc, o) => acc + (o.totalQty || 0), 0);
  const deliveredTotal = allOrdersList.filter((o) => o.status === 'DELIVERED').length;

  // Aggregate per clinic across all history
  const clinicHistorySummary = useMemo(() => {
    const map = new Map<string, { clinicId: string; clinicName: string; region: string; totalUnits: number; orderCount: number; lastOrderDate: string }>();

    allOrdersList.forEach((o) => {
      const master = CLINICS_MASTER.find((c) => c.id === o.clinicId || c.name === o.clinicName);
      const cId = master ? master.id : o.clinicId;
      const cName = o.clinicName;
      const region = o.region || (master ? master.region : 'その他');

      if (!map.has(cId)) {
        map.set(cId, {
          clinicId: cId,
          clinicName: cName,
          region,
          totalUnits: 0,
          orderCount: 0,
          lastOrderDate: o.orderDate,
        });
      }
      const entry = map.get(cId)!;
      entry.totalUnits += o.totalQty || 0;
      entry.orderCount += 1;
      if (o.orderDate > entry.lastOrderDate) {
        entry.lastOrderDate = o.orderDate;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [allOrdersList]);

  // Filtered clinic summary
  const filteredClinicSummary = useMemo(() => {
    return clinicHistorySummary.filter((item) => {
      const matchSearch =
        search === '' ||
        item.clinicName.toLowerCase().includes(search.toLowerCase()) ||
        item.region.toLowerCase().includes(search.toLowerCase());
      const matchRegion = selectedRegion === 'ALL' || item.region === selectedRegion;
      return matchSearch && matchRegion;
    });
  }, [clinicHistorySummary, search, selectedRegion]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    CLINICS_MASTER.forEach((c) => set.add(c.region));
    return Array.from(set);
  }, []);

  // Export CSV handler for overall history
  const handleExportOverallCsv = () => {
    const headers = ['クリニックID', 'クリニック名', 'エリア', '累計発注回数', '累計発注数量(箱)', '最終発注日'];
    const rows = clinicHistorySummary.map((item) => [
      `"${item.clinicId}"`,
      `"${item.clinicName}"`,
      `"${item.region}"`,
      item.orderCount,
      item.totalUnits,
      `"${item.lastOrderDate}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${portalGroupName()}_全体累計発注数量_履歴_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Overall Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">累計発注数量 (美容医療薬剤)</div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {grandTotalUnits.toLocaleString()} <span className="text-sm font-normal text-slate-500">箱</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-sky-600" /> 全アーカイブ合算
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">総発注回数（延べ）</div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {grandTotalOrdersCount.toLocaleString()} <span className="text-sm font-normal text-slate-500">件</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              配達完了: {deliveredTotal} 件
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">累計販売金額（商品代金）</div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {yen(allOrdersList.reduce((acc, o) => acc + (o.amountTotal || 0), 0))}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-1">
              {totalBatchesCount}か月分の合計
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">登録クリニック数</div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {CLINICS_MASTER.length} <span className="text-sm font-normal text-slate-500">院</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {portalGroupName()}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. Batch-by-Batch History Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            受注月ごとの実績一覧（履歴含む）
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            各月のカードをクリックすると、その月の受注明細・ステータス画面に切り替わります。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {BATCHES_LIST.map((batch) => {
            const batchOrders = batchOrdersMap[batch.id] || [];
            const bUnits = batchOrders.reduce((acc, o) => acc + o.totalQty, 0);
            const bAmount = batchOrders.reduce((acc, o) => acc + (o.amountTotal || 0), 0);
            const bDelivered = batchOrders.filter((o) => o.status === 'DELIVERED').length;

            return (
              <div
                key={batch.id}
                onClick={() => onSelectBatch && onSelectBatch(batch.id)}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 group"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500 font-semibold group-hover:text-blue-600 transition-colors">初回受注 {batch.orderDate}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        batch.isCurrent
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {batch.isCurrent ? '進行中' : '完了'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1 group-hover:text-blue-700 transition-colors flex items-center justify-between">
                    <span>{batch.name}</span>
                    <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity font-normal bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">明細を見る ➔</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{batch.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] block">発注数量</span>
                    <span className="font-bold text-slate-900 text-sm">{bUnits} 箱</span>
                  </div>
                  <div className="text-center">
                    <span className="text-slate-400 text-[10px] block">販売金額</span>
                    <span className="font-bold text-slate-900 text-sm">{yen(bAmount)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">配達状況</span>
                    <span className="font-bold text-emerald-700">{bDelivered} / {batchOrders.length} 件完了</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Clinic Cumulative Ranking / Summary Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              クリニック別 累計発注数量ランキング（全期間）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              クリニック名をクリックすると、そのクリニックの個別ビューへ直接ジャンプします。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="クリニック名で検索..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Region Filter */}
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">すべてのエリア</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* CSV Export */}
            <button
              onClick={handleExportOverallCsv}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4 w-16 text-center">順位</th>
                <th className="py-3 px-4">クリニック名</th>
                <th className="py-3 px-4">エリア</th>
                <th className="py-3 px-4 text-center">累計発注回数</th>
                <th className="py-3 px-4 text-right">累計発注数量 (美容医療薬剤)</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClinicSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    一致するクリニックがありません。
                  </td>
                </tr>
              ) : (
                filteredClinicSummary.map((item, idx) => {
                  return (
                    <tr key={item.clinicId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-bold font-mono text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectClinic(item.clinicId)}
                          className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer flex items-center gap-1.5"
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {item.clinicName}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{item.region}</td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        {item.orderCount} 回
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                        {item.totalUnits} <span className="text-xs font-normal text-slate-500">箱</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onSelectClinic(item.clinicId)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] border border-blue-200 transition-colors cursor-pointer"
                        >
                          個別ビュー表示
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
