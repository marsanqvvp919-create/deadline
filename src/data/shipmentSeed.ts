import { ShipmentItem, SupplierItem } from '../types';

export const INITIAL_SUPPLIERS: SupplierItem[] = [
  {
    supplierId: 'SUP-001',
    supplierName: 'メディカルサプライ東日本',
    country: '日本',
    leadTimeDays: 5,
    contactPerson: '高橋 健一',
    email: 'takahashi@med-supply-east.jp',
    phone: '03-5555-0101',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-002',
    supplierName: 'テルモメディカル機器',
    country: '日本',
    leadTimeDays: 3,
    contactPerson: '佐藤 雅之',
    email: 'sato@terumo-med-sample.jp',
    phone: '03-5555-0102',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-003',
    supplierName: 'BioPharm Korea Ltd.',
    country: '韓国',
    leadTimeDays: 7,
    contactPerson: 'Kim Min-Soo',
    email: 'mskim@biopharmkorea.kr',
    phone: '+82-2-555-1234',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-004',
    supplierName: 'Swiss Pharma Logistics AG',
    country: 'スイス',
    leadTimeDays: 12,
    contactPerson: 'Hans Weber',
    email: 'weber@swisspharmalog.ch',
    phone: '+41-44-555-7890',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-005',
    supplierName: 'Allergan Aesthetics Japan',
    country: 'アメリカ',
    leadTimeDays: 8,
    contactPerson: '田中 宏',
    email: 'tanaka.h@allergan-example.com',
    phone: '03-5555-0105',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-006',
    supplierName: 'Medytox Global Pharma',
    country: '韓国',
    leadTimeDays: 6,
    contactPerson: 'Park Ji-Hoon',
    email: 'park@medytox-global.kr',
    phone: '+82-2-555-5678',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-007',
    supplierName: 'Galderma Nordic Distribution',
    country: 'スウェーデン',
    leadTimeDays: 14,
    contactPerson: 'Elin Larsson',
    email: 'elin.l@galderma-dist.se',
    phone: '+46-8-555-4321',
    status: '通常取引',
  },
  {
    supplierId: 'SUP-008',
    supplierName: 'Hugel Pharma Logistics',
    country: '韓国',
    leadTimeDays: 6,
    contactPerson: 'Lee Soo-Jin',
    email: 'sjlee@hugelpharma.kr',
    phone: '+82-2-555-9012',
    status: '通常取引',
  },
];

// 出荷管理（dbSchemaId: 101270）データ初期値
// サンプルデータやダミー値は削除し、実APIまたは実CSVからのみ取得
export const INITIAL_SHIPMENTS: ShipmentItem[] = [];

