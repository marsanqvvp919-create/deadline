import React, { useEffect, useState } from 'react';

// お客様に案内する到着予定日（受注ごと）。サーバーの portal-eta.json を読み、お客様の管理画面の「到着予定日」に出る
type EtaMap = Record<string, { date: string; updatedAt: string }>;
let cache: EtaMap | null = null;
let pending: Promise<EtaMap> | null = null;
const listeners = new Set<() => void>();

function loadEta(): Promise<EtaMap> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/api/portal-eta')
      .then((r) => (r.ok ? r.json() : { eta: {} }))
      .then((j) => (cache = j.eta || {}))
      .catch(() => (cache = {}))
      .finally(() => (pending = null)) as Promise<EtaMap>;
  }
  return pending;
}

export function CustomerEtaInput({ orderId }: { orderId: string }) {
  const [, force] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    loadEta().then(fn);
    return () => void listeners.delete(fn);
  }, []);
  const value = cache?.[orderId]?.date || '';

  const save = async (date: string) => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/portal-eta/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '保存できませんでした');
      cache = j.eta || {};
      listeners.forEach((fn) => fn());
    } catch (e: any) {
      setError(e.message || '保存できませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-[10px]" onClick={(e) => e.stopPropagation()}>
      <div className="font-bold text-slate-500">お客様に出す到着予定日</div>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          type="date"
          value={value}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
          title="ここに入れた日付が、お客様の管理画面の「到着予定日」に出ます"
          className={`rounded border px-1 py-0.5 text-[11px] ${value ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800' : 'border-slate-300 bg-white text-slate-500'}`}
        />
        {value && !saving && (
          <button type="button" onClick={() => save('')} className="text-slate-400 hover:text-rose-600 underline cursor-pointer">
            消す
          </button>
        )}
        {saving && <span className="text-slate-400">保存中…</span>}
      </div>
      {error && <div className="text-rose-600">{error}</div>}
    </div>
  );
}
