import { ClinicItem, Order, AlertItem } from '../types';

export const STORAGE_SALES_REPS_KEY = 'nouki_sales_reps_list';
export const STORAGE_CLINIC_REP_MAP_KEY = 'nouki_clinic_sales_rep_map';

// 初期営業担当者リスト（実営業担当）
export const DEFAULT_SALES_REPS: string[] = [
  '大谷',
  '高桑',
  '大津',
];

// 初期取引先（クリニック）への営業担当振り分けマップ（重複キー排除済み）
export const INITIAL_CLINIC_REP_MAP: Record<string, string> = {
  // 大谷さん担当
  '新宿TAクリニック': '大谷',
  'momo beauty clinic': '大谷',
  'アンリクリニック大阪院': '大谷',
  '大美会ID': '大谷',
  'DAILY SKIN CLINIC': '大谷',
  'Moon Beauty Clinic': '大谷',
  'BITO BEAUTY CLINIC': '大谷',
  '東京Houreisen スキンクリニック': '大谷',
  'Re:Birth Clinic Nagoya': '大谷',
  'TOGASHI CLINIC': '大谷',
  '一般社団法人プリズム美容医療協会': '大谷',
  'SUHADACLINIC きじま皮フ科クリニック宝塚南口Annex': '大谷',
  'クリニックビザリア': '大谷',
  'スノークリニック': '大谷',
  'ONE CLINIC 福知山院': '大谷',
  'LIFIX BEAUTY CLINIC': '大谷',
  '医療法人社団 廣瀬会': '大谷',
  'スノーメディカルクリニック': '大谷',
  'アイネクリニック': '大谷',
  'エルムクリニック': '大谷',
  'ライズワン美容皮膚科クリニック': '大谷',
  '金城町皮フ科・美容クリニック': '大谷',
  'ゆう皮フ科クリニック': '大谷',
  'しょうこ内科クリニック': '大谷',
  'M&B美容皮フ科クリニック': '大谷',
  '大西メディカルクリニック 加古川院': '大谷',
  'KIAクリニック': '大谷',
  '南青山セントラルクリニック': '大谷',
  'La Vie clinic': '大谷',
  'LA MER CLINIC': '大谷',
  'Shozu Beauty Clinic': '大谷',
  '心斎橋コムロ美容外科': '大谷',
  'Wing clinic 豊中駅前院': '大谷',
  'Mirrora CLINIC': '大谷',
  '小木曽クリニック': '大谷',
  'ジョリスキンクリニック 大阪院': '大谷',
  'BISIN GINZA CLINIC': '大谷',
  'メディカルエピレーションクリニック': '大谷',
  'KIMI CLINIC': '大谷',
  'CLINIQUE ESPOIR sanadayama': '大谷',
  'みかスキンクリニック': '大谷',
  'maroon beauty skin clinic': '大谷',
  'とううちクリニック': '大谷',
  'メディカルアルファクリニック': '大谷',
  'will clinic': '大谷',
  '銀座シェリージュクリニック': '大谷',
  'フジクリニック': '大谷',
  'M&Mクリニック': '大谷',
  '京都きれいクリニック': '大谷',
  '東京素肌クリニック': '大谷',
  'アトリエクリニック恵比寿': '大谷',
  'AZ BEAUTY CLINIC': '大谷',
  '銀座美容クリニック 岡崎院': '大谷',
  'APスキンクリニック': '大谷',
  'うえすぎクリニック': '大谷',
  '本山美容ケーズクリニック': '大谷',
  '名古屋美容外科': '大谷',
  'LEX BEAUTY CLINIC': '大谷',
  'イシダイ美容クリニック': '大谷',
  'ライフナビ脳と痛みと美容のクリニック': '大谷',
  'グランヴォ―テ(医療法人勇拓会 )': '大谷',
  'Floraエイジングケアクリニック': '大谷',
  '京都駅前美容外科': '大谷',
  'きぬがさクリニック 姫路院': '大谷',
  'ふみビューティークリニック': '大谷',
  'gishi clinic': '大谷',
  'いとうらんクリニック四条烏丸': '大谷',
  'LIKI CLINIC KOBE': '大谷',
  'NYAN CLINIC': '大谷',
  'ほかり皮ふ・形成外科クリニック': '大谷',
  '医療法人創美会 きぬがさクリニック難波院': '大谷',
  'エルムクリニック 京都院': '大谷',
  'ロレシー美容クリニック': '大谷',
  '表参道スキンクリニック 大阪院': '大谷',
  'LINK Beauty clinic': '大谷',
  'アデル美容クリニック': '大谷',
  'M BEAUTY CLINIC': '大谷',
  '医療法人社団慶愛会(ウィルビークリニック)': '大谷',
  'アンリクリニック 勝川院': '大谷',
  '表参道スキンクリニック 名古屋院': '大谷',
  'きんさんクリニック': '大谷',
  'ベルフローラ株式会社/アリエル美容クリニック 大宮院': '大谷',
  'ベルフローラ株式会社/アリエル美容クリニック 横浜院': '大谷',
  '美容皮膚科エルムクリニック熊本院': '大谷',
  'ますだ皮ふクリニック': '大谷',
  'W CLINIC': '大谷',
  'ベルフローラ株式会社/アリエル美容クリニック 郡山院': '大谷',
  'ベルフローラ株式会社/アリエル美容クリニック 水戸院': '大谷',
  'あきこクリニック': '大谷',
  '名古屋あおい歯科・矯正歯科': '大谷',
  '株式会社ドクチョク': '大谷',
  '医療法人四つ葉会': '大谷',
  'INO BEAUTY CLINIC': '大谷',
  '表参道スキンクリニック 表参道院': '大谷',
  'TUNE CLINIC': '大谷',
  'ユアーズオーラルクリニック': '大谷',
  "Re's Private Clinic": '大谷',
  'PEGASUS CLINIC': '大谷',
  'Aya Beauty & Family Clinic名古屋院': '大谷',
  '(株)ISHTAR(八尾総合クリニックス)': '大谷',
  'おおすぎハツノ内科クリニック': '大谷',
  '南森町ふくしま内科・循環器内科': '大谷',
  'いせき脳神経外科クリニック': '大谷',
  '医療法人吉川会': '大谷',
  'しまだ訪問診療クリニック': '大谷',
  'Aya Beauty & Family Clinic 大阪院': '大谷',
  'Jasmin Skin clinic': '大谷',
  'Leap beauty clinic': '大谷',
  '一般社団法人リバースエイジング研究会(ゆう美容クリニック)': '大谷',
  'よこえ内科循環器 美容形成外科クリニック': '大谷',
  'ヴァンヴェールクリニック': '大谷',
  'Sui clinic': '大谷',

  // 高桑さん担当
  '湘南美容ID': '高桑',
  'ゆきスキンクリニック東池袋': '高桑',
  'セブンクリニック': '高桑',
  '池袋美容クリニック': '高桑',
  'BIO Men’s clinic 心斎橋院': '高桑',
  'HAAB名古屋院': '高桑',
  '東京ベレッザクリニック': '高桑',
  '上野注入クリニック': '高桑',
  'シェリークリニック 渋谷院': '高桑',
  'Smart skin CLINIC': '高桑',
  'GRACIA CLINIC 銀座院': '高桑',
  'CZENクリニック 銀座院': '高桑',
  'Fellez clinic': '高桑',
  '美容皮膚科ティファクリニック新宿東口': '高桑',
  'olivia clinic': '高桑',
  'GRACIA CLINIC 福岡院': '高桑',
  '医療法人社団福進会 しおうスキンマリアージュクリニック': '高桑',
  'TCB東京中央美容外科 梅田大阪駅前院': '高桑',
  'しんゆり美容健康クリニック': '高桑',
  '医療法人緑風会': '高桑',
  'トータルスキンクリニック福岡': '高桑',
  'にしたんクリニック 新宿院': '高桑',
  'FACE SKIN CLINIC 池袋': '高桑',
  'クロエチョンダムクリニック': '高桑',
  'ROHE CLINIC GINZA': '高桑',
  'HINATA CLINIC': '高桑',
  '代官山ウィメンズクリニック': '高桑',
  'アイ＆スキンクリニック東京ソラマチ': '高桑',
  'RainBoW Clinic TOKYO': '高桑',
  '春山記念病院美容外科': '高桑',
  'NARU Beauty Clinic': '高桑',
  '一般社団法人THE STORIES CLINICS(東京銀座メディカルクリニック)': '高桑',
  'ECLAクリニック': '高桑',
  'WAVE CLINIC': '高桑',
  'ギャラリークリニック銀座': '高桑',
  'メンズクララクリニック': '高桑',
  'SHIROKANE COCO CLINIC': '高桑',
  '小さなクリニック': '高桑',
  'Kaleido Clinic': '高桑',
  'EOL CLINIC': '高桑',
  '医療法人幸和会 アメリクリニック 福岡': '高桑',
  'セナクリニック': '高桑',
  '日本橋HALスキンケア': '高桑',
  '藤沢ソーマクリニック': '高桑',
  '医療法人碧青会 ': '高桑',
  'ラジニアクリニック': '高桑',
  'ローレア天神クリニック': '高桑',
  'トータルスキンクリニック小倉院': '高桑',
  '東京中央クリニック': '高桑',
  'さっぽろ美容クリニック 本院': '高桑',
  '行徳形成外科': '高桑',
  '青山メディカルクリニック': '高桑',
  'RINGO CLINIC': '高桑',
  'Shea clinic sendai': '高桑',
  'WCLINIC 福岡院': '高桑',
  'Next Tokyo Clinic': '高桑',
  'シノワクリニック': '高桑',
  'NARU Beauty Clinic水戸院': '高桑',
  '池袋サンシャイン通り皮膚科': '高桑',
  'シェリークリニック新宿本院': '高桑',
  '一般社団法人　美蘭会': '高桑',
  'HAAB×DREAM BEAUTY CLINIC 東京本院': '高桑',
  'Tokyo beauty masterclinic(一般社団法人再生医療皮膚科研究会)': '高桑',
  'ソララクリニック': '高桑',
  '京仁会': '高桑',
  'HAAB CLINIC 池': '高桑',
  'ZetithBeautyClinic銀座院': '高桑',
  '渋谷DSクリニック': '高桑',
  'NaAクリニック': '高桑',
  'メディアージュクリニック 福岡院': '高桑',
  'Natural Skin Clinic 自由が丘院': '高桑',
  'ユイメディカルクリニック幕張医院': '高桑',
  'More&More Clinic': '高桑',
  'メディアージュクリニック大阪院(株式会社AVENIR)': '高桑',
  'CLINIC EMMA': '高桑',
  'ワンアップクリニック': '高桑',
  '4Dクリニック': '高桑',
  '肌管理クリニック': '高桑',
  '百人町アルファクリニック': '高桑',
  '東京imgクリニック': '高桑',
  '上野いびきクリニック': '高桑',
  '浅井形成外科': '高桑',
  'Purelys TOKYO CLINIC': '高桑',
  '東京シルククリニック': '高桑',
  '医療法人社団 育麗会 椿クリニックグループ': '高桑',
  'DripMedical 浜松町院': '高桑',
  'Lab.clinic札幌大通り': '高桑',
  '海老名皮膚科・美容皮膚科': '高桑',
  'エバーグリーンメディカルクリニック': '高桑',
  'A.R.Tクリニック新宿南口': '高桑',
  '藤ナチュレ美容クリニック 銀座院': '高桑',
  'KNOT CLINIC AOYAMA': '高桑',
  '中川さん': '高桑',
  'Leap beauty clinic（元大谷先）': '高桑',
  '東京秘密クリニック': '高桑',

  // 大津さん担当
  'こばやし内科小児科クリニック': '大津',
  '後藤医院': '大津',
  '岩倉きぼうクリニック': '大津',
  'Mirelle Clinic': '大津',
  'Whitening clinic Blanc Perle': '大津',
  'BIZENNクリニック': '大津',
  'AZABU TS Clinic': '大津',
  'みきなクリニック': '大津',
  '医療法人麗らか会 天満橋ゆみ皮膚科': '大津',
  'AMI SKIN CLINIC': '大津',
  'Lipo Clinic omotesando': '大津',
  '水道橋ひふ科クリニック': '大津',
  '工藤クリニック': '大津',
  'ルヴィクリニック イオンドーム前院': '大津',
  'コアクリニック': '大津',
  '福生皮膚科': '大津',
  'JClinic': '大津',
  'KAGA CLINIC': '大津',
  '名古屋みなみ歯科・矯正歯科': '大津',
  '一般社団法人 Drip Medical': '大津',
  'Attracrea Beauty Clinic Shinjuku': '大津',
  'ほしの整形外科クリニック': '大津',
  'まさつぐクリニック': '大津',
  "You's clinic Aoyama": '大津',
  'WITH BEAUTY CLINIC': '大津',
  'まこと皮ふ科': '大津',
  'LiLAスキンクリニック中目黒': '大津',
  'タカセ皮フ科': '大津',
  '株式会社 律緑会(かもがわクリニック)': '大津',
  'アサイクリニック': '大津',
  '医療法人社団桜永会': '大津',
  'TERU DENTAL CLINIC': '大津',
  'Iris beauty clinic': '大津',
  '新宿駅前うわじま皮膚科': '大津',
  'かめいクリニック': '大津',
  'さっぽろ美容クリニック 円山院': '大津',
  '銀座小町クリニック': '大津',
  'オーキッド美容クリニック': '大津',
  'サイトリ杉山美容クリニック': '大津',
  '81clinic': '大津',
  'SENSHIN CLINIC': '大津',
  '永青クリニック': '大津',
  '医療法人あさひ会': '大津',
  '一番町まつりかクリニック': '大津',
  'REVI CLINIC': '大津',
  '医療法人社団NEXUS': '大津',
  '北名古屋みらい歯科矯正歯科': '大津',
  'めぐ皮膚科美容皮膚科': '大津',
  'サクラギクリニック': '大津',
  'Licca Labo Clinic 神楽坂': '大津',
  'メリアビューティークリニック': '大津',
  'ジェイズクリニックイースト': '大津',
  'イアナクリニック': '大津',
  'THE LANA CLINIC大阪梅田': '大津',
  'RED MAPLE CLINIC': '大津',
  'Dewクリニック': '大津',
  '新発田ひらた内科クリニック': '大津',
  'ワンストップヘアクリニック': '大津',
  'GOGO歯科クリニック': '大津',
  'アサミ美容外科': '大津',
  '西28丁目駅前腎泌尿器科': '大津',
  '大阪小田クリニック': '大津',
  '銀座YRクリニック': '大津',
  'あだかえたけだクリニック': '大津',
  '二子玉川ファミリー皮ふ科': '大津',
  '神戸垂水メディカルクリニック': '大津',
  'まえだ皮ふ科・形成外科': '大津',
  '中野新井薬師参道クリニック': '大津',
  'おきなわ美容クリニック': '大津',
  '川崎クリニック': '大津',
  '井上クリニック': '大津',
  '渋谷内科スキンケアクリニック': '大津',
  '広島本通り美容クリニック': '大津',
  '渋谷メゾンクリニック': '大津',
  'クレオビューティークリニック': '大津',
  '京橋いしづち眼科': '大津',
  'だんらび歯科梅田院': '大津',
  'Blu Clinic 大阪院': '大津',
  'E&N BEAUTY CLINIC': '大津',
  'たしま皮フ科形成外科': '大津',
  'マリン&サンズ元町マリン眼科': '大津',
  '駒沢自由通り皮膚科': '大津',
  '森川内科クリニック': '大津',
  'アマソラクリニック 渋谷院': '大津',
  '岡崎エルエル歯科・矯正歯科': '大津',
  '医療法人社団金井記念会自由通り皮ふ科': '大津',
  '西神Nクリニック形成外科・美容皮膚科': '大津',
  'おっとも脳神経クリニック': '大津',
  'JUNCLINIC': '大津',
  '錦美容クリニック': '大津',
  'さくらアイクリニック': '大津',
  'リラクラ形成美容外科': '大津',
  '七光台歯科クリニック': '大津',
  'ナチュラルクリニック': '大津',
  'The Beauty Clinic': '大津',
  '医療法人社団登愛会スラージュ内科クリニック': '大津',
  '佐々木医院': '大津',
  'Campanella Dental Clinic': '大津',
  '心斎橋KT美容クリニック': '大津',
  '細谷たかさきクリニック': '大津',
  '医療法人社団真美会 宮崎台スキンクリニック': '大津',
  '神戸ゆりクリニック': '大津',
  'ブレストクリニック堂島': '大津',
  '二子玉川LOUIS CLINIC': '大津',
  '医療法人愛和会 金沢クリニック美容内科': '大津',
  '医療法人インテグレス': '大津',
  'AKuA Dental Clinic': '大津',
  '重盛ファミリー歯科': '大津',
  'サクラアズクリニック 大阪院': '大津',
  '医療法人 誠信会 三和クリニック': '大津',
  '東和会クリニック': '大津',
  '六甲道あさみお肌のクリニック': '大津',
  'ゆう美容クリニック': '大津',
  'ダイヤモンド今井デンタルクリニック': '大津',
  '西梅田静脈瘤・痛みのクリニック': '大津',
  '大阪南森町皮ふ科クリニック': '大津',
  'ノリス美容クリニック': '大津',
  '一般社団法人ユウケイパートナーズ 湘南美容外科クリニック 大阪四ツ橋院': '大津',
  'ケイセルクリニック': '大津',
  'プライベートスキンクリニック': '大津',
  '平野きりん歯科': '大津',
  '西田辺かねむら歯科クリニック': '大津',
  'AMIRI CLINIC': '大津',
  'ライトクリニック': '大津',
  'たにまちクリニック': '大津',
  'Kobe OCEANS Clinic': '大津',
  'ゆみこ皮ふ科クリニック': '大津',
  '木田ビューティークリニック': '大津',
  'ハナビューティークリニック': '大津',
  '医療法人社団 育麗会 椿クリニック': '大津',
  '芦屋美容クリニック(医療法人社団ABC)': '大津',
  'LIAN clinic': '大津',
  '上本町皮フ科クリニック': '大津',
  'MINIMUM SKIN CLINIC 銀座院': '大津',
  'まつなかクリニック': '大津',
  'やまの歯科医院': '大津',
  'まるぐちスキンクリニック': '大津',
  'CLINIC No7': '大津',
  'じむら皮膚科クリニック': '大津',
  'のざわ歯科クリニック': '大津',
  '東中野皮ふ科クリニック': '大津',
  'PHILO CLINIC': '大津',
  '山﨑冴羅': '大津',
  'エスクリニック恵比寿': '大津',
  '白いあさがおスキンケアクリニック': '大津',
  'JIN CLINIC': '大津',
  '神道レディースクリニック': '大津',
  'LIF SKIN CLINIC': '大津',
  '赤坂矯正歯科': '大津',
  'CHRISTINA CLINIC GINZA': '大津',
  'きけがわ歯科医院': '大津',
  'ASTRA BEAUTY CLINIC': '大津',
  '並木Sクリニック': '大津',
  'PRIDE CLINIC': '大津',
  '茜道頓堀クリニック': '大津',
  '広島美容外科メイプルクリニック': '大津',
  'EIMY CLINIC': '大津',
  '山名眼科医院': '大津',
  '安城さくらい歯科・矯正歯科': '大津',
  '市が尾皮ふ科形成外科': '大津',
  '赤羽ここちクリニック': '大津',
  '一般社団法人エクシード': '大津',
  '大須観音南歯科': '大津',
  '新宿セントラル外来': '大津',
  'まりもクリニック': '大津',
  'BWC和心クリニック': '大津',
  'カメリア美容皮膚科': '大津',
  '自由ヶ丘ファミリー皮ふ科': '大津',
  '青山ハリークリニック': '大津',
  '大手町皮膚科': '大津',
  '医療法人花房': '大津',
  'まごめファミリー歯科': '大津',
  '沖縄スキンケアクリニック(医療法人清医会)': '大津',
  '目白ホワイトクリニック': '大津',
  '白金台デンタルクリニック': '大津',
  'CLEAN BEAUTY CLINIC': '大津',
  'しろがねのりこ皮膚科': '大津',
  '医療法人ハートフル会 ますだ歯科医院': '大津',
  '柳内歯科医院(やすらぎ歯科医院)': '大津',
  'リタ・デンタルクリニック': '大津',
  'よつ葉歯科クリニック': '大津',
  'MK歯科医院': '大津',
  'sara歯科クリニック': '大津',
  'ケリークリニック': '大津',
  '田中歯科医院': '大津',
  'SBC三浦先生': '大津',
  'Family Total Healthcare Clinic AZABU': '大津',
  'MiSA Clinic六本木本院': '大津',
  'Ginza78Clinic': '大津',
  '札幌太平デンタルオフィス': '大津',
  'BF銀座歯科・矯正歯科': '大津',
  'SIGNATURE CLINIC 銀座': '大津',
  '北綾瀬皮膚科': '大津',
  'ARK SKIN CLINIC': '大津',
  'ひめのともみクリニック': '大津',
  '医療法人さつび会(沖縄美容クリニック)': '大津',
  'ながしまクリニック 熊本院': '大津',
  '札幌ルトロワビューティーvogue': '大津',
  '四谷ウェルネスクリニック': '大津',
  'タイムルクリニック': '大津',
  'ラセレーネクリニック': '大津',
  'ニューエイジクリニック': '大津',
  'MODENA CLINIC': '大津',
  'ナカデンビルクリニック': '大津',
  'Xenia clinic(セニアメディカル株式会社)': '大津',
  '池袋ながとも耳鼻咽喉科': '大津',
  '柏の葉スキンクリニック': '大津',
  '老松クリニック': '大津',
  '北府中クリニック': '大津',
  '麗ビューティー皮フ科クリニック': '大津',
  'あらおクリニック': '大津',
  'MedicalmakeClinic銀座院 for Men': '大津',
  '医療法人社団ミサズメディカル': '大津',
  '医療法人幸和会': '大津',
  'かつきアクティブメンズクリニック': '大津',
  'あおぞら会ルナージュクリニック': '大津',
  '医療法人社団アナザーメディカル': '大津',
  '医療法人社団TEM': '大津',
  'AVANTOKYO銀座脂肪吸引クリニック': '大津',
  '医療法人社団正恵会 ディオクリニック 新宿院': '大津',
  '日比谷セントラルクリニック': '大津',
};

