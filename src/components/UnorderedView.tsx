import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Boxes, Download, ExternalLink, Search, ShoppingCart, X } from 'lucide-react';
import { Order, OrderLine } from '../types';
import { isShippingOrFee, openRakurakuWithCopiedId } from '../utils';
import { isQuoteOrder } from '../utils/salesCalculations';
import { getConfiguredUrls } from '../api';
import { FlowSteps } from './flow/FlowSteps';
import { useCoolFlags } from '../utils/coolFlags';
import { ColorLegend } from './flow/ColorLegend';
import { notifyDone, notifyError } from './flow/UndoToast';

// 未発注（作り直し版）。1明細1行の軽い一覧で、国内・韓国・シンガポールの空き在庫を並べ、
// 在庫があればその場で引き当てる（入荷・在庫の「引当」と同じ）。無ければ楽楽販売で発注する。

type WarehouseId = 'domestic' | 'korea' | 'singapore';
const WH_SHORT: Record<WarehouseId, string> = { domestic: '国内', korea: '韓国', singapore: 'SG' };
const WH_IDS: WarehouseId[] = ['domestic', 'korea', 'singapore'];
const PO_STALE_DAYS = 14;

interface Candidate {
  orderId: string;
  productId: string;
  need: number;
  stockAt: { warehouse: WarehouseId; available: number }[];
  suggest: { warehouse: WarehouseId; qty: number }[];
}
type Tab = 'paid' | 'waiting' | 'credit' | 'all' | 'stale';
type SortKey = 'due' | 'orderDate' | 'payDate' | 'clinic';

interface Row {
  key: string;
  order: Order;
  line: OrderLine;
  need: number; // 引当を除いた、まだ手配していない数
  daysLeft: number | null;
  poDays: number | null;
}

