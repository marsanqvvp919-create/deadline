import React from 'react';
import { Check } from 'lucide-react';
import { Order } from '../../types';
import { isShippingOrFee } from '../../utils';
import { isLineDelayed } from '../../utils/delayCalculation';

// 受注カードの一番上：入金 → 発注 → 入荷 → 出荷 → 到着 のどこにいるかと、次にやること
type Step = { label: string; state: 'done' | 'now' | 'todo' };

export function orderProgress(order: Order): { steps: Step[]; next: string; delayed: number } {
  const lines = order.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
  const cancelled = /キャンセル/.test(order.status || '');
  const paid = order.paymentStatus === '入金済' || order.paymentStatus === '売掛・締日決済';
  const unordered = lines.filter((l) => l.stage === '未発注').length;
  const waiting = lines.filter((l) => l.stage === '発注済・入荷待ち').length;
  const shippedAll = lines.length > 0 && lines.every((l) => l.stage === '出荷完了');
  const someShipped = lines.some((l) => l.stage === '出荷完了' || l.stage === '一部出荷');
  const delivered = order.orderState === '納品完了';
  const delayed = lines.filter((l) => isLineDelayed(l, order)).length;

  const reached = delivered ? 5 : shippedAll ? 4 : someShipped || (unordered === 0 && waiting === 0) ? 3 : unordered === 0 ? 2 : paid ? 1 : 0;
  const labels = ['入金', '発注', '入荷', '出荷', '到着'];
  const steps: Step[] = labels.map((label, i) => ({ label, state: i < reached ? 'done' : i === reached ? 'now' : 'todo' }));

  let next: string;
  if (cancelled) next = 'キャンセルされた受注です。作業はありません';
  else if (delivered) next = '納品まで完了しています。作業はありません';
  else if (shippedAll) next = '全部出荷済みです。配送状況で到着を確認してください';
  else if (!paid && unordered > 0) next = `入金待ちです（未発注 ${unordered}明細）。入金を確認したら発注してください`;
  else if (unordered > 0) next = `未発注が ${unordered}明細あります。「未発注」の画面で発注するか、在庫から確保してください`;
  else if (waiting > 0) next = `仕入先からの入荷待ちが ${waiting}明細あります。届いたら「入荷・在庫」で受け取ってください`;
  else next = '出荷できる状態です。「引当・出荷指示」で出荷指示を作ってください';
  if (delayed > 0 && !cancelled && !delivered) next = `最長納期を過ぎた明細が ${delayed}件あります。${next}`;
  return { steps, next, delayed };
}

export function OrderProgress({ order }: { order: Order }) {
  const { steps, next, delayed } = orderProgress(order);
  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${delayed ? 'border-rose-200 bg-rose-50/60' : 'border-indigo-100 bg-indigo-50/40'}`}>
      <div className="flex items-center">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
                  s.state === 'done' ? 'bg-emerald-500 text-white' : s.state === 'now' ? (delayed ? 'bg-rose-600 text-white ring-4 ring-rose-200' : 'bg-amber-400 text-white ring-4 ring-amber-100') : 'bg-slate-200 text-slate-500'
                }`}
              >
                {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-[11px] font-bold ${s.state === 'now' ? 'text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 ${s.state === 'done' ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-800">
        <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">次にやること</span>
        {next}
      </p>
    </div>
  );
}
