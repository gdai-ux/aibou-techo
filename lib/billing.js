// 契約状態（無料トライアル・Stripeの定期契約）の判定と、Stripeとのやり取り。
//
// 新規登録から TRIAL_DAYS 日（既定7日）はアプリの全機能を無料で使える。
// 期限を過ぎても契約していない利用者は、記録の書き込み（新規記録・編集・削除・
// 音声入力・AI機能）だけを止める。読み取り・CSV書き出しはいつでもできる
// （データを人質にしないため）。
//
// STRIPE_SECRET_KEY / STRIPE_PRICE_ID / STRIPE_WEBHOOK_SECRET のいずれかが
// 設定されていない環境（Stripeをまだ設定していない・開発中）では、この機能は
// まるごと無効になり、これまで通り誰でも使える（billingEnabled() が false）。
//
// この機能を入れる前からの利用者（trial_ends_at が無い行）は、トライアルの
// 対象にしない（access は常に true。「据え置き」として扱う）。Stripeを有効に
// した日より前に登録した利用者は、そのまま使い続けられる。

const { query } = require('./db');

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);
// 支払いの再試行中（past_due）はブロックしない。Stripe側の自動再試行に任せる
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

// 新規登録時の、トライアル終了日時（今から TRIAL_DAYS 日後）。
// billingEnabled() が false の間に登録した利用者には呼ばない（＝trial_ends_atはNULLのまま＝据え置き）
function newTrialEndsAt(now = new Date()) {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

// row（users.plan・users.trial_ends_at・subscriptionsの1行）から契約状態を決める。
// DB・Stripeを呼ばない純粋な判定なのでテストしやすい
function decide(row, now = new Date()) {
  // plan='premium' は手動で付与した無料プレミアム（友人・家族など）
  if (row.plan === 'premium') return { access: true, aiPlan: 'premium', state: 'comp' };
  const sub = row.subscription;
  if (sub && ACTIVE_STATUSES.includes(sub.status)) {
    return { access: true, aiPlan: 'premium', state: sub.status, currentPeriodEnd: sub.currentPeriodEnd || null };
  }
  if (row.trialEndsAt == null) return { access: true, aiPlan: 'free', state: 'grandfathered' };
  const trialEndsAt = new Date(row.trialEndsAt);
  if (now < trialEndsAt) {
    const daysLeft = Math.max(1, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)));
    return { access: true, aiPlan: 'premium', state: 'trial', trialEndsAt, daysLeft };
  }
  return { access: false, aiPlan: 'free', state: 'expired', trialEndsAt };
}

async function loadRow(userId) {
  const u = await query(`SELECT plan, trial_ends_at FROM users WHERE id = $1`, [userId]);
  if (!u.rows[0]) return { plan: 'free', trialEndsAt: null, subscription: null };
  const s = await query(`SELECT status, current_period_end FROM subscriptions WHERE user_id = $1`, [userId]);
  const subRow = s.rows[0];
  return {
    plan: u.rows[0].plan,
    trialEndsAt: u.rows[0].trial_ends_at,
    subscription: subRow && subRow.status ? { status: subRow.status, currentPeriodEnd: subRow.current_period_end } : null,
  };
}

async function status(userId) {
  return decide(await loadRow(userId));
}

// 記録の書き込み系ルートの手前に置くミドルウェア。billingが無効（Stripe未設定）や
// 未ログインの時は素通しする（未ログインは各ルート側のLOGIN_REQUIREDに任せる）
function requireAccess(req, res, next) {
  if (!billingEnabled() || !req.user) return next();
  status(req.user.id)
    .then((st) => {
      if (st.access) return next();
      res.status(402).json({ error: '無料トライアルの期限が過ぎました。続けるには登録してください。', billing: serializeStatus(st) });
    })
    .catch((err) => {
      console.error('[aibou-techo] 契約状態の確認に失敗:', err.message);
      next(); // 判定できなかった時は、記録できなくなるより通す方を選ぶ
    });
}

