// 自前DB（lib/pgStore.js）の読み書きが、Notion形式と同じ形の day を返すことを確認する。
// 実際の Postgres に対して動かすので DATABASE_URL が必要。無ければ飛ばす
// （CI では .github/workflows/test.yml が Postgres を立てて必ず流す）。
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.log('  DATABASE_URL が無いので飛ばします（CIでは実行されます）');
  process.exit(0);
}

const db = require(path.join(__dirname, '..', 'lib', 'db'));
const store = require(path.join(__dirname, '..', 'lib', 'pgStore'));
const { todayInfo, yesterdayInfo } = require(path.join(__dirname, '..', 'lib', 'format'));

(async () => {
  await db.migrate();
  const me = crypto.randomUUID();
  const other = crypto.randomUUID();
  await store.ensureUser(me, `me-${me.slice(0, 8)}@example.com`);
  await store.ensureUser(other, `other-${other.slice(0, 8)}@example.com`);
  const today = todayInfo();
  const yesterday = yesterdayInfo();

  // --- 追記: 全カテゴリ ---
  const sleep = await store.appendEntry(me, 'sleep', { bedtime: '23:30', wake: '06:30' });
  const ex = await store.appendEntry(me, 'exercise', { time: '08:00', content: 'ランニング30分\n\n腹筋20回 ' });
  const memo = await store.appendEntry(me, 'memo', { time: '12:40', content: '午後は会議' });
  const cond = await store.appendEntry(me, 'condition', { time: '09:00', level: '良い', stool: '普通', note: '' });
  const meal = await store.appendEntry(me, 'meal', { time: '07:30', mealType: '朝食', items: ['白米', ' 味噌汁 ', ''] });
  await store.appendEntry(me, 'memo', { time: '20:00', content: 'きのうのメモ' }, yesterday);
  assert.ok(sleep.id && ex.id && memo.id && cond.id && meal.id, 'idが返る');
  console.log('  appendEntry OK');

  // 不正な入力は従来と同じ検証で弾かれる
  await assert.rejects(store.appendEntry(me, 'meal', { mealType: 'おやつ', items: ['x'] }), /mealType/);
  await assert.rejects(store.appendEntry(me, 'exercise', { content: '' }), /content is required/);
  await assert.rejects(store.appendEntry(me, 'condition', { level: '絶好調すぎ' }), /level must be/);
  console.log('  validation OK');

  // --- 読み取り: day の形 ---
  let days = await store.fetchHistory(me, 30);
  assert.strictEqual(days[0].dateStr, today.dateStr, '新しい日が先頭');
  assert.strictEqual(days[0].weekday, today.weekday);
  const d = days[0];
  assert.deepStrictEqual(d.sleep, { blockId: sleep.id, bedtime: '23:30', wake: '06:30', hours: 7, minutes: 0, totalMinutes: 420 });
  assert.deepStrictEqual(d.exercise, [{ blockId: ex.id, time: '08:00', content: 'ランニング30分\n腹筋20回' }], '運動は行を整えて1件');
  assert.deepStrictEqual(d.memo, [{ blockId: memo.id, time: '12:40', content: '午後は会議' }]);
  assert.deepStrictEqual(d.condition, [{ blockId: cond.id, time: '09:00', level: '良い', stool: '普通', note: '' }]);
  assert.deepStrictEqual(d.meals, [{ mealType: '朝食', blockId: meal.id, items: ['07:30 白米', '07:30 味噌汁'] }], '品目は時刻付きの従来形式');
  assert.strictEqual(d.review, null);
  assert.ok(d.dataEditedAt, '記録の最終編集時刻が入る');
  // 日またぎの就寝は前日に繰り越される
  const y = days.find((x) => x.dateStr === yesterday.dateStr);
  assert.deepStrictEqual(y.bedtimeCarry, { time: '23:30', toDateStr: today.dateStr });
  assert.strictEqual(y.memo[0].content, 'きのうのメモ');
  console.log('  fetchHistory OK');

  // --- 他人の記録は見えない・触れない ---
  const otherDays = await store.fetchHistory(other, 30);
  assert.strictEqual(otherDays.length, 0, '他人には何も見えない');
  await assert.rejects(store.updateMeta(other, memo.id, 'memo', { time: '12:40', content: '乗っ取り' }), /記録が見つかりません/);
  await assert.rejects(store.deleteEntry(other, memo.id), /記録が見つかりません/);
  console.log('  isolation OK');

  // --- 編集 ---
  await store.updateMeta(me, memo.id, 'memo', { time: '13:00', content: '会議は延期' });
  await store.updateMealItems(me, meal.id, ['07:30 白米（約240kcal）', '07:30 味噌汁（約40kcal）']);
  days = await store.fetchHistory(me, 30);
  assert.deepStrictEqual(days[0].memo[0], { blockId: memo.id, time: '13:00', content: '会議は延期' });
  assert.deepStrictEqual(days[0].meals[0].items, ['07:30 白米（約240kcal）', '07:30 味噌汁（約40kcal）']);
  console.log('  update OK');

  // --- ふりかえり: 1日1件（2回目は上書き） ---
  const r1 = await store.upsertReview(me, today.dateStr, 'いい調子！');
  const r2 = await store.upsertReview(me, today.dateStr, 'もっといい調子！');
  assert.strictEqual(r1.id, r2.id, '同じ行が書き換わる');
  days = await store.fetchHistory(me, 30);
  assert.strictEqual(days[0].review.content, 'もっといい調子！');
  assert.ok(days[0].review.editedAt, 'ふりかえりの編集時刻が入る');
  console.log('  upsertReview OK');

  // --- 削除 ---
  await store.deleteEntry(me, cond.id);
  days = await store.fetchHistory(me, 30);
  assert.strictEqual(days[0].condition.length, 0);
  const dates = await store.listDates(me);
  assert.ok(dates.has(today.dateStr) && dates.has(yesterday.dateStr));
  console.log('  delete / listDates OK');

  // --- アカウント削除で全部消える ---
  await store.deleteUser(me);
  assert.strictEqual((await store.fetchHistory(me, 30)).length, 0);
  await store.deleteUser(other);
  console.log('  deleteUser OK');

  await db.close();
  console.log('ALL ASSERTIONS PASSED');
})().catch(async (e) => {
  console.error(e);
  await db.close().catch(() => {});
  process.exit(1);
});
