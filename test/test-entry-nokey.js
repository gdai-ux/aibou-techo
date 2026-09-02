// OPENAI_API_KEY が無い環境では、カロリー無しで今まで通り記録できることを確認する
const fs = require('fs'); const assert = require('assert');
const OBS = '/tmp/kcal-nokey-test.md'; fs.writeFileSync(OBS, '');
delete process.env.OPENAI_API_KEY;
process.env.OBSIDIAN_FILE_PATH = OBS;
process.env.NOTION_TOKEN = ''; process.env.NOTION_PAGE_ID = ''; process.env.PORT = '4811';
let openaiCalls = 0;
global.fetch = async (url) => {
  if (String(url).includes('api.openai.com')) openaiCalls++;
  return { ok: false, status: 401, json: async () => ({ message: 'no' }) };
};
require(require('path').join(__dirname, '..', 'server.js'));
setTimeout(async () => {
  const http = require('node:http');
  const data = JSON.stringify({ category:'meal', payload:{ mealType:'朝食', time:'07:30', items:['白米','味噌汁'] } });
  const r = await new Promise((res) => { const q = http.request('http://127.0.0.1:4811/api/entry',
    { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} },
    (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>res({status:s.statusCode, body:JSON.parse(b)})); }); q.end(data); });
  const written = fs.readFileSync(OBS,'utf8');
  console.log('  合計kcal:', r.body.result.totalKcal, '(nullが正しい)');
  console.log('  OpenAI呼び出し回数:', openaiCalls, '(0が正しい)');
  written.split('\n').filter(l=>l.startsWith('- ')).forEach(l=>console.log('  ' + l));
  assert.strictEqual(r.body.result.totalKcal, null);
  assert.strictEqual(openaiCalls, 0);
  assert.ok(written.includes('- 07:30 白米\n'), 'カロリー無しでそのまま記録される');
  assert.ok(!written.includes('kcal'));
  console.log('ALL ASSERTIONS PASSED'); process.exit(0);
}, 800);
