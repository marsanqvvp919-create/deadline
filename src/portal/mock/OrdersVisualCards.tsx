import React from 'react';
import {
  OrderRecord,
  STATUS_STEPS,
  OrderStatus,
  getFedexTrackingUrl,
} from '../portalData';
import {
  ExternalLink,
  FileText,
  Clock,
  Plane,
  Truck,
  CheckCircle2,
  Eye,
  MapPin,
  Building,
  ShieldCheck,
  Package,
  Calendar
} from 'lucide-react';

interface OrdersVisualCardsProps {
  orders: OrderRecord[];
  onOpenTracking: (order: OrderRecord) => void;
  onOpenDeliverySlip: (order: OrderRecord) => void;
  onAdvanceStatus?: (orderId: string) => void;
}

export const OrdersVisualCards: React.FC<OrdersVisualCardsProps> = ({
  orders,
  onOpenTracking,
  onOpenDeliverySlip,
  onAdvanceStatus,
}) => {
  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
        <h3 className="text-base font-bold text-slate-700">該当する注文データがありません</h3>
        <p className="text-xs text-slate-500 mt-1">
          検索条件を変更してお試しください。
        </p>
      </div>
    );
  }

  const getStepIndex = (status: OrderStatus) => {
    switch (status) {
      case 'ORDERED':
      case 'PREPARING':
        return 0; // Singapore
      case 'FEDEX_DISPATCHED':
      case 'IN_TRANSIT_INTL':
        return 1; // Flight
      case 'CUSTOMS_CLEARANCE':
        return 2; // Customs
      case 'SAGAWA_HANDOVER':
      case 'OUT_FOR_DELIVERY':
        return 3; // Sagawa Cool
      case 'DELIVERED':
        return 4; // Delivered
      default:
        return 0;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {orders.map((order) => {
        const stepObj = STATUS_STEPS.find((s) => s.key === order.status) || STATUS_STEPS[0];
        const isDelivered = order.status === 'DELIVERED';
        const miniStep = getStepIndex(order.status);

        return (
          <div
            key={order.id}
            className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-150 p-4 flex flex-col justify-between relative group hover:border-blue-300"
          >
            {/* Top Bar: Clinic Name & Badges */}
            <div>
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {order.region}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        order.hub === 'NRT'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      {order.hub}ハブ
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {order.invoiceNo}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1 leading-snug">
                    {order.clinicName}
                  </h3>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    院長: {order.doctor || '—'}
                  </div>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md border ${stepObj.bgLight} ${stepObj.textColor} ${stepObj.borderLight}`}
                >
                  {isDelivered ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                  )}
                  {stepObj.label}
                </span>
              </div>

              {/* 5-Station Mini Journey Visual Bar */}
              <div className="my-3 py-2 px-2.5 bg-slate-50 rounded-lg border border-slate-150">
                <div className="text-[10px] font-semibold text-slate-600 mb-1.5 flex justify-between">
                  <span>配送ルート進捗:</span>
                  <span className="font-bold text-slate-800">
                    {stepObj.shortLabel} (STEP {stepObj.step + 1}/8)
                  </span>
                </div>

                {/* Illustrated 5 points track */}
                <div className="grid grid-cols-5 gap-1 text-center">
                  {/* Point 1: Singapore */}
                  <div
                    className={`py-1 rounded text-[10px] font-bold flex flex-col items-center ${
                      miniStep >= 0
                        ? miniStep === 0
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span>🇸🇬</span>
                    <span className="text-[9px] mt-0.5">SG梱包</span>
                  </div>

                  {/* Point 2: FedEx Flight */}
                  <div
                    className={`py-1 rounded text-[10px] font-bold flex flex-col items-center ${
                      miniStep >= 1
                        ? miniStep === 1
                          ? 'bg-purple-100 text-purple-900 border border-purple-300'
                          : 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span>✈️</span>
                    <span className="text-[9px] mt-0.5">{order.intlCarrier}</span>
                  </div>

                  {/* Point 3: Customs */}
                  <div
                    className={`py-1 rounded text-[10px] font-bold flex flex-col items-center ${
                      miniStep >= 2
                        ? miniStep === 2
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span>🛬</span>
                    <span className="text-[9px] mt-0.5">通関</span>
                  </div>

                  {/* Point 4: Sagawa */}
                  <div
                    className={`py-1 rounded text-[10px] font-bold flex flex-col items-center ${
                      miniStep >= 3
                        ? miniStep === 3
                          ? 'bg-cyan-100 text-cyan-900 border border-cyan-300'
                          : 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span>❄️</span>
                    <span className="text-[9px] mt-0.5">佐川急便</span>
                  </div>

                  {/* Point 5: Delivered */}
                  <div
                    className={`py-1 rounded text-[10px] font-bold flex flex-col items-center ${
                      miniStep >= 4
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span>🏥</span>
                    <span className="text-[9px] mt-0.5">受領完了</span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 text-xs">
                {order.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-slate-800 font-medium truncate max-w-[200px]" title={it.name}>
                      {it.name}
                    </span>
                    <span className="font-bold text-blue-700 shrink-0">
                      × {it.qty} {it.unit}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tracking Links Row */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                {/* FedEx */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                    {order.intlCarrier}追跡
                  </span>
                  <a
                    href={getFedexTrackingUrl(order.fedexTracking)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-purple-700 hover:text-purple-900 font-semibold hover:underline flex items-center gap-0.5 text-[11px]"
                  >
                    {order.fedexTracking}
                    <ExternalLink className="w-3 h-3 text-purple-400" />
                  </a>
                </div>

                {/* Sagawa */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">
                    佐川急便
                  </span>
                  <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">{order.sagawaTracking || '—'}</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onOpenTracking(order)}
                className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                追跡詳細
              </button>
              <button
                onClick={() => onOpenDeliverySlip(order)}
                className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                納品伝票
              </button>
              {onAdvanceStatus && !isDelivered && (
                <button
                  onClick={() => onAdvanceStatus(order.id)}
                  className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-dashed border-emerald-300 transition-colors cursor-pointer"
                  title="デモ: 次のステップへ進める"
                >
                  ➔
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
