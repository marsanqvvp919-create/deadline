import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InvoicePdfButtons } from '../invoice/InvoiceDialog';
import { AwbDownloadButton } from '../invoice/AwbDialog';
import { CheckCircle2, ClipboardList, History, Loader2, Lock, LogOut, PackageCheck, PackageMinus, RefreshCw, Search, Send, Truck, Warehouse } from 'lucide-react';
import { askConfirm, ConfirmHost } from '../components/flow/Confirm';
import { ErrorNote } from '../components/flow/Messages';

// 倉庫の担当者の画面（/warehouse/:slug）。自分の倉庫の入荷予定だけを見て、届いた実数を入れて承認・出庫する。
// 日本語と英語を並べて表示する（韓国・シンガポールの倉庫の担当者向け）

interface Line {
  key: string;
  productName: string;
  qty: number;
  receivedQty: number | null;
  arrivedQty: number | null;
  damagedQty: number | null;
  inspect: 'ok' | 'ng' | null;
  inspectNote: string;
}
interface Inbound {
  poId: string;
  poDate: string;
  supplierName: string;
  supplierArea?: string;
  orderId: string;
  lines: Line[];
  method: string;
  trackingNos: string[];
  tracking: { trackingNo: string; carrier: string; status: string; statusText: string; lastLocation: string }[];
  state: string;
  stateLabel: string;
  received: boolean;
  receivedAt: string | null;
  receivedMemo: string;
  shortage: boolean;
  vendorShippedAt?: string | null;
  vendorCarrier?: string;
  vendorMemo?: string;
  vendorQtyChanges?: { productName: string; from: number; to: number }[];
  updatedAt?: string;
}
interface StockRow {
  key: string;
  productName: string;
  qty: number;
  reserved: number;
  available: number;
  updatedAt: string;
}
interface Instruction {
  id: string;
  orderId: string;
  lines: { productName: string; qty: number; cool?: boolean }[];
  cool?: boolean;
  status: 'open' | 'shipped' | 'cancelled';
  memo: string;
  carrier: string;
  trackingNos: string[];
  createdAt: string;
  shippedAt?: string;
  invoiceNo?: string;
  awbNo?: string;
  awbCarrier?: string;
  awbLabel?: boolean;
  destination: { name: string; nameEn: string; director: string; postalCode: string; address: string; addressEn: string; phone: string };
}
interface Move {
  id: string;
  at: string;
  productName: string;
  delta: number;
  type: string;
  ref?: string;
  memo?: string;
}
interface Data {
  warehouse: string;
  name: string;
  inbound: Inbound[];
  stock: StockRow[];
  moves: Move[];
  instructions: Instruction[];
}

const STATE_EN: Record<string, string> = {
  no_tracking: 'Awaiting tracking no.',
  vendor_shipped: 'Shipped by supplier – awaiting arrival',
  tracking: 'Tracking',
  in_transit: 'In transit',
  arrived: 'Arrived – please confirm',
  kick: 'Quick delivery (no tracking) – please confirm',
  handcarry: 'Hand-carried – please confirm',
  received: 'Received',
  shortage: 'Received (short)',
};
const NAME_EN: Record<string, string> = { korea: 'Korea warehouse', singapore: 'Singapore warehouse' };
const MOVE_LABEL: Record<string, string> = { inbound: '入荷 In', outbound: '出庫 Out', adjust: '修正 Adjust', import: '取込 Import', unreceive: '取消 Undo' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// /warehouse/demokorea・demosingapore はサンプル（ログインなし・実データに影響しない）
let demoMode = false;
const demoHeader = (): Record<string, string> => (demoMode ? { 'x-demo': '1' } : {});

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...demoHeader(), ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `Error (${r.status})`), { status: r.status });
  return j;
}