// 営業担当者別のバッジカラーパレット（視覚的識別用）
export const SALES_REP_PALETTES: Record<string, { bg: string; text: string; border: string; dot: string; lightBg: string }> = {
  '大谷': {
    bg: 'bg-blue-600',
    text: 'text-blue-700',
    border: 'border-blue-300',
    dot: 'bg-blue-500',
    lightBg: 'bg-blue-50',
  },
  '高桑': {
    bg: 'bg-emerald-600',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
    lightBg: 'bg-emerald-50',
  },
  '大津': {
    bg: 'bg-purple-600',
    text: 'text-purple-700',
    border: 'border-purple-300',
    dot: 'bg-purple-500',
    lightBg: 'bg-purple-50',
  },
  '未割当': {
    bg: 'bg-rose-600',
    text: 'text-rose-700',
    border: 'border-rose-300',
    dot: 'bg-rose-500',
    lightBg: 'bg-rose-50',
  },
};

export function getSalesRepColor(repName?: string | null) {
  if (!repName || repName === '未割当' || repName === '未設定') {
    return SALES_REP_PALETTES['未割当'];
  }
  if (SALES_REP_PALETTES[repName]) {
    return SALES_REP_PALETTES[repName];
  }
  const colors = [
    { bg: 'bg-indigo-600', text: 'text-indigo-700', border: 'border-indigo-300', dot: 'bg-indigo-500', lightBg: 'bg-indigo-50' },
    { bg: 'bg-cyan-600', text: 'text-cyan-700', border: 'border-cyan-300', dot: 'bg-cyan-500', lightBg: 'bg-cyan-50' },
    { bg: 'bg-fuchsia-600', text: 'text-fuchsia-700', border: 'border-fuchsia-300', dot: 'bg-fuchsia-500', lightBg: 'bg-fuchsia-50' },
    { bg: 'bg-orange-600', text: 'text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500', lightBg: 'bg-orange-50' },
  ];
  let sum = 0;
  for (let i = 0; i < repName.length; i++) sum += repName.charCodeAt(i);
  return colors[sum % colors.length];
}

