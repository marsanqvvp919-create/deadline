// 追跡番号から配送会社と追跡ページのURLを判定する。
// 配送状況（どこにあるか・配達済みか）は配送会社のAPIから取得する（src/utils/carriers.ts）。
// 以前は番号の形だけで「成田で通関中」などの架空の状況を返していたため、ここでは判定しない。

export interface TrackingInfo {
  carrier: '佐川急便' | 'ヤマト運輸' | 'FedEx' | 'DHL' | 'その他・不明';
  carrierCode: 'sagawa' | 'yamato' | 'fedex' | 'dhl' | 'unknown';
  trackingUrl: string;
}

export function detectCarrier(trackingNo?: string, courierHint?: string): TrackingInfo {
  const cleanNo = (trackingNo || '').trim().replace(/[^0-9A-Za-z]/g, '');
  const hint = (courierHint || '').toLowerCase();
  if (!cleanNo) return { carrier: 'その他・不明', carrierCode: 'unknown', trackingUrl: '' };

  if (hint.includes('fedex') || (/^\d+$/.test(cleanNo) && (cleanNo.length === 12 || cleanNo.length === 15))) {
    return { carrier: 'FedEx', carrierCode: 'fedex', trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${cleanNo}` };
  }
  if (hint.includes('dhl') || (/^\d+$/.test(cleanNo) && cleanNo.length === 10)) {
    return { carrier: 'DHL', carrierCode: 'dhl', trackingUrl: `https://www.dhl.com/jp-ja/home/tracking.html?tracking-id=${cleanNo}` };
  }
  if (hint.includes('ヤマト')) {
    return {
      carrier: 'ヤマト運輸',
      carrierCode: 'yamato',
      trackingUrl: `https://jizen.kuronekoyamato.co.jp/jizen/servlet/crjz.b.ZK0010?id=${cleanNo}`,
    };
  }
  if (hint.includes('佐川')) {
    return {
      carrier: '佐川急便',
      carrierCode: 'sagawa',
      trackingUrl: `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${cleanNo}`,
    };
  }
  return { carrier: 'その他・不明', carrierCode: 'unknown', trackingUrl: '' };
}
