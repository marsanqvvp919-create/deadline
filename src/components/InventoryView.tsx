import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, Copy, Check, ExternalLink, KeyRound, PackageCheck, RefreshCw, Search, Truck, Upload, X, Ban, RotateCcw, History, Warehouse, ClipboardList, Send } from 'lucide-react';
import { PasswordChooser, passwordOk } from './ClinicPortalAccess';
import { Order } from '../types';

// 入荷・在庫（国内倉庫・韓国倉庫・シンガポール倉庫）。楽楽販売の発注（発注済み）から入荷予定を作り、
// 入荷先倉庫・配送方法・追跡番号・数量をここで入れる。倉庫の担当者が実数を入れて承認すると在庫に加わる（国内倉庫は社内で承認）。
// 未発注の明細は在庫から引き当て、倉庫への出荷指示を出す。

type WarehouseId = 'domestic' | 'korea' | 'singapore';
const WH_NAME: Record<WarehouseId, string> = { domestic: '国内倉庫', korea: '韓国倉庫', singapore: 'シンガポール倉庫' };
const WH_IDS: WarehouseId[] = ['domestic', 'korea', 'singapore'];
const METHOD_LABEL: Record<string, string> = { '': '未設定', tracking: '宅配便・国際便（追跡あり）', kick: 'キック（追跡なし）', handcarry: '直接持込' };

interface InboundLine {
  key: string;
  productId: string;
  productName: string;
  poQty: number;
  qty: number;
  qtyEdited: boolean;
  receivedQty: number | null;
}
interface Inbound {
  poId: string;
  poDate: string;
  supplierName: string;
  supplierArea: string;
  orderId: string;
  clinicName: string;
  rakurakuStatus: string;
  excluded: boolean;
  cancelled: boolean;
  lines: InboundLine[];
  warehouse: WarehouseId;
  method: '' | 'tracking' | 'kick' | 'handcarry';
  trackingNos: string[];
  tracking: { trackingNo: string; carrier: string; status: string; statusText: string; lastLocation: string; lastEventAt: string | null }[];
  memo: string;
  state: string;
  stateLabel: string;
  received: boolean;
  receivedAt: string | null;
  receivedMemo: string;
  shortage: boolean;
  updatedAt?: string;
}
interface StockRow {
  key: string;
  productId: string;
  productName: string;
  qty: number;
  reserved: number;
  available: number;
  updatedAt: string;
}
interface Candidate {
  orderId: string;
  orderDate: string;
  clinicName: string;
  paymentStatus: string;
  productId: string;
  productName: string;
  need: number;
  stockAt: { warehouse: WarehouseId; available: number }[];
  suggest: { warehouse: WarehouseId; qty: number }[];
  shortBy: number;
}
interface Allocation {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  clinicName: string;
  warehouse: WarehouseId;
  qty: number;
  status: 'reserved' | 'instructed';
  instructionId?: string;
}
interface Instruction {
  id: string;
  warehouse: WarehouseId;
  warehouseName: string;
  orderId: string;
  clinicName: string;
  lines: { productName: string; qty: number }[];
  status: 'open' | 'shipped' | 'cancelled';
  memo: string;
  carrier: string;
  trackingNos: string[];
  createdAt: string;
  shippedAt?: string;
  shippedBy?: string;
  destination: { name: string; director: string; postalCode: string; address: string; phone: string };
}
interface Move {
  id: string;
  at: string;
  warehouse: WarehouseId;
  productName: string;
  delta: number;
  type: string;
  ref?: string;
  memo?: string;
  by: string;
}
interface InventoryData {
  settings: { startDate: string };
  poSyncedAt: string | null;
  warehouses: { id: WarehouseId; name: string; slug: string | null; disabled: boolean; lastLoginAt: string | null }[];
  inbound: Inbound[];
  stock: Record<WarehouseId, StockRow[]>;
  moves: Move[];
  allocations: Allocation[];
  instructions: Instruction[];
}

