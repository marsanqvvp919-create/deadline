import { useState } from "react";
import Calculator from "./components/Calculator.jsx";
import MasterSettings from "./components/MasterSettings.jsx";
import { DEFAULT_MASTER, EXAMPLE_LINES } from "./data/defaults.js";
import { normalizeMaster } from "./lib/calc.js";
import { useStoredState } from "./lib/useStoredState.js";

export default function App() {
  const [tab, setTab] = useState("calc");
  const [master, setMaster] = useStoredState("shipcalc-master", () => structuredClone(DEFAULT_MASTER), normalizeMaster);
  const [calc, setCalc] = useStoredState("shipcalc-state", () => ({
    origin: "SG",
    mode: "normal",
    lines: EXAMPLE_LINES,
    example: true,
  }));

  return (
    <div className="wrap">
      <header>
        <h1>
          赤字にならない送料電卓
          <small>シンガポール・韓国 → 日本　DHL / FedEx　通常便・クール便</small>
        </h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "calc"} onClick={() => setTab("calc")}>
            計算
          </button>
          <button role="tab" aria-selected={tab === "master"} onClick={() => setTab("master")}>
            マスタ設定
          </button>
        </div>
      </header>

      {tab === "calc" ? (
        <Calculator master={master} state={calc} setState={setCalc} />
      ) : (
        <MasterSettings master={master} onSave={setMaster} />
      )}
    </div>
  );
}
