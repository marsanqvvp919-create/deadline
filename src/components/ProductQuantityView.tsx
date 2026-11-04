import React, { useMemo, useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Order, OrderLine } from '../types';
import { isShippingOrFee } from '../utils';
import { isQuoteOrder } from '../utils/salesCalculations';
import { getLocalProducts } from '../api';
import { PRODUCT_GENRES } from '../data/productGenres';

// 製剤別の数量：製剤ごとに「まだ届けていない注文（未発注・手配済み）」「未発送」「これまでに売れた数」を並べる。
// 未発送は進行中の受注だけで数える（出荷済み・納品済みで閉じた受注の残りは数えない）。
// ジャンルは商品マスタのカテゴリ。空なら、このシステムで分類したジャンル（data/productGenres.ts）。どちらも無ければ「未分類」。

type Period = 'all' | 'year' | 'this_month' | 'last_month' | '3months';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: '全期間' },
  { id: 'year', label: '今年' },
  { id: '3months', label: '直近3か月' },
  { id: 'this_month', label: '今月' },
  { id: 'last_month', label: '先月' },
];
type SortKey = 'unshipped' | 'unordered' | 'sold' | 'name';
const NO_GENRE = '未分類';

interface Pending {
  order: Order;
  line: OrderLine;
  unordered: number;
  arranged: number;
}
interface Row {
  productId: string;
  productName: string;
  genre: string;
  unordered: number; // 仕入先にまだ発注していない（在庫からの確保もしていない）
  arranged: number; // 発注済み・在庫から確保済みで、まだ出荷していない
  unshipped: number;
  shipped: number; // 期間内の受注のうち出荷した数
  sold: number; // 期間内の受注数
  orderCount: number;
  pending: Pending[];
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periodRange(p: Period): [string, string] | null {
  const t = new Date();
  const y = t.getFullYear();
  const m = t.getMonth();
  if (p === 'year') return [`${y}-01-01`, `${y}-12-31`];
  if (p === 'this_month') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
  if (p === 'last_month') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (p === '3months') return [ymd(new Date(y, m - 2, 1)), ymd(t)];
  return null;
}

const n = (v: number) => v.toLocaleString('ja-JP');

export function ProductQuantityView({
  orders,
  onSelectOrder,
}: {
  orders: Order[];
  onSelectOrder?: (order: Order, lineKey?: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('unshipped');
  const [onlyPending, setOnlyPending] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [genre, setGenre] = useState<string>('all');

  const genreById = useMemo(() => new Map(getLocalProducts().map((p) => [p.productId, (p.category || '').trim()])), [orders]);

  const { rows, firstDate } = useMemo(() => {
    const range = periodRange(period);
    const map = new Map<string, Row & { nameDate: string }>();
    let firstDate = '';
    for (const o of orders) {
      if (isQuoteOrder(o)) continue;
      const date = (o.orderDate || '').replace(/\//g, '-');
      const inPeriod = !range || (!!date && date >= range[0] && date <= range[1]);
      const active = o.orderState === '進行中';
      if (date && (!firstDate || date < firstDate)) firstDate = date;
      for (const l of o.lines) {
        if (isShippingOrFee(l.productName, l.productId)) continue;
        // 出荷済み・納品済みで閉じた受注に残った単価0の明細は再発行の残りなので数えない
        if (!active && l.unitPrice === 0 && l.shippedQty < l.quantity) continue;
        const key = l.productId || l.productName;
        let r = map.get(key);
        if (!r) {
          r = { productId: l.productId, productName: l.productName, genre: genreById.get(l.productId) || PRODUCT_GENRES[l.productId] || NO_GENRE, unordered: 0, arranged: 0, unshipped: 0, shipped: 0, sold: 0, orderCount: 0, pending: [], nameDate: date };
          map.set(key, r);
        }
        // 名前は一番新しい受注のものを使う
        if (date > r.nameDate) {
          r.productName = l.productName;
          r.nameDate = date;
        }
        if (inPeriod) {
          r.sold += l.quantity;
          r.shipped += Math.min(l.quantity, l.shippedQty || 0);
          r.orderCount++;
        }
        if (active) {
          const rem = l.remainingQty !== undefined ? l.remainingQty : Math.max(0, l.quantity - (l.shippedQty || 0));
          if (rem > 0) {
            const unordered = l.stage === '未発注' ? Math.max(0, rem - (l.allocatedQty || 0)) : 0;
            const arranged = rem - unordered;
            r.unordered += unordered;
            r.arranged += arranged;
            r.unshipped += rem;
            r.pending.push({ order: o, line: l, unordered, arranged });
          }
        }
      }
    }
    return { rows: Array.from(map.values()), firstDate };
  }, [orders, period, genreById]);

  // 検索・「未発送があるものだけ」で絞った製剤（ジャンルの絞り込み前）
  const matched = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyPending || r.unshipped > 0) &&
        (r.sold > 0 || r.unshipped > 0) &&
        (!k || r.productName.toLowerCase().includes(k) || r.productId.toLowerCase().includes(k)),
    );
  }, [rows, q, onlyPending]);

