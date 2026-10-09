import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Minus } from 'lucide-react';
import { Order, ShipmentItem, ViewTab } from '../types';
import { formatDate, isShippingOrFee, openRakurakuWithCopiedId } from '../utils';
import { getConfiguredUrls } from '../api';
import {
  getOrderMaxDelayDays,
  getOverdueCategory,
  isLineApproaching,
  isLineDelayed,
  isOrderApproaching,
  isOrderDelayed,
  RAKURAKU_OVERDUE_LIST_URL,
} from '../utils/delayCalculation';
import { CarrierStatus, fetchSavedCarrierStatuses } from '../utils/carriers';
import { boxSummaryText, summarizeBoxes } from '../utils/shipmentTracking';
import { attentionCounts, stallOf } from '../utils/meeting';

// 朝8:30の納期会議の画面。上から 発注漏れ → 配送の問題 → 送り状だけで動いていない → 納期超過 → 5日以内に期限 → 追跡番号なし。
// 会議で決めた「誰が・いつまでに・何をする」は楽楽販売の「対応メモ」に入れてもらい、ここには最新の内容を出す（アプリからは書き込まない）。

type SectionId = 'missed' | 'stalled' | 'labelOnly' | 'overdue' | 'approaching' | 'untracked';

const SECTIONS: { id: SectionId; label: string; rule: string; tone: string }[] = [
  { id: 'missed', label: '発注漏れ', rule: '受注済みのまま未発注で、最長納品予定日を過ぎている', tone: 'rose' },
  { id: 'stalled', label: '配送の問題', rule: '配送会社が例外（通関保留・住所不明・不在・配達遅延・返送など）を返しているか、輸送中のまま最後のスキャンから3日以上動きがない', tone: 'orange' },
  { id: 'labelOnly', label: '送り状だけで動いていない', rule: '送り状（ラベル）を作ってから3日以上、配送会社が荷物を受け取っていない', tone: 'slate' },
  { id: 'overdue', label: '納期超過', rule: '楽楽販売「納期：①超過」と同じ条件（割引・不足分などの精算行だけが残った伝票は除く）', tone: 'rose' },
  { id: 'approaching', label: '5日以内に期限', rule: '楽楽販売「納期：②注意」と同じ条件（納期超過に入っている伝票は除く）', tone: 'amber' },
  { id: 'untracked', label: '追跡番号なし', rule: '「◆出荷ステータス」の追跡番号が楽楽販売の出荷管理にない（未照合）', tone: 'slate' },
];

interface Row {
  key: string;
  orderId: string;
  order?: Order;
  clinic: string;
  rep: string;
  suppliers: string;
  latestDate: string | null;
  daysOver: number;
  carrier: string;
  carrierAlert: boolean;
  memo: string;
  alsoIn?: string;
  shipmentId?: string;
}

const toneClass: Record<string, string> = {
  rose: 'bg-rose-600',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-500',
};

