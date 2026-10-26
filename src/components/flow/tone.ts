// 色の意味を全画面でそろえる：赤＝遅れ・急ぎ／黄＝あなたの作業待ち／青＝進行中（待つだけ）／緑＝完了／灰＝対象外
export type Tone = 'urgent' | 'action' | 'waiting' | 'done' | 'na';
export const TONE: Record<Tone, string> = {
  urgent: 'bg-rose-50 border-rose-300 text-rose-800',
  action: 'bg-amber-50 border-amber-300 text-amber-900',
  waiting: 'bg-blue-50 border-blue-200 text-blue-800',
  done: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  na: 'bg-slate-50 border-slate-200 text-slate-400',
};
export const TONE_DOT: Record<Tone, string> = { urgent: 'bg-rose-500', action: 'bg-amber-400', waiting: 'bg-blue-500', done: 'bg-emerald-500', na: 'bg-slate-300' };
export const TONE_LABEL: Record<Tone, string> = { urgent: '遅れ・急ぎ', action: 'あなたの作業待ち', waiting: '進行中（待つだけ）', done: '完了', na: '対象外・不要' };
