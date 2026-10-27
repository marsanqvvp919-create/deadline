import { useEffect, useState } from 'react';

// クール便の要・不要（商品ごと）。サーバーの product-flags.json を読み、画面どうしで同じ値を使う
let cache: Record<string, boolean> | null = null;
let pending: Promise<Record<string, boolean>> | null = null;
const listeners = new Set<(v: Record<string, boolean>) => void>();

function load(): Promise<Record<string, boolean>> {
  if (cache) return Promise.resolve(cache);
  if (!pending)
    pending = fetch('/api/product-flags')
      .then((r) => (r.ok ? r.json() : { cool: {} }))
      .then((j) => (cache = j.cool || {}))
      .catch(() => ({}))
      .finally(() => (pending = null));
  return pending;
}

export function useCoolFlags(): [Record<string, boolean>, (productId: string, cool: boolean) => Promise<void>] {
  const [flags, setFlags] = useState<Record<string, boolean>>(cache || {});
  useEffect(() => {
    listeners.add(setFlags);
    load().then(setFlags);
    return () => {
      listeners.delete(setFlags);
    };
  }, []);
  const setCool = async (productId: string, cool: boolean) => {
    const r = await fetch('/api/product-flags/cool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, cool }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `エラー（${r.status}）`);
    const next = { ...(cache || {}) };
    if (cool) next[productId] = true;
    else delete next[productId];
    cache = next;
    listeners.forEach((f) => f(next));
  };
  return [flags, setCool];
}
