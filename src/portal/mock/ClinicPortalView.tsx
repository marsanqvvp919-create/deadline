import React from 'react';
import {
  Clinic,
  OrderRecord,
  STATUS_STEPS,
  getFedexTrackingUrl,
  itemsLabel,
} from '../portalData';
import {
  Hospital,
  MapPin,
  Phone,
  User,
  Truck,
  Plane,
  Clock,
  CheckCircle2,
  FileText,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  Eye,
  AlertCircle
} from 'lucide-react';

interface ClinicPortalViewProps {
  clinic: Clinic;
  clinicOrders: OrderRecord[];
  onOpenTracking: (order: OrderRecord) => void;
  onOpenDeliverySlip: (order: OrderRecord) => void;
}

export const ClinicPortalView: React.FC<ClinicPortalViewProps> = ({
  clinic,
  clinicOrders,
  onOpenTracking,
  onOpenDeliverySlip,
}) => {
  const currentOrder = clinicOrders.find((o) => o.status !== 'DELIVERED') || clinicOrders[0];
  const pastOrders = clinicOrders.filter((o) => o.id !== currentOrder?.id);

  const currentStepObj = currentOrder
    ? STATUS_STEPS.find((s) => s.key === currentOrder.status) || STATUS_STEPS[0]
    : null;
  const isDelivered = currentOrder?.status === 'DELIVERED';

  return (
    <div className="space-y-6">
      {/* Clinic Header Profile Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600 shadow-xs">
              <Hospital className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {clinic.region}エリア
                </span>
                <span className="text-xs font-mono text-slate-500">
                  クリニックID: {clinic.id}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {clinic.hub}ハブ直行便
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {clinic.name}
              </h1>
              {clinic.nameEn && (
                <div className="text-xs font-mono text-slate-500">{clinic.nameEn}</div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 min-w-[260px]">
            <div className="flex items-center gap-1.5 text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500">院長:</span>
              <span className="font-bold text-slate-900">{clinic.doctor || '—'} 先生</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500">TEL:</span>
              <span className="font-mono text-slate-900">{clinic.tel}</span>
            </div>
            <div className="flex items-start gap-1.5 text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <span className="text-slate-600 leading-snug">
                〒{clinic.zip} {clinic.address}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Shipment Section */}
      {currentOrder && currentStepObj && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-sky-200 bg-slate-700 border border-slate-600 px-2 py-0.5 rounded">
                {isDelivered ? '最新のご注文' : '配送中のご注文'} (ご発注日 {currentOrder.orderDate.split(' ')[0]})
              </span>
              <h2 className="text-lg sm:text-xl font-bold mt-1 text-white">
                自院宛 美容医療薬剤 配送状況
              </h2>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">インボイス番号:</div>
              <div className="text-base font-bold font-mono text-sky-200">
                {currentOrder.invoiceNo}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Status Hero Card */}
            <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                    isDelivered ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                  }`}
                >
                  {isDelivered ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <Truck className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${currentStepObj.bgLight} ${currentStepObj.textColor} ${currentStepObj.borderLight}`}
                    >
                      {currentStepObj.label}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      STEP {currentStepObj.step + 1}/8
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                    {currentStepObj.desc}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    SG倉庫・韓国 ➔ {currentOrder.intlCarrier}国際空輸 ➔ {currentOrder.hubName} ➔ 国内配送
                  </p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs self-stretch md:self-auto text-left md:text-right">
                <div className="text-xs text-slate-500 font-medium">
                  {isDelivered ? '納品完了日時' : 'クリニック到着予定'}
                </div>
                <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                  {isDelivered ? currentOrder.actualDelivery : currentOrder.estimatedDelivery}
                </div>
                <div className="text-xs text-cyan-800 font-medium mt-0.5 flex items-center md:justify-end gap-1">
                  佐川急便 (午前中配送指定)
                </div>
              </div>
            </div>

            {/* Tracking Numbers & Direct Trackers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl">
                <div className="text-xs font-bold text-purple-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Plane className="w-4 h-4 text-purple-600" />
                    {currentOrder.intlCarrier} 国際航空便追跡
                  </span>
                  <span className="text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-mono">
                    {currentOrder.intlCarrier} Express
                  </span>
                </div>
                <div className="mt-2 text-lg font-black font-mono text-purple-950">
                  {currentOrder.fedexTracking}
                </div>
                <div className="mt-2 pt-2 border-t border-purple-200 flex items-center justify-between text-xs">
                  <span className="text-purple-700 text-[11px]">国際優先輸送</span>
                  <a
                    href={getFedexTrackingUrl(currentOrder.fedexTracking)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-800 font-bold hover:underline flex items-center gap-1"
                  >
                    {currentOrder.intlCarrier}公式サイトで追跡 <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="p-4 bg-cyan-50/70 border border-cyan-200 rounded-xl">
                <div className="text-xs font-bold text-cyan-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-cyan-700" />
                    {currentOrder.domesticCarrier} (国内配送)
                  </span>
                </div>
                <div className="mt-2 text-lg font-black font-mono text-cyan-950">
                  {currentOrder.sagawaTracking || '—'}
                </div>
                <div className="mt-2 pt-2 border-t border-cyan-200 flex items-center justify-between text-xs">
                  <span className="text-cyan-700 text-[11px]">{currentOrder.hubName}引継済</span>
                  <span className="text-amber-700 font-bold text-[11px]">{currentOrder.domesticNote}</span>
                </div>
              </div>
            </div>

            {/* Delivery Items & Actions */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    今回の納品予定品目 (合計: {currentOrder.totalQty} 箱/本)
                  </h4>
                  <p className="text-xs text-slate-500">
                    シンガポール調達ハブより直接出荷された医療用製剤
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenTracking(currentOrder)}
                    className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    全行程タイムライン詳細
                  </button>
                  <button
                    onClick={() => onOpenDeliverySlip(currentOrder)}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    納品伝票・インボイス表示
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {currentOrder.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{item.name}</span>
                    </div>
                    <div className="font-bold text-blue-700 text-sm">
                      数量: {item.qty} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Receiving Checklist Notice for Clinic Staff */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-1.5">
                <AlertCircle className="w-4.5 h-4.5 text-amber-600" />
                クリニック受付・看護部 荷受時の確認事項
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-700 leading-relaxed text-[11px]">
                <li>
                  <strong className="text-slate-900">納品検品:</strong>{' '}
                  外箱を開封し納品数量とバイアル破損がないことを確認の上、直ちに所定の保管場所へ収納してください。
                </li>
                <li>
                  <strong className="text-slate-900">受領印押印:</strong>{' '}
                  検品完了後、佐川急便端末および納品伝票へ受領印を押印してください。
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Past Delivery Records for this clinic */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <FileText className="w-4.5 h-4.5 text-blue-600" />
          当院宛 過去の納品伝票・発注履歴アーカイブ
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          過去のご注文（ご注文番号別）の伝票、受領記録を確認・再印刷できます。
        </p>

        {clinicOrders.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            過去の納品履歴はありません。
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {clinicOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-3.5 sm:p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-slate-900 text-sm" title={ord.items.map((it) => `${it.name} ×${it.qty}`).join('\n')}>
                      {itemsLabel(ord)}
                    </span>
                    <span className="font-mono text-slate-500">({ord.invoiceNo})</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      受領済
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2">
                    <span>発注日: {ord.orderDate}</span>
                    <span>•</span>
                    <span>納品日: {ord.actualDelivery || ord.estimatedDelivery}</span>
                    <span>•</span>
                    <span>数量: {ord.totalQty}箱</span>
                    <span>•</span>
                    <span className="font-mono text-purple-700">{ord.intlCarrier}: {ord.fedexTracking}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => onOpenTracking(ord)}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                  >
                    履歴詳細
                  </button>
                  <button
                    onClick={() => onOpenDeliverySlip(ord)}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3 text-slate-500" />
                    納品伝票
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
