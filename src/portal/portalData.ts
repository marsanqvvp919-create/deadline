/**
 * お客様の管理画面のデータ（画面の部品はTAクリニック向けモックのもの）
 * サーバーの /api/portal/data を、モックの形（出荷1件 = OrderRecord 1件、受注月 = BatchInfo）に変換する
 */

export type OrderStatus =
  | 'ORDERED'
  | 'PREPARING'
  | 'FEDEX_DISPATCHED'
  | 'IN_TRANSIT_INTL'
  | 'CUSTOMS_CLEARANCE'
  | 'SAGAWA_HANDOVER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export interface Clinic {
  id: string;
  name: string;
  nameEn: string;
  doctor: string;
  doctorEn: string;
  tel: string;
  zip: string;
  address: string;
  addressEn: string;
  email: string;
  region: string;
  hub: 'NRT' | 'KIX';
}

export interface OrderItem {
  name: string;
  qty: number;
  unit: string;
  lotNo: string;
  expDate: string;
}

export interface TimelineEvent {
  step: OrderStatus;
  time: string;
  location: string;
  title: string;
  desc: string;
  operator: string;
}

export interface OrderRecord {
  id: string;
  invoiceNo: string;
  batchId: string;
  batchName: string;
  orderDate: string;
  clinicId: string;
  clinicName: string;
  clinicNameEn: string;
  doctor: string;
  doctorEn: string;
  tel: string;
  zip: string;
  address: string;
  addressEn: string;
  email: string;
  region: string;
  hub: 'NRT' | 'KIX';
  hubName: string;
  status: OrderStatus;
  /** 国際便の業者（DHL / FedEx）。国内在庫からの発送は「国内発送」 */
  intlCarrier: string;
  fedexTracking: string;
  sagawaTracking: string;
  estimatedDelivery: string;
  actualDelivery?: string | null;
  recipientName?: string | null;
  /** 国内配送の会社名と、追跡についての一言 */
  domesticCarrier: string;
  domesticNote: string;
  items: OrderItem[];
  totalQty: number;
  timeline: TimelineEvent[];
}

export interface BatchInfo {
  id: string;
  name: string;
  orderDate: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  totalOrders: number;
  totalUnits: number;
  isCurrent: boolean;
  description: string;
}

export const STATUS_STEPS: {
  key: OrderStatus;
  step: number;
  label: string;
  shortLabel: string;
  desc: string;
  color: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
}[] = [
  {
    "key": "ORDERED",
    "step": 0,
    "label": "注文済み",
    "shortLabel": "注文受付",
    "desc": "ご注文を受け付け、仕入先へ手配しています",
    "color": "bg-slate-400",
    "bgLight": "bg-slate-50",
    "borderLight": "border-slate-200",
    "textColor": "text-slate-600"
  },
  {
    "key": "PREPARING",
    "step": 1,
    "label": "出荷待ち",
    "shortLabel": "出荷待ち",
    "desc": "出荷の準備をしています（未出荷）",
    "color": "bg-amber-400",
    "bgLight": "bg-amber-50/60",
    "borderLight": "border-amber-200",
    "textColor": "text-amber-700"
  },
  {
    "key": "FEDEX_DISPATCHED",
    "step": 2,
    "label": "国際便 集荷済",
    "shortLabel": "国際便集荷済",
    "desc": "DHL / FedEx にて集荷・国際輸送受付完了",
    "color": "bg-purple-400",
    "bgLight": "bg-purple-50/60",
    "borderLight": "border-purple-200",
    "textColor": "text-purple-700"
  },
  {
    "key": "IN_TRANSIT_INTL",
    "step": 3,
    "label": "国際航空輸送中",
    "shortLabel": "国際空輸中",
    "desc": "DHL / FedEx 国際便にて成田 (NRT) へ輸送中",
    "color": "bg-indigo-400",
    "bgLight": "bg-indigo-50/60",
    "borderLight": "border-indigo-200",
    "textColor": "text-indigo-700"
  },
  {
    "key": "CUSTOMS_CLEARANCE",
    "step": 4,
    "label": "成田到着・通関中",
    "shortLabel": "税関審査中",
    "desc": "成田国際空港到着。輸入確認（薬監）・輸入通関中",
    "color": "bg-blue-400",
    "bgLight": "bg-blue-50/60",
    "borderLight": "border-blue-200",
    "textColor": "text-blue-700"
  },
  {
    "key": "SAGAWA_HANDOVER",
    "step": 5,
    "label": "国内配送引継済",
    "shortLabel": "国内引継済",
    "desc": "輸入通関許可完了。国内配送へ引渡完了",
    "color": "bg-cyan-400",
    "bgLight": "bg-cyan-50/60",
    "borderLight": "border-cyan-200",
    "textColor": "text-cyan-700"
  },
  {
    "key": "OUT_FOR_DELIVERY",
    "step": 6,
    "label": "国内配達中",
    "shortLabel": "配達中",
    "desc": "クリニックへ配達中",
    "color": "bg-teal-400",
    "bgLight": "bg-teal-50/60",
    "borderLight": "border-teal-200",
    "textColor": "text-teal-700"
  },
  {
    "key": "DELIVERED",
    "step": 7,
    "label": "配達完了",
    "shortLabel": "受領済",
    "desc": "クリニック受付にて受領完了",
    "color": "bg-emerald-500",
    "bgLight": "bg-emerald-50/60",
    "borderLight": "border-emerald-200",
    "textColor": "text-emerald-700"
  }
];

