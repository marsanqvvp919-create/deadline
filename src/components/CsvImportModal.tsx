import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { ProductItem, ClinicItem } from '../types';
import { isShippingOrFee } from '../utils';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'products' | 'clinics';
  onImportProducts?: (products: ProductItem[]) => void;
  onImportClinics?: (clinics: ClinicItem[]) => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  type,
  onImportProducts,
  onImportClinics,
}) => {
  const [csvContent, setCsvContent] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isProduct = type === 'products';
  const title = isProduct
    ? '商品マスタ（101252）CSVインポート'
    : 'クリニックマスタ（101250）CSVインポート';

  // 簡易パーサー
  const handleParse = (text: string) => {
    setCsvContent(text);
    setParseError(null);
    if (!text.trim()) {
      setParsedRows([]);
      return;
    }

    try {
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        setParseError('ヘッダー行と1行以上のデータ行が必要です。');
        setParsedRows([]);
        return;
      }

      const headers = lines[0].split(',').map(h => h.replace(/^["'\s]+|["'\s]+$/g, ''));
      const rows: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^["'\s]+|["'\s]+$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = cols[idx] || '';
        });
        rows.push(obj);
      }

      setParsedRows(rows);
    } catch (err: any) {
      setParseError('CSV解析中にエラーが発生しました: ' + err.message);
      setParsedRows([]);
    }
  };

  const handleApply = () => {
    if (parsedRows.length === 0) return;

    if (isProduct && onImportProducts) {
      const products: ProductItem[] = parsedRows
        .filter((r, idx) => {
          const id = r['商品ID'] || r['109958'] || r['productId'] || `PRD-${idx + 1}`;
          const name = r['商品名'] || r['109992'] || r['109959'] || `商品-${id}`;
          return !isShippingOrFee(name, id);
        })
        .map((r, idx) => {
        const id = r['商品ID'] || r['109958'] || r['productId'] || `PRD-${idx + 1}`;
        const name = r['商品名'] || r['109992'] || r['109959'] || `商品-${id}`;
        return {
          productId: id,
          productName: name,
          category: r['カテゴリ'] || r['109960'] || '一般医療品',
          spec: r['規格'] || r['109961'] || '通常規格',
          standardPrice: parseInt(r['標準販売単価'] || r['110002'] || '0', 10) || 0,
          minPrice: parseInt(r['下限販売単価'] || r['109994'] || '0', 10) || 0,
          maxPrice: parseInt(r['上限販売単価'] || r['109995'] || '0', 10) || 0,
          costPrice: parseInt(r['仕入単価'] || r['110007'] || '0', 10) || 0,
          costCurrency: r['通貨'] || r['110124'] || 'JPY',
          supplierId: r['仕入先ID'] || r['110005'] || '',
          supplierName: r['仕入先名'] || r['110006'] || '未設定',
          countryOfOrigin: r['製造国'] || r['110169'] || '日本',
          minLeadTime: parseInt(r['下限納期'] || r['110012'] || '2', 10) || 2,
          maxLeadTime: parseInt(r['上限納期'] || r['110013'] || '5', 10) || 5,
          status: '取扱中',
          rakurakuSchemaId: '101252',
          source: 'rakuraku_csv',
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          memo: r['備考'] || '楽楽販売CSVよりインポート',
        };
      });
      onImportProducts(products);
      onClose();
    } else if (!isProduct && onImportClinics) {
      const clinics: ClinicItem[] = parsedRows.map((r, idx) => {
        const id = r['クリニックID'] || r['109898'] || r['clinicId'] || `CLN-${idx + 1}`;
        const name = r['クリニック名'] || r['110108'] || `医院-${id}`;
        return {
          clinicId: id,
          clinicName: name,
          directorName: r['院長名'] || '院長',
          salesRep: r['担当営業'] || r['109978'] || '未設定',
          currency: r['販売通貨'] || r['110167'] || 'JPY',
          commissionRate: parseFloat(r['紹介手数料率'] || r['110109'] || '0') || 0,
          phone: r['電話番号'] || '',
          email: r['メールアドレス'] || '',
          postalCode: r['郵便番号'] || '',
          prefecture: r['都道府県'] || '東京都',
          address: r['住所'] || '',
          status: '取引中',
          paymentTerms: r['支払条件'] || '月末締め翌月末払い',
          rakurakuSchemaId: '101250',
          source: 'rakuraku_csv',
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          memo: r['備考'] || '楽楽販売CSVよりインポート',
        };
      });
      onImportClinics(clinics);
      onClose();
    }
  };

  const loadTemplate = () => {
    if (isProduct) {
      const sample = `商品ID,商品名,カテゴリ,規格,標準販売単価,仕入単価,仕入先名,製造国,下限納期,上限納期,備考\nPRD-101,リフトアップ医療糸 4Dコグ (20本入),医療材料,滅菌包装,38000,21000,アドバンスドメディカル,韓国,3,7,楽楽販売より手動連携\nPRD-102,美肌GF導入カクテル 5ml×5本,美容製剤,5mlバイアル,24000,13500,バイオファーマジャパン,日本,2,5,人気アイテム`;
      handleParse(sample);
    } else {
      const sample = `クリニックID,クリニック名,院長名,担当営業,販売通貨,紹介手数料率,電話番号,都道府県,住所,支払条件,備考\nCLN-2001,青山ビューティークリニック,青山 聡 院長,高橋 健太,JPY,5.0,03-5411-9988,東京都,港区南青山5-1-2,月末締め翌月末払い,新規開拓先\nCLN-2002,京都四条スキンケア医院,森田 雅子 院長,佐藤 美咲,JPY,4.0,075-221-3344,京都府,京都市下京区四条通烏丸,月末締め翌月末払い,定期便希望`;
      handleParse(sample);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500">
                楽楽販売からダウンロードしたCSVテキストを貼り付けて一括反映できます
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
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              CSVテキスト入力（またはテンプレート挿入）
            </label>
            <button
              onClick={loadTemplate}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
            >
              サンプルCSVを読み込む
            </button>
          </div>

          <textarea
            value={csvContent}
            onChange={(e) => handleParse(e.target.value)}
            placeholder={`楽楽販売のエクスポートCSVをここに貼り付けます...\n例: ${
              isProduct
                ? '商品ID,商品名,カテゴリ,規格,標準販売単価,仕入単価,仕入先名...'
                : 'クリニックID,クリニック名,院長名,担当営業,電話番号...'
            }`}
            rows={6}
            className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
          />

          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  解析プレビュー: {parsedRows.length} 件のレコードを検出
                </span>
                <span className="text-[11px] text-slate-500">
                  ※ 反映するとローカルキャッシュが更新されます
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">{isProduct ? '商品ID' : 'クリニックID'}</th>
                      <th className="p-2">{isProduct ? '商品名' : 'クリニック名'}</th>
                      <th className="p-2">{isProduct ? '販売単価' : '担当営業'}</th>
                      <th className="p-2">{isProduct ? '仕入先' : '所在地'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {parsedRows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-2 font-mono font-bold text-blue-700">
                          {isProduct ? (r['商品ID'] || r['109958'] || r['productId']) : (r['クリニックID'] || r['109898'] || r['clinicId'])}
                        </td>
                        <td className="p-2 font-medium">
                          {isProduct ? (r['商品名'] || r['109992']) : (r['クリニック名'] || r['110108'])}
                        </td>
                        <td className="p-2">
                          {isProduct ? `${parseInt(r['標準販売単価'] || r['110002'] || '0').toLocaleString()}円` : (r['担当営業'] || r['109978'])}
                        </td>
                        <td className="p-2 text-slate-500">
                          {isProduct ? (r['仕入先名'] || r['110006']) : (r['都道府県'] || r['住所'])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            楽楽販売の項目ID（109958, 109898等）ヘッダーにも対応
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleApply}
              disabled={parsedRows.length === 0}
              className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition flex items-center gap-1.5 ${
                parsedRows.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-xs cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>マスタに反映 ({parsedRows.length}件)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
