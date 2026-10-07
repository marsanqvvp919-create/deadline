import React, { useState, useMemo } from 'react';
import { ShipmentItem, Order } from '../types';
import { getLocalShipments, saveLocalShipments } from '../api';
import {
  FileWarning,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Plane,
  Building,
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Download,
  AlertCircle
} from 'lucide-react';

interface UnmatchedCustomsViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order) => void;
}

export const UnmatchedCustomsView: React.FC<UnmatchedCustomsViewProps> = ({
  orders,
  onSelectOrder,
}) => {
  const [shipments, setShipments] = useState<ShipmentItem[]>(() => getLocalShipments());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIssueType, setSelectedIssueType] = useState<string>('all');
  const [selectedAirport, setSelectedAirport] = useState<string>('all');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 未照合・書類不備の判定
  const unmatchedList = useMemo(() => {
    return shipments
      .map((s) => {
        const issues: string[] = [];
        const matchingOrder = orders.find((o) => o.orderId === s.orderId);

        if (!matchingOrder) {
          issues.push('受注未照合');
        }
        if (s.powerOfAttorneyStatus && (s.powerOfAttorneyStatus.includes('未') || s.powerOfAttorneyStatus.includes('不備') || s.powerOfAttorneyStatus === '未受領')) {
          issues.push('委任状未受領');
        }
        if (s.slipStatus && (s.slipStatus.includes('未') || s.slipStatus.includes('不備') || s.slipStatus === '未作成')) {
          issues.push('伝票不備');
        }
        if (s.importStatus && (s.importStatus.includes('修正') || s.importStatus.includes('不備') || s.importStatus === '要修正')) {
          issues.push('輸入確認要修正');
        }
        if (s.isCoolMissing || s.coolApplicationStatus === '申請漏れ') {
          issues.push('クール申請漏れ');
        }
        if (!s.trackingNo || s.trackingNo.trim() === '') {
          issues.push('送り状未登録');
        }

        return {
          shipment: s,
          issues,
          matchingOrder,
        };
      })
      .filter((item) => {
        // 不備が1つ以上ある案件
        if (item.issues.length === 0) return false;

        if (selectedIssueType !== 'all') {
          if (!item.issues.some((i) => i.includes(selectedIssueType))) {
            return false;
          }
        }

        if (selectedAirport !== 'all') {
          if (!item.shipment.arrivalAirport.includes(selectedAirport)) {
            return false;
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const s = item.shipment;
          const matches =
            s.shipmentId.toLowerCase().includes(q) ||
            s.orderId.toLowerCase().includes(q) ||
            s.customerName.toLowerCase().includes(q) ||
            s.productName.toLowerCase().includes(q) ||
            s.trackingNo.toLowerCase().includes(q);
          if (!matches) return false;
        }

        return true;
      });
  }, [shipments, orders, selectedIssueType, selectedAirport, searchQuery]);

  // KPIs
  const totalIssuesCount = unmatchedList.length;
  const missingOrderCount = unmatchedList.filter((i) => i.issues.includes('受注未照合')).length;
  const poaMissingCount = unmatchedList.filter((i) => i.issues.includes('委任状未受領')).length;
  const importCorrectionCount = unmatchedList.filter((i) => i.issues.includes('輸入確認要修正')).length;

  const handleResolveIssue = (shipmentId: string, issueType: string) => {
    const updated = shipments.map((s) => {
      if (s.shipmentId === shipmentId) {
        let newPoa = s.powerOfAttorneyStatus;
        let newSlip = s.slipStatus;
        let newImport = s.importStatus;
        let newCool = s.coolApplicationStatus;
        let newCustoms = s.customsStatus;

        if (issueType.includes('委任状')) newPoa = '受領済';
        if (issueType.includes('伝票')) newSlip = '作成済';
        if (issueType.includes('輸入確認')) newImport = '承認済';
        if (issueType.includes('クール')) newCool = '申請済';

        if (newPoa === '受領済' && newSlip === '作成済' && newImport === '承認済') {
          newCustoms = '税関審査中 (書類完備)';
        }

        return {
          ...s,
          powerOfAttorneyStatus: newPoa,
          slipStatus: newSlip,
          importStatus: newImport,
          coolApplicationStatus: newCool,
          customsStatus: newCustoms,
          memo: `${s.memo || ''} 【済: ${issueType}解消更新】`,
        };
      }
      return s;
    });

    setShipments(updated);
    saveLocalShipments(updated);
    setSuccessToast(`出荷ID ${shipmentId} の不備（${issueType}）を解消済みに更新しました。`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleExportCsv = () => {
    const headers = ['出荷ID', '受注ID', 'クリニック名', '商品名', '不備内容', '到着空港', '輸入確認', '委任状', '伝票'];
    const rows = unmatchedList.map(({ shipment: s, issues }) => [
      s.shipmentId,
      s.orderId,
      s.customerName,
      s.productName,
      issues.join(' / '),
      s.arrivalAirport,
      s.importStatus,
      s.powerOfAttorneyStatus,
      s.slipStatus,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `未照合・書類不備一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Synthetic Order fallback
  const getClickableOrder = (s: ShipmentItem, matching?: Order): Order => {
    if (matching) return matching;
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

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Toast */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-950 via-slate-900 to-amber-950 border border-orange-800/60 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-lg font-black">
              <FileWarning className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">未照合・書類不備案件一覧</h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/40 font-mono">
                  通関書類・突合不備管理
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 font-mono">
                  要対応: {totalIssuesCount} 件
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                出荷管理（101270）データのうち、委任状未受領・伝票未作成・輸入確認要修正・または受注データ（101248）との未紐付けが発生している案件です。行をクリックすると案件詳細が表示されます。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-600 text-slate-200 text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>不備CSV出力</span>
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-orange-900/40">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-orange-300 block mb-1">書類不備・未照合 総数</span>
            <span className="text-2xl font-extrabold font-mono text-orange-400">{totalIssuesCount}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">要アクション</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-rose-300 block mb-1">委任状・伝票不備</span>
            <span className="text-2xl font-extrabold font-mono text-rose-400">{poaMissingCount}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">未受領 / 未作成</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-amber-300 block mb-1">輸入確認 要修正</span>
            <span className="text-2xl font-extrabold font-mono text-amber-400">{importCorrectionCount}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">書類再提出要請</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <span className="text-xs text-slate-300 block mb-1">受注未紐付け</span>
            <span className="text-2xl font-extrabold font-mono text-slate-200">{missingOrderCount}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">出荷先行・突合待ち</span>
          </div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-[300px]">
            {/* Search */}
            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="出荷ID・受注ID・クリニック・追跡番号"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            {/* Issue Type Filter */}
            <select
              value={selectedIssueType}
              onChange={(e) => setSelectedIssueType(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">不備種別: すべて</option>
              <option value="委任状">委任状未受領</option>
              <option value="伝票">伝票不備</option>
              <option value="輸入確認">輸入確認要修正</option>
              <option value="クール">クール申請漏れ</option>
              <option value="受注未照合">受注未照合</option>
            </select>

            {/* Airport Filter */}
            <select
              value={selectedAirport}
              onChange={(e) => setSelectedAirport(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">到着空港: すべて</option>
              <option value="KIX">関西国際空港 (KIX)</option>
              <option value="NRT">成田国際空港 (NRT)</option>
              <option value="HND">羽田空港 (HND)</option>
            </select>
          </div>

          <span className="text-xs font-bold text-slate-500 font-mono">
            表示中: {unmatchedList.length} 件
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">出荷ID / 受注ID</th>
                <th className="py-3 px-4">クリニック名 / 商品名</th>
                <th className="py-3 px-3">不備内容</th>
                <th className="py-3 px-3">到着空港</th>
                <th className="py-3 px-3 text-center">輸入確認</th>
                <th className="py-3 px-3 text-center">委任状 / 伝票</th>
                <th className="py-3 px-4">現在地</th>
                <th className="py-3 px-3 text-right">迅速対応</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {unmatchedList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    現在、書類不備・未照合の案件はありません（すべて正常に完備されています）
                  </td>
                </tr>
              ) : (
                unmatchedList.map(({ shipment: item, issues, matchingOrder }) => (
                  <tr
                    key={item.shipmentId}
                    onClick={() => onSelectOrder?.(getClickableOrder(item, matchingOrder))}
                    className="hover:bg-orange-50/40 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 font-mono block">
                        {item.shipmentId}
                      </span>
                      <span className="text-[11px] text-blue-600 font-mono">
                        {item.orderId}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{item.customerName}</span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                        <span>{item.productName}</span>
                        <span className="font-bold font-mono text-slate-700">x{item.quantity}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {issues.map((iss, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              iss.includes('委任状')
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : iss.includes('要修正')
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : iss.includes('未照合')
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-orange-50 text-orange-700 border-orange-200'
                            }`}
                          >
                            {iss}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {item.arrivalAirport}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.importStatus === '承認済'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.importStatus === '要修正'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.importStatus}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center text-[11px]">
                      <span className="block font-medium text-slate-700">
                        委: {item.powerOfAttorneyStatus}
                      </span>
                      <span className="block text-slate-500">
                        伝: {item.slipStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-800 text-[11px]">
                      {item.currentLocation}
                    </td>

                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleResolveIssue(item.shipmentId, issues[0] || '書類完備')}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-bold shadow-2xs transition cursor-pointer"
                          title="書類完備に更新"
                        >
                          解消済にする
                        </button>
                        <button
                          onClick={() => onSelectOrder?.(getClickableOrder(item, matchingOrder))}
                          className="p-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition"
                          title="案件詳細を開く"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
