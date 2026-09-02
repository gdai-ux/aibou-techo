// 「今日の一言」表示用の名言リスト。ランダムに1つ選んで表示する。
// 気に入った格言は右下の☆ボタンでお気に入り登録でき、📚ボタンから
// これまでにお気に入りにした格言を見返せる（ブラウザのlocalStorageに保存、端末ごと）。

const QUOTES = [
  { text: '為せば成る、為さねば成らぬ何事も', author: '上杉鷹山' },
  { text: '思考は現実化する', author: 'ナポレオン・ヒル' },
  { text: '継続は力なり', author: '住岡夜晃' },
  { text: '成功とは失敗を重ねてもなお情熱を失わないことである', author: 'ウィンストン・チャーチル' },
  { text: '千里の道も一歩から', author: '老子' },
  { text: 'できると思えばできる、できないと思えばできない。これは絶対的な法則である', author: 'パブロ・ピカソ' },
  { text: '明日死ぬかのように生きよ。永遠に生きるかのように学べ', author: 'マハトマ・ガンジー' },
  { text: '完璧を目指すよりまず終わらせろ', author: 'マーク・ザッカーバーグ' },
  { text: '今日という日は、残りの人生の最初の日である', author: 'チャールズ・ディードリッヒ' },
  { text: '小さなことを積み重ねるのが、とんでもないところへ行くただひとつの道', author: 'イチロー' },
  { text: '夢を叶える最大の秘訣は、それに向かって一歩を踏み出すこと', author: 'ウォルト・ディズニー' },
  { text: '人間は、負けたら終わりなのではない。やめたら終わりなのだ', author: 'リチャード・ニクソン' },
  { text: '最も強い者が生き残るのではなく、変化に対応できる者が生き残る', author: 'チャールズ・ダーウィン' },
  { text: '今日やれることを明日に延ばすな', author: 'ベンジャミン・フランクリン' },
  { text: '習慣が変われば人格が変わる。人格が変われば人生が変わる', author: '松下幸之助' },
  { text: '好きなことを見つけよ。そこに人生のすべてがある', author: 'スティーブ・ジョブズ' },
  { text: '諦めたらそこで試合終了ですよ', author: '安西先生（SLAM DUNK）' },
  { text: '健康は最大の財産である', author: 'エマーソン' },

  // --- 継続・習慣 ---
  { text: '続けることに勝る才能はない', author: 'イチロー' },
  { text: '習慣は第二の天性なり', author: 'アリストテレス' },
  { text: '小さな努力の積み重ねでしか、大きな成果は生まれない', author: 'イチロー' },

  // --- 健康・睡眠・食事 ---
  { text: '健全な精神は健全な身体に宿る', author: 'ユウェナリス' },

  // --- 挑戦・行動 ---
  { text: '為すことによって学ぶ', author: 'アリストテレス' },
  { text: '千里の行も足下に始まる', author: '老子' },

  // --- 失敗・挫折 ---
  { text: '失敗とは、成功する方法を見つける過程である', author: 'トーマス・エジソン' },
  { text: 'うまくいかない一万通りを見つけただけだ', author: 'トーマス・エジソン' },

  // --- 成功・目標 ---
  { text: '成功の秘訣は、始めることにある', author: 'マーク・トウェイン' },
  { text: '努力は必ず報われる、報われない努力はまだ努力とは言えない', author: '王貞治' },
  { text: '少年よ、大志を抱け', author: 'ウィリアム・クラーク' },

  // --- 学び・成長 ---
  { text: '三人行けば必ず我が師あり', author: '孔子' },
  { text: '学ぶことをやめた日、人は老いはじめる', author: 'ヘンリー・フォード' },
  { text: '知は力なり', author: 'フランシス・ベーコン' },
  { text: '学び続ける者だけが、変化に対応できる', author: 'チャールズ・ダーウィン' },
  { text: '知らないことを知ることが、知への第一歩である', author: 'ソクラテス' },
  { text: '過去から学び、今日を生き、明日に希望を持て', author: 'アルベルト・アインシュタイン' },

  // --- 心・マインドセット ---
  { text: '心のコップを上向きにせよ', author: '中村天風' },

  // --- 感謝・幸福 ---
  { text: '足るを知る者は富む', author: '老子' },
  { text: '幸せは、いつも自分の心が決める', author: 'エイブラハム・リンカーン' },
  { text: '幸福とは、習慣である', author: 'アリストテレス' },
  { text: '幸せは歩いてこない、だから歩いて行くんだね', author: '水前寺清子' },

  // --- 人間関係・家族・友情 ---
  { text: '友は第二の自分である', author: 'アリストテレス' },

  // --- 仕事・努力 ---
  { text: '天は自ら助くる者を助く', author: 'サミュエル・スマイルズ' },

  // --- 時間・人生 ---
  { text: '時は金なり', author: 'ベンジャミン・フランクリン' },

  // --- 勇気・強さ ---
  { text: '強い者が生き残るのではなく、適応する者が生き残る', author: 'チャールズ・ダーウィン' },

  // --- シンプル・自然体 ---
  { text: '足るを知る', author: '老子' },
  { text: 'シンプルであることは、究極の洗練である', author: 'レオナルド・ダ・ヴィンチ' },

  // --- 自然・季節 ---
  { text: '自然は最良の教師である', author: 'レオナルド・ダ・ヴィンチ' },

  // --- リーダーシップ・志 ---
  { text: 'リーダーとは、希望を配る人のことだ', author: 'ナポレオン・ボナパルト' },

  // --- 創造性・発想 ---
  { text: '創造性とは、点と点をつなぐことだ', author: 'スティーブ・ジョブズ' },
  { text: '想像力は知識よりも大切である', author: 'アルベルト・アインシュタイン' },
  { text: '発明とは、1%のひらめきと99%の努力である', author: 'トーマス・エジソン' },

  // --- 心構え・日常 ---
  { text: '朝の一時は貴重である', author: 'ベンジャミン・フランクリン' },

  // --- 継続・習慣（追加） ---
  { text: '一日にしてならず', author: 'ベンジャミン・フランクリン' },
  { text: '偉大な仕事は、一つ一つの小さな仕事の積み重ねでできている', author: 'ヴィンセント・ヴァン・ゴッホ' },
  { text: '毎日の小さな改善が、やがて大きな違いを生む', author: '本田宗一郎' },
  { text: '継続すれば必ず自信になる', author: 'イチロー' },
  { text: '習慣を変えれば、運命が変わる', author: '松下幸之助' },
  { text: '大事を成そうとする者は、小なる事を怠らず勤むべし', author: '二宮尊徳' },
  { text: '積小為大（小を積んで大と為す）', author: '二宮尊徳' },
  { text: '一歩一歩の積み重ねが、遠くまで人を連れて行く', author: 'サミュエル・ジョンソン' },
  { text: '毎日私たちがすることの結果、私たちは今の自分になる', author: 'アリストテレス' },
  { text: '意志の力は、繰り返しによって鍛えられる', author: 'ウィリアム・ジェームズ' },
  { text: '今日の積み重ねが、未来の自分をつくる', author: '王貞治' },
  { text: '千里の馬も一日にしては至らず', author: '荀子' },

  // --- 健康・睡眠・食事（追加） ---
  { text: '早寝早起きは、健康と富と知恵をもたらす', author: 'ベンジャミン・フランクリン' },
  { text: '身体を大切にせよ。それはあなたが住む唯一の場所である', author: 'ジム・ローン' },
  { text: '休息もまた仕事のうちである', author: 'オウィディウス' },
  { text: '睡眠は最良の瞑想である', author: 'ダライ・ラマ14世' },
  { text: '健康な身体には、健康な精神が宿る', author: 'ジョン・ロック' },
  { text: '腹八分目に医者いらず', author: '貝原益軒' },
  { text: '養生の道は、日々の慎みにあり', author: '貝原益軒' },
  { text: '身体が資本である', author: '渋沢栄一' },
  { text: '眠りは、その日の疲れを癒す最良の薬である', author: 'ウィリアム・シェイクスピア' },
  { text: '規則正しい生活こそ、最も安価な養生法である', author: 'イマヌエル・カント' },

  // --- 挑戦・行動（追加） ---
  { text: '思い立ったが吉日', author: '貝原益軒' },
  { text: '行動なき思想は無に等しい', author: '福沢諭吉' },
  { text: '案ずるより産むが易し', author: '徳川家康' },
  { text: '天は自ら助くる者を助く。まず動け', author: '福沢諭吉' },
  { text: '一寸先は闇、それでも進むしかない', author: '坂本龍馬' },
  { text: '世の人は我を何とも言わば言え、我がなすことは我のみぞ知る', author: '坂本龍馬' },
  { text: '始めなければ、何も始まらない', author: 'ピーター・ドラッカー' },
  { text: '行動を起こす勇気さえあれば、あとは何とかなる', author: 'ウォルト・ディズニー' },
  { text: '転んでもただでは起きぬ', author: '渋沢栄一' },
  { text: '為せば成る、為さねば成らぬ、成る業も、為さねば成らぬ人の業', author: '上杉鷹山' },
  { text: '行動することでしか、恐怖には打ち勝てない', author: 'デール・カーネギー' },
  { text: '道を歩けば、道はできる', author: '魯迅' },

  // --- 失敗・挫折（追加） ---
  { text: '七転び八起き', author: '福沢諭吉' },
  { text: '失敗は成功の母である', author: 'トーマス・エジソン' },
  { text: '私は失敗したことがない。ただ、うまくいかない方法を一万通り見つけただけだ', author: 'トーマス・エジソン' },
  { text: '転んだ数だけ強くなる', author: '王貞治' },
  { text: '負けを知らない人間は、本当の強さを知らない', author: 'イチロー' },
  { text: '失敗を恐れるな。恐れるべきは、挑戦しないことだ', author: '本田宗一郎' },
  { text: '成功は決して終わりではなく、失敗も決して命取りではない', author: 'ウィンストン・チャーチル' },
  { text: '雨の後には必ず晴れが来る', author: 'ラルフ・ワルド・エマーソン' },
  { text: '苦難の中にこそ、機会は潜んでいる', author: 'アルベルト・アインシュタイン' },
  { text: '成功で私を測るな。何度倒れて、何度立ち上がったかで測れ', author: 'ネルソン・マンデラ' },
  { text: '失敗した時こそ、次の一歩を考える時である', author: 'ヘンリー・フォード' },
  { text: '苦は楽の種、楽は苦の種と知るべし', author: '徳川家康' },

  // --- 成功・目標（追加） ---
  { text: '志を立てるのに、老いも若きもない', author: '吉田松陰' },
  { text: '夢なき者に理想なし、理想なき者に計画なし', author: '吉田松陰' },
  { text: '成功とは、情熱を失わずに失敗から失敗へと歩き続けることだ', author: 'ウィンストン・チャーチル' },
  { text: '準備なくして成功なし', author: '渋沢栄一' },
  { text: '成し遂げるまでは、不可能に見えるものだ', author: 'ネルソン・マンデラ' },
  { text: '大きな目標を持て。小さな目標には人を動かす力がない', author: 'ミケランジェロ' },
  { text: '目標を紙に書き出した瞬間から、それは計画になる', author: 'ナポレオン・ヒル' },
  { text: '成功者とは、失敗にめげなかった人のことである', author: 'デール・カーネギー' },
  { text: '志を高く持て', author: 'ウィリアム・クラーク' },
  { text: '為すことに全力を尽くせば、結果は後からついてくる', author: '本田宗一郎' },
  { text: '小成に安んずるなかれ', author: '渋沢栄一' },
  { text: '努力なくして、天才なし', author: 'トーマス・エジソン' },

  // --- 学び・成長（追加） ---
  { text: '学びて時にこれを習う、亦説ばしからずや', author: '孔子' },
  { text: '過ちて改めざる、これを過ちと謂う', author: '孔子' },
  { text: '故きを温ねて新しきを知る', author: '孔子' },
  { text: '学問に王道なし', author: 'ユークリッド' },
  { text: '知識に投資することが、最も利息の高い投資である', author: 'ベンジャミン・フランクリン' },
  { text: '賢者は歴史から学び、愚者は経験からしか学ばない', author: 'オットー・フォン・ビスマルク' },
  { text: '生涯学び続けよ。世界はそれだけ広がる', author: 'ヘンリー・フォード' },
  { text: '経験は最良の教師である', author: 'ジュリアス・シーザー' },
    { text: '真の知恵とは、自分が何も知らないと知ることである', author: 'ソクラテス' },
  { text: '成長とは、昨日の自分より一歩前に出ることである', author: '羽生善治' },
  { text: '間違いを恐れず、そこから学べ', author: 'アルベルト・アインシュタイン' },

  // --- 心・マインドセット（追加） ---
  { text: '思考が変われば行動が変わる。行動が変われば習慣が変わる', author: 'ウィリアム・ジェームズ' },
  { text: '人生は、自分がどう考えるかによって決まる', author: 'マルクス・アウレリウス' },
  { text: '心が変われば、見える景色が変わる', author: '中村天風' },
  { text: '心を強く持てば、体もまた強くなる', author: '中村天風' },
  { text: '積極的な心が、積極的な人生をつくる', author: 'ナポレオン・ヒル' },
  { text: '不安は、未来を先取りして苦しむことである', author: 'セネカ' },
  { text: '心の平静こそ、最大の財産である', author: 'エピクテトス' },
  { text: '人は、自分が思うような人間になる', author: 'マハトマ・ガンジー' },
  { text: '悲観主義者は風の中に困難を見出し、楽観主義者は困難の中に風を見出す', author: 'ウィンストン・チャーチル' },
  { text: '心配事の九割は、実際には起こらない', author: 'デール・カーネギー' },
  { text: '平常心これ道なり', author: '南泉普願' },
  { text: '心を平らかに保てば、道は自ずと開ける', author: '徳川家康' },

  // --- 感謝・幸福（追加） ---
  { text: '感謝は最大の美徳であり、他のすべての美徳の母である', author: 'マルクス・トゥッリウス・キケロ' },
  { text: '幸福とは、感謝の気持ちを持つことから始まる', author: 'エピクテトス' },
  { text: '足るを知る者は、常に富んでいる', author: '老子' },
  { text: '幸せは、求めるものではなく気づくものである', author: 'ラルフ・ワルド・エマーソン' },
  { text: '小さな幸せを見逃すな', author: '相田みつを' },
  { text: '感謝の心を持てば、不平不満は消えていく', author: '松下幸之助' },
  { text: '与えることは、受け取ることより幸いである', author: 'イエス・キリスト' },
  { text: '今この瞬間に感謝できる人が、本当に豊かな人である', author: '本田宗一郎' },
  
  // --- 人間関係・家族・友情（追加） ---
  { text: '一人はみんなのために、みんなは一人のために', author: 'フリードリヒ・シラー' },
  { text: '友情とは、二つの体に宿る一つの魂である', author: 'アリストテレス' },
  { text: '家族とは、誰も置き去りにしないということだ', author: 'ウォルト・ディズニー' },
  { text: '信頼は、時間をかけて築き、一瞬で失われる', author: 'ウォーレン・バフェット' },
  { text: '和を以て貴しとなす', author: '聖徳太子' },
  { text: '人を動かす前に、まず人を理解せよ', author: 'デール・カーネギー' },
  { text: '感謝する相手がいることが、人生を豊かにする', author: 'マザー・テレサ' },
    { text: '思いやりは、どんな言語にも訳せる', author: 'マザー・テレサ' },
  
  // --- 仕事・努力（追加） ---
  { text: '仕事を楽しめる者は、人生を楽しめる者である', author: '本田宗一郎' },
  { text: '働くとは、傍を楽にすることである', author: '二宮尊徳' },
  { text: '誠実さこそ、最良の商売道具である', author: '渋沢栄一' },
  { text: '道徳経済合一説', author: '渋沢栄一' },
  { text: '仕事は自分から探すもの、与えられるものではない', author: '本田宗一郎' },
  { text: '努力する人は希望を語り、怠ける人は不満を語る', author: '井上靖' },
  { text: '仕事の質は、準備の質で決まる', author: 'ピーター・ドラッカー' },
  { text: '好きなことを仕事にできた者は、一生働かなくてよい', author: '孔子' },
  { text: '一生懸命はカッコいい', author: '松岡修造' },
  { text: '本気になればなるほど、楽しくなる', author: '松岡修造' },
  { text: '額に汗して働く者は尊い', author: '二宮尊徳' },

  // --- 時間・人生（追加） ---
    { text: '一日を大切にできない者は、一生を大切にできない', author: '福沢諭吉' },
  { text: '過去にとらわれず、未来を憂えず、今を生きよ', author: '仏陀' },
  { text: '人生は近くで見ると悲劇だが、遠くから見れば喜劇である', author: 'チャールズ・チャップリン' },
  { text: '人生とは、自分自身を見つけることではなく、自分自身を創ることである', author: 'ジョージ・バーナード・ショー' },
  { text: '時間は誰にでも平等に与えられた、唯一の財産である', author: 'セネカ' },
  { text: '今日という日は、二度と来ない', author: '松尾芭蕉' },
  { text: '一期一会', author: '千利休' },
  { text: '人生に無駄な経験は一つもない', author: 'スティーブ・ジョブズ' },
  { text: '過去は変えられないが、未来は変えられる', author: 'エレノア・ルーズベルト' },
  { text: '人生とは、10パーセントは自分に起きたことで、90パーセントはそれにどう反応するかで決まる', author: 'チャールズ・スウィンドル' },

  // --- 勇気・強さ ---
  { text: '勇気とは、恐怖がないことではなく、恐怖に打ち勝つことである', author: 'ネルソン・マンデラ' },
  { text: '一歩踏み出す勇気が、人生を変える', author: 'マハトマ・ガンジー' },
  { text: '本当の強さとは、優しさの中にある', author: '宮本武蔵' },
  { text: '千日の稽古を鍛とし、万日の稽古を練とす', author: '宮本武蔵' },
  { text: '勝つと思うな、思えば負けよ', author: '宮本武蔵' },
    { text: '苦しい時こそ、笑え', author: '坂本龍馬' },
    { text: '折れない心は、日々の小さな勝利からつくられる', author: 'イチロー' },
  { text: '強さとは、何度倒れても立ち上がることである', author: 'ネルソン・マンデラ' },

  // --- シンプル・自然体（追加） ---
  { text: 'シンプルさは、複雑さの果てにある', author: 'スティーブ・ジョブズ' },
  { text: '少なくして足るを知る', author: '老子' },
  { text: '無為自然', author: '老子' },
  { text: '飾らぬ心が、一番美しい', author: '相田みつを' },
  { text: '素直な心には、道が開ける', author: '松下幸之助' },
  { text: '複雑なことをシンプルにできる人が、本当に理解している人である', author: 'アルベルト・アインシュタイン' },
  { text: '過剰な装飾より、簡素な誠実さを選べ', author: '福沢諭吉' },

  // --- 自然・季節（追加） ---
      { text: '花は咲くべき時に咲く', author: '道元' },
    { text: '自然に従う者は、道に迷わない', author: '老子' },
  
  // --- 自己肯定・自分らしさ ---
  { text: '人と比べるな、昨日の自分と比べよ', author: 'イチロー' },
  { text: 'あなたはあなたのままでいい', author: 'ラルフ・ワルド・エマーソン' },
  { text: 'それでもなお、私は人の心が本当は善良だと信じている', author: 'アンネ・フランク' },
  { text: '自分の道は自分で決める', author: '福沢諭吉' },
  { text: '天上天下唯我独尊', author: '仏陀' },
  { text: '他人と比較して自分を測るな。あなたはあなただ', author: 'マックス・アーマン' },
  { text: '自分自身であれ。他の誰かは、もう既にいるのだから', author: 'オスカー・ワイルド' },
  { text: '己を知る者は明なり', author: '老子' },
  { text: '自分を愛せない者は、他人も愛せない', author: 'エーリッヒ・フロム' },
  { text: '欠点も含めて、それが自分である', author: '相田みつを' },

  // --- 目標達成・粘り強さ ---
    { text: '諦めない限り、失敗ではない', author: 'ウォルト・ディズニー' },
  { text: '成功するまで続ければ、それは失敗ではなくなる', author: 'トーマス・エジソン' },
    { text: '粘り強さこそ、天才に匹敵する力である', author: 'カルヴィン・クーリッジ' },
  { text: '目標に向かって、ただ一歩を積み重ねよ', author: '孔子' },
  { text: '最後まで諦めなかった者だけが、頂上に立てる', author: 'エドマンド・ヒラリー' },
  { text: 'あと一歩の忍耐が、成功と失敗を分ける', author: 'ナポレオン・ヒル' },
  { text: '継続する意志こそ、才能を超える', author: 'ウィンストン・チャーチル' },
  
  // --- リーダーシップ・志（追加） ---
    { text: '将は、兵の模範となるべし', author: '孫子' },
  { text: '彼を知り己を知れば、百戦してあやうからず', author: '孫子' },
  { text: 'リーダーシップとは、相手が自ら望んでやりたくなるように導く技術である', author: 'ドワイト・アイゼンハワー' },
  { text: '志を同じくする者と共に進め', author: '吉田松陰' },
  { text: '大将たる者は、部下より先に苦労を負うべし', author: '徳川家康' },
  { text: '人の上に立つ者は、まず人の下に立つことを学べ', author: '渋沢栄一' },
  { text: '信頼なくして、リーダーシップなし', author: 'ピーター・ドラッカー' },

  // --- 創造性・発想（追加） ---
  { text: '常識とは、18歳までに身につけた偏見のコレクションである', author: 'アルベルト・アインシュタイン' },
  { text: '既存の枠を疑うことから、革新は生まれる', author: 'スティーブ・ジョブズ' },
  { text: '独創とは、情報源を隠す技術である', author: 'アルベルト・アインシュタイン' },
  { text: '好奇心は、あらゆる発見の入口である', author: 'レオナルド・ダ・ヴィンチ' },
  { text: '想像力が世界を支配する', author: 'ナポレオン・ボナパルト' },
  { text: '子どものような好奇心を持ち続けよ', author: 'アルベルト・アインシュタイン' },
  { text: '無駄に見える回り道が、新しい発見につながる', author: '本田宗一郎' },

  // --- 心構え・日常（追加） ---
    { text: '今日一日を、丁寧に生きる', author: '相田みつを' },
  { text: '朝の光を浴びよ、それが一日を決める', author: 'ベンジャミン・フランクリン' },
  { text: '日々是好日', author: '雲門文偃' },
  { text: '小さな親切を、毎日一つ', author: 'マザー・テレサ' },
  { text: '準備を怠らぬ者に、幸運は微笑む', author: 'ルイ・パスツール' },
  { text: '規則正しさは、成功者の共通点である', author: 'ベンジャミン・フランクリン' },
  { text: '朝を制する者が、一日を制する', author: '本田宗一郎' },

  // --- 締めくくりに ---
  { text: '人生とは、自転車に乗るようなものだ。倒れないためには、走り続けるしかない', author: 'アルベルト・アインシュタイン' },
  { text: '道は、歩く者の足の下にできる', author: '魯迅' },
  { text: '明日という日は、今日という準備の上にある', author: '渋沢栄一' },
  { text: '今日の一歩が、明日を変える', author: '福沢諭吉' },
  { text: '一燈を提げて暗夜を行く。暗夜を憂うることなかれ、ただ一燈を頼め', author: '佐藤一斎' },
  { text: '為さねば、何も変わらない。為せば、何かが変わる', author: '上杉鷹山' },
  { text: '終わりよければすべてよし', author: 'ウィリアム・シェイクスピア' },
  { text: '人生に近道はない。あるのはただ、一歩ずつの道だけである', author: '渋沢栄一' },

  // --- 継続・習慣（追加2） ---
  { text: '大河も一滴の水から始まる', author: '荘子' },
  { text: '休まず、しかし急がず', author: 'ヨハン・ヴォルフガング・フォン・ゲーテ' },
  { text: '習慣は綱のようなものだ。毎日一本の糸を紡げば、やがて断ち切れなくなる', author: 'ホーレス・マン' },
  { text: '練習に勝る近道はない', author: 'イチロー' },

  // --- 健康・睡眠・食事（追加2） ---
  { text: '身体を動かすことは、心を整えることでもある', author: '貝原益軒' },
  { text: '運動は、あらゆる薬に勝る', author: 'ヒポクラテス' },
  { text: '歩くことは、人間にとって最良の薬である', author: 'ヒポクラテス' },

  // --- 挑戦・行動（追加2） ---
  { text: '為すべきことを為せ、然らば道は開ける', author: '福沢諭吉' },
  { text: '迷ったら、やる方を選べ', author: '本田宗一郎' },
  { text: '始める前から諦めるな', author: 'ヘンリー・フォード' },
  { text: '行動した者だけが、結果を手にする', author: 'ピーター・ドラッカー' },

  // --- 失敗・挫折（追加2） ---
  { text: '打たれ強さもまた、才能のひとつである', author: '王貞治' },
  { text: '挫折は、次への準備にすぎない', author: '松下幸之助' },
  { text: '失敗を恥じるな、学ばないことを恥じよ', author: '渋沢栄一' },

  // --- 成功・目標（追加2） ---
  { text: '成功とは、一日の終わりに疲れて眠れることだ', author: '本田宗一郎' },
  { text: '目標を持つ者は道に迷わない', author: '福沢諭吉' },
  { text: '大きな夢を見て、小さく始めよ', author: '松下幸之助' },
  { text: '努力に勝る天才なし', author: 'トーマス・エジソン' },

  // --- 学び・成長（追加2） ---
  { text: '一を聞いて十を知る', author: '孔子' },
  { text: '学びて思わざれば則ち罔し、思いて学ばざれば則ち殆し', author: '孔子' },
  { text: '学ぶことに終わりはない', author: '福沢諭吉' },
  { text: '無知を自覚することが、知の始まりである', author: 'ソクラテス' },
  { text: '疑うことから、真理は始まる', author: 'ルネ・デカルト' },

  // --- 心・マインドセット（追加2） ---
  { text: '心を制する者は、事を制す', author: '徳川家康' },
  { text: '今日の一念が、明日の運命をつくる', author: '中村天風' },
  { text: '運命は、性格の中にある', author: 'ヘラクレイトス' },
  { text: '心が満ちれば、行動もまた満ちる', author: '松下幸之助' },

  // --- 感謝・幸福（追加2） ---
  { text: '持っているものに感謝すれば、いつも十分である', author: 'エピクテトス' },
  { text: '幸福は、香水のようなものだ。他人にふりかければ、自分にも数滴かかる', author: 'ラルフ・ワルド・エマーソン' },
  { text: '一日の終わりに、感謝できることを三つ数えよ', author: 'オプラ・ウィンフリー' },

  // --- 人間関係・家族・友情（追加2） ---
  { text: '人を信じて損をすることはあっても、それは決して恥ではない', author: '渋沢栄一' },
  { text: '相手の立場に立って初めて、人は理解し合える', author: 'デール・カーネギー' },
  { text: '真の友は、第二の自分である', author: 'キケロ' },

  // --- 仕事・努力（追加2） ---
  { text: '小事を軽んずる者は、大事を成し得ず', author: '渋沢栄一' },
  { text: '働くことは、生きることそのものである', author: '二宮尊徳' },
  { text: '努力する姿は、それだけで人を動かす', author: 'イチロー' },
  { text: '仕事とは、人に喜ばれて対価を得ることである', author: '松下幸之助' },

  // --- 時間・人生（追加2） ---
  { text: '今この瞬間を大切にせよ。それが人生のすべてである', author: '福沢諭吉' },
  { text: '人生は、待つ者にはつれなく、進む者には優しい', author: 'ラルフ・ワルド・エマーソン' },
  { text: '過去にこだわる者に、未来は開けない', author: '渋沢栄一' },

  // --- 勇気・強さ（追加2） ---
  { text: '恐れながらも進む者こそ、真に勇敢である', author: 'ネルソン・マンデラ' },
  { text: '勇気とは、一歩を踏み出す力のことである', author: '坂本龍馬' },
  { text: '強さとは、耐える力ではなく、耐えながら前に進む力である', author: 'マハトマ・ガンジー' },

  // --- シンプル・自然体（追加2） ---
  { text: '簡素であることは、豊かであることだ', author: '福沢諭吉' },
  { text: '飾らない生き方が、一番美しい生き方である', author: '松下幸之助' },

  // --- 自然・季節（追加2） ---
  { text: '自然の中には、いつも新しい始まりがある', author: 'ラルフ・ワルド・エマーソン' },
  { text: '大地は、耕す者を裏切らない', author: '二宮尊徳' },

  // --- 自己肯定・自分らしさ（追加2） ---
  { text: '自分を信じることが、すべての始まりである', author: '本田宗一郎' },
  { text: '君は君のままでいい。それ以上でも、それ以下でもない', author: '相田みつを' },
  { text: '自分の弱さを認めることが、本当の強さである', author: 'マハトマ・ガンジー' },
  { text: '自分の人生の主人公は、自分自身である', author: '福沢諭吉' },

  // --- 目標達成・粘り強さ（追加2） ---
  { text: '継続する者にのみ、頂上からの景色が見える', author: '羽生善治' },
  { text: '一歩ずつでいい、止まらなければ必ず着く', author: '渋沢栄一' },
  { text: '粘り強い者が、最後に笑う', author: 'イチロー' },
  { text: '目標に近道はない。あるのは一歩ずつの道だけだ', author: '本田宗一郎' },

  // --- リーダーシップ・志（追加2） ---
  { text: '大志を抱く者は、小さな批判を恐れない', author: '坂本龍馬' },
  { text: 'リーダーは、責任を最も多く引き受ける者である', author: '渋沢栄一' },
  { text: '衆知を集めて事に当たる', author: '松下幸之助' },

  // --- 創造性・発想（追加2） ---
  { text: '模倣から創造は生まれる', author: 'パブロ・ピカソ' },
  { text: '新しい発想は、常識を疑うところから生まれる', author: '本田宗一郎' },
  { text: '観察こそ、発見の母である', author: 'レオナルド・ダ・ヴィンチ' },

  // --- 心構え・日常（追加2） ---
  { text: '一日の計は朝にあり', author: '渋沢栄一' },
  { text: '小さな約束を守ることが、信頼をつくる', author: '松下幸之助' },
  { text: '毎日を人生最後の日のように生きよ', author: 'スティーブ・ジョブズ' },

  // --- 締めくくりに（追加2） ---
  { text: '人生とは、今日という一日の積み重ねである', author: '渋沢栄一' },
  { text: '為すべきをなし、憂うることなかれ', author: '福沢諭吉' },
  { text: '最後まで諦めない者に、道は開ける', author: '本田宗一郎' },
];

