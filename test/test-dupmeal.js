// 同じ日に同じ食事種別の見出しが2つある時、編集すると品目が増え続ける不具合の再現
const assert = require('assert');
const { fetchHistory } = require(require('path').join(__dirname, '..', 'lib/history.js'));
const { updateMealItems } = require(require('path').join(__dirname, '..', 'lib/notion.js'));

const para = (id, t) => ({ id, type:'paragraph', paragraph:{ rich_text:[{plain_text:t}] } });
const bullet = (id, t) => ({ id, type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{plain_text:t}] } });
const head = (id, t) => ({ id, type:'heading_2', heading_2:{ rich_text:[{plain_text:t}] } });
// Notionでは、同じ日に同じ食事種別を2回追記すると見出しが2つ並ぶ（READMEにも記載あり）
let children = [
  head('h1', '2026-08-28（金）'),
  para('m1', ['間食'][0]),
  bullet('b1', '10:10 ビスケット'),
  para('m2', '間食'),
  bullet('b2', '15:00 ジュース'),
  bullet('b3', '15:00 寿司'),
];
let nextId = 100;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('/children') && (!opts.method || opts.method === 'GET'))
    return { ok:true, json: async () => ({ results: children, has_more:false, next_cursor:null }) };
  if (u.includes('/children') && opts.method === 'PATCH') {
    const body = JSON.parse(opts.body);
    const idx = children.findIndex(c => c.id === body.after);
    const made = body.children.map((c) => bullet('n'+(nextId++), c.bulleted_list_item.rich_text.map(r=>r.text.content).join('')));
    children.splice(idx + 1, 0, ...made);
    return { ok:true, json: async () => ({ results: made }) };
  }
  if (opts.method === 'DELETE') { children = children.filter(c => c.id !== u.split('/blocks/')[1]); return { ok:true, json: async () => ({}) }; }
  return { ok:false, status:400, json: async () => ({ message:'unexpected '+u }) };
};

const dump = () => children.map(c => (c[c.type].rich_text||[]).map(x=>x.plain_text).join('')).join(' | ');

(async () => {
  let days = await fetchHistory({ token:'t', pageId:'p', limitDays: 30 });
  console.log('  読み取り結果:', JSON.stringify(days[0].meals));
  assert.strictEqual(days[0].meals.length, 2, '見出しごとに別の記録として読む');
  assert.deepStrictEqual(days[0].meals.map(m => m.blockId), ['m1', 'm2']);
  assert.deepStrictEqual(days[0].meals[0].items, ['10:10 ビスケット']);
  assert.deepStrictEqual(days[0].meals[1].items, ['15:00 ジュース', '15:00 寿司']);

  // 画面から編集（＝読み取った品目をそのまま保存し直す）を3回繰り返す
  for (let i = 0; i < 3; i++) {
    days = await fetchHistory({ token:'t', pageId:'p', limitDays: 30 });
    for (const meal of days[0].meals) await updateMealItems('t', 'p', meal.blockId, meal.items);
  }
  console.log('  3回保存し直したあと:', dump());

  days = await fetchHistory({ token:'t', pageId:'p', limitDays: 30 });
  const total = days[0].meals.reduce((n, m) => n + m.items.length, 0);
  console.log('  品目の合計:', total, '（3のままであるべき）');
  assert.strictEqual(total, 3, '保存し直すたびに品目が増えてはいけない');
  assert.strictEqual(days[0].meals.length, 2);
  console.log('ALL ASSERTIONS PASSED');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
