import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { demoHeaders } from '../../utils/demo';
import { TONE, Tone } from './tone';

// 画面上部のステップ表示：未発注 → 在庫を確保 → 倉庫へ出荷依頼 → インボイス → 送り状（AWB） → 出荷 → 配達。
// 今いる場所を色で示し、各ステップに残りの件数を出す。押すとその画面へ移る
export type FlowStepId = 'unordered' | 'allocate' | 'request' | 'invoice' | 'awb' | 'ship' | 'deliver' | 'inbound';
interface Counts {
  unordered: number;
  allocatable: number;
  reserved: number;
  needInvoice: number;
  needAwb: number;
  toShip: number;
  inTransit: number;
  inboundTodo: number;
}
const STEPS: { id: FlowStepId; label: string; key: keyof Counts; tab: string; tone: Tone; hint: string }[] = [
  { id: 'unordered', label: '未発注', key: 'unordered', tab: 'procurement', tone: 'action', hint: '発注するか、在庫から確保する明細' },
  { id: 'allocate', label: '在庫を確保', key: 'allocatable', tab: 'shipping_instructions', tone: 'action', hint: '在庫で出せる伝票' },
  { id: 'request', label: '倉庫へ出荷依頼', key: 'reserved', tab: 'shipping_instructions', tone: 'action', hint: '確保済みで、まだ依頼していないもの' },
  { id: 'invoice', label: 'インボイス', key: 'needInvoice', tab: 'shipping_instructions', tone: 'action', hint: 'インボイスを作るもの' },
  { id: 'awb', label: '送り状（AWB）', key: 'needAwb', tab: 'shipping_instructions', tone: 'action', hint: '送り状を作るもの' },
  { id: 'ship', label: '出荷', key: 'toShip', tab: 'shipping_instructions', tone: 'waiting', hint: '倉庫の出荷待ち' },
  { id: 'deliver', label: '配達', key: 'inTransit', tab: 'shipping_instructions', tone: 'waiting', hint: '配送中' },
];

export function FlowSteps({ current, onNavigate }: { current: FlowStepId; onNavigate?: (tab: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const load = useCallback(() => {
    fetch('/api/inventory/flow', { headers: demoHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCounts(j))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('flow-refresh', load);
    return () => window.removeEventListener('flow-refresh', load);
  }, [load]);
  const go = (tab: string) => {
    if (onNavigate) onNavigate(tab);
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 overflow-x-auto">
      <div className="flex items-stretch gap-1 min-w-max">
        {STEPS.map((s, i) => {
          const n = counts ? counts[s.key] : null;
          const here = s.id === current;
          const tone: Tone = n === 0 ? 'done' : s.tone;
          return (
            <React.Fragment key={s.id}>
              <button
                onClick={() => go(s.tab)}
                title={s.hint}
                className={`flex flex-col items-start rounded-lg border px-3 py-1.5 text-left transition ${here ? 'ring-2 ring-indigo-500 ring-offset-1' : ''} ${TONE[tone]}`}
              >
                <span className="text-[10px] font-bold opacity-80">
                  {i + 1}. {s.label}
                </span>
                <span className="text-base font-black font-mono leading-tight">{n === null ? '…' : n === 0 ? '✓' : n}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300 self-center shrink-0" />}
            </React.Fragment>
          );
        })}
        <span className="mx-2 w-px bg-slate-200" />
        <button
          onClick={() => go('inventory_management')}
          title="追跡番号を入れる・国内倉庫で受け取るなど、入荷であなたの作業が必要なもの"
          className={`flex flex-col items-start rounded-lg border px-3 py-1.5 text-left ${current === 'inbound' ? 'ring-2 ring-indigo-500 ring-offset-1' : ''} ${TONE[counts && counts.inboundTodo === 0 ? 'done' : 'action']}`}
        >
          <span className="text-[10px] font-bold opacity-80">入荷の作業</span>
          <span className="text-base font-black font-mono leading-tight">{counts ? (counts.inboundTodo === 0 ? '✓' : counts.inboundTodo) : '…'}</span>
        </button>
      </div>
    </div>
  );
}
