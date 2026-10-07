import { ShipmentItem, Order, ClinicItem } from '../types';

/**
 * クール手配漏れの判定条件:
 * クール申請・委任状・伝票のどれかが「未」
 */
export function isCoolMissingShipment(s: ShipmentItem): boolean {
  const cool = (s.coolApplicationStatus || '').trim();
  const poa = (s.powerOfAttorneyStatus || '').trim();
  const slip = (s.slipStatus || '').trim();

  return cool.includes('未') || poa.includes('未') || slip.includes('未');
}

/**
 * 通関NGの判定条件:
 * 到着空港がNRT（成田）で、明細に関東通関可否「不可」の商品を含む出荷
 */
export function isCustomsNgShipment(s: ShipmentItem, orders: Order[] = []): boolean {
  const airport = (s.arrivalAirport || '').toUpperCase();
  const isNrt = airport.includes('NRT') || s.arrivalAirport?.includes('成田');
  if (!isNrt) return false;

  // 1. 出荷レコード自体の関東通関可否が「不可」
  if (s.kantoCustomsPermitted && s.kantoCustomsPermitted.includes('不可')) {
    return true;
  }

  // 2. 紐づく受注明細に関東通関可否「不可」の商品が含まれるか確認
  if (s.orderId && s.orderId !== '—') {
    const matchingOrder = orders.find((o) => o.orderId === s.orderId);
    if (matchingOrder && Array.isArray(matchingOrder.lines)) {
      const hasNgLine = matchingOrder.lines.some((l: any) => {
        const lineKanto = (l.kantoCustomsPermitted || l.customsPermitted || '').toString();
        const memo = (l.memo || '').toString();
        return lineKanto.includes('不可') || memo.includes('関東通関不可') || memo.includes('関東不可');
      });
      if (hasNgLine) return true;
    }
  }

  // 3. 通関ステータスに「NG」が含まれる場合
  if (s.customsStatus && s.customsStatus.includes('NG')) {
    return true;
  }

  // 4. レコードフラグ
  return s.isKantoNg === true;
}

/**
 * クリニック名の解決:
 * 出荷レコード、受注データ、または顧客マスタ（101250）から実名を取得
 */
export function resolveClinicName(
  s: ShipmentItem,
  orders: Order[] = [],
  clinics: ClinicItem[] = []
): string {
  // 1. 出荷レコードにクリニック名が入っている場合
  if (s.customerName && s.customerName.trim() !== '' && s.customerName !== '—') {
    return s.customerName.trim();
  }

  // 2. 受注データ（101248）から取得
  if (s.orderId && s.orderId !== '—') {
    const matchingOrder = orders.find((o) => o.orderId === s.orderId);
    if (matchingOrder?.customerName && matchingOrder.customerName !== '—') {
      return matchingOrder.customerName;
    }
  }

  // 3. 顧客マスタ（101250）からクリニックIDで検索
  if (s.customerId && s.customerId !== '—') {
    const clinic = clinics.find((c) => c.clinicId === s.customerId);
    if (clinic?.clinicName) {
      return clinic.clinicName;
    }
  }

  return '—';
}

/**
 * 楽楽販売の該当画面URL
 */
export function getRakurakuUrl(): string {
  try {
    const custom = localStorage.getItem('nouki_rakuraku_base_url');
    if (custom && custom.trim() !== '') return custom.trim();
  } catch {}
  return 'https://hnsibot.rakurakuhanbai.jp/ykbxg2a/';
}

/**
 * 表示用フォーマッター（データにない値は「—」にする）
 */
export function formatValue(val?: string | number | null): string {
  if (val === undefined || val === null) return '—';
  const str = String(val).trim();
  if (str === '' || str === 'undefined' || str === 'null') return '—';
  return str;
}
