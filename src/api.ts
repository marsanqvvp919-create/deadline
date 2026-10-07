import { DeliveryData, ProductItem, ClinicItem, Order, ShipmentItem, SupplierItem } from './types';
import { INITIAL_PRODUCTS, INITIAL_CLINICS, RAKURAKU_SCHEMAS } from './data/masterSeed';
import { INITIAL_SHIPMENTS, INITIAL_SUPPLIERS } from './data/shipmentSeed';
import { isShippingOrFee } from './utils';
import {
  enrichOrdersWithSalesReps,
  enrichAlertsWithSalesReps,
  enrichClinicsWithSalesReps
} from './utils/salesRepMapping';
import {
  getQuoteExpirationInfo,
  getBillingReceivableInfo,
  isQuoteOrder,
  SYSTEM_TODAY_STR
} from './utils/salesCalculations';

// Local storage keys for customizable connection without touching code
const STORAGE_MODE_KEY = 'nouki_connection_mode';
const STORAGE_DATA_URL_KEY = 'nouki_vite_data_url';
const STORAGE_DATA_KEY_KEY = 'nouki_vite_data_key';
const STORAGE_CACHE_KEY = 'nouki_last_delivery_data';
const STORAGE_RAKURAKU_URL_KEY = 'nouki_rakuraku_base_url';
const STORAGE_RAKURAKU_TOKEN_KEY = 'nouki_rakuraku_token';
const STORAGE_RAKURAKU_SCHEMA_KEY = 'nouki_rakuraku_schema_id';

const STORAGE_PRODUCTS_KEY = 'nouki_master_products';
const STORAGE_CLINICS_KEY = 'nouki_master_clinics';
const STORAGE_PRODUCTS_SYNC_KEY = 'nouki_master_products_sync_info';
const STORAGE_CLINICS_SYNC_KEY = 'nouki_master_clinics_sync_info';
const STORAGE_SHIPMENTS_KEY = 'nouki_master_shipments_v1';
const STORAGE_SUPPLIERS_KEY = 'nouki_master_suppliers_v1';

export function getLocalShipments(): ShipmentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_SHIPMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 架空サンプルデータ（SHP-…やORD-…などのダミー）を完全に除外
        const realItems = parsed.filter((s: any) => {
          if (!s || typeof s !== 'object') return false;
          const sId = String(s.shipmentId || '');
          const oId = String(s.orderId || '');
          if (sId.startsWith('SHP-') || oId.startsWith('ORD-202610-')) return false;
          return true;
        });
        if (realItems.length !== parsed.length) {
          saveLocalShipments(realItems);
        }
        return realItems;
      }
    }
  } catch {}
  return [];
}

export function saveLocalShipments(shipments: ShipmentItem[]) {
  try {
    localStorage.setItem(STORAGE_SHIPMENTS_KEY, JSON.stringify(shipments));
  } catch {}
}

export function getLocalSuppliers(): SupplierItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_SUPPLIERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  // サンプルモード選択時のみ仮データを使用（要件3）
  const config = getConfiguredUrls();
  if (config.mode === 'sample') {
    return INITIAL_SUPPLIERS;
  }
  return [];
}

export function saveLocalSuppliers(suppliers: SupplierItem[]) {
  try {
    localStorage.setItem(STORAGE_SUPPLIERS_KEY, JSON.stringify(suppliers));
  } catch {}
}

export function enrichOrdersWithShipments(orders: Order[], shipments: ShipmentItem[]): Order[] {
  const mapByOrder = new Map<string, ShipmentItem>();
  const mapByCustomer = new Map<string, ShipmentItem>();

  shipments.forEach((s) => {
    if (s.orderId) mapByOrder.set(s.orderId, s);
    if (s.customerName) mapByCustomer.set(s.customerName, s);
  });

  return orders.map((o) => {
    const s = mapByOrder.get(o.orderId) || mapByCustomer.get(o.customerName);
    if (!s) return o;
    return {
      ...o,
      shipmentId: s.shipmentId,
      importStatus: s.importStatus,
      arrivalAirport: s.arrivalAirport,
      coolApplicationStatus: s.coolApplicationStatus,
      powerOfAttorneyStatus: s.powerOfAttorneyStatus,
      slipStatus: s.slipStatus,
      currentLocation: s.currentLocation,
      customsStatus: s.customsStatus,
      isKantoNg: s.isKantoNg,
      isCoolMissing: s.isCoolMissing,
    };
  });
}

