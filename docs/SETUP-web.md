# あいぼう手帳 Web版のセットアップ（Notion・Obsidianを使わない人向け）

家族や友人など、**NotionもObsidianも使っていない人にそのまま使ってもらう**ための手順です。
利用者はURLを開いてメールアドレスを入れるだけで始められ、記録はこちらで用意した
データベースに保存されます（スマホでもPCでも同じ内容が見られます）。

この構成では、アプリを動かす人（あなた）が一度だけ次の3つを用意します。

| 用意するもの | 費用 | 何に使うか |
|---|---|---|
| Supabase プロジェクト | 無料 | ログイン（メールのリンク）と、記録の保存先（Postgres） |
| Render の Web Service | 無料 | アプリを動かすサーバー |
| OpenAI APIキー | 従量課金（任意） | 音声入力・カロリー推定・ふりかえり・相棒とのチャット |

かかる時間は20分ほどです。Notionにつなぐ従来の使い方（`docs/SETUP.md`）とは
**別のサーバー**として立てるのがおすすめです（1つのサーバーはどちらか一方のモードで動きます）。

---

## 1. Supabase でプロジェクトを作る（5分）

1. https://supabase.com にサインアップし、**New project** を押す
2. 名前は `aibou-techo` など。**Database Password** は自分で決めて必ず控える（後で使う）
3. Region は **Northeast Asia (Tokyo)** を選ぶ
4. できあがるまで1〜2分待つ

### 1-a. ログインの設定

1. 左メニュー **Authentication → Providers → Email** を開き、Email が有効になっていることを確認する
   （「Confirm email」はオンのままでよい。パスワードは使わず、メールのリンクだけでログインする）
2. **Authentication → URL Configuration** を開く
   - **Site URL**：あとで手順2で発行される Render の URL（例 `https://aibou-techo-xxxx.onrender.com`）。
     先にRenderを作ってから戻ってきて入れてもよい
   - **Redirect URLs**：同じURLの `login.html` を追加する（例 `https://aibou-techo-xxxx.onrender.com/login.html`）

> ここが合っていないと、メールのリンクを開いても「リンクの確認に失敗しました」になります。

### 1-b. 控えておく値（4つ）

**Project Settings → API** を開く。

| 名前 | どこにあるか | 環境変数名 |
|---|---|---|
| Project URL | 「Project URL」 | `SUPABASE_URL` |
| anon key | 「Project API keys」の **anon public** | `SUPABASE_ANON_KEY` |
| JWT Secret | 「JWT Settings」の **JWT Secret**（Legacy と書かれていることがある） | `SUPABASE_JWT_SECRET` |
| service_role key（任意） | 「Project API keys」の **service_role**。利用者が自分でアカウント削除した時に、ログイン側の利用者も一緒に消すために使う。無くても記録の削除はできる | `SUPABASE_SERVICE_ROLE_KEY` |

> JWT Secret と service_role key は**人に見せない**こと。ブラウザに渡すのは Project URL と anon key だけです。
> 新しいプロジェクトで JWT Secret が見つからない場合は、代わりに
> `SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` を設定すればログインできます。

### 1-c. データベースの接続文字列

1. 画面上部の **Connect** ボタンを押す
2. **Session pooler** のタブを選び、URI をコピーする（`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres` の形）
3. `[YOUR-PASSWORD]` を、手順1で決めた Database Password に置き換える → これが `DATABASE_URL`

> **Direct connection（`db.xxxx.supabase.co`）ではなく、必ず Pooler を使ってください。**
> Direct はIPv6でしかつながらず、Render の無料プランからは接続できません。

テーブルは作らなくてよいです。アプリが起動時に `db/schema.sql` を自動で流して整えます。

---

## 2. Render にデプロイする（5分）

1. https://render.com にサインアップし、**New → Web Service** で、このリポジトリ（自分のGitHubに置いたもの）を選ぶ
2. 設定は次のとおり

   | 項目 | 値 |
   |---|---|
   | Environment | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

