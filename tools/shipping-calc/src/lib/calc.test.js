import { test } from "node:test";
import assert from "node:assert/strict";
import { pack, tariffPrice, quote, normalizeMaster, unitsPerBox } from "./calc.js";
import { TARIFFS } from "../data/tariffs.js";
import { DEFAULT_MASTER } from "../data/defaults.js";

const M = DEFAULT_MASTER;

const chg = (p) => p.boxes.reduce((a, b) => a + b.chargeable, 0);

test("少量は発送元ごとの一番小さい箱 1 個口", () => {
  assert.deepEqual(pack(M, [{ id: "botox", qty: 10 }], "KR").boxes.map((b) => b.size.name), ["XS"]);
  assert.deepEqual(pack(M, [{ id: "botox", qty: 10 }], "SG").boxes.map((b) => b.size.name), ["S"]);
});

test("実効サイズから最大箱の目安数を出す", () => {
  const filler = M.categories.find((c) => c.id === "filler"); // 8×4×2 = 64cm³
  assert.equal(unitsPerBox(M, filler, "SG"), 546); // 50×40×35 × 0.5
  assert.equal(unitsPerBox(M, filler, "KR"), 424); // 42×33×28 × 0.7
});

test("容量超過で小口が分かれ、端数は入る箱を使う", () => {
  assert.deepEqual(pack(M, [{ id: "booster", qty: 100 }], "SG").boxes.map((b) => b.size.name), ["XL", "L"]);
  assert.deepEqual(pack(M, [{ id: "booster", qty: 100 }], "KR").boxes.map((b) => b.size.name), ["L", "L"]);
});

test("重量超過で均等に分ける", () => {
  // リドカインクリーム 500g ジャー 40 個 = 24kg → 20kg 上限で 2 箱
  assert.equal(pack(M, [{ id: "lido", qty: 40 }], "KR").boxes.length, 2);
});

test("請求実績に近い課金重量になる", () => {
  // DHL シンガポール発 スキンブースター 100 → 実績 19.5〜20kg
  assert.equal(chg(pack(M, [{ id: "booster", qty: 100 }], "SG")), 20);
  // FedEx 韓国発 リドカインクリーム 15 → 実績 8.8kg
  assert.ok(Math.abs(chg(pack(M, [{ id: "lido", qty: 15 }], "KR")) - 8.8) <= 1);
});

test("DHL 公開料金表の値と一致する（区分1・区分3）", () => {
  const kr = TARIFFS["DHL:KR"], sg = TARIFFS["DHL:SG"];
  assert.equal(tariffPrice(kr, 0.5), 11930);
  assert.equal(tariffPrice(kr, 2.3), 18270); // 2.5kg に切り上げ
  assert.equal(tariffPrice(kr, 20), 49220);
  assert.equal(tariffPrice(kr, 30), 63220);
  assert.equal(tariffPrice(kr, 40), 77620);
  assert.equal(tariffPrice(kr, 70), 120820);
  assert.equal(tariffPrice(sg, 10), 42000);
  assert.equal(tariffPrice(sg, 20), 55200);
  assert.equal(tariffPrice(sg, 30), 80000);
  assert.equal(tariffPrice(sg, 50), 107000);
});

test("FedEx 公開料金表の値と一致する（区分A・区分B）", () => {
  const kr = TARIFFS["FedEx:KR"], sg = TARIFFS["FedEx:SG"];
  assert.equal(tariffPrice(kr, 0.5), 15240);
  assert.equal(tariffPrice(kr, 10), 35980);
  assert.equal(tariffPrice(kr, 20.5), 47320);
  assert.equal(tariffPrice(kr, 21), 21 * 2280);
  assert.equal(tariffPrice(kr, 45), 45 * 2080);
  assert.equal(tariffPrice(sg, 5), 28400);
  assert.equal(tariffPrice(sg, 20), 52300);
  assert.equal(tariffPrice(sg, 30), 30 * 2540);
});