export const MorningMeetingView: React.FC<{
  orders: Order[];
  shipments: ShipmentItem[];
  sheetUnmatchedCount: number | null;
  generatedAt?: string | null;
  onSelectOrder: (order: Order) => void;
  onNavigateToTab: (tab: ViewTab) => void;
}> = ({ orders, shipments, sheetUnmatchedCount, generatedAt, onSelectOrder, onNavigateToTab }) => {
  const { rakurakuBaseUrl } = getConfiguredUrls();
  const [carrierStatus, setCarrierStatus] = useState<Record<string, CarrierStatus>>({});
  const [carrierLoaded, setCarrierLoaded] = useState(false);
  const [previous, setPrevious] = useState<{ date: string; counts: Record<string, number> } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // 配送会社の状況（サーバーが自動取得したもの）。会議中も新しくなるよう5分ごとに読み直す
  useEffect(() => {
    const load = () =>
      fetchSavedCarrierStatuses().then((snap) => {
        if (snap) {
          const map: Record<string, CarrierStatus> = {};
          snap.statuses.forEach((r) => (map[r.trackingNo] = r));
          setCarrierStatus(map);
        }
        setCarrierLoaded(true);
      });
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // 受注IDごとの出荷（明細の受注IDでもつなぐ）
  const shipmentsByOrder = useMemo(() => {
    const m = new Map<string, ShipmentItem[]>();
    const add = (id: string | undefined, s: ShipmentItem) => {
      if (!id || id === '—') return;
      const list = m.get(id) || [];
      if (!list.includes(s)) list.push(s);
      m.set(id, list);
    };
    shipments.forEach((s) => {
      add(s.orderId, s);
      ((s as any).lineRefs || []).forEach((r: { orderId: string }) => add(r.orderId, s));
    });
    return m;
  }, [shipments]);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);

  // 伝票の配送状況と対応メモ（対応メモはご注文管理にあればそれ、なければ出荷管理の新しいものから）
  const shipInfo = (orderId: string) => {
    const list = (shipmentsByOrder.get(orderId) || []).slice().sort((a, b) => b.shipmentId.localeCompare(a.shipmentId));
    const summaries = list
      .filter((s) => (s.shipStatus || '').includes('出荷済'))
      .map((s) => ({ s, sum: summarizeBoxes(s, carrierStatus) }))
      .filter((x) => x.sum.total > 0);
    const pick =
      summaries.find((x) => x.sum.rep?.status === 'exception') ||
      summaries.find((x) => x.sum.rep && x.sum.rep.status !== 'delivered') ||
      summaries[0];
    const memo = list.map((s) => s.handlingMemo).find((m) => m && m !== '—') || '';
    return {
      carrier: pick ? boxSummaryText(pick.sum) : list.length > 0 ? '出荷待ち' : '出荷なし',
      carrierAlert: !!pick && pick.sum.rep?.status === 'exception',
      memo,
    };
  };

  const rowFromOrder = (o: Order, opts: { approaching?: boolean } = {}): Row => {
    const lines = o.lines.filter((l) => !isShippingOrFee(l.productName, l.productId));
    const target = lines.filter((l) => (opts.approaching ? isLineApproaching(l, o) : isLineDelayed(l, o)));
    const unshipped = lines.filter((l) => l.stage !== '出荷完了');
    // 全部出荷済みの伝票（配送で止まっているもの）は、伝票の全明細の仕入先を出す
    const relevant = target.length > 0 ? target : unshipped.length > 0 ? unshipped : lines;
    const dates = relevant.map((l) => l.latestDate).filter(Boolean).map((d) => String(d).replace(/\//g, '-')).sort();
    const info = shipInfo(o.orderId);
    return {
      key: o.orderId,
      orderId: o.orderId,
      order: o,
      clinic: o.customerName,
      rep: o.salesRep,
      suppliers: Array.from(new Set(relevant.map((l) => l.supplierName || '仕入先未設定'))).join('、'),
      // 超過は一番古い予定日、間近は一番近い予定日
      latestDate: dates[0] || null,
      daysOver: opts.approaching ? 0 : getOrderMaxDelayDays(o),
      carrier: info.carrier,
      carrierAlert: info.carrierAlert,
      memo: (o.handlingMemo || '').trim() || info.memo,
    };
  };

  const sections = useMemo(() => {
    const overdueOrders = orders.filter((o) => isOrderDelayed(o));
    const missed = overdueOrders.filter((o) => getOverdueCategory(o) === '発注漏れ').map((o) => rowFromOrder(o));
    const missedIds = new Set(missed.map((r) => r.orderId));
    const overdue = overdueOrders.map((o) => ({ ...rowFromOrder(o), alsoIn: missedIds.has(o.orderId) ? '発注漏れ' : undefined }));
    const approaching = orders.filter((o) => isOrderApproaching(o)).map((o) => rowFromOrder(o, { approaching: true }));

    // 配送で止まっている出荷を「配送の問題」と「送り状だけで動いていない」に分ける
    const stalled: Row[] = [];
    const labelOnly: Row[] = [];
    shipments.forEach((s) => {
      const st = stallOf(s, carrierStatus);
      if (!st) return;
      const c = st.sum.rep!;
      const idle = st.idle;
      const o = orderById.get(s.orderId);
      const base = o ? rowFromOrder(o) : null;
      (st.kind === 'problem' ? stalled : labelOnly).push({
        key: s.shipmentId,
        orderId: s.orderId && s.orderId !== '—' ? s.orderId : '',
        order: o,
        clinic: o?.customerName || s.customerName || '—',
        rep: o?.salesRep || '—',
        suppliers: base?.suppliers || '—',
        latestDate: base?.latestDate || null,
        daysOver: o && isOrderDelayed(o) ? getOrderMaxDelayDays(o) : 0,
        carrier: `${boxSummaryText(st.sum)}${idle !== null ? `（最終スキャン ${idle}日前${c.lastLocation ? `・${c.lastLocation}` : ''}）` : ''}`,
        carrierAlert: st.kind === 'problem',
        memo: (o?.handlingMemo || '').trim() || (s.handlingMemo && s.handlingMemo !== '—' ? s.handlingMemo : ''),
        shipmentId: s.shipmentId,
      });
    });

    const byDays = (a: Row, b: Row) => b.daysOver - a.daysOver;
    const byDate = (a: Row, b: Row) => String(a.latestDate || '9').localeCompare(String(b.latestDate || '9'));
    return {
      missed: missed.sort(byDays),
      stalled: stalled.sort(byDays),
      labelOnly: labelOnly.sort(byDays),
      overdue: overdue.sort(byDays),
      approaching: approaching.sort(byDate),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, shipments, carrierStatus, shipmentsByOrder]);

  const counts: Record<SectionId, number | null> = {
    missed: sections.missed.length,
    stalled: carrierLoaded ? sections.stalled.length : null,
    labelOnly: carrierLoaded ? sections.labelOnly.length : null,
    overdue: sections.overdue.length,
    approaching: sections.approaching.length,
    untracked: sheetUnmatchedCount,
  };

  const attention = useMemo(() => attentionCounts(orders, shipments, carrierStatus), [orders, shipments, carrierStatus]);

  // 今日の件数をサーバーに残し、前回（ふつうは前日）の件数と比べる
  const countsKey = JSON.stringify(counts);
  useEffect(() => {
    if (orders.length === 0 || !carrierLoaded || sheetUnmatchedCount === null) {
      fetch('/api/meeting/history')
        .then((r) => r.json())
        .then((j) => setPrevious(j?.previous || null))
        .catch(() => {});
      return;
    }
    fetch('/api/meeting/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counts }),
    })
      .then((r) => r.json())
      .then((j) => setPrevious(j?.previous || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  const yesterday = (() => {
    const d = new Date(Date.now() - 86400000 + 9 * 3600000);
    return d.toISOString().slice(0, 10);
  })();
  const diffLabel = previous ? (previous.date === yesterday ? '前日比' : `${previous.date.slice(5).replace('-', '/')}比`) : '';

  const Diff: React.FC<{ id: SectionId }> = ({ id }) => {
    const now = counts[id];
    const before = previous?.counts?.[id];
    if (now === null || before === undefined) return <span className="text-[11px] text-slate-400">前日比 —</span>;
    const d = now - before;
    // 件数は減るほど良い
    const cls = d > 0 ? 'text-rose-600' : d < 0 ? 'text-emerald-600' : 'text-slate-500';
    const Icon = d > 0 ? ArrowUp : d < 0 ? ArrowDown : Minus;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${cls}`} title={`${previous!.date} は ${before}件`}>
        <Icon className="w-3.5 h-3.5" />
        {d === 0 ? '±0' : Math.abs(d)}
        <span className="text-[10px] font-normal text-slate-500 ml-1">{diffLabel}</span>
      </span>
    );
  };

  const openInRakuraku = (id: string) => {
    openRakurakuWithCopiedId(rakurakuBaseUrl, id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // 中身がない列（全行「出荷なし」のキャリア状況・全行空の対応メモ）は出さない
  const Table: React.FC<{ rows: Row[]; showDays?: boolean }> = ({ rows, showDays = true }) => {
    if (rows.length === 0) return <p className="text-xs text-slate-500 px-4 py-3">該当なし</p>;
    const showCarrier = rows.some((r) => !['出荷なし', '出荷待ち', '追跡番号なし'].includes(r.carrier));
    const showMemo = rows.some((r) => !!r.memo);
    return (
      <div className="data-table-wrap overflow-x-auto" style={{ maxHeight: 'none' }}>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-slate-600 border-b border-slate-200">
              <th className="py-2 px-3">受注ID</th>
              <th className="py-2 px-3">クリニック・担当</th>
              <th className="py-2 px-3">仕入先</th>
              <th className="py-2 px-3">最長納品予定日</th>
              {showDays && <th className="py-2 px-3 text-right">超過</th>}
              {showCarrier && <th className="py-2 px-3">キャリアの最新状況</th>}
              {showMemo && <th className="py-2 px-3">対応メモ（楽楽販売）</th>}
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key} className="align-top hover:bg-slate-50 group">
                <td className="py-2.5 px-3">
                  {r.order ? (
                    <button type="button" onClick={() => onSelectOrder(r.order!)} className="font-mono font-bold text-blue-700 hover:underline">
                      {r.orderId}
                    </button>
                  ) : (
                    <span className="font-mono text-slate-500">{r.orderId || '受注なし'}</span>
                  )}
                  {r.shipmentId && <div className="font-mono text-[10px] text-slate-500">{r.shipmentId}</div>}
                  {r.alsoIn && <div className="text-[10px] font-bold text-rose-700">↑{r.alsoIn}にも</div>}
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-bold text-slate-900">{r.clinic}</div>
                  <div className="text-[11px] text-slate-500">{r.rep}</div>
                </td>
                <td className="py-2.5 px-3 text-sm font-semibold text-slate-800">{r.suppliers}</td>
                <td className="py-2.5 px-3 font-mono text-sm font-semibold text-slate-900">{r.latestDate ? formatDate(r.latestDate) : '—'}</td>
                {showDays && (
                  <td className={`py-2.5 px-3 text-right font-mono text-base font-extrabold ${r.daysOver > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {r.daysOver > 0 ? `${r.daysOver}日` : '—'}
                  </td>
                )}
                {showCarrier && (
                  <td className={`py-2.5 px-3 ${r.carrierAlert ? 'text-orange-700 font-bold' : 'text-slate-600'}`}>{r.carrier}</td>
                )}
                {showMemo && (
                  <td className="py-2.5 px-3 text-slate-800 whitespace-pre-wrap">{r.memo || <span className="text-slate-300">—</span>}</td>
                )}
                <td className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => openInRakuraku(r.shipmentId || r.orderId)}
                    className="rakuraku-open-btn"
                    title={`${r.shipmentId ? '出荷ID' : '受注ID'}をコピーして楽楽販売を開きます`}
                  >
                    <Copy className="w-3 h-3" />
                    {copied === (r.shipmentId || r.orderId) ? 'コピー済み' : '楽楽販売で開く'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">朝の納期会議</h2>
          <span className="text-xs text-slate-500">
            楽楽販売のデータ：{generatedAt ? new Date(generatedAt).toLocaleString('ja-JP') : '—'}（15分ごとに自動更新・右上の「再読み込み」ですぐ反映）
          </span>
        </div>
        <p className="text-xs text-slate-500">
          会議で決めた「誰が・いつまでに・何をする」は、楽楽販売の「対応メモ」に入力してください（このアプリからは書き込みません）。入力した内容は次の更新でこの画面に出ます。
        </p>
        {carrierLoaded && (
          <p className="text-sm text-slate-800">
            要対応（納期超過＋配送の問題。同じ伝票は1件）：<b className="font-mono text-lg text-rose-700">{attention.total}</b>件
            <span className="text-[11px] text-slate-500 ml-2">左のメニューの数字と同じです</span>
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={`#meeting-${sec.id}`} className="rounded-xl border border-slate-200 p-3 hover:bg-slate-50 block">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${toneClass[sec.tone]}`} />
                {sec.label}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-slate-900">{counts[sec.id] ?? '…'}</span>
                <span className="text-[10px] text-slate-500">件</span>
              </div>
              <Diff id={sec.id} />
            </a>
          ))}
        </div>
      </div>

      {SECTIONS.map((sec, i) => (
        <section key={sec.id} id={`meeting-${sec.id}`} className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${toneClass[sec.tone]}`}>{i + 1}</span>
            <h3 className="text-sm font-bold text-slate-900">{sec.label}</h3>
            <span className="text-sm font-bold font-mono text-slate-900">{counts[sec.id] ?? '…'}件</span>
            <Diff id={sec.id} />
            <span className="text-[11px] text-slate-500 w-full sm:w-auto sm:ml-2">{sec.rule}</span>
            {(sec.id === 'overdue' || sec.id === 'approaching') && (
              <a
                href={RAKURAKU_OVERDUE_LIST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[11px] font-bold text-blue-700 inline-flex items-center gap-1"
              >
                楽楽販売の一覧 <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {sec.id === 'missed' && <Table rows={sections.missed} />}
          {sec.id === 'stalled' &&
            (carrierLoaded ? <Table rows={sections.stalled} /> : <p className="text-xs text-slate-500 px-4 py-3">配送会社の状況を読み込み中…</p>)}
          {sec.id === 'labelOnly' &&
            (carrierLoaded ? <Table rows={sections.labelOnly} /> : <p className="text-xs text-slate-500 px-4 py-3">配送会社の状況を読み込み中…</p>)}
          {sec.id === 'overdue' && <Table rows={sections.overdue} />}
          {sec.id === 'approaching' && <Table rows={sections.approaching} showDays={false} />}
          {sec.id === 'untracked' && (
            <div className="px-4 py-3 text-xs text-slate-700 flex flex-wrap items-center gap-3">
              <span>
                「◆出荷ステータス」にあって、楽楽販売の出荷管理に追跡番号がない出荷：
                <b className="font-mono text-base">{sheetUnmatchedCount ?? '…'}</b>件
              </span>
              <button
                type="button"
                onClick={() => onNavigateToTab('unmatched_sheets')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
              >
                未照合の一覧を開く
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
