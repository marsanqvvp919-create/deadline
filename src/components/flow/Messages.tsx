import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

// エラー・空の表示を全画面でそろえる：「何が起きたか」＋「次にどうすればいいか」

/** 技術的なエラー文を、誰でもわかる言葉と次の手順に置き換える（わからないものはそのまま出す） */
export function friendlyError(raw: unknown): { what: string; next?: string } {
  const msg = String((raw as any)?.message ?? raw ?? '').trim();
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg))
    return { what: 'サーバーにつながりませんでした', next: 'インターネットの接続を確かめて、少し待ってからもう一度押してください' };
  if (/login_required|ログインが必要|401/.test(msg)) return { what: 'ログインが切れました', next: '画面を読み込み直して、もう一度ログインしてください' };
  if (/403|forbidden|権限/i.test(msg) && !/シート/.test(msg)) return { what: 'この操作をする権限がありません', next: '管理者に確認してください' };
  if (/timeout|timed out|時間切れ|ETIMEDOUT/i.test(msg)) return { what: '応答に時間がかかりすぎて止まりました', next: '少し待ってからもう一度押してください' };
  if (/^エラー（5\d\d）$|internal server error|\b50[0-4]\b/i.test(msg)) return { what: 'サーバーで問題が起きました', next: '少し待ってからもう一度押してください。続く場合は管理者に連絡してください' };
  if (/unexpected token|json/i.test(msg)) return { what: 'サーバーからの返事を読めませんでした', next: '画面を読み込み直してください' };
  return { what: msg || 'うまくいきませんでした' };
}

/** エラーの箱（赤）。message にはエラー文か Error をそのまま渡す */
export function ErrorNote({ message, onRetry, compact }: { message: unknown; onRetry?: () => void; compact?: boolean }) {
  if (!message) return null;
  const { what, next } = friendlyError(message);
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <div className="min-w-0 flex-1 whitespace-pre-wrap">
        <span className="font-bold">{what}</span>
        {next && <span className="block text-rose-700/90 text-xs mt-0.5">{next}</span>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700">
          もう一度
        </button>
      )}
    </div>
  );
}

/** 対象が無いときの表示（緑）。hint には「次にすること」や「なぜ無いか」を書く */
export function EmptyNote({ title, hint, className = '' }: { title: string; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 px-4 py-8 text-center ${className}`}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        {title}
      </span>
      {hint && <span className="max-w-md text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}
