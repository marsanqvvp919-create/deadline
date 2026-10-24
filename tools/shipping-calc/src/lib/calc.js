import { CARRIERS, DEFAULT_CATEGORIES, DEFAULT_MASTER } from "../data/defaults.js";
import { TARIFFS } from "../data/tariffs.js";

const EPS = 1e-9;

const vol = (x) => x.l * x.w * x.h;
const packingOf = (master, origin) => master.packing[origin] || Object.values(master.packing)[0];
/** 箱のうち商品を詰められる容積（cm³） */
export const usableVolume = (packing, box) => vol(box) * packing.fillRate;
const largestBox = (packing) => packing.boxes.reduce((a, b) => (vol(b) > vol(a) ? b : a));

/** そのカテゴリが、その発送元の一番大きい箱に入るおおよその数 */
export function unitsPerBox(master, c, origin) {
  const p = packingOf(master, origin);
  return Math.max(1, Math.floor(usableVolume(p, largestBox(p)) / Math.max(1, vol(c))));
}

/**
 * 明細から小口（箱）を組む。箱と詰め方は発送元ごとの設定を使う。
 * 商品の実効サイズの合計を、発送箱の使える容積で割って箱数を出す。
 * 容積で決まる場合は満杯の最大箱＋端数箱（入る最小サイズ）、重量で決まる場合は均等割り。
 */
export function pack(master, lines, origin) {
  const p = packingOf(master, origin);
  const byId = new Map(master.categories.map((c) => [c.id, c]));
  let W = 0;
  let V = 0;
  for (const ln of lines) {
    const c = byId.get(ln.id);
    if (!c || ln.qty <= 0) continue;
    W += (ln.qty * c.g) / 1000;
    V += ln.qty * vol(c);
  }
  if (W <= 0 || V <= 0) return { weight: 0, volume: 0, boxes: [] };

  const sizes = [...p.boxes].sort((a, b) => vol(a) - vol(b));
  const big = sizes[sizes.length - 1];
  const bigVol = usableVolume(p, big);
  const pickSize = (v) => sizes.find((s) => usableVolume(p, s) + EPS >= v) || big;
  const maxKg = Math.max(0.5, master.maxKg);
  const byVol = Math.ceil(V / bigVol - EPS);
  const byWt = Math.ceil(W / maxKg - EPS);

  const boxes = [];
  if (byVol >= byWt) {
    const full = Math.floor(V / bigVol + EPS);
    const rest = V - full * bigVol;
    const kgPerCm3 = W / V;
    for (let i = 0; i < full; i++) boxes.push({ size: big, goods: kgPerCm3 * bigVol });
    if (rest > 1e-6) boxes.push({ size: pickSize(rest), goods: kgPerCm3 * rest });
  } else {
    for (let i = 0; i < byWt; i++) boxes.push({ size: pickSize(V / byWt), goods: W / byWt });
  }

  for (const b of boxes) {
    b.actual = b.goods + b.size.tare;
    b.volumetric = vol(b.size) / Math.max(1, master.divisor);
    // 箱ごとに実重量と容積重量の大きい方を 0.5kg 単位で切り上げ
    b.chargeable = Math.ceil(Math.max(b.actual, b.volumetric) * 2 - EPS) / 2;
  }
  return { weight: W, volume: V, boxes };
}

/** 公開運賃表から課金重量の運賃（燃油・割引前）を出す。 */
export function tariffPrice(tariff, chargeable) {
  if (chargeable <= 0) return 0;
  const maxStep = tariff.steps.length * 0.5;
  if (chargeable <= maxStep + EPS) {
    const idx = Math.max(0, Math.ceil(chargeable / 0.5 - EPS) - 1);
    return tariff.steps[idx];
  }
  const w = Math.ceil(chargeable - EPS);
  const { mode, bands } = tariff.over;
  if (mode === "multiply") {
    const band = [...bands].reverse().find(([from]) => w > from) || bands[0];
    return w * band[1];
  }
  // add: 最大重量の料金に、超過分を帯ごとの単価で積み上げる
  let price = tariff.steps[tariff.steps.length - 1];
  bands.forEach(([from, perKg], i) => {
    const to = i + 1 < bands.length ? bands[i + 1][0] : Infinity;
    if (w > from) price += (Math.min(w, to) - from) * perKg;
  });
  return price;
}

export function quote(master, packed, carrier, origin) {
  const rate = master.rates.find((r) => r.carrier === carrier && r.origin === origin);
  const tariff = TARIFFS[`${carrier}:${origin}`];
  const chargeable = packed.boxes.reduce((a, b) => a + b.chargeable, 0);
  const listPrice = tariffPrice(tariff, chargeable);
  const discount = (listPrice * rate.discount) / 100;
  const base = listPrice - discount;
  // 繁忙期追加金は燃油の対象、GoGreen Plus と手数料は対象外（DHL 請求書の実績どおり）
  const peak = chargeable * (rate.peakPerKg || 0);
  const fuel = ((base + peak) * rate.fuel) / 100;
  const green = chargeable * (rate.greenPerKg || 0);
  const other = rate.other || 0;
  const normal = base + peak + fuel + green + other;
  const cool = packed.boxes.length * master.coolFee;
  return { carrier, rate, tariff, chargeable, listPrice, discount, base, peak, fuel, green, other, normal, cool, coolTotal: normal + cool };
}

