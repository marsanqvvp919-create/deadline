import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, KeyRound, Truck } from 'lucide-react';

// 配送会社（FedEx・DHL）の追跡APIの認証情報を入力する画面。
// 値はサーバー（Cloud Storage）に保存し、保存後は画面に表示しない。保存には管理用パスコードが必要。

interface SettingsResponse {
  fedex: { configured: boolean; source: 'env' | 'saved' | null; env?: string; clientIdMasked?: string };
  dhl: { configured: boolean; source: 'env' | 'saved' | null; apiKeyMasked?: string };
  passcodeConfigured: boolean;
  storageConfigured: boolean;
  lastTest: Record<string, { ok: boolean; message: string; at: string }>;
}

const sourceLabel = (s: 'env' | 'saved' | null) =>
  s === 'env' ? 'サーバーの環境変数で設定済み' : s === 'saved' ? 'この画面から保存済み' : '未設定';

export const CarrierSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [passcode, setPasscode] = useState('');
  const [fedex, setFedex] = useState({ clientId: '', clientSecret: '', env: 'sandbox' });
  const [dhlKey, setDhlKey] = useState('');
  const [testNo, setTestNo] = useState({ fedex: '', dhl: '' });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch('/api/carriers/settings')
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/carriers/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Passcode': passcode },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setNotice({ ok: false, text: json.error || '保存できませんでした' });
      else {
        setNotice({ ok: true, text: '保存しました。「接続テスト」で確認してください。' });
        setFedex({ clientId: '', clientSecret: '', env: fedex.env });
        setDhlKey('');
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async (carrier: 'fedex' | 'dhl') => {
    setBusy(true);
    try {
      await fetch('/api/carriers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier, trackingNo: testNo[carrier] || undefined }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const StatusLine = ({ carrier }: { carrier: 'fedex' | 'dhl' }) => {
    const c = settings?.[carrier];
    const t = settings?.lastTest?.[carrier];
    return (
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          {c?.configured ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-slate-400" />
          )}
          <span className="font-bold text-slate-700">{sourceLabel(c?.source ?? null)}</span>
          {carrier === 'fedex' && settings?.fedex.configured && (
            <span className="text-slate-500">
              （{settings.fedex.env === 'production' ? '本番' : 'テスト環境'}・Client ID {settings.fedex.clientIdMasked}）
            </span>
          )}
          {carrier === 'dhl' && settings?.dhl.configured && <span className="text-slate-500">（API Key {settings.dhl.apiKeyMasked}）</span>}
        </div>
        {t && (
          <div className={t.ok ? 'text-emerald-700' : 'text-rose-700'}>
            接続テスト（{new Date(t.at).toLocaleString('ja-JP')}）：{t.message}
          </div>
        )}
      </div>
    );
  };

  const input = 'w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-mono';
  const canSave = !!settings?.passcodeConfigured && passcode.length > 0 && !busy;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Truck className="w-5 h-5" /> 配送会社API連携
        </h2>
        <p className="text-xs text-slate-500">
          FedEx・DHL の追跡APIの認証情報を登録すると、到着トラッキングや伝票の詳細で、配送会社の最新状況（配達完了・輸送中・通関の例外など）を取得できます。
          入力した値はサーバーに保存し、保存後は画面に表示しません。
        </p>
        {!settings?.passcodeConfigured && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            保存には管理用パスコードが必要です。サーバーに管理用パスコード（ADMIN_PASSCODE）がまだ設定されていないため、いまは保存できません。
          </p>
        )}
        <label className="block text-xs font-bold text-slate-700 pt-2">
          管理用パスコード
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className={input + ' mt-1 max-w-xs'}
            autoComplete="off"
          />
        </label>
        {notice && <p className={`text-xs font-bold ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" /> FedEx（Track API）
        </h3>
        <StatusLine carrier="fedex" />
        <p className="text-[11px] text-slate-500">
          FedEx Developer Portal のプロジェクトにある API Key（Client ID）と Secret Key（Client Secret）を入力してください。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            placeholder="API Key（Client ID）"
            value={fedex.clientId}
            onChange={(e) => setFedex({ ...fedex, clientId: e.target.value })}
            className={input}
            autoComplete="off"
          />
          <input
            type="password"
            placeholder="Secret Key（Client Secret）"
            value={fedex.clientSecret}
            onChange={(e) => setFedex({ ...fedex, clientSecret: e.target.value })}
            className={input}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600">接続先：</span>
          {(['sandbox', 'production'] as const).map((env) => (
            <label key={env} className="flex items-center gap-1">
              <input type="radio" checked={fedex.env === env} onChange={() => setFedex({ ...fedex, env })} />
              {env === 'sandbox' ? 'テスト環境（Sandbox）' : '本番（Production）'}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || !fedex.clientId || !fedex.clientSecret}
            onClick={() => save({ fedex })}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
          >
            保存
          </button>
          <input
            placeholder="テスト用の追跡番号（任意）"
            value={testNo.fedex}
            onChange={(e) => setTestNo({ ...testNo, fedex: e.target.value })}
            className={input + ' max-w-[220px]'}
          />
          <button
            type="button"
            disabled={busy || !settings?.fedex.configured}
            onClick={() => test('fedex')}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 disabled:opacity-40"
          >
            接続テスト
          </button>
          {settings?.fedex.source === 'saved' && (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => save({ clear: 'fedex' })}
              className="px-3 py-2 rounded-xl text-xs font-bold text-rose-700 disabled:opacity-40"
            >
              保存した値を消す
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" /> DHL（Shipment Tracking - Unified）
        </h3>
        <StatusLine carrier="dhl" />
        <p className="text-[11px] text-slate-500">DHL Developer Portal のアプリにある API Key を入力してください。</p>
        <input
          type="password"
          placeholder="API Key"
          value={dhlKey}
          onChange={(e) => setDhlKey(e.target.value)}
          className={input + ' max-w-md'}
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || !dhlKey}
            onClick={() => save({ dhl: { apiKey: dhlKey } })}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
          >
            保存
          </button>
          <input
            placeholder="テスト用の追跡番号（任意）"
            value={testNo.dhl}
            onChange={(e) => setTestNo({ ...testNo, dhl: e.target.value })}
            className={input + ' max-w-[220px]'}
          />
          <button
            type="button"
            disabled={busy || !settings?.dhl.configured}
            onClick={() => test('dhl')}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 disabled:opacity-40"
          >
            接続テスト
          </button>
          {settings?.dhl.source === 'saved' && (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => save({ clear: 'dhl' })}
              className="px-3 py-2 rounded-xl text-xs font-bold text-rose-700 disabled:opacity-40"
            >
              保存した値を消す
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
