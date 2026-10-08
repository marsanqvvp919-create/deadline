import React, { useState, useMemo, useEffect } from 'react';
import { carrierName } from '../utils/trackingNumbers';
import { CarrierStatus, fetchSavedCarrierStatuses } from '../utils/carriers';
import { boxesOf, usableStatus } from '../utils/shipmentTracking';
import { openRakurakuWithCopiedId } from '../utils';
import { getConfiguredUrls } from '../api';

// 配送会社が通関で止めている（「通関手続きによる遅延」「荷物は処理保留中です」）出荷もこのページに出す
const CARRIER_HOLD_PATTERN = /通関手続きによる遅延|処理保留中|clearance delay|on hold/i;
import { ShipmentItem, Order, ClinicItem } from '../types';
import {
  ShieldAlert,
  Search,
  ExternalLink,
  Download,
  AlertOctagon,
  FileText
} from 'lucide-react';
import {
  isCustomsNgShipment,
  resolveClinicName,
  getRakurakuUrl,
  formatValue,
} from '../utils/customsUtils';
import { useSort } from '../utils/listState';
import { TableEmptyState } from './TableEmptyState';

interface KantoCustomsNgViewProps {
  shipments: ShipmentItem[];
  orders: Order[];
  clinics?: ClinicItem[];
  onSelectOrder?: (order: Order) => void;
  isLoading?: boolean;
  error?: string | null;
  lastSuccessTime?: string | null;
  onRetry?: () => void;
}

