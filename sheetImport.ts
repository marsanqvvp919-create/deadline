// 毎朝6時の「シート → 楽楽販売」取り込み。
// 「◆出荷ステータス」の行を出荷管理の出荷番号と照合し、インポート設定 100757 の列に入る値と、
// 今の楽楽販売の値との差分を作る（書き込みはサーバー側で CSVデータインポートAPI を使う）。
// 変換ルール（2026/10/07 確定）：出荷元倉庫は選択肢にない値を「その他」、輸入確認「申請済」→「申請中」、
// クール申請・委任状・伝票はクール便の行だけ TRUE→済／FALSE→未。

import { SheetShipmentRow, isTargetRow, trackingDigits } from './unmatchedShipments';

export interface SheetRowFull extends SheetShipmentRow {
  coolType: string; // G列: クール・常温
  airport: string; // H列: 空港
  coolApplication: string; // J列
  coolPowerOfAttorney: string; // K列
  importStatus: string; // L列: ステータス（輸入確認）
  coolSlip: string; // M列
}

export interface ImportShipment {
  shipmentId: string;
  orderId: string;
  customerName?: string;
  trackingNo: string;
  warehouse?: string;
  arrivalAirport?: string;
  importStatus?: string;
  currentLocation?: string;
  coolApplicationStatus?: string;
  powerOfAttorneyStatus?: string;
  slipStatus?: string;
  phaNumber?: string;
  warehouseInvoiceNo?: string;
  warehouseShippedDate?: string;
}

export type RuleStatus = '確定' | '仮';

export interface FieldChange {
  shipmentId: string;
  orderId: string;
  customerName: string;
  sheetRow: number;
  field: string;
  from: string;
  to: string;
  rule: RuleStatus;
  note?: string;
}

export interface HeldValue {
  sheetRow: number;
  shipmentId: string;
  field: string;
  sheetValue: string;
  reason: string;
}

export interface ImportPreview {
  runAt: string;
  mode: 'dry_run' | 'write';
  targetRows: number;
  matchedRows: number;
  unmatchedRows: number;
  shipmentsUpdated: number;
  changes: FieldChange[];
  held: HeldValue[];
  csvColumns: string[];
  csvRows: string[][];
}

// インポート設定 100757 の列の順番（指示どおり。倉庫出荷日は追加予定の列として最後に置く）
export const IMPORT_COLUMNS = [
  '出荷ID',
  '出荷元倉庫',
  '到着空港',
  '輸入確認ステータス',
  '現在地',
  'クール申請',
  'クール委任状',
  'クール伝票',
  '輸入確認番号（PHA）',
  '倉庫インボイス番号',
  '倉庫出荷日',
];

// 楽楽販売の「出荷元倉庫」の選択肢（2026/10/08 確認）
const WAREHOUSE_OPTIONS = ['SG倉庫', '韓国倉庫', 'BIO', 'J ONE', 'VM', 'CSwell', 'その他'];
const AIRPORTS = ['KIX', 'NRT', 'NGO'];

export function parseSheetRowsFull(values: string[][]): SheetRowFull[] {
  const rows: SheetRowFull[] = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const cell = (idx: number) => String(r[idx] ?? '').trim();
    if (!cell(1) && !cell(4) && !cell(5)) continue;
    rows.push({
      rowNumber: i + 1,
      origin: cell(0),
      shipDate: cell(1),
      courier: cell(2),
      invoiceNo: cell(3),
      clinicName: cell(4),
      trackingNo: cell(5),
      coolType: cell(6),
      airport: cell(7),
      notShipped: cell(8).toUpperCase() === 'TRUE',
      coolApplication: cell(9),
      coolPowerOfAttorney: cell(10),
      importStatus: cell(11),
      coolSlip: cell(12),
      memo: cell(13),
    });
  }
  return rows;
}

const blank = (v?: string) => !v || v === '—';
const boolToDone = (v: string): string | null => {
  const u = v.toUpperCase();
  if (u === 'TRUE') return '済';
  if (u === 'FALSE') return '未';
  return null;
};

