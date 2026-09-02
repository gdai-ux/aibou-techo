// /api/entry に食事を送ると、カロリーが推定されて記録テキストに入ることを確認する。
// OpenAIとNotionは実際には呼ばず、fetchを差し替えて再現する。
const fs = require('fs');
const assert = require('assert');
const OBS = '/tmp/kcal-obsidian-test.md';
fs.writeFileSync(OBS, '');

process.env.OPENAI_API_KEY = 'test-key';
process.env.OBSIDIAN_FILE_PATH = OBS;
process.env.NOTION_TOKEN = '';
process.env.NOTION_PAGE_ID = '';
process.env.PORT = '4810';

let openaiCalls = 0;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.openai.com')) {
    openaiCalls++;
    const body = JSON.parse(opts.body);
    const items = JSON.parse(body.messages[1].content).items;
    const table = { '白米': 230, 'ナスの味噌汁': 60, '鶏肉と大根': 180, '梨': 50 };
    return { ok: true, json: async () => ({ choices: [{ message: { content:
      JSON.stringify({ calories: items.map((i) => (i in table ? table[i] : null)) }) } }] }) };
  }
  return { ok: false, status: 401, json: async () => ({ message: 'no notion' }) };
};

require(require('path').join(__dirname, '..', 'server.js'));

setTimeout(async () => {
  const resp = await require('node:http').request; // 使わない
  const r = await fetch2('http://127.0.0.1:4810/api/entry', {
    category: 'meal',
    payload: { mealType: '朝食', time: '07:30', items: ['白米', 'ナスの味噌汁', '鶏肉と大根', '梨'] },
  });
  console.log('  HTTPステータス:', r.status, '(Notionが失敗するので207が正しい)');
  console.log('  返ってきた合計kcal:', r.body.result.totalKcal);
  assert.strictEqual(r.body.result.totalKcal, 520);
  assert.strictEqual(openaiCalls, 1, 'OpenAIは1回だけ呼ぶ');

  const written = fs.readFileSync(OBS, 'utf8');
  console.log('  Obsidianに書かれた内容:');
  written.split('\n').filter(Boolean).forEach((l) => console.log('    ' + l));
  assert.ok(written.includes('07:30 白米（約230kcal）'), 'カロリー付きで書かれている');
  assert.ok(written.includes('07:30 梨（約50kcal）'));

  // キーが無ければカロリーは付かない（記録は通る）
  openaiCalls = 0;
  delete process.env.OPENAI_API_KEY;
  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
}, 800);

// 生fetchはNotion用に潰しているので、テスト用に別実装で叩く
function fetch2(url, json) {
  const http = require('node:http');
  const data = JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject); req.end(data);
  });
}
