import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Play, RefreshCw } from 'lucide-react';
import { useUrlState } from '../utils/listState';

// 毎朝6時の「シート → 楽楽販売」取り込みの試運転結果。楽楽販売にはまだ書き込まない。

interface FieldChange {
  shipmentId: string;
  orderId: string;
  customerName: string;
  sheetRow: number;
  field: string;
  from: string;
  to: string;
  rule: '確定' | '仮';
  note?: string;
}

interface HeldValue {
  sheetRow: number;
  shipmentId: string;
  field: string;
  sheetValue: string;
  reason: string;
}

interface HistoryItem {
  runAt: string;
  trigger: 'schedule' | 'manual';
  targetRows?: number;
  matchedRows?: number;
  unmatchedRows?: number;
  shipmentsUpdated?: number;
  changes?: number;
  held?: number;
  failed: number;
  error?: string;
}

interface PreviewResponse {
  success: boolean;
  writeEnabled: boolean;
  latest: null | {
    runAt: string;
    trigger: string;
    rakurakuDataTime?: string;
    targetRows: number;
    matchedRows: number;
    unmatchedRows: number;
    shipmentsUpdated: number;
    changes: FieldChange[];
    held: HeldValue[];
    csvColumns: string[];
    csvRows: string[][];
  };
  history: HistoryItem[];
}

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const SheetImportView: React.FC = () => {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useUrlState<'changes' | 'held' | 'history'>('section', 'changes');
  // 変換ルールは 10/7 にすべて確定したので、項目で絞り込む
  const [fieldFilter, setFieldFilter] = useUrlState<string>('field', 'all');

  const load = () =>
    fetch('/api/sheet-import/preview')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const runNow = async (write = false) => {
    if (
      write &&
      !window.confirm(
        `楽楽販売の出荷管理に書き込みます（インポート設定 100757）。\n差分のある出荷 ${latest?.shipmentsUpdated ?? 0} 件が対象です。実行しますか？`
      )
    )
      return;
    setRunning(true);
    try {
      const res = await fetch(`/api/sheet-import/run${write ? '?write=1' : ''}`, { method: 'POST' });
      setData(await res.json());
    } finally {
      setRunning(false);
    }
  };

  const latest = data?.latest;
  const changes = useMemo(
    () => (latest?.changes || []).filter((c) => fieldFilter === 'all' || c.field === fieldFilter),
    [latest, fieldFilter]
  );
  const lastScheduled = (data?.history || []).filter((h) => h.trigger === 'schedule').slice(0, 2);
  // 失敗した自動実行でも、そのあとの取り込み（手動を含む）が失敗なしで終わっていれば解消済みとみなす
  const history = data?.history || [];
  const resolved = (h: any) => !h.failed || history.slice(0, history.indexOf(h)).some((later: any) => later.mode === 'write' && !later.failed);
  const twoDaysClean = lastScheduled.length === 2 && lastScheduled.every(resolved);
  const unresolvedFailed = history.filter((h: any) => h.failed && !resolved(h)).reduce((a: number, h: any) => a + (h.failed || 0), 0);

  const downloadCsv = () => {
    if (!latest) return;
    const lines = [latest.csvColumns, ...latest.csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `出荷管理_取り込み試運転_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">シート取り込み</h2>
            <p className="text-xs text-slate-500 mt-1">
              毎朝6時に「◆出荷ステータス」を読み、差分のある出荷を出荷管理（インポート設定 100757）に取り込みます。
              {data?.writeEnabled ? (
                <b className="text-slate-700">楽楽販売に書き込みます。</b>
              ) : (
                <b className="text-slate-700">いまは書き込みを止めています（試運転のみ）。</b>
              )}
              元からある項目（出荷番号・出荷状態・明細）と、楽楽販売の「出荷日」は対象外です。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 表示を更新
            </button>
            <button
              type="button"
              onClick={() => runNow(false)}
              disabled={running}
              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> {running ? '実行中…' : '試運転（書き込まない）'}
            </button>
            {data?.writeEnabled && (
              <button
                type="button"
                onClick={() => runNow(true)}
                disabled={running}
                className="px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> 今すぐ取り込む
              </button>
            )}
          </div>
        </div>

        {latest ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600 block">最終同期</span>
              <span className="text-sm font-bold text-slate-900">{fmt(latest.runAt)}</span>
              <span className="text-[10px] text-slate-500 block">楽楽販売データ {fmt(latest.rakurakuDataTime)}</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600 block">更新（予定）</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{latest.shipmentsUpdated}</span>
              <span className="text-[10px] text-slate-500 ml-1">件（{latest.changes.length}項目）</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600 block">未照合</span>
              <span className="text-2xl font-bold font-mono text-slate-900">{latest.unmatchedRows}</span>
              <span className="text-[10px] text-slate-500 ml-1">行 ／ 照合 {latest.matchedRows}行</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600 block">保留（変換できない値）</span>
              <span className="text-2xl font-bold font-mono text-amber-700">{latest.held.length}</span>
              <span className="text-[10px] text-slate-500 ml-1">件</span>
            </div>
            <div className={`p-3 rounded-xl border ${twoDaysClean ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="text-[11px] font-semibold text-slate-600 block">失敗した行（未解消）</span>
              <span className={`text-2xl font-bold font-mono ${unresolvedFailed ? 'text-rose-600' : 'text-slate-900'}`}>{unresolvedFailed}</span>
              <span className="text-[10px] text-slate-500 ml-1">行</span>
              <span className="text-[10px] block text-slate-500">
                {twoDaysClean ? '2日続けて失敗なし' : `自動実行 ${lastScheduled.length}/2日`}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
            まだ試運転の結果がありません。「今すぐ試運転」を押すか、翌朝6時の自動実行をお待ちください。
          </p>
        )}
      </div>

      {latest && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'changes', label: `変わる項目（${latest.changes.length}）` },
              { id: 'held', label: `保留（${latest.held.length}）` },
              { id: 'history', label: `実行の記録（${data?.history.length || 0}）` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${tab === t.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={downloadCsv}
              className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-700 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> 取り込み用CSV（{latest.csvRows.length}行）
            </button>
          </div>

          {tab === 'changes' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-600">項目：</span>
                {['all', ...Array.from(new Set((latest?.changes || []).map((c) => c.field)))].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFieldFilter(f)}
                    className={`px-2 py-1 rounded-lg font-bold ${fieldFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    {f === 'all' ? 'すべて' : f}
                  </button>
                ))}
              </div>
              <div className="data-table-wrap overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3">出荷ID</th>
                      <th className="py-2 px-3">クリニック</th>
                      <th className="py-2 px-3">項目</th>
                      <th className="py-2 px-3">いまの楽楽販売</th>
                      <th className="py-2 px-3">取り込み後</th>
                      <th className="py-2 px-3">補足</th>
                      <th className="py-2 px-3">シート行</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {changes.slice(0, 1000).map((c, i) => (
                      <tr key={`${c.shipmentId}-${c.field}-${i}`}>
                        <td className="py-2 px-3 font-mono font-bold">{c.shipmentId}</td>
                        <td className="py-2 px-3">{c.customerName}</td>
                        <td className="py-2 px-3 font-bold">{c.field}</td>
                        <td className="py-2 px-3 text-slate-500">{c.from || '（空欄）'}</td>
                        <td className="py-2 px-3 font-bold text-blue-700">{c.to}</td>
                        <td className="py-2 px-3 text-slate-500">{c.note || ''}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{c.sheetRow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'held' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <p className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">
                シートの値が楽楽販売の選択肢に当てはまらないため、取り込まない値です。変換のしかたを決めていただければルールに加えます。
              </p>
              <div className="data-table-wrap overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3">出荷ID</th>
                      <th className="py-2 px-3">項目</th>
                      <th className="py-2 px-3">シートの値</th>
                      <th className="py-2 px-3">理由</th>
                      <th className="py-2 px-3">シート行</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latest.held.slice(0, 1000).map((h, i) => (
                      <tr key={`${h.shipmentId}-${h.field}-${i}`}>
                        <td className="py-2 px-3 font-mono font-bold">{h.shipmentId}</td>
                        <td className="py-2 px-3 font-bold">{h.field}</td>
                        <td className="py-2 px-3 text-amber-800">{h.sheetValue}</td>
                        <td className="py-2 px-3 text-slate-600">{h.reason}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{h.sheetRow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-3">実行日時</th>
                    <th className="py-2 px-3">種類</th>
                    <th className="py-2 px-3">更新</th>
                    <th className="py-2 px-3">未照合</th>
                    <th className="py-2 px-3">保留</th>
                    <th className="py-2 px-3">結果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.history || []).map((h, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3">{fmt(h.runAt)}</td>
                      <td className="py-2 px-3">
                        {h.trigger === 'schedule' ? '毎朝の自動実行' : '手動'}
                        {(h as any).mode === 'write' ? '（書き込み）' : '（試運転）'}
                      </td>
                      <td className="py-2 px-3">{h.failed ? '—' : `${h.shipmentsUpdated}件（${h.changes}項目）`}</td>
                      <td className="py-2 px-3">{h.failed ? '—' : h.unmatchedRows}</td>
                      <td className="py-2 px-3">{h.failed ? '—' : h.held}</td>
                      <td className="py-2 px-3">
                        {h.error ? (
                          <span className="text-rose-700 font-bold">失敗：{h.error}</span>
                        ) : (h as any).writeResult?.error ? (
                          <span className="text-rose-700 font-bold">取り込み失敗：{(h as any).writeResult.error}</span>
                        ) : (h as any).writeResult ? (
                          <span className={h.failed ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                            取り込み {(h as any).writeResult.status}：成功 {(h as any).writeResult.succeedCount}件・失敗 {(h as any).writeResult.failureCount}件
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold">成功（試運転）</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