const QUOTE_FAVORITES_KEY = 'lifelog-quote-favorites';
const QUOTE_PINNED_KEY = 'lifelog-quote-pinned';
let currentQuote = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pickRandomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(QUOTE_FAVORITES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveFavorites(list) {
  try {
    localStorage.setItem(QUOTE_FAVORITES_KEY, JSON.stringify(list));
  } catch (e) {
    // 保存できない環境（プライベートモード等）でも表示自体は続ける
  }
}

function sameQuote(a, b) {
  return a && b && a.text === b.text && a.author === b.author;
}

function isFavorite(quote) {
  return loadFavorites().some((f) => sameQuote(f, quote));
}

// 「固定」した格言（設定していればページを開くたび・引っ張り更新のたびに
// ランダム抽選せず、ずっとこれを表示し続ける）
function loadPinnedQuote() {
  try {
    const raw = localStorage.getItem(QUOTE_PINNED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function savePinnedQuote(quote) {
  try {
    localStorage.setItem(QUOTE_PINNED_KEY, JSON.stringify({ text: quote.text, author: quote.author }));
  } catch (e) {
    // 保存できない環境でも表示自体は続ける
  }
}

function clearPinnedQuote() {
  try {
    localStorage.removeItem(QUOTE_PINNED_KEY);
  } catch (e) {
    // noop
  }
}

function isPinned(quote) {
  return sameQuote(loadPinnedQuote(), quote);
}

// 星ボタンの見た目だけを、現在のお気に入り状態に合わせて更新する
function updateFavoriteButton() {
  const btn = document.getElementById('quoteFavoriteBtn');
  if (!btn || !currentQuote) return;
  const favored = isFavorite(currentQuote);
  btn.classList.toggle('active', favored);
  btn.setAttribute('aria-label', favored ? 'お気に入りから外す' : 'お気に入りに登録');
}

function toggleFavorite() {
  if (!currentQuote) return;
  let favorites = loadFavorites();
  if (isFavorite(currentQuote)) {
    favorites = favorites.filter((f) => !sameQuote(f, currentQuote));
  } else {
    favorites.push({ text: currentQuote.text, author: currentQuote.author, savedAt: Date.now() });
  }
  saveFavorites(favorites);
  updateFavoriteButton();
}

// 📌ボタンの見た目だけを、現在の固定状態に合わせて更新する
function updatePinButton() {
  const btn = document.getElementById('quotePinBtn');
  if (!btn || !currentQuote) return;
  const pinned = isPinned(currentQuote);
  btn.classList.toggle('active', pinned);
  btn.setAttribute('aria-label', pinned ? '固定を解除する' : 'この格言を固定する');
}

function togglePin() {
  if (!currentQuote) return;
  if (isPinned(currentQuote)) {
    clearPinnedQuote();
  } else {
    savePinnedQuote(currentQuote);
  }
  updatePinButton();
}

// ライブラリーから選んだ格言を、そのまま固定表示にする
function pinQuoteFromLibrary(quote) {
  savePinnedQuote(quote);
  closeQuoteLibrary();
  renderQuote();
}

function renderQuoteLibraryList() {
  const listEl = document.getElementById('quoteLibraryList');
  if (!listEl) return;
  const favorites = loadFavorites().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  if (!favorites.length) {
    listEl.innerHTML = '<div class="empty">まだお気に入りはありません</div>';
    return;
  }
  listEl.innerHTML = favorites.map((f, i) => `
    <div class="quote-lib-item">
      <div>
        <div class="quote-lib-quote">「${escapeHtml(f.text)}」</div>
        <div class="quote-lib-author">— ${escapeHtml(f.author)}</div>
      </div>
      <div class="quote-lib-actions">
        <button type="button" class="icon-btn" data-show-index="${i}" aria-label="この格言を固定表示">${ICON_PIN_SMALL}</button>
        <button type="button" class="icon-btn" data-remove-index="${i}" aria-label="お気に入りから削除">${ICON_TRASH}</button>
      </div>
    </div>
  `).join('');
  listEl.querySelectorAll('[data-show-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pinQuoteFromLibrary(favorites[Number(btn.dataset.showIndex)]);
    });
  });
  listEl.querySelectorAll('[data-remove-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = favorites[Number(btn.dataset.removeIndex)];
      saveFavorites(loadFavorites().filter((f) => !sameQuote(f, target)));
      renderQuoteLibraryList();
      updateFavoriteButton();
    });
  });
}

