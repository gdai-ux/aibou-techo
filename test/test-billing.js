// 契約状態（lib/billing.js）の判定と、Stripe webhookの署名検証を確認する。
// Stripeへネットワークで問い合わせる部分（Checkout・カスタマーポータルの作成）は
// 実際のアカウントが要るためここではテストしない。署名検証はStripeのSDKが
// ネットワーク無しでできる（HMACの計算だけ）ので、ここで確認できる。
const assert = require('assert');

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_ID = 'price_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
process.env.TRIAL_DAYS = '7';

const billing = require(require('path').join(__dirname, '..', 'lib', 'billing'));
const Stripe = require('stripe');

// --- billingEnabled ---
assert.strictEqual(billing.billingEnabled(), true, '3つとも設定していれば有効');
delete process.env.STRIPE_WEBHOOK_SECRET;
assert.strictEqual(billing.billingEnabled(), false, '1つでも欠ければ無効');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';

// --- decide()：純粋な判定 ---
const now = new Date('2026-09-08T00:00:00Z');

// 手動プレミアム（plan='premium'）は他の状態より優先
assert.deepStrictEqual(
  billing.decide({ plan: 'premium', trialEndsAt: null, subscription: null }, now),
  { access: true, aiPlan: 'premium', state: 'comp' }
);

// Stripeで契約中（active）
{
  const r = billing.decide({ plan: 'free', trialEndsAt: null, subscription: { status: 'active', currentPeriodEnd: new Date('2026-10-01') } }, now);
  assert.strictEqual(r.access, true);
  assert.strictEqual(r.aiPlan, 'premium');
  assert.strictEqual(r.state, 'active');
}
// 支払い再試行中（past_due）もブロックしない
{
  const r = billing.decide({ plan: 'free', trialEndsAt: null, subscription: { status: 'past_due' } }, now);
  assert.strictEqual(r.access, true);
  assert.strictEqual(r.state, 'past_due');
}
// 解約済み（canceled）はブロック対象。トライアルも切れていれば expired
{
  const r = billing.decide({ plan: 'free', trialEndsAt: new Date('2026-09-01'), subscription: { status: 'canceled' } }, now);
  assert.strictEqual(r.access, false);
  assert.strictEqual(r.aiPlan, 'free');
  assert.strictEqual(r.state, 'expired');
}

// trial_ends_at が無い（この機能より前からの利用者）→ 据え置きでずっと使える
{
  const r = billing.decide({ plan: 'free', trialEndsAt: null, subscription: null }, now);
  assert.deepStrictEqual(r, { access: true, aiPlan: 'free', state: 'grandfathered' });
}

// トライアル中（残り日数の計算も確認）
{
  const trialEndsAt = new Date('2026-09-10T00:00:00Z'); // nowから2日後
  const r = billing.decide({ plan: 'free', trialEndsAt, subscription: null }, now);
  assert.strictEqual(r.access, true);
  assert.strictEqual(r.aiPlan, 'premium', 'トライアル中はAI機能も無制限扱い');
  assert.strictEqual(r.state, 'trial');
  assert.strictEqual(r.daysLeft, 2);
}
// トライアルが切れた
{
  const trialEndsAt = new Date('2026-09-01T00:00:00Z');
  const r = billing.decide({ plan: 'free', trialEndsAt, subscription: null }, now);
  assert.strictEqual(r.access, false);
  assert.strictEqual(r.aiPlan, 'free');
  assert.strictEqual(r.state, 'expired');
}
// 切れる直前（残り1日未満でも「あと1日」と出す。0日と出て「今日中」に見えないように）
{
  const trialEndsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3時間後
  const r = billing.decide({ plan: 'free', trialEndsAt, subscription: null }, now);
  assert.strictEqual(r.access, true);
  assert.strictEqual(r.daysLeft, 1);
}

console.log('  decide() の判定パターンを確認');

// --- newTrialEndsAt ---
{
  const base = new Date('2026-09-08T10:00:00Z');
  const end = billing.newTrialEndsAt(base);
  assert.strictEqual(end.getTime() - base.getTime(), 7 * 24 * 60 * 60 * 1000);
}
console.log('  newTrialEndsAt() がTRIAL_DAYS日後になる');

// --- serializeStatus ---
{
  const s = billing.serializeStatus({ access: true, aiPlan: 'premium', state: 'trial', trialEndsAt: now, daysLeft: 2 });
  assert.strictEqual(typeof s.trialEndsAt, 'number');
  assert.strictEqual(s.trialEndsAt, now.getTime());
}
console.log('  serializeStatus() がDateをミリ秒に変換する');

// --- requireAccess ミドルウェア：billing無効なら常に通す ---
{
  delete process.env.STRIPE_SECRET_KEY;
  let called = false;
  billing.requireAccess({ user: { id: 'u1' } }, { status: () => { throw new Error('呼ばれないはず'); } }, () => { called = true; });
  assert.strictEqual(called, true, 'Stripe未設定なら判定せず通す');
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
}
// 未ログインも素通し（各ルート側のLOGIN_REQUIREDに任せる）
{
  let called = false;
  billing.requireAccess({ user: null }, {}, () => { called = true; });
  assert.strictEqual(called, true, '未ログインは素通しする');
}
console.log('  requireAccess() の素通り条件を確認');

// --- Stripe webhookの署名検証（ネットワーク無し。Stripe SDK自体のHMAC機能を使う） ---
{
  const payload = JSON.stringify({
    id: 'evt_test1', type: 'checkout.session.completed',
    data: { object: { id: 'cs_test1', customer: 'cus_test1', subscription: 'sub_test1', metadata: { user_id: 'u1' } } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const event = billing.constructEvent(Buffer.from(payload), header);
  assert.strictEqual(event.type, 'checkout.session.completed');
  assert.strictEqual(event.data.object.metadata.user_id, 'u1');

  // 署名が違う（別の秘密鍵で作った）ヘッダーは弾かれる
  const badHeader = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
  assert.throws(() => billing.constructEvent(Buffer.from(payload), badHeader), /signature/i);
}
console.log('  Stripe webhookの署名検証（正しい署名は通り、不正な署名は弾く）');

// --- periodEndOf: Stripeのバージョンによる置き場所の違いを吸収する ---
{
  assert.strictEqual(billing.periodEndOf({ current_period_end: 111 }), 111);
  assert.strictEqual(billing.periodEndOf({ items: { data: [{ current_period_end: 222 }] } }), 222);
  assert.strictEqual(billing.periodEndOf({}), null);
}
console.log('  periodEndOf() がAPIバージョン違いを吸収する');

console.log('\nALL ASSERTIONS PASSED');