test("割引・繁忙期・燃油の順で計算する", () => {
  const m = structuredClone(M);
  m.rates.find((r) => r.carrier === "DHL" && r.origin === "KR").discount = 40;
  const p = pack(m, [{ id: "botox", qty: 10 }], "KR"); // XS 箱 1 個 → 容積重量 0.9kg → 1.0kg
  const q = quote(m, p, "DHL", "KR");
  assert.equal(q.listPrice, 13550);
  assert.equal(q.base, 13550 * 0.6);
  assert.equal(q.peak, 1 * 20);
  assert.equal(q.fuel, (q.base + q.peak) * 0.4975);
});

test("DHL 請求書の実績（韓国発 4.0kg・AWB 3627128536）を再現する", () => {
  const m = structuredClone(M);
  m.rates.find((r) => r.carrier === "DHL" && r.origin === "KR").fuel = 46.25; // 2026/9/28-10/4 週
  const q = quote(m, { boxes: [{ chargeable: 4 }] }, "DHL", "KR");
  assert.equal(q.base, 4620); // 公開 23,100 の 20%
  assert.equal(q.green, 260);
  assert.equal(q.peak, 80);
  assert.equal(Math.round(q.fuel), 2174);
  assert.equal(Math.round(q.normal), 7134);
});

test("DHL 請求書の実績（韓国発 16.0kg・AWB 3109539731）の運賃を再現する", () => {
  const q = quote(M, { boxes: [{ chargeable: 16 }] }, "DHL", "KR");
  assert.equal(q.base, 8676);
  assert.equal(q.green, 1040);
});

test("v5 より前の初期カテゴリは請求実績の値に置き換え、名前は残す", () => {
  const m = normalizeMaster({ categories: [{ id: "filler", name: "フィラーA", unit: "箱", g: 80, perBox: 200 }, { id: "x", name: "その他", unit: "個", g: 100, perBox: 49 }] });
  assert.equal(m.categories[0].name, "フィラーA");
  assert.equal(m.categories[0].l, 8);
  assert.equal(m.categories[0].unit, "本(1ml)");
  assert.ok(m.categories.some((c) => c.id === "inject"));
  assert.equal(Math.round(m.categories[1].l * m.categories[1].w * m.categories[1].h), 1000);
});

test("旧形式の運賃設定は読み込まず初期値を使う", () => {
  const m = normalizeMaster({ rates: [{ carrier: "DHL", origin: "SG", first: 4200, fuel: 28 }] });
  assert.equal(m.rates.find((r) => r.carrier === "DHL" && r.origin === "SG").fuel, 49.75);
});

test("クール便は個口数 × 加算額", () => {
  const p = pack(M, [{ id: "booster", qty: 100 }], "SG");
  const q = quote(M, p, "DHL", "SG");
  assert.equal(q.cool, 2 * M.coolFee);
  assert.equal(q.coolTotal, q.normal + q.cool);
});

test("FedEx の割引が未設定か旧い推測値なら新しい推測値に置き換え、手で変えた値は残す", () => {
  const rates = DEFAULT_MASTER.rates.map((r) => ({ ...r, discount: r.carrier === "FedEx" ? 0 : r.discount, fuel: 40 }));
  const m = normalizeMaster({ version: 5, rates });
  assert.equal(m.rates.find((r) => r.carrier === "FedEx" && r.origin === "KR").discount, 78);
  const v6 = normalizeMaster({ version: 6, rates: rates.map((r) => (r.carrier === "FedEx" ? { ...r, discount: r.origin === "KR" ? 82 : 65 } : r)) });
  assert.equal(v6.rates.find((r) => r.carrier === "FedEx" && r.origin === "KR").discount, 78);
  assert.equal(v6.rates.find((r) => r.carrier === "FedEx" && r.origin === "SG").discount, 65);
  assert.equal(m.rates.find((r) => r.carrier === "FedEx" && r.origin === "KR").fuel, 40); // 燃油など他の値は残す
});

test("壊れた JSON は初期値で補う", () => {
  const m = normalizeMaster({ coolFee: "1500", rates: "x" });
  assert.equal(m.coolFee, 1500);
  assert.equal(m.rates.length, 4);
});
