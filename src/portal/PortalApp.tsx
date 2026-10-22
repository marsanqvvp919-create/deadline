import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Loader2, LogOut, Package, Truck, CheckCircle2, Clock, Search, ChevronDown, ChevronRight, Building2, RefreshCw } from 'lucide-react';

// お客様の管理画面（/portal/:slug）。社内の画面とは別の入口で、グループに入っている院のデータだけを表示する

interface PortalLine {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
  earliestDate: string | null;
  latestDate: string | null;
  shippedDate: string | null;
  stage: string;
}
interface PortalOrder {
  orderId: string;
  clinicId: string;
  clinicName: string;
  orderDate: string;
  status: string;
  orderState: string;
  paymentStatus: string;
  totalAmount: number;
  lines: PortalLine[];
}
interface PortalTracking {
  trackingNo: string;
  carrier: string;
  status: string;
  statusText: string;
  lastEventAt: string | null;
  lastLocation: string | null;
  deliveredAt: string | null;
  estimatedDelivery: string | null;
  customsCleared: boolean;
  arrivedJapan: boolean;
}
interface PortalShipment {
  shipmentId: string;
  orderId: string;
  shipStatus: string;
  shippedDate: string | null;
  deliveredDate: string | null;
  courier: string;
  trackingNos: string[];
  tracking: PortalTracking[];
  items: string[];
}
interface PortalData {
  group: { name: string };
  clinics: { clinicId: string; clinicName: string; address: string }[];
  orders: PortalOrder[];
  shipments: PortalShipment[];
  generatedAt: string | null;
}

const CARRIER_LABEL: Record<string, string> = { dhl: 'DHL', fedex: 'FedEx', sagawa: '佐川急便', yamato: 'ヤマト運輸', japanpost: '日本郵便' };
const yen = (n: number | null | undefined) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`);
const day = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v.replace(/\//g, '-'));
  return Number.isNaN(d.getTime()) ? v : `${d.getMonth() + 1}/${d.getDate()}`;
};
const isFee = (name: string) => /送料|手数料/.test(name || '');

type Step = { key: string; label: string };
const STEPS: Step[] = [
  { key: 'ordered', label: 'ご注文' },
  { key: 'preparing', label: '手配中' },
  { key: 'shipped', label: '発送済み' },
  { key: 'transit', label: '配送中' },
  { key: 'delivered', label: 'お届け済み' },
];

function shipmentStep(s: PortalShipment): number {
  if (s.deliveredDate || s.tracking.some((t) => t.status === 'delivered')) return 4;
  if (s.tracking.some((t) => t.status === 'in_transit' || t.status === 'exception' || t.arrivedJapan)) return 3;
  if (s.shippedDate || s.shipStatus === '出荷済み') return 2;
  return 1;
}
function orderStep(o: PortalOrder, ships: PortalShipment[]): number {
  const products = o.lines.filter((l) => !isFee(l.productName));
  const allShipped = products.length > 0 && products.every((l) => l.stage === '出荷完了' || !!l.shippedDate);
  if (ships.length > 0 && allShipped) return Math.min(...ships.map(shipmentStep));
  if (o.status === '出荷済み' || o.status === '納品済み') return ships.length > 0 ? Math.min(...ships.map(shipmentStep)) : 4;
  if (products.some((l) => l.stage && l.stage !== '未発注')) return 1;
  return 0;
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full ${i <= step ? (step === 4 ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-slate-200'}`} />
            <span className={`mt-1 text-[10px] whitespace-nowrap ${i === step ? 'font-bold text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 min-w-3 -mt-3.5 ${i < step ? (step === 4 ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-slate-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function PortalLogin({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/info/${slug}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'このURLは使えません');
        setName(j.name);
      })
      .catch((e) => setNotFound(e.message));
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'ログインできませんでした');
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">{name || 'ご注文・配送状況'}</h1>
            <p className="text-xs text-slate-500">ご注文・配送状況の確認ページ</p>
          </div>
        </div>
        {notFound ? (
          <p className="text-sm text-rose-600">{notFound}</p>
        ) : (
          <>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="お知らせしたパスワード"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={busy || !password} className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-bold disabled:opacity-50">
              {busy ? 'ログイン中…' : 'ログイン'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function ShipmentCard({ s }: { s: PortalShipment }) {
  const step = shipmentStep(s);
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          {s.items.length > 0 ? s.items.join('・') : '発送分'}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            step === 4 ? 'bg-emerald-100 text-emerald-700' : step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {STEPS[step].label}
        </span>
      </div>
      <div className="text-[11px] text-slate-500">
        発送日 {day(s.shippedDate)}
        {s.deliveredDate ? `・お届け日 ${day(s.deliveredDate)}` : ''}
      </div>
      {s.tracking.length > 0 ? (
        <div className="space-y-1.5">
          {s.tracking.map((t) => (
            <div key={t.trackingNo} className="rounded-md bg-white border border-slate-200 px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-bold text-slate-700">{CARRIER_LABEL[t.carrier] || t.carrier}</span>
                <span className="font-mono text-slate-500">{t.trackingNo}</span>
              </div>
              <div className="text-xs text-slate-800 mt-0.5">{t.statusText}</div>
              <div className="text-[11px] text-slate-500">
                {t.lastLocation ? `${t.lastLocation}・` : ''}
                {t.lastEventAt ? new Date(t.lastEventAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                {t.estimatedDelivery && !t.deliveredAt ? `・お届け予定 ${day(t.estimatedDelivery)}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : s.trackingNos.length > 0 ? (
        <div className="text-[11px] text-slate-500">追跡番号：{s.trackingNos.join('、')}（配送状況を確認中）</div>
      ) : (
        <div className="text-[11px] text-slate-400">追跡番号は発送後に表示されます</div>
      )}
    </div>
  );
}

