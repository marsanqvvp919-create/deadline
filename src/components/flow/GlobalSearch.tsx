import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Order, ShipmentItem } from '../../types';
import { isShippingOrFee } from '../../utils';

// 画面上部の検索：受注番号・クリニック名・追跡番号・出荷ID のどれでも受注を探し、選ぶと受注カード（詳細）を開く
const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/[\s\-‐－]/g, '');

interface Hit {
  order: Order;
  why: string;
}

export function GlobalSearch({ orders, shipments, onPick }: { orders: Order[]; shipments: ShipmentItem[]; onPick: (o: Order) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  // 「/」キーで検索窓へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        box.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = norm(q);
    if (n.length < 2) return [];
    const byId = new Map(orders.map((o) => [o.orderId, o]));
    const out: Hit[] = [];
    const seen = new Set<string>();
    const add = (o: Order | undefined, why: string) => {
      if (!o || seen.has(o.orderId)) return;
      seen.add(o.orderId);
      out.push({ order: o, why });
    };
    const digits = n.replace(/\D/g, '');
    // 1. 受注番号（末尾一致も可：「4058」で 000004058）
    for (const o of orders) if (digits.length >= 3 && o.orderId.endsWith(digits)) add(o, '受注番号');
    // 2. 追跡番号・出荷ID
    for (const s of shipments) {
      const nos = norm([s.trackingNo, (s as any).internationalTrackingNo, (s as any).domesticTrackingNo].filter(Boolean).join(' '));
      if ((digits.length >= 6 && nos.includes(digits)) || norm(s.shipmentId || '') === n) add(byId.get(s.orderId), s.shipmentId && norm(s.shipmentId) === n ? `出荷 ${s.shipmentId}` : `追跡番号 ${s.trackingNo}`);
    }
    // 3. クリニック名（新しい受注から）
    const byDate = [...orders].sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));
    for (const o of byDate) if (norm(o.customerName || '').includes(n)) add(o, 'クリニック');
    // 4. 商品名
    if (out.length < 5) for (const o of byDate) if (o.lines.some((l) => norm(l.productName || '').includes(n))) add(o, '商品');
    return out.slice(0, 12);
  }, [q, orders, shipments]);

  useEffect(() => setCursor(0), [q]);
  const pick = (o: Order) => {
    onPick(o);
    setOpen(false);
    setQ('');
    box.current?.blur();
  };

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        ref={box}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === 'Enter' && hits[cursor]) pick(hits[cursor].order);
          else if (e.key === 'Escape') box.current?.blur();
        }}
        placeholder="受注番号・クリニック・追跡番号で探す（/）"
        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {q && (
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="消す">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && norm(q).length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:w-[420px]">
          {hits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">見つかりません。受注番号・クリニック名・追跡番号（6桁以上）で探せます</div>
          ) : (
            hits.map((h, i) => {
              const lines = h.order.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
              return (
                <button
                  key={h.order.orderId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(h.order)}
                  onMouseEnter={() => setCursor(i)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 ${i === cursor ? 'bg-indigo-50' : 'bg-white'}`}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-indigo-700">{h.order.orderId}</span>
                    <span className="truncate font-semibold text-slate-800">{h.order.customerName}</span>
                    <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{h.why}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {h.order.orderDate} ・ {lines.map((l) => l.productName).slice(0, 3).join('、')}
                    {lines.length > 3 && ` ほか${lines.length - 3}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
