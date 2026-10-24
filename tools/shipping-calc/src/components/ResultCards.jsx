import { isCarrierEnabled } from "../data/defaults.js";
import { kg, yen } from "../lib/calc.js";

export default function ResultCards({ quotes, best, packed, mode, coolFee }) {
  if (!quotes.length) return null;
  const cool = mode === "cool";
  const key = cool ? "coolTotal" : "normal";

  return (
    <div className="compare">
      {quotes.map((q) => {
        const off = !isCarrierEnabled(q.carrier);
        return (
        <div
          key={q.carrier}
          className={`card${q === best ? " best" : ""}${off ? " off" : ""}`}
          aria-disabled={off || undefined}
          inert={off ? "" : undefined}
        >
          <h2>
            <span>{q.carrier}</span>
            {q === best && <span className="pill">最安</span>}
            {off && <span className="pill muted">利用停止中</span>}
          </h2>
          <div className="big">
            ¥{yen(q[key])}
            <small>{cool ? "クール便" : "通常便"}</small>
          </div>
          <div className={`alt${cool ? "" : " coolc"}`}>
            {cool ? "通常便なら" : "クール便なら"} ¥{yen(cool ? q.normal : q.coolTotal)}
          </div>
          <table className="bd">
            <tbody>
              <tr>
                <td>公開運賃（課金重量 {kg(q.chargeable)}kg）</td>
                <td>¥{yen(q.listPrice)}</td>
              </tr>
              {q.discount > 0 && (
                <tr>
                  <td>契約割引 {q.rate.discount}%</td>
                  <td>−¥{yen(q.discount)}</td>
                </tr>
              )}
              {q.peak > 0 && (
                <tr>
                  <td>繁忙期追加金 ¥{yen(q.rate.peakPerKg)}/kg</td>
                  <td>¥{yen(q.peak)}</td>
                </tr>
              )}
              <tr>
                <td>燃油サーチャージ {q.rate.fuel}%</td>
                <td>¥{yen(q.fuel)}</td>
              </tr>
              {q.green > 0 && (
                <tr>
                  <td>GoGreen Plus ¥{yen(q.rate.greenPerKg)}/kg</td>
                  <td>¥{yen(q.green)}</td>
                </tr>
              )}
              {q.other > 0 && (
                <tr>
                  <td>手数料（輸出申告など）</td>
                  <td>¥{yen(q.other)}</td>
                </tr>
              )}
              {cool && (
                <tr className="cool">
                  <td>
                    クール便 ¥{yen(coolFee)} × {packed.boxes.length}個口
                  </td>
                  <td>¥{yen(q.cool)}</td>
                </tr>
              )}
              <tr className="sum">
                <td>合計</td>
                <td>¥{yen(q[key])}</td>
              </tr>
            </tbody>
          </table>
          <div className="alt">{q.tariff.label}</div>
          <details>
            <summary>小口の内訳</summary>
            <div className="boxes">
              {packed.boxes.map((b, i) => (
                <span className="box" key={i}>
                  <b>#{i + 1} {b.size.name}</b> 実{kg(b.actual)} / 容{kg(b.volumetric)} → {kg(b.chargeable)}kg
                </span>
              ))}
            </div>
          </details>
        </div>
        );
      })}
    </div>
  );
}
