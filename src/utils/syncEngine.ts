import { Order, PaymentStatus } from '../types';

export interface SalesChangeHistoryItem {
  id: string;
  rakurakuRecordId?: string;
  orderNumber: string;
  invoiceNumber?: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  difference?: number;
  changedAt: string;
  syncedAt: string;
}

export interface InvoiceRecord {
  invoiceNumber: string;
  orderId: string;
  customerName: string;
  invoiceDate: string;        // 請求書発行日 (第1優先の売上計上基準)
  invoiceAmount: number;      // 請求金額
  salesMonth: string;         // YYYY-MM (売上計上月: 請求書発行日基準)
  paymentStatus: PaymentStatus;
  paymentDueDate?: string | null;
  unpaidBalance: number;
  updatedAt: string;
}

const STORAGE_STORED_ORDERS_KEY = 'nouki_stored_orders_v2';
const STORAGE_CHANGE_HISTORY_KEY = 'nouki_sales_change_history_v1';
const STORAGE_INVOICES_KEY = 'nouki_invoices_v1';
const STORAGE_SYNC_STATE_KEY = 'nouki_sync_state_v1';

export function getStoredOrders(): Record<string, Order> {
  try {
    const raw = localStorage.getItem(STORAGE_STORED_ORDERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getSalesChangeHistory(): SalesChangeHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_CHANGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getStoredInvoices(): Record<string, InvoiceRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_INVOICES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 差分同期（UPSERT方式）および変更履歴（sales_change_history）の記録を実行
 * 冪等性を保証: 何度実行しても元データに変更がなければ売上・受注金額は1円も変動しない
 */
export function syncAndDiffOrders(newOrders: Order[]): {
  syncedOrders: Order[];
  changeHistory: SalesChangeHistoryItem[];
  invoices: InvoiceRecord[];
} {
  const storedOrders = getStoredOrders();
  const changeHistory = getSalesChangeHistory();
  const invoicesMap = getStoredInvoices();
  const nowIso = new Date().toISOString();

  // 画面に出すのは常に楽楽販売の最新データ。保存済みの伝票は変更履歴を作るための比較にだけ使う
  // （以前は変更がない伝票に古い保存データを使っており、出荷日などの更新が反映されず、削除済みの伝票も残っていた）
  const updatedOrders: Record<string, Order> = {};
  const newHistoryItems: SalesChangeHistoryItem[] = [];

  newOrders.forEach((newOrder) => {
    const key = newOrder.orderId || newOrder.customerName + '_' + newOrder.orderDate;
    const existing = storedOrders[key];

    // 金額算出
    const newTotalAmount =
      newOrder.totalAmount ||
      newOrder.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);

    const newInvoiceDate = newOrder.billingDate || newOrder.deliveredDate || null;
    const newInvoiceNumber = (newOrder as any).invoiceNumber || `INV-${newOrder.orderId}`;
    const newSalesMonth = newInvoiceDate ? newInvoiceDate.slice(0, 7) : '未計上';

    // 請求・インプレッションレコードの作成・更新
    if (newInvoiceDate) {
      const existingInv = invoicesMap[newInvoiceNumber];
      const invAmount = newTotalAmount;
      if (!existingInv) {
        invoicesMap[newInvoiceNumber] = {
          invoiceNumber: newInvoiceNumber,
          orderId: newOrder.orderId,
          customerName: newOrder.customerName,
          invoiceDate: newInvoiceDate,
          invoiceAmount: invAmount,
          salesMonth: newSalesMonth,
          paymentStatus: newOrder.paymentStatus || '入金済',
          paymentDueDate: newOrder.paymentDueDate || null,
          unpaidBalance: newOrder.paymentStatus === '入金済' ? 0 : invAmount,
          updatedAt: nowIso,
        };
      } else {
        // 金額変更等の追跡
        if (existingInv.invoiceAmount !== invAmount) {
          const diff = invAmount - existingInv.invoiceAmount;
          newHistoryItems.unshift({
            id: 'hist_' + Math.random().toString(36).substr(2, 9),
            orderNumber: newOrder.orderId,
            invoiceNumber: newInvoiceNumber,
            fieldName: '請求金額',
            oldValue: String(existingInv.invoiceAmount),
            newValue: String(invAmount),
            difference: diff,
            changedAt: nowIso,
            syncedAt: nowIso,
          });
          existingInv.invoiceAmount = invAmount;
          existingInv.unpaidBalance = existingInv.paymentStatus === '入金済' ? 0 : invAmount;
        }
        if (existingInv.invoiceDate !== newInvoiceDate) {
          existingInv.invoiceDate = newInvoiceDate;
          existingInv.salesMonth = newInvoiceDate.slice(0, 7);
        }
        existingInv.updatedAt = nowIso;
      }
    }

    if (!existing) {
      // INSERT
      updatedOrders[key] = {
        ...newOrder,
        totalAmount: newTotalAmount,
        billingAmount: newTotalAmount,
      };
      newHistoryItems.unshift({
        id: 'hist_' + Math.random().toString(36).substr(2, 9),
        orderNumber: newOrder.orderId,
        invoiceNumber: newInvoiceNumber,
        fieldName: '新規受注登録',
        oldValue: '-',
        newValue: `金額: ¥${newTotalAmount}`,
        difference: newTotalAmount,
        changedAt: nowIso,
        syncedAt: nowIso,
      });
    } else {
      // UPDATE & DIFF CHECK
      const changes: { field: string; oldVal: string; newVal: string; diff?: number }[] = [];

      const existingTotalAmount = existing.totalAmount || 0;
      if (existingTotalAmount !== newTotalAmount) {
        changes.push({
          field: '受注/請求金額',
          oldVal: String(existingTotalAmount),
          newVal: String(newTotalAmount),
          diff: newTotalAmount - existingTotalAmount,
        });
      }

      if (existing.status !== newOrder.status) {
        changes.push({
          field: 'ステータス',
          oldVal: existing.status,
          newVal: newOrder.status,
        });
      }

      if (existing.salesRep !== newOrder.salesRep) {
        changes.push({
          field: '担当営業',
          oldVal: existing.salesRep,
          newVal: newOrder.salesRep,
        });
      }

      const existingBillingDate = existing.billingDate || null;
      const incomingBillingDate = newOrder.billingDate || null;
      if (existingBillingDate !== incomingBillingDate) {
        changes.push({
          field: '請求日/発行日',
          oldVal: existingBillingDate || '未発行',
          newVal: incomingBillingDate || '未発行',
        });
      }

      updatedOrders[key] = {
        ...newOrder,
        totalAmount: newTotalAmount,
      };

      if (changes.length > 0) {
        // 変更があった項目の履歴を残す

        changes.forEach((c) => {
          newHistoryItems.unshift({
            id: 'hist_' + Math.random().toString(36).substr(2, 9),
            orderNumber: newOrder.orderId,
            invoiceNumber: newInvoiceNumber,
            fieldName: c.field,
            oldValue: c.oldVal,
            newValue: c.newVal,
            difference: c.diff,
            changedAt: nowIso,
            syncedAt: nowIso,
          });
        });
      }
    }
  });

  const finalHistory = [...newHistoryItems, ...changeHistory].slice(0, 200);
  const finalOrdersList = Object.values(updatedOrders);
  const finalInvoicesList = Object.values(invoicesMap);

  try {
    localStorage.setItem(STORAGE_STORED_ORDERS_KEY, JSON.stringify(updatedOrders));
    localStorage.setItem(STORAGE_CHANGE_HISTORY_KEY, JSON.stringify(finalHistory));
    localStorage.setItem(STORAGE_INVOICES_KEY, JSON.stringify(invoicesMap));
    localStorage.setItem(STORAGE_SYNC_STATE_KEY, JSON.stringify({ lastSyncedAt: nowIso, count: finalOrdersList.length }));
  } catch {}

  return {
    syncedOrders: finalOrdersList,
    changeHistory: finalHistory,
    invoices: finalInvoicesList,
  };
}
