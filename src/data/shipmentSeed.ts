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

// 今日342件分の出荷管理シードデータ（dbSchemaId: 101270）
function generate342ShipmentRecords(): ShipmentItem[] {
  const clinics = [
    '湘南美容クリニック 新宿本院',
    '品川美容外科 渋谷院',
    '東京美容外科 銀座院',
    '表参道スキンクリニック',
    '聖心美容クリニック 六本木院',
    '銀座よしえクリニック 総院',
    '城本クリニック 池袋院',
    'TCB東京中央美容外科 横浜院',
    'シロノクリニック 恵比寿院',
    '高須クリニック 赤坂院',
    '共立美容外科 新宿本院',
    'Theoryクリニック 銀座',
    '水の森美容クリニック 名古屋院',
    'アヴェニューセルクリニック',
    'ルラ美容クリニック 渋谷院',
    'BIANCA CLINIC 表参道',
    'HAABビューティークリニック 南青山',
    'ヴェリテクリニック 銀座院',
  ];

  const products = [
    { id: 'PRD-001', name: 'ヒアルロン酸充填製剤 Type-A (1.0ml)', cool: true },
    { id: 'PRD-002', name: '極細注入針 30G 4mm (100本入)', cool: false },
    { id: 'PRD-003', name: 'ボツリヌストキシン製剤 100Units (要冷蔵)', cool: true },
    { id: 'PRD-004', name: 'スネコス 200 (アミノ酸・ヒアルロン酸配合)', cool: true },
    { id: 'PRD-005', name: 'リジュラン スキンブースター (PN製剤)', cool: true },
    { id: 'PRD-006', name: 'プロファイロ 高分子・低分子複合体', cool: true },
    { id: 'PRD-007', name: 'ジュビダームビスタ ボリューマXC', cool: true },
    { id: 'PRD-008', name: '局所麻酔クリーム 30g (リドカイン5%)', cool: false },
    { id: 'PRD-009', name: 'マイクロカニューレ 25G 50mm (50本入)', cool: false },
    { id: 'PRD-010', name: 'スキンタイトニング導入美容液 50ml', cool: false },
  ];

  const airports = ['関西国際空港 (KIX)', '成田国際空港 (NRT)', '羽田空港 (HND)'];
  const carriers = ['FedEx', 'DHL Express', '日本通運'];

  const records: ShipmentItem[] = [];

  for (let i = 1; i <= 342; i++) {
    const shipmentId = `SHP-202610-${String(i).padStart(3, '0')}`;
    const orderId = `ORD-${String(1000 + (i % 85)).padStart(5, '0')}`;
    const clinic = clinics[i % clinics.length];
    const prod = products[i % products.length];
    const qty = (i % 8 + 1) * 5;
    const trackingNo = `740980114${String(i).padStart(4, '0')}`;
    const carrier = carriers[i % carriers.length];

    // 出荷日（直近数日間）
    const day = (i % 5) + 1;
    const shippedDate = `2026-10-0${day}`;

    // 到着空港
    let airport = airports[i % airports.length];

    // クール手配漏れ判定: クール必須商品で特定の条件
    const isCoolMissing = prod.cool && (i % 14 === 0 || i % 29 === 0);
    const coolStatus = isCoolMissing
      ? '申請漏れ'
      : prod.cool
      ? (i % 5 === 0 ? '手配中' : '申請済')
      : '不要';

    // 関東通関NG判定: 成田または羽田到着で薬事監視・指定不一致のケース
    const isKantoNg = !isCoolMissing && (airport.includes('成田') || airport.includes('羽田')) && (i % 19 === 0 || i % 31 === 0);

    let customsStatus = '通関審査中';
    let importStatus = '承認済';
    let currentLocation = airport.includes('関西') ? '関西国際空港 国際貨物地区' : '成田国際空港 税関審査場';

    if (isKantoNg) {
      customsStatus = '通関NG (関空ルート振替要請)';
      importStatus = '要修正';
      currentLocation = '成田税関 保税保留中 (振替手配待)';
    } else if (isCoolMissing) {
      customsStatus = '税関留置 (クール手配不備)';
      importStatus = '申請中';
      currentLocation = '成田空港 冷蔵一時保管庫';
    } else if (i % 4 === 0) {
      customsStatus = '通関許可・国内搬入済';
      importStatus = '承認済';
      currentLocation = 'ヤマトグローバル 国内配送中';
    } else if (i % 7 === 0) {
      customsStatus = '税関審査中';
      importStatus = '申請中';
      currentLocation = airport;
    }

    records.push({
      shipmentId,
      orderId,
      customerName: clinic,
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      trackingNo,
      carrier,
      shippedDate,
      arrivalAirport: airport,
      importStatus,
      coolApplicationStatus: coolStatus,
      powerOfAttorneyStatus: isKantoNg ? '未受領' : (i % 8 === 0 ? '督促中' : '受領済'),
      slipStatus: isCoolMissing ? '未作成' : '作成済',
      currentLocation,
      customsStatus,
      isKantoNg,
      isCoolMissing,
      memo: isKantoNg
        ? '関東圏税関での薬事照合NG。関西国際空港への陸送保税振替または再申告手配要。'
        : isCoolMissing
        ? '2〜8℃厳守製剤。航空会社クールコンテナ申請が未完了のため至急手配要。'
        : '正常配送中。FedEx API自動トラッキング連携済。',
      updatedAt: '2026-10-06 17:00',
    });
  }

  return records;
}

export const INITIAL_SHIPMENTS: ShipmentItem[] = generate342ShipmentRecords();
