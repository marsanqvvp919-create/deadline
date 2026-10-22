import React, { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';

// 社内画面の入口。ログインしていなければパスワード画面を出す。
// 使っている途中でログインが切れた（APIが401を返した）ときもパスワード画面に戻す
export function StaffGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (res.status === 401 && /^(\/|https?:\/\/[^/]+\/)api\//.test(url) && !/\/api\/(auth|portal)\//.test(url)) setState('out');
      return res;
    };
    original('/api/auth/me')
      .then((r) => r.json())
      .then((j) => setState(j?.staff ? 'in' : 'out'))
      .catch(() => setState('out'));
    return () => {
      window.fetch = original;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (state === 'out') return <StaffLogin onDone={() => window.location.reload()} />;
  return <>{children}</>;
}

function StaffLogin({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'ログインできませんでした');
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">納期管理システム</h1>
            <p className="text-xs text-slate-500">社内用です。社員共通のパスワードを入力してください</p>
          </div>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
        <p className="text-[11px] text-slate-400">一度ログインすると、この端末では30日間ログインしたままになります。</p>
      </form>
    </div>
  );
}