const MOVE_LABEL: Record<string, string> = { inbound: '入荷', outbound: '出庫', adjust: '在庫修正', import: '取り込み', unreceive: '承認取消' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATE_STYLE: Record<string, string> = {
  no_tracking: 'bg-amber-100 text-amber-800 border-amber-200',
  tracking: 'bg-blue-50 text-blue-700 border-blue-200',
  in_transit: 'bg-blue-100 text-blue-800 border-blue-200',
  arrived: 'bg-violet-100 text-violet-800 border-violet-200',
  kick: 'bg-orange-100 text-orange-800 border-orange-200',
  handcarry: 'bg-orange-100 text-orange-800 border-orange-200',
  received: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  shortage: 'bg-rose-100 text-rose-800 border-rose-200',
  excluded: 'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

function InboundCard({ rec, onSaved }: { rec: Inbound; onSaved: () => void }) {
  const [tracking, setTracking] = useState(rec.trackingNos.join('、'));
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(rec.lines.map((l) => [l.key, String(l.qty)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (body: object) => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/inventory/inbound/${rec.poId}`, { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const qtyDirty = rec.lines.some((l) => String(l.qty) !== qty[l.key]);
  const trackingDirty = tracking.trim() !== rec.trackingNos.join('、');
  const locked = rec.received || rec.cancelled;

  return (
    <div className={`rounded-xl border bg-white p-4 space-y-3 ${rec.excluded || rec.cancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-indigo-700">{rec.poId}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${STATE_STYLE[rec.state] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{rec.stateLabel}</span>
            <span className="text-[11px] text-slate-500">発注日 {rec.poDate || '—'}</span>
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            {rec.supplierName || '（仕入先なし）'}
            <span className="ml-1.5 text-[11px] font-normal text-slate-500">{rec.supplierArea}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            受注 {rec.orderId || '—'} {rec.clinicName}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-slate-500">入荷先</span>
            <select disabled={locked || busy} value={rec.warehouse} onChange={(e) => save({ warehouse: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 font-semibold">
              {WH_IDS.map((w) => (
                <option key={w} value={w}>
                  {WH_NAME[w]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-500">配送方法</span>
            <select disabled={locked || busy} value={rec.method} onChange={(e) => save({ method: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 font-semibold">
              {Object.entries(METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="text-left py-1 font-semibold">商品</th>
            <th className="text-right py-1 font-semibold w-20">発注数</th>
            <th className="text-right py-1 font-semibold w-28">入荷予定数</th>
            <th className="text-right py-1 font-semibold w-24">入荷実数</th>
          </tr>
        </thead>
        <tbody>
          {rec.lines.map((l) => (
            <tr key={l.key} className="border-b border-slate-50">
              <td className="py-1.5 font-semibold text-slate-800">{l.productName}</td>
              <td className="py-1.5 text-right font-mono text-slate-500">{l.poQty}</td>
              <td className="py-1.5 text-right">
                {locked ? (
                  <span className="font-mono font-bold">{l.qty}</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    value={qty[l.key] ?? ''}
                    onChange={(e) => setQty({ ...qty, [l.key]: e.target.value })}
                    className={`w-20 rounded border px-1.5 py-0.5 text-right font-mono ${l.qtyEdited ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}
                  />
                )}
              </td>
              <td className={`py-1.5 text-right font-mono font-bold ${l.receivedQty !== null && l.receivedQty < l.qty ? 'text-rose-600' : 'text-emerald-700'}`}>{l.receivedQty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {qtyDirty && !locked && (
        <button disabled={busy} onClick={() => save({ lines: rec.lines.map((l) => ({ key: l.key, qty: Number(qty[l.key]) })) })} className="rounded-md bg-slate-900 text-white px-3 py-1 text-xs font-bold">
          数量を保存
        </button>
      )}

      {rec.method !== 'kick' && rec.method !== 'handcarry' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            <input
              disabled={locked || busy}
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="ベンダー → 倉庫の追跡番号（複数は「、」区切り）"
              className="flex-1 min-w-60 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-mono"
            />
            {trackingDirty && !locked && (
              <button disabled={busy} onClick={() => save({ trackingNos: tracking })} className="rounded-md bg-indigo-600 text-white px-3 py-1 text-xs font-bold">
                追跡番号を保存
              </button>
            )}
          </div>
          {rec.tracking.map((t) => (
            <div key={t.trackingNo} className="text-[11px] text-slate-600 pl-6">
              <span className="font-mono font-bold">{t.trackingNo}</span>
              {t.carrier && <span className="ml-1 uppercase">{t.carrier}</span>}：{t.statusText}
              {t.lastLocation && `（${t.lastLocation}）`} {t.lastEventAt && fmt(t.lastEventAt)}
            </div>
          ))}
        </div>
      )}

      {rec.warehouse === 'domestic' && !rec.received && !rec.excluded && !rec.cancelled && (
        <DomesticReceive rec={rec} onSaved={onSaved} />
      )}
      {rec.received && (
        <div className="text-[11px] text-slate-600">
          倉庫で承認 {fmt(rec.receivedAt)}
          {rec.receivedMemo && `・メモ：${rec.receivedMemo}`}
        </div>
      )}
      {error && <div className="text-xs text-rose-600">{error}</div>}

      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
        {!rec.received && !rec.cancelled && (
          <button disabled={busy} onClick={() => save({ excluded: !rec.excluded })} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
            {rec.excluded ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
            {rec.excluded ? '入荷予定に戻す' : '対象外にする（倉庫を通らない等）'}
          </button>
        )}
        {rec.received && (
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm('倉庫の承認を取り消し、在庫から承認した数を引きます。よろしいですか？')) return;
              setBusy(true);
              try {
                await api(`/api/inventory/inbound/${rec.poId}/unreceive`, { method: 'POST' });
                onSaved();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            承認を取り消す
          </button>
        )}
      </div>
    </div>
  );
}

/** 国内倉庫の入荷は社内で承認する（届いた実数を入れて在庫に加える） */
function DomesticReceive({ rec, onSaved }: { rec: Inbound; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(rec.lines.map((l) => [l.key, String(l.qty)])));
  const [error, setError] = useState('');
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1 text-xs font-bold">
        <CheckCircle2 className="w-3.5 h-3.5" />
        国内倉庫に届いた（承認する）
      </button>
    );
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2 text-xs">
      <div className="font-bold text-emerald-900">届いた実数を入れて承認（在庫に加わります）</div>
      {rec.lines.map((l) => (
        <div key={l.key} className="flex items-center gap-2">
          <span className="flex-1 font-semibold">{l.productName}</span>
          <span className="text-slate-500">予定 {l.qty}</span>
          <input type="number" min={0} value={qty[l.key]} onChange={(e) => setQty({ ...qty, [l.key]: e.target.value })} className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono" />
        </div>
      ))}
      {error && <div className="text-rose-600">{error}</div>}
      <div className="flex gap-2">
        <button
          onClick={async () => {
            try {
              await api(`/api/inventory/inbound/${rec.poId}/receive`, { method: 'POST', body: JSON.stringify({ lines: rec.lines.map((l) => ({ key: l.key, receivedQty: Number(qty[l.key]) })) }) });
              onSaved();
            } catch (e: any) {
              setError(e.message);
            }
          }}
          className="rounded bg-emerald-600 text-white px-3 py-1 font-bold"
        >
          承認して在庫に入れる
        </button>
        <button onClick={() => setOpen(false)} className="rounded border border-slate-300 px-3 py-1 font-bold">
          やめる
        </button>
      </div>
    </div>
  );
}

function StockTable({ warehouse, rows, onSaved, products }: { warehouse: WarehouseId; rows: StockRow[]; onSaved: () => void; products: { productId: string; productName: string }[] }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ key: string; productId: string; productName: string; qty: string } | null>(null);
  const [error, setError] = useState('');
  const shown = rows.filter((r) => !q.trim() || r.productName.toLowerCase().includes(q.trim().toLowerCase()));
  const saveEdit = async () => {
    if (!edit) return;
    setError('');
    try {
      await api('/api/inventory/stock', { method: 'POST', body: JSON.stringify({ warehouse, productId: edit.productId, productName: edit.productName, qty: Number(edit.qty) }) });
      setEdit(null);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-100">
        <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
          <Warehouse className="w-4 h-4" />
          {WH_NAME[warehouse]}（{rows.filter((r) => r.qty > 0).length}品目・{rows.reduce((a, r) => a + r.qty, 0)}点・引当済 {rows.reduce((a, r) => a + r.reserved, 0)}）
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="商品名で検索" className="rounded-md border border-slate-300 pl-7 pr-2 py-1 text-xs w-44" />
          </div>
          <button onClick={() => setEdit({ key: '', productId: '', productName: '', qty: '0' })} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
            ＋ 商品を追加
          </button>
        </div>
      </div>
      {edit && (
        <div className="p-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
          {edit.key ? (
            <span className="font-bold">{edit.productName}</span>
          ) : (
            <>
              <input
                list={`products-${warehouse}`}
                value={edit.productName}
                onChange={(e) => {
                  const p = products.find((x) => x.productName === e.target.value);
                  setEdit({ ...edit, productName: e.target.value, productId: p?.productId || '' });
                }}
                placeholder="商品名"
                className="rounded border border-slate-300 px-2 py-1 w-64"
              />
              <datalist id={`products-${warehouse}`}>
                {products.map((p) => (
                  <option key={p.productId} value={p.productName} />
                ))}
              </datalist>
            </>
          )}
          <span className="text-slate-500">在庫数</span>
          <input type="number" min={0} value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono" />
          <button onClick={saveEdit} className="rounded bg-slate-900 text-white px-3 py-1 font-bold">
            保存
          </button>
          <button onClick={() => setEdit(null)} className="rounded border border-slate-300 px-3 py-1 font-bold text-slate-600">
            やめる
          </button>
          {error && <span className="text-rose-600">{error}</span>}
        </div>
      )}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">商品</th>
              <th className="text-right px-3 py-2 font-semibold w-16">在庫</th>
              <th className="text-right px-3 py-2 font-semibold w-16">引当済</th>
              <th className="text-right px-3 py-2 font-semibold w-16">引当可</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  在庫はまだありません
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.key} className={r.qty <= 0 ? 'text-slate-400' : ''}>
                <td className="px-3 py-1.5 font-semibold">{r.productName}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{r.qty}</td>
                <td className="px-3 py-1.5 text-right font-mono text-amber-700">{r.reserved || ''}</td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-700">{r.available}</td>
                <td className="px-3 py-1.5 text-right">
                  <button onClick={() => setEdit({ key: r.key, productId: r.productId, productName: r.productName, qty: String(r.qty) })} className="text-indigo-700 font-bold hover:underline">
                    修正
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 倉庫のCSV（韓国倉庫の在庫表など）を取り込む */
function ImportPanel({ onDone, products, onClose }: { onDone: () => void; products: { productId: string; productName: string }[]; onClose: () => void }) {
  const [warehouse, setWarehouse] = useState<WarehouseId>('korea');
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(true);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const parse = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(',').map((c) => c.trim().replace(/^["'\s]+|["'\s]+$/g, ''));
    const find = (re: RegExp, fallback: number) => {
      const i = head.findIndex((h) => re.test(h));
      return i >= 0 ? i : head.length > fallback ? fallback : -1;
    };
    const iName = find(/製品名|제품명|품명|商品名|name/i, 2);
    const iCode = find(/製品コード|제품코드|품번|コード|商品ID|code/i, 3);
    const iQty = find(/수량|数量|在庫|qty|quantity/i, 4);
    const byName = new Map(products.map((p) => [p.productName.toLowerCase(), p.productId]));
    return lines.slice(1).map((l) => {
      const c = l.split(',').map((x) => x.trim().replace(/^["'\s]+|["'\s]+$/g, ''));
      const productName = c[iName] || '';
      const code = iCode >= 0 ? c[iCode] || '' : '';
      const productId = products.some((p) => p.productId === code) ? code : byName.get(productName.toLowerCase()) || '';
      return { productId, productName, qty: parseInt(c[iQty] || '0', 10) || 0 };
    }).filter((r) => r.productName || r.productId);
  };
  const run = async () => {
    const rows = parse();
    if (rows.length === 0) return setMsg({ text: '取り込める行がありません（1行目に見出し、2行目から商品名と数量）', error: true });
    try {
      const j = await api('/api/inventory/import', { method: 'POST', body: JSON.stringify({ warehouse, rows, replace }) });
      setMsg({ text: `${WH_NAME[warehouse]}に${j.count}品目を取り込みました` });
      onDone();
    } catch (e: any) {
      setMsg({ text: e.message, error: true });
    }
  };
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-slate-900">在庫の取り込み（CSV）</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={warehouse} onChange={(e) => setWarehouse(e.target.value as WarehouseId)} className="rounded border border-slate-300 px-2 py-1 font-semibold">
          {WH_IDS.map((w) => (
            <option key={w} value={w}>
              {WH_NAME[w]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          CSVに無い商品は在庫0にする
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => setText(String(r.result || ''));
            r.readAsText(f);
          }}
        />
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="CSVを貼り付けるか、ファイルを選んでください" className="w-full rounded border border-slate-300 p-2 font-mono" />
      <div className="flex items-center gap-3">
        <button onClick={run} className="rounded bg-indigo-600 text-white px-3 py-1.5 font-bold inline-flex items-center gap-1">
          <Upload className="w-3.5 h-3.5" />
          取り込む
        </button>
        {msg && <span className={msg.error ? 'text-rose-600' : 'text-emerald-700 font-bold'}>{msg.text}</span>}
      </div>
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'コピーしました' : label}
    </button>
  );
}

function WarehouseAccessPanel({ data, onSaved }: { data: InventoryData; onSaved: () => void }) {
  const [issued, setIssued] = useState<{ w: WarehouseId; slug: string; password: string } | null>(null);
  const [changing, setChanging] = useState<WarehouseId | null>(null);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const url = (slug: string) => `${window.location.origin}/warehouse/${slug}`;
  const issue = async (w: WarehouseId) => {
    setError('');
    try {
      const j = await api(`/api/inventory/warehouse/${w}/password`, { method: 'POST', body: JSON.stringify(mode === 'manual' ? { password: pw.trim() } : {}) });
      setIssued({ w, slug: j.slug, password: j.password });
      setChanging(null);
      setPw('');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">倉庫ごとにURLとパスワードを発行します。倉庫の担当者は自分の倉庫の入荷予定だけを見て、届いた実数を入れて承認・出庫できます（仕入値や販売金額は表示されません）。</p>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      {issued && (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 space-y-2 text-xs">
          <div className="font-bold text-emerald-800">{WH_NAME[issued.w]}のURLとパスワード（パスワードはこの画面でしか表示されません）</div>
          <div className="flex flex-wrap items-center gap-2 bg-white rounded border border-emerald-200 px-2 py-1.5">
            <code className="flex-1 break-all">{url(issued.slug)}</code>
            <CopyBtn text={url(issued.slug)} label="URLをコピー" />
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-white rounded border border-emerald-200 px-2 py-1.5">
            <code className="flex-1 font-bold">{issued.password}</code>
            <CopyBtn text={issued.password} label="パスワードをコピー" />
          </div>
        </div>
      )}
      {data.warehouses.map((w) => (
        <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold text-sm text-slate-900">{w.name}</div>
              <div className="text-[11px] text-slate-500">{w.slug ? `発行済み・最終ログイン ${fmt(w.lastLoginAt)}${w.disabled ? '・停止中' : ''}` : 'まだ発行していません'}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {w.slug && <CopyBtn text={url(w.slug)} label="URLをコピー" />}
              {w.slug && (
                <a href={url(w.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <ExternalLink className="w-3.5 h-3.5" />
                  開く
                </a>
              )}
              <button onClick={() => setChanging(changing === w.id ? null : w.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <KeyRound className="w-3.5 h-3.5" />
                {w.slug ? 'パスワードを変更' : '発行する'}
              </button>
              {w.slug && (
                <button
                  onClick={async () => {
                    await api(`/api/inventory/warehouse/${w.id}`, { method: 'POST', body: JSON.stringify({ disabled: !w.disabled }) }).catch((e) => setError(e.message));
                    onSaved();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  {w.disabled ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {w.disabled ? '再開' : '一時停止'}
                </button>
              )}
            </div>
          </div>
          {changing === w.id && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <PasswordChooser mode={mode} value={pw} onMode={setMode} onValue={setPw} />
              {w.slug && <div className="text-[11px] text-slate-500">変更すると今のパスワードは使えなくなり、ログイン中の担当者もログアウトされます。</div>}
              <button disabled={!passwordOk(mode, pw)} onClick={() => issue(w.id)} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                {w.slug ? '変更する' : 'URLとパスワードを発行する'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 引当と出荷指示：未発注の明細を在庫から引き当て、倉庫ごとに出荷指示を出す */
function AllocationPanel({ data, onSaved }: { data: InventoryData; onSaved: () => void }) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [pick, setPick] = useState<Record<string, Record<string, string>>>({}); // 行キー → 倉庫 → 数
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ship, setShip] = useState<{ id: string; carrier: string; tracking: string } | null>(null);
  const rowKey = (c: Candidate) => `${c.orderId}|${c.productId}`;

  const loadCands = useCallback(() => {
    api('/api/inventory/allocation-candidates')
      .then((j) => {
        setCands(j.candidates);
        const p: Record<string, Record<string, string>> = {};
        j.candidates.forEach((c: Candidate) => (p[`${c.orderId}|${c.productId}`] = Object.fromEntries(c.suggest.map((x) => [x.warehouse, String(x.qty)]))));
        setPick(p);
        setChecked({});
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(loadCands, [loadCands, data]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const confirmAlloc = () =>
    run(() => {
      const items = (cands || [])
        .filter((c) => checked[rowKey(c)])
        .flatMap((c) => WH_IDS.map((w) => ({ orderId: c.orderId, productId: c.productId, warehouse: w, qty: Number(pick[rowKey(c)]?.[w] || 0) })).filter((x) => x.qty > 0));
      return api('/api/inventory/allocations', { method: 'POST', body: JSON.stringify({ items }) });
    });

  // 引当済み（出荷指示前）をご注文・倉庫ごとにまとめる
  const groups = useMemo(() => {
    const m = new Map<string, { orderId: string; clinicName: string; warehouse: WarehouseId; items: Allocation[] }>();
    data.allocations
      .filter((a) => a.status === 'reserved')
      .forEach((a) => {
        const k = `${a.orderId}|${a.warehouse}`;
        if (!m.has(k)) m.set(k, { orderId: a.orderId, clinicName: a.clinicName, warehouse: a.warehouse, items: [] });
        m.get(k)!.items.push(a);
      });
    return Array.from(m.values());
  }, [data.allocations]);
  const openInstr = data.instructions.filter((i) => i.status === 'open');
  const doneInstr = data.instructions.filter((i) => i.status === 'shipped');
  const nChecked = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div>}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold text-sm text-slate-900">① 引当の候補（未発注の明細 × 空き在庫）</div>
            <div className="text-[11px] text-slate-500">国内 → 韓国 → シンガポールの順に割り当てています。数を直してから、チェックした明細を確定してください。確定した明細は「発注管理（未発注）」から外れます。</div>
          </div>
          <button disabled={busy || nChecked === 0} onClick={confirmAlloc} className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
            チェックした{nChecked}件を引当確定
          </button>
        </div>
        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 sticky top-0">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" checked={!!cands && cands.length > 0 && nChecked === cands.length} onChange={(e) => setChecked(Object.fromEntries((cands || []).map((c) => [rowKey(c), e.target.checked])))} />
                </th>
                <th className="text-left px-2 py-2">受注</th>
                <th className="text-left px-2 py-2">商品</th>
                <th className="text-right px-2 py-2">未引当</th>
                {WH_IDS.map((w) => (
                  <th key={w} className="text-right px-2 py-2 whitespace-nowrap">
                    {WH_NAME[w].replace('倉庫', '')}（空き）
                  </th>
                ))}
                <th className="text-right px-2 py-2">不足</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cands === null && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    読み込み中…
                  </td>
                </tr>
              )}
              {cands?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    在庫で引き当てられる未発注の明細はありません
                  </td>
                </tr>
              )}
              {cands?.map((c) => {
                const k = rowKey(c);
                const total = WH_IDS.reduce((n, w) => n + Number(pick[k]?.[w] || 0), 0);
                return (
                  <tr key={k} className={checked[k] ? 'bg-indigo-50/50' : ''}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!checked[k]} onChange={(e) => setChecked({ ...checked, [k]: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-indigo-700">{c.orderId}</div>
                      <div className="text-[11px] text-slate-500 max-w-40 truncate">{c.clinicName}</div>
                      <div className="text-[10px] text-slate-400">{c.orderDate}・{c.paymentStatus}</div>
                    </td>
                    <td className="px-2 py-1.5 font-semibold">{c.productName}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold">{c.need}</td>
                    {WH_IDS.map((w) => {
                      const avail = c.stockAt.find((x) => x.warehouse === w)?.available || 0;
                      return (
                        <td key={w} className="px-2 py-1.5 text-right whitespace-nowrap">
                          {avail > 0 ? (
                            <>
                              <input
                                type="number"
                                min={0}
                                max={Math.min(avail, c.need)}
                                value={pick[k]?.[w] ?? ''}
                                onChange={(e) => setPick({ ...pick, [k]: { ...(pick[k] || {}), [w]: e.target.value } })}
                                className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right font-mono"
                              />
                              <span className="text-[10px] text-slate-400 ml-1">/{avail}</span>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`px-2 py-1.5 text-right font-mono ${c.need - total > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`}>{Math.max(0, c.need - total) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100">
          <div className="font-bold text-sm text-slate-900">② 引当済み（出荷指示前）</div>
          <div className="text-[11px] text-slate-500">ご注文・倉庫ごとにまとめています。「出荷指示を出す」と、倉庫の担当者画面に出ます（国内倉庫は下の③で社内が出荷します）。</div>
        </div>
        {groups.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">引当済みで出荷指示前のものはありません</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => (
              <div key={`${g.orderId}-${g.warehouse}`} className="p-3 flex flex-wrap items-start justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold">
                    <span className="font-mono text-indigo-700">{g.orderId}</span> {g.clinicName}
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{WH_NAME[g.warehouse]}</span>
                  </div>
                  {g.items.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 mt-0.5">
                      <span>
                        {a.productName} × <b className="font-mono">{a.qty}</b>
                      </span>
                      <button disabled={busy} onClick={() => run(() => api(`/api/inventory/allocations/${a.id}/cancel`, { method: 'POST' }))} className="text-[11px] text-rose-600 hover:underline">
                        引当を取り消す
                      </button>
                    </div>
                  ))}
                </div>
                <button disabled={busy} onClick={() => run(() => api('/api/inventory/instructions', { method: 'POST', body: JSON.stringify({ orderId: g.orderId, warehouse: g.warehouse }) }))} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 text-white px-3 py-1.5 font-bold">
                  <Send className="w-3.5 h-3.5" />
                  出荷指示を出す
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100">
          <div className="font-bold text-sm text-slate-900">③ 出荷指示（出荷待ち {openInstr.length}件）</div>
          <div className="text-[11px] text-slate-500">韓国・シンガポールは倉庫の担当者が出荷して完了にします。国内倉庫は社内で「出荷完了」を押してください（在庫から引かれます）。楽楽販売の出荷管理への入力は別途お願いします。</div>
        </div>
        <div className="divide-y divide-slate-100">
          {[...openInstr, ...doneInstr].length === 0 && <div className="p-6 text-center text-xs text-slate-400">出荷指示はまだありません</div>}
          {[...openInstr, ...doneInstr].map((i) => (
            <div key={i.id} className={`p-3 text-xs space-y-1 ${i.status === 'shipped' ? 'bg-slate-50/60' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold">
                  <span className="font-mono text-indigo-700">{i.id}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5">{i.warehouseName}</span>
                  <span className="ml-2">
                    {i.orderId} {i.clinicName}
                  </span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 ${i.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{i.status === 'open' ? '出荷待ち' : `出荷済み ${fmt(i.shippedAt || null)}`}</span>
                </div>
                {i.status === 'open' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setShip({ id: i.id, carrier: '', tracking: '' })} className="rounded bg-emerald-600 text-white px-2.5 py-1 font-bold">
                      出荷完了にする
                    </button>
                    <button disabled={busy} onClick={() => confirm('出荷指示を取り消して、引当済みに戻します。よろしいですか？') && run(() => api(`/api/inventory/instructions/${i.id}/cancel`, { method: 'POST' }))} className="rounded border border-slate-300 px-2.5 py-1 font-bold text-slate-600">
                      取り消す
                    </button>
                  </div>
                )}
              </div>
              <div className="text-slate-600">{i.lines.map((l) => `${l.productName} × ${l.qty}`).join('、')}</div>
              <div className="text-[11px] text-slate-500">
                届け先：{i.destination.name}
                {i.destination.postalCode && ` 〒${i.destination.postalCode}`} {i.destination.address} {i.destination.phone && `TEL ${i.destination.phone}`}
              </div>
              {i.trackingNos.length > 0 && (
                <div className="text-[11px] font-mono">
                  {i.carrier} {i.trackingNos.join('、')}
                </div>
              )}
              {ship?.id === i.id && (
                <div className="flex flex-wrap items-center gap-2 rounded bg-emerald-50 border border-emerald-200 p-2">
                  <input value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} placeholder="配送業者（佐川・ヤマト・DHL など）" className="rounded border border-slate-300 px-2 py-1 w-52" />
                  <input value={ship.tracking} onChange={(e) => setShip({ ...ship, tracking: e.target.value })} placeholder="追跡番号（複数は「、」区切り）" className="rounded border border-slate-300 px-2 py-1 w-64 font-mono" />
                  <button disabled={busy} onClick={() => run(() => api(`/api/inventory/instructions/${i.id}/ship`, { method: 'POST', body: JSON.stringify({ carrier: ship.carrier, trackingNos: ship.tracking }) })).then(() => setShip(null))} className="rounded bg-emerald-600 text-white px-3 py-1 font-bold">
                    出荷完了（在庫から引く）
                  </button>
                  <button onClick={() => setShip(null)} className="rounded border border-slate-300 px-3 py-1 font-bold">
                    やめる
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function InventoryView({ orders }: { orders: Order[] }) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'inbound' | 'allocation' | 'stock' | 'moves' | 'access'>('inbound');
  const [wh, setWh] = useState<'all' | WarehouseId>('all');
  const [stateFilter, setStateFilter] = useState<'open' | 'waiting' | 'received' | 'shortage' | 'closed' | 'all'>('open');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [startDate, setStartDate] = useState('');

  const load = useCallback(() => {
    api('/api/inventory')
      .then((j) => {
        setData(j);
        setStartDate((s) => s || j.settings.startDate.replace(/\//g, '-'));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // 商品の候補（取り込み・在庫の追加で名前から商品IDを探す）
  const products = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach((o) => o.lines.forEach((l) => l.productId && !m.has(l.productId) && m.set(l.productId, l.productName)));
    return Array.from(m, ([productId, productName]) => ({ productId, productName })).sort((a, b) => a.productName.localeCompare(b.productName, 'ja'));
  }, [orders]);

  // 以前このブラウザに保存していた韓国倉庫の在庫（CSV取り込み）があれば、サーバーへ移せるようにする
  const legacyKorea = useMemo(() => {
    try {
      const raw = localStorage.getItem('nouki_multi_warehouse_stock_v3');
      const list = raw ? (JSON.parse(raw) as any[]) : [];
      return list.filter((r) => (r.koreaStock || 0) > 0).map((r) => ({ productId: String(r.productId || ''), productName: String(r.productName || ''), qty: Number(r.koreaStock) }));
    } catch {
      return [];
    }
  }, []);

  const inbound = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.inbound.filter((r) => {
      if (wh !== 'all' && r.warehouse !== wh) return false;
      const closed = r.excluded || r.cancelled;
      if (stateFilter === 'open' && (r.received || closed)) return false;
      if (stateFilter === 'waiting' && !['arrived', 'kick', 'handcarry'].includes(r.state)) return false;
      if (stateFilter === 'received' && !r.received) return false;
      if (stateFilter === 'shortage' && !r.shortage) return false;
      if (stateFilter === 'closed' && !closed) return false;
      if (needle && !`${r.poId} ${r.supplierName} ${r.orderId} ${r.clinicName} ${r.lines.map((l) => l.productName).join(' ')} ${r.trackingNos.join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, wh, stateFilter, q]);

  const counts = useMemo(() => {
    const c = { noTracking: 0, waiting: 0, shortage: 0 };
    data?.inbound.forEach((r) => {
      if (r.state === 'no_tracking') c.noTracking++;
      if (['arrived', 'kick', 'handcarry'].includes(r.state)) c.waiting++;
      if (r.shortage) c.shortage++;
    });
    return c;
  }, [data]);

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">{error || '読み込み中…'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Boxes className="w-6 h-6 text-indigo-600" />
              入荷・在庫・引当（国内・韓国・シンガポール）
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              楽楽販売の発注（発注済み）から入荷予定を作ります。入荷先・配送方法・追跡番号・数量はここで入れ、倉庫の担当者が実数を入れて承認すると在庫に加わります。楽楽販売には書き込みません。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">発注の取り込み {fmt(data.poSyncedAt)}</span>
            <button
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                setError('');
                try {
                  await api('/api/inventory/refresh-po', { method: 'POST' });
                  load();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setRefreshing(false);
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-3 py-1.5 font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '楽楽から取り込み中…' : '楽楽から発注を取り込む'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">入荷予定にする発注日</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-300 px-2 py-0.5" />
          <span className="text-slate-500">以降</span>
          {startDate.replace(/-/g, '/') !== data.settings.startDate && (
            <button
              onClick={() => api('/api/inventory/settings', { method: 'POST', body: JSON.stringify({ startDate }) }).then(load).catch((e) => setError(e.message))}
              className="rounded bg-slate-900 text-white px-2 py-0.5 font-bold"
            >
              保存（次の取り込みから反映）
            </button>
          )}
        </div>
        {error && <div className="text-xs text-rose-600">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-[11px] text-amber-800 font-semibold">追跡番号待ち</div>
            <div className="text-2xl font-black text-amber-700 font-mono">{counts.noTracking}</div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="text-[11px] text-violet-800 font-semibold">倉庫の承認待ち（到着・キック・持込）</div>
            <div className="text-2xl font-black text-violet-700 font-mono">{counts.waiting}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-[11px] text-rose-800 font-semibold">入荷数の不足</div>
            <div className="text-2xl font-black text-rose-700 font-mono">{counts.shortage}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['inbound', '入荷予定', Truck],
            ['allocation', `引当・出荷指示${data.instructions.filter((i) => i.status === 'open').length ? `（出荷待ち${data.instructions.filter((i) => i.status === 'open').length}）` : ''}`, ClipboardList],
            ['stock', '在庫', PackageCheck],
            ['moves', '入出庫の履歴', History],
            ['access', '倉庫の担当者画面', KeyRound],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border ${tab === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'inbound' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={wh} onChange={(e) => setWh(e.target.value as any)} className="rounded-md border border-slate-300 px-2 py-1 font-semibold">
              <option value="all">すべての倉庫</option>
              {WH_IDS.map((w) => (
                <option key={w} value={w}>
                  {WH_NAME[w]}
                </option>
              ))}
            </select>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as any)} className="rounded-md border border-slate-300 px-2 py-1 font-semibold">
              <option value="open">未入荷（すべて）</option>
              <option value="waiting">倉庫の承認待ち</option>
              <option value="received">入荷済み</option>
              <option value="shortage">不足あり</option>
              <option value="closed">対象外・発注取消</option>
              <option value="all">すべて</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="発注ID・仕入先・商品・追跡番号" className="rounded-md border border-slate-300 pl-7 pr-2 py-1 w-64" />
            </div>
            <span className="text-slate-500">{inbound.length}件</span>
          </div>
          {inbound.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              該当する入荷予定はありません。{data.inbound.length === 0 && '「楽楽から発注を取り込む」を押すか、次の全件同期（2時間ごと）をお待ちください。'}
            </div>
          )}
          {inbound.map((r) => (
            <InboundCard key={`${r.poId}-${r.updatedAt ?? ''}-${r.trackingNos.join()}-${r.lines.map((l) => l.qty).join()}`} rec={r} onSaved={load} />
          ))}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setImportOpen(!importOpen)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" />
              在庫の取り込み（CSV）
            </button>
            {legacyKorea.length > 0 && data.stock.korea.length === 0 && (
              <button
                onClick={() =>
                  api('/api/inventory/import', { method: 'POST', body: JSON.stringify({ warehouse: 'korea', rows: legacyKorea, replace: false }) })
                    .then(load)
                    .catch((e) => setError(e.message))
                }
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 text-white px-3 py-1.5 text-xs font-bold"
              >
                以前の画面に取り込んでいた韓国在庫（{legacyKorea.length}品目）を移す
              </button>
            )}
          </div>
          {importOpen && <ImportPanel products={products} onDone={load} onClose={() => setImportOpen(false)} />}
          <div className="grid xl:grid-cols-3 gap-3">
            {WH_IDS.map((w) => (
              <StockTable key={w} warehouse={w} rows={data.stock[w] || []} onSaved={load} products={products} />
            ))}
          </div>
        </div>
      )}

      {tab === 'moves' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-auto max-h-[640px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">日時</th>
                <th className="text-left px-3 py-2">倉庫</th>
                <th className="text-left px-3 py-2">種類</th>
                <th className="text-left px-3 py-2">商品</th>
                <th className="text-right px-3 py-2">数量</th>
                <th className="text-left px-3 py-2">発注ID・メモ</th>
                <th className="text-left px-3 py-2">操作した人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.moves.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    まだ入出庫はありません
                  </td>
                </tr>
              )}
              {data.moves.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmt(m.at)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{WH_NAME[m.warehouse]}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{MOVE_LABEL[m.type] || m.type}</td>
                  <td className="px-3 py-1.5 font-semibold">{m.productName}</td>
                  <td className={`px-3 py-1.5 text-right font-mono font-bold ${m.delta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="px-3 py-1.5 text-slate-600">{[m.ref, m.memo].filter(Boolean).join('・')}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.by === 'warehouse' ? '倉庫' : '社内'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'allocation' && <AllocationPanel data={data} onSaved={load} />}
      {tab === 'access' && <WarehouseAccessPanel data={data} onSaved={load} />}
      <div className="text-[11px] text-slate-400 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        入荷予定の追跡番号は、出荷の追跡と同じく配送会社のデータで自動確認します（到着すると「倉庫に到着・承認待ち」）。
      </div>
    </div>
  );
}
