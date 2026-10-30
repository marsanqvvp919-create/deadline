import React, { useState, useMemo } from 'react';
import {
  OrderRecord,
  OrderStatus,
  CLINICS_MASTER,
  itemsLabel,
} from '../portalData';
import {
  Search,
  CheckCircle2,
  Clock,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  MapPin,
  Building,
  RotateCcw
} from 'lucide-react';

interface SimpleStatusBarViewProps {
  orders: OrderRecord[];
  batchName: string;
  isCurrentBatch: boolean;
  onOpenTracking: (order: OrderRecord) => void;
  onOpenDeliverySlip: (order: OrderRecord) => void;
  onExportCsv: () => void;
  onSelectClinic: (clinicId: string) => void;
}

type SortKey = 'status' | 'clinic' | 'region' | 'date' | 'qty' | 'hub' | 'invoice';
type SortOrder = 'asc' | 'desc';

export const SimpleStatusBarView: React.FC<SimpleStatusBarViewProps> = ({
  orders,
  batchName,
  isCurrentBatch,
  onOpenTracking,
  onOpenDeliverySlip,
  onExportCsv,
  onSelectClinic,
}) => {
  const [search, setSearch] = useState('');
  const [hubFilter, setHubFilter] = useState<'ALL' | 'NRT' | 'KIX'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'IN_TRANSIT'>('ALL');

  // Sorting state
  const [sortBy, setSortBy] = useState<SortKey>('status');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc'); // asc = in transit first for status

  // Calculate 5-stage progress value (0 to 100%) and stage index (0 to 4)
  const getProgressInfo = (status: OrderStatus) => {
    switch (status) {
      case 'ORDERED':
        return {
          percent: 20,
          stageIdx: 0,
          label: '発注確定',
          color: 'bg-slate-400',
          textColor: 'text-slate-700',
        };
      case 'PREPARING':
        return {
          percent: 30,
          stageIdx: 0,
          label: '出荷待ち',
          color: 'bg-amber-500',
          textColor: 'text-amber-800',
        };
      case 'FEDEX_DISPATCHED':
        return {
          percent: 45,
          stageIdx: 1,
          label: '国際便 集荷済',
          color: 'bg-purple-500',
          textColor: 'text-purple-800',
        };
      case 'IN_TRANSIT_INTL':
        return {
          percent: 60,
          stageIdx: 1,
          label: '国際航空輸送中',
          color: 'bg-indigo-500',
          textColor: 'text-indigo-800',
        };
      case 'CUSTOMS_CLEARANCE':
        return {
          percent: 75,
          stageIdx: 2,
          label: '日本到着・通関中',
          color: 'bg-blue-500',
          textColor: 'text-blue-800',
        };
      case 'SAGAWA_HANDOVER':
        return {
          percent: 85,
          stageIdx: 3,
          label: '佐川急便 引継済',
          color: 'bg-cyan-500',
          textColor: 'text-cyan-800',
        };
      case 'OUT_FOR_DELIVERY':
        return {
          percent: 92,
          stageIdx: 3,
          label: '佐川急便 配達中',
          color: 'bg-teal-500',
          textColor: 'text-teal-800',
        };
      case 'DELIVERED':
        return {
          percent: 100,
          stageIdx: 4,
          label: '配達完了 (受領済)',
          color: 'bg-emerald-500',
          textColor: 'text-emerald-800',
        };
      default:
        return {
          percent: 10,
          stageIdx: 0,
          label: '受付中',
          color: 'bg-slate-400',
          textColor: 'text-slate-700',
        };
    }
  };

  const STAGES_HEADER = [
    { label: '① 出荷準備・梱包', desc: 'シンガポール' },
    { label: '② FedEx・DHL 国際空輸', desc: '航空便輸送' },
    { label: '③ 日本通関審査', desc: '成田 / 関西保税' },
    { label: '④ 佐川急便', desc: '国内配送' },
    { label: '⑤ クリニック納品', desc: '受領完了' },
  ];

  // Toggle sort handler
  const handleSortChange = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  // Filtered and Sorted orders
  const sortedAndFilteredOrders = useMemo(() => {
    // 1. Filter
    const filtered = orders.filter((o) => {
      const matchSearch =
        search === '' ||
        o.clinicName.toLowerCase().includes(search.toLowerCase()) ||
        o.items.some((it) => it.name.toLowerCase().includes(search.toLowerCase())) ||
        o.doctor.toLowerCase().includes(search.toLowerCase()) ||
        o.fedexTracking.includes(search) ||
        o.sagawaTracking.includes(search) ||
        o.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
        o.address.toLowerCase().includes(search.toLowerCase()) ||
        o.region.toLowerCase().includes(search.toLowerCase());

      const matchHub = hubFilter === 'ALL' || o.hub === hubFilter;

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'DELIVERED' && o.status === 'DELIVERED') ||
        (statusFilter === 'IN_TRANSIT' && o.status !== 'DELIVERED');

      return matchSearch && matchHub && matchStatus;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'status': {
          const pA = getProgressInfo(a.status).percent;
          const pB = getProgressInfo(b.status).percent;
          cmp = pA - pB;
          break;
        }
        case 'clinic':
          cmp = itemsLabel(a).localeCompare(itemsLabel(b), 'ja');
          break;
        case 'region':
          cmp = a.region.localeCompare(b.region, 'ja');
          break;
        case 'date': {
          const dateA = a.actualDelivery || a.estimatedDelivery || '';
          const dateB = b.actualDelivery || b.estimatedDelivery || '';
          cmp = dateA.localeCompare(dateB);
          break;
        }
        case 'qty':
          cmp = a.totalQty - b.totalQty;
          break;
        case 'hub':
          cmp = a.hub.localeCompare(b.hub);
          break;
        case 'invoice':
          cmp = a.invoiceNo.localeCompare(b.invoiceNo);
          break;
        default:
          cmp = 0;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [orders, search, hubFilter, statusFilter, sortBy, sortOrder]);

  // Batch average progress
  const avgProgress = useMemo(() => {
    if (orders.length === 0) return 0;
    const sum = orders.reduce((acc, o) => acc + getProgressInfo(o.status).percent, 0);
    return Math.round(sum / orders.length);
  }, [orders]);

  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;
  // 楽々販売の「出荷待ち」（発送準備中以前）は配送中に含めない
  const waitingCount = orders.filter((o) => o.status === 'ORDERED' || o.status === 'PREPARING').length;
  const inTransitCount = orders.length - deliveredCount - waitingCount;

  return (
    <div className="space-y-4">
      {/* 1. Overall Batch Progress Bar (全体の棒状ステータス) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                {batchName}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              ご注文別 配送進捗ステータス
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold text-slate-700">
              全体進捗: <span className="text-blue-600 font-mono text-sm">{avgProgress}%</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-bold">
              配達完了: {deliveredCount} 件
            </span>
            {inTransitCount > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-blue-700 font-bold">
                  配送中: {inTransitCount} 件
                </span>
              </>
            )}
            {waitingCount > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-amber-700 font-bold">
                  出荷待ち: {waitingCount} 件
                </span>
              </>
            )}
          </div>
        </div>

        {/* The Big Overall Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                avgProgress === 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-600'
              }`}
              style={{ width: `${avgProgress}%` }}
            ></div>
          </div>

          {/* 5 Stage Checkpoints */}
          <div className="grid grid-cols-5 gap-1 mt-2.5 text-center">
            {STAGES_HEADER.map((st, i) => {
              const isPast =
                avgProgress >= (i + 1) * 20 || (i === 4 && avgProgress === 100);
              const isCurrent =
                avgProgress >= i * 20 && avgProgress < (i + 1) * 20;

              return (
                <div key={i} className="flex flex-col items-center">
                  <span
                    className={`text-[11px] font-bold ${
                      isPast
                        ? 'text-emerald-700'
                        : isCurrent
                        ? 'text-blue-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {st.label}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 hidden sm:inline">
                    {st.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Controls: Search, Airport Filter, Status Filter & Sorting */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 space-y-3">
        {/* Top Controls Row: Search + Airport filter + CSV Export */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="商品名、追跡番号、クリニック名で検索..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {/* Airport & Status Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            {/* Airport */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => setHubFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                  hubFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全空港 ({orders.length})
              </button>
              <button
                onClick={() => setHubFilter('NRT')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                  hubFilter === 'NRT'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                成田 NRT ({orders.filter((o) => o.hub === 'NRT').length})
              </button>
              <button
                onClick={() => setHubFilter('KIX')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                  hubFilter === 'KIX'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                関西 KIX ({orders.filter((o) => o.hub === 'KIX').length})
              </button>
            </div>

            {/* Status Filter */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                すべて
              </button>
              <button
                onClick={() => setStatusFilter('IN_TRANSIT')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  statusFilter === 'IN_TRANSIT'
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                配送中
              </button>
              <button
                onClick={() => setStatusFilter('DELIVERED')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  statusFilter === 'DELIVERED'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                完了
              </button>
            </div>

            {/* CSV export */}
            <button
              onClick={onExportCsv}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        {/* Sorting Controls Bar (クリニックごとのソート機能) */}
        <div className="pt-2 border-t border-slate-150 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-bold flex items-center gap-1 shrink-0 mr-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
              並び替え:
            </span>

            {/* Sort Buttons */}
            {[
              { key: 'status' as SortKey, label: '進捗ステータス' },
              { key: 'clinic' as SortKey, label: '商品名' },
              { key: 'region' as SortKey, label: '都道府県・エリア' },
              { key: 'date' as SortKey, label: '到着・受領日' },
              { key: 'qty' as SortKey, label: '箱数・数量' },
              { key: 'hub' as SortKey, label: '空港便(NRT/KIX)' },
            ].map((btn) => {
              const isActive = sortBy === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => handleSortChange(btn.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    isActive
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-300'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {btn.label}
                  {isActive && (
                    sortOrder === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-blue-700" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-blue-700" />
                    )
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 font-medium ml-auto">
            該当: <span className="font-bold text-slate-900">{sortedAndFilteredOrders.length}</span> 件表示中
          </div>
        </div>
      </div>

      {/* 3. Simple List with Bar-Shaped Status for Each Clinic */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100">
          {sortedAndFilteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              条件に一致するクリニックがありません。検索キーワードや絞り込み条件をご確認ください。
            </div>
          ) : (
            sortedAndFilteredOrders.map((order) => {
              const info = getProgressInfo(order.status);
              const isDelivered = order.status === 'DELIVERED';

              return (
                <div
                  key={order.id}
                  className="p-3.5 sm:p-4 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                >
                  {/* Left: Clinic Info & Order Details */}
                  <div className="lg:w-1/3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                          order.hub === 'NRT'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {order.hub}便
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {order.invoiceNo}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10px] text-slate-600 font-medium">
                        {order.region}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm mt-0.5 leading-snug" title={order.items.map((it) => `${it.name} ×${it.qty}`).join('\n')}>
                      {itemsLabel(order)}
                    </h3>

                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                      <span
                        onClick={() => {
                          const match = CLINICS_MASTER.find(
                            (c) => c.id === order.clinicId || c.name === order.clinicName
                          );
                          onSelectClinic(match ? match.id : CLINICS_MASTER[0].id);
                        }}
                        className="hover:text-blue-600 hover:underline cursor-pointer"
                        title="クリックしてこのクリニックの個別ビューへ移動"
                      >
                        {order.clinicName}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/50">
                        数量: {order.totalQty}箱
                      </span>
                    </div>
                    {order.notice && (
                      <div className="mt-1 text-[11px] leading-snug text-violet-800 bg-violet-50 border border-violet-200 rounded px-2 py-1 whitespace-pre-wrap">
                        お知らせ：{order.notice}
                      </div>
                    )}

                  </div>

                  {/* Center: The Bar-Shaped Status (棒状ステータスバー) */}
                  <div className="lg:w-5/12 bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={`font-bold flex items-center gap-1.5 ${info.textColor}`}>
                        {isDelivered ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-blue-600" />
                        )}
                        {info.stageIdx === 1 ? `${order.intlCarrier} ${info.label}` : info.label}
                      </span>
                      <span className="font-mono font-bold text-slate-700">
                        {info.percent}%
                      </span>
                    </div>

                    {/* The Visual Progress Bar (棒状) */}
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isDelivered
                            ? 'bg-emerald-500'
                            : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                        }`}
                        style={{ width: `${info.percent}%` }}
                      ></div>
                    </div>

                    {/* 5 Stage steps below the bar */}
                    <div className="grid grid-cols-5 text-[9px] text-slate-400 text-center mt-1.5 font-medium">
                      <span className={info.stageIdx >= 0 ? 'text-slate-800 font-bold' : ''}>
                        ①SG梱包
                      </span>
                      <span className={info.stageIdx >= 1 ? 'text-slate-800 font-bold' : ''}>
                        ②{order.intlCarrier}
                      </span>
                      <span className={info.stageIdx >= 2 ? 'text-slate-800 font-bold' : ''}>
                        ③通関
                      </span>
                      <span className={info.stageIdx >= 3 ? 'text-slate-800 font-bold' : ''}>
                        ④佐川急便
                      </span>
                      <span className={info.stageIdx >= 4 ? 'text-emerald-700 font-bold' : ''}>
                        ⑤納品受領
                      </span>
                    </div>
                  </div>

                  {/* Right: Date & Action Buttons */}
                  <div className="lg:w-1/4 flex lg:flex-col items-center lg:items-end justify-between gap-2">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">
                        {isDelivered ? '受領完了日' : '到着予定日'}
                      </div>
                      <div className="text-xs font-bold font-mono text-slate-800">
                        {isDelivered ? order.actualDelivery : order.estimatedDelivery}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenTracking(order)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                      >
                        詳細
                      </button>
                      <button
                        onClick={() => onOpenDeliverySlip(order)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-300 transition-colors cursor-pointer shadow-2xs"
                      >
                        伝票
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