// ---- サーバーから届くデータ ----
export interface ApiTracking {
  trackingNo: string;
  carrier: string;
  status: string;
  statusText: string;
  lastEventAt: string | null;
  lastLocation: string | null;
  deliveredAt: string | null;
  estimatedDelivery: string | null;
  customsCleared: boolean;
  customsClearedAt?: string | null;
  arrivedJapan: boolean;
  domestic?: boolean;
}
export interface ApiLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
  earliestDate: string | null;
  latestDate: string | null;
  shippedDate: string | null;
  shippedQty: number | null;
  stage: string;
}
export interface ApiOrder {
  orderId: string;
  clinicId: string;
  clinicName: string;
  orderDate: string;
  status: string;
  orderState: string;
  paymentStatus: string;
  totalAmount: number;
  lines: ApiLine[];
}
export interface ApiShipment {
  shipmentId: string;
  orderId: string;
  shipStatus: string;
  shippedDate: string | null;
  deliveredDate: string | null;
  deliveredAssumed?: boolean;
  courier: string;
  trackingNos: string[];
  tracking: ApiTracking[];
  items: string[];
  itemLines?: { productId: string; name: string; qty: number | null }[];
  arrivalAirport?: string;
}
export interface ApiClinic {
  clinicId: string;
  clinicName: string;
  clinicNameEn?: string;
  directorName?: string;
  phone?: string;
  postalCode?: string;
  prefecture?: string;
  address: string;
  addressEn?: string;
}
export interface PortalApiData {
  group: { name: string };
  clinics: ApiClinic[];
  orders: ApiOrder[];
  shipments: ApiShipment[];
  generatedAt: string | null;
}

// ---- 画面の部品が参照する一覧（ログイン後に setPortalModel で入れる） ----
export let CLINICS_MASTER: Clinic[] = [];
export let BATCHES_LIST: BatchInfo[] = [];
let groupName = '';
export const portalGroupName = () => groupName;

const CARRIER_LABEL: Record<string, string> = { dhl: 'DHL', fedex: 'FedEx', sagawa: '佐川急便', yamato: 'ヤマト運輸', japanpost: '日本郵便' };
const INTL = new Set(['dhl', 'fedex']);

