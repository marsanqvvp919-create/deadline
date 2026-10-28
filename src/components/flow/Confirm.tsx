import React, { useEffect, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

// 大事な操作の前に出す確認。どの画面でも同じ形（何が起きるか → 取り消せるか → ボタン）にそろえる。
// 使い方： if (!(await askConfirm({ title: '…を削除します', body: '…', okLabel: '削除する', danger: true }))) return;
export interface ConfirmOptions {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  /** 取り消せない・消える操作は赤いボタンにする */
  danger?: boolean;
}
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let open: ((p: Pending) => void) | null = null;

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  // ホストがまだ無い画面では、ブラウザの確認で代用する
  if (!open) return Promise.resolve(window.confirm([opts.title, opts.body].filter(Boolean).join('\n\n')));
  return new Promise((resolve) => open!({ ...opts, resolve }));
}

/** お知らせだけ（OK ボタン1つ） */
export function tellUser(title: string, body?: string): Promise<boolean> {
  return askConfirm({ title, body, okLabel: 'OK', cancelLabel: '' });
}

export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  useEffect(() => {
    open = setP;
    return () => {
      open = null;
    };
  }, []);
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!p) return null;
  const close = (ok: boolean) => {
    p.resolve(ok);
    setP(null);
  };
  const Icon = p.danger ? AlertTriangle : HelpCircle;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => close(false)}>
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-3 p-5">
          <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${p.danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-base font-bold text-slate-900">{p.title}</h2>
            {p.body && <p className="whitespace-pre-line text-sm text-slate-600">{p.body}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3">
          {p.cancelLabel !== '' && (
            <button autoFocus={p.danger} onClick={() => close(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {p.cancelLabel || 'やめる'}
            </button>
          )}
          <button
            autoFocus={!p.danger}
            onClick={() => close(true)}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${p.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {p.okLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
