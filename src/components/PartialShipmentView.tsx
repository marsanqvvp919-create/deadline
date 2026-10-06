import React, { useState, useMemo } from 'react';
import { Order, OrderLine } from '../types';
import { formatDate, formatCurrency, isShippingOrFee, getOrderProgress, buildRakurakuUrl } from '../utils';
import { getConfiguredUrls } from '../api';
import {
  Layers,
  Search,
  Filter,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  Building2,
  AlertTriangle,
  ShoppingCart,
  ArrowRight
} from 'lucide-react';

interface PartialShipmentViewProps {
  orders: Order[];
  searchQuery: string;
  onSelectOrder: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus: (clinicName: string) => void;
}

export const PartialShipmentView: React.FC<PartialShipmentViewProps> = ({
  orders,
  searchQuery: externalSearchQuery,
  onSelectOrder,
  onOpenClinicStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>(externalSearchQuery || '');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');

  const config = getConfiguredUrls();

  // Extract sales reps & suppliers
  const salesReps = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.salesRep && o.salesRep !== '未設定') set.add(o.salesRep);
    });
    return Array.from(set).sort();
  }, [orders]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      o.lines.forEach((l) => {
        if (l.supplierName && !isShippingOrFee(l.productName, l.productId)) {
          set.add(l.supplierName);
        }
      });
    });
    return Array.from(set).sort();
  }, [orders]);

  // Partial shipment orders: Orders where orderState is not fully shipped, and has at least 1 completed line AND at least 1 incomplete line
  const partialOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.orderState === '全明細出荷済' || o.orderState === '納品完了') return false;
      const productLines = o.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
      if (productLines.length === 0) return false;

      const completedCount = productLines.filter((l) => l.stage === '出荷完了').length;
      const incompleteCount = productLines.length - completedCount;

      // Partial means some shipped, some still remaining/unshipped
      return completedCount > 0 && incompleteCount > 0;
    });
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return partialOrders.filter((o) => {
      if (selectedRep !== 'all' && o.salesRep !== selectedRep) return false;

      if (selectedSupplier !== 'all') {
        const hasSup = o.lines.some((l) => l.supplierName === selectedSupplier && !isShippingOrFee(l.productName, l.productId));
        if (!hasSup) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = o.orderId.toLowerCase().includes(q);
        const matchCust = o.customerName.toLowerCase().includes(q);
        const matchRep = (o.salesRep || '').toLowerCase().includes(q);
        const matchLine = o.lines.some((l) => l.productName.toLowerCase().includes(q) || l.productId.toLowerCase().includes(q));
        if (!matchId && !matchCust && !matchRep && !matchLine) return false;
      }

      return true;
    });
  }, [partialOrders, selectedRep, selectedSupplier, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">一部未出荷・残あり伝票の洗い出し</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                一部の商品がすでに出荷され、残りの商品（未発注・入荷待ち等）が残っている進行中伝票の一覧です
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold">
            対象伝票: <span className="font-mono text-base">{filteredOrders.length}</span> 件
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="受注ID、クリニック名、商品名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sales Rep Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-600">担当営業:</span>
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべての営業</option>
            {salesReps.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Supplier Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-600">仕入先:</span>
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべての仕入先</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-sm font-bold text-slate-800">条件に一致する一部未出荷伝票はありません</div>
            <p className="text-xs text-slate-500">すべての商品が出荷完了しているか、まだ一度も出荷されていない伝票です。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">受注ID / 受注日</th>
                  <th className="py-3 px-4 font-semibold">クリニック名</th>
                  <th className="py-3 px-3 font-semibold">担当営業</th>
                  <th className="py-3 px-4 font-semibold text-center">出荷進捗</th>
                  <th className="py-3 px-4 font-semibold">未出荷・残りの商品明細</th>
                  <th className="py-3 px-4 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((ord) => {
                  const progress = getOrderProgress(ord);
                  const productLines = ord.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
                  const incompleteLines = productLines.filter((l) => l.stage !== '出荷完了');

                  return (
                    <tr
                      key={ord.orderId}
                      onClick={() => onSelectOrder(ord)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-blue-600 group-hover:underline">{ord.orderId}</div>
                        <div className="text-[11px] text-slate-400">{formatDate(ord.orderDate)}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenClinicStatus(ord.customerName);
                            }}
                            className="hover:text-indigo-600 hover:underline cursor-pointer"
                          >
                            {ord.customerName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 font-medium">
                        {ord.salesRep || '未設定'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Truck className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{progress.completed} / {progress.total} 品目出荷済</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-md">
                          {incompleteLines.map((line) => (
                            <div key={line.lineKey} className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                              <span className="font-medium text-slate-800 truncate mr-2">{line.productName}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  line.stage === '未発注' ? 'bg-amber-100 text-amber-800' :
                                  line.stage === '発注済・入荷待ち' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-200 text-slate-700'
                                }`}>
                                  {line.stage}
                                </span>
                                <span className="font-mono text-slate-600">残 {line.remainingQty}点</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(buildRakurakuUrl(config.rakurakuBaseUrl, ord.orderId), '_blank');
                            }}
                            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            title="楽楽販売で該当伝票を開く"
                          >
                            <ExternalLink className="w-3 h-3 text-slate-500" />
                            <span>楽楽販売</span>
                          </button>
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-white group-hover:bg-blue-600 text-slate-700 group-hover:text-white rounded-lg border border-slate-300 group-hover:border-blue-600 font-bold text-xs shadow-xs transition">
                            <span>詳細</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
