import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, Settings, Package, Building2, Warehouse as WarehouseIcon, X, Trash2, RefreshCw } from 'lucide-react';
import { InvoicePdfButtons, downloadInvoicePdf } from './InvoiceDialog';
import { notifyDone, notifyError } from '../components/flow/UndoToast';
import { TONE } from '../components/flow/tone';
import { ColorLegend } from '../components/flow/ColorLegend';

// インボイス（INVOICEアプリの機能をこのシステムで）：発送データの一覧・作成・状態変更、マスタ（製剤・クリニック・倉庫）と設定の編集。
// INVOICEアプリと同じデータ（Firestore）を使う

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

type MasterType = 'products' | 'clinics' | 'warehouses';
type Field = { key: string; label: string; type?: 'text' | 'number' | 'bool' | 'textarea'; required?: boolean; hint?: string };
const FIELDS: Record<MasterType, Field[]> = {
  products: [
    { key: 'nameJa', label: '製剤名（日本語）', required: true },
    { key: 'nameEn', label: '製剤名（英語・インボイスに出る）', required: true },
    { key: 'sku', label: 'SKU' },
    { key: 'productId', label: '製剤ID' },
    { key: 'manufacturer', label: 'メーカー' },
    { key: 'spec', label: '規格' },
    { key: 'unit', label: '単位（vial など）' },
    { key: 'invoicePrice', label: 'インボイス単価', type: 'number', required: true },
    { key: 'purchasePrice', label: '仕入単価', type: 'number' },
    { key: 'purchaseCurrency', label: '仕入通貨（JPY/USD/KRW/EUR）' },
    { key: 'hsCode', label: 'HSコード', required: true },
    { key: 'countryOfOrigin', label: '原産国（英語）', required: true },
    { key: 'weight', label: '重量（kg/個）', type: 'number' },
    { key: 'boxSize', label: '箱サイズ' },
    { key: 'lotNo', label: 'ロット番号' },
    { key: 'expiryDate', label: '使用期限（YYYY-MM-DD）' },
    { key: 'temp', label: '保管温度' },
    { key: 'notes', label: 'メモ', type: 'textarea' },
    { key: 'active', label: '使う（オフで一覧から外す）', type: 'bool' },
  ],
  clinics: [
    { key: 'name', label: 'クリニック名', required: true },
    { key: 'nameEn', label: 'クリニック名（英語）', required: true },
    { key: 'clinicId', label: 'クリニックID（楽楽販売の顧客ID）', hint: '楽楽販売と同じIDにすると自動で結びつきます' },
    { key: 'corporationName', label: '法人名' },
    { key: 'doctorName', label: '院長名' },
    { key: 'doctorNameEn', label: '院長名（英語）', required: true },
    { key: 'contactPerson', label: '担当者' },
    { key: 'contactPersonEn', label: '担当者（英語）' },
    { key: 'zip', label: '郵便番号' },
    { key: 'prefecture', label: '都道府県' },
    { key: 'city', label: '市区町村' },
    { key: 'address', label: '住所' },
    { key: 'building', label: '建物名' },
    { key: 'addressEn', label: 'インボイス用英語住所', required: true, type: 'textarea' },
    { key: 'phone', label: '電話番号', required: true },
    { key: 'email', label: 'メール' },
    { key: 'notes', label: 'メモ', type: 'textarea' },
    { key: 'active', label: '使う（オフで一覧から外す）', type: 'bool' },
  ],
  warehouses: [
    { key: 'name', label: '倉庫名', required: true },
    { key: 'nameEn', label: '倉庫名（英語・発送元に出る）', required: true },
    { key: 'country', label: '国（英語）', required: true },
    { key: 'zip', label: '郵便番号' },
    { key: 'address', label: '住所' },
    { key: 'addressEn', label: '英語住所', required: true, type: 'textarea' },
    { key: 'contactPerson', label: '担当者' },
    { key: 'phone', label: '電話番号', required: true },
    { key: 'email', label: 'メール' },
    { key: 'notes', label: 'メモ', type: 'textarea' },
    { key: 'isDefault', label: '既定の倉庫にする', type: 'bool' },
  ],
};
const MASTER_LABEL: Record<MasterType, string> = { products: '製剤マスタ', clinics: 'クリニック', warehouses: '倉庫' };
const missingOf = (type: MasterType, x: any) => FIELDS[type].filter((f) => f.required && (x[f.key] === undefined || x[f.key] === '' || (f.type === 'number' && !(Number(x[f.key]) > 0)))).map((f) => f.label.replace(/（.*）/, ''));