// 画面に渡す形（Dateはミリ秒に）
function serializeStatus(st) {
  return {
    ...st,
    trialEndsAt: st.trialEndsAt ? new Date(st.trialEndsAt).getTime() : null,
    currentPeriodEnd: st.currentPeriodEnd ? new Date(st.currentPeriodEnd).getTime() : null,
  };
}

// --- Stripe連携 ---

async function ensureCustomer(userId, email) {
  const r = await query(`SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`, [userId]);
  if (r.rows[0] && r.rows[0].stripe_customer_id) return r.rows[0].stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, metadata: { user_id: userId } });
  await query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()`,
    [userId, customer.id]
  );
  return customer.id;
}

// 登録（アップグレード）ページのURLを作る。baseUrl は "https://example.com" の形
async function createCheckoutUrl(userId, email, baseUrl) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripeが設定されていません');
  const customerId = await ensureCustomer(userId, email);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${baseUrl}/index.html?billing=success`,
    cancel_url: `${baseUrl}/index.html?billing=cancel`,
    allow_promotion_codes: true,
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId } },
  });
  return session.url;
}

// 支払い方法の変更・解約ができる、Stripeの管理画面（カスタマーポータル）のURL
async function createPortalUrl(userId, baseUrl) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripeが設定されていません');
  const r = await query(`SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`, [userId]);
  const customerId = r.rows[0] && r.rows[0].stripe_customer_id;
  if (!customerId) throw new Error('お支払いの情報がまだありません');
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${baseUrl}/index.html` });
  return portal.url;
}

// Webhookの生ボディを検証してイベントを取り出す（署名が不正なら例外を投げる）
function constructEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripeが設定されていません');
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// サブスクリプションの契約期間の終わり（Stripeのバージョンによって置き場所が違うので両方見る）
function periodEndOf(sub) {
  if (sub.current_period_end) return sub.current_period_end;
  const item = sub.items && sub.items.data && sub.items.data[0];
  return item ? item.current_period_end : null;
}

async function upsertSubscription(userId, customerId, sub) {
  const periodEnd = periodEndOf(sub);
  await query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = now()`,
    [userId, customerId, sub.id || null, sub.status, periodEnd ? new Date(periodEnd * 1000) : null]
  );
}

async function upsertSubscriptionByCustomer(customerId, sub) {
  const r = await query(`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`, [customerId]);
  if (!r.rows[0]) return; // このアプリ経由で作られた顧客でなければ何もしない
  await upsertSubscription(r.rows[0].user_id, customerId, sub);
}

// Webhookイベントを subscriptions テーブルへ反映する。
// 対応イベント: checkout.session.completed（初回契約）、
// customer.subscription.updated/created（更新・再開・支払い失敗による past_due 等）、
// customer.subscription.deleted（解約完了）
async function applyEvent(event) {
  const obj = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const userId = obj.metadata && obj.metadata.user_id;
    if (!userId || !obj.subscription) return;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(obj.subscription);
    await upsertSubscription(userId, obj.customer, sub);
    return;
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const userId = obj.metadata && obj.metadata.user_id;
    if (userId) return upsertSubscription(userId, obj.customer, obj);
    return upsertSubscriptionByCustomer(obj.customer, obj);
  }
  if (event.type === 'customer.subscription.deleted') {
    const userId = obj.metadata && obj.metadata.user_id;
    const canceled = { ...obj, status: 'canceled' };
    if (userId) return upsertSubscription(userId, obj.customer, canceled);
    return upsertSubscriptionByCustomer(obj.customer, canceled);
  }
}

module.exports = {
  TRIAL_DAYS, billingEnabled, newTrialEndsAt, decide, loadRow, status, serializeStatus, requireAccess,
  createCheckoutUrl, createPortalUrl, constructEvent, applyEvent, periodEndOf,
};
