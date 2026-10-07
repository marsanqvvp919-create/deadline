import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import {
  Building,
  Truck,
  Search,
  CheckCircle2,
  Box,
  Plane,
  ArrowRight,
  Globe,
  MapPin,
  Clock,
  Sliders
} from 'lucide-react';

interface ArrivalTrackingViewProps {
  orders: Order[];
}

const STORAGE_SHIPMENT_TRACKING_KEY = 'nouki_shipment_tracking_v1';

export type TrackingStage = 'preparing' | 'shipping' | 'customs' | 'arrived';

export interface ShipmentFlowItem {
  orderId: string;
  customerName: string;
  salesRep: string;
  orderDate: string;
  warehouse: string;
  warehouseCode: 'korea' | 'singapore';
  status: string;
  lines: Array<{ productId: string; productName: string; quantity: number }>;
  trackingStage: TrackingStage;
}

export const ArrivalTrackingView: React.FC<ArrivalTrackingViewProps> = ({ orders }) => {
  const [flowWarehouseFilter, setFlowWarehouseFilter] = useState<'all' | 'korea' | 'singapore'>('all');
  const [flowStageFilter, setFlowStageFilter] = useState<string>('all');
  const [flowSearch, setFlowSearch] = useState<string>('');

  // Initialize shipment tracking stages for orders
  const [shipmentStages, setShipmentStages] = useState<Record<string, TrackingStage>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SHIPMENT_TRACKING_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const initial: Record<string, TrackingStage> = {};
    orders.slice(0, 50).forEach((ord, idx) => {
      const stages: TrackingStage[] = ['preparing', 'shipping', 'customs', 'arrived'];
      initial[ord.orderId] = stages[idx % stages.length];
    });
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SHIPMENT_TRACKING_KEY, JSON.stringify(shipmentStages));
    } catch {}
  }, [shipmentStages]);

  const advanceStage = (orderId: string) => {
    setShipmentStages((prev) => {
      const current = prev[orderId] || 'preparing';
      let next: TrackingStage = 'preparing';
      if (current === 'preparing') next = 'shipping';
      else if (current === 'shipping') next = 'customs';
      else if (current === 'customs') next = 'arrived';
      else next = 'arrived';
      return { ...prev, [orderId]: next };
    });
  };

  // Map orders to shipment flow items
  const shipmentFlows: ShipmentFlowItem[] = orders.slice(0, 50).map((ord, idx) => {
    const isKorea = idx % 2 === 0;
    const stage = shipmentStages[ord.orderId] || (idx % 4 === 0 ? 'arrived' : idx % 4 === 1 ? 'shipping' : idx % 4 === 2 ? 'customs' : 'preparing');
    return {
      orderId: ord.orderId,
      customerName: ord.customerName,
      salesRep: ord.salesRep,
      orderDate: ord.orderDate,
      warehouse: isKorea ? '韓国倉庫 (KR)' : 'シンガポール倉庫 (SIN)',
      warehouseCode: isKorea ? 'korea' : 'singapore',
      status: ord.orderState,
      lines: ord.lines.map(l => ({ productId: l.productId, productName: l.productName, quantity: l.quantity })),
      trackingStage: stage,
    };
  });

  const filteredShipmentFlows = shipmentFlows.filter((flow) => {
    if (flowWarehouseFilter !== 'all' && flow.warehouseCode !== flowWarehouseFilter) return false;
    if (flowStageFilter !== 'all' && flow.trackingStage !== flowStageFilter) return false;
    if (flowSearch.trim() !== '') {
      const q = flowSearch.toLowerCase();
      const matchOrder = flow.orderId.toLowerCase().includes(q) || flow.customerName.toLowerCase().includes(q);
      const matchItem = flow.lines.some(l => l.productName.toLowerCase().includes(q) || l.productId.toLowerCase().includes(q));
      if (!matchOrder && !matchItem) return false;
    }
    return true;
  });

  const totalCount = shipmentFlows.length;
  const preparingCount = shipmentFlows.filter(f => f.trackingStage === 'preparing').length;
  const transitCount = shipmentFlows.filter(f => f.trackingStage === 'shipping' || f.trackingStage === 'customs').length;
  const arrivedCount = shipmentFlows.filter(f => f.trackingStage === 'arrived').length;

  const stageMeta: Record<TrackingStage, { label: string; color: string; bg: string; icon: any }> = {
    preparing: { label: '出荷準備中', color: 'text-amber-700 border-amber-300 bg-amber-50', bg: 'bg-amber-500', icon: Box },
    shipping: { label: '国際輸送中', color: 'text-blue-700 border-blue-300 bg-blue-50', bg: 'bg-blue-500', icon: Plane },
    customs: { label: '通関・国内配送中', color: 'text-indigo-700 border-indigo-300 bg-indigo-50', bg: 'bg-indigo-500', icon: Truck },
    arrived: { label: 'クリニック到着完了', color: 'text-emerald-700 border-emerald-300 bg-emerald-50', bg: 'bg-emerald-500', icon: CheckCircle2 },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">
                  直近の流通トランザクション & 到着トラッキング
                </h1>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                韓国倉庫 (KR) およびシンガポール倉庫 (SIN) から各クリニックへの出荷、国際輸送、通関・国内配送を経て商品が到着するまでの全ステップをリアルタイムで追跡・管理します。
              </p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>追跡中総件数</span>
              <span className="w-2 h-2 rounded-full bg-blue-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-white">{totalCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">直近の流通トランザクション</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>出荷準備中</span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-amber-300">{preparingCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">倉庫内ピッキング・梱包</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>輸送・通関中</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-indigo-300">{transitCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">国際便・通関手続き中</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>クリニック到着完了</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-emerald-300">{arrivedCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">納品・検品完了済み</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-2">
            <Sliders className="w-4 h-4 text-indigo-600" /> 絞り込み:
          </div>
          <select
            value={flowWarehouseFilter}
            onChange={(e) => setFlowWarehouseFilter(e.target.value as any)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
          >
            <option value="all">全出荷元倉庫</option>
            <option value="korea">韓国倉庫 (KR)</option>
            <option value="singapore">シンガポール倉庫 (SIN)</option>
          </select>

          <select
            value={flowStageFilter}
            onChange={(e) => setFlowStageFilter(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
          >
            <option value="all">全配送ステージ</option>
            <option value="preparing">出荷準備中</option>
            <option value="shipping">国際輸送中</option>
            <option value="customs">通関・国内配送中</option>
            <option value="arrived">クリニック到着完了</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={flowSearch}
            onChange={(e) => setFlowSearch(e.target.value)}
            placeholder="伝票ID・クリニック名で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* Transactions / Tracking Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredShipmentFlows.map((flow) => {
          const meta = stageMeta[flow.trackingStage];
          const StageIcon = meta.icon;

          return (
            <div key={flow.orderId} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3.5 shadow-xs hover:shadow-md transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    {flow.orderId}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.color}`}>
                    <StageIcon className="w-3.5 h-3.5" /> {meta.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Building className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="truncate">{flow.customerName}</span>
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span>出荷元: <strong className="text-slate-800">{flow.warehouse}</strong></span>
                    <span>受注日: {flow.orderDate}</span>
                  </div>

                  {/* Products preview */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] text-slate-400 font-bold block">対象商品 ({flow.lines.length}品目):</span>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {flow.lines.map((l, i) => (
                        <div key={i} className="text-[11px] text-slate-600 flex justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          <span className="truncate">{l.productName}</span>
                          <span className="font-mono font-bold shrink-0 ml-2">x{l.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar and advance button */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>出荷準備 ➔ 輸送中 ➔ 通関 ➔ 到着</span>
                  <span className="font-bold text-slate-700">
                    {flow.trackingStage === 'preparing' && 'ステータス: 1/4'}
                    {flow.trackingStage === 'shipping' && 'ステータス: 2/4'}
                    {flow.trackingStage === 'customs' && 'ステータス: 3/4'}
                    {flow.trackingStage === 'arrived' && '到着完了 (4/4)'}
                  </span>
                </div>

                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                  <div className={`h-full transition-all duration-300 ${
                    flow.trackingStage === 'preparing' ? 'w-1/4 bg-amber-500' :
                    flow.trackingStage === 'shipping' ? 'w-2/4 bg-blue-500' :
                    flow.trackingStage === 'customs' ? 'w-3/4 bg-indigo-500' : 'w-full bg-emerald-500'
                  }`} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 font-medium">担当営業: {flow.salesRep}</span>
                  {flow.trackingStage !== 'arrived' ? (
                    <button
                      onClick={() => advanceStage(flow.orderId)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                    >
                      次の段階へ進む <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 到着確認済み
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredShipmentFlows.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs shadow-xs">
          条件に一致する流通トランザクションはありません。
        </div>
      )}
    </div>
  );
};
