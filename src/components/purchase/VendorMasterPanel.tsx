import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { api, fmt, VendorAccessPanel, WarehouseId } from '../InventoryView';
import { ErrorNote } from '../flow/Messages';
import { notifyDone, notifyError } from '../flow/UndoToast';
import type { VendorRow } from './PurchaseFlowView';

// 仕入先マスタ：楽楽販売の仕入先（ID・名前・エリア）に、このシステムの項目（既定の行き先・連絡方法など）を足す。
// 既定の行き先は、まだ社内で行き先を選んでいない未入荷の発注にもすぐ当たる。空のままでも発注は止まらない

const DEST_OPTS: { v: string; label: string }[] = [
  { v: '', label: '未定（エリアから推定）' },
  { v: 'korea', label: '韓国倉庫' },
  { v: 'singapore', label: 'シンガポール倉庫' },
  { v: 'domestic', label: '国内倉庫' },
  { v: 'direct', label: 'クリニックへ直送' },
];
type Settings = {
  shipTo: Partial<Record<WarehouseId, { name: string; address: string; attn: string; phone: string }>>;
  sheetFrom: { company: string; address: string; contact: string } | null;
  rkPoSupplierItemId: string;
};

function VendorEditor({ v, onSaved }: { v: VendorRow; onSaved: () => void }) {
  const m = v.master;
  const [f, setF] = useState({
    contactMethod: m?.contactMethod || '',
    contactName: m?.contactName || '',
    contactId: m?.contactId || '',
    language: m?.language || 'en',
    leadDays: m?.leadDays === null || m?.leadDays === undefined ? '' : String(m.leadDays),
    note: m?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/inventory/vendor-master/${encodeURIComponent(v.supplierId)}`, { method: 'POST', body: JSON.stringify(f) });
      notifyDone(`${v.supplierName} を保存しました`);
      onSaved();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm';
  return (
    <div className="grid gap-2 bg-slate-50 p-3 sm:grid-cols-3">
      <label className="text-xs text-slate-600">
        連絡方法
        <select value={f.contactMethod} onChange={(e) => setF({ ...f, contactMethod: e.target.value })} className={`mt-0.5 w-full ${input}`}>
          <option value="">未設定</option>
          <option value="LINE">LINE</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="Email">メール</option>
          <option value="その他">その他</option>
        </select>
      </label>
      <label className="text-xs text-slate-600">
        担当者名
        <input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      <label className="text-xs text-slate-600">
        連絡先（LINE ID・電話・メール）
        <input value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      <label className="text-xs text-slate-600">
        発注書の言語
        <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} className={`mt-0.5 w-full ${input}`}>
          <option value="en">英語</option>
          <option value="ko">韓国語（英語で作成）</option>
          <option value="ja">日本語（英語で作成）</option>
        </select>
      </label>
      <label className="text-xs text-slate-600">
        発注から発送までの目安（日）
        <input type="number" min={0} value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      <label className="text-xs text-slate-600 sm:col-span-3">
        メモ（発注のときの注意など）
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      <div className="sm:col-span-3">
        <button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          <Save className="w-4 h-4" />
          保存
        </button>
        {v.email || v.phone ? <span className="ml-3 text-xs text-slate-500">楽楽販売の連絡先：{[v.email, v.phone].filter(Boolean).join('・')}</span> : null}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const blank = { name: '', address: '', attn: '', phone: '' };
  const [shipTo, setShipTo] = useState<Record<string, typeof blank>>({
    korea: { ...blank, ...(settings.shipTo.korea || {}) },
    singapore: { ...blank, ...(settings.shipTo.singapore || {}) },
    domestic: { ...blank, ...(settings.shipTo.domestic || {}) },
  });
  const [from, setFrom] = useState(settings.sheetFrom || { company: '', address: '', contact: '' });
  const [itemId, setItemId] = useState(settings.rkPoSupplierItemId || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/inventory/settings', { method: 'POST', body: JSON.stringify({ shipTo, sheetFrom: from, rkPoSupplierItemId: itemId }) });
      notifyDone('設定を保存しました');
      onSaved();
    } catch (e: any) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="mb-2 text-sm font-bold text-slate-900">倉庫の送り先（発注書に載ります）</div>
        <div className="grid gap-3 lg:grid-cols-3">
          {(['korea', 'singapore', 'domestic'] as const).map((w) => (
            <div key={w} className="space-y-1.5 rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-700">{{ korea: '韓国倉庫', singapore: 'シンガポール倉庫', domestic: '国内倉庫' }[w]}</div>
              <input placeholder="宛名（英語）" value={shipTo[w].name} onChange={(e) => setShipTo({ ...shipTo, [w]: { ...shipTo[w], name: e.target.value } })} className={input} />
              <textarea placeholder="住所（英語）" rows={2} value={shipTo[w].address} onChange={(e) => setShipTo({ ...shipTo, [w]: { ...shipTo[w], address: e.target.value } })} className={input} />
              <div className="flex gap-1.5">
                <input placeholder="担当者" value={shipTo[w].attn} onChange={(e) => setShipTo({ ...shipTo, [w]: { ...shipTo[w], attn: e.target.value } })} className={input} />
                <input placeholder="電話" value={shipTo[w].phone} onChange={(e) => setShipTo({ ...shipTo, [w]: { ...shipTo[w], phone: e.target.value } })} className={input} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-bold text-slate-900">発注書の発行元</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input placeholder="会社名（英語）" value={from.company} onChange={(e) => setFrom({ ...from, company: e.target.value })} className={input} />
          <input placeholder="住所（英語）" value={from.address} onChange={(e) => setFrom({ ...from, address: e.target.value })} className={input} />
          <input placeholder="連絡先（担当・電話・メール）" value={from.contact} onChange={(e) => setFrom({ ...from, contact: e.target.value })} className={input} />
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-bold text-slate-900">仕入先の変更を楽楽販売に反映する</div>
        <p className="mb-2 text-xs text-slate-600">
          楽楽販売の「管理者設定 → メンテナンス機能 → APIパラメータ情報」で、<b>発注管理</b>の「<b>仕入先ID</b>」の項目ID（数字）を入れてください。入れると、この画面で仕入先を変えたときに楽楽販売の発注管理も書き換えます。空のままなら、このシステムの中だけで変わります。
        </p>
        <input value={itemId} onChange={(e) => setItemId(e.target.value.replace(/\D/g, ''))} placeholder="例：110xxx" className="w-40 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm" />
        <span className={`ml-2 text-xs font-bold ${itemId ? 'text-emerald-700' : 'text-amber-700'}`}>{itemId ? '反映する' : '未設定（楽楽には書きません）'}</span>
      </div>
      <button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        <Save className="w-4 h-4" />
        設定を保存
      </button>
    </div>
  );
}

export function VendorMasterPanel() {
  const [rows, setRows] = useState<VendorRow[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [section, setSection] = useState<'' | 'settings' | 'portal'>('');
  const load = useCallback(() => {
    api('/api/inventory/vendor-master')
      .then((j) => {
        setRows(j.vendors);
        setSettings(j.settings);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const setDest = async (v: VendorRow, dest: string) => {
    try {
      const j = await api(`/api/inventory/vendor-master/${encodeURIComponent(v.supplierId)}`, { method: 'POST', body: JSON.stringify({ defaultDest: dest }) });
      notifyDone(`${v.supplierName} の既定の行き先を「${DEST_OPTS.find((o) => o.v === dest)?.label}」にしました${j.applied ? `（未入荷の発注 ${j.applied}件にも反映）` : ''}`);
      load();
    } catch (e: any) {
      notifyError(e.message);
    }
  };
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((v) => !needle || v.supplierName.toLowerCase().includes(needle) || v.area.toLowerCase().includes(needle));
  const unsetCount = (rows || []).filter((v) => v.counts.open > 0 && !v.master?.defaultDest).length;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        仕入先ごとに<b>既定の行き先</b>（韓国倉庫・シンガポール倉庫・直送）を決めておくと、楽楽で発注した分が自動でその倉庫の入荷予定になります。決めていない仕入先はエリアから推定して「未確定」と表示します。発注は止まらず、あとから変えられます。
        {unsetCount > 0 && <div className="mt-1 font-bold text-amber-700">進行中の発注がある仕入先のうち {unsetCount}社は、既定の行き先がまだ決まっていません。</div>}
      </div>
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="仕入先名・エリア" className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <button onClick={() => setSection(section === 'settings' ? '' : 'settings')} className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${section === 'settings' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          倉庫の送り先・発行元・楽楽への反映
        </button>
        <button onClick={() => setSection(section === 'portal' ? '' : 'portal')} className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${section === 'portal' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          仕入先の画面（URLとパスワード）
        </button>
      </div>
      {section === 'settings' && settings && (
        <div className="rounded-xl border border-indigo-200 bg-white">
          <SettingsPanel settings={settings} onSaved={load} />
        </div>
      )}
      {section === 'portal' && <VendorAccessPanel />}
      {!rows ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="w-6" />
                <th className="px-2 py-2 text-left">仕入先（楽楽販売）</th>
                <th className="px-2 py-2 text-left">既定の行き先</th>
                <th className="px-2 py-2 text-left">連絡</th>
                <th className="px-2 py-2 text-right">発注書 未送付</th>
                <th className="px-2 py-2 text-right">未入荷</th>
                <th className="px-2 py-2 text-left">仕入先の画面</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <React.Fragment key={v.supplierId}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-1 cursor-pointer" onClick={() => setOpen(open === v.supplierId ? null : v.supplierId)}>
                      {open === v.supplierId ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </td>
                    <td className="px-2 py-2 cursor-pointer" onClick={() => setOpen(open === v.supplierId ? null : v.supplierId)}>
                      <div className="font-bold text-slate-900">{v.supplierName}</div>
                      <div className="text-[11px] text-slate-500">
                        {v.area || 'エリア未設定'}・ID {v.supplierId}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <select value={v.master?.defaultDest || ''} onChange={(e) => setDest(v, e.target.value)} className={`rounded-md border px-2 py-1 text-sm font-semibold ${v.master?.defaultDest ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}>
                        {DEST_OPTS.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {v.master?.contactMethod ? (
                        <>
                          <b>{v.master.contactMethod}</b> {v.master.contactName} {v.master.contactId}
                        </>
                      ) : (
                        <span className="text-slate-400">未設定</span>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono font-bold ${v.counts.needSheet ? 'text-amber-700' : 'text-slate-300'}`}>{v.counts.needSheet}</td>
                    <td className={`px-2 py-2 text-right font-mono font-bold ${v.counts.open ? 'text-slate-900' : 'text-slate-300'}`}>{v.counts.open}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">{v.portal.slug ? `発行済み${v.portal.disabled ? '（停止中）' : ''}・最終 ${fmt(v.portal.lastLoginAt)}` : '未発行'}</td>
                  </tr>
                  {open === v.supplierId && (
                    <tr className="border-b border-slate-100">
                      <td colSpan={7}>
                        <VendorEditor v={v} onSaved={load} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
