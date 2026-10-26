import React, { useState } from 'react';
import { TONE_DOT, TONE_LABEL, Tone } from './tone';

/** 画面右上の「色の見方」 */
export function ColorLegend() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
        色の見方
      </button>
      {open && (
        <span className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg space-y-1.5" onMouseLeave={() => setOpen(false)}>
          {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
            <span key={t} className="flex items-center gap-2 text-xs text-slate-700">
              <span className={`w-3 h-3 rounded-full ${TONE_DOT[t]}`} />
              {TONE_LABEL[t]}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
