import React from 'react';
import { RAKURAKU_SCHEMAS } from '../data/masterSeed';
import { X, Database, Link2, Key, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';

interface RakurakuSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSchemaId?: string;
}

export const RakurakuSchemaModal: React.FC<RakurakuSchemaModalProps> = ({
  isOpen,
  onClose,
  activeSchemaId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  楽楽販売 レコード参照API データベース整理表
                </h3>
                <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                  DBグループ: Number1
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                閲覧画面: すべて（viewId: 0） / 7つのデータベースとキー項目・明細項目の定義
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Summary Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-blue-950">
                本アプリは楽楽販売の「Number1」グループ全データベースとスキーマ互換設計されています
              </p>
              <p className="text-blue-800 text-[11px] leading-relaxed">
                特に「ご注文管理（101248）」の明細行と「商品マスタ（101252）」の商品ID（109958）、「顧客マスタ（101250）」のクリニックID（109898）がDBリンクによって自動同期され、リアルタイムに在庫・納品状況が連動します。
              </p>
            </div>
          </div>

          {/* Database Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-3">データベース名</th>
                  <th className="py-2.5 px-3">dbSchemaId</th>
                  <th className="py-2.5 px-3">キー項目</th>
                  <th className="py-2.5 px-3 text-right">項目数</th>
                  <th className="py-2.5 px-3 text-right">明細項目</th>
                  <th className="py-2.5 px-3 text-right">合計項目</th>
                  <th className="py-2.5 px-3">概要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700 font-medium">
                {RAKURAKU_SCHEMAS.map((schema) => {
                  const isCurrent = activeSchemaId === schema.dbSchemaId;
                  return (
                    <tr
                      key={schema.no}
                      className={`hover:bg-slate-50 transition ${
                        isCurrent ? 'bg-blue-50/70 font-semibold' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center text-slate-500 font-mono">
                        {schema.no}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{schema.dbName}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">
                              閲覧中
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-bold">
                        {schema.dbSchemaId}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 text-slate-800">
                          <Key className="w-3.5 h-3.5 text-amber-500" />
                          <span>{schema.keyItemName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({schema.keyItemId})</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {schema.itemsCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {schema.detailsCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {schema.totalCount}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500 leading-tight max-w-xs">
                        {schema.description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detailed DB Linking Architecture */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              <span>データベース間リンク相関関係（楽楽販売 DBリンク項目）</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                <span className="text-[11px] font-bold text-blue-700">ご注文管理 (101248) 側のリンク</span>
                <ul className="space-y-1 text-slate-600 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-mono text-slate-800">109979</span>: クリニックID ➔ <b>顧客マスタ (101250)</b>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-mono text-slate-800">109991</span>: 商品ID (明細) ➔ <b>商品マスタ (101252)</b>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-mono text-slate-800">110005</span>: 仕入先ID (明細) ➔ <b>仕入先マスタ</b>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                <span className="text-[11px] font-bold text-emerald-700">商品マスタ (101252) 側のリンク</span>
                <ul className="space-y-1 text-slate-600 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-slate-800">110169</span>: 製造国ID ➔ <b>製造国マスタ (101269)</b>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-slate-800">110005</span>: 仕入先ID ➔ <b>仕入先マスタ</b>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-slate-800">109958</span>: 商品ID (キー項目)
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
};