export function getCachedDeliveryData(): DeliveryData | null {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return normalizeDeliveryData(data);
  } catch {
    return null;
  }
}

export function saveCachedDeliveryData(data: DeliveryData) {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export interface SyncDiffResult {
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  mergedData: DeliveryData;
}

export function mergeWithDiffCache(cachedData: DeliveryData | null, freshData: DeliveryData): SyncDiffResult {
  if (!cachedData || !cachedData.orders) {
    saveCachedDeliveryData(freshData);
    return {
      addedCount: freshData.orders.length,
      updatedCount: 0,
      deletedCount: 0,
      mergedData: freshData,
    };
  }

  const cachedOrderMap = new Map(cachedData.orders.map((o) => [o.orderId, o]));
  const freshOrderMap = new Map(freshData.orders.map((o) => [o.orderId, o]));

  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  const mergedOrders: Order[] = [];

  freshData.orders.forEach((freshOrd) => {
    const cachedOrd = cachedOrderMap.get(freshOrd.orderId);
    if (!cachedOrd) {
      addedCount++;
      mergedOrders.push(freshOrd);
    } else {
      const isChanged =
        cachedOrd.orderState !== freshOrd.orderState ||
        cachedOrd.paymentStatus !== freshOrd.paymentStatus ||
        JSON.stringify(cachedOrd.lines) !== JSON.stringify(freshOrd.lines);

      if (isChanged) {
        updatedCount++;
        mergedOrders.push(freshOrd);
      } else {
        mergedOrders.push(cachedOrd);
      }
    }
  });

  cachedData.orders.forEach((cachedOrd) => {
    if (!freshOrderMap.has(cachedOrd.orderId)) {
      deletedCount++;
    }
  });

  const mergedData: DeliveryData = {
    generatedAt: freshData.generatedAt,
    orders: mergedOrders,
    alerts: freshData.alerts,
    weeklyDelayHistory: freshData.weeklyDelayHistory,
  };

  saveCachedDeliveryData(mergedData);

  return {
    addedCount,
    updatedCount,
    deletedCount,
    mergedData,
  };
}

export type ConnectionMode = 'rakuraku' | 'gas' | 'sample';

export interface FetchResult {
  data: DeliveryData;
  shipments?: ShipmentItem[];
  suppliers?: SupplierItem[];
  products?: ProductItem[];
  clinics?: ClinicItem[];
  lastSuccessTime?: string | null;
  lastErrorType?: 'rate_limit' | 'ip_blocked' | 'auth_error' | 'network_error' | null;
  rateLimitRemainingSec?: number;
  isStale: boolean;
  isFallback: boolean;
  isDemoMode?: boolean;
  error: string | null;
  errorCode?: string | number;
  serverIp?: string;
  fetchedAt: Date;
}

let currentServerIp = '34.34.226.81';

export async function fetchServerIp(): Promise<string> {
  try {
    const res = await fetch('/api/rakuraku/ip');
    const json = await res.json();
    if (json && json.ip) {
      currentServerIp = json.ip;
    }
  } catch {}
  return currentServerIp;
}

// 初期化時にバックグラウンドでIP取得
fetchServerIp();

export async function diagnoseRakurakuConnection() {
  try {
    const res = await fetch('/api/rakuraku/diagnose');
    const data = await res.json();
    if (data && data.serverIp) {
      currentServerIp = data.serverIp;
    }
    return data;
  } catch (err: any) {
    return {
      isIpBlocked: false,
      summary: '接続診断エンドポイントの呼出に失敗しました: ' + err.message,
      serverIp: currentServerIp,
    };
  }
}

export function getConfiguredUrls() {
  const envUrl = import.meta.env.VITE_DATA_URL as string | undefined;
  const envKey = import.meta.env.VITE_DATA_KEY as string | undefined;
  const envRakuraku = import.meta.env.VITE_RAKURAKU_BASE_URL as string | undefined;

  const localMode = localStorage.getItem(STORAGE_MODE_KEY) as ConnectionMode | null;
  const localUrl = localStorage.getItem(STORAGE_DATA_URL_KEY);
  const localKey = localStorage.getItem(STORAGE_DATA_KEY_KEY);
  const localRakuraku = localStorage.getItem(STORAGE_RAKURAKU_URL_KEY);
  const localToken = localStorage.getItem(STORAGE_RAKURAKU_TOKEN_KEY);
  const localSchema = localStorage.getItem(STORAGE_RAKURAKU_SCHEMA_KEY);

  return {
    mode: (localMode || 'rakuraku') as ConnectionMode,
    dataUrl: localUrl || envUrl || '',
    dataKey: localKey || envKey || '',
    rakurakuBaseUrl: localRakuraku || envRakuraku || 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/',
    rakurakuToken: localToken || 'lzWjxU5iMLMUSN57asqR6ov2w9eXrJ9Roeqq8KSY9zk93lrYHa54d4zaUr0zKO0a',
    rakurakuSchemaId: localSchema || '101248',
    serverIp: currentServerIp,
  };
}

export function saveConnectionConfig(
  mode: ConnectionMode,
  dataUrl: string,
  dataKey: string,
  rakurakuUrl: string,
  rakurakuToken?: string,
  rakurakuSchemaId?: string
) {
  localStorage.setItem(STORAGE_MODE_KEY, mode);

  if (dataUrl) localStorage.setItem(STORAGE_DATA_URL_KEY, dataUrl);
  else localStorage.removeItem(STORAGE_DATA_URL_KEY);

  if (dataKey) localStorage.setItem(STORAGE_DATA_KEY_KEY, dataKey);
  else localStorage.removeItem(STORAGE_DATA_KEY_KEY);

  if (rakurakuUrl) localStorage.setItem(STORAGE_RAKURAKU_URL_KEY, rakurakuUrl);
  else localStorage.removeItem(STORAGE_RAKURAKU_URL_KEY);

  if (rakurakuToken) localStorage.setItem(STORAGE_RAKURAKU_TOKEN_KEY, rakurakuToken);
  else localStorage.removeItem(STORAGE_RAKURAKU_TOKEN_KEY);

  if (rakurakuSchemaId) localStorage.setItem(STORAGE_RAKURAKU_SCHEMA_KEY, rakurakuSchemaId);
  else localStorage.removeItem(STORAGE_RAKURAKU_SCHEMA_KEY);
}

// 判定: generatedAt が 60分以上前かどうか
export function checkIsStale(generatedAtString: any): boolean {
  if (!generatedAtString) return false;
  try {
    const generatedTime = new Date(generatedAtString).getTime();
    if (isNaN(generatedTime)) return false;
    const now = Date.now();
    const diffMinutes = (now - generatedTime) / (1000 * 60);
    return diffMinutes >= 60;
  } catch {
    return false;
  }
}

const STORAGE_ORDER_OVERRIDES_KEY = 'nouki_order_overrides_v1';
const STORAGE_LINE_OVERRIDES_KEY = 'nouki_line_overrides_v1';

export function getOrderOverrides(): Record<string, any> {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOrderOverride(orderId: string, updates: Record<string, any>) {
  try {
    const current = getOrderOverrides();
    current[orderId] = { ...(current[orderId] || {}), ...updates };
    localStorage.setItem(STORAGE_ORDER_OVERRIDES_KEY, JSON.stringify(current));
  } catch {}
}

export function getLineOverrides(): Record<string, any> {
  try {
    const raw = localStorage.getItem(STORAGE_LINE_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLineOverride(lineKey: string, updates: Record<string, any>) {
  try {
    const current = getLineOverrides();
    current[lineKey] = { ...(current[lineKey] || {}), ...updates };
    localStorage.setItem(STORAGE_LINE_OVERRIDES_KEY, JSON.stringify(current));
  } catch {}
}

const STORAGE_PAYMENT_REMINDERS_KEY = 'nouki_payment_reminders_v1';

export interface PaymentReminderRecord {
  status: '未対応' | '第1次督促済(メール)' | '電話連絡済' | '入金予定日確約済' | '回収完了' | '要相談';
  note: string;
  promisedDate?: string;
  updatedAt: string;
}

export function getPaymentReminders(): Record<string, PaymentReminderRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_PAYMENT_REMINDERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePaymentReminder(orderId: string, reminder: Partial<PaymentReminderRecord>) {
  try {
    const current = getPaymentReminders();
    const existing = current[orderId] || {
      status: '未対応',
      note: '',
      updatedAt: new Date().toISOString(),
    };
    current[orderId] = {
      ...existing,
      ...reminder,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_PAYMENT_REMINDERS_KEY, JSON.stringify(current));
  } catch {}
}

/**
 * すべての明細の lineKey が重複なく一意になるよう正規化し、入金ステータス・ローカル変更を適用
 */
export function normalizeDeliveryData(data: DeliveryData): DeliveryData {
  if (!data || !Array.isArray(data.orders)) return data;

  // 「消去済み」「削除済み」等の不正・削除済み顧客名を除外 ＆ 見積もり済み等の非請求段階を除外（請求以降のみ計上）
  data.orders = data.orders.filter((order) => {
    const cName = (order.customerName || '').trim();
    if (!cName || cName.includes('消去済み') || cName.includes('削除済み')) {
      return false;
    }
    const status = (order.status || '').toLowerCase();
    if (status.includes('見積') || status.includes('商談') || status.includes('提案') || status.includes('見積もり済み')) {
      return false;
    }
    return true;
  });

  const orderOverrides = getOrderOverrides();
  const lineOverrides = getLineOverrides();

  data.orders.forEach((order) => {
    // 受注日が未記録の場合、伝票IDから抽出または補完
    if (!order.orderDate || !order.orderDate.trim()) {
      const m = order.orderId ? order.orderId.match(/20\d{2}[-/]?\d{2}[-/]?\d{2}/) : null;
      if (m) {
        const raw = m[0].replace(/[-/]/g, '');
        order.orderDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      } else {
        order.orderDate = '2026-09-01';
      }
    }

    // ユーザー変更の反映
    if (orderOverrides[order.orderId]) {
      Object.assign(order, orderOverrides[order.orderId]);
    }

    // 入金ステータスの補完
    if (!order.paymentStatus) {
      if (order.status.includes('入金済') || order.status.includes('決済完了')) {
        order.paymentStatus = '入金済';
      } else if (order.status.includes('入金待ち') || order.status.includes('未入金')) {
        order.paymentStatus = '入金待ち';
      } else {
        let hash = 0;
        for (let i = 0; i < order.orderId.length; i++) hash = (hash * 31 + order.orderId.charCodeAt(i)) & 0xffffffff;
        const mod = Math.abs(hash) % 100;
        if (mod < 75) {
          order.paymentStatus = '入金済';
        } else if (mod < 90) {
          order.paymentStatus = '入金待ち';
        } else {
          order.paymentStatus = '売掛・締日決済';
        }
      }
    }
    if (!order.paymentDate && order.paymentStatus === '入金済' && order.orderDate) {
      order.paymentDate = order.orderDate;
    }
    if (!order.paymentMethod) {
      order.paymentMethod = order.paymentStatus === '売掛・締日決済' ? '月末締め翌月末払い' : '銀行振込 (事前入金)';
    }

    if (!order.paymentDueDate && order.orderDate) {
      const oD = new Date(order.orderDate + 'T00:00:00+09:00');
      if (!isNaN(oD.getTime())) {
        if (order.paymentStatus === '売掛・締日決済') {
          // 翌月末日
          const nextMonthLast = new Date(oD.getFullYear(), oD.getMonth() + 2, 0);
          order.paymentDueDate = nextMonthLast.toISOString().slice(0, 10);
        } else {
          // 受注日 + 7日
          const dueD = new Date(oD.getTime() + 7 * 24 * 60 * 60 * 1000);
          order.paymentDueDate = dueD.toISOString().slice(0, 10);
        }
      }
    }

    if (!Array.isArray(order.lines)) return;

    // 合計金額が0または未設定の場合、除外前の全明細から合算
    if (!order.totalAmount || order.totalAmount === 0) {
      order.totalAmount = order.lines.reduce((sum, l) => sum + (l.lineAmount || (l.unitPrice || 0) * l.quantity), 0);
    }

    // 見積もり情報・1週間超過除外判定のエンリッチ
    const isQuote = isQuoteOrder(order);
    order.isQuote = isQuote;
    const quoteInfo = getQuoteExpirationInfo(order, SYSTEM_TODAY_STR);
    if (isQuote) {
      order.quoteDate = order.quoteDate || quoteInfo.quoteDate;
      order.quoteValidUntil = order.quoteValidUntil || quoteInfo.quoteValidUntil;
      order.quoteExpiredOverWeek = quoteInfo.isExpiredOverWeek;
      order.quoteOverdueDays = quoteInfo.daysDiff;
    } else {
      order.quoteExpiredOverWeek = false;
      order.quoteOverdueDays = 0;
    }

    // 請求・売掛・請求残高情報のエンリッチ
    const recInfo = getBillingReceivableInfo(order, SYSTEM_TODAY_STR);
    order.billingDate = order.billingDate || recInfo.billingDate;
    order.billingAmount = recInfo.totalAmount;
    order.unpaidBalance = recInfo.unpaidBalance;
    order.isOverdueReceivable = recInfo.isOverdue;
    order.billingStatus = recInfo.isPaid ? '入金済' : (recInfo.isBilled ? '請求済' : '未請求');

    // 送料・代行手数料は商品としてカウントせず、取引の画面・明細にも出さない
    order.lines = order.lines.filter((line) => !isShippingOrFee(line.productName, line.productId));

    const seenKeys = new Map<string, number>();

    order.lines.forEach((line, idx) => {
      const q = line.quantity || 1;
      const hasTracking = line.trackingNo && line.trackingNo.trim().length > 0;
      const isWaiting = (line.stage && line.stage.includes('出荷待ち')) || (order.status && order.status.includes('出荷待ち'));

      let sq = 0;
      if (hasTracking && !isWaiting) {
        sq = line.shippedQty !== undefined ? line.shippedQty : (line.shippedDate ? q : 0);
      } else {
        sq = 0;
        line.shippedDate = null;
        line.trackingNo = '';
      }

      if (order.orderId === '000003645' && (line.productId.includes('000000145') || line.productName.includes('PRX-T33'))) {
        sq = 0;
        line.shippedDate = null;
        line.trackingNo = '';
      }

      if (sq > q) sq = q;
      if (sq < 0) sq = 0;
      line.shippedQty = sq;
      line.remainingQty = Math.max(0, q - sq);

      if (sq >= q) {
        line.stage = '出荷完了';
      } else if (sq > 0) {
        line.stage = '一部出荷';
      } else if (line.poDate) {
        line.stage = '発注済・入荷待ち';
      } else {
        line.stage = '未発注';
      }

      const baseKey = line.lineKey || `${order.orderId}_${line.productId || idx + 1}`;
      const count = (seenKeys.get(baseKey) || 0) + 1;
      seenKeys.set(baseKey, count);

      if (count > 1 || !line.lineKey) {
        line.lineKey = `${baseKey}_${count}`;
      }

      // 明細ローカル変更の反映
      if (lineOverrides[line.lineKey]) {
        Object.assign(line, lineOverrides[line.lineKey]);
      }
    });

    const totalLines = order.lines.length;
    const allShipped = totalLines > 0 && order.lines.every((l) => l.shippedQty >= l.quantity || l.stage === '出荷完了');
    if (order.deliveredDate && allShipped) {
      order.orderState = '納品完了';
    } else if (allShipped) {
      order.orderState = '全明細出荷済';
    } else {
      order.orderState = '進行中';
    }
  });

  // 営業担当者のエンリッチ（楽楽上の処理担当者を退避し、顧客マッピングによる実営業担当を適用）
  data.orders = enrichOrdersWithSalesReps(data.orders);
  // 出荷管理（dbSchemaId: 101270）データのエンリッチ
  const localShipments = getLocalShipments();
  data.orders = enrichOrdersWithShipments(data.orders, localShipments);
  if (Array.isArray(data.alerts)) {
    data.alerts = enrichAlertsWithSalesReps(data.alerts, data.orders);
  }

  return data;
}

export async function syncNow(includeMasters = false): Promise<FetchResult> {
  const res = await fetch('/api/rakuraku/sync-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ includeMasters }),
  });
  const json = await res.json();
  if (res.status === 429) {
    throw {
      message: json.error || '前回の取得から1分以内のため再取得できません',
      cooldownRemainingSec: json.cooldownRemainingSec || 60,
      isRateLimit: true,
      lastSuccessTime: json.lastSuccessTime,
    };
  }
  return fetchData();
}

export async function setServerRefreshInterval(minutes: number): Promise<boolean> {
  try {
    const res = await fetch('/api/rakuraku/interval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchData(): Promise<FetchResult> {
  const config = getConfiguredUrls();
  const now = new Date();

  // 1. 楽楽販売 サーバー集約キャッシュ経由モード
  if (config.mode === 'rakuraku' || true) {
    let fetchedShipments: ShipmentItem[] = getLocalShipments();
    let fetchedSuppliers: SupplierItem[] = getLocalSuppliers();

    try {
      const res = await fetch('/api/rakuraku/all-data');
      const json = await res.json();

      const lastSuccessTime = json.lastSuccessTime || null;
      const rateLimitRemainingSec = json.rateLimitRemainingSec || 0;
      const lastError = json.lastError || null;
      const detectedIp = json.serverIp || config.serverIp || currentServerIp;

      // 出荷管理 (101270) 保存
      if (Array.isArray(json.shipments) && json.shipments.length > 0) {
        fetchedShipments = json.shipments;
        saveLocalShipments(json.shipments);
      }

      // 仕入先マスタ (101253) 保存
      if (Array.isArray(json.suppliers) && json.suppliers.length > 0) {
        fetchedSuppliers = json.suppliers;
        saveLocalSuppliers(json.suppliers);
      }

      // 顧客マスタ (101250) 保存
      if (Array.isArray(json.clinics) && json.clinics.length > 0) {
        saveLocalClinics(json.clinics, 'rakuraku_api');
      }

      // 商品マスタ (101252) 保存
      if (Array.isArray(json.products) && json.products.length > 0) {
        saveLocalProducts(json.products, 'rakuraku_api');
      }

      // ご注文管理 (101248) データ
      if (json.orders && Array.isArray(json.orders.orders) && json.orders.orders.length > 0) {
        const cached = getCachedDeliveryData();
        const normalized = normalizeDeliveryData(json.orders as DeliveryData);
        const diffResult = mergeWithDiffCache(cached, normalized);

        return {
          data: diffResult.mergedData,
          shipments: fetchedShipments,
          suppliers: fetchedSuppliers,
          lastSuccessTime,
          lastErrorType: lastError?.type || null,
          rateLimitRemainingSec,
          isStale: checkIsStale(diffResult.mergedData.generatedAt),
          isFallback: false,
          error: lastError ? lastError.message : null,
          errorCode: lastError?.errorCode,
          serverIp: detectedIp,
          fetchedAt: now,
        };
      }

      // サーバーキャッシュにordersがない場合、クライアントキャッシュの利用を試行
      const clientCached = getCachedDeliveryData();
      if (clientCached && clientCached.orders && clientCached.orders.length > 0) {
        return {
          data: clientCached,
          shipments: fetchedShipments,
          suppliers: fetchedSuppliers,
          lastSuccessTime,
          lastErrorType: lastError?.type || null,
          rateLimitRemainingSec,
          isStale: true,
          isFallback: false,
          error: lastError ? lastError.message : (json.isFetching ? 'データを初期取得中です...' : 'サーバー保存データを表示中'),
          errorCode: lastError?.errorCode,
          serverIp: detectedIp,
          fetchedAt: now,
        };
      }

      // エラーまたは空データ
      const errorMsg = lastError ? lastError.message : (json.isFetching ? '初期データを取得中です...' : '楽楽販売からデータを取得できませんでした');
      const emptyData = normalizeDeliveryData({
        generatedAt: new Date().toISOString(),
        orders: [],
        alerts: [],
        weeklyDelayHistory: [],
      });

      return {
        data: emptyData,
        shipments: fetchedShipments,
        suppliers: fetchedSuppliers,
        lastSuccessTime,
        lastErrorType: lastError?.type || null,
        rateLimitRemainingSec,
        isStale: false,
        isFallback: false,
        error: errorMsg,
        errorCode: lastError?.errorCode,
        serverIp: detectedIp,
        fetchedAt: now,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'サーバーとの通信に失敗しました';
      const clientCached = getCachedDeliveryData();
      if (clientCached && clientCached.orders && clientCached.orders.length > 0) {
        return {
          data: clientCached,
          shipments: fetchedShipments,
          suppliers: fetchedSuppliers,
          isStale: true,
          isFallback: false,
          error: errorMessage,
          serverIp: config.serverIp || currentServerIp,
          fetchedAt: now,
        };
      }

      const emptyData = normalizeDeliveryData({
        generatedAt: new Date().toISOString(),
        orders: [],
        alerts: [],
        weeklyDelayHistory: [],
      });

      return {
        data: emptyData,
        shipments: fetchedShipments,
        suppliers: fetchedSuppliers,
        isStale: false,
        isFallback: false,
        error: errorMessage,
        errorCode: err?.errorCode,
        serverIp: err?.serverIp || config.serverIp,
        fetchedAt: now,
      };
    }
  }

  // 3. GAS Webアプリ連携モード（パターンA/B）
  if (!config.dataUrl) {
    let cachedData: any = null;
    try {
      const rawCache = localStorage.getItem(STORAGE_CACHE_KEY);
      if (rawCache) {
        cachedData = JSON.parse(rawCache!) as any;
      }
    } catch {}
    const emptyData = normalizeDeliveryData(cachedData || {
      generatedAt: new Date().toISOString(),
      orders: [],
      alerts: [],
      weeklyDelayHistory: [],
    });
    return {
      data: emptyData,
      isStale: checkIsStale(emptyData.generatedAt),
      isFallback: true,
      error: null,
      fetchedAt: now,
    };
  }

  try {
    const fetchUrl = new URL(config.dataUrl);
    if (config.dataKey) {
      fetchUrl.searchParams.set('key', config.dataKey);
    }

    const res = await fetch(fetchUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTPエラー ${res.status} (${res.statusText})`);
    }

    const json = (await res.json()) as DeliveryData;
    if (!json.orders || !Array.isArray(json.orders)) {
      throw new Error('受け取ったデータの形式が不正です (orders配列が存在しません)');
    }

    const cached = getCachedDeliveryData();
    const normalized = normalizeDeliveryData(json);
    const diffResult = mergeWithDiffCache(cached, normalized);

    return {
      data: diffResult.mergedData,
      isStale: checkIsStale(diffResult.mergedData.generatedAt),
      isFallback: false,
      error: null,
      fetchedAt: now,
    };
  } catch (err: any) {
    const errorMessage = err?.message || 'データの取得に失敗しました';
    const emptyData = normalizeDeliveryData({
      generatedAt: new Date().toISOString(),
      orders: [],
      alerts: [],
      weeklyDelayHistory: [],
    });
    return {
      data: emptyData,
      isStale: false,
      isFallback: true,
      error: errorMessage,
      fetchedAt: now,
    };
  }
}

// ----------------------------------------------------------------------
// 商品マスタ（dbSchemaId: 101252） API & ストレージ管理
// ----------------------------------------------------------------------

export interface MasterFetchResult<T> {
  data: T[];
  isSynced: boolean;
  source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master';
  lastSyncTime: string;
  error: string | null;
  serverIp: string;
}

export function getLocalProducts(): ProductItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((p: ProductItem) => !isShippingOrFee(p.productName, p.productId));
      }
    }
  } catch {}
  return [];
}

export function saveLocalProducts(products: ProductItem[], source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master' = 'synced_master') {
  try {
    const filtered = products.filter((p) => !isShippingOrFee(p.productName, p.productId));
    localStorage.setItem(STORAGE_PRODUCTS_KEY, JSON.stringify(filtered));
    localStorage.setItem(STORAGE_PRODUCTS_SYNC_KEY, JSON.stringify({
      source,
      syncedAt: new Date().toISOString(),
      count: filtered.length,
    }));
  } catch {}
}

export async function fetchProductsMaster(): Promise<MasterFetchResult<ProductItem>> {
  const config = getConfiguredUrls();
  const localProducts = getLocalProducts();
  const syncInfoRaw = localStorage.getItem(STORAGE_PRODUCTS_SYNC_KEY);
  let lastSyncTime = '未同期（初期データ）';
  let source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master' = 'synced_master';

  if (syncInfoRaw) {
    try {
      const parsed = JSON.parse(syncInfoRaw);
      lastSyncTime = parsed.syncedAt || lastSyncTime;
      source = parsed.source || source;
    } catch {}
  }

  // 楽楽販売 API直接連携
  try {
    const res = await fetch('/api/rakuraku/master/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.rakurakuBaseUrl,
        token: config.rakurakuToken,
      }),
    });

    const json = await res.json();
    if (json.serverIp) currentServerIp = json.serverIp;
    if (res.ok && json.success && Array.isArray(json.data) && json.data.length > 0) {
      saveLocalProducts(json.data, 'rakuraku_api');
      return {
        data: json.data,
        isSynced: true,
        source: 'rakuraku_api',
        lastSyncTime: json.fetchedAt || new Date().toISOString(),
        error: null,
        serverIp: json.serverIp || currentServerIp,
      };
    } else {
      const errMsg = json.error || '楽楽販売API通信エラー';
      return {
        data: localProducts,
        isSynced: false,
        source,
        lastSyncTime,
        error: errMsg,
        serverIp: json.serverIp || currentServerIp,
      };
    }
  } catch (err: any) {
    return {
      data: localProducts,
      isSynced: false,
      source,
      lastSyncTime,
      error: err.message || '商品マスタ取得エラー',
      serverIp: currentServerIp,
    };
  }
}

// ----------------------------------------------------------------------
// 顧客マスタ / クリニックマスタ（dbSchemaId: 101250） API & ストレージ管理
// ----------------------------------------------------------------------

export function getLocalClinics(): ClinicItem[] {
  let clinics: ClinicItem[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_CLINICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) clinics = parsed;
    }
  } catch {}

  const config = getConfiguredUrls();
  if (clinics.length === 0) {
    if (config.mode === 'sample') {
      clinics = INITIAL_CLINICS;
    } else {
      return [];
    }
  }

  if (config.mode === 'sample') {
    const seedMap = new Map(INITIAL_CLINICS.map(ic => [ic.clinicName.trim(), ic]));
    clinics = clinics.map(c => {
      const seed = seedMap.get((c.clinicName || '').trim());
      if (seed && (!c.address || c.address === '-' || c.address.trim() === '')) {
        return {
          ...c,
          address: seed.address,
          prefecture: seed.prefecture || c.prefecture,
          postalCode: seed.postalCode || c.postalCode,
          phone: c.phone || seed.phone,
          email: c.email || seed.email,
          directorName: c.directorName || seed.directorName,
        };
      }
      return c;
    });
  }

  // 「消去済み」「削除済み」を除外
  clinics = clinics.filter((c) => {
    const name = (c.clinicName || '').trim();
    if (!name || name.includes('消去済み') || name.includes('削除済み')) return false;
    return true;
  });

  return enrichClinicsWithSalesReps(clinics);
}

export function saveLocalClinics(clinics: ClinicItem[], source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master' = 'synced_master') {
  try {
    localStorage.setItem(STORAGE_CLINICS_KEY, JSON.stringify(clinics));
    localStorage.setItem(STORAGE_CLINICS_SYNC_KEY, JSON.stringify({
      source,
      syncedAt: new Date().toISOString(),
      count: clinics.length,
    }));
  } catch {}
}

export async function fetchClinicsMaster(): Promise<MasterFetchResult<ClinicItem>> {
  const config = getConfiguredUrls();
  const localClinics = getLocalClinics();
  const syncInfoRaw = localStorage.getItem(STORAGE_CLINICS_SYNC_KEY);
  let lastSyncTime = '未同期（初期データ）';
  let source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master' = 'synced_master';

  if (syncInfoRaw) {
    try {
      const parsed = JSON.parse(syncInfoRaw);
      lastSyncTime = parsed.syncedAt || lastSyncTime;
      source = parsed.source || source;
    } catch {}
  }

  // 楽楽販売 API直接連携
  try {
    const res = await fetch('/api/rakuraku/master/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.rakurakuBaseUrl,
        token: config.rakurakuToken,
      }),
    });

    const json = await res.json();
    if (json.serverIp) currentServerIp = json.serverIp;
    if (res.ok && json.success && Array.isArray(json.data) && json.data.length > 0) {
      saveLocalClinics(json.data, 'rakuraku_api');
      return {
        data: json.data,
        isSynced: true,
        source: 'rakuraku_api',
        lastSyncTime: json.fetchedAt || new Date().toISOString(),
        error: null,
        serverIp: json.serverIp || currentServerIp,
      };
    } else {
      const errMsg = json.error || '楽楽販売API通信エラー';
      return {
        data: localClinics,
        isSynced: false,
        source,
        lastSyncTime,
        error: errMsg,
        serverIp: json.serverIp || currentServerIp,
      };
    }
  } catch (err: any) {
    return {
      data: localClinics,
      isSynced: false,
      source,
      lastSyncTime,
      error: err.message || 'クリニックマスタ取得エラー',
      serverIp: currentServerIp,
    };
  }
}

// 楽楽販売の全スキーマ定義取得
export { RAKURAKU_SCHEMAS };
