import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Truck } from 'lucide-react';
import { buildPortalModel, OrderRecord, PortalApiData, PortalModel, portalGroupName } from './portalData';
import { Header } from './mock/Header';
import { SimpleStatusBarView } from './mock/SimpleStatusBarView';
import { TrackingTimelineModal } from './mock/TrackingTimelineModal';
import { DeliverySlipModal } from './mock/DeliverySlipModal';
import { ClinicPortalView } from './mock/ClinicPortalView';
import { OverallHistoryView } from './mock/OverallHistoryView';
import { BatchDetailsModal } from './mock/BatchDetailsModal';

// お客様の管理画面（/portal/:slug）。社内の画面とは別の入口で、グループに入っている院のデータだけを表示する。
// 画面の部品はTAクリニック向けモック（src/portal/mock）をそのまま使い、データは portalData で本番の内容に変換する。

function PortalLogin({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/info/${slug}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'このURLは使えません');
        setName(j.name);
      })
      .catch((e) => setNotFound(e.message));
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
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
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            {name && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                {name.endsWith('様') ? name : `${name}様`}
              </span>
            )}
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-0.5">配送・受注ステータス管理システム</h1>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">ログイン</div>
              <div className="text-[11px] text-slate-500">お知らせしたパスワードを入力してください</div>
            </div>
          </div>
          {notFound ? (
            <p className="text-sm text-rose-600">{notFound}</p>
          ) : (
            <>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={busy || !password}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2.5 text-sm font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'ログイン中…' : 'ログイン'}
              </button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}

