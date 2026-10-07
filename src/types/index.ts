export type Stage = '未発注' | '発注済・入荷待ち' | '一部出荷' | '出荷完了';

export type OrderState = '進行中' | '全明細出荷済' | '納品完了';

export type PaymentStatus = '入金済' | '未入金' | '入金待ち' | '売掛・締日決済';

export type AlertType = '遅延' | '間近' | '漏れ';

export type AlertSeverity = '高' | '中' | '低';

export interface OrderLine {
  lineKey: string;          // 受注ID_商品ID
  productId: string;
  productName: string;
  quantity: number;
  supplierName: string;
  stage: Stage;
  earliestDate: string | null; // YYYY-MM-DD
  latestDate: string | null;   // YYYY-MM-DD
  poDate: string | null;       // YYYY-MM-DD
  shippedDate: string | null;  // YYYY-MM-DD
  rawShippedDate?: string | null; // 楽楽販売の明細「出荷日」そのまま（出荷番号の有無で補正しない）
  warehouseShippedDate?: string | null; // 出荷管理の「倉庫出荷日」（倉庫から出た日。あれば出荷日より優先）
  promisedDate?: string | null;     // 楽楽販売「お約束納期」
  deliveryRisk?: string;            // 楽楽販売「納期危険」
  deliveryCompliance?: string;      // 楽楽販売「納期遵守」
  rakurakuMissedOrder?: string;     // 楽楽販売「発注漏れ」
  shippedQty: number;
  remainingQty: number;
  trackingNo: string;
  duplicateLines: boolean;
  unitPrice?: number;
  lineAmount?: number;
  costPrice?: number;
  poNumber?: string;
}

export interface Order {
  orderId: string;
  status: string;
  salesRep: string;           // 実営業担当（取引先割当または個別指定）
  clerkName?: string;         // 楽楽販売上の処理担当
  customerName: string;
  orderDate: string;           // YYYY-MM-DD
  requestedDate: string | null;// YYYY-MM-DD
  deliveredDate: string | null;// YYYY-MM-DD
  orderState: OrderState;
  lines: OrderLine[];
  // 楽楽販売「納期：①超過」判定用。送料・手数料を含む全明細の最長納品予定日と出荷日
  overdueBasis?: {
    productId?: string;
    latestDate: string | null;
    shippedDate: string | null;
    warehouseShippedDate?: string | null;
  }[];
  paymentStatus?: PaymentStatus;
  paymentDate?: string | null;
  paymentDueDate?: string | null; // 入金予定日・支払期日 YYYY-MM-DD
  paymentMethod?: string;
  totalAmount?: number;

  // 見積もり管理項目（要件1: 見積期日1週間超過の自動除外用）
  quoteDate?: string | null;          // 見積提出日 YYYY-MM-DD
  quoteValidUntil?: string | null;    // 見積有効期日 YYYY-MM-DD
  isQuote?: boolean;                  // 見積伝票フラグ
  quoteExpiredOverWeek?: boolean;     // 見積期日を1週間(7日)超経過したため計算対象外フラグ
  quoteOverdueDays?: number;          // 期日超過日数

  // 請求・売掛・入金管理項目（要件2: 請求残高の把握用）
  billingDate?: string | null;        // 請求日 YYYY-MM-DD
  billingAmount?: number;             // 請求金額
  unpaidBalance?: number;             // 請求残高（未回収額）
  billingStatus?: '未請求' | '請求済' | '一部入金' | '入金済';
  isOverdueReceivable?: boolean;      // 支払期日を過ぎた未入金フラグ

  // 出荷管理（dbSchemaId: 101270）連携項目
  shipmentId?: string;                // 出荷ID
  importStatus?: string;              // 輸入確認ステータス
  arrivalAirport?: string;            // 到着空港
  coolApplicationStatus?: string;     // クール申請
  powerOfAttorneyStatus?: string;     // 委任状
  slipStatus?: string;                // 伝票
  currentLocation?: string;           // 現在地
  customsStatus?: string;             // 通関ステータス
  isKantoNg?: boolean;                // 通関NGフラグ
  isCoolMissing?: boolean;            // クール手配漏れフラグ
}

export interface ShipmentItem {
  shipmentId: string;              // 出荷ID (DO-…)
  orderId: string;                 // 受注ID
  customerId?: string;             // クリニックID
  customerName: string;            // クリニック名（顧客マスタより）
  warehouse?: string;              // 出荷元倉庫
  arrivalAirport: string;          // 到着空港 (KIX/NRT/NGO)
  importStatus: string;            // 輸入確認ステータス
  coolApplicationStatus: string;   // クール申請
  powerOfAttorneyStatus: string;   // 委任状
  slipStatus: string;              // 伝票
  phaNumber?: string;              // PHA番号
  warehouseInvoiceNo?: string;     // 倉庫インボイス番号
  currentLocation: string;         // 現在地
  trackingNo: string;              // 出荷番号
  kantoCustomsPermitted?: string;  // 関東通関可否
  productId?: string;
  productName?: string;
  quantity?: number;
  carrier?: string;
  shippedDate?: string;
  customsStatus?: string;
  isKantoNg: boolean;              // 通関NG (到着空港がNRTで、関東通関可否「不可」)
  isCoolMissing: boolean;          // クール手配漏れ (クール申請・委任状・伝票のどれかが「未」)
  memo?: string;
  updatedAt?: string;
}

export interface SupplierItem {
  supplierId: string;
  supplierName: string;
  country?: string;
  leadTimeDays?: number;
  contactPerson?: string;
  email?: string;
  phone?: string;
  status?: string;
}

