import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { demoHeaders } from '../../utils/demo';
import { TONE, Tone } from './tone';

// 画面上部のステップ表示：入金 → 未発注 → 仕入先の出荷 → 入荷 → 引当 → 出荷指示 → 出荷 → クール伝票 → 追跡・到着（紙の流れと同じ順）。
// 今いる場所を色で示し、各段に残りの件数と、目安の日数を過ぎた「漏れ」の件数を赤で出す。押すとその画面へ移る
export type FlowStepId = 'unpaid' | 'unordered' | 'vendor' | 'inbound' | 'allocate' | 'instruct' | 'ship' | 'cool' | 'deliver';
interface Counts {
  unpaid: number;
  unordered: number;
  vendorWait: number;
  inboundTodo: number;
  allocatable: number;
  reserved: number;
  needInvoice: number;
  needAwb: number;
  toShip: number;
  inTransit: number;
  leaks?: Partial<Record<FlowStepId, number>>;
}
const STEPS: { id: FlowStepId; label: string; count: (c: Counts) => number | null; tab: string; tone: Tone; hint: string }[] = [
  { id: 'unpaid', label: '入金待ち', count: (c) => c.unpaid, tab: 'procurement', tone: 'waiting', hint: '未発注の明細があり、まだ入金がない伝票' },
  { id: 'unordered', label: '未発注', count: (c) => c.unordered, tab: 'procurement', tone: 'action', hint: '入金済み（売掛・締日決済を含む）で、発注するか在庫から確保する明細。左メニューの「未発注」と同じ数' },
  { id: 'vendor', label: '仕入先の出荷', count: (c) => c.vendorWait, tab: 'inventory_management', tone: 'waiting', hint: '仕入先から倉庫へ向かっている・追跡番号待ちの発注' },
  { id: 'inbound', label: '入荷', count: (c) => c.inboundTodo, tab: 'inventory_management', tone: 'action', hint: '追跡番号を入れる・国内倉庫で受け取るなど、入荷で作業が必要なもの' },
  { id: 'allocate', label: '引当', count: (c) => c.allocatable, tab: 'shipping_instructions', tone: 'action', hint: '在庫で出せる伝票' },
  { id: 'instruct', label: '出荷指示', count: (c) => c.reserved + c.needInvoice + c.needAwb, tab: 'shipping_instructions', tone: 'action', hint: '出荷依頼・インボイス・送り状（AWB）を作るもの' },
  { id: 'ship', label: '出荷', count: (c) => c.toShip, tab: 'shipping_instructions', tone: 'waiting', hint: '倉庫の出荷待ち' },
  { id: 'cool', label: 'クール伝票', count: (c) => c.leaks?.cool ?? 0, tab: 'arrival_tracking', tone: 'action', hint: '通関後に佐川のクール伝票を登録するもの' },
  { id: 'deliver', label: '追跡・到着', count: (c) => c.inTransit, tab: 'arrival_tracking', tone: 'waiting', hint: '配送中' },
];

export function FlowSteps({ current, onNavigate, unordered }: { current?: FlowStepId; onNavigate?: (tab: string) => void; unordered?: number }) {
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
          // 未発注は画面側で数えた数（左メニュー・未発注の画面と同じ）を優先する
          const n = s.id === 'unordered' && unordered !== undefined ? unordered : counts ? s.count(counts) : null;
          const leak = counts?.leaks?.[s.id] || 0;
          const here = s.id === current;
          const tone: Tone = n === 0 ? 'done' : s.tone;
          return (
            <React.Fragment key={s.id}>
              <div className={`relative flex rounded-lg border transition ${here ? 'ring-2 ring-indigo-500 ring-offset-1' : ''} ${TONE[tone]}`}>
                <button onClick={() => go(s.tab)} title={s.hint} className="flex flex-col items-start px-3 py-1.5 text-left w-24">
                  <span className="text-[10px] font-bold opacity-80 whitespace-nowrap">
                    {i + 1}. {s.label}
                  </span>
                  <span className="text-base font-black font-mono leading-tight">{n === null ? '…' : n === 0 ? '✓' : n}</span>
                </button>
                {leak > 0 && (
                  <button onClick={() => go('leak_check')} title="目安の日数を過ぎて止まっているもの（今日の作業を開く）" className="absolute -top-2 -right-1.5 rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white shadow">
                    漏れ{leak}
                  </button>
                )}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300 self-center shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
