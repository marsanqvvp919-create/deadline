// マスタの初期値。運賃は公開料金表から計算し、契約割引があれば割引率で調整する。
export const MASTER_VERSION = 7;

// 商品カテゴリ。g は販売単位1つの重量、l/w/h は「梱包したときに占める実効サイズ」(cm)。
// 2026年7〜10月の請求実績から逆算した値（楽楽販売の出荷明細と追跡番号で突き合わせ）:
//   DHL シンガポール発 131件・FedEx 韓国発 202件 の課金重量を、この値で計算すると合計で -3% / ±0% に一致する。
// 外箱の実寸ではなく、詰め方・緩衝材込みで「1個あたりどれだけ場所を取るか」を表す。
export const DEFAULT_CATEGORIES = [
  { id: "filler", name: "フィラー", unit: "本(1ml)", g: 60, l: 8, w: 4, h: 2 }, // Neuramis・Juvederm・YVOIRE 等
  { id: "booster", name: "スキンブースター", unit: "箱", g: 120, l: 11, w: 8, h: 5 }, // JALUPRO・JUVELOOK・Rejuran・SUNEKOS 等
  { id: "lido", name: "リドカインクリーム", unit: "個(500g)", g: 600, l: 10, w: 8, h: 5 }, // J-cain・MUCHCAINE 等の 500g ジャー
  { id: "botox", name: "ボトックス製剤", unit: "バイアル", g: 35, l: 6, w: 5, h: 3 }, // Botulax・Liztox・Coretox 等
  { id: "thread", name: "糸リフト", unit: "箱(20本)", g: 70, l: 12, w: 7, h: 5 }, // EXOFT・LUXX 等
  { id: "cannula", name: "カニューレ・針", unit: "箱", g: 80, l: 12, w: 10, h: 6 }, // Mirror Cannula・DR.MICRO NEEDLES 等
  { id: "india", name: "インド製剤（錠剤）", unit: "箱(シート)", g: 25, l: 7, w: 6, h: 3 }, // Aknetrent・minwin・Minoxytop 等
  { id: "peel", name: "ピーリング剤", unit: "箱", g: 60, l: 11, w: 8, h: 6 }, // BIOREPEEL・PRX-T33 等
  { id: "inject", name: "その他注射剤", unit: "箱", g: 60, l: 6, w: 5, h: 4.5 }, // LUTHIONE・Eclairis・Vitamin C 等
];

// 発送元ごとの梱包（フォワーダーによって箱と詰め方が違う）。箱は外寸 cm、tare は箱と緩衝材の kg。
// KR は FedEx 請求の課金重量が 0.9 / 1.6 / 3.9 / 7.8kg に集中していることから逆算した箱。
export const DEFAULT_PACKING = {
  SG: {
    fillRate: 0.5,
    boxes: [
      { name: "S", l: 30, w: 22, h: 15, tare: 0.3 },
      { name: "M", l: 35, w: 25, h: 20, tare: 0.4 },
      { name: "L", l: 40, w: 30, h: 25, tare: 0.6 },
      { name: "XL", l: 50, w: 40, h: 35, tare: 1.0 },
    ],
  },
  KR: {
    fillRate: 0.7,
    boxes: [
      { name: "XS", l: 25, w: 18, h: 10, tare: 0.2 },
      { name: "S", l: 25, w: 20, h: 16, tare: 0.3 },
      { name: "M", l: 34, w: 24, h: 24, tare: 0.5 },
      { name: "L", l: 42, w: 33, h: 28, tare: 0.8 },
    ],
  },
};

export const DEFAULT_MASTER = {
  version: MASTER_VERSION,
  categories: DEFAULT_CATEGORIES,
  // 料金は公開運賃表（src/data/tariffs.js）から計算し、ここでは割引率と追加料金だけを持つ。
  // DHL は 2026/10/15 発行の INBOUND INVOICE（279件）の実績に合わせた値:
  //   運賃は公開料金の 20%（80%引き）、GoGreen Plus 65円/kg（燃油対象外）、
  //   シンガポール発は輸出申告料 1,800円/件（8割の貨物で発生）
  // fuel: 燃油サーチャージ %（DHL は 2026/10/19-25 の 49.75%、FedEx は同水準の燃料価格での料率表の値）
  // peakPerKg: 繁忙期追加金 円/kg（燃油対象。DHL アジア→日本 2026/10/1〜2027/2/5）
  // greenPerKg: GoGreen Plus 等 円/kg（燃油対象外）
  rates: [
    { carrier: "DHL", origin: "SG", discount: 80, fuel: 49.75, peakPerKg: 20, greenPerKg: 65, other: 1800 },
    { carrier: "DHL", origin: "KR", discount: 80, fuel: 49.75, peakPerKg: 20, greenPerKg: 65, other: 0 },
    // FedEx は運賃の請求書がないための推測値（v7）:
    //   運賃は韓国側（ST International の FedEx Korea 口座）が払っていて請求書が手元にない。
    //   「FedEx の方が全体的に少し高め」という実感に合わせ、代表的な荷物の合計で DHL の約1.1倍になる割引率にした。
    //   （参考: FedEx Korea 公開輸出運賃 IP・区分B は円換算で日本着払い公開運賃の約92%）
    { carrier: "FedEx", origin: "SG", discount: 72, fuel: 52, peakPerKg: 0, greenPerKg: 0, other: 0 },
    { carrier: "FedEx", origin: "KR", discount: 78, fuel: 52, peakPerKg: 0, greenPerKg: 0, other: 0 },
  ],
  packing: DEFAULT_PACKING,
  maxKg: 20,
  divisor: 5000,
  coolFee: 1000,
};

export const CARRIERS = ["DHL", "FedEx"];
// 表示はするが計算対象・編集から外す運送会社（契約レート未確認のため）
export const DISABLED_CARRIERS = [];
export const isCarrierEnabled = (c) => !DISABLED_CARRIERS.includes(c);
export const ORIGINS = { SG: "シンガポール", KR: "韓国" };

// 初回表示用の例
export const EXAMPLE_LINES = [
  { id: "filler", qty: 40 },
  { id: "booster", qty: 20 },
  { id: "lido", qty: 30 },
];
