import React from 'react';
import {
  STATUS_STEPS,
  OrderStatus,
  OrderRecord,
  BatchInfo
} from '../portalData';
import {
  Plane,
  Truck,
  CheckCircle2,
  Clock,
  PackageCheck,
  Building,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface LogisticsPipelineHeroProps {
  orders: OrderRecord[];
  activeStatusFilter: OrderStatus | 'ALL';
  onSelectStatusFilter: (status: OrderStatus | 'ALL') => void;
  currentBatch: BatchInfo;
}

export const LogisticsPipelineHero: React.FC<LogisticsPipelineHeroProps> = ({
  orders,
  activeStatusFilter,
  onSelectStatusFilter,
  currentBatch,
}) => {
  // Count by status
  const statusCounts = STATUS_STEPS.reduce((acc, step) => {
    acc[step.key] = orders.filter((o) => o.status === step.key).length;
    return acc;
  }, {} as Record<OrderStatus, number>);

  const totalOrders = orders.length;
  const deliveredCount = statusCounts['DELIVERED'] || 0;
  const deliveringCount = statusCounts['OUT_FOR_DELIVERY'] || 0;
  const inTransitCount =
    (statusCounts['IN_TRANSIT_INTL'] || 0) +
    (statusCounts['CUSTOMS_CLEARANCE'] || 0) +
    (statusCounts['SAGAWA_HANDOVER'] || 0) +
    (statusCounts['FEDEX_DISPATCHED'] || 0);
  const preparingCount = (statusCounts['PREPARING'] || 0) + (statusCounts['ORDERED'] || 0);
  const totalUnits = orders.reduce((sum, o) => sum + o.totalQty, 0);

  const getStepIcon = (key: OrderStatus) => {
    switch (key) {
      case 'ORDERED':
        return <Building className="w-3.5 h-3.5" />;
      case 'PREPARING':
        return <PackageCheck className="w-3.5 h-3.5" />;
      case 'FEDEX_DISPATCHED':
      case 'IN_TRANSIT_INTL':
        return <Plane className="w-3.5 h-3.5" />;
      case 'CUSTOMS_CLEARANCE':
        return <ShieldCheck className="w-3.5 h-3.5" />;
      case 'SAGAWA_HANDOVER':
      case 'OUT_FOR_DELIVERY':
        return <Truck className="w-3.5 h-3.5" />;
      case 'DELIVERED':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-6">
      {/* Batch Title & KPI Stat Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {currentBatch.status === 'IN_PROGRESS' ? '配送進行中便' : '過去配送完了便'}
            </span>
            <span className="text-xs text-slate-500">発注日: {currentBatch.orderDate}</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mt-1">
            {currentBatch.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentBatch.description}
          </p>
        </div>

        {/* KPI Mini Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/80">
            <div className="text-[11px] font-medium text-slate-500">全クリニック発注</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {totalOrders} <span className="text-xs font-normal text-slate-500">件 / {totalUnits}点</span>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-200/80">
            <div className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 配達完了
            </div>
            <div className="text-lg font-bold text-emerald-700 mt-0.5">
              {deliveredCount} <span className="text-xs font-normal text-emerald-600">件 ({totalOrders ? Math.round((deliveredCount / totalOrders) * 100) : 0}%)</span>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200/80">
            <div className="text-[11px] font-medium text-blue-700 flex items-center gap-1">
              <Truck className="w-3 h-3 text-blue-600" /> 国内配達中
            </div>
            <div className="text-lg font-bold text-blue-700 mt-0.5">
              {deliveringCount} <span className="text-xs font-normal text-blue-600">件</span>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-200/80">
            <div className="text-[11px] font-medium text-purple-800 flex items-center gap-1">
              <Plane className="w-3 h-3 text-purple-600" /> 国際輸送・通関
            </div>
            <div className="text-lg font-bold text-purple-700 mt-0.5">
              {Math.max(0, totalOrders - deliveredCount - deliveringCount)} <span className="text-xs font-normal text-purple-600">件</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8-Step Visual Pipeline Stepper */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <span>シンガポール発 ➔ 日本国内佐川急便 配送パイプライン進捗</span>
            <span className="text-[11px] font-normal text-slate-500">（各ステップをクリックして絞り込み可能）</span>
          </div>
          {activeStatusFilter !== 'ALL' && (
            <button
              onClick={() => onSelectStatusFilter('ALL')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
            >
              絞り込みを解除（全件表示）
            </button>
          )}
        </div>

        {/* Stepper bar container */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {STATUS_STEPS.map((step, idx) => {
            const count = statusCounts[step.key] || 0;
            const isSelected = activeStatusFilter === step.key;
            const isDelivered = step.key === 'DELIVERED';

            return (
              <button
                key={step.key}
                onClick={() => onSelectStatusFilter(isSelected ? 'ALL' : step.key)}
                className={`relative flex flex-col p-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/70 shadow-sm'
                    : count > 0
                    ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    : 'border-slate-100 bg-slate-50/40 opacity-70 hover:opacity-100'
                }`}
              >
                {/* Step indicator header */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-600">
                    STEP {idx + 1}
                  </span>
                  <span
                    className={`inline-flex items-center justify-center text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                      count > 0
                        ? isDelivered
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {count}件
                  </span>
                </div>

                {/* Step Name */}
                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                  <span className={`p-1 rounded ${step.bgLight} ${step.textColor}`}>
                    {getStepIcon(step.key)}
                  </span>
                  <span className="truncate">{step.shortLabel}</span>
                </div>

                {/* Description tooltip */}
                <div className="text-[10px] text-slate-600 mt-1 line-clamp-2 leading-tight">
                  {step.label}
                </div>

                {/* Active marker pill */}
                {count > 0 && currentBatch.isCurrent && step.key !== 'DELIVERED' && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
