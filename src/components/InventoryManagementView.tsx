import React, { useState, useEffect } from 'react';
import { Order, WarehouseStockRecord } from '../types';
import { isShippingOrFee } from '../utils';
import {
  Building,
  Package,
  Globe,
  AlertTriangle,
  Search,
  CheckCircle2,
  MapPin
} from 'lucide-react';

interface InventoryManagementViewProps {
  orders: Order[];
}

const STORAGE_WAREHOUSE_STOCK_KEY = 'nouki_multi_warehouse_stock_v1';

export const InventoryManagementView: React.FC<InventoryManagementViewProps> = ({ orders }) => {
  const [selectedWarehouse, setSelectedWarehouse] = useState<'all' | 'korea' | 'singapore'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Initialize stock records based on orders & products
  const [stockRecords, setStockRecords] = useState<WarehouseStockRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WAREHOUSE_STOCK_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}

    const map = new Map<string, WarehouseStockRecord>();
    orders.forEach((ord) => {
      ord.lines.forEach((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return;
        if (!map.has(l.productId)) {
          let hash = 0;
          for (let i = 0; i < l.productId.length; i++) hash = (hash * 31 + l.productId.charCodeAt(i)) & 0xffffffff;
          const kStock = Math.abs(hash) % 150 + 30;
          const sStock = Math.abs(hash >> 2) % 120 + 20;

          map.set(l.productId, {
            productId: l.productId,
            productName: l.productName,
            koreaStock: kStock,
            singaporeStock: sStock,
            koreaSafetyStock: 25,
            singaporeSafetyStock: 20,
            inTransitKorea: 30,
            inTransitSingapore: 25,
            reservedKorea: Math.floor(kStock * 0.3),
            reservedSingapore: Math.floor(sStock * 0.25),
            preferredWarehouse: Math.abs(hash) % 2 === 0 ? 'korea' : 'singapore',
          });
        }
      });
    });
    return Array.from(map.values());
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WAREHOUSE_STOCK_KEY, JSON.stringify(stockRecords));
    } catch {}
  }, [stockRecords]);

  // Filtered records
  const filteredRecords = stockRecords.filter((item) => {
    const matchesSearch =
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.productId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // KPI Calculations
  const totalKoreaStock = stockRecords.reduce((sum, r) => sum + r.koreaStock, 0);
  const totalSingaporeStock = stockRecords.reduce((sum, r) => sum + r.singaporeStock, 0);
  const lowStockCount = stockRecords.filter(
    (r) => r.koreaStock <= r.koreaSafetyStock || r.singaporeStock <= r.singaporeSafetyStock
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
              <Building className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">
                  韓国・シンガポール倉庫 在庫管理
                </h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 font-mono">
                  韓国倉庫 (KR) & シンガポール倉庫 (SIN)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                韓国倉庫とシンガポール倉庫のリアルタイム在庫数、安全在庫、引当状況をシンプルに把握・管理できます。
              </p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>韓国倉庫 (KR) 在庫合計</span>
              <span className="w-2 h-2 rounded-full bg-blue-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-white">{totalKoreaStock.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">安全在庫割れ: {stockRecords.filter(r => r.koreaStock <= r.koreaSafetyStock).length}品目</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>シンガポール倉庫 (SIN) 在庫</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-white">{totalSingaporeStock.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">安全在庫割れ: {stockRecords.filter(r => r.singaporeStock <= r.singaporeSafetyStock).length}品目</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>要注意アラート品目</span>
              <span className="w-2 h-2 rounded-full bg-rose-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{lowStockCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">要補充品目</span>
          </div>
        </div>
      </div>

      {/* Warehouse Selector & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          {[
            { id: 'all', label: '全倉庫表示', icon: Globe },
            { id: 'korea', label: '韓国倉庫 (KR)', icon: Building },
            { id: 'singapore', label: 'シンガポール倉庫 (SIN)', icon: MapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = selectedWarehouse === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedWarehouse(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="商品名・商品IDで検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            マルチ倉庫 在庫マスタ一覧 (Multi-Warehouse Stock Ledger)
          </h2>
          <span className="text-xs font-mono text-slate-500">
            全 {filteredRecords.length} 品目
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">商品コード / 品名</th>
                {(selectedWarehouse === 'all' || selectedWarehouse === 'korea') && (
                  <th className="py-3 px-4 text-right bg-blue-50/50">韓国倉庫 (KR) 在庫 / 引当</th>
                )}
                {(selectedWarehouse === 'all' || selectedWarehouse === 'singapore') && (
                  <th className="py-3 px-4 text-right bg-indigo-50/50">シンガポール (SIN) 在庫 / 引当</th>
                )}
                <th className="py-3 px-4 text-center">在庫ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRecords.map((item) => {
                const isKoreaLow = item.koreaStock <= item.koreaSafetyStock;
                const isSingaporeLow = item.singaporeStock <= item.singaporeSafetyStock;

                return (
                  <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{item.productName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">ID: {item.productId}</span>
                    </td>

                    {(selectedWarehouse === 'all' || selectedWarehouse === 'korea') && (
                      <td className="py-3 px-4 text-right bg-blue-50/20 font-mono">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`text-sm font-bold ${isKoreaLow ? 'text-rose-600' : 'text-slate-900'}`}>
                            {item.koreaStock}
                          </span>
                          <span className="text-[10px] text-slate-400">({item.koreaSafetyStock}安)</span>
                        </div>
                        <span className="text-[11px] text-blue-600 block">引当済: {item.reservedKorea}</span>
                      </td>
                    )}

                    {(selectedWarehouse === 'all' || selectedWarehouse === 'singapore') && (
                      <td className="py-3 px-4 text-right bg-indigo-50/20 font-mono">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`text-sm font-bold ${isSingaporeLow ? 'text-rose-600' : 'text-slate-900'}`}>
                            {item.singaporeStock}
                          </span>
                          <span className="text-[10px] text-slate-400">({item.singaporeSafetyStock}安)</span>
                        </div>
                        <span className="text-[11px] text-indigo-600 block">引当済: {item.reservedSingapore}</span>
                      </td>
                    )}

                    <td className="py-3 px-4 text-center">
                      {isKoreaLow || isSingaporeLow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" /> 要補充
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> 十分
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
    </div>
  );
};