3. **Environment Variables** に次を入れる

   | キー | 値 |
   |---|---|
   | `STORAGE` | `pg` ← これでWeb版のモードになる |
   | `DATABASE_URL` | 手順1-cの接続文字列 |
   | `SUPABASE_URL` | 手順1-bの Project URL |
   | `SUPABASE_ANON_KEY` | 手順1-bの anon key |
   | `SUPABASE_JWT_SECRET` | 手順1-bの JWT Secret（無ければ `SUPABASE_JWKS_URL`） |
   | `SUPABASE_SERVICE_ROLE_KEY` | （任意）手順1-bの service_role key |
   | `OPENAI_API_KEY` | （任意）AI機能を使う場合だけ |

   > `NOTION_TOKEN`・`NOTION_PAGE_ID`・`OBSIDIAN_FILE_PATH` は**設定しない**（Web版では使いません）。

4. **Create Web Service** を押し、デプロイを待つ（3分ほど）
5. 発行された `https://〇〇.onrender.com` を、手順1-aの Site URL / Redirect URLs に入れる（まだなら）
6. Render の **Logs** に `storage: pg` と出ていれば成功。`SUPABASE_JWT_SECRET も SUPABASE_JWKS_URL も無いため` と出ていたら手順1-bをやり直す

---

## 3. 使ってもらう人に送るもの

URLと、次の3行だけで足ります。

> 1. このURLを開く → メールアドレスを入れて「ログイン用のリンクを送る」
> 2. 届いたメールのリンクを開く（パスワードはありません）
> 3. iPhoneならSafariの共有ボタン→「ホーム画面に追加」で、アプリのように使えます

- 初めての人も同じ手順で、そのままアカウントができます
- 記録は本人のアカウントにだけ紐づき、他の利用者からは見えません
- 本人が「設定 → アカウント」から、いつでも記録ごとアカウントを消せます

---

## 費用と無料枠について

- **Supabase 無料プラン**：データベース 500MB、月間の認証ユーザー数も家族・友人の規模なら余裕があります。
  ただし**1週間アクセスが無いとプロジェクトが一時停止**され、ダッシュボードから手で再開する必要があります。
  誰かが毎日使っていれば止まりません
- **Render 無料プラン**：しばらくアクセスが無いとサーバーが眠り、次に開いた時に30秒ほど待ちます
  （その間に記録しても端末にいったん保存され、自動で送り直されます）
- **OpenAI**：AI機能は無料枠の回数を置いています（既定：音声入力 月20回・ふりかえり 週3回・
  相棒とのチャット 週15回。`AI_FREE_*_LIMIT` で変更可）。費用は**あなたのAPIキー**にかかるので、
  OpenAI側で月額の上限（Usage limits）を設定しておくと安心です

## うまくいかない時

**メールのリンクを開くと「リンクの確認に失敗しました」**
→ Supabase の URL Configuration（Site URL / Redirect URLs）が Render のURLと一致していません。
`https://` から `login.html` まで正確に入れてください。

**ログイン画面に「ログインの設定がまだ済んでいません」**
→ Render の環境変数 `SUPABASE_URL` / `SUPABASE_ANON_KEY` が入っていません。

**ログインできたのに記録すると「ログインが必要です」**
→ `SUPABASE_JWT_SECRET` が違います（別プロジェクトの値、または anon key を入れている）。
Project Settings → API → JWT Settings の値を入れ直してください。

**Render のログに `DATABASE_URL` や接続のエラー**
→ 接続文字列が Direct connection になっていないか、パスワードの置き換えを忘れていないか確認してください
（Session pooler の URI を使う）。

**メールが届かない**
→ Supabase 無料プランのメール送信は**1時間に数通**の上限があります。家族数人なら問題ありませんが、
一度にたくさん送ると止まります。迷惑メールフォルダも確認してください。

## 大事なお知らせ

- カロリーの数値と、キャラクターからのコメントは**あくまで目安**です。医学的・栄養学的な助言ではありません
- この構成では、利用者の記録は**あなたが用意した Supabase のデータベース**に保存されます。
  家族や友人に使ってもらう場合は、その旨を一言伝えてください
