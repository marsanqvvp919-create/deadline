// 商品マスタ（楽楽販売）でカテゴリが空の商品の、このシステムだけで使うジャンル（2026/11/04 製剤名とWebで調べて分類）。
// 楽楽販売には書き込まない。商品マスタにカテゴリが入っていればそちらを優先する。分からなかった商品はここに無い（未分類のまま）。
export const PRODUCT_GENRES: Record<string, string> = {
  // ボツリヌストキシン製剤
  '000000473': 'ボツリヌストキシン製剤', // Hutox 200u
  '000000475': 'ボツリヌストキシン製剤', // XEOMIN 100u
  '000000525': 'ボツリヌストキシン製剤', // T TOX
  '000000593': 'ボツリヌストキシン製剤', // Liztox 200u AND美容価格
  '000000613': 'ボツリヌストキシン製剤', // Botuliz100u
  '000000617': 'ボツリヌストキシン製剤', // Bienox 200U
  '000000686': 'ボツリヌストキシン製剤', // NEWLUX 100u
  '000000701': 'ボツリヌストキシン製剤', // Bienox100u
  '000000763': 'ボツリヌストキシン製剤', // Bienox 100u(期限短いやつ)
  '000000764': 'ボツリヌストキシン製剤', // Hitox 200u(期限短いやつ)
  '000000816': 'ボツリヌストキシン製剤', // Realtox
  '000000850': 'ボツリヌストキシン製剤', // Meditoxin100u
  '000000876': 'ボツリヌストキシン製剤', // Bienox 200u(AND様価格)
  '000000900': 'ボツリヌストキシン製剤', // WELLSTOX
  '000000979': 'ボツリヌストキシン製剤', // One Tox 200u
  '000000980': 'ボツリヌストキシン製剤', // Wellstox200u
  '000000988': 'ボツリヌストキシン製剤', // Wellstox200u(サンプル)

  // ヒアルロン酸
  '000000222': 'ヒアルロン酸', // Fineha volume 10
  '000000266': 'ヒアルロン酸', // Neuramis Lidocaine
  '000000307': 'ヒアルロン酸', // Elravie Re20
  '000000472': 'ヒアルロン酸', // Elravie Re2o
  '000000767': 'ヒアルロン酸', // Re2O Fine
  '000000476': 'ヒアルロン酸', // VOLUDERM 20 BODY SHOT(Lido)
  '000000694': 'ヒアルロン酸', // Bellast Ultra soft L
  '000000743': 'ヒアルロン酸', // Belotero Balance Lidocaine
  '000000745': 'ヒアルロン酸', // Belotero Soft Lidocaine
  '000000748': 'ヒアルロン酸', // Belotero Volume Lidocaine
  '000000768': 'ヒアルロン酸', // The Chaeum premium No.2(期限短いやつ)
  '000000794': 'ヒアルロン酸', // MaiLi Define
  '000000798': 'ヒアルロン酸', // MaiLi Precise Lidocaine
  '000000799': 'ヒアルロン酸', // MaiLi Define Lidocaine
  '000000870': 'ヒアルロン酸', // Teosyal RHA1

  // ヒアルロン酸溶解
  '000000231': 'ヒアルロン酸溶解', // Hirax 1500IU
  '000000867': 'ヒアルロン酸溶解', // HIRAX 1500IU

  // スキンブースター
  '000000393': 'スキンブースター', // PROFHILO HL
  '000000397': 'スキンブースター', // JALUPRO CLASSIC
  '000000398': 'スキンブースター', // JALUPRO Youngeye
  '000000570': 'スキンブースター', // JALUPRO YOUNGEYE
  '000000508': 'スキンブースター', // JALU PRO HMW サンプル
  '000000493': 'スキンブースター', // REJUBEAU Eyedeal
  '000000494': 'スキンブースター', // PLURYAL Hair Density
  '000000901': 'スキンブースター', // Pluryal Mesoline Refresh
  '000000495': 'スキンブースター', // SUNEKOS 1200
  '000000509': 'スキンブースター', // BELOTERO REVIVE
  '000000512': 'スキンブースター', // LEMON BOTTLE SKIN BOOSTER
  '000000552': 'スキンブースター', // NEAUVIA HYDRO DELUXE
  '000000595': 'スキンブースター', // フィロルガ NCTF135HA
  '000000640': 'スキンブースター', // NCTF135HA
  '000000783': 'スキンブースター', // Rejuran Skin Booster(旧型)
  '000000499': 'スキンブースター', // エクソソーム(臍帯由来・フリーズドライ)
  '000000504': 'スキンブースター', // エクソソーム(MIX由来・フリーズドライ)
  '000000639': 'スキンブースター', // 3MIX-EXOSOME(臍帯) フリーズドライ

  // PDLLA/PLLA
  '000000244': 'PDLLA/PLLA', // Juvelook
  '000000353': 'PDLLA/PLLA', // JUVELOOK i
  '000000553': 'PDLLA/PLLA', // Juvelook i
  '000000670': 'PDLLA/PLLA', // PinkLLA
  '000000738': 'PDLLA/PLLA', // PinkLLA アンド価格
  '000000823': 'PDLLA/PLLA', // SCULPTRA

  // CaHA・PCLフィラー
  '000000557': 'CaHA・PCLフィラー', // Ellanse M
  '000000820': 'CaHA・PCLフィラー', // レディエッセ+

  // 脂肪溶解注射
  '000000486': '脂肪溶解注射', // Eclairis(デオキシコール酸 1.0%)
  '000000669': '脂肪溶解注射', // 脂肪溶解注射(and美容外科様)

  // 点滴製剤
  '000000489': '点滴製剤', // ASCORBIC ACID Inj.
  '000000898': '点滴製剤', // NAD+ 300mg

  // ピーリング製剤
  '000000517': 'ピーリング製剤', // JALUPRO GROWPEEL
  '000000647': 'ピーリング製剤', // ペパーミントピール
  '000000769': 'ピーリング製剤', // md:Tranex Retipeel
  '000000313': 'ピーリング製剤', // LHALA Doctor

  // 麻酔関連
  '000000233': '麻酔関連', // HUONS Lidocaine Hydrochloride hydrate 2%
  '000000336': '麻酔関連', // M Lidopro Cream
  '000000680': '麻酔関連', // M Lidoprocream
  '000000375': '麻酔関連', // STARCAIN PLUS CREAM
  '000000576': '麻酔関連', // StarCain Lidocaine Cream
  '000000666': '麻酔関連', // StarCain Plus Cream
  '000000391': '麻酔関連', // SM lido cream
  '000000681': '麻酔関連', // SM Lido
  '000000467': '麻酔関連', // Jade cain plus cream
  '000000522': '麻酔関連', // JADE cain cream
  '000000518': '麻酔関連', // LIDOCAINE INJECTION(2%)
  '000000519': '麻酔関連', // LIDOCAINE INJECTION(1%)
  '000000520': '麻酔関連', // MUCHCAINE Plus
  '000000521': '麻酔関連', // Wellscainepluscream
  '000000851': '麻酔関連', // Wellscainepluscream 500g
  '000000561': '麻酔関連', // Pure cain plus cream
  '000000853': '麻酔関連', // V-LIDO cream 10.56%

  // Thread Lift（コグ・PCL・PDO の引き上げ糸）
  '000000466': 'Thread Lift', // LUXX EM PDO CW 18-1001552(20本)
  '000000540': 'Thread Lift', // LUXX E M1 CW 18-100170-34
  '000000542': 'Thread Lift', // LUXX PDO M118G100/170mm
  '000000554': 'Thread Lift', // Shark Lifting(Butterfly) PCL
  '000000555': 'Thread Lift', // Shark Lifting(ARR-Butterfly) PCL
  '000000559': 'Thread Lift', // E M M1 CW 18-100170-34
  '000000560': 'Thread Lift', // E M M1 CL 21-60135-20
  '000000565': 'Thread Lift', // LUXX M1 PCLLACW18-100170-2
  '000000566': 'Thread Lift', // E COG MESH CW 18-100155-2
  '000000571': 'Thread Lift', // SharkLifting BLOCK Wtype 18G100mm
  '000000573': 'Thread Lift', // blue rose PDO 1808L
  '000000583': 'Thread Lift', // PONY TAIL E CW 19-100150-1
  '000000584': 'Thread Lift', // LUXX E COG MESH CL 19-100155-1
  '000000585': 'Thread Lift', // new pcl posh cog 18G*155mm
  '000000586': 'Thread Lift', // PDO posh cog wタイプ 18G*155mm
  '000000588': 'Thread Lift', // SharkLifting BLOCK Wtype 【100本/箱】
  '000000589': 'Thread Lift', // LUXX RHINO PDO E R 21-6070-20
  '000000618': 'Thread Lift', // ヘアラインリフト
  '000000625': 'Thread Lift', // Molding cog PDO 18G×10mm
  '000000630': 'Thread Lift', // KING COBRA PDO 19G W
  '000000631': 'Thread Lift', // LIFT KING PDO 19G W
  '000000634': 'Thread Lift', // M1 CW18-100170-34
  '000000635': 'Thread Lift', // M2 CL19-100175-34
  '000000636': 'Thread Lift', // ARROW PDO 18G×100mm
  '000000637': 'Thread Lift', // ARROW PCL 18G×100mm
  '000000641': 'Thread Lift', // LUXX PDO DOUBLE ARM19G100/320mm
  '000000648': 'Thread Lift', // 糸リフト kingcobra
  '000000649': 'Thread Lift', // 糸リフト(da:all)
  '000000673': 'Thread Lift', // E M PCLLA TM3 CW 18-100170-2
  '000000676': 'Thread Lift', // VENUS THRED LIFT PDO 3D MESH 160 18G
  '000000958': 'Thread Lift', // VENUS THRED LIFT PDO 3D MESH 160 18G 155mm
  '000000677': 'Thread Lift', // EXOFT E PCL CW 18-1001552
  '000000678': 'Thread Lift', // EXOFT E PDO CW 18-1001552
  '000000682': 'Thread Lift', // E COG MESH CL 18-100175-2
  '000000683': 'Thread Lift', // LUXX E COG MESH CW 18-100155-2
  '000000684': 'Thread Lift', // LUXX DOUBLE ARM PDO E LN 19-120420-1
  '000000687': 'Thread Lift', // E M2 CW 18-100155-3
  '000000688': 'Thread Lift', // E PCLLA M1 CW 18-100170-2
  '000000697': 'Thread Lift', // EXOFT PDO M1 CW 18-100170-34
  '000000704': 'Thread Lift', // PDO Arrow cog 18G 150mm 205mm
  '000000705': 'Thread Lift', // Posh-cog Wtype 18G/100mm/155mm
  '000000730': 'Thread Lift', // Posh-cog Wtype 19G/100mm/155mm
  '000000739': 'Thread Lift', // MINT Lift FIX-MINI
  '000000740': 'Thread Lift', // MINT Lift UP
  '000000741': 'Thread Lift', // MINT Lift FIX
  '000000917': 'Thread Lift', // MINT Lift FINE(20本)
  '000000922': 'Thread Lift', // MINT Lift FIX(20本)
  '000000923': 'Thread Lift', // MINT Lift PETIT(20本)
  '000000925': 'Thread Lift', // MINT Lift UP+(10本)
  '000000752': 'Thread Lift', // EXOFT E M PCLLA M1 CL 18-100190-2
  '000000766': 'Thread Lift', // KING COBRA PCL 18GWType B170mm
  '000000829': 'Thread Lift', // MINERVA PCL cog
  '000000833': 'Thread Lift', // EXOFT E PCLLA TM1 CW18-100170-2
  '000000872': 'Thread Lift', // blue lose PDO multi 18G100mm
  '000000877': 'Thread Lift', // ARROW PDO 19G×60mm
  '000000888': 'Thread Lift', // LUXX DOUBLE ARM LN M1 19-100320-1
  '000000889': 'Thread Lift', // Arrow Cog W-type 19G100mm
  '000000890': 'Thread Lift', // P(LA/CL)Posh cog(W-type)18G100mm
  '000000913': 'Thread Lift', // MINERVA S-type 18G×100mm
  '000000915': 'Thread Lift', // MINERVA PDO Arrow cog(W-type)
  '000000933': 'Thread Lift', // POSH PDO 18G×100㎜
  '000000963': 'Thread Lift', // MINERVA W-TYPE PDO Molding Cog
  '000000964': 'Thread Lift', // MINERVA W-TYPE PCL Molding Cog
  '000000965': 'Thread Lift', // MINERVA W-TYPE PDO Cutting Cog
  '000000966': 'Thread Lift', // MINERVA W-TYPE PCL Cutting Cog
  '000000970': 'Thread Lift', // MINERVA PCL Arrow cog(W-type)
  '000000994': 'Thread Lift', // E M1 PCLLA TM1 PCM CW 18-100170-2
  '000000996': 'Thread Lift', // MINERVA W TYPE PDO posh(Triangle)
  '000000997': 'Thread Lift', // MINERVA W TYPE PCL posh(Triangle)
  '000001025': 'Thread Lift', // Memoryloc PCL 18G/100mm
  '000001043': 'Thread Lift', // DERMALINE PCL ARROW 18G100mm ※サンプル
  '000001047': 'Thread Lift', // LUXX E M PDO CW 19-100155-1
  '000001054': 'Thread Lift', // DERMALINE PDO ARROW 18G100mm ※サンプル

  // Shopping Lift（モノ・スクリュー・スプリングの細い糸）
  '000000556': 'Shopping Lift', // Neo thread M3025 30G25mm PDO
  '000000596': 'Shopping Lift', // LUXXE MONO 30-2530-60
  '000000614': 'Shopping Lift', // LUXXE MONO 30-3850-60
  '000000626': 'Shopping Lift', // MONO PDO 30G 38mm
  '000000628': 'Shopping Lift', // EYE PCL 30G 25mm
  '000000721': 'Shopping Lift', // EXOFT E M MONO 30-2530-60
  '000000753': 'Shopping Lift', // EXOFT PDO E SCREW 29-3850-60
  '000000942': 'Shopping Lift', // EXOFT PDO E SCREW 29-5070-60
  '000000759': 'Shopping Lift', // MONO PDO 31G 25mm
  '000000773': 'Shopping Lift', // EXOFT MONO 29-3850-60
  '000000869': 'Shopping Lift', // CNG / PCL+VC thread Mono 30G 38mm
  '000000910': 'Shopping Lift', // FASTCOG SINGLE SPRING 30G25mm
  '000000911': 'Shopping Lift', // FASTCOG SINGLE SPRING 30G38mm
  '000000948': 'Shopping Lift', // MONO 30G25mm
  '000000995': 'Shopping Lift', // Mine Lift Mono 30G25mm

  // カニューレ（針・カニューレ・注入の器具）
  '000000469': 'カニューレ', // Blunt Tip Cannula 23G×70mm
  '000000567': 'カニューレ', // Blunt Tip Cannula 27G×50mm
  '000000568': 'カニューレ', // Blunt Tip Cannula 30G×25mm
  '000000668': 'カニューレ', // Blunt Tip Cannula 21G×50mm
  '000000699': 'カニューレ', // Blunt Tip Cannula 23G×50mm
  '000000700': 'カニューレ', // Blunt Tip Cannula 25G×50mm
  '000000720': 'カニューレ', // Filler Cannula 27G×30mm
  '000000858': 'カニューレ', // Filler Cannula 25G×50mm
  '000000824': 'カニューレ', // Mirror Cannula MC-32008C
  '000000638': 'カニューレ', // Graft Cannula MC TYPE 70mm(20G)
  '000000543': 'カニューレ', // LUXX PCL CANNULA W18G100/150mm
  '000000590': 'カニューレ', // LUXX PCL CANNULA W18G100/155mm
  '000000956': 'カニューレ', // Opusカニューレ27g40mm
  '000000957': 'カニューレ', // Opusカニューレ25g50mm
  '000000975': 'カニューレ', // Opusカニューレ25g40mm
  '000001004': 'カニューレ', // Opus Cannula 30g30mm
  '000000470': 'カニューレ', // DR.MICRO NEEDLES 34G×2mm
  '000000579': 'カニューレ', // DR.MICRO NEEDLES 34G×4mm
  '000000580': 'カニューレ', // DR.MICRO NEEDLES 30G×8mm
  '000000598': 'カニューレ', // DR.MICRO NEEDLES 32G×8mm
  '000000599': 'カニューレ', // DR.MICRO NEEDLES 30G×4mm
  '000000600': 'カニューレ', // DR.MICRO NEEDLES 30G×8mm(50本入り)
  '000000601': 'カニューレ', // DR.MICRO NEEDLES 34G×2mm(50本入り)
  '000000602': 'カニューレ', // DR.MICRO NEEDLES 34G×4mm(50本入り)
  '000000616': 'カニューレ', // DR.MICRO NEEDLES 32G×2mm
  '000000632': 'カニューレ', // DR.MICRO NEEDLES 31G×8mm
  '000000661': 'カニューレ', // DR.MICRO NEEDLES 34G×6mm
  '000000756': 'カニューレ', // DR.MICRO NEEDLES 35G×2mm
  '000000778': 'カニューレ', // DR.MICRO NEEDLES 32G×4mm
  '000000801': 'カニューレ', // DR.MICRO NEEDLES 33G×2mm
  '000000873': 'カニューレ', // DR.MICRO NEEDLES 31G×4mm
  '000000938': 'カニューレ', // DR.MICRO NEEDLES 33G×8mm
  '000000603': 'カニューレ', // Nano Needle 34G 8mm
  '000000604': 'カニューレ', // Nano Needle 32G 13mm
  '000000978': 'カニューレ', // Opus Needle 34G8mm
  '000001001': 'カニューレ', // Opus Needle 34G2mm
  '000001002': 'カニューレ', // Opus Needle 34G4mm
  '000001005': 'カニューレ', // Opus Needle 32G13mm
  '000001006': 'カニューレ', // Opus Needle 30G8mm
  '000001007': 'カニューレ', // Opus Needle 18G38mm
  '000001022': 'カニューレ', // Opus Needle 30G12mm
  '000001023': 'カニューレ', // Opus Needle 32G4mm
  '000001032': 'カニューレ', // Opus Needle 23G25mm
  '000001033': 'カニューレ', // Opus Needle 27G19mm
  '000000545': 'カニューレ', // HYCOOX
  '000000546': 'カニューレ', // HYCOOX CN9-34G10
  '000000760': 'カニューレ', // HYCOOXCN9-32G1
  '000000831': 'カニューレ', // HYCOOX CN9-34G1
  '000000569': 'カニューレ', // CRYSTAL MULTI NEEDLE
  '000000742': 'カニューレ', // 9PIN NEEDLE 32G×1.0mm
  '000000781': 'カニューレ', // 9PIN NEEDLE 34G×1.0mm
  '000000932': 'カニューレ', // 9PIN NEEDLE 32G 1.2mm
  '000001067': 'カニューレ', // 9PIN NEEDLE 34Ga
  '000000692': 'カニューレ', // Derma needle 4
  '000000776': 'カニューレ', // VivaLiv meso 29G13mm
  '000000835': 'カニューレ', // SINGLE USE NEEDLE 32G4mm
  '000000955': 'カニューレ', // ACE 34g4mm
  '000000551': 'カニューレ', // Juvelook Mixer

  // 内服薬
  '000000414': '内服薬', // Aknetrent 20mg, 30 Tabs
  '000000527': '内服薬', // Aknetrent 10mg
  '000000528': '内服薬', // Aknetrent 20mg
  '000001012': '内服薬', // Isotretinoin Capsules IP 20 mg
  '000001015': '内服薬', // Isotretinoin Capsules IP 10 mg 新田先生用
  '000001016': '内服薬', // Isotretinoin Capsules IP 20 mg 新田先生用
  '000001036': '内服薬', // Isotretinoin Capsules IP 10 mg
  '000000443': '内服薬', // Varenismart Tablet 1mg
  '000000446': '内服薬', // Minoxytop 2.5mg
  '000000447': '内服薬', // Minoxytop 5mg
  '000000448': '内服薬', // Minoxytop 10mg
  '000000451': '内服薬', // Poxet 30mg
  '000000453': '内服薬', // Avana 100mg
  '000000454': '内服薬', // Avana 200mg
  '000000505': '内服薬', // NMN 150mg
  '000000506': '内服薬', // NMN 300mg
  '000000507': '内服薬', // NMN 500mg
  '000000533': '内服薬', // minwin2.5mg
  '000000534': '内服薬', // minwin5mg
  '000000535': '内服薬', // finwin1mg
  '000000537': '内服薬', // Dutasteride0.5mg
  '000000538': '内服薬', // pantogar
  '000000612': '内服薬', // VULTEUM ODF(Tadalafil) 20mg
  '000000644': '内服薬', // xenical 120mg
  '000000714': '内服薬', // フィナステリド 1mg
  '000000785': '内服薬', // 漢方
  '000000825': '内服薬', // Tadalafil 5mg(AND美容外科様 特別価格)
  '000000992': '内服薬', // JOURNAVX Tablets 50mg

  // 外用薬
  '000000419': '外用薬', // Tretiheal Cream 0.025%
  '000000420': '外用薬', // Tretiheal Cream 0.05%
  '000000421': '外用薬', // Tretiheal Cream 0.1%
  '000000693': '外用薬', // Tretiheal Cream 0.5%
  '000000422': '外用薬', // Melalite Forte Cream 4%
  '000000529': '外用薬', // Ivrea 1% Cream
  '000000530': '外用薬', // Eukroma Cream 4%
  '000000729': '外用薬', // Ezanic 20% Cream
  '000000802': '外用薬', // Tazret gel 0.05%
  '000000803': '外用薬', // tazret 0.1%
  '000000449': '外用薬', // Minoxytop Solution 2%
  '000000450': '外用薬', // Minoxytop Solution 10%
  '000000615': '外用薬', // Minoxytop F5% 60ml
  '000000623': '外用薬', // Minoxytop FT5% 60ml
  '000000946': '外用薬', // Minox 2%

  // ホルモン剤
  '000000431': 'ホルモン剤', // Cernos Depot 1000mg
  '000000434': 'ホルモン剤', // Cernos Gel 1%
  '000000432': 'ホルモン剤', // Nebido 1000mg
  '000000435': 'ホルモン剤', // Andro Forte 5
  '000000436': 'ホルモン剤', // Sustanon 250mg/ml
  '000000608': 'ホルモン剤', // Sustaviron-250
  '000000826': 'ホルモン剤', // Sustaviron-250 (AND美容外科様 特別価格)
  '000000747': 'ホルモン剤', // Implanon NXT

  // 注射薬（その他）
  '000000340': '注射薬（その他）', // Triam injection
  '000000524': '注射薬（その他）', // Triaminjection
  '000000574': '注射薬（その他）', // Triamcinolone Injection 40mg

  // スキンケア・化粧品
  '000000198': 'スキンケア・化粧品', // Active CellPower Mask Pack
  '000000314': 'スキンケア・化粧品', // LHALA Triple C
  '000000315': 'スキンケア・化粧品', // LHALA Ole
  '000000318': 'スキンケア・化粧品', // LHALA Foam
  '000000319': 'スキンケア・化粧品', // LHALA クレンジングブラシ
  '000000320': 'スキンケア・化粧品', // LHALA ピーリングブラシ
  '000000321': 'スキンケア・化粧品', // LHALA パフ
  '000000563': 'スキンケア・化粧品', // WiQo Fluido Levigante
  '000000564': 'スキンケア・化粧品', // WiQo Nourishing and Moisturizing Face Cream
  '000000624': 'スキンケア・化粧品', // WiQo Smoothing Face Fuild
  '000000800': 'スキンケア・化粧品', // Dermagen Soothing Mask
  '000000895': 'スキンケア・化粧品', // YOUTHEAL EXOPRIME MASK
  '000001044': 'スキンケア・化粧品', // DR.LUNIKA NIGHT HOLIC MASK

  // 機器・消耗品
  '000000702': '機器・消耗品', // ウルトラセル[zíː]
  '000000703': '機器・消耗品', // Zi カートリッジ
  '000000902': '機器・消耗品', // Olla Wave ハンドピース
  '000000950': '機器・消耗品', // プローブ 1.9x124mm ボディー用
  '000000951': '機器・消耗品', // プローブ 2.9x319mm ボディー用
  '000000952': '機器・消耗品', // プローブ 3.7x324mm ボディー用
  '000000953': '機器・消耗品', // プローブ 0.9x63.5mm 顔用
  '000000954': '機器・消耗品', // プローブ 1.2x63.5mm 顔用
  '000000856': '機器・消耗品', // careSTART G6PD Biosensor Strip
  '000000857': '機器・消耗品', // careSTART G6PD Biosensor Analyzer
  '000000675': '機器・消耗品', // PERMABLEND Shading Solution Thin

  // 外科材料
  '000000846': '外科材料', // 寄贈肋軟骨 2.0cm
  '000000847': '外科材料', // 寄贈肋軟骨 2.5cm
  '000000848': '外科材料', // 寄贈肋軟骨 3.0cm
  '000000849': '外科材料', // 寄贈肋軟骨 3.5cm

  // 商品以外（税・値引き・調整）
  '000000582': '商品以外', // 輸入消費税10%
  '000000597': '商品以外', // 前回分差額
  '000000646': '商品以外', // カード決済
  '000000651': '商品以外', // 特別割引
  '000000679': '商品以外', // 値引き
  '000000757': '商品以外', // 開院特別割引
  '000000761': '商品以外', // 端数調整
  '000000845': '商品以外', // デポジット金額
  '000000864': '商品以外', // 初回特別割引
  '000000899': '商品以外', // 御開院割引
  '000001048': '商品以外', // お振込み割引

  // Webで調べて分類したもの
  '000000226': 'スキンブースター', // HB VITARAN
  '000000490': 'スキンブースター', // Vitaran
  '000000491': 'スキンブースター', // Vitaran i
  '000000492': 'スキンブースター', // Vitaran s
  '000000229': 'スキンブースター', // HIGH inj (2ml×3Syringes)
  '000000230': 'スキンブースター', // HIGH inj.
  '000000786': 'スキンブースター', // HIGH inj
  '000000277': 'スキンブースター', // REVS RMT
  '000000875': 'スキンブースター', // REVS RMT(1BOX)
  '000000355': 'スキンブースター', // Collaju 1cc×1syringe
  '000000804': 'スキンブースター', // Collaju
  '000000690': 'スキンブースター', // COLLAREJU
  '000000392': 'スキンブースター', // CellREDM
  '000000737': 'スキンブースター', // cellREDM
  '000000558': 'スキンブースター', // PINK GLOW
  '000000594': 'スキンブースター', // サイトケア532
  '000000695': 'スキンブースター', // K-booster
  '000000865': 'スキンブースター', // HILO WAVE
  '000001059': 'スキンブースター', // Rejuvenex Forte
  '000000332': 'ヒアルロン酸', // Atiere Classic
  '000000642': 'ヒアルロン酸', // Atiere Intensive
  '000000402': 'ヒアルロン酸', // MaiLi Extreme Lidocaine 1ml
  '000000480': 'ヒアルロン酸', // Rejuviel V
  '000000481': 'ヒアルロン酸', // RejuvielC
  '000000483': 'ヒアルロン酸', // wellsfill Fine
  '000000484': 'ヒアルロン酸', // wellsfill deep
  '000000709': 'ヒアルロン酸', // VOMシリーズ V
  '000000710': 'ヒアルロン酸', // VOMシリーズ O
  '000000711': 'ヒアルロン酸', // VOMシリーズ M
  '000000934': 'ヒアルロン酸', // VOM Fine
  '000000907': 'ヒアルロン酸', // exquiller FINE
  '000000912': 'ヒアルロン酸', // ELOHA PLUS vol.3
  '000000976': 'ヒアルロン酸', // ELOHA PLUS vol.1
  '000000977': 'ヒアルロン酸', // ELOHA PLUS vol.2
  '000000836': 'ヒアルロン酸', // StarFill Plus
  '000000689': 'ヒアルロン酸', // HYAcorp Body Contouring MLF2
  '000000894': 'ヒアルロン酸', // HYAcorp MLF1
  '000000341': 'PDLLA/PLLA', // etrebelle 50mg
  '000000806': 'PDLLA/PLLA', // ETREBELLE 50mg
  '000000832': 'PDLLA/PLLA', // ETREBELLE 200mg
  '000000468': 'PDLLA/PLLA', // Olidia 120
  '000000871': 'PDLLA/PLLA', // Olidia365
  '000000993': 'PDLLA/PLLA', // Olidia240
  '000000821': 'PDLLA/PLLA', // ULTRACOL 100
  '000000822': 'PDLLA/PLLA', // ULTRACOL 200
  '000000511': 'CaHA・PCLフィラー', // MiracleL
  '000000337': 'Thread Lift', // TESSLIFT
  '000000526': 'Thread Lift', // TESS LIFT
  '000000386': '脂肪溶解注射', // Eclairis
  '000000712': '脂肪溶解注射', // ミケランジェロ
  '000000487': '点滴製剤', // Lipotocin Inj.300mg
  '000000883': '点滴製剤', // Lipotocin Inj.(AND様価格)
  '000000488': '点滴製剤', // BBS Inj.
  '000000874': '点滴製剤', // CARTIN Inj.(AND様価格)
  '000000960': '点滴製剤', // CARTIN Inj.
  '000000562': 'ピーリング製剤', // V carbon
  '000000944': 'スキンケア・化粧品', // REGENESS K Cream 30g
  '000000947': '注射薬（その他）', // ALFOCHOLINE Inj.
  '000000621': '機器・消耗品', // エリシスセンス 49pin
  '000000622': '機器・消耗品', // エリシスセンス 25pin
  '000000949': '機器・消耗品', // LSSA 本体一式

  // 2026/11/04 確認していただいたもの
  '000000982': 'ヒアルロン酸', // VIVA Fine
  '000000983': 'ヒアルロン酸', // VIVA Shape
  '000000984': 'ヒアルロン酸', // VIVA Deep
  '000000990': 'ヒアルロン酸', // VIVA Volume
  '000000985': 'ヒアルロン酸', // VIVA Deep(サンプル)
  '000000986': 'ヒアルロン酸', // VIVA Shape(サンプル)
  '000000987': 'ヒアルロン酸', // VIVA Fine(サンプル)
  '000000991': 'ヒアルロン酸', // VIVA Volume(サンプル)
  '000000972': '脂肪溶解注射', // v-Scarlet
  '000000989': '脂肪溶解注射', // v-Scarlet(サンプル)
  '000000891': '脂肪溶解注射', // CF LINE
  '000000607': '機器・消耗品', // Olla Wave（美容機器）
};
