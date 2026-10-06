import React, { useState, useMemo } from 'react';
import { Order, OrderLine, ViewTab, ClinicItem } from '../types';
import { formatDate, getRemainingDaysInfo, getOrderBorderColor, buildRakurakuUrl, isShippingOrFee } from '../utils';
import { getConfiguredUrls, getLocalClinics } from '../api';
import {
  Building2,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Download,
  Mail,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  Layers,
  Calendar,
  Truck,
  Copy,
  Check,
  X,
  Send,
  Eye,
  ArrowRight,
  TrendingDown
} from 'lucide-react';

interface UnshippedClinicsViewProps {
  orders: Order[];
  searchQuery?: string;
  onSelectOrderLine: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string) => void;
  onNavigateToTab?: (tab: ViewTab) => void;
}

type ClinicFilter = 'all' | 'has_overdue' | 'has_unordered' | 'waiting_arrival' | 'severe';

interface UnshippedLineInfo {
  line: OrderLine;
  parentOrder: Order;
  isOverdue: boolean;
  isUrgent: boolean;
  daysRemaining: number | null;
}

interface UnshippedClinicGroup {
  clinicName: string;
  clinicId?: string;
  salesRep: string;
  phone?: string;
  email?: string;
  address?: string;
  orders: Order[];
  lines: UnshippedLineInfo[];
  totalOrdersCount: number;
  totalUnshippedLinesCount: number;
  totalUnshippedQty: number;
  hasOverdue: boolean;
  maxDaysOver: number;
  hasUnordered: boolean;
  unorderedCount: number;
  waitingArrivalCount: number;
  earliestDate: string | null;
  latestDueDate: string | null;
  severityRank: 'S' | 'A' | 'B';
}

