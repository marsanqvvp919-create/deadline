import React, { useState, useMemo, useEffect } from 'react';
import { ProductItem, Order } from '../types';
import { fetchProductsMaster, saveLocalProducts, getLocalProducts } from '../api';
import {
  Package,
  Search,
  Filter,
  RefreshCw,
  Upload,
  Download,
  Database,
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ShoppingBag,
  Building2,
  DollarSign,
  TrendingUp,
  Tag,
  ChevronRight,
  X,
  Copy,
  Check,
  Edit2,
  Trash2
} from 'lucide-react';
import { RakurakuSchemaModal } from './RakurakuSchemaModal';
import { CsvImportModal } from './CsvImportModal';
import { isShippingOrFee, formatDateTime } from '../utils';

interface ProductMasterViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order, lineKey?: string) => void;
}

export const ProductMasterView: React.FC<ProductMasterViewProps> = ({
  orders,
  onSelectOrder,
}) => {
  const [products, setProducts] = useState<ProductItem[]>(getLocalProducts());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [syncSource, setSyncSource] = useState<string>('synced_master');
  const [copiedIp, setCopiedIp] = useState<boolean>(false);
  const [serverIp, setServerIp] = useState<string>('34.34.226.64');

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals & Drawer States
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<ProductItem>>({});
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleConfirmDeleteProduct = () => {
    if (!productToDelete) return;
    const targetId = productToDelete.productId;
    const updated = products.filter((p) => p.productId !== targetId);
    setProducts(updated);
    saveLocalProducts(updated);
    showToast(`商品「${productToDelete.productName}」(${targetId}) を削除しました`);
    setProductToDelete(null);
    if (selectedProduct?.productId === targetId) setSelectedProduct(null);
    if (editForm.productId === targetId) setIsEditModalOpen(false);
  };

  // 初回同期確認
  useEffect(() => {
    handleSync(false);
  }, []);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleSync = async (isManual = true) => {
    if (isManual) setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetchProductsMaster();
      setProducts(res.data);
      setLastSyncTime(res.lastSyncTime);
      setSyncSource(res.source);
      if (res.serverIp) setServerIp(res.serverIp);
      if (res.error) {
        setSyncError(res.error);
      }
    } catch (err: any) {
      setSyncError(err?.message || '商品マスタの同期に失敗しました');
    } finally {
      if (isManual) {
        setTimeout(() => setIsSyncing(false), 400);
      }
    }
  };

  // 注文管理（101248）との突合計算: 各商品の現在発注状況
  const productOrderStats = useMemo(() => {
    const stats: Record<string, { orderCount: number; totalQty: number; orders: { order: Order; qty: number; stage: string }[] }> = {};
    const byName: typeof stats = {};

    orders.forEach((ord) => {
      // 「進行中」は、見積と出荷・納品が終わった伝票を除き、まだ出荷されていない明細だけを数える
      if ((ord.status || '').includes('見積')) return;
      if (ord.orderState === '納品完了' || ord.orderState === '全明細出荷済') return;
      ord.lines.forEach((line) => {
        if (isShippingOrFee(line.productName, line.productId)) return;
        if (line.stage === '出荷完了') return;
        // ID一致または商品名一致で結合
        const key = line.productId || line.productName;
        if (!stats[key]) {
          stats[key] = { orderCount: 0, totalQty: 0, orders: [] };
        }
        stats[key].orderCount += 1;
        stats[key].totalQty += line.quantity;
        stats[key].orders.push({
          order: ord,
          qty: line.quantity,
          stage: line.stage,
        });

        // 商品名でも引けるように補助（件数を二重に数えないよう、別の表に持つ）
        if (line.productName && !byName[line.productName]) {
          byName[line.productName] = stats[key];
        }
      });
    });

    return { byId: stats, byName };
  }, [orders]);
  const statOf = (p: { productId: string; productName: string }) =>
    productOrderStats.byId[p.productId] || productOrderStats.byName[p.productName];
  // 粗利率は販売単価と仕入単価が同じ円建てのときだけ出す（KRW・USD などの仕入は換算前なので計算しない）
  const marginOf = (p: { standardPrice: number; costPrice: number; costCurrency: string }): number | null =>
    p.standardPrice > 0 && p.costPrice > 0 && p.costCurrency === 'JPY'
      ? Math.round(((p.standardPrice - p.costPrice) / p.standardPrice) * 100)
      : null;
  const jpyMargins = products.map(marginOf).filter((m): m is number => m !== null);
  const leadTimeText = (p: { minLeadTime: number; maxLeadTime: number }) =>
    p.minLeadTime || p.maxLeadTime ? `${p.minLeadTime}〜${p.maxLeadTime}日` : '—';

  // カテゴリ一覧
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // 仕入先一覧
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.supplierName) set.add(p.supplierName);
    });
    return Array.from(set).sort();
  }, [products]);

  // フィルタ適用
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (isShippingOrFee(p.productName, p.productId)) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedSupplier !== 'all' && p.supplierName !== selectedSupplier) return false;
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = p.productId.toLowerCase().includes(q);
        const matchName = p.productName.toLowerCase().includes(q);
        const matchCategory = p.category.toLowerCase().includes(q);
        const matchSup = p.supplierName.toLowerCase().includes(q);
        const matchOrigin = p.countryOfOrigin.toLowerCase().includes(q);
        if (!matchId && !matchName && !matchCategory && !matchSup && !matchOrigin) return false;
      }

      return true;
    });
  }, [products, selectedCategory, selectedSupplier, selectedStatus, searchQuery]);

  // CSVエクスポート
  const handleExportCsv = () => {
    const headers = ['109958(商品ID)', '109992(商品名)', 'カテゴリ', '規格', '110002(標準販売単価)', '110007(仕入単価)', '110124(通貨)', '110006(仕入先名)', '110169(製造国)', '110012(下限納期)', '110013(上限納期)', 'ステータス', '備考'];
    const rows = filteredProducts.map((p) => [
      `"${p.productId}"`,
      `"${p.productName}"`,
      `"${p.category}"`,
      `"${p.spec}"`,
      p.standardPrice,
      p.costPrice,
      `"${p.costCurrency}"`,
      `"${p.supplierName}"`,
      `"${p.countryOfOrigin}"`,
      p.minLeadTime,
      p.maxLeadTime,
      `"${p.status}"`,
      `"${p.memo || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `商品マスタ_101252_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (product: ProductItem) => {
    setEditForm({ ...product });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editForm.productId) return;
    const updated = products.map((p) =>
      p.productId === editForm.productId ? ({ ...p, ...editForm, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) } as ProductItem) : p
    );
    setProducts(updated);
    saveLocalProducts(updated, 'synced_master');
    setIsEditModalOpen(false);
    if (selectedProduct && selectedProduct.productId === editForm.productId) {
      setSelectedProduct({ ...selectedProduct, ...editForm } as ProductItem);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      
      {/* 楽楽販売連携 バナー & アクションヘッダー */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  商品マスタ管理
                </h1>
                <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md">
                  dbSchemaId: 101252
                </span>
                <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md">
                  キー項目: 109958 (商品ID)
                </span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  楽楽販売 DBグループ: Number1
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ご注文管理（101248）の注文明細行（109991: 商品ID）と自動突合し、在庫・引当・販売単価を集中管理
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSync(true)}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '楽楽販売と同期中...' : '楽楽販売から最新同期'}</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV取込</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV出力</span>
            </button>

            <button
              onClick={() => setIsSchemaModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>スキーマ表</span>
            </button>
          </div>
        </div>

        {/* Sync Info / IP Notice */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 text-slate-600 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>データ反映元: <b>{syncSource === 'rakuraku_api' ? '楽楽販売 API直接連携' : syncSource === 'rakuraku_csv' ? '楽楽販売 CSVインポート' : '楽楽販売 同期マスタ'}</b></span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">最終更新: {lastSyncTime ? formatDateTime(lastSyncTime) : '—'}</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700">登録品目数: {products.length} 品目</span>
          </div>

          {syncError && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>IP制限待機中（当サーバーIP: {serverIp}）</span>
              <button
                onClick={handleCopyIp}
                className="underline hover:text-amber-900 cursor-pointer font-bold ml-1"
              >
                {copiedIp ? 'コピー済' : 'IPをコピー'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">全登録商品数</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{products.length}</span>
            <span className="text-xs text-slate-500">品目</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">ご注文管理で受注進行中</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600 font-mono">
              {Object.keys(productOrderStats.byId).length}
            </span>
            <span className="text-xs text-slate-500">品目稼働中</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">平均粗利率（円建て仕入のみ）</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {jpyMargins.length > 0 ? `${Math.round(jpyMargins.reduce((a, b) => a + b, 0) / jpyMargins.length)}%` : '—'}
            </span>
            <span className="text-xs text-slate-500">{jpyMargins.length}品目で計算</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">仕入先が未入力</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 font-mono">
              {products.filter((p) => !p.supplierName).length}
            </span>
            <span className="text-xs text-slate-500">品目（楽楽販売で入力すると発注先がわかります）</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input autoComplete="off"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="商品名、商品ID（PRD-xxx）、仕入先、製造国で検索..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* カテゴリ */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべてのカテゴリ</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* 仕入先 */}
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべての仕入先</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* ステータス */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべてのステータス</option>
            <option value="取扱中">取扱中</option>
            <option value="在庫僅少">在庫僅少</option>
            <option value="入荷待ち">入荷待ち</option>
            <option value="取扱終了">取扱終了</option>
          </select>
        </div>
      </div>

      {/* Main Products Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="data-table-wrap overflow-x-auto">
          <table className="tbl-product w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5">楽楽ID (109958)</th>
                <th className="py-3 px-3.5">商品名 / 規格</th>
                <th className="py-3 px-3.5">カテゴリ</th>
                <th className="py-3 px-3.5 text-right">標準販売単価</th>
                <th className="py-3 px-3.5 text-right">仕入単価 (原価)</th>
                <th className="py-3 px-3.5 text-right">粗利率</th>
                <th className="py-3 px-3.5">仕入先名 (110006)</th>
                <th className="py-3 px-3.5">製造国</th>
                <th className="py-3 px-3.5">標準納期</th>
                <th className="py-3 px-3.5 text-center">注文管理連携 (101248)</th>
                <th className="py-3 px-3.5">状況</th>
                <th className="py-3 px-3.5 text-center">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredProducts.map((p, idx) => {
                const stat = statOf(p);
                const marginRate = marginOf(p);

                return (
                  <tr
                    key={`${p.productId}_${idx}`}
                    className="hover:bg-blue-50/40 transition cursor-pointer group"
                    onClick={() => setSelectedProduct(p)}
                  >
                    <td className="py-3 px-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                      {p.productId}
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900 group-hover:text-blue-700 transition">
                        {p.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        {p.spec}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-600">
                      {p.category || '—'}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      ¥{p.standardPrice.toLocaleString()}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-slate-600 whitespace-nowrap">
                      {p.costCurrency && p.costCurrency !== 'JPY'
                        ? `${p.costPrice.toLocaleString()} ${p.costCurrency}`
                        : `¥${p.costPrice.toLocaleString()}`}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                      {marginRate !== null ? `${marginRate}%` : <span className="text-slate-400 font-normal">—</span>}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-700">
                      {p.supplierName || <span className="text-amber-700">未入力</span>}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-600">
                      {p.countryOfOrigin || '—'}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {leadTimeText(p)}
                    </td>
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      {stat && stat.orderCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                          <ShoppingBag className="w-3 h-3 text-blue-600" />
                          <span>進行中 {stat.orderCount}件 ({stat.totalQty}個)</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">現在受注なし</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          p.status === '取扱中'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === '在庫僅少'
                            ? 'bg-amber-100 text-amber-800'
                            : p.status === '入荷待ち'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.status || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(p);
                          }}
                          className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
                          title="詳細ドロワーを開く"
                        >
                          <ChevronRight className="w-4 h-4" />
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

      {/* Product Detail Slideover Drawer */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedProduct(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
              
              {/* Drawer Header */}
              <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-400 font-bold">
                      {selectedProduct.productId}
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                      schemaId: 101252
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1 leading-snug">
                    {selectedProduct.productName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Status & Edit Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    取扱ステータス: <b>{selectedProduct.status || "—"}</b>
                  </span>
                  <div className="flex items-center gap-2">
                  </div>
                </div>

                {/* Rakuraku Field Items Definition Map */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-600" />
                    <span>楽楽販売 項目マッピング（整理表対照）</span>
                  </h4>
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">109958: キー項目 [商品ID]</span>
                      <span className="font-mono font-bold text-slate-900">{selectedProduct.productId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">109992: 商品名</span>
                      <span className="font-semibold text-slate-900">{selectedProduct.productName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">109961: 規格・容量</span>
                      <span className="text-slate-800">{selectedProduct.spec}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">110002: 標準販売単価</span>
                      <span className="font-mono font-bold text-slate-900">¥{selectedProduct.standardPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">109994: 下限販売単価</span>
                      <span className="font-mono text-slate-700">¥{selectedProduct.minPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">109995: 上限販売単価</span>
                      <span className="font-mono text-slate-700">¥{selectedProduct.maxPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">110007: 仕入単価 (110124: 通貨)</span>
                      <span className="font-mono text-slate-800">{selectedProduct.costPrice.toLocaleString()} {selectedProduct.costCurrency || ''}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">110006: 仕入先名 (110005: ID)</span>
                      <span className="text-slate-800">{selectedProduct.supplierName} ({selectedProduct.supplierId})</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">110169: 製造国ID (製造国マスタ)</span>
                      <span className="text-slate-800">{selectedProduct.countryOfOrigin || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">110012〜110013: 標準納期（日）</span>
                      <span className="font-mono text-slate-800">{leadTimeText(selectedProduct)}</span>
                    </div>
                  </div>
                </div>

                {/* ご注文管理（101248）とのリアルタイム連携状況 */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                    <span>ご注文管理（101248）での現在稼働中伝票</span>
                  </h4>

                  {(() => {
                    const stat = statOf(selectedProduct);
                    if (!stat || stat.orders.length === 0) {
                      return (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 text-center">
                          現在この商品の進行中注文はありません。
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <div className="text-xs text-slate-600 font-medium">
                          合計発注数: <b className="text-blue-700">{stat.totalQty} 個</b> ({stat.orders.length} 件の伝票)
                        </div>

                        {stat.orders.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              if (onSelectOrder) {
                                onSelectOrder(item.order);
                                setSelectedProduct(null);
                              }
                            }}
                            className="p-3 bg-white border border-slate-200 hover:border-blue-400 rounded-xl transition cursor-pointer shadow-2xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-bold text-blue-700">
                                {item.order.orderId}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {item.qty} 個
                              </span>
                            </div>
                            <div className="text-xs text-slate-700 font-medium">
                              {item.order.customerName}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>担当: {item.order.salesRep}</span>
                              <span className="text-blue-600 font-medium">{item.stage}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Memo */}
                {selectedProduct.memo && (
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-700">備考</span>
                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {selectedProduct.memo}
                    </p>
                  </div>
                )}

              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  閉じる
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              商品情報編集 ({editForm.productId})
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">標準販売単価 (円)</label>
                <input
                  type="number"
                  value={editForm.standardPrice || 0}
                  onChange={(e) => setEditForm({ ...editForm, standardPrice: parseInt(e.target.value, 10) || 0 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">仕入単価 (円)</label>
                <input
                  type="number"
                  value={editForm.costPrice || 0}
                  onChange={(e) => setEditForm({ ...editForm, costPrice: parseInt(e.target.value, 10) || 0 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">取扱ステータス</label>
                <select
                  value={editForm.status || '取扱中'}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="取扱中">取扱中</option>
                  <option value="在庫僅少">在庫僅少</option>
                  <option value="入荷待ち">入荷待ち</option>
                  <option value="取扱終了">取扱終了</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">備考</label>
                <textarea
                  value={editForm.memo || ''}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  rows={3}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Deletion Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">商品の削除確認</h4>
                <p className="text-xs text-slate-500 font-mono">{productToDelete.productId}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              商品「<b className="text-slate-900">{productToDelete.productName}</b>」を商品マスタから削除してもよろしいですか？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Schema Definition Modal */}
      <RakurakuSchemaModal
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
        activeSchemaId="101252"
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        type="products"
        onImportProducts={(imported) => {
          setProducts(imported);
          saveLocalProducts(imported, 'rakuraku_csv');
          setLastSyncTime(new Date().toISOString().replace('T', ' ').slice(0, 16));
          setSyncSource('rakuraku_csv');
        }}
      />

    </div>
  );
};
