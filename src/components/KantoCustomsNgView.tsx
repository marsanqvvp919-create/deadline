import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order } from '../types';
import { getLocalShipments, saveLocalShipments } from '../api';
import {
  ShieldAlert,
  AlertOctagon,
  Building,
  CheckCircle2,
  FileWarning,
  ArrowRight,
  Plane,
  Truck,
  Search,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface KantoCustomsNgViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order) => void;
}

export const KantoCustomsNgView: React.FC<KantoCustomsNgViewProps> = ({
  orders,
  onSelectOrder,
}) => {
  const [shipments, setShipments] = useState<ShipmentItem[]>(() => getLocalShipments());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const kantoNgShipments = useMemo(() => {
    return shipments.filter((s) => {
      if (!s.isKantoNg && !s.customsStatus.includes('NG')) return false;

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

  // Action: Route transfer to KIX
  const handleRerouteKix = (shipmentId: string) => {
    const updated = shipments.map((s) => {
      if (s.shipmentId === shipmentId) {
        return {
          ...s,
          arrivalAirport: '関西国際空港 (KIX) [振替済]',
          customsStatus: '関空保税陸送中 (通関再申告手配)',
          isKantoNg: false,
          currentLocation: '関空貨物地区へ保税転送中',
          memo: `${s.memo} 【済: 関西国際空港への保税転送手配完了】`,
        };
      }
      return s;
    });
    setShipments(updated);
    saveLocalShipments(updated);
    setSuccessToast(`出荷ID ${shipmentId} を「関空保税ルート振替済」に更新しました。`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 border border-rose-800/60 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg font-black">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">通関NG・保税留置案件一覧</h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 font-mono">
                  成田・羽田 税関留置
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono">
                  NG対象: {kantoNgShipments.length} 件
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                成田国際空港または羽田空港において、薬事監視照合NGまたは指定空港不一致により通関が停止している案件です。関西国際空港（KIX）への保税陸送振替、または輸入確認書類の再申請が必要です。
              </p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-rose-900/40">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">通関NG案件数</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{kantoNgShipments.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">成田税関・羽田税関留置中</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">関空振替推奨案件</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">
              {kantoNgShipments.filter((s) => s.arrivalAirport.includes('成田')).length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">KIX陸送ルート振替により通関可</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-400 block mb-1">未受領委任状</span>
            <span className="text-2xl font-extrabold font-mono text-white">
              {kantoNgShipments.filter((s) => s.powerOfAttorneyStatus === '未受領').length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">至急クリニック回収要</span>
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
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
          />
        </div>
        <span className="text-xs font-mono text-slate-500">
          対象: {kantoNgShipments.length} 件
        </span>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kantoNgShipments.length === 0 ? (
          <div className="col-span-2 bg-white rounded-2xl p-12 text-center border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900">通関NG案件はありません</h3>
            <p className="text-xs text-slate-500 mt-1">
              すべての成田・羽田到着貨物は正常に通関中または関空ルートで円滑に搬入されています。
            </p>
          </div>
        ) : (
          kantoNgShipments.map((item) => {
            const matchingOrder = orders.find((o) => o.orderId === item.orderId);

            return (
              <div
                key={item.shipmentId}
                className="bg-white border-2 border-rose-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition space-y-3"
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <AlertOctagon className="w-3 h-3" /> 通関NG
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 text-xs block mt-1">
                      {item.customerName}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
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
                    <span className="text-slate-400">輸入確認状況:</span>
                    <span className="text-rose-600 font-bold">{item.importStatus}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">通関委任状:</span>
                    <span className={item.powerOfAttorneyStatus === '未受領' ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {item.powerOfAttorneyStatus}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-rose-50 text-[11px] text-rose-900 border border-rose-200">
                  <strong>NG原因:</strong> {item.memo || '関東税関（成田・羽田）での輸入確認照合不一致。関西国際空港（KIX）への陸送保税振替または再申告手配が必要です。'}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => onSelectOrder?.(getClickableOrder(item, matchingOrder))}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    案件詳細を開く
                  </button>
                  <button
                    onClick={() => handleRerouteKix(item.shipmentId)}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 ml-auto"
                  >
                    <Truck className="w-3.5 h-3.5" /> 関空保税ルートへ振替手配
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
