import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Lock, LogOut, Package, RefreshCw, RotateCcw, Truck } from 'lucide-react';
import { askConfirm, ConfirmHost } from '../components/flow/Confirm';
import { ErrorNote } from '../components/flow/Messages';

// 仕入先の画面（/vendor/:slug）。自分あての発注を見て、発送したら「発送済み」を押す。
// 海外の仕入先向けに英語を先に、日本語を並べて表示する。お客様名・金額は出さない

interface Po {
  poId: string;
  poDate: string;
  shipTo: string;
  shipToEn: string;
  lines: { key: string; productName: string; qty: number }[];
  shipped: boolean;
  shippedAt: string | null;
  shippedBy: 'vendor' | 'staff' | 'rakuraku' | null;
  carrier: string;
  trackingNos: string[];
  memo: string;
  received: boolean;
  receivedAt: string | null;
}
interface Data {
  name: string;
  pos: Po[];
  syncedAt: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `Error (${r.status})`), { status: r.status });
  return j;
}

function Login({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [notFound, setNotFound] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/vendor/info/${slug}`)
      .then((j) => setName(j.name))
      .catch((e) => setNotFound(e.message));
  }, [slug]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/vendor/login', { method: 'POST', body: JSON.stringify({ slug, password }) });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{name || 'Supplier'}</div>
            <div className="text-xs text-slate-500">Purchase orders / 発注</div>
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
                placeholder="Password / パスワード"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm"
              />
            </div>
            {error && <ErrorNote message={error} compact />}
            <button type="submit" disabled={busy || !password} className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-bold disabled:opacity-50">
              {busy ? '…' : 'Log in / ログイン'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function PoCard({ po, slug, onDone }: { po: Po; slug: string; onDone: () => void }) {
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (path: string, body: object) => {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify({ slug, ...body }) });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const ship = async () => {
    if (
      !(await askConfirm({
        title: `Mark ${po.poId} as shipped?`,
        body: tracking.trim() ? `Tracking: ${tracking.trim()}` : 'No tracking number entered. You can still mark it as shipped. / 追跡番号なしで発送済みにします',
        okLabel: 'Shipped / 発送済みにする',
        cancelLabel: 'Cancel / やめる',
      }))
    )
      return;
    run(`/api/vendor/po/${po.poId}/ship`, { trackingNos: tracking, carrier, memo });
  };
  const status = po.received
    ? { label: 'Received by warehouse / 倉庫で受け取り済み', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : po.shipped
      ? { label: 'Shipped / 発送済み', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
      : { label: 'To ship / 発送待ち', cls: 'bg-amber-50 text-amber-800 border-amber-300' };
  return (
    <div className={`rounded-xl border-2 bg-white p-4 space-y-3 ${!po.shipped ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-lg font-bold text-indigo-700">{po.poId}</div>
          <div className="text-xs text-slate-500">
            PO date / 発注日 <b className="text-slate-700">{po.poDate || '—'}</b>
          </div>
          <div className="text-xs text-slate-500">
            Ship to / 送り先 <b className="text-slate-700">{po.shipToEn}</b>（{po.shipTo}）
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${status.cls}`}>{status.label}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="text-left py-1">Item / 商品</th>
            <th className="text-right py-1 w-28">Qty / 数量</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l) => (
            <tr key={l.key} className="border-b border-slate-50">
              <td className="py-1.5 font-semibold text-slate-800">{l.productName}</td>
              <td className="py-1.5 text-right font-mono text-base font-bold">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {po.shipped ? (
        <div className="space-y-1 text-xs text-slate-600">
          <div>
            Shipped / 発送 <b>{fmt(po.shippedAt)}</b>
            {po.carrier && `・${po.carrier}`}
          </div>
          {po.trackingNos.length > 0 && (
            <div className="flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-bold">{po.trackingNos.join(', ')}</span>
            </div>
          )}
          {po.memo && <div>Note / メモ: {po.memo}</div>}
          {po.received && <div className="text-emerald-700 font-bold">Received / 受け取り {fmt(po.receivedAt)}</div>}
          {!po.received && po.shippedBy === 'vendor' && (
            <button disabled={busy} onClick={() => run(`/api/vendor/po/${po.poId}/unship`, {})} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 underline">
              <RotateCcw className="w-3.5 h-3.5" />
              Undo (not shipped yet) / 取り消す
            </button>
          )}
          {error && <ErrorNote message={error} compact />}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking no. (optional) / 追跡番号（任意）" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier (DHL, FedEx…)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Note (optional, e.g. partial shipment) / メモ（任意）" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          {error && <ErrorNote message={error} compact />}
          <button disabled={busy} onClick={ship} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-5 py-2.5 text-base font-bold disabled:opacity-50">
            <CheckCircle2 className="w-5 h-5" />
            Shipped / 発送済みにする
          </button>
        </div>
      )}
    </div>
  );
}

export function VendorApp({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'toShip' | 'shipped'>('toShip');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/api/vendor/data?slug=${encodeURIComponent(slug)}`));
      setNeedLogin(false);
    } catch (e: any) {
      if (e.status === 401) setNeedLogin(true);
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    document.title = data ? `${data.name} | Purchase orders` : 'Purchase orders';
  }, [data]);

  if (needLogin) return <Login slug={slug} onDone={load} />;
  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2">
        {error ? <ErrorNote message={error} /> : <Loader2 className="w-5 h-5 animate-spin" />}
      </div>
    );
  const toShip = data.pos.filter((p) => !p.shipped);
  const shipped = data.pos.filter((p) => p.shipped);
  const list = tab === 'toShip' ? toShip : shipped;
  return (
    <div className="min-h-screen bg-slate-50">
      <ConfirmHost />
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">{data.name}</div>
              <div className="text-xs text-slate-500">Purchase orders from No1 / 発注一覧</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={async () => {
                await api('/api/vendor/logout', { method: 'POST' }).catch(() => {});
                setData(null);
                setNeedLogin(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2">
          {(
            [
              ['toShip', 'To ship / 発送待ち', toShip.length],
              ['shipped', 'Shipped / 発送済み', shipped.length],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-[15px] font-bold ${tab === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}
            >
              {label}
              <span className="text-xl font-mono">{n}</span>
            </button>
          ))}
        </div>
        {tab === 'toShip' && toShip.length > 0 && <p className="text-sm text-slate-600">When you ship an order, press “Shipped”. A tracking number helps us, but is optional. / 発送したら「発送済みにする」を押してください。</p>}
        {list.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">{tab === 'toShip' ? 'No orders to ship. / 発送待ちの発注はありません' : 'Nothing shipped in the last 60 days. / 直近60日の発送はありません'}</div>
        ) : (
          list.map((po) => <PoCard key={po.poId} po={po} slug={slug} onDone={load} />)
        )}
      </main>
    </div>
  );
}