export function trackingUrl(tracking: string, carrier?: string): string {
  const clean = (tracking || '').replace(/[^0-9]/g, '');
  if (!clean) return '#';
  if (carrier === 'sagawa') return `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${clean}`;
  if (carrier === 'yamato') return `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number01=${clean}`;
  if (carrier === 'japanpost') return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${clean}`;
  // 10桁はDHL、12・15桁はFedEx
  if (clean.length === 10) return `https://www.dhl.com/jp-ja/home/tracking.html?tracking-id=${clean}`;
  return `https://www.fedex.com/fedextrack/?trknbr=${clean}`;
}
export function getFedexTrackingUrl(tracking: string): string {
  return trackingUrl(tracking);
}
export function getSagawaTrackingUrl(tracking: string): string {
  return trackingUrl(tracking, 'sagawa');
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 日付・日時を「2026/10/19」「2026/10/19 16:30」の形にする */
const ymd = (v: string | null | undefined) => {
  if (!v) return '';
  const d = new Date(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v) ? v.replace(/\//g, '-') + 'T00:00:00' : v);
  return Number.isNaN(d.getTime()) ? v : `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};
const ymdhm = (v: string | null | undefined) => {
  if (!v) return '';
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) return ymd(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : `${ymd(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const REGION: [RegExp, string][] = [
  [/北海道/, '北海道'],
  [/青森|岩手|宮城|秋田|山形|福島/, '東北'],
  [/東京|神奈川|千葉|埼玉|茨城|栃木|群馬/, '関東'],
  [/新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知/, '中部'],
  [/三重|滋賀|京都|大阪|兵庫|奈良|和歌山/, '関西'],
  [/鳥取|島根|岡山|広島|山口/, '中国'],
  [/徳島|香川|愛媛|高知/, '四国'],
  [/福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄/, '九州・沖縄'],
];
const regionOf = (text: string) => REGION.find(([re]) => re.test(text))?.[1] || '—';
const hubOf = (airports: string[]): 'NRT' | 'KIX' => (airports.some((a) => /KIX|関西/i.test(a)) ? 'KIX' : 'NRT');
const HUB_NAME = { NRT: '成田国際空港 (NRT)', KIX: '関西国際空港 (KIX)' };
const isFee = (name: string) => /送料|手数料/.test(name || '');

/** 出荷1件の今のステップ */
function shipmentStatus(s: ApiShipment): OrderStatus {
  if (!/出荷済|納品済/.test(s.shipStatus)) return 'PREPARING';
  const intl = s.tracking.filter((t) => INTL.has(t.carrier));
  const dom = s.tracking.filter((t) => !INTL.has(t.carrier));
  if (s.deliveredDate || s.deliveredAssumed || s.tracking.some((t) => t.status === 'delivered')) return 'DELIVERED';
  if (dom.some((t) => t.domestic || t.status === 'in_transit')) return 'OUT_FOR_DELIVERY';
  if (intl.length === 0) return dom.length > 0 || !/fedex|dhl/i.test(s.courier) ? 'OUT_FOR_DELIVERY' : 'FEDEX_DISPATCHED';
  if (intl.some((t) => t.domestic)) return 'OUT_FOR_DELIVERY';
  if (intl.some((t) => t.customsCleared) || dom.length > 0) return 'SAGAWA_HANDOVER';
  if (intl.some((t) => t.arrivedJapan)) return 'CUSTOMS_CLEARANCE';
  if (intl.some((t) => t.status === 'in_transit' || t.status === 'exception')) return 'IN_TRANSIT_INTL';
  return 'FEDEX_DISPATCHED';
}
const stepOf = (st: OrderStatus) => STATUS_STEPS.find((x) => x.key === st)!.step;

export interface PortalModel {
  clinics: Clinic[];
  batches: BatchInfo[];
  orders: Record<string, OrderRecord[]>;
}

export function buildPortalModel(data: PortalApiData): PortalModel {
  groupName = data.group.name.endsWith('様') ? data.group.name : `${data.group.name}様`;
  const shipsByOrder = new Map<string, ApiShipment[]>();
  data.shipments.forEach((s) => shipsByOrder.set(s.orderId, [...(shipsByOrder.get(s.orderId) || []), s]));

  const clinics: Clinic[] = data.clinics.map((c) => {
    // 住所の先頭に「〒104-0061」が入っていることがあるので、郵便番号の欄に分ける
    const zipInAddr = (c.address || '').match(/^\s*〒?\s*(\d{3}-?\d{4})\s*/);
    const address = zipInAddr ? (c.address || '').slice(zipInAddr[0].length) : c.address || '';
    const zip = (c.postalCode || zipInAddr?.[1] || '').replace(/^〒\s*/, '');
    const airports = data.orders.filter((o) => o.clinicId === c.clinicId).flatMap((o) => (shipsByOrder.get(o.orderId) || []).map((s) => s.arrivalAirport || ''));
    return {
      id: c.clinicId,
      name: `${c.clinicName}様`,
      nameEn: c.clinicNameEn || '',
      doctor: c.directorName || '',
      doctorEn: '',
      tel: c.phone || '',
      zip,
      address,
      addressEn: c.addressEn || '',
      email: '',
      region: regionOf(`${c.prefecture || ''}${c.address || ''}`),
      hub: hubOf(airports),
    };
  });
  const clinicById = new Map(clinics.map((c) => [c.id, c]));

  const records: OrderRecord[] = [];
  for (const o of data.orders) {
    const clinic = clinicById.get(o.clinicId) || { ...clinics[0], id: o.clinicId, name: `${o.clinicName}様` };
    const month = ymd(o.orderDate).slice(0, 7).replace('/', '-');
    const base = {
      batchId: month,
      batchName: `${Number(month.slice(5))}月受注分`,
      orderDate: ymd(o.orderDate),
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicNameEn: clinic.nameEn,
      doctor: clinic.doctor,
      doctorEn: clinic.doctorEn,
      tel: clinic.tel,
      zip: clinic.zip,
      address: clinic.address,
      addressEn: clinic.addressEn,
      email: clinic.email,
      region: clinic.region,
    };
    const products = o.lines.filter((l) => !isFee(l.productName));
    const latestOf = (ids: string[]) =>
      products
        .filter((l) => ids.includes(l.productId))
        .map((l) => l.latestDate || '')
        .filter(Boolean)
        .sort()
        .pop() || '';
    const orderedEvent: TimelineEvent = {
      step: 'ORDERED',
      time: ymd(o.orderDate),
      location: 'ご注文受付',
      title: 'ご注文確定',
      desc: `受注ID: ${o.orderId}`,
      operator: '株式会社Number1 受注担当',
    };

    const ships = shipsByOrder.get(o.orderId) || [];
    for (const s of ships) {
      const status = shipmentStatus(s);
      const hub = hubOf([s.arrivalAirport || '']);
      const intl = s.tracking.filter((t) => INTL.has(t.carrier));
      const dom = s.tracking.filter((t) => !INTL.has(t.carrier));
      const waitingShip = status === 'PREPARING';
      const intlCarrier = intl[0]
        ? CARRIER_LABEL[intl[0].carrier]
        : /dhl/i.test(s.courier)
          ? 'DHL'
          : /fedex/i.test(s.courier)
            ? 'FedEx'
            : waitingShip
              ? '国際便'
              : '国内発送';
      const intlNo = waitingShip
        ? '出荷待ち'
        : intl[0]?.trackingNo ||
          (intlCarrier !== '国内発送' ? s.trackingNos.find((n) => [10, 12, 15].includes(n.length) && !dom.some((t) => t.trackingNo === n)) || '' : '');
      const domNo = dom[0]?.trackingNo || (intlCarrier === '国内発送' && !waitingShip ? s.trackingNos[0] || '' : '');
      const domCarrier = dom[0] ? CARRIER_LABEL[dom[0].carrier] || '国内配送' : '佐川急便';
      const domNote =
        dom[0]?.carrier === 'sagawa' && dom[0].status === 'unknown'
          ? '佐川急便のお問い合わせサービス停止中'
          : dom[0]?.statusText || (status === 'DELIVERED' ? '配達完了' : domNo ? '' : '国内配送の番号は引継ぎ後に表示されます');
      const lines = s.itemLines && s.itemLines.length > 0 ? s.itemLines : s.items.map((name) => ({ productId: '', name, qty: null }));
      // 数量の分からない明細は、出荷待ちなら注文の残り、出荷済みなら注文数
      const fallbackQty = (name: string) => {
        const p = products.find((x) => x.productName === name);
        if (!p) return 0;
        return waitingShip ? Math.max(0, p.quantity - (p.shippedQty ?? 0)) || p.quantity : p.quantity;
      };
      const items: OrderItem[] = lines.map((l) => ({
        name: l.name,
        qty: l.qty ?? fallbackQty(l.name),
        unit: '本',
        lotNo: '',
        expDate: '',
      }));
      const deliveredAt = s.deliveredDate || s.tracking.find((t) => t.deliveredAt)?.deliveredAt || null;
      const eta = s.tracking.find((t) => t.estimatedDelivery)?.estimatedDelivery || latestOf(lines.map((l) => l.productId));
      const latest = [...intl, ...dom].sort((a, b) => (b.lastEventAt || '').localeCompare(a.lastEventAt || ''))[0];

      // 追跡の流れ（新しい順）。分かっている日時と場所だけを出す
      const tl: TimelineEvent[] = [];
      const step = stepOf(status);
      if (status === 'DELIVERED')
        tl.push({
          step: 'DELIVERED',
          time: ymdhm(deliveredAt) || '—',
          location: clinic.name,
          title: '配達完了',
          desc: deliveredAt ? 'クリニックにお届けしました' : '発送から日数がたち、配送中の記録もないため、お届け済みとして表示しています',
          operator: domCarrier,
        });
      if (step >= 6 && status !== 'DELIVERED')
        tl.push({ step: 'OUT_FOR_DELIVERY', time: ymdhm(latest?.lastEventAt) || '—', location: latest?.lastLocation || '国内', title: '国内配達中', desc: latest?.statusText || 'クリニックへ配達中', operator: domCarrier });
      if (step >= 5 && intl.length > 0) {
        const cc = intl.find((t) => t.customsClearedAt)?.customsClearedAt;
        tl.push({ step: 'SAGAWA_HANDOVER', time: ymdhm(cc) || '—', location: HUB_NAME[hub], title: '通関完了・国内配送へ引継ぎ', desc: domNo ? `${domCarrier} 追跡番号: ${domNo}` : '国内配送へ引継ぎ', operator: intlCarrier });
      }
      if (step >= 4 && intl.length > 0)
        tl.push({
          step: 'CUSTOMS_CLEARANCE',
          time: step === 4 ? ymdhm(latest?.lastEventAt) || '—' : '—',
          location: step === 4 && latest?.lastLocation ? latest.lastLocation : HUB_NAME[hub],
          title: `${hub === 'KIX' ? '関西' : '成田'}到着・輸入通関`,
          desc: step === 4 ? latest?.statusText || '輸入通関中' : '輸入通関',
          operator: '税関',
        });
      if (step >= 3 && intl.length > 0)
        tl.push({
          step: 'IN_TRANSIT_INTL',
          time: step === 3 ? ymdhm(latest?.lastEventAt) || '—' : '—',
          location: step === 3 && latest?.lastLocation ? latest.lastLocation : `国際フライト ➔ ${hub}`,
          title: `${intlCarrier} 国際航空輸送`,
          desc: step === 3 ? latest?.statusText || '輸送中' : `${intlCarrier} 国際便にて輸送`,
          operator: intlCarrier,
        });
      if (step >= 2)
        tl.push({
          step: intlCarrier === '国内発送' ? 'OUT_FOR_DELIVERY' : 'FEDEX_DISPATCHED',
          time: ymd(s.shippedDate) || '—',
          location: intlCarrier === '国内発送' ? '国内倉庫' : 'SG倉庫 / 韓国仕入先',
          title: intlCarrier === '国内発送' ? '国内倉庫から発送' : `${intlCarrier} 集荷・発送`,
          desc: intlNo || domNo ? `追跡番号: ${intlNo || domNo}` : '発送しました',
          operator: intlCarrier === '国内発送' ? domCarrier : intlCarrier,
        });
      tl.push({ step: 'PREPARING', time: '—', location: '出荷管理', title: status === 'PREPARING' ? '出荷準備中' : '検品・梱包', desc: status === 'PREPARING' ? '出荷の準備をしています' : '検品・梱包完了', operator: 'Number1 出荷担当' });
      tl.push(orderedEvent);

      records.push({
        ...base,
        id: s.shipmentId,
        invoiceNo: `${o.orderId} / ${s.shipmentId}`,
        hub,
        hubName: HUB_NAME[hub],
        status,
        intlCarrier: intlCarrier === '国内発送' ? '国内発送' : intlCarrier,
        fedexTracking: intlNo,
        sagawaTracking: domNo,
        domesticCarrier: domCarrier,
        domesticNote: domNote,
        estimatedDelivery: status === 'DELIVERED' ? ymd(deliveredAt) || ymd(s.shippedDate) : ymd(eta) || '未定',
        actualDelivery: status === 'DELIVERED' ? ymd(deliveredAt) || null : null,
        recipientName: null,
        items,
        totalQty: items.reduce((a, b) => a + (b.qty || 0), 0),
        timeline: tl,
      });
    }

    // まだ出荷レコードに載っていない残り（注文数 − 出荷済みの数 − 出荷待ちの出荷に載っている分）
    const waiting = new Set(ships.filter((s) => !/出荷済|納品済/.test(s.shipStatus)).flatMap((s) => (s.itemLines || []).map((l) => l.productId)));
    const closed = /出荷済|納品済/.test(o.status);
    const rest = closed
      ? []
      : products
          .map((l) => ({ l, qty: l.quantity - (l.shippedQty ?? (l.shippedDate ? l.quantity : 0)) }))
          .filter(({ l, qty }) => qty > 0 && !waiting.has(l.productId));
    if (rest.length > 0) {
      const ordered = rest.every(({ l }) => l.stage === '未発注');
      const hub = clinic.hub;
      records.push({
        ...base,
        id: `${o.orderId}-未出荷`,
        invoiceNo: `${o.orderId} / 未出荷`,
        hub,
        hubName: HUB_NAME[hub],
        status: ordered ? 'ORDERED' : 'PREPARING',
        intlCarrier: '国際便',
        fedexTracking: '',
        sagawaTracking: '',
        domesticCarrier: '佐川急便',
        domesticNote: '発送後に表示されます',
        estimatedDelivery: ymd(latestOf(rest.map(({ l }) => l.productId))) || '未定',
        actualDelivery: null,
        recipientName: null,
        items: rest.map(({ l, qty }) => ({ name: l.productName, qty, unit: '本', lotNo: '', expDate: '' })),
        totalQty: rest.reduce((a, b) => a + b.qty, 0),
        timeline: [
          ...(ordered ? [] : [{ step: 'PREPARING' as OrderStatus, time: '—', location: '仕入先・出荷管理', title: '手配中（出荷準備中）', desc: '仕入先へ発注済み・入荷後に発送します', operator: 'Number1 出荷担当' }]),
          orderedEvent,
        ],
      });
    }
  }

  const orders: Record<string, OrderRecord[]> = {};
  records.forEach((r) => (orders[r.batchId] = [...(orders[r.batchId] || []), r]));
  Object.values(orders).forEach((list) => list.sort((a, b) => stepOf(a.status) - stepOf(b.status) || b.orderDate.localeCompare(a.orderDate)));
  const months = Object.keys(orders).sort().reverse();
  const batches: BatchInfo[] = months.map((m, i) => {
    const list = orders[m];
    const done = list.every((r) => r.status === 'DELIVERED');
    const orderCount = new Set(list.map((r) => r.invoiceNo.split(' / ')[0])).size;
    return {
      id: m,
      name: `${m.slice(0, 4)}年${Number(m.slice(5))}月 受注分`,
      orderDate: list.map((r) => r.orderDate).sort()[0] || '',
      status: done ? 'COMPLETED' : 'IN_PROGRESS',
      totalOrders: list.length,
      totalUnits: list.reduce((a, r) => a + r.totalQty, 0),
      isCurrent: i === 0,
      description: `${Number(m.slice(5))}月の受注 ${orderCount}件／出荷 ${list.length}件。${done ? '全出荷完了。' : '進行中の出荷あり。'}`,
    };
  });
  CLINICS_MASTER = clinics;
  BATCHES_LIST = batches;
  return { clinics, batches, orders };
}
