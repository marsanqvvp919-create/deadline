import React, { useState, useMemo } from 'react';
import {
  Order,
  OrderLine,
  AlertItem,
  ClinicItem,
  ProductItem,
  Stage,
} from '../types';
import { formatDate, buildRakurakuUrl, isShippingOrFee } from '../utils';
import { getConfiguredUrls, getLocalClinics } from '../api';
import {
  Building2,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Truck,
  ArrowRight,
  ExternalLink,
  Download,
  Search,
  Filter,
  X,
  ChevronRight,
  ChevronDown,
  User,
  Phone,
  Mail,
  MapPin,
  Layers,
  RefreshCw,
  Send,
  Copy,
  Check,
  FileText,
  ShoppingBag,
  Eye,
  CreditCard,
  Percent,
  TrendingUp,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react';

export interface ClinicProductStatusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clinicName: string | null;
  clinicItem?: ClinicItem | null;
  orders: Order[];
  alerts?: AlertItem[];
  allClinics?: ClinicItem[];
  onSelectOrder?: (order: Order, lineKey?: string) => void;
  onSwitchClinic?: (clinicName: string) => void;
}

// Product status line enriched with parent order and overdue calculations
export interface EnrichedProductLine extends OrderLine {
  parentOrder: Order;
  isOverdue: boolean;
  daysOver: number;
  daysRemaining: number | null;
  isDelivered: boolean;
  urgencyLevel: 'overdue' | 'urgent' | 'warning' | 'normal' | 'completed';
}

