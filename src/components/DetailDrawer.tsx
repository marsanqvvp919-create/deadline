import React, { useEffect } from 'react';
import { Order, OrderLine, AlertItem } from '../types';
import { formatDate, buildRakurakuUrl, getRemainingDaysInfo, isShippingOrFee } from '../utils';
import { getConfiguredUrls } from '../api';
import { CarrierTrackingWidget } from './CarrierTrackingWidget';
import {
  X,
  ExternalLink,
  Calendar,
  Truck,
  Building2,
  Package,
  User,
  AlertCircle,
  Clock,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Plane,
  Thermometer,
  FileWarning
} from 'lucide-react';

interface DetailDrawerProps {
  order: Order | null;
  selectedLineKey?: string | null;
  alerts: AlertItem[];
  isOpen: boolean;
  onClose: () => void;
  onOpenClinicStatus?: (clinicName: string) => void;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  order,
  selectedLineKey,
  alerts,
  isOpen,
  onClose,
  onOpenClinicStatus,
}) => {
  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !order) return null;

  const { rakurakuBaseUrl } = getConfiguredUrls();
  const rakurakuUrl = buildRakurakuUrl(rakurakuBaseUrl, order.orderId);

  // 関連アラートの抽出
  const relatedAlerts = alerts.filter(
    (a) => a.orderId === order.orderId && (!selectedLineKey || !a.lineKey || a.lineKey === selectedLineKey)
  );


  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 bg-slate-900 text-white flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {order.orderState}
                </span>
                <span className="text-xs text-slate-400">ステータス: {order.status}</span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
                {order.orderId}
              </h2>
              <div className="text-sm text-slate-300 mt-1 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <button
                  onClick={() => onOpenClinicStatus?.(order.customerName)}
                  className="hover:text-white hover:underline cursor-pointer flex items-center gap-1.5 transition font-medium"
                  title="この取引先の商品ステータス一覧を開く"
                >
                  <span>{order.customerName}</span>
                  <span className="text-[10px] bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                    <Package className="w-3 h-3 text-indigo-400" />
                    <span>商品ステータス</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={rakurakuUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="楽楽販売の該当レコードを開く"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                楽楽販売で開く
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Related Alerts */}
            {relatedAlerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  発生中のアラート ({relatedAlerts.length}件)
                </h3>
                <div className="space-y-2">
                  {relatedAlerts.map((alt, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5 ${
                        alt.severity === '高'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : alt.severity === '中'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-orange-50 border-orange-200 text-orange-900'
                      }`}
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          alt.severity === '高'
                            ? 'bg-rose-600 text-white'
                            : alt.severity === '中'
                            ? 'bg-amber-600 text-white'
                            : 'bg-orange-500 text-white'
                        }`}
                      >
                        {alt.severity}・{alt.ruleName}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">{alt.message}</p>
                        <div className="text-[11px] text-slate-500 mt-1 flex gap-3">
                          <span>期限: {formatDate(alt.dueDate)}</span>
                          {alt.daysOver > 0 && <span className="font-semibold text-rose-600">{alt.daysOver}日超過</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Basic Info Card */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-slate-600" />
                <span>伝票基本情報・配送ステータス</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400 block text-[11px]">受注日</span>
                  <span className="font-mono font-medium text-slate-800">{formatDate(order.orderDate)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">希望納期</span>
                  <span className="font-mono font-medium text-slate-800">{formatDate(order.requestedDate)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">納品完了日</span>
                  <span className="font-mono font-medium text-emerald-700">
                    {order.deliveredDate ? formatDate(order.deliveredDate) : '未完了（確認待ち）'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">担当営業</span>
                  <span className="font-medium text-slate-800">{order.salesRep || '未割当'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">入金ステータス</span>
                  <span className={`font-medium ${order.paymentStatus === '入金済' ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {order.paymentStatus || '未入金'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">販売金額合計</span>
                  <span className="font-mono font-bold text-slate-900">
                    {order.totalAmount !== undefined ? `¥${order.totalAmount.toLocaleString()}` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* 出荷管理・通関・クール情報セクション (101270連携) */}
            <div className="bg-indigo-50/40 rounded-xl p-4 border border-indigo-200/80 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-600" />
                  <span>出荷管理・通関ステータス詳細 (101270)</span>
                </h3>
                {order.isKantoNg && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    通関NG
                  </span>
                )}
                {order.isCoolMissing && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    クール手配漏れ
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400 block text-[11px]">出荷ID</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {order.shipmentId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">到着空港</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <Plane className="w-3 h-3 text-indigo-500" />
                    {order.arrivalAirport || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">輸入確認ステータス</span>
                  <span className={`font-bold ${order.importStatus === '要修正' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {order.importStatus || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">クール便申請</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-blue-500" />
                    {order.coolApplicationStatus || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">通関委任状 / 伝票</span>
                  <span className="font-medium text-slate-700">
                    委任状:{order.powerOfAttorneyStatus || '—'} / 伝票:{order.slipStatus || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">現在地</span>
                  <span className="text-slate-800 font-medium">
                    {order.currentLocation || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Lines Breakdown */}
            {(() => {
              const displayLines = order.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
              return (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-slate-600" />
                    <span>注文明細内訳 ({displayLines.length}件)</span>
                  </h3>

                  <div className="space-y-2.5">
                    {displayLines.map((line) => {
                      const isSelected = selectedLineKey && line.lineKey === selectedLineKey;
                      const remaining = getRemainingDaysInfo(line.latestDate);

                      return (
                        <div
                          key={line.lineKey}
                          className={`p-3.5 rounded-xl border text-xs transition ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/30'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono font-bold text-slate-900 text-sm">
                                {line.productName}
                              </span>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                商品ID: {line.productId} / 仕入先: {line.supplierName}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                line.stage === '出荷完了'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : line.stage === '一部出荷'
                                  ? 'bg-sky-100 text-sky-800'
                                  : line.stage === '発注済・入荷待ち'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {line.stage}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[11px]">数量</span>
                              <span className="font-bold text-slate-800">{line.quantity} 個</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">最長予定日</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-800">
                                  {formatDate(line.latestDate)}
                                </span>
                                {line.stage !== '出荷完了' && (
                                  <span
                                    className={`text-[10px] font-bold px-1 rounded ${
                                      remaining.isOverdue
                                        ? 'bg-rose-100 text-rose-700'
                                        : remaining.isUrgent
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {remaining.text}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">出荷状況</span>
                              <span className="font-medium text-slate-700 block">
                                出荷済: {line.shippedQty} / 残: {line.remainingQty}
                              </span>
                            </div>
                          </div>

                          {/* Carrier Tracking Widget per line */}
                          <div className="mt-3">
                            <CarrierTrackingWidget trackingNo={line.trackingNo} shippedDate={line.shippedDate} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>明細カードの工程は楽楽販売データから自動判定されています</span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              閉じる
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
