import React, { useEffect, useMemo, useState } from 'react';
import { useUrlState } from '../utils/listState';
import { AlertCircle, CheckCircle2, Copy, Download, ExternalLink, Layers, List, RefreshCw, Search, Truck } from 'lucide-react';
import { getRakurakuUrl } from '../utils/customsUtils';
import { useSharedNotes } from '../utils/sharedNotes';

// 「◆出荷ステータス」シートの行のうち、楽楽販売の出荷管理（101270）と追跡番号で照合できなかったもの。
// アプリからはどこにも書き込まない。追跡番号の入力は楽楽販売で行う。

interface Candidate {
  shipmentId: string;
  orderId: string;
  customerName: string;
  trackingNo: string;
  shippedDate: string;
  shipStatus?: string;
  reason: 'インボイス番号が一致' | '出荷待ち' | '出荷日が近い';
  warehouse?: string;
  warehouseInvoiceNo?: string;
}

interface UnmatchedRow {
  rowNumber: number;
  origin: string;
  shipDate: string;
  courier: string;
  invoiceNo: string;
  clinicName: string;
  trackingNo: string;
  candidates: Candidate[];
  kind: 'single' | 'multiple' | 'none' | 'bulk';
  bulkGroupLabel?: string;
  matchedClinicNames: string[];
  bulkGroupKey: string | null;
  noCandidateReason?: string;
  nameVariants?: { sheetName: string; matchedName: string }[];
}

interface MatchedIssue {
  rowNumber: number;
  origin: string;
  shipDate: string;
  courier: string;
  invoiceNo: string;
  clinicName: string;
  trackingNo: string;
  issue: 'registered_elsewhere' | 'ship_date_mismatch';
  shipments: Candidate[];
  rakurakuShipDate?: string;
}

interface UnmatchedResponse {
  success: boolean;
  pending?: boolean;
  error?: string;
  sheetReadAt?: string;
  rakurakuLastSuccessTime?: string | null;
  clinicsLoaded?: boolean;
  rows?: UnmatchedRow[];
  issues?: MatchedIssue[];
  targetCount?: number;
  matchedCount?: number;
  noTrackingCount?: number;
}

