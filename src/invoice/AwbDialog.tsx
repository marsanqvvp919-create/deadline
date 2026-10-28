import React, { useEffect, useState } from 'react';
import { demoHeaders } from '../utils/demo';
import { CheckCircle2, Loader2, Plane, Settings, X } from 'lucide-react';
import { DialogFrame, InvoiceDialog } from './InvoiceDialog';
import { ErrorNote } from '../components/flow/Messages';

// AWB（航空貨物の送り状）。DHL Express は MyDHL API、FedEx は Ship API で発行してラベルPDFを保存する。
// API の登録がない間・ほかの配送会社は、AWB番号を手入力する

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...demoHeaders(), ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

const PARTY_FIELDS: [string, string, number][] = [
  ['companyName', '会社・院名', 100],
  ['fullName', '担当者', 100],
  ['addressLine1', '住所1', 45],
  ['addressLine2', '住所2', 45],
  ['addressLine3', '住所3', 45],
  ['cityName', '市区町村（City）', 45],
  ['postalCode', '郵便番号', 12],
  ['countryCode', '国コード', 2],
  ['phone', '電話', 25],
  ['email', 'メール', 60],
];

function PartyForm({ title, value, onChange }: { title: string; value: any; onChange: (v: any) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
      <div className="text-[11px] font-bold text-slate-500">{title}</div>
      {PARTY_FIELDS.map(([k, label, max]) => (
        <label key={k} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 text-slate-500">{label}</span>
          <input
            value={value[k] || ''}
            maxLength={max}
            onChange={(e) => onChange({ ...value, [k]: k === 'countryCode' ? e.target.value.toUpperCase() : e.target.value })}
            className={`flex-1 rounded border px-2 py-1 ${['companyName', 'addressLine1', 'cityName', 'postalCode', 'countryCode', 'phone'].includes(k) && !value[k] ? 'border-rose-300 bg-rose-50' : 'border-slate-300'}`}
          />
        </label>
      ))}
    </div>
  );
}

