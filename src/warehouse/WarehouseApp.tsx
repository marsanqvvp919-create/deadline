import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InvoicePdfButtons } from '../invoice/InvoiceDialog';
import { CheckCircle2, ClipboardList, History, Loader2, Lock, LogOut, PackageCheck, PackageMinus, RefreshCw, Search, Send, Truck, Warehouse } from 'lucide-react';

// 倉庫の担当者の画面（/warehouse/:slug）。自分の倉庫の入荷予定だけを見て、届いた実数を入れて承認・出庫する。
// 日本語と英語を並べて表示する（韓国・シンガポールの倉庫の担当者向け）

interface Line {
  key: string;
  productName: string;
  qty: number;
  receivedQty: number | null;
}
interface Inbound {
  poId: string;
  poDate: string;
  supplierName: string;
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
  lines: { productName: string; qty: number }[];
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

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
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
            {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
            <button type="submit" disabled={busy || !password} className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-bold disabled:opacity-50">
              {busy ? '…' : 'ログイン / Log in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function InboundCard({ rec, slug, onDone }: { rec: Inbound; slug: string; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(rec.lines.map((l) => [l.key, String(l.receivedQty ?? l.qty)])));
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const short = rec.lines.some((l) => Number(qty[l.key]) < l.qty);
  const receive = async () => {
    if (!confirm(`${rec.poId} を承認して在庫に加えます。よろしいですか？\nConfirm receipt and add to stock?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/warehouse/inbound/${rec.poId}/receive`, { method: 'POST', body: JSON.stringify({ slug, memo, lines: rec.lines.map((l) => ({ key: l.key, receivedQty: Number(qty[l.key]) })) }) });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`rounded-xl border bg-white p-4 space-y-3 ${rec.received ? 'border-slate-200' : ['arrived', 'kick', 'handcarry'].includes(rec.state) ? 'border-violet-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono font-bold text-indigo-700">{rec.poId}</div>
          <div className="text-sm font-bold text-slate-900">{rec.supplierName}</div>
          <div className="text-[11px] text-slate-500">発注日 / PO date {rec.poDate || '—'}</div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-1 rounded border ${rec.received ? (rec.shortage ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200') : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
          {rec.stateLabel}
          <span className="block font-normal">{STATE_EN[rec.state] || ''}</span>
        </span>
      </div>
      {rec.tracking.length > 0 && (
        <div className="space-y-0.5">
          {rec.tracking.map((t) => (
            <div key={t.trackingNo} className="text-[11px] text-slate-600 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-bold">{t.trackingNo}</span> {t.carrier && <span className="uppercase">{t.carrier}</span>}：{t.statusText}
              {t.lastLocation && `（${t.lastLocation}）`}
            </div>
          ))}
        </div>
      )}
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="text-left py-1">商品 / Item</th>
            <th className="text-right py-1 w-24">予定 / Expected</th>
            <th className="text-right py-1 w-28">入荷数 / Received</th>
          </tr>
        </thead>
        <tbody>
          {rec.lines.map((l) => (
            <tr key={l.key} className="border-b border-slate-50">
              <td className="py-1.5 font-semibold text-slate-800">{l.productName}</td>
              <td className="py-1.5 text-right font-mono">{l.qty}</td>
              <td className="py-1.5 text-right">
                {rec.received ? (
                  <span className={`font-mono font-bold ${(l.receivedQty ?? 0) < l.qty ? 'text-rose-600' : 'text-emerald-700'}`}>{l.receivedQty}</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    value={qty[l.key] ?? ''}
                    onChange={(e) => setQty({ ...qty, [l.key]: e.target.value })}
                    className={`w-20 rounded border px-1.5 py-1 text-right font-mono ${Number(qty[l.key]) < l.qty ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rec.received ? (
        <div className="text-[11px] text-slate-500">
          承認 / Received {fmt(rec.receivedAt)}
          {rec.receivedMemo && `・${rec.receivedMemo}`}
        </div>
      ) : (
        <div className="space-y-2">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ（不足・破損など） / Note (shortage, damage…)" className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs" />
          {short && <div className="text-[11px] text-rose-600 font-semibold">予定より少ない商品があります（不足として社内に知らせます） / Some items are short – our team will be notified.</div>}
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <button disabled={busy} onClick={receive} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">
            <CheckCircle2 className="w-4 h-4" />
            承認して在庫に入れる / Confirm receipt
          </button>
        </div>
      )}
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
    if (!tracking.trim() && !confirm('追跡番号なしで出荷完了にします。よろしいですか？\nMark as shipped without a tracking number?')) return;
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
          <div className="font-mono font-bold text-indigo-700">{si.id}</div>
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
              <td className="py-1.5 font-semibold">{l.productName}</td>
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
          {error && <div className="text-xs text-rose-600">{error}</div>}
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
  const [showReceived, setShowReceived] = useState(false);
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
  const received = useMemo(() => (data?.inbound || []).filter((r) => r.received), [data]);
  const ready = pending.filter((r) => ['arrived', 'kick', 'handcarry'].includes(r.state));
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
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
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-1.5">
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
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}

        {tab === 'inbound' && (
          <>
            {ready.length > 0 && (
              <div className="rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-xs font-semibold px-3 py-2">
                承認待ち {ready.length}件：届いた数を確認して「承認」を押してください / {ready.length} delivery(ies) waiting for your confirmation.
              </div>
            )}
            {pending.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">入荷予定はありません / No inbound deliveries.</div>}
            {[...ready, ...pending.filter((r) => !ready.includes(r))].map((r) => (
              <InboundCard key={r.poId} rec={r} slug={slug} onDone={load} />
            ))}
            {received.length > 0 && (
              <button onClick={() => setShowReceived(!showReceived)} className="text-xs font-bold text-indigo-700 hover:underline">
                {showReceived ? '入荷済みを隠す / Hide received' : `入荷済みを表示（${received.length}） / Show received`}
              </button>
            )}
            {showReceived && received.map((r) => <InboundCard key={r.poId} rec={r} slug={slug} onDone={load} />)}
          </>
        )}

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
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    document.title = '入荷・在庫 / Inbound & stock';
    fetch(`/api/warehouse/data?slug=${slug}`)
      .then((r) => setState(r.status === 401 ? 'out' : 'in'))
      .catch(() => setState('out'));
  }, [slug]);
  const logout = useCallback(() => setState('out'), []);
  if (state === 'checking') return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (state === 'out') return <Login slug={slug} onDone={() => setState('in')} />;
  return <Dashboard slug={slug} onLogout={logout} />;
}
