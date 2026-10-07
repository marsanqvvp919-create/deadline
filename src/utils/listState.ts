import { useCallback, useMemo, useState } from 'react';

// 画面ごとの絞り込みを URL に残す（共有・再読み込みしても同じ表示になるように）。
// 既定値のときは URL から消す。App 側のタブ・担当などのパラメータは残したまま書き換える。
export function useUrlState<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(key);
      return (v as T) || defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const update = useCallback(
    (v: T) => {
      setValue(v);
      try {
        const params = new URLSearchParams(window.location.search);
        if (v === defaultValue) params.delete(key);
        else params.set(key, v);
        const qs = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
      } catch {}
    },
    [key, defaultValue]
  );
  return [value, update];
}

// 列見出しのクリックで並べ替える（同じ列をもう一度押すと逆順）
export function useSort<T>(rows: T[], accessors: Record<string, (row: T) => string | number | null | undefined>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const sorted = useMemo(() => {
    if (!sort || !accessors[sort.key]) return rows;
    const get = accessors[sort.key];
    const blank = (v: unknown) => v === null || v === undefined || v === '' || v === '—';
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (blank(va) && blank(vb)) return 0;
      if (blank(va)) return 1; // 空は常に後ろ
      if (blank(vb)) return -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).replace(/\//g, '-').localeCompare(String(vb).replace(/\//g, '-'), 'ja');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) =>
    setSort((prev) => (prev && prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const indicator = (key: string) => (sort?.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  return { sorted, toggle, indicator };
}
