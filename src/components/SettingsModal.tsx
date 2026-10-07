import React, { useState, useEffect } from 'react';
import { getConfiguredUrls, saveConnectionConfig, fetchServerIp, ConnectionMode } from '../api';
import { getSalesRepsList, addSalesRep, removeSalesRep } from '../utils/salesRepMapping';
import {
  X,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Key,
  Globe,
  Database,
  Copy,
  Check,
  ShieldAlert,
  Server,
  Users
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const current = getConfiguredUrls();
  const [mode, setMode] = useState<ConnectionMode>(current.mode);
  const [rakurakuBaseUrl, setRakurakuBaseUrl] = useState(current.rakurakuBaseUrl);
  const [rakurakuToken, setRakurakuToken] = useState(current.rakurakuToken);
  const [rakurakuSchemaId, setRakurakuSchemaId] = useState(current.rakurakuSchemaId);
  const [dataUrl, setDataUrl] = useState(current.dataUrl);
  const [dataKey, setDataKey] = useState(current.dataKey);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [copiedIp, setCopiedIp] = useState<boolean>(false);
  const [serverIp, setServerIp] = useState<string>(current.serverIp || '34.34.226.64');

  const [salesRepsList, setSalesRepsList] = useState<string[]>(() => getSalesRepsList());
  const [newRepName, setNewRepName] = useState<string>('');
  const [settingsTab, setSettingsTab] = useState<'connection' | 'sales_reps' | 'tuning'>('connection');
  const [refreshInterval, setRefreshInterval] = useState<string>(() => localStorage.getItem('nouki_refresh_interval') || '5');
  const [systemDate, setSystemDate] = useState<string>(() => localStorage.getItem('nouki_system_today') || '2026-09-24');

  useEffect(() => {
    fetchServerIp().then((ip) => {
      if (ip) setServerIp(ip);
    });
  }, []);

  if (!isOpen) return null;

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleTestRakuraku = async () => {
    setTestStatus('testing');
    setTestMessage('楽楽販売 APIサーバーと直接通信をテストしています...');

    try {
      const res = await fetch('/api/rakuraku/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: rakurakuBaseUrl.trim(),
          token: rakurakuToken.trim(),
          dbSchemaId: rakurakuSchemaId.trim(),
        }),
      });

      const data = await res.json();
      if (data && data.serverIp) {
        setServerIp(data.serverIp);
      }

      if (!res.ok || !data.success) {
        if (data.errorCode === '7' || data.status === 403) {
          setTestStatus('error');
          setTestMessage(
            `【403 IPアクセス制限エラー（コード7: アクセスが拒否されました）】\n楽楽販売側でAPIのIP接続元制限が有効になっています。楽楽販売の「管理者設定 ＞ セキュリティ設定 ＞ IPアクセス制限に関する設定 ＞ APIのアクセス制限」にて、当アプリの現在の発信元IP [${data.serverIp || serverIp}] を許可リストに追加してください。\n\n※IP登録が難しい場合や即座に更新したい場合は、画面上部の「CSV取込」機能を使って楽楽販売からエクスポートしたCSVを貼り付けることで、IP制限なしで即座にデータを反映できます。`
          );
        } else {
          setTestStatus('error');
          setTestMessage(`通信エラー: ${data.error || '楽楽販売APIとの通信に失敗しました'}`);
        }
        return;
      }

      const orderCount = data.data?.orders?.length || 0;
      const alertCount = data.data?.alerts?.length || 0;
      setTestStatus('success');
      setTestMessage(`接続成功！楽楽販売から ${orderCount} 件の伝票データと ${alertCount} 件のアラートを受信しました。`);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(`エラーが発生しました: ${err.message || 'ネットワークエラー'}`);
    }
  };

  const handleTestGas = async () => {
    if (!dataUrl) {
      setTestStatus('error');
      setTestMessage('GAS WebアプリURLを入力してください');
      return;
    }

    setTestStatus('testing');
    setTestMessage('GAS Webアプリ接続をテストしています...');

    try {
      const url = new URL(dataUrl);
      if (dataKey) {
        url.searchParams.set('key', dataKey);
      }
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTPステータス: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.orders || !Array.isArray(data.orders)) {
        throw new Error('JSONの形式が正しくありません (orders配列が未検出)');
      }
      setTestStatus('success');
      setTestMessage(`接続成功！受注伝票 ${data.orders.length} 件、アラート ${data.alerts?.length || 0} 件を受信しました。`);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(`接続失敗: ${err.message || 'ネットワークエラーまたはCORS制限'}`);
    }
  };

  const handleSave = () => {
    localStorage.setItem('nouki_refresh_interval', refreshInterval);
    localStorage.setItem('nouki_system_today', systemDate);
    saveConnectionConfig(
      mode,
      dataUrl.trim(),
      dataKey.trim(),
      rakurakuBaseUrl.trim(),
      rakurakuToken.trim(),
      rakurakuSchemaId.trim()
    );
    onSaved();
    onClose();
  };

  const handleResetData = () => {
    localStorage.removeItem('nouki_last_delivery_data');
    localStorage.removeItem('nouki_stored_orders_v2');
    localStorage.removeItem('nouki_master_products');
    localStorage.removeItem('nouki_master_clinics');
    localStorage.removeItem('nouki_master_products_sync_info');
    localStorage.removeItem('nouki_master_clinics_sync_info');
    localStorage.removeItem('nouki_order_overrides_v1');
    localStorage.removeItem('nouki_line_overrides_v1');
    localStorage.removeItem('nouki_sales_change_history_v1');
    localStorage.removeItem('nouki_invoices_v1');
    localStorage.removeItem('nouki_payment_reminders_v1');
    setMode('rakuraku');
    saveConnectionConfig(
      'rakuraku',
      dataUrl.trim(),
      dataKey.trim(),
      rakurakuBaseUrl.trim(),
      rakurakuToken.trim(),
      rakurakuSchemaId.trim()
    );
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">データ接続・運用設定</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-6 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsTab('connection')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              settingsTab === 'connection'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            接続・API設定
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('sales_reps')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              settingsTab === 'sales_reps'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            営業担当者管理
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('tuning')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              settingsTab === 'tuning'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            便利設定・運用カスタマイズ
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {settingsTab === 'sales_reps' && (
            <div className="space-y-5">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-indigo-950">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>実営業担当者の登録・管理</span>
                </div>
                <p className="text-indigo-800 leading-relaxed">
                  受注伝票やクリニックマスタに割り当てる営業担当者の追加・削除を行います。ここで追加した営業担当者は、各フィルターや担当営業別ビューで選択できるようになります。
                </p>
              </div>

              {/* Add Sales Rep Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <label className="text-xs font-bold text-slate-700 block">新規営業担当者の追加</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="例: 山田 太郎"
                    value={newRepName}
                    onChange={(e) => setNewRepName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newRepName.trim()) {
                        const success = addSalesRep(newRepName);
                        if (success) {
                          setSalesRepsList(getSalesRepsList());
                          setNewRepName('');
                          onSaved();
                        } else {
                          alert('すでに登録されているか、名前が無効です');
                        }
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    追加
                  </button>
                </div>
              </div>

              {/* Registered Sales Reps List */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>登録中の営業担当者一覧</span>
                  <span className="text-xs font-mono text-slate-500 font-normal">{salesRepsList.length}名登録中</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {salesRepsList.map((rep) => (
                    <div key={rep} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {rep.slice(0, 1)}
                        </div>
                        <span className="font-bold text-slate-800">{rep}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`営業担当「${rep}」を削除しますか？\n（割り当てられていたクリニックは「未割当」になります）`)) {
                            removeSalesRep(rep);
                            setSalesRepsList(getSalesRepsList());
                            onSaved();
                          }
                        }}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2.5 py-1 rounded hover:bg-rose-50 transition cursor-pointer"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settingsTab === 'tuning' ? (
            <div className="space-y-5">
              {/* 1. 自動データ更新間隔 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="block text-xs font-bold text-slate-900">
                  ⏱️ 自動データ同期・更新間隔の設定
                </label>
                <p className="text-xs text-slate-600">
                  楽楽販売APIまたはGASから定期的に最新データをバックグラウンドで自動再取得する間隔を指定します。
                </p>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="1">1分毎に自動同期</option>
                  <option value="5">5分毎に自動同期（推奨）</option>
                  <option value="15">15分毎に自動同期</option>
                  <option value="30">30分毎に自動同期</option>
                  <option value="manual">手動更新のみ（自動同期なし）</option>
                </select>
              </div>

              {/* 2. システム基準日シミュレーション */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="block text-xs font-bold text-slate-900">
                  📅 システム基準日（シミュレーション用）の設定
                </label>
                <p className="text-xs text-slate-600">
                  納期遅延・見積期日超過（1週間超過判定）の計算に使用する「本日の日付」をカスタムでシミュレーション検証できます。
                </p>
                <input
                  type="date"
                  value={systemDate}
                  onChange={(e) => setSystemDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <span className="text-[10px] text-slate-500">※通常はリアルタイム現在時刻が適用されます。検証時に上書き可能です。</span>
              </div>

              {/* 3. キャッシュクリア & 強制再同期 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <label className="block text-xs font-bold text-slate-900">
                  🧹 データキャッシュのクリア ＆ 強制再同期
                </label>
                <p className="text-xs text-slate-600">
                  ブラウザに保存されている伝票キャッシュを完全にクリアし、楽楽販売APIから最新データを今すぐ強制再取得します。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('nouki_last_delivery_data');
                    localStorage.removeItem('nouki_cache_ver_v2');
                    localStorage.removeItem('nouki_stored_orders_v2');
                    onSaved();
                    alert('ローカルキャッシュを完全にクリアし、最新データを再同期しました。');
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  ローカルキャッシュをクリアして今すぐ再同期
                </button>
              </div>

              {/* 4. JSONバックアップ・エクスポート */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <label className="block text-xs font-bold text-slate-900">
                  💾 全データ・伝票バックアップ (JSONエクスポート)
                </label>
                <p className="text-xs text-slate-600">
                  現在同期されているすべての伝票データ・アラート・進捗状態をJSONファイルとしてダウンロード保存します。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const raw = localStorage.getItem('nouki_last_delivery_data') || '{}';
                    const blob = new Blob([raw], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `nouki_system_backup_${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  伝票データJSONをダウンロード
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">連携方式の選択</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('rakuraku')}
                className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition text-center ${
                  mode === 'rakuraku'
                    ? 'bg-blue-50 border-blue-600 text-blue-800 shadow-xs ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Server className="w-4 h-4 text-blue-600" />
                <span>楽楽販売 API直接連携</span>
                <span className="text-[10px] font-normal text-slate-500">（パターンC: 推奨）</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('gas')}
                className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition text-center ${
                  mode === 'gas'
                    ? 'bg-blue-50 border-blue-600 text-blue-800 shadow-xs ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>GAS Webアプリ連携</span>
                <span className="text-[10px] font-normal text-slate-500">（パターンA/B）</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('sample')}
                className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition text-center ${
                  mode === 'sample'
                    ? 'bg-blue-50 border-blue-600 text-blue-800 shadow-xs ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Database className="w-4 h-4 text-emerald-600" />
                <span>内蔵サンプルデータ</span>
                <span className="text-[10px] font-normal text-slate-500">（デモ動作モード）</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Rakuraku Direct */}
          {mode === 'rakuraku' && (
            <div className="space-y-4 border border-blue-200 bg-blue-50/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900 border-b border-blue-200 pb-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>楽楽販売 API直接連携（バックエンドプロキシ経由）</span>
              </div>

              {/* Server IP Notification Box */}
              <div className="bg-white border border-amber-300 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold text-slate-900">
                      楽楽販売の「IPアクセス制限」に関する重要なお知らせ
                    </span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      楽楽販売APIは、許可されたIPアドレスからのみ接続を受け付けます。エラーコード7（アクセスが拒否されました）が出る場合は、以下の当アプリサーバーIPを楽楽販売に追加してください：
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <code className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md font-mono text-xs font-bold text-slate-800 select-all">
                        {serverIp}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyIp}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-md transition cursor-pointer"
                      >
                        {copiedIp ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedIp ? 'コピー完了！' : 'IPをコピー'}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 pt-0.5">
                      設定場所: 楽楽販売 ＞ 管理者設定 ＞ セキュリティ設定 ＞ IPアクセス制限に関する設定 ＞ APIのアクセス制限
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    楽楽販売 システムURL
                  </label>
                  <input
                    type="url"
                    value={rakurakuBaseUrl}
                    onChange={(e) => setRakurakuBaseUrl(e.target.value)}
                    placeholder="https://hnsibot.rakurakuhanbai.jp/ykbxg2a/"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    APIトークン (X-HD-apitoken)
                  </label>
                  <input
                    type="password"
                    value={rakurakuToken}
                    onChange={(e) => setRakurakuToken(e.target.value)}
                    placeholder="楽楽販売のAPIトークン"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      対象DBスキーマID (dbSchemaId)
                    </label>
                    <input
                      type="text"
                      value={rakurakuSchemaId}
                      onChange={(e) => setRakurakuSchemaId(e.target.value)}
                      placeholder="101248"
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-500">101248: ご注文管理</span>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleTestRakuraku}
                      disabled={testStatus === 'testing'}
                      className="w-full py-2 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {testStatus === 'testing' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      楽楽販売 接続テスト
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: GAS */}
          {mode === 'gas' && (
            <div className="space-y-4 border border-slate-200 bg-slate-50/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>GAS Webアプリ中継（Google Apps Script）</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-slate-500" />
                    GAS Webアプリ URL (VITE_DATA_URL)
                  </label>
                  <input
                    type="url"
                    value={dataUrl}
                    onChange={(e) => setDataUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-slate-500" />
                    アクセスキー / 合言葉 (VITE_DATA_KEY)
                  </label>
                  <input
                    type="password"
                    value={dataKey}
                    onChange={(e) => setDataKey(e.target.value)}
                    placeholder="GAS中継スクリプトに設定したDATA_KEY"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestGas}
                  disabled={testStatus === 'testing'}
                  className="py-2 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  GAS接続テスト
                </button>
              </div>
            </div>
          )}

          {/* Test connection result */}
          {testStatus !== 'idle' && (
            <div
              className={`p-3.5 rounded-lg text-xs flex items-start gap-2.5 border whitespace-pre-line leading-relaxed ${
                testStatus === 'testing'
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : testStatus === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testStatus === 'testing' && <RefreshCw className="w-4 h-4 animate-spin text-slate-500 shrink-0 mt-0.5" />}
              {testStatus === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {testStatus === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              <div className="flex-1 font-medium">{testMessage}</div>
            </div>
          )}
          </div>
        )}

          {/* Standalone HTML Info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-slate-800 flex items-center justify-between">
              <span>📄 Vite / Node.js不要の単一HTML版（ダウンロード）</span>
              <a
                href="/standalone.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold underline"
              >
                別タブで開く <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-slate-600 text-[11px]">
              パソコンに何もインストールせず、単一のHTMLファイルとしてブラウザや社内サーバー・GASで動作させることも可能です。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleResetData}
            className="text-xs text-slate-600 hover:text-slate-900 underline font-medium cursor-pointer"
          >
            データをリセットして楽々連携のみにする
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition cursor-pointer"
            >
              設定を保存して反映
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