function Login({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState<{ ja: string; en: string } | null>(null);
  const [notFound, setNotFound] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/warehouse/info/${slug}`)
      .then((j) => setName({ ja: j.name, en: NAME_EN[j.warehouse] || '' }))
      .catch((e) => setNotFound(e.message));
  }, [slug]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/warehouse/login', { method: 'POST', body: JSON.stringify({ slug, password }) });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Warehouse className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{name ? `${name.ja} / ${name.en}` : '倉庫 / Warehouse'}</div>
            <div className="text-[11px] text-slate-500">入荷・在庫 / Inbound & stock</div>
          </div>
        </div>
        {notFound ? (
          <p className="text-sm text-rose-600">{notFound}</p>
        ) : (
          <>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード / Password"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm"
              />
            </div>
            {error && <ErrorNote message={error} compact />}
            <button type="submit" disabled={busy || !password} className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-bold disabled:opacity-50">
              {busy ? '…' : 'ログイン / Log in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// 入荷の区分（倉庫の担当者向け）
type Bucket = 'arrived' | 'coming' | 'waiting' | 'done';
const bucketOf = (r: Inbound): Bucket =>
  r.received
    ? 'done'
    : ['arrived', 'kick', 'handcarry'].includes(r.state) || r.lines.some((l) => l.inspect || l.arrivedQty !== null)
      ? 'arrived'
      : ['tracking', 'in_transit', 'vendor_shipped'].includes(r.state)
        ? 'coming'
        : 'waiting';
const BUCKETS: { id: Bucket; ja: string; en: string; cls: string; on: string }[] = [
  { id: 'arrived', ja: '届いた・検品待ち', en: 'Arrived – inspect', cls: 'border-violet-300 bg-violet-50 text-violet-800', on: 'bg-violet-600 border-violet-600 text-white' },
  { id: 'coming', ja: '発送済み・輸送中', en: 'Shipped – on the way', cls: 'border-sky-300 bg-sky-50 text-sky-800', on: 'bg-sky-600 border-sky-600 text-white' },
  { id: 'waiting', ja: '仕入先の発送待ち', en: 'Not shipped yet', cls: 'border-slate-300 bg-white text-slate-700', on: 'bg-slate-700 border-slate-700 text-white' },
  { id: 'done', ja: '入荷済み', en: 'Received', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', on: 'bg-emerald-600 border-emerald-600 text-white' },
];
const totalQty = (r: Inbound) => r.lines.reduce((n, l) => n + l.qty, 0);

/** 入荷の一覧：どこから・何が・いくつ届くかを一括で見る。行を押すと詳細と検品 */
function InboundBoard({ list, slug, onDone }: { list: Inbound[]; slug: string; onDone: () => void }) {
  const [bucket, setBucket] = useState<Bucket | 'all'>('all');
  const [supplier, setSupplier] = useState<string>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { arrived: 0, coming: 0, waiting: 0, done: 0 };
    list.forEach((r) => c[bucketOf(r)]++);
    return c;
  }, [list]);
  const active = list.filter((r) => (bucket === 'all' ? bucketOf(r) !== 'done' : bucketOf(r) === bucket));
  const suppliers = useMemo(() => {
    const m = new Map<string, { name: string; area: string; pos: number; qty: number }>();
    active.forEach((r) => {
      const s = m.get(r.supplierName) || { name: r.supplierName, area: r.supplierArea || '', pos: 0, qty: 0 };
      s.pos++;
      s.qty += totalQty(r);
      m.set(r.supplierName, s);
    });
    return Array.from(m.values()).sort((a, b) => b.pos - a.pos);
  }, [active]);
  const needle = q.trim().toLowerCase();
  const rows = active
    .filter((r) => supplier === 'all' || r.supplierName === supplier)
    .filter((r) => !needle || r.poId.toLowerCase().includes(needle) || r.supplierName.toLowerCase().includes(needle) || r.lines.some((l) => l.productName.toLowerCase().includes(needle)))
    .sort((a, b) => BUCKETS.findIndex((x) => x.id === bucketOf(a)) - BUCKETS.findIndex((x) => x.id === bucketOf(b)) || (a.poDate || '').localeCompare(b.poDate || ''));
  const openRec = list.find((r) => r.poId === open) || null;
  return (
    <div className="space-y-3">
      {/* 状態ごとの件数（押すと絞り込み） */}
      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const on = bucket === b.id;
          return (
            <button
              key={b.id}
              onClick={() => {
                setBucket(on ? 'all' : b.id);
                setSupplier('all');
              }}
              className={`rounded-xl border-2 px-4 py-2 text-left transition ${on ? b.on : b.cls}`}
            >
              <div className="text-[13px] font-bold">{b.ja}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] opacity-80">{b.en}</span>
                <span className="text-xl font-bold font-mono">{counts[b.id]}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 仕入先ごと（どこから届くか） */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-700">仕入先 / From（{suppliers.length}）</div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="商品・発注ID / Item, PO" className="w-56 rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-xs" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setSupplier('all')} className={`rounded-full border px-3 py-1 text-xs font-bold ${supplier === 'all' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            すべて / All
          </button>
          {suppliers.map((s) => (
            <button
              key={s.name}
              onClick={() => setSupplier(supplier === s.name ? 'all' : s.name)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${supplier === s.name ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
            >
              <span className="font-bold">{s.name}</span>
              {s.area && <span className="opacity-70">{s.area}</span>}
              <span className="font-mono">{s.pos}件・{s.qty}個</span>
            </button>
          ))}
        </div>
      </div>

      {/* 一覧 */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left px-3 py-2">状態 / Status</th>
              <th className="text-left px-3 py-2">仕入先 / From</th>
              <th className="text-left px-3 py-2">発注 / PO</th>
              <th className="text-left px-3 py-2">商品 / Items</th>
              <th className="text-right px-3 py-2">数量 / Qty</th>
              <th className="text-left px-3 py-2">発送・追跡 / Shipping</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  該当する入荷はありません / Nothing here
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const b = BUCKETS.find((x) => x.id === bucketOf(r))!;
              const inspected = r.lines.filter((l) => l.inspect).length;
              return (
                <tr key={r.poId} onClick={() => setOpen(r.poId)} className="border-b border-slate-100 cursor-pointer hover:bg-indigo-50">
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.ja}</span>
                    {r.received && r.shortage && <div className="text-[11px] font-bold text-rose-600 mt-0.5">不足・不良あり / Short</div>}
                    {!r.received && inspected > 0 && <div className="text-[11px] text-violet-700 mt-0.5">検品 {inspected}/{r.lines.length}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-bold text-slate-900">{r.supplierName}</div>
                    <div className="text-[11px] text-slate-500">{r.supplierArea}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono font-bold text-indigo-700">{r.poId}</div>
                    <div className="text-[11px] text-slate-500">{r.poDate}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800">{r.lines[0]?.productName}</div>
                    {r.lines.length > 1 && <div className="text-[11px] text-slate-500">ほか {r.lines.length - 1}品目 / +{r.lines.length - 1} more</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{totalQty(r)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.vendorShippedAt && <div>発送 / Shipped {fmt(r.vendorShippedAt)}</div>}
                    {r.trackingNos.length > 0 && <div className="font-mono">{r.trackingNos.join(', ')}</div>}
                    {r.tracking[0] && <div className="text-[11px] text-slate-500">{r.tracking[0].statusText}</div>}
                    {!r.vendorShippedAt && r.trackingNos.length === 0 && <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openRec && (
        <InboundDetail
          key={openRec.poId + openRec.updatedAt}
          rec={openRec}
          slug={slug}
          onClose={() => setOpen(null)}
          onDone={(close) => {
            onDone();
            if (close) setOpen(null);
          }}
        />
      )}
    </div>
  );
}

/** 入荷の詳細と検品：届いた数・不良数・OK/NG を入れて、途中保存か確定（在庫に入れる） */
function InboundDetail({ rec, slug, onClose, onDone }: { rec: Inbound; slug: string; onClose: () => void; onDone: (close: boolean) => void }) {
  type Row = { arrived: string; damaged: string; inspect: 'ok' | 'ng' | null; note: string };
  const [rows, setRows] = useState<Record<string, Row>>(
    Object.fromEntries(rec.lines.map((l) => [l.key, { arrived: l.arrivedQty !== null ? String(l.arrivedQty) : '', damaged: l.damagedQty ? String(l.damagedQty) : '', inspect: l.inspect, note: l.inspectNote || '' }])),
  );
  const [memo, setMemo] = useState(rec.receivedMemo || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, patch: Partial<Row>) => setRows((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const isNum = (v: string) => /^\d+$/.test(v);
  const good = (l: Line) => (isNum(rows[l.key].arrived) ? Number(rows[l.key].arrived) - (isNum(rows[l.key].damaged) ? Number(rows[l.key].damaged) : 0) : null);
  const allDone = rec.lines.every((l) => rows[l.key].inspect && isNum(rows[l.key].arrived) && (rows[l.key].damaged === '' || isNum(rows[l.key].damaged)) && (good(l) ?? -1) >= 0);
  const issues = rec.lines.filter((l) => rows[l.key].inspect === 'ng' || (good(l) !== null && good(l)! !== l.qty));
  const payload = () =>
    rec.lines.map((l) => ({ key: l.key, arrivedQty: rows[l.key].arrived, damagedQty: rows[l.key].damaged || 0, inspect: rows[l.key].inspect, inspectNote: rows[l.key].note }));
  const call = async (path: string, body: object, close: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify({ slug, ...body }) });
      onDone(close);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const allOk = () =>
    setRows(Object.fromEntries(rec.lines.map((l) => [l.key, { ...rows[l.key], arrived: rows[l.key].arrived || String(l.qty), inspect: 'ok' as const }])));
  const confirm = async () => {
    const body = rec.lines.map((l) => `${l.productName}：在庫に入れる / To stock ${good(l)}`).join('\n');
    if (
      !(await askConfirm({
        title: `${rec.poId} を確定して在庫に入れます / Confirm and add to stock?`,
        body: issues.length ? `${body}\n\n予定と違う・NGの商品があります（社内に知らせます） / Some items differ – our office will be notified.` : body,
        okLabel: '確定する / Confirm',
        cancelLabel: 'やめる / Cancel',
      }))
    )
      return;
    call(`/api/warehouse/inbound/${rec.poId}/receive`, { memo, lines: payload() }, true);
  };
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="font-mono text-lg font-bold text-indigo-700">{rec.poId}</div>
            <div className="text-sm font-bold text-slate-900">
              {rec.supplierName} <span className="font-normal text-slate-500">{rec.supplierArea}</span>
            </div>
            <div className="text-xs text-slate-500">
              発注日 / PO date {rec.poDate || '—'}・{rec.stateLabel}（{STATE_EN[rec.state] || rec.state}）
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700">
            閉じる / Close
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {/* 発送の情報 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
            <div className="font-bold text-slate-700">発送の情報 / Shipping</div>
            <div>
              仕入先の発送 / Shipped by supplier：<b>{rec.vendorShippedAt ? fmt(rec.vendorShippedAt) : 'まだ / Not yet'}</b>
              {rec.vendorCarrier && `・${rec.vendorCarrier}`}
            </div>
            {rec.tracking.map((t) => (
              <div key={t.trackingNo} className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-bold">{t.trackingNo}</span> {t.carrier && <span className="uppercase">{t.carrier}</span>}：{t.statusText}
                {t.lastLocation && `（${t.lastLocation}）`}
              </div>
            ))}
            {rec.vendorMemo && <div>仕入先のメモ / Supplier note：{rec.vendorMemo}</div>}
            {(rec.vendorQtyChanges || []).length > 0 && (
              <div className="font-bold text-amber-700">仕入先が数量を変更 / Qty changed by supplier：{rec.vendorQtyChanges!.map((c) => `${c.productName} ${c.from}→${c.to}`).join('、')}</div>
            )}
          </div>

          {/* 検品 */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">検品・数量 / Inspection & quantity</div>
              {!rec.received && (
                <button onClick={allOk} className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                  すべて予定どおり・OK / All as expected
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-1.5">商品 / Item</th>
                  <th className="text-right py-1.5 w-16">予定 / Exp.</th>
                  <th className="text-right py-1.5 w-24">届いた数 / Arrived</th>
                  <th className="text-right py-1.5 w-20">不良 / Damaged</th>
                  <th className="text-right py-1.5 w-20">在庫へ / To stock</th>
                  <th className="text-center py-1.5 w-32">検品 / Check</th>
                </tr>
              </thead>
              <tbody>
                {rec.lines.map((l) => {
                  const r = rows[l.key];
                  const g = rec.received ? l.receivedQty : good(l);
                  const diff = g !== null && g !== l.qty;
                  return (
                    <React.Fragment key={l.key}>
                      <tr className="border-t border-slate-100">
                        <td className="pt-2 font-semibold text-slate-800">{l.productName}</td>
                        <td className="pt-2 text-right font-mono">{l.qty}</td>
                        <td className="pt-2 text-right">
                          {rec.received ? (
                            <span className="font-mono">{l.arrivedQty ?? '—'}</span>
                          ) : (
                            <input type="number" min={0} value={r.arrived} placeholder={String(l.qty)} onChange={(e) => set(l.key, { arrived: e.target.value })} className={`w-20 rounded-lg border-2 px-2 py-1 text-right font-mono font-bold ${r.arrived !== '' && Number(r.arrived) !== l.qty ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`} />
                          )}
                        </td>
                        <td className="pt-2 text-right">
                          {rec.received ? (
                            <span className="font-mono">{l.damagedQty || 0}</span>
                          ) : (
                            <input type="number" min={0} value={r.damaged} placeholder="0" onChange={(e) => set(l.key, { damaged: e.target.value })} className={`w-16 rounded-lg border-2 px-2 py-1 text-right font-mono ${Number(r.damaged) > 0 ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`} />
                          )}
                        </td>
                        <td className={`pt-2 text-right font-mono text-base font-bold ${g === null ? 'text-slate-300' : diff ? 'text-rose-600' : 'text-emerald-700'}`}>{g ?? '—'}</td>
                        <td className="pt-2 text-center">
                          {rec.received ? (
                            <span className={`text-xs font-bold ${l.inspect === 'ng' ? 'text-rose-600' : 'text-emerald-700'}`}>{l.inspect === 'ng' ? 'NG' : l.inspect === 'ok' ? 'OK' : '—'}</span>
                          ) : (
                            <div className="inline-flex overflow-hidden rounded-lg border-2 border-slate-300">
                              <button onClick={() => set(l.key, { inspect: r.inspect === 'ok' ? null : 'ok' })} className={`px-3 py-1 text-xs font-bold ${r.inspect === 'ok' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}>
                                OK
                              </button>
                              <button onClick={() => set(l.key, { inspect: r.inspect === 'ng' ? null : 'ng' })} className={`border-l-2 border-slate-300 px-3 py-1 text-xs font-bold ${r.inspect === 'ng' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600'}`}>
                                NG
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="pb-2 pt-1">
                          {rec.received ? (
                            l.inspectNote && <div className="text-[11px] text-slate-500">メモ / Note：{l.inspectNote}</div>
                          ) : (
                            (r.inspect === 'ng' || diff || r.note) && (
                              <input value={r.note} onChange={(e) => set(l.key, { note: e.target.value })} placeholder="理由（破損・数違い・期限など） / Reason (damage, wrong qty, expiry…)" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                            )
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rec.received ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              確定済み / Received {fmt(rec.receivedAt)}
              {rec.receivedMemo && `・${rec.receivedMemo}`}
            </div>
          ) : (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="全体のメモ / Overall note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {issues.length > 0 && <div className="text-xs font-semibold text-rose-600">予定と違う・NGの商品が {issues.length} 件あります（確定すると社内に知らせます） / {issues.length} item(s) differ.</div>}
              {error && <ErrorNote message={error} compact />}
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={busy} onClick={() => call(`/api/warehouse/inbound/${rec.poId}/inspect`, { lines: payload() }, false)} className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">
                  途中保存 / Save draft
                </button>
                <button disabled={busy || !allDone} onClick={confirm} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-base font-bold text-white disabled:opacity-40">
                  <CheckCircle2 className="w-5 h-5" />
                  確定して在庫に入れる / Confirm
                </button>
                {!allDone && <span className="text-xs text-slate-500">すべての商品の「届いた数」と OK/NG を入れると確定できます / Enter arrived qty and OK/NG for every item.</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstructionCard({ si, slug, onDone }: { si: Instruction; slug: string; onDone: () => void }) {
  const [carrier, setCarrier] = useState(si.awbCarrier || '');
  const [tracking, setTracking] = useState(si.awbNo || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const d = si.destination;
  const ship = async () => {
    if (!tracking.trim() && !(await askConfirm({ title: '追跡番号なしで出荷完了にします', body: 'Mark as shipped without a tracking number?', okLabel: '出荷完了にする / Ship', cancelLabel: 'やめる / Cancel', danger: true }))) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/warehouse/instructions/${si.id}/ship`, { method: 'POST', body: JSON.stringify({ slug, carrier, trackingNos: tracking }) });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`rounded-xl border bg-white p-4 space-y-3 ${si.status === 'open' ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono font-bold text-indigo-700">
            {si.id}
            {si.cool && <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">❄ クール便 / COOL</span>}
          </div>
          <div className="text-[11px] text-slate-500">
            指示日 / Issued {fmt(si.createdAt)}・注文 / Order {si.orderId}
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-1 rounded border ${si.status === 'open' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {si.status === 'open' ? '出荷待ち / To ship' : `出荷済み / Shipped ${fmt(si.shippedAt || null)}`}
        </span>
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-0.5">
        <div className="text-[11px] text-slate-500 font-bold">届け先 / Ship to</div>
        <div className="font-bold text-slate-900">
          {d.name} {d.nameEn && <span className="font-normal text-slate-500">/ {d.nameEn}</span>}
        </div>
        {d.director && <div>院長 / Attn: {d.director}</div>}
        <div>
          {d.postalCode && `〒${d.postalCode} `}
          {d.address}
        </div>
        {d.addressEn && <div className="text-slate-500">{d.addressEn}</div>}
        {d.phone && <div>TEL {d.phone}</div>}
      </div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="text-left py-1">商品 / Item</th>
            <th className="text-right py-1 w-24">数量 / Qty</th>
          </tr>
        </thead>
        <tbody>
          {si.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-50">
              <td className="py-1.5 font-semibold">
                {l.cool && <span className="mr-1 text-sky-600" title="クール便 / Keep cold">❄</span>}
                {l.productName}
              </td>
              <td className="py-1.5 text-right font-mono font-bold">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {si.memo && <div className="text-[11px] text-slate-600">メモ / Note: {si.memo}</div>}
      {si.awbNo && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-amber-800">
            AWB {si.awbCarrier} {si.awbNo}
          </span>
          {si.awbLabel && (
            <a href={`/api/warehouse/awb-label/${si.id}?slug=${slug}`} target="_blank" rel="noreferrer" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-800">
              ラベルを印刷 / Print label
            </a>
          )}
          {si.awbLabel && (
            <AwbDownloadButton
              url={`/api/warehouse/awb-label/${si.id}?slug=${slug}&download=1`}
              fileName={`AWB_${si.awbCarrier || ''}_${si.awbNo}_${si.id}.pdf`}
              label="ダウンロード / Download"
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-800 disabled:opacity-50"
            />
          )}
        </div>
      )}
      {si.invoiceNo ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-indigo-800">Invoice {si.invoiceNo}</span>
          <InvoicePdfButtons source={`/api/warehouse/invoice/${si.id}?slug=${slug}`} />
        </div>
      ) : (
        si.status === 'open' && <div className="text-[11px] text-amber-700">インボイスは本社で作成中です / Invoice will be issued by our office.</div>
      )}
      {si.status === 'open' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="配送業者 / Carrier (DHL, FedEx…)" className="rounded border border-slate-300 px-2.5 py-1.5 text-xs w-56" />
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="追跡番号 / Tracking no." className="flex-1 min-w-48 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono" />
          </div>
          {error && <ErrorNote message={error} compact />}
          <button disabled={busy} onClick={ship} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">
            <Send className="w-4 h-4" />
            出荷完了（在庫から引く） / Mark as shipped
          </button>
        </div>
      ) : (
        si.trackingNos.length > 0 && (
          <div className="text-[11px] font-mono text-slate-600">
            {si.carrier} {si.trackingNos.join('、')}
          </div>
        )
      )}
    </div>
  );
}

function Dashboard({ slug, onLogout }: { slug: string; onLogout: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'inbound' | 'ship' | 'stock' | 'moves'>('inbound');
  const [q, setQ] = useState('');
  const [out, setOut] = useState<{ key: string; name: string; max: number; qty: string; ref: string; memo: string } | null>(null);

  const load = useCallback(() => {
    setError('');
    api(`/api/warehouse/data?slug=${slug}`)
      .then(setData)
      .catch((e) => (e.status === 401 ? onLogout() : setError(e.message)));
  }, [slug, onLogout]);
  useEffect(load, [load]);

  const pending = useMemo(() => (data?.inbound || []).filter((r) => !r.received), [data]);
  const stock = (data?.stock || []).filter((s) => !q.trim() || s.productName.toLowerCase().includes(q.trim().toLowerCase()));

  const doOutbound = async () => {
    if (!out) return;
    try {
      await api('/api/warehouse/outbound', { method: 'POST', body: JSON.stringify({ slug, key: out.key, qty: Number(out.qty), ref: out.ref, memo: out.memo }) });
      setOut(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">{error || <Loader2 className="w-6 h-6 animate-spin" />}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900">
                {data.name} / {NAME_EN[data.warehouse]}
              </div>
              <div className="text-[11px] text-slate-500">入荷・在庫 / Inbound & stock</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="reload">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await fetch('/api/warehouse/logout', { method: 'POST' }).catch(() => {});
                onLogout();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold hover:bg-slate-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              ログアウト / Log out
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-2 flex gap-1.5">
          {(
            [
              ['inbound', `入荷 / Inbound（${pending.length}）`, Truck],
              ['ship', `出荷指示 / Shipping（${(data.instructions || []).filter((i) => i.status === 'open').length}）`, ClipboardList],
              ['stock', '在庫・出庫 / Stock & out', PackageCheck],
              ['moves', '履歴 / History', History],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border ${tab === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-4 space-y-3">
        {demoMode && <div className="rounded-lg bg-fuchsia-50 border border-fuchsia-300 text-fuchsia-900 text-xs font-bold px-3 py-2">サンプル表示です（実データには影響しません） / Sample data – nothing here is real.</div>}
        {error && <ErrorNote message={error} />}

        {tab === 'inbound' && <InboundBoard list={data.inbound} slug={slug} onDone={load} />}

        {tab === 'ship' && (
          <>
            {(data.instructions || []).length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">出荷指示はありません / No shipping instructions.</div>}
            {(data.instructions || [])
              .slice()
              .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1))
              .map((si) => (
                <InstructionCard key={si.id} si={si} slug={slug} onDone={load} />
              ))}
          </>
        )}

        {tab === 'stock' && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="商品名 / Item name" className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-xs" />
              </div>
            </div>
            {out && (
              <div className="p-3 bg-amber-50 border-b border-amber-200 space-y-2 text-xs">
                <div className="font-bold">
                  出庫 / Outbound：{out.name}（在庫 / Stock {out.max}）
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="number" min={1} max={out.max} value={out.qty} onChange={(e) => setOut({ ...out, qty: e.target.value })} placeholder="数量 / Qty" className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono" />
                  <input value={out.ref} onChange={(e) => setOut({ ...out, ref: e.target.value })} placeholder="出荷先・伝票番号 / Destination or ref." className="w-56 rounded border border-slate-300 px-2 py-1" />
                  <input value={out.memo} onChange={(e) => setOut({ ...out, memo: e.target.value })} placeholder="メモ / Note" className="w-48 rounded border border-slate-300 px-2 py-1" />
                  <button disabled={!(Number(out.qty) > 0 && Number(out.qty) <= out.max)} onClick={doOutbound} className="rounded bg-amber-600 text-white px-3 py-1 font-bold disabled:opacity-40">
                    出庫する / Ship out
                  </button>
                  <button onClick={() => setOut(null)} className="rounded border border-slate-300 px-3 py-1 font-bold">
                    やめる / Cancel
                  </button>
                </div>
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">商品 / Item</th>
                  <th className="text-right px-3 py-2 w-20">在庫 / Stock</th>
                  <th className="text-right px-3 py-2 w-24">引当済 / Reserved</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                      在庫はありません / No stock
                    </td>
                  </tr>
                )}
                {stock.map((s) => (
                  <tr key={s.key} className={s.qty <= 0 ? 'text-slate-400' : ''}>
                    <td className="px-3 py-2 font-semibold">{s.productName}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{s.qty}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">{s.reserved || ''}</td>
                    <td className="px-3 py-2 text-right">
                      {s.available > 0 && (
                        <button onClick={() => setOut({ key: s.key, name: s.productName, max: s.available, qty: '', ref: '', memo: '' })} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-800">
                          <PackageMinus className="w-3.5 h-3.5" />
                          出庫 / Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'moves' && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">日時 / Date</th>
                  <th className="text-left px-3 py-2">種類 / Type</th>
                  <th className="text-left px-3 py-2">商品 / Item</th>
                  <th className="text-right px-3 py-2">数量 / Qty</th>
                  <th className="text-left px-3 py-2">メモ / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.moves.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmt(m.at)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{MOVE_LABEL[m.type] || m.type}</td>
                    <td className="px-3 py-1.5 font-semibold">{m.productName}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${m.delta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="px-3 py-1.5 text-slate-600">{[m.ref, m.memo].filter(Boolean).join('・')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export function WarehouseApp({ slug }: { slug: string }) {
  demoMode = slug.startsWith('demo');
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    document.title = '入荷・在庫 / Inbound & stock';
    fetch(`/api/warehouse/data?slug=${slug}`, { headers: demoHeader() })
      .then((r) => setState(r.status === 401 ? 'out' : 'in'))
      .catch(() => setState('out'));
  }, [slug]);
  const logout = useCallback(() => setState('out'), []);
  if (state === 'checking') return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (state === 'out') return <Login slug={slug} onDone={() => setState('in')} />;
  return (
    <>
      <Dashboard slug={slug} onLogout={logout} />
      <ConfirmHost />
    </>
  );
}
