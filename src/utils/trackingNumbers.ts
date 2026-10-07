// 追跡番号の読み取りと、運送会社の判定（サーバーと画面で共通）。
// 楽楽販売の「出荷番号」には、1つの欄に複数の番号や説明文が入っていることがある。
//   例：「8750 3048 5323 8750 3086 2334」（FedEx 2箱）／「1643306420 8759-7636-7166」（DHL＋FedEx）／
//       「4543-0726-7212、7223、7234」（国内配送の下4桁だけを並べた書き方）

export type CarrierCode = 'dhl' | 'fedex';

/** 欄の文字から追跡番号（数字だけ）を取り出す */
export function parseTrackingNumbers(raw?: string | null): string[] {
  const text = String(raw || '').trim();
  if (!text || text === '—' || /^0+$/.test(text)) return [];
  // 国際郵便（EMS など、EG123456789KR の形）は DHL・FedEx の番号ではないので読まない
  if (isPostalTracking(text)) return [];
  const out: string[] = [];
  const push = (d: string) => {
    if (d && !out.includes(d)) out.push(d);
  };
  // 「、」「,」「・」「/」や文字で区切られたまとまりごとに見る（ハイフンは番号の中の区切りとして消す）
  const chunks = text.replace(/[-‐－ー]/g, '').split(/[^\d\s]+/);
  for (const chunk of chunks) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    // 4桁ずつのスペース区切りはつなげる。10桁以上の番号がスペースで並んでいるときは別々の番号
    const groups: string[] = [];
    let buf = '';
    for (const p of parts) {
      if (p.length >= 10) {
        if (buf) groups.push(buf);
        buf = '';
        groups.push(p);
      } else {
        buf += p;
        // FedEx は4桁ずつ区切って書かれることが多いので、12桁になったら1つの番号とする
        if (buf.length === 12) {
          groups.push(buf);
          buf = '';
        }
      }
    }
    if (buf) groups.push(buf);
    for (const g of groups) {
      if (g.length === 24) {
        // 12桁＋12桁がつながったもの
        push(g.slice(0, 12));
        push(g.slice(12));
      } else if (g.length === 4 && parts.length === 1 && out.length > 0 && out[out.length - 1].length === 12) {
        // 「4543-0726-7212、7223」のように下4桁だけ書いたもの
        push(out[out.length - 1].slice(0, 8) + g);
      } else if (g.length >= 8) {
        push(g);
      }
    }
  }
  return out;
}

export interface NumberClass {
  /** まず照会する運送会社（null は照会しない） */
  primary: CarrierCode | null;
  /** 該当なしのときに、もう一方の運送会社にも照会するか */
  fallback: CarrierCode | null;
  /** 12桁で 7・8 始まりではない（国内の宅配便の可能性） */
  domesticCandidate: boolean;
  /** 20桁：FedEx で見つからなければ 10桁＋10桁（DHL 2箱）として照会する */
  splittable: boolean;
  /** 桁数がどの運送会社にも合わない */
  invalid: boolean;
}

/** 数字だけにした追跡番号から、照会先を決める（楽楽販売の「配送業者」は使わない） */
export function classifyNumber(d: string): NumberClass {
  const base = { primary: null, fallback: null, domesticCandidate: false, splittable: false, invalid: false } as NumberClass;
  if (d.length === 10) return { ...base, primary: 'dhl', fallback: 'fedex' };
  if (d.length === 12) {
    if (/^[78]/.test(d)) return { ...base, primary: 'fedex', fallback: 'dhl' };
    return { ...base, primary: 'fedex', domesticCandidate: true };
  }
  if (d.length === 20) return { ...base, primary: 'fedex', splittable: true };
  if (d.length === 15 || d.length === 22) return { ...base, primary: 'fedex', fallback: 'dhl' };
  return { ...base, invalid: true };
}

export function carrierName(c: CarrierCode | null | undefined): string {
  return c === 'dhl' ? 'DHL' : c === 'fedex' ? 'FedEx' : '';
}

/** 楽楽販売の「配送業者」から読み取れる運送会社 */
export function hintedCarrier(courier?: string | null): CarrierCode | null {
  const h = String(courier || '').toLowerCase();
  if (h.includes('fedex')) return 'fedex';
  if (h.includes('dhl')) return 'dhl';
  return null;
}

/** 国際郵便（EMS など）の番号：英字2文字＋数字9桁＋英字2文字 */
export function isPostalTracking(raw?: string | null): boolean {
  return /\b[A-Z]{2}\d{9}[A-Z]{2}\b/i.test(String(raw || ''));
}
