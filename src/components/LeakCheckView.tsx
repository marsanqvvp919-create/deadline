import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react';
import { demoHeaders } from '../utils/demo';
import { TONE } from './flow/tone';

// 漏れチェック：流れの段ごとに、目安の日数を過ぎても次に進んでいないものを並べる。
// 押すとその作業をする画面へ移る。データは楽楽販売・在庫・配送会社から毎回計算（ここでは何も書き換えない）

interface LeakItem {
  id: string;
  orderId: string;
  clinic: string;
  text: string;
  days: number | null;
}
interface LeakRule {
  id: string;
  step: string;
  title: string;
  hint: string;
  tab: string;
  items: LeakItem[];
}
interface Leaks {
  rules: LeakRule[];
  total: number;
  generatedAt: string;
}

export const LEAK_STEPS: { id: string; label: string }[] = [
  { id: 'unordered', label: '入金・未発注' },
  { id: 'vendor', label: 'ベンダー出荷' },
  { id: 'inbound', label: '入荷' },
  { id: 'allocate', label: '引当' },
  { id: 'instruct', label: '出荷指示（インボイス・AWB）' },
  { id: 'ship', label: '倉庫の出荷' },
  { id: 'cool', label: 'クール伝票（佐川）' },
  { id: 'deliver', label: '追跡・到着' },
];

/** 佐川のクール伝票番号を入れて、楽楽販売の「国内追跡番号」に書く */
function CoolSlipInput({ shipmentId, onDone }: { shipmentId: string; onDone: () => void }) {
  const [no, setNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/rakuraku/domestic-tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipmentId, domesticTrackingNo: no }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `エラー（${r.status}）`);
      setMsg({ text: `楽楽販売に ${j.domesticTrackingNo} を書きました` });
      setTimeout(onDone, 1500);
    } catch (e: any) {
      setMsg({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input value={no} onChange={(e) => setNo(e.target.value)} placeholder="佐川の伝票番号（12桁）" inputMode="numeric" className="w-44 rounded border border-slate-300 px-2 py-0.5 font-mono" />
      <button disabled={busy || no.replace(/\D/g, '').length !== 12} onClick={save} className="rounded bg-amber-500 hover:bg-amber-600 px-2.5 py-0.5 font-bold text-white disabled:opacity-40">
        {busy ? '書き込み中…' : '楽楽販売に登録'}
      </button>
      {msg && <span className={msg.error ? 'text-rose-600' : 'text-emerald-700 font-bold'}>{msg.text}</span>}
    </span>
  );
}

export function LeakCheckView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<Leaks | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const load = useCallback(() => {
    setError('');
    fetch('/api/inventory/leaks', { headers: demoHeaders() })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({})))?.error || `エラー（${r.status}）`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            漏れチェック
            {data && <span className={`rounded-full px-2.5 py-0.5 text-sm font-black ${data.total ? 'bg-rose-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{data.total ? `${data.total}件` : 'なし'}</span>}
          </h2>
          <p className="text-[11px] text-slate-500">流れの段ごとに、目安の日数を過ぎても次に進んでいないものです。行を押すと、その作業をする画面へ移ります。片付くと自動で消えます。</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" />
          読み込み直す
        </button>
      </div>
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div>}
      {!data && !error && <div className="py-10 text-center text-xs text-slate-400">確認中…</div>}

      {data &&
        LEAK_STEPS.map((step, si) => {
          const rules = data.rules.filter((r) => r.step === step.id);
          if (!rules.length) return null;
          const n = rules.reduce((k, r) => k + r.items.length, 0);
          return (
            <section key={step.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
                <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${n ? 'bg-rose-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{si + 1}</span>
                <span className="text-sm font-bold text-slate-900">{step.label}</span>
                {n === 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    漏れなし
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {rules.map((r) => {
                  const shown = open[r.id] ? r.items : r.items.slice(0, 8);
                  return (
                    <div key={r.id} className="px-4 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.items.length ? <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        <span className={`font-bold ${r.items.length ? 'text-slate-900' : 'text-slate-500'}`}>{r.title}</span>
                        <span className={`rounded border px-1.5 py-0.5 font-bold ${r.items.length ? TONE.urgent : TONE.done}`}>{r.items.length}件</span>
                        <span className="text-[11px] text-slate-500">{r.hint}</span>
                      </div>
                      {r.items.length > 0 && (
                        <div className="mt-1.5 ml-6 space-y-1">
                          {shown.map((it) =>
                            r.step === 'cool' ? (
                              <div key={it.id} className="grid grid-cols-[6rem_minmax(0,14rem)_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-lg px-2 py-1">
                                <span className="font-mono font-bold text-indigo-700 truncate">{it.orderId || '—'}</span>
                                <span className="font-semibold text-slate-800 truncate">{it.clinic}</span>
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                                  <span className="text-slate-600 truncate" title={it.text}>
                                    {it.text}
                                  </span>
                                  <CoolSlipInput shipmentId={it.id} onDone={load} />
                                </span>
                                <span className={`text-right font-mono font-bold ${it.days !== null && it.days >= 7 ? 'text-rose-600' : 'text-amber-700'}`}>{it.days === null ? '—' : `${it.days}日`}</span>
                              </div>
                            ) : (
                            <button key={it.id} onClick={() => onNavigate(r.tab)} className="w-full grid grid-cols-[6rem_minmax(0,14rem)_minmax(0,1fr)_4.5rem_1rem] items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50">
                              <span className="font-mono font-bold text-indigo-700 truncate">{it.orderId || '—'}</span>
                              <span className="font-semibold text-slate-800 truncate">{it.clinic}</span>
                              <span className="text-slate-600 truncate" title={it.text}>
                                {it.text}
                              </span>
                              <span className={`text-right font-mono font-bold ${it.days !== null && it.days >= 7 ? 'text-rose-600' : 'text-amber-700'}`}>{it.days === null ? '—' : `${it.days}日`}</span>
                              <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>
                            )
                          )}
                          {r.items.length > 8 && (
                            <button onClick={() => setOpen({ ...open, [r.id]: !open[r.id] })} className="ml-2 text-[11px] font-bold text-indigo-700">
                              {open[r.id] ? '少なく表示' : `ほか${r.items.length - 8}件を表示`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
