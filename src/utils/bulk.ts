// 一括発注の配送（院ごとの配送先と追跡番号）の、受注IDごとのまとめ。
// 一括発注として登録した受注の出荷は、楽楽販売に追跡番号がなくても「一括発注の配送」で院ごとに追跡している。

export interface BulkSummary {
  batchId: string;
  title: string;
  total: number;
  delivered: number;
}

/** 一括発注の受注ID欄は「000003299,000003300」のように複数入ることがある */
export const splitOrderIds = (v: string) => String(v || '').split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);

export async function fetchBulkByOrder(): Promise<Map<string, BulkSummary>> {
  const map = new Map<string, BulkSummary>();
  try {
    const res = await fetch('/api/bulk-deliveries');
    const j = await res.json();
    for (const b of j?.batches || []) {
      const sum: BulkSummary = { batchId: b.id, title: b.title, total: b.total || 0, delivered: b.counts?.delivered || 0 };
      splitOrderIds(b.orderId).forEach((id) => map.set(id, sum));
    }
  } catch {
    // 読めなければ一括発注なしとして扱う
  }
  return map;
}
