import React from 'react';
import { PeriodFilter } from '../types';
import { formatDateTime } from '../utils';
import {
  RefreshCw,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  Clock,
  Settings,
  XCircle,
  Bell,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  salesReps: string[];
  suppliers: string[];
  selectedRep: string;
  onSelectRep: (rep: string) => void;
  selectedSupplier: string;
  onSelectSupplier: (supplier: string) => void;
  period: PeriodFilter;
  onSelectPeriod: (period: PeriodFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalAlertsCount: number;
  highSeverityCount: number;
  generatedAt: string;
  isStale: boolean;
  isFallback: boolean;
  error: string | null;
  serverIp?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onNavigateToAlerts: () => void;
  onOpenDailyDigest: () => void;
  onDismissError?: () => void;
  onSwitchToSample?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  salesReps,
  suppliers,
  selectedRep,
  onSelectRep,
  selectedSupplier,
  onSelectSupplier,
  period,
  onSelectPeriod,
  searchQuery,
  onSearchChange,
  totalAlertsCount,
  highSeverityCount,
  generatedAt,
  isStale,
  isFallback: _isFallback,
  error,
  serverIp,
  isRefreshing,
  onRefresh,
  onOpenSettings,
  onNavigateToAlerts,
  onOpenDailyDigest,
  onDismissError,
  onSwitchToSample,
}) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopyIp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (serverIp) {
      navigator.clipboard.writeText(serverIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      {/* Red Error Banner when fetch failed (Phase 2 Requirement) */}
      {error && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 transition-all">
          <div className="flex items-center gap-2 flex-1 min-w-[300px]">
            <XCircle className="w-4 h-4 shrink-0 text-white" />
            <div>
              <span className="font-semibold">
                楽楽販売API通信エラー（IP制限の可能性があります）
              </span>
              <span className="text-rose-100 text-[11px] block sm:inline sm:ml-2">
                — {error}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {serverIp && (
              <div className="flex items-center gap-1.5 bg-rose-700/80 border border-rose-400 rounded-md px-2 py-1 text-[11px]">
                <span className="text-rose-200">当サーバーIP:</span>
                <code className="font-mono font-bold text-white select-all">{serverIp}</code>
                <button
                  type="button"
                  onClick={handleCopyIp}
                  className="ml-1 text-[10px] bg-white/20 hover:bg-white/30 text-white px-1.5 py-0.5 rounded cursor-pointer transition font-medium"
                >
                  {copied ? 'コピー済' : 'コピー'}
                </button>
              </div>
            )}
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 font-bold rounded-md text-[11px] transition cursor-pointer shadow-xs"
            >
              設定・対処方法
            </button>
            {onSwitchToSample && (
              <button
                onClick={onSwitchToSample}
                className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-md text-[11px] font-medium transition cursor-pointer border border-rose-400"
              >
                サンプルデータで利用
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="underline text-xs hover:text-rose-100 font-bold cursor-pointer text-white px-1"
            >
              {isRefreshing ? '取得中...' : '再試行'}
            </button>
            {onDismissError && (
              <button
                onClick={onDismissError}
                title="閉じる"
                className="p-1 text-rose-200 hover:text-white rounded-md transition cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Yellow Stale Banner when data is older than 60 mins (Phase 2 Requirement) */}
      {!error && isStale && (
        <div className="bg-amber-500 text-slate-900 px-4 py-1.5 text-xs flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-slate-900" />
            <span>データが古い可能性があります（データ作成日時: {formatDateTime(generatedAt)}）</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="underline text-xs hover:text-slate-800 cursor-pointer font-bold"
          >
            今すぐ再取得
          </button>
        </div>
      )}

      {/* Main Filter Bar */}
      <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Global Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-[320px]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>絞り込み:</span>
          </div>

          {/* Sales Rep Filter */}
          <div className="min-w-[130px]">
            <select
              value={selectedRep}
              onChange={(e) => onSelectRep(e.target.value)}
              className="w-full text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition cursor-pointer"
            >
              <option value="">担当営業: 全員</option>
              {salesReps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div className="min-w-[140px]">
            <select
              value={selectedSupplier}
              onChange={(e) => onSelectSupplier(e.target.value)}
              className="w-full text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition cursor-pointer"
            >
              <option value="">仕入先: すべて</option>
              {suppliers.map((sup) => (
                <option key={sup} value={sup}>
                  {sup}
                </option>
              ))}
            </select>
          </div>

          {/* Period Filter */}
          <div className="min-w-[120px]">
            <select
              value={period}
              onChange={(e) => onSelectPeriod(e.target.value as PeriodFilter)}
              className="w-full text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition cursor-pointer"
            >
              <option value="all">期間: 全期間</option>
              <option value="7d">直近7日</option>
              <option value="30d">直近30日</option>
              <option value="this_month">今月</option>
              <option value="90d">直近90日</option>
            </select>
          </div>

          {/* Search Input (Phase 3) */}
          <div className="relative max-w-[220px] w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="受注ID・顧客名・商品名"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg placeholder-slate-400 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Right: Status, Alerts Badge, Refresh, Settings */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {/* Alerts Badge Button */}
          <button
            type="button"
            onClick={onNavigateToAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-800 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer font-bold"
            title="アラート一覧を表示"
          >
            <Bell className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-xs font-mono">{totalAlertsCount}</span>
            {highSeverityCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-rose-600 text-white rounded font-bold shadow-2xs">
                高:{highSeverityCount}
              </span>
            )}
          </button>

          {/* Generated At timestamp */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>更新: {formatDateTime(generatedAt)}</span>
          </div>

          {/* Manual Refresh tactile button (Phase 2 Requirement) */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer ${
              isRefreshing ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="5分ごとに自動更新されます"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
            <span className="hidden sm:inline">再読み込み</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-lg border border-slate-300 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer"
            title="データ接続設定（GAS / 楽楽販売）"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
