// 二重登録よけ（lib/dedupe.js）の判定を確認する。
// 送信中に通信が切れて再送された記録や、同じ端末の2つの画面から送られた記録が
// 「同じ内容」と見なされ、少しでも違う記録は別物と見なされること
const assert = require('assert');
const { findDuplicate, rememberEntry, recallEntry, normalizeClientId } = require(require('path').join(__dirname, '..', 'lib', 'dedupe'));

const day = {
  dateStr: '2026-09-08', weekday: '火',
  sleep: { blockId: 's1', bedtime: '24:00', wake: '06:20', hours: 6, minutes: 20, totalMinutes: 380 },
  exercise: [{ blockId: 'e1', time: '18:00', content: 'ジムで筋トレ1時間（約280kcal消費）' }],
  condition: [{ blockId: 'c1', time: '08:50', level: '悪い', stool: '柔らかめ', note: '' }],
  memo: [{ blockId: 'm1', time: '09:05', content: '昨日の夜福岡から帰宅。' }],
  meals: [
    { mealType: '朝食', blockId: 'b1', items: ['08:10 フルフル　明太フランスパン1本（約450kcal）', '卵豆腐（約80kcal）', 'ソーセージ3本（約180kcal）'] },
  ],
};

// 食事：同じ時刻・同じ品目（カロリー注記はまだ付いていない）→ 同じ
const mealAgain = { mealType: '朝食', time: '08:10', items: ['フルフル 明太フランスパン1本', '卵豆腐', 'ソーセージ3本'] };
assert.ok(findDuplicate(day, 'meal', mealAgain), '再送された朝食は同じと見なす');
assert.ok(findDuplicate(day, 'meal', { ...mealAgain, time: '8:10' }), '「8:10」と「08:10」は同じ時刻');
assert.strictEqual(findDuplicate(day, 'meal', { ...mealAgain, time: '08:11' }), null, '時刻が違えば別の食事');
assert.strictEqual(findDuplicate(day, 'meal', { ...mealAgain, mealType: '昼食' }), null, '種別が違えば別');
assert.strictEqual(findDuplicate(day, 'meal', { ...mealAgain, items: ['明太フランスパン1本', '卵豆腐'] }), null, '品目が違えば別');
assert.strictEqual(findDuplicate(day, 'meal', { ...mealAgain, items: [] }), null, '空の記録は照合しない');

// 運動・メモ：時刻と内容（消費カロリーの注記は無視）
assert.ok(findDuplicate(day, 'exercise', { time: '18:00', content: 'ジムで筋トレ1時間' }));
assert.strictEqual(findDuplicate(day, 'exercise', { time: '18:00', content: 'ジムで筋トレ2時間' }), null);
assert.ok(findDuplicate(day, 'memo', { time: '09:05', content: '昨日の夜福岡から帰宅。' }));
assert.strictEqual(findDuplicate(day, 'memo', { time: '10:10', content: '昨日の夜福岡から帰宅。' }), null, '時刻が違うメモは別');

// 体調・睡眠
assert.ok(findDuplicate(day, 'condition', { time: '08:50', level: '悪い', stool: '柔らかめ', note: '' }));
assert.strictEqual(findDuplicate(day, 'condition', { time: '08:50', level: '普通', stool: '柔らかめ', note: '' }), null);
assert.ok(findDuplicate(day, 'sleep', { bedtime: '24:00', wake: '6:20' }));
assert.strictEqual(findDuplicate(day, 'sleep', { bedtime: '23:00', wake: '06:20' }), null);
assert.strictEqual(findDuplicate(null, 'memo', { time: '09:05', content: 'x' }), null, 'その日の記録が無ければ照合しない');

// 端末IDの記憶
assert.strictEqual(recallEntry('p:1:abc'), null);
rememberEntry('p:1:abc', { notion: 'ok' });
assert.deepStrictEqual(recallEntry('p:1:abc'), { notion: 'ok' });
assert.strictEqual(recallEntry('p:2:abc'), null, '別の保存先のIDは別物');
assert.strictEqual(normalizeClientId('3f1c2a9e-1b2c-4d5e-8f90-abcdef123456'), '3f1c2a9e-1b2c-4d5e-8f90-abcdef123456');
assert.strictEqual(normalizeClientId('short'), '', '短すぎるIDは受け付けない');
assert.strictEqual(normalizeClientId({ a: 1 }), '');

console.log('ALL ASSERTIONS PASSED');