export function buildImportPreview(values: string[][], shipments: ImportShipment[], today = new Date()): ImportPreview {
  const sheetRows = parseSheetRowsFull(values).filter((r) => isTargetRow(r, today));

  const byTracking = new Map<string, ImportShipment[]>();
  shipments.forEach((s) =>
    trackingDigits(s.trackingNo || '').forEach((d) => {
      if (!byTracking.has(d)) byTracking.set(d, []);
      byTracking.get(d)!.push(s);
    })
  );

  const changes: FieldChange[] = [];
  const held: HeldValue[] = [];
  // 出荷IDごとの書き込み値（1つの追跡番号が複数の出荷に一致したら、すべてに同じ値を入れる）
  const proposed = new Map<string, Record<string, string>>();
  let matchedRows = 0;

  for (const row of sheetRows) {
    const digits = trackingDigits(row.trackingNo);
    const hits = Array.from(new Set(digits.flatMap((d) => byTracking.get(d) || [])));
    if (hits.length === 0) continue;
    matchedRows++;

    for (const s of hits) {
      const values: Record<string, { to: string; rule: RuleStatus; note?: string }> = {};
      const hold = (field: string, sheetValue: string, reason: string) =>
        held.push({ sheetRow: row.rowNumber, shipmentId: s.shipmentId, field, sheetValue, reason });

      // 確定：倉庫出荷日・倉庫インボイス番号・到着空港
      if (!blank(row.shipDate)) values['倉庫出荷日'] = { to: row.shipDate, rule: '確定' };
      // 現在地：楽楽販売で空欄の出荷だけ、倉庫から出ていれば「日本向け出荷済」にする（空欄のままだと取り込みが失敗する。後戻りはさせない）
      if (blank(s.currentLocation) && !blank(row.shipDate)) {
        values['現在地'] = { to: '日本向け出荷済', rule: '確定', note: '楽楽販売の現在地が空欄のため' };
      }
      if (!blank(row.invoiceNo)) values['倉庫インボイス番号'] = { to: row.invoiceNo, rule: '確定' };
      if (!blank(row.airport)) {
        if (AIRPORTS.includes(row.airport.toUpperCase())) values['到着空港'] = { to: row.airport.toUpperCase(), rule: '確定' };
        else hold('到着空港', row.airport, 'KIX・NRT・NGO 以外の値');
      }

      // 出荷元倉庫：楽楽販売の選択肢にない値（JD bio など）は「その他」
      if (!blank(row.origin)) {
        const option = WAREHOUSE_OPTIONS.find((o) => o.toLowerCase() === row.origin.trim().toLowerCase());
        if (option) values['出荷元倉庫'] = { to: option, rule: '確定' };
        else values['出荷元倉庫'] = { to: 'その他', rule: '確定', note: `シートの値：${row.origin}` };
      }

      // 輸入確認ステータス：下書き→下書き、申請済→申請中
      if (!blank(row.importStatus)) {
        if (row.importStatus === '下書き') values['輸入確認ステータス'] = { to: '下書き', rule: '確定' };
        else if (row.importStatus === '申請済')
          values['輸入確認ステータス'] = { to: '申請中', rule: '確定', note: 'シートの「申請済」を「申請中」として取り込み' };
        else hold('輸入確認ステータス', row.importStatus, '対応する楽楽販売の選択肢がない');
      }

      // クール申請・委任状・伝票（クール便の行だけ。常温の行は書き込まない）
      if (row.coolType === 'クール') {
        const cool: [string, string][] = [
          ['クール申請', row.coolApplication],
          ['クール委任状', row.coolPowerOfAttorney],
          ['クール伝票', row.coolSlip],
        ];
        cool.forEach(([field, v]) => {
          if (blank(v)) return;
          const mapped = boolToDone(v);
          if (mapped) values[field] = { to: mapped, rule: '確定', note: 'TRUE→済、FALSE→未' };
          else hold(field, v, 'TRUE/FALSE 以外の値（メモが入っている可能性）');
        });
      }

      const current: Record<string, string | undefined> = {
        現在地: s.currentLocation,
        出荷元倉庫: s.warehouse,
        到着空港: s.arrivalAirport,
        輸入確認ステータス: s.importStatus,
        クール申請: s.coolApplicationStatus,
        クール委任状: s.powerOfAttorneyStatus,
        クール伝票: s.slipStatus,
        倉庫インボイス番号: s.warehouseInvoiceNo,
        倉庫出荷日: s.warehouseShippedDate,
      };

      const rowValues = proposed.get(s.shipmentId) || {};
      for (const [field, v] of Object.entries(values)) {
        rowValues[field] = v.to;
        const from = blank(current[field]) ? '' : String(current[field]);
        const same = from.replace(/\//g, '-') === v.to.replace(/\//g, '-');
        if (!same) {
          changes.push({
            shipmentId: s.shipmentId,
            orderId: s.orderId,
            customerName: s.customerName || '',
            sheetRow: row.rowNumber,
            field,
            from,
            to: v.to,
            rule: v.rule,
            note: v.note,
          });
        }
      }
      proposed.set(s.shipmentId, rowValues);
    }
  }

  // 変更がある出荷だけを CSV にする。
  // 現在地は空欄にすると取り込みが失敗するため、変えない出荷には楽楽販売の今の値をそのまま入れる。
  // それでも空欄になる出荷は送らず「保留」に回す。
  const changedIds = new Set(changes.map((c) => c.shipmentId));
  const currentLocationOf = new Map(shipments.map((sh) => [sh.shipmentId, blank(sh.currentLocation) ? '' : String(sh.currentLocation)]));
  const csvRows: string[][] = [];
  Array.from(changedIds).forEach((id) => {
    const v = proposed.get(id) || {};
    const location = v['現在地'] || currentLocationOf.get(id) || '';
    if (!location) {
      held.push({ sheetRow: 0, shipmentId: id, field: '現在地', sheetValue: '', reason: '楽楽販売の現在地が空欄で、シートにも出荷日がないため取り込めない' });
      return;
    }
    csvRows.push(IMPORT_COLUMNS.map((col) => (col === '出荷ID' ? id : col === '現在地' ? location : v[col] || '')));
  });

  return {
    runAt: new Date().toISOString(),
    mode: 'dry_run' as const,
    targetRows: sheetRows.length,
    matchedRows,
    unmatchedRows: sheetRows.length - matchedRows,
    shipmentsUpdated: csvRows.length,
    changes,
    held,
    csvColumns: IMPORT_COLUMNS,
    csvRows,
  };
}
