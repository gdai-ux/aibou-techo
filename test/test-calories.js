// lib/calories.js の検証（OpenAIは呼ばず、fetchを差し替えて応答を再現する）
const assert = require('assert');
const path = require('path').join(__dirname, '..') + '/lib/calories.js';
const { withEstimatedCalories, stripKcal, appendKcal } = require(path);

const realFetch = global.fetch;
function stub(calories, opts = {}) {
  global.fetch = async () => ({
    ok: opts.httpOk !== false,
    json: async () => opts.httpOk === false
      ? { error: { message: 'boom' } }
      : { choices: [{ message: { content: JSON.stringify({ calories }) } }] },
  });
}
const run = async (label, fn) => { await fn(); console.log('  OK:', label); };

(async () => {
  await run('普通に推定できる場合、品目にkcalが付き合計が出る', async () => {
    stub([230, 60, 180]);
    const r = await withEstimatedCalories('k', '朝食', ['白米', 'ナスの味噌汁', '鶏肉と大根']);
    assert.deepStrictEqual(r.items, ['白米（約230kcal）', 'ナスの味噌汁（約60kcal）', '鶏肉と大根（約180kcal）']);
    assert.strictEqual(r.totalKcal, 470);
  });

  await run('0kcalも数値として扱う（お茶など）', async () => {
    stub([0, 300]);
    const r = await withEstimatedCalories('k', '昼食', ['お茶', 'パスタ']);
    assert.deepStrictEqual(r.items, ['お茶（約0kcal）', 'パスタ（約300kcal）']);
    assert.strictEqual(r.totalKcal, 300);
  });

  await run('推定できない品目(null)には不明の印が付き、合計からは外れる', async () => {
    stub([200, null]);
    const r = await withEstimatedCalories('k', '夕食', ['ごはん', 'よく分からない何か']);
    assert.deepStrictEqual(r.items, ['ごはん（約200kcal）', 'よく分からない何か（kcal不明）']);
    assert.strictEqual(r.totalKcal, 200);
  });

  await run('全部推定できなければ合計はnull', async () => {
    stub([null, null]);
    const r = await withEstimatedCalories('k', '間食', ['？', '？？']);
    assert.strictEqual(r.totalKcal, null);
  });

  await run('個数がずれて返ってきても品目とずれない', async () => {
    stub([100]); // 3品目に対して1件だけ
    const r = await withEstimatedCalories('k', '朝食', ['A', 'B', 'C']);
    assert.deepStrictEqual(r.items, ['A（約100kcal）', 'B（kcal不明）', 'C（kcal不明）']);
    assert.strictEqual(r.totalKcal, 100);
  });

  await run('常識外の値・数値でない値は捨てる', async () => {
    stub([99999, '300', -50, 250]);
    const r = await withEstimatedCalories('k', '夕食', ['A', 'B', 'C', 'D']);
    assert.deepStrictEqual(r.items, ['A（kcal不明）', 'B（kcal不明）', 'C（kcal不明）', 'D（約250kcal）']);
    assert.strictEqual(r.totalKcal, 250);
  });

  await run('既にkcalが付いた品目を推定し直しても二重にならない', async () => {
    stub([250]);
    const r = await withEstimatedCalories('k', '朝食', ['白米（約230kcal）']);
    assert.deepStrictEqual(r.items, ['白米（約250kcal）']);
  });

  await run('OpenAIがエラーを返したら例外（呼び出し側でカロリー無しにする）', async () => {
    stub(null, { httpOk: false });
    await assert.rejects(() => withEstimatedCalories('k', '朝食', ['白米']));
  });

  await run('stripKcal / appendKcal', async () => {
    assert.strictEqual(stripKcal('白米（約1,230kcal）'), '白米');
    assert.strictEqual(stripKcal('白米（kcal不明）'), '白米', '不明の印も外せる');
    assert.strictEqual(appendKcal('白米', null), '白米（kcal不明）');
    assert.strictEqual(appendKcal('白米（kcal不明）', 250), '白米（約250kcal）', '後から推定できたら置き換わる');
    assert.strictEqual(appendKcal('白米', 0), '白米（約0kcal）');
  });

  global.fetch = realFetch;
  console.log('ALL ASSERTIONS PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
