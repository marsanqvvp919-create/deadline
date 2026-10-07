import { Order, OrderLine, PaymentStatus } from '../types';

export const SYSTEM_TODAY_STR = '2026-09-24';

export interface QuoteExpirationInfo {
  isQuote: boolean;
  quoteDate: string | null;
  quoteValidUntil: string | null;
  daysDiff: number; // 正: 期日超過日数, 負: 期日まで残り日数, 0: 本日期限
  isExpiredOverWeek: boolean; // 見積期日を2週間(14日)超経過したか（計算除外判定）
  statusLabel: '確定受注' | '有効見積' | '期日超過(猶予1週間以内)' | '期日超過(猶予2週間以内)' | '見積期日1週間超(計算対象外)' | '見積期日2週間超(無効・計算対象外)';
  badgeColor: string;
}

export interface BillingReceivableInfo {
  isBilled: boolean;
  billingDate: string | null;
  totalAmount: number;
  unpaidBalance: number; // 請求残（未回収金額）
  paymentStatus: PaymentStatus;
  paymentDueDate: string | null;
  paymentMethod: string;
  isPaid: boolean;
  isOverdue: boolean; // 支払期日を過ぎた請求残
  daysOverdue: number; // 支払期日超過日数
  statusLabel: '入金完了' | '期日内 請求残' | '支払期日超過(要督促)' | '未請求';
  badgeColor: string;
}

/**
 * 伝票が見積伝票（商談・見積中）であるかの判定
 */
export function isQuoteOrder(order: Order): boolean {
  if (order.isQuote !== undefined) return order.isQuote;
  const status = (order.status || '').toLowerCase();
  return (
    status.includes('見積') ||
    status.includes('商談') ||
    status.includes('提案') ||
    status.includes('draft') ||
    status.includes('quote')
  );
}

/**
 * 見積伝票の有効期日と「2週間超過」判定
 * 要件: 見積もり作成後2週間以内に請求書（受注）になっていないものは無効扱いとし計算・データに反映しない
 */
