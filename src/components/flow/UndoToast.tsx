import React, { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, X } from 'lucide-react';

// 操作のあとに出す通知。「元に戻す」を10秒だけ出す（確認ダイアログの代わり）
type Toast = { id: number; text: string; undo?: () => Promise<any> | void; error?: boolean };
let push: ((t: Toast) => void) | null = null;
let seq = 0;

export function notifyDone(text: string, undo?: () => Promise<any> | void) {
  push?.({ id: ++seq, text, undo });
  window.dispatchEvent(new Event('flow-refresh'));
}
export function notifyError(text: string) {
  push?.({ id: ++seq, text, error: true });
}

export function UndoToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      setToasts((x) => [...x.slice(-2), t]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), t.error ? 8000 : 10000);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] space-y-2 w-[min(560px,92vw)]">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl text-sm ${t.error ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
          {!t.error && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span className="flex-1">{t.text}</span>
          {t.undo && (
            <button
              onClick={async () => {
                setToasts((x) => x.filter((y) => y.id !== t.id));
                try {
                  await t.undo!();
                  push?.({ id: ++seq, text: '元に戻しました' });
                  window.dispatchEvent(new Event('flow-refresh'));
                } catch (e: any) {
                  push?.({ id: ++seq, text: e?.message || '元に戻せませんでした', error: true });
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1 font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              元に戻す
            </button>
          )}
          <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-white/60 hover:text-white" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
