import React, { useState } from 'react';
import { Truck, ExternalLink, Copy, Check, RefreshCw } from 'lucide-react';
import { detectCarrier } from '../utils/tracking';
import { CARRIER_STATUS_LABEL, CARRIER_STATUS_STYLE, CarrierStatus, fetchCarrierStatuses } from '../utils/carriers';

interface CarrierTrackingWidgetProps {
  trackingNo?: string;
  shippedDate?: string | null;
  courier?: string;
}

// 明細の追跡番号：配送会社・追跡ページへのリンク・配送会社APIからの最新状況
export const CarrierTrackingWidget: React.FC<CarrierTrackingWidgetProps> = ({ trackingNo, shippedDate, courier }) => {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CarrierStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const info = detectCarrier(trackingNo, courier);

  if (!trackingNo || !trackingNo.trim() || trackingNo === '—') {
    return <span className="text-[11px] text-slate-400">追跡番号 未登録</span>;
  }

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(trackingNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    setMessage(null);
    try {
      const json = await fetchCarrierStatuses([{ trackingNo, courier }]);
      const r = json.results[0] || null;
      setResult(r);
      if (!r) setMessage(Object.values(json.errors)[0] || 'この配送会社の状況は取得できません');
    } catch (err: any) {
      setMessage(`通信エラー: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-[11px] space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Truck className="w-3 h-3 text-slate-400" />
        <span className="font-bold text-slate-700">{info.carrier}</span>
        <span className="font-mono text-slate-800">{trackingNo}</span>
        <button type="button" onClick={copy} className="p-0.5 rounded hover:bg-slate-100" title="追跡番号をコピー">
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
        </button>
        {info.trackingUrl && (
          <a
            href={info.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-700 hover:underline flex items-center gap-0.5"
          >
            追跡ページ <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {(info.carrierCode === 'fedex' || info.carrierCode === 'dhl') && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-bold text-slate-700 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> 最新状況
          </button>
        )}
      </div>
      {shippedDate && <div className="text-slate-500">出荷日 {shippedDate}</div>}
      {result && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded font-bold ${CARRIER_STATUS_STYLE[result.status]}`}>
            {CARRIER_STATUS_LABEL[result.status]}
          </span>
          <span className="text-slate-600">{result.statusText}</span>
          {result.lastLocation && <span className="text-slate-500">／ {result.lastLocation}</span>}
        </div>
      )}
      {message && <div className="text-amber-700">{message}</div>}
    </div>
  );
};
