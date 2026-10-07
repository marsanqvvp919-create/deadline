import { Order, OrderLine, PeriodFilter } from '../types';

/**
 * 数値を3桁区切りにフォーマット
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toLocaleString();
}

/**
 * 通貨形式（¥付き）にフォーマット
 */
export function formatCurrency(num: number | null | undefined): string {
  return `¥${formatNumber(num)}`;
}

/**
 * 日付を YYYY/MM/DD 形式にフォーマット
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  // YYYY-MM-DD や ISO文字列をパース
  const clean = dateString.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return dateString;
}

/**
 * ISO日時を YYYY/MM/DD HH:mm:ss 形式にフォーマット
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}:${s}`;
  } catch {
    return isoString;
  }
}

/**
 * 納期までの残り日数を計算・表示テキスト生成
 * 基準日: 日本時間の今日 (2026-09-24)
 */
export function getRemainingDaysInfo(latestDateStr: string | null | undefined) {
  if (!latestDateStr) {
    return { text: '納期未定', isOverdue: false, isUrgent: false, days: null };
  }
  const clean = latestDateStr.split('T')[0];
  const target = new Date(clean + 'T00:00:00+09:00');
  // 今日の午前0時 (日本時間)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      text: `${Math.abs(diffDays)}日遅れ`,
      isOverdue: true,
      isUrgent: false,
      days: diffDays,
    };
  } else if (diffDays === 0) {
    return {
      text: '本日期限',
      isOverdue: false,
      isUrgent: true,
      days: 0,
    };
  } else if (diffDays <= 10) {
    return {
      text: `あと${diffDays}日`,
      isOverdue: false,
      isUrgent: true,
      days: diffDays,
    };
  } else {
    return {
      text: `あと${diffDays}日`,
      isOverdue: false,
      isUrgent: false,
      days: diffDays,
    };
  }
}

/**
 * 伝票ごとに一意で落ち着きのある識別カラーを割り当て
 */
const BORDER_PALETTE = [
  'border-l-indigo-500 hover:border-indigo-600',
  'border-l-sky-500 hover:border-sky-600',
  'border-l-teal-500 hover:border-teal-600',
  'border-l-emerald-500 hover:border-emerald-600',
  'border-l-amber-500 hover:border-amber-600',
  'border-l-rose-500 hover:border-rose-600',
  'border-l-purple-500 hover:border-purple-600',
  'border-l-cyan-500 hover:border-cyan-600',
  'border-l-blue-500 hover:border-blue-600',
  'border-l-violet-500 hover:border-violet-600',
];

export function getOrderBorderColor(orderId: string): string {
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    hash = (hash << 5) - hash + orderId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % BORDER_PALETTE.length;
  return BORDER_PALETTE[index];
}

/**
 * 伝票の出荷進捗情報（例: 2/3 出荷済）- 送料・手数料を除外した商品のみで計算
 */
export function getOrderProgress(order: Order) {
  const productLines = (order.lines || []).filter(l => !isShippingOrFee(l.productName, l.productId));
  const total = productLines.length;
  const completed = productLines.filter(l => l.stage === '出荷完了').length;
  return {
    total,
    completed,
    label: total > 0 ? `(${completed}/${total} 出荷済)` : '(商品明細なし)',
    isAllShipped: total > 0 ? completed === total : true,
  };
}

/**
 * 期間フィルタの判定
 */
export function isWithinPeriod(dateStr: string | null | undefined, filter: PeriodFilter): boolean {
  if (filter === 'all' || !dateStr) return true;
  const d = new Date(dateStr.split('T')[0] + 'T00:00:00');
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === '7d') {
    const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= past && d <= today;
  }
  if (filter === '30d') {
    const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= past && d <= today;
  }
  if (filter === '90d') {
    const past = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    return d >= past && d <= today;
  }
  if (filter === 'this_month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }
  return true;
}

/**
 * CSVダウンロード（BOM付きUTF-8）
 */