export interface AlertItem {
  ruleId: string;              // A1, A2, A3, A4, B1, B2, B3, B4, B5
  type: AlertType;             // 遅延, 間近, 漏れ
  severity: AlertSeverity;     // 高, 中, 低
  ruleName: string;
  orderId: string;
  lineKey: string;
  salesRep: string;            // 実営業担当
  clerkName?: string;          // 楽楽販売上の処理担当
  dueDate: string | null;      // YYYY-MM-DD
  daysOver: number;
  message: string;
}

export interface WeeklyHistoryItem {
  weekEnd: string;             // YYYY-MM-DD
  delayed: number;
}

export interface DeliveryData {
  generatedAt?: string | null;         // ISO timestamp
  orders: Order[];
  alerts: AlertItem[];
  weeklyDelayHistory?: WeeklyHistoryItem[];
}

export type ViewTab =
  | 'dashboard'
  | 'delivery_dashboard'
  | 'procurement'
  | 'unshipped_clinics'
  | 'partial_shipment'
  | 'overdue'
  | 'rep'
  | 'completed'
  | 'sales_dashboard'
  | 'sales_rep_sales'
  | 'sales_clinic_master'
  | 'reorder_prediction'
  | 'rep_ranking'
  | 'alerts'
  | 'products'
  | 'clinics'
  | 'enterprise_automation'
  | 'inventory_management'
  | 'arrival_tracking'
  | 'customs_management'
  | 'cool_missing'
  | 'kanto_customs_ng'
  | 'unmatched_sheets'
  | 'sheet_import'
  | 'carrier_settings';

export interface WarehouseStockRecord {
  productId: string;
  productName: string;
  category?: string;
  koreaStock: number;          // 韓国倉庫（KR）在庫
  singaporeStock: number;     // シンガポール倉庫在庫
  koreaSafetyStock: number;   // 韓国倉庫 安全在庫ライン
  singaporeSafetyStock: number;// シンガポール倉庫 安全在庫ライン
  inTransitKorea: number;     // 韓国向け輸送中
  inTransitSingapore: number; // シンガポール向け輸送中
  reservedKorea: number;      // 韓国倉庫からの引当済数量
  reservedSingapore: number;  // シンガポール倉庫からの引当済数量
  preferredWarehouse?: 'korea' | 'singapore' | 'both';
  companyName?: string;       // 회사명 (会社名)
  expirationDate?: string;    // 유통기한 (使用期限/有効期限)
  registrationDate?: string;  // 등록일 (登録日)
  updatedDate?: string;       // 업데이트 (更新日)
}

export type OverdueFollowupStatus = '未対応' | '仕入先督促中' | '顧客連絡済' | '代替品提案中' | '今週入荷予定' | '対応完了';

export interface OverdueFollowupRecord {
  status: OverdueFollowupStatus;
  note: string;
  nextActionDate?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface OverdueOrderInfo {
  order: Order;
  customerName: string;
  salesRep: string;
  orderId: string;
  orderDate: string;
  maxDaysOver: number;
  earliestDueDate: string;
  overdueLines: OrderLine[];
  cause: '未発注' | '入荷遅延' | '出荷手配中';
  totalOverdueQty: number;
  followup: OverdueFollowupRecord;
}

export interface OverdueClinicInfo {
  clinicName: string;
  clinicId?: string;
  salesRep: string;
  phone?: string;
  email?: string;
  directorName?: string;
  ordersCount: number;
  maxDaysOver: number;
  totalOverdueQty: number;
  orders: OverdueOrderInfo[];
  severityRank: 'S' | 'A' | 'B';
  followupNote?: string;
}

export type PeriodFilter = 'all' | '7d' | '30d' | 'this_month' | '90d';

export interface ProductItem {
  productId: string;        // 109958 (キー項目)
  productName: string;      // 109992 / 109959
  category: string;         // カテゴリ
  spec: string;             // 規格・容量
  standardPrice: number;    // 110002 (販売単価)
  minPrice: number;         // 109994 (下限販売単価)
  maxPrice: number;         // 109995 (上限販売単価)
  costPrice: number;        // 110007 (仕入単価)
  costCurrency: string;     // 110124 (仕入通貨)
  supplierId: string;       // 110005 (仕入先ID)
  supplierName: string;     // 110006 (仕入先名)
  countryOfOrigin: string;  // 110169 (製造国ID連携)
  minLeadTime: number;      // 110012 (下限納期 日数)
  maxLeadTime: number;      // 110013 (上限納期 日数)
  status: '取扱中' | '在庫僅少' | '入荷待ち' | '取扱終了';
  rakurakuSchemaId: string; // '101252'
  source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master';
  updatedAt: string;
  memo?: string;
}

export interface ClinicItem {
  clinicId: string;         // 109898 (キー項目)
  clinicName: string;       // 110108
  directorName: string;     // 院長・担当医師
  salesRep: string;         // 実営業担当（振り分け後の担当者）
  clerkName?: string;       // 楽楽販売上の処理担当（109978）
  currency: string;         // 110167 (販売通貨)
  commissionRate: number;   // 110109 (紹介手数料率 %)
  referrerId1?: string;     // 110106 (紹介者ID 1)
  referrerId2?: string;     // 110107 (紹介者ID 2)
  phone: string;
  email: string;
  postalCode: string;
  address: string;
  prefecture: string;
  status: '取引中' | '新規' | '休眠' | '審査中';
  paymentTerms: string;
  rakurakuSchemaId: string; // '101250'
  source: 'rakuraku_api' | 'rakuraku_csv' | 'synced_master';
  updatedAt: string;
  memo?: string;
}
