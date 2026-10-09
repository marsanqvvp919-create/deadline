import React, { useState, useEffect } from 'react';
import { Order, WarehouseStockRecord } from '../types';
import { isShippingOrFee } from '../utils';
import {
  Building,
  Package,
  Globe,
  AlertTriangle,
  Search,
  CheckCircle2,
  MapPin,
  Upload,
  RotateCcw,
  Calendar,
  FileSpreadsheet,
  Trash2,
  Info
} from 'lucide-react';

interface InventoryManagementViewProps {
  orders: Order[];
}

const STORAGE_WAREHOUSE_STOCK_KEY = 'nouki_multi_warehouse_stock_v3';

export const InventoryManagementView: React.FC<InventoryManagementViewProps> = ({ orders }) => {
  const [selectedWarehouse, setSelectedWarehouse] = useState<'all' | 'korea' | 'singapore'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');
  const [csvMessage, setCsvMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [clearBeforeImport, setClearBeforeImport] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  // Initialize stock records: Korea stock starts at 0 (CLEARED state) by default
  const [stockRecords, setStockRecords] = useState<WarehouseStockRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WAREHOUSE_STOCK_KEY);
      if (raw) {
        // シンガポール倉庫の数値は取り込み元が無く、以前は商品IDから作った架空の値が保存されていたため0に戻す
        return (JSON.parse(raw) as WarehouseStockRecord[]).map((r) => ({
          ...r,
          singaporeStock: 0,
          singaporeSafetyStock: 0,
          inTransitSingapore: 0,
          reservedSingapore: 0,
        }));
      }
    } catch {}

    const map = new Map<string, WarehouseStockRecord>();
    orders.forEach((ord) => {
      ord.lines.forEach((l) => {
        if (isShippingOrFee(l.productName, l.productId)) return;
        if (!map.has(l.productId)) {
          // 在庫はCSV取り込み（韓国倉庫）で入る実数だけを使う。取り込み前はすべて0
          map.set(l.productId, {
            productId: l.productId,
            productName: l.productName,
            koreaStock: 0,
            singaporeStock: 0,
            koreaSafetyStock: 0,
            singaporeSafetyStock: 0,
            inTransitKorea: 0,
            inTransitSingapore: 0,
            reservedKorea: 0,
            reservedSingapore: 0,
            preferredWarehouse: 'korea',
          });
        }
      });
    });
    return Array.from(map.values());
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WAREHOUSE_STOCK_KEY, JSON.stringify(stockRecords));
    } catch {}
  }, [stockRecords]);

  // Handle clearing Korea inventory to 0
  const handleClearKoreaStock = () => {
    setStockRecords((prev) =>
      prev.map((item) => ({
        ...item,
        koreaStock: 0,
        reservedKorea: 0,
        companyName: undefined,
        expirationDate: undefined,
        registrationDate: undefined,
        updatedDate: undefined,
      }))
    );
    setConfirmClearOpen(false);
  };

  // CSV file reading
  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvText(text);
      setCsvMessage({ text: `ファイル「${file.name}」を読み込みました。下のボタンで反映できます。` });
    };
    reader.onerror = () => {
      setCsvMessage({ text: 'ファイルの読み込みに失敗しました。', isError: true });
    };
    reader.readAsText(file);
  };

  const handleImportCsv = () => {
    if (!csvText.trim()) {
      setCsvMessage({ text: 'CSVデータを入力またはファイルを選択してください。', isError: true });
      return;
    }
    try {
      const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 2) {
        setCsvMessage({ text: '有効なヘッダー行およびデータ行が見つかりません。', isError: true });
        return;
      }

      // Detect header columns
      const headerCols = lines[0].split(',').map((c) => c.trim().replace(/^["'\s]+|["'\s]+$/g, ''));
      let colIdxNo = -1;
      let colIdxCompany = -1;
      let colIdxName = -1;
      let colIdxCode = -1;
      let colIdxQty = -1;
      let colIdxExp = -1;
      let colIdxReg = -1;
      let colIdxUpd = -1;

      headerCols.forEach((col, idx) => {
        const lower = col.toLowerCase();
        if (col.includes('번호') || lower === 'no') colIdxNo = idx;
        else if (col.includes('회사') || col.includes('会社') || lower.includes('company')) colIdxCompany = idx;
        else if (col.includes('製品名') || col.includes('제품명') || col.includes('품명') || lower.includes('name')) colIdxName = idx;
        else if (col.includes('製品コード') || col.includes('제품코드') || col.includes('품번') || col.includes('コード') || lower.includes('code')) colIdxCode = idx;
        else if (col.includes('수량') || col.includes('数量') || lower.includes('qty') || lower.includes('quantity')) colIdxQty = idx;
        else if (col.includes('유통기한') || col.includes('期限') || lower.includes('exp')) colIdxExp = idx;
        else if (col.includes('등록일') || col.includes('登録日') || lower.includes('reg')) colIdxReg = idx;
        else if (col.includes('업데이트') || col.includes('更新日') || lower.includes('update')) colIdxUpd = idx;
      });

      // Default fallback if headers weren't named exactly:
      // Expected default: 0:번호, 1:회사명, 2:제품명, 3:제품코드, 4:수량, 5:유통기한, 6:등록일, 7:업데이트
      if (colIdxName === -1 && headerCols.length >= 3) colIdxName = 2;
      if (colIdxCode === -1 && headerCols.length >= 4) colIdxCode = 3;
      if (colIdxQty === -1 && headerCols.length >= 5) colIdxQty = 4;
      if (colIdxCompany === -1 && headerCols.length >= 2) colIdxCompany = 1;
      if (colIdxExp === -1 && headerCols.length >= 6) colIdxExp = 5;
      if (colIdxReg === -1 && headerCols.length >= 7) colIdxReg = 6;
      if (colIdxUpd === -1 && headerCols.length >= 8) colIdxUpd = 7;

      let importedCount = 0;

      setStockRecords((prev) => {
        const map = new Map<string, WarehouseStockRecord>();
        const nameMap = new Map<string, WarehouseStockRecord>();

        // If clearBeforeImport is active, reset existing Korea stock to 0 first!
        prev.forEach((r) => {
          const clone: WarehouseStockRecord = {
            ...r,
            koreaStock: clearBeforeImport ? 0 : r.koreaStock,
            reservedKorea: clearBeforeImport ? 0 : r.reservedKorea,
            companyName: clearBeforeImport ? undefined : r.companyName,
            expirationDate: clearBeforeImport ? undefined : r.expirationDate,
            registrationDate: clearBeforeImport ? undefined : r.registrationDate,
            updatedDate: clearBeforeImport ? undefined : r.updatedDate,
          };
          map.set(clone.productId.toLowerCase(), clone);
          nameMap.set(clone.productName.toLowerCase(), clone);
        });

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map((c) => c.trim().replace(/^["'\s]+|["'\s]+$/g, ''));
          if (row.length < 2) continue;

          const productName = (colIdxName >= 0 && row[colIdxName]) || `商品-${i}`;
          const productCode = (colIdxCode >= 0 && row[colIdxCode]) || `CODE-${i}`;
          const rawQty = (colIdxQty >= 0 && row[colIdxQty]) || '0';
          const qty = parseInt(rawQty, 10) || 0;

          const companyName = colIdxCompany >= 0 ? row[colIdxCompany] : undefined;
          const expirationDate = colIdxExp >= 0 ? row[colIdxExp] : undefined;
          const registrationDate = colIdxReg >= 0 ? row[colIdxReg] : undefined;
          const updatedDate = colIdxUpd >= 0 ? row[colIdxUpd] : undefined;

          const existing = map.get(productCode.toLowerCase()) || nameMap.get(productName.toLowerCase());
          if (existing) {
            existing.koreaStock = qty;
            if (companyName) existing.companyName = companyName;
            if (expirationDate) existing.expirationDate = expirationDate;
            if (registrationDate) existing.registrationDate = registrationDate;
            if (updatedDate) existing.updatedDate = updatedDate;
            importedCount++;
          } else {
            // New item introduced from Korean inventory CSV
            const newRecord: WarehouseStockRecord = {
              productId: productCode,
              productName: productName,
              koreaStock: qty,
              singaporeStock: 0,
              koreaSafetyStock: 10,
              singaporeSafetyStock: 0,
              inTransitKorea: 0,
              inTransitSingapore: 0,
              reservedKorea: 0,
              reservedSingapore: 0,
              preferredWarehouse: 'korea',
              companyName,
              expirationDate,
              registrationDate,
              updatedDate,
            };
            map.set(productCode.toLowerCase(), newRecord);
            importedCount++;
          }
        }

        return Array.from(map.values());
      });

      setCsvMessage({
        text: `【成功】韓国在庫を${clearBeforeImport ? '一旦クリアした上で' : ''}合計 ${importedCount} 件反映しました！`,
        isError: false,
      });

      setTimeout(() => {
        setIsCsvModalOpen(false);
        setCsvText('');
        setCsvMessage(null);
      }, 1500);
    } catch (err: any) {
      setCsvMessage({ text: 'エラー: ' + (err.message || 'CSVの解析に失敗しました'), isError: true });
    }
  };

  // Filtered records
  const filteredRecords = stockRecords.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.productName.toLowerCase().includes(q) ||
      item.productId.toLowerCase().includes(q) ||
      (item.companyName && item.companyName.toLowerCase().includes(q));

    if (selectedWarehouse === 'korea') {
      return matchesSearch && item.koreaStock > 0;
    }
    if (selectedWarehouse === 'singapore') {
      return matchesSearch && item.singaporeStock > 0;
    }
    return matchesSearch;
  });

  // KPI Calculations
  const totalKoreaStock = stockRecords.reduce((sum, r) => sum + r.koreaStock, 0);
  const totalSingaporeStock = stockRecords.reduce((sum, r) => sum + r.singaporeStock, 0);
  const koreaItemCountWithStock = stockRecords.filter((r) => r.koreaStock > 0).length;
  const isKoreaCleared = totalKoreaStock === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
              <Building className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">
                  韓国・シンガポール倉庫 在庫管理
                </h1>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 font-mono">
                  韓国倉庫 (KR) & シンガポール倉庫 (SIN)
                </span>
                {isKoreaCleared ? (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                    <Info className="w-3 h-3" /> 韓国在庫クリア済（0件）
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 韓国在庫反映中 ({koreaItemCountWithStock}品目)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                韓国倉庫のCSVファイルを放り込む（ドラッグ＆ドロップ）だけで、製品コード・数量・有効期限・会社名などの付随データを一括反映できます。在庫クリアからの新規反映にも対応しています。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setConfirmClearOpen(true)}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="韓国在庫を一旦すべて0件にリセットします"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 韓国在庫をクリア
            </button>

            <button
              onClick={() => {
                setClearBeforeImport(true);
                setIsCsvModalOpen(true);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4" /> 韓国在庫 CSVインポート
            </button>
          </div>
        </div>

        {/* Clear Notice Banner when Korea Stock is 0 */}
        {isKoreaCleared && (
          <div className="mt-5 p-3.5 bg-blue-900/30 border border-blue-700/40 rounded-2xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-blue-200">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                韓国在庫は現在クリアされた状態（0点）です。対象のCSVファイルをインポートすると、製品コードや数量、付随データ（会社名・有効期限等）がそのまま反映されます。
              </span>
            </div>
            <button
              onClick={() => {
                setClearBeforeImport(true);
                setIsCsvModalOpen(true);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shrink-0 transition flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSVを放り込んで反映
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>韓国倉庫 (KR) 在庫合計</span>
              <span className={`w-2 h-2 rounded-full ${isKoreaCleared ? 'bg-amber-400' : 'bg-blue-400'}`} />
            </div>
            <span className="text-2xl font-extrabold font-mono text-white">{totalKoreaStock.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isKoreaCleared ? '※クリア状態（未登録）' : `登録在庫: ${koreaItemCountWithStock}品目`}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>シンガポール倉庫 (SIN) 在庫</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <span className="text-lg font-bold text-slate-300">未連携</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">在庫データの取り込み元がまだありません</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>登録総品目数</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-2xl font-extrabold font-mono text-emerald-400">{stockRecords.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">全カタログ連携済</span>
          </div>
        </div>
      </div>

      {/* Warehouse Selector & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pb-2 sm:pb-0">
          {[
            { id: 'all', label: '全倉庫表示', icon: Globe },
            { id: 'korea', label: `韓国倉庫 (KR) ${totalKoreaStock > 0 ? `(${totalKoreaStock})` : '(0)'}`, icon: Building },
            { id: 'singapore', label: 'シンガポール倉庫 (SIN)（未連携）', icon: MapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = selectedWarehouse === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedWarehouse(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input autoComplete="off"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="商品名・コード・会社名で検索..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            倉庫別 在庫一覧
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>表示中: <strong className="text-slate-800 font-mono">{filteredRecords.length}</strong> 品目</span>
            {totalKoreaStock > 0 && (
              <span className="text-blue-600 font-bold">
                韓国在庫保有: {koreaItemCountWithStock} 品目
              </span>
            )}
          </div>
        </div>

        <div className="data-table-wrap overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">商品コード / 品名 / 付随データ</th>
                {(selectedWarehouse === 'all' || selectedWarehouse === 'korea') && (
                  <th className="py-3 px-4 text-right bg-blue-50/50">韓国倉庫 (KR) 在庫</th>
                )}
                {(selectedWarehouse === 'all' || selectedWarehouse === 'singapore') && (
                  <th className="py-3 px-4 text-right bg-indigo-50/50">シンガポール (SIN) 在庫（未連携）</th>
                )}
                <th className="py-3 px-4 text-center">在庫ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400">
                    該当する在庫データがありません
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 block">{item.productName}</span>
                          {item.companyName && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {item.companyName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-400 font-mono">
                          <span>ID: {item.productId}</span>
                          {item.expirationDate && (
                            <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                              <Calendar className="w-3 h-3 text-amber-600" /> 期限: {item.expirationDate}
                            </span>
                          )}
                          {item.updatedDate && (
                            <span className="text-slate-400">
                              更新: {item.updatedDate}
                            </span>
                          )}
                        </div>
                      </td>

                      {(selectedWarehouse === 'all' || selectedWarehouse === 'korea') && (
                        <td className="py-3 px-4 text-right bg-blue-50/20 font-mono">
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`text-sm font-bold ${
                                item.koreaStock === 0
                                  ? 'text-slate-400'
                                  : 'text-blue-700'
                              }`}
                            >
                              {item.koreaStock.toLocaleString()}
                            </span>
                          </div>
                          {item.koreaStock === 0 ? (
                            <span className="text-[10px] text-slate-400 block">在庫なし(0)</span>
                          ) : (
                            <span className="text-[10px] text-blue-500 block">KR在庫有</span>
                          )}
                        </td>
                      )}

                      {(selectedWarehouse === 'all' || selectedWarehouse === 'singapore') && (
                        <td className="py-3 px-4 text-right bg-indigo-50/20 font-mono">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-sm font-bold text-slate-900">
                              {item.singaporeStock.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[11px] text-indigo-600 block">引当: {item.reservedSingapore}</span>
                        </td>
                      )}

                      <td className="py-3 px-4 text-center">
                        {item.koreaStock > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> 在庫あり
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            韓国未入荷 (0)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Korea Stock */}
      {confirmClearOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">韓国在庫を一旦クリアしますか？</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  韓国倉庫の在庫数をすべて「0」にリセットします。シンガポール倉庫の在庫はそのまま維持されます。
                  クリア後、最新のCSVファイルをインポートして正確な在庫を反映できます。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleClearKoreaStock}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> クリア実行（0件にリセット）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal with Drag and Drop Zone */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    韓国在庫 CSV反映・インポート
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    CSVを放り込む（ドラッグ＆ドロップ）か、テキストを貼り付けて反映
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Option to clear existing Korea stock before import */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="clearBeforeImportCheckbox"
                  checked={clearBeforeImport}
                  onChange={(e) => setClearBeforeImport(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="clearBeforeImportCheckbox" className="font-bold text-slate-800 cursor-pointer">
                  反映前に、既存の韓国在庫を一旦すべてクリア（0件リセット）する
                </label>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processCsvFile(file);
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60'
                }`}
                onClick={() => {
                  document.getElementById('csvFileInput')?.click();
                }}
              >
                <input
                  id="csvFileInput"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processCsvFile(file);
                  }}
                />
                <FileSpreadsheet className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="font-bold text-slate-700">
                  ここにCSVファイルを放り込んでください（ドラッグ＆ドロップ）
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  またはクリックしてファイルを選択（.csv）
                </p>
              </div>

              {/* Text Area */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">またはCSVテキストを直接貼り付け</label>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="번호,회사명,製品名,製品コード,수량,유통기한,등록일,업데이트&#10;1,VN,cellREDM,sxcvafcq,50,2026.12.31,2026.07.06,2026.10.06..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-2.5 bg-slate-100 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                <strong>対応形式（ヘッダー自動判定）:</strong> 번호, 회사명, 제품명(製品名), 제품코드(製品コード), 수량(数量), 유통기한(有効期限), 등록일, 업데이트
              </div>

              {csvMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    csvMessage.isError
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {csvMessage.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleImportCsv}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {clearBeforeImport ? '一旦クリアして反映' : 'CSVを反映する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