function openQuoteLibrary() {
  renderQuoteLibraryList();
  document.getElementById('quoteLibraryModal')?.classList.remove('hidden');
}

function closeQuoteLibrary() {
  document.getElementById('quoteLibraryModal')?.classList.add('hidden');
}

// 時計・マイクと同じ線画スタイルのアイコン（絵文字だと主張が強すぎるため）。
// アウトライン版と塗りつぶし版をどちらも埋め込み、CSSでactive状態に応じて切り替える。
const ICON_PIN = `
  <svg class="icon-outline" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
  <svg class="icon-filled" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
`;
const ICON_BOOK = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/></svg>
`;
const ICON_STAR = `
  <svg class="icon-outline" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  <svg class="icon-filled" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
`;
// ライブラリー一覧の行内アクション用（history.jsの編集/削除アイコンと同じ16pxサイズ）
const ICON_PIN_SMALL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>';

function renderQuote() {
  const el = document.getElementById('quoteCard');
  if (!el) return;
  // 固定中の格言があればそれを表示し続け、無ければランダムに選ぶ
  const pinned = loadPinnedQuote();
  currentQuote = pinned || pickRandomQuote();
  const favored = isFavorite(currentQuote);
  const pinnedNow = Boolean(pinned);
  el.innerHTML = `
    <div class="quote-body">
      <div class="quote-text">「${escapeHtml(currentQuote.text)}」</div>
      <div class="quote-author">— ${escapeHtml(currentQuote.author)}</div>
    </div>
    <div class="quote-actions">
      <button type="button" class="quote-icon-btn quote-pin-btn${pinnedNow ? ' active' : ''}" id="quotePinBtn" aria-label="${pinnedNow ? '固定を解除する' : 'この格言を固定する'}">${ICON_PIN}</button>
      <button type="button" class="quote-icon-btn" id="quoteLibraryBtn" aria-label="格言ライブラリー">${ICON_BOOK}</button>
      <button type="button" class="quote-icon-btn quote-star-btn${favored ? ' active' : ''}" id="quoteFavoriteBtn" aria-label="${favored ? 'お気に入りから外す' : 'お気に入りに登録'}">${ICON_STAR}</button>
    </div>
  `;
  document.getElementById('quotePinBtn').addEventListener('click', togglePin);
  document.getElementById('quoteFavoriteBtn').addEventListener('click', toggleFavorite);
  document.getElementById('quoteLibraryBtn').addEventListener('click', openQuoteLibrary);
}

document.getElementById('closeQuoteLibraryBtn')?.addEventListener('click', closeQuoteLibrary);

renderQuote();
