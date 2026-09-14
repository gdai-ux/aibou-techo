// 眠りの質（任意）が、保存する文言・読み戻し・pgの payload のどれでも
// 往復することを確かめる。質を入れない記録がこれまで通りであることも見る。
const path = require('path');
const { buildMetaText, SLEEP_QUALITIES } = require(path.join(__dirname, '..', 'lib/format'));
const { fetchHistory } = require(path.join(__dirname, '..', 'lib/history'));

let idSeq = 1;
let mockChildren = [];
const makeBlock = (type, rich) => ({ id: 'block-' + (idSeq++), type, [type]: rich });
const textBlock = (text) => makeBlock('paragraph', { rich_text: [{ plain_text: text }] });

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if ((opts.method || 'GET') === 'GET' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }
  throw new Error('unmocked: ' + url);
};

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('  NG:', msg); } else console.log('  ok:', msg); };

(async () => {
  check(SLEEP_QUALITIES.length === 5, '質は5段階ある: ' + SLEEP_QUALITIES.join('/'));

  // 質なしの文言は、これまでの記録と1文字も変わらないこと（過去の記録が読めなくなるため）
  const plain = buildMetaText('sleep', { bedtime: '23:30', wake: '07:00' });
  check(plain === '23:30就寝、07:00起床（7時間30分）', '質を選ばない時の文言は今まで通り');

  // 知らない値は弾く
  let threw = false;
  try { buildMetaText('sleep', { bedtime: '23:30', wake: '07:00', quality: 'さいこう' }); } catch (e) { threw = true; }
  check(threw, '一覧に無い質は保存させない');

  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-14（月）' }] }));
  mockChildren.push(textBlock(`睡眠：${buildMetaText('sleep', { bedtime: '23:30', wake: '07:00', quality: 'ぐっすり' })}`));
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-13（日）' }] }));
  mockChildren.push(textBlock(`睡眠：${plain}`));

  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });
  const withQ = days.find((d) => d.dateStr === '2026-09-14');
  const without = days.find((d) => d.dateStr === '2026-09-13');

  check(withQ.sleep.quality === 'ぐっすり', '質を読み戻せる');
  check(withQ.sleep.bedtime === '23:30' && withQ.sleep.wake === '07:00', '質が付いても就寝・起床は壊れない');
  check(withQ.sleep.totalMinutes === 450, '質が付いても睡眠時間は壊れない');
  check(!without.sleep.quality, '質なしの記録は空のまま');
  check(without.sleep.totalMinutes === 450, '質なしの記録も今まで通り読める');

  // pg側の payload も同じ形で持つこと
  // 本番はこちら（Postgres）。payloadに質が入り、質なしでも保存できること
  const { normalizePayload } = require(path.join(__dirname, '..', 'lib/pgStore'));
  check(normalizePayload('sleep', { bedtime: '23:30', wake: '07:00', quality: '浅い' }).quality === '浅い',
    'pgのpayloadに質が入る');
  check(normalizePayload('sleep', { bedtime: '23:30', wake: '07:00' }).quality === '',
    '質を選ばなくても保存できる');
  let pgThrew = false;
  try { normalizePayload('sleep', { bedtime: '23:30', wake: '07:00', quality: 'ばっちり' }); } catch (e) { pgThrew = true; }
  check(pgThrew, 'pg側でも一覧に無い質は弾く');

  if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
  console.log('\nALL ASSERTIONS PASSED');
})();