  const genres = useMemo(() => {
    const m = new Map<string, { genre: string; count: number; unordered: number; arranged: number; unshipped: number; sold: number }>();
    for (const r of matched) {
      const g = m.get(r.genre) || { genre: r.genre, count: 0, unordered: 0, arranged: 0, unshipped: 0, sold: 0 };
      g.count++;
      g.unordered += r.unordered;
      g.arranged += r.arranged;
      g.unshipped += r.unshipped;
      g.sold += r.sold;
      m.set(r.genre, g);
    }
    // 未分類は最後、ほかは売れた数の多い順
    return Array.from(m.values()).sort((a, b) => Number(a.genre === NO_GENRE) - Number(b.genre === NO_GENRE) || b.sold - a.sold);
  }, [matched]);

  const shown = useMemo(() => {
    const list = matched.filter((r) => genre === 'all' || r.genre === genre);
    const by: Record<SortKey, (a: Row, b: Row) => number> = {
      unshipped: (a, b) => b.unshipped - a.unshipped || b.sold - a.sold,
      unordered: (a, b) => b.unordered - a.unordered || b.unshipped - a.unshipped,
      sold: (a, b) => b.sold - a.sold,
      name: (a, b) => a.productName.localeCompare(b.productName, 'ja'),
    };
    return list.sort(by[sort]);
  }, [matched, genre, sort]);

  const total = useMemo(
    () => shown.reduce((s, r) => ({ unordered: s.unordered + r.unordered, arranged: s.arranged + r.arranged, unshipped: s.unshipped + r.unshipped, sold: s.sold + r.sold }), { unordered: 0, arranged: 0, unshipped: 0, sold: 0 }),
    [shown],
  );

  const periodLabel = period === 'all' ? (firstDate ? `${firstDate.replace(/-/g, '/')} 以降の受注` : '全期間') : PERIODS.find((p) => p.id === period)!.label + 'の受注';

