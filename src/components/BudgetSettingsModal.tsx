import React, { useState } from 'react';
import { Target, X, Settings, Check, Save } from 'lucide-react';
import { formatCurrency } from '../utils';

interface BudgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgets: Record<string, number>;
  salesReps: string[];
  onSaveBudgets: (newBudgets: Record<string, number>) => void;
}

export const BudgetSettingsModal: React.FC<BudgetSettingsModalProps> = ({
  isOpen,
  onClose,
  budgets,
  salesReps,
  onSaveBudgets,
}) => {
  const [tempBudgets, setTempBudgets] = useState<Record<string, number>>(budgets);
  const [successMsg, setSuccessMsg] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveBudgets(tempBudgets);
    setSuccessMsg(true);
    setTimeout(() => {
      setSuccessMsg(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base">月間予算目標の設定</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          <p className="text-slate-500 leading-relaxed">
            全社および各営業担当の当月月間目標予算（円）を設定します。設定された値は自動的に保存され、各ダッシュボードや達成率に反映されます。
          </p>

          <div className="space-y-1.5 bg-indigo-50/60 border border-indigo-200 p-4 rounded-xl">
            <label className="block font-bold text-indigo-900">全社 合計目標予算</label>
            <input
              type="number"
              step="500000"
              value={tempBudgets['company'] || ''}
              onChange={(e) => setTempBudgets({ ...tempBudgets, company: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 bg-white border border-indigo-300 rounded-xl font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <span className="text-[11px] text-indigo-700 font-mono">
              (参考: {tempBudgets['company'] ? formatCurrency(tempBudgets['company']) : '未設定'})
            </span>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h4 className="font-bold text-slate-800 text-sm">営業別 目標予算</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {salesReps.map((rep) => (
                <div key={rep} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                  <label className="block font-bold text-slate-700">{rep}</label>
                  <input
                    type="number"
                    step="100000"
                    value={tempBudgets[rep] || 5000000}
                    onChange={(e) => setTempBudgets({ ...tempBudgets, [rep]: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatCurrency(tempBudgets[rep] || 5000000)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          {successMsg ? (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <Check className="w-4 h-4" /> 予算を保存しました！
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">変更は自動で保存されます</span>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存する</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
