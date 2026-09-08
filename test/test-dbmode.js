// データベース形式への移行と、DBモードでの読み書き一式を確認する。
// Notion API（blocks・databases・pages）をメモリ上で再現し、
// 「移行前後で /api/history の中身が一致すること」を柱に検証する。
const assert = require('assert');
process.env.OBSIDIAN_FILE_PATH = '';
process.env.NOTION_TOKEN = 'tok';
process.env.NOTION_PAGE_ID = 'page-1';
delete process.env.OPENAI_API_KEY;
process.env.PORT = '4880';

const { todayInfo, yesterdayInfo } = require(require('path').join(__dirname, '..', 'lib', 'format'));
const TODAY = todayInfo();
const YESTERDAY = yesterdayInfo();

// ---- Notionエミュレータ ----------------------------------------------------
const legacyBlocks = [
  { id: 'h1', type: 'heading_2', heading_2: { rich_text: [{ plain_text: `${TODAY.dateStr}（${TODAY.weekday}）` }] } },
  { id: 'b1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '睡眠：23:30就寝、6:00起床（6時間30分）' }] } },
  { id: 'b2', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '朝食' }] } },
  { id: 'b3', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '07:30 白米（約240kcal）' }] } },
  { id: 'b4', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '味噌汁（約60kcal）' }] } },
  { id: 'b5', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '体調：09:20 普通（排便：柔らかめ）：ちょっとだるい' }] } },
  { id: 'h2', type: 'heading_2', heading_2: { rich_text: [{ plain_text: `${YESTERDAY.dateStr}（${YESTERDAY.weekday}）` }] } },
  { id: 'b6', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '運動：08:30 ジムで脚トレ（約200kcal消費）' }] } },
  { id: 'b7', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'メモ：12:00 いいことがあった' }] } },
  { id: 'b8', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '振り返り：よくがんばったね！' }] } },
];
let dbCreated = null; // { id, rows: Map }
let rowSeq = 0;

function readProps(sent) { return JSON.parse(JSON.stringify(sent)); }
function propText(prop) {
  const arr = (prop && (prop.rich_text || prop.title)) || [];
  return arr.map((r) => r.plain_text ?? r.text?.content ?? '').join('');
}

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const j = (o) => ({ ok: true, json: async () => o });

  // ページ直下のブロック一覧（child_databaseは作成後だけ現れる）
  if (u.includes('/blocks/page-1/children') && method === 'GET') {
    const results = legacyBlocks.concat(dbCreated ? [{ id: dbCreated.id, type: 'child_database', child_database: { title: 'life-log 記録データベース' } }] : []);
    return j({ results, has_more: false, next_cursor: null });
  }
  // データベース作成
  if (u.endsWith('/v1/databases') && method === 'POST') {
    dbCreated = { id: 'db-1', rows: new Map() };
    return j({ id: 'db-1' });
  }
  // 行の追加
  if (u.endsWith('/v1/pages') && method === 'POST') {
    const body = JSON.parse(opts.body);
    assert.strictEqual(body.parent.database_id, 'db-1');
    const id = `row-${++rowSeq}`;
    dbCreated.rows.set(id, { id, archived: false, properties: readProps(body.properties) });
    return j({ id });
  }
  // 行の更新・アーカイブ
  const rowPatch = u.match(/\/v1\/pages\/(row-\d+)$/);
  if (rowPatch && method === 'PATCH') {
    const row = dbCreated.rows.get(rowPatch[1]);
    const body = JSON.parse(opts.body);
    if (body.archived) row.archived = true;
    if (body.properties) Object.assign(row.properties, readProps(body.properties));
    return j({ id: row.id });
  }
  // クエリ
  if (u.includes('/v1/databases/db-1/query') && method === 'POST') {
    const body = JSON.parse(opts.body || '{}');
    let rows = [...dbCreated.rows.values()].filter((r) => !r.archived);
    if (body.filter && body.filter.date && body.filter.date.on_or_after) {
      rows = rows.filter((r) => (r.properties['日付'].date.start || '') >= body.filter.date.on_or_after);
    }
    rows.sort((a, b) => b.properties['日付'].date.start.localeCompare(a.properties['日付'].date.start));
    return j({ results: rows, has_more: false, next_cursor: null });
  }
  return { ok: false, status: 404, json: async () => ({ message: 'unexpected: ' + method + ' ' + u }) };
};

require(require('path').join(__dirname, '..', 'server.js'));

