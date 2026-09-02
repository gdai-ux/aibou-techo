// /api/entry に dateStr を付けて送ると、その日のブロックに記録されることを確認する。
// オフライン再送キューが日をまたいで送ってきた場合に使われる機能。
const fs = require('fs');
const assert = require('assert');
const OBS = '/tmp/datestr-obsidian-test.md';
fs.writeFileSync(OBS, '');

process.env.OBSIDIAN_FILE_PATH = OBS;
process.env.NOTION_TOKEN = '';
process.env.NOTION_PAGE_ID = '';
delete process.env.OPENAI_API_KEY;
process.env.PORT = '4860';

global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'no notion' }) });

require(require('path').join(__dirname, '..', 'server.js'));

const { todayInfo, yesterdayInfo } = require(require('path').join(__dirname, '..', 'lib', 'format'));

setTimeout(async () => {
  const yesterday = yesterdayInfo();
  const today = todayInfo();

  // 1. 昨日の日付を指定 → 昨日のブロックに入る
  let r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo',
    payload: { time: '23:50', content: '寝る前のメモ' },
    dateStr: yesterday.dateStr,
  });
  console.log('  昨日指定のステータス:', r.status);
  assert.ok(r.status === 207 || r.status === 200, 'Obsidianには書ける');
  let written = fs.readFileSync(OBS, 'utf8');
  assert.ok(written.includes(`## ${yesterday.dateStr}（${yesterday.weekday}）`), '昨日の見出しに入る');
  assert.ok(written.includes('寝る前のメモ'));

  // 2. dateStrなし → 今日のブロック
  r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo',
    payload: { time: '08:00', content: '朝のメモ' },
  });
  written = fs.readFileSync(OBS, 'utf8');
  assert.ok(written.includes(`## ${today.dateStr}（${today.weekday}）`), '今日の見出しに入る');

  // 3. 今日のdateStrを明示 → 従来と同じ扱い（今日のブロックに追記）
  r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo',
    payload: { time: '09:00', content: '今日指定のメモ' },
    dateStr: today.dateStr,
  });
  written = fs.readFileSync(OBS, 'utf8');
  const todayBlocks = written.split('\n').filter((l) => l === `## ${today.dateStr}（${today.weekday}）`).length;
  assert.strictEqual(todayBlocks, 1, '今日の見出しは1つのまま');
  assert.ok(written.includes('今日指定のメモ'));

  // 4. 不正な形式・古すぎる日付は400
  r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo', payload: { time: '09:00', content: 'x' }, dateStr: '2020/01/01',
  });
  assert.strictEqual(r.status, 400, '形式不正は400');
  r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo', payload: { time: '09:00', content: 'x' }, dateStr: '2020-01-01',
  });
  assert.strictEqual(r.status, 400, '古すぎる日付は400');
  r = await fetch2('http://127.0.0.1:4860/api/entry', {
    category: 'memo', payload: { time: '09:00', content: 'x' }, dateStr: '2999-01-01',
  });
  assert.strictEqual(r.status, 400, '未来の日付は400');

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
    req.on('error', reject);
    req.end(data);
  });
}