function OrderRow({ o, ships }: { o: PortalOrder; ships: PortalShipment[] }) {
  const [open, setOpen] = useState(false);
  const step = orderStep(o, ships);
  const products = o.lines.filter((l) => !isFee(l.productName));
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 hover:bg-slate-50 grid grid-cols-1 md:grid-cols-[1fr_260px_110px] gap-2 md:gap-4 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            <span className="font-bold text-slate-900 truncate">{o.clinicName}</span>
            <span className="text-[11px] text-slate-400 shrink-0">No.{o.orderId}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 pl-6 truncate">
            {day(o.orderDate)} ご注文・{products.map((l) => `${l.productName}×${l.quantity}`).join('、')}
          </div>
        </div>
        <div className="pl-6 md:pl-0">
          <StepBar step={step} />
        </div>
        <div className="text-sm font-bold text-slate-900 pl-6 md:pl-0 md:text-right">{yen(o.totalAmount)}</div>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-10 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-bold px-2.5 py-1.5">商品</th>
                  <th className="text-right font-bold px-2.5 py-1.5">数量</th>
                  <th className="text-right font-bold px-2.5 py-1.5">金額</th>
                  <th className="text-right font-bold px-2.5 py-1.5">お届け予定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.lines.map((l, i) => (
                  <tr key={i} className={isFee(l.productName) ? 'text-slate-500' : ''}>
                    <td className="px-2.5 py-1.5">{l.productName}</td>
                    <td className="px-2.5 py-1.5 text-right">{l.quantity}</td>
                    <td className="px-2.5 py-1.5 text-right">{yen(l.lineAmount)}</td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {l.shippedDate ? `発送 ${day(l.shippedDate)}` : isFee(l.productName) ? '' : l.earliestDate ? `${day(l.earliestDate)}〜${day(l.latestDate)}` : '調整中'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td className="px-2.5 py-1.5 font-bold" colSpan={2}>
                    合計（税抜）
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-bold">{yen(o.totalAmount)}</td>
                  <td className="px-2.5 py-1.5 text-right text-slate-500">{o.paymentStatus === '入金済' ? 'お支払い済み' : o.paymentStatus === '入金待ち' ? 'お支払い待ち' : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="space-y-2">
            {ships.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">ただいま商品を手配しています。発送しましたらここに配送状況が表示されます。</div>
            ) : (
              ships.map((s) => <ShipmentCard key={s.shipmentId} s={s} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PortalDashboard({ slug, onLogout }: { slug: string; onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState('all');
  const [filter, setFilter] = useState<'active' | 'delivered' | 'all'>('active');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/portal/data?slug=${slug}`)
      .then(async (r) => {
        if (r.status === 401) return onLogout();
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || '読み込めませんでした');
        setData(j);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [onLogout]);
  useEffect(load, [load]);

  const shipsByOrder = useMemo(() => {
    const m = new Map<string, PortalShipment[]>();
    (data?.shipments || []).forEach((s) => m.set(s.orderId, [...(m.get(s.orderId) || []), s]));
    return m;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.orders
      .map((o) => ({ o, ships: shipsByOrder.get(o.orderId) || [], step: orderStep(o, shipsByOrder.get(o.orderId) || []) }))
      .filter(({ o }) => clinic === 'all' || o.clinicId === clinic)
      .filter(({ step }) => (filter === 'all' ? true : filter === 'delivered' ? step === 4 : step < 4))
      .filter(({ o }) => !needle || `${o.orderId} ${o.clinicName} ${o.lines.map((l) => l.productName).join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.o.orderDate || '').localeCompare(a.o.orderDate || '') || b.o.orderId.localeCompare(a.o.orderId));
  }, [data, shipsByOrder, clinic, filter, q]);

  const summary = useMemo(() => {
    if (!data) return { active: 0, transit: 0, delivered30: 0 };
    const cutoff = Date.now() - 30 * 86400000;
    let active = 0;
    let transit = 0;
    let delivered30 = 0;
    for (const o of data.orders) {
      if (clinic !== 'all' && o.clinicId !== clinic) continue;
      const ships = shipsByOrder.get(o.orderId) || [];
      const step = orderStep(o, ships);
      if (step < 4) active++;
      if (step === 2 || step === 3) transit++;
      if (step === 4 && new Date((o.orderDate || '').replace(/\//g, '-')).getTime() >= cutoff) delivered30++;
    }
    return { active, transit, delivered30 };
  }, [data, shipsByOrder, clinic]);

  const logout = async () => {
    await fetch('/api/portal/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{data?.group.name || 'ご注文・配送状況'}</div>
              <div className="text-[11px] text-slate-500">
                ご注文・配送状況{data?.generatedAt ? `（${new Date(data.generatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 時点）` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700" aria-label="最新にする">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">最新にする</span>
            </button>
            <button onClick={logout} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}
        {!data && loading ? (
          <div className="py-20 flex justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '進行中のご注文', value: summary.active, icon: Clock, color: 'text-blue-600' },
                { label: '発送済み・配送中', value: summary.transit, icon: Truck, color: 'text-indigo-600' },
                { label: 'お届け済み（30日）', value: summary.delivered30, icon: CheckCircle2, color: 'text-emerald-600' },
              ].map((c) => (
                <div key={c.label} className="rounded-xl bg-white border border-slate-200 p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-500">
                    <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                    {c.label}
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{c.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {data.clinics.length > 1 && (
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <select value={clinic} onChange={(e) => setClinic(e.target.value)} className="bg-transparent font-bold text-slate-700 focus:outline-none">
                    <option value="all">すべての院（{data.clinics.length}）</option>
                    {data.clinics.map((c) => (
                      <option key={c.clinicId} value={c.clinicId}>
                        {c.clinicName || c.clinicId}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-bold">
                {(
                  [
                    ['active', '進行中'],
                    ['delivered', 'お届け済み'],
                    ['all', 'すべて'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-md ${filter === k ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="商品名・注文番号で検索" className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-1.5 text-xs" />
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200">
              {rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">該当するご注文はありません</div>
              ) : (
                rows.map(({ o, ships }) => <OrderRow key={o.orderId} o={o} ships={ships} />)
              )}
            </div>
            <p className="text-[11px] text-slate-400">配送状況は運送会社の情報を自動で取り込んでいます。ご不明な点は担当者までお問い合わせください。</p>
          </>
        ) : null}
      </main>
    </div>
  );
}

export function PortalApp({ slug }: { slug: string }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    fetch(`/api/portal/data?slug=${slug}`, { method: 'HEAD' })
      .then((r) => setState(r.status === 401 ? 'out' : 'in'))
      .catch(() => setState('out'));
  }, [slug]);
  const logout = useCallback(() => setState('out'), []);
  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (state === 'out') return <PortalLogin slug={slug} onDone={() => setState('in')} />;
  return <PortalDashboard slug={slug} onLogout={logout} />;
}
