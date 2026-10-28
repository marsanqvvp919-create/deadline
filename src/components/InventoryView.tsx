import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { demoHeaders, isInventoryDemo, setInventoryDemo } from '../utils/demo';
import { Boxes, CheckCircle2, Copy, Check, ExternalLink, KeyRound, PackageCheck, RefreshCw, Search, Truck, Upload, X, Ban, RotateCcw, History, Warehouse, ClipboardList, Send } from 'lucide-react';
import { PasswordChooser, passwordOk } from './ClinicPortalAccess';
import { Order } from '../types';
import { InvoicePdfButtons } from '../invoice/InvoiceDialog';
import { useCoolFlags } from '../utils/coolFlags';
import { DhlSettings, FedexSettings, ShipDocsDialog } from '../invoice/AwbDialog';
import { notifyDone, notifyError } from './flow/UndoToast';
import { TONE, Tone } from './flow/tone';
import { PUBLIC_ORIGIN } from '../utils/publicUrl';
import { askConfirm } from './flow/Confirm';

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
  cool?: boolean;
  lines: { productName: string; qty: number; cool?: boolean }[];
  status: 'open' | 'shipped' | 'cancelled';
  memo: string;
  carrier: string;
  trackingNos: string[];
  createdAt: string;
  shippedAt?: string;
  shippedBy?: string;
  invoiceNo?: string;
  awbNo?: string;
  awbCarrier?: string;
  awbMode?: 'api' | 'manual';
  awbLabel?: boolean;
  delivery?: { code: string; label: string } | null;
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
  sampleSeed?: { at: string; count: number } | null;
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
// 入荷の状態の色（全画面共通の色のルール）。国内倉庫の到着・キック・持込は社内で承認するので「あなたの作業待ち」
const STATE_TONE: Record<string, 'urgent' | 'action' | 'waiting' | 'done' | 'na'> = {
  no_tracking: 'action',
  tracking: 'waiting',
  in_transit: 'waiting',
  arrived: 'waiting',
  kick: 'waiting',
  handcarry: 'waiting',
  received: 'done',
  shortage: 'urgent',
  excluded: 'na',
  cancelled: 'na',
};
const stateTone = (r: { state: string; warehouse: string }) => (r.warehouse === 'domestic' && ['arrived', 'kick', 'handcarry'].includes(r.state) ? 'action' : STATE_TONE[r.state] || 'na');
/** 入荷予定で次にやること（1行） */
const inboundNext = (r: { state: string; warehouse: string; received: boolean }) =>
  r.state === 'no_tracking'
    ? '次にやること：下に追跡番号を入れる（キック・持込なら配送方法を選ぶ）'
    : r.warehouse === 'domestic' && ['arrived', 'kick', 'handcarry'].includes(r.state)
      ? '次にやること：届いたら「国内倉庫に届いた」で数を確認して承認'
      : ['arrived', 'kick', 'handcarry'].includes(r.state)
        ? '倉庫の担当者が数を確認して承認するのを待っています'
        : ['tracking', 'in_transit'].includes(r.state)
          ? '倉庫に届くのを待っています（自動で追跡しています）'
          : r.state === 'shortage'
            ? '届いた数が足りません。仕入先に確認してください'
            : '';

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...demoHeaders(), ...(init?.headers || {}) } });
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
    <div className={`min-w-0 rounded-xl border bg-white p-3 space-y-2 ${rec.excluded || rec.cancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-indigo-700">{rec.poId}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${TONE[stateTone(rec)]}`}>{rec.stateLabel}</span>
            <span className="text-[11px] text-slate-500">発注日 {rec.poDate || '—'}</span>
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            {rec.supplierName || '（仕入先なし）'}
            <span className="ml-1.5 text-[11px] font-normal text-slate-500">{rec.supplierArea}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            受注 {rec.orderId || '—'} {rec.clinicName}
          </div>
          {inboundNext(rec) && <div className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-bold ${TONE[stateTone(rec) === 'action' ? 'action' : stateTone(rec) === 'urgent' ? 'urgent' : 'waiting']}`}>{inboundNext(rec)}</div>}
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
          {(!rec.cancelled || rec.received) && (
            <details className="relative">
            <summary title="そのほかの操作" className="list-none cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50">…</summary>
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg space-y-1.5 text-[11px]">
              {!rec.received && !rec.cancelled && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    const to = !rec.excluded;
                    await save({ excluded: to });
                    notifyDone(to ? `${rec.poId} を対象外にしました` : `${rec.poId} を入荷予定に戻しました`, async () => {
                      await api(`/api/inventory/inbound/${rec.poId}`, { method: 'POST', body: JSON.stringify({ excluded: !to }) });
                      onSaved();
                    });
                  }}
                  className="flex items-center gap-1 text-slate-700"
                >
                  {rec.excluded ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {rec.excluded ? '入荷予定に戻す' : '対象外にする（倉庫を通らない等）'}
                </button>
              )}
              {rec.received && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/api/inventory/inbound/${rec.poId}/unreceive`, { method: 'POST' });
                      onSaved();
                      notifyDone(`${rec.poId} の承認を取り消しました（在庫から引きました）`);
                    } catch (e: any) {
                      notifyError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex items-center gap-1 text-rose-600"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  承認を取り消す（在庫から承認した数を引く）
                </button>
              )}
            </div>
          </details>
          )}
        </div>
      </div>

      <table className="w-full table-fixed text-xs">
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
              <td className="py-1 font-semibold text-slate-800 truncate" title={l.productName}>{l.productName}</td>
              <td className="py-1 text-right font-mono text-slate-500">{l.poQty}</td>
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
              placeholder="仕入先 → 倉庫の追跡番号（複数は「、」区切り）"
              className="flex-1 min-w-40 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-mono"
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
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-xs font-bold">
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
              notifyDone(`${rec.poId} を承認し、国内倉庫の在庫に${rec.lines.reduce((n, l) => n + (Number(qty[l.key]) || 0), 0)}点を加えました`, async () => {
                await api(`/api/inventory/inbound/${rec.poId}/unreceive`, { method: 'POST' });
                onSaved();
              });
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
      <div className="text-[11px] text-emerald-800">国内倉庫の在庫に {rec.lines.reduce((n, l) => n + (Number(qty[l.key]) || 0), 0)}点を加えます。予定より少ない商品は「不足」になります。</div>
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
  const url = (slug: string) => `${PUBLIC_ORIGIN}/warehouse/${slug}`;
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
/** 出荷指示のステータス：指示 → インボイス → AWB → 出荷 → 配達 */
function InstructionBoard({ instructions, onSaved }: { instructions: Instruction[]; onSaved: () => void }) {
  const [filter, setFilter] = useState<'open' | 'shipped' | 'all'>('open');
  const [wh, setWh] = useState<'all' | WarehouseId>('all');
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const [ship, setShip] = useState<{ id: string; carrier: string; tracking: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, done?: string, undo?: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      onSaved();
      if (done) notifyDone(done, undo ? async () => (await undo(), onSaved()) : undefined);
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const list = instructions.filter((i) => (filter === 'all' || i.status === filter) && (wh === 'all' || i.warehouse === wh));
  const count = (st: string) => instructions.filter((i) => i.status === st).length;
  // ステップの表示（押すボタンは右の「次の一手」だけ）
  const chip = (tone: Tone, label: string, sub?: React.ReactNode) => (
    <div className={`min-w-0 rounded-lg border px-2 py-1 ${TONE[tone]}`}>
      <div className="text-[10px] font-bold truncate">
        {tone === 'done' ? '✓ ' : ''}
        {label}
      </div>
      <div className="text-[11px] text-slate-700 truncate h-4 leading-4">{sub || '—'}</div>
    </div>
  );
  /** この出荷依頼で次にやること（ボタンは1つ） */
  const next = (i: Instruction): { label: string; preview: string; onClick: () => void } | { wait: string } | null => {
    if (i.status !== 'open') return null;
    const intl = i.warehouse !== 'domestic';
    if (intl && !i.invoiceNo) return { label: 'インボイスと送り状を作る', preview: 'インボイスを確認して発行し、同じ画面で続けて送り状（AWB）も作れます', onClick: () => setDocsFor(i.id) };
    if (intl && !i.awbNo) return { label: '送り状（AWB）を作る', preview: 'インボイスの内容から送り状を作ります。住所を確認してから発行します', onClick: () => setDocsFor(i.id) };
    if (!intl) return { label: '出荷完了にする', preview: '国内倉庫の在庫から引き、出荷済みにします', onClick: () => setShip({ id: i.id, carrier: '', tracking: '' }) };
    return { wait: `${WH_NAME[i.warehouse]}の担当者が出荷するのを待っています` };
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-sm text-slate-900">倉庫への出荷依頼</div>
          <div className="text-[11px] text-slate-500">右の黄色いボタンが次にやることです。国内倉庫の国内発送はインボイス・送り状が要りません。</div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {([['open', `出荷待ち（${count('open')}）`], ['shipped', `出荷済み（${count('shipped')}）`], ['all', 'すべて']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className={`rounded-lg border px-2.5 py-1 font-bold ${filter === id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pt-2">
        <WarehouseTabs
          value={wh}
          onChange={setWh}
          counts={Object.fromEntries((['all', ...WH_IDS] as const).map((w) => [w, instructions.filter((i) => (filter === 'all' || i.status === filter) && (w === 'all' || i.warehouse === w)).length]))}
        />
      </div>
      <div className="divide-y divide-slate-100">
        {list.length === 0 && <div className="p-6 text-center text-xs text-slate-400">該当する出荷依頼はありません</div>}
        {list.map((i) => {
          const intl = i.warehouse !== 'domestic';
          const nx = next(i);
          return (
            <div key={i.id} className={`p-3 text-xs space-y-2 ${i.status === 'shipped' ? 'bg-slate-50/50' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">
                    <span className="font-mono text-indigo-700">{i.id}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5">{i.warehouseName}</span>
                    {i.cool && <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] text-white">❄ クール便</span>}
                    <span className="ml-2 text-sm">{i.clinicName}</span>
                    <span className="ml-2 font-normal text-slate-500">{i.orderId}</span>
                  </div>
                  <div className="text-slate-600 mt-0.5">{i.lines.map((l: any) => `${l.cool ? '❄' : ''}${i.orderId.includes(',') && l.orderId ? `[${l.orderId}] ` : ''}${l.productName} × ${l.qty}`).join('、')}</div>
                </div>
                <div className="flex items-start gap-1.5">
                  {nx && 'label' in nx && (
                    <div className="text-right">
                      <button disabled={busy} onClick={nx.onClick} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 font-bold disabled:opacity-50">
                        {nx.label}
                      </button>
                      <div className="text-[10px] text-slate-500 mt-0.5 w-64 leading-snug">{nx.preview}</div>
                    </div>
                  )}
                  {nx && 'wait' in nx && <span className={`rounded-lg border px-2.5 py-1.5 font-bold ${TONE.waiting}`}>{nx.wait}</span>}
                  <details className="relative">
                    <summary className="list-none cursor-pointer rounded-lg border border-slate-200 px-2 py-1.5 text-slate-500 hover:bg-slate-50">…</summary>
                    <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg space-y-1.5">
                      {i.invoiceNo && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-500">インボイス {i.invoiceNo}</div>
                          <InvoicePdfButtons source={`/api/invoice/doc/${i.id}`} label={false} />
                        </div>
                      )}
                      {i.awbLabel && (
                        <a href={`/api/awb/label/${i.id}`} target="_blank" rel="noreferrer" className="block text-indigo-700 font-bold">
                          送り状のラベルPDF
                        </a>
                      )}
                      {i.status === 'open' && intl && i.invoiceNo && i.awbNo && (
                        <button onClick={() => setShip({ id: i.id, carrier: i.awbCarrier || '', tracking: i.awbNo || '' })} className="block text-left text-slate-700">
                          倉庫の代わりに出荷完了にする
                        </button>
                      )}
                      {i.awbMode === 'manual' && i.status === 'open' && (
                        <button onClick={() => run(() => api(`/api/awb/manual/${i.id}`, { method: 'POST', body: JSON.stringify({ awbNo: '' }) }), '送り状の番号を消しました')} className="block text-left text-slate-700">
                          送り状の番号を消す
                        </button>
                      )}
                      {i.status === 'open' && (
                        <button
                          onClick={() =>
                            run(() => api(`/api/inventory/instructions/${i.id}/cancel`, { method: 'POST' }), `${i.id} の出荷依頼を取り消しました（確保した在庫は残っています）`, () =>
                              api(`/api/inventory/instructions/${i.id}/restore`, { method: 'POST' })
                            )
                          }
                          className="block text-left text-rose-600"
                        >
                          出荷依頼を取り消す
                        </button>
                      )}
                      {i.status === 'shipped' && (
                        <button
                          onClick={() => run(() => api(`/api/inventory/instructions/${i.id}/unship`, { method: 'POST' }), `${i.id} を出荷待ちに戻しました（在庫を戻しました）`)}
                          className="block text-left text-rose-600"
                        >
                          出荷完了を取り消す
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 max-w-5xl">
                {chip('done', '出荷依頼', fmt(i.createdAt))}
                {intl ? chip(i.invoiceNo ? 'done' : 'action', 'インボイス', i.invoiceNo ? <span className="font-mono">{i.invoiceNo}</span> : '未作成') : chip('na', 'インボイス', '国内のため不要')}
                {intl
                  ? chip(i.awbNo ? 'done' : i.invoiceNo ? 'action' : 'na', '送り状（AWB）', i.awbNo ? <span className="font-mono">{`${i.awbCarrier || ''} ${i.awbNo}`}</span> : i.invoiceNo ? '未作成' : 'インボイスの後')
                  : chip('na', '送り状（AWB）', '国内のため不要')}
                {chip(
                  i.status === 'shipped' ? 'done' : !intl || (i.invoiceNo && i.awbNo) ? (intl ? 'waiting' : 'action') : 'na',
                  '出荷',
                  i.status === 'shipped' ? `${fmt(i.shippedAt || null)}${i.shippedBy === 'warehouse' ? '（倉庫）' : '（社内）'}` : intl ? '倉庫の出荷待ち' : '未出荷'
                )}
                {chip(
                  i.delivery?.code === 'delivered' ? 'done' : i.delivery?.code === 'exception' ? 'urgent' : i.status === 'shipped' ? 'waiting' : 'na',
                  '配達',
                  i.delivery ? i.delivery.label : i.status === 'shipped' ? '確認中' : '—'
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                届け先：{i.destination.name}
                {i.destination.postalCode && ` 〒${i.destination.postalCode}`} {i.destination.address} {i.destination.phone && `TEL ${i.destination.phone}`}
                {i.trackingNos.length > 0 && <span className="ml-2 font-mono text-slate-700">追跡 {i.carrier} {i.trackingNos.join('、')}</span>}
              </div>
              {ship?.id === i.id && (
                <div className="flex flex-wrap items-center gap-2 rounded bg-amber-50 border border-amber-200 p-2">
                  <input value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} placeholder="配送業者（佐川・ヤマト・DHL など）" className="rounded border border-slate-300 px-2 py-1 w-52" />
                  <input value={ship.tracking} onChange={(e) => setShip({ ...ship, tracking: e.target.value })} placeholder="追跡番号（複数は「、」区切り）" className="rounded border border-slate-300 px-2 py-1 w-64 font-mono" />
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/api/inventory/instructions/${i.id}/ship`, { method: 'POST', body: JSON.stringify({ carrier: ship.carrier, trackingNos: ship.tracking }) }),
                        `${i.id} を出荷完了にしました（在庫から ${i.lines.reduce((n, l) => n + l.qty, 0)}点を引きました）`,
                        () => api(`/api/inventory/instructions/${i.id}/unship`, { method: 'POST' })
                      ).then(() => setShip(null))
                    }
                    className="rounded bg-amber-500 text-white px-3 py-1 font-bold"
                  >
                    出荷完了にする
                  </button>
                  <button onClick={() => setShip(null)} className="rounded border border-slate-300 px-3 py-1 font-bold">
                    やめる
                  </button>
                  <span className="basis-full text-[11px] text-slate-600">
                    {WH_NAME[i.warehouse]}の在庫から {i.lines.map((l) => `${l.productName} ${l.qty}`).join('、')} を引き、出荷済みにします。
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {docsFor && <ShipDocsDialog instructionId={docsFor} onClose={() => setDocsFor(null)} onChanged={onSaved} />}
    </section>
  );
}

interface PlanLine {
  productId: string;
  productName: string;
  quantity: number;
  allocated: number;
  need: number;
  latestDate: string | null;
  stock: Record<WarehouseId, number>;
}
interface OrderPlan {
  orderId: string;
  orderDate: string;
  clinicId: string;
  clinicName: string;
  paymentStatus: string;
  salesRep: string;
  latestDate: string | null;
  partlyAllocated: boolean;
  lines: PlanLine[];
  plan: {
    type: 'single' | 'split' | 'partial' | 'none';
    allocations: { productId: string; warehouse: WarehouseId; qty: number }[];
    missing: { productId: string; qty: number }[];
    singleOptions: WarehouseId[];
    warehouses: WarehouseId[];
  };
}
const PLAN_STYLE: Record<OrderPlan['plan']['type'], string> = { single: TONE.action, split: TONE.action, partial: TONE.action, none: TONE.na };
const planLabel = (p: OrderPlan['plan']) =>
  p.type === 'single'
    ? `${WH_NAME[p.warehouses[0]]}から1回で出荷できます`
    : p.type === 'split'
      ? `${p.warehouses.map((w) => WH_NAME[w]).join('と')}に分かれます`
      : p.type === 'partial'
        ? `一部だけ在庫あり（あと${p.missing.reduce((n, m) => n + m.qty, 0)}点は発注が必要）`
        : '在庫なし（発注が必要）';

/** 伝票1枚の引当（明細ごとの空き在庫と、案の倉庫を示す） */
function OrderPlanCard({ op, onDone, onError }: { op: OrderPlan; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [coolFlags] = useCoolFlags();
  const hasCool = op.lines.some((l) => coolFlags[l.productId]);
  const [single, setSingle] = useState<WarehouseId | ''>(op.plan.singleOptions[0] || '');
  const planned = (productId: string, w: WarehouseId) => op.plan.allocations.filter((a) => a.productId === productId && a.warehouse === w).reduce((n, a) => n + a.qty, 0);
  const missingOf = (productId: string) => op.plan.missing.find((m) => m.productId === productId)?.qty || 0;
  const go = async (body: object, done: string) => {
    setBusy(true);
    try {
      const j = await api('/api/inventory/allocate-order', { method: 'POST', body: JSON.stringify({ orderId: op.orderId, ...body }) });
      onDone();
      notifyDone(done, async () => {
        await api('/api/inventory/allocations/cancel-many', { method: 'POST', body: JSON.stringify({ ids: j.ids }) });
        onDone();
      });
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const total = op.lines.reduce((n, l) => n + l.need, 0);
  const planText = op.plan.warehouses.map((w) => `${WH_NAME[w]}から${op.plan.allocations.filter((a) => a.warehouse === w).reduce((n, a) => n + a.qty, 0)}点`).join('、');
  const missingTotal = op.plan.missing.reduce((n, m) => n + m.qty, 0);
  const dl = op.latestDate ? Math.round((new Date(op.latestDate.replace(/\//g, '-') + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono font-bold text-indigo-700">{op.orderId}</span>
          <span className="text-slate-500">{op.orderDate}</span>
          <span className={`rounded px-1.5 py-0.5 ${op.paymentStatus === '入金済' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{op.paymentStatus || '—'}</span>
          {op.latestDate && <span className={`rounded px-1.5 py-0.5 font-bold ${dl !== null && dl < 0 ? 'bg-rose-100 text-rose-700' : dl !== null && dl <= 7 ? 'bg-amber-100 text-amber-800' : 'text-slate-500'}`}>最長納期 {op.latestDate.slice(5)}{dl !== null && (dl < 0 ? `（${-dl}日超過）` : `（あと${dl}日）`)}</span>}
          {op.partlyAllocated && <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5">一部引当済み</span>}
          {hasCool && <span className="rounded-full bg-sky-600 text-white px-2 py-0.5 font-bold">❄ クール便</span>}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${PLAN_STYLE[op.plan.type]}`}>{planLabel(op.plan)}</span>
      </div>
      <table className="w-full table-fixed text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="text-left px-3 py-1 font-semibold">商品</th>
            <th className="text-right px-2 py-1 font-semibold w-12">必要</th>
            {WH_IDS.map((w) => (
              <th key={w} className="text-center px-1 py-1 font-semibold w-20" title={`${WH_NAME[w]}の空き在庫`}>
                {w === 'singapore' ? 'SG' : WH_NAME[w].replace('倉庫', '')}の空き
              </th>
            ))}
            <th className="text-right px-3 py-1 font-semibold w-14">不足</th>
          </tr>
        </thead>
        <tbody>
          {op.lines.map((l) => (
            <tr key={l.productId} className="border-t border-slate-50">
              <td className="px-3 py-1.5 font-semibold text-slate-800 truncate" title={l.productName}>
                {coolFlags[l.productId] && <span className="mr-1 text-sky-600" title="クール便が必要">❄</span>}
                {l.productName}
              </td>
              <td className="px-2 py-1.5 text-right font-mono font-bold">{l.need}</td>
              {WH_IDS.map((w) => {
                const n = l.stock[w] || 0;
                const use = planned(l.productId, w);
                return (
                  <td key={w} className="px-1 py-1.5 text-center">
                    {n > 0 ? (
                      <span className={`inline-block min-w-12 rounded px-1.5 py-0.5 font-mono ${use > 0 ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-500'}`} title={use > 0 ? `案ではここから${use}点` : ''}>
                        {use > 0 ? `${use}/${n}` : n}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
              <td className={`px-3 py-1.5 text-right font-mono ${missingOf(l.productId) ? 'text-rose-600 font-bold' : 'text-slate-300'}`}>{missingOf(l.productId) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-xs">
        {op.plan.type === 'single' && (
          <>
            {op.plan.singleOptions.length > 1 && (
              <select value={single} onChange={(e) => setSingle(e.target.value as WarehouseId)} className="rounded border border-slate-300 px-2 py-1">
                {op.plan.singleOptions.map((w) => (
                  <option key={w} value={w}>
                    {WH_NAME[w]}から出す
                  </option>
                ))}
              </select>
            )}
            <button disabled={busy || !single} onClick={() => go({ mode: 'single', warehouse: single }, `${op.orderId} の${total}点を${WH_NAME[single as WarehouseId]}で確保しました（次は下の「倉庫へ出荷依頼」）`)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 font-bold disabled:opacity-50">
              在庫を確保する（1回で出荷）
            </button>
            <span className="flex-1 min-w-48 text-[11px] text-slate-500">{single && `${WH_NAME[single as WarehouseId]}の在庫から${total}点を確保します。この伝票は未発注の一覧から消えます。`}</span>
          </>
        )}
        {(op.plan.type === 'split' || op.plan.type === 'partial') && (
          <>
            <button disabled={busy} onClick={() => go({ mode: 'plan' }, `${op.orderId} の先に届く分（${planText}）を確保しました`)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 font-bold disabled:opacity-50">
              先に届く分だけ送る
            </button>
            <span className="flex-1 min-w-48 text-[11px] text-slate-500">
              {planText}を確保します。{missingTotal > 0 && `残り${missingTotal}点は発注が必要です。`}出荷は{op.plan.warehouses.length + (missingTotal > 0 ? 1 : 0)}回に分かれます。全部そろうまで待つなら何もしなくて大丈夫です。
            </span>
          </>
        )}
        {op.plan.type === 'none' && <span className="text-slate-500">在庫がないので「未発注」から楽楽販売で発注してください。</span>}
      </div>
    </div>
  );
}

/** 引当と出荷指示：伝票ごとの引当案（クリニック単位にまとめて表示）と、引当済みから出荷指示を出す */
export function AllocationPanel({ data, onSaved }: { data: InventoryData; onSaved: () => void }) {
  const [plans, setPlans] = useState<OrderPlan[] | null>(null);
  const [filter, setFilter] = useState<'ready' | 'split' | 'all'>('ready');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, Set<string>>>({}); // 出荷指示にまとめる伝票（クリニック|倉庫 → 受注ID）

  const loadPlans = useCallback(() => {
    api('/api/inventory/order-plans')
      .then((j) => setPlans(j.plans))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(loadPlans, [loadPlans, data]);

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

  const counts = useMemo(() => {
    const c = { ready: 0, split: 0, all: 0 };
    (plans || []).forEach((p) => {
      if (p.plan.type === 'none') return;
      c.all++;
      if (p.plan.type === 'single') c.ready++;
      else c.split++;
    });
    return c;
  }, [plans]);

  // クリニックごとにまとめる
  const clinics = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (plans || []).filter((p) => {
      if (filter === 'ready' && p.plan.type !== 'single') return false;
      if (filter === 'split' && p.plan.type !== 'split' && p.plan.type !== 'partial') return false;
      if (filter === 'all' && p.plan.type === 'none') return false;
      if (needle && !`${p.orderId} ${p.clinicName} ${p.lines.map((l) => l.productName).join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const m = new Map<string, { clinicName: string; orders: OrderPlan[] }>();
    list.forEach((p) => {
      const k = p.clinicId || p.clinicName;
      if (!m.has(k)) m.set(k, { clinicName: p.clinicName, orders: [] });
      m.get(k)!.orders.push(p);
    });
    return Array.from(m.values());
  }, [plans, filter, q]);

  // 引当済み（出荷指示前）：クリニック × 倉庫ごと。中の伝票はまとめて1つの出荷指示にできる
  const reserved = useMemo(() => {
    const m = new Map<string, { key: string; clinicName: string; warehouse: WarehouseId; orders: Map<string, Allocation[]> }>();
    data.allocations
      .filter((a) => a.status === 'reserved')
      .forEach((a) => {
        const k = `${a.clinicName}|${a.warehouse}`;
        if (!m.has(k)) m.set(k, { key: k, clinicName: a.clinicName, warehouse: a.warehouse, orders: new Map() });
        const g = m.get(k)!;
        if (!g.orders.has(a.orderId)) g.orders.set(a.orderId, []);
        g.orders.get(a.orderId)!.push(a);
      });
    return Array.from(m.values());
  }, [data.allocations]);
  const chosen = (g: { key: string; orders: Map<string, Allocation[]> }) => pick[g.key] || new Set(g.orders.keys());

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div>}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div>
            <div className="font-bold text-sm text-slate-900">在庫を確保（伝票ごと・クリニック単位）</div>
            <div className="text-[11px] text-slate-500">1伝票はできるだけ1か所の倉庫からまとめて出します。青い数字が使う倉庫です。</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([['ready', `1回で出荷できる（${counts.ready}）`], ['split', `倉庫が分かれる・一部不足（${counts.split}）`], ['all', `在庫のあるすべて（${counts.all}）`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-lg border px-2.5 py-1 font-bold ${filter === id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
                {label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="クリニック・受注ID・商品" className="rounded-lg border border-slate-200 pl-7 pr-2 py-1 w-56" />
            </div>
          </div>
        </div>
        <div className="p-3 grid grid-cols-1 2xl:grid-cols-2 gap-x-4 gap-y-4 items-start">
          {plans === null && <div className="2xl:col-span-2 text-center text-xs text-slate-400 py-6">読み込み中…</div>}
          {plans && clinics.length === 0 && <div className="2xl:col-span-2 text-center text-xs text-slate-400 py-6">該当する伝票はありません（在庫が入ると、引き当てられる伝票がここに出ます）</div>}
          {clinics.map((c) => (
            <div key={c.clinicName} className="min-w-0 space-y-2">
              <div className="text-sm font-bold text-slate-900 truncate">
                {c.clinicName}
                <span className="ml-2 text-[11px] font-normal text-slate-500">{c.orders.length}伝票</span>
              </div>
              {c.orders.map((op) => (
                <OrderPlanCard key={op.orderId} op={op} onDone={onSaved} onError={setError} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="p-3 border-b border-slate-100">
          <div className="font-bold text-sm text-slate-900">確保済み → 倉庫へ出荷依頼</div>
          <div className="text-[11px] text-slate-500">クリニック × 倉庫ごとにまとめています。同じクリニックの伝票はチェックしたものを1つの荷物にします。</div>
        </div>
        {reserved.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">引当済みで出荷指示前のものはありません</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reserved.map((g) => {
              const sel = chosen(g);
              return (
                <div key={g.key} className="p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">
                      {g.clinicName}
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5">{WH_NAME[g.warehouse]}</span>
                    </div>
                    <div className="text-right">
                      <button
                        disabled={busy || sel.size === 0}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const j = await api('/api/inventory/instructions', { method: 'POST', body: JSON.stringify({ orderIds: Array.from(sel), warehouse: g.warehouse }) });
                            onSaved();
                            notifyDone(`${j.instruction.id} を${WH_NAME[g.warehouse]}へ出荷依頼しました`, async () => {
                              await api(`/api/inventory/instructions/${j.instruction.id}/cancel`, { method: 'POST' });
                              onSaved();
                            });
                          } catch (e: any) {
                            notifyError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 font-bold disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {sel.size > 1 ? `${sel.size}伝票をまとめて倉庫へ出荷依頼` : '倉庫へ出荷依頼'}
                      </button>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {g.warehouse === 'domestic' ? '国内倉庫の出荷待ちになります（社内で出荷）' : `${WH_NAME[g.warehouse]}の担当者画面に出荷依頼が出ます`}（{sel.size}伝票・
                        {Array.from(g.orders.entries())
                          .filter(([id]) => sel.has(id))
                          .reduce((n, [, items]) => n + items.reduce((m, a) => m + a.qty, 0), 0)}
                        点）
                      </div>
                    </div>
                  </div>
                  {Array.from(g.orders.entries()).map(([orderId, items]) => (
                    <div key={orderId} className="flex flex-wrap items-start gap-2 pl-1">
                      {g.orders.size > 1 && (
                        <input
                          type="checkbox"
                          checked={sel.has(orderId)}
                          onChange={(e) => {
                            const n = new Set(sel);
                            e.target.checked ? n.add(orderId) : n.delete(orderId);
                            setPick({ ...pick, [g.key]: n });
                          }}
                          className="mt-0.5"
                        />
                      )}
                      <span className="font-mono font-bold text-indigo-700">{orderId}</span>
                      <span className="flex-1">
                        {items.map((a) => (
                          <span key={a.id} className="mr-3 inline-flex items-center gap-1">
                            {a.productName} × <b className="font-mono">{a.qty}</b>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  await api(`/api/inventory/allocations/${a.id}/cancel`, { method: 'POST' });
                                  onSaved();
                                  notifyDone(`${a.productName} ${a.qty}点の確保を取り消しました（未発注に戻りました）`, async () => {
                                    await api(`/api/inventory/allocations/${a.id}/restore`, { method: 'POST' });
                                    onSaved();
                                  });
                                } catch (e: any) {
                                  notifyError(e.message);
                                }
                              }}
                              className="text-[10px] text-slate-400 hover:text-rose-600"
                            >
                              取消
                            </button>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <InstructionBoard instructions={data.instructions} onSaved={onSaved} />
    </div>
  );
}

/** サンプル表示の切り替え（実データと切り離したサンプルで流れを試す） */
function DemoBar({ onChange }: { onChange: () => void }) {
  const [on, setOn] = useState(isInventoryDemo());
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${on ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900' : 'border-slate-200 bg-white text-slate-600'}`}>
      <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setInventoryDemo(e.target.checked);
            setOn(e.target.checked);
            onChange();
          }}
        />
        サンプルデータで見る
      </label>
      {on ? (
        <>
          <span>サンプル表示中です。入荷 → 在庫 → 引当 → 出荷指示 → インボイス → AWB → 出荷を自由に試せます（実データ・楽楽販売・インボイスアプリには影響しません）。</span>
          <a href="/warehouse/demokorea" target="_blank" rel="noreferrer" className="underline font-bold">
            倉庫の担当者画面（韓国・サンプル）
          </a>
          <a href="/warehouse/demosingapore" target="_blank" rel="noreferrer" className="underline font-bold">
            （シンガポール・サンプル）
          </a>
          <button
            onClick={async () => {
              await fetch('/api/inventory/demo-reset', { method: 'POST', headers: demoHeaders() });
              onChange();
            }}
            className="ml-auto rounded border border-fuchsia-300 bg-white px-2 py-0.5 font-bold"
          >
            サンプルを最初に戻す
          </button>
        </>
      ) : (
        <span>オンにすると、実データとは別のサンプルで操作の流れを確認できます。</span>
      )}
    </div>
  );
}

/** 3倉庫の一覧（管理画面で国内・韓国・シンガポールを並べて見る） */
function WarehouseOverview({ data, onPick }: { data: InventoryData; onPick: (w: WarehouseId) => void }) {
  const tone: Record<WarehouseId, string> = { domestic: 'from-sky-50 border-sky-200', korea: 'from-rose-50 border-rose-200', singapore: 'from-emerald-50 border-emerald-200' };
  return (
    <div className="grid lg:grid-cols-3 gap-3">
      {WH_IDS.map((w) => {
        const stock = data.stock[w] || [];
        const pending = data.inbound.filter((r) => r.warehouse === w && !r.received && !r.excluded && !r.cancelled);
        const waiting = pending.filter((r) => ['arrived', 'kick', 'handcarry'].includes(r.state));
        const openSi = data.instructions.filter((i) => i.warehouse === w && i.status === 'open');
        const moves = data.moves.filter((m) => m.warehouse === w).slice(0, 4);
        const kpi = (label: string, value: number | string, hi = false) => (
          <div className={`rounded-lg bg-white/80 border px-2 py-1.5 ${hi ? 'border-amber-300' : 'border-slate-200'}`}>
            <div className="text-[10px] text-slate-500 font-semibold">{label}</div>
            <div className={`text-lg font-black font-mono ${hi ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
          </div>
        );
        return (
          <div key={w} className={`rounded-2xl border bg-gradient-to-b to-white p-3 space-y-3 ${tone[w]}`}>
            <button onClick={() => onPick(w)} className="w-full flex items-center justify-between text-left">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Warehouse className="w-4 h-4" />
                {WH_NAME[w]}
              </span>
              <span className="text-[11px] text-indigo-700 font-bold">この倉庫を見る →</span>
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              {kpi('在庫（品目）', stock.filter((s2) => s2.qty > 0).length)}
              {kpi('在庫（点）', stock.reduce((n, s2) => n + s2.qty, 0))}
              {kpi('引当済（点）', stock.reduce((n, s2) => n + s2.reserved, 0))}
              {kpi('入荷待ち', pending.length)}
              {kpi('承認待ち', waiting.length, waiting.length > 0)}
              {kpi('出荷待ち', openSi.length, openSi.length > 0)}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-bold text-slate-600">承認待ちの入荷</div>
              {waiting.length === 0 ? (
                <div className="text-[11px] text-slate-400">ありません</div>
              ) : (
                waiting.slice(0, 4).map((r) => (
                  <div key={r.poId} className="text-[11px] flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-indigo-700">{r.poId}</span> {r.lines.map((l) => `${l.productName}×${l.qty}`).join('、')}
                    </span>
                    <span className="shrink-0 text-violet-700 font-bold">{r.stateLabel.replace('・承認待ち', '').replace('・受取待ち', '')}</span>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-bold text-slate-600">出荷待ちの出荷指示</div>
              {openSi.length === 0 ? (
                <div className="text-[11px] text-slate-400">ありません</div>
              ) : (
                openSi.slice(0, 4).map((i) => (
                  <div key={i.id} className="text-[11px] flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-indigo-700">{i.id}</span> {i.clinicName}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {w === 'domestic' ? '' : `${i.invoiceNo ? 'INV✓' : 'INV未'} ${i.awbNo ? 'AWB✓' : 'AWB未'}`}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-bold text-slate-600">最近の入出庫</div>
              {moves.length === 0 ? (
                <div className="text-[11px] text-slate-400">まだありません</div>
              ) : (
                moves.map((m) => (
                  <div key={m.id} className="text-[11px] flex justify-between gap-2">
                    <span className="truncate">
                      {fmt(m.at)} {MOVE_LABEL[m.type] || m.type} {m.productName}
                    </span>
                    <span className={`shrink-0 font-mono font-bold ${m.delta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 実データに入れた仮の在庫の表示（消すボタンつき） */
function SampleStockBar({ data, onChange }: { data: InventoryData; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  if (isInventoryDemo() || !data.sampleSeed) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-900">
      <span className="font-bold">仮の在庫が入っています（{data.sampleSeed.count}品目・{fmt(data.sampleSeed.at)}）</span>
      <span>動作確認用です。引当・出荷指示を試したあとは、必ず「仮の在庫を消す」を押してください（その間の出荷待ちの引当・出荷指示も取り消して元に戻します）。</span>
      <button
        disabled={busy}
        onClick={async () => {
          if (!(await askConfirm({ title: '仮の在庫を消します', body: '仮の在庫を入れてから作った引当・出荷指示（出荷待ち）も取り消します。', okLabel: '消す', danger: true }))) return;
          setBusy(true);
          try {
            await api('/api/inventory/sample-stock/clear', { method: 'POST' });
            onChange();
          } finally {
            setBusy(false);
          }
        }}
        className="ml-auto rounded-lg bg-orange-600 text-white px-3 py-1 font-bold disabled:opacity-50"
      >
        仮の在庫を消す
      </button>
    </div>
  );
}

/** 倉庫のタブ（どの倉庫を見ているか分かるように） */
function WarehouseTabs({ value, onChange, counts }: { value: 'all' | WarehouseId; onChange: (v: 'all' | WarehouseId) => void; counts?: Partial<Record<'all' | WarehouseId, number>> }) {
  const items: ['all' | WarehouseId, string][] = [['all', 'すべての倉庫'], ...WH_IDS.map((w) => [w, WH_NAME[w]] as ['all' | WarehouseId, string])];
  return (
    <div className="flex flex-wrap gap-0 border-b-2 border-slate-200">
      {items.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`-mb-0.5 px-4 py-2 text-sm font-bold border-b-2 ${value === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          {label}
          {counts?.[id] !== undefined && <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${value === id ? 'bg-indigo-100' : 'bg-slate-100'}`}>{counts[id]}</span>}
        </button>
      ))}
    </div>
  );
}

/** 引当・出荷指示ページ（サイドバーの「未発注」の下）。出荷指示ごとにインボイス・AWB・出荷・配達まで追う */
export function ShippingInstructionsPage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const load = useCallback(() => {
    api('/api/inventory')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener('flow-refresh', load);
    return () => window.removeEventListener('flow-refresh', load);
  }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            引当・出荷指示
          </h1>
          <p className="text-xs text-slate-500 mt-1">在庫から引き当てた明細を倉庫ごとの出荷指示にし、インボイス・AWBの作成から出荷・配達まで追います。</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" />
            読み込み直す
          </button>
          <button onClick={() => setSettingsOpen(!settingsOpen)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            送り状API設定
          </button>
        </div>
      </div>
      <DemoBar onChange={load} />
      {settingsOpen && (
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <DhlSettings onClose={() => setSettingsOpen(false)} />
          <FedexSettings onClose={() => setSettingsOpen(false)} />
        </div>
      )}
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div>}
      {data && <SampleStockBar data={data} onChange={load} />}
      {data ? <AllocationPanel data={data} onSaved={load} /> : !error && <div className="p-6 text-sm text-slate-500">読み込み中…</div>}
    </div>
  );
}

export function InventoryView({ orders, onNavigate }: { orders: Order[]; onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'inbound' | 'stock' | 'moves' | 'access'>('stock');
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
  useEffect(() => {
    window.addEventListener('flow-refresh', load);
    return () => window.removeEventListener('flow-refresh', load);
  }, [load]);

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

  const whCounts = {
    all: data.inbound.filter((r) => !r.received && !r.excluded && !r.cancelled).length,
    ...Object.fromEntries(WH_IDS.map((w) => [w, data.inbound.filter((r) => r.warehouse === w && !r.received && !r.excluded && !r.cancelled).length])),
  } as Record<'all' | WarehouseId, number>;
  const moves = data.moves.filter((m) => wh === 'all' || m.warehouse === wh);

  return (
    <div className="space-y-4">
      <DemoBar onChange={load} />
      <SampleStockBar data={data} onChange={load} />
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
          <div className={`flex flex-wrap items-center gap-2 text-xs ${isInventoryDemo() ? 'hidden' : ''}`}>
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
        <div className={`flex flex-wrap items-center gap-2 text-xs ${isInventoryDemo() ? 'hidden' : ''}`}>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
            <div className="text-[11px] text-amber-800 font-semibold truncate">追跡番号待ち</div>
            <div className="text-xl font-black text-amber-700 font-mono">{counts.noTracking}</div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5">
            <div className="text-[11px] text-violet-800 font-semibold truncate">倉庫の承認待ち（到着・キック・持込）</div>
            <div className="text-xl font-black text-violet-700 font-mono">{counts.waiting}</div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5">
            <div className="text-[11px] text-rose-800 font-semibold truncate">入荷数の不足</div>
            <div className="text-xl font-black text-rose-700 font-mono">{counts.shortage}</div>
          </div>
        </div>
      </div>

      <WarehouseTabs value={wh} onChange={setWh} counts={whCounts} />
      {wh === 'all' && <WarehouseOverview data={data} onPick={setWh} />}
      {wh !== 'all' && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-800 flex items-center gap-1.5">
          <Warehouse className="w-4 h-4" />
          {WH_NAME[wh]}を表示しています
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['stock', '在庫', PackageCheck],
            ['inbound', '入荷予定', Truck],
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
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 items-start">
          {inbound.length === 0 && (
            <div className="2xl:col-span-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              該当する入荷予定はありません。{data.inbound.length === 0 && '「楽楽から発注を取り込む」を押すか、次の全件同期（2時間ごと）をお待ちください。'}
            </div>
          )}
          {inbound.map((r) => (
            <InboundCard key={`${r.poId}-${r.updatedAt ?? ''}-${r.trackingNos.join()}-${r.lines.map((l) => l.qty).join()}`} rec={r} onSaved={load} />
          ))}
          </div>
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
          <div className={`grid gap-3 ${wh === 'all' ? 'xl:grid-cols-3' : ''}`}>
            {WH_IDS.filter((w) => wh === 'all' || w === wh).map((w) => (
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
              {moves.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    まだ入出庫はありません
                  </td>
                </tr>
              )}
              {moves.map((m) => (
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

      {tab === 'access' && <WarehouseAccessPanel data={data} onSaved={load} />}
      <div className="text-[11px] text-slate-400 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        入荷予定の追跡番号は、出荷の追跡と同じく配送会社のデータで自動確認します（到着すると「倉庫に到着・承認待ち」）。
      </div>
    </div>
  );
}
