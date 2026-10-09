import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, ExternalLink, RefreshCw, Trash2, Upload } from 'lucide-react';
import readXlsxFile from 'read-excel-file/browser';
import { ClinicItem, Order } from '../types';
import { domesticTrackingUrl, hintedCarrier, parseTrackingNumbers } from '../utils/trackingNumbers';
import { splitOrderIds } from '../utils/bulk';

// 一括発注の配送（湘南美容・東京ベレッザなど）：院ごとの納品先・数量・追跡番号を、配送リスト（Excel・CSV）から取り込んで追跡する。
// 楽楽販売とは切り離して、このシステムだけで持つ（楽楽販売には書き込まない）。

type FieldKey = 'clinic' | 'address' | 'product' | 'qty' | 'carrier' | 'domesticNo' | 'trackingNo' | 'shipDate' | 'note';

const FIELDS: { key: FieldKey; label: string; required?: boolean; pattern: RegExp }[] = [
  { key: 'clinic', label: '納品先（院名）', required: true, pattern: /納品先|お届け先|届け先|配送先|宛先|院名|医院|クリニック|店舗|施設/ },
  { key: 'address', label: '住所', pattern: /住所|所在地/ },
  { key: 'product', label: '商品', pattern: /商品|品名|品目|製品/ },
  { key: 'qty', label: '数量', pattern: /数量|個数|出荷数|本数|qty/i },
  { key: 'carrier', label: '配送業者', pattern: /配送業者|運送会社|業者|キャリア/ },
  // 「国内」を先に判定する（「国内追跡番号」が国際の列に入らないように）。「追跡番号」1列だけのファイルは、番号の形で国際・国内に振り分ける
  { key: 'domesticNo', label: '国内追跡番号（佐川）', pattern: /国内|佐川|飛脚|お問い合わせ番号|問合せ番号/ },
  { key: 'trackingNo', label: '国際追跡番号（DHL・FedEx）', pattern: /国際|DHL|FedEx|AWB|エアウェイ|追跡|伝票|送り状/i },
  { key: 'shipDate', label: '出荷日', pattern: /出荷日|発送日|出荷予定|発送予定/ },
  { key: 'note', label: 'メモ', pattern: /備考|メモ|注記/ },
];

interface LegStatus {
  state: string;
  label: string;
  carrier?: string;
  lastEventAt?: string;
  lastLocation?: string;
}
interface RowStatus {
  state: 'delivered' | 'in_transit' | 'pickup' | 'exception' | 'pending' | 'no_number' | 'not_found';
  label: string;
  legs?: { intl: LegStatus | null; domestic: LegStatus | null };
  carrier?: string;
  lastEventAt?: string;
  lastLocation?: string;
  statusText?: string;
  deliveredAt?: string;
}
interface BulkRow {
  id: string;
  clinic: string;
  address: string;
  product: string;
  qty: number | null;
  carrier: string;
  trackingNo: string;
  domesticNo: string;
  shipDate: string;
  note: string;
  status: RowStatus;
  /** 顧客マスタで結びついたクリニック（院名から自動。手で選び直せる） */
  clinicId: string;
  masterName: string;
  addressSource: 'file' | 'master' | '';
  masterAddressEn: string;
}
interface Batch {
  id: string;
  title: string;
  orderId: string;
  createdAt: string;
  updatedAt: string;
  rows: BulkRow[];
  counts: Record<string, number>;
  total: number;
}

