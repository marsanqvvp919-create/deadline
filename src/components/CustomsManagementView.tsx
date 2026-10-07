import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order, ClinicItem } from '../types';
import {
  ShieldAlert,
  Plane,
  Search,
  ExternalLink,
  Download,
  AlertTriangle,
  FileText,
  Warehouse
} from 'lucide-react';
import {
  isCoolMissingShipment,
  isCustomsNgShipment,
  resolveClinicName,
  getRakurakuUrl,
  formatValue,
} from '../utils/customsUtils';

interface CustomsManagementViewProps {
  shipments: ShipmentItem[];
  orders: Order[];
  clinics?: ClinicItem[];
  onSelectOrder?: (order: Order) => void;
}

export const CustomsManagementView: React.FC<CustomsManagementViewProps> = ({
  shipments,
  orders,
  clinics = [],
  onSelectOrder,
}) => {
  const [selectedAirport, setSelectedAirport] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const rakurakuUrl = getRakurakuUrl();

  const filteredShipments = useMemo(() => {
    return shipments.filter((item) => {
      // 空港フィルター (KIX / NRT / NGO)
      if (selectedAirport !== 'all') {
        const airport = (item.arrivalAirport || '').toUpperCase();
        if (selectedAirport === 'KIX' && !airport.includes('KIX') && !airport.includes('関空') && !airport.includes('関西')) {
          return false;
        }
        if (selectedAirport === 'NRT' && !airport.includes('NRT') && !airport.includes('成田')) {
          return false;
        }
        if (selectedAirport === 'NGO' && !airport.includes('NGO') && !airport.includes('中部')) {
          return false;
        }
      }

      // ステータスフィルター
      if (selectedStatus === 'review' && !item.importStatus.includes('審査') && !item.customsStatus?.includes('審査')) {
        return false;
      }
      if (selectedStatus === 'cool_missing' && !isCoolMissingShipment(item)) {
        return false;
      }
      if (selectedStatus === 'customs_ng' && !isCustomsNgShipment(item, orders)) {
        return false;
      }

      // 検索フィルター
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clinicName = resolveClinicName(item, orders, clinics).toLowerCase();
        const matches =
          (item.shipmentId || '').toLowerCase().includes(q) ||
          (item.orderId || '').toLowerCase().includes(q) ||
          clinicName.includes(q) ||
          (item.trackingNo || '').toLowerCase().includes(q) ||
          (item.phaNumber || '').toLowerCase().includes(q) ||
          (item.warehouseInvoiceNo || '').toLowerCase().includes(q) ||
          (item.warehouse || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [shipments, orders, clinics, selectedAirport, selectedStatus, searchQuery]);

  // KPI計算（実データから集計）
  const totalCount = shipments.length;
  const coolMissingTotal = useMemo(
    () => shipments.filter((s) => isCoolMissingShipment(s)).length,
    [shipments]
  );
  const customsNgTotal = useMemo(
    () => shipments.filter((s) => isCustomsNgShipment(s, orders)).length,
    [shipments, orders]
  );

  // 行クリック時に案件詳細ドロワーを開くためのOrderデータ生成
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
        isKantoNg: isCustomsNgShipment(s, orders),
        isCoolMissing: isCoolMissingShipment(s),
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
      isKantoNg: isCustomsNgShipment(s, orders),
      isCoolMissing: isCoolMissingShipment(s),
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

    const rows = filteredShipments.map((s) => [
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
    link.setAttribute('download', `出荷管理_通関一覧_${new Date().toISOString().slice(0, 10)}.csv`);
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
                  出荷管理実レコード (101270)
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-mono">
                  総レコード: {totalCount} 件
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                出荷管理（101270）の実レコードに基づき、出荷元倉庫、到着空港（KIX/NRT/NGO）、輸入確認、クール申請・委任状・伝票、PHA番号、倉庫インボイス番号、現在地、出荷番号を表示します。
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-400 block mb-1">出荷管理 総件数</span>
            <span className="text-2xl font-extrabold font-mono text-white">{totalCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">実レコード件数</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">クール手配漏れ</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">{coolMissingTotal}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">クール申請・委任状・伝票のいずれかが未</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">通関NG</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{customsNgTotal}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">到着NRTかつ関東通関不可</span>
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
              { id: 'KIX', label: '関空 (KIX)' },
              { id: 'NRT', label: '成田 (NRT)' },
              { id: 'NGO', label: '中部 (NGO)' },
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
            <span className="px-2 font-bold text-slate-500">絞込:</span>
            {[
              { id: 'all', label: 'すべて' },
              { id: 'cool_missing', label: 'クール漏れ' },
              { id: 'customs_ng', label: '通関NG' },
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
            placeholder="出荷ID、受注ID、クリニック名、出荷番号で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plane className="w-4 h-4 text-indigo-600" />
            通関・出荷管理 実レコード一覧 ({filteredShipments.length} 件)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            全 {shipments.length} 件中
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-3">出荷ID</th>
                <th className="py-3 px-3">受注ID</th>
                <th className="py-3 px-4">クリニック名</th>
                <th className="py-3 px-3">出荷元倉庫</th>
                <th className="py-3 px-3">到着空港</th>
                <th className="py-3 px-3 text-center">輸入確認</th>
                <th className="py-3 px-3 text-center">クール申請</th>
                <th className="py-3 px-3 text-center">委任状</th>
                <th className="py-3 px-3 text-center">伝票</th>
                <th className="py-3 px-3">PHA番号</th>
                <th className="py-3 px-3">倉庫Inv番号</th>
                <th className="py-3 px-3">現在地</th>
                <th className="py-3 px-3 text-right">出荷番号</th>
                <th className="py-3 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400 font-bold">
                    データなし
                  </td>
                </tr>
              ) : (
                filteredShipments.map((item, idx) => {
                  const clinicName = resolveClinicName(item, orders, clinics);
                  const isCool = isCoolMissingShipment(item);
                  const isNg = isCustomsNgShipment(item, orders);

                  return (
                    <tr
                      key={item.shipmentId || `ship-${idx}`}
                      onClick={() => onSelectOrder?.(getClickableOrder(item))}
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        isNg ? 'bg-rose-50/30' : isCool ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* 出荷ID */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatValue(item.shipmentId)}
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
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.importStatus && item.importStatus.includes('済')
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.importStatus && (item.importStatus.includes('要修正') || item.importStatus.includes('不備'))
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {formatValue(item.importStatus)}
                        </span>
                      </td>

                      {/* クール申請 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.coolApplicationStatus && item.coolApplicationStatus.includes('未')
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : item.coolApplicationStatus && item.coolApplicationStatus.includes('済')
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-600'
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
