import React from 'react';
import { OrderRecord } from '../portalData';
import {
  X,
  Printer,
  FileText,
  Plane,
  Truck,
  Building,
  Calendar
} from 'lucide-react';

interface DeliverySlipModalProps {
  order: OrderRecord | null;
  onClose: () => void;
}

export const DeliverySlipModal: React.FC<DeliverySlipModalProps> = ({
  order,
  onClose,
}) => {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Actions (Hidden on Print) */}
        <div className="bg-slate-800 text-white p-4 flex items-center justify-between border-b border-slate-700 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-300" />
            <span className="font-bold text-sm sm:text-base">
              美容医療薬剤 納品伝票 プレビュー
            </span>
            <span className="text-xs bg-slate-700 text-sky-200 border border-slate-600 px-2 py-0.5 rounded">
              {order.invoiceNo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-slate-600"
            >
              <Printer className="w-3.5 h-3.5" />
              印刷 / PDF保存
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Delivery Slip Document Container */}
        <div className="p-6 sm:p-10 overflow-y-auto bg-slate-50/50 print:bg-white print:p-0">
          <div className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm print:shadow-none print:border-0 print:p-4 text-slate-800">
            {/* Document Header */}
            <div className="border-b-2 border-slate-800 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold text-blue-700 tracking-widest uppercase">
                    GLOBAL SUPPLY CHAIN
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    美容医療薬剤 納品伝票
                  </h1>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    美容医療薬剤 COMMERCIAL DELIVERY SLIP
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs">
                  <div className="font-mono text-slate-500">
                    伝票番号 (Invoice No.):{' '}
                    <span className="font-bold text-slate-900 text-sm">{order.invoiceNo}</span>
                  </div>
                  <div className="font-mono text-slate-500 mt-0.5">
                    発注番号 (Order ID): {order.id}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    発行日: {order.orderDate.split(' ')[0]}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    ご注文番号: {order.invoiceNo}
                  </div>
                </div>
              </div>
            </div>

            {/* Consignee & Shipper Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-slate-200 text-xs">
              {/* Consignee (Clinic) */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 mb-1.5">
                  <Building className="w-4 h-4 text-blue-600" />
                  納品先 (Consignee)
                </div>
                <div className="text-sm font-bold text-slate-900">{order.clinicName}</div>
                {order.clinicNameEn && (
                  <div className="text-[11px] font-mono text-slate-500">{order.clinicNameEn}</div>
                )}
                <div className="mt-1.5 text-slate-700">
                  <span className="font-medium">院長 / 受取責任者:</span>{' '}
                  <span className="font-bold">{order.doctor || '担当医'} 殿</span>
                </div>
                <div className="mt-1 text-slate-600">
                  〒{order.zip} {order.address}
                </div>
                <div className="mt-1 text-slate-600 font-mono">TEL: {order.tel}</div>
              </div>

              {/* Shipper & Carriers */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 mb-1.5">
                  <Plane className="w-4 h-4 text-purple-600" />
                  発送元 (Shipper) & 輸送業者
                </div>
                <div className="font-bold text-slate-900">
                  株式会社Number1
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-700 font-medium">{order.intlCarrier} 国際航空便:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {order.fedexTracking || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-700 font-medium">佐川急便 送り状:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {order.sagawaTracking || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">輸入通関空港:</span>
                    <span className="font-medium text-slate-800">{order.hubName}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Item Table */}
            <div className="py-4">
              <div className="text-xs font-bold text-slate-800 mb-2">
                ■ 納品品目明細 (Shipment Items)
              </div>
              <table className="w-full text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <th className="py-2 px-2.5 text-center w-10">No.</th>
                    <th className="py-2 px-2.5 text-left">品名</th>
                    <th className="py-2 px-2.5 text-center whitespace-nowrap w-24">数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 text-center text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 font-bold text-slate-900">
                        {it.name}
                      </td>
                      <td className="py-2 px-2.5 text-center font-bold text-slate-900 text-sm">
                        {it.qty} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-300">
                    <td colSpan={2} className="py-2 px-2.5 text-right text-slate-700">
                      合計納品数量:
                    </td>
                    <td className="py-2 px-2.5 text-center text-blue-700 text-sm font-black">
                      {order.totalQty} 箱
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signatures & Seal Section */}
            <div className="grid grid-cols-2 gap-4 pt-4 mt-2 border-t-2 border-slate-800 text-xs">
              <div className="border border-slate-300 rounded p-3 text-center">
                <div className="font-bold text-slate-700 mb-1">出荷検品者印</div>
                <div className="w-16 h-16 border border-dashed border-slate-300 rounded-full mx-auto flex items-center justify-center font-bold text-red-600 text-xs">
                  検品済
                </div>
                <div className="text-[10px] text-slate-400 mt-1">出荷責任者サイン済</div>
              </div>

              <div className="border border-slate-300 rounded p-3 text-center">
                <div className="font-bold text-slate-700 mb-1">クリニック受領印 (Consignee Seal)</div>
                <div className="w-16 h-16 border border-dashed border-slate-300 rounded-full mx-auto flex items-center justify-center font-bold text-slate-400 text-xs">
                  受領印
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  受取責任者: {order.doctor || '担当医'} 殿
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer (Hidden on print) */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between print:hidden">
          <span className="text-xs text-slate-500">
            電子伝票照会システム (Past Delivery Voucher Archive)
          </span>
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
