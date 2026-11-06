import { ProductItem } from '../types';

// 製剤の製造国（製剤別の数量の「ヨーロッパ・インド・トルコ製剤／韓国製剤」の絞り込みに使う）。
// 1) 楽楽販売の商品マスタの「製造国」が入っていればそれを使う
// 2) 無ければ、このシステムで調べて決めた国（下の表）
// 3) それも無ければ、仕入通貨・仕入先から推定（KRW→韓国、EUR→ヨーロッパ、インドの仕入先→インド）
// どれにも当てはまらないものは「不明」。楽楽販売には書き込まない。

export type OriginGroup = 'eu_in_tr' | 'korea' | 'other' | 'unknown';
export const ORIGIN_GROUPS: { id: OriginGroup; label: string }[] = [
  { id: 'eu_in_tr', label: 'ヨーロッパ・インド・トルコ製剤' },
  { id: 'korea', label: '韓国製剤' },
  { id: 'other', label: 'その他の国' },
  { id: 'unknown', label: '製造国不明' },
];

const ids = (country: string, list: number[]) => list.map((n) => [String(n).padStart(9, '0'), country] as const);

/** 楽楽販売に製造国が入っていない製剤について、このシステムで決めた国 */
const PRODUCT_ORIGINS: Record<string, string> = Object.fromEntries([
  // 韓国（仕入通貨が円などで、通貨からは判断できないもの）
  ...ids('韓国', [
    140, 141, 38, 10, 93, 94, 76, 18, 17, 867, 756, 873, 984, 983, 980, 1006, 978, 1022, 1005, 1023, 1007, 1032, 1033, 1002, 975, 1004, 1001, 957,
    148, 137, 1070, 982, 621, 990, 955, 99, 605, 1013, 587, 622, 699, 875, 942, 753, 603, 721, 824, 614, 876, 600, 902, 641, 568, 891, 895, 683,
    888, 833, 841, 872, 835, 593, 815, 666, 604, 773, 580, 858, 118, 191, 598, 673, 776, 763, 768, 700, 764, 752, 688, 692, 230, 739, 740, 741,
    392, 668, 130, 391, 720, 573, 277, 607, 696, 340, 694, 386, 682, 687, 566, 589, 576, 154, 231, 226, 559, 375, 229, 222, 638, 635, 353, 612,
    606, 307, 550, 560, 584, 996, 997, 963, 964, 965, 970, 915, 829, 913, 198, 762, 738, 956, 966, 670, 233, 766, 759, 701, 643, 695, 702, 1025,
  ]),
  // ヨーロッパ（韓国の仕入先から買っていても製造はヨーロッパ）
  ...ids('ヨーロッパ', [133, 106, 640, 107, 799, 747, 644, 50, 51, 52, 53, 54, 62, 63, 743, 745, 748]),
  // インド
  ...ids('インド', [1036, 1012, 1015, 1016, 825, 826, 608, 693, 615, 623, 803, 802, 714, 729, 414]),
  // その他の国（アメリカ・日本など）
  ...ids('アメリカ', [14, 992, 83, 78, 856, 857]),
  ...ids('日本', [92, 504, 898, 499, 639, 785]),
]);

const INDIA_SUPPLIERS = /FONO|VALMED|Asle/i;

export function originGroupOf(country: string): OriginGroup {
  const c = (country || '').trim();
  if (!c) return 'unknown';
  if (/韓国|korea/i.test(c)) return 'korea';
  if (/ヨーロッパ|欧州|インド|トルコ|europe|india|turkey|イタリア|フランス|スイス|ドイツ|スペイン|オランダ|スウェーデン|ベルギー|ポーランド|オーストリア|イギリス|アイルランド|ルクセンブルク/i.test(c)) return 'eu_in_tr';
  if (c === '不明') return 'unknown';
  return 'other';
}

export function productOrigin(productId: string, product?: ProductItem, lineSupplier?: string): string {
  const fromMaster = (product?.countryOfOrigin || '').trim();
  if (fromMaster) return fromMaster;
  const fixed = PRODUCT_ORIGINS[productId];
  if (fixed) return fixed;
  const cur = (product?.costCurrency || '').toUpperCase();
  if (cur === 'KRW') return '韓国';
  if (cur === 'EUR') return 'ヨーロッパ';
  if (INDIA_SUPPLIERS.test(product?.supplierName || lineSupplier || '')) return 'インド';
  return '';
}
