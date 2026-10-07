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

  // 番号の形が決め手（楽楽販売の配送業者の入力違いがあるため）：12・15桁は FedEx、10桁は DHL。形で決まらないときだけ配送業者を見る
  const digitsOnly = /^\d+$/.test(cleanNo);
  const byFormat = digitsOnly && (cleanNo.length === 12 || cleanNo.length === 15) ? 'fedex' : digitsOnly && cleanNo.length === 10 ? 'dhl' : null;
  const code = byFormat || (hint.includes('fedex') ? 'fedex' : hint.includes('dhl') ? 'dhl' : null);
  if (code === 'fedex') {
    return { carrier: 'FedEx', carrierCode: 'fedex', trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${cleanNo}` };
  }
  if (code === 'dhl') {
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

/** 楽楽販売の配送業者と、番号の形から見た配送会社が食い違うか（入力ミスの目印） */
export function courierMismatch(trackingNo?: string, courierHint?: string): boolean {
  const hint = (courierHint || '').toLowerCase();
  const hinted = hint.includes('fedex') ? 'fedex' : hint.includes('dhl') ? 'dhl' : null;
  if (!hinted) return false;
  const detected = detectCarrier(trackingNo, '').carrierCode;
  return (detected === 'fedex' || detected === 'dhl') && detected !== hinted;
}
