import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderLine, PaymentStatus } from '../types';
import { formatDate, getRemainingDaysInfo, getOrderBorderColor, buildRakurakuUrl, openRakurakuWithCopiedId, isShippingOrFee, parseYmd, startOfToday, todayYmd } from '../utils';
import { getConfiguredUrls } from '../api';
import { isQuoteOrder } from '../utils/salesCalculations';
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Package,
  Calendar,
  Search,
  Filter,
  Download,
  Mail,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  FileSpreadsheet,
  ArrowUpDown,
  Sparkles,
  Info,
  BadgeAlert,
  Send,
  X,
  CreditCard,
  User
} from 'lucide-react';

interface ProcurementViewProps {
  orders: Order[];
  searchQuery?: string;
  onSelectOrderLine: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string) => void;
  onDataUpdated?: () => void;
}

type ProcurementFilter =
  | 'paid_unordered'     // 入金済・未発注（要即発注）
  | 'aging_alert'        // 滞留アラート（入金後2日以上経過）
  | 'all_unordered'      // 全未発注（入金待ち含む）
  | 'waiting_payment'    // 入金待ち
  | 'credit_cleared'     // 売掛・締日決済
  | 'recently_ordered';  // 直近発注済

type ViewMode = 'by_supplier' | 'by_order' | 'all_lines';

