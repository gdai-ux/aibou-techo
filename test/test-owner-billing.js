// 運営者のアカウントは、トライアルの対象にせず案内も出さない
const assert = require('assert');
process.env.OWNER_EMAILS = ' Owner@Example.com , second@example.com';
delete require.cache[require.resolve('../lib/billing')];
const billing = require(require('path').join(__dirname, '..', 'lib/billing'));

const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
const ok = (c, m) => { if (!c) { console.error('  NG:', m); process.exitCode = 1; } else console.log('  ok:', m); };

// 期限切れの行でも、運営者なら使える
const owner = billing.decide({ plan: 'free', trialEndsAt: past, email: 'owner@example.com', subscription: null });
ok(owner.access === true, '期限が過ぎていても記録できる');
ok(owner.state === 'owner', '状態は owner（trial でも expired でもない）');

// 画面側は state が trial/expired/past_due の時だけ案内を出すので、
// owner ならバナーもモーダルも出ない
ok(!['trial', 'expired', 'past_due'].includes(owner.state), '案内を出す状態に当てはまらない');

// 大文字・空白の違いは無視する
ok(billing.isOwner(' OWNER@EXAMPLE.COM ') === true, '大文字と空白の違いは無視する');
ok(billing.isOwner('second@example.com') === true, 'カンマ区切りで複数指定できる');

// ほかの人はこれまで通り
const other = billing.decide({ plan: 'free', trialEndsAt: past, email: 'someone@example.com', subscription: null });
ok(other.access === false && other.state === 'expired', 'ほかの利用者はこれまで通り期限切れになる');
const noEmail = billing.decide({ plan: 'free', trialEndsAt: past, email: null, subscription: null });
ok(noEmail.state === 'expired', 'メールが無い行でも誤って通さない');

// 環境変数を入れ忘れても、既定の運営者は無料で使えること
delete process.env.OWNER_EMAILS;
delete require.cache[require.resolve('../lib/billing')];
const fallback = require(require('path').join(__dirname, '..', 'lib/billing'));
const mine = fallback.decide({ plan: 'free', trialEndsAt: past, email: 'gachidai@gmail.com', subscription: null });
ok(mine.access === true && mine.state === 'owner', '環境変数なしでも、既定の運営者は無料で使える');
ok(fallback.decide({ plan: 'free', trialEndsAt: past, email: 'x@y.z', subscription: null }).state === 'expired',
  '環境変数なしでも、ほかの利用者はこれまで通り');

if (!process.exitCode) console.log('\nALL ASSERTIONS PASSED');
