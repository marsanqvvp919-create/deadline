import { useCallback, useEffect, useState } from 'react';

// チームで共有するメモ（サーバーの Cloud Storage に保存）。
// 以前このブラウザにだけ保存していた分（legacyKey）があれば、最初に一度だけサーバーへ移す。
export function useSharedNotes<T>(
  scope: 'overdue_followups' | 'overdue_clinic_notes' | 'unmatched_done',
  legacyKey?: string
): [Record<string, T>, (key: string, value: T | null) => void] {
  const [notes, setNotes] = useState<Record<string, T>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let legacy: Record<string, T> | null = null;
        if (legacyKey) {
          try {
            const raw = localStorage.getItem(legacyKey);
            if (raw) legacy = JSON.parse(raw);
          } catch {}
        }
        let res: Response;
        if (legacy && Object.keys(legacy).length > 0) {
          res = await fetch(`/api/shared-notes/${scope}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: legacy }),
          });
          if (res.ok && legacyKey) localStorage.removeItem(legacyKey);
        } else {
          res = await fetch(`/api/shared-notes/${scope}`);
        }
        const json = await res.json();
        if (!cancelled && json && json.notes) setNotes(json.notes);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, legacyKey]);

  const setNote = useCallback(
    (key: string, value: T | null) => {
      setNotes((prev) => {
        const next = { ...prev };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      });
      fetch(`/api/shared-notes/${scope}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }).catch(() => {});
    },
    [scope]
  );

  return [notes, setNote];
}
