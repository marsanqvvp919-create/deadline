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
  ChevronRight,
  Eye,
  MapPin,
  Building,
  ShieldCheck,
  ChevronUp
} from 'lucide-react';

interface OrdersTableProps {
  orders: OrderRecord[];
  onOpenTracking: (order: OrderRecord) => void;
  onOpenDeliverySlip: (order: OrderRecord) => void;
  onAdvanceStatus?: (orderId: string) => void;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  onOpenTracking,
  onOpenDeliverySlip,
  onAdvanceStatus,
}) => {
  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-3">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-700">該当する注文データがありません</h3>
        <p className="text-xs text-slate-500 mt-1">
          検索キーワードや絞り込み条件（ステータス、空港、エリアなど）を変更してお試しください。
        </p>
      </div>
    );
  }

  const getStatusStepObj = (status: OrderStatus) => {
    return STATUS_STEPS.find((s) => s.key === status) || STATUS_STEPS[0];
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table Header summary */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
        <div>
          表示件数: <span className="font-bold text-slate-900">{orders.length}</span> 件
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span> FedEx・DHL 国際追跡
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500"></span> 佐川急便追跡
          </span>
        </div>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold tracking-wider">
              <th className="py-3 px-3.5 whitespace-nowrap">インボイス / 発注日</th>
              <th className="py-3 px-3.5">お届け先クリニック・院長</th>
              <th className="py-3 px-3.5">発注品目・数量</th>
              <th className="py-3 px-3.5 min-w-[200px]">配送ステータス（進捗）</th>
              <th className="py-3 px-3.5 whitespace-nowrap">追跡番号 (FedEx・DHL / 佐川)</th>
              <th className="py-3 px-3.5 whitespace-nowrap">到着予定 / 完了</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => {
              const stepObj = getStatusStepObj(order.status);
              const isDelivered = order.status === 'DELIVERED';

              return (
                <tr
                  key={order.id}
                  className="hover:bg-blue-50/40 transition-colors duration-100 group"
                >
                  {/* Invoice & Order ID */}
                  <td className="py-3.5 px-3.5 align-top whitespace-nowrap">
                    <button
                      onClick={() => onOpenDeliverySlip(order)}
                      className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      title="伝票・インボイスを表示"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {order.invoiceNo}
                    </button>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {order.orderDate.split(' ')[0]}
                    </div>
                    <span className="inline-block mt-1 text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {order.id}
                    </span>
                  </td>

                  {/* Clinic details */}
                  <td className="py-3.5 px-3.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">
                        {order.clinicName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-800 font-medium">院長: {order.doctor || '—'}</span>
                      {order.tel && <span className="text-slate-500">TEL: {order.tel}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                        <MapPin className="w-2.5 h-2.5 text-slate-600" />
                        {order.region}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                          order.hub === 'NRT'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                        title={order.hubName}
                      >
                        <Plane className="w-2.5 h-2.5" />
                        {order.hub}ハブ
                      </span>
                    </div>
                  </td>

                  {/* Product items */}
                  <td className="py-3.5 px-3.5 align-top">
                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="text-slate-800 font-medium text-xs leading-tight">
                          <span className="text-slate-900">{item.name}</span>
                          <span className="ml-1.5 font-bold text-blue-700">
                            × {item.qty} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Status & Progress Stepper */}
                  <td className="py-3.5 px-3.5 align-top">
                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border shadow-xs ${stepObj.bgLight} ${stepObj.textColor} ${stepObj.borderLight}`}
                      >
                        {isDelivered ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                        )}
                        {stepObj.label}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600">
                        STEP {stepObj.step + 1}/8
                      </span>
                    </div>

                    {/* Mini Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          isDelivered
                            ? 'bg-emerald-500'
                            : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                        }`}
                        style={{
                          width: `${Math.max(12, ((stepObj.step + 1) / 8) * 100)}%`,
                        }}
                      ></div>
                    </div>

                    <div className="text-[10px] text-slate-600 mt-1 line-clamp-1">
                      {stepObj.desc}
                    </div>
                  </td>

                  {/* Tracking numbers (FedEx & Sagawa) */}
                  <td className="py-3.5 px-3.5 align-top whitespace-nowrap">
                    <div className="space-y-1">
                      {/* FedEx */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-14 text-[10px] font-bold text-purple-700 bg-purple-50 px-1 py-0.5 rounded border border-purple-200 text-center">
                          {order.intlCarrier}
                        </span>
                        {order.fedexTracking ? (
                          <a
                            href={getFedexTrackingUrl(order.fedexTracking)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-purple-700 hover:text-purple-900 font-semibold hover:underline flex items-center gap-0.5"
                            title={`${order.intlCarrier}公式追跡サイトを新しいタブで開く`}
                          >
                            {order.fedexTracking}
                            <ExternalLink className="w-3 h-3 text-purple-400" />
                          </a>
                        ) : (
                          <span className="text-slate-400 font-mono">発番準備中</span>
                        )}
                      </div>

                      {/* Sagawa */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-14 text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1 py-0.5 rounded border border-cyan-200 text-center">
                          佐川急便
                        </span>
                        <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">{order.sagawaTracking || '—'}</span>
                      </div>
                    </div>
                  </td>

                  {/* Estimated Delivery / Actual Delivery */}
                  <td className="py-3.5 px-3.5 align-top whitespace-nowrap">
                    {isDelivered ? (
                      <div className="text-emerald-800">
                        <div className="font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          配達完了
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {order.actualDelivery}
                        </div>
                        <div className="text-[10px] text-slate-600">受領印: 確認済</div>
                      </div>
                    ) : (
                      <div className="text-slate-800">
                        <div className="font-medium flex items-center gap-1 text-blue-700">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          到着予定
                        </div>
                        <div className="font-bold text-xs mt-0.5 font-mono">
                          {order.estimatedDelivery}
                        </div>
                        <div className="text-[10px] text-slate-600">佐川急便</div>
                      </div>
                    )}
                  </td>

                  {/* Action buttons */}
                  <td className="py-3.5 px-3.5 align-top text-center whitespace-nowrap">
                    <div className="flex flex-col gap-1.5 items-center">
                      <button
                        onClick={() => onOpenTracking(order)}
                        className="w-full px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md flex items-center justify-center gap-1 transition-colors shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        追跡詳細
                      </button>

                      <button
                        onClick={() => onOpenDeliverySlip(order)}
                        className="w-full px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center justify-center gap-1 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        納品伝票
                      </button>

                      {onAdvanceStatus && !isDelivered && (
                        <button
                          onClick={() => onAdvanceStatus(order.id)}
                          className="w-full px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 rounded border border-dashed border-emerald-300 hover:border-emerald-500 flex items-center justify-center gap-0.5 transition-colors"
                          title="デモ検証用: 次のステータスに進める"
                        >
                          進捗更新 ➔
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