/**
 * 登録されている営業担当者リストを取得
 */
export function getSalesRepsList(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SALES_REPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_SALES_REPS];
}

/**
 * 営業担当者リストを保存
 */
export function saveSalesRepsList(reps: string[]): void {
  try {
    const clean = Array.from(new Set(reps.map(r => r.trim()).filter(Boolean)));
    localStorage.setItem(STORAGE_SALES_REPS_KEY, JSON.stringify(clean));
  } catch {}
}

/**
 * 営業担当者を新規追加
 */
export function addSalesRep(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const current = getSalesRepsList();
  if (current.includes(trimmed)) return false;
  current.push(trimmed);
  saveSalesRepsList(current);
  return true;
}

/**
 * 営業担当者を削除（関連付けられたクリニックは未割当になる）
 */
export function removeSalesRep(name: string): void {
  const current = getSalesRepsList().filter(r => r !== name);
  saveSalesRepsList(current);
  
  const map = getClinicSalesRepMap();
  let changed = false;
  for (const [clinic, rep] of Object.entries(map)) {
    if (rep === name) {
      map[clinic] = '未割当';
      changed = true;
    }
  }
  if (changed) {
    saveClinicSalesRepMap(map);
  }
}

/**
 * 取引先（クリニック）と営業担当者のマッピングを取得
 */
