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

-- AI機能（音声入力・ふりかえり）の月ごとの利用回数。無料枠の判定に使う
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       char(7) NOT NULL,                -- 'YYYY-MM'
  voice       integer NOT NULL DEFAULT 0,
  review      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- Stripe の契約状態（Step 1 の後半で使う）
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  status                  text,               -- 'active' | 'past_due' | 'canceled' ...
  current_period_end      timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