export function getQuoteExpirationInfo(
  order: Order,
  todayStr: string = SYSTEM_TODAY_STR
): QuoteExpirationInfo {
  const isQuote = isQuoteOrder(order);

  if (!isQuote) {
    return {
      isQuote: false,
      quoteDate: null,
      quoteValidUntil: null,
      daysDiff: 0,
      isExpiredOverWeek: false,
      statusLabel: '確定受注',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  const quoteDate = order.quoteDate || order.orderDate || null;
  let quoteValidUntil = order.quoteValidUntil || null;

  // quoteValidUntil が未設定の場合、見積提出日 + 2週間(14日) を標準有効期間として設定
  if (!quoteValidUntil && quoteDate) {
    const qD = new Date(quoteDate + 'T00:00:00+09:00');
    if (!isNaN(qD.getTime())) {
      qD.setDate(qD.getDate() + 14);
      quoteValidUntil = qD.toISOString().slice(0, 10);
    }
  }

  if (!quoteValidUntil) {
    return {
      isQuote: true,
      quoteDate,
      quoteValidUntil: null,
      daysDiff: 0,
      isExpiredOverWeek: false,
      statusLabel: '有効見積',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    };
  }

  const today = new Date(todayStr + 'T00:00:00+09:00');
  const validUntilDate = new Date(quoteValidUntil + 'T00:00:00+09:00');
  const diffMs = today.getTime() - validUntilDate.getTime();
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // 2週間（14日）を超えて経過した場合は無効（計算対象外）
  const isExpiredOverWeek = daysDiff > 14;

  let statusLabel: QuoteExpirationInfo['statusLabel'] = '有効見積';
  let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';

  if (isExpiredOverWeek) {
    statusLabel = '見積期日2週間超(無効・計算対象外)';
    badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
  } else if (daysDiff > 0) {
    statusLabel = '期日超過(猶予2週間以内)';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300 font-medium';
  } else {
    statusLabel = '有効見積';
    badgeColor = 'bg-sky-50 text-sky-700 border-sky-200';
  }

  return {
    isQuote: true,
    quoteDate,
    quoteValidUntil,
    daysDiff,
    isExpiredOverWeek,
    statusLabel,
    badgeColor,
  };
}

/**
 * 計算対象から除外すべき伝票かの判定
 * 【要件1】見積もり期日を１週間すぎたものは計算に入れない
 */
export function isOrderExcludedFromCalculations(
  order: Order,
  todayStr: string = SYSTEM_TODAY_STR
): boolean {
  const quoteInfo = getQuoteExpirationInfo(order, todayStr);
  return quoteInfo.isExpiredOverWeek;
}

/**
 * 請求・売掛・請求残高の算出
 * 【要件2】請求から入金になっていない取引の金額も請求残としてわかるようにする
 */
export function getBillingReceivableInfo(
  order: Order,
  todayStr: string = SYSTEM_TODAY_STR
): BillingReceivableInfo {
  const totalAmount =
    order.totalAmount ||
    order.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

  const paymentStatus = order.paymentStatus || '入金済';
  const isPaid = paymentStatus === '入金済';

  // 請求が行われたか判定（明示的な請求日があるか、または納品・出荷・受注が確定しているもの）
  const isBilled =
    order.billingStatus === '請求済' ||
    order.billingStatus === '一部入金' ||
    order.billingStatus === '入金済' ||
    order.billingDate !== null ||
    order.orderState === '納品完了' ||
    order.orderState === '全明細出荷済' ||
    order.status === '受注確定' ||
    order.status.includes('出荷') ||
    order.status.includes('納品') ||
    order.status.includes('請求');

  const billingDate =
    order.billingDate ||
    (isBilled ? (order.deliveredDate || order.orderDate || null) : null);

  // 請求残高（未回収額）: 入金済なら0、それ以外は全額（一部入金対応可能）
  const unpaidBalance = isPaid ? 0 : totalAmount;

  // 支払期日・期日超過判定
  const paymentDueDate = order.paymentDueDate || null;
  let isOverdue = false;
  let daysOverdue = 0;

  if (!isPaid && paymentDueDate) {
    const today = new Date(todayStr + 'T00:00:00+09:00');
    const dueDate = new Date(paymentDueDate + 'T00:00:00+09:00');
    if (!isNaN(dueDate.getTime())) {
      const diffMs = today.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        isOverdue = true;
        daysOverdue = diffDays;
      }
    }
  }

  let statusLabel: BillingReceivableInfo['statusLabel'] = '未請求';
  let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200';

  if (isPaid) {
    statusLabel = '入金完了';
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (isOverdue) {
    statusLabel = '支払期日超過(要督促)';
    badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
  } else if (isBilled) {
    statusLabel = '期日内 請求残';
    badgeColor = 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
  }

  return {
    isBilled,
    billingDate,
    totalAmount,
    unpaidBalance,
    paymentStatus,
    paymentDueDate,
    paymentMethod: order.paymentMethod || '未設定',
    isPaid,
    isOverdue,
    daysOverdue,
    statusLabel,
    badgeColor,
  };
}

export interface SalesRepSalesMetric {
  repName: string;
  clinicCount: number;
  confirmedSales: number;     // 確定売上（出荷・納品完了）
  orderBacklog: number;       // 受注残（手配中）
  pipelineQuotes: number;     // 有効見積（期日1週間以内）
  totalSalesVolume: number;   // 確定売上 + 受注残
  receivableTotal: number;    // 請求残高合計
  withinDueReceivable: number;// 期日内請求残
  overdueReceivable: number;  // 支払期日超過請求残
  collectedAmount: number;    // 回収完了金額
  collectionRate: number;     // 入金回収率 %
  targetSales: number;        // 月間目標売上 (例: 500万円)
  targetAchievementRate: number; // 目標達成率 %
  unassignedClinicsCount: number;
}

export interface ClinicSalesMetric {
  clinicName: string;
  salesRep: string;
  confirmedSales: number;
  orderBacklog: number;
  activeQuotes: number;
  totalOrders: number;
  receivableBalance: number;
  isOverdueReceivable: boolean;
  maxDaysOverdue: number;
  paymentMethod: string;
  latestOrderDate: string;
  sharePercent?: number;
}

export interface ComprehensiveSalesMetrics {
  // 全体集計（※見積期日1週間超は完全除外）
  validOrdersCount: number;
  confirmedSales: number;         // ① 確定売上（出荷・納品完了）
  orderBacklog: number;           // ② 受注残（確定受注で出荷待ち）
  pipelineQuotes: number;         // ③ 有効見積額（商談中パイプライン）
  totalSalesProspect: number;     // 確定売上 + 受注残 + 有効見積
  effectiveContractTotal: number; // 確定売上 + 受注残（契約成立済）

  // 請求・売掛・入金集計
  totalBilledAmount: number;      // 請求総額
  totalReceivableBalance: number; // 請求残高（未回収額の総合計）
  withinDueReceivable: number;    // うち支払期日内 請求残
  overdueReceivable: number;      // うち支払期日超過 請求残
  collectedAmount: number;        // 回収済金額
  collectionRate: number;         // 全社回収率 %

  // 見積期日超過（1週間超・除外管理）
  excludedQuoteCount: number;
  excludedQuoteAmount: number;
  excludedQuotes: Order[];
  validQuotes: Order[];

  // 担当営業別集計
  repMetrics: SalesRepSalesMetric[];

  // クリニック別売上ランキング
  clinicRanking: ClinicSalesMetric[];

  // 月別売上推移データ
  monthlyTrends: Array<{
    month: string;
    confirmedSales: number;
    receivableBalance: number;
    collectedAmount: number;
  }>;
}

/**
 * 包括的な売上・請求・見積集計を算出
 * 見積期日1週間超過は厳格に除外し、請求残高を細分化
 */
export function calculateComprehensiveSalesMetrics(
  orders: Order[],
  todayStr: string = SYSTEM_TODAY_STR,
  monthlySalesTargetPerRep: number = 5000000
): ComprehensiveSalesMetrics {
  let confirmedSales = 0;
  let orderBacklog = 0;
  let pipelineQuotes = 0;
  let totalBilledAmount = 0;
  let totalReceivableBalance = 0;
  let withinDueReceivable = 0;
  let overdueReceivable = 0;
  let collectedAmount = 0;

  const excludedQuotes: Order[] = [];
  const validOrders: Order[] = [];

  // 1. 各伝票の判定 & 計算除外フィルタリング
  orders.forEach((ord) => {
    const isExcluded = isOrderExcludedFromCalculations(ord, todayStr);
    if (isExcluded) {
      excludedQuotes.push(ord);
      return;
    }

    validOrders.push(ord);

    const isQuote = isQuoteOrder(ord);
    const amount =
      ord.totalAmount ||
      ord.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

    // 売上フェーズ別集計
    if (isQuote) {
      pipelineQuotes += amount;
    } else if (ord.orderState === '納品完了' || ord.orderState === '全明細出荷済') {
      confirmedSales += amount;
    } else {
      orderBacklog += amount;
    }

    // 請求・売掛集計（見積以外で請求対象のもの）
    if (!isQuote) {
      const rec = getBillingReceivableInfo(ord, todayStr);
      totalBilledAmount += rec.totalAmount;
      if (rec.isPaid) {
        collectedAmount += rec.totalAmount;
      } else {
        totalReceivableBalance += rec.unpaidBalance;
        if (rec.isOverdue) {
          overdueReceivable += rec.unpaidBalance;
        } else {
          withinDueReceivable += rec.unpaidBalance;
        }
      }
    }
  });

  const excludedQuoteAmount = excludedQuotes.reduce(
    (sum, o) =>
      sum +
      (o.totalAmount ||
        o.lines.reduce((s, l) => s + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0)),
    0
  );

  const totalSalesProspect = confirmedSales + orderBacklog + pipelineQuotes;
  const effectiveContractTotal = confirmedSales + orderBacklog;
  const collectionRate =
    totalBilledAmount > 0
      ? Math.round((collectedAmount / totalBilledAmount) * 1000) / 10
      : 100;

  // 2. 営業担当者別の集計
  const repMap = new Map<string, SalesRepSalesMetric>();

  validOrders.forEach((ord) => {
    const rep = ord.salesRep || '未割当';
    if (!repMap.has(rep)) {
      repMap.set(rep, {
        repName: rep,
        clinicCount: 0,
        confirmedSales: 0,
        orderBacklog: 0,
        pipelineQuotes: 0,
        totalSalesVolume: 0,
        receivableTotal: 0,
        withinDueReceivable: 0,
        overdueReceivable: 0,
        collectedAmount: 0,
        collectionRate: 100,
        targetSales: monthlySalesTargetPerRep,
        targetAchievementRate: 0,
        unassignedClinicsCount: 0,
      });
    }

    const metric = repMap.get(rep)!;
    const isQuote = isQuoteOrder(ord);
    const amount =
      ord.totalAmount ||
      ord.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

    if (isQuote) {
      metric.pipelineQuotes += amount;
    } else if (ord.orderState === '納品完了' || ord.orderState === '全明細出荷済') {
      metric.confirmedSales += amount;
    } else {
      metric.orderBacklog += amount;
    }

    metric.totalSalesVolume = metric.confirmedSales + metric.orderBacklog;

    if (!isQuote) {
      const rec = getBillingReceivableInfo(ord, todayStr);
      if (rec.isPaid) {
        metric.collectedAmount += rec.totalAmount;
      } else {
        metric.receivableTotal += rec.unpaidBalance;
        if (rec.isOverdue) {
          metric.overdueReceivable += rec.unpaidBalance;
        } else {
          metric.withinDueReceivable += rec.unpaidBalance;
        }
      }
    }
  });

  // クリニック数のカウント
  const repClinicSets = new Map<string, Set<string>>();
  validOrders.forEach((o) => {
    const rep = o.salesRep || '未割当';
    if (!repClinicSets.has(rep)) repClinicSets.set(rep, new Set());
    if (o.customerName) repClinicSets.get(rep)!.add(o.customerName);
  });

  repMap.forEach((m, rep) => {
    m.clinicCount = repClinicSets.get(rep)?.size || 0;
    const billed = m.collectedAmount + m.receivableTotal;
    m.collectionRate = billed > 0 ? Math.round((m.collectedAmount / billed) * 1000) / 10 : 100;
    m.targetAchievementRate =
      m.targetSales > 0 ? Math.round((m.totalSalesVolume / m.targetSales) * 1000) / 10 : 0;
  });

  const repMetrics = Array.from(repMap.values()).sort(
    (a, b) => b.totalSalesVolume - a.totalSalesVolume
  );

  // 3. クリニック別の売上ランキング
  const clinicMap = new Map<string, ClinicSalesMetric>();
  validOrders.forEach((ord) => {
    const cName = ord.customerName || '未指定クリニック';
    if (!clinicMap.has(cName)) {
      clinicMap.set(cName, {
        clinicName: cName,
        salesRep: ord.salesRep || '未割当',
        confirmedSales: 0,
        orderBacklog: 0,
        activeQuotes: 0,
        totalOrders: 0,
        receivableBalance: 0,
        isOverdueReceivable: false,
        maxDaysOverdue: 0,
        paymentMethod: ord.paymentMethod || '未設定',
        latestOrderDate: ord.orderDate || '',
      });
    }

    const cMetric = clinicMap.get(cName)!;
    cMetric.totalOrders++;
    const isQuote = isQuoteOrder(ord);
    const amount =
      ord.totalAmount ||
      ord.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

    if (isQuote) {
      cMetric.activeQuotes += amount;
    } else if (ord.orderState === '納品完了' || ord.orderState === '全明細出荷済') {
      cMetric.confirmedSales += amount;
    } else {
      cMetric.orderBacklog += amount;
    }

    if (!isQuote) {
      const rec = getBillingReceivableInfo(ord, todayStr);
      if (!rec.isPaid) {
        cMetric.receivableBalance += rec.unpaidBalance;
        if (rec.isOverdue) {
          cMetric.isOverdueReceivable = true;
          if (rec.daysOverdue > cMetric.maxDaysOverdue) {
            cMetric.maxDaysOverdue = rec.daysOverdue;
          }
        }
      }
    }

    if (ord.orderDate && ord.orderDate > cMetric.latestOrderDate) {
      cMetric.latestOrderDate = ord.orderDate;
    }
  });

  const clinicRanking = Array.from(clinicMap.values())
    .map((c) => ({
      ...c,
      sharePercent:
        effectiveContractTotal > 0
          ? Math.round(((c.confirmedSales + c.orderBacklog) / effectiveContractTotal) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => (b.confirmedSales + b.orderBacklog) - (a.confirmedSales + a.orderBacklog));

  // 4. 月別推移（受注日・納品日ベース）
  const monthlyMap = new Map<
    string,
    { month: string; confirmedSales: number; receivableBalance: number; collectedAmount: number }
  >();

  // 直近4ヶ月の枠組み
  const months = ['2026-06', '2026-07', '2026-08', '2026-09'];
  months.forEach((m) => {
    monthlyMap.set(m, { month: m, confirmedSales: 0, receivableBalance: 0, collectedAmount: 0 });
  });

  validOrders.forEach((ord) => {
    const isQuote = isQuoteOrder(ord);
    if (isQuote) return;

    const dateKey = (ord.deliveredDate || ord.orderDate || '').slice(0, 7);
    if (!dateKey) return;

    if (!monthlyMap.has(dateKey)) {
      monthlyMap.set(dateKey, {
        month: dateKey,
        confirmedSales: 0,
        receivableBalance: 0,
        collectedAmount: 0,
      });
    }

    const item = monthlyMap.get(dateKey)!;
    const amount =
      ord.totalAmount ||
      ord.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

    if (ord.orderState === '納品完了' || ord.orderState === '全明細出荷済') {
      item.confirmedSales += amount;
    }

    const rec = getBillingReceivableInfo(ord, todayStr);
    if (rec.isPaid) {
      item.collectedAmount += rec.totalAmount;
    } else {
      item.receivableBalance += rec.unpaidBalance;
    }
  });

  const monthlyTrends = Array.from(monthlyMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  const validQuotes = validOrders.filter((ord) => isQuoteOrder(ord));

  return {
    validOrdersCount: validOrders.length,
    confirmedSales,
    orderBacklog,
    pipelineQuotes,
    totalSalesProspect,
    effectiveContractTotal,
    totalBilledAmount,
    totalReceivableBalance,
    withinDueReceivable,
    overdueReceivable,
    collectedAmount,
    collectionRate,
    excludedQuoteCount: excludedQuotes.length,
    excludedQuoteAmount,
    excludedQuotes,
    validQuotes,
    repMetrics,
    clinicRanking,
    monthlyTrends,
  };
}

/**
 * 納期超過（遅延）のカウント対象とするかの判定
 * 【要件】
 * - 見積もりでのカウントはしない（isQuoteOrderが真の場合は除外）
 * - 後払いのクリニック以外は入金済みのものをカウントする（paymentStatusが '入金済' または '売掛・締日決済' のみ対象）
 */
export function isEligibleForOverdue(order: Order): boolean {
  if (isQuoteOrder(order)) return false;
  const payStatus = order.paymentStatus || '入金済';
  if (payStatus === '入金済' || payStatus === '売掛・締日決済') {
    return true;
  }
  return false;
}
