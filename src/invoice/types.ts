// インボイスのデータ型（INVOICEアプリ src/types.ts をそのまま移植。Firestore の同じデータを使う）
export type UserRole = 'ADMIN' | 'STAFF' | 'WAREHOUSE';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface Clinic {
  id: string; // Firestore doc ID (or clinicId)
  clinicId: string; // Unique human ID
  sequenceNo?: number; // 連番 (1, 2, 3...)
  name: string;
  nameEn: string;
  corporationName: string;
  contactPerson: string;
  contactPersonEn?: string;
  doctorName: string;
  doctorNameEn: string;
  zip: string;
  prefecture: string;
  city: string;
  address: string;
  building: string;
  addressEn: string;
  phone: string;
  email: string;
  email2?: string;
  licenseUrl?: string;
  paymentMethod?: string;
  closingDay?: string;
  paymentDay?: string;
  referrer?: string;
  referralRate?: string;
  referralItem1?: string;
  referralItem2?: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: string; // Firestore doc ID
  productId: string; // Unique human ID
  sku: string;
  nameJa: string;
  nameEn: string;
  manufacturer: string;
  spec: string;
  content: number;
  unit: string;
  hsCode: string;
  countryOfOrigin: string;
  purchaseCurrency: 'USD' | 'KRW' | 'JPY' | 'EUR';
  purchasePrice: number;
  invoicePrice: number;
  weight: number; // in kg
  boxSize: string;
  lotNo: string;
  expiryDate: string; // YYYY-MM-DD
  currentStock: number;
  minStock: number;
  temp: string; // Keep temperature
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  warehouseId: string;
  name: string;
  nameEn: string;
  contactPerson: string;
  address: string;
  addressEn: string;
  phone: string;
  email: string;
  country: string;
  zip: string;
  notes: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  supplierId: string;
  name: string;
  nameEn: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  addressEn: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface InventoryLot {
  id: string; // productId + '_' + warehouseId + '_' + lotNo
  productId: string;
  warehouseId: string;
  lotNo: string;
  expiryDate: string;
  currentStock: number;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  type: 'IN' | 'OUT' | 'ADJ';
  date: string; // YYYY-MM-DD HH:mm:ss
  productId: string;
  productNameJa: string;
  warehouseId: string;
  warehouseName: string;
  lotNo: string;
  expiryDate: string;
  quantity: number; // positive for IN, negative for OUT
  beforeQty: number;
  afterQty: number;
  shipmentId?: string;
  user: string;
  notes: string;
  createdAt: string;
}

export interface ShipmentItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameJa: string;
  lotNo: string;
  expiryDate: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  weight: number; // 1個あたり重量
  totalWeight: number; // qty * weight
  hsCode: string;
  countryOfOrigin: string;
}

export interface Shipment {
  id: string;
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  warehouseId: string;
  warehouseSnapshot: Partial<Warehouse>;
  clinicId: string;
  clinicSnapshot: Partial<Clinic>;
  currency: 'USD' | 'KRW' | 'JPY' | 'EUR';
  courier: string;
  trackingNo: string;
  shippingCost: number;
  insurance: number;
  otherCharges: number;
  notes: string;
  items: ShipmentItem[];
  totalQty: number;
  totalWeight: number;
  totalItemsAmount: number;
  totalInvoiceAmount: number;
  status: 'DRAFT' | 'WAITING' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  history: {
    date: string;
    user: string;
    action: string;
    detail: string;
  }[];
}

export interface AuditLog {
  id: string;
  date: string;
  user: string;
  action: string;
  target: string;
  before: string;
  after: string;
}

export interface SystemSettings {
  prefix: string;
  currency: 'USD' | 'KRW' | 'JPY' | 'EUR';
  defaultWarehouseId: string;
  declaration: string;
  termsOfDelivery: string;
  reasonForExport: string;
  minStockWarning: boolean;
  weightUnit: string;
  dateFormat: string;
  decimalPlaces: number;
  companyLogo: string;
  signatureImage: string;
}
