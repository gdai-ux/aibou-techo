// 以前の不具合で品目が増えてしまった記録が、まとめて直せることの確認
const assert = require('assert');
process.env.OPENAI_API_KEY = 'test-key';
process.env.NOTION_TOKEN = 'tok'; process.env.NOTION_PAGE_ID = 'page';
delete process.env.OBSIDIAN_FILE_PATH;
process.env.PORT = '4850';

const para = (id, t) => ({ id, type:'paragraph', paragraph:{ rich_text:[{plain_text:t}] } });
const bullet = (id, t) => ({ id, type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{plain_text:t}] } });
const head = (id, t) => ({ id, type:'heading_2', heading_2:{ rich_text:[{plain_text:t}] } });
// 「ビスケット」＋「ジュース・寿司」が3回繰り返された状態（カロリーは付いている）
let children = [ head('h1','2026-08-28（金）'), para('m1','間食'),
  bullet('b0','10:10 ビスケット（約100kcal）') ];
let id = 1;
for (let i = 0; i < 3; i++) {
  children.push(bullet('b'+(id++), '10:10 ジュース（約90kcal）'));
  children.push(bullet('b'+(id++), '10:10 寿司（約500kcal）'));
}
let openaiCalls = 0, nextId = 500;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.openai.com')) {
    openaiCalls++;
    const b = JSON.parse(opts.body);
    return { ok:true, json: async () => ({ choices:[{ message:{ content:
      JSON.stringify({ calories: JSON.parse(b.messages[1].content).items.map(() => 100) }) } }] }) };
  }
  if (u.includes('/children') && (!opts.method || opts.method === 'GET'))
    return { ok:true, json: async () => ({ results: children, has_more:false, next_cursor:null }) };
  if (u.includes('/children') && opts.method === 'PATCH') {
    const body = JSON.parse(opts.body);
    const idx = children.findIndex(c => c.id === body.after);
    const made = body.children.map(c => bullet('n'+(nextId++), c.bulleted_list_item.rich_text.map(r=>r.text.content).join('')));
    children.splice(idx + 1, 0, ...made);
    return { ok:true, json: async () => ({ results: made }) };
  }
  if (opts.method === 'DELETE') { children = children.filter(c => c.id !== u.split('/blocks/')[1]); return { ok:true, json: async () => ({}) }; }
  return { ok:false, status:400, json: async () => ({ message:'unexpected '+u }) };
};
require(require('path').join(__dirname, '..', 'server.js'));
setTimeout(async () => {
  const http = require('node:http');
  const post = () => new Promise((res) => { const q = http.request('http://127.0.0.1:4850/api/backfill-calories',
    { method:'POST', headers:{'Content-Type':'application/json','Content-Length':2} },
    (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>res({status:s.statusCode, body:JSON.parse(b)})); }); q.end('{}'); });

  const before = children.filter(c => c.type === 'bulleted_list_item').length;
  console.log('  直す前の品目数:', before);
  assert.strictEqual(before, 7);

  const r = await post();
  console.log('  応答:', JSON.stringify(r.body));
  const after = children.filter(c => c.type === 'bulleted_list_item');
  console.log('  直したあと:'); after.forEach(c => console.log('    ' + c.bulleted_list_item.rich_text[0].plain_text));
  assert.strictEqual(after.length, 3, '繰り返しが1つにまとまる');
  assert.strictEqual(r.body.updated, 1);

  // もう一度実行しても対象にならない
  openaiCalls = 0;
  const r2 = await post();
  console.log('  2回目:', JSON.stringify(r2.body), '／OpenAI呼び出し:', openaiCalls);
  assert.strictEqual(r2.body.total, 0);
  assert.strictEqual(openaiCalls, 0);
  console.log('ALL ASSERTIONS PASSED'); process.exit(0);
}, 800);
