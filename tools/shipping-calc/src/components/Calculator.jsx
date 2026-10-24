import { useMemo, useRef, useState } from "react";
import { ORIGINS, isCarrierEnabled } from "../data/defaults.js";
import { kg, quoteAll, unitsPerBox, yen } from "../lib/calc.js";
import ResultCards from "./ResultCards.jsx";

export default function Calculator({ master, state, setState }) {
  const [cat, setCat] = useState(null);
  const [entry, setEntry] = useState("");
  const { origin, mode, lines, example } = state;

  const catById = useMemo(() => new Map(master.categories.map((c) => [c.id, c])), [master]);
  const validLines = lines.filter((l) => catById.has(l.id) && l.qty > 0);
  const { packed, quotes } = quoteAll(master, validLines, origin);
  const selected = cat && catById.get(cat);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const setLines = (fn) => setState((s) => ({ ...s, example: false, lines: fn(s.example ? [] : s.lines) }));
  const setQty = (id, qty) =>
    setState((s) => ({
      ...s,
      example: false,
      lines: s.lines.map((l) => (l.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0),
    }));

  const qtyRef = useRef(null);

  const pickCat = (id) => {
    setCat(id);
    setTimeout(() => qtyRef.current?.focus(), 0);
  };

  const add = () => {
    const n = Math.floor(+entry);
    if (!cat || !(n > 0)) return;
    setLines((ls) =>
      ls.some((l) => l.id === cat) ? ls.map((l) => (l.id === cat ? { ...l, qty: l.qty + n } : l)) : [...ls, { id: cat, qty: n }],
    );
    setEntry("");
  };

  const clearAll = () => {
    setEntry("");
    setCat(null);
    setState((s) => ({ ...s, example: false, lines: [] }));
  };

  const key = mode === "cool" ? "coolTotal" : "normal";
  const active = quotes.filter((q) => isCarrierEnabled(q.carrier));
  const best = active.length ? active.reduce((a, b) => (b[key] < a[key] ? b : a)) : null;
  const count = validLines.reduce((a, l) => a + l.qty, 0);
  const chargeable = packed.boxes.reduce((a, b) => a + b.chargeable, 0);
  const sizeText = Object.entries(
    packed.boxes.reduce((acc, b) => ({ ...acc, [b.size.name]: (acc[b.size.name] || 0) + 1 }), {}),
  )
    .map(([n, c]) => `${n}×${c}`)
    .join(" ");

  return (
    <section className="view">
      <div className="machine">
        <div className="col">
          <div className="controls">
            <div className="seg" aria-label="発送元">
              {Object.entries(ORIGINS).map(([code, label]) => (
                <button key={code} aria-pressed={origin === code} onClick={() => update({ origin: code })}>
                  {label}発
                </button>
              ))}
            </div>
            <div className="seg cool" aria-label="国内配送">
              <button aria-pressed={mode === "normal"} onClick={() => update({ mode: "normal" })}>
                通常便
              </button>
              <button data-cool aria-pressed={mode === "cool"} onClick={() => update({ mode: "cool" })}>
                クール便 +¥{yen(master.coolFee)}/個口
              </button>
            </div>
          </div>

          <div className="lcd" aria-live="polite">
            <div className="row">
              <span>{active.length > 1 ? "最安合計" : "合計"}（{mode === "cool" ? "クール便" : "通常便"}）</span>
              <span>{best ? `${best.carrier}・${ORIGINS[origin]}発` : "—"}</span>
            </div>
            <div className="total">
              <span className="yen">¥</span>
              {best ? yen(best[key]) : "0"}
            </div>
            <div className="entry">
              {selected ? (
                <>
                  {selected.name} × <b>{entry || "_"}</b> {selected.unit}
                </>
              ) : (
                "カテゴリを選んで個数を入力"
              )}
            </div>
          </div>

          {packed.boxes.length > 0 && (
            <div className="summary">
              <span>点数 <b>{count.toLocaleString()}</b></span>
              <span>商品重量 <b>{kg(packed.weight)}kg</b></span>
              <span>小口 <b>{packed.boxes.length}個口</b>（{sizeText}）</span>
              <span>課金重量 <b>{kg(chargeable)}kg</b></span>
            </div>
          )}

          <div className="tape">
            {validLines.length === 0 ? (
              <div className="tape-empty">まだ何も入っていません。右のカテゴリキーを押して個数を入力してください。</div>
            ) : (
              <>
                <div className="tapehead">
                  <span>{example ? "例として3品目を入れています" : `${validLines.length}品目`}</span>
                  <button className="clearbtn" onClick={clearAll}>すべてクリア</button>
                </div>
                {validLines.map((ln) => {
                  const c = catById.get(ln.id);
                  return (
                    <div className="tline" key={ln.id}>
                      <div className="nm">
                        {c.name}
                        <small>
                          {kg((ln.qty * c.g) / 1000)}kg・最大箱の{Math.round((ln.qty / unitsPerBox(master, c, origin)) * 100)}%
                        </small>
                      </div>
                      <div className="qty">
                        <button aria-label={`${c.name}を1減らす`} onClick={() => setQty(ln.id, ln.qty - 1)}>−</button>
                        <input
                          id={`q-${ln.id}`}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`${c.name}の個数`}
                          value={ln.qty}
                          onChange={(e) => setQty(ln.id, Math.max(0, Math.floor(+e.target.value || 0)))}
                        />
                        <button aria-label={`${c.name}を1増やす`} onClick={() => setQty(ln.id, ln.qty + 1)}>+</button>
                      </div>
                      <button className="del" aria-label={`${c.name}を削除`} onClick={() => setQty(ln.id, 0)}>×</button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="col">
          <div className="cats">
            {master.categories.map((c) => (
              <button key={c.id} className="cat" aria-pressed={cat === c.id} onClick={() => pickCat(c.id)}>
                <span>{c.name}</span>
                <small>{c.g}g/{c.unit}</small>
              </button>
            ))}
          </div>
          <form
            className="entryform"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label htmlFor="qty-entry">{selected ? `${selected.name}の個数（${selected.unit}）` : "先にカテゴリを選んでください"}</label>
            <div className="entryrow">
              <input
                id="qty-entry"
                ref={qtyRef}
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="0"
                value={entry}
                disabled={!selected}
                onChange={(e) => setEntry(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              />
              <button type="submit" className="addbtn" disabled={!(selected && +entry > 0)}>
                ＋ 追加
              </button>
            </div>
          </form>
          <p className="hint">カテゴリを押す → 個数を入力 → Enter か「＋ 追加」。同じカテゴリは合算されます。</p>
        </div>
      </div>

      {chargeable > 20.5 && (
        <div className="warnbar">
          課金重量が20kgを超えると1kg単位の切り上げになります（FedEx は21kgから kg単価 × 重量）。
        </div>
      )}
      <ResultCards quotes={quotes} best={active.length > 1 ? best : null} packed={packed} mode={mode} coolFee={master.coolFee} />
      <p className="note">関税・輸入消費税・通関立替金は含みません。料金は「マスタ設定」の運賃表から算出した概算です。</p>
    </section>
  );
}
