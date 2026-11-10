import React, { useState } from 'react';
import { Type } from 'lucide-react';

// 文字の大きさ（標準・大・特大）。画面全体を拡大する。端末ごとに覚えておく
const SIZES = [
  { id: 'normal', label: '標準', zoom: 1 },
  { id: 'large', label: '大', zoom: 1.1 },
  { id: 'xlarge', label: '特大', zoom: 1.22 },
] as const;
type SizeId = (typeof SIZES)[number]['id'];
const KEY = 'ui_text_size';

function read(): SizeId {
  try {
    const v = localStorage.getItem(KEY) as SizeId | null;
    return SIZES.some((s) => s.id === v) ? (v as SizeId) : 'normal';
  } catch {
    return 'normal';
  }
}
function apply(id: SizeId) {
  const z = SIZES.find((s) => s.id === id)!.zoom;
  (document.documentElement.style as any).zoom = z === 1 ? '' : String(z);
}
// 画面を開いたときに、前回選んだ大きさにする
if (typeof document !== 'undefined') apply(read());

export function TextSizeButton() {
  const [size, setSize] = useState<SizeId>(read);
  const next = () => {
    const i = SIZES.findIndex((s) => s.id === size);
    const n = SIZES[(i + 1) % SIZES.length].id;
    setSize(n);
    apply(n);
    try {
      localStorage.setItem(KEY, n);
    } catch {}
  };
  const cur = SIZES.find((s) => s.id === size)!;
  return (
    <button
      type="button"
      onClick={next}
      title="文字の大きさを変える（標準 → 大 → 特大）。この端末で覚えておきます"
      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      <Type className="w-3.5 h-3.5" />
      <span>文字 {cur.label}</span>
    </button>
  );
}
