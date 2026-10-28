import React, { useState } from 'react';
import { Ban, ExternalLink, Eye, EyeOff, Globe, KeyRound, RotateCcw, Share2, Trash2, X } from 'lucide-react';
import { api, ClinicPicker, ClinicRef, CopyButton, Group, portalUrl } from './PortalAdminView';
import { askConfirm } from './flow/Confirm';

/** パスワードの決め方：自動で作るか、社内で決めた文字を入れるか */
export function PasswordChooser({
  mode,
  value,
  onMode,
  onValue,
}: {
  mode: 'auto' | 'manual';
  value: string;
  onMode: (m: 'auto' | 'manual') => void;
  onValue: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-sm">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={mode === 'auto'} onChange={() => onMode('auto')} />
          自動で作る（おすすめ）
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={mode === 'manual'} onChange={() => onMode('manual')} />
          自分で決める
        </label>
      </div>
      {mode === 'manual' && (
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            autoComplete="new-password"
            placeholder="8文字以上"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm font-mono"
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700" aria-label="表示切替">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {value.length > 0 && value.trim().length < 8 && <div className="text-xs text-rose-600 mt-1">8文字以上にしてください</div>}
        </div>
      )}
    </div>
  );
}

export const passwordOk = (mode: 'auto' | 'manual', v: string) => mode === 'auto' || v.trim().length >= 8;

