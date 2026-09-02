// /api/entry に運動を送ると、消費カロリーが推定されて記録テキストに入ることを確認する
const fs = require('fs'); const assert = require('assert');
const OBS = '/tmp/burned-obsidian-test.md'; fs.writeFileSync(OBS, '');
process.env.OPENAI_API_KEY = 'test-key';
process.env.OBSIDIAN_FILE_PATH = OBS;
process.env.NOTION_TOKEN = ''; process.env.NOTION_PAGE_ID = ''; process.env.PORT = '4820';
let openaiCalls = 0;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.openai.com')) {
    openaiCalls++;
    const body = JSON.parse(opts.body);
    assert.ok(body.messages[1].content.includes('腹筋マシン'), '運動の内容がそのまま渡る');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ burnedKcal: 280 }) } }] }) };
  }
  return { ok: false, status: 401, json: async () => ({ message: 'no notion' }) };
};
require(require('path').join(__dirname, '..', 'server.js'));
setTimeout(async () => {
  const http = require('node:http');
  const post = (json) => { const data = JSON.stringify(json); return new Promise((res) => {
    const q = http.request('http://127.0.0.1:4820/api/entry', { method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} },
      (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>res({status:s.statusCode, body:JSON.parse(b)})); }); q.end(data); }); };
  const r = await post({ category:'exercise', payload:{ time:'08:30', content:'腹筋マシン27キロ×3、バイク5キロ' } });
  console.log('  返ってきた消費kcal:', r.body.result.burnedKcal);
  assert.strictEqual(r.body.result.burnedKcal, 280);
  assert.strictEqual(openaiCalls, 1, 'OpenAIは1回だけ');
  const written = fs.readFileSync(OBS, 'utf8');
  written.split('\n').filter(l => l.includes('運動')).forEach(l => console.log('  ' + l));
  assert.ok(written.includes('**運動**：08:30 腹筋マシン27キロ×3、バイク5キロ（約280kcal消費）'), '消費カロリー付きで書かれる');
  // メモは推定しない（運動だけが対象）
  openaiCalls = 0;
  await post({ category:'memo', payload:{ time:'09:00', content:'電車が遅れた' } });
  console.log('  メモ記録時のOpenAI呼び出し:', openaiCalls, '(0が正しい)');
  assert.strictEqual(openaiCalls, 0);
  console.log('ALL ASSERTIONS PASSED'); process.exit(0);
}, 800);
