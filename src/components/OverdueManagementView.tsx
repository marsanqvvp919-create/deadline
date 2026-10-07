import React, { useState, useMemo, useEffect } from 'react';
import { useUrlState } from '../utils/listState';
import {
  Order,
  OrderLine,
  AlertItem,
  OverdueOrderInfo,
  OverdueClinicInfo,
  OverdueFollowupStatus,
  OverdueFollowupRecord,
  ClinicItem
} from '../types';
import { getLocalClinics } from '../api';
import { isShippingOrFee } from '../utils';
import {
  isLineDelayed,
  isOrderDelayed,
  getOverdueCategory,
  RAKURAKU_OVERDUE_LIST_URL,
  isLineApproaching,
  getLineDelayDays,
  getDelayCounts,
  getApproachingCounts,
  formatDelayString,
} from '../utils/delayCalculation';
import { TableEmptyState } from './TableEmptyState';
import { useSharedNotes } from '../utils/sharedNotes';
import {
  AlertTriangle,
  Clock,
  Building2,
  Package,
  Calendar,
  User,
  Phone,
  Mail,
  ExternalLink,
  Search,
  Filter,
  Download,
  CheckCircle2,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  ShieldAlert,
  Send,
  FileText,
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';

const STORAGE_FOLLOWUP_KEY = 'nouki_overdue_followups_v1';
const STORAGE_CLINIC_NOTES_KEY = 'nouki_overdue_clinic_notes_v1';

interface OverdueManagementViewProps {
  orders: Order[];
  alerts: AlertItem[];
  onSelectOrder: (order: Order, lineKey?: string) => void;
  onOpenClinicStatus?: (clinicName: string) => void;
  isLoading?: boolean;
  error?: string | null;
  lastSuccessTime?: string | null;
  onRetry?: () => void;
}

export const OverdueManagementView: React.FC<OverdueManagementViewProps> = ({
  orders,
  alerts,
  onSelectOrder,
  onOpenClinicStatus,
  isLoading = false,
  error = null,
  lastSuccessTime = null,
  onRetry,
}) => {
  // Scope: 'overdue' (納期超過のみ - isLineDelayed統一) | 'approaching' (納期間近（5日以内） - 別指標として分離)
  const [activeScope, setActiveScope] = useUrlState<'overdue' | 'approaching'>('scope', 'overdue');

  // View mode: 'orders' (伝票・明細別) | 'clinics' (取引先別)
  const [viewMode, setViewMode] = useUrlState<'orders' | 'clinics'>('view', 'orders');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedDaysFilter, setSelectedDaysFilter] = useState<string>('all'); // all | 30 | 14 | 7
  const [selectedCauseFilter, setSelectedCauseFilter] = useState<string>('all'); // all | 未発注 | 入荷遅延
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all'); // all | 未対応 | 対応中 | 対応完了

  // Expanded clinics in clinic view
  const [expandedClinics, setExpandedClinics] = useState<Set<string>>(new Set());

  // 対応状況・クリニックメモはチームで共有（サーバーに保存）。以前このブラウザに保存した分は自動で移す
  const [followups, setFollowup] = useSharedNotes<OverdueFollowupRecord>('overdue_followups', STORAGE_FOLLOWUP_KEY);
  const [clinicNotes, setClinicNote] = useSharedNotes<string>('overdue_clinic_notes', STORAGE_CLINIC_NOTES_KEY);

  // Modal states for action / contact template
  const [activeTemplateModal, setActiveTemplateModal] = useState<{
    type: 'vendor' | 'clinic';
    order?: OverdueOrderInfo;
    clinic?: OverdueClinicInfo;
  } | null>(null);

  // Note edit modal
  const [editingNoteOrder, setEditingNoteOrder] = useState<OverdueOrderInfo | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [nextActionDateInput, setNextActionDateInput] = useState<string>('');

  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);

  // Clinic master lookup
  const clinicMasterMap = useMemo(() => {
    const list = getLocalClinics();
    const map = new Map<string, ClinicItem>();
    list.forEach((c) => {
      map.set(c.clinicName, c);
      if (c.clinicId) map.set(c.clinicId, c);
    });
    return map;
  }, []);

  // 楽楽販売の「お約束納期」（伝票内で最も早いもの）と「納期危険」（値が入っている明細があれば表示）
  const promisedDateOf = (item: OverdueOrderInfo): string | null => {
    const dates = item.order.lines
      .map((l) => l.promisedDate)
      .filter((d): d is string => !!d)
      .sort((a, b) => a.replace(/\//g, '-').localeCompare(b.replace(/\//g, '-')));
    return dates[0] || null;
  };
  const deliveryRiskOf = (item: OverdueOrderInfo): string | null => {
    const v = item.order.lines
      .map((l) => (l.deliveryRisk || '').trim())
      .find((x) => x && !['0', 'FALSE', 'false', 'なし', '-', '—'].includes(x));
    return v || null;
  };

  // 対応状況を更新（チームで共有）
  const updateFollowup = (orderId: string, status: OverdueFollowupStatus, note?: string, nextActionDate?: string) => {
    const current = followups[orderId] || {
      status: '未対応',
      note: '',
      updatedAt: new Date().toISOString(),
    };
    const updated: OverdueFollowupRecord = {
      status,
      note: note !== undefined ? note : current.note,
      nextActionDate: nextActionDate !== undefined ? nextActionDate : current.nextActionDate,
      updatedAt: new Date().toISOString(),
    };
    setFollowup(orderId, updated);
  };

  const updateClinicNote = (clinicName: string, note: string) => {
    setClinicNote(clinicName, note);
  };

  // 1. Calculate all overdue orders (isLineDelayed統一) and approaching orders (5日以内分離)
  const { currentOrders, currentClinics, delayCounts, approachingCounts, kpis } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const delayCounts = getDelayCounts(orders);
    const approachingCounts = getApproachingCounts(orders);

    const overdueList: OverdueOrderInfo[] = [];
    const approachingList: OverdueOrderInfo[] = [];
    const overdueClinicsMap = new Map<string, OverdueClinicInfo>();
    const approachingClinicsMap = new Map<string, OverdueClinicInfo>();

    orders.forEach((ord) => {
      // 1. 納期超過（楽楽販売「①超過」と同じ条件。伝票単位は isOrderDelayed で判定）
      const overdueLines = ord.lines.filter((l) => isLineDelayed(l, ord));
      const orderIsDelayed = isOrderDelayed(ord);
      if (orderIsDelayed) {
        let maxDaysOver = 0;
        let earliestDueDate = overdueLines[0]?.latestDate || '';

        overdueLines.forEach((l) => {
          const days = getLineDelayDays(l);
          if (days > maxDaysOver) {
            maxDaysOver = days;
            earliestDueDate = l.latestDate || earliestDueDate;
          }
        });

        // 楽楽販売のステータスで内訳を決める（受注済み＝発注漏れ／発注済み＝入荷待ち／それ以外）
        const category = getOverdueCategory(ord);
        const cause: '未発注' | '入荷遅延' | '出荷手配中' =
          category === '発注漏れ' ? '未発注' : category === '発注済み' ? '入荷遅延' : '出荷手配中';
        const totalOverdueQty = overdueLines.reduce((acc, l) => acc + (l.remainingQty || l.quantity || 1), 0);
        const followup = followups[ord.orderId] || {
          status: '未対応' as OverdueFollowupStatus,
          note: '',
          updatedAt: '',
        };

        const info: OverdueOrderInfo = {
          order: ord,
          orderId: ord.orderId,
          customerName: ord.customerName || '未設定',
          salesRep: ord.salesRep || '未設定',
          orderDate: ord.orderDate || '',
          maxDaysOver,
          earliestDueDate,
          overdueLines,
          cause,
          totalOverdueQty,
          followup,
        };
        overdueList.push(info);

        const cName = ord.customerName || '未設定';
        const masterClinic = clinicMasterMap.get(cName);
        if (!overdueClinicsMap.has(cName)) {
          overdueClinicsMap.set(cName, {
            clinicName: cName,
            clinicId: masterClinic?.clinicId,
            salesRep: ord.salesRep || masterClinic?.salesRep || '未設定',
            phone: masterClinic?.phone || '',
            email: masterClinic?.email || '',
            directorName: masterClinic?.directorName || '',
            ordersCount: 0,
            maxDaysOver: 0,
            totalOverdueQty: 0,
            orders: [],
            severityRank: 'B',
            followupNote: clinicNotes[cName] || '',
          });
        }
        const cln = overdueClinicsMap.get(cName)!;
        cln.orders.push(info);
        cln.ordersCount += 1;
        cln.maxDaysOver = Math.max(cln.maxDaysOver, maxDaysOver);
        cln.totalOverdueQty += totalOverdueQty;
      }

      // 2. 納期間近明細（5日以内・納期超過とは合算しない）
      const approachingLines = ord.lines.filter((l) => isLineApproaching(l, ord));
      if (approachingLines.length > 0 && !orderIsDelayed) {
        let minDaysRemaining = 999;
        let earliestDueDate = approachingLines[0]?.latestDate || '';
        let hasUnordered = false;

        approachingLines.forEach((l) => {
          if (l.latestDate) {
            const d = new Date(l.latestDate);
            const daysRem = Math.max(0, Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
            if (daysRem < minDaysRemaining) {
              minDaysRemaining = daysRem;
              earliestDueDate = l.latestDate;
            }
          }
          if (l.stage === '未発注') hasUnordered = true;
        });

        const cause: '未発注' | '入荷遅延' | '出荷手配中' = hasUnordered ? '未発注' : '入荷遅延';
        const totalOverdueQty = approachingLines.reduce((acc, l) => acc + (l.remainingQty || l.quantity || 1), 0);
        const followup = followups[ord.orderId] || {
          status: '未対応' as OverdueFollowupStatus,
          note: '',
          updatedAt: '',
        };

        const info: OverdueOrderInfo = {
          order: ord,
          orderId: ord.orderId,
          customerName: ord.customerName || '未設定',
          salesRep: ord.salesRep || '未設定',
          orderDate: ord.orderDate || '',
          maxDaysOver: -minDaysRemaining,
          earliestDueDate,
          overdueLines: approachingLines,
          cause,
          totalOverdueQty,
          followup,
        };
        approachingList.push(info);

        const cName = ord.customerName || '未設定';
        const masterClinic = clinicMasterMap.get(cName);
        if (!approachingClinicsMap.has(cName)) {
          approachingClinicsMap.set(cName, {
            clinicName: cName,
            clinicId: masterClinic?.clinicId,
            salesRep: ord.salesRep || masterClinic?.salesRep || '未設定',
            phone: masterClinic?.phone || '',
            email: masterClinic?.email || '',
            directorName: masterClinic?.directorName || '',
            ordersCount: 0,
            maxDaysOver: -minDaysRemaining,
            totalOverdueQty: 0,
            orders: [],
            severityRank: 'B',
            followupNote: clinicNotes[cName] || '',
          });
        }
        const cln = approachingClinicsMap.get(cName)!;
        cln.orders.push(info);
        cln.ordersCount += 1;
        cln.totalOverdueQty += totalOverdueQty;
      }
    });

    const finalizeClinics = (map: Map<string, OverdueClinicInfo>) => {
      map.forEach((cln) => {
        if (cln.ordersCount >= 3 || cln.maxDaysOver >= 30) {
          cln.severityRank = 'S';
        } else if (cln.ordersCount >= 2 || cln.maxDaysOver >= 14) {
          cln.severityRank = 'A';
        } else {
          cln.severityRank = 'B';
        }
      });
      return Array.from(map.values()).sort((a, b) => {
        const rankOrder = { S: 3, A: 2, B: 1 };
        if (rankOrder[b.severityRank] !== rankOrder[a.severityRank]) {
          return rankOrder[b.severityRank] - rankOrder[a.severityRank];
        }
        return b.maxDaysOver - a.maxDaysOver;
      });
    };

    overdueList.sort((a, b) => b.maxDaysOver - a.maxDaysOver);
    approachingList.sort((a, b) => a.maxDaysOver - b.maxDaysOver);

    const sortedOverdueClinics = finalizeClinics(overdueClinicsMap);
    const sortedApproachingClinics = finalizeClinics(approachingClinicsMap);

    const isOverdueScope = activeScope === 'overdue';
    const activeOrdersList = isOverdueScope ? overdueList : approachingList;
    const activeClinicsList = isOverdueScope ? sortedOverdueClinics : sortedApproachingClinics;

    const totalOrders = activeOrdersList.length;
    const totalLines = activeOrdersList.reduce((acc, o) => acc + o.overdueLines.length, 0);
    const totalClinics = activeClinicsList.length;
    const worstDaysOver = activeOrdersList.length > 0 ? activeOrdersList[0].maxDaysOver : 0;
    const unorderedCount = activeOrdersList.filter((o) => o.cause === '未発注').length;
    const poDelayedCount = activeOrdersList.filter((o) => o.cause === '入荷遅延').length;
    const completedCount = activeOrdersList.filter((o) => o.followup.status === '対応完了').length;
    const unhandledCount = activeOrdersList.filter((o) => o.followup.status === '未対応').length;

    return {
      currentOrders: activeOrdersList,
      currentClinics: activeClinicsList,
      delayCounts,
      approachingCounts,
      kpis: {
        totalOrders,
        totalLines,
        totalClinics,
        worstDaysOver,
        unorderedCount,
        poDelayedCount,
        completedCount,
        unhandledCount,
      },
    };
  }, [orders, activeScope, followups, clinicNotes, clinicMasterMap]);

  // Filtered list of orders
  const filteredOverdueOrders = useMemo(() => {
    return currentOrders.filter((item) => {
      // 営業担当
      if (selectedRep !== 'all' && item.salesRep !== selectedRep) return false;

      // 超過日数 / 納期間近フィルター
      if (selectedDaysFilter === 'overdue' && item.maxDaysOver <= 0) return false;
      if (selectedDaysFilter === 'nearDue' && (item.maxDaysOver > 0 || item.maxDaysOver < -10)) return false;
      if (selectedDaysFilter === '30' && item.maxDaysOver < 30) return false;
      if (selectedDaysFilter === '14' && (item.maxDaysOver < 14 || item.maxDaysOver >= 30)) return false;
      if (selectedDaysFilter === '7' && (item.maxDaysOver < 7 || item.maxDaysOver >= 14)) return false;
      if (selectedDaysFilter === '1-6' && (item.maxDaysOver < 1 || item.maxDaysOver >= 7)) return false;

      // 原因
      if (selectedCauseFilter !== 'all' && item.cause !== selectedCauseFilter) return false;

      // 対応ステータス
      if (selectedStatusFilter === '未対応' && item.followup.status !== '未対応') return false;
      if (selectedStatusFilter === '対応中' && (item.followup.status === '未対応' || item.followup.status === '対応完了')) return false;
      if (selectedStatusFilter === '対応完了' && item.followup.status !== '対応完了') return false;

      // 検索クエリ
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchOrd = item.orderId.toLowerCase().includes(q);
        const matchCln = item.customerName.toLowerCase().includes(q);
        const matchRep = item.salesRep.toLowerCase().includes(q);
        const matchProd = item.overdueLines.some((l) => l.productName.toLowerCase().includes(q));
        if (!matchOrd && !matchCln && !matchRep && !matchProd) return false;
      }

      return true;
    });
  }, [currentOrders, selectedRep, selectedDaysFilter, selectedCauseFilter, selectedStatusFilter, searchQuery]);

  // Filtered list of clinics
  const filteredOverdueClinics = useMemo(() => {
    return currentClinics.filter((clinic) => {
      // 営業担当
      if (selectedRep !== 'all' && clinic.salesRep !== selectedRep) return false;

      // 超過日数
      if (selectedDaysFilter === '30' && clinic.maxDaysOver < 30) return false;
      if (selectedDaysFilter === '14' && clinic.maxDaysOver < 14) return false;
      if (selectedDaysFilter === '7' && clinic.maxDaysOver < 7) return false;

      // 検索クエリ
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchCln = clinic.clinicName.toLowerCase().includes(q);
        const matchRep = clinic.salesRep.toLowerCase().includes(q);
        const matchDoc = clinic.directorName?.toLowerCase().includes(q);
        const matchProd = clinic.orders.some((o) =>
          o.overdueLines.some((l) => l.productName.toLowerCase().includes(q))
        );
        if (!matchCln && !matchRep && !matchDoc && !matchProd) return false;
      }

      return true;
    });
  }, [currentClinics, selectedRep, selectedDaysFilter, searchQuery]);

  // List of sales reps for dropdown
  const repList = useMemo(() => {
    const set = new Set<string>();
    currentOrders.forEach((o) => {
      if (o.salesRep) set.add(o.salesRep);
    });
    return Array.from(set).sort();
  }, [currentOrders]);

  // Toggle clinic accordion
  const toggleClinicExpand = (name: string) => {
    setExpandedClinics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAllClinics = () => {
    setExpandedClinics(new Set(currentClinics.map((c) => c.clinicName)));
  };

  const collapseAllClinics = () => {
    setExpandedClinics(new Set());
  };

  // Open note edit modal
  const handleOpenNoteModal = (item: OverdueOrderInfo) => {
    setEditingNoteOrder(item);
    setNoteInput(item.followup.note || '');
    setNextActionDateInput(item.followup.nextActionDate || '');
  };

  const handleSaveNote = () => {
    if (!editingNoteOrder) return;
    updateFollowup(editingNoteOrder.orderId, editingNoteOrder.followup.status, noteInput, nextActionDateInput);
    setEditingNoteOrder(null);
  };

  // Open Template Modal
  const handleOpenVendorTemplate = (order: OverdueOrderInfo) => {
    setActiveTemplateModal({ type: 'vendor', order });
    setCopiedTemplate(false);
  };

  const handleOpenClinicTemplate = (clinic: OverdueClinicInfo) => {
    setActiveTemplateModal({ type: 'clinic', clinic });
    setCopiedTemplate(false);
  };

  // Generate Vendor Expedite Email text
  const generateVendorTemplate = (order: OverdueOrderInfo): string => {
    const linesText = order.overdueLines
      .map(
        (l) =>
          `・品名: ${l.productName}\n  数量: ${l.quantity}点 (仕入先: ${l.supplierName || '未指定'})\n  発注日: ${l.poDate || '未発注'}\n  当初最長予定日: ${l.latestDate}`
      )
      .join('\n\n');

    return `件名: 【至急・納期確認のお願い】受注番号 ${order.orderId} の納品状況について\n\n仕入先 ご担当者様\n\n平素より大変お世話になっております。\n株式会社AIメディカル 担当の${order.salesRep}でございます。\n\n下記ご注文の商品につきまして、当初の最長納品予定日（${order.earliestDueDate}）を【${order.maxDaysOver}日】超過しております。\nクリニック様より強い納期確認の要請が寄せられており、現在の入荷見込みおよび出荷状況について至急ご教示いただけますでしょうか。\n\n【対象伝票・商品明細】\n受注ID: ${order.orderId}\n納品先取引先: ${order.customerName}\n\n${linesText}\n\n大変恐縮ではございますが、本日中または明日午前中までに最新の進捗状況をご返信いただけますようお願い申し上げます。\n何卒よろしくお願い申し上げます。`;
  };

  // Generate Clinic Delay Notification Email text
  const generateClinicTemplate = (clinic: OverdueClinicInfo): string => {
    const ordersText = clinic.orders
      .map((o) => {
        const items = o.overdueLines.map((l) => `  ・${l.productName} × ${l.quantity}`).join('\n');
        return `【伝票番号: ${o.orderId}（受注日: ${o.orderDate || '不明'}）】\n  当初予定日: ${o.earliestDueDate}（遅延: ${o.maxDaysOver}日超過）\n${items}`;
      })
      .join('\n\n');

    return `件名: 【大切なお知らせ】ご注文商品の納品遅延に関するお詫びと進捗のご報告\n\n${clinic.clinicName}\n${clinic.directorName ? clinic.directorName + ' 様' : '院長先生・ご担当者様'}\n\n平素は格別のお引き立てを賜り、心より御礼申し上げます。\n担当営業の${clinic.salesRep}でございます。\n\nこの度は、${clinic.clinicName}様にご注文いただいております下記のお品物につきまして、当初予定しておりました納期を大幅に超過し、多大なご不便・ご迷惑をおかけしておりますことを深くお詫び申し上げます。\n\n【対象のご注文および遅延状況】\n${ordersText}\n\n現在、メーカーおよび製造元に対して優先出荷の緊急督促を実施しております。\n確定の入荷日および発送日時が判明次第、直ちに私よりお電話またはメールにてご連絡申し上げます。\n\n代替ロットや緊急分納などのご要望がございましたら、いつでも迅速に対応させていただきますので、ご指示いただけますと幸いです。\n多大なるご迷惑をおかけしておりますこと、重ねてお詫び申し上げます。\n\n--------------------------------\n担当営業: ${clinic.salesRep}\n--------------------------------`;
  };

  // CSV Export handler
  const handleExportCsv = () => {
    if (viewMode === 'orders') {
      const headers = ['受注ID', 'クリニック名', '担当営業', '受注日', '最長予定日', '超過日数', '原因', '未納品点数', '対応状況', '対応メモ', '明細商品リスト'];
      const rows = filteredOverdueOrders.map((o) => [
        `"${o.orderId}"`,
        `"${o.customerName}"`,
        `"${o.salesRep}"`,
        `"${o.orderDate}"`,
        `"${o.earliestDueDate}"`,
        `"${o.maxDaysOver}"`,
        `"${o.cause}"`,
        `"${o.totalOverdueQty}"`,
        `"${o.followup.status}"`,
        `"${(o.followup.note || '').replace(/"/g, '""')}"`,
        `"${o.overdueLines.map((l) => `${l.productName}(${l.quantity})`).join('; ')}"`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `最長納期超過_伝票一覧_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['クリニック名', 'クリニックID', '深刻度ランク', '担当営業', '超過伝票数', '最悪超過日数', '未納品点数', '電話番号', 'メールアドレス', '院長名', 'フォローメモ'];
      const rows = filteredOverdueClinics.map((c) => [
        `"${c.clinicName}"`,
        `"${c.clinicId || ''}"`,
        `"${c.severityRank}ランク"`,
        `"${c.salesRep}"`,
        `"${c.ordersCount}"`,
        `"${c.maxDaysOver}"`,
        `"${c.totalOverdueQty}"`,
        `"${c.phone || ''}"`,
        `"${c.email || ''}"`,
        `"${c.directorName || ''}"`,
        `"${(c.followupNote || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `最長納期超過_取引先一覧_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Severity color helper
  const getSeverityBadge = (days: number) => {
    if (days >= 30) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          {days}日超過 (重度)
        </span>
      );
    } else if (days >= 14) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
          {days}日超過 (中度)
        </span>
      );
    } else if (days >= 7) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1 font-mono">
          {days}日超過
        </span>
      );
    } else if (days > 0) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200 flex items-center gap-1 font-mono">
          {days}日超過
        </span>
      );
    } else if (days === 0) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 font-mono">
          本日期限
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 font-mono">
          あと {Math.abs(days)} 日
        </span>
      );
    }
  };

  const getStatusColor = (status: OverdueFollowupStatus) => {
    switch (status) {
      case '未対応':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case '仕入先督促中':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case '顧客連絡済':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case '代替品提案中':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case '今週入荷予定':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '対応完了':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      
      {/* Page Title & Intro Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {activeScope === 'overdue' ? '最長納期超過 一覧' : '納期間近（5日以内） 一覧'}
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-mono">
                  {activeScope === 'overdue'
                    ? formatDelayString(delayCounts)
                    : formatDelayString(approachingCounts)}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  影響取引先: {kpis.totalClinics} 院
                </span>
                <span className="text-xs font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md">
                  楽楽販売 ご注文管理(101248) リアルタイム照合
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {activeScope === 'overdue'
                  ? '納品予定日が今日より前で未出荷の明細（納期超過）を厳密に抽出しています。仕入先への督促、顧客への遅延報告、対応履歴を一元管理します。'
                  : '納品予定日が本日以降かつ5日以内の明細を抽出しています。納期超過とは合算せず、直近の手配確認に役立てます。'}
              </p>

              {/* ユーザー要件: 納期超過と納期間近（5日以内）を別指標として分けるタブ */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500">指標切替:</span>
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveScope('overdue')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeScope === 'overdue'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>納期超過（{formatDelayString(delayCounts)}）</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveScope('approaching')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeScope === 'approaching'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>納期間近・5日以内（{formatDelayString(approachingCounts)}）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>{viewMode === 'orders' ? '遅延伝票CSV出力' : '遅延取引先CSV出力'}</span>
            </button>
            <a
              href={RAKURAKU_OVERDUE_LIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
              title="楽楽販売の「納期：①超過・②注意」一覧を開く"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>楽楽販売で開く（①超過・②注意）</span>
            </a>
          </div>
        </div>

        {/* Top KPI Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-rose-50/70 border border-rose-200/80 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-rose-800 block">
              {activeScope === 'overdue' ? '納期超過 伝票・明細数' : '納期間近 伝票・明細数'}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-rose-700 font-mono">{kpis.totalOrders}件</span>
              <span className="text-xs text-rose-600 font-medium">（{kpis.totalLines}明細）</span>
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-amber-800 block">影響クリニック数</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-700 font-mono">{kpis.totalClinics}</span>
              <span className="text-[10px] text-amber-600 font-medium">医院</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-600 block">最大遅延日数</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900 font-mono">{kpis.worstDaysOver}</span>
              <span className="text-[10px] text-slate-500 font-medium">日超過</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-rose-700 block">未発注（受注済みのまま）</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-600 font-mono">{kpis.unorderedCount}</span>
              <span className="text-[10px] text-slate-500 font-medium">件</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-blue-700 block">発注済み（入荷待ち）</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-blue-600 font-mono">{kpis.poDelayedCount}</span>
              <span className="text-[10px] text-slate-500 font-medium">件</span>
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-emerald-800 block">未対応件数</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-emerald-700 font-mono">{kpis.unhandledCount}</span>
              <span className="text-[10px] text-emerald-600 font-medium">件要アクション</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Orders vs Clinics) & Filtering Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
        
        {/* Mode Switcher Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              onClick={() => setViewMode('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                viewMode === 'orders'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>伝票・明細別 管理 ({filteredOverdueOrders.length}件)</span>
            </button>
            <button
              onClick={() => setViewMode('clinics')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                viewMode === 'clinics'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>取引先（クリニック）別 管理 ({filteredOverdueClinics.length}院)</span>
            </button>
          </div>

          {viewMode === 'clinics' && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={expandAllClinics}
                className="text-slate-600 hover:text-blue-600 font-medium underline cursor-pointer"
              >
                すべて展開
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={collapseAllClinics}
                className="text-slate-600 hover:text-blue-600 font-medium underline cursor-pointer"
              >
                すべて折りたたむ
              </button>
            </div>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoComplete="off"
              type="text"
              placeholder={viewMode === 'orders' ? '伝票ID、クリニック名、商品名...' : 'クリニック名、院長名、商品名...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-3 py-1.8 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          {/* Days Overdue Filter */}
          <div>
            <select
              value={selectedDaysFilter}
              onChange={(e) => setSelectedDaysFilter(e.target.value)}
              className="w-full px-3 py-1.8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
            >
              <option value="all">対象期間: すべて (超過＋5日前)</option>
              <option value="overdue">納期超過のみ (遅延発生中)</option>
              <option value="nearDue">納期間近のみ (あと1〜5日)</option>
              <option value="30">30日以上超過</option>
              <option value="14">14日〜29日超過</option>
              <option value="7">7日〜13日超過</option>
              <option value="1-6">1日〜6日超過</option>
            </select>
          </div>

          {/* Sales Rep Filter */}
          <div>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full px-3 py-1.8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
            >
              <option value="all">担当営業: 全員</option>
              {repList.map((rep) => (
                <option key={rep} value={rep}>
                  担当: {rep}
                </option>
              ))}
            </select>
          </div>

          {/* Cause Filter (Orders view only) */}
          {viewMode === 'orders' ? (
            <div>
              <select
                value={selectedCauseFilter}
                onChange={(e) => setSelectedCauseFilter(e.target.value)}
                className="w-full px-3 py-1.8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
              >
                <option value="all">原因: すべて</option>
                <option value="未発注">未発注（受注済みのまま）</option>
                <option value="入荷遅延">発注済・入荷待ち (仕入遅延)</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-500 px-2">
              <span>※クリニックごとの全伝票を集計表示中</span>
            </div>
          )}

          {/* Followup Status Filter (Orders view only) */}
          {viewMode === 'orders' && (
            <div>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full px-3 py-1.8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
              >
                <option value="all">対応ステータス: すべて</option>
                <option value="未対応">未対応のみ</option>
                <option value="対応中">対応中 (督促・連絡済)</option>
                <option value="対応完了">対応完了のみ</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: ORDERS TABLE */}
      {viewMode === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              最長納期超過 伝票一覧 ({filteredOverdueOrders.length} 件)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              遅延日数の大きい順にソート表示しています
            </span>
          </div>

          {filteredOverdueOrders.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                該当する納期超過伝票はありません
              </p>
              <p className="text-xs text-slate-500">
                すべての伝票が納期内に処理されているか、フィルター条件に一致する伝票がありません。
              </p>
            </div>
          ) : (
            <div className="data-table-wrap overflow-x-auto">
              <table className="tbl-overdue w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-3 px-4">受注ID</th>
                    <th className="py-3 px-4">取引先（クリニック）</th>
                    <th className="py-3 px-4">担当営業</th>
                    <th className="py-3 px-4">最長予定日 / 超過日数</th>
                    <th className="py-3 px-4">原因 / ボトルネック</th>
                    <th className="py-3 px-4">未納品明細品目</th>
                    <th className="py-3 px-4">対応ステータス</th>
                    <th className="py-3 px-4 text-right">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading || error ? (
                    <TableEmptyState
                      isLoading={isLoading}
                      error={error}
                      lastSuccessTime={lastSuccessTime}
                      onRetry={onRetry}
                      colSpan={8}
                      emptyMessage={activeScope === 'overdue' ? '納期超過している伝票はありません' : '納期間近（5日以内）の伝票はありません'}
                    />
                  ) : (
                    filteredOverdueOrders.map((item, idx) => {
                      const isOverdueSevere = item.maxDaysOver >= 14;
                      const isOrderMissed = activeScope === 'overdue' && item.cause === '未発注';

                      return (
                        <tr
                          key={`${item.orderId}_${idx}`}
                          className={`hover:bg-slate-50/80 transition ${
                            isOrderMissed
                              ? 'bg-rose-50 border-l-4 border-l-rose-500'
                              : isOverdueSevere
                              ? 'bg-rose-50/20'
                              : ''
                          }`}
                        >
                          {/* 受注ID */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            <button
                              onClick={() => onSelectOrder(item.order)}
                              className="hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{item.orderId}</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </button>
                            <span className="text-[10px] text-slate-400 font-normal block">
                              受注日: {item.orderDate || '未記録'}
                            </span>
                          </td>

                          {/* 取引先クリニック */}
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => onOpenClinicStatus?.(item.customerName)}
                              className="font-bold text-slate-900 hover:text-indigo-600 hover:underline text-left cursor-pointer flex items-center gap-1 group"
                              title="この取引先の商品ステータス一覧を開く"
                            >
                              <span>{item.customerName}</span>
                              <span className="text-[10px] text-indigo-600 opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                                <Package className="w-3 h-3" />
                              </span>
                            </button>
                            <span className="text-[10px] text-slate-500 font-normal">
                              合計 {item.totalOverdueQty} 点が未納品
                            </span>
                          </td>

                          {/* 担当営業 */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md font-medium text-slate-700 bg-slate-100 border border-slate-200 text-[11px]">
                              {item.salesRep}
                            </span>
                          </td>

                          {/* 最長予定日 / 超過日数 */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <span className="text-slate-500 font-mono text-[11px] block">
                                予定: {item.earliestDueDate}
                              </span>
                              {promisedDateOf(item) && (
                                <span className="text-slate-700 font-mono text-[11px] block">
                                  お約束: {promisedDateOf(item)}
                                </span>
                              )}
                              {getSeverityBadge(item.maxDaysOver)}
                              {deliveryRiskOf(item) && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold inline-block">
                                  納期危険: {deliveryRiskOf(item)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 原因 / ボトルネック */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {item.cause === '未発注' ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-600 text-white flex items-center gap-1 w-fit">
                                <AlertCircle className="w-3 h-3" />
                                <span>未発注（受注済み）</span>
                              </span>
                            ) : item.cause === '出荷手配中' ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 w-fit block">
                                その他（{item.order.status || 'ステータス未設定'}）
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
                                <Clock className="w-3 h-3 text-blue-600" />
                                <span>発注済・入荷待ち</span>
                              </span>
                            )}
                          </td>

                          {/* 未納品明細品目 */}
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="space-y-1">
                              {item.overdueLines.slice(0, 2).map((l, idx) => (
                                <div key={idx} className="text-[11px] leading-tight text-slate-800 truncate">
                                  <span className="font-semibold">{l.productName}</span>
                                  <span className="text-slate-500 font-mono ml-1.5">
                                    × {l.remainingQty || l.quantity}点
                                  </span>
                                </div>
                              ))}
                              {item.overdueLines.length > 2 && (
                                <span className="text-[10px] text-slate-400 font-medium block">
                                  他 {item.overdueLines.length - 2} 品目...
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 対応ステータス */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-1.5">
                              <select
                                value={item.followup.status}
                                onChange={(e) =>
                                  updateFollowup(item.orderId, e.target.value as OverdueFollowupStatus)
                                }
                                className={`px-2 py-1 rounded-lg border text-[11px] font-bold focus:outline-none cursor-pointer ${getStatusColor(
                                  item.followup.status
                                )}`}
                              >
                                <option value="未対応">未対応</option>
                                <option value="仕入先督促中">仕入先督促中</option>
                                <option value="顧客連絡済">顧客連絡済</option>
                                <option value="代替品提案中">代替品提案中</option>
                                <option value="今週入荷予定">今週入荷予定</option>
                                <option value="対応完了">対応完了</option>
                              </select>

                              {item.followup.note && (
                                <div
                                  onClick={() => handleOpenNoteModal(item)}
                                  className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 p-1 rounded max-w-[140px] truncate cursor-pointer hover:bg-slate-100"
                                  title={item.followup.note}
                                >
                                  💬 {item.followup.note}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* アクションボタン */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 仕入先督促文生成 */}
                              <button
                                onClick={() => handleOpenVendorTemplate(item)}
                                title="仕入先への督促文を生成"
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>

                              {/* メモ編集 */}
                              <button
                                onClick={() => handleOpenNoteModal(item)}
                                title="対応メモ・履歴を記録"
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>

                              {/* 伝票詳細を開く */}
                              <button
                                onClick={() => onSelectOrder(item.order)}
                                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer"
                              >
                                詳細
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: CLINICS TABLE & ACCORDIONS */}
      {viewMode === 'clinics' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              納期遅延が発生している取引先一覧 ({filteredOverdueClinics.length} 院)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              クリニック名をクリックすると該当伝票と未納品明細が展開されます
            </span>
          </div>

          {filteredOverdueClinics.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
              {error ? (
                <div className="flex flex-col items-center gap-3">
                  <AlertCircle className="w-10 h-10 text-rose-500" />
                  <p className="text-sm font-bold text-rose-900">データを取得できませんでした</p>
                  <p className="text-xs text-rose-600">{error}</p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>再試行する</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    該当する取引先はありません（最終取得 {lastSuccessTime ? new Date(lastSuccessTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）
                  </span>
                </div>
              )}
            </div>
          ) : (
            filteredOverdueClinics.map((clinic, cIdx) => {
              const isExpanded = expandedClinics.has(clinic.clinicName);
              const isRankS = clinic.severityRank === 'S';

              return (
                <div
                  key={`${clinic.clinicName}_${cIdx}`}
                  className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition ${
                    isRankS ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                  }`}
                >
                  {/* Clinic Header Row */}
                  <div
                    onClick={() => toggleClinicExpand(clinic.clinicName)}
                    className="p-4 bg-slate-50/70 hover:bg-slate-100/70 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5 text-slate-400">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-blue-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {clinic.clinicName}
                          </span>

                          {/* Severity Rank */}
                          {clinic.severityRank === 'S' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white font-mono shadow-2xs">
                              最重点警戒 (Sランク)
                            </span>
                          )}
                          {clinic.severityRank === 'A' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white font-mono shadow-2xs">
                              要フォロー (Aランク)
                            </span>
                          )}
                          {clinic.severityRank === 'B' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-700 font-mono">
                              Bランク
                            </span>
                          )}

                          {clinic.clinicId && (
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              ID: {clinic.clinicId}
                            </span>
                          )}
                        </div>

                        {/* Clinic metadata from Master 101250 */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {clinic.directorName && (
                            <span>院長: <b>{clinic.directorName}</b></span>
                          )}
                          {clinic.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {clinic.phone}
                            </span>
                          )}
                          {clinic.email && (
                            <span className="flex items-center gap-1 font-mono">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {clinic.email}
                            </span>
                          )}
                          <span className="font-medium text-slate-700">
                            担当営業: {clinic.salesRep}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="flex items-center gap-4 shrink-0 pl-8 md:pl-0">
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">超過伝票</span>
                          <span className="font-bold text-rose-700 font-mono text-sm">
                            {clinic.ordersCount} 件
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">最大遅延</span>
                          {getSeverityBadge(clinic.maxDaysOver)}
                        </div>

                        <div className="text-right hidden sm:block">
                          <span className="text-[10px] text-slate-400 block">未納品商品</span>
                          <span className="font-bold text-slate-800 font-mono">
                            計 {clinic.totalOverdueQty} 点
                          </span>
                        </div>
                      </div>

                      {/* Product status button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenClinicStatus?.(clinic.clinicName);
                        }}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="この取引先の商品ステータス・全品目を一覧表示"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>商品ステータス</span>
                      </button>

                      {/* Contact template button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenClinicTemplate(clinic);
                        }}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">遅延案内文</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Accordion Body: Orders for this clinic */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-200 bg-white space-y-3">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>{clinic.clinicName} の遅延伝票一覧 ({clinic.orders.length} 件)</span>
                        <button
                          onClick={() => onOpenClinicStatus?.(clinic.clinicName)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>全商品ステータスボードを開く →</span>
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {clinic.orders.map((ordItem, oIdx) => (
                          <div
                            key={`${ordItem.orderId}_${oIdx}`}
                            className="p-3.5 bg-white hover:bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-slate-900">
                                  受注ID: {ordItem.orderId}
                                </span>
                                <span className="text-slate-400 text-[11px]">
                                  (受注日: {ordItem.orderDate || '未記録'})
                                </span>
                                {getSeverityBadge(ordItem.maxDaysOver)}
                                <span className="text-slate-500 font-mono text-[11px]">
                                  最長予定: {ordItem.earliestDueDate}
                                </span>
                              </div>

                              {/* Order Lines summary */}
                              <div className="flex flex-col gap-1 pl-1">
                                {ordItem.overdueLines.map((l, i) => (
                                  <div key={i} className="flex items-center gap-2 text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    <span className="font-semibold text-slate-900">{l.productName}</span>
                                    <span className="text-slate-500 font-mono">数量: {l.quantity}点</span>
                                    <span className="text-[10px] text-slate-400">
                                      (仕入先: {l.supplierName || '未指定'} / ステージ: {l.stage})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Status & Detail Link */}
                            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                              <select
                                value={ordItem.followup.status}
                                onChange={(e) =>
                                  updateFollowup(ordItem.orderId, e.target.value as OverdueFollowupStatus)
                                }
                                className={`px-2 py-1 rounded-lg border text-[11px] font-bold focus:outline-none cursor-pointer ${getStatusColor(
                                  ordItem.followup.status
                                )}`}
                              >
                                <option value="未対応">未対応</option>
                                <option value="仕入先督促中">仕入先督促中</option>
                                <option value="顧客連絡済">顧客連絡済</option>
                                <option value="代替品提案中">代替品提案中</option>
                                <option value="今週入荷予定">今週入荷予定</option>
                                <option value="対応完了">対応完了</option>
                              </select>

                              <button
                                onClick={() => onSelectOrder(ordItem.order)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium cursor-pointer"
                              >
                                伝票詳細
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Clinic Followup Note Input */}
                      <div className="pt-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          取引先に対する特記事項・交渉メモ:
                        </label>
                        <div className="flex gap-2">
                          <input autoComplete="off"
                            type="text"
                            placeholder="例: 9/25 院長へ直接電話。来週月曜日に代替品到着予定と案内済。"
                            value={clinicNotes[clinic.clinicName] || ''}
                            onChange={(e) => updateClinicNote(clinic.clinicName, e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Note Editing Modal */}
      {editingNoteOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  対応メモ・交渉履歴の記録
                </h3>
                <span className="text-xs text-slate-500">
                  受注ID: {editingNoteOrder.orderId} ({editingNoteOrder.customerName})
                </span>
              </div>
              <button
                onClick={() => setEditingNoteOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  現在の対応ステータス
                </label>
                <select
                  value={editingNoteOrder.followup.status}
                  onChange={(e) =>
                    updateFollowup(editingNoteOrder.orderId, e.target.value as OverdueFollowupStatus)
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none"
                >
                  <option value="未対応">未対応</option>
                  <option value="仕入先督促中">仕入先督促中</option>
                  <option value="顧客連絡済">顧客連絡済</option>
                  <option value="代替品提案中">代替品提案中</option>
                  <option value="今週入荷予定">今週入荷予定</option>
                  <option value="対応完了">対応完了</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  次回アクション予定日
                </label>
                <input
                  type="date"
                  value={nextActionDateInput}
                  onChange={(e) => setNextActionDateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  対応内容・電話交渉メモ
                </label>
                <textarea
                  rows={4}
                  placeholder="例: 仕入先担当〇〇氏に電話で納期督促。税関手続きで遅延しており、9/28に日本到着、9/29出荷予定とのこと。クリニック側には遅延のお詫びと出荷予定日を伝達済。"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-400 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingNoteOrder(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action / Contact Template Modal */}
      {activeTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {activeTemplateModal.type === 'vendor'
                    ? '仕入先向け 納期督促・状況確認テンプレート文'
                    : '取引先（クリニック）向け 納期遅延お詫びテンプレート文'}
                </h3>
              </div>
              <button
                onClick={() => setActiveTemplateModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500">
                楽楽販売から取得した伝票番号、商品名、数量、遅延日数が自動的に挿入されています。
                そのままコピーしてメールやチャットでの連絡にご活用ください。
              </p>

              <textarea
                readOnly
                rows={14}
                value={
                  activeTemplateModal.type === 'vendor' && activeTemplateModal.order
                    ? generateVendorTemplate(activeTemplateModal.order)
                    : activeTemplateModal.clinic
                    ? generateClinicTemplate(activeTemplateModal.clinic)
                    : ''
                }
                className="w-full p-4 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl leading-relaxed text-slate-800 select-all focus:outline-none"
              />
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                ※必要に応じて担当者名や詳細条件を書き換えて送信してください
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text =
                      activeTemplateModal.type === 'vendor' && activeTemplateModal.order
                        ? generateVendorTemplate(activeTemplateModal.order)
                        : activeTemplateModal.clinic
                        ? generateClinicTemplate(activeTemplateModal.clinic)
                        : '';
                    navigator.clipboard.writeText(text);
                    setCopiedTemplate(true);
                    setTimeout(() => setCopiedTemplate(false), 2000);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedTemplate ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTemplate ? 'コピー完了！' : '全文をコピー'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