/** クリニックマスタの1院について、お客様画面（URL・パスワード）を発行・管理する */
export function ClinicPortalModal({
  clinic,
  group,
  onClose,
  onChanged,
}: {
  clinic: { clinicId: string; clinicName: string };
  group: Group | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ group: Group; password: string; reset?: boolean } | null>(null);
  const [name, setName] = useState(group?.name || clinic.clinicName);
  const [clinics, setClinics] = useState<ClinicRef[]>(group?.clinics || [{ clinicId: clinic.clinicId, clinicName: clinic.clinicName }]);
  const [pwMode, setPwMode] = useState<'auto' | 'manual'>('auto');
  const [pw, setPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const current = issued?.group || group;

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const body = (extra: object) => JSON.stringify({ ...extra, ...(pwMode === 'manual' ? { password: pw.trim() } : {}) });

  const create = () =>
    run(async () => {
      const j = await api('/api/portal-admin/groups', { method: 'POST', body: body({ name, clinicIds: clinics.map((c) => c.clinicId) }) });
      setIssued({ group: j.group, password: j.password });
      setPw('');
    });
  const changePassword = () =>
    run(async () => {
      const j = await api(`/api/portal-admin/groups/${current!.id}/reset-password`, { method: 'POST', body: body({}) });
      setIssued({ group: j.group, password: j.password, reset: true });
      setChangingPw(false);
      setPw('');
    });
  const saveGroup = () =>
    run(async () => {
      const j = await api(`/api/portal-admin/groups/${current!.id}`, { method: 'POST', body: JSON.stringify({ name, clinicIds: clinics.map((c) => c.clinicId) }) });
      setIssued((x) => (x ? { ...x, group: j.group } : null));
    });
  const toggle = () =>
    run(async () => {
      await api(`/api/portal-admin/groups/${current!.id}`, { method: 'POST', body: JSON.stringify({ disabled: !current!.disabled }) });
      onClose();
    });
  const remove = async () => {
    if (!(await askConfirm({ title: `「${current!.name}」のお客様画面を削除します`, body: 'URLとパスワードは使えなくなります。元には戻せません。', okLabel: '削除する', danger: true }))) return;
    run(async () => {
      await api(`/api/portal-admin/groups/${current!.id}`, { method: 'DELETE' });
      onClose();
    });
  };

  const dirty = current && (name.trim() !== current.name || clinics.map((c) => c.clinicId).join() !== current.clinicIds.join());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto p-6 space-y-4 border border-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-600" />
              お客様画面
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {clinic.clinicName}（{clinic.clinicId}）
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}

        {issued && (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 space-y-2">
            <div className="text-sm font-bold text-emerald-800">{issued.reset ? 'パスワードを変更しました' : '発行しました'}</div>
            <div className="text-xs text-emerald-700">パスワードはこの画面でしか表示されません。コピーしてお客様にお伝えください（URLとパスワードは別々に送ると安全です）。</div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
              <span className="text-xs font-bold text-slate-500 w-16">URL</span>
              <code className="text-xs break-all flex-1">{portalUrl(issued.group.slug)}</code>
              <CopyButton text={portalUrl(issued.group.slug)} label="コピー" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
              <span className="text-xs font-bold text-slate-500 w-16">パスワード</span>
              <code className="text-sm font-bold tracking-wider flex-1 break-all">{issued.password}</code>
              <CopyButton text={issued.password} label="コピー" />
            </div>
          </div>
        )}

        {!current ? (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-600">グループ名（お客様の画面の上に出ます）</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-600">見られる院（同じグループの院を追加できます）</span>
              <ClinicPicker selected={clinics} onChange={setClinics} />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-600">パスワード</span>
              <PasswordChooser mode={pwMode} value={pw} onMode={setPwMode} onValue={setPw} />
            </div>
            <button
              onClick={create}
              disabled={busy || !name.trim() || clinics.length === 0 || !passwordOk(pwMode, pw)}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            >
              URLとパスワードを発行する
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {current.disabled ? (
                <span className="rounded bg-slate-200 text-slate-700 font-bold px-2 py-0.5">停止中</span>
              ) : (
                <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5">発行済み</span>
              )}
              <span className="text-slate-500">
                最終ログイン {current.lastLoginAt ? new Date(current.lastLoginAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : 'まだなし'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CopyButton text={portalUrl(current.slug)} label="URLをコピー" />
              <a href={portalUrl(current.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <ExternalLink className="w-3.5 h-3.5" />
                お客様のログイン画面を開く
              </a>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  パスワード
                </span>
                {!changingPw && (
                  <button onClick={() => setChangingPw(true)} className="text-xs font-bold text-indigo-700 hover:underline">
                    変更する
                  </button>
                )}
              </div>
              {changingPw ? (
                <div className="space-y-2">
                  <PasswordChooser mode={pwMode} value={pw} onMode={setPwMode} onValue={setPw} />
                  <div className="text-[11px] text-slate-500">変更すると今のパスワードは使えなくなり、ログイン中のお客様もログアウトされます。</div>
                  <div className="flex gap-2">
                    <button onClick={changePassword} disabled={busy || !passwordOk(pwMode, pw)} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                      変更する
                    </button>
                    <button onClick={() => setChangingPw(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">安全のため、設定済みのパスワードは表示できません。忘れたときは「変更する」で作り直してください。</div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">グループ名</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700">見られる院</span>
                <ClinicPicker selected={clinics} onChange={setClinics} />
              </div>
              {dirty && (
                <button onClick={saveGroup} disabled={busy || !name.trim() || clinics.length === 0} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                  保存する
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button onClick={toggle} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                {current.disabled ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                {current.disabled ? '利用を再開する' : '一時停止する'}
              </button>
              <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50">
                <Trash2 className="w-3.5 h-3.5" />
                削除する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 一覧の右端の小さな共有ボタン（押すと発行・管理の画面が開く。ここで発行はしない） */
export function ClinicPortalCell({ group, onOpen }: { group: Group | null; onOpen: () => void }) {
  const title = !group ? 'お客様画面を共有（未発行）' : group.disabled ? `お客様画面：停止中（${group.name}）` : `お客様画面：発行済み（${group.name}・${group.clinics.length}院）`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={title}
      aria-label={title}
      className={`relative p-1.5 rounded-lg border transition cursor-pointer ${
        !group
          ? 'border-transparent text-slate-300 hover:text-slate-600 hover:bg-slate-100'
          : group.disabled
            ? 'border-slate-200 text-slate-400 hover:bg-slate-100'
            : 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
      }`}
    >
      <Share2 className="w-4 h-4" />
      {group && !group.disabled && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
    </button>
  );
}
