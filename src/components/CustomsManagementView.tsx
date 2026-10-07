import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order } from '../types';
import { getLocalShipments, saveLocalShipments } from '../api';
import {
  ShieldAlert,
  Plane,
  Building,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Thermometer,
  FileCheck,
  ChevronRight,
  Download,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface CustomsManagementViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order) => void;
}

export const CustomsManagementView: React.FC<CustomsManagementViewProps> = ({
  orders,
  onSelectOrder,
}) => {
  const [shipments, setShipments] = useState<ShipmentItem[]>(() => getLocalShipments());
  const [selectedAirport, setSelectedAirport] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredShipments = useMemo(() => {
    return shipments.filter((item) => {
      if (selectedAirport !== 'all' && !item.arrivalAirport.includes(selectedAirport)) {
        return false;
      }
      if (selectedStatus === 'review' && !item.customsStatus.includes('審査中')) {
        return false;
      }
      if (selectedStatus === 'approved' && !item.customsStatus.includes('許可')) {
        return false;
      }
      if (selectedStatus === 'alert' && !(item.isKantoNg || item.isCoolMissing)) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.shipmentId.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.customerName.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q) ||
          item.trackingNo.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [shipments, selectedAirport, selectedStatus, searchQuery]);

  // KPIs
  const totalCount = shipments.length;
  const reviewCount = shipments.filter((s) => s.customsStatus.includes('審査中')).length;
  const approvedCount = shipments.filter((s) => s.customsStatus.includes('許可')).length;
  const alertCount = shipments.filter((s) => s.isKantoNg || s.isCoolMissing).length;

  // Synthetic Order fallback to ensure 案件詳細 always opens
  const getClickableOrder = (s: ShipmentItem, matching?: Order): Order => {
    if (matching) {
      return {
        ...matching,
        shipmentId: s.shipmentId,
        importStatus: s.importStatus,
        arrivalAirport: s.arrivalAirport,
        coolApplicationStatus: s.coolApplicationStatus,
        powerOfAttorneyStatus: s.powerOfAttorneyStatus,
        slipStatus: s.slipStatus,
        currentLocation: s.currentLocation,
        customsStatus: s.customsStatus,
        isKantoNg: s.isKantoNg,
        isCoolMissing: s.isCoolMissing,
      };
    }
    return {
      orderId: s.orderId,
      status: s.customsStatus || '通関手配中',
      salesRep: '未設定',
      customerName: s.customerName,
      orderDate: s.shippedDate,
      requestedDate: s.shippedDate,
      deliveredDate: null,
      orderState: '進行中',
      lines: [
        {
          lineKey: `${s.orderId}_${s.productId}_1`,
          productId: s.productId,
          productName: s.productName,
          quantity: s.quantity,
          supplierName: '仕入先',
          stage: '出荷完了',
          earliestDate: null,
          latestDate: null,
          poDate: null,
          shippedDate: s.shippedDate,
          shippedQty: s.quantity,
          remainingQty: 0,
          trackingNo: s.trackingNo,
          duplicateLines: false,
          unitPrice: 0,
          lineAmount: 0,
        },
      ],
      shipmentId: s.shipmentId,
      importStatus: s.importStatus,
      arrivalAirport: s.arrivalAirport,
      coolApplicationStatus: s.coolApplicationStatus,
      powerOfAttorneyStatus: s.powerOfAttorneyStatus,
      slipStatus: s.slipStatus,
      currentLocation: s.currentLocation,
      customsStatus: s.customsStatus,
      isKantoNg: s.isKantoNg,
      isCoolMissing: s.isCoolMissing,
    };
  };

  const handleExportCsv = () => {
    const headers = [
      '出荷ID',
      '受注ID',
      'クリニック名',
      '商品名',
      '数量',
      '追跡番号',
      '到着空港',
      '輸入確認ステータス',
      'クール申請',
      '委任状',
      '伝票',
      '現在地',
      '通関ステータス',
    ];
    const rows = filteredShipments.map((s) => [
      s.shipmentId,
      s.orderId,
      s.customerName,
      s.productName,
      s.quantity,
      s.trackingNo,
      s.arrivalAirport,
      s.importStatus,
      s.coolApplicationStatus,
      s.powerOfAttorneyStatus,
      s.slipStatus,
      s.currentLocation,
      s.customsStatus,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `通関管理一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">通関・輸入管理一覧</h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-mono">
                  出荷管理連携 (101270)
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-mono">
                  今日同期: {totalCount} 件
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                成田国際空港・関西国際空港・羽田空港での税関審査状況、輸入確認ステータス、クール便申請・委任状・伝票の完備状況を一元モニタリングします。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" /> CSVエクスポート
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-400 block mb-1">通関・出荷管理総件数</span>
            <span className="text-2xl font-extrabold font-mono text-white">{totalCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">本日集計データ</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">税関審査中</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">{reviewCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">書類照合・通関待ち</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-emerald-300 block mb-1">通関許可・国内搬入済</span>
            <span className="text-2xl font-extrabold font-mono text-emerald-400">{approvedCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">国内輸送・納品手配中</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">要注意（クール漏れ・通関NG）</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{alertCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">至急アクション要</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {/* Airport Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <span className="px-2 font-bold text-slate-500">空港:</span>
            {[
              { id: 'all', label: '全空港' },
              { id: '関西', label: '関空 (KIX)' },
              { id: '成田', label: '成田 (NRT)' },
              { id: '羽田', label: '羽田 (HND)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedAirport(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  selectedAirport === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <span className="px-2 font-bold text-slate-500">通関:</span>
            {[
              { id: 'all', label: 'すべて' },
              { id: 'review', label: '審査中' },
              { id: 'approved', label: '許可済' },
              { id: 'alert', label: '要対応' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  selectedStatus === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="出荷ID、クリニック名、追跡番号で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plane className="w-4 h-4 text-indigo-600" />
            通関・出荷案件一覧 ({filteredShipments.length} 件)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            全 {shipments.length} 件中
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">出荷ID / 受注ID</th>
                <th className="py-3 px-4">クリニック名 / 品名・数量</th>
                <th className="py-3 px-3">到着空港</th>
                <th className="py-3 px-3 text-center">輸入確認</th>
                <th className="py-3 px-3 text-center">クール申請</th>
                <th className="py-3 px-3 text-center">委任状/伝票</th>
                <th className="py-3 px-4">現在地</th>
                <th className="py-3 px-3 text-center">通関ステータス</th>
                <th className="py-3 px-3 text-right">送り状番号</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    該当する通関データがありません
                  </td>
                </tr>
              ) : (
                filteredShipments.map((item) => {
                  const matchingOrder = orders.find((o) => o.orderId === item.orderId);

                  return (
                    <tr
                      key={item.shipmentId}
                      onClick={() => onSelectOrder?.(getClickableOrder(item, matchingOrder))}
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        item.isKantoNg ? 'bg-rose-50/30' : item.isCoolMissing ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 font-mono block">
                          {item.shipmentId}
                        </span>
                        <span className="text-[11px] text-blue-600 font-mono">
                          {item.orderId}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{item.customerName}</span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                          <span>{item.productName}</span>
                          <span className="font-bold font-mono text-slate-700">x{item.quantity}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {item.arrivalAirport}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.importStatus === '承認済'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.importStatus === '要修正'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {item.importStatus}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.coolApplicationStatus === '申請済'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : item.coolApplicationStatus === '申請漏れ'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                              : item.coolApplicationStatus === '手配中'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Thermometer className="w-3 h-3" />
                          {item.coolApplicationStatus}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px]">
                          <span
                            className={`px-1.5 py-0.2 rounded border ${
                              item.powerOfAttorneyStatus === '受領済'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            委任状:{item.powerOfAttorneyStatus}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded border ${
                              item.slipStatus === '作成済'
                                ? 'bg-slate-50 text-slate-700 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            伝票:{item.slipStatus}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        <span className="line-clamp-1">{item.currentLocation}</span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.customsStatus.includes('許可')
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.customsStatus.includes('NG')
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {item.customsStatus}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-slate-900 block">{item.trackingNo}</span>
                        <span className="text-[10px] text-slate-400 block">{item.carrier || 'FedEx'}</span>
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
