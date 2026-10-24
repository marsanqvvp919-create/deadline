import { useEffect, useState } from "react";

/** localStorage に保存される useState。読み書きに失敗しても初期値で動く。 */
export function useStoredState(key, initial, revive = (v) => v) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return revive(JSON.parse(raw));
    } catch {
      /* 保存領域が使えない環境 */
    }
    return typeof initial === "function" ? initial() : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できなくても計算は続ける */
    }
  }, [key, value]);

  return [value, setValue];
}
