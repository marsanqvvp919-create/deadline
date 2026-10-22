import React from 'react';
import {
  Truck,
  Building2,
  RefreshCw,
  Layers,
  Hospital,
  BarChart3
} from 'lucide-react';
import { BatchInfo } from '../portalData';
import { portalGroupName } from '../portalData';

interface HeaderProps {
  batches: BatchInfo[];
  selectedBatchId: string;
  onSelectBatch: (batchId: string) => void;
  viewMode: 'hq' | 'clinic' | 'overall_history';
  onChangeViewMode: (mode: 'hq' | 'clinic' | 'overall_history') => void;
  selectedClinicId: string;
  onSelectClinicId: (clinicId: string) => void;
  allClinics: { id: string; name: string }[];
  lastUpdated: string;
  onRefresh: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  batches,
  selectedBatchId,
  onSelectBatch,
  viewMode,
  onChangeViewMode,
  selectedClinicId,
  onSelectClinicId,
  allClinics,
  lastUpdated,
  onRefresh,
  onLogout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Title & Organization Info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                  {portalGroupName()}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  商品: 美容医療薬剤
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-0.5">
                配送・受注ステータス管理システム
              </h1>
            </div>
          </div>

          {/* Controls: Batch Selector & View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Selector */}
            <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
              <span className="text-xs text-slate-500 px-2 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                受注月:
              </span>
              <select
                value={selectedBatchId}
                onChange={(e) => onSelectBatch(e.target.value)}
                className="bg-white text-slate-800 text-xs sm:text-sm font-semibold rounded-md px-2.5 py-1.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.isCurrent ? '★最新進行中' : '（過去配送済）'}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Tabs */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => onChangeViewMode('hq')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'hq'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                クリニック全体
              </button>
              <button
                onClick={() => onChangeViewMode('clinic')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'clinic'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Hospital className="w-3.5 h-3.5" />
                クリニック個別
              </button>
              <button
                onClick={() => onChangeViewMode('overall_history')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'overall_history'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                全体発注数量・履歴
              </button>
            </div>

            {/* Refresh & Last Updated */}
            <div className="flex items-center gap-1.5 ml-1 text-slate-500 text-xs">
              <span className="hidden xl:inline text-[11px] text-slate-400">
                更新: {lastUpdated}
              </span>
              <button
                onClick={onRefresh}
                title="データを再読み込み"
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-[11px] font-semibold cursor-pointer shadow-2xs"
                >
                  ログアウト
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Clinic Selector banner if clinic view mode */}
        {viewMode === 'clinic' && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-700 font-medium">
              <Hospital className="w-4 h-4 text-blue-600" />
              <span className="font-bold">閲覧クリニック:</span>
              <select
                value={selectedClinicId}
                onChange={(e) => onSelectClinicId(e.target.value)}
                className="bg-white text-slate-800 text-xs sm:text-sm font-semibold rounded-md px-3 py-1.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs sm:max-w-md shadow-2xs cursor-pointer"
              >
                {allClinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-slate-500">
              自院宛の到着予定・追跡番号・納品伝票を確認できます
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