export function quoteAll(master, lines, origin) {
  const packed = pack(master, lines, origin);
  const quotes = packed.boxes.length ? CARRIERS.map((c) => quote(master, packed, c, origin)) : [];
  return { packed, quotes };
}

/** 読み込んだ JSON を安全なマスタに整える。足りない項目は初期値で埋める。 */
export function normalizeMaster(m) {
  const out = structuredClone(DEFAULT_MASTER);
  if (!m || typeof m !== "object") return out;
  if (Array.isArray(m.categories)) {
    const defaults = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    out.categories = m.categories
      .filter((c) => c && String(c.name || "").trim())
      .map((c, i) => {
        const id = String(c.id || `c${i}`);
        // 外箱サイズのない旧形式は、初期カテゴリなら新しい概算値を、それ以外は旧「1箱目安数」から立方体で換算
        const hasDims = c.l != null && c.w != null && c.h != null;
        const d = defaults.get(id);
        const side = Math.cbrt((50 * 40 * 35 * 0.7) / Math.max(1, +c.perBox || 100));
        // v5 で初期カテゴリを請求実績の値に置き換えたので、それより前の保存値は初期カテゴリだけ新しい値にする
        const src =
          d && !(m.version >= 5) ? { ...d, name: c.name } : hasDims ? c : d ? { ...d, name: c.name, unit: c.unit } : { ...c, l: side, w: side, h: side };
        return {
          id,
          name: String(src.name),
          unit: String(src.unit || ""),
          g: Math.max(0, +src.g || 0),
          l: Math.max(0.1, +src.l || 1),
          w: Math.max(0.1, +src.w || 1),
          h: Math.max(0.1, +src.h || 1),
        };
      });
    // v5 で増えた初期カテゴリ（その他注射剤など）を旧い保存値にも追加する
    if (!(m.version >= 5)) {
      for (const d of DEFAULT_CATEGORIES) if (!out.categories.some((c) => c.id === d.id)) out.categories.push({ ...d });
    }
  }
  // 旧形式（自前の運賃式）の運賃設定は使わず、公開料金表ベースの初期値に置き換える
  // 運賃設定は請求実績で初期値を見直した版（v4）以降だけ引き継ぐ
  if (Array.isArray(m.rates) && m.version >= 4) {
    for (const r of out.rates) {
      const s = m.rates.find((x) => x && x.carrier === r.carrier && x.origin === r.origin);
      if (s) for (const k of ["discount", "fuel", "peakPerKg", "greenPerKg", "other"]) r[k] = Math.max(0, +s[k] || 0);
      r.discount = Math.min(100, r.discount);
      // FedEx の割引率は推測値（v7 で見直し）。旧い保存値が未設定（0%）か旧い推測値（v6: 韓国 82・シンガポール 80）のままなら新しい初期値を使う
      const oldGuess = { KR: 82, SG: 80 }[r.origin];
      if (!(m.version >= 7) && r.carrier === "FedEx" && s && (!(+s.discount > 0) || (m.version === 6 && +s.discount === oldGuess))) {
        r.discount = DEFAULT_MASTER.rates.find((x) => x.carrier === r.carrier && x.origin === r.origin).discount;
      }
    }
  }
  // 梱包（発送元ごとの箱・充填率）は v5 以降の保存値だけ引き継ぐ
  if (m.packing && typeof m.packing === "object" && m.version >= 5) {
    for (const [origin, p] of Object.entries(out.packing)) {
      const s = m.packing[origin];
      if (!s) continue;
      if (Array.isArray(s.boxes) && s.boxes.length) {
        p.boxes = s.boxes.filter(Boolean).map((b, i) => ({
          name: String(b.name || `箱${i + 1}`),
          l: Math.max(1, +b.l || 1),
          w: Math.max(1, +b.w || 1),
          h: Math.max(1, +b.h || 1),
          tare: Math.max(0, +b.tare || 0),
        }));
      }
      if (s.fillRate != null && !Number.isNaN(+s.fillRate)) p.fillRate = Math.min(1, Math.max(0.1, +s.fillRate));
    }
  }
  for (const k of ["maxKg", "divisor", "coolFee"]) {
    if (m[k] != null && !Number.isNaN(+m[k])) out[k] = +m[k];
  }
  return out;
}

export const yen = (n) => Math.round(n).toLocaleString("ja-JP");
export const kg = (n) => (Math.round(n * 10) / 10).toFixed(1);
