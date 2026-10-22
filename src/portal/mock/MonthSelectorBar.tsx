import React from 'react';
import { BatchInfo } from '../portalData';
import { Calendar, CheckCircle2, Clock, Sparkles } from 'lucide-react';

interface MonthSelectorBarProps {
  batches: BatchInfo[];
  selectedBatchId: string;
  onSelectBatch: (batchId: string) => void;
}

export const MonthSelectorBar: React.FC<MonthSelectorBarProps> = ({
  batches,
  selectedBatchId,
  onSelectBatch,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">
            受注月別アーカイブ（個別受注）
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            ※ 9月以前の受注はすべて配送完了済み（過去伝票・受領記録確認可能）
          </span>
        </div>
        <span className="text-[11px] font-bold text-slate-400">
          全10便（1月〜10月）
        </span>
      </div>

      {/* Horizontal Scrollable Month Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
        {batches.map((b) => {
          const isSelected = b.id === selectedBatchId;
          const isCurrent = b.isCurrent;
          const monthNum = b.id.split('-')[1];

          return (
            <button
              key={b.id}
              onClick={() => onSelectBatch(b.id)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md font-bold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight font-mono">
                  {parseInt(monthNum, 10)}月度
                </span>
                {isCurrent ? (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? 'bg-blue-800 text-cyan-200'
                        : 'bg-blue-100 text-blue-800 animate-pulse'
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5" /> 進行中
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" /> 配送済
                  </span>
                )}
              </div>

              <span
                className={`text-[10px] hidden sm:inline ${
                  isSelected ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                ({b.totalOrders}件)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
