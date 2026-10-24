// 公開輸入運賃表（日本着払い・免税・円）。2026年版。
// DHL: サービスガイド・料金表2026 日本「DHL EXPRESS WORLDWIDE IMPORT」非書類
//      韓国＝区分1、シンガポール＝区分3
// FedEx: 運送料金表（日本着払い）Japan ImportOne Rates 2026「インターナショナル・プライオリティ（IP）」パッケージ
//        韓国＝区分A、シンガポール＝区分B
//
// steps: 0.5kg 刻みの料金（0.5kg から順に）
// over.mode = "add":      steps 最大重量の料金 ＋ 超過 1kg ごとに帯の単価を加算（DHL 方式）
// over.mode = "multiply": 課金重量（1kg 切り上げ）× 該当帯の kg 単価（FedEx 方式）
// over.bands: [この重量(kg)を超えたら, 単価]

const dhlSteps = (upTo10, inc10to20, inc20to30) => {
  const s = [...upTo10];
  for (let i = 0; i < 20; i++) s.push(s[s.length - 1] + inc10to20);
  for (let i = 0; i < 20; i++) s.push(s[s.length - 1] + inc20to30);
  return s;
};

export const TARIFFS = {
  "DHL:KR": {
    label: "DHL Express Worldwide Import 区分1",
    steps: dhlSteps(
      [11930, 13550, 15170, 16790, 18270, 19880, 21490, 23100, 24710, 26320,
       27150, 27980, 28810, 29640, 30470, 31300, 32130, 32960, 33790, 34620],
      730, 700,
    ),
    over: { mode: "add", bands: [[30, 1440], [70, 2000], [300, 2090]] },
  },
  "DHL:SG": {
    label: "DHL Express Worldwide Import 区分3",
    steps: dhlSteps(
      [13300, 15280, 17260, 19240, 21500, 23940, 26380, 28820, 31260, 33700,
       34530, 35360, 36190, 37020, 37850, 38680, 39510, 40340, 41170, 42000],
      660, 1240,
    ),
    over: { mode: "add", bands: [[30, 1350], [70, 2190], [300, 2260]] },
  },
  "FedEx:KR": {
    label: "FedEx International Priority 輸入 区分A",
    steps: [
      15240, 16450, 17660, 18870, 20080, 21240, 22400, 23560, 24720, 25880,
      26890, 27900, 28910, 29920, 30930, 31940, 32950, 33960, 34970, 35980,
      36520, 37060, 37600, 38140, 38680, 39220, 39760, 40300, 40840, 41380,
      41920, 42460, 43000, 43540, 44080, 44620, 45160, 45700, 46240, 46780, 47320,
    ],
    over: { mode: "multiply", bands: [[20.5, 2280], [44, 2080], [70, 2070], [99, 1890], [299, 1810]] },
  },
  "FedEx:SG": {
    label: "FedEx International Priority 輸入 区分B",
    steps: [
      17120, 18390, 19660, 20930, 22200, 23440, 24680, 25920, 27160, 28400,
      29530, 30660, 31790, 32920, 34050, 35180, 36310, 37440, 38570, 39700,
      40330, 40960, 41590, 42220, 42850, 43480, 44110, 44740, 45370, 46000,
      46630, 47260, 47890, 48520, 49150, 49780, 50410, 51040, 51670, 52300, 52930,
    ],
    over: { mode: "multiply", bands: [[20.5, 2540], [44, 2310], [70, 2290], [99, 2100], [299, 1940], [499, 1900]] },
  },
};

export const TARIFF_SOURCES = [
  { name: "DHL サービスガイド・料金表2026（日本）", url: "https://mydhl.express.dhl/content/dam/downloads/jp/ja/rate-guide/service_and_rate_guide_jp_ja_2026.pdf.coredownload.pdf" },
  { name: "FedEx 日本着払い運送料金表 ImportOne 2026", url: "https://www.fedex.com/content/dam/fedex/international/rates/fedex-rates-imp-ja-jp-2026.pdf" },
  { name: "DHL 燃油サーチャージ・繁忙期追加金", url: "https://mydhl.express.dhl/jp/ja/ship/surcharges.html" },
  { name: "FedEx 燃料割増金", url: "https://www.fedex.com/ja-jp/shipping/surcharges.html" },
];
