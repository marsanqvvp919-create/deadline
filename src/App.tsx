import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DeliveryData,
  ViewTab,
  PeriodFilter,
  Order,
  OrderLine,
  AlertItem,
  ClinicItem,
  ShipmentItem
} from './types';
import { fetchData, getConfiguredUrls, saveConnectionConfig, saveCachedDeliveryData } from './api';
import { syncAndDiffOrders } from './utils/syncEngine';
import { isWithinPeriod } from './utils';
import { isCoolMissingShipment, isCustomsNgShipment } from './utils/customsUtils';
import { Navbar } from './components/Navbar';
import { SettingsModal } from './components/SettingsModal';
import { DetailDrawer } from './components/DetailDrawer';
import { DashboardView } from './components/DashboardView';
import { DeliveryDashboardView } from './components/DeliveryDashboardView';
import { RepView } from './components/RepView';
import { CompletedView } from './components/CompletedView';
import { SalesDashboardView } from './components/SalesDashboardView';
import { SalesRepSalesView } from './components/SalesRepSalesView';
import { SalesClinicMasterView } from './components/SalesClinicMasterView';
import { ReorderPredictionView } from './components/ReorderPredictionView';
import { RepRankingView } from './components/RepRankingView';
import { OverdueManagementView } from './components/OverdueManagementView';
import { ProcurementView } from './components/ProcurementView';
import { UnshippedClinicsView } from './components/UnshippedClinicsView';
import { PartialShipmentView } from './components/PartialShipmentView';
import { ProductMasterView } from './components/ProductMasterView';
import { ClinicMasterView } from './components/ClinicMasterView';
import { InventoryManagementView } from './components/InventoryManagementView';
import { ArrivalTrackingView } from './components/ArrivalTrackingView';
import { CustomsManagementView } from './components/CustomsManagementView';
import { CoolMissingView } from './components/CoolMissingView';
import { KantoCustomsNgView } from './components/KantoCustomsNgView';
import { SheetUnmatchedView, fetchSheetUnmatched } from './components/SheetUnmatchedView';
import { BudgetSettingsModal } from './components/BudgetSettingsModal';
import { DailyDigestModal } from './components/DailyDigestModal';
import { ClinicProductStatusDrawer } from './components/ClinicProductStatusDrawer';
import { getLocalClinics, getLocalShipments } from './api';
import { getSalesRepsList } from './utils/salesRepMapping';
import { isShippingOrFee } from './utils';
import { isOrderDelayed, getDelayCounts } from './utils/delayCalculation';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  CreditCard,
  Users,
  UserCheck,
  TrendingUp,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  Building,
  Building2,
  Package,
  Menu,
  X,
  Database,
  Settings,
  ChevronRight,
  Calendar,
  Layers,
  Zap,
  Sparkles,
  ShieldAlert,
  Trophy,
  RefreshCw,
  Clock,
  Plane,
  Thermometer,
  FileWarning
} from 'lucide-react';

