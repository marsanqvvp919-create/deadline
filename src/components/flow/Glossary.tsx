import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

// 画面で使う言葉の説明。呼び方は全画面でここに書いた1つにそろえる
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: '受注（伝票）', meaning: 'クリニックからの注文1件。楽楽販売の「ご注文管理」の1行。中に商品ごとの明細がある' },
  { term: '明細', meaning: '受注の中の商品1つ分（商品・数量・納期）' },
  { term: '出荷', meaning: '受注の中から実際に送る荷物1つ。楽楽販売の「出荷管理」の1行。1つの受注が何回かに分かれて出荷されることもある' },
  { term: 'クリニック', meaning: '注文してくださるお客様（院）。楽楽販売では「顧客」' },
  { term: '仕入先', meaning: '商品を仕入れる会社（メーカー・卸）。発注する相手' },
  { term: '発注', meaning: '仕入先に商品を注文すること。楽楽販売の「発注管理」に登録する' },
  { term: '入荷', meaning: '仕入先から送られた商品が、韓国・シンガポールなどの倉庫に届くこと' },
  { term: '引当', meaning: '倉庫にある在庫を、どの受注に使うか決めて確保すること' },
  { term: '出荷指示', meaning: '倉庫に「この受注をこの宛先へ送って」と依頼すること。インボイスと送り状（AWB）もここで作る' },
  { term: 'インボイス', meaning: '輸出の書類（品名・数量・金額の一覧）。荷物に添付する' },
  { term: '送り状（AWB）', meaning: 'DHL・FedEx の配送ラベル。追跡番号がつく' },
  { term: 'クール伝票', meaning: '通関後の国内配送で使う、佐川のクール便の伝票。冷蔵の商品だけ必要' },
  { term: '納期超過', meaning: '最長納品予定日を過ぎても、まだ出荷していない明細がある受注' },
  { term: '漏れ', meaning: '目安の日数を過ぎても、次の段に進んでいないもの（作業の忘れ）' },
  { term: '未照合', meaning: '出荷シートにはあるのに、楽楽販売の出荷と追跡番号で結びつかないもの' },
  { term: 'キャンセル', meaning: '楽楽販売でステータスを「キャンセル」にした受注・出荷。件数や金額には入れない' },
];

export function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="画面で使う言葉の意味">
        <BookOpen className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">言葉の説明</span>
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <span className="absolute right-0 z-40 mt-1 w-[min(420px,90vw)] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <span className="block text-xs font-bold text-slate-900 mb-2">言葉の説明</span>
            <dl className="space-y-2">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="text-xs">
                  <dt className="font-bold text-slate-800">{g.term}</dt>
                  <dd className="text-slate-600">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </span>
        </>
      )}
    </span>
  );
}
