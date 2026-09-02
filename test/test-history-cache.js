// /api/history のNotion読み込みが60秒キャッシュされ、書き込みで無効化されることを確認する。
const assert = require('assert');
const fs = require('fs');
const OBS = '/tmp/cache-obsidian-test.md';
fs.writeFileSync(OBS, '');

process.env.OBSIDIAN_FILE_PATH = OBS;
process.env.NOTION_TOKEN = 'test-token';
process.env.NOTION_PAGE_ID = 'test-page';
delete process.env.OPENAI_API_KEY;
process.env.PORT = '4870';

// Notionのblocks APIをメモリ上で再現する（読み取り回数を数える）
let notionReads = 0;
let blocks = [
  { id: 'h1', type: 'heading_2', heading_2: { rich_text: [{ plain_text: '2026-08-29（土）' }] }, has_children: false },
  { id: 'p1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'メモ：08:00 朝のメモ' }] }, has_children: false },
];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.notion.com') && u.includes('/children') && (!opts.method || opts.method === 'GET')) {
    notionReads++;
    return { ok: true, json: async () => ({ results: blocks, has_more: false, next_cursor: null }) };
  }
  if (u.includes('api.notion.com') && opts.method === 'PATCH') {
    // 記録の追記。ブロックが増えたことにする
    blocks = blocks.concat([{ id: 'p2', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'メモ：09:00 追記メモ' }] }, has_children: false }]);
    return { ok: true, json: async () => ({ results: [] }) };
  }
  return { ok: false, status: 404, json: async () => ({ message: 'unexpected: ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));

const http = require('node:http');
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:4870${path}`, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}
function post(path, json) {
  const data = JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:4870${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

setTimeout(async () => {
  // 1. 3回読んでもNotionへの読みは1回
  await get('/api/history?days=45');
  await get('/api/history?days=14');
  const r = await get('/api/history?days=365');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.days.length, 1);
  console.log('  3回の/api/historyでのNotion読み込み回数:', notionReads);
  // 1回目 = 保存形式の判定（DBがあるか）、2回目 = 履歴の取得。以降はキャッシュ
  assert.strictEqual(notionReads, 2, '60秒以内の読みはキャッシュされる（判定1回＋取得1回）');

  // 2. 記録を書き込むとキャッシュが捨てられ、次の読みは最新が見える
  const w = await post('/api/entry', { category: 'memo', payload: { time: '09:00', content: '追記メモ' } });
  assert.ok(w.status === 200 || w.status === 207, `書き込み成功のはず: ${w.status}`);
  const readsAfterWrite = notionReads; // 書き込み処理自体も見出し検索で1回読む
  const r2 = await get('/api/history?days=45');
  console.log('  書き込み後のNotion読み込み回数:', notionReads);
  assert.strictEqual(notionReads, readsAfterWrite + 1, '書き込み後はキャッシュが捨てられ読み直す');
  assert.strictEqual(r2.body.days[0].memo.length, 2, '追記が反映されている');

  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
}, 800);