export const ClinicProductStatusDrawer: React.FC<ClinicProductStatusDrawerProps> = ({
  isOpen,
  onClose,
  clinicName,
  clinicItem: propClinicItem,
  orders,
  alerts = [],
  allClinics = [],
  onSelectOrder,
  onSwitchClinic,
}) => {
  // Current tab inside drawer: 'products' (商品ステータス) | 'master_info' (取引先基本情報)
  const [activeTab, setActiveTab] = useState<'products' | 'master_info'>('products');

  // Display mode: 'by_order' (伝票別) | 'flat_list' (商品一覧) | 'aggregated' (商品品目別集計)
  const [displayMode, setDisplayMode] = useState<'by_order' | 'flat_list' | 'aggregated'>('by_order');

  // Filter stage
  const [stageFilter, setStageFilter] = useState<string>('all'); // all | active | overdue | 未発注 | 発注済・入荷待ち | 一部出荷 | 出荷完了 | 納品完了
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<'urgency' | 'orderDate' | 'productName' | 'quantity'>('urgency');

  // Email template modal
  const [templateModal, setTemplateModal] = useState<{
    type: 'customer' | 'vendor';
    line?: EnrichedProductLine;
  } | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);

  // Clinic selector dropdown
  const [isClinicSelectorOpen, setIsClinicSelectorOpen] = useState<boolean>(false);
  const [clinicSearchText, setClinicSearchText] = useState<string>('');

  // ESC key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Resolve clinic info from master if not provided directly
  const clinicInfo = useMemo(() => {
    if (propClinicItem) return propClinicItem;
    if (!clinicName) return null;
    const clinicsList = allClinics.length > 0 ? allClinics : getLocalClinics();
    return clinicsList.find((c) => c.clinicName === clinicName || c.clinicId === clinicName) || null;
  }, [propClinicItem, clinicName, allClinics]);

  // Orders matching this clinic
  const clinicOrders = useMemo(() => {
    if (!clinicName) return [];
    return orders.filter((o) => {
      if (!o.customerName) return false;
      if (o.customerName === clinicName) return true;
      if (clinicInfo && (o.customerName === clinicInfo.clinicName || o.customerName === clinicInfo.clinicId)) {
        return true;
      }
      return false;
    });
  }, [orders, clinicName, clinicInfo]);

  // Today reference
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Flattened and enriched product lines
  const enrichedLines: EnrichedProductLine[] = useMemo(() => {
    const result: EnrichedProductLine[] = [];

    clinicOrders.forEach((ord) => {
      const isOrderDelivered = ord.deliveredDate !== null || ord.orderState === '納品完了';

      ord.lines.forEach((line) => {
        // 送料・代行手数料は商品として扱わない
        if (isShippingOrFee(line.productName, line.productId)) return;

        const isLineShipped = line.stage === '出荷完了';
        const isDelivered = isOrderDelivered || (isLineShipped && line.remainingQty === 0);

        let isOverdue = false;
        let daysOver = 0;
        let daysRemaining: number | null = null;
        let urgencyLevel: 'overdue' | 'urgent' | 'warning' | 'normal' | 'completed' = 'normal';

        if (isDelivered) {
          urgencyLevel = 'completed';
        } else if (line.latestDate) {
          const d = new Date(line.latestDate);
          if (!isNaN(d.getTime())) {
            const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              isOverdue = true;
              daysOver = diffDays;
              urgencyLevel = 'overdue';
            } else {
              daysRemaining = Math.abs(diffDays);
              if (daysRemaining <= 3) {
                urgencyLevel = 'urgent';
              } else if (daysRemaining <= 7) {
                urgencyLevel = 'warning';
              }
            }
          }
        }

        result.push({
          ...line,
          parentOrder: ord,
          isOverdue,
          daysOver,
          daysRemaining,
          isDelivered,
          urgencyLevel,
        });
      });
    });

    return result;
  }, [clinicOrders, today]);

  // Overall KPI metrics for this clinic
  const kpis = useMemo(() => {
    const totalOrders = clinicOrders.length;
    const activeOrders = clinicOrders.filter((o) => o.orderState !== '納品完了').length;
    const totalLines = enrichedLines.length;
    const totalQuantity = enrichedLines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    const deliveredQuantity = enrichedLines.reduce((sum, l) => sum + (l.shippedQty || 0), 0);
    const remainingQuantity = enrichedLines.reduce((sum, l) => sum + (l.remainingQty !== undefined ? l.remainingQty : l.quantity || 0), 0);

    const completedLines = enrichedLines.filter((l) => l.isDelivered || l.stage === '出荷完了').length;
    const overdueLines = enrichedLines.filter((l) => l.isOverdue).length;
    const unorderedLines = enrichedLines.filter((l) => l.stage === '未発注').length;
    const awaitingPoLines = enrichedLines.filter((l) => l.stage === '発注済・入荷待ち').length;
    const partialShippedLines = enrichedLines.filter((l) => l.stage === '一部出荷').length;

    const completionRate = totalLines > 0 ? Math.round((completedLines / totalLines) * 100) : 0;

    return {
      totalOrders,
      activeOrders,
      totalLines,
      totalQuantity,
      deliveredQuantity,
      remainingQuantity,
      completedLines,
      overdueLines,
      unorderedLines,
      awaitingPoLines,
      partialShippedLines,
      completionRate,
    };
  }, [clinicOrders, enrichedLines]);

  // Filtered and sorted product lines
  const filteredLines = useMemo(() => {
    return enrichedLines.filter((line) => {
      // Stage / Status filter
      if (stageFilter === 'active' && line.isDelivered) return false;
      if (stageFilter === 'overdue' && !line.isOverdue) return false;
      if (stageFilter === '未発注' && line.stage !== '未発注') return false;
      if (stageFilter === '発注済・入荷待ち' && line.stage !== '発注済・入荷待ち') return false;
      if (stageFilter === '一部出荷' && line.stage !== '一部出荷') return false;
      if (stageFilter === '出荷完了' && line.stage !== '出荷完了') return false;
      if (stageFilter === '納品完了' && !line.isDelivered) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = line.productName.toLowerCase().includes(q);
        const matchId = line.productId.toLowerCase().includes(q);
        const matchOrder = line.parentOrder.orderId.toLowerCase().includes(q);
        const matchSupplier = (line.supplierName || '').toLowerCase().includes(q);
        const matchTracking = (line.trackingNo || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchOrder && !matchSupplier && !matchTracking) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'urgency') {
        const urgencyWeight = { overdue: 5, urgent: 4, warning: 3, normal: 2, completed: 1 };
        const diff = urgencyWeight[b.urgencyLevel] - urgencyWeight[a.urgencyLevel];
        if (diff !== 0) return diff;
        return (b.daysOver || 0) - (a.daysOver || 0);
      }
      if (sortField === 'orderDate') {
        return (b.parentOrder.orderDate || '').localeCompare(a.parentOrder.orderDate || '');
      }
      if (sortField === 'productName') {
        return a.productName.localeCompare(b.productName);
      }
      if (sortField === 'quantity') {
        return b.quantity - a.quantity;
      }
      return 0;
    });
  }, [enrichedLines, stageFilter, searchQuery, sortField]);

  // Grouped by parent order for "by_order" mode
  const linesGroupedByOrder = useMemo(() => {
    const groups: {
      order: Order;
      lines: EnrichedProductLine[];
      hasOverdue: boolean;
      allCompleted: boolean;
    }[] = [];

    const orderMap = new Map<string, EnrichedProductLine[]>();
    filteredLines.forEach((l) => {
      const existing = orderMap.get(l.parentOrder.orderId) || [];
      existing.push(l);
      orderMap.set(l.parentOrder.orderId, existing);
    });

    clinicOrders.forEach((ord) => {
      const lines = orderMap.get(ord.orderId);
      if (lines && lines.length > 0) {
        const hasOverdue = lines.some((l) => l.isOverdue);
        const allCompleted = lines.every((l) => l.isDelivered || l.stage === '出荷完了');
        groups.push({
          order: ord,
          lines,
          hasOverdue,
          allCompleted,
        });
      }
    });

    return groups;
  }, [filteredLines, clinicOrders]);

  // Aggregated by product name for "aggregated" mode
  const aggregatedProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string;
        productId: string;
        supplierName: string;
        totalOrdered: number;
        totalShipped: number;
        totalRemaining: number;
        orderCount: number;
        orders: Order[];
        stages: Record<string, number>;
        hasOverdue: boolean;
        maxDaysOver: number;
        latestDate: string | null;
      }
    >();

    filteredLines.forEach((line) => {
      const existing = map.get(line.productName) || {
        productName: line.productName,
        productId: line.productId,
        supplierName: line.supplierName,
        totalOrdered: 0,
        totalShipped: 0,
        totalRemaining: 0,
        orderCount: 0,
        orders: [],
        stages: {},
        hasOverdue: false,
        maxDaysOver: 0,
        latestDate: null,
      };

      existing.totalOrdered += line.quantity;
      existing.totalShipped += line.shippedQty || 0;
      existing.totalRemaining += line.remainingQty !== undefined ? line.remainingQty : line.quantity;
      if (!existing.orders.some((o) => o.orderId === line.parentOrder.orderId)) {
        existing.orders.push(line.parentOrder);
        existing.orderCount += 1;
      }
      existing.stages[line.stage] = (existing.stages[line.stage] || 0) + line.quantity;
      if (line.isOverdue) {
        existing.hasOverdue = true;
        if (line.daysOver > existing.maxDaysOver) {
          existing.maxDaysOver = line.daysOver;
        }
      }
      if (line.latestDate && (!existing.latestDate || line.latestDate < existing.latestDate)) {
        existing.latestDate = line.latestDate;
      }

      map.set(line.productName, existing);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1;
      if (!a.hasOverdue && b.hasOverdue) return 1;
      return b.totalOrdered - a.totalOrdered;
    });
  }, [filteredLines]);

  // CSV Export for this clinic's products
  const handleExportCsv = () => {
    const headers = [
      '取引先名',
      '受注伝票ID',
      '受注日',
      '商品ID',
      '商品名',
      '仕入先',
      '発注数量',
      '出荷済数量',
      '納品残数',
      '進行ステータス',
      '最長納品日',
      '納期予定日',
      '超過日数',
      '追跡番号',
    ];

    const rows = filteredLines.map((l) => [
      `"${clinicName || ''}"`,
      `"${l.parentOrder.orderId}"`,
      `"${l.parentOrder.orderDate || ''}"`,
      `"${l.productId}"`,
      `"${l.productName.replace(/"/g, '""')}"`,
      `"${l.supplierName || ''}"`,
      l.quantity,
      l.shippedQty || 0,
      l.remainingQty !== undefined ? l.remainingQty : l.quantity,
      `"${l.stage}"`,
      `"${l.latestDate || ''}"`,
      `"${l.earliestDate || ''}"`,
      l.daysOver > 0 ? l.daysOver : 0,
      `"${l.trackingNo || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `商品ステータス_${clinicName || '取引先'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper for stage badge
  const renderStageBadge = (stage: Stage, isDelivered: boolean) => {
    if (isDelivered) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>納品完了</span>
        </span>
      );
    }

    switch (stage) {
      case '未発注':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>未発注 (手配前)</span>
          </span>
        );
      case '発注済・入荷待ち':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>仕入先発注済・入荷待ち</span>
          </span>
        );
      case '一部出荷':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Truck className="w-3.5 h-3.5 text-purple-600" />
            <span>一部出荷済</span>
          </span>
        );
      case '出荷完了':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Truck className="w-3.5 h-3.5 text-indigo-600" />
            <span>出荷完了 (配送中)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {stage}
          </span>
        );
    }
  };

  // Pipeline step tracker
  const renderStepTracker = (stage: Stage, isDelivered: boolean) => {
    const steps = [
      { id: 'ordered', label: '受注' },
      { id: 'po', label: '仕入先発注' },
      { id: 'arrival', label: '入荷検品' },
      { id: 'shipped', label: '出荷' },
      { id: 'delivered', label: '納品完了' },
    ];

    let currentStepIndex = 1; // 受注済
    if (isDelivered) currentStepIndex = 4;
    else if (stage === '出荷完了') currentStepIndex = 3;
    else if (stage === '一部出荷') currentStepIndex = 2.5;
    else if (stage === '発注済・入荷待ち') currentStepIndex = 2;
    else if (stage === '未発注') currentStepIndex = 0;

    return (
      <div className="flex items-center gap-1 w-full max-w-xs text-[10px]">
        {steps.map((st, idx) => {
          const isPassed = idx <= currentStepIndex;
          const isCurrent = Math.floor(currentStepIndex) === idx;

          return (
            <React.Fragment key={st.id}>
              <div
                className={`flex-1 text-center py-1 px-1 rounded font-medium truncate ${
                  isPassed
                    ? isDelivered
                      ? 'bg-emerald-100 text-emerald-800 font-bold'
                      : 'bg-indigo-100 text-indigo-800 font-bold'
                    : 'bg-slate-100 text-slate-400'
                }`}
                title={st.label}
              >
                {st.label}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-2 h-0.5 ${
                    idx < currentStepIndex ? 'bg-indigo-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  if (!isOpen || !clinicName) return null;

  const { rakurakuBaseUrl } = getConfiguredUrls();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-5xl bg-slate-50 shadow-2xl flex flex-col border-l border-slate-200">
          
          {/* TOP DRAWER HEADER */}
          <div className="bg-slate-900 text-white px-6 py-5 border-b border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              {/* Clinic Identity & Quick Switcher */}
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded">
                    {clinicInfo?.clinicId || '取引先'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    楽楽販売 顧客マスタ (101250) 連携中
                  </span>
                  {clinicInfo?.status && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      取引状態: {clinicInfo.status}
                    </span>
                  )}
                  {kpis.overdueLines > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      納期超過 {kpis.overdueLines}品目あり
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-indigo-400 shrink-0" />
                    <span>{clinicName}</span>
                  </h2>

                  {/* Switch Clinic Dropdown Toggle */}
                  {allClinics.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setIsClinicSelectorOpen(!isClinicSelectorOpen)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                        title="他の取引先に切り替え"
                      >
                        <span>取引先を変更</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      {isClinicSelectorOpen && (
                        <div className="absolute left-0 mt-2 w-72 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 z-50 p-2 space-y-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input autoComplete="off"
                              type="text"
                              placeholder="クリニック名で絞り込み..."
                              value={clinicSearchText}
                              onChange={(e) => setClinicSearchText(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                            {allClinics
                              .filter((c) =>
                                c.clinicName.toLowerCase().includes(clinicSearchText.toLowerCase()) ||
                                c.clinicId.toLowerCase().includes(clinicSearchText.toLowerCase())
                              )
                              .slice(0, 30)
                              .map((c, cIdx) => (
                                <button
                                  key={`${c.clinicId}_${cIdx}`}
                                  onClick={() => {
                                    if (onSwitchClinic) onSwitchClinic(c.clinicName);
                                    setIsClinicSelectorOpen(false);
                                  }}
                                  className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition flex items-center justify-between"
                                >
                                  <span className="font-semibold truncate">{c.clinicName}</span>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">{c.clinicId}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sub info */}
                <div className="flex items-center gap-4 text-xs text-slate-300 pt-1 flex-wrap">
                  {clinicInfo?.salesRep && (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>担当営業: <b>{clinicInfo.salesRep}</b></span>
                    </span>
                  )}
                  {clinicInfo?.directorName && (
                    <span>院長: <b>{clinicInfo.directorName}</b></span>
                  )}
                  {clinicInfo?.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {clinicInfo.phone}
                    </span>
                  )}
                  {clinicInfo?.prefecture && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {clinicInfo.prefecture} {clinicInfo.address}
                    </span>
                  )}
                </div>
              </div>

              {/* Close & Action Buttons */}
              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  title="この取引先の商品進捗CSVをダウンロード"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>CSV出力</span>
                </button>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="閉じる (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            </div>

            {/* TAB SELECTOR */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('products')}
                className={`px-4 py-2 font-bold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'products'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>商品ステータス・進捗管理 ({enrichedLines.length}品目)</span>
              </button>

              <button
                onClick={() => setActiveTab('master_info')}
                className={`px-4 py-2 font-bold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'master_info'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>取引先マスタ基本情報・整理表</span>
              </button>
            </div>
          </div>

          {/* MAIN DRAWER BODY */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {activeTab === 'products' && (
              <>
                {/* 1. TOP SUMMARY METRIC CARDS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Total Orders */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-500 block">累計受注伝票</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-slate-900">{kpis.totalOrders}</span>
                      <span className="text-[11px] text-slate-400">件</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      進行中: <b>{kpis.activeOrders}</b> 件
                    </span>
                  </div>

                  {/* Total Products Lines */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-500 block">総発注品目数</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-indigo-700">{kpis.totalLines}</span>
                      <span className="text-[11px] text-slate-400">品目</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                      計 {kpis.totalQuantity} 点発注
                    </span>
                  </div>

                  {/* Overdue Items (Alert) */}
                  <div className={`p-3.5 rounded-xl border shadow-2xs ${
                    kpis.overdueLines > 0
                      ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-200'
                      : 'bg-white border-slate-200'
                  }`}>
                    <span className="text-[11px] font-bold text-rose-700 block flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      最長納期超過
                    </span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className={`text-2xl font-bold font-mono ${kpis.overdueLines > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                        {kpis.overdueLines}
                      </span>
                      <span className="text-[11px] text-rose-600">品目</span>
                    </div>
                    <span className="text-[10px] text-rose-600 mt-0.5 block font-medium">
                      {kpis.overdueLines > 0 ? '⚠️ 要仕入先督促' : '遅延なし (正常)'}
                    </span>
                  </div>

                  {/* Pending In Progress Lines */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-blue-700 block">未発注 / 手配前</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-slate-900">{kpis.unorderedLines}</span>
                      <span className="text-[11px] text-slate-400">品目</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      入荷待ち: <b>{kpis.awaitingPoLines}</b> 品目
                    </span>
                  </div>

                  {/* Completed Lines */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-emerald-700 block">納品・出荷完了</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-emerald-700">{kpis.completedLines}</span>
                      <span className="text-[11px] text-slate-400">品目</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                      {kpis.deliveredQuantity} / {kpis.totalQuantity} 点納品済
                    </span>
                  </div>

                  {/* Delivery Completion Rate Progress */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block">納品進捗率</span>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-slate-900">{kpis.completionRate}%</span>
                        <span className="text-[11px] text-slate-400">完了</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${kpis.completionRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. FILTER & VIEW MODE TOOLBAR */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    
                    {/* Search box */}
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input autoComplete="off"
                        type="text"
                        placeholder="商品名、商品ID、仕入先名、受注伝票ID（000003xxx）で検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    {/* View Display Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                      <button
                        onClick={() => setDisplayMode('by_order')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                          displayMode === 'by_order'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>伝票別に表示</span>
                      </button>

                      <button
                        onClick={() => setDisplayMode('flat_list')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                          displayMode === 'flat_list'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>全商品フラット一覧</span>
                      </button>

                      <button
                        onClick={() => setDisplayMode('aggregated')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                          displayMode === 'aggregated'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>商品品目別集計</span>
                      </button>
                    </div>

                    {/* Sort Dropdown */}
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as any)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="urgency">緊急度・遅延順</option>
                      <option value="orderDate">受注日（新しい順）</option>
                      <option value="productName">商品名（五十音順）</option>
                      <option value="quantity">発注数量（多い順）</option>
                    </select>
                  </div>

                  {/* Stage Chips Filter */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 text-[11px] font-medium mr-1 flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      絞り込み:
                    </span>

                    <button
                      onClick={() => setStageFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        stageFilter === 'all'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      すべて ({enrichedLines.length})
                    </button>

                    <button
                      onClick={() => setStageFilter('active')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        stageFilter === 'active'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      手配中・未納品 ({enrichedLines.filter((l) => !l.isDelivered).length})
                    </button>

                    <button
                      onClick={() => setStageFilter('overdue')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                        stageFilter === 'overdue'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>最長納期超過 ({kpis.overdueLines})</span>
                    </button>

                    <button
                      onClick={() => setStageFilter('未発注')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        stageFilter === '未発注'
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      未発注 ({kpis.unorderedLines})
                    </button>

                    <button
                      onClick={() => setStageFilter('発注済・入荷待ち')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        stageFilter === '発注済・入荷待ち'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      入荷待ち ({kpis.awaitingPoLines})
                    </button>

                    <button
                      onClick={() => setStageFilter('一部出荷')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        stageFilter === '一部出荷'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      一部出荷 ({kpis.partialShippedLines})
                    </button>

                    <button
                      onClick={() => setStageFilter('納品完了')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        stageFilter === '納品完了'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      納品完了 ({kpis.completedLines})
                    </button>
                  </div>
                </div>

                {/* 3. DISPLAY CONTENT BASED ON MODE */}

                {/* MODE A: BY ORDER */}
                {displayMode === 'by_order' && (
                  <div className="space-y-4">
                    {linesGroupedByOrder.length === 0 ? (
                      <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                        <Package className="w-10 h-10 text-slate-300 mx-auto" />
                        <p className="text-sm font-semibold">条件に一致する受注商品が見つかりませんでした</p>
                        <p className="text-xs text-slate-400">検索語句や絞り込みフィルタを変更してお試しください</p>
                      </div>
                    ) : (
                      linesGroupedByOrder.map(({ order, lines, hasOverdue, allCompleted }, grpIdx) => {
                        const rakurakuOrderUrl = buildRakurakuUrl(rakurakuBaseUrl, order.orderId);

                        return (
                          <div
                            key={`${order.orderId}_${grpIdx}`}
                            className={`bg-white rounded-2xl border shadow-xs overflow-hidden transition ${
                              hasOverdue
                                ? 'border-rose-300 ring-1 ring-rose-200'
                                : allCompleted
                                ? 'border-emerald-200 bg-emerald-50/10'
                                : 'border-slate-200'
                            }`}
                          >
                            {/* Order Header Box */}
                            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-sm font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                                  受注伝票: {order.orderId}
                                </span>
                                <span className="text-xs text-slate-500">
                                  受注日: <b>{order.orderDate || '未記録'}</b>
                                </span>
                                <span className="text-xs text-slate-500">
                                  担当営業: <b>{order.salesRep}</b>
                                </span>
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                    order.orderState === '納品完了'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}
                                >
                                  伝票状態: {order.orderState}
                                </span>
                                {hasOverdue && (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 font-mono">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    最長納期超過あり
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <a
                                  href={rakurakuOrderUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition"
                                  title="楽楽販売の該当伝票を開く"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>楽楽で開く</span>
                                </a>

                                <button
                                  onClick={() => {
                                    if (onSelectOrder) onSelectOrder(order);
                                  }}
                                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                                >
                                  伝票詳細
                                </button>
                              </div>
                            </div>

                            {/* Products Table inside this order */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase border-b border-slate-100">
                                  <tr>
                                    <th className="py-2.5 px-4">商品名 / 品番</th>
                                    <th className="py-2.5 px-3">数量</th>
                                    <th className="py-2.5 px-3">進行ステータス</th>
                                    <th className="py-2.5 px-3">進捗工程</th>
                                    <th className="py-2.5 px-3">納期予定 (最長 / 予定)</th>
                                    <th className="py-2.5 px-3">仕入先</th>
                                    <th className="py-2.5 px-3 text-right">アクション</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-800">
                                  {lines.map((line, lineIdx) => (
                                    <tr
                                      key={`${line.lineKey}_${lineIdx}`}
                                      className={`hover:bg-slate-50/60 transition ${
                                        line.isOverdue ? 'bg-rose-50/30' : ''
                                      }`}
                                    >
                                      {/* Product Name & ID */}
                                      <td className="py-3 px-4 max-w-sm">
                                        <div className="font-bold text-slate-900 leading-snug">
                                          {line.productName}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                                          <span>ID: {line.productId}</span>
                                          {line.trackingNo && (
                                            <span className="text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                                              追跡: {line.trackingNo}
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Quantities */}
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <div className="font-mono font-bold text-slate-900 text-sm">
                                          {line.quantity} <span className="text-[11px] font-normal text-slate-500">点</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                          納品済: <b>{line.shippedQty || 0}</b> / 残: <b>{line.remainingQty !== undefined ? line.remainingQty : line.quantity}</b>
                                        </div>
                                      </td>

                                      {/* Stage Badge */}
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        {renderStageBadge(line.stage, line.isDelivered)}
                                      </td>

                                      {/* Step Pipeline Tracker */}
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        {renderStepTracker(line.stage, line.isDelivered)}
                                      </td>

                                      {/* Delivery Due Date & Overdue Tag */}
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <div className="space-y-0.5">
                                          <div className="font-mono text-xs text-slate-700">
                                            最長: <b>{line.latestDate || '未設定'}</b>
                                          </div>
                                          {line.earliestDate && (
                                            <div className="text-[10px] text-slate-400 font-mono">
                                              予定: {line.earliestDate}
                                            </div>
                                          )}
                                          {line.isOverdue ? (
                                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 font-mono">
                                              🔴 {line.daysOver}日超過
                                            </span>
                                          ) : line.isDelivered ? (
                                            <span className="text-[10px] text-emerald-600 font-semibold">
                                              ✓ 完了
                                            </span>
                                          ) : line.daysRemaining !== null ? (
                                            <span className="text-[10px] text-slate-500 font-mono">
                                              あと {line.daysRemaining}日
                                            </span>
                                          ) : null}
                                        </div>
                                      </td>

                                      {/* Supplier */}
                                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 text-xs">
                                        {line.supplierName || '未指定'}
                                      </td>

                                      {/* Actions */}
                                      <td className="py-3 px-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            onClick={() => setTemplateModal({ type: 'customer', line })}
                                            className="px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium transition cursor-pointer"
                                            title="顧客への納期案内文を作成"
                                          >
                                            顧客案内
                                          </button>
                                          <button
                                            onClick={() => setTemplateModal({ type: 'vendor', line })}
                                            className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition cursor-pointer"
                                            title="仕入先への督促文を作成"
                                          >
                                            仕入先督促
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* MODE B: FLAT LIST OF ALL PRODUCTS */}
                {displayMode === 'flat_list' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">商品名 / 品番</th>
                            <th className="py-3 px-3">受注伝票ID</th>
                            <th className="py-3 px-3">受注日</th>
                            <th className="py-3 px-3 text-right">発注数量</th>
                            <th className="py-3 px-3">現在のステータス</th>
                            <th className="py-3 px-3">工程状況</th>
                            <th className="py-3 px-3">最長納品日</th>
                            <th className="py-3 px-3">仕入先</th>
                            <th className="py-3 px-3 text-center">詳細</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {filteredLines.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400">
                                該当する商品明細はありません
                              </td>
                            </tr>
                          ) : (
                            filteredLines.map((line, lineIdx) => (
                              <tr
                                key={`${line.lineKey}_${lineIdx}`}
                                className={`hover:bg-indigo-50/30 transition ${
                                  line.isOverdue ? 'bg-rose-50/30' : ''
                                }`}
                              >
                                <td className="py-3 px-4 max-w-sm">
                                  <div className="font-bold text-slate-900 leading-snug">
                                    {line.productName}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    ID: {line.productId}
                                  </div>
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-indigo-700">
                                  <button
                                    onClick={() => onSelectOrder && onSelectOrder(line.parentOrder, line.lineKey)}
                                    className="hover:underline cursor-pointer"
                                  >
                                    {line.parentOrder.orderId}
                                  </button>
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                                  {line.parentOrder.orderDate || '-'}
                                </td>

                                <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                                  <span className="font-bold text-slate-900">{line.quantity}</span> 点
                                  <span className="text-[10px] text-slate-400 block font-normal">
                                    残: {line.remainingQty !== undefined ? line.remainingQty : line.quantity}
                                  </span>
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                  {renderStageBadge(line.stage, line.isDelivered)}
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                  {renderStepTracker(line.stage, line.isDelivered)}
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="font-mono text-xs text-slate-800">
                                    {line.latestDate || '未設定'}
                                  </div>
                                  {line.isOverdue ? (
                                    <span className="text-[10px] font-bold text-rose-700 font-mono block">
                                      🔴 {line.daysOver}日超過
                                    </span>
                                  ) : line.isDelivered ? (
                                    <span className="text-[10px] text-emerald-600 font-medium block">
                                      ✓ 納品済
                                    </span>
                                  ) : null}
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap text-slate-600 text-xs">
                                  {line.supplierName || '未指定'}
                                </td>

                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <button
                                    onClick={() => onSelectOrder && onSelectOrder(line.parentOrder, line.lineKey)}
                                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-medium transition cursor-pointer"
                                  >
                                    詳細
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MODE C: AGGREGATED BY PRODUCT */}
                {displayMode === 'aggregated' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 font-medium">
                      この取引先が過去〜現在発注した商品品目別の合算集計（全 {aggregatedProducts.length} 品目）
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {aggregatedProducts.map((p, pIdx) => (
                        <div
                          key={`${p.productId}_${p.productName}_${pIdx}`}
                          className={`bg-white p-4 rounded-xl border shadow-2xs space-y-3 ${
                            p.hasOverdue ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                                {p.productName}
                              </h4>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                商品ID: {p.productId} | 仕入先: {p.supplierName || '未指定'}
                              </div>
                            </div>

                            {p.hasOverdue && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shrink-0 font-mono">
                                🔴 {p.maxDaysOver}日遅延あり
                              </span>
                            )}
                          </div>

                          {/* Quantities bar */}
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block">累計発注数</span>
                              <span className="font-bold font-mono text-slate-900 text-sm">{p.totalOrdered}</span> 点
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">納品済数</span>
                              <span className="font-bold font-mono text-emerald-700 text-sm">{p.totalShipped}</span> 点
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">手配残数</span>
                              <span className="font-bold font-mono text-indigo-700 text-sm">{p.totalRemaining}</span> 点
                            </div>
                          </div>

                          {/* Stage distribution tags */}
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                            {Object.entries(p.stages).map(([st, count], stIdx) => (
                              <span
                                key={`${st}_${stIdx}`}
                                className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
                              >
                                {st}: <b>{count}点</b>
                              </span>
                            ))}
                          </div>

                          {/* Related orders */}
                          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                            <span>関連伝票: <b>{p.orderCount}</b> 件</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {p.orders.slice(0, 3).map((o, oIdx) => (
                                <button
                                  key={`${o.orderId}_${oIdx}`}
                                  onClick={() => onSelectOrder && onSelectOrder(o)}
                                  className="font-mono text-indigo-600 hover:underline"
                                >
                                  {o.orderId}
                                </button>
                              ))}
                              {p.orders.length > 3 && <span>他...</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: CLINIC MASTER & FIELD MAPPING INFO */}
            {activeTab === 'master_info' && (
              <div className="space-y-6">
                {clinicInfo ? (
                  <>
                    {/* Basic Master Card */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-indigo-600" />
                          <span>{clinicInfo.clinicName}</span>
                        </h3>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {clinicInfo.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-2">
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">109898 (クリニックID)</span>
                            <span className="font-mono font-bold text-indigo-700">{clinicInfo.clinicId}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">院長・代表者名</span>
                            <span className="font-semibold text-slate-800">{clinicInfo.directorName || "—"}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">109978 (担当営業)</span>
                            <span className="font-bold text-slate-900">{clinicInfo.salesRep}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">110167 (販売通貨)</span>
                            <span className="font-mono text-slate-800">{clinicInfo.currency}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">110109 (紹介手数料率)</span>
                            <span className="font-mono font-bold text-indigo-700">{clinicInfo.commissionRate}%</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">電話番号</span>
                            <span className="font-mono text-slate-800">{clinicInfo.phone}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">メールアドレス</span>
                            <span className="font-mono text-slate-800">{clinicInfo.email || '未登録'}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">所在地</span>
                            <span className="text-slate-800 text-right max-w-xs">{clinicInfo.prefecture} {clinicInfo.address}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">支払条件</span>
                            <span className="text-slate-800">{clinicInfo.paymentMethod || clinicInfo.paymentTerms || "—"}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500">最終更新日時</span>
                            <span className="text-slate-500 font-mono">{clinicInfo.updatedAt}</span>
                          </div>
                        </div>
                      </div>

                      {clinicInfo.memo && (
                        <div className="pt-2">
                          <span className="text-slate-500 text-xs font-bold block mb-1">取引メモ:</span>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                            {clinicInfo.memo}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Order summary table for this clinic */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          ご注文管理（101248）での伝票一覧 ({clinicOrders.length} 件)
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {clinicOrders.map((ord, ordIdx) => (
                          <div
                            key={`${ord.orderId}_${ordIdx}`}
                            onClick={() => onSelectOrder && onSelectOrder(ord)}
                            className="p-3.5 hover:bg-indigo-50/40 transition cursor-pointer flex items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-indigo-700">{ord.orderId}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  ord.orderState === '納品完了' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {ord.orderState}
                                </span>
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                受注日: {ord.orderDate || '-'} | 明細数: {ord.lines.length} 品目 | 担当: {ord.salesRep}
                              </div>
                            </div>
                            <button className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium">
                              伝票詳細
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
                    顧客マスタ（101250）に登録情報が見つかりませんでした。
                  </div>
                )}
              </div>
            )}

          </div>

          {/* DRAWER FOOTER */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              取引先: <b>{clinicName}</b> | 表示品目: <b>{filteredLines.length}</b> 件
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition cursor-pointer"
            >
              閉じる
            </button>
          </div>

        </div>
      </div>

      {/* EMAIL / MESSAGE TEMPLATE MODAL */}
      {templateModal && templateModal.line && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>
                  {templateModal.type === 'customer'
                    ? `【顧客宛】納期・進捗案内文（${clinicName} 様）`
                    : `【仕入先宛】納期督促文（${templateModal.line.supplierName || '仕入先'} 御中）`}
                </span>
              </h3>
              <button
                onClick={() => setTemplateModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const line = templateModal.line;
              const text =
                templateModal.type === 'customer'
                  ? `${clinicName}
${clinicInfo?.directorName ? `${clinicInfo.directorName} 院長` : 'ご担当者様'}

平素は大変お世話になっております。
担当営業の ${clinicInfo?.salesRep || line.parentOrder.salesRep} でございます。

ご注文いただいております下記商品の現在の納品進捗をご案内申し上げます。

【受注伝票】${line.parentOrder.orderId}
【商品名】${line.productName}
【ご注文数量】${line.quantity} 点 (手配残数: ${line.remainingQty !== undefined ? line.remainingQty : line.quantity} 点)
【現在の状況】${line.stage}${line.isOverdue ? `\n【納期状況】当初予定（${line.latestDate}）より入荷に遅れが発生しております` : ''}
${line.trackingNo ? `【配送追跡番号】${line.trackingNo}` : ''}

${line.isOverdue ? 'ご迷惑をおかけしており誠に申し訳ございません。仕入先へ至急確認を行い、確定納品日が判明次第ご連絡申し上げます。' : '引き続き納品まで迅速に対応を進めてまいります。'}

何卒よろしくお願い申し上げます。`
                  : `${line.supplierName || '仕入先様'}
ご担当者様

お世話になっております。
ご注文管理（伝票ID: ${line.parentOrder.orderId}）の納品納期について至急確認させていただきたくご連絡いたしました。

【商品名】${line.productName} (商品ID: ${line.productId})
【数量】${line.quantity} 点
【納品先】${clinicName} 様
【当初予定納期】${line.latestDate || '未設定'}
${line.isOverdue ? `【超過状況】現在 ${line.daysOver} 日超過しております。顧客への案内が必要なため、最新の出荷予定日をご教示ください。` : '現在の入荷・出荷準備状況についてご教示いただけますと幸いです。'}

お忙しいところ恐れ入りますが、至急ご回答のほど何卒よろしくお願い申し上げます。`;

              return (
                <div className="space-y-3">
                  <textarea
                    readOnly
                    value={text}
                    className="w-full h-56 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] leading-relaxed resize-none focus:outline-none"
                  />

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-slate-500">
                      内容をクリップボードにコピーしてメール・チャットツールで送信できます
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(text);
                        setCopiedTemplate(true);
                        setTimeout(() => setCopiedTemplate(false), 2000);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      {copiedTemplate ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>コピー完了</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>テンプレートをコピー</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};