export function getClinicSalesRepMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_CLINIC_REP_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...INITIAL_CLINIC_REP_MAP, ...parsed };
      }
    }
  } catch {}
  return { ...INITIAL_CLINIC_REP_MAP };
}

/**
 * マッピングの保存
 */
export function saveClinicSalesRepMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_CLINIC_REP_MAP_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * 単一クリニックの営業担当者を振り分け
 */
export function assignClinicSalesRep(clinicNameOrId: string, salesRep: string): void {
  const map = getClinicSalesRepMap();
  map[clinicNameOrId] = salesRep;
  saveClinicSalesRepMap(map);
}

/**
 * 複数クリニックの営業担当者を一括振り分け
 */
export function batchAssignClinicSalesRep(clinicNamesOrIds: string[], salesRep: string): void {
  const map = getClinicSalesRepMap();
  clinicNamesOrIds.forEach(id => {
    map[id] = salesRep;
  });
  saveClinicSalesRepMap(map);
}

/**
 * クリニック名またはIDから実営業担当者を解決
 */
export function resolveSalesRepForClinic(clinicName: string, clinicId?: string, fallback?: string): string {
  const map = getClinicSalesRepMap();
  if (clinicName && map[clinicName]) return map[clinicName];
  if (clinicId && map[clinicId]) return map[clinicId];
  return fallback || '未割当';
}