interface FlatProcurementItem {
  line: OrderLine;
  parentOrder: Order;
  orderId: string;
  customerName: string;
  salesRep: string;
  orderDate: string;
  paymentStatus: PaymentStatus;
  paymentDate: string | null;
  paymentMethod?: string;
  daysSincePayment: number | null;
  isAgingAlert: boolean;
}

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  orders,
  searchQuery: globalSearchQuery = '',
  onSelectOrderLine,
  onOpenClinicStatus,
  onDataUpdated,
}) => {
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const todayStr = todayYmd();
  const today = startOfToday();

  // UI States
  const [activeFilter, setActiveFilter] = useState<ProcurementFilter>('paid_unordered');
  const [viewMode, setViewMode] = useState<ViewMode>('by_supplier');
  // 画面上部の検索語もこの検索欄に出す（以前は上部の検索で絞り込まれても欄が空のままで、0件の理由がわからなかった）
  const [localSearch, setLocalSearch] = useState<string>(globalSearchQuery);
  useEffect(() => {
    setLocalSearch(globalSearchQuery);
  }, [globalSearchQuery]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedLineKeys, setSelectedLineKeys] = useState<Set<string>>(new Set());

  // Modal States
  const [isPoModalOpen, setIsPoModalOpen] = useState<boolean>(false);
  const [poTargetSupplier, setPoTargetSupplier] = useState<string>('');
  const [poMessage, setPoMessage] = useState<string>('');
  const [copiedToast, setCopiedToast] = useState<boolean>(false);
  const [isCompletingModalOpen, setIsCompletingModalOpen] = useState<boolean>(false);

  // Notification Toast
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // 1. 全明細をフラット化して入金・滞留情報を計算
  const flatItems: FlatProcurementItem[] = useMemo(() => {
    const list: FlatProcurementItem[] = [];

    orders.forEach((ord) => {
      // 見積もりステータスのものは発注管理に含めない
      if (isQuoteOrder(ord)) return;

      const payStatus = ord.paymentStatus;
      // 入金日は楽楽販売の値だけ（受注日で代用しない）
      const payDate = ord.paymentDate || null;

      let daysSincePay: number | null = null;
      let isAging = false;

      if (payDate) {
        const pDate = parseYmd(payDate);
        if (pDate) {
          const diffMs = today.getTime() - pDate.getTime();
          daysSincePay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          // 入金後2日以上経過して未発注なら滞留アラート
          if (daysSincePay >= 2) {
            isAging = true;
          }
        }
      }

      ord.lines.forEach((l) => {
        // 発注管理の対象外: 送料・手数料等は除外
        if (isShippingOrFee(l.productName, l.productId)) {
          return;
        }

        list.push({
          line: l,
          parentOrder: ord,
          orderId: ord.orderId,
          customerName: ord.customerName,
          salesRep: ord.salesRep,
          orderDate: ord.orderDate,
          paymentStatus: payStatus,
          paymentDate: payDate,
          paymentMethod: ord.paymentMethod,
          daysSincePayment: daysSincePay,
          isAgingAlert: isAging && l.stage === '未発注',
        });
      });
    });

    return list;
  }, [orders]);

  // 2. 統計KPIサマリーの計算
  const stats = useMemo(() => {
    const paidUnordered = flatItems.filter(
      (it) => it.line.stage === '未発注' && it.paymentStatus === '入金済'
    );
    const agingAlerts = flatItems.filter(
      (it) => it.line.stage === '未発注' && it.isAgingAlert
    );
    const waitingPayment = flatItems.filter(
      (it) => it.line.stage === '未発注' && it.paymentStatus === '入金待ち'
    );
    const creditCleared = flatItems.filter(
      (it) => it.line.stage === '未発注' && it.paymentStatus === '売掛・締日決済'
    );
    const allUnordered = flatItems.filter((it) => it.line.stage === '未発注');

    // 直近7日以内発注
    const recentlyOrdered = flatItems.filter((it) => {
      if (it.line.stage !== '発注済・入荷待ち' || !it.line.poDate) return false;
      const d = parseYmd(it.line.poDate);
      if (!d) return false;
      return (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 7;
    });

    // 入金済未発注の合計金額および数量
    const paidUnorderedAmount = paidUnordered.reduce(
      (sum, it) => sum + (it.line.lineAmount || (it.line.unitPrice || 0) * it.line.quantity),
      0
    );
    const paidUnorderedQty = paidUnordered.reduce((sum, it) => sum + it.line.quantity, 0);

    // 仕入先セット
    // 仕入先が未設定の明細は発注先がないので数えない
    const supplierSet = new Set(paidUnordered.map((it) => it.line.supplierName).filter(Boolean));

    return {
      paidUnorderedCount: paidUnordered.length,
      paidUnorderedOrdersCount: new Set(paidUnordered.map((it) => it.orderId)).size,
      paidUnorderedQty,
      paidUnorderedAmount,
      agingAlertsCount: agingAlerts.length,
      waitingPaymentCount: waitingPayment.length,
      creditClearedCount: creditCleared.length,
      allUnorderedCount: allUnordered.length,
      recentlyOrderedCount: recentlyOrdered.length,
      supplierCount: supplierSet.size,
    };
  }, [flatItems]);

  // 3. フィルタリング
  const filteredItems = useMemo(() => {
    const q = localSearch.trim().toLowerCase();

    return flatItems.filter((it) => {
      // フィルタ種別
      if (activeFilter === 'paid_unordered') {
        if (it.line.stage !== '未発注' || it.paymentStatus !== '入金済') return false;
      } else if (activeFilter === 'aging_alert') {
        if (it.line.stage !== '未発注' || !it.isAgingAlert) return false;
      } else if (activeFilter === 'all_unordered') {
        if (it.line.stage !== '未発注') return false;
      } else if (activeFilter === 'waiting_payment') {
        if (it.line.stage !== '未発注' || it.paymentStatus !== '入金待ち') return false;
      } else if (activeFilter === 'credit_cleared') {
        if (it.line.stage !== '未発注' || it.paymentStatus !== '売掛・締日決済') return false;
      } else if (activeFilter === 'recently_ordered') {
        if (it.line.stage !== '発注済・入荷待ち') return false;
      }

      // 仕入先フィルター
      if (selectedSupplier !== 'all') {
        if (it.line.supplierName !== selectedSupplier) return false;
      }

      // 検索クエリ
      if (q) {
        const target = `${it.orderId} ${it.customerName} ${it.line.productName} ${it.line.supplierName} ${it.salesRep}`.toLowerCase();
        if (!target.includes(q)) return false;
      }

      return true;
    });
  }, [flatItems, activeFilter, selectedSupplier, localSearch, globalSearchQuery]);

  // 全仕入先リストの抽出
  const allSuppliers = useMemo(() => {
    const set = new Set<string>();
    flatItems.forEach((it) => {
      if (it.line.supplierName) set.add(it.line.supplierName);
    });
    return Array.from(set).sort();
  }, [flatItems]);

  // 4. 仕入先別にグルーピング
  const groupedBySupplier = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        items: FlatProcurementItem[];
        totalQty: number;
        totalAmount: number;
        hasAgingAlert: boolean;
        earliestReqDate: string | null;
      }
    >();

    filteredItems.forEach((it) => {
      const sName = it.line.supplierName || '仕入先未設定';
      if (!map.has(sName)) {
        map.set(sName, {
          supplierName: sName,
          items: [],
          totalQty: 0,
          totalAmount: 0,
          hasAgingAlert: false,
          earliestReqDate: null,
        });
      }

      const entry = map.get(sName)!;
      entry.items.push(it);
      entry.totalQty += it.line.quantity;
      entry.totalAmount += it.line.lineAmount || (it.line.unitPrice || 0) * it.line.quantity;
      if (it.isAgingAlert) entry.hasAgingAlert = true;

      if (it.parentOrder.requestedDate) {
        if (!entry.earliestReqDate || it.parentOrder.requestedDate < entry.earliestReqDate) {
          entry.earliestReqDate = it.parentOrder.requestedDate;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filteredItems]);

  // 5. 受注伝票別にグルーピング
  const groupedByOrder = useMemo(() => {
    const map = new Map<
      string,
      {
        order: Order;
        items: FlatProcurementItem[];
        hasAgingAlert: boolean;
        totalQty: number;
      }
    >();

    filteredItems.forEach((it) => {
      const ordId = it.orderId;
      if (!map.has(ordId)) {
        map.set(ordId, {
          order: it.parentOrder,
          items: [],
          hasAgingAlert: false,
          totalQty: 0,
        });
      }

      const entry = map.get(ordId)!;
      entry.items.push(it);
      entry.totalQty += it.line.quantity;
      if (it.isAgingAlert) entry.hasAgingAlert = true;
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.order.orderDate).getTime() - new Date(a.order.orderDate).getTime()
    );
  }, [filteredItems]);

  // 6. チェックボックス操作
  const toggleSelectLine = (lineKey: string) => {
    setSelectedLineKeys((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey);
      else next.add(lineKey);
      return next;
    });
  };

  const selectAllLines = () => {
    if (selectedLineKeys.size === filteredItems.length) {
      setSelectedLineKeys(new Set());
    } else {
      setSelectedLineKeys(new Set(filteredItems.map((it) => it.line.lineKey)));
    }
  };

  // 7. 発注済みに更新（単一・一括）
  // 発注の登録は楽楽販売で行う。受注IDをコピーして楽楽販売を開く
  // （以前はこの画面で「発注済」にしても、このブラウザの表示が変わるだけで楽楽販売には反映されなかった）
  const openCompleteModal = (lines: OrderLine[]) => {
    const orderIds = Array.from(new Set(lines.map((l) => l.lineKey.split('_')[0]).filter(Boolean)));
    openRakurakuWithCopiedId(rakurakuBaseUrl, orderIds.join(' '));
    showNotice(`受注ID ${orderIds.join('、')} をコピーしました。楽楽販売で発注を登録してください`);
  };

  // 9. 仕入先宛 発注依頼メール/FAX文面の自動生成
  const handleGeneratePoEmail = (supplierName: string, itemsToInclude: FlatProcurementItem[]) => {
    setPoTargetSupplier(supplierName);
    const linesForSupplier = itemsToInclude.filter((it) => it.line.supplierName === supplierName);

    const firstItem = linesForSupplier[0];
    const customer = firstItem?.customerName || '';
    const orderId = firstItem?.orderId || '';

    const linesText = linesForSupplier
      .map(
        (it, idx) =>
          `[${idx + 1}] 商品コード: ${it.line.productId}\n` +
          `    品名: ${it.line.productName}\n` +
          `    発注数量: ${it.line.quantity} 点\n` +
          `    納品先: ${it.customerName} 様\n` +
          `    受注伝票番号: ${it.orderId}\n` +
          `    希望納期: ${formatDate(it.parentOrder.requestedDate || it.line.latestDate)}`
      )
      .join('\n\n');

    const draft = `件名: 【発注書】商品手配のご依頼（医療法人・クリニック様向け / ${orderId}）

${supplierName}
仕入・ご発注受付担当者様

いつも大変お世話になっております。
納期管理システム（発注管理部門）より、下記商品の発注手配をお願い申し上げます。

本案件はクリニック様からのご入金が確認できておりますので、
最短納期でのご手配・出荷対応をいただけますよう何卒よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 発注内容明細 (計 ${linesForSupplier.length} 品目 / 合計 ${linesForSupplier.reduce((s, it) => s + it.line.quantity, 0)} 点)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${linesText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 納期・送り状番号ご連絡のお願い
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
出荷日が確定いたしましたら、出荷日および配送送り状番号（追跡番号）のご連絡を賜れますようお願い申し上げます。

何卒よろしくお願い申し上げます。
発注担当 / 納期管理センター`;

    setPoMessage(draft);
    setIsPoModalOpen(true);
    setCopiedToast(false);
  };

  // 10. CSVエクスポート
  const handleExportCsv = () => {
    const headers = [
      '受注ID',
      '受注日',
      '顧客名(クリニック)',
      '担当営業',
      '入金ステータス',
      '入金日',
      '仕入先名',
      '商品コード',
      '商品名',
      '発注数量',
      'ステージ',
      '希望納期',
      '最短納品予定日',
      '最長納品予定日',
      '滞留日数(入金後)',
    ];

    const rows = filteredItems.map((it) => [
      it.orderId,
      it.orderDate,
      it.customerName,
      it.salesRep,
      it.paymentStatus,
      it.paymentDate || '',
      it.line.supplierName,
      it.line.productId,
      it.line.productName,
      it.line.quantity,
      it.line.stage,
      it.parentOrder.requestedDate || '',
      it.line.earliestDate || '',
      it.line.latestDate || '',
      it.daysSincePayment !== null ? `${it.daysSincePayment}日` : '-',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `未発注_入金済管理一覧_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotice(`CSVファイルをダウンロードしました (${filteredItems.length}件)`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {actionNotice && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{actionNotice}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              発注管理（入金済み未発注）
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              入金確認済・要即時発注
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              ※ 送料・手数料除外
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            クリニックよりご入金確認が取れ、仕入先への発注手配が可能な未発注案件を管理します。滞留を防ぎ最短納期を実現します。
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-2 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>発注指示CSVエクスポート</span>
          </button>

          {selectedLineKeys.size > 0 && (
            <button
              onClick={() => {
                const selectedLines = flatItems
                  .filter((it) => selectedLineKeys.has(it.line.lineKey))
                  .map((it) => it.line);
                openCompleteModal(selectedLines);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer animate-in fade-in"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>選択 {selectedLineKeys.size} 件を楽楽販売で発注登録</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 入金済・未発注 */}
        <div
          onClick={() => setActiveFilter('paid_unordered')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs relative overflow-hidden ${
            activeFilter === 'paid_unordered'
              ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-amber-600" />
              入金済・未発注（要発注）
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              最優先
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-950 font-mono">
              {stats.paidUnorderedCount}
            </span>
            <span className="text-xs font-semibold text-amber-800">
              明細 ({stats.paidUnorderedOrdersCount}伝票 / {stats.paidUnorderedQty}点)
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-amber-800">
            <span>発注対象金額:</span>
            <b className="font-mono">¥{stats.paidUnorderedAmount.toLocaleString()}</b>
          </div>
        </div>

        {/* Card 2: 滞留アラート（入金後2日以上） */}
        <div
          onClick={() => setActiveFilter('aging_alert')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'aging_alert'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
              : 'bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              滞留アラート（入金後2日超）
            </span>
            {stats.agingAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                要確認
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono">
              {stats.agingAlertsCount}
            </span>
            <span className="text-xs font-semibold text-rose-800">明細が滞留中</span>
          </div>
          <p className="mt-2 pt-2 border-t border-rose-200/60 text-[11px] text-rose-700">
            入金から発注が停滞し納期遅延のリスクあり
          </p>
        </div>

        {/* Card 3: 入金待ち（保留案件） */}
        <div
          onClick={() => setActiveFilter('waiting_payment')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'waiting_payment'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300'
              : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              入金待ち・保留
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
              確認後発注
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-900 font-mono">
              {stats.waitingPaymentCount}
            </span>
            <span className="text-xs font-semibold text-blue-700">明細が保留中</span>
          </div>
          <p className="mt-2 pt-2 border-t border-blue-200/60 text-[11px] text-blue-700">
            クリニックからの入金連絡を確認次第手配
          </p>
        </div>

        {/* Card 4: 仕入先数 */}
        <div
          onClick={() => {
            setActiveFilter('all_unordered');
            setViewMode('by_supplier');
          }}
          className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              発注対象仕入先
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              仕入先別
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
              {stats.supplierCount}
            </span>
            <span className="text-xs font-semibold text-slate-600">社へ発注指示可能</span>
          </div>
          <p className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
            全未発注: {stats.allUnorderedCount}明細 / 直近発注: {stats.recentlyOrderedCount}明細
          </p>
        </div>
      </div>

      {/* Filter and View Mode Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1 lg:pb-0 text-xs">
            <button
              onClick={() => setActiveFilter('paid_unordered')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'paid_unordered'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>入金済の未発注（要手配）</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeFilter === 'paid_unordered' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {stats.paidUnorderedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('aging_alert')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'aging_alert'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>滞留アラート (2日以上)</span>
              {stats.agingAlertsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-200 text-rose-900 font-bold">
                  {stats.agingAlertsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('all_unordered')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'all_unordered'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>すべての未発注</span>
              <span className="font-mono text-[10px]">({stats.allUnorderedCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('waiting_payment')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'waiting_payment'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>入金待ち</span>
              <span className="font-mono text-[10px]">({stats.waitingPaymentCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('credit_cleared')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'credit_cleared'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>売掛・締日決済</span>
              <span className="font-mono text-[10px]">({stats.creditClearedCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('recently_ordered')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'recently_ordered'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>直近発注済</span>
              <span className="font-mono text-[10px]">({stats.recentlyOrderedCount})</span>
            </button>
          </div>

          {/* View Mode Switching Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start shrink-0 text-xs">
            <button
              onClick={() => setViewMode('by_supplier')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'by_supplier'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-amber-500" />
              <span>仕入先別まとめ</span>
            </button>

            <button
              onClick={() => setViewMode('by_order')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'by_order'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-blue-500" />
              <span>受注伝票別</span>
            </button>

            <button
              onClick={() => setViewMode('all_lines')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'all_lines'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
              <span>商品一覧表</span>
            </button>
          </div>
        </div>

        {/* Search & Supplier Dropdown Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input autoComplete="off"
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="商品名、クリニック名、受注ID、仕入先名でリアルタイム検索..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-900 text-xs"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-slate-500 shrink-0 font-medium">仕入先:</span>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              <option value="all">すべての仕入先 ({allSuppliers.length}社)</option>
              {allSuppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="text-slate-500 text-[11px] shrink-0">
            該当件数: <b className="text-slate-900 font-mono text-xs">{filteredItems.length}</b> 明細
          </div>
        </div>
      </div>

      {/* 絞り込み中の表示（どの表示形式でも出す） */}
      {(localSearch.trim() || selectedSupplier !== 'all') && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          <span>
            絞り込み中：{localSearch.trim() && `検索「${localSearch.trim()}」`}
            {selectedSupplier !== 'all' && ` 仕入先「${selectedSupplier}」`}（{filteredItems.length}明細を表示）
          </span>
          <button
            type="button"
            onClick={() => {
              setLocalSearch('');
              setSelectedSupplier('all');
            }}
            className="underline text-blue-700"
          >
            解除
          </button>
        </div>
      )}

      {/* VIEW 1: 仕入先別まとめ（発注書一括モード） */}
      {viewMode === 'by_supplier' && (
        <div className="space-y-5">
          {groupedBySupplier.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                該当する未発注商品はありません
              </h3>
              <p className="text-xs text-slate-500">
                {localSearch.trim() || selectedSupplier !== 'all'
                  ? `検索「${localSearch.trim() || '—'}」${selectedSupplier !== 'all' ? `・仕入先「${selectedSupplier}」` : ''}で絞り込んでいるため、表示が0件です。`
                  : '選択中のフィルター条件を満たす発注待ち商品は現在0件です。'}
              </p>
              {(localSearch.trim() || selectedSupplier !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    setSelectedSupplier('all');
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                >
                  絞り込みを解除
                </button>
              )}
            </div>
          ) : (
            groupedBySupplier.map((group) => {
              const supplierItems = group.items;
              const allSelected = supplierItems.every((it) => selectedLineKeys.has(it.line.lineKey));

              return (
                <div
                  key={group.supplierName}
                  className={`bg-white rounded-2xl border shadow-2xs overflow-hidden transition-all ${
                    group.hasAgingAlert ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                  }`}
                >
                  {/* Supplier Card Header */}
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shadow-2xs">
                        <Building2 className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-slate-900">
                            {group.supplierName}
                          </h2>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 font-mono">
                            未発注 {supplierItems.length} 明細 / 計 {group.totalQty} 点
                          </span>
                          {group.hasAgingAlert && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              滞留品あり
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                          <span>
                            発注対象金額: <b className="text-slate-800 font-mono">¥{group.totalAmount.toLocaleString()}</b>
                          </span>
                          {group.earliestReqDate && (
                            <span>
                              最短希望納期: <b className="text-amber-800 font-mono">{formatDate(group.earliestReqDate)}</b>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions for Supplier（仕入先が未設定のときは、宛先がないので操作を出さない） */}
                    {group.supplierName === '仕入先未設定' ? (
                      <p className="text-xs text-slate-500 self-start md:self-auto max-w-xs">
                        楽楽販売で商品の仕入先を入力すると、発注メールと発注登録が使えるようになります。
                      </p>
                    ) : (
                    <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                      <button
                        onClick={() => handleGeneratePoEmail(group.supplierName, supplierItems)}
                        className="px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Mail className="w-3.5 h-3.5 text-amber-700" />
                        <span>発注メール文面作成</span>
                      </button>

                      <button
                        onClick={() => openCompleteModal(supplierItems.map((it) => it.line))}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>この仕入先の分を楽楽販売で発注登録</span>
                      </button>
                    </div>
                    )}
                  </div>

                  {/* Supplier Lines Table */}
                  <div className="data-table-wrap overflow-x-auto">
                    <table className="tbl-proc w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
                          <th className="py-2.5 px-3.5 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => {
                                const next = new Set(selectedLineKeys);
                                if (allSelected) {
                                  supplierItems.forEach((it) => next.delete(it.line.lineKey));
                                } else {
                                  supplierItems.forEach((it) => next.add(it.line.lineKey));
                                }
                                setSelectedLineKeys(next);
                              }}
                              className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 px-3">入金状況</th>
                          <th className="py-2.5 px-3">受注ID</th>
                          <th className="py-2.5 px-3">取引先クリニック</th>
                          <th className="py-2.5 px-3">商品コード・商品名</th>
                          <th className="py-2.5 px-3 text-right">発注数量</th>
                          <th className="py-2.5 px-3 text-right">販売単価 / 金額</th>
                          <th className="py-2.5 px-3">希望納期 / 最短・最長</th>
                          <th className="py-2.5 px-3 text-center">発注処理</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {supplierItems.map((it, idx) => {
                          const isSelected = selectedLineKeys.has(it.line.lineKey);
                          const rakurakuUrl = buildRakurakuUrl(rakurakuBaseUrl, it.orderId);
                          const remaining = getRemainingDaysInfo(it.parentOrder.requestedDate || it.line.latestDate);

                          return (
                            <tr
                              key={`${it.line.lineKey}_${idx}`}
                              className={`hover:bg-amber-50/40 transition ${
                                isSelected ? 'bg-amber-50/70' : it.isAgingAlert ? 'bg-rose-50/20' : ''
                              }`}
                            >
                              <td className="py-3 px-3.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectLine(it.line.lineKey)}
                                  className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                />
                              </td>

                              {/* 入金状況 */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="space-y-1">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                      it.paymentStatus === '入金済'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : it.paymentStatus === '売掛・締日決済'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    {it.paymentStatus}
                                  </span>

                                  {it.paymentDate && (
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      入金: {formatDate(it.paymentDate)}
                                    </div>
                                  )}

                                  {it.daysSincePayment !== null && (
                                    <div
                                      className={`text-[10px] font-bold ${
                                        it.isAgingAlert ? 'text-rose-600' : 'text-slate-500'
                                      }`}
                                    >
                                      {it.daysSincePayment === 0
                                        ? '本日入金'
                                        : `${it.daysSincePayment}日前入金`}
                                      {it.isAgingAlert && ' ⚠️'}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 受注ID */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => onSelectOrderLine(it.parentOrder, it.line.lineKey)}
                                    className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                  >
                                    {it.orderId}
                                  </button>
                                  {rakurakuUrl && (
                                    <a
                                      href={rakurakuUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="楽楽販売で開く"
                                      className="text-slate-400 hover:text-indigo-600"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  受注: {formatDate(it.orderDate)}
                                </span>
                              </td>

                              {/* 取引先クリニック */}
                              <td className="py-3 px-3">
                                <button
                                  onClick={() => onOpenClinicStatus && onOpenClinicStatus(it.customerName)}
                                  className="font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer text-left line-clamp-1"
                                >
                                  {it.customerName}
                                </button>
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  <User className="w-2.5 h-2.5" />
                                  担当: {it.salesRep}
                                </span>
                              </td>

                              {/* 商品コード・商品名 */}
                              <td className="py-3 px-3 max-w-xs">
                                <span className="font-mono text-[10px] text-slate-400 block">
                                  {it.line.productId}
                                </span>
                                <span className="font-semibold text-slate-900 block line-clamp-2">
                                  {it.line.productName}
                                </span>
                              </td>

                              {/* 数量 */}
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <span className="text-sm font-extrabold font-mono text-slate-900">
                                  {it.line.quantity}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-1">点</span>
                              </td>

                              {/* 金額 */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                                {it.line.lineAmount ? (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      ¥{it.line.lineAmount.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      @¥{(it.line.unitPrice || 0).toLocaleString()}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* 納期情報 */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="space-y-0.5">
                                  {it.parentOrder.requestedDate ? (
                                    <div className="font-bold text-slate-800">
                                      希望: {formatDate(it.parentOrder.requestedDate)}
                                    </div>
                                  ) : (
                                    <div className="text-slate-400 text-[11px]">希望日未定</div>
                                  )}

                                  <div className="text-[10px] text-slate-500 font-mono">
                                    最長: {formatDate(it.line.latestDate)}
                                  </div>

                                  <span
                                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      remaining.isOverdue
                                        ? 'bg-rose-100 text-rose-700'
                                        : remaining.isUrgent
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {remaining.text}
                                  </span>
                                </div>
                              </td>

                              {/* アクション */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => openCompleteModal([it.line])}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                                    title="受注IDをコピーして楽楽販売を開きます"
                                  >
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>発注登録</span>
                                  </button>

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
            })
          )}
        </div>
      )}

      {/* VIEW 2: 受注伝票別まとめ */}
      {viewMode === 'by_order' && (
        <div className="space-y-4">
          {groupedByOrder.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                該当する受注伝票はありません
              </h3>
            </div>
          ) : (
            groupedByOrder.map(({ order, items, hasAgingAlert, totalQty }) => {
              const rakurakuUrl = buildRakurakuUrl(rakurakuBaseUrl, order.orderId);
              const payStatus = order.paymentStatus || '入金済';

              return (
                <div
                  key={order.orderId}
                  className={`bg-white rounded-2xl border shadow-2xs overflow-hidden transition-all ${
                    hasAgingAlert ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                  }`}
                >
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-indigo-700">
                          {order.orderId}
                        </span>
                        {rakurakuUrl && (
                          <a
                            href={rakurakuUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-indigo-600"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <button
                        onClick={() => onOpenClinicStatus && onOpenClinicStatus(order.customerName)}
                        className="font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        {order.customerName}
                      </button>

                      <span className="text-xs text-slate-500 font-mono">
                        受注日: {formatDate(order.orderDate)}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          payStatus === '入金済'
                            ? 'bg-emerald-100 text-emerald-800'
                            : payStatus === '売掛・締日決済'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {payStatus}
                        {order.paymentDate ? ` (${formatDate(order.paymentDate)})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-600">
                        未発注: <b className="font-mono text-slate-900">{items.length}</b> 明細 ({totalQty}点)
                      </span>
                      <button
                        onClick={() => openCompleteModal(items.map((it) => it.line))}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>この伝票を楽楽販売で発注登録</span>
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <div
                        key={`${it.line.lineKey}_${idx}`}
                        className="p-3.5 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[11px]">
                              {it.line.supplierName}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {it.line.productName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-3 font-mono">
                            <span>コード: {it.line.productId}</span>
                            <span>数量: <b>{it.line.quantity}</b>点</span>
                            {it.line.lineAmount && (
                              <span>金額: ¥{it.line.lineAmount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <div className="text-right text-[11px]">
                            <span className="text-slate-400 block font-mono">
                              最長納期: {formatDate(it.line.latestDate)}
                            </span>
                            {it.parentOrder.requestedDate && (
                              <span className="text-slate-700 font-bold block">
                                希望: {formatDate(it.parentOrder.requestedDate)}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => openCompleteModal([it.line])}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs transition cursor-pointer"
                          >
                            発注済
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 3: 商品一覧表（高密度フラットテーブル） */}
      {viewMode === 'all_lines' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="data-table-wrap overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="py-3 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredItems.length > 0 &&
                        filteredItems.every((it) => selectedLineKeys.has(it.line.lineKey))
                      }
                      onChange={selectAllLines}
                      className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">入金状況</th>
                  <th className="py-3 px-3">受注ID</th>
                  <th className="py-3 px-3">取引先クリニック</th>
                  <th className="py-3 px-3">仕入先</th>
                  <th className="py-3 px-3">商品コード・商品名</th>
                  <th className="py-3 px-3 text-right">数量</th>
                  <th className="py-3 px-3 text-right">金額</th>
                  <th className="py-3 px-3">希望納期 / 最長</th>
                  <th className="py-3 px-3">担当営業</th>
                  <th className="py-3 px-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredItems.map((it, idx) => {
                  const isSelected = selectedLineKeys.has(it.line.lineKey);

                  return (
                    <tr
                      key={`${it.line.lineKey}_${idx}`}
                      className={`hover:bg-slate-50 transition ${
                        isSelected ? 'bg-amber-50/70' : it.isAgingAlert ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLine(it.line.lineKey)}
                          className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            it.paymentStatus === '入金済'
                              ? 'bg-emerald-100 text-emerald-800'
                              : it.paymentStatus === '売掛・締日決済'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {it.paymentStatus}
                        </span>
                        {it.daysSincePayment !== null && (
                          <span
                            className={`block text-[10px] font-mono mt-0.5 ${
                              it.isAgingAlert ? 'text-rose-600 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {it.daysSincePayment}日経過
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-indigo-600">
                        <button
                          onClick={() => onSelectOrderLine(it.parentOrder, it.line.lineKey)}
                          className="hover:underline cursor-pointer"
                        >
                          {it.orderId}
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <button
                          onClick={() => onOpenClinicStatus && onOpenClinicStatus(it.customerName)}
                          className="font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer text-left line-clamp-1"
                        >
                          {it.customerName}
                        </button>
                      </td>

                      <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                        {it.line.supplierName}
                      </td>

                      <td className="py-3 px-3 max-w-xs">
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {it.line.productId}
                        </span>
                        <span className="font-semibold text-slate-900 block truncate">
                          {it.line.productName}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {it.line.quantity}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ¥{(it.line.lineAmount || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono">
                        <span className="block font-bold text-slate-800">
                          {formatDate(it.parentOrder.requestedDate || it.line.latestDate)}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                        {it.salesRep}
                      </td>

                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => openCompleteModal([it.line])}
                          className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs transition cursor-pointer"
                        >
                          発注済
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: 仕入先宛 発注指示メール/FAX文面自動生成モーダル */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {poTargetSupplier} 宛て 発注依頼文面
                </h3>
              </div>
              <button
                onClick={() => setIsPoModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              入金確認済みの発注内容と納品先クリニック情報を自動で組み込んだ発注文面です。仕入先へのメール送信や発注書にご活用ください。
            </p>

            <textarea
              value={poMessage}
              onChange={(e) => setPoMessage(e.target.value)}
              rows={12}
              className="w-full p-3.5 rounded-xl border border-slate-300 bg-slate-50 font-mono text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 leading-relaxed"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                クリップボードにコピーしてメーラーへ貼り付けて送信できます
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPoModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  閉じる
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(poMessage);
                    setCopiedToast(true);
                    setTimeout(() => setCopiedToast(false), 3000);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition"
                >
                  {copiedToast ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>コピー完了！</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>文面をコピー</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: 発注完了登録ダイアログ */}
    </div>
  );
};
