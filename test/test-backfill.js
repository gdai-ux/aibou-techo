// /api/backfill-calories の結合テスト。
// Notion（ブロック一覧・更新・削除・追加）とOpenAIをメモリ上で再現して、
// 過去の記録に正しくカロリーが書き足されるかを確認する。
const assert = require('assert');
process.env.OPENAI_API_KEY = 'test-key';
process.env.NOTION_TOKEN = 'tok'; process.env.NOTION_PAGE_ID = 'page';
delete process.env.OBSIDIAN_FILE_PATH;
process.env.PORT = '4830';

// Notionページの中身（段落＋箇条書き）
const para = (id, runs) => ({ id, type:'paragraph', paragraph:{ rich_text: runs.map(t=>({plain_text:t})) } });
const bullet = (id, t) => ({ id, type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{plain_text:t}] } });
const head = (id, t) => ({ id, type:'heading_2', heading_2:{ rich_text:[{plain_text:t}] } });
let children = [
  head('h1', '2026-08-27（木）'),
  para('e1', ['運動：', '08:00 ジムで筋トレ']),
  para('m1', ['朝食']),
  bullet('b1', '07:15 白米'),
  bullet('b2', '07:15 味噌汁'),
  para('x1', ['メモ：', '09:00 電車が遅れた']),
];
let openaiCalls = 0, appended = [], deleted = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.openai.com')) {
    openaiCalls++;
    const b = JSON.parse(opts.body);
    const isBurn = b.messages[0].content.includes('運動生理学');
    return { ok:true, json: async () => ({ choices:[{ message:{ content: isBurn
      ? JSON.stringify({ burnedKcal: 300 })
      : JSON.stringify({ calories: JSON.parse(b.messages[1].content).items.map(() => 200) }) } }] }) };
  }
  if (u.includes('/children') && (!opts.method || opts.method === 'GET')) {
    return { ok:true, json: async () => ({ results: children, has_more:false, next_cursor:null }) };
  }
  if (u.includes('/children') && opts.method === 'PATCH') {
    const body = JSON.parse(opts.body);
    appended.push(...body.children.map(c => c[c.type].rich_text.map(r=>r.text.content).join('')));
    const after = body.after;
    const idx = children.findIndex(c => c.id === after);
    const made = body.children.map((c, i) => c.type === 'bulleted_list_item'
      ? bullet('new'+appended.length+'_'+i, c.bulleted_list_item.rich_text.map(r=>r.text.content).join(''))
      : para('new'+appended.length+'_'+i, c[c.type].rich_text.map(r=>r.text.content)));
    children.splice(idx + 1, 0, ...made);
    return { ok:true, json: async () => ({ results: made }) };
  }
  if (opts.method === 'PATCH') { // ブロック本体の更新
    const id = u.split('/blocks/')[1];
    const body = JSON.parse(opts.body);
    const b = children.find(c => c.id === id);
    b.paragraph.rich_text = body.paragraph.rich_text.map(r => ({ plain_text: r.text.content }));
    return { ok:true, json: async () => ({}) };
  }
  if (opts.method === 'DELETE') {
    const id = u.split('/blocks/')[1];
    deleted.push(id);
    children = children.filter(c => c.id !== id);
    return { ok:true, json: async () => ({}) };
  }
  return { ok:false, status:400, json: async () => ({ message:'unexpected ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));
setTimeout(async () => {
  const http = require('node:http');
  const post = () => new Promise((res) => { const q = http.request('http://127.0.0.1:4830/api/backfill-calories',
    { method:'POST', headers:{'Content-Type':'application/json','Content-Length':2} },
    (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>res({status:s.statusCode, body:JSON.parse(b)})); }); q.end('{}'); });

  const r = await post();
  console.log('  応答:', JSON.stringify(r.body));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.updated, 2, '運動1件＋食事1件が対象');
  assert.strictEqual(r.body.remaining, 0);
  assert.strictEqual(r.body.failed, 0);

  const текст = children.map(c => (c[c.type].rich_text || []).map(x=>x.plain_text).join('')).join('\n');
  console.log('  更新後のNotion:'); текст.split('\n').forEach(l => console.log('    ' + l));
  assert.ok(текст.includes('運動：08:00 ジムで筋トレ（約300kcal消費）'), '運動に消費カロリーが付く');
  assert.ok(текст.includes('07:15 白米（約200kcal）'), '品目に摂取カロリーが付く（時刻も残る）');
  assert.ok(текст.includes('07:15 味噌汁（約200kcal）'));
  assert.ok(текст.includes('メモ：09:00 電車が遅れた'), 'メモは触らない');
  assert.strictEqual(openaiCalls, 2, 'OpenAIは対象の数だけ（運動1＋食事1）');

  // 2回目：もう対象が無いので何もしない＝OpenAIを呼ばない
  openaiCalls = 0;
  const r2 = await post();
  console.log('  2回目の応答:', JSON.stringify(r2.body), '／OpenAI呼び出し:', openaiCalls);
  assert.strictEqual(r2.body.total, 0);
  assert.strictEqual(openaiCalls, 0, '対象が無ければOpenAIを呼ばない');

  console.log('ALL ASSERTIONS PASSED'); process.exit(0);
}, 800);