const KIND_STYLE: Record<UnmatchedRow['kind'], { label: string; className: string }> = {
  single: { label: '候補1件', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  multiple: { label: '候補複数', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  none: { label: '候補なし', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  bulk: { label: '一括発注', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};

const KIND_CARD_BG: Record<UnmatchedRow['kind'], string> = {
  single: 'bg-emerald-50/60',
  multiple: 'bg-amber-50/60',
  none: 'bg-rose-50/60',
  bulk: 'bg-indigo-50/60',
};

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dayDiffLabel(sheetDate: string, rakurakuDate?: string): string {
  const a = new Date((sheetDate || '').replace(/\//g, '-') + 'T00:00:00');
  const b = new Date((rakurakuDate || '').replace(/\//g, '-') + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '';
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diff > 0 ? `${diff}日後` : `${-diff}日前`;
}

/** チェックリストの1行：照合できない理由と、やることを文章にしたもの */
type CheckKind = 'invoice' | 'waiting' | 'near' | 'multiple' | 'none' | 'elsewhere' | 'date' | 'bulk';
interface CheckItem {
  key: string;
  kind: CheckKind;
  rowNumber: number;
  shipDate: string;
  origin: string;
  courier: string;
  invoiceNo: string;
  clinicName: string;
  trackingNo: string;
  reason: string;
  todo: string;
  shipments: Candidate[];
}
const CHECK_KIND: Record<CheckKind, { label: string; className: string }> = {
  invoice: { label: 'インボイス番号で候補あり', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  waiting: { label: '楽楽が出荷待ちのまま', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  near: { label: '出荷日の近い候補あり', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  multiple: { label: '候補が複数', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  none: { label: '候補なし', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  elsewhere: { label: '別の受注に登録済み', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  date: { label: '出荷日がずれている', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  bulk: { label: '一括発注（対応不要）', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};
const digitsOf = (v: string) => (v || '').replace(/\D/g, '');
function buildChecklist(rows: UnmatchedRow[], issues: MatchedIssue[]): CheckItem[] {
  const out: CheckItem[] = [];
  for (const r of rows) {
    const base = { key: digitsOf(r.trackingNo) || `row-${r.rowNumber}`, rowNumber: r.rowNumber, shipDate: r.shipDate, origin: r.origin, courier: r.courier, invoiceNo: r.invoiceNo, clinicName: r.clinicName, trackingNo: r.trackingNo, shipments: r.candidates };
    const name = r.nameVariants?.length ? `（名前の表記ゆれ：シート「${r.nameVariants[0].sheetName}」／楽楽「${r.nameVariants[0].matchedName}」）` : '';
    const c = r.candidates[0];
    if (r.kind === 'bulk') {
      out.push({ ...base, kind: 'bulk', reason: `${r.bulkGroupLabel || '一括発注'}は本部名の受注にまとめて登録するため、院ごとの出荷が楽楽にない`, todo: '対応不要（確認だけ）' });
    } else if (r.kind === 'single' && c) {
      const kind: CheckKind = c.reason === 'インボイス番号が一致' ? 'invoice' : c.reason === '出荷待ち' ? 'waiting' : 'near';
      const why =
        kind === 'invoice'
          ? `シートの追跡番号が楽楽のどの出荷にも入っていない。インボイス番号（${c.warehouseInvoiceNo || r.invoiceNo}）が同じ出荷 ${c.shipmentId} がある`
          : kind === 'waiting'
            ? `シートでは出荷済みだが、楽楽の ${c.shipmentId}（受注 ${c.orderId}）は出荷待ちのまま・追跡番号なし`
            : `シートの追跡番号が楽楽にない。同じクリニックで出荷日の近い ${c.shipmentId}（出荷日 ${c.shippedDate}）に追跡番号がない`;
      out.push({ ...base, kind, reason: why + name, todo: `楽楽の ${c.shipmentId} の出荷番号に ${r.trackingNo} を入れる` });
    } else if (r.kind === 'multiple') {
      out.push({ ...base, kind: 'multiple', reason: `同じクリニックに追跡番号のない出荷が${r.candidates.length}件あり、どれの荷物か決められない${name}`, todo: 'インボイス・商品から正しい出荷を選び、その出荷番号に追跡番号を入れる' });
    } else {
      out.push({ ...base, kind: 'none', reason: `${r.noCandidateReason || '楽楽にこのクリニックの対象の出荷が見つからない'}${name}`, todo: '楽楽で受注・出荷が作られているか確認する（なければ担当者へ）。名前の違いなら顧客名をそろえる' });
    }
  }
  for (const i of issues) {
    const base = { key: `${i.issue}:${digitsOf(i.trackingNo) || i.rowNumber}`, rowNumber: i.rowNumber, shipDate: i.shipDate, origin: i.origin, courier: i.courier, invoiceNo: i.invoiceNo, clinicName: i.clinicName, trackingNo: i.trackingNo, shipments: i.shipments };
    if (i.issue === 'registered_elsewhere') {
      out.push({ ...base, kind: 'elsewhere', reason: `追跡番号が別の出荷 ${i.shipments.map((sh) => `${sh.shipmentId}（${sh.customerName}・受注 ${sh.orderId}）`).join('、')} に登録されている`, todo: '登録先が正しいか確認し、違えば楽楽で正しい出荷に付け替える' });
    } else {
      out.push({ ...base, kind: 'date', reason: `シートの出荷日 ${i.shipDate} と楽楽の出荷日 ${i.rakurakuShipDate} が違う（${dayDiffLabel(i.shipDate, i.rakurakuShipDate)}）`, todo: '実際に出た日を確認し、楽楽の出荷日を直す（遵守率に影響）' });
    }
  }
  return out;
}

function ChecklistView({ items, marks, setMark, onCopy, copied, rakurakuUrl }: { items: CheckItem[]; marks: Record<string, { by?: string; at: string }>; setMark: (k: string, v: { by?: string; at: string } | null) => void; onCopy: (id: string) => void; copied: string | null; rakurakuUrl: string }) {
  const [kind, setKind] = useState<'all' | CheckKind>('all');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [q, setQ] = useState('');
  const kinds = (Object.keys(CHECK_KIND) as CheckKind[]).filter((k) => items.some((i) => i.kind === k));
  const open = (k: CheckKind | 'all') => items.filter((i) => (k === 'all' ? i.kind !== 'bulk' : i.kind === k) && !marks[i.key]).length;
  const shown = items
    .filter((i) => (kind === 'all' ? i.kind !== 'bulk' : i.kind === kind))
    .filter((i) => !onlyOpen || !marks[i.key])
    .filter((i) => !q.trim() || [i.clinicName, i.trackingNo, i.invoiceNo, i.reason].some((v) => (v || '').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (marks[a.key] ? 1 : 0) - (marks[b.key] ? 1 : 0) || (b.shipDate || '').localeCompare(a.shipDate || ''));
  const downloadCsv = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['チェック', '理由の種類', 'シート行', '出荷日', '出荷元', 'クーリエ', 'INVOICE', 'クリニック', '追跡番号', '照合できない理由', 'やること', '楽楽の出荷'];
    const lines = shown.map((i) => [marks[i.key] ? '済' : '', CHECK_KIND[i.kind].label, String(i.rowNumber), i.shipDate, i.origin, i.courier, i.invoiceNo, i.clinicName, i.trackingNo, i.reason, i.todo, i.shipments.map((s) => s.shipmentId).join(' ')].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `楽楽販売と未照合_チェックリスト_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button onClick={() => setKind('all')} className={`rounded-lg border px-2.5 py-1 font-bold ${kind === 'all' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
            すべて（未チェック {open('all')}）
          </button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-lg border px-2.5 py-1 font-bold ${kind === k ? 'ring-2 ring-slate-900 ring-offset-1' : ''} ${CHECK_KIND[k].className}`}>
              {CHECK_KIND[k].label} {open(k)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 font-semibold text-slate-700">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            未チェックだけ表示
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="クリニック・追跡番号・INVOICE" className="pl-7 pr-2 py-1 border border-slate-300 rounded-lg w-60" />
          </div>
          <span className="text-slate-500">{shown.length}件</span>
          <button onClick={downloadCsv} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" />
            このリストをCSVで保存
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 w-16 text-left">チェック</th>
              <th className="px-2 py-2 text-left w-40">理由の種類</th>
              <th className="px-2 py-2 text-left w-48">クリニック・追跡番号</th>
              <th className="px-2 py-2 text-left">照合できない理由</th>
              <th className="px-2 py-2 text-left w-72">やること</th>
              <th className="px-2 py-2 text-left w-44">楽楽の出荷</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center font-bold text-emerald-700">
                  未チェックのものはありません
                </td>
              </tr>
            )}
            {shown.map((i) => {
              const m = marks[i.key];
              return (
                <tr key={i.key} className={m ? 'bg-slate-50 text-slate-400' : 'hover:bg-amber-50/30'}>
                  <td className="px-3 py-2 align-top">
                    <label className="flex flex-col items-start gap-0.5 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!m} onChange={() => setMark(i.key, m ? null : { at: new Date().toISOString() })} />
                      {m && <span className="text-[10px] text-emerald-700 font-bold">{new Date(m.at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}済</span>}
                    </label>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${CHECK_KIND[i.kind].className}`}>{CHECK_KIND[i.kind].label}</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      シート{i.rowNumber}行目・{i.shipDate || '—'}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className={`font-bold ${m ? '' : 'text-slate-900'}`}>{i.clinicName || '（名前なし）'}</div>
                    <div className="font-mono">{i.trackingNo}</div>
                    <div className="text-[10px] text-slate-400">
                      {[i.origin, i.courier, i.invoiceNo && `INV ${i.invoiceNo}`].filter(Boolean).join('・')}
                    </div>
                  </td>
                  <td className={`px-2 py-2 align-top leading-relaxed ${m ? '' : 'text-slate-700'}`}>{i.reason}</td>
                  <td className={`px-2 py-2 align-top leading-relaxed font-semibold ${m ? '' : 'text-indigo-800'}`}>{i.todo}</td>
                  <td className="px-2 py-2 align-top space-y-1">
                    {i.shipments.slice(0, 4).map((sh) => (
                      <div key={sh.shipmentId} className="flex items-center gap-1">
                        <span className="font-mono font-bold">{sh.shipmentId}</span>
                        <button onClick={() => onCopy(sh.shipmentId)} title="出荷IDをコピー" className="rounded border border-slate-300 bg-white px-1 py-0.5">
                          <Copy className="w-3 h-3" />
                        </button>
                        {copied === sh.shipmentId && <span className="text-[10px] text-emerald-700">コピー済</span>}
                      </div>
                    ))}
                    {i.shipments.length > 4 && <div className="text-[10px] text-slate-400">ほか{i.shipments.length - 4}件</div>}
                    {i.shipments.length > 0 && (
                      <a href={rakurakuUrl} target="_blank" rel="noopener noreferrer" onClick={() => onCopy(i.shipments[0].shipmentId)} className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                        楽楽販売で開く <ExternalLink className="w-3 h-3" />
                      </a>
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

export async function fetchSheetUnmatched(refresh = false): Promise<UnmatchedResponse> {
  const res = await fetch(`/api/shipment-sheet/unmatched${refresh ? '?refresh=1' : ''}`);
  return res.json();
}

/** 件数（バッジ）：一括発注と「対応済み」の印を付けた行は数えない */
export async function fetchOpenUnmatchedCount(): Promise<number | null> {
  const [json, done] = await Promise.all([
    fetchSheetUnmatched(),
    fetch('/api/shared-notes/unmatched_done')
      .then((r) => r.json())
      .catch(() => ({ notes: {} })),
  ]);
  if (!json.success) return null;
  const marks = done?.notes || {};
  return (json.rows || []).filter((r) => r.kind !== 'bulk' && !marks[(r.trackingNo || '').replace(/\D/g, '')]).length;
}

export const SheetUnmatchedView: React.FC<{ onCountChange?: (count: number | null) => void }> = ({ onCountChange }) => {
  const [data, setData] = useState<UnmatchedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useUrlState<'all' | UnmatchedRow['kind']>('kind', 'all');
  const [view, setView] = useUrlState<'unmatched' | MatchedIssue['issue']>('view', 'unmatched');
  // 対応済みの印（チームで共有）。キーは追跡番号（シートの行が並べ替わっても同じ行を指すように）
  const [doneMarks, setDoneMark] = useSharedNotes<{ by?: string; at: string }>('unmatched_done');
  const [showDone, setShowDone] = useState(false);
  const [mode, setMode] = useUrlState<'list' | 'cards'>('mode', 'list');
  // 件数（バッジ）：一括発注（湘南美容など）と対応済みの行は数えない
  useEffect(() => {
    if (!data?.success) return;
    onCountChange?.((data.rows || []).filter((r) => r.kind !== 'bulk' && !doneMarks[doneKey(r)]).length);
  }, [data, doneMarks]);
  const doneKey = (r: { trackingNo: string }) => (r.trackingNo || '').replace(/\D/g, '');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const json = await fetchSheetUnmatched(refresh);
      setData(json);
      if (!json.success) onCountChange?.(null);
    } catch (e: any) {
      setData({ success: false, error: e?.message || '照合結果を取得できませんでした' });
      onCountChange?.(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows || [];
  const issues = data?.issues || [];
  const elsewhereIssues = issues.filter((i) => i.issue === 'registered_elsewhere');
  const dateIssues = issues.filter((i) => i.issue === 'ship_date_mismatch');
  const counts = useMemo(
    () => ({
      single: rows.filter((r) => r.kind === 'single').length,
      multiple: rows.filter((r) => r.kind === 'multiple').length,
      none: rows.filter((r) => r.kind === 'none').length,
      bulk: rows.filter((r) => r.kind === 'bulk').length,
    }),
    [rows]
  );

  // 一括配送は1グループにまとめて表示する
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!showDone && doneMarks[doneKey(r)]) return false;
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (!q) return true;
      return [r.clinicName, r.trackingNo, r.invoiceNo, r.courier, r.origin].some((v) => (v || '').toLowerCase().includes(q));
    });
    const map = new Map<string, UnmatchedRow[]>();
    filtered.forEach((r) => {
      const key = r.bulkGroupKey || `row-${r.rowNumber}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, items, isBulk: !!items[0].bulkGroupKey }));
  }, [rows, kindFilter, query, showDone, doneMarks]);

  const copyShipmentId = async (shipmentId: string) => {
    try {
      await navigator.clipboard.writeText(shipmentId);
      setCopied(shipmentId);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const rakurakuUrl = getRakurakuUrl();

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">楽楽販売と未照合</h2>
            <p className="text-xs text-slate-500 mt-1">
              「◆出荷ステータス」の追跡番号のうち、楽楽販売の出荷管理（出荷番号）に見つからないもの。追跡番号の入力は楽楽販売で行ってください。
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              対象：出荷日が直近30日以内（配達完了・キャンセル・荷送人へ返送・返却を除く）と未出荷の行 ／ シート読込 {formatTime(data?.sheetReadAt)} ／ 楽楽販売取得 {formatTime(data?.rakurakuLastSuccessTime)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            シートを読み直す
          </button>
        </div>

        {data?.success && mode === 'cards' && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={`text-left p-3 rounded-xl border ${kindFilter === 'all' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <span className="text-[11px] font-semibold text-slate-600 block">未照合（一括発注を除く）</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{rows.length - counts.bulk}</span>
              <span className="text-[10px] text-slate-500 ml-1">件 ／ 照合済み {data.matchedCount ?? 0}件</span>
            </button>
            {(['single', 'multiple', 'none', 'bulk'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
                className={`text-left p-3 rounded-xl border ${kindFilter === k ? 'border-slate-900' : 'border-slate-200'} ${KIND_CARD_BG[k]}`}
              >
                <span className="text-[11px] font-semibold text-slate-600 block">{KIND_STYLE[k].label}</span>
                <span className="text-2xl font-bold font-mono text-slate-900">{counts[k]}</span>
                <span className="text-[10px] text-slate-500 ml-1">件</span>
              </button>
            ))}
          </div>
        )}

        {data?.success && mode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setView('unmatched')}
              className={`text-left px-3 py-2 rounded-xl border text-xs font-bold ${view === 'unmatched' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              未照合の一覧（{rows.length}件）
            </button>
            <button
              type="button"
              onClick={() => setView('registered_elsewhere')}
              className={`text-left px-3 py-2 rounded-xl border text-xs font-bold ${view === 'registered_elsewhere' ? 'border-rose-600 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-700'}`}
            >
              要確認：別の受注に登録済み（{elsewhereIssues.length}件）
            </button>
            <button
              type="button"
              onClick={() => setView('ship_date_mismatch')}
              className={`text-left px-3 py-2 rounded-xl border text-xs font-bold ${view === 'ship_date_mismatch' ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-700'}`}
            >
              要確認：出荷日ずれ（{dateIssues.length}件）
            </button>
          </div>
        )}
      </div>

      {data?.success && (
        <div className="flex items-center gap-1.5 text-xs">
          <button onClick={() => setMode('list')} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold ${mode === 'list' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            <List className="w-3.5 h-3.5" />
            チェックリスト
          </button>
          <button onClick={() => setMode('cards')} className={`rounded-lg border px-3 py-1.5 font-bold ${mode === 'cards' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            くわしい表示（候補ごと）
          </button>
        </div>
      )}

      {data?.success && mode === 'list' && (
        <ChecklistView items={buildChecklist(rows, issues)} marks={doneMarks} setMark={setDoneMark} onCopy={copyShipmentId} copied={copied} rakurakuUrl={rakurakuUrl} />
      )}

      {loading && !data && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">照合しています…</div>
      )}

      {data && !data.success && (
        <div className={`border rounded-2xl p-5 flex items-start gap-3 ${data.pending ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'}`}>
          <AlertCircle className={`w-5 h-5 mt-0.5 ${data.pending ? 'text-slate-500' : 'text-rose-600'}`} />
          <div className="space-y-2">
            <p className={`text-sm font-bold ${data.pending ? 'text-slate-700' : 'text-rose-800'}`}>
              {data.pending ? '照合の準備中です' : '照合できませんでした'}
            </p>
            <p className="text-xs text-slate-600">{data.error}</p>
            <button type="button" onClick={() => load(true)} className="text-xs font-bold text-blue-700 hover:underline">
              再試行
            </button>
          </div>
        </div>
      )}

      {data?.success && mode === 'cards' && view !== 'unmatched' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">
            {view === 'registered_elsewhere'
              ? 'シートの追跡番号が、楽楽販売ですでに別のクリニックの受注の出荷として登録されています。登録先が正しいか確認してください。'
              : 'シートの出荷日と、楽楽販売に入っている出荷日が違います。入力した日を出荷日にすると遵守率が実際より悪く出るため、出荷日を確認してください。'}
          </div>
          {(view === 'registered_elsewhere' ? elsewhereIssues : dateIssues).length === 0 ? (
            <p className="p-5 text-sm font-bold text-emerald-700">該当する行はありません</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(view === 'registered_elsewhere' ? elsewhereIssues : dateIssues).map((i) => (
                <div key={i.rowNumber} className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                          i.issue === 'registered_elsewhere'
                            ? 'bg-rose-100 text-rose-800 border-rose-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}
                      >
                        {i.issue === 'registered_elsewhere'
                          ? `登録済み：受注${i.shipments.map((sh) => sh.orderId).join('・')}`
                          : '出荷日ずれ'}
                      </span>
                      <span className="font-bold text-sm text-slate-900">{i.clinicName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                      <span>シート出荷日 {i.shipDate || '—'}</span>
                      {i.issue === 'ship_date_mismatch' && (
                        <span className="text-amber-700 font-bold">
                          楽楽販売の出荷日 {i.rakurakuShipDate}（{dayDiffLabel(i.shipDate, i.rakurakuShipDate)}）
                        </span>
                      )}
                      <span>出荷元 {i.origin || '—'}</span>
                      <span>{i.courier}</span>
                      <span>シート{i.rowNumber}行目</span>
                    </div>
                    <div className="font-mono text-xs text-slate-800">追跡番号 {i.trackingNo}</div>
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-700">
                    {i.shipments.map((sh) => (
                      <div key={sh.shipmentId} className="flex items-center gap-2">
                        <span className="font-mono font-bold">{sh.shipmentId}</span>
                        <span>受注 {sh.orderId}</span>
                        <span>{sh.customerName}</span>
                        <button
                          type="button"
                          onClick={() => copyShipmentId(sh.shipmentId)}
                          className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {copied === sh.shipmentId ? 'コピー済み' : '出荷IDをコピー'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data?.success && mode === 'cards' && view === 'unmatched' && rows.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">
            未照合の行はありません（対象 {data.targetCount}件 ／ 照合済み {data.matchedCount}件）
          </p>
        </div>
      )}

      {data?.success && mode === 'cards' && view === 'unmatched' && rows.length > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            対応済みも表示（{rows.filter((r) => doneMarks[doneKey(r)]).length}件）
          </label>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="クリニック名・追跡番号・INVOICEで絞り込み"
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
            />
          </div>

          {groups.map((g) => (
            <div key={g.key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              {g.isBulk && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  一括配送：{g.items[0].shipDate} ／ {g.items[0].clinicName.split(/\s+/)[0]} ほか {g.items.length}個口
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {g.items.map((r) => (
                  <div key={r.rowNumber} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-5 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${KIND_STYLE[r.kind].className}`}>
                          {KIND_STYLE[r.kind].label}
                        </span>
                        <span className="font-bold text-sm text-slate-900">{r.clinicName || '（クリニック名なし）'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                        <span>出荷日 {r.shipDate || '—'}</span>
                        <span>出荷元 {r.origin || '—'}</span>
                        {r.invoiceNo && <span>INVOICE {r.invoiceNo}</span>}
                        <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{r.courier || '—'}</span>
                        <span>シート{r.rowNumber}行目</span>
                      </div>
                      <div className="font-mono text-xs text-slate-800">追跡番号 {r.trackingNo}</div>
                      {r.kind === 'bulk' && (
                        <div className="text-[11px] bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1 text-indigo-900">
                          {r.bulkGroupLabel}の一括発注です。楽楽販売では本部名の受注にまとめて登録されるため、院ごとの追跡番号では照合できません。
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDoneMark(doneKey(r), doneMarks[doneKey(r)] ? null : { at: new Date().toISOString() })
                        }
                        className={`mt-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                          doneMarks[doneKey(r)]
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-white border-slate-300 text-slate-700'
                        }`}
                        title="楽楽販売に追跡番号を入れたら押してください（チームで共有されます）"
                      >
                        {doneMarks[doneKey(r)] ? '対応済み（取り消す）' : '対応済みにする'}
                      </button>
                      {doneMarks[doneKey(r)]?.by && <div className="text-[11px] text-emerald-800">メモ: {doneMarks[doneKey(r)]!.by}</div>}
                      {r.nameVariants && r.nameVariants.length > 0 ? (
                        <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 space-y-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-bold mr-1">表記ゆれ</span>
                          <span className="text-amber-900">似た名前で候補を探しています。入力した人に名前の確認をお願いしてください。</span>
                          {r.nameVariants.map((v, i) => (
                            <div key={i} className="text-slate-700">
                              シート「<b>{v.sheetName}</b>」 ／ 楽楽販売「<b>{v.matchedName}</b>」
                            </div>
                          ))}
                        </div>
                      ) : (
                        r.matchedClinicNames.length > 0 && (
                          <div className="text-[11px] text-slate-500">顧客マスタ：{r.matchedClinicNames.join('、')}</div>
                        )
                      )}
                    </div>
                    <div className="lg:col-span-7">
                      {r.candidates.length === 0 ? (
                        <p className="text-xs text-slate-600">
                          <span className="font-bold text-rose-700">候補なし：</span>
                          {r.noCandidateReason || '候補の出荷が見つかりません。'}
                          {!data.clinicsLoaded && '（顧客マスタが未取得のため、英語表記での照合はまだ行っていません）'}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {r.candidates.map((c) => (
                            <div key={c.shipmentId} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="text-[11px] text-slate-700 flex flex-wrap gap-x-3">
                                <span className="font-mono font-bold text-slate-900">{c.shipmentId}</span>
                                <span>受注 {c.orderId}</span>
                                <span>{c.customerName}</span>
                                <span
                                  className={
                                    c.reason === 'インボイス番号が一致'
                                      ? 'text-emerald-700 font-bold'
                                      : c.reason === '出荷待ち'
                                      ? 'text-amber-700 font-bold'
                                      : 'text-slate-500'
                                  }
                                >
                                  {c.reason === 'インボイス番号が一致'
                                    ? `インボイス番号が一致（${c.warehouseInvoiceNo}）`
                                    : c.reason === '出荷待ち'
                                    ? '出荷待ち'
                                    : `出荷日 ${c.shippedDate}`}
                                </span>
                                {c.warehouse && c.warehouse !== '—' && <span className="text-slate-500">{c.warehouse}</span>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => copyShipmentId(c.shipmentId)}
                                  className="px-2 py-1 rounded bg-white border border-slate-300 text-[11px] font-bold text-slate-700 flex items-center gap-1"
                                  title="出荷IDをコピー（楽楽販売の検索に貼り付け）"
                                >
                                  <Copy className="w-3 h-3" />
                                  {copied === c.shipmentId ? 'コピー済み' : '出荷IDをコピー'}
                                </button>
                                <a
                                  href={rakurakuUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => copyShipmentId(c.shipmentId)}
                                  className="rakuraku-open-btn"
                                >
                                  楽楽販売で開く
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