export function DhlSettings({ onClose }: { onClose?: () => void }) {
  const [cur, setCur] = useState<any>(null);
  const [form, setForm] = useState({ username: '', password: '', accountNumber: '', env: 'test' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    api('/api/awb/settings')
      .then((j) => {
        setCur(j.dhl);
        if (j.dhl?.configured) setForm((f) => ({ ...f, username: j.dhl.username, env: j.dhl.env }));
      })
      .catch((e) => setMsg({ text: e.message, error: true }));
  }, []);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
          <Settings className="w-4 h-4" />
          DHL Express（MyDHL API）の登録
        </span>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-slate-500">
        DHLの法人口座で MyDHL API（発送用）を申し込むと、利用者名・パスワードが発行されます。口座番号は請求先のDHL口座（9桁）です。最初は「テスト」で試し、問題なければ「本番」にしてください。
        {cur?.configured && ` 登録済み：${cur.username}・口座 ${cur.accountNumber}・${cur.env === 'production' ? '本番' : 'テスト'}`}
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="利用者名（API key）" className="rounded border border-slate-300 px-2 py-1.5" autoComplete="off" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={cur?.configured ? 'パスワード（変えるときだけ）' : 'パスワード（API secret）'} className="rounded border border-slate-300 px-2 py-1.5" autoComplete="new-password" />
        <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="DHL口座番号" className="rounded border border-slate-300 px-2 py-1.5" autoComplete="off" />
        <select value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5">
          <option value="test">テスト（実際の発送にはならない）</option>
          <option value="production">本番</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            api('/api/awb/settings', { method: 'POST', body: JSON.stringify({ dhl: form }) })
              .then(() => setMsg({ text: '保存しました' }))
              .catch((e) => setMsg({ text: e.message, error: true }))
          }
          className="rounded bg-slate-900 text-white px-3 py-1.5 font-bold"
        >
          保存
        </button>
        {msg && <span className={msg.error ? 'text-rose-600' : 'text-emerald-700 font-bold'}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function FedexSettings({ onClose }: { onClose?: () => void }) {
  const [cur, setCur] = useState<any>(null);
  const [form, setForm] = useState({ apiKey: '', secretKey: '', accountNumber: '', env: 'test' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/api/awb/settings')
      .then((j) => {
        setCur(j.fedex);
        if (j.fedex?.configured) setForm((f) => ({ ...f, env: j.fedex.env }));
      })
      .catch((e) => setMsg({ text: e.message, error: true }));
  }, []);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
          <Settings className="w-4 h-4" />
          FedEx（Ship API）の登録
        </span>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-slate-500">
        FedEx Developer Portal のプロジェクトの API Key・Secret Key と、FedEx口座番号（9桁）を入れます。テスト用のキーは「テスト」、本番用のキーは「本番」を選んでください。保存するときにFedExへ接続して確かめます。
        {cur?.configured && ` 登録済み：API Key ${cur.apiKey}・口座 ${cur.accountNumber}・${cur.env === 'production' ? '本番' : 'テスト'}`}
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={cur?.configured ? 'API Key（変えるときだけ）' : 'API Key'} className="rounded border border-slate-300 px-2 py-1.5 font-mono" autoComplete="off" />
        <input type="password" value={form.secretKey} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} placeholder={cur?.configured ? 'Secret Key（変えるときだけ）' : 'Secret Key'} className="rounded border border-slate-300 px-2 py-1.5 font-mono" autoComplete="new-password" />
        <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="FedEx口座番号" className="rounded border border-slate-300 px-2 py-1.5 font-mono" autoComplete="off" />
        <select value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5">
          <option value="test">テスト（実際の発送にはならない）</option>
          <option value="production">本番</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            api('/api/awb/settings', { method: 'POST', body: JSON.stringify({ fedex: form }) })
              .then(() => api('/api/awb/settings'))
              .then((j) => {
                setCur(j.fedex);
                setForm((f) => ({ ...f, apiKey: '', secretKey: '' }));
                setMsg({ text: 'FedExに接続できました。保存しました' });
              })
              .catch((e) => setMsg({ text: e.message, error: true }))
              .finally(() => setBusy(false));
          }}
          className="inline-flex items-center gap-1 rounded bg-slate-900 text-white px-3 py-1.5 font-bold disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          保存
        </button>
        {msg && <span className={msg.error ? 'text-rose-600' : 'text-emerald-700 font-bold'}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function AwbDialog({ instructionId, onClose, onDone, embedded }: { instructionId: string; onClose: () => void; onDone: () => void; embedded?: boolean }) {
  const [draft, setDraft] = useState<any>(null);
  const [done, setDone] = useState<{ awbNo: string; awbCarrier?: string; awbLabel?: boolean } | null>(null);
  const [dhlConfigured, setDhlConfigured] = useState(false);
  const [fedexConfigured, setFedexConfigured] = useState(false);
  const [carrier, setCarrier] = useState<'DHL' | 'FedEx'>('DHL');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ carrier: 'DHL', awbNo: '' });
  const [date, setDate] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));

  useEffect(() => {
    api(`/api/awb/draft/${instructionId}`)
      .then((j) => {
        setDraft(j.draft);
        if (j.awbNo) setDone({ awbNo: j.awbNo, awbCarrier: j.awbCarrier, awbLabel: j.awbLabel });
        setDhlConfigured(j.dhlConfigured);
        setFedexConfigured(j.fedexConfigured);
        if (!j.dhlConfigured && j.fedexConfigured) setCarrier('FedEx');
      })
      .catch((e) => setError(e.message));
  }, [instructionId]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      const j = await fn();
      onDone();
      if (embedded) setDone(j.instruction);
      else onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogFrame embedded={embedded} onClose={onClose} width="max-w-4xl">
      {!embedded && (
        <div className="flex items-start justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Plane className="w-5 h-5 text-amber-600" />
            AWB作成（{instructionId}）
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
        {done && (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 space-y-2 text-sm">
            <div className="font-bold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5" />
              送り状 {done.awbCarrier || ''} {done.awbNo} を発行しました
            </div>
            {done.awbLabel && (
              <a href={`/api/awb/label/${instructionId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800">
                送り状のラベルPDF
              </a>
            )}
          </div>
        )}
        {error && <ErrorNote message={error} compact />}

        {draft && !done && (
          <>
            <div className="text-xs text-slate-600">
              インボイス <b>{draft.invoiceNo}</b>・申告価格 <b>{draft.declaredValue.toLocaleString()} {draft.currency}</b>・{draft.items.length}品目（インボイスの内容から作っています。住所は英語住所を分けたものなので、赤い欄を埋めて確認してください）
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <PartyForm title="発送元 / Shipper（倉庫）" value={draft.shipper} onChange={(v) => setDraft({ ...draft, shipper: v })} />
              <PartyForm title="届け先 / Receiver（クリニック）" value={draft.receiver} onChange={(v) => setDraft({ ...draft, receiver: v })} />
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-slate-500">荷物 / Packages（kg・cm）</div>
              {draft.packages.map((p: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">#{i + 1}</span>
                  {(['weight', 'length', 'width', 'height'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1">
                      <span className="text-slate-500">{{ weight: '重さ', length: '長さ', width: '幅', height: '高さ' }[k]}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={p[k]}
                        onChange={(e) => setDraft({ ...draft, packages: draft.packages.map((x: any, j: number) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                        className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono"
                      />
                    </label>
                  ))}
                  {draft.packages.length > 1 && (
                    <button onClick={() => setDraft({ ...draft, packages: draft.packages.filter((_: any, j: number) => j !== i) })} className="text-rose-600">
                      削除
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setDraft({ ...draft, packages: [...draft.packages, { weight: 1, length: 30, width: 20, height: 15 }] })} className="text-indigo-700 font-bold">
                ＋ 箱を追加
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-2 py-1">品目</th>
                  <th className="text-left px-2 py-1">HS</th>
                  <th className="text-left px-2 py-1">原産国</th>
                  <th className="text-right px-2 py-1">数量</th>
                  <th className="text-right px-2 py-1">単価</th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((it: any) => (
                  <tr key={it.number} className="border-b border-slate-50">
                    <td className="px-2 py-1">{it.description}</td>
                    <td className={`px-2 py-1 font-mono ${it.hsCode ? '' : 'text-rose-600'}`}>{it.hsCode || '未入力'}</td>
                    <td className="px-2 py-1">{it.manufacturerCountry}</td>
                    <td className="px-2 py-1 text-right font-mono">{it.quantity}</td>
                    <td className="px-2 py-1 text-right font-mono">{it.price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-amber-900 mr-1">発行する配送会社</span>
                {(['DHL', 'FedEx'] as const).map((c) => (
                  <button key={c} onClick={() => setCarrier(c)} className={`rounded-lg border px-3 py-1 font-bold ${carrier === c ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-300 text-amber-900'}`}>
                    {c === 'DHL' ? 'DHL Express' : 'FedEx'}
                    {!(c === 'DHL' ? dhlConfigured : fedexConfigured) && '（未登録）'}
                  </button>
                ))}
              </div>
              {(carrier === 'DHL' ? dhlConfigured : fedexConfigured) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    発送予定日
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
                  </label>
                  <button disabled={busy} onClick={() => run(() => api(`/api/awb/create/${instructionId}`, { method: 'POST', body: JSON.stringify({ carrier, draft: { ...draft, date } }) }))} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
                    {carrier}でAWBを発行してラベルを作る
                  </button>
                  {carrier === 'FedEx' && <span className="text-amber-800">FedEx International Priority・送料は自社口座、関税は受取人払い</span>}
                </div>
              ) : (
                <div className="text-amber-800">{carrier === 'DHL' ? 'DHL の MyDHL API' : 'FedEx の Ship API'}がまだ登録されていません。左下の「設定」→「配送会社API」で登録すると、ここで発行できます。それまでは下で番号を手入力してください。</div>
              )}
            </div>
          </>
        )}
        {!done && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
          <div className="font-bold text-slate-700">AWB番号を手入力（FedEx・DHLのサイトで作った場合など）</div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={manual.carrier} onChange={(e) => setManual({ ...manual, carrier: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
              <option>DHL</option>
              <option>FedEx</option>
              <option>EMS</option>
              <option>その他</option>
            </select>
            <input value={manual.awbNo} onChange={(e) => setManual({ ...manual, awbNo: e.target.value })} placeholder="AWB番号" className="rounded border border-slate-300 px-2 py-1 font-mono w-56" />
            <button disabled={busy || !manual.awbNo.trim()} onClick={() => run(() => api(`/api/awb/manual/${instructionId}`, { method: 'POST', body: JSON.stringify(manual) }))} className="rounded bg-slate-900 text-white px-3 py-1 font-bold disabled:opacity-40">
              登録
            </button>
          </div>
        </div>
        )}
    </DialogFrame>
  );
}

/** インボイス → 送り状（AWB）を1つの画面で続けて作る */
export function ShipDocsDialog({ instructionId, onClose, onChanged }: { instructionId: string; onClose: () => void; onChanged: () => void }) {
  const [invoiceReady, setInvoiceReady] = useState(false);
  const step = (n: number, title: string, active: boolean, children: React.ReactNode) => (
    <section className={`rounded-xl border p-4 space-y-3 ${active ? 'border-slate-200' : 'border-dashed border-slate-200 bg-slate-50/60'}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs ${active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{n}</span>
        {title}
      </div>
      {children}
    </section>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plane className="w-5 h-5 text-amber-600" />
              インボイスと送り状（{instructionId}）
            </h3>
            <p className="text-[11px] text-slate-500">上でインボイスを発行すると、そのまま下で送り状（AWB）を作れます。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
        {step(1, 'インボイス', true, <InvoiceDialog embedded instructionId={instructionId} onClose={onClose} onIssued={onChanged} onReady={setInvoiceReady} />)}
        {step(
          2,
          '送り状（AWB）',
          invoiceReady,
          invoiceReady ? <AwbDialog embedded instructionId={instructionId} onClose={onClose} onDone={onChanged} /> : <div className="text-xs text-slate-400">インボイスを発行すると、ここで送り状を作れます（品目・申告価格はインボイスから入ります）。</div>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-bold text-slate-700">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
