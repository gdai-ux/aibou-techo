// ふりかえりの口調モード: 生成プロンプトへの反映と、口調を変えた時の書き換えを確認する。
const assert = require('assert');
process.env.OBSIDIAN_FILE_PATH = '';
process.env.NOTION_TOKEN = 'tok';
process.env.NOTION_PAGE_ID = 'page-1';
process.env.OPENAI_API_KEY = 'test-key';
process.env.PORT = '4885';

const { todayInfo } = require(require('path').join(__dirname, '..', 'lib', 'format'));
const y = todayInfo();

let blocks = [
  { id: 'h1', type: 'heading_2', heading_2: { rich_text: [{ plain_text: `${y.dateStr}（${y.weekday}）` }] } },
  { id: 'b1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'メモ：08:00 二度寝した' }] } },
];
const systemPrompts = [];
const userPrompts = [];
let reviewBlockText = null;

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const j = (o) => ({ ok: true, json: async () => o });
  if (u.includes('api.openai.com')) {
    const body = JSON.parse(opts.body);
    systemPrompts.push(body.messages[0].content);
    userPrompts.push(body.messages[1].content);
    return j({ choices: [{ message: { content: 'いいから走れ。' } }] });
  }
  if (u.includes('/blocks/page-1/children') && method === 'GET') {
    return j({ results: blocks, has_more: false, next_cursor: null });
  }
  if (u.includes('/blocks/page-1/children') && method === 'PATCH') {
    // ふりかえりの追記
    const body = JSON.parse(opts.body);
    body.children.forEach((c, i) => blocks.push({ id: 'rv' + i, type: 'paragraph', paragraph: { rich_text: c.paragraph.rich_text.map((r) => ({ plain_text: r.text.content })) } }));
    return j({ results: [] });
  }
  const m = u.match(/\/v1\/blocks\/(rv\d+)$/);
  if (m && method === 'PATCH') {
    const body = JSON.parse(opts.body);
    reviewBlockText = body.paragraph.rich_text.map((r) => r.text.content).join('');
    const blk = blocks.find((b) => b.id === m[1]);
    blk.paragraph.rich_text = body.paragraph.rich_text.map((r) => ({ plain_text: r.text.content }));
    return j({ id: m[1] });
  }
  return { ok: false, status: 404, json: async () => ({ message: 'unexpected: ' + method + ' ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));
const http = require('node:http');
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:4885${path}`, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}

setTimeout(async () => {
  // 1. 超スパルタで生成 → プロンプトに鬼コーチの指示が入る
  const r1 = await get('/api/review?tone=oni');
  assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
  assert.ok(systemPrompts[0].includes('鬼コーチ'), '超スパルタの指示が入る');
  assert.ok(systemPrompts[0].includes('人格否定'), '安全の歯止めが入る');
  assert.ok(systemPrompts[0].includes('健康を害する指示'), '健康を害する指示をさせない歯止めが入る');
  console.log('  超スパルタのプロンプト反映 OK');

  // 2. 保存済みなら再生成しない
  const before = systemPrompts.length;
  await get('/api/review?tone=sweet');
  assert.strictEqual(systemPrompts.length, before, '保存済みは再生成しない');

  // 3. regenerate=1 なら新しい口調で書き換える。「たった今増えた記録」と
  //    前回のコメントもプロンプトに入り、毎回少しずつ違うコメントになる
  const r3 = await get('/api/review?tone=sweet&regenerate=1&latest=' + encodeURIComponent('運動（ランニング30分）'));
  assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
  assert.ok(systemPrompts[systemPrompts.length - 1].includes('全肯定'), '超やさしいの指示が入る');
  assert.ok(reviewBlockText && reviewBlockText.includes('いいから走れ。'), '保存済みブロックが書き換わる');
  const lastUser = userPrompts[userPrompts.length - 1];
  assert.ok(lastUser.includes('たった今増えた記録: 運動（ランニング30分）'), '増えた記録が渡る');
  assert.ok(lastUser.includes('前回のコメント') && lastUser.includes('いいから走れ。'), '前回のコメントが渡る');
  assert.ok(lastUser.includes('今回の切り口:'), '毎回ちがう切り口が渡る');
  assert.ok(lastUser.includes('今回の書き出しの型:'), '毎回ちがう書き出しの型が渡る');
  console.log('  口調変更での書き換え OK');

  // 4. 不正な口調は既定（ふつう）扱い
  blocks = blocks.filter((b) => !b.id.startsWith('rv'));
  const r4 = await get('/api/review?tone=hack');
  assert.strictEqual(r4.status, 200);
  assert.ok(systemPrompts[systemPrompts.length - 1].includes('口調モード: ふつう'), '不正値は既定に落ちる');

  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
}, 800);
