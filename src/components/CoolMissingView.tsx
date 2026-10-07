import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order } from '../types';
import { getLocalShipments, saveLocalShipments } from '../api';
import {
  Thermometer,
  AlertTriangle,
  Building,
  CheckCircle2,
  FileText,
  Clock,
  Search,
  Download,
  Send,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface CoolMissingViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order) => void;
}

export const CoolMissingView: React.FC<CoolMissingViewProps> = ({
  orders,
  onSelectOrder,
}) => {
  const [shipments, setShipments] = useState<ShipmentItem[]>(() => getLocalShipments());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filter only cool missing shipments
  const coolMissingShipments = useMemo(() => {
    return shipments.filter((s) => {
      const isMissing = s.isCoolMissing || s.coolApplicationStatus === '申請漏れ' || s.coolApplicationStatus === '手配中';
      if (!isMissing) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.shipmentId.toLowerCase().includes(q) ||
          s.orderId.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.productName.toLowerCase().includes(q) ||
          s.trackingNo.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [shipments, searchQuery]);

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

  // Mark cool status as completed
  const handleResolveCool = (shipmentId: string) => {
    const updated = shipments.map((s) => {
      if (s.shipmentId === shipmentId) {
        return {
          ...s,
          coolApplicationStatus: '申請済',
          isCoolMissing: false,
          slipStatus: '作成済',
          customsStatus: '通関審査中 (クール申請済)',
          memo: `${s.memo} 【済: クール手配完了更新】`,
        };
      }
      return s;
    });
    setShipments(updated);
    saveLocalShipments(updated);
    setSuccessToast(`出荷ID ${shipmentId} のクール申請を手配完了（申請済）に更新しました。`);
    setTimeout(() => setSuccessToast(null), 3000);
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
                <h1 className="text-xl font-bold tracking-tight">クール便手配漏れ・要緊急対応一覧</h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono">
                  要冷蔵 (2〜8℃厳守製剤)
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 font-mono">
                  手配漏れ: {coolMissingShipments.length} 件
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                ボツリヌストキシン・ヒアルロン酸・スキンブースター等、定温輸送（クール便コンテナ）が必要な製剤で、航空会社申請やクール伝票が未作成の案件です。品質保持のため至急申請を行ってください。
              </p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-amber-900/40">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">クール申請漏れ案件数</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">{coolMissingShipments.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">未手配・申請待ち</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">未作成伝票数</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">
              {coolMissingShipments.filter((s) => s.slipStatus === '未作成').length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">クール便専用伝票未発行</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-400 block mb-1">平均保税保管温度</span>
            <span className="text-2xl font-extrabold font-mono text-white">4.2 ℃</span>
            <span className="text-[10px] text-emerald-400 block mt-0.5">一時冷蔵保管中（上限注意）</span>
          </div>
        </div>
      </div>

      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="出荷ID、クリニック名、商品名で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
          />
        </div>
        <span className="text-xs font-mono text-slate-500">
          対象: {coolMissingShipments.length} 件
        </span>
      </div>

      {/* Cool Missing Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {coolMissingShipments.length === 0 ? (
          <div className="col-span-2 bg-white rounded-2xl p-12 text-center border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900">クール手配漏れ案件はありません</h3>
            <p className="text-xs text-slate-500 mt-1">
              すべての要冷蔵製剤のクールコンテナ申請・専用伝票が正常に手配されています。
            </p>
          </div>
        ) : (
          coolMissingShipments.map((item) => {
            const matchingOrder = orders.find((o) => o.orderId === item.orderId);

            return (
              <div
                key={item.shipmentId}
                className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {item.shipmentId}
                      </span>
                      <span className="text-xs text-blue-600 font-mono">
                        {item.orderId}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 手配漏れ
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 text-xs block mt-1">
                      {item.customerName}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-semibold text-slate-500">
                    {item.arrivalAirport}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">対象製剤:</span>
                    <strong className="text-slate-900">{item.productName} ({item.quantity}本)</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">現在地:</span>
                    <span>{item.currentLocation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">伝票ステータス:</span>
                    <span className={item.slipStatus === '未作成' ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {item.slipStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">追跡番号:</span>
                    <span className="font-mono">{item.trackingNo} ({item.carrier || 'FedEx'})</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-900 border border-amber-200">
                  <strong>注意:</strong> {item.memo || '定温2〜8℃を保持するため、航空会社へのクール申請と専用保冷伝票の手配が必要です。'}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => onSelectOrder?.(getClickableOrder(item, matchingOrder))}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    案件詳細を開く
                  </button>
                  <button
                    onClick={() => handleResolveCool(item.shipmentId)}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 ml-auto"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> クール手配完了に更新
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
