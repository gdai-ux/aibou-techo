// 推定できない記録があっても、バックフィルが終わることの確認。
// Notion（ブロック一覧・更新・削除・追加）とOpenAIをメモリ上で再現する。
const assert = require('assert');
process.env.OPENAI_API_KEY = 'test-key';
process.env.NOTION_TOKEN = 'tok'; process.env.NOTION_PAGE_ID = 'page';
delete process.env.OBSIDIAN_FILE_PATH;
process.env.PORT = '4840';

const para = (id, runs) => ({ id, type:'paragraph', paragraph:{ rich_text: runs.map(t=>({plain_text:t})) } });
const bullet = (id, t) => ({ id, type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{plain_text:t}] } });
const head = (id, t) => ({ id, type:'heading_2', heading_2:{ rich_text:[{plain_text:t}] } });
let children = [
  head('h1', '2026-08-27（木）'),
  para('e1', ['運動：', '08:00 ジムで筋トレ']),         // 推定できる
  para('e2', ['運動：', '09:00 なんとなく体を動かした']), // 推定できない
  para('m1', ['朝食']),
  bullet('b1', '07:15 白米'),                          // 推定できる
];
let openaiCalls = 0;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.openai.com')) {
    openaiCalls++;
    const b = JSON.parse(opts.body);
    const isBurn = b.messages[0].content.includes('運動生理学');
    if (isBurn) {
      const canEstimate = !b.messages[1].content.includes('なんとなく');
      return { ok:true, json: async () => ({ choices:[{ message:{ content: JSON.stringify({ burnedKcal: canEstimate ? 300 : null }) } }] }) };
    }
    return { ok:true, json: async () => ({ choices:[{ message:{ content:
      JSON.stringify({ calories: JSON.parse(b.messages[1].content).items.map(() => 200) }) } }] }) };
  }
  if (u.includes('/children') && (!opts.method || opts.method === 'GET'))
    return { ok:true, json: async () => ({ results: children, has_more:false, next_cursor:null }) };
  if (u.includes('/children') && opts.method === 'PATCH') {
    const body = JSON.parse(opts.body);
    const idx = children.findIndex(c => c.id === body.after);
    const made = body.children.map((c, i) => bullet('n'+Date.now()+i, c.bulleted_list_item.rich_text.map(r=>r.text.content).join('')));
    children.splice(idx + 1, 0, ...made);
    return { ok:true, json: async () => ({ results: made }) };
  }
  if (opts.method === 'PATCH') {
    const b = children.find(c => c.id === u.split('/blocks/')[1]);
    b.paragraph.rich_text = JSON.parse(opts.body).paragraph.rich_text.map(r => ({ plain_text: r.text.content }));
    return { ok:true, json: async () => ({}) };
  }
  if (opts.method === 'DELETE') { children = children.filter(c => c.id !== u.split('/blocks/')[1]); return { ok:true, json: async () => ({}) }; }
  return { ok:false, status:400, json: async () => ({ message:'unexpected ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));
setTimeout(async () => {
  const http = require('node:http');
  const post = (body) => { const data = JSON.stringify(body || {}); return new Promise((res) => {
    const q = http.request('http://127.0.0.1:4840/api/backfill-calories', { method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} },
      (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>res({status:s.statusCode, body:JSON.parse(b)})); }); q.end(data); }); };

  const r1 = await post();
  console.log('  1回目:', JSON.stringify(r1.body));
  assert.strictEqual(r1.body.updated, 2, '推定できた2件');
  assert.strictEqual(r1.body.unknown, 1, '推定できず×を付けた1件');
  assert.strictEqual(r1.body.remaining, 0);

  // 2回目：×が記録に残っているので、もう対象にならない＝OpenAIを呼ばない
  openaiCalls = 0;
  const r2 = await post();
  console.log('  2回目:', JSON.stringify(r2.body), '／OpenAI呼び出し:', openaiCalls);
  assert.strictEqual(r2.body.total, 0, '対象が0件になる');
  assert.strictEqual(openaiCalls, 0, '同じ記録を推定し直さない');

  const text = children.map(c => (c[c.type].rich_text || []).map(x=>x.plain_text).join('')).join('\n');
  console.log('  更新後のNotion:'); text.split('\n').forEach(l => console.log('    ' + l));
  assert.ok(text.includes('運動：08:00 ジムで筋トレ（約300kcal消費）'));
  assert.ok(text.includes('運動：09:00 なんとなく体を動かした（kcal不明）'), '推定できない記録には×の印が付く');
  assert.ok(!text.includes('なんとなく体を動かした（約'), '推定できない記録にカロリーの数値は付かない');
  assert.ok(text.includes('07:15 白米（約200kcal）'));

  console.log('ALL ASSERTIONS PASSED'); process.exit(0);
}, 800);
