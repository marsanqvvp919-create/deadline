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
  totalAlertsCount: number;
  highSeverityCount: number;
  generatedAt: string;
  isStale: boolean;
  isFallback: boolean;
  error: string | null;
  errorType?: 'rate_limit' | 'ip_blocked' | 'auth_error' | 'network_error' | null;
  serverIp?: string;
  isRefreshing: boolean;
  cooldownRemainingSec?: number;
  lastSuccessTime?: string | null;
  isSampleMode?: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onNavigateToAlerts: () => void;
  onOpenDailyDigest: () => void;
  onDismissError?: () => void;
  onSwitchToSample?: () => void;
  onSwitchToReal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  totalAlertsCount,
  highSeverityCount,
  generatedAt,
  isStale,
  isFallback: _isFallback,
  error,
  errorType = null,
  serverIp,
  isRefreshing,
  cooldownRemainingSec = 0,
  lastSuccessTime = null,
  isSampleMode = false,
  onRefresh,
  onOpenSettings,
  onNavigateToAlerts,
  onOpenDailyDigest,
  onDismissError,
  onSwitchToSample,
  onSwitchToReal,
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

  // 原因に合った文言とスタイルを判定（要件5）
  const getErrorInfo = () => {
    if (!error) return null;
    const str = `${error} ${errorType || ''}`.toLowerCase();
    if (
      errorType === 'rate_limit' ||
      str.includes('回数') ||
      str.includes('制限を超え') ||
      str.includes('429') ||
      str.includes('上限')
    ) {
      return {
        tag: '回数上限',
        title: '【回数上限】APIの実行回数が制限を超えました。サーバー保存データを表示中',
        bg: 'bg-amber-600',
        canRetry: cooldownRemainingSec <= 0 && !isRefreshing,
      };
    }
    if (
      errorType === 'ip_blocked' ||
      str.includes('コード7') ||
      str.includes('code 7') ||
      str.includes('ip') ||
      str.includes('拒否')
    ) {
      return {
        tag: 'IP制限',
        title: `【IP制限】API接続が拒否されました（サーバーIP: ${serverIp || ''} の許可が必要です）`,
        bg: 'bg-rose-600',
        canRetry: true,
      };
    }
    if (
      errorType === 'auth_error' ||
      str.includes('認証') ||
      str.includes('トークン') ||
      str.includes('token') ||
      str.includes('401')
    ) {
      return {
        tag: '認証エラー',
        title: '【認証エラー】API認証に失敗しました。設定画面でトークン等を確認してください',
        bg: 'bg-red-700',
        canRetry: true,
      };
    }
    return {
      tag: '通信エラー',
      title: `【通信エラー】API通信に失敗しました（${error}）`,
      bg: 'bg-slate-800',
      canRetry: true,
    };
  };

  const errorInfo = getErrorInfo();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      {/* 1. サンプルデータ表示中の常時バナー（要件3） */}
      {isSampleMode && (
        <div className="bg-amber-500 text-slate-900 px-4 h-8 flex items-center justify-between text-xs font-bold shadow-xs select-none">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">【サンプルデータ表示中】楽楽販売の実際のデータではありません</span>
          </div>
          {onSwitchToReal && (
            <button
              onClick={onSwitchToReal}
              className="px-2.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-bold transition shrink-0 cursor-pointer ml-2"
            >
              本番APIデータに切替
            </button>
          )}
        </div>
      )}

      {/* 2. 原因に合った文言の1行エラー帯（要件5） */}
      {error && errorInfo && (
        <div
          className={`${errorInfo.bg} text-white px-4 h-9 flex items-center justify-between text-xs overflow-hidden select-none whitespace-nowrap transition-all`}
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <XCircle className="w-4 h-4 shrink-0 text-white" />
            <span className="font-bold truncate">{errorInfo.title}</span>
            {errorInfo.tag === 'IP制限' && serverIp && (
              <span className="shrink-0 font-mono bg-black/20 px-1.5 py-0.5 rounded text-[10px] ml-1">
                IP: {serverIp}
                <button
                  type="button"
                  onClick={handleCopyIp}
                  className="ml-1 px-1 bg-white/20 hover:bg-white/30 rounded cursor-pointer"
                >
                  {copied ? '済' : 'コピー'}
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 bg-white/20 hover:bg-white/30 text-white rounded text-[11px] font-bold transition cursor-pointer"
            >
              設定
            </button>
            {onSwitchToSample && !isSampleMode && (
              <button
                onClick={onSwitchToSample}
                className="px-2 py-0.5 bg-white/20 hover:bg-white/30 text-white rounded text-[11px] font-medium transition cursor-pointer"
              >
                サンプルで利用
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={isRefreshing || cooldownRemainingSec > 0}
              className="underline text-xs hover:text-white font-bold cursor-pointer text-white disabled:opacity-40"
            >
              {isRefreshing
                ? '取得中...'
                : cooldownRemainingSec > 0
                ? `${cooldownRemainingSec}秒待機`
                : '再試行'}
            </button>
            {onDismissError && (
              <button
                onClick={onDismissError}
                title="閉じる（5分間または状態変化まで非表示）"
                className="p-1 text-white/80 hover:text-white rounded transition cursor-pointer ml-1"
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
      <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-end gap-3">
        {/* Right: Status, Alerts Badge, Refresh, Settings */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {/* Alerts Badge Button */}
          <button
            type="button"
            onClick={onNavigateToAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-800 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer font-bold"
            title={`納期超過の伝票と、配送で問題が起きている出荷（${highSeverityCount}件・朝の納期会議と同じ数）`}
          >
            <Bell className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-xs">要対応</span>
            <span className="text-xs font-mono">{highSeverityCount}件</span>
          </button>

          {/* Generated At timestamp / 最終取得成功時刻（要件3） */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="whitespace-nowrap">
              {lastSuccessTime
                ? `最終取得成功: ${formatDateTime(lastSuccessTime)}`
                : `同期: ${formatDateTime(generatedAt)}`}
            </span>
          </div>

          {/* Manual Refresh button (前回の取得から1分以内は押せない制限: 要件2) */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || cooldownRemainingSec > 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer ${
              isRefreshing || cooldownRemainingSec > 0
                ? 'opacity-60 cursor-not-allowed bg-slate-100 text-slate-400'
                : ''
            }`}
            title={
              cooldownRemainingSec > 0
                ? `前回の取得から1分以内は再取得できません（残り${cooldownRemainingSec}秒）`
                : '15分ごとに自動更新されます'
            }
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-600'
              }`}
            />
            <span className="hidden sm:inline">
              {isRefreshing
                ? '取得中...'
                : cooldownRemainingSec > 0
                ? `再読み込み (${cooldownRemainingSec}秒)`
                : '再読み込み'}
            </span>
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
