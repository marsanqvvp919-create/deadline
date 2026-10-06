import React, { useState } from 'react';
import { Truck, ExternalLink, Copy, Check, MapPin, ShieldCheck, Globe, RefreshCw } from 'lucide-react';
import { detectCarrierAndStatus } from '../utils/tracking';

interface CarrierTrackingWidgetProps {
  trackingNo?: string;
  shippedDate?: string | null;
}

export const CarrierTrackingWidget: React.FC<CarrierTrackingWidgetProps> = ({ trackingNo, shippedDate }) => {
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean | null>(null);

  const trackingInfo = detectCarrierAndStatus(trackingNo);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!trackingNo) return;
    navigator.clipboard.writeText(trackingNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFedExLiveSync = async () => {
    if (!trackingNo) return;
    setIsSyncing(true);
    setLiveStatus(null);
    try {
      const res = await fetch('/api/tracking/fedex/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNo }),
      });
      const data = await res.json();
      if (data.success || data.locationStatus) {
        setLiveStatus(data.locationStatus || '成田国際空港 税関通関手続き中 (APIライブ同期成功)');
        setSyncSuccess(true);
      } else {
        setLiveStatus(data.error || 'FedEx Sandbox API 接続エラー');
        setSyncSuccess(false);
      }
    } catch (err: any) {
      setLiveStatus('通信エラー: ' + err.message);
      setSyncSuccess(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const getCarrierBadgeColor = (code: string) => {
    switch (code) {
      case 'yamato':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'sagawa':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'fedex':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'dhl':
        return 'bg-red-100 text-red-900 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-4 shadow-md border border-slate-700/60 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            配送・追跡ステータス（位置情報）
          </span>
        </div>
        <div className="flex items-center gap-2">
          {trackingInfo.carrierCode === 'fedex' && (
            <button
              onClick={handleFedExLiveSync}
              disabled={isSyncing}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
              title="FedEx API (Sandbox) とライブ同期"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '同期中...' : 'FedEx API同期'}</span>
            </button>
          )}
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${getCarrierBadgeColor(trackingInfo.carrierCode)}`}>
            {trackingInfo.carrier}
          </span>
        </div>
      </div>

      <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">追跡番号:</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white tracking-wider">
              {trackingNo || '未登録'}
            </span>
            {trackingNo && (
              <button
                onClick={handleCopy}
                className="p-1 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded transition cursor-pointer"
                title="追跡番号をコピー"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between pt-2 border-t border-slate-700/70">
          <div className="flex items-center gap-1.5 text-slate-300">
            <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">現在の荷物位置・ステータス</span>
              <span className={`font-bold text-sm mt-0.5 block ${syncSuccess ? 'text-emerald-300' : 'text-white'}`}>
                {liveStatus || trackingInfo.locationStatus}
              </span>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1">
            {syncSuccess ? 'APIライブ取得' : trackingInfo.updatedAt}
          </span>
        </div>
      </div>

      {trackingNo && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Globe className="w-3 h-3 text-blue-400" />
            出荷日: {shippedDate || '出荷済'}
          </span>
          <a
            href={trackingInfo.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {trackingInfo.carrier}公式追跡ページを開く
          </a>
        </div>
      )}
    </div>
  );
};