const STATE_STYLE: Record<RowStatus['state'], { label: string; cls: string; bar: string }> = {
  delivered: { label: '配達完了', cls: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  in_transit: { label: '配送中', cls: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' },
  pickup: { label: '集荷待ち', cls: 'bg-sky-100 text-sky-800', bar: 'bg-sky-400' },
  exception: { label: '要確認', cls: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500' },
  pending: { label: '取得待ち', cls: 'bg-slate-200 text-slate-700', bar: 'bg-slate-400' },
  not_found: { label: '番号の確認を', cls: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  no_number: { label: '番号未登録', cls: 'bg-slate-100 text-slate-600 border border-slate-300', bar: 'bg-slate-200' },
};
const STATE_ORDER: RowStatus['state'][] = ['exception', 'not_found', 'no_number', 'pending', 'pickup', 'in_transit', 'delivered'];

const TEMPLATE_HEADERS = ['納品先', '住所', '商品名', '数量', '国際追跡番号（DHL・FedEx）', '国内追跡番号（佐川）', '出荷日', 'メモ'];
const TEMPLATE_SAMPLE = [
  ['湘南美容クリニック 新宿本院', '東京都新宿区…', 'PRX-T33(マッサージピール)', '6', '7511638724', '', '2026/10/14', 'SG倉庫からDHLで直送'],
  ['湘南美容クリニック 横浜院', '神奈川県横浜市…', 'PRX-T33(マッサージピール)', '4', '877477993783', '4407-7232-6536', '2026/10/14', '日本で佐川に積み替え'],
];
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function saveCsv(fileName: string, rows: unknown[][]) {
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- ファイルの読み込み ----
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return `${v.getFullYear()}/${String(v.getMonth() + 1).padStart(2, '0')}/${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

async function readFileSheets(file: File): Promise<{ name: string; rows: string[][] }[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const buf = await file.arrayBuffer();
    // Excel で保存した CSV は Shift_JIS のことが多い。UTF-8 で読めなければ Shift_JIS で読み直す
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('shift_jis').decode(buf);
    return [{ name: file.name, rows: parseCsvText(text.replace(/^﻿/, '')) }];
  }
  if (lower.endsWith('.xls')) throw new Error('古い形式（.xls）は読めません。Excel で「.xlsx」か「CSV」として保存し直してください');
  const sheets = await readXlsxFile(file);
  return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((r) => r.map(cellText)).filter((r) => r.some((c) => c)) }));
}

/** 見出しの行（項目名が一番多く当たる行）と、列の割り当てを推定する */
function guessMapping(rows: string[][]): { headerRow: number; map: Partial<Record<FieldKey, number>> } {
  let best = { headerRow: 0, score: -1, map: {} as Partial<Record<FieldKey, number>> };
  rows.slice(0, 10).forEach((r, i) => {
    const map: Partial<Record<FieldKey, number>> = {};
    r.forEach((h, col) => {
      const f = FIELDS.find((f) => map[f.key] === undefined && f.pattern.test(h));
      if (f) map[f.key] = col;
    });
    const score = Object.keys(map).length + (map.clinic !== undefined ? 2 : 0);
    if (score > best.score) best = { headerRow: i, score, map };
  });
  return { headerRow: best.headerRow, map: best.map };
}

function trackingUrl(numbers: string, leg: LegStatus | null | undefined, domestic: boolean): string | null {
  const first = parseTrackingNumbers(numbers)[0];
  if (!first) return null;
  const code = hintedCarrier(leg?.carrier) || (domestic ? 'sagawa' : first.length === 10 ? 'dhl' : 'fedex');
  if (code === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${first}`;
  if (code === 'dhl') return `https://www.dhl.com/jp-ja/home/tracking.html?tracking-id=${first}`;
  return domesticTrackingUrl(code, first);
}

function ago(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const h = Math.round((Date.now() - t) / 3600000);
  return h < 48 ? `${Math.max(0, h)}時間前` : `${Math.round(h / 24)}日前`;
}

// ---- 画面 ----
export const BulkDeliveriesView: React.FC<{ orders: Order[]; clinics?: ClinicItem[]; onSelectOrder: (order: Order) => void }> = ({
  orders,
  clinics = [],
  onSelectOrder,
}) => {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 取り込みの途中の状態
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [target, setTarget] = useState<string>('new');
  const [title, setTitle] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch('/api/bulk-deliveries')
      .then((r) => r.json())
      .then((j) => {
        setBatches(j.batches || []);
        setError(null);
      })
      .catch(() => setError('一括発注の配送を読み込めませんでした。少し待って「最新にする」を押してください'));

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);
  const masterByName = useMemo(() => new Map(clinics.map((c) => [c.clinicName, c])), [clinics]);
  const bulkOrderOptions = useMemo(
    () =>
      orders
        .filter((o) => /湘南美容|ベレッザ/.test(o.customerName || ''))
        .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))
        .slice(0, 60),
    [orders]
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 6000);
  };

  // ファイルを選んだら、見出しと列の割り当てを推定する
  const onFile = async (file: File) => {
    try {
      const list = await readFileSheets(file);
      const idx = Math.max(0, list.findIndex((s) => s.rows.length > 1));
      const g = guessMapping(list[idx]?.rows || []);
      setSheets(list);
      setSheetIdx(idx);
      setHeaderRow(g.headerRow);
      setMapping(g.map);
      setFileName(file.name);
      setTitle(file.name.replace(/\.(xlsx|csv|txt)$/i, ''));
      setTarget('new');
    } catch (e: any) {
      showNotice(e?.message || 'ファイルを読めませんでした');
    }
  };

  const changeSheet = (i: number) => {
    setSheetIdx(i);
    const g = guessMapping(sheets?.[i]?.rows || []);
    setHeaderRow(g.headerRow);
    setMapping(g.map);
  };

  const rowsNow = sheets?.[sheetIdx]?.rows || [];
  const headers = rowsNow[headerRow] || [];
  const parsedRows = useMemo(
    () =>
      rowsNow.slice(headerRow + 1).map((r) => {
        const get = (k: FieldKey) => (mapping[k] !== undefined ? r[mapping[k]!] || '' : '');
        const qtyText = get('qty').replace(/[,，個本箱]/g, '');
        return {
          clinic: get('clinic'),
          address: get('address'),
          product: get('product'),
          qty: qtyText && !isNaN(Number(qtyText)) ? Number(qtyText) : null,
          carrier: get('carrier'),
          trackingNo: get('trackingNo'),
          domesticNo: get('domesticNo'),
          shipDate: get('shipDate'),
          note: get('note'),
        };
      }).filter((r) => r.clinic),
    [rowsNow, headerRow, mapping]
  );

  const runImport = async () => {
    if (mapping.clinic === undefined) return showNotice('「納品先（院名）」の列を選んでください');
    if (parsedRows.length === 0) return showNotice('取り込める行がありません（納品先が空の行は読み飛ばします）');
    if (target === 'new' && !title.trim()) return showNotice('一括発注の名前を入れてください');
    setBusy(true);
    try {
      const res = await fetch('/api/bulk-deliveries/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: target === 'new' ? undefined : target, title: title.trim(), orderId: orderId.trim(), rows: parsedRows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || '取り込みに失敗しました');
      showNotice(
        `取り込みました：新しい院 ${j.added}件・更新 ${j.updated}件${j.looking ? `。追跡番号 ${j.looking}件の状況を取得しています（1〜2分）` : ''}`
      );
      setSheets(null);
      setOpen((o) => ({ ...o, [j.batchId]: true }));
      await load();
      if (j.looking) setTimeout(load, 60 * 1000);
    } catch (e: any) {
      showNotice(e?.message || '取り込みに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (batchId: string, row: BulkRow, patch: Partial<BulkRow>) => {
    const res = await fetch(`/api/bulk-deliveries/${batchId}/rows/${row.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.row) return showNotice(j?.error || '保存できませんでした');
    setBatches((list) =>
      (list || []).map((b) => (b.id !== batchId ? b : { ...b, rows: b.rows.map((r) => (r.id === row.id ? { ...r, ...j.row } : r)) }))
    );
  };

  const deleteBatch = async (id: string) => {
    await fetch(`/api/bulk-deliveries/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    load();
  };

  const downloadTemplate = () => saveCsv('一括発注_配送リスト_ひな形.csv', [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE]);

  // 一括発注の院ごとの状況を CSV で書き出す（倉庫・営業への共有用）
  const exportBatch = (b: Batch) =>
    saveCsv(`${b.title}_配送状況.csv`, [
      ['納品先', '住所', '英語の住所（マスタ）', '商品名', '数量', '国際追跡番号（DHL・FedEx）', '国内追跡番号（佐川）', '出荷日', '状況', '国際の状況', '国内の状況', '最終スキャン', 'メモ'],
      ...b.rows.map((r) => [
        r.clinic,
        r.address,
        r.masterAddressEn,
        r.product,
        r.qty ?? '',
        r.trackingNo,
        r.domesticNo,
        r.shipDate,
        r.status.label,
        r.status.legs?.intl ? `${r.status.legs.intl.carrier || ''} ${r.status.legs.intl.label}`.trim() : '',
        r.status.legs?.domestic ? `${r.status.legs.domestic.carrier || ''} ${r.status.legs.domestic.label}`.trim() : '',
        [r.status.lastLocation, r.status.lastEventAt ? new Date(r.status.lastEventAt).toLocaleString('ja-JP') : ''].filter(Boolean).join(' '),
        r.note,
      ]),
    ]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">一括発注の配送</h2>
            <p className="text-xs text-slate-500 mt-1">
              湘南美容・東京ベレッザなどの一括発注を、院ごとの配送先と追跡番号で管理します。配送リスト（Excel・CSV）を取り込み、送り状を出したら番号の列（国際：DHL・FedEx／国内：佐川）を埋めて同じファイルをもう一度取り込むか、下の表に直接入力してください。国内（佐川）の番号がある院は、佐川で届いた時点で配達完了にします。
              この画面のデータは楽楽販売には書き込みません。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              配送リストを取り込む
            </button>
            <button type="button" onClick={downloadTemplate} className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              ひな形（CSV）
            </button>
            <button type="button" onClick={load} className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              最新にする
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {notice && <p className="text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">{notice}</p>}
        {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
      </div>

      {/* 取り込みの確認 */}
      {sheets && (
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">取り込みの確認：{fileName}</h3>
            <span className="text-xs text-slate-500">取り込む院：<b className="font-mono text-slate-900">{parsedRows.length}</b>件</span>
          </div>

          {sheets.length > 1 && (
            <label className="text-xs text-slate-600 flex items-center gap-2">
              シート
              <select value={sheetIdx} onChange={(e) => changeSheet(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1">
                {sheets.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}（{s.rows.length}行）
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[11px] text-slate-600 space-y-1">
              <span className="block font-bold">見出しの行</span>
              <select value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs">
                {rowsNow.slice(0, 10).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}行目：{r.filter(Boolean).slice(0, 3).join('・').slice(0, 30)}
                  </option>
                ))}
              </select>
            </label>
            {FIELDS.map((f) => (
              <label key={f.key} className="text-[11px] text-slate-600 space-y-1">
                <span className="block font-bold">
                  {f.label}
                  {f.required && <span className="text-rose-600">（必須）</span>}
                </span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className={`w-full border rounded-lg px-2 py-1 text-xs ${f.required && mapping[f.key] === undefined ? 'border-rose-400' : 'border-slate-300'}`}
                >
                  <option value="">（使わない）</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `${i + 1}列目`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="data-table-wrap overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-600 bg-slate-50">
                  {FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                    <th key={f.key} className="py-1.5 px-2">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedRows.slice(0, 6).map((r, i) => (
                  <tr key={i}>
                    {FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                      <td key={f.key} className="py-1.5 px-2 whitespace-nowrap">{String((r as any)[f.key] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 6 && <p className="text-[11px] text-slate-500 px-2 py-1">… ほか {parsedRows.length - 6}件</p>}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] text-slate-600 space-y-1">
              <span className="block font-bold">取り込み先</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="new">新しい一括発注として登録</option>
                {(batches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    「{b.title}」に追加・更新（追跡番号の追記など）
                  </option>
                ))}
              </select>
            </label>
            {target === 'new' && (
              <>
                <label className="text-[11px] text-slate-600 space-y-1">
                  <span className="block font-bold">一括発注の名前</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" placeholder="例：湘南美容 10月分 ジュベルック" />
                </label>
                <label className="text-[11px] text-slate-600 space-y-1">
                  <span className="block font-bold">楽楽販売の受注ID（あれば）</span>
                  <input value={orderId} onChange={(e) => setOrderId(e.target.value)} list="bulk-order-options" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" placeholder="000003861（複数ならカンマ区切り）" />
                  <datalist id="bulk-order-options">
                    {bulkOrderOptions.map((o) => (
                      <option key={o.orderId} value={o.orderId}>
                        {o.customerName}・{o.orderDate}
                      </option>
                    ))}
                  </datalist>
                </label>
              </>
            )}
          </div>
          {target !== 'new' && <p className="text-[11px] text-slate-500">納品先と商品が同じ行は、ファイルに入っている項目（追跡番号・配送業者・出荷日など）だけ上書きします。新しい院は追加します。</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setSheets(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold">
              やめる
            </button>
            <button type="button" disabled={busy} onClick={runImport} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50">
              {busy ? '取り込み中…' : `${parsedRows.length}件を取り込む`}
            </button>
          </div>
        </div>
      )}

      {batches === null && !error && <p className="text-xs text-slate-500 px-1">読み込み中…</p>}
      {batches && batches.length === 0 && !sheets && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-bold text-slate-800">まだ一括発注の配送はありません</p>
          <p className="text-xs text-slate-500">「配送リストを取り込む」から、院名・数量の入った Excel か CSV を選んでください。形が決まっていなければ「ひな形（CSV）」を使ってください。</p>
        </div>
      )}

      {(batches || []).map((b) => {
        const isOpen = open[b.id] ?? false;
        const f = filter[b.id] || 'all';
        const rows = b.rows
          .filter((r) => f === 'all' || r.status.state === f)
          .sort((x, y) => STATE_ORDER.indexOf(x.status.state) - STATE_ORDER.indexOf(y.status.state) || x.clinic.localeCompare(y.clinic, 'ja'));
        const orderIds = splitOrderIds(b.orderId);
        const delivered = b.counts.delivered || 0;
        return (
          <div key={b.id} className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [b.id]: !isOpen }))} className="text-left flex items-start gap-1.5 min-w-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{b.title}</span>
                    <span className="block text-[11px] text-slate-500">
                      {b.total}院・配達完了 {delivered}院・登録 {new Date(b.createdAt).toLocaleDateString('ja-JP')}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-2 text-xs">
                  {orderIds.map((id) => {
                    const order = orderById.get(id);
                    return order ? (
                      <button key={id} type="button" onClick={() => onSelectOrder(order)} className="font-mono font-bold text-blue-700 hover:underline">
                        受注 {id}
                      </button>
                    ) : (
                      <span key={id} className="font-mono text-slate-500">受注 {id}</span>
                    );
                  })}
                  <button type="button" onClick={() => exportBatch(b)} className="px-2 py-1 rounded-lg border border-slate-300 text-slate-700 font-bold flex items-center gap-1" title="院ごとの状況をCSVで書き出す">
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                  {confirmDelete === b.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-rose-700 font-bold">この一括発注を消しますか？</span>
                      <button type="button" onClick={() => deleteBatch(b.id)} className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold">
                        消す
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded-lg border border-slate-300 font-bold">
                        やめる
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(b.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="この一括発注を消す">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" aria-label="院ごとの配送状況">
                {STATE_ORDER.slice()
                  .reverse()
                  .map((st) =>
                    b.counts[st] ? <span key={st} className={STATE_STYLE[st].bar} style={{ width: `${(b.counts[st] / b.total) * 100}%` }} /> : null
                  )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...STATE_ORDER] as const).map((st) => {
                  const n = st === 'all' ? b.total : b.counts[st] || 0;
                  if (st !== 'all' && n === 0) return null;
                  const on = f === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setFilter((x) => ({ ...x, [b.id]: st }));
                        setOpen((o) => ({ ...o, [b.id]: true }));
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${on ? 'bg-slate-900 text-white' : st === 'all' ? 'bg-slate-100 text-slate-700' : STATE_STYLE[st].cls}`}
                    >
                      {st === 'all' ? 'すべて' : STATE_STYLE[st].label} {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {isOpen && (
              <div className="data-table-wrap overflow-x-auto border-t border-slate-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-600 bg-slate-50">
                      <th className="py-2 px-3">納品先</th>
                      <th className="py-2 px-3">商品・数量</th>
                      <th className="py-2 px-3">国際（DHL・FedEx）</th>
                      <th className="py-2 px-3">国内（佐川）</th>
                      <th className="py-2 px-3">状況</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const st = STATE_STYLE[r.status.state];
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{r.clinic}</div>
                            {r.address ? (
                              <div className="text-[10px] text-slate-500 max-w-[18rem]" title={[r.address, r.masterAddressEn].filter(Boolean).join('\n')}>
                                <span className={`mr-1 px-1 rounded font-bold ${r.addressSource === 'master' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {r.addressSource === 'master' ? 'マスタ' : 'リスト'}
                                </span>
                                {r.address}
                              </div>
                            ) : r.clinicId ? (
                              <div className="text-[10px] text-amber-700">顧客マスタ「{r.masterName}」に住所が未入力です</div>
                            ) : (
                              <div className="text-[10px] text-amber-700 flex items-center gap-1 flex-wrap">
                                顧客マスタに見つかりません
                                <input
                                  list="bulk-master-clinics"
                                  placeholder="マスタから選ぶ"
                                  className="border border-amber-300 rounded px-1 py-0.5 w-40 text-slate-800"
                                  onChange={(e) => {
                                    const c = masterByName.get(e.target.value);
                                    if (c) saveRow(b.id, r, { clinicId: c.clinicId });
                                  }}
                                />
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {r.product || '—'}
                            {r.qty !== null && <span className="font-mono font-bold"> × {r.qty}</span>}
                          </td>
                          {(['trackingNo', 'domesticNo'] as const).map((k) => {
                            const leg = k === 'trackingNo' ? r.status.legs?.intl : r.status.legs?.domestic;
                            const url = trackingUrl(r[k], leg, k === 'domesticNo');
                            return (
                              <td key={k} className="py-2 px-3">
                                <input
                                  key={`${k}-${r.id}-${r[k]}`}
                                  defaultValue={r[k]}
                                  onBlur={(e) => e.target.value !== r[k] && saveRow(b.id, r, { [k]: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                  className="w-36 border border-slate-200 rounded px-1.5 py-0.5 font-mono"
                                  placeholder={k === 'trackingNo' ? 'DHL・FedEx' : '佐川'}
                                />
                                {leg && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {[leg.carrier, leg.label].filter(Boolean).join(' ')}
                                    {url && (
                                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 inline-flex items-center gap-0.5 ml-1">
                                        確認 <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{r.status.label}</span>
                            {(r.status.lastLocation || r.status.lastEventAt) && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {[r.status.carrier, r.status.lastLocation, ago(r.status.lastEventAt)].filter(Boolean).join('・')}
                              </div>
                            )}
                            {r.carrier && parseTrackingNumbers(`${r.trackingNo} ${r.domesticNo}`).length === 0 && (
                              <div className="text-[10px] text-slate-500 mt-0.5">配送業者：{r.carrier}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      <datalist id="bulk-master-clinics">
        {clinics.map((c) => (
          <option key={c.clinicId} value={c.clinicName} />
        ))}
      </datalist>
      <datalist id="bulk-carriers">
        <option value="佐川" />
        <option value="ヤマト" />
        <option value="日本郵便" />
        <option value="手持ち（持参）" />
        <option value="その他" />
      </datalist>
    </div>
  );
};
