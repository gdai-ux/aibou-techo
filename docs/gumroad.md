# Gumroad出品メモ

「Notionテンプレート＋アプリ」を売るための、商品ページ文案と公開前チェック。

## 商品の中身

購入したら手に入るもの。この3点セットで売る。

1. **Notionテンプレート**（複製リンク）
2. **アプリ一式**（ZIP。自分のRenderに無料でデプロイして使う）
3. **セットアップ手順書**（`docs/SETUP.md`。テンプレートの中にも入れておく）

## 価格

**買い切り 2,000〜3,000円**を推奨。理由は3つ。

- Notionテンプレート単体の相場より上、アプリ単体の相場より下という位置づけが素直
- サブスクにすると、こちらにサポート義務が生まれる。買い切りなら「渡して終わり」にできる
- 最初は反応を見るのが目的なので、値付けを間違えても損失が小さい

Gumroadは売上から手数料が引かれる（率は変わるので**出品時に必ず現在の料率を確認する**）。
日本から売る場合、為替と入金手数料も乗る。

---

## 商品ページ文案（日本語）

### タイトル

> 話しかけるだけでNotionに貯まる、ライフログアプリ + テンプレート

### 説明

**記録が「あなたのNotion」に残る、健康記録アプリです。**

食事・運動・睡眠・体調を、スマホから数秒で記録できます。書いた内容はすべて
あなた自身のNotionページに追記されるので、アプリをやめても記録は手元に残ります。

**「アイスコーヒーと、ジムでバイク5キロ」と話しかけるだけ**で、種類の振り分けも
時刻の入力も自動で終わります。カロリーも自動で見積もります。

毎日、相棒のキャラクターがその日の記録を読んで一言かけてくれます。叱りません。
できたことを認めて、残りの時間を一緒にやろうと後押しする言い方に統一しています。
記録を続けるとキャラクターのレベルが上がり、姿が変わっていきます。

#### できること

- 食事・運動・睡眠・体調・メモの記録（スマホのホーム画面からアプリのように開けます）
- 話しかけるだけの音声入力（種類・時刻・内容まで自動で振り分け）
- カロリーの自動見積もり（食べたものから摂取、運動から消費）
- 毎日のふりかえりコメント（12種類のキャラクターから相棒を選べます。性格と口調が変わります）
- 週の運動リング、睡眠グラフ、カレンダー、ステータス画面
- オフラインでも開けて、通信が戻ったら自動で送り直します

#### 買う前に知っておいてほしいこと

- **セットアップに15分ほどかかります。** NotionとRender（無料）のアカウントを作り、
  手順書のとおりに進める必要があります。手順書は画面ごとに書いてありますが、
  「アプリストアから入れて終わり」ではありません
- **月額費用は基本0円**です。ただし音声入力とカロリー推定を使う場合だけ、
  ご自身のOpenAI APIキーが必要です（使った分だけの従量課金）
- **カロリーの数値とコメントは目安**であり、医学的・栄養学的な助言ではありません
- 記録はあなたのNotionに保存されます。作者は一切受け取りません

#### 動作環境

iPhone / Android / PC のブラウザ。iOSはSafari推奨。

---

## 商品ページ文案（英語）

### Title

> Voice-first life log that saves straight into your Notion

### Description

**A health tracker whose data lives in your Notion, not ours.**

Log meals, workouts, sleep and how you feel in seconds. Everything is appended to
a page in your own Notion workspace, so your history stays yours even if you stop
using the app.

Just say *"iced coffee, and 5km on the gym bike"* — the app picks the category,
fills in the time, and estimates the calories for you.

Every day your buddy character reads what you logged and says something back. It
never scolds. It names what you managed, then nudges you into the rest of the day.
Keep logging and it levels up and changes appearance.

#### What you get

- Meal / workout / sleep / condition / note logging, installable to your home screen
- Voice logging that sorts the entry into the right category by itself
- Automatic calorie estimates, both eaten and burned
- A daily review from one of 12 buddy characters, each with its own tone
- Weekly workout ring, sleep chart, calendar and a status screen
- Works offline and re-sends your entries when you're back online

#### Before you buy

- **Setup takes about 15 minutes.** You'll need free Notion and Render accounts and
  will follow a step-by-step guide. This is not an App Store install.
- **No monthly fee.** Voice input and calorie estimates need your own OpenAI API key
  (pay per use, typically cents per month).
- **Calorie numbers and comments are rough guidance, not medical or nutritional advice.**
- Your data goes to your Notion. The author never receives it.

---

## 公開前チェックリスト

### 必須（これが無いと売ってはいけない）

- [ ] **特定商取引法に基づく表記**（日本から有料で売る場合は必須）。氏名・住所・
      連絡先・価格・引渡し時期・返品の条件を書いたページを用意し、商品ページから
      リンクする。Gumroadの説明欄に直接書いてもよい
- [ ] **返金ポリシー**を明記する。デジタル商品なので「原則返金不可、ただし
      動作しない場合は対応」といった形が現実的
- [ ] **免責の一文**。「カロリーの数値とコメントは目安であり、医学的・栄養学的な
      助言ではありません」を、商品ページ・テンプレート・アプリ内の3か所に置く
- [ ] 配布するZIPに `.env` が**入っていないこと**を確認する
      （自分のNotionトークンとOpenAIキーが漏れる）
- [ ] テンプレートに**自分の実際の記録が残っていないこと**を確認する
- [ ] `README.md` に個人のファイルパスや固有の情報が残っていないか確認する
      （`.env.example` のObsidianパスなど）

### あったほうがいいもの

- [ ] スクリーンショット4〜6枚（ホーム画面・音声入力・ふりかえり・ステータス）。
      **サンプルの記録に切り替えてから撮る**
- [ ] 15秒の操作動画（話しかけて記録が入るところ）。これが一番売れる素材になる
- [ ] 日本語版と英語版の両方の商品ページ

### 配布ZIPの作り方

```bash
# node_modules・.env・開発用の設定を除いて固める
zip -r aibou-techo.zip . \
  -x 'node_modules/*' '.git/*' '.env' '.claude/*' '.github/*' '*.DS_Store' 'sync.log'
```

`.github/workflows` を外すのは、買った人のリポジトリで勝手にCIが動かないようにするため。

固めたあと、**必ず中身を確認する。**

```bash
unzip -l aibou-techo.zip | grep -E '\.env$|\.git/'   # 何も出なければOK
```

だいたい500KBほどになる。これより極端に大きい場合は `node_modules` が
混ざっているので作り直すこと。

---

## 出したあとに見ること

売れた数より、次の2つを見る。

1. **買った人がセットアップまで到達したか**（Gumroadのメッセージで1通聞くだけでよい）
2. **どこで詰まったか**

ここで「手順が難しくて動かせなかった」が続くなら、価格でもデザインでもなく
**セットアップの重さ**が壁だという答えが出る。その時は次の一手（Notion OAuth化）に
進む価値がある、という判断材料になる。

逆に1本も売れないなら、この方向は畳んで、アプリは実績として使うほうがよい。
判断に必要なのは2週間と数千円ぶんの手間だけ。
