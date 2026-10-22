import React, { useState } from 'react';
import { yen } from '../portalData';
import {
  OrderRecord,
  STATUS_STEPS,
  OrderStatus,
  getFedexTrackingUrl,
} from '../portalData';
import {
  X,
  Plane,
  Truck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  MapPin,
  Building,
  User,
  Phone,
  PackageCheck,
  AlertCircle,
  Calendar,
  Share2
} from 'lucide-react';

interface TrackingTimelineModalProps {
  order: OrderRecord | null;
  onClose: () => void;
}

export const TrackingTimelineModal: React.FC<TrackingTimelineModalProps> = ({
  order,
  onClose,
}) => {
  const [copiedFedex, setCopiedFedex] = useState(false);
  const [copiedSagawa, setCopiedSagawa] = useState(false);

  if (!order) return null;

  const currentStepObj = STATUS_STEPS.find((s) => s.key === order.status) || STATUS_STEPS[0];
  const isDelivered = order.status === 'DELIVERED';

  const copyToClipboard = (text: string, type: 'fedex' | 'sagawa') => {
    navigator.clipboard.writeText(text);
    if (type === 'fedex') {
      setCopiedFedex(true);
      setTimeout(() => setCopiedFedex(false), 2000);
    } else {
      setCopiedSagawa(true);
      setTimeout(() => setCopiedSagawa(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-start justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {order.batchName}
              </span>
              <span className="text-xs font-mono text-slate-400">
                管理番号: {order.id}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white mt-1 flex items-center gap-2">
              {order.clinicName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
              <span>院長: {order.doctor || '担当医'}</span>
              <span>•</span>
              <span>インボイス: {order.invoiceNo}</span>
              <span>•</span>
              <span>発注日: {order.orderDate}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Current Status Highlights Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50 p-4 rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                  isDelivered ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {isDelivered ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Truck className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                  <span>現在ステータス (STEP {currentStepObj.step + 1}/8)</span>
                  {!isDelivered && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  )}
                </div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {currentStepObj.label}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {currentStepObj.desc}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-left sm:text-right shrink-0 bg-white/70 sm:bg-transparent p-2.5 sm:p-0 rounded-lg border border-blue-100 sm:border-0">
                <div className="text-xs text-slate-600 font-medium">
                  {isDelivered ? '納品完了日時' : 'お届け予定'}
                </div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  {isDelivered ? order.actualDelivery : order.estimatedDelivery}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {isDelivered ? '配送完了' : '佐川急便 (時間指定)'}
                </div>
              </div>
            </div>
          </div>

          {/* Tracking Numbers & Official Tracking Links Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* FedEx Card */}
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                <span className="flex items-center gap-1.5">
                  <Plane className="w-4 h-4 text-purple-700" />
                  {order.intlCarrier} 国際航空輸送
                </span>
                <span className="text-[10px] bg-purple-200/80 text-purple-900 px-1.5 py-0.5 rounded font-mono">
                  SIN ➔ {order.hub}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="font-mono text-base font-bold text-purple-950 tracking-wider">
                  {order.fedexTracking || '発番準備中'}
                </div>
                {order.fedexTracking && (
                  <button
                    onClick={() => copyToClipboard(order.fedexTracking, 'fedex')}
                    className="p-1 text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded transition-colors"
                    title="追跡番号をコピー"
                  >
                    {copiedFedex ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-purple-200/70 flex items-center justify-between text-xs">
                <span className="text-purple-700 text-[11px]">シンガポール発 国際貨物</span>
                {order.fedexTracking && (
                  <a
                    href={getFedexTrackingUrl(order.fedexTracking)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 hover:underline"
                  >
                    {order.intlCarrier}公式追跡 ➔
                  </a>
                )}
              </div>
            </div>

            {/* Sagawa Card */}
            <div className="p-3.5 bg-cyan-50/70 border border-cyan-200 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-900">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-cyan-700" />
                  {order.domesticCarrier} (国内配送)
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="font-mono text-base font-bold text-cyan-950 tracking-wider">
                  {order.sagawaTracking || '—'}
                </div>
                
              </div>
              <div className="mt-2 pt-2 border-t border-cyan-200/70 flex items-center justify-between text-xs">
                <span className="text-cyan-700 text-[11px]">
                  {order.hubName}引継ぎ
                </span>
                <span className="text-amber-700 font-bold text-[11px]">{order.domesticNote}</span>
              </div>
            </div>
          </div>

          {/* Delivery Items Detail */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100/70 px-4 py-2.5 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>同梱商品明細 (計 {order.totalQty} 箱・{yen(order.amountTotal)})</span>
              <span className="text-[11px] font-normal text-slate-500">シンガポール供給ハブ梱包</span>
            </div>
            <div className="divide-y divide-slate-100 p-3 bg-white space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 first:pt-0">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{item.name}</div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {yen(item.unitPrice)} × {item.qty} = <b className="text-slate-800">{yen(item.amount)}</b>
                    </span>
                    <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                      数量: {item.qty} {item.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Destination Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
            <div className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-slate-600" />
              配送先クリニック情報
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
              <div>
                <span className="text-slate-500">クリニック名:</span>{' '}
                <span className="font-bold text-slate-900">{order.clinicName}</span>
              </div>
              <div>
                <span className="text-slate-500">院長 / 受取人:</span>{' '}
                <span className="font-bold text-slate-900">{order.doctor} 殿</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">納品先住所:</span>{' '}
                <span className="font-medium text-slate-900">
                  〒{order.zip} {order.address}
                </span>
              </div>
              <div>
                <span className="text-slate-500">連絡先電話:</span>{' '}
                <span className="font-mono text-slate-900">{order.tel}</span>
              </div>
              <div>
                <span className="text-slate-500">担当経由空港:</span>{' '}
                <span className="font-medium text-slate-900">{order.hubName}</span>
              </div>
            </div>
          </div>

          {/* Detailed Timeline of Events */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              国際・国内 追跡タイムライン（通過履歴）
            </h3>

            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {order.timeline.map((ev, i) => {
                const isLatest = i === 0;
                return (
                  <div key={i} className="relative group">
                    {/* Circle marker */}
                    <div
                      className={`absolute -left-6 sm:-left-8 top-1 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
                        isLatest
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-300 text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white"></span>
                    </div>

                    {/* Timeline card */}
                    <div
                      className={`p-3.5 rounded-xl border text-xs transition-all ${
                        isLatest
                          ? 'bg-blue-50/50 border-blue-200 shadow-xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 text-sm">
                          {ev.title}
                        </span>
                        <span className="font-mono text-slate-500 text-[11px]">
                          {ev.time}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-600">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {ev.location}
                        </span>
                        <span>•</span>
                        <span className="text-slate-500">取扱: {ev.operator}</span>
                      </div>

                      <p className="mt-1.5 text-slate-600 text-xs leading-relaxed">
                        {ev.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            ※ 国際空輸: FedEx / DHL Express / 国内配送: 佐川急便など
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
