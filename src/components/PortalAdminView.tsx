import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Copy, Check, KeyRound, Plus, Search, Trash2, X, ExternalLink, Ban, RotateCcw } from 'lucide-react';
import { PUBLIC_ORIGIN } from '../utils/publicUrl';
import { askConfirm } from './flow/Confirm';

export interface ClinicRef {
  clinicId: string;
  clinicName: string;
  address?: string;
}
export interface Group {
  id: string;
  slug: string;
  name: string;
  clinicIds: string[];
  clinics: ClinicRef[];
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export const portalUrl = (slug: string) => `${PUBLIC_ORIGIN}/portal/${slug}`;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `エラー（${r.status}）`);
  return j;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'コピーしました' : label}
    </button>
  );
}

/** 院を検索して選ぶ */
export function ClinicPicker({ selected, onChange }: { selected: ClinicRef[]; onChange: (v: ClinicRef[]) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ClinicRef[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) return setHits([]);
      api(`/api/portal-admin/clinics?q=${encodeURIComponent(q.trim())}`)
        .then((j) => setHits(j.clinics || []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const has = (id: string) => selected.some((c) => c.clinicId === id);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && <span className="text-xs text-slate-400">まだ院を選んでいません</span>}
        {selected.map((c) => (
          <span key={c.clinicId} className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white pl-2.5 pr-1 py-0.5 text-xs">
            {c.clinicName || c.clinicId}
            <button type="button" onClick={() => onChange(selected.filter((x) => x.clinicId !== c.clinicId))} className="rounded-full hover:bg-white/20 p-0.5" aria-label="外す">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="院名・クリニックID・住所で検索（例：TA）"
          className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm"
        />
      </div>
      {hits.length > 0 && (
        <div className="max-h-60 overflow-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
          {hits.map((c) => (
            <button
              type="button"
              key={c.clinicId}
              disabled={has(c.clinicId)}
              onClick={() => onChange([...selected, c])}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default"
            >
              <div className="text-sm font-bold text-slate-800">{c.clinicName}</div>
              <div className="text-[11px] text-slate-500">
                {c.clinicId}
                {c.address ? `・${c.address}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PortalAdminView() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<ClinicRef[]>([]);
  const [issued, setIssued] = useState<{ group: Group; password: string; reset?: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; clinics: ClinicRef[] } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/portal-admin/groups')
      .then((j) => setGroups(j.groups || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setError('');
    try {
      const j = await api('/api/portal-admin/groups', { method: 'POST', body: JSON.stringify({ name, clinicIds: picked.map((c) => c.clinicId) }) });
      setIssued({ group: j.group, password: j.password });
      setCreating(false);
      setName('');
      setPicked([]);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const resetPassword = async (g: Group) => {
    if (!(await askConfirm({ title: `「${g.name}」のパスワードを再発行します`, body: '今のパスワードは使えなくなり、ログイン中の方もログアウトされます。', okLabel: '再発行する', danger: true }))) return;
    try {
      const j = await api(`/api/portal-admin/groups/${g.id}/reset-password`, { method: 'POST' });
      setIssued({ group: j.group, password: j.password, reset: true });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const toggleDisabled = async (g: Group) => {
    try {
      await api(`/api/portal-admin/groups/${g.id}`, { method: 'POST', body: JSON.stringify({ disabled: !g.disabled }) });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const remove = async (g: Group) => {
    if (!(await askConfirm({ title: `「${g.name}」を削除します`, body: 'URLは使えなくなります。元には戻せません。', okLabel: '削除する', danger: true }))) return;
    try {
      await api(`/api/portal-admin/groups/${g.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const saveClinics = async () => {
    if (!editing) return;
    try {
      await api(`/api/portal-admin/groups/${editing.id}`, { method: 'POST', body: JSON.stringify({ clinicIds: editing.clinics.map((c) => c.clinicId) }) });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            お客様の管理画面
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            グループ（1社・1法人）ごとにURLとパスワードを発行します。お客様はグループに入っている院の注文・出荷・配送状況と販売金額を見られます。仕入先・仕入値・利益は表示されません。
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-bold">
            <Plus className="w-4 h-4" />
            新しく発行する
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}

      {issued && (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-emerald-800">
                {issued.reset ? 'パスワードを再発行しました' : '発行しました'}：{issued.group.name}
              </div>
              <div className="text-xs text-emerald-700">
                パスワードはこの画面でしか表示されません。今のうちにコピーして、お客様にお伝えください（URLとパスワードは別々の手段で送ると安全です）。
              </div>
            </div>
            <button onClick={() => setIssued(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="閉じる">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
              <span className="text-xs font-bold text-slate-500 w-20">URL</span>
              <code className="text-sm break-all flex-1">{portalUrl(issued.group.slug)}</code>
              <CopyButton text={portalUrl(issued.group.slug)} label="URLをコピー" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
              <span className="text-xs font-bold text-slate-500 w-20">パスワード</span>
              <code className="text-base font-bold tracking-wider flex-1">{issued.password}</code>
              <CopyButton text={issued.password} label="パスワードをコピー" />
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">新しいグループ</h3>
            <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
              <X className="w-4 h-4" />
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-600">グループ名（お客様の画面の上に出ます）</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：TAクリニックグループ" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-600">見られる院（楽楽販売の顧客マスタから選ぶ）</span>
            <ClinicPicker selected={picked} onChange={setPicked} />
          </div>
          <button
            onClick={create}
            disabled={!name.trim() || picked.length === 0}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            URLとパスワードを発行する
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">読み込み中…</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">まだ発行していません。「新しく発行する」から作成してください。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => (
              <div key={g.id} className={`p-4 space-y-2 ${g.disabled ? 'bg-slate-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{g.name}</span>
                      {g.disabled && <span className="rounded bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5">停止中</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      発行 {fmt(g.createdAt)}・最終ログイン {fmt(g.lastLoginAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CopyButton text={portalUrl(g.slug)} label="URLをコピー" />
                    <a href={portalUrl(g.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <ExternalLink className="w-3.5 h-3.5" />
                      開く
                    </a>
                    <button onClick={() => resetPassword(g)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <KeyRound className="w-3.5 h-3.5" />
                      パスワード再発行
                    </button>
                    <button onClick={() => toggleDisabled(g)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      {g.disabled ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      {g.disabled ? '再開' : '停止'}
                    </button>
                    <button onClick={() => remove(g)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" />
                      削除
                    </button>
                  </div>
                </div>
                {editing?.id === g.id ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <ClinicPicker selected={editing.clinics} onChange={(c) => setEditing({ id: g.id, clinics: c })} />
                    <div className="flex gap-2">
                      <button onClick={saveClinics} disabled={editing.clinics.length === 0} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                        保存
                      </button>
                      <button onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.clinics.map((c) => (
                      <span key={c.clinicId} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-xs">
                        {c.clinicName}
                      </span>
                    ))}
                    <button onClick={() => setEditing({ id: g.id, clinics: g.clinics })} className="text-xs font-bold text-blue-700 hover:underline ml-1">
                      院を編集
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