function EditForm({ type, item, onClose, onSaved }: { type: MasterType; item: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(item ? { ...item } : { active: true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (item) await api(`/api/invoice-admin/masters/${type}/${item.id}`, { method: 'POST', body: JSON.stringify(form) });
      else await api(`/api/invoice-admin/masters/${type}`, { method: 'POST', body: JSON.stringify(form) });
      notifyDone(`${MASTER_LABEL[type]}を保存しました`);
      onSaved();
      onClose();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const miss = missingOf(type, form);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">
            {MASTER_LABEL[type]}を{item ? '編集' : '追加'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
        {miss.length > 0 && <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${TONE.action}`}>インボイスに必要な項目が空です：{miss.join('・')}</div>}
        <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
          {FIELDS[type].map((f) => (
            <label key={f.key} className={`space-y-1 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
              <span className={`font-semibold ${f.required ? 'text-slate-800' : 'text-slate-500'}`}>
                {f.label}
                {f.required && <span className="text-amber-600"> *</span>}
              </span>
              {f.type === 'bool' ? (
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} className="block" />
              ) : f.type === 'textarea' ? (
                <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={2} className="w-full rounded border border-slate-300 px-2 py-1.5" />
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={`w-full rounded border px-2 py-1.5 ${f.required && (form[f.key] === undefined || form[f.key] === '') ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}
                />
              )}
              {f.hint && <span className="block text-[10px] text-slate-400">{f.hint}</span>}
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button disabled={busy} onClick={save} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">
            保存する
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600">
            やめる
          </button>
          <span className="self-center text-[11px] text-slate-500">インボイスアプリにも同じ内容が反映されます。</span>
        </div>
      </div>
    </div>
  );
}

function MasterTab({ type }: { type: MasterType }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<any | null | 'new'>(null);
  const load = useCallback(() => {
    api(`/api/invoice-admin/masters/${type}`)
      .then((j) => setItems(j.items))
      .catch((e) => notifyError(e.message));
  }, [type]);
  useEffect(load, [load]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || [])
      .filter((x) => showInactive || x.active !== false)
      .filter((x) => !onlyMissing || missingOf(type, x).length > 0)
      .filter((x) => !needle || JSON.stringify([x.name, x.nameEn, x.nameJa, x.sku, x.clinicId, x.productId, x.hsCode]).toLowerCase().includes(needle))
      .sort((a, b) => String(a.nameJa || a.name || '').localeCompare(String(b.nameJa || b.name || ''), 'ja'));
  }, [items, q, onlyMissing, showInactive, type]);
  const missingCount = (items || []).filter((x) => x.active !== false && missingOf(type, x).length > 0).length;
  const cols: [string, (x: any) => React.ReactNode][] =
    type === 'products'
      ? [
          ['製剤名', (x) => <><div className="font-semibold">{x.nameJa}</div><div className="text-[10px] text-slate-500">{x.nameEn}</div></>],
          ['SKU', (x) => <span className="font-mono">{x.sku}</span>],
          ['単価', (x) => <span className="font-mono">{x.invoicePrice != null ? Number(x.invoicePrice).toLocaleString() : '—'}</span>],
          ['HS', (x) => <span className="font-mono">{x.hsCode || '—'}</span>],
          ['原産国', (x) => x.countryOfOrigin || '—'],
        ]
      : type === 'clinics'
        ? [
            ['クリニック', (x) => <><div className="font-semibold">{x.name}</div><div className="text-[10px] text-slate-500">{x.nameEn}</div></>],
            ['ID', (x) => <span className="font-mono">{x.clinicId}</span>],
            ['院長（英語）', (x) => x.doctorNameEn || '—'],
            ['電話', (x) => x.phone || '—'],
            ['英語住所', (x) => <span className="line-clamp-2 max-w-72">{x.addressEn || '—'}</span>],
          ]
        : [
            ['倉庫', (x) => <><div className="font-semibold">{x.name}{x.isDefault && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700">既定</span>}</div><div className="text-[10px] text-slate-500">{x.nameEn}</div></>],
            ['国', (x) => x.country || '—'],
            ['電話', (x) => x.phone || '—'],
            ['英語住所', (x) => <span className="line-clamp-2 max-w-72">{x.addressEn || '—'}</span>],
          ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs bg-white border border-slate-200 rounded-xl p-2.5">
        <div className="relative flex-1 min-w-52">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・SKU・ID・HSコード" className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 py-1.5" />
        </div>
        <label className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 font-semibold cursor-pointer ${TONE.action}`}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          インボイスに必要な項目が空のものだけ（{missingCount}）
        </label>
        <label className="inline-flex items-center gap-1.5 text-slate-500">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          使っていないものも表示
        </label>
        <span className="text-slate-500">{shown.length}件</span>
        <button onClick={() => setEdit('new')} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 font-bold">
          <Plus className="w-3.5 h-3.5" />
          追加する
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-auto max-h-[640px]">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              {cols.map(([h]) => (
                <th key={h} className="text-left px-3 py-2">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items === null && (
              <tr>
                <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-slate-400">
                  読み込み中…
                </td>
              </tr>
            )}
            {shown.map((x) => {
              const miss = missingOf(type, x);
              return (
                <tr key={x.id} onClick={() => setEdit(x)} className={`cursor-pointer hover:bg-slate-50 ${x.active === false ? 'opacity-50' : ''}`}>
                  {cols.map(([h, f]) => (
                    <td key={h} className="px-3 py-1.5">
                      {f(x)}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {miss.length > 0 ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${TONE.action}`}>未入力 {miss.length}</span> : <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${TONE.done}`}>OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <EditForm type={type} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

const STATUS_LABEL: Record<string, [string, keyof typeof TONE]> = {
  DRAFT: ['下書き', 'na'],
  WAITING: ['確認待ち', 'action'],
  CONFIRMED: ['発行済み', 'waiting'],
  SHIPPED: ['発送済み', 'done'],
  CANCELLED: ['取消', 'na'],
};

function ShipmentsTab() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    setItems(null);
    api(`/api/invoice-admin/shipments?from=${from}&to=${to}`)
      .then((j) => setItems(j.items))
      .catch((e) => notifyError(e.message));
  }, [from, to]);
  useEffect(load, [load]);
  const shown = (items || []).filter((x) => !q.trim() || `${x.invoiceNo} ${x.clinicName} ${x.items} ${x.trackingNo}`.toLowerCase().includes(q.trim().toLowerCase()));
  const setStatus = async (x: any, status: string) => {
    const prev = x.status;
    try {
      await api(`/api/invoice-admin/shipments/${x.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
      notifyDone(`${x.invoiceNo} を「${STATUS_LABEL[status][0]}」にしました`, async () => {
        await api(`/api/invoice-admin/shipments/${x.id}/status`, { method: 'POST', body: JSON.stringify({ status: prev }) });
        load();
      });
    } catch (e: any) {
      notifyError(e.message);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs bg-white border border-slate-200 rounded-xl p-2.5">
        <span className="text-slate-500">発送日</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        <span>〜</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        <div className="relative flex-1 min-w-52">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="インボイス番号・クリニック・商品・追跡番号" className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 py-1" />
        </div>
        <span className="text-slate-500">{shown.length}件</span>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold">
          <RefreshCw className="w-3.5 h-3.5" />
          読み込み直す
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">インボイス</th>
              <th className="text-left px-3 py-2">クリニック</th>
              <th className="text-left px-3 py-2">商品</th>
              <th className="text-right px-3 py-2">金額</th>
              <th className="text-left px-3 py-2">状態</th>
              <th className="text-left px-3 py-2">PDF</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items === null && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  読み込み中…
                </td>
              </tr>
            )}
            {items && shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  この期間のインボイスはありません
                </td>
              </tr>
            )}
            {shown.map((x) => {
              const [label, tone] = STATUS_LABEL[x.status] || [x.status, 'na'];
              return (
                <tr key={x.id} className={x.status === 'CANCELLED' ? 'opacity-50' : ''}>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="font-mono font-bold text-indigo-700">{x.invoiceNo}</div>
                    <div className="text-[10px] text-slate-400">
                      {x.date}・{x.warehouseName}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-semibold min-w-40">{x.clinicName}</td>
                  <td className="px-3 py-1.5 min-w-48 max-w-96">
                    <span className="line-clamp-2">{x.items}</span>
                    {x.trackingNo && <div className="text-[10px] font-mono text-slate-500">{x.courier} {x.trackingNo}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                    {Number(x.totalInvoiceAmount).toLocaleString()} {x.currency}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={`rounded border px-1.5 py-0.5 font-bold ${TONE[tone as keyof typeof TONE]}`}>{label}</span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <InvoicePdfButtons source={`/api/invoice-admin/shipments/${x.id}`} label={false} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    {x.status === 'CONFIRMED' && (
                      <button onClick={() => setStatus(x, 'SHIPPED')} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 font-bold">
                        発送済みにする
                      </button>
                    )}
                    {x.status !== 'CANCELLED' && (
                      <details className="relative">
                        <summary className="list-none cursor-pointer rounded border border-slate-200 px-2 py-1 text-slate-500">…</summary>
                        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-2 shadow-lg text-left">
                          <button onClick={() => setStatus(x, 'CANCELLED')} className="text-rose-600">
                            このインボイスを取り消す
                          </button>
                        </div>
                      </details>
                    )}
                    </div>
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

/** 出荷依頼を通さずにインボイスを作る（サンプル送付など） */
function CreateTab({ onCreated }: { onCreated: () => void }) {
  const [m, setM] = useState<{ products: any[]; clinics: any[]; warehouses: any[] } | null>(null);
  const [date, setDate] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [clinicQ, setClinicQ] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [rows, setRows] = useState<{ productId: string; qty: string; unitPrice: string }[]>([{ productId: '', qty: '1', unitPrice: '' }]);
  const [courier, setCourier] = useState('DHL Express');
  const [trackingNo, setTrackingNo] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all(['products', 'clinics', 'warehouses'].map((t) => api(`/api/invoice-admin/masters/${t}`)))
      .then(([p, c, w]) => {
        setM({ products: p.items.filter((x: any) => x.active !== false), clinics: c.items.filter((x: any) => x.active !== false), warehouses: w.items });
        setWarehouseId((cur) => cur || w.items.find((x: any) => x.isDefault)?.id || w.items[0]?.id || '');
      })
      .catch((e) => notifyError(e.message));
  }, []);
  if (!m) return <div className="p-6 text-sm text-slate-500">読み込み中…</div>;
  const clinic = m.clinics.find((c) => c.id === clinicId);
  const clinicHits = clinicQ.trim() ? m.clinics.filter((c) => `${c.name} ${c.nameEn} ${c.clinicId}`.toLowerCase().includes(clinicQ.trim().toLowerCase())).slice(0, 8) : [];
  const priced = rows.map((r) => {
    const p = m.products.find((x) => x.id === r.productId);
    const price = r.unitPrice !== '' ? Number(r.unitPrice) : Number(p?.invoicePrice) || 0;
    return { r, p, price, amount: price * (Number(r.qty) || 0) };
  });
  const total = priced.reduce((n, x) => n + x.amount, 0);
  const clinicMiss = clinic ? missingOf('clinics', clinic) : [];
  const ready = clinic && warehouseId && priced.some((x) => x.p && Number(x.r.qty) > 0);
  const issue = async () => {
    if (!confirm('インボイス番号を付けて発行します（発行後は番号を取り消せません）。よろしいですか？')) return;
    setBusy(true);
    try {
      const j = await api('/api/invoice-admin/shipments', {
        method: 'POST',
        body: JSON.stringify({ date, warehouseId, clinicId, courier, trackingNo, notes, items: rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, qty: Number(r.qty), unitPrice: r.unitPrice })) }),
      });
      await downloadInvoicePdf('invoice', j);
      notifyDone(`インボイス ${j.invoiceNo} を発行しました`);
      setRows([{ productId: '', qty: '1', unitPrice: '' }]);
      setTrackingNo('');
      setNotes('');
      onCreated();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-xs max-w-4xl">
      <p className="text-slate-500">サンプル送付など、出荷依頼を通さないインボイスを作ります。倉庫への出荷依頼からのインボイスは「引当・出荷指示」で作ってください。</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="font-semibold">発送日（番号の日付）</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="font-semibold">発送元の倉庫</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5">
            {m.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 relative">
          <span className="font-semibold">届け先のクリニック</span>
          {clinic ? (
            <div className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5">
              <span className="flex-1 truncate">{clinic.name}</span>
              <button onClick={() => setClinicId('')} className="text-slate-400" aria-label="選び直す">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <input value={clinicQ} onChange={(e) => setClinicQ(e.target.value)} placeholder="名前・IDで検索" className="w-full rounded border border-slate-300 px-2 py-1.5" />
              {clinicHits.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto">
                  {clinicHits.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setClinicId(c.id);
                        setClinicQ('');
                      }}
                      className="block w-full text-left px-2 py-1.5 hover:bg-slate-50"
                    >
                      {c.name} <span className="text-slate-400">{c.nameEn}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </label>
      </div>
      {clinic && clinicMiss.length > 0 && <div className={`rounded-lg border px-3 py-2 font-bold ${TONE.action}`}>このクリニックのマスタに未入力があります：{clinicMiss.join('・')}（「クリニック」タブで入力できます）</div>}
      <table className="w-full">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left py-1">製剤</th>
            <th className="text-right py-1 w-20">数量</th>
            <th className="text-right py-1 w-28">単価（空なら標準）</th>
            <th className="text-right py-1 w-28">金額</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {priced.map(({ r, p, price, amount }, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-1.5 pr-2">
                <input
                  list="invoice-products"
                  defaultValue={p ? p.nameJa : ''}
                  onChange={(e) => {
                    const hit = m.products.find((x) => x.nameJa === e.target.value || x.nameEn === e.target.value);
                    setRows(rows.map((x, j) => (j === i ? { ...x, productId: hit?.id || '' } : x)));
                  }}
                  placeholder="製剤名を入れて選ぶ"
                  className={`w-full rounded border px-2 py-1 ${r.productId ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}
                />
                {p && missingOf('products', p).length > 0 && <div className="text-[10px] text-amber-700">未入力：{missingOf('products', p).join('・')}</div>}
              </td>
              <td className="py-1.5 text-right">
                <input type="number" min={1} value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
              </td>
              <td className="py-1.5 text-right">
                <input type="number" value={r.unitPrice} placeholder={p ? String(p.invoicePrice ?? '') : ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} className="w-24 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
              </td>
              <td className="py-1.5 text-right font-mono font-bold">{amount.toLocaleString()}</td>
              <td className="py-1.5 text-right">
                {rows.length > 1 && (
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="削除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="invoice-products">
        {m.products.map((p) => (
          <option key={p.id} value={p.nameJa}>
            {p.nameEn}
          </option>
        ))}
      </datalist>
      <button onClick={() => setRows([...rows, { productId: '', qty: '1', unitPrice: '' }])} className="text-indigo-700 font-bold">
        ＋ 製剤を追加
      </button>
      <div className="grid sm:grid-cols-3 gap-3">
        <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="配送業者" className="rounded border border-slate-300 px-2 py-1.5" />
        <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="追跡番号（あとからでも可）" className="rounded border border-slate-300 px-2 py-1.5 font-mono" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="メモ" className="rounded border border-slate-300 px-2 py-1.5" />
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <span className="font-bold">合計 {total.toLocaleString()}</span>
        <button disabled={!ready || busy} onClick={issue} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-40">
          <FileText className="w-4 h-4" />
          インボイスを発行してPDFを作る
        </button>
        <span className="text-[11px] text-slate-500">発行するとインボイス番号が付き、インボイスアプリの発送データにも入ります（番号は取り消せません）。</span>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [s, setS] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/api/invoice-admin/settings')
      .then((j) => setS(j.settings))
      .catch((e) => notifyError(e.message));
  }, []);
  if (!s) return <div className="p-6 text-sm text-slate-500">読み込み中…</div>;
  const field = (k: string, label: string, textarea = false) => (
    <label className="space-y-1 block">
      <span className="font-semibold text-slate-700">{label}</span>
      {textarea ? (
        <textarea value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} rows={3} className="w-full rounded border border-slate-300 px-2 py-1.5" />
      ) : (
        <input value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5" />
      )}
    </label>
  );
  const image = (k: string, label: string) => (
    <label className="space-y-1 block">
      <span className="font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        {s[k] ? <img src={s[k]} alt="" className="h-12 rounded border border-slate-200 bg-white" /> : <span className="text-slate-400">未設定</span>}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 800_000) return notifyError('画像は800KB以下にしてください');
            const r = new FileReader();
            r.onload = () => setS({ ...s, [k]: String(r.result || '') });
            r.readAsDataURL(f);
          }}
        />
        {s[k] && (
          <button onClick={() => setS({ ...s, [k]: '' })} className="text-rose-600">
            外す
          </button>
        )}
      </div>
    </label>
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs max-w-3xl">
      <div className="grid sm:grid-cols-3 gap-3">
        {field('prefix', 'インボイス番号の頭（INV- など）')}
        {field('currency', '通貨（JPY/USD/KRW/EUR）')}
        {field('weightUnit', '重量の単位')}
      </div>
      {field('termsOfDelivery', '取引条件（Terms of delivery）')}
      {field('reasonForExport', '輸出理由（Reason for export）')}
      {field('declaration', '宣誓文（Declaration）', true)}
      {image('companyLogo', '会社ロゴ')}
      {image('signatureImage', '署名')}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('/api/invoice-admin/settings', { method: 'POST', body: JSON.stringify(s) });
              notifyDone('インボイスの設定を保存しました');
            } catch (e: any) {
              notifyError(e.message);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          保存する
        </button>
        <span className="text-slate-500">インボイスアプリにも同じ設定が反映されます。</span>
      </div>
    </div>
  );
}

export function InvoiceAdmin() {
  const [tab, setTab] = useState<'list' | 'create' | MasterType | 'settings'>('list');
  const [listKey, setListKey] = useState(0);
  const TABS: [typeof tab, string, React.ElementType][] = [
    ['list', 'インボイス一覧', FileText],
    ['create', '新規作成', Plus],
    ['products', '製剤マスタ', Package],
    ['clinics', 'クリニック', Building2],
    ['warehouses', '倉庫', WarehouseIcon],
    ['settings', '設定', Settings],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            インボイス
          </h1>
          <p className="text-xs text-slate-500 mt-1">インボイスの一覧・作成と、インボイスに使うマスタ（製剤・クリニック・倉庫）と設定の編集です。インボイスアプリと同じデータを使っています。</p>
        </div>
        <ColorLegend />
      </div>
      <div className="flex flex-wrap gap-0 border-b-2 border-slate-200">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`-mb-0.5 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === 'list' && <ShipmentsTab key={listKey} />}
      {tab === 'create' && (
        <CreateTab
          onCreated={() => {
            setListKey((k) => k + 1);
            setTab('list');
          }}
        />
      )}
      {(tab === 'products' || tab === 'clinics' || tab === 'warehouses') && <MasterTab key={tab} type={tab} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