export function exportToCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escapeCsvField = (field: any) => {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = '\uFEFF' + rows.map(r => r.map(escapeCsvField).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 品名または商品IDから「送料」「代行手数料」「手数料」等の諸費用項目であるかを厳格に判定
 * （※これらは商品としてカウントせず、取引・明細一覧にも出さない）
 */
export function isShippingOrFee(productName?: string, productId?: string): boolean {
  if (!productName && !productId) return false;
  const name = (productName || '').trim().toLowerCase();
  const id = (productId || '').trim().toUpperCase();

  // キーワード判定（小文字正規化）: 送料・手数料・デポジット・割引（特別割引・開院割引等）を完全に除外
  const feeKeywords = [
    '送料',
    '配送料',
    '運賃',
    'クール便',
    'チルド便',
    '手数料',
    '代行手数料',
    '代行料',
    '決済代行',
    '振込代行',
    '請求代行',
    '代引手数料',
    '代金引換手数料',
    '振込手数料',
    '事務手数料',
    '決済手数料',
    '梱包料',
    '配送料金',
    '出荷手数料',
    '配送代',
    '紹介手数料',
    'システム利用料',
    'システム手数料',
    // デポジット関係
    'デポジット',
    '保証金',
    '預り金',
    '預託金',
    // 割引・特別割引・開院割引関係
    '割引',
    '特別割引',
    '開院割引',
    '開院記念割引',
    '割引き',
    '値引き',
    '値引',
    'クーポン',
    'キャンペーン割引',
    '早期割引',
    'セット割引',
    // 調整・返金等
    '調整金',
    '調整',
    '返金',
    '相殺',
    '前回分差額',
    '前回差額',
    // 決済関係
    'カード決済',
    'クレジット決済',
    'カード手数料',
    '決済手数料',
    // 英語キーワード
    'shipping',
    'postage',
    'handling fee',
    'handling charge',
    'freight',
    'delivery fee',
    'deposit',
    'discount',
    'coupon',
    'rebate',
    'opening discount',
    'special discount',
  ];

  if (feeKeywords.some((kw) => name.includes(kw.toLowerCase()))) {
    return true;
  }

  // 商品コードパターン判定
  if (
    id.startsWith('SOU') ||
    id.startsWith('FEE') ||
    id.startsWith('POST') ||
    id.startsWith('SHIP') ||
    id.startsWith('DAIKOU') ||
    id.startsWith('TESU') ||
    id.startsWith('COMM') ||
    id.startsWith('DEP') ||
    id.startsWith('DISC') ||
    id.startsWith('COUP') ||
    id.includes('SHIPPING') ||
    id.includes('POSTAGE') ||
    id.includes('SOURYOU') ||
    id.includes('TESURYOU') ||
    id.includes('DAIKOU') ||
    id.includes('DEPOSIT') ||
    id.includes('DISCOUNT')
  ) {
    return true;
  }

  return false;
}

/**
 * 楽楽販売レコードURLの生成（dbSchemaId=101248, viewId=0）
 */
// 楽楽販売は画面ごとのURLが無い（常に top/main）ため、レコードを直接は開けない。トップを開く
export function buildRakurakuUrl(baseUrl: string, _orderId?: string): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return `${cleanBase}top/main`;
}

/** IDをクリップボードにコピーしてから楽楽販売を開く（楽楽販売の検索に貼り付けて使う） */
export function openRakurakuWithCopiedId(baseUrl: string, id: string) {
  try {
    navigator.clipboard?.writeText(id);
  } catch {}
  window.open(buildRakurakuUrl(baseUrl), '_blank', 'noopener,noreferrer');
}

/**
 * 最終更新からの経過時間とインジケーター状態の取得
 * 仕様: 30分未満: 緑色 (正常), 30分以上: 黄色 (注意), 1時間以上: 赤色 (警告)
 */
export type ElapsedFreshnessStatus = 'fresh' | 'warning' | 'danger';

export interface ElapsedTimeInfo {
  diffMinutes: number;
  status: ElapsedFreshnessStatus;
  elapsedText: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
  dotRing: string;
  cardBorderHighlight: string;
  description: string;
}

export function getElapsedTimeInfo(
  timestampStr: string | null | undefined,
  simulatedOffsetMinutes: number = 0
): ElapsedTimeInfo {
  if (!timestampStr) {
    return {
      diffMinutes: 0,
      status: 'fresh',
      elapsedText: '更新情報なし',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-600',
      badgeBorder: 'border-slate-200',
      dotBg: 'bg-slate-400',
      dotRing: 'ring-slate-300',
      cardBorderHighlight: 'border-slate-200',
      description: 'データ更新日時が設定されていません',
    };
  }

  let timeMs = new Date(timestampStr).getTime();
  if (isNaN(timeMs)) {
    timeMs = Date.now();
  }

  const now = Date.now();
  const realDiffMs = Math.max(0, now - timeMs);
  const diffMinutes = Math.floor(realDiffMs / (1000 * 60)) + simulatedOffsetMinutes;

  let elapsedText = '';
  if (diffMinutes < 1) {
    elapsedText = 'たった今更新';
  } else if (diffMinutes < 60) {
    elapsedText = `${diffMinutes}分前更新`;
  } else {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    elapsedText = mins > 0 ? `${hours}時間${mins}分前更新` : `${hours}時間前更新`;
  }

  // ロジック:
  // 30分以上で黄色、1時間（60分）以上なら赤色
  if (diffMinutes >= 60) {
    return {
      diffMinutes,
      status: 'danger',
      elapsedText,
      badgeBg: 'bg-rose-50',
      badgeText: 'text-rose-700',
      badgeBorder: 'border-rose-300',
      dotBg: 'bg-rose-500',
      dotRing: 'ring-rose-200',
      cardBorderHighlight: 'border-rose-300 hover:border-rose-400',
      description: '最終更新から1時間以上経過（赤色: 要データ同期）',
    };
  } else if (diffMinutes >= 30) {
    return {
      diffMinutes,
      status: 'warning',
      elapsedText,
      badgeBg: 'bg-amber-50',
      badgeText: 'text-amber-800',
      badgeBorder: 'border-amber-300',
      dotBg: 'bg-amber-500',
      dotRing: 'ring-amber-200',
      cardBorderHighlight: 'border-amber-300 hover:border-amber-400',
      description: '最終更新から30分以上経過（黄色: 注意）',
    };
  } else {
    return {
      diffMinutes,
      status: 'fresh',
      elapsedText,
      badgeBg: 'bg-emerald-50',
      badgeText: 'text-emerald-700',
      badgeBorder: 'border-emerald-300',
      dotBg: 'bg-emerald-500',
      dotRing: 'ring-emerald-200',
      cardBorderHighlight: 'border-slate-200 hover:border-slate-300',
      description: '最終更新から30分以内（緑色: 正常）',
    };
  }
}
