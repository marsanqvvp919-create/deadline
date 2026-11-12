import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ClipboardCopy, Download, FileText, Loader2, PackageCheck, Search, Send, Truck, Warehouse, X } from 'lucide-react';
import { api, fmt, Inbound, InboundCard, WarehouseId, WH_NAME } from '../InventoryView';
import { ErrorNote } from '../flow/Messages';
import { notifyDone, notifyError } from '../flow/UndoToast';
import { askConfirm } from '../flow/Confirm';
import { PUBLIC_ORIGIN } from '../../utils/publicUrl';
import { buildPoSheetPdf, SheetData } from './poSheetPdf';

// 発注〜入荷の流れ：楽楽販売の「発注済み」→ 発注書を送る → 仕入先が発送 → 倉庫に届く → 検品・確定 → 在庫に反映。
// 行き先（韓国・シンガポール・直送）は仕入先マスタの既定で入り、あとから変えられる（決まっていなくても先に進める）

export interface VendorRow {
  supplierId: string;
  supplierName: string;
  area: string;
  email: string;
  phone: string;
  master: {
    defaultDest: '' | WarehouseId | 'direct';
    contactMethod: string;
    contactName: string;
    contactId: string;
    language: string;
    leadDays: number | null;
    note: string;
  } | null;
  counts: { open: number; needSheet: number; shipped: number; received: number };
  portal: { slug: string | null; disabled: boolean; lastLoginAt: string | null };
}

