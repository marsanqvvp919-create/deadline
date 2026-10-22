import React from 'react';
import {
  Plane,
  Truck,
  CheckCircle2,
  Package,
  ShieldCheck,
  Building,
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  MapPin
} from 'lucide-react';
import { OrderRecord, OrderStatus } from '../portalData';
import { portalGroupName } from '../portalData';

interface VisualLogisticsMapProps {
  orders: OrderRecord[];
  activeStatusFilter: OrderStatus | 'ALL';
  onSelectStatusFilter: (status: OrderStatus | 'ALL') => void;
  hubFilter: 'ALL' | 'NRT' | 'KIX';
  onSelectHubFilter: (hub: 'ALL' | 'NRT' | 'KIX') => void;
  isCurrentBatch: boolean;
}

export const VisualLogisticsMap: React.FC<VisualLogisticsMapProps> = ({
  orders,
  activeStatusFilter,
  onSelectStatusFilter,
  hubFilter,
  onSelectHubFilter,
  isCurrentBatch,
}) => {
  // Aggregate counts for the 5 major waypoints
  const counts = {
    singapore: orders.filter((o) => o.status === 'ORDERED' || o.status === 'PREPARING').length,
    fedexFlight: orders.filter((o) => o.status === 'FEDEX_DISPATCHED' || o.status === 'IN_TRANSIT_INTL').length,
    customsHub: orders.filter((o) => o.status === 'CUSTOMS_CLEARANCE').length,
    sagawaCool: orders.filter((o) => o.status === 'SAGAWA_HANDOVER' || o.status === 'OUT_FOR_DELIVERY').length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
  };

  const nrtOrders = orders.filter((o) => o.hub === 'NRT');
  const kixOrders = orders.filter((o) => o.hub === 'KIX');
  const total = orders.length;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-xl border border-indigo-900/60 mb-6 overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 pb-4 border-b border-indigo-800/60">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-cyan-500/30">
              <Sparkles className="w-3 h-3" /> 美容医療薬剤 ご注文ごとの配送
            </span>
            <span className="text-xs text-indigo-300">
              ご注文ごとに個別出荷・成田着
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mt-1.5 flex items-center gap-2">
            <span>美容医療薬剤 荷物追跡ビジュアル・ルートマップ</span>
          </h3>
        </div>

        {/* Airport Hub Filter Switcher */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] hidden lg:inline">到着空港分岐:</span>
          <div className="inline-flex rounded-lg bg-slate-800/90 p-1 border border-indigo-700/60">
            <button
              onClick={() => onSelectHubFilter('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                hubFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              全空港 ({total}件)
            </button>
            <button
              onClick={() => onSelectHubFilter('NRT')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                hubFilter === 'NRT'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="成田国際空港経由: 北海道・東北・関東・中部"
            >
              成田 NRT ({nrtOrders.length}件)
            </button>
            <button
              onClick={() => onSelectHubFilter('KIX')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                hubFilter === 'KIX'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="関西国際空港経由: 近畿・中国・四国・九州・沖縄"
            >
              関西 KIX ({kixOrders.length}件)
            </button>
          </div>

          {activeStatusFilter !== 'ALL' && (
            <button
              onClick={() => onSelectStatusFilter('ALL')}
              className="text-xs text-cyan-300 hover:text-white font-medium underline cursor-pointer ml-1"
            >
              全件表示
            </button>
          )}
        </div>
      </div>

      {/* 5-Station Interactive Visual Journey Flow */}
      <div className="mt-5 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
          {/* Station 1: Singapore Hub */}
          <div
            onClick={() => onSelectStatusFilter(activeStatusFilter === 'PREPARING' ? 'ALL' : 'PREPARING')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
              activeStatusFilter === 'ORDERED' || activeStatusFilter === 'PREPARING'
                ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/50'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700">
                POINT 1
              </span>
              <span className="font-mono text-sm font-bold text-amber-300">
                {counts.singapore} 件
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">🇸🇬 シンガポール調達ハブ</div>
                <div className="text-[10px] text-slate-400">ご注文ごと 検品</div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 leading-tight">
              美容医療薬剤 製品検品・梱包完了
            </div>
          </div>

          {/* Station 2: FedEx Flight */}
          <div
            onClick={() => onSelectStatusFilter(activeStatusFilter === 'IN_TRANSIT_INTL' ? 'ALL' : 'IN_TRANSIT_INTL')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
              activeStatusFilter === 'FEDEX_DISPATCHED' || activeStatusFilter === 'IN_TRANSIT_INTL'
                ? 'bg-purple-950/80 border-purple-400 ring-2 ring-purple-400/50'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-300 bg-purple-900/60 px-2 py-0.5 rounded border border-purple-700">
                POINT 2
              </span>
              <span className="font-mono text-sm font-bold text-purple-300">
                {counts.fedexFlight} 件
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 border border-purple-500/30">
                <Plane className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">✈️ FedEx・DHL 国際航空輸送</div>
                <div className="text-[10px] text-purple-300">SG・韓国 ➔ 成田 (NRT)</div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 leading-tight">
              チャンギ(SIN)より成田便・関空便に分かれ、専用貨物便で航空輸送
            </div>
          </div>

          {/* Station 3: Customs Hub & Airport Split */}
          <div
            onClick={() => onSelectStatusFilter(activeStatusFilter === 'CUSTOMS_CLEARANCE' ? 'ALL' : 'CUSTOMS_CLEARANCE')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
              activeStatusFilter === 'CUSTOMS_CLEARANCE'
                ? 'bg-blue-950/80 border-blue-400 ring-2 ring-blue-400/50'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700">
                POINT 3 (空港分岐)
              </span>
              <span className="font-mono text-sm font-bold text-blue-300">
                {counts.customsHub} 件
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 border border-blue-500/30">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">🛬 成田(NRT) / 関西(KIX)</div>
                <div className="text-[10px] text-cyan-300">各空港 保税薬事通関</div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 leading-tight">
              成田 (NRT) 着 {nrtOrders.length}件。輸入確認（薬監）・輸入通関
            </div>
          </div>

          {/* Station 4: Sagawa Cool Express */}
          <div
            onClick={() => onSelectStatusFilter(activeStatusFilter === 'OUT_FOR_DELIVERY' ? 'ALL' : 'OUT_FOR_DELIVERY')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
              activeStatusFilter === 'SAGAWA_HANDOVER' || activeStatusFilter === 'OUT_FOR_DELIVERY'
                ? 'bg-cyan-950/80 border-cyan-400 ring-2 ring-cyan-400/50'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-300 bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-700">
                POINT 4
              </span>
              <span className="font-mono text-sm font-bold text-cyan-300">
                {counts.sagawaCool} 件
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/30">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">佐川急便</div>
                <div className="text-[10px] text-slate-400">成田・関空拠点から発送</div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 leading-tight">
              各空港営業所より佐川急便引継ぎ。各クリニックエリアへ配送
            </div>
          </div>

          {/* Station 5: Delivered Clinics */}
          <div
            onClick={() => onSelectStatusFilter(activeStatusFilter === 'DELIVERED' ? 'ALL' : 'DELIVERED')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
              activeStatusFilter === 'DELIVERED'
                ? 'bg-emerald-950/80 border-emerald-400 ring-2 ring-emerald-400/50'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700">
                FINAL
              </span>
              <span className="font-mono text-sm font-bold text-emerald-300">
                {counts.delivered} 件
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">🏥 各クリニック納品</div>
                <div className="text-[10px] text-emerald-300">{portalGroupName()} 検品受領</div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] text-slate-300 leading-tight">
              {portalGroupName()} 受付にて受領完了
            </div>
          </div>
        </div>

        {/* Airport Branch Infographic Bar */}
        <div className="mt-4 pt-3 border-t border-indigo-800/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-blue-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              <span className="font-bold text-blue-200">東日本グループ (成田 NRT便):</span>
              <span className="text-slate-400 text-[11px]">北海道・東北・関東・中部</span>
            </div>
            <span className="font-mono font-bold text-blue-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
              DHL・FedEx
            </span>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-indigo-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              <span className="font-bold text-indigo-200">西日本グループ (関西 KIX便):</span>
              <span className="text-slate-400 text-[11px]">近畿・中国・四国・九州・沖縄</span>
            </div>
            <span className="font-mono font-bold text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              0院（関東のみ）
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