const http = require('node:http');
function call(method, path, json) {
  const data = json ? JSON.stringify(json) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:4880${path}`, { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}
// blockId（環境で変わる）を消して比較できる形にする
function normalize(days) {
  return JSON.parse(JSON.stringify(days, (k, v) => (k === 'blockId' ? undefined : v)));
}

setTimeout(async () => {
  // 1. 移行前（ページ本文モード）の履歴を控えておく
  const before = await call('GET', '/api/history?days=30');
  assert.strictEqual(before.status, 200);
  assert.strictEqual(before.body.days.length, 2);

  // 2. 移行（remainingが0になるまで繰り返す）
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const r = await call('POST', '/api/migrate-db', {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    total += r.body.migratedDays;
    if (r.body.remaining <= 0) break;
  }
  console.log('  移行した日数:', total, '/ 行数:', dbCreated.rows.size);
  assert.strictEqual(total, 2);
  assert.strictEqual(dbCreated.rows.size, 6, '睡眠+食事+体調+運動+メモ+ふりかえり=6行');

  // 3. もう一度移行を叩いても二重にならない（冪等）
  const again = await call('POST', '/api/migrate-db', {});
  assert.strictEqual(again.body.migratedDays, 0);
  assert.strictEqual(dbCreated.rows.size, 6);

  // 4. 移行後の履歴（DBモード）が移行前と一致する
  const after = await call('GET', '/api/history?days=30');
  assert.deepStrictEqual(normalize(after.body.days), normalize(before.body.days), '移行前後で履歴が一致する');
  console.log('  移行前後の /api/history が一致');

  // 5. DBモードで記録 → 行が増える（ページ本文には書かない）
  const blocksBefore = legacyBlocks.length;
  const w = await call('POST', '/api/entry', { category: 'memo', payload: { time: '15:00', content: 'DBモードのメモ' } });
  assert.ok(w.status === 200 || w.status === 207, JSON.stringify(w.body));
  assert.strictEqual(dbCreated.rows.size, 7, '行が1つ増える');
  assert.strictEqual(legacyBlocks.length, blocksBefore, 'ページ本文は増えない');
  const h2 = await call('GET', '/api/history?days=30');
  const today = h2.body.days.find((d) => d.dateStr === TODAY.dateStr);
  assert.ok(today.memo.some((m) => m.content === 'DBモードのメモ'));

  // 6. 編集（メモ→内容変更）と削除
  const memoRow = today.memo.find((m) => m.content === 'DBモードのメモ');
  // 5b. 同じ記録をもう一度送っても二重にならない（再送キューやタイムアウト後の再送）
  const dup = await call('POST', '/api/entry', { category: 'memo', payload: { time: '15:00', content: 'DBモードのメモ' } });
  assert.strictEqual(dup.status, 200, JSON.stringify(dup.body));
  assert.strictEqual(dup.body.duplicate, true, '同じ内容は「保存済み」として返る');
  assert.strictEqual(dbCreated.rows.size, 7, '行は増えない');
  // 端末IDが同じ再送も二重にならない（内容が同じかどうかに関わらず）
  const id1 = await call('POST', '/api/entry', { category: 'memo', payload: { time: '15:10', content: 'ID付きのメモ' }, clientId: 'test-client-id-0001' });
  assert.ok(id1.status === 200 || id1.status === 207, JSON.stringify(id1.body));
  assert.strictEqual(dbCreated.rows.size, 8);
  const id2 = await call('POST', '/api/entry', { category: 'memo', payload: { time: '15:10', content: 'ID付きのメモ' }, clientId: 'test-client-id-0001' });
  assert.strictEqual(id2.body.duplicate, true, '同じ端末IDは保存しない');
  assert.strictEqual(dbCreated.rows.size, 8, '行は増えない');
  // 少しでも違う記録は普通に増える
  const other = await call('POST', '/api/entry', { category: 'memo', payload: { time: '15:11', content: 'ID付きのメモ' } });
  assert.ok(!other.body.duplicate);
  assert.strictEqual(dbCreated.rows.size, 9);
  console.log('  二重登録よけが効いている');

  const e = await call('PUT', '/api/entry/meta', { blockId: memoRow.blockId, category: 'memo', payload: { time: '15:05', content: '編集後のメモ' } });
  assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  const h3 = await call('GET', '/api/history?days=30');
  assert.ok(h3.body.days[0].memo.some((m) => m.content === '編集後のメモ'), '編集が反映');

  const del = await call('DELETE', `/api/entry/meta/${memoRow.blockId}`);
  assert.strictEqual(del.status, 200);
  const h4 = await call('GET', '/api/history?days=30');
  assert.ok(!h4.body.days[0].memo.some((m) => m.content === '編集後のメモ'), '削除が反映');

  // 7. 食事の品目編集
  const meal = h4.body.days.find((d) => d.dateStr === TODAY.dateStr).meals[0];
  const me = await call('PUT', '/api/entry/meal', { mealBlockId: meal.blockId, mealType: meal.mealType, items: ['07:30 白米（約240kcal）', '納豆（約100kcal）'] });
  assert.strictEqual(me.status, 200, JSON.stringify(me.body));
  const h5 = await call('GET', '/api/history?days=30');
  const meal5 = h5.body.days.find((d) => d.dateStr === TODAY.dateStr).meals[0];
  assert.deepStrictEqual(meal5.items, ['07:30 白米（約240kcal）', '納豆（約100kcal）'], '品目編集が反映');

  // 8. 日またぎ睡眠のbedtimeCarryもDBモードで機能する
  const carryDay = h5.body.days.find((d) => d.dateStr === YESTERDAY.dateStr);
  assert.ok(carryDay.bedtimeCarry && carryDay.bedtimeCarry.time === '23:30', '就寝の日またぎ表示');

  console.log('\nALL ASSERTIONS PASSED');
  process.exit(0);
}, 800);
