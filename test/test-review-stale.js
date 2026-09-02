// 記録を直した後に開いた時、保存済みのふりかえりが古ければ自動で書き直すことを確認する。
// （編集した端末とは別の端末で開いた場合や、編集がアプリ外で行われた場合にも効く）
const assert = require('assert');
process.env.OBSIDIAN_FILE_PATH = '';
process.env.NOTION_TOKEN = 'tok';
process.env.NOTION_PAGE_ID = 'page-1';
process.env.OPENAI_API_KEY = 'test-key';
process.env.PORT = '4893';

const { todayInfo } = require(require('path').join(__dirname, '..', 'lib', 'format'));
const y = todayInfo();

// 睡眠の記録の方が、ふりかえりより後に編集されている状態を作る
const OLD = '2026-09-01T07:00:00.000Z';
const NEW = '2026-09-01T07:20:00.000Z';
let blocks = [
  { id: 'h1', type: 'heading_2', last_edited_time: OLD, heading_2: { rich_text: [{ plain_text: `${y.dateStr}（${y.weekday}）` }] } },
  { id: 'b1', type: 'paragraph', last_edited_time: NEW, paragraph: { rich_text: [{ plain_text: '睡眠：23:30就寝、06:30起床（7時間0分）' }] } },
  { id: 'rv0', type: 'paragraph', last_edited_time: OLD, paragraph: { rich_text: [{ plain_text: '振り返り：たっぷり16時間35分の睡眠を確保したな！' }] } },
];
const systemPrompts = [];
let written = null;

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const j = (o) => ({ ok: true, json: async () => o });
  if (u.includes('api.openai.com')) {
    systemPrompts.push(JSON.parse(opts.body).messages[1].content);
    return j({ choices: [{ message: { content: '7時間睡眠、よくやった！' } }] });
  }
  if (u.includes('/blocks/page-1/children') && method === 'GET') return j({ results: blocks, has_more: false, next_cursor: null });
  const m = u.match(/\/v1\/blocks\/(rv\d+)$/);
  if (m && method === 'PATCH') {
    written = JSON.parse(opts.body).paragraph.rich_text.map((r) => r.text.content).join('');
    const blk = blocks.find((b) => b.id === m[1]);
    blk.paragraph.rich_text = [{ plain_text: written }];
    blk.last_edited_time = '2026-09-01T07:30:00.000Z'; // 書き直したので新しくなる
    return j({ id: m[1] });
  }
  return { ok: false, status: 404, json: async () => ({ message: 'unexpected: ' + method + ' ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));
const http = require('node:http');
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:4893${path}`, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}

setTimeout(async () => {
  // 1. 記録の方が新しい → 開いただけで書き直される
  const r1 = await get('/api/review?tone=normal');
  assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
  assert.strictEqual(r1.body.comment, '7時間睡眠、よくやった！', '古いふりかえりが書き直される');
  assert.ok(systemPrompts[0].includes('23:30就寝'), '直した後の記録で作り直している');
  assert.ok(written && written.includes('7時間睡眠'), '保存済みのふりかえりも書き換わる');
  console.log('  記録の方が新しい時は書き直す OK');

  // 2. もう一度開いても、今度は書き直さない（毎回OpenAIを呼ばない）
  const before = systemPrompts.length;
  const r2 = await get('/api/review?tone=normal');
  assert.strictEqual(r2.body.comment, '7時間睡眠、よくやった！');
  assert.strictEqual(systemPrompts.length, before, '書き直しは1回だけ');
  console.log('  次に開いた時は書き直さない OK');

  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
}, 800);
