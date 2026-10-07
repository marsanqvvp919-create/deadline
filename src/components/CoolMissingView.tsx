import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order, ClinicItem } from '../types';
import {
  Thermometer,
  Search,
  ExternalLink,
  Download,
  AlertTriangle,
  FileText
} from 'lucide-react';
import {
  isCoolMissingShipment,
  resolveClinicName,
  getRakurakuUrl,
  formatValue,
} from '../utils/customsUtils';
import { useSort } from '../utils/listState';
import { TableEmptyState } from './TableEmptyState';

interface CoolMissingViewProps {
  shipments: ShipmentItem[];
  orders: Order[];
  clinics?: ClinicItem[];
  onSelectOrder?: (order: Order) => void;
  isLoading?: boolean;
  error?: string | null;
  lastSuccessTime?: string | null;
  onRetry?: () => void;
}

export const CoolMissingView: React.FC<CoolMissingViewProps> = ({
  shipments,
  orders,
  clinics = [],
  onSelectOrder,
  isLoading = false,
  error = null,
  lastSuccessTime = null,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const rakurakuUrl = getRakurakuUrl();

  // クール手配漏れの条件: クール申請・委任状・伝票のどれかが「未」
  const coolMissingShipments = useMemo(() => {
    return shipments.filter((s) => {
      if (!isCoolMissingShipment(s)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clinicName = resolveClinicName(s, orders, clinics).toLowerCase();
        return (
          (s.shipmentId || '').toLowerCase().includes(q) ||
          (s.orderId || '').toLowerCase().includes(q) ||
          clinicName.includes(q) ||
          (s.trackingNo || '').toLowerCase().includes(q) ||
          (s.warehouse || '').toLowerCase().includes(q) ||
          (s.phaNumber || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    // 出荷管理の「次の期限」が近い順（期限が空のものは後ろ）
    .sort((a, b) => {
      const da = ((a as any).nextDeadline || '').replace(/\//g, '-');
      const db = ((b as any).nextDeadline || '').replace(/\//g, '-');
      const va = da && da !== '—' ? da : '9999';
      const vb = db && db !== '—' ? db : '9999';
      return va.localeCompare(vb);
    });
  }, [shipments, orders, clinics, searchQuery]);


  // 列見出しのクリックで並べ替え
  const { sorted: sortedRows, toggle: toggleSort, indicator: sortMark } = useSort(coolMissingShipments, {
    shipmentId: (s) => s.shipmentId,
    nextDeadline: (s) => (s as any).nextDeadline,
    orderId: (s) => s.orderId,
    clinic: (s) => resolveClinicName(s, orders, clinics),
    warehouse: (s) => s.warehouse,
    arrivalAirport: (s) => s.arrivalAirport,
    importStatus: (s) => s.importStatus,
    coolApplicationStatus: (s) => s.coolApplicationStatus,
    powerOfAttorneyStatus: (s) => s.powerOfAttorneyStatus,
    slipStatus: (s) => s.slipStatus,
    phaNumber: (s) => s.phaNumber,
    warehouseInvoiceNo: (s) => s.warehouseInvoiceNo,
    currentLocation: (s) => s.currentLocation,
    trackingNo: (s) => s.trackingNo,
  });
  // 内訳カウント
  const coolAppMissingCount = useMemo(
    () => coolMissingShipments.filter((s) => (s.coolApplicationStatus || '').includes('未')).length,
    [coolMissingShipments]
  );
  const poaMissingCount = useMemo(
    () => coolMissingShipments.filter((s) => (s.powerOfAttorneyStatus || '').includes('未')).length,
    [coolMissingShipments]
  );
  const slipMissingCount = useMemo(
    () => coolMissingShipments.filter((s) => (s.slipStatus || '').includes('未')).length,
    [coolMissingShipments]
  );

  // 案件詳細用Order生成
  const getClickableOrder = (s: ShipmentItem): Order => {
    const matching = orders.find((o) => o.orderId === s.orderId);
    const clinicName = resolveClinicName(s, orders, clinics);

    if (matching) {
      return {
        ...matching,
        shipmentId: s.shipmentId,
        customerName: clinicName !== '—' ? clinicName : matching.customerName,
        importStatus: s.importStatus,
        arrivalAirport: s.arrivalAirport,
        coolApplicationStatus: s.coolApplicationStatus,
        powerOfAttorneyStatus: s.powerOfAttorneyStatus,
        slipStatus: s.slipStatus,
        currentLocation: s.currentLocation,
        customsStatus: s.customsStatus,
        isCoolMissing: true,
      };
    }

    return {
      orderId: s.orderId || s.shipmentId,
      status: s.customsStatus || s.importStatus || '出荷管理レコード',
      salesRep: '未設定',
      customerName: clinicName,
      orderDate: s.shippedDate || '—',
      requestedDate: s.shippedDate || '—',
      deliveredDate: null,
      orderState: '進行中',
      lines: [
        {
          lineKey: `${s.orderId}_line_1`,
          productId: s.productId || '—',
          productName: s.productName || '—',
          quantity: s.quantity || 1,
          supplierName: s.warehouse || '仕入先',
          stage: '出荷完了',
          earliestDate: null,
          latestDate: null,
          poDate: null,
          shippedDate: s.shippedDate || null,
          shippedQty: s.quantity || 1,
          remainingQty: 0,
          trackingNo: s.trackingNo || null,
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
      isCoolMissing: true,
    };
  };

  const handleExportCsv = () => {
    const headers = [
      '出荷ID',
      '受注ID',
      'クリニック名',
      '出荷元倉庫',
      '到着空港',
      '輸入確認ステータス',
      'クール申請',
      '委任状',
      '伝票',
      'PHA番号',
      '倉庫インボイス番号',
      '現在地',
      '出荷番号',
    ];

    const rows = coolMissingShipments.map((s) => [
      formatValue(s.shipmentId),
      formatValue(s.orderId),
      resolveClinicName(s, orders, clinics),
      formatValue(s.warehouse),
      formatValue(s.arrivalAirport),
      formatValue(s.importStatus),
      formatValue(s.coolApplicationStatus),
      formatValue(s.powerOfAttorneyStatus),
      formatValue(s.slipStatus),
      formatValue(s.phaNumber),
      formatValue(s.warehouseInvoiceNo),
      formatValue(s.currentLocation),
      formatValue(s.trackingNo),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `クール手配漏れ一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border border-amber-800/60 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-900 flex items-center justify-center shrink-0 shadow-lg font-black">
              <Thermometer className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">クール手配漏れ一覧</h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 font-mono">
                  漏れ件数: {coolMissingShipments.length} 件
                </span>
              </div>
              {/* ユーザー指定の1行説明文 */}
              <p className="text-xs text-amber-200 mt-2 font-medium bg-amber-950/70 border border-amber-600/40 px-3 py-1.5 rounded-xl">
                ※ 漏れ件数（{coolMissingShipments.length}件）：出荷管理（101270）データのうち、クール申請・委任状・伝票のいずれかが「未」となっている出荷の件数です。更新は楽楽販売にて行ってください。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={rakurakuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <ExternalLink className="w-4 h-4" /> 楽楽販売で開く
            </a>
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" /> CSV出力
            </button>
          </div>
        </div>

        {/* KPIs (実データに基づく内訳) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-amber-900/40">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">クール申請「未」</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">{coolAppMissingCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">航空会社クール申請未手配</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">通関委任状「未」</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{poaMissingCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">通関委任状未受領</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-200 block mb-1">伝票ステータス「未」</span>
            <span className="text-2xl font-extrabold font-mono text-amber-300">{slipMissingCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">出荷伝票未作成</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="出荷ID、受注ID、クリニック名、出荷番号で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
          />
        </div>
        <span className="text-xs font-mono text-slate-500">
          該当: {coolMissingShipments.length} 件
        </span>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-amber-600" />
            クール手配漏れ 実レコード一覧 ({coolMissingShipments.length} 件)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            全 {shipments.length} 件中
          </span>
        </div>

        <div className="data-table-wrap overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th data-sortable onClick={() => toggleSort('shipmentId')} className="py-3 px-3">出荷ID{sortMark('shipmentId')}</th>
                <th data-sortable onClick={() => toggleSort('nextDeadline')} className="py-3 px-3">次の期限{sortMark('nextDeadline')}</th>
                <th data-sortable onClick={() => toggleSort('orderId')} className="py-3 px-3">受注ID{sortMark('orderId')}</th>
                <th data-sortable onClick={() => toggleSort('clinic')} className="py-3 px-4">クリニック名{sortMark('clinic')}</th>
                <th data-sortable onClick={() => toggleSort('warehouse')} className="py-3 px-3">出荷元倉庫{sortMark('warehouse')}</th>
                <th data-sortable onClick={() => toggleSort('arrivalAirport')} className="py-3 px-3">到着空港{sortMark('arrivalAirport')}</th>
                <th data-sortable onClick={() => toggleSort('importStatus')} className="py-3 px-3 text-center">輸入確認{sortMark('importStatus')}</th>
                <th data-sortable onClick={() => toggleSort('coolApplicationStatus')} className="py-3 px-3 text-center">クール申請{sortMark('coolApplicationStatus')}</th>
                <th data-sortable onClick={() => toggleSort('powerOfAttorneyStatus')} className="py-3 px-3 text-center">委任状{sortMark('powerOfAttorneyStatus')}</th>
                <th data-sortable onClick={() => toggleSort('slipStatus')} className="py-3 px-3 text-center">伝票{sortMark('slipStatus')}</th>
                <th data-sortable onClick={() => toggleSort('phaNumber')} className="py-3 px-3">PHA番号{sortMark('phaNumber')}</th>
                <th data-sortable onClick={() => toggleSort('warehouseInvoiceNo')} className="py-3 px-3">倉庫Inv番号{sortMark('warehouseInvoiceNo')}</th>
                <th data-sortable onClick={() => toggleSort('currentLocation')} className="py-3 px-3">現在地{sortMark('currentLocation')}</th>
                <th data-sortable onClick={() => toggleSort('trackingNo')} className="py-3 px-3 text-right">出荷番号{sortMark('trackingNo')}</th>
                <th className="py-3 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {coolMissingShipments.length === 0 || isLoading || error ? (
                <TableEmptyState
                  isLoading={isLoading}
                  error={error}
                  lastSuccessTime={lastSuccessTime}
                  onRetry={onRetry}
                  colSpan={15}
                  emptyMessage="該当するクール手配漏れ案件はありません"
                />
              ) : (
                sortedRows.map((item, idx) => {
                  const clinicName = resolveClinicName(item, orders, clinics);

                  return (
                    <tr
                      key={item.shipmentId || `cool-${idx}`}
                      onClick={() => onSelectOrder?.(getClickableOrder(item))}
                      className="hover:bg-slate-50/80 transition cursor-pointer bg-amber-50/20"
                    >
                      {/* 出荷ID */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatValue(item.shipmentId)}
                      </td>

                      {/* 次の期限 */}
                      <td className="py-3 px-3 font-mono font-bold text-amber-700 whitespace-nowrap">
                        {formatValue((item as any).nextDeadline)}
                      </td>

                      {/* 受注ID */}
                      <td className="py-3 px-3 font-mono text-blue-600 whitespace-nowrap">
                        {formatValue(item.orderId)}
                      </td>

                      {/* クリニック名 */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {clinicName}
                      </td>

                      {/* 出荷元倉庫 */}
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {formatValue(item.warehouse)}
                      </td>

                      {/* 到着空港 */}
                      <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        {formatValue(item.arrivalAirport)}
                      </td>

                      {/* 輸入確認ステータス */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {formatValue(item.importStatus)}
                        </span>
                      </td>

                      {/* クール申請 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.coolApplicationStatus && item.coolApplicationStatus.includes('未')
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {formatValue(item.coolApplicationStatus)}
                        </span>
                      </td>

                      {/* 委任状 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.powerOfAttorneyStatus && item.powerOfAttorneyStatus.includes('未')
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {formatValue(item.powerOfAttorneyStatus)}
                        </span>
                      </td>

                      {/* 伝票 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.slipStatus && item.slipStatus.includes('未')
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {formatValue(item.slipStatus)}
                        </span>
                      </td>

                      {/* PHA番号 */}
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {formatValue(item.phaNumber)}
                      </td>

                      {/* 倉庫インボイス番号 */}
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {formatValue(item.warehouseInvoiceNo)}
                      </td>

                      {/* 現在地 */}
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                        {formatValue(item.currentLocation)}
                      </td>

                      {/* 出荷番号 */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatValue(item.trackingNo)}
                      </td>

                      {/* 操作 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={rakurakuUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition"
                        >
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                          楽楽販売で開く
                        </a>
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
