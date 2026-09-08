// 有料登録の一連の流れを、実際のサーバー・実際のPostgresで確認する。
// Stripeへのネットワーク呼び出しは行わない（checkout.session.completed は
// stripe.subscriptions.retrieve を呼ぶため確認から外し、customer.subscription.*
// は送られてきたオブジェクトをそのまま使うのでネットワーク無しで確認できる）:
//   1. 登録直後（トライアル中）は記録できる
//   2. トライアルが切れると、記録の書き込みだけ止まる（読み取りはできる）
//   3. Stripeから「契約が始まった」というwebhookが来ると、また書き込める
//   4. 「解約された」というwebhookが来て、トライアルも切れていれば、また止まる
//   5. この機能を入れる前からの利用者（trial_ends_atが無い）は、切れることなく使える
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.log('  DATABASE_URL が無いので飛ばします（CIでは実行されます）');
  process.exit(0);
}

process.env.STORAGE = 'pg';
process.env.SUPABASE_JWT_SECRET = 'test-secret-for-aibou';
process.env.OBSIDIAN_FILE_PATH = '';
delete process.env.NOTION_TOKEN;
delete process.env.NOTION_PAGE_ID;
delete process.env.OPENAI_API_KEY;
process.env.PORT = '4891';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_ID = 'price_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
process.env.TRIAL_DAYS = '7';

const { signTestToken } = require(path.join(__dirname, '..', 'lib', 'auth'));
const { query } = require(path.join(__dirname, '..', 'lib', 'db'));
const Stripe = require('stripe');

require(path.join(__dirname, '..', 'server.js'));

const BASE = 'http://localhost:4891';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: resp.status, data: await resp.json() };
}

async function postWebhook(eventPayload) {
  const payload = JSON.stringify(eventPayload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const resp = await fetch(BASE + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  return { status: resp.status, data: await resp.json() };
}

(async () => {
  await wait(1500); // 起動（スキーマ適用）待ち
  const user = { id: crypto.randomUUID(), email: 'trial@example.com' };
  const token = await signTestToken(user, process.env.SUPABASE_JWT_SECRET);
  const legacy = { id: crypto.randomUUID(), email: 'legacy@example.com' };
  const tokenLegacy = await signTestToken(legacy, process.env.SUPABASE_JWT_SECRET);

  // 1. 登録直後（トライアル中）
  let r = await api('GET', '/api/status', { token });
  assert.strictEqual(r.data.billingEnabled, true);
  assert.strictEqual(r.data.billing.state, 'trial');
  assert.strictEqual(r.data.billing.access, true);
  assert.ok(r.data.billing.daysLeft >= 6 && r.data.billing.daysLeft <= 7, `daysLeft=${r.data.billing.daysLeft}`);

  r = await api('POST', '/api/entry', { token, body: { category: 'memo', payload: { time: '08:00', content: 'トライアル中のメモ' } } });
  assert.ok(r.status === 200 || r.status === 207, JSON.stringify(r.data));
  console.log('  トライアル中は記録できる');

  // 2. トライアルを切れさせる（DBを直接書き換えて模擬）
  await query(`UPDATE users SET trial_ends_at = now() - interval '1 hour' WHERE id = $1`, [user.id]);
  r = await api('GET', '/api/status', { token });
  assert.strictEqual(r.data.billing.state, 'expired');
  assert.strictEqual(r.data.billing.access, false);

  r = await api('POST', '/api/entry', { token, body: { category: 'memo', payload: { time: '08:05', content: '切れた後のメモ' } } });
  assert.strictEqual(r.status, 402, JSON.stringify(r.data));
  assert.strictEqual(r.data.billing.state, 'expired');
  // 読み取りは止めない（データを人質にしない）
  r = await api('GET', '/api/history', { token });
  assert.strictEqual(r.status, 200);
  console.log('  トライアルが切れると書き込みだけ止まり、読み取りはできる');

  // 3. Stripeからの「契約が始まった」通知（customer.subscription.updated）
  const customerId = `cus_test_${user.id.slice(0, 8)}`;
  let w = await postWebhook({
    id: 'evt_active', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_test1', customer: customerId, status: 'active', metadata: { user_id: user.id }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 } },
  });
  assert.strictEqual(w.status, 200, JSON.stringify(w.data));

  r = await api('GET', '/api/status', { token });
  assert.strictEqual(r.data.billing.state, 'active');
  assert.strictEqual(r.data.billing.access, true);
  r = await api('POST', '/api/entry', { token, body: { category: 'memo', payload: { time: '08:10', content: '契約後のメモ' } } });
  assert.ok(r.status === 200 || r.status === 207, JSON.stringify(r.data));
  console.log('  契約が始まったwebhookが来ると、また記録できる');

  // customer_id 経由（metadataが無い更新）でも同じ利用者に反映されることを確認
  w = await postWebhook({
    id: 'evt_pastdue', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_test1', customer: customerId, status: 'past_due', items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60 }] } } },
  });
  assert.strictEqual(w.status, 200);
  r = await api('GET', '/api/status', { token });
  assert.strictEqual(r.data.billing.state, 'past_due');
  assert.strictEqual(r.data.billing.access, true, '支払い再試行中はブロックしない');
  console.log('  customer_id だけの更新（past_due）も同じ利用者に反映され、ブロックされない');

  // 4. 解約された（トライアルも切れているので、今度こそ止まる）
  w = await postWebhook({
    id: 'evt_deleted', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_test1', customer: customerId, status: 'canceled' } },
  });
  assert.strictEqual(w.status, 200);
  r = await api('GET', '/api/status', { token });
  assert.strictEqual(r.data.billing.state, 'expired');
  r = await api('POST', '/api/entry', { token, body: { category: 'memo', payload: { time: '08:20', content: '解約後のメモ' } } });
  assert.strictEqual(r.status, 402);
  console.log('  解約後は（トライアルも切れていれば）また書き込みが止まる');

  // 5. この機能より前からの利用者（trial_ends_at が最初から無い）は、ずっと使える
  await query(`INSERT INTO users (id, email, trial_ends_at) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING`, [legacy.id, legacy.email]);
  r = await api('GET', '/api/status', { token: tokenLegacy });
  assert.strictEqual(r.data.billing.state, 'grandfathered');
  assert.strictEqual(r.data.billing.access, true);
  r = await api('POST', '/api/entry', { token: tokenLegacy, body: { category: 'memo', payload: { time: '09:00', content: '既存利用者のメモ' } } });
  assert.ok(r.status === 200 || r.status === 207, JSON.stringify(r.data));
  console.log('  既存の利用者（trial_ends_at無し）はトライアルの対象にならず、そのまま使える');

  // 不正な署名のwebhookは拒否される
  const badPayload = JSON.stringify({ id: 'evt_bad', type: 'customer.subscription.updated', data: { object: {} } });
  const badResp = await fetch(BASE + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    body: badPayload,
  });
  assert.strictEqual(badResp.status, 400);
  console.log('  署名が不正なwebhookは400で拒否される');

  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
