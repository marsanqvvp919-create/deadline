import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface TableEmptyStateProps {
  isLoading?: boolean;
  error?: string | null;
  lastSuccessTime?: string | null;
  onRetry?: () => void;
  colSpan: number;
  emptyMessage?: string;
  skeletonRows?: number;
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({
  isLoading = false,
  error = null,
  lastSuccessTime = null,
  onRetry,
  colSpan,
  emptyMessage = '該当する案件はありません',
  skeletonRows = 5,
}) => {
  // 1. 読み込み中の場合: 中身が入る前の枠（スケルトン）を表示
  if (isLoading) {
    return (
      <>
        {Array.from({ length: skeletonRows }).map((_, idx) => (
          <tr key={`skeleton-${idx}`} className="animate-pulse border-b border-slate-100">
            {Array.from({ length: colSpan }).map((_, cIdx) => (
              <td key={`c-${cIdx}`} className="py-3.5 px-3">
                <div
                  className={`h-4 bg-slate-200/70 rounded-md ${
                    cIdx === 0 ? 'w-24' : cIdx === 1 ? 'w-20' : cIdx === 2 ? 'w-36' : 'w-16'
                  }`}
                />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  // 2. 取得に失敗した場合: 「データを取得できませんでした」と再試行ボタンを表示
  if (error) {
    return (
      <tr>
        <td colSpan={colSpan} className="py-12 px-4 text-center">
          <div className="max-w-md mx-auto flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-900">データを取得できませんでした</p>
              <p className="text-xs text-rose-600 mt-1">{error}</p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>再試行する</span>
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // 3. 対象がない場合: 「該当する案件はありません（最終取得 HH:mm）」と緑で表示
  const formatTime = (iso?: string | null) => {
    if (!iso) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  const timeStr = formatTime(lastSuccessTime);

  return (
    <tr>
      <td colSpan={colSpan} className="py-12 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            {emptyMessage}（最終取得 {timeStr}）
          </span>
        </div>
      </td>
    </tr>
  );
};
