-- あいぼう手帳 のデータベース（Postgres）。
-- 何度流しても同じ結果になるように、すべて IF NOT EXISTS で書く。
-- 変更は末尾に追記していく（既存の行は消さない）。

-- 利用者。認証は外部（Supabase Auth など）に任せ、ここでは同一性と契約だけ持つ
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  plan        text NOT NULL DEFAULT 'free',   -- 'free' | 'premium'
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
-- 同一性は id（認証側が発行）で決める。email は検索用で、一意にはしない
-- （認証側でアカウントを作り直すと、同じ email に別の id が付くため）
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE INDEX IF NOT EXISTS users_email ON users (email);

-- 記録。1行 = 1件（Notionデータベース形式の1行と同じ粒度）。
-- category ごとの中身は payload(jsonb) に入れる:
--   sleep     {bedtime, wake}
--   exercise  {time, content}
--   memo      {time, content}
--   condition {time, level, stool, note}
--   meal      {time, mealType, items: [string]}   -- items は「07:30 白米（約240kcal）」の形の文字列
--   review    {content}                            -- 1日に1件
CREATE TABLE IF NOT EXISTS entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  category    text NOT NULL CHECK (category IN ('sleep','exercise','memo','condition','meal','review')),
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_user_date ON entries (user_id, date DESC);
-- ふりかえりは1日1件
CREATE UNIQUE INDEX IF NOT EXISTS entries_one_review_per_day
  ON entries (user_id, date) WHERE category = 'review';

-- AI機能の利用履歴（1回=1行）。無料枠の判定と、利用者ごとのAI費用の把握に使う
--   kind: 'voice'（音声入力）| 'review'（ふりかえり）| 'calorie'（カロリー推定）| 'chat'（相棒とのチャット）
CREATE TABLE IF NOT EXISTS ai_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_events_user_kind_time ON ai_events (user_id, kind, created_at DESC);
DROP TABLE IF EXISTS ai_usage;

-- Stripe の契約状態
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  status                  text,               -- 'active' | 'trialing' | 'past_due' | 'canceled' ...
  current_period_end      timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub ON subscriptions (stripe_subscription_id);

-- 端末をまたいだ小さな設定（選んだキャラクターなど）。ログインしている利用者に
-- 紐づくので、PCでもスマホでも同じ内容になる
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 無料トライアルの終了日時。新規登録時（Stripeを設定した後）だけ入る（lib/billing.js）。
-- NULLの利用者（この機能を入れる前からの登録）はトライアルの対象にしない＝据え置きでずっと使える
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
