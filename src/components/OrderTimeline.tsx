import React, { useEffect, useMemo, useState } from 'react';
import { Check, Circle, Clock } from 'lucide-react';
import { Order, ShipmentItem } from '../types';
import { isShippingOrFee } from '../utils';
import { CarrierStatus, digitsOf } from '../utils/carriers';

// 受注1件の流れを1本の線で見せる：受注 → 入金 → 発注 → 入荷 → 出荷指示 → 出荷 → 通関 → 配達。
// 楽楽販売（受注・明細・出荷管理）、入荷・在庫（入荷・出荷指示）、配送会社の最新状況を日付順に並べる。
// まだ起きていない段は灰色で最後に出し、最長納期は線の中に印を入れる（過ぎていれば赤）。

type Ev = { date: string; label: string; detail?: string; kind: 'done' | 'due' | 'late' | 'todo' };

// 入荷・在庫と配送会社のデータは画面を開くたびに取らないよう、1分だけ覚えておく
let invCache: { at: number; data: any } | null = null;
let carrierCache: { at: number; data: Record<string, CarrierStatus> } | null = null;
async function loadInventory() {
  if (invCache && Date.now() - invCache.at < 60000) return invCache.data;
  const r = await fetch('/api/inventory');
  const data = r.ok ? await r.json() : null;
  invCache = { at: Date.now(), data };
  return data;
}
async function loadCarrier() {
  if (carrierCache && Date.now() - carrierCache.at < 60000) return carrierCache.data;
  const r = await fetch('/api/carriers/statuses');
  const j = r.ok ? await r.json() : null;
  const map: Record<string, CarrierStatus> = {};
  for (const s of j?.statuses || []) map[digitsOf(s.trackingNo)] = s;
  carrierCache = { at: Date.now(), data: map };
  return map;
}

