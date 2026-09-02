// Web版（STORAGE=pg）: ログイン必須・自前DBで、記録→履歴→編集→ふりかえり→削除が
// 一通り動き、他人の記録に触れないことを確認する。
// 実際の Postgres が必要なので DATABASE_URL が無ければ飛ばす（CIでは必ず流れる）。
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.log('  DATABASE_URL が無いので飛ばします（CIでは実行されます）');
  process.exit(0);
}

process.env.STORAGE = 'pg';
process.env.SUPABASE_JWT_SECRET = 'test-secret-for-aibou';
process.env.OPENAI_API_KEY = 'test-key';
process.env.OBSIDIAN_FILE_PATH = '';
delete process.env.NOTION_TOKEN;
delete process.env.NOTION_PAGE_ID;
process.env.PORT = '4890';

const { signTestToken } = require(path.join(__dirname, '..', 'lib', 'auth'));
const { todayInfo } = require(path.join(__dirname, '..', 'lib', 'format'));

// OpenAI だけモックする（DBは本物）。fetch を差し替える前に本物を退避して、
// サーバー自身への呼び出しはそのまま通す
const realFetch = global.fetch;
let openaiCalls = 0;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.openai.com')) {
    openaiCalls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: `コメント${openaiCalls}` } }] }) };
  }
  return realFetch(url, opts);
};

require(path.join(__dirname, '..', 'server.js'));

const BASE = 'http://localhost:4890';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await realFetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: resp.status, data: await resp.json() };
}

(async () => {
  await wait(1500); // 起動（スキーマ適用）待ち
  const me = { id: crypto.randomUUID(), email: 'me@example.com' };
  const other = { id: crypto.randomUUID(), email: 'other@example.com' };
  const tokMe = await signTestToken(me, process.env.SUPABASE_JWT_SECRET);
  const tokOther = await signTestToken(other, process.env.SUPABASE_JWT_SECRET);
  const tokBad = await signTestToken(me, 'wrong-secret');

  // --- 未ログイン / 不正トークン ---
  let r = await api('GET', '/api/history');
  assert.strictEqual(r.status, 401, '未ログインは401');
  assert.strictEqual(r.data.error, 'ログインが必要です。');
  r = await api('GET', '/api/history', { token: tokBad });
  assert.strictEqual(r.status, 401, '署名が違うトークンは401');
  r = await api('GET', '/api/status');
  assert.deepStrictEqual([r.data.mode, r.data.authRequired, r.data.loggedIn], ['pg', true, false]);
  r = await api('GET', '/api/status', { token: tokMe });
  assert.deepStrictEqual([r.data.loggedIn, r.data.email, r.data.storage], [true, 'me@example.com', 'pg']);
  console.log('  auth OK');

  // --- 記録 → 履歴 ---
  r = await api('POST', '/api/entry', { token: tokMe, body: { category: 'memo', payload: { time: '08:00', content: '二度寝した' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await api('POST', '/api/entry', { token: tokMe, body: { category: 'meal', payload: { time: '07:30', mealType: '朝食', items: ['白米', '味噌汁'] } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await api('GET', '/api/history?days=7', { token: tokMe });
  assert.strictEqual(r.status, 200);
  const today = r.data.days.find((d) => d.dateStr === todayInfo().dateStr);
  assert.ok(today, '今日の記録がある');
  assert.strictEqual(today.memo[0].content, '二度寝した');
  assert.deepStrictEqual(today.meals[0].items, ['07:30 白米', '07:30 味噌汁']);
  const memoId = today.memo[0].blockId;
  const mealId = today.meals[0].blockId;
  console.log('  entry/history OK');

  // --- 他人には見えない・触れない ---
  r = await api('GET', '/api/history?days=7', { token: tokOther });
  assert.strictEqual(r.data.days.length, 0, '他人の履歴は空');
  r = await api('PUT', '/api/entry/meta', { token: tokOther, body: { blockId: memoId, category: 'memo', payload: { time: '08:00', content: '乗っ取り' } } });
  assert.strictEqual(r.status, 500);
  assert.ok(/記録が見つかりません/.test(r.data.error));
  console.log('  isolation OK');

  // --- 編集（キャッシュが捨てられて最新が返る） ---
  r = await api('PUT', '/api/entry/meta', { token: tokMe, body: { blockId: memoId, category: 'memo', payload: { time: '08:30', content: '三度寝した' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await api('PUT', '/api/entry/meal', { token: tokMe, body: { mealBlockId: mealId, mealType: '朝食', items: ['07:30 白米', '07:30 味噌汁', '07:30 納豆'] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await api('GET', '/api/history?days=7', { token: tokMe });
  const t2 = r.data.days.find((d) => d.dateStr === todayInfo().dateStr);
  assert.strictEqual(t2.memo[0].content, '三度寝した');
  assert.strictEqual(t2.meals[0].items.length, 3);
  console.log('  edit OK');

  // --- ふりかえり: 1回目は生成して保存、2回目は保存済みを返す（OpenAIは呼ばない） ---
  // （カロリー推定でもOpenAIのモックが呼ばれるので、回数は「ここから何回増えたか」で見る）
  const before = openaiCalls;
  r = await api('GET', '/api/review', { token: tokMe });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(openaiCalls, before + 1, '1回目は生成する');
  const first = r.data.comment;
  assert.strictEqual(first, `コメント${openaiCalls}`);
  r = await api('GET', '/api/review', { token: tokMe });
  assert.strictEqual(r.data.comment, first);
  assert.strictEqual(openaiCalls, before + 1, '保存済みなら再生成しない');
  r = await api('GET', '/api/review?regenerate=1', { token: tokMe });
  assert.strictEqual(openaiCalls, before + 2, '作り直すと生成し直す');
  const second = r.data.comment;
  assert.notStrictEqual(second, first, '作り直すと新しいコメントに置き換わる');
  r = await api('GET', '/api/history?days=7', { token: tokMe });
  assert.strictEqual(r.data.days.find((d) => d.dateStr === todayInfo().dateStr).review.content, second, '履歴のふりかえりも書き換わる');
  // 他人にはふりかえりも無い（今日の記録が無いので固定メッセージ）
  r = await api('GET', '/api/review', { token: tokOther });
  assert.strictEqual(r.data.hasData, false);
  console.log('  review OK');

  // --- 削除 ---
  r = await api('DELETE', `/api/entry/meta/${memoId}`, { token: tokMe });
  assert.strictEqual(r.status, 200);
  r = await api('DELETE', `/api/entry/meal/${mealId}`, { token: tokMe });
  assert.strictEqual(r.status, 200);
  r = await api('GET', '/api/history?days=7', { token: tokMe });
  const t3 = r.data.days.find((d) => d.dateStr === todayInfo().dateStr);
  assert.strictEqual(t3.memo.length, 0);
  assert.strictEqual(t3.meals.length, 0);
  // 移行はpgモードでは不要
  r = await api('POST', '/api/migrate-db', { token: tokMe, body: {} });
  assert.strictEqual(r.status, 400);
  console.log('  delete OK');

  // 後片付け
  const pgStore = require(path.join(__dirname, '..', 'lib', 'pgStore'));
  await pgStore.deleteUser(me.id);
  await pgStore.deleteUser(other.id);
  console.log('ALL ASSERTIONS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
