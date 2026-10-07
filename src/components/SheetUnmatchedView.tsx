import React, { useEffect, useMemo, useState } from 'react';
import { useUrlState } from '../utils/listState';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Layers, RefreshCw, Search, Truck } from 'lucide-react';
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
  kind: 'single' | 'multiple' | 'none';
  matchedClinicNames: string[];
  bulkGroupKey: string | null;
  noCandidateReason?: string;
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
};

const KIND_CARD_BG: Record<UnmatchedRow['kind'], string> = {
  single: 'bg-emerald-50/60',
  multiple: 'bg-amber-50/60',
  none: 'bg-rose-50/60',
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

export async function fetchSheetUnmatched(refresh = false): Promise<UnmatchedResponse> {
  const res = await fetch(`/api/shipment-sheet/unmatched${refresh ? '?refresh=1' : ''}`);
  return res.json();
}

export const SheetUnmatchedView: React.FC<{ onCountChange?: (count: number | null) => void }> = ({ onCountChange }) => {
  const [data, setData] = useState<UnmatchedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useUrlState<'all' | UnmatchedRow['kind']>('kind', 'all');
  const [view, setView] = useUrlState<'unmatched' | MatchedIssue['issue']>('view', 'unmatched');
  // 対応済みの印（チームで共有）。キーは追跡番号（シートの行が並べ替わっても同じ行を指すように）
  const [doneMarks, setDoneMark] = useSharedNotes<{ by?: string; at: string }>('unmatched_done');
  const [showDone, setShowDone] = useState(false);
  const doneKey = (r: { trackingNo: string }) => (r.trackingNo || '').replace(/\D/g, '');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const json = await fetchSheetUnmatched(refresh);
      setData(json);
      onCountChange?.(json.success ? json.rows?.length ?? 0 : null);
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

        {data?.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={`text-left p-3 rounded-xl border ${kindFilter === 'all' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <span className="text-[11px] font-semibold text-slate-600 block">未照合</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{rows.length}</span>
              <span className="text-[10px] text-slate-500 ml-1">件 ／ 照合済み {data.matchedCount ?? 0}件</span>
            </button>
            {(['single', 'multiple', 'none'] as const).map((k) => (
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

        {data?.success && (
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

      {data?.success && view !== 'unmatched' && (
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

      {data?.success && view === 'unmatched' && rows.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">
            未照合の行はありません（対象 {data.targetCount}件 ／ 照合済み {data.matchedCount}件）
          </p>
        </div>
      )}

      {data?.success && view === 'unmatched' && rows.length > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            対応済みも表示（{rows.filter((r) => doneMarks[doneKey(r)]).length}件）
          </label>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
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
                      {r.matchedClinicNames.length > 0 && (
                        <div className="text-[11px] text-slate-500">顧客マスタ：{r.matchedClinicNames.join('、')}</div>
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
                                  className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1"
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