export const KantoCustomsNgView: React.FC<KantoCustomsNgViewProps> = ({
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
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const [copied, setCopied] = useState<string | null>(null);

  // 配送会社の状況（サーバーが自動取得したもの）
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus>>({});
  useEffect(() => {
    const load = () =>
      fetchSavedCarrierStatuses().then((snap) => {
        if (!snap) return;
        const map: Record<string, CarrierStatus> = {};
        snap.statuses.forEach((r) => (map[r.trackingNo] = r));
        setCarrierStatus(map);
      });
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const carrierHolds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows: { s: ShipmentItem; c: CarrierStatus; clinic: string }[] = [];
    shipments.forEach((s) => {
      const holds = boxesOf(s)
        .map((d) => usableStatus(carrierStatus[d]))
        .filter((c): c is CarrierStatus => !!c && c.status !== 'delivered' && CARRIER_HOLD_PATTERN.test(c.statusText || ''));
      if (holds.length === 0) return;
      const clinic = resolveClinicName(s, orders, clinics);
      if (q && ![s.shipmentId, s.orderId, clinic, s.trackingNo].some((v) => (v || '').toLowerCase().includes(q))) return;
      rows.push({ s, c: holds[0], clinic });
    });
    // 止まっている期間が長い順
    return rows.sort((a, b) => String(a.c.lastEventAt || '').localeCompare(String(b.c.lastEventAt || '')));
  }, [shipments, carrierStatus, orders, clinics, searchQuery]);

  // 通関NGの条件: 到着空港がNRTで、明細に関東通関可否「不可」の商品を含む出荷
  const kantoNgShipments = useMemo(() => {
    return shipments.filter((s) => {
      if (!isCustomsNgShipment(s, orders)) return false;

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
    });
  }, [shipments, orders, clinics, searchQuery]);


  // 列見出しのクリックで並べ替え
  const { sorted: sortedRows, toggle: toggleSort, indicator: sortMark } = useSort(kantoNgShipments, {
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
        isKantoNg: true,
      };
    }

    return {
      orderId: s.orderId || s.shipmentId,
      status: s.customsStatus || s.importStatus || '通関NG',
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
      isKantoNg: true,
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

    const rows = kantoNgShipments.map((s) => [
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
    link.setAttribute('download', `通関NG一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 判定に使う項目が楽楽販売から1件も届いていないか
  const hasKantoData = shipments.some(
    (s) => (s.kantoCustomsPermitted && s.kantoCustomsPermitted !== '—') || (s.kantoNgLineCount || 0) > 0
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg font-black">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">通関NG一覧</h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                  通関NG: {kantoNgShipments.length} 件
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-2 font-medium bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                ※ 通関NG件数（{kantoNgShipments.length}件）：到着空港がNRT（成田空港）で、明細に関東通関可否「不可」の商品を含む出荷の件数です。更新・調整は楽楽販売にて行ってください。
              </p>
              {!hasKantoData && shipments.length > 0 && (
                <p className="text-xs text-amber-100 mt-2 font-bold bg-amber-900/60 border border-amber-500/50 px-3 py-1.5 rounded-xl">
                  ※ 楽楽販売の出荷管理で「関東通関可否（明細）」「関東不可の明細数」がすべて空欄のため、いまは判定できません（0件は「NGなし」という意味ではありません）。
                  楽楽販売の商品マスタで関東通関可否を入力すると、ここに反映されます。
                </p>
              )}
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
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" /> CSV出力
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-700 block mb-1">配送会社で通関保留・遅延</span>
            <span className="text-2xl font-extrabold font-mono text-orange-600">{carrierHolds.length}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">「通関手続きによる遅延」「荷物は処理保留中です」</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-700 block mb-1">通関NG 対象出荷件数</span>
            <span className="text-2xl font-extrabold font-mono text-rose-600">{kantoNgShipments.length}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">到着NRTかつ関東通関不可品目を含む出荷</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-500 block mb-1">出荷管理 総レコード数</span>
            <span className="text-2xl font-extrabold font-mono text-slate-900">{shipments.length}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">出荷管理母数</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input autoComplete="off"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="出荷ID、受注ID、クリニック名、出荷番号で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
          />
        </div>
        <span className="text-xs font-mono text-slate-500">
          該当: {kantoNgShipments.length} 件
        </span>
      </div>

      {/* 配送会社で通関保留・遅延 */}
      <div className="bg-white border border-orange-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-orange-100 bg-orange-50 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-orange-900">配送会社で通関保留・遅延（{carrierHolds.length}件）</h3>
          <span className="text-[11px] text-orange-800">DHL・FedEx が「通関手続きによる遅延」「荷物は処理保留中です」を返している出荷。止まっている期間が長い順</span>
        </div>
        {carrierHolds.length === 0 ? (
          <p className="text-xs text-slate-500 px-4 py-3">該当なし</p>
        ) : (
          <div className="data-table-wrap overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-3">出荷ID / 受注ID</th>
                  <th className="py-2 px-3">クリニック名</th>
                  <th className="py-2 px-3">到着空港</th>
                  <th className="py-2 px-3">配送会社の状況</th>
                  <th className="py-2 px-3">最終スキャン</th>
                  <th className="py-2 px-3">輸入確認</th>
                  <th className="py-2 px-3">対応メモ</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carrierHolds.map(({ s, c, clinic }) => (
                  <tr key={s.shipmentId} className="align-top hover:bg-orange-50/40 cursor-pointer" onClick={() => onSelectOrder?.(getClickableOrder(s))}>
                    <td className="py-2 px-3">
                      <div className="font-mono font-bold text-slate-900">{s.shipmentId}</div>
                      <div className="font-mono text-[10px] text-blue-600">受注 {formatValue(s.orderId)}</div>
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900">{clinic}</td>
                    <td className="py-2 px-3">{formatValue(s.arrivalAirport)}</td>
                    <td className="py-2 px-3 font-bold text-orange-700">
                      {carrierName(c.carrier)}：{c.statusText}
                      <div className="font-mono text-[10px] text-slate-500 font-normal">{c.trackingNo}</div>
                    </td>
                    <td className="py-2 px-3">
                      {c.lastEventAt ? new Date(c.lastEventAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      {c.lastLocation && <div className="text-[10px] text-slate-500">{c.lastLocation}</div>}
                    </td>
                    <td className="py-2 px-3">{formatValue(s.importStatus)}</td>
                    <td className="py-2 px-3 text-slate-700">{s.handlingMemo && s.handlingMemo !== '—' ? s.handlingMemo : '—'}</td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          openRakurakuWithCopiedId(rakurakuBaseUrl, s.shipmentId);
                          setCopied(s.shipmentId);
                          setTimeout(() => setCopied(null), 2000);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold"
                        title="出荷IDをコピーして楽楽販売を開きます"
                      >
                        {copied === s.shipmentId ? 'コピー済み' : '開く'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            通関NG 実レコード一覧 ({kantoNgShipments.length} 件)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            全 {shipments.length} 件中
          </span>
        </div>

        <div className="data-table-wrap overflow-x-auto">
          <table className="tbl-ship w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th data-sortable onClick={() => toggleSort('shipmentId')} className="py-3 px-3">出荷ID / 受注ID{sortMark('shipmentId')}</th>
                <th data-sortable onClick={() => toggleSort('clinic')} className="py-3 px-4">クリニック名{sortMark('clinic')}</th>
                <th data-sortable onClick={() => toggleSort('warehouse')} className="py-3 px-3">出荷元倉庫{sortMark('warehouse')}</th>
                <th data-sortable onClick={() => toggleSort('arrivalAirport')} className="py-3 px-3">到着空港{sortMark('arrivalAirport')}</th>
                <th data-sortable onClick={() => toggleSort('importStatus')} className="py-3 px-3 text-center">輸入確認{sortMark('importStatus')}</th>
                <th data-sortable onClick={() => toggleSort('coolApplicationStatus')} className="py-3 px-3 text-center">クール申請{sortMark('coolApplicationStatus')}</th>
                <th data-sortable onClick={() => toggleSort('powerOfAttorneyStatus')} className="py-3 px-3 text-center">委任状{sortMark('powerOfAttorneyStatus')}</th>
                <th data-sortable onClick={() => toggleSort('slipStatus')} className="py-3 px-3 text-center">伝票{sortMark('slipStatus')}</th>
                <th data-sortable onClick={() => toggleSort('phaNumber')} className="py-3 px-3">PHA / 倉庫Inv{sortMark('phaNumber')}</th>
                <th data-sortable onClick={() => toggleSort('currentLocation')} className="py-3 px-3">現在地{sortMark('currentLocation')}</th>
                <th data-sortable onClick={() => toggleSort('trackingNo')} className="py-3 px-3 text-right">出荷番号{sortMark('trackingNo')}</th>
                <th className="py-3 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {kantoNgShipments.length === 0 || isLoading || error ? (
                <TableEmptyState
                  isLoading={isLoading}
                  error={error}
                  lastSuccessTime={lastSuccessTime}
                  onRetry={onRetry}
                  colSpan={12}
                  emptyMessage="該当する通関NG案件はありません"
                />
              ) : (
                sortedRows.map((item, idx) => {
                  const clinicName = resolveClinicName(item, orders, clinics);

                  return (
                    <tr
                      key={item.shipmentId || `ng-${idx}`}
                      onClick={() => onSelectOrder?.(getClickableOrder(item))}
                      className="hover:bg-slate-50/80 transition cursor-pointer bg-rose-50/30"
                    >
                      {/* 出荷ID・受注ID */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-900">{formatValue(item.shipmentId)}</div>
                        <div className="font-mono text-[10px] text-blue-600">受注 {formatValue(item.orderId)}</div>
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
                      <td className="py-3 px-3 font-semibold text-rose-700 whitespace-nowrap">
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
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {formatValue(item.coolApplicationStatus)}
                        </span>
                      </td>

                      {/* 委任状 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
                          {formatValue(item.powerOfAttorneyStatus)}
                        </span>
                      </td>

                      {/* 伝票 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
                          {formatValue(item.slipStatus)}
                        </span>
                      </td>

                      {/* PHA番号・倉庫インボイス番号 */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                        <div>{formatValue(item.phaNumber)}</div>
                        <div className="text-slate-500">{formatValue(item.warehouseInvoiceNo)}</div>
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
                          開く
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
