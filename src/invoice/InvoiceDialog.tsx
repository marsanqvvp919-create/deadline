import React, { useEffect, useMemo, useState } from 'react';
import { demoHeaders } from '../utils/demo';
import { AlertTriangle, FileText, Loader2, Package, X } from 'lucide-react';
import { generateInvoicePDF, generatePackingListPDF, loadJapaneseFont } from './pdf';

// 出荷指示からインボイスを作る。製剤・クリニック・倉庫・設定は INVOICEアプリのマスタ（同じ Firestore）を使い、
// 発行するとINVOICEアプリの発送データにも INV-日付-連番 で入る。PDFは INVOICEアプリと同じ形

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...demoHeaders(), ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

/** 発行済みインボイスの PDF（Invoice / Packing List）を保存する */
export async function downloadInvoicePdf(kind: 'invoice' | 'packing', data: { shipment: any; settings: any }) {
  await loadJapaneseFont();
  const doc = kind === 'invoice' ? generateInvoicePDF(data.shipment, data.settings) : generatePackingListPDF(data.shipment, data.settings);
  doc.save(`${data.shipment.invoiceNo}_${kind === 'invoice' ? 'Invoice' : 'PackingList'}.pdf`);
}

export function InvoicePdfButtons({ source, label = true }: { source: string; label?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (kind: 'invoice' | 'packing') => {
    setBusy(kind);
    setError('');
    try {
      await downloadInvoicePdf(kind, await api(source));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 [td_&]:flex-nowrap">
      <button onClick={() => run('invoice')} disabled={!!busy} className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 disabled:opacity-50">
        {busy === 'invoice' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        Invoice PDF
      </button>
      <button onClick={() => run('packing')} disabled={!!busy} className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 disabled:opacity-50">
        {busy === 'packing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
        {label ? 'Packing List PDF' : 'Packing'}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}

interface Draft {
  issued: { invoiceNo: string; docId: string } | null;
  draft: any;
  problems: string[];
  unmatched: { index: number; productName: string }[];
  productOptions: { id: string; nameJa: string; nameEn: string; sku: string; invoicePrice: number | null }[];
  clinicOptions: { id: string; name: string; nameEn: string }[];
}

export function InvoiceDialog({ instructionId, onClose, onIssued }: { instructionId: string; onClose: () => void; onIssued: () => void }) {
  const [data, setData] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [clinicDocId, setClinicDocId] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ shipment: any; settings: any } | null>(null);

  const load = (refresh = false) => {
    setError('');
    api(`/api/invoice/draft/${instructionId}${refresh ? '?refresh=1' : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => load(), [instructionId]);

  const clinicMissing = data && !data.draft.clinicId;
  const unresolved = useMemo(() => (data ? data.unmatched.filter((u) => !productMap[String(u.index)]) : []), [data, productMap]);
  const canIssue = data && !data.issued && unresolved.length === 0 && (!clinicMissing || clinicDocId) && data.draft.warehouseId;

  const issue = async () => {
    setBusy(true);
    setError('');
    try {
      const j = await api(`/api/invoice/issue/${instructionId}`, { method: 'POST', body: JSON.stringify({ date, productMap, clinicDocId: clinicDocId || undefined }) });
      setIssued({ shipment: j.shipment, settings: j.settings });
      await downloadInvoicePdf('invoice', j);
      onIssued();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const d = data?.draft;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              インボイス作成（{instructionId}）
            </h3>
            <p className="text-[11px] text-slate-500">製剤・クリニック・倉庫・宣誓文などはインボイスアプリのマスタを使います。発行するとインボイスアプリの発送データにも入ります。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">{error}</div>}
        {!data && !error && (
          <div className="py-10 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin inline" />
          </div>
        )}

        {issued || data?.issued ? (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 space-y-2 text-sm">
            <div className="font-bold text-emerald-800">インボイス {issued?.shipment.invoiceNo || data?.issued?.invoiceNo} を発行しました</div>
            <InvoicePdfButtons source={`/api/invoice/doc/${instructionId}`} />
          </div>
        ) : (
          d && (
            <>
              {data!.problems.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                  <div className="font-bold text-amber-900 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    確認が必要な点
                  </div>
                  {data!.problems.map((p, i) => (
                    <div key={i} className="text-amber-900">・{p}</div>
                  ))}
                  <div className="text-[11px] text-amber-700">
                    マスタの不足は <a className="underline font-bold" href="https://invoice-seven-tan.vercel.app/" target="_blank" rel="noreferrer">インボイスアプリ</a> で直してから
                    <button onClick={() => load(true)} className="underline font-bold ml-1">
                      読み込み直す
                    </button>
                  </div>
                </div>
              )}
              {clinicMissing && (
                <label className="block text-xs space-y-1">
                  <span className="font-bold text-slate-700">インボイスのクリニックを選ぶ</span>
                  <select value={clinicDocId} onChange={(e) => setClinicDocId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5">
                    <option value="">選んでください</option>
                    {data!.clinicOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.nameEn && `/ ${c.nameEn}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {data!.unmatched.map((u) => (
                <label key={u.index} className="block text-xs space-y-1">
                  <span className="font-bold text-slate-700">「{u.productName}」に当たるインボイスの製剤</span>
                  <select value={productMap[String(u.index)] || ''} onChange={(e) => setProductMap({ ...productMap, [String(u.index)]: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5">
                    <option value="">選んでください</option>
                    {data!.productOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameJa || p.nameEn} {p.sku && `（${p.sku}）`} {p.invoicePrice != null && `¥${p.invoicePrice}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] font-bold text-slate-500">発送元 / Shipper</div>
                  <div className="font-bold">{d.warehouseSnapshot?.nameEn || d.warehouseSnapshot?.name || '—'}</div>
                  <div className="text-slate-600">{d.warehouseSnapshot?.addressEn || d.warehouseSnapshot?.address}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] font-bold text-slate-500">届け先 / Consignee</div>
                  <div className="font-bold">{d.clinicSnapshot?.nameEn || d.clinicSnapshot?.name || '—'}</div>
                  <div className="text-slate-600">{d.clinicSnapshot?.doctorNameEn || d.clinicSnapshot?.doctorName}</div>
                  <div className="text-slate-600">{d.clinicSnapshot?.addressEn}</div>
                  <div className="text-slate-600">{d.clinicSnapshot?.phone}</div>
                </div>
              </div>

              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-1.5">Description</th>
                    <th className="text-left px-2 py-1.5">HS</th>
                    <th className="text-left px-2 py-1.5">Origin</th>
                    <th className="text-right px-2 py-1.5">Qty</th>
                    <th className="text-right px-2 py-1.5">Unit price</th>
                    <th className="text-right px-2 py-1.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.items.map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 font-semibold">{it.nameEn}</td>
                      <td className="px-2 py-1.5 font-mono">{it.hsCode || '—'}</td>
                      <td className="px-2 py-1.5">{it.countryOfOrigin || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.qty} {it.unit}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{it.unitPrice.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold">{it.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-bold">
                    <td colSpan={5} className="px-2 py-1.5 text-right">
                      Total（{d.currency}・選択済みの製剤のみ）
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{d.totalInvoiceAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                <label className="text-xs flex items-center gap-1.5">
                  <span className="text-slate-500">発送日（インボイス番号の日付）</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
                </label>
                <button disabled={!canIssue || busy} onClick={issue} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-40">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  インボイスを発行してPDFを作る
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
