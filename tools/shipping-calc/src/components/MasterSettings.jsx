import { useRef, useState } from "react";
import { DEFAULT_MASTER, ORIGINS, isCarrierEnabled } from "../data/defaults.js";
import { TARIFFS, TARIFF_SOURCES } from "../data/tariffs.js";
import { kg, normalizeMaster, tariffPrice, unitsPerBox, usableVolume, yen } from "../lib/calc.js";

function Num({ value, onChange, step = "any", min, disabled }) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)}
    />
  );
}

export default function MasterSettings({ master, onSave }) {
  const [draft, setDraft] = useState(() => structuredClone(master));
  const [status, setStatus] = useState({ text: "", cls: "" });
  const [resetArmed, setResetArmed] = useState(false);
  const fileRef = useRef(null);

  const edit = (fn) => {
    setDraft((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });
    setStatus({ text: "未保存の変更があります", cls: "" });
  };

  const save = () => {
    const clean = normalizeMaster(draft);
    onSave(clean);
    setDraft(structuredClone(clean));
    setStatus({ text: "保存しました", cls: "ok" });
  };

  const reset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    setResetArmed(false);
    setDraft(structuredClone(DEFAULT_MASTER));
    setStatus({ text: "初期値を読み込みました。保存すると反映されます", cls: "" });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(normalizeMaster(draft), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shipping-master-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = normalizeMaster(JSON.parse(await file.text()));
      setDraft(data);
      setStatus({ text: `${file.name} を読み込みました。保存すると反映されます`, cls: "" });
    } catch {
      setStatus({ text: "JSON として読めませんでした。書き出したファイルを選んでください", cls: "err" });
    }
  };

  return (
    <section className="view">
      <div className="panel">
        <div className="bar between">
          <h2>マスタ設定</h2>
          <div className="bar">
            <span className={`status ${status.cls}`}>{status.text}</span>
            <button className="btn danger" onClick={reset}>
              {resetArmed ? "もう一度押すと初期値に戻します" : "初期値に戻す"}
            </button>
            <button className="btn primary" onClick={save}>保存</button>
          </div>
        </div>
        <p className="note">
          設定はこのブラウザに保存されます。他のPCやスタッフと揃えるときは、JSONを書き出して相手の画面で読み込んでください。
        </p>
        <div className="bar">
          <button className="btn" onClick={exportJson}>JSONを書き出す</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>JSONを読み込む</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
        </div>
      </div>

      <div className="panel">
        <h2>商品カテゴリ</h2>
        <p className="note">
          販売単位1つの重量と、梱包したときに占める実効サイズです。初期値は 2026年7〜10月の DHL・FedEx 請求（課金重量）を楽楽販売の出荷明細と突き合わせて逆算した値で、外箱の実寸ではありません。このサイズから発送箱に何個入るかと小口数を計算します。
        </p>
        <div className="tscroll">
          <table className="m">
            <thead>
              <tr>
                <th>カテゴリ名</th><th>単位</th><th>重量 g</th><th>縦 cm</th><th>横 cm</th><th>高さ cm</th><th>最大箱に入る数（SG / KR）</th><th></th>
              </tr>
            </thead>
            <tbody>
              {draft.categories.map((c, i) => (
                <tr key={c.id}>
                  <td><input value={c.name} onChange={(e) => edit((d) => (d.categories[i].name = e.target.value))} /></td>
                  <td><input value={c.unit} onChange={(e) => edit((d) => (d.categories[i].unit = e.target.value))} /></td>
                  <td><Num value={c.g} step="1" min="0" onChange={(v) => edit((d) => (d.categories[i].g = v))} /></td>
                  {["l", "w", "h"].map((f) => (
                    <td key={f}><Num value={c[f]} step="0.5" min="0.1" onChange={(v) => edit((d) => (d.categories[i][f] = v))} /></td>
                  ))}
                  <td className="mono">約{unitsPerBox(draft, c, "SG")} / 約{unitsPerBox(draft, c, "KR")}</td>
                  <td>
                    <button className="del" aria-label={`${c.name}を削除`} onClick={() => edit((d) => d.categories.splice(i, 1))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bar">
          <button
            className="btn"
            onClick={() =>
              edit((d) => d.categories.push({ id: `c${Date.now().toString(36)}`, name: "新しいカテゴリ", unit: "個", g: 100, l: 10, w: 10, h: 5 }))
            }
          >
            ＋ カテゴリを追加
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>運賃・サーチャージ</h2>
        <p className="note">
          運賃は DHL・FedEx の2026年公開輸入料金表（日本着払い・免税）から割引率を引いて計算します。DHL の初期値は 2026年10月15日の請求書（279件）の実績です（公開料金の80%引き、GoGreen Plus 65円/kg、シンガポール発は輸出申告料 1,800円/件）。FedEx は運賃の請求書がないため推測値です（韓国発 78%引き・シンガポール発 72%引き。代表的な荷物で DHL の約1.1倍になるように設定）。燃油サーチャージは毎週変わるので、ときどき公式サイトの値に更新してください。繁忙期追加金は燃油の対象、GoGreen と手数料は対象外です。
        </p>
        <div className="tscroll">
          <table className="m">
            <thead>
              <tr>
                <th>運送会社</th><th>発送元</th><th>公開運賃 1kg / 5kg / 10kg / 20kg</th><th>割引 %</th><th>燃油 %</th><th>繁忙期 円/kg</th><th>GoGreen 円/kg</th><th>手数料 円/件</th>
              </tr>
            </thead>
            <tbody>
              {draft.rates.map((r, i) => {
                const t = TARIFFS[`${r.carrier}:${r.origin}`];
                const off = !isCarrierEnabled(r.carrier);
                return (
                  <tr key={r.carrier + r.origin} className={off ? "off" : undefined}>
                    <td>{r.carrier}{off && <small className="offnote">利用停止中</small>}</td>
                    <td>{ORIGINS[r.origin]}</td>
                    <td className="mono">{[1, 5, 10, 20].map((w) => yen(tariffPrice(t, w))).join(" / ")}</td>
                    <td><Num disabled={off} value={r.discount} step="1" min="0" onChange={(v) => edit((d) => (d.rates[i].discount = v))} /></td>
                    <td><Num disabled={off} value={r.fuel} step="0.25" min="0" onChange={(v) => edit((d) => (d.rates[i].fuel = v))} /></td>
                    <td><Num disabled={off} value={r.peakPerKg} step="10" min="0" onChange={(v) => edit((d) => (d.rates[i].peakPerKg = v))} /></td>
                    <td><Num disabled={off} value={r.greenPerKg} step="1" min="0" onChange={(v) => edit((d) => (d.rates[i].greenPerKg = v))} /></td>
                    <td><Num disabled={off} value={r.other} step="100" min="0" onChange={(v) => edit((d) => (d.rates[i].other = v))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="sources">
          {TARIFF_SOURCES.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>箱サイズ・その他</h2>
        <p className="note">
          発送元のフォワーダーごとに箱と詰め方が違うので、発送元別に設定します。容量が足りなければ一番大きい箱を増やし、端数は収まる一番小さい箱を使います。容積重量 = 縦×横×高さ ÷ 容積係数。
        </p>
        {Object.entries(draft.packing).map(([origin, p]) => (
          <div key={origin} className="packing">
            <div className="bar between">
              <h3>{ORIGINS[origin]}発</h3>
              <label className="fld inline">
                充填率
                <Num value={p.fillRate} step="0.05" min="0.1" onChange={(v) => edit((d) => (d.packing[origin].fillRate = v))} />
              </label>
            </div>
            <div className="tscroll">
              <table className="m">
                <thead>
                  <tr>
                    <th>サイズ</th><th>縦 cm</th><th>横 cm</th><th>高さ cm</th><th>箱・緩衝材 kg</th><th>詰められる容積</th><th>容積重量</th>
                  </tr>
                </thead>
                <tbody>
                  {p.boxes.map((b, i) => (
                    <tr key={b.name + i}>
                      <td>{b.name}</td>
                      {["l", "w", "h"].map((f) => (
                        <td key={f}><Num value={b[f]} step="1" min="1" onChange={(v) => edit((d) => (d.packing[origin].boxes[i][f] = v))} /></td>
                      ))}
                      <td><Num value={b.tare} step="0.05" min="0" onChange={(v) => edit((d) => (d.packing[origin].boxes[i].tare = v))} /></td>
                      <td className="mono">{(usableVolume(p, b) / 1000).toFixed(1)}L</td>
                      <td className="mono">{kg((b.l * b.w * b.h) / Math.max(1, draft.divisor))}kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <div className="grid3">
          <label className="fld">
            1箱あたり最大重量（kg）
            <Num value={draft.maxKg} step="0.5" min="1" onChange={(v) => edit((d) => (d.maxKg = v))} />
          </label>
          <label className="fld">
            容積係数
            <Num value={draft.divisor} step="1000" min="1000" onChange={(v) => edit((d) => (d.divisor = v))} />
          </label>
          <label className="fld">
            クール便 加算（円／個口）
            <Num value={draft.coolFee} step="100" min="0" onChange={(v) => edit((d) => (d.coolFee = v))} />
          </label>
        </div>
      </div>
    </section>
  );
}