/**
 * クリニックマスタに実営業担当者および楽楽販売上の処理担当者をエンリッチ付与
 */
export function enrichClinicsWithSalesReps(clinics: ClinicItem[]): ClinicItem[] {
  const map = getClinicSalesRepMap();

  return clinics.map(c => {
    const clerk = c.clerkName || c.salesRep || '処理担当';
    const actualRep = map[c.clinicName] || map[c.clinicId] || '未割当';

    return {
      ...c,
      salesRep: actualRep,
      clerkName: clerk,
    };
  });
}

/**
 * 伝票データ（Orders）に顧客別実営業担当者および処理担当者をエンリッチ付与
 */
export function enrichOrdersWithSalesReps(orders: Order[]): Order[] {
  const map = getClinicSalesRepMap();

  return orders.map(o => {
    const clerk = o.clerkName || o.salesRep || '処理担当';
    const actualRep = (o.customerName && map[o.customerName]) ? map[o.customerName] : (o.salesRep || '未割当');

    return {
      ...o,
      salesRep: actualRep,
      clerkName: clerk,
    };
  });
}

/**
 * アラートデータに実営業担当者をエンリッチ付与
 */
export function enrichAlertsWithSalesReps(alerts: AlertItem[], orders: Order[]): AlertItem[] {
  const orderMap = new Map<string, Order>();
  orders.forEach(o => orderMap.set(o.orderId, o));

  return alerts.map(a => {
    const parentOrder = orderMap.get(a.orderId);
    const rep = parentOrder?.salesRep || a.salesRep || '未割当';
    const clerk = parentOrder?.clerkName || a.clerkName || a.salesRep || '処理担当';

    return {
      ...a,
      salesRep: rep,
      clerkName: clerk,
    };
  });
}
