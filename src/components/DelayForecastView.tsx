import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Search } from 'lucide-react';
import { Order } from '../types';
import { exportToCsv } from '../utils';
import { forecastDelays, ForecastRow, todayYmd } from '../utils/delayForecast';

// 遅れそう（予測）：まだ納期を過ぎていないが、仕入先のいつもの日数で計算すると間に合わない・間に合わないことがある明細。
// 納期を過ぎる前に、仕入先への催促や、お客様への早めの連絡ができるようにする。

const md = (d: string) => d.slice(5).replace('-', '/');
const n = (v: number) => v.toLocaleString('ja-JP');

export function DelayForecastView({ orders, onSelectOrder }: { orders: Order[]; onSelectOrder?: (order: Order, lineKey?: string) => void }) {
  const today = todayYmd();
  const { rows, stats } = useMemo(() => forecastDelays(orders, today), [orders, today]);
  const [risk, setRisk] = useState<'all' | 'high' | 'watch'>('high');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [showStats, setShowStats] = useState(false);

  const high = rows.filter((r) => r.risk === 'high').length;
  const watch = rows.length - high;
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (risk === 'all' || r.risk === risk) &&
        (!supplier || r.supplier === supplier) &&
        (!k || [r.order.orderId, r.order.customerName, r.line.productName, r.supplier, r.order.salesRep].some((v) => (v || '').toLowerCase().includes(k))),
    );
  }, [rows, risk, q, supplier]);

  // 仕入先ごとの今の遅れそう件数
  const bySupplier = useMemo(() => {
    const m = new Map<string, { high: number; watch: number }>();
    for (const r of rows) {
      const e = m.get(r.supplier) || { high: 0, watch: 0 };
      e[r.risk]++;
      m.set(r.supplier, e);
    }
    return m;
  }, [rows]);
  const supplierRows = useMemo(
    () =>
      Array.from(stats.bySupplier.values())
        .filter((s) => s.n >= 5)
        .map((s) => ({ ...s, now: bySupplier.get(s.supplier) || { high: 0, watch: 0 } }))
        .sort((a, b) => b.now.high - a.now.high || b.now.watch - a.now.watch || b.n - a.n),
    [stats, bySupplier],
  );

  const why = (r: ForecastRow) => {
    const base = r.fallback ? `${r.supplier}の実績が少ないため全仕入先の実績` : `${r.supplier}はいつも`;
    const days = `発注から${r.stat.p50}日（遅いと${r.stat.p80}日）で出荷`;
    if (r.overdueInStock) return `発注から${Math.round((Date.parse(today) - Date.parse(r.startDate)) / 86400000)}日たっても未出荷（${base}${days}）`;
    if (!r.ordered) return `未発注。今日発注しても、${base}${days}`;
    return `${base}${days}`;
  };

  const csv = () =>
    exportToCsv(`遅れそう予測_${today.replace(/-/g, '')}.csv`, [
      ['判定', '受注ID', 'クリニック', '担当', '商品', '数量', '仕入先', '発注日', '最長納品予定日', '見込み出荷日', '遅いときの出荷日', '納期までの余裕（日）', '理由'],
      ...shown.map((r) => [
        r.risk === 'high' ? 'このままだと遅れる' : '遅れることがある',
        r.order.orderId,
        r.order.customerName,
        r.order.salesRep,
        r.line.productName,
        r.line.remainingQty ?? r.line.quantity,
        r.supplier,
        r.ordered ? r.startDate : '未発注',
        r.dueDate,
        r.expected,
        r.late,
        r.slack,
        why(r),
      ]),
    ]);

  return (
    <div className="space-y-4 pb-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
            {([
              ['high', `このままだと遅れる ${high}件`, 'bg-rose-600'],
              ['watch', `遅れることがある ${watch}件`, 'bg-amber-500'],
              ['all', `すべて ${rows.length}件`, 'bg-slate-900'],
            ] as const).map(([k, label, on]) => (
              <button key={k} onClick={() => setRisk(k)} className={`px-3 py-1.5 rounded-lg ${risk === k ? `${on} text-white` : 'text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="受注ID・クリニック・商品・担当で探す" className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-60 bg-white" />
          </div>
          {supplier && (
            <button onClick={() => setSupplier('')} className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-800">
              仕入先：{supplier} ✕
            </button>
          )}
          <button onClick={csv} disabled={!shown.length} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />
            CSVで保存
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          まだ納期を過ぎていない未出荷の明細を、仕入先のいつもの日数（直近1年の実績）で計算しています。「このままだと遅れる」は普段の日数でも間に合わないもの、「遅れることがある」は遅いときの日数だと間に合わないものです。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-emerald-700 font-bold">該当する明細はありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200 bg-slate-50">
                  <th className="py-2.5 px-3">受注・クリニック</th>
                  <th className="py-2.5 px-3">商品</th>
                  <th className="py-2.5 px-3">仕入先</th>
                  <th className="py-2.5 px-3">発注日</th>
                  <th className="py-2.5 px-3">納期（最長）</th>
                  <th className="py-2.5 px-3">見込み出荷日</th>
                  <th className="py-2.5 px-3 text-right">余裕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.line.lineKey} className="hover:bg-slate-50 cursor-pointer align-top" onClick={() => onSelectOrder?.(r.order, r.line.lineKey)}>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${r.risk === 'high' ? 'bg-rose-600' : 'bg-amber-400'}`} />
                        <span className="font-mono font-bold text-indigo-700">{r.order.orderId}</span>
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">{r.order.customerName}</div>
                      <div className="text-[11px] text-slate-400">{r.order.salesRep}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{r.line.productName}</div>
                      <div className="text-[11px] text-slate-400">残り {n(r.line.remainingQty ?? r.line.quantity)}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSupplier(r.supplier);
                        }}
                        className="font-semibold text-slate-800 hover:text-indigo-700 hover:underline text-left"
                        title="この仕入先だけを表示"
                      >
                        {r.supplier}
                      </button>
                      <div className="text-[11px] text-slate-400 max-w-[16rem]">{why(r)}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">{r.ordered ? md(r.startDate) : <span className="font-sans font-bold text-amber-700">未発注</span>}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{md(r.dueDate)}</td>
                    <td className="py-2.5 px-3 font-mono">
                      <div className={r.risk === 'high' ? 'font-bold text-rose-600' : 'text-slate-800'}>{md(r.expected)}</div>
                      <div className="text-[11px] text-slate-400">遅いと {md(r.late)}</div>
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono font-black ${r.slack < 0 ? 'text-rose-600' : 'text-amber-700'}`}>{r.slack < 0 ? `${-r.slack}日遅れ` : `${r.slack}日`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 仕入先の実績（押すと開く） */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <button onClick={() => setShowStats(!showStats)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50">
          {showStats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          仕入先の実績（発注から出荷までの日数・納期内の割合）
          <span className="text-xs font-normal text-slate-400">直近1年・{supplierRows.length}社</span>
        </button>
        {showStats && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3">仕入先</th>
                  <th className="py-2 px-3 text-right">普段</th>
                  <th className="py-2 px-3 text-right">遅いとき</th>
                  <th className="py-2 px-3 text-right">納期内に出荷</th>
                  <th className="py-2 px-3 text-right">今の遅れそう</th>
                  <th className="py-2 px-3 text-right">実績の明細数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierRows.map((s) => (
                  <tr key={s.supplier} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSupplier(s.supplier); setRisk('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <td className="py-2 px-3 font-bold text-slate-900">{s.supplier}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.p50}日</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500">{s.p80}日</td>
                    <td className={`py-2 px-3 text-right font-mono font-bold ${s.onTimeRate === null ? 'text-slate-300' : s.onTimeRate >= 0.9 ? 'text-emerald-700' : s.onTimeRate >= 0.7 ? 'text-amber-700' : 'text-rose-600'}`}>
                      {s.onTimeRate === null ? '—' : `${Math.round(s.onTimeRate * 100)}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {s.now.high > 0 && <span className="font-bold text-rose-600">{s.now.high}</span>}
                      {s.now.high > 0 && s.now.watch > 0 && <span className="text-slate-300"> / </span>}
                      {s.now.watch > 0 && <span className="text-amber-700">{s.now.watch}</span>}
                      {!s.now.high && !s.now.watch && <span className="text-slate-300">0</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500">{n(s.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
