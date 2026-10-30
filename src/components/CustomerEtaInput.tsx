import React, { useEffect, useState } from 'react';

// お客様の管理画面に出す内容（受注ごと）。サーバーの portal-eta.json を読み書きする
// date：「到着予定日」／status：まだ出荷していない分の段階／memo：お客様へのお知らせ
type EtaMap = Record<string, { date?: string; status?: string; memo?: string; updatedAt: string }>;
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

// 送った項目だけ書き換える
function usePortalEta(orderId: string) {
  const [, force] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    loadEta().then(fn);
    return () => void listeners.delete(fn);
  }, []);
  const save = async (fields: { date?: string; status?: string; memo?: string }) => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/portal-eta/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
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
  return { entry: cache?.[orderId], saving, error, save };
}

export function CustomerEtaInput({ orderId }: { orderId: string }) {
  const { entry, saving, error, save: saveFields } = usePortalEta(orderId);
  const value = entry?.date || '';
  const save = (date: string) => saveFields({ date });

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

// お客様の管理画面で、まだ出荷していない分に出す段階（実際の出荷記録が入ればそちらが優先）
const SHOWN_STATUSES: [string, string][] = [
  ['', '自動（実際の状況）'],
  ['PREPARING', '出荷準備中'],
  ['IN_TRANSIT_INTL', '国際輸送中'],
  ['CUSTOMS_CLEARANCE', '通関中'],
  ['OUT_FOR_DELIVERY', '国内配送中'],
];

export function CustomerPortalDisplayInput({ orderId }: { orderId: string }) {
  const { entry, saving, error, save } = usePortalEta(orderId);
  const status = entry?.status || '';
  const memo = entry?.memo || '';
  const [draft, setDraft] = useState(memo);
  useEffect(() => setDraft(memo), [memo]);

  return (
    <div className="text-[10px] space-y-1 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
      <div className="font-bold text-slate-500">お客様画面の表示</div>
      <select
        value={status}
        disabled={saving}
        onChange={(e) => save({ status: e.target.value })}
        title="お客様の管理画面で、まだ出荷していない分に出す段階です。実際に出荷すると、出荷の記録どおりの表示に戻ります"
        className={`w-full rounded border px-1 py-0.5 text-[11px] cursor-pointer ${status ? 'border-violet-300 bg-violet-50 font-bold text-violet-800' : 'border-slate-300 bg-white text-slate-500'}`}
      >
        {SHOWN_STATUSES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        value={draft}
        disabled={saving}
        rows={2}
        maxLength={500}
        placeholder="お客様へのお知らせ（お客様画面に出ます）"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== memo && save({ memo: draft })}
        className={`w-full rounded border px-1 py-0.5 text-[11px] leading-snug resize-y ${memo ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-slate-300 bg-white text-slate-700'}`}
      />
      {saving && <div className="text-slate-400">保存中…</div>}
      {error && <div className="text-rose-600">{error}</div>}
    </div>
  );
}