export type Stage = 'sheet' | 'vendor' | 'transit' | 'inspect' | 'done' | 'shortage' | 'direct' | 'direct_done' | 'closed';
export const STAGES: { id: Stage; label: string; hint: string; cls: string }[] = [
  { id: 'sheet', label: '① 発注書を送る', hint: '楽楽で発注済み。仕入先に発注書を送る', cls: 'border-amber-300 bg-amber-50 text-amber-900' },
  { id: 'vendor', label: '② 仕入先の発送待ち', hint: '発注書を送った。仕入先が発送するのを待つ', cls: 'border-slate-300 bg-white text-slate-800' },
  { id: 'transit', label: '③ 倉庫へ輸送中', hint: '仕入先が発送した。倉庫に届くのを待つ', cls: 'border-sky-300 bg-sky-50 text-sky-900' },
  { id: 'inspect', label: '④ 倉庫で検品', hint: '倉庫に届いた。検品して確定すると在庫に入る', cls: 'border-violet-300 bg-violet-50 text-violet-900' },
  { id: 'done', label: '⑤ 在庫に反映', hint: '確定して倉庫の在庫に入った', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  { id: 'shortage', label: '不足あり', hint: '届いた数が足りない・不良があった', cls: 'border-rose-300 bg-rose-50 text-rose-900' },
  { id: 'direct', label: '直送（クリニックへ）', hint: '倉庫を通らない発注', cls: 'border-teal-300 bg-teal-50 text-teal-900' },
];
const DEST_LABEL: Record<string, string> = { korea: '韓国倉庫', singapore: 'シンガポール倉庫', domestic: '国内倉庫', direct: 'クリニックへ直送' };

export function stageOf(r: Inbound): Stage {
  if (r.cancelled || r.excluded) return 'closed';
  if (r.direct) return r.vendorShippedAt ? 'direct_done' : 'direct';
  if (r.received) return r.shortage ? 'shortage' : 'done';
  if (['arrived', 'kick', 'handcarry'].includes(r.state) || r.lines.some((l) => l.inspect || (l.arrivedQty ?? null) !== null)) return 'inspect';
  if (r.vendorShippedAt || ['tracking', 'in_transit'].includes(r.state)) return 'transit';
  if (r.sheetSentAt) return 'vendor';
  return 'sheet';
}
/** 発注数（楽楽）・予定数（調整後）・入荷数の差 */
function shortageOf(r: Inbound) {
  const po = r.lines.reduce((n, l) => n + l.poQty, 0);
  const plan = r.lines.reduce((n, l) => n + l.qty, 0);
  const got = r.received ? r.lines.reduce((n, l) => n + (l.receivedQty || 0), 0) : null;
  return { po, plan, got, planShort: Math.max(0, po - plan), recvShort: got === null ? 0 : Math.max(0, plan - got) };
}
const nextAction = (r: Inbound, s: Stage) =>
  s === 'sheet'
    ? '発注書を作って仕入先に送る'
    : s === 'vendor'
      ? '仕入先の発送を待つ（仕入先の画面で「発送済み」を押すと進む）'
      : s === 'transit'
        ? `${WH_NAME[r.warehouse]}に届くのを待つ`
        : s === 'inspect'
          ? r.warehouse === 'domestic'
            ? '国内倉庫で検品して確定（下の「国内倉庫に届いた」）'
            : `${WH_NAME[r.warehouse]}の担当者が検品・確定する`
          : s === 'shortage'
            ? '不足分を仕入先に確認する'
            : s === 'direct'
              ? '仕入先がクリニックへ発送するのを待つ'
              : '';

/** 1件の進み具合（6段階の小さな点） */
function MiniSteps({ r }: { r: Inbound }) {
  const s = stageOf(r);
  if (r.direct) {
    return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${s === 'direct_done' ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-600'}`}>{s === 'direct_done' ? '直送済み' : '直送・発送待ち'}</span>;
  }
  const order: Stage[] = ['sheet', 'vendor', 'transit', 'inspect', 'done'];
  const idx = s === 'shortage' ? 4 : order.indexOf(s);
  return (
    <div className="flex items-center gap-1">
      {order.map((st, i) => (
        <span key={st} title={STAGES.find((x) => x.id === st)!.label} className={`h-2.5 w-6 rounded-full ${i < idx ? 'bg-emerald-500' : i === idx ? (s === 'shortage' ? 'bg-rose-500' : 'bg-indigo-600') : 'bg-slate-200'}`} />
      ))}
    </div>
  );
}

function DestSelect({ r, onSaved, compact }: { r: Inbound; onSaved: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const value = r.direct ? 'direct' : r.warehouse;
  const change = async (v: string) => {
    setBusy(true);
    try {
      await api(`/api/inventory/inbound/${r.poId}`, { method: 'POST', body: JSON.stringify(v === 'direct' ? { dest: 'direct' } : v === 'default' ? { dest: 'default' } : { warehouse: v }) });
      onSaved();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <select disabled={busy || r.received} value={value} onChange={(e) => change(e.target.value)} className={`rounded-md border px-2 py-1 font-semibold ${compact ? 'text-xs' : 'text-sm'} ${r.whSource === 'area' && !r.direct ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`}>
        <option value="korea">韓国倉庫</option>
        <option value="singapore">シンガポール倉庫</option>
        <option value="domestic">国内倉庫</option>
        <option value="direct">クリニックへ直送</option>
        {r.whSource === 'manual' && <option value="default">（仕入先マスタの既定に戻す）</option>}
      </select>
      {r.whSource === 'area' && !r.direct && <span className="text-[10px] font-bold text-amber-700">未確定（エリアから推定）</span>}
    </div>
  );
}

/** 仕入先に送る発注書（PDF）と、チャットに貼る文面。送ったら「送付済み」にする */
function SheetDialog({ poIds, vendors, onClose, onDone }: { poIds: string[]; vendors: VendorRow[]; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<SheetData | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('');
  const [copied, setCopied] = useState(false);
  const today = new Date().toLocaleDateString('en-CA').replace(/-/g, '/');
  useEffect(() => {
    api('/api/inventory/po-sheet', { method: 'POST', body: JSON.stringify({ poIds }) })
      .then((d: SheetData) => {
        setData(d);
        setQty(Object.fromEntries(d.pos.flatMap((p) => p.lines.map((l) => [`${p.poId}|${l.key}`, String(l.qty)]))));
        setMethod((d.vendor.master as any)?.contactMethod || '');
      })
      .catch((e) => setError(e.message));
  }, [poIds]);
  const vendor = data ? vendors.find((v) => v.supplierId === data.vendor.supplierId) : null;
  const portalUrl = vendor?.portal.slug && !vendor.portal.disabled ? `${PUBLIC_ORIGIN}/vendor/${vendor.portal.slug}` : '';
  const merged = (): SheetData | null => (data ? { ...data, pos: data.pos.map((p) => ({ ...p, lines: p.lines.map((l) => ({ ...l, qty: Number(qty[`${p.poId}|${l.key}`]) || 0 })) })) } : null);
  const dirty = data ? data.pos.some((p) => p.lines.some((l) => String(l.qty) !== qty[`${p.poId}|${l.key}`])) : false;
  const badQty = Object.values(qty).some((v) => !/^\d+$/.test(v));
  // 数量を変えたら、先に入荷予定数として保存する（差は「不足」として残る）
  const saveQty = async () => {
    if (!data || !dirty) return;
    for (const p of data.pos) {
      const lines = p.lines.filter((l) => String(l.qty) !== qty[`${p.poId}|${l.key}`]).map((l) => ({ key: l.key, qty: Number(qty[`${p.poId}|${l.key}`]) }));
      if (lines.length) await api(`/api/inventory/inbound/${p.poId}`, { method: 'POST', body: JSON.stringify({ lines }) });
    }
    setData(merged());
  };
  const message = () => {
    const d = merged();
    if (!d) return '';
    const parts = [`Hello${d.vendor.master?.contactName ? ` ${d.vendor.master.contactName}` : ''},`, '', `Please find our purchase order (${today}) attached.`, ''];
    d.pos.forEach((p) => {
      parts.push(`■ ${p.poId}  → ${p.dest.kind === 'direct' ? 'Direct to clinic (address to follow)' : `${p.dest.label}${p.dest.kind === 'tbd' ? ' (to be confirmed)' : ''}`}`);
      p.lines.forEach((l) => parts.push(`  - ${l.productName} × ${l.qty}`));
    });
    parts.push('', 'Please let us know the shipping date and tracking number.');
    if (portalUrl) parts.push(`You can also press "Shipped" here: ${portalUrl}`);
    parts.push('Thank you.');
    return parts.join('\n');
  };
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await saveQty();
      const doc = await buildPoSheetPdf(merged()!, { sheetDate: today, portalUrl });
      doc.save(`PO_${data!.vendor.name.replace(/[^\w.-]+/g, '_')}_${today.replace(/\//g, '')}.pdf`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const markSent = async () => {
    setBusy(true);
    setError('');
    try {
      await saveQty();
      const j = await api('/api/inventory/po-sheet/sent', { method: 'POST', body: JSON.stringify({ poIds, method }) });
      notifyDone(`発注書 ${j.sheetNo} を送付済みにしました（${poIds.length}件）`);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="text-lg font-bold text-slate-900">発注書を作って送る</div>
            <div className="text-xs text-slate-500">{data ? `${data.vendor.name}・${poIds.length}件` : '読み込み中…'}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error && <ErrorNote message={error} />}
          {!data ? (
            !error && <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          ) : (
            <>
              <ol className="grid grid-cols-3 gap-2 text-xs">
                <li className="rounded-lg bg-slate-50 border border-slate-200 p-2"><b>1.</b> 数量と送り先を確認（数量はここで調整できます）</li>
                <li className="rounded-lg bg-slate-50 border border-slate-200 p-2"><b>2.</b> PDFを保存し、文面をコピーして LINE・WhatsApp などで送る</li>
                <li className="rounded-lg bg-slate-50 border border-slate-200 p-2"><b>3.</b> 送ったら「送付済みにする」</li>
              </ol>
              {data.pos.map((p) => (
                <div key={p.poId} className="rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="font-mono font-bold text-indigo-700">{p.poId} <span className="ml-1 font-sans text-xs font-normal text-slate-500">発注日 {p.poDate}</span></div>
                    <div className={`text-xs font-bold ${p.dest.kind === 'tbd' ? 'text-amber-700' : 'text-slate-700'}`}>
                      送り先：{p.dest.kind === 'direct' ? 'クリニックへ直送' : p.dest.label}
                      {p.dest.kind === 'tbd' && '（未確定・発注書に「要確認」と出ます）'}
                    </div>
                  </div>
                  {p.dest.kind !== 'direct' && !p.dest.address && <div className="px-3 pt-2 text-[11px] text-amber-700">この倉庫の住所が未登録です（仕入先マスタの「倉庫の送り先」で入れると発注書に載ります）</div>}
                  <table className="w-full text-sm">
                    <thead className="text-[11px] text-slate-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left">商品</th>
                        <th className="px-3 py-1.5 text-right w-24">楽楽の発注数</th>
                        <th className="px-3 py-1.5 text-right w-28">発注する数</th>
                        <th className="px-3 py-1.5 text-right w-20">差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lines.map((l) => {
                        const k = `${p.poId}|${l.key}`;
                        const diff = (Number(qty[k]) || 0) - l.poQty;
                        return (
                          <tr key={k} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 font-semibold">{l.productName}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-500">{l.poQty}</td>
                            <td className="px-3 py-1.5 text-right">
                              <input type="number" min={0} value={qty[k] ?? ''} onChange={(e) => setQty({ ...qty, [k]: e.target.value })} className={`w-20 rounded-lg border-2 px-2 py-1 text-right font-mono font-bold ${diff !== 0 ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`} />
                            </td>
                            <td className={`px-3 py-1.5 text-right font-mono font-bold ${diff < 0 ? 'text-rose-600' : diff > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{diff === 0 ? '—' : diff < 0 ? `不足 ${-diff}` : `+${diff}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700">チャットに貼る文面（英語）</div>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(message()).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                    {copied ? 'コピーしました' : '文面をコピー'}
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{message()}</pre>
              </div>
              {badQty && <ErrorNote message="数量は0以上の数字で入れてください" compact />}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                <button disabled={busy || badQty} onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-indigo-600 bg-white px-4 py-2 text-sm font-bold text-indigo-700 disabled:opacity-40">
                  <Download className="w-4 h-4" />
                  発注書PDFを保存
                </button>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                  <option value="">送った方法（任意）</option>
                  <option value="LINE">LINE</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">メール</option>
                  <option value="その他">その他</option>
                </select>
                <button disabled={busy || badQty} onClick={markSent} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-base font-bold text-white disabled:opacity-40">
                  <Send className="w-4 h-4" />
                  送付済みにする
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 1件の詳細：流れ・仕入先の変更・行き先・数量と不足・倉庫での受け取り・履歴 */
function PoDetail({ r, vendors, onClose, onSaved, onSheet }: { r: Inbound; vendors: VendorRow[]; onClose: () => void; onSaved: () => void; onSheet: () => void }) {
  const [sup, setSup] = useState(r.supplierId || '');
  const [busy, setBusy] = useState(false);
  const s = stageOf(r);
  const sh = shortageOf(r);
  const arrivedAt: string | null = (r.tracking as any[]).find((t) => t.deliveredAt)?.deliveredAt || null;
  const steps = r.direct
    ? [
        { label: '楽楽で発注', at: r.poDate, done: true },
        { label: '発注書を送付', at: r.sheetSentAt ? fmt(r.sheetSentAt) : null, done: !!r.sheetSentAt },
        { label: 'クリニックへ直送', at: r.vendorShippedAt ? fmt(r.vendorShippedAt) : null, done: !!r.vendorShippedAt },
      ]
    : [
        { label: '楽楽で発注', at: r.poDate, done: true },
        { label: '発注書を送付', at: r.sheetSentAt ? `${fmt(r.sheetSentAt)}${r.sheetMethod ? `・${r.sheetMethod}` : ''}` : null, done: !!r.sheetSentAt },
        { label: '仕入先が発送', at: r.vendorShippedAt ? fmt(r.vendorShippedAt) : null, done: !!r.vendorShippedAt },
        { label: `${WH_NAME[r.warehouse]}に到着`, at: arrivedAt ? fmt(arrivedAt) : s === 'inspect' ? '到着' : null, done: !!arrivedAt || ['inspect', 'done', 'shortage'].includes(s) },
        { label: '検品・確定', at: r.receivedAt ? fmt(r.receivedAt) : null, done: !!r.received },
        { label: '在庫に反映', at: r.received ? `+${sh.got}点` : null, done: !!r.received },
      ];
  const changeVendor = async () => {
    const to = vendors.find((v) => v.supplierId === sup);
    if (!to) return;
    if (
      !(await askConfirm({
        title: `仕入先を ${r.supplierName} → ${to.supplierName} に変えます`,
        body: '楽楽販売の発注管理の仕入先も書き換えます（反映の設定がある場合）。発注書は送り直しになります。',
        okLabel: '変更する',
      }))
    )
      return;
    setBusy(true);
    try {
      const j = await api(`/api/inventory/inbound/${r.poId}`, { method: 'POST', body: JSON.stringify({ supplierId: sup }) });
      const sync = j.inbound?.supplierSync;
      if (sync?.ok) notifyDone(`仕入先を変更しました（${sync.message}）`);
      else notifyError(`仕入先はこのシステムで変更しました。${sync?.message || ''}`);
      onSaved();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="font-mono text-lg font-bold text-indigo-700">{r.poId}</div>
            <div className="text-sm font-bold text-slate-900">
              {r.supplierName} <span className="font-normal text-slate-500">{r.supplierArea}</span>
            </div>
            <div className="text-xs text-slate-500">
              受注 {r.orderId || '—'} {r.clinicName}・楽楽：{r.rakurakuStatus}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">
            閉じる
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {/* 流れ */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start gap-1">
              {steps.map((st, i) => (
                <React.Fragment key={st.label}>
                  <div className="min-w-[88px] flex-1">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${st.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{st.done ? <Check className="w-4 h-4" /> : i + 1}</div>
                    <div className={`mt-1 text-xs font-bold ${st.done ? 'text-slate-900' : 'text-slate-400'}`}>{st.label}</div>
                    <div className="text-[11px] text-slate-500">{st.at || '—'}</div>
                  </div>
                  {i < steps.length - 1 && <ArrowRight className="mt-2 w-4 h-4 shrink-0 text-slate-300" />}
                </React.Fragment>
              ))}
            </div>
            {nextAction(r, s) && <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-900">次にやること：{nextAction(r, s)}</div>}
            {s === 'sheet' && (
              <button onClick={onSheet} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">
                <FileText className="w-4 h-4" />
                発注書を作る
              </button>
            )}
          </div>

          {/* 仕入先・行き先 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700">仕入先</div>
              <div className="flex gap-2">
                <select disabled={busy || r.received} value={sup} onChange={(e) => setSup(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {!vendors.some((v) => v.supplierId === r.supplierId) && <option value={r.supplierId}>{r.supplierName}</option>}
                  {vendors.map((v) => (
                    <option key={v.supplierId} value={v.supplierId}>
                      {v.supplierName}
                      {v.area ? `（${v.area}）` : ''}
                    </option>
                  ))}
                </select>
                {sup !== r.supplierId && (
                  <button disabled={busy} onClick={changeVendor} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">
                    変更
                  </button>
                )}
              </div>
              {r.supplierSync && (
                <div className={`text-[11px] font-bold ${r.supplierSync.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {fmt(r.supplierSync.at)} {r.supplierSync.from} から変更・{r.supplierSync.message}
                </div>
              )}
              {r.rakurakuSupplierId && r.supplierId && r.rakurakuSupplierId !== r.supplierId && <div className="text-[11px] font-bold text-rose-600">楽楽販売の仕入先とまだ違います（楽楽で直すか、反映の設定を確認してください）</div>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700">行き先（どこに入るか）</div>
              <DestSelect r={r} onSaved={onSaved} />
              <div className="text-[11px] text-slate-500">
                {r.whSource === 'master' ? '仕入先マスタの既定' : r.whSource === 'manual' ? '社内で選んだ行き先' : 'まだ決まっていません（このままでも先に進めます）'}
              </div>
            </div>
          </div>

          {/* 数量と不足 */}
          {(sh.planShort > 0 || sh.recvShort > 0) && (
            <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <div className="font-bold">不足</div>
              {sh.planShort > 0 && <div>楽楽の発注数 {sh.po} に対して、発注する数（調整後）が {sh.plan}：<b>不足 {sh.planShort}</b></div>}
              {sh.recvShort > 0 && <div>予定 {sh.plan} に対して、在庫に入ったのは {sh.got}：<b>不足 {sh.recvShort}</b></div>}
            </div>
          )}

          {/* 数量・追跡・倉庫での受け取り（これまでの操作） */}
          <div>
            <div className="mb-1 text-xs font-bold text-slate-700">数量の調整・追跡番号・倉庫での受け取り</div>
            <InboundCard key={`${r.poId}-${r.updatedAt ?? ''}`} rec={r} onSaved={onSaved} embedded />
          </div>

          {/* 履歴 */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-1 text-xs font-bold text-slate-700">この発注の動き</div>
            {(r.history || []).length === 0 ? (
              <div className="text-xs text-slate-400">まだ記録はありません</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {(r.history || [])
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-slate-500">{fmt(h.at)}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">{{ staff: '社内', vendor: '仕入先', warehouse: '倉庫', system: '自動' }[h.by] || h.by}</span>
                      <span className="text-slate-800">{h.text}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PurchaseFlowView({ inbound, onReload, poSyncedAt }: { inbound: Inbound[]; onReload: () => void; poSyncedAt: string | null }) {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [stage, setStage] = useState<Stage | 'open' | 'unset'>('open');
  const [vendor, setVendor] = useState('all');
  const [wh, setWh] = useState<'all' | WarehouseId | 'direct'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<string[] | null>(null);
  const loadVendors = useCallback(() => {
    api('/api/inventory/vendor-master')
      .then((j) => setVendors(j.vendors))
      .catch(() => {});
  }, []);
  useEffect(loadVendors, [loadVendors]);
  const reload = () => {
    onReload();
    loadVendors();
  };

  const live = inbound.filter((r) => stageOf(r) !== 'closed');
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    live.forEach((r) => {
      const s = stageOf(r) === 'direct_done' ? 'direct' : stageOf(r);
      c[s] = (c[s] || 0) + 1;
    });
    c.unset = live.filter((r) => !r.received && !r.direct && r.whSource === 'area').length;
    return c;
  }, [live]);
  const needle = q.trim().toLowerCase();
  const rows = live
    .filter((r) => {
      const s = stageOf(r);
      if (stage === 'open') return !['done', 'direct_done'].includes(s);
      if (stage === 'unset') return !r.received && !r.direct && r.whSource === 'area';
      if (stage === 'direct') return s === 'direct' || s === 'direct_done';
      return s === stage;
    })
    .filter((r) => vendor === 'all' || r.supplierId === vendor || (!r.supplierId && r.supplierName === vendor))
    .filter((r) => wh === 'all' || (wh === 'direct' ? r.direct : !r.direct && r.warehouse === wh))
    .filter((r) => !needle || [r.poId, r.supplierName, r.orderId, r.clinicName, ...r.lines.map((l) => l.productName), ...r.trackingNos].some((x) => String(x || '').toLowerCase().includes(needle)))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName) || (b.poDate || '').localeCompare(a.poDate || ''));
  const vendorOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    live.forEach((r) => {
      const id = r.supplierId || r.supplierName;
      const v = m.get(id) || { id, name: r.supplierName, n: 0 };
      if (!r.received) v.n++;
      m.set(id, v);
    });
    return Array.from(m.values()).sort((a, b) => b.n - a.n);
  }, [live]);
  const selRecs = sel.map((id) => inbound.find((r) => r.poId === id)).filter(Boolean) as Inbound[];
  const toggle = (r: Inbound) => {
    if (sel.includes(r.poId)) return setSel(sel.filter((x) => x !== r.poId));
    if (selRecs.length && selRecs[0].supplierId !== r.supplierId) return notifyError('発注書は仕入先ごとです。同じ仕入先の発注だけを選べます');
    setSel([...sel, r.poId]);
  };
  const selectVendorSheet = () => {
    const first = rows.find((r) => stageOf(r) === 'sheet');
    if (!first) return;
    setSel(rows.filter((r) => stageOf(r) === 'sheet' && r.supplierId === first.supplierId).map((r) => r.poId));
  };
  const openRec = inbound.find((r) => r.poId === open) || null;
  const chip = (id: Stage | 'open' | 'unset', label: string, n: number, cls: string, hint: string) => {
    const on = stage === id;
    return (
      <button key={id} title={hint} onClick={() => setStage(on && id !== 'open' ? 'open' : id)} className={`rounded-xl border-2 px-3 py-2 text-left transition ${on ? 'border-indigo-700 bg-indigo-700 text-white' : cls}`}>
        <div className="text-[13px] font-bold whitespace-nowrap">{label}</div>
        <div className="text-xl font-bold font-mono leading-tight">{n}</div>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* 流れと件数 */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-900">楽楽で発注 → 発注書を送る → 仕入先が発送 → 倉庫で検品・確定 → 在庫に反映</div>
          <div className="text-xs text-slate-500">楽楽の発注管理から自動で取り込み（最終 {fmt(poSyncedAt)}）</div>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          {chip('open', '進行中すべて', live.filter((r) => !['done', 'direct_done'].includes(stageOf(r))).length, 'border-slate-300 bg-white text-slate-800', '在庫に反映済み以外')}
          {STAGES.map((st) => chip(st.id, st.label, counts[st.id] || 0, st.cls, st.hint))}
          {chip('unset', '行き先が未確定', counts.unset || 0, 'border-amber-300 bg-white text-amber-800', '仕入先マスタに既定がなく、エリアから推定している発注（先に進めます）')}
        </div>
      </div>

      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="all">仕入先：すべて</option>
          {vendorOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（未入荷 {v.n}）
            </option>
          ))}
        </select>
        <select value={wh} onChange={(e) => setWh(e.target.value as any)} className="rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="all">行き先：すべて</option>
          <option value="korea">韓国倉庫</option>
          <option value="singapore">シンガポール倉庫</option>
          <option value="domestic">国内倉庫</option>
          <option value="direct">クリニックへ直送</option>
        </select>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2 top-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="発注ID・商品・クリニック・追跡番号" className="w-72 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2" />
        </div>
        <span className="text-slate-500">{rows.length}件</span>
        {stage === 'sheet' && sel.length === 0 && rows.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={selectVendorSheet} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800">
              先頭の仕入先の未送付をまとめて選ぶ
            </button>
            <button
              onClick={async () => {
                const ids = rows.filter((r) => stageOf(r) === 'sheet').map((r) => r.poId);
                if (!(await askConfirm({ title: `表示中の ${ids.length}件を「発注書を送付済み」にします`, body: 'すでに LINE・WhatsApp などで発注を伝えてある分を、まとめて②（仕入先の発送待ち）に進めます。発注書は作りません。', okLabel: '送付済みにする' }))) return;
                try {
                  await api('/api/inventory/po-sheet/sent', { method: 'POST', body: JSON.stringify({ poIds: ids, method: '送付済み（まとめて）' }) });
                  notifyDone(`${ids.length}件を送付済みにしました`);
                  reload();
                } catch (e: any) {
                  notifyError(e.message);
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
            >
              表示中をすべて「送付済み」にする（もう発注を伝えてある分）
            </button>
          </div>
        )}
      </div>

      {/* 選んだ発注で発注書を作る */}
      {sel.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-2">
          <span className="text-sm font-bold text-indigo-900">
            {selRecs[0]?.supplierName}・{sel.length}件を選択中
          </span>
          <button onClick={() => setSheetFor(sel)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white">
            <FileText className="w-4 h-4" />
            発注書を作る
          </button>
          <button onClick={() => setSel([])} className="text-xs font-bold text-slate-600 hover:underline">
            選択を解除
          </button>
        </div>
      )}

      {/* 一覧 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 text-left">発注</th>
              <th className="px-2 py-2 text-left">仕入先</th>
              <th className="px-2 py-2 text-left">行き先</th>
              <th className="px-2 py-2 text-left">商品</th>
              <th className="px-2 py-2 text-right">数量</th>
              <th className="px-2 py-2 text-left">進み具合・次にやること</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  該当する発注はありません
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const s = stageOf(r);
              const sh = shortageOf(r);
              const st = STAGES.find((x) => x.id === (s === 'direct_done' ? 'direct' : s));
              return (
                <tr key={r.poId} onClick={() => setOpen(r.poId)} className={`cursor-pointer border-b border-slate-100 hover:bg-indigo-50 ${sel.includes(r.poId) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    {!r.received && <input type="checkbox" checked={sel.includes(r.poId)} onChange={() => toggle(r)} className="h-4 w-4" aria-label={`${r.poId} を選ぶ`} />}
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-mono font-bold text-indigo-700">{r.poId}</div>
                    <div className="text-[11px] text-slate-500">{r.poDate}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-bold text-slate-900">{r.supplierName}</div>
                    <div className="text-[11px] text-slate-500">{r.supplierArea}</div>
                  </td>
                  <td className="px-2 py-2">
                    <DestSelect r={r} onSaved={reload} compact />
                  </td>
                  <td className="px-2 py-2 max-w-[260px]">
                    <div className="truncate font-semibold text-slate-800">{r.lines[0]?.productName}</div>
                    {r.lines.length > 1 && <div className="text-[11px] text-slate-500">ほか {r.lines.length - 1}品目</div>}
                    <div className="truncate text-[11px] text-slate-400">{r.clinicName}</div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="font-mono font-bold">{r.received ? `${sh.got}/${sh.plan}` : sh.plan}</div>
                    {sh.planShort + sh.recvShort > 0 && <div className="text-[11px] font-bold text-rose-600">不足 {sh.planShort + sh.recvShort}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <MiniSteps r={r} />
                      {st && <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label.replace(/^[①-⑤]\s*/, '')}</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">{nextAction(r, s)}</div>
                    {r.sheetSentAt && !r.vendorShippedAt && <div className="text-[11px] text-slate-400">発注書 {fmt(r.sheetSentAt)}{r.sheetMethod && `・${r.sheetMethod}`}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />発注書は仕入先ごとにまとめて作れます（チェックで選ぶ）</span>
        <span className="inline-flex items-center gap-1"><Truck className="w-3.5 h-3.5" />仕入先の画面で「発送済み」を押すと自動で③に進みます</span>
        <span className="inline-flex items-center gap-1"><Warehouse className="w-3.5 h-3.5" />倉庫の担当者が検品・確定すると在庫に入ります</span>
        <span className="inline-flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" />行き先が未確定でも、発注書・発送・入荷は進められます</span>
      </div>

      {openRec && (
        <PoDetail
          key={openRec.poId}
          r={openRec}
          vendors={vendors}
          onClose={() => setOpen(null)}
          onSaved={reload}
          onSheet={() => setSheetFor([openRec.poId])}
        />
      )}
      {sheetFor && (
        <SheetDialog
          poIds={sheetFor}
          vendors={vendors}
          onClose={() => setSheetFor(null)}
          onDone={() => {
            setSheetFor(null);
            setSel([]);
            reload();
          }}
        />
      )}
    </div>
  );
}
