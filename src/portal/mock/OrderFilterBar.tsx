import React from 'react';
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  Plane,
  MapPin,
  ArrowUpDown,
  LayoutGrid,
  List
} from 'lucide-react';
import { OrderStatus } from '../portalData';

interface OrderFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: OrderStatus | 'ALL';
  onStatusFilterChange: (status: OrderStatus | 'ALL') => void;
  hubFilter: 'ALL' | 'NRT' | 'KIX';
  onHubFilterChange: (hub: 'ALL' | 'NRT' | 'KIX') => void;
  regionFilter: string;
  onRegionFilterChange: (region: string) => void;
  sortBy: 'invoice' | 'clinic' | 'status' | 'qty';
  onSortByChange: (sortBy: 'invoice' | 'clinic' | 'status' | 'qty') => void;
  layoutMode: 'cards' | 'table';
  onLayoutModeChange: (mode: 'cards' | 'table') => void;
  onResetFilters: () => void;
  onExportCsv: () => void;
  totalFilteredCount: number;
}

const REGIONS = [
  'ALL',
  '北海道',
  '東北',
  '関東',
  '中部・東海',
  '近畿・関西',
  '中国',
  '四国',
  '九州・沖縄'
];

export const OrderFilterBar: React.FC<OrderFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  hubFilter,
  onHubFilterChange,
  regionFilter,
  onRegionFilterChange,
  sortBy,
  onSortByChange,
  layoutMode,
  onLayoutModeChange,
  onResetFilters,
  onExportCsv,
  totalFilteredCount,
}) => {
  const isFiltered =
    searchQuery !== '' ||
    statusFilter !== 'ALL' ||
    hubFilter !== 'ALL' ||
    regionFilter !== 'ALL';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 mb-4 space-y-3">
      {/* Top Search & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="クリニック名、院長名、追跡番号(FedEx・DHL/佐川)、インボイス番号、住所で検索..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right side buttons & Layout toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Layout mode switcher */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
            <button
              onClick={() => onLayoutModeChange('cards')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                layoutMode === 'cards'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ビジュアルカード表示"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">カード</span>
            </button>
            <button
              onClick={() => onLayoutModeChange('table')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                layoutMode === 'table'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="詳細リスト表表示"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">リスト</span>
            </button>
          </div>

          {isFiltered && (
            <button
              onClick={onResetFilters}
              className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              クリア
            </button>
          )}

          <button
            onClick={onExportCsv}
            className="px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="現在の検索・絞り込み結果をCSV形式で保存"
          >
            <Download className="w-3.5 h-3.5" />
            CSV出力 ({totalFilteredCount}件)
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1 text-slate-500 font-medium">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>絞り込み:</span>
        </div>

        {/* Airport Hub Filter */}
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
          <Plane className="w-3 h-3 text-slate-400 mr-1" />
          <span className="text-slate-500 mr-1">入港空港:</span>
          <select
            value={hubFilter}
            onChange={(e) => onHubFilterChange(e.target.value as 'ALL' | 'NRT' | 'KIX')}
            className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">すべて (全空港)</option>
            <option value="NRT">成田国際空港 (NRT)</option>
            <option value="KIX">関西国際空港 (KIX)</option>
          </select>
        </div>

        {/* Region Filter */}
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
          <MapPin className="w-3 h-3 text-slate-400 mr-1" />
          <span className="text-slate-500 mr-1">エリア:</span>
          <select
            value={regionFilter}
            onChange={(e) => onRegionFilterChange(e.target.value)}
            className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">全エリア (全国)</option>
            {REGIONS.filter((r) => r !== 'ALL').map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-2 py-1 ml-auto">
          <ArrowUpDown className="w-3 h-3 text-slate-400 mr-1" />
          <span className="text-slate-500 mr-1">並び替え:</span>
          <select
            value={sortBy}
            onChange={(e) =>
              onSortByChange(e.target.value as 'invoice' | 'clinic' | 'status' | 'qty')
            }
            className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="invoice">インボイス番号順</option>
            <option value="clinic">クリニック名順 (50音)</option>
            <option value="status">配送進捗順 (未達 ➔ 配達完了)</option>
            <option value="qty">発注数量順 (多い順)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