export default function App() {
  // 1. URLクエリパラメータから初期状態を復元（フェーズ3要件）
  const getInitialParams = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        tab: (params.get('tab') as ViewTab) || 'dashboard',
        rep: params.get('rep') || '',
        supplier: params.get('supplier') || '',
        period: (params.get('period') as PeriodFilter) || 'all',
        q: params.get('q') || '',
      };
    } catch {
      return {
        tab: 'dashboard' as ViewTab,
        rep: '',
        supplier: '',
        period: 'all' as PeriodFilter,
        q: '',
      };
    }
  };

  const initial = getInitialParams();

  // Navigation & Filter States
  const [activeTab, setActiveTab] = useState<ViewTab>(initial.tab);
  const [selectedRep, setSelectedRep] = useState<string>(initial.rep);
  const [selectedSupplier, setSelectedSupplier] = useState<string>(initial.supplier);
  const [period, setPeriod] = useState<PeriodFilter>(initial.period);
  const [searchQuery, setSearchQuery] = useState<string>(initial.q);

  // Data & Fetch Status States
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [isFallback, setIsFallback] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastErrorType, setLastErrorType] = useState<'rate_limit' | 'ip_blocked' | 'auth_error' | 'network_error' | null>(null);
  const [serverIp, setServerIp] = useState<string>('34.34.226.81');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDailyDigestOpen, setIsDailyDigestOpen] = useState<boolean>(false);

  // 最終取得成功時刻が古いときの警告（止まったデータを、それと分からないまま表示しない）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 最終取得成功時刻（要件3）
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(() => {
    return localStorage.getItem('nouki_last_success_time') || null;
  });
  // 平日日中は15分、それ以外は60分ごとに同期するので、その2回分を過ぎたら「止まっている」とみなす
  const staleInfo = useMemo(() => {
    if (!lastSuccessTime) return null;
    const last = new Date(lastSuccessTime).getTime();
    if (isNaN(last)) return null;
    const jst = new Date(nowTick + 9 * 60 * 60 * 1000);
    const businessHours = jst.getUTCDay() >= 1 && jst.getUTCDay() <= 5 && jst.getUTCHours() >= 8 && jst.getUTCHours() < 20;
    const limitMin = businessHours ? 40 : 130;
    const minutes = Math.floor((nowTick - last) / 60000);
    if (minutes < limitMin) return null;
    return {
      minutes,
      time: new Date(last).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  }, [lastSuccessTime, nowTick]);

  // エラー帯の非表示管理: 閉じたあとは5分たつか状態が変わったときだけ再表示（要件5）
  const [dismissedErrorRecord, setDismissedErrorRecord] = useState<{ error: string; time: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem('nouki_dismissed_error');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const handleDismissError = useCallback(() => {
    if (fetchError) {
      const rec = { error: fetchError, time: Date.now() };
      setDismissedErrorRecord(rec);
      try {
        sessionStorage.setItem('nouki_dismissed_error', JSON.stringify(rec));
      } catch {}
    }
  }, [fetchError]);

  const isErrorVisible = useMemo(() => {
    if (!fetchError) return false;
    if (!dismissedErrorRecord) return true;
    if (dismissedErrorRecord.error !== fetchError) return true; // エラー状態が変わった
    const elapsed = Date.now() - dismissedErrorRecord.time;
    if (elapsed >= 5 * 60 * 1000) return true; // 5分経過
    return false;
  }, [fetchError, dismissedErrorRecord]);

  // 手動再読み込みクールダウン（前回の取得から1分以内は押せない制限: 要件2）
  const [lastManualFetchTime, setLastManualFetchTime] = useState<number>(0);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);

  useEffect(() => {
    if (cooldownRemainingSec <= 0) return;
    const timer = setInterval(() => {
      const rem = Math.max(0, 60 - Math.floor((Date.now() - lastManualFetchTime) / 1000));
      setCooldownRemainingSec(rem);
      if (rem <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemainingSec, lastManualFetchTime]);

  useEffect(() => {
    // 今日のダイジェストは1日1回だけ自動で開く（以降はヘッダーのボタンから）
    try {
      const today = new Date().toLocaleDateString('ja-JP');
      if (localStorage.getItem('nouki_seen_digest_date') !== today) {
        setIsDailyDigestOpen(true);
        localStorage.setItem('nouki_seen_digest_date', today);
      }
    } catch {}
  }, []);

  const [clinics, setClinics] = useState<ClinicItem[]>(() => getLocalClinics());
  const [shipments, setShipments] = useState<ShipmentItem[]>(() => getLocalShipments());

  // 旧「未照合・書類不備」画面のURLは、シートとの照合画面に振り替える
  useEffect(() => {
    if ((activeTab as string) === 'unmatched_customs') {
      setActiveTab('unmatched_sheets');
    }
  }, [activeTab]);

  // 「楽楽販売と未照合」の件数（サイドバーのバッジ用。サーバーの照合結果を15分ごとに読む）
  const [sheetUnmatchedCount, setSheetUnmatchedCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadCount = () =>
      fetchSheetUnmatched()
        .then((json) => {
          if (!cancelled) setSheetUnmatchedCount(json.success ? json.rows?.length ?? 0 : null);
        })
        .catch(() => {});
    loadCount();
    const timer = setInterval(loadCount, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const STORAGE_BUDGET_KEY = 'nouki_sales_budgets_v1';
  const [salesBudgets, setSalesBudgets] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_BUDGET_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { company: 15000000, 大谷: 5000000, 高桑: 5000000, 大津: 5000000 };
  });
  const [salesBasis, setSalesBasis] = useState<'order' | 'billing' | 'payment_collected'>('payment_collected');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);

  // Detail Drawer State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Clinic Product Status Drawer State
  const [selectedClinicForStatus, setSelectedClinicForStatus] = useState<{
    clinicName: string;
    clinicItem?: ClinicItem;
  } | null>(null);

  // Mobile sidebar open state
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // 2. URLクエリパラメータとの双方向同期（フェーズ3要件）
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'dashboard') params.set('tab', activeTab);
      if (selectedRep) params.set('rep', selectedRep);
      if (selectedSupplier) params.set('supplier', selectedSupplier);
      if (period !== 'all') params.set('period', period);
      if (searchQuery) params.set('q', searchQuery);

      const newRelativePathQuery =
        window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState(null, '', newRelativePathQuery);
    } catch {
      // ignore
    }
  }, [activeTab, selectedRep, selectedSupplier, period, searchQuery]);

  // 3. データ取得ハンドラ
  const loadData = useCallback(async (isManual = false) => {
    if (isManual) {
      const elapsed = Math.floor((Date.now() - lastManualFetchTime) / 1000);
      if (lastManualFetchTime > 0 && elapsed < 60) {
        return; // 1分以内の再読み込みを防止（要件2）
      }
      setLastManualFetchTime(Date.now());
      setCooldownRemainingSec(60);
      setIsRefreshing(true);
    }
    try {
      const res = await fetchData();
      const syncResult = syncAndDiffOrders(res.data.orders);
      const processedData: DeliveryData = {
        ...res.data,
        orders: syncResult.syncedOrders,
      };
      setDeliveryData(processedData);
      setClinics(getLocalClinics());
      if (res.shipments && res.shipments.length > 0) {
        setShipments(res.shipments);
      } else {
        setShipments(getLocalShipments());
      }
      setIsStale(res.isStale);
      setIsFallback(res.isFallback);
      setFetchError(res.error);
      setLastErrorType(res.lastErrorType || null);
      if (res.lastSuccessTime) {
        setLastSuccessTime(res.lastSuccessTime);
        localStorage.setItem('nouki_last_success_time', res.lastSuccessTime);
      } else if (!res.error) {
        const nowIso = new Date().toISOString();
        setLastSuccessTime(nowIso);
        localStorage.setItem('nouki_last_success_time', nowIso);
      }
      if (res.serverIp) {
        setServerIp(res.serverIp);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'データ取得エラー');
    } finally {
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 300);
      }
    }
  }, [lastManualFetchTime]);

  const isSampleMode = getConfiguredUrls().mode === 'sample';

  const handleSwitchToSample = useCallback(() => {
    const cur = getConfiguredUrls();
    saveConnectionConfig(
      'sample',
      cur.dataUrl,
      cur.dataKey,
      cur.rakurakuBaseUrl,
      cur.rakurakuToken,
      cur.rakurakuSchemaId
    );
    loadData(true);
  }, [loadData]);

  const handleSwitchToReal = useCallback(() => {
    const cur = getConfiguredUrls();
    saveConnectionConfig(
      'rakuraku',
      cur.dataUrl,
      cur.dataKey,
      cur.rakurakuBaseUrl,
      cur.rakurakuToken,
      cur.rakurakuSchemaId
    );
    loadData(true);
  }, [loadData]);

  // 初回データ読み込み
  useEffect(() => {
    try {
      const cacheVer = localStorage.getItem('nouki_cache_ver_v2');
      if (!cacheVer) {
        localStorage.removeItem('nouki_last_delivery_data');
        localStorage.setItem('nouki_cache_ver_v2', 'true');
      }
    } catch {}
    loadData(false);
  }, [loadData]);

  // 自動更新は15分おき（要件2）
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(false);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // 4. 実営業担当者一覧・仕入先一覧の抽出（登録マスタおよび顧客割当より）
  const { salesReps, suppliers } = useMemo(() => {
    const reps = new Set<string>();
    const sups = new Set<string>();

    // 登録された実営業担当者マスタ
    getSalesRepsList().forEach((r) => reps.add(r));

    if (deliveryData) {
      deliveryData.orders.forEach((o) => {
        if (o.salesRep && o.salesRep !== '未割当') reps.add(o.salesRep);
        o.lines.forEach((l) => {
          if (l.supplierName) sups.add(l.supplierName);
        });
      });
    }

    clinics.forEach((c) => {
      if (c.salesRep && c.salesRep !== '未割当') reps.add(c.salesRep);
    });

    return {
      salesReps: Array.from(reps).sort(),
      suppliers: Array.from(sups).sort(),
    };
  }, [deliveryData, clinics]);

  // 5. グローバル絞り込み（営業・仕入先・期間）を適用した伝票・明細・アラート
  const { filteredOrders, filteredAlerts } = useMemo(() => {
    if (!deliveryData) return { filteredOrders: [], filteredAlerts: [] };

    const orders = deliveryData.orders.filter((ord) => {
      // 担当営業フィルター
      if (selectedRep && ord.salesRep !== selectedRep) {
        return false;
      }
      // 期間フィルター（受注日で判定）
      if (!isWithinPeriod(ord.orderDate, period)) {
        return false;
      }
      // 仕入先フィルター（伝票内に該当仕入先の商品が含まれるか）
      if (selectedSupplier) {
        const hasSupplier = ord.lines.some((l) => l.supplierName === selectedSupplier);
        if (!hasSupplier) return false;
      }
      return true;
    });

    // 伝票に含まれる受注IDのセット
    const allowedOrderIds = new Set(orders.map((o) => o.orderId));

    // アラートのフィルタリング
    const alerts = deliveryData.alerts.filter((a) => {
      if (!allowedOrderIds.has(a.orderId)) return false;
      if (selectedRep && a.salesRep !== selectedRep) return false;
      return true;
    });

    return {
      filteredOrders: orders,
      filteredAlerts: alerts,
    };
  }, [deliveryData, selectedRep, selectedSupplier, period]);

  // アラート総数および高重要度数
  const totalAlertsCount = filteredAlerts.length;
  const highSeverityCount = filteredAlerts.filter((a) => a.severity === '高').length;

  // 最長納期超過 伝票・明細数の計算（isLineDelayed統一: ○件○明細）
  const overdueCounts = useMemo(() => {
    if (!deliveryData) return { ordersCount: 0, linesCount: 0 };
    return getDelayCounts(filteredOrders);
  }, [deliveryData, filteredOrders]);
  const overdueOrdersCount = overdueCounts.ordersCount;
  const overdueLinesCount = overdueCounts.linesCount;

  // 出荷管理（101270）データのバッジ集計
  const coolMissingCount = useMemo(
    () => shipments.filter((s) => isCoolMissingShipment(s)).length,
    [shipments]
  );
  const kantoNgCount = useMemo(
    () => shipments.filter((s) => isCustomsNgShipment(s, filteredOrders)).length,
    [shipments, filteredOrders]
  );

  // 入金済・未発注 品目数の計算 (送料・各種手数料は除外)
  const paidUnorderedCount = useMemo(() => {
    if (!deliveryData) return 0;
    let count = 0;
    filteredOrders.forEach((o) => {
      // 入金ステータスが楽楽販売で「入金済」の伝票だけ（不明は数えない）
      if (o.paymentStatus !== '入金済') return;
      o.lines.forEach((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return;
        if (l.stage === '未発注') count++;
      });
    });
    return count;
  }, [deliveryData, filteredOrders]);

  // 現在発注があり出荷できていないクリニック数の計算
  const unshippedClinicsCount = useMemo(() => {
    if (!deliveryData) return 0;
    const clinicSet = new Set<string>();
    filteredOrders.forEach((o) => {
      if (o.orderState === '全明細出荷済' || o.orderState === '納品完了') return;
      const hasUnshipped = o.lines.some((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return false;
        return l.stage !== '出荷完了';
      });
      if (hasUnshipped && o.customerName) {
        clinicSet.add(o.customerName);
      }
    });
    return clinicSet.size;
  }, [deliveryData, filteredOrders]);

  // 入金予定日を過ぎて入金がないクリニック数の計算
  const overdueUnpaidClinicsCount = useMemo(() => {
    if (!deliveryData) return 0;
    const clinicSet = new Set<string>();
    const today = new Date('2026-09-24T00:00:00+09:00');

    filteredOrders.forEach((o) => {
      const payStatus = o.paymentStatus || '入金済';
      if (payStatus === '入金済') return;
      if (!o.paymentDueDate) return;

      const dueDate = new Date(o.paymentDueDate + 'T00:00:00+09:00');
      if (!isNaN(dueDate.getTime()) && dueDate < today && o.customerName) {
        clinicSet.add(o.customerName);
      }
    });
    return clinicSet.size;
  }, [deliveryData, filteredOrders]);

  const partialShipmentCount = useMemo(() => {
    if (!deliveryData) return 0;
    return deliveryData.orders.filter((o) => {
      if (o.orderState === '全明細出荷済' || o.orderState === '納品完了') return false;
      const productLines = o.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
      if (productLines.length === 0) return false;
      const completedCount = productLines.filter((l) => l.stage === '出荷完了').length;
      const incompleteCount = productLines.length - completedCount;
      return completedCount > 0 && incompleteCount > 0;
    }).length;
  }, [deliveryData]);

  // 詳細ドロワーの起動
  const handleOpenDetail = (order: Order, lineKey?: string) => {
    setSelectedOrder(order);
    setSelectedLineKey(lineKey || null);
    setIsDrawerOpen(true);
  };

  // 取引先別 商品ステータスドロワーの起動
  const handleOpenClinicStatus = (clinicName: string, clinicItem?: ClinicItem) => {
    setSelectedClinicForStatus({ clinicName, clinicItem });
  };

  // ダッシュボードから営業別ビューへの遷移
  const handleSelectRepFromDashboard = (repName: string) => {
    setSelectedRep(repName);
    setActiveTab('rep');
  };

  const handleUpdateOrderStatus = (orderIds: string[], updates: Partial<Order>) => {
    setDeliveryData((prev) => {
      if (!prev) return prev;
      const newOrders = prev.orders.map((o) => {
        if (orderIds.includes(o.orderId)) {
          return { ...o, ...updates };
        }
        return o;
      });
      const updatedData = { ...prev, orders: newOrders };
      saveCachedDeliveryData(updatedData);
      return updatedData;
    });
  };

  if (!deliveryData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">納期管理システムを起動中...</p>
        </div>
      </div>
    );
  }

  const isSalesMode = ['sales_dashboard', 'sales_rep_sales', 'sales_clinic_master', 'reorder_prediction', 'rep_ranking'].includes(activeTab);

  const salesNavItems = [
    {
      id: 'sales_dashboard' as ViewTab,
      label: 'ダッシュボード',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'sales_rep_sales' as ViewTab,
      label: '営業別売り上げ',
      icon: Users,
      badge: null,
    },
    {
      id: 'sales_clinic_master' as ViewTab,
      label: 'クリニックマスタ',
      icon: Building2,
      badge: null,
    },
    {
      id: 'reorder_prediction' as ViewTab,
      label: '定期購入・リピート予測',
      icon: RefreshCw,
      badge: null,
    },
    {
      id: 'rep_ranking' as ViewTab,
      label: '営業ランキング・表彰',
      icon: Trophy,
      badge: null,
    },
  ];

  // 納期・進捗管理セクション Items
  const NAV_GROUPS = [
    { id: 'today', label: '今日の対応' },
    { id: 'progress', label: '出荷・進捗' },
    { id: 'logistics', label: '通関・物流' },
  ];
  const deliveryNavItems = [
    {
      id: 'dashboard' as ViewTab,
      group: 'today',
      label: 'ダッシュボード',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'procurement' as ViewTab,
      group: 'today',
      label: '発注管理（未発注）',
      icon: ShoppingCart,
      badge: paidUnorderedCount > 0 ? `${paidUnorderedCount}` : null,
      badgeColor: 'bg-amber-500 text-white font-bold',
    },
    {
      id: 'unshipped_clinics' as ViewTab,
      group: 'progress',
      label: '未出荷クリニック',
      icon: Truck,
      badge: unshippedClinicsCount > 0 ? `${unshippedClinicsCount}` : null,
      badgeColor: 'bg-indigo-600 text-white font-bold',
    },
    {
      id: 'partial_shipment' as ViewTab,
      group: 'progress',
      label: '一部未出荷・残あり伝票',
      icon: Layers,
      badge: partialShipmentCount > 0 ? `${partialShipmentCount}` : null,
      badgeColor: 'bg-indigo-600 text-white font-bold',
    },
    {
      id: 'overdue' as ViewTab,
      group: 'today',
      label: '納期超過一覧',
      icon: AlertTriangle,
      badge: overdueCounts.ordersCount > 0 ? `${overdueCounts.ordersCount}件（${overdueCounts.linesCount}明細）` : null,
      badgeColor: 'bg-rose-600 text-white font-bold',
    },

    {
      id: 'completed' as ViewTab,
      group: 'progress',
      label: '出荷伝票',
      icon: CheckCircle2,
      badge: null,
    },
    {
      id: 'customs_management' as ViewTab,
      group: 'logistics',
      label: '通関・輸入管理',
      icon: Plane,
      badge: `${shipments.length}`,
      badgeColor: 'bg-indigo-600 text-white font-bold',
    },
    {
      id: 'cool_missing' as ViewTab,
      group: 'logistics',
      label: 'クール手配漏れ',
      icon: Thermometer,
      badge: coolMissingCount > 0 ? `${coolMissingCount}` : null,
      badgeColor: 'bg-amber-600 text-white font-bold',
    },
    {
      id: 'kanto_customs_ng' as ViewTab,
      group: 'logistics',
      label: '通関NG',
      icon: ShieldAlert,
      badge: kantoNgCount > 0 ? `${kantoNgCount}` : null,
      badgeColor: 'bg-rose-600 text-white font-bold',
    },
    {
      id: 'unmatched_sheets' as ViewTab,
      group: 'today',
      label: '楽楽販売と未照合',
      icon: FileWarning,
      badge: sheetUnmatchedCount ? `${sheetUnmatchedCount}` : null,
      badgeColor: 'bg-amber-600 text-white font-bold',
    },
    {
      id: 'inventory_management' as ViewTab,
      group: 'logistics',
      label: '韓国・シンガポール倉庫在庫',
      icon: Building,
      badge: null,
    },
    {
      id: 'arrival_tracking' as ViewTab,
      group: 'progress',
      label: '到着トラッキング',
      icon: Clock,
      badge: null,
    },
  ];

  // 楽楽販売 マスタ管理 Items (DBグループ: Number1)
  const masterNavItems = [
    {
      id: 'products' as ViewTab,
      label: '商品マスタ',
      schemaId: '101252',
      icon: Package,
    },
    {
      id: 'clinics' as ViewTab,
      label: 'クリニックマスタ',
      schemaId: '101250',
      icon: Building2,
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900 font-sans antialiased">
      
      {/* Mobile Nav Backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation (Permanently Fixed on Desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out shadow-2xl lg:shadow-none ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-xs border border-blue-500">
              納
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">
                納期管理システム
              </span>
              <span className="text-[10px] text-slate-400 font-medium block">
                楽楽販売 リアルタイム連携
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {/* Navigation Links (Scrollable independently) */}
        <nav className="p-3 space-y-4 flex-1 overflow-y-auto">
          {/* Section: 納期・進捗管理セクション */}
          <div className="space-y-1">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1 pt-2 first:pt-0">
                <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400">{group.label}</div>
            {deliveryNavItems.filter((item) => item.group === group.id).map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.2 rounded-xl text-xs font-bold transition cursor-pointer active:translate-y-px border ${
                    isActive
                      ? 'bg-blue-600 border-blue-500 text-white shadow-xs'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 mr-2">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold shadow-2xs shrink-0 ${
                        isActive ? 'bg-white text-blue-700' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
              </div>
            ))}
          </div>

          {/* Section: 楽楽販売 マスタ管理 */}
          <div className="space-y-1 pt-2 border-t border-slate-800/80">
            <div className="px-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>マスタ</span>
            </div>
            {masterNavItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.2 rounded-xl text-xs font-bold transition cursor-pointer active:translate-y-px border ${
                    isActive
                      ? item.id === 'products'
                        ? 'bg-blue-600 border-blue-500 text-white shadow-xs'
                        : 'bg-indigo-600 border-indigo-500 text-white shadow-xs'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 mr-2">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                </button>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer: Settings Button & Status (Permanently anchored at bottom of sidebar) */}
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/80 shrink-0 space-y-2">
          {/* Settings button with clear tactile button styling */}
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen(true);
              setIsMobileNavOpen(false);
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-white text-xs font-bold border border-slate-700 hover:border-slate-600 shadow-xs hover:shadow active:translate-y-px transition cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs group-hover:scale-105 transition">
                <Settings className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span>システム設定</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono font-normal">
                  {serverIp ? `サーバーIP: ${serverIp}` : '楽楽販売 API連携設定'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-white transition" />
          </button>

          {/* Connection status footer badge */}
          <div className="px-2 pt-0.5 flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span className="text-slate-300">楽楽販売 API連携</span>
            </div>
            <span className="text-[9px] font-mono text-slate-500">全7スキーマ同期</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area (Offset by sidebar width on desktop) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        
        {/* Mobile Header Bar Toggle */}
        <div className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold">納期管理システム</span>
          <div className="w-6" />
        </div>

        {/* Global Filter Bar (Navbar) */}
        <Navbar
          salesReps={salesReps}
          suppliers={suppliers}
          selectedRep={selectedRep}
          onSelectRep={setSelectedRep}
          selectedSupplier={selectedSupplier}
          onSelectSupplier={setSelectedSupplier}
          period={period}
          onSelectPeriod={setPeriod}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalAlertsCount={totalAlertsCount}
          highSeverityCount={highSeverityCount}
          generatedAt={deliveryData.generatedAt || ''}
          isStale={isStale}
          isFallback={isFallback}
          error={isErrorVisible ? fetchError : null}
          errorType={lastErrorType}
          serverIp={serverIp}
          isRefreshing={isRefreshing}
          cooldownRemainingSec={cooldownRemainingSec}
          onRefresh={() => loadData(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDailyDigest={() => setIsDailyDigestOpen(true)}
          onNavigateToAlerts={() => setActiveTab('alerts')}
          onDismissError={handleDismissError}
          onSwitchToSample={handleSwitchToSample}
        />

        {/* Main View Container */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {staleInfo && (
            <div className="mb-4 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                楽楽販売のデータが {staleInfo.time} のまま更新されていません（{staleInfo.minutes}分前）。表示中の件数は最新ではありません。
              </span>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardView
              orders={filteredOrders}
              alerts={filteredAlerts}
              sheetUnmatchedCount={sheetUnmatchedCount}
              weeklyDelayHistory={deliveryData.weeklyDelayHistory}
              onSelectRepForView={handleSelectRepFromDashboard}
              onNavigateToTab={setActiveTab}
              generatedAt={deliveryData.generatedAt || ''}
              onRefresh={() => loadData(true)}
              isRefreshing={isRefreshing}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'procurement' && (
            <ProcurementView
              orders={filteredOrders}
              searchQuery={searchQuery}
              onSelectOrderLine={handleOpenDetail}
              onOpenClinicStatus={handleOpenClinicStatus}
              onDataUpdated={() => loadData(false)}
            />
          )}

          {activeTab === 'unshipped_clinics' && (
            <UnshippedClinicsView
              orders={filteredOrders}
              searchQuery={searchQuery}
              onSelectOrderLine={handleOpenDetail}
              onOpenClinicStatus={handleOpenClinicStatus}
              onNavigateToTab={setActiveTab}
            />
          )}

          {activeTab === 'partial_shipment' && (
            <PartialShipmentView
              orders={filteredOrders}
              searchQuery={searchQuery}
              onSelectOrder={handleOpenDetail}
              onOpenClinicStatus={handleOpenClinicStatus}
            />
          )}





          {activeTab === 'overdue' && (
            <OverdueManagementView
              orders={filteredOrders}
              alerts={filteredAlerts}
              onSelectOrder={handleOpenDetail}
              onOpenClinicStatus={handleOpenClinicStatus}
            />
          )}



          {activeTab === 'completed' && (
            <CompletedView
              orders={filteredOrders}
              onSelectOrder={handleOpenDetail}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          )}

          {activeTab === 'sales_dashboard' && (
            <SalesDashboardView
              orders={deliveryData.orders}
              salesReps={salesReps}
              budgets={salesBudgets}
              salesBasis={salesBasis}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
              onOpenBudgetSettings={() => setIsBudgetModalOpen(true)}
              onOpenClinicStatus={handleOpenClinicStatus}
              onNavigateToRepSales={(m) => {
                setSelectedMonth(m);
                setActiveTab('sales_rep_sales');
              }}
            />
          )}

          {activeTab === 'sales_rep_sales' && (
            <SalesRepSalesView
              orders={deliveryData.orders}
              salesReps={salesReps}
              budgets={salesBudgets}
              salesBasis={salesBasis}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
              onOpenBudgetSettings={() => setIsBudgetModalOpen(true)}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'sales_clinic_master' && (
            <SalesClinicMasterView
              orders={deliveryData.orders}
              clinics={clinics}
              salesReps={salesReps}
              onOpenClinicStatus={handleOpenClinicStatus}
            />
          )}

          {activeTab === 'reorder_prediction' && (
            <ReorderPredictionView
              orders={deliveryData.orders}
              onOpenClinicStatus={handleOpenClinicStatus}
            />
          )}

          {activeTab === 'rep_ranking' && (
            <RepRankingView
              orders={deliveryData.orders}
              salesReps={salesReps}
              budgets={salesBudgets}
              selectedMonth={selectedMonth}
            />
          )}



          {activeTab === 'products' && (
            <ProductMasterView
              orders={deliveryData.orders}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'clinics' && (
            <ClinicMasterView
              orders={deliveryData.orders}
              onSelectOrder={handleOpenDetail}
              onOpenClinicStatus={handleOpenClinicStatus}
            />
          )}

          {activeTab === 'customs_management' && (
            <CustomsManagementView
              shipments={shipments}
              orders={filteredOrders}
              clinics={clinics}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'cool_missing' && (
            <CoolMissingView
              shipments={shipments}
              orders={filteredOrders}
              clinics={clinics}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'kanto_customs_ng' && (
            <KantoCustomsNgView
              shipments={shipments}
              orders={filteredOrders}
              clinics={clinics}
              onSelectOrder={handleOpenDetail}
            />
          )}

          {activeTab === 'unmatched_sheets' && (
            <SheetUnmatchedView onCountChange={setSheetUnmatchedCount} />
          )}

          {activeTab === 'inventory_management' && (
            <InventoryManagementView
              orders={filteredOrders}
            />
          )}

          {activeTab === 'arrival_tracking' && (
            <ArrivalTrackingView
              orders={deliveryData.orders}
              shipments={shipments}
            />
          )}
        </main>
      </div>

      {/* Detail Slideover Drawer */}
      <DetailDrawer
        order={selectedOrder}
        selectedLineKey={selectedLineKey}
        alerts={deliveryData.alerts}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenClinicStatus={handleOpenClinicStatus}
        onUpdateOrderStatus={handleUpdateOrderStatus}
      />

      {/* Global Clinic Product Status Slideover Drawer */}
      <ClinicProductStatusDrawer
        isOpen={selectedClinicForStatus !== null}
        onClose={() => setSelectedClinicForStatus(null)}
        clinicName={selectedClinicForStatus?.clinicName || null}
        clinicItem={selectedClinicForStatus?.clinicItem}
        orders={deliveryData.orders}
        alerts={deliveryData.alerts}
        onSelectOrder={handleOpenDetail}
        onSwitchClinic={(name) => setSelectedClinicForStatus({ clinicName: name })}
      />

      {/* Daily Digest Modal */}
      <DailyDigestModal
        isOpen={isDailyDigestOpen}
        onClose={() => setIsDailyDigestOpen(false)}
        orders={filteredOrders}
        alerts={filteredAlerts}
        overdueCount={overdueOrdersCount}
        paidUnorderedCount={paidUnorderedCount}
        onNavigate={setActiveTab}
      />

      {/* Settings Modal (GAS URL & Rakuraku Base URL Config) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => loadData(true)}
      />

      {/* Budget Settings Modal */}
      <BudgetSettingsModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        budgets={salesBudgets}
        salesReps={salesReps}
        onSaveBudgets={(newB) => {
          setSalesBudgets(newB);
          try {
            localStorage.setItem(STORAGE_BUDGET_KEY, JSON.stringify(newB));
          } catch {}
        }}
      />

    </div>
  );
}