  const Th = ({ k, children, className = '' }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`py-3 px-3 ${className}`}>
      {k ? (
        <button onClick={() => setSort(k)} className={`hover:text-slate-900 ${sort === k ? 'text-slate-900 underline underline-offset-4' : ''}`}>
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div className="space-y-4 pb-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm">
          <Boxes className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">製剤別の数量</h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            製剤ごとに、まだ届けていない注文の数（未発注・手配済み）と、これまでに売れた数を見られます。行を押すと、どのクリニックの注文が残っているかが出ます。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '未発注', sub: '仕入先にまだ発注していない', v: total.unordered, c: 'text-amber-600' },
          { label: '手配済み・未発送', sub: '発注済み・在庫確保済みで出荷待ち', v: total.arranged, c: 'text-sky-600' },
          { label: '未発送の合計', sub: 'まだ出荷していない注文の数', v: total.unshipped, c: 'text-rose-600' },
          { label: '売れた数', sub: periodLabel, v: total.sold, c: 'text-emerald-600' },
        ].map((t) => (
          <div key={t.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="text-xs font-bold text-slate-700">{t.label}</div>
            <div className={`text-2xl font-black mt-1 ${t.c}`}>
              {n(t.v)}
              <span className="text-xs font-bold text-slate-400 ml-1">個</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="製剤名・商品IDで探す"
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg w-56 bg-white"
            />
          </div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-semibold">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={`px-3 py-1.5 ${period === p.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            未発送があるものだけ
          </label>
          <span className="ml-auto text-xs text-slate-500">{shown.length} 製剤・上の数字は表示中の製剤の合計・期間は「売れた数」だけに効きます</span>
        </div>

        {/* ジャンル別：押すとそのジャンルの製剤だけを下に出す */}
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-2">ジャンル別（押すと、そのジャンルの製剤だけを表示）</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            {[{ genre: 'all', count: matched.length, ...genres.reduce((t, g) => ({ unordered: t.unordered + g.unordered, unshipped: t.unshipped + g.unshipped, sold: t.sold + g.sold }), { unordered: 0, unshipped: 0, sold: 0 }) }, ...genres].map((g) => {
              const on = genre === g.genre;
              return (
                <button
                  key={g.genre}
                  onClick={() => setGenre(on && g.genre !== 'all' ? 'all' : g.genre)}
                  className={`text-left rounded-xl border px-3 py-2 transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold truncate">{g.genre === 'all' ? 'すべて' : g.genre}</span>
                    <span className={`text-[11px] shrink-0 ${on ? 'text-slate-300' : 'text-slate-400'}`}>{g.count}製剤</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] font-mono">
                    <span className={on ? 'text-amber-300' : 'text-amber-600'}>未発注 {n(g.unordered)}</span>
                    <span className={on ? 'text-rose-300' : 'text-rose-600'}>未発送 {n(g.unshipped)}</span>
                    <span className={on ? 'text-emerald-300' : 'text-emerald-700'}>売 {n(g.sold)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-600 font-semibold border-b border-slate-200">
                <Th k="name">製剤</Th>
                <Th k="unordered" className="text-right">未発注</Th>
                <Th className="text-right">手配済み・未発送</Th>
                <Th k="unshipped" className="text-right">未発送の合計</Th>
                <Th k="sold" className="text-right">売れた数</Th>
                <Th className="text-right">うち出荷済み</Th>
                <Th className="text-right">注文件数</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const key = r.productId || r.productName;
                const isOpen = open === key;
                return (
                  <React.Fragment key={key}>
                    <tr className={`cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpen(isOpen ? null : key)}>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {r.pending.length > 0 ? (
                            isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{r.productName}</div>
                            <div className="text-[11px] text-slate-400">
                              <span className="font-mono">{r.productId}</span>
                              <span className="ml-2">{r.genre}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${r.unordered ? 'font-bold text-amber-600' : 'text-slate-300'}`}>{n(r.unordered)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${r.arranged ? 'text-sky-700' : 'text-slate-300'}`}>{n(r.arranged)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${r.unshipped ? 'font-black text-rose-600' : 'text-slate-300'}`}>{n(r.unshipped)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{n(r.sold)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{n(r.shipped)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{n(r.orderCount)}</td>
                    </tr>
                    {isOpen && r.pending.length > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-10 pb-3 pt-1">
                          <table className="w-full text-xs bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-200">
                                <th className="py-2 px-3 text-left">受注ID</th>
                                <th className="py-2 px-3 text-left">クリニック</th>
                                <th className="py-2 px-3 text-left">受注日</th>
                                <th className="py-2 px-3 text-left">最長納期</th>
                                <th className="py-2 px-3 text-left">状況</th>
                                <th className="py-2 px-3 text-right">未発注</th>
                                <th className="py-2 px-3 text-right">手配済み</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...r.pending]
                                .sort((a, b) => (a.line.latestDate || '9999').localeCompare(b.line.latestDate || '9999'))
                                .map((p) => (
                                  <tr key={p.line.lineKey + p.order.orderId} className="hover:bg-blue-50/50">
                                    <td className="py-1.5 px-3">
                                      <button onClick={() => onSelectOrder?.(p.order, p.line.lineKey)} className="font-mono text-blue-600 hover:underline">
                                        {p.order.orderId}
                                      </button>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-800">{p.order.customerName}</td>
                                    <td className="py-1.5 px-3 font-mono text-slate-600">{p.order.orderDate || '—'}</td>
                                    <td className="py-1.5 px-3 font-mono text-slate-600">{p.line.latestDate || '—'}</td>
                                    <td className="py-1.5 px-3 text-slate-600">{p.line.stage}</td>
                                    <td className={`py-1.5 px-3 text-right font-mono ${p.unordered ? 'font-bold text-amber-600' : 'text-slate-300'}`}>{n(p.unordered)}</td>
                                    <td className={`py-1.5 px-3 text-right font-mono ${p.arranged ? 'text-sky-700' : 'text-slate-300'}`}>{n(p.arranged)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                    該当する製剤がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