const WH: Record<string, string> = { domestic: '国内倉庫', korea: '韓国倉庫', singapore: 'シンガポール倉庫' };
const ymd = (d?: string | null) => {
  const v = d ? String(d).replace(/\//g, '-').slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
};
const val = (v?: string | null) => (v && v !== '—' && v !== '-' ? v : '');
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const todayYmd = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function OrderTimeline({ order, shipments }: { order: Order; shipments: ShipmentItem[] }) {
  const [inv, setInv] = useState<any>(invCache?.data || null);
  const [carrier, setCarrier] = useState<Record<string, CarrierStatus>>(carrierCache?.data || {});
  useEffect(() => {
    let live = true;
    loadInventory().then((d) => live && setInv(d)).catch(() => {});
    loadCarrier().then((d) => live && setCarrier(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [order.orderId]);

  const { events, summary } = useMemo(() => {
    const today = todayYmd();
    const lines = order.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
    const ev: Ev[] = [];
    const todo: string[] = [];
    const cancelled = /キャンセル/.test(order.status || '');

    // 受注
    if (ymd(order.orderDate)) ev.push({ date: ymd(order.orderDate), label: '受注', detail: `${lines.length}明細`, kind: 'done' });

    // 入金
    const paid = order.paymentStatus === '入金済' || order.paymentStatus === '売掛・締日決済';
    if (paid && ymd(order.paymentDate)) ev.push({ date: ymd(order.paymentDate), label: '入金', detail: order.paymentStatus, kind: 'done' });
    else if (order.paymentStatus === '売掛・締日決済') ev.push({ date: ymd(order.orderDate), label: '入金', detail: '売掛・締日決済', kind: 'done' });
    else todo.push('入金');

    // 発注（発注日ごとにまとめる）
    const byPo = new Map<string, Set<string>>();
    for (const l of lines) {
      const d = ymd(l.poDate);
      if (!d) continue;
      (byPo.get(d) || byPo.set(d, new Set()).get(d)!).add(l.supplierName === '在庫' ? '在庫から' : l.supplierName || '仕入先');
    }
    for (const [d, sups] of byPo) ev.push({ date: d, label: '発注', detail: Array.from(sups).join('・'), kind: 'done' });
    const unordered = lines.filter((l) => l.stage === '未発注').length;
    if (unordered) todo.push(`発注（未発注 ${unordered}明細）`);

    // 入荷（この受注の発注が倉庫に届いた日）
    const inbound = (inv?.inbound || []).filter((r: any) => r.orderId === order.orderId && !r.cancelled && !r.excluded);
    for (const r of inbound) {
      if (r.received && ymd(r.receivedAt)) ev.push({ date: ymd(r.receivedAt), label: '入荷', detail: `${WH[r.warehouse] || ''} ${r.supplierName}`.trim(), kind: 'done' });
    }
    const waitingIn = inbound.filter((r: any) => !r.received);
    if (waitingIn.length) todo.push(`入荷（${waitingIn.map((r: any) => r.stateLabel || '入荷待ち').join('・')}）`);

    // 出荷指示・送り状
    const sis = (inv?.instructions || []).filter((i: any) => i.orderId === order.orderId && i.status !== 'cancelled');
    for (const i of sis) {
      ev.push({ date: ymd(i.createdAt), label: '出荷指示', detail: `${i.id} ${i.warehouseName || ''}`.trim(), kind: 'done' });
      if (i.awbNo && i.awbCreatedAt) ev.push({ date: ymd(i.awbCreatedAt), label: '送り状', detail: `${i.awbCarrier || ''} ${i.awbNo}`.trim(), kind: 'done' });
    }

    // 出荷（楽楽販売の出荷管理）・通関・配達（配送会社）
    const myShips = shipments.filter((s) => s.orderId === order.orderId);
    let deliveredAny = '';
    for (const s of myShips) {
      const nos = [s.trackingNo, ...(s.extraTrackingNos || [])].filter(Boolean);
      const st = nos.map((n) => carrier[digitsOf(n)]).find(Boolean);
      if (ymd(s.shippedDate)) ev.push({ date: ymd(s.shippedDate), label: '出荷', detail: [s.shipmentId, val(s.warehouse), st?.carrier?.toUpperCase(), val(s.trackingNo)].filter(Boolean).join(' '), kind: 'done' });
      if (st?.customsClearedAt) ev.push({ date: ymd(st.customsClearedAt), label: '通関', detail: s.arrivalAirport ? `${s.arrivalAirport} で通関` : '通関済み', kind: 'done' });
      if (st?.deliveredAt) {
        ev.push({ date: ymd(st.deliveredAt), label: '配達', detail: s.shipmentId, kind: 'done' });
        deliveredAny = ymd(st.deliveredAt);
      } else if (ymd(s.shippedDate) && st && st.status !== 'delivered') {
        todo.push(`配達（${st.statusText || '輸送中'}${st.lastLocation ? `・${st.lastLocation}` : ''}）`);
      }
    }
    // 出荷管理に登録済みで、まだ出荷日の無い出荷
    const notYet = myShips.filter((s) => !ymd(s.shippedDate)).map((s) => s.shipmentId);
    if (notYet.length) todo.push(`出荷待ち（${notYet.join('・')}）`);
    // 明細の出荷日しか無いとき（出荷管理に無い出荷）
    if (!myShips.some((s) => ymd(s.shippedDate))) {
      const shipDates = new Set(lines.map((l) => ymd(l.shippedDate)).filter(Boolean));
      for (const d of shipDates) ev.push({ date: d, label: '出荷', detail: lines.filter((l) => ymd(l.shippedDate) === d).map((l) => l.trackingNo).filter(Boolean).join(' '), kind: 'done' });
    }
    const unshipped = lines.filter((l) => (l.remainingQty ?? l.quantity - (l.shippedQty || 0)) > 0).length;
    if (unshipped && !cancelled) todo.push(`出荷（残り ${unshipped}明細）`);
    if (ymd(order.deliveredDate) && !deliveredAny) ev.push({ date: ymd(order.deliveredDate), label: '納品完了', kind: 'done' });

    // 最長納期の印：まだ出荷していない明細の納期ごと（全部出荷済みなら一番遅い納期）
    const remainingOf = (l: (typeof lines)[number]) => l.remainingQty ?? Math.max(0, l.quantity - (l.shippedQty || 0));
    const lastShip = lines.map((l) => ymd(l.shippedDate)).filter(Boolean).sort().pop() || '';
    const openDues = Array.from(new Set(lines.filter((l) => remainingOf(l) > 0).map((l) => ymd(l.latestDate)).filter(Boolean))).sort();
    let dueText = '';
    if (openDues.length && !cancelled) {
      for (const due of openDues) {
        const n = lines.filter((l) => remainingOf(l) > 0 && ymd(l.latestDate) === due).length;
        const late = today > due;
        ev.push({ date: due, label: '最長納期', detail: `${n}明細・${late ? `${days(due, today)}日超過` : `あと${days(today, due)}日`}`, kind: late ? 'late' : 'due' });
        if (late) dueText = 'late';
      }
      if (!dueText) dueText = 'ok';
    } else {
      const due = lines.map((l) => ymd(l.latestDate)).filter(Boolean).sort().pop() || '';
      if (due && lastShip) {
        const late = lastShip > due;
        ev.push({ date: due, label: '最長納期', detail: late ? `${days(due, lastShip)}日遅れて出荷` : '納期内に出荷', kind: late ? 'late' : 'due' });
        dueText = late ? 'late' : 'ok';
      }
    }

    ev.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
    const total = ymd(order.orderDate) ? days(ymd(order.orderDate), deliveredAny || ymd(order.deliveredDate) || lastShip || today) : null;
    return { events: [...ev, ...todo.map((t): Ev => ({ date: '', label: t, kind: 'todo' }))], summary: { total, dueText, done: !unshipped, cancelled } };
  }, [order, shipments, inv, carrier]);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-800">この受注の流れ</h3>
        {summary.total !== null && (
          <span className="text-[11px] text-slate-500">
            受注から{summary.done ? '出荷完了まで' : '今日まで'} <b className="font-mono text-slate-800">{summary.total}</b>日
            {summary.dueText === 'late' && <span className="ml-1.5 font-bold text-rose-600">納期遅れ</span>}
            {summary.dueText === 'ok' && summary.done && <span className="ml-1.5 font-bold text-emerald-700">納期内</span>}
          </span>
        )}
      </div>
      <ol className="relative ml-2 border-l-2 border-slate-200">
        {events.map((e, i) => (
          <li key={i} className="relative pl-4 pb-2 last:pb-0">
            <span
              className={`absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ${
                e.kind === 'done' ? 'bg-emerald-500 text-white' : e.kind === 'late' ? 'bg-rose-600 text-white' : e.kind === 'due' ? 'bg-indigo-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-300'
              }`}
            >
              {e.kind === 'done' ? <Check className="h-2.5 w-2.5" /> : e.kind === 'todo' ? <Circle className="h-1.5 w-1.5" /> : <Clock className="h-2.5 w-2.5" />}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="w-11 shrink-0 font-mono text-slate-500">{e.date ? md(e.date) : 'まだ'}</span>
              <span className={`font-bold ${e.kind === 'todo' ? 'text-slate-400' : e.kind === 'late' ? 'text-rose-600' : e.kind === 'due' ? 'text-indigo-700' : 'text-slate-900'}`}>{e.label}</span>
              {e.detail && <span className={`text-[11px] ${e.kind === 'late' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{e.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
