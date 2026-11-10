import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY } from './Glossary';
import { TONE_DOT, TONE_LABEL, Tone } from './tone';

/** 画面右上の「使い方」：この画面でやること・色の見方・言葉の説明を1つにまとめる（普段は閉じておく） */
export function HelpMenu({ pageGuide }: { pageGuide?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        title="この画面の使い方・色の見方・言葉の説明"
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">使い方</span>
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <span className="absolute right-0 z-40 mt-1 w-[min(420px,90vw)] max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl space-y-3 text-left">
            {pageGuide && (
              <span className="block">
                <span className="block text-xs font-bold text-slate-900 mb-1">この画面でやること</span>
                <span className="block text-xs text-slate-600 leading-relaxed">{pageGuide}</span>
              </span>
            )}
            <span className="block">
              <span className="block text-xs font-bold text-slate-900 mb-1">色の見方</span>
              <span className="grid grid-cols-2 gap-1">
                {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[t]}`} />
                    {TONE_LABEL[t]}
                  </span>
                ))}
              </span>
            </span>
            <details className="block">
              <summary className="cursor-pointer text-xs font-bold text-slate-900">言葉の説明</summary>
              <dl className="mt-2 space-y-2">
                {GLOSSARY.map((g) => (
                  <div key={g.term} className="text-xs">
                    <dt className="font-bold text-slate-800">{g.term}</dt>
                    <dd className="text-slate-600">{g.meaning}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </span>
        </>
      )}
    </span>
  );
}
