import React from 'react';
import { Sparkles, AlertTriangle, ShoppingCart, Bell, Building2, CheckCircle2, X, ArrowRight } from 'lucide-react';
import { ViewTab, Order, AlertItem } from '../types';

interface DailyDigestModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  alerts: AlertItem[];
  overdueCount: number;
  paidUnorderedCount: number;
  onNavigate: (tab: ViewTab) => void;
}

export const DailyDigestModal: React.FC<DailyDigestModalProps> = ({
  isOpen,
  onClose,
  orders,
  alerts,
  overdueCount,
  paidUnorderedCount,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const highAlertsCount = alerts.filter(a => a.severity === '高').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={onClose} />
      <div className="min-h-screen px-4 text-center flex items-center justify-center">
        <div className="inline-block w-full max-w-xl p-6 my-8 text-left align-middle transition-all transform bg-white shadow-2xl rounded-2xl border border-slate-200">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">本日のデイリーダイジェスト</h3>
                <p className="text-xs text-slate-500">最優先で確認・対応すべき重要タスクのサマリー</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => { onClose(); onNavigate('overdue'); }}
                className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 hover:bg-rose-100/70 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between text-rose-700 mb-1">
                  <span className="text-xs font-bold">納期超過案件</span>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-rose-900">{overdueCount} <span className="text-xs font-normal">件</span></div>
                <div className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 group-hover:underline">
                  <span>詳細を確認する</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => { onClose(); onNavigate('procurement'); }}
                className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 hover:bg-amber-100/70 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between text-amber-700 mb-1">
                  <span className="text-xs font-bold">入金済・未発注</span>
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-amber-900">{paidUnorderedCount} <span className="text-xs font-normal">品目</span></div>
                <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 group-hover:underline">
                  <span>発注管理を開く</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => { onClose(); onNavigate('alerts'); }}
                className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 hover:bg-indigo-100/70 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between text-indigo-700 mb-1">
                  <span className="text-xs font-bold">高重要度アラート</span>
                  <Bell className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-indigo-900">{highAlertsCount} <span className="text-xs font-normal">件</span></div>
                <div className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1 group-hover:underline">
                  <span>アラート一覧へ</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-700">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>AIシステム自動チェック完了</span>
              </div>
              <p className="leading-relaxed text-slate-600">
                楽楽販売APIとのリアルタイム同期および自動アラート診断が正常に完了しました。上記の中から優先度の高いタスク（特に納期超過および入金済未発注品）を先に処理することをお勧めします。
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
            >
              閉じる（本日の業務を開始）
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