function PortalDashboard({ slug, onLogout }: { slug: string; onLogout: () => void }) {
  const [model, setModel] = useState<PortalModel | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [viewMode, setViewMode] = useState<'hq' | 'clinic' | 'overall_history'>('hq');
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [trackingOrder, setTrackingOrder] = useState<OrderRecord | null>(null);
  const [deliverySlipOrder, setDeliverySlipOrder] = useState<OrderRecord | null>(null);
  const [selectedBatchDetailId, setSelectedBatchDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    fetch(`/api/portal/data?slug=${slug}`)
      .then(async (r) => {
        if (r.status === 401) return onLogout();
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) throw new Error(j?.error || '読み込めませんでした');
        const m = buildPortalModel(j as PortalApiData);
        setModel(m);
        setSelectedBatchId((cur) => (cur && m.orders[cur] ? cur : m.batches[0]?.id || ''));
        setSelectedClinicId((cur) => (cur && m.clinics.some((c) => c.id === cur) ? cur : m.clinics[0]?.id || ''));
        setLastUpdated(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      })
      .catch((e) => setError(e.message));
  }, [slug, onLogout]);
  useEffect(load, [load]);

  const logout = async () => {
    await fetch('/api/portal/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  const batchOrdersMap = model?.orders || {};
  const currentBatch = useMemo(() => model?.batches.find((b) => b.id === selectedBatchId) || model?.batches[0], [model, selectedBatchId]);
  const currentBatchOrders = batchOrdersMap[currentBatch?.id || ''] || [];
  const selectedClinic = model?.clinics.find((c) => c.id === selectedClinicId) || model?.clinics[0];
  const selectedClinicOrders = useMemo(
    () =>
      Object.values(batchOrdersMap)
        .flat()
        .filter((o) => o.clinicId === selectedClinic?.id)
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [batchOrdersMap, selectedClinic]
  );

  const handleExportCsv = useCallback(() => {
    const headers = ['管理番号', '受注ID / 出荷ID', '受注月', '受注日', 'クリニック名', '院長名', '郵便番号', '住所', '電話番号', '入港空港', 'ステータス', '国際便業者', '国際便追跡番号', '国内追跡番号', '商品', '総数量', '金額（商品代金）', '到着予定/完了日'];
    const rows = currentBatchOrders.map((o) => [o.id, o.invoiceNo, o.batchName, o.orderDate, o.clinicName, o.doctor, o.zip, o.address, o.tel, o.hub, o.status, o.intlCarrier, o.fedexTracking, o.sagawaTracking, o.items.map((i) => `${i.name}×${i.qty}`).join(' / '), o.totalQty, o.amountTotal ?? '', o.actualDelivery || o.estimatedDelivery]);
    const csv = '﻿' + [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${portalGroupName()}_配送状況_${currentBatch?.id || ''}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentBatchOrders, currentBatch]);

  if (!model || !currentBatch || !selectedClinic) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500 text-sm">
        {error ? (
          <>
            <span className="text-rose-600">{error}</span>
            <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">
              もう一度読み込む
            </button>
          </>
        ) : model && model.batches.length === 0 ? (
          <span>まだご注文がありません</span>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <Header
        batches={model.batches}
        selectedBatchId={currentBatch.id}
        onSelectBatch={setSelectedBatchId}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        selectedClinicId={selectedClinic.id}
        onSelectClinicId={setSelectedClinicId}
        allClinics={model.clinics.map((c) => ({ id: c.id, name: c.name }))}
        lastUpdated={lastUpdated}
        onRefresh={load}
        onLogout={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {error && <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}
        {viewMode === 'hq' && (
          <SimpleStatusBarView
            orders={currentBatchOrders}
            batchName={currentBatch.name}
            isCurrentBatch={currentBatch.isCurrent}
            onOpenTracking={setTrackingOrder}
            onOpenDeliverySlip={setDeliverySlipOrder}
            onExportCsv={handleExportCsv}
            onSelectClinic={(cId) => {
              setSelectedClinicId(cId);
              setViewMode('clinic');
            }}
          />
        )}
        {viewMode === 'clinic' && (
          <ClinicPortalView clinic={selectedClinic} clinicOrders={selectedClinicOrders} onOpenTracking={setTrackingOrder} onOpenDeliverySlip={setDeliverySlipOrder} />
        )}
        {viewMode === 'overall_history' && (
          <OverallHistoryView
            batchOrdersMap={batchOrdersMap}
            onSelectClinic={(cId) => {
              setSelectedClinicId(cId);
              setViewMode('clinic');
            }}
            onSelectBatch={setSelectedBatchDetailId}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">{portalGroupName()} 配送・受注ステータス管理システム</span>
            <span>•</span>
            <span>SG倉庫・韓国仕入先 ➔ DHL / FedEx国際空輸 ➔ 通関 ➔ 国内配送</span>
          </div>
          <div className="text-slate-400">株式会社Number1</div>
        </div>
      </footer>

      {trackingOrder && <TrackingTimelineModal order={trackingOrder} onClose={() => setTrackingOrder(null)} />}
      {deliverySlipOrder && <DeliverySlipModal order={deliverySlipOrder} onClose={() => setDeliverySlipOrder(null)} />}
      {selectedBatchDetailId && (
        <BatchDetailsModal
          batchId={selectedBatchDetailId}
          orders={batchOrdersMap[selectedBatchDetailId] || []}
          onClose={() => setSelectedBatchDetailId(null)}
          onOpenTracking={setTrackingOrder}
          onOpenDeliverySlip={setDeliverySlipOrder}
          onSelectClinic={(cId) => {
            setSelectedClinicId(cId);
            setViewMode('clinic');
          }}
        />
      )}
    </div>
  );
}

export function PortalApp({ slug }: { slug: string }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    document.title = '配送・受注ステータス管理システム';
  }, []);
  useEffect(() => {
    fetch(`/api/portal/data?slug=${slug}`, { method: 'HEAD' })
      .then((r) => setState(r.status === 401 ? 'out' : 'in'))
      .catch(() => setState('out'));
  }, [slug]);
  const logout = useCallback(() => setState('out'), []);
  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (state === 'out') return <PortalLogin slug={slug} onDone={() => setState('in')} />;
  return <PortalDashboard slug={slug} onLogout={logout} />;
}