const dayDiff = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const d = new Date(ymd.replace(/\//g, '-') + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

export function UnorderedView({
  orders,
  onSelectOrderLine,
  onOpenClinicStatus,
  onDataUpdated,
  onShowClassic,
  onNavigate,
}: {
  orders: Order[];
  onSelectOrderLine: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string) => void;
  onDataUpdated?: () => void;
  onShowClassic: () => void;
  onNavigate?: (tab: string) => void;
}) {
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const [coolFlags] = useCoolFlags();
  const [tab, setTab] = useState<Tab>('paid');
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('all');
  const [supplier, setSupplier] = useState('all');
  const [stockOnly, setStockOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('due');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cands, setCands] = useState<Map<string, Candidate>>(new Map());
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStock = useCallback(() => {
    api('/api/inventory/allocation-candidates')
      .then((j) => setCands(new Map((j.candidates as Candidate[]).map((c) => [`${c.orderId}|${c.productId}`, c]))))
      .catch(() => setCands(new Map()));
  }, []);
  useEffect(loadStock, [loadStock, orders]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const o of orders) {
      if (isQuoteOrder(o) || o.orderState === '全明細出荷済' || o.orderState === '納品完了') continue;
      for (const l of o.lines) {
        if (isShippingOrFee(l.productName, l.productId)) continue;
        const poDays = l.stage === '発注済・入荷待ち' && l.poDate ? -(dayDiff(l.poDate) ?? 0) : null;
        const need = l.quantity - (l.allocatedQty || 0);
        if (tab === 'stale') {
          if (poDays === null || poDays < PO_STALE_DAYS) continue;
        } else if (l.stage !== '未発注' || need <= 0) continue;
        out.push({ key: `${o.orderId}|${l.productId}|${l.lineKey}`, order: o, line: l, need, daysLeft: dayDiff(l.latestDate), poDays });
      }
    }
    return out;
  }, [orders, tab]);

  const counts = useMemo(() => {
    const c = { paid: 0, waiting: 0, credit: 0, all: 0 };
    for (const o of orders) {
      if (isQuoteOrder(o) || o.orderState === '全明細出荷済' || o.orderState === '納品完了') continue;
      for (const l of o.lines) {
        if (isShippingOrFee(l.productName, l.productId) || l.stage !== '未発注' || l.quantity - (l.allocatedQty || 0) <= 0) continue;
        c.all++;
        if (o.paymentStatus === '入金済') c.paid++;
        else if (o.paymentStatus === '入金待ち') c.waiting++;
        else if (o.paymentStatus === '売掛・締日決済') c.credit++;
      }
    }
    return c;
  }, [orders]);

  const reps = useMemo(() => Array.from(new Set(rows.map((r) => r.order.salesRep).filter(Boolean))).sort(), [rows]);
  const suppliers = useMemo(() => Array.from(new Set(rows.map((r) => r.line.supplierName || '（仕入先未設定）'))).sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (tab === 'paid' && r.order.paymentStatus !== '入金済') return false;
      if (tab === 'waiting' && r.order.paymentStatus !== '入金待ち') return false;
      if (tab === 'credit' && r.order.paymentStatus !== '売掛・締日決済') return false;
      if (rep !== 'all' && r.order.salesRep !== rep) return false;
      if (supplier !== 'all' && (r.line.supplierName || '（仕入先未設定）') !== supplier) return false;
      if (stockOnly && !cands.has(`${r.order.orderId}|${r.line.productId}`)) return false;
      if (needle && !`${r.order.orderId} ${r.order.customerName} ${r.line.productName} ${r.line.supplierName}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const big = 99999;
    list.sort((a, b) => {
      if (sort === 'due') return (a.daysLeft ?? big) - (b.daysLeft ?? big);
      if (sort === 'orderDate') return String(a.order.orderDate || '').localeCompare(String(b.order.orderDate || ''));
      if (sort === 'payDate') return String(a.order.paymentDate || '9999').localeCompare(String(b.order.paymentDate || '9999'));
      return a.order.customerName.localeCompare(b.order.customerName, 'ja');
    });
    return list;
  }, [rows, tab, rep, supplier, stockOnly, q, sort, cands]);

  const stockCount = useMemo(() => shown.filter((r) => cands.has(`${r.order.orderId}|${r.line.productId}`)).length, [shown, cands]);

  const planItems = (targets: Row[]) =>
    targets.flatMap((r) => (cands.get(`${r.order.orderId}|${r.line.productId}`)?.suggest || []).map((s) => ({ orderId: r.order.orderId, productId: r.line.productId, warehouse: s.warehouse, qty: s.qty })));
  /** 押す前に見せる「何が起きるか」 */
  const preview = (targets: Row[]) => {
    const items = planItems(targets);
    if (items.length === 0) return '選んだ明細に確保できる在庫はありません';
    const byWh = WH_IDS.map((w) => [w, items.filter((i) => i.warehouse === w).reduce((n, i) => n + i.qty, 0)] as const).filter(([, n]) => n > 0);
    return `${byWh.map(([w, n]) => `${WH_SHORT[w]}倉庫から${n}点`).join('・')}を確保します。確保した明細は未発注の一覧から消えます。`;
  };
  const allocate = async (targets: Row[]) => {
    const items = planItems(targets);
    if (items.length === 0) return notifyError('選んだ明細に確保できる在庫がありません');
    setBusy(true);
    try {
      const j = await api('/api/inventory/allocations', { method: 'POST', body: JSON.stringify({ items }) });
      setSelected(new Set());
      loadStock();
      onDataUpdated?.();
      notifyDone(`${items.reduce((n, i) => n + i.qty, 0)}点を在庫から確保しました（次は「引当・出荷指示」で倉庫へ出荷依頼）`, async () => {
        await api('/api/inventory/allocations/cancel-many', { method: 'POST', body: JSON.stringify({ ids: j.ids }) });
        loadStock();
        onDataUpdated?.();
      });
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const orderInRakuraku = (targets: Row[]) => {
    const ids = Array.from(new Set(targets.map((r) => r.order.orderId)));
    openRakurakuWithCopiedId(rakurakuBaseUrl, ids.join(' '));
    setNotice({ text: `受注ID ${ids.join('、')} をコピーしました。楽楽販売で発注を登録してください` });
  };

  const exportCsv = () => {
    const head = ['受注ID', '受注日', 'クリニック', '担当', '商品ID', '商品名', '未手配数', '仕入先', '最長納品予定日', '残日数', '入金', '国内在庫', '韓国在庫', 'SG在庫'];
    const lines = shown.map((r) => {
      const c = cands.get(`${r.order.orderId}|${r.line.productId}`);
      const at = (w: WarehouseId) => c?.stockAt.find((x) => x.warehouse === w)?.available ?? 0;
      return [r.order.orderId, r.order.orderDate, r.order.customerName, r.order.salesRep, r.line.productId, r.line.productName, r.need, r.line.supplierName, r.line.latestDate || '', r.daysLeft ?? '', r.order.paymentStatus, at('domestic'), at('korea'), at('singapore')];
    });
    const csv = '﻿' + [head, ...lines].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `未発注_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const selRows = shown.filter((r) => selected.has(r.key));
  const allChecked = shown.length > 0 && shown.every((r) => selected.has(r.key));

  const TABS: [Tab, string, number | null][] = [
    ['paid', '入金済み（要発注）', counts.paid],
    ['waiting', '入金待ち', counts.waiting],
    ['credit', '売掛・締日', counts.credit],
    ['all', 'すべての未発注', counts.all],
    ['stale', `発注後${PO_STALE_DAYS}日以上止まり`, null],
  ];

  return (
    <div className="space-y-3">
      <FlowSteps current="unordered" onNavigate={onNavigate} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-amber-500" />
            未発注
          </h1>
          <p className="text-xs text-slate-500 mt-1">まだ手配していない明細です（送料・手数料、在庫から引き当て済みの分は除く）。在庫があれば引き当て、無ければ楽楽販売で発注します。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <ColorLegend />
          <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button onClick={onShowClassic} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-500 hover:bg-slate-50" title="仕入先ごとのまとめ・発注依頼文の作成など">
            以前の表示
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setSelected(new Set());
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${tab === id ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            {label}
            {n !== null && <span className={`ml-1.5 rounded-full px-1.5 ${tab === id ? 'bg-white/25' : 'bg-slate-100'}`}>{n}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs bg-white border border-slate-200 rounded-xl p-2.5">
        <div className="relative flex-1 min-w-52">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="受注ID・クリニック・商品・仕入先" className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5" />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-2 text-slate-400" aria-label="消す">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
          <option value="all">担当：すべて</option>
          {reps.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 max-w-48">
          <option value="all">仕入先：すべて</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {tab !== 'stale' && (
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800 cursor-pointer">
            <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
            在庫で引当できるものだけ（{stockCount}）
          </label>
        )}
        <label className="inline-flex items-center gap-1">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <option value="due">納期が近い順</option>
            <option value="orderDate">受注日が古い順</option>
            <option value="payDate">入金日が古い順</option>
            <option value="clinic">クリニック名順</option>
          </select>
        </label>
        <span className="text-slate-500 ml-auto">{shown.length}明細</span>
      </div>

      {notice && (
        <div className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between ${notice.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="閉じる">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {selRows.length > 0 && tab !== 'stale' && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 text-xs shadow-lg">
          <span className="font-bold">{selRows.length}明細を選択中</span>
          <button disabled={busy} onClick={() => allocate(selRows)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 font-bold disabled:opacity-50">
            <Boxes className="w-3.5 h-3.5" />
            在庫から確保（在庫がある分）
          </button>
          <button onClick={() => orderInRakuraku(selRows)} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 font-bold">
            <ExternalLink className="w-3.5 h-3.5" />
            楽楽販売で発注
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/70 hover:text-white">
            選択を解除
          </button>
          <div className="basis-full text-[11px] text-white/70">{preview(selRows)}</div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={allChecked} onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.key)) : new Set())} />
              </th>
              <th className="text-left px-2 py-2">受注</th>
              <th className="text-left px-2 py-2">クリニック</th>
              <th className="text-left px-2 py-2">商品</th>
              <th className="text-right px-2 py-2">数</th>
              <th className="text-left px-2 py-2">仕入先</th>
              <th className="text-left px-2 py-2">{tab === 'stale' ? '発注から' : '最長納期'}</th>
              <th className="text-left px-2 py-2">入金</th>
              <th className="text-left px-2 py-2">空き在庫</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                  該当する明細はありません
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const c = cands.get(`${r.order.orderId}|${r.line.productId}`);
              const dl = r.daysLeft;
              return (
                <tr key={r.key} className={`${selected.has(r.key) ? 'bg-amber-50/60' : 'hover:bg-slate-50/70'}`}>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(r.key)}
                      onChange={(e) => {
                        const n = new Set(selected);
                        e.target.checked ? n.add(r.key) : n.delete(r.key);
                        setSelected(n);
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button onClick={() => onSelectOrderLine(r.order, r.line.lineKey)} className="font-mono font-bold text-indigo-700 hover:underline">
                      {r.order.orderId}
                    </button>
                    <div className="text-[10px] text-slate-400">{r.order.orderDate}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => onOpenClinicStatus?.(r.order.customerName)} className="font-semibold text-slate-800 hover:text-indigo-700 text-left line-clamp-1 max-w-48">
                      {r.order.customerName}
                    </button>
                    <div className="text-[10px] text-slate-400">{r.order.salesRep}</div>
                  </td>
                  <td className="px-2 py-1.5 font-semibold text-slate-800 max-w-56">
                    <span className="line-clamp-2">
                      {coolFlags[r.line.productId] && <span className="mr-1 text-sky-600" title="クール便が必要">❄</span>}
                      {r.line.productName}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold whitespace-nowrap">
                    {r.need}
                    {(r.line.allocatedQty || 0) > 0 && <div className="text-[10px] font-normal text-emerald-700">引当済 {r.line.allocatedQty}</div>}
                  </td>
                  <td className={`px-2 py-1.5 ${r.line.supplierName ? 'text-slate-700' : 'text-amber-700 font-semibold'}`}>{r.line.supplierName || '未設定'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {tab === 'stale' ? (
                      <span className="font-bold text-rose-700">{r.poDays}日</span>
                    ) : r.line.latestDate ? (
                      <>
                        <span className="font-mono">{r.line.latestDate.slice(5)}</span>
                        <span className={`ml-1 rounded px-1 font-bold ${dl !== null && dl < 0 ? 'bg-rose-100 text-rose-700' : dl !== null && dl <= 7 ? 'bg-amber-100 text-amber-800' : 'text-slate-400'}`}>
                          {dl === null ? '' : dl < 0 ? `${-dl}日超過` : `あと${dl}日`}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`rounded px-1.5 py-0.5 ${r.order.paymentStatus === '入金済' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.order.paymentStatus || '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {c ? (
                      <span className="inline-flex gap-1">
                        {WH_IDS.map((w) => {
                          const n = c.stockAt.find((x) => x.warehouse === w)?.available || 0;
                          return n > 0 ? (
                            <span key={w} className="rounded bg-emerald-50 border border-emerald-200 px-1 text-emerald-800 font-semibold">
                              {WH_SHORT[w]}
                              {n}
                            </span>
                          ) : null;
                        })}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {tab !== 'stale' && c ? (
                      <button disabled={busy} onClick={() => allocate([r])} title={preview([r])} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 font-bold disabled:opacity-50">
                        在庫から確保
                      </button>
                    ) : (
                      <button onClick={() => orderInRakuraku([r])} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50">
                        楽楽で発注
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