export const UnshippedClinicsView: React.FC<UnshippedClinicsViewProps> = ({
  orders,
  searchQuery: globalSearchQuery = '',
  onSelectOrderLine,
  onOpenClinicStatus,
  onNavigateToTab,
}) => {
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const clinicsMaster: ClinicItem[] = useMemo(() => getLocalClinics(), []);

  // UI States
  const [activeFilter, setActiveFilter] = useState<ClinicFilter>('all');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all');
  const [expandedClinics, setExpandedClinics] = useState<Set<string>>(new Set());

  // Email / Notice Modal State
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [contactClinic, setContactClinic] = useState<UnshippedClinicGroup | null>(null);
  const [contactSubject, setContactSubject] = useState<string>('');
  const [contactBody, setContactBody] = useState<string>('');
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  // Quick Action Notification
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // 1. 出荷未完了のクリニックグループを集計
  const clinicGroups: UnshippedClinicGroup[] = useMemo(() => {
    const map = new Map<string, {
      clinicName: string;
      orders: Order[];
      lines: UnshippedLineInfo[];
    }>();

    orders.forEach((ord) => {
      // 完了済みの伝票は除外
      if (ord.orderState === '全明細出荷済' || ord.orderState === '納品完了') {
        return;
      }

      // 未出荷の明細（残数 > 0 または stage !== '出荷完了'）を抽出
      const unshippedLines = ord.lines.filter((l) => {
        // 送料・手数料等は除外
        if (isShippingOrFee(l.productName, l.productId)) return false;
        return l.stage !== '出荷完了';
      });

      if (unshippedLines.length === 0) return;

      const clinicName = ord.customerName || '未設定クリニック';
      if (!map.has(clinicName)) {
        map.set(clinicName, {
          clinicName,
          orders: [],
          lines: [],
        });
      }

      const entry = map.get(clinicName)!;
      entry.orders.push(ord);

      unshippedLines.forEach((l) => {
        const remaining = getRemainingDaysInfo(ord.requestedDate || l.latestDate);
        entry.lines.push({
          line: l,
          parentOrder: ord,
          isOverdue: remaining.isOverdue,
          isUrgent: remaining.isUrgent,
          daysRemaining: remaining.days,
        });
      });
    });

    const groups: UnshippedClinicGroup[] = [];

    map.forEach((value, cName) => {
      // マスタ情報引当
      const master = clinicsMaster.find((c: ClinicItem) => c.clinicName === cName);
      const rep = value.orders[0]?.salesRep || master?.salesRep || '未設定';

      let hasOverdue = false;
      let maxDaysOver = 0;
      let unorderedCount = 0;
      let waitingArrivalCount = 0;
      let totalQty = 0;
      let earliestDate: string | null = null;
      let latestDueDate: string | null = null;

      value.lines.forEach((item) => {
        const rem = item.line.remainingQty !== undefined ? item.line.remainingQty : (item.line.quantity - (item.line.shippedQty || 0));
        totalQty += rem;
        if (item.line.stage === '未発注') unorderedCount++;
        if (item.line.stage === '発注済・入荷待ち') waitingArrivalCount++;

        if (item.isOverdue && item.daysRemaining !== null) {
          hasOverdue = true;
          const daysOver = Math.abs(item.daysRemaining);
          if (daysOver > maxDaysOver) maxDaysOver = daysOver;
        }

        const dateToCheck = item.parentOrder.requestedDate || item.line.latestDate;
        if (dateToCheck) {
          if (!earliestDate || dateToCheck < earliestDate) earliestDate = dateToCheck;
          if (!latestDueDate || dateToCheck > latestDueDate) latestDueDate = dateToCheck;
        }
      });

      // 重大度ランク (S: 納期遅延7日以上、A: 納期遅延ありまたは未発注3件以上、B: 通常仕入中)
      let severityRank: 'S' | 'A' | 'B' = 'B';
      if (maxDaysOver >= 7) {
        severityRank = 'S';
      } else if (hasOverdue || unorderedCount >= 3) {
        severityRank = 'A';
      }

      groups.push({
        clinicName: cName,
        clinicId: master?.clinicId,
        salesRep: rep,
        phone: master?.phone,
        email: master?.email,
        address: master?.address,
        orders: value.orders,
        lines: value.lines,
        totalOrdersCount: value.orders.length,
        totalUnshippedLinesCount: value.lines.length,
        totalUnshippedQty: totalQty,
        hasOverdue,
        maxDaysOver,
        hasUnordered: unorderedCount > 0,
        unorderedCount,
        waitingArrivalCount,
        earliestDate,
        latestDueDate,
        severityRank,
      });
    });

    // ソート: 納期遅延日数降順 → 未発注件数降順 → 伝票数降順
    return groups.sort((a, b) => {
      if (a.maxDaysOver !== b.maxDaysOver) return b.maxDaysOver - a.maxDaysOver;
      if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
      if (a.unorderedCount !== b.unorderedCount) return b.unorderedCount - a.unorderedCount;
      return b.totalOrdersCount - a.totalOrdersCount;
    });
  }, [orders, clinicsMaster]);

  // 全担当営業リスト
  const allSalesReps = useMemo(() => {
    const set = new Set<string>();
    clinicGroups.forEach((g) => {
      if (g.salesRep) set.add(g.salesRep);
    });
    return Array.from(set).sort();
  }, [clinicGroups]);

  // 2. 統計KPI
  const stats = useMemo(() => {
    const totalClinics = clinicGroups.length;
    const totalOrders = clinicGroups.reduce((sum, g) => sum + g.totalOrdersCount, 0);
    const totalLines = clinicGroups.reduce((sum, g) => sum + g.totalUnshippedLinesCount, 0);
    const totalQty = clinicGroups.reduce((sum, g) => sum + g.totalUnshippedQty, 0);

    const overdueClinics = clinicGroups.filter((g) => g.hasOverdue);
    const severeClinics = clinicGroups.filter((g) => g.severityRank === 'S');
    const unorderedClinics = clinicGroups.filter((g) => g.hasUnordered);
    const waitingOnlyClinics = clinicGroups.filter((g) => !g.hasUnordered && g.waitingArrivalCount > 0);

    return {
      totalClinics,
      totalOrders,
      totalLines,
      totalQty,
      overdueClinicsCount: overdueClinics.length,
      severeClinicsCount: severeClinics.length,
      unorderedClinicsCount: unorderedClinics.length,
      waitingOnlyClinicsCount: waitingOnlyClinics.length,
    };
  }, [clinicGroups]);

  // 3. フィルタリング
  const filteredClinics = useMemo(() => {
    const q = (localSearch || globalSearchQuery).trim().toLowerCase();

    return clinicGroups.filter((g) => {
      // フィルタ判定
      if (activeFilter === 'has_overdue' && !g.hasOverdue) return false;
      if (activeFilter === 'severe' && g.severityRank !== 'S') return false;
      if (activeFilter === 'has_unordered' && !g.hasUnordered) return false;
      if (activeFilter === 'waiting_arrival' && (g.hasUnordered || g.waitingArrivalCount === 0)) return false;

      // 担当営業判定
      if (selectedSalesRep !== 'all' && g.salesRep !== selectedSalesRep) return false;

      // 検索
      if (q) {
        const lineNames = g.lines.map((l) => `${l.line.productName} ${l.line.productId} ${l.line.supplierName}`).join(' ');
        const orderIds = g.orders.map((o) => o.orderId).join(' ');
        const target = `${g.clinicName} ${g.salesRep} ${g.phone || ''} ${orderIds} ${lineNames}`.toLowerCase();
        if (!target.includes(q)) return false;
      }

      return true;
    });
  }, [clinicGroups, activeFilter, selectedSalesRep, localSearch, globalSearchQuery]);

  // アコーディオン開閉
  const toggleExpand = (clinicName: string) => {
    setExpandedClinics((prev) => {
      const next = new Set(prev);
      if (next.has(clinicName)) next.delete(clinicName);
      else next.add(clinicName);
      return next;
    });
  };

  const expandAll = () => {
    if (expandedClinics.size === filteredClinics.length) {
      setExpandedClinics(new Set());
    } else {
      setExpandedClinics(new Set(filteredClinics.map((g) => g.clinicName)));
    }
  };

  // 出荷見通し・納期案内メール文面の生成
  const handleOpenContactModal = (clinic: UnshippedClinicGroup) => {
    setContactClinic(clinic);
    const subject = `【ご注文商品の出荷予定に関するご案内】医療法人・クリニック様 (${clinic.clinicName} 御中)`;

    const linesDetail = clinic.lines
      .map(
        (it, idx) =>
          `[${idx + 1}] 受注番号: ${it.parentOrder.orderId}\n` +
          `    商品名: ${it.line.productName} (数量: ${it.line.quantity}点)\n` +
          `    進捗状況: ${it.line.stage}\n` +
          `    希望納期: ${formatDate(it.parentOrder.requestedDate || it.line.latestDate)}\n` +
          `    出荷予定: ${it.line.shippedDate ? formatDate(it.line.shippedDate) + ' (出荷手配中)' : '仕入先にて手配中 (確認次第ご連絡)'}`
      )
      .join('\n\n');

    const body = `${clinic.clinicName}
ご担当者様（または 院長先生）

平素は格別のご高配を賜り、厚く御礼申し上げます。
ご注文商品の手配・出荷管理センター（担当: ${clinic.salesRep}）でございます。

現在、${clinic.clinicName}様よりご注文いただいております商品の現在の進捗状況および出荷見通しについてご連絡申し上げます。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 現在未出荷となっているご注文明細（計 ${clinic.totalUnshippedLinesCount} 品目 / ${clinic.totalUnshippedQty} 点）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${linesDetail}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れについて
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
メーカーより商品が入荷次第、検品の上、最短にて発送手続きを行わせていただきます。
発送完了時には、配送業者名およびお荷物追跡番号（送り状番号）をメールにて改めてご連絡申し上げます。

ご不明点や納期の調整等のご要望がございましたら、いつでも担当営業（${clinic.salesRep}）までお知らせください。
引き続きよろしくお願い申し上げます。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
納期管理サポートデスク
担当営業: ${clinic.salesRep}
`;

    setContactSubject(subject);
    setContactBody(body);
    setCopiedToast(false);
    setIsContactModalOpen(true);
  };

  // CSVエクスポート
  const handleExportCsv = () => {
    const headers = [
      'クリニック名',
      '担当営業',
      '電話番号',
      '未出荷伝票数',
      '未出荷品目数',
      '未出荷総数量',
      '納期超過状況',
      '最大超過日数',
      '未発注品目数',
      '入荷待ち品目数',
      '最短予定日',
      '受注ID',
      '商品コード',
      '商品名',
      '発注残数量（未出荷数）',
      'ステージ',
      '希望納期',
      '最長予定日',
    ];

    const rows: (string | number)[][] = [];

    filteredClinics.forEach((g) => {
      g.lines.forEach((it) => {
        const rem = it.line.remainingQty !== undefined ? it.line.remainingQty : (it.line.quantity - (it.line.shippedQty || 0));
        rows.push([
          g.clinicName,
          g.salesRep,
          g.phone || '',
          g.totalOrdersCount,
          g.totalUnshippedLinesCount,
          g.totalUnshippedQty,
          g.hasOverdue ? `遅延 (${g.maxDaysOver}日遅れ)` : '期限内',
          g.maxDaysOver > 0 ? `${g.maxDaysOver}日` : '-',
          g.unorderedCount,
          g.waitingArrivalCount,
          g.earliestDate || '',
          it.parentOrder.orderId,
          it.line.productId,
          it.line.productName,
          rem,
          it.line.stage,
          it.parentOrder.requestedDate || '',
          it.line.latestDate || '',
        ]);
      });
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `未出荷クリニック発注残一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotice(`未出荷クリニック一覧CSVをダウンロードしました (${filteredClinics.length}施設 / ${rows.length}明細)`);
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              未出荷クリニック（発注残管理）
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              現在発注あり・出荷未完了
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            現在注文があり、まだ全商品の出荷が完了していないクリニックの一覧です。納期遅延や未発注の滞留を防止し、確実な納品を管理します。
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={expandAll}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            {expandedClinics.size === filteredClinics.length ? 'すべて閉じる' : 'すべて展開'}
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-2 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>未出荷リストCSV出力</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 未出荷クリニック総数 */}
        <div
          onClick={() => setActiveFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'all'
              ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-300'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              未出荷クリニック数
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
              全体
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-indigo-950 font-mono">
              {stats.totalClinics}
            </span>
            <span className="text-xs font-semibold text-indigo-700">施設</span>
          </div>
          <div className="mt-2 pt-2 border-t border-indigo-100 text-[11px] text-indigo-800 flex items-center justify-between">
            <span>発注残点数:</span>
            <b className="font-mono">{stats.totalLines}品目 ({stats.totalQty}点)</b>
          </div>
        </div>

        {/* Card 2: 納期遅延クリニック */}
        <div
          onClick={() => setActiveFilter('has_overdue')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'has_overdue'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              納期遅延クリニック
            </span>
            {stats.overdueClinicsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                要対応
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono">
              {stats.overdueClinicsCount}
            </span>
            <span className="text-xs font-semibold text-rose-800">施設 (最長納期超過)</span>
          </div>
          <div className="mt-2 pt-2 border-t border-rose-200/60 text-[11px] text-rose-700 flex items-center justify-between">
            <span>うち7日以上大幅遅延:</span>
            <b className="font-mono text-rose-900">{stats.severeClinicsCount} 施設</b>
          </div>
        </div>

        {/* Card 3: 未発注を含むクリニック */}
        <div
          onClick={() => setActiveFilter('has_unordered')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'has_unordered'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-600" />
              未発注品あり
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              仕入先手配前
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-900 font-mono">
              {stats.unorderedClinicsCount}
            </span>
            <span className="text-xs font-semibold text-amber-800">施設</span>
          </div>
          <div className="mt-2 pt-2 border-t border-amber-200/60 text-[11px] text-amber-800 flex items-center justify-between">
            <span>発注管理へ連携可能:</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigateToTab) onNavigateToTab('procurement');
              }}
              className="text-amber-700 hover:underline font-bold flex items-center gap-1"
            >
              <span>発注画面へ</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 4: 入荷待ちのみのクリニック */}
        <div
          onClick={() => setActiveFilter('waiting_arrival')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeFilter === 'waiting_arrival'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-blue-600" />
              発注済・入荷待ち
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
              仕入先対応中
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-900 font-mono">
              {stats.waitingOnlyClinicsCount}
            </span>
            <span className="text-xs font-semibold text-blue-700">施設 (全品発注済)</span>
          </div>
          <p className="mt-2 pt-2 border-t border-blue-100 text-[11px] text-blue-600 truncate">
            メーカーからの入荷待ち・納品検品待ち
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>すべての未出荷クリニック</span>
              <span className="font-mono text-[10px]">({stats.totalClinics})</span>
            </button>

            <button
              onClick={() => setActiveFilter('has_overdue')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'has_overdue'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>納期遅延あり</span>
              {stats.overdueClinicsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-200 text-rose-900 font-bold">
                  {stats.overdueClinicsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('severe')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'severe'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>重大遅延 (7日以上)</span>
              <span className="font-mono text-[10px]">({stats.severeClinicsCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('has_unordered')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'has_unordered'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>未発注品を含む</span>
              <span className="font-mono text-[10px]">({stats.unorderedClinicsCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('waiting_arrival')}
              className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'waiting_arrival'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>入荷待ちのみ</span>
              <span className="font-mono text-[10px]">({stats.waitingOnlyClinicsCount})</span>
            </button>
          </div>

          {/* Sales Rep Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium shrink-0">担当営業:</span>
            <select
              value={selectedSalesRep}
              onChange={(e) => setSelectedSalesRep(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="all">すべての営業担当 ({allSalesReps.length}名)</option>
              {allSalesReps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="relative pt-2 border-t border-slate-100">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-4.5" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="クリニック名、担当営業、商品名、受注IDで検索..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 text-xs"
          />
          {localSearch && (
            <button
              onClick={() => setLocalSearch('')}
              className="absolute right-3 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Clinics List */}
      <div className="space-y-4">
        {filteredClinics.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              該当する未出荷クリニックはありません
            </h3>
            <p className="text-xs text-slate-500">
              条件に一致する出荷待ち案件は現在ありません。
            </p>
          </div>
        ) : (
          filteredClinics.map((clinic) => {
            const isExpanded = expandedClinics.has(clinic.clinicName);

            return (
              <div
                key={clinic.clinicName}
                className={`bg-white rounded-2xl border shadow-2xs overflow-hidden transition-all ${
                  clinic.severityRank === 'S'
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : clinic.hasOverdue
                    ? 'border-rose-300'
                    : 'border-slate-200'
                }`}
              >
                {/* Clinic Header Row */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/80 to-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <button
                      onClick={() => toggleExpand(clinic.clinicName)}
                      className="p-1 rounded-lg hover:bg-slate-200/80 text-slate-500 cursor-pointer mt-0.5 sm:mt-0 transition"
                      aria-label="アコーディオン開閉"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => onOpenClinicStatus && onOpenClinicStatus(clinic.clinicName)}
                          className="text-base font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer text-left"
                        >
                          {clinic.clinicName}
                        </button>

                        {clinic.hasOverdue && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            納期遅延 ({clinic.maxDaysOver}日遅れ)
                          </span>
                        )}

                        {clinic.hasUnordered && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            未発注 {clinic.unorderedCount}件あり
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          未出荷 {clinic.totalOrdersCount}伝票 / {clinic.totalUnshippedLinesCount}品目 ({clinic.totalUnshippedQty}点)
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          担当営業: <b className="text-slate-700 font-semibold">{clinic.salesRep}</b>
                        </span>
                        {clinic.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {clinic.phone}
                          </span>
                        )}
                        {clinic.earliestDate && (
                          <span>
                            最短希望納期: <b className="font-mono text-slate-700">{formatDate(clinic.earliestDate)}</b>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Clinic */}
                  <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
                    <button
                      onClick={() => handleOpenContactModal(clinic)}
                      className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>出荷見通し案内文作成</span>
                    </button>

                    <button
                      onClick={() => onOpenClinicStatus && onOpenClinicStatus(clinic.clinicName)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>商品ステータスボード</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Details: Orders & Unshipped Lines */}
                {isExpanded && (
                  <div className="border-t border-slate-200 p-4 sm:p-5 bg-slate-50/50 space-y-4 animate-in fade-in duration-200">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-indigo-500" />
                        未出荷のご注文明細一覧 ({clinic.lines.length}品目)
                      </span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        ※ 各明細をクリックすると伝票詳細・追跡番号・納期情報を確認できます
                      </span>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                              <th className="py-2.5 px-3">受注ID</th>
                              <th className="py-2.5 px-3">受注日</th>
                              <th className="py-2.5 px-3">商品コード・品名</th>
                              <th className="py-2.5 px-3 text-right">数量</th>
                              <th className="py-2.5 px-3">仕入先</th>
                              <th className="py-2.5 px-3">進捗ステージ</th>
                              <th className="py-2.5 px-3">希望納期 / 最長予定日</th>
                              <th className="py-2.5 px-3">納期状況</th>
                              <th className="py-2.5 px-3 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {clinic.lines.map((it, idx) => {
                              const remaining = getRemainingDaysInfo(it.parentOrder.requestedDate || it.line.latestDate);
                              const rakurakuUrl = buildRakurakuUrl(rakurakuBaseUrl, it.parentOrder.orderId);

                              return (
                                <tr
                                  key={`${it.line.lineKey}_${idx}`}
                                  className={`hover:bg-indigo-50/30 transition ${
                                    it.isOverdue ? 'bg-rose-50/30' : ''
                                  }`}
                                >
                                  {/* 受注ID */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => onSelectOrderLine(it.parentOrder, it.line.lineKey)}
                                        className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                      >
                                        {it.parentOrder.orderId}
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
                                  </td>

                                  {/* 受注日 */}
                                  <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600">
                                    {formatDate(it.parentOrder.orderDate)}
                                  </td>

                                  {/* 商品名 */}
                                  <td className="py-2.5 px-3 max-w-xs">
                                    <span className="font-mono text-[10px] text-slate-400 block">
                                      {it.line.productId}
                                    </span>
                                    <span className="font-semibold text-slate-900 block line-clamp-2">
                                      {it.line.productName}
                                    </span>
                                  </td>

                                  {/* 数量 */}
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                                    {it.line.quantity} 点
                                  </td>

                                  {/* 仕入先 */}
                                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                                    {it.line.supplierName}
                                  </td>

                                  {/* ステージ */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                        it.line.stage === '未発注'
                                          ? 'bg-amber-100 text-amber-800'
                                          : it.line.stage === '発注済・入荷待ち'
                                          ? 'bg-blue-100 text-blue-800'
                                          : it.line.stage === '一部出荷'
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {it.line.stage}
                                    </span>
                                  </td>

                                  {/* 納期情報 */}
                                  <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                                    <div className="font-bold text-slate-900">
                                      希望: {formatDate(it.parentOrder.requestedDate || it.line.latestDate)}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      最長: {formatDate(it.line.latestDate)}
                                    </div>
                                  </td>

                                  {/* 納期状況 */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                        remaining.isOverdue
                                          ? 'bg-rose-100 text-rose-700'
                                          : remaining.isUrgent
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {remaining.text}
                                    </span>
                                  </td>

                                  {/* 操作 */}
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    <button
                                      onClick={() => onSelectOrderLine(it.parentOrder, it.line.lineKey)}
                                      className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition cursor-pointer"
                                    >
                                      詳細
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Contact / Email Draft Modal */}
      {isContactModalOpen && contactClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    出荷見通し・納期案内メール作成
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {contactClinic.clinicName} 様向け (担当: {contactClinic.salesRep})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto text-xs flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  メール件名
                </label>
                <input
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  メール本文（自動フォーマット）
                </label>
                <textarea
                  rows={14}
                  value={contactBody}
                  onChange={(e) => setContactBody(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono text-[11px] leading-relaxed text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                クリップボードにコピーしてメーラー等に貼り付けて送信できます
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  閉じる
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${contactSubject}\n\n${contactBody}`);
                    setCopiedToast(true);
                    setTimeout(() => setCopiedToast(false), 2500);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {copiedToast ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>コピー完了!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>全文をコピー</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
