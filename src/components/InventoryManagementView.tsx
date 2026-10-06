import React, { useState, useEffect } from 'react';
import { Order, WarehouseStockRecord } from '../types';
import { formatCurrency, isShippingOrFee } from '../utils';
import {
  Building,
  Package,
  Globe,
  Truck,
  ArrowRight,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Sliders,
  MapPin,
  TrendingUp,
  ArrowLeftRight
} from 'lucide-react';

interface InventoryManagementViewProps {
  orders: Order[];
}

const STORAGE_WAREHOUSE_STOCK_KEY = 'nouki_multi_warehouse_stock_v1';

export const InventoryManagementView: React.FC<InventoryManagementViewProps> = ({ orders }) => {
  const [selectedWarehouse, setSelectedWarehouse] = useState<'all' | 'korea' | 'singapore'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferItem, setTransferItem] = useState<WarehouseStockRecord | null>(null);
  const [transferQty, setTransferQty] = useState<number>(10);
  const [transferDirection, setTransferDirection] = useState<'korea_to_singapore' | 'singapore_to_korea'>('korea_to_singapore');

  // Initialize stock records based on orders & products
  const [stockRecords, setStockRecords] = useState<WarehouseStockRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WAREHOUSE_STOCK_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}

    // Generate initial stock records from orders
    const map = new Map<string, WarehouseStockRecord>();
    orders.forEach((ord) => {
      ord.lines.forEach((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return;
        if (!map.has(l.productId)) {
          // Deterministic pseudorandom initial stock
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
  const totalInTransit = stockRecords.reduce((sum, r) => sum + r.inTransitKorea + r.inTransitSingapore, 0);
  const lowStockCount = stockRecords.filter(
    (r) => r.koreaStock <= r.koreaSafetyStock || r.singaporeStock <= r.singaporeSafetyStock
  ).length;

  // Handle Stock Transfer between Korea & Singapore
  const handleExecuteTransfer = () => {
    if (!transferItem) return;
    setStockRecords((prev) =>
      prev.map((r) => {
        if (r.productId === transferItem.productId) {
          if (transferDirection === 'korea_to_singapore') {
            return {
              ...r,
              koreaStock: Math.max(0, r.koreaStock - transferQty),
              singaporeStock: r.singaporeStock + transferQty,
            };
          } else {
            return {
              ...r,
              singaporeStock: Math.max(0, r.singaporeStock - transferQty),
              koreaStock: r.koreaStock + transferQty,
            };
          }
        }
        return r;
      })
    );
    setIsTransferModalOpen(false);
    setTransferItem(null);
  };

  // Map orders to warehouse fulfillment flow
  const orderFlows = orders.slice(0, 15).map((ord, idx) => {
    const isKorea = idx % 2 === 0;
    return {
      orderId: ord.orderId,
      customerName: ord.customerName,
      salesRep: ord.salesRep,
      orderDate: ord.orderDate,
      warehouse: isKorea ? '韓国倉庫 (ICN - 仁川)' : 'シンガポール倉庫 (SIN)',
      warehouseCode: isKorea ? 'korea' : 'singapore',
      status: ord.orderState,
      itemsCount: ord.lines.length,
    };
  });

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
                  マルチ倉庫 在庫管理 & クリニック流通フロー
                </h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 font-mono">
                  韓国倉庫 (ICN) & シンガポール倉庫 (SIN)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                韓国倉庫とシンガポール倉庫のリアルタイム在庫数、安全在庫、輸送中ステータスを管理し、各クリニックへの物流・出荷フローを完全に可視化します。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (stockRecords.length > 0) {
                  setTransferItem(stockRecords[0]);
                  setIsTransferModalOpen(true);
                }
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <ArrowLeftRight className="w-4 h-4" /> 倉庫間在庫振替 (Transfer)
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>韓国倉庫 (ICN) 在庫合計</span>
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
              <span>輸送中（両倉庫合計）</span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-amber-300">{totalInTransit.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">航空・海上貨物トラッキング中</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>要注意アラート品目</span>
              <span className="w-2 h-2 rounded-full bg-rose-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{lowStockCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">発注・振替推奨</span>
          </div>
        </div>
      </div>

      {/* Warehouse Selector & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          {[
            { id: 'all', label: '全倉庫表示', icon: Globe },
            { id: 'korea', label: '韓国倉庫 (仁川 ICN)', icon: Building },
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
                  <th className="py-3 px-4 text-right bg-blue-50/50">韓国倉庫 (ICN) 在庫 / 引当</th>
                )}
                {(selectedWarehouse === 'all' || selectedWarehouse === 'singapore') && (
                  <th className="py-3 px-4 text-right bg-indigo-50/50">シンガポール (SIN) 在庫 / 引当</th>
                )}
                <th className="py-3 px-4 text-right">輸送中 (In-Transit)</th>
                <th className="py-3 px-4 text-center">在庫ステータス</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRecords.map((item) => {
                const isKoreaLow = item.koreaStock <= item.koreaSafetyStock;
                const isSingaporeLow = item.singaporeStock <= item.singaporeSafetyStock;
                const totalAvail = item.koreaStock + item.singaporeStock;

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

                    <td className="py-3 px-4 text-right font-mono">
                      <span className="text-amber-600 font-bold">
                        KR: {item.inTransitKorea} / SG: {item.inTransitSingapore}
                      </span>
                    </td>

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

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setTransferItem(item);
                          setIsTransferModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-bold transition cursor-pointer border border-slate-200"
                      >
                        振替・調整
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinic Movement & Fulfillment Flow Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              在庫からクリニックへの流通・出荷フロー可視化 (Clinic Fulfillment Flow)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              各韓国・シンガポール倉庫から、どのクリニックへどのように在庫が引き当てられ発送されているかのリアルタイム動線です。
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
            直近の流通トランザクション
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {orderFlows.map((flow, idx) => (
            <div key={idx} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {flow.orderId}
                </span>
                <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {flow.status}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-700">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Building className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="truncate">{flow.customerName}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>出荷元倉庫:</span>
                  <span className="font-bold text-slate-800">{flow.warehouse}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>担当営業 / 受注日:</span>
                  <span>{flow.salesRep} ({flow.orderDate})</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <CheckCircle2 className="w-3 h-3" /> 引当・出荷手配済
                </span>
                <span className="font-mono">{flow.itemsCount} 品目</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && transferItem && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                倉庫間在庫振替 (Inventory Transfer)
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block">対象商品</span>
                <span className="text-sm font-bold text-slate-900">{transferItem.productName} ({transferItem.productId})</span>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                <div>
                  <span className="text-slate-500 block">韓国倉庫 (ICN) 在庫</span>
                  <span className="text-lg font-bold text-blue-600">{transferItem.koreaStock}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">シンガポール (SIN) 在庫</span>
                  <span className="text-lg font-bold text-indigo-600">{transferItem.singaporeStock}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">振替方向</label>
                <select
                  value={transferDirection}
                  onChange={(e) => setTransferDirection(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="korea_to_singapore">韓国倉庫 (ICN) ➔ シンガポール倉庫 (SIN)</option>
                  <option value="singapore_to_korea">シンガポール倉庫 (SIN) ➔ 韓国倉庫 (ICN)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">振替数量</label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 1)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleExecuteTransfer}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
              >
                振替を実行する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
