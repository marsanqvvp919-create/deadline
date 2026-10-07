import React, { useState, useMemo, useEffect } from 'react';
import { ClinicItem, Order } from '../types';
import { fetchClinicsMaster, saveLocalClinics, getLocalClinics } from '../api';
import {
  Building2,
  Search,
  RefreshCw,
  Upload,
  Download,
  Database,
  Plus,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Mail,
  User,
  ShoppingBag,
  CreditCard,
  ChevronRight,
  X,
  Edit2,
  Clock,
  Layers,
  Percent,
  Package,
  Box,
  Trash2,
  Check
} from 'lucide-react';
import { RakurakuSchemaModal } from './RakurakuSchemaModal';
import { CsvImportModal } from './CsvImportModal';
import { ClinicProductStatusDrawer } from './ClinicProductStatusDrawer';
import { getSalesRepsList } from '../utils/salesRepMapping';

interface ClinicMasterViewProps {
  orders: Order[];
  onSelectOrder?: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string, clinicItem?: ClinicItem) => void;
}

export const ClinicMasterView: React.FC<ClinicMasterViewProps> = ({
  orders,
  onSelectOrder,
  onOpenClinicStatus,
}) => {
  const [clinics, setClinics] = useState<ClinicItem[]>(getLocalClinics());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('2026-09-24 16:30');
  const [syncSource, setSyncSource] = useState<string>('synced_master');
  const [copiedIp, setCopiedIp] = useState<boolean>(false);
  const [serverIp, setServerIp] = useState<string>('34.34.226.64');

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals & Drawer States
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedClinic, setSelectedClinic] = useState<ClinicItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<ClinicItem>>({});
  const [clinicToDelete, setClinicToDelete] = useState<ClinicItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleConfirmDeleteClinic = () => {
    if (!clinicToDelete) return;
    const targetId = clinicToDelete.clinicId;
    const targetName = clinicToDelete.clinicName;
    const updated = clinics.filter((c) => c.clinicId !== targetId && c.clinicName !== targetName);
    setClinics(updated);
    saveLocalClinics(updated);
    showToast(`クリニック「${targetName}」(${targetId}) を削除しました`);
    setClinicToDelete(null);
    if (selectedClinic?.clinicId === targetId) setSelectedClinic(null);
    if (editForm.clinicId === targetId) setIsEditModalOpen(false);
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
      const res = await fetchClinicsMaster();
      setClinics(res.data);
      setLastSyncTime(res.lastSyncTime);
      setSyncSource(res.source);
      if (res.serverIp) setServerIp(res.serverIp);
      if (res.error) {
        setSyncError(res.error);
      }
    } catch (err: any) {
      setSyncError(err?.message || 'クリニックマスタの同期に失敗しました');
    } finally {
      if (isManual) {
        setTimeout(() => setIsSyncing(false), 400);
      }
    }
  };

  // 注文管理（101248）との突合計算: 各クリニックの発注・進行中案件・商品ステータス
  const clinicOrderStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats: Record<
      string,
      {
        orderCount: number;
        activeCount: number;
        orders: Order[];
        totalLines: number;
        activeLines: number;
        overdueLines: number;
        remainingQty: number;
      }
    > = {};

    orders.forEach((ord) => {
      const name = ord.customerName;
      if (!name) return;
      if (!stats[name]) {
        stats[name] = {
          orderCount: 0,
          activeCount: 0,
          orders: [],
          totalLines: 0,
          activeLines: 0,
          overdueLines: 0,
          remainingQty: 0,
        };
      }
      stats[name].orderCount += 1;
      const isOrderDelivered = ord.orderState === '納品完了' || ord.deliveredDate !== null;
      if (!isOrderDelivered) {
        stats[name].activeCount += 1;
      }
      stats[name].orders.push(ord);

      ord.lines.forEach((l) => {
        stats[name].totalLines += 1;
        const isLineShipped = l.stage === '出荷完了';
        const isDelivered = isOrderDelivered || isLineShipped;
        const remaining = l.remainingQty !== undefined ? l.remainingQty : l.quantity;
        stats[name].remainingQty += remaining;

        if (!isDelivered) {
          stats[name].activeLines += 1;
          if (l.latestDate) {
            const d = new Date(l.latestDate);
            if (!isNaN(d.getTime()) && today.getTime() > d.getTime()) {
              stats[name].overdueLines += 1;
            }
          }
        }
      });
    });

    return stats;
  }, [orders]);

  // 営業担当者一覧
  const salesReps = useMemo(() => {
    const set = new Set<string>();
    clinics.forEach((c) => {
      if (c.salesRep) set.add(c.salesRep);
    });
    return Array.from(set).sort();
  }, [clinics]);

  // 都道府県一覧
  const prefectures = useMemo(() => {
    const set = new Set<string>();
    clinics.forEach((c) => {
      if (c.prefecture) set.add(c.prefecture);
    });
    return Array.from(set).sort();
  }, [clinics]);

  // フィルタ適用
  const filteredClinics = useMemo(() => {
    return clinics.filter((c) => {
      if (selectedRep !== 'all' && c.salesRep !== selectedRep) return false;
      if (selectedPrefecture !== 'all' && c.prefecture !== selectedPrefecture) return false;
      if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = c.clinicId.toLowerCase().includes(q);
        const matchName = c.clinicName.toLowerCase().includes(q);
        const matchDirector = c.directorName.toLowerCase().includes(q);
        const matchRep = c.salesRep.toLowerCase().includes(q);
        const matchAddr = c.address.toLowerCase().includes(q);
        const matchPhone = c.phone.includes(q);
        if (!matchId && !matchName && !matchDirector && !matchRep && !matchAddr && !matchPhone) {
          return false;
        }
      }

      return true;
    });
  }, [clinics, selectedRep, selectedPrefecture, selectedStatus, searchQuery]);

  // CSVエクスポート
  const handleExportCsv = () => {
    const headers = [
      '109898(クリニックID)',
      '110108(クリニック名)',
      '院長名',
      '109978(担当営業)',
      '110167(販売通貨)',
      '110109(紹介手数料率%)',
      '電話番号',
      'メールアドレス',
      '郵便番号',
      '都道府県',
      '住所',
      '支払条件',
      'ステータス',
      '備考',
    ];
    const rows = filteredClinics.map((c) => [
      `"${c.clinicId}"`,
      `"${c.clinicName}"`,
      `"${c.directorName}"`,
      `"${c.salesRep}"`,
      `"${c.currency}"`,
      c.commissionRate,
      `"${c.phone}"`,
      `"${c.email}"`,
      `"${c.postalCode}"`,
      `"${c.prefecture}"`,
      `"${c.address}"`,
      `"${c.paymentTerms}"`,
      `"${c.status}"`,
      `"${c.memo || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `顧客マスタ_101250_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (clinic: ClinicItem) => {
    setEditForm({ ...clinic });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editForm.clinicId) return;
    const updated = clinics.map((c) =>
      c.clinicId === editForm.clinicId ? ({ ...c, ...editForm, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) } as ClinicItem) : c
    );
    setClinics(updated);
    saveLocalClinics(updated, 'synced_master');
    setIsEditModalOpen(false);
    if (selectedClinic && selectedClinic.clinicId === editForm.clinicId) {
      setSelectedClinic({ ...selectedClinic, ...editForm } as ClinicItem);
    }
  };

  const handleUpdateSalesRep = (clinicId: string, newRep: string) => {
    const updated = clinics.map((c) =>
      c.clinicId === clinicId ? ({ ...c, salesRep: newRep || '未設定', updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) } as ClinicItem) : c
    );
    setClinics(updated);
    saveLocalClinics(updated, 'synced_master');
    showToast(`クリニックの担当営業を「${newRep || '未設定'}」に更新しました`);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      
      {/* 楽楽販売連携 バナー & アクションヘッダー */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  クリニックマスタ管理（顧客マスタ）
                </h1>
                <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                  dbSchemaId: 101250
                </span>
                <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md">
                  キー項目: 109898 (クリニックID)
                </span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  楽楽販売 DBグループ: Number1
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ご注文管理（101248）のヘッダー項目（109979: クリニックID）と連携し、各医院の取引・請求履歴を集中管理
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSync(true)}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
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
            <span className="text-slate-500">最終更新: {lastSyncTime}</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700">登録医院数: {clinics.length} 院</span>
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
          <span className="text-xs font-medium text-slate-500 block">全登録医院数</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{clinics.length}</span>
            <span className="text-xs text-slate-500">院</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">現在進行中注文のある医院</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600 font-mono">
              {Object.values(clinicOrderStats).filter(s => s.activeCount > 0).length}
            </span>
            <span className="text-xs text-slate-500">院稼働中</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">アクティブ取引率</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {Math.round((clinics.filter(c => c.status === '取引中').length / (clinics.length || 1)) * 100)}%
            </span>
            <span className="text-xs text-slate-500">取引中</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">平均紹介手数料率</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600 font-mono">
              {(
                clinics.reduce((acc, c) => acc + (c.commissionRate || 0), 0) / (clinics.length || 1)
              ).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">平均</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="クリニック名、クリニックID（CLN-xxx）、院長名、電話番号、住所で検索..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 担当営業 */}
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">すべての担当営業</option>
            {salesReps.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* 都道府県 */}
          <select
            value={selectedPrefecture}
            onChange={(e) => setSelectedPrefecture(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">すべての地域</option>
            {prefectures.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* ステータス */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">すべてのステータス</option>
            <option value="取引中">取引中</option>
            <option value="新規">新規</option>
            <option value="休眠">休眠</option>
            <option value="審査中">審査中</option>
          </select>
        </div>
      </div>

      {/* Main Clinics Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="data-table-wrap overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5">楽楽ID (109898)</th>
                <th className="py-3 px-3.5">クリニック名 (110108)</th>
                <th className="py-3 px-3.5">院長 / 代表者</th>
                <th className="py-3 px-3.5">担当営業 (109978)</th>
                <th className="py-3 px-3.5">地域 / 所在地</th>
                <th className="py-3 px-3.5">電話番号</th>
                <th className="py-3 px-3.5 text-center">商品ステータス進捗</th>
                <th className="py-3 px-3.5">取引状態</th>
                <th className="py-3 px-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredClinics.map((c, idx) => {
                const stat = clinicOrderStats[c.clinicName];

                return (
                  <tr
                    key={`${c.clinicId}_${idx}`}
                    className="hover:bg-indigo-50/40 transition cursor-pointer group"
                    onClick={() => {
                      if (onOpenClinicStatus) {
                        onOpenClinicStatus(c.clinicName, c);
                      } else {
                        setSelectedClinic(c);
                      }
                    }}
                  >
                    <td className="py-3 px-3.5 font-mono font-bold text-indigo-700 whitespace-nowrap">
                      {c.clinicId}
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900 group-hover:text-indigo-700 transition flex items-center gap-1.5">
                        <span>{c.clinicName}</span>
                        <span className="text-[10px] text-indigo-600 opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                          <Package className="w-3 h-3" />
                          <span>クリックで商品ステータス</span>
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {c.email || 'メール未登録'}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-700 font-medium">
                      {c.directorName}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {!c.salesRep || c.salesRep === '未設定' || c.salesRep === '未割当' ? (
                        <select
                          value={c.salesRep || ''}
                          onChange={(e) => handleUpdateSalesRep(c.clinicId, e.target.value)}
                          className="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded px-2 py-1 font-semibold focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="">担当営業を選択...</option>
                          {getSalesRepsList().filter(r => r && r !== '未設定' && r !== '未割当').map((rep) => (
                            <option key={rep} value={rep}>{rep}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5 group/rep">
                          <span className="font-semibold text-slate-800">{c.salesRep}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateSalesRep(c.clinicId, '未設定')}
                            title="担当営業を未設定に戻す"
                            className="text-[10px] text-slate-400 hover:text-rose-600 opacity-0 group-hover/rep:opacity-100 transition cursor-pointer"
                          >
                            変更
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="text-slate-800">{c.prefecture}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{c.address}</div>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-600">
                      {c.phone}
                    </td>
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      {stat && stat.activeLines > 0 ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                            <ShoppingBag className="w-3 h-3 text-indigo-600" />
                            <span>進行中 {stat.activeLines}品目 (残{stat.remainingQty}点)</span>
                          </span>
                          {stat.overdueLines > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 block w-fit mx-auto">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>最長納期超過 {stat.overdueLines}品目</span>
                            </span>
                          )}
                        </div>
                      ) : stat && stat.orderCount > 0 ? (
                        <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>全納品完了 ({stat.totalLines}品目)</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">受注なし</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          c.status === '取引中'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === '新規'
                            ? 'bg-blue-100 text-blue-800'
                            : c.status === '審査中'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenClinicStatus) {
                              onOpenClinicStatus(c.clinicName, c);
                            } else {
                              setSelectedClinic(c);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold rounded-xl text-xs flex items-center gap-1 transition cursor-pointer border border-indigo-200 hover:border-indigo-600 shadow-2xs"
                          title="この取引先の商品ステータス一覧・納期進捗を開く"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>商品進捗</span>
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

      {/* Clinic Product Status & Master Slideover Drawer */}
      <ClinicProductStatusDrawer
        isOpen={selectedClinic !== null}
        onClose={() => setSelectedClinic(null)}
        clinicName={selectedClinic?.clinicName || null}
        clinicItem={selectedClinic}
        orders={orders}
        allClinics={clinics}
        onSelectOrder={onSelectOrder}
        onSwitchClinic={(name) => {
          const found = clinics.find((c) => c.clinicName === name);
          if (found) setSelectedClinic(found);
        }}
      />

      {/* Edit Clinic Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              クリニック情報編集 ({editForm.clinicId})
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">クリニック名</label>
                <input
                  type="text"
                  value={editForm.clinicName || ''}
                  onChange={(e) => setEditForm({ ...editForm, clinicName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">担当営業</label>
                <input
                  type="text"
                  value={editForm.salesRep || ''}
                  onChange={(e) => setEditForm({ ...editForm, salesRep: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">紹介手数料率 (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={editForm.commissionRate || 0}
                  onChange={(e) => setEditForm({ ...editForm, commissionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">取引ステータス</label>
                <select
                  value={editForm.status || '取引中'}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="取引中">取引中</option>
                  <option value="新規">新規</option>
                  <option value="審査中">審査中</option>
                  <option value="休眠">休眠</option>
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clinic Deletion Confirmation Modal */}
      {clinicToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">クリニックの削除確認</h4>
                <p className="text-xs text-slate-500 font-mono">{clinicToDelete.clinicId}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              クリニック「<b className="text-slate-900">{clinicToDelete.clinicName}</b>」をマスタから削除してもよろしいですか？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirmDeleteClinic}
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
        activeSchemaId="101250"
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        type="clinics"
        onImportClinics={(imported) => {
          setClinics(imported);
          saveLocalClinics(imported, 'rakuraku_csv');
          setLastSyncTime(new Date().toISOString().replace('T', ' ').slice(0, 16));
          setSyncSource('rakuraku_csv');
        }}
      />

    </div>
  );
};
