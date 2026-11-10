import { Order, OrderLine } from '../types';
import { isShippingOrFee } from './index';
import { isQuoteOrder } from './salesCalculations';

// 遅れそう予測：まだ納期を過ぎていない明細について、仕入先ごとの「発注から出荷までの実績日数」から
// 出荷の見込み日を出し、最長納品予定日に間に合いそうかを判定する。
// ・見込み（普段）＝ 発注日 ＋ 実績の真ん中の日数（半分はこれより早い）
// ・遅いとき　　　＝ 発注日 ＋ 実績の遅い方から2割の日数（8割はこれより早い）
// ・未発注の明細は「今日発注した場合」で計算する
// 実績は直近1年の出荷済み明細。仕入先の件数が少ない（5件未満）ときは全仕入先の実績を使う。

export type Risk = 'high' | 'watch';
export interface SupplierStat {
  supplier: string;
  n: number; // 実績の明細数
  p50: number; // 普段の日数
  p80: number; // 遅いときの日数
  onTimeRate: number | null; // 納期内に出荷できた割合（0〜1）
  onTimeN: number;
}
export interface ForecastRow {
  order: Order;
  line: OrderLine;
  risk: Risk;
  supplier: string;
  ordered: boolean; // 発注済みか
  startDate: string; // 計算の起点（発注日、未発注なら今日）
  dueDate: string; // 最長納品予定日
  expected: string; // 見込み出荷日（普段）
  late: string; // 遅いときの出荷日
  slack: number; // 納期まで残る日数（見込み日基準。マイナスなら遅れる日数）
  stat: SupplierStat;
  fallback: boolean; // 仕入先の実績が少なく、全体の実績を使った
  overdueInStock: boolean; // 発注してから、いつもの遅いときの日数も過ぎている
}

const DAY = 86400000;
const norm = (d?: string | null) => (d ? d.replace(/\//g, '-').slice(0, 10) : '');
const toTime = (d: string) => new Date(`${d}T00:00:00`).getTime();
const addDays = (d: string, n: number) => {
  const t = new Date(toTime(d) + n * DAY);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const diffDays = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
export const todayYmd = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

const isCountable = (o: Order, l: OrderLine) => !isQuoteOrder(o) && !isShippingOrFee(l.productName, l.productId) && !!l.supplierName;

/** 仕入先ごとの実績（発注→出荷の日数・納期内の割合） */
export function supplierStats(orders: Order[], today = todayYmd()): { bySupplier: Map<string, SupplierStat>; overall: SupplierStat } {
  const from = addDays(today, -365);
  const days = new Map<string, number[]>();
  const onTime = new Map<string, [number, number]>();
  const all: number[] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      if (!isCountable(o, l)) continue;
      const po = norm(l.poDate);
      const sh = norm(l.shippedDate);
      if (!po || !sh || sh < from) continue;
      const d = diffDays(po, sh);
      if (d < 0 || d > 200) continue;
      (days.get(l.supplierName) || days.set(l.supplierName, []).get(l.supplierName)!).push(d);
      all.push(d);
      const due = norm(l.latestDate);
      if (due) {
        const t = onTime.get(l.supplierName) || [0, 0];
        t[0] += sh <= due ? 1 : 0;
        t[1] += 1;
        onTime.set(l.supplierName, t);
      }
    }
  }
  const make = (supplier: string, arr: number[], ot?: [number, number]): SupplierStat => {
    const s = [...arr].sort((a, b) => a - b);
    return { supplier, n: s.length, p50: s.length ? pct(s, 0.5) : 21, p80: s.length ? pct(s, 0.8) : 35, onTimeRate: ot && ot[1] ? ot[0] / ot[1] : null, onTimeN: ot?.[1] || 0 };
  };
  const bySupplier = new Map<string, SupplierStat>();
  for (const [k, v] of days) bySupplier.set(k, make(k, v, onTime.get(k)));
  const totalOt = Array.from(onTime.values()).reduce<[number, number]>((t, x) => [t[0] + x[0], t[1] + x[1]], [0, 0]);
  return { bySupplier, overall: make('全仕入先', all, totalOt) };
}

/** 進行中の受注で、まだ納期を過ぎていない未出荷の明細を判定する */
export function forecastDelays(orders: Order[], today = todayYmd()): { rows: ForecastRow[]; stats: ReturnType<typeof supplierStats> } {
  const stats = supplierStats(orders, today);
  const rows: ForecastRow[] = [];
  for (const o of orders) {
    if (o.orderState !== '進行中') continue;
    for (const l of o.lines) {
      if (!isCountable(o, l)) continue;
      const remaining = l.remainingQty !== undefined ? l.remainingQty : Math.max(0, l.quantity - (l.shippedQty || 0));
      if (remaining <= 0) continue;
      if ((l.allocatedQty || 0) >= remaining) continue; // 在庫で確保済み（すぐ出せる）
      const due = norm(l.latestDate);
      if (!due || due < today) continue; // 納期の無いもの・すでに超過（納期超過の画面で扱う）は除く
      const own = stats.bySupplier.get(l.supplierName);
      const fallback = !own || own.n < 5;
      const stat = fallback ? { ...stats.overall, supplier: l.supplierName, onTimeRate: own?.onTimeRate ?? null, onTimeN: own?.onTimeN || 0 } : own!;
      const po = norm(l.poDate);
      const ordered = !!po;
      const start = ordered ? po : today;
      let expected = addDays(start, stat.p50);
      let late = addDays(start, stat.p80);
      // 発注済みで、いつもの日数を過ぎてもまだ出ていないものは、今日からの残りで見直す
      const overdueInStock = ordered && late < today;
      if (expected < today) expected = addDays(today, Math.max(1, Math.round((stat.p80 - stat.p50) / 2)));
      if (late < today) late = addDays(today, Math.max(2, stat.p80 - stat.p50));
      const slack = diffDays(expected, due);
      const risk: Risk | null = expected > due || overdueInStock ? 'high' : late > due ? 'watch' : null;
      if (!risk) continue;
      rows.push({ order: o, line: l, risk, supplier: l.supplierName, ordered, startDate: start, dueDate: due, expected, late, slack, stat, fallback, overdueInStock });
    }
  }
  rows.sort((a, b) => (a.risk === b.risk ? a.slack - b.slack : a.risk === 'high' ? -1 : 1));
  return { rows, stats };
}
