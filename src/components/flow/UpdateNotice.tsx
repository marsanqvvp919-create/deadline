import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// 新しい版を出したことを知らせる。開いたままの画面は古いままなので、5分ごとに確認して再読み込みを促す
const currentScript = () => Array.from(document.scripts).map((s) => s.src).find((src) => /\/assets\/index-[^/]+\.js$/.test(src)) || '';

export function UpdateNotice() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = currentScript();
    if (!mine) return;
    const check = () =>
      fetch('/', { cache: 'no-store' })
        .then((r) => r.text())
        .then((html) => {
          const m = html.match(/\/assets\/index-[^"']+\.js/);
          if (m && !mine.endsWith(m[0])) setStale(true);
        })
        .catch(() => {});
    const t = setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', check);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-xl bg-indigo-600 text-white px-4 py-2.5 shadow-xl text-sm">
      <span>新しいバージョンがあります</span>
      <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1 rounded-lg bg-white text-indigo-700 px-3 py-1 font-bold">
        <RefreshCw className="w-3.5 h-3.5" />
        再読み込み
      </button>
    </div>
  );
}
