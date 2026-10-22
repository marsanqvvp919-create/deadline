import React, { useState } from 'react';
import {
  OrderRecord,
  BATCHES_LIST,
  getFedexTrackingUrl,
} from '../portalData';
import { portalGroupName } from '../portalData';
import {
  X,
  Package,
  Calendar,
  Building2,
  ExternalLink,
  Download,
  CheckCircle2,
  Clock,
  Truck,
  ShieldCheck,
  Search
} from 'lucide-react';

interface BatchDetailsModalProps {
  batchId: string;
  orders: OrderRecord[];
  onClose: () => void;
  onOpenTracking: (order: OrderRecord) => void;
  onOpenDeliverySlip: (order: OrderRecord) => void;
  onSelectClinic: (clinicId: string) => void;
}

export const BatchDetailsModal: React.FC<BatchDetailsModalProps> = ({
  batchId,
  orders,
  onClose,
  onOpenTracking,
  onOpenDeliverySlip,
  onSelectClinic,
}) => {
  const [search, setSearch] = useState('');
  const batchInfo = BATCHES_LIST.find((b) => b.id === batchId) || {
    id: batchId,
    name: batchId,
    orderDate: '受注日',
    description: '',
    isCurrent: false,
  };

  const filteredOrders = orders.filter((o) =>
    search === '' ||
    o.clinicName.toLowerCase().includes(search.toLowerCase()) ||
    o.doctor.toLowerCase().includes(search.toLowerCase()) ||
    o.fedexTracking.includes(search) ||
    o.sagawaTracking.includes(search) ||
    o.region.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnits = orders.reduce((acc, o) => acc + o.totalQty, 0);
  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;

  const handleExportBatchCsv = () => {
    const headers = ['発注ID', 'クリニック名', 'エリア', '担当医', '数量(箱)', 'ステータス', '国際便業者', '国際便追跡番号', '佐川番号', '納品予定日'];
    const rows = orders.map((o) => [
      `"${o.id}"`,
      `"${o.clinicName}"`,
      `"${o.region}"`,
      `"${o.doctor}"`,
      o.totalQty,
      `"${o.status}"`,
      `"${o.intlCarrier}"`,
      `"${o.fedexTracking}"`,
      `"${o.sagawaTracking}"`,
      `"${o.actualDelivery || o.estimatedDelivery || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${portalGroupName()}_${batchInfo.name}_明細一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-800 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 text-xs text-sky-200 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              <span>初回受注 {batchInfo.orderDate}</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${batchInfo.isCurrent ? 'bg-sky-500/30 text-sky-200 border border-sky-400/30' : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'}`}>
                {batchInfo.isCurrent ? '進行中' : '完了便'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black mt-1 flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-300" />
              {batchInfo.name} — 発注明細一覧
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportBatchCsv}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-slate-600"
            >
              <Download className="w-4 h-4" />
              CSV出力
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-header Summary / Filter bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="font-bold text-slate-700">
              総発注数量: <span className="text-blue-600 text-sm font-black">{totalUnits} 箱</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-bold text-slate-700">
              受注件数: <span className="text-slate-900 font-bold">{orders.length} 件</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-bold text-emerald-700">
              配達完了: {deliveredCount} / {orders.length} 件
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="クリニック名や追跡番号で絞り込み..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Table / List Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs">
                    <th className="py-3 px-4">クリニック名 / エリア</th>
                    <th className="py-3 px-4">担当医</th>
                    <th className="py-3 px-4 text-center">数量</th>
                    <th className="py-3 px-4">配送ステータス</th>
                    <th className="py-3 px-4">追跡番号 (FedEx・DHL / 佐川)</th>
                    <th className="py-3 px-4">納品予定 / 完了日</th>
                    <th className="py-3 px-4 text-right">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {filteredOrders.map((order) => {
                    const isDelivered = order.status === 'DELIVERED';
                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => {
                              onSelectClinic(order.clinicId);
                              onClose();
                            }}
                            className="font-bold text-slate-900 hover:text-blue-600 text-left transition-colors flex items-center gap-1.5 font-sans cursor-pointer group"
                          >
                            <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                            <span>{order.clinicName}</span>
                          </button>
                          <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                            {order.region} ({order.id})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-sans">
                          {order.doctor}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-900 text-sm">
                          {order.totalQty} <span className="text-[10px] font-normal text-slate-500">箱</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-sans ${
                            isDelivered
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {isDelivered ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-blue-600" />}
                            {isDelivered ? '配達完了' : '配送中'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-semibold w-12">{order.intlCarrier}:</span>
                              <a
                                href={getFedexTrackingUrl(order.fedexTracking)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 font-bold"
                              >
                                {order.fedexTracking}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-semibold w-12">国内:</span>
                              <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">{order.sagawaTracking || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {order.actualDelivery || order.estimatedDelivery || '調整中'}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 font-sans">
                          <button
                            onClick={() => onOpenTracking(order)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" />
                            追跡
                          </button>
                          <button
                            onClick={() => onOpenDeliverySlip(order)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            伝票
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>表示件数: {filteredOrders.length} 件 / 全 {orders.length} 件</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all cursor-pointer shadow-md"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
