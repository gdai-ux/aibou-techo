// 運動の消費カロリー推定の検証（fetchを差し替えてOpenAIは呼ばない）
const assert = require('assert');
const { withBurnedCalories, stripBurnedKcal, BURNED_PATTERN, KCAL_PATTERN } = require(require('path').join(__dirname, '..', 'lib/calories.js'));
function stub(burnedKcal, opts = {}) {
  global.fetch = async () => ({
    ok: opts.httpOk !== false,
    json: async () => opts.httpOk === false
      ? { error: { message: 'boom' } }
      : { choices: [{ message: { content: JSON.stringify({ burnedKcal }) } }] },
  });
}
const run = async (label, fn) => { await fn(); console.log('  OK:', label); };
(async () => {
  await run('普通に推定できる場合、内容にkcalが付く', async () => {
    stub(280);
    const r = await withBurnedCalories('k', '腹筋マシン27キロ×3、バイク5キロ');
    assert.strictEqual(r.content, '腹筋マシン27キロ×3、バイク5キロ（約280kcal消費）');
    assert.strictEqual(r.burnedKcal, 280);
  });
  await run('推定できない場合(null)は不明の印が付く', async () => {
    stub(null);
    const r = await withBurnedCalories('k', 'なんとなく体を動かした');
    assert.strictEqual(r.content, 'なんとなく体を動かした（kcal不明）');
    assert.strictEqual(r.burnedKcal, null);
  });
  await run('0以下・常識外の値は捨てる', async () => {
    for (const v of [0, -30, 99999, '300']) {
      stub(v);
      const r = await withBurnedCalories('k', 'ランニング');
      assert.strictEqual(r.burnedKcal, null, `値 ${v} は捨てるべき`);
      assert.strictEqual(r.content, 'ランニング（kcal不明）');
    }
  });
  await run('既にkcalが付いた内容を推定し直しても二重にならない', async () => {
    stub(300);
    const r = await withBurnedCalories('k', 'ジムで筋トレ（約280kcal消費）');
    assert.strictEqual(r.content, 'ジムで筋トレ（約300kcal消費）');
  });
  await run('OpenAIがエラーを返したら例外', async () => {
    stub(null, { httpOk: false });
    await assert.rejects(() => withBurnedCalories('k', 'ランニング'));
  });
  await run('摂取と消費の表記が混ざらない', async () => {
    assert.strictEqual('白米（約230kcal）'.match(BURNED_PATTERN), null);
    assert.strictEqual('ジム（約280kcal消費）'.match(KCAL_PATTERN), null);
    assert.strictEqual(stripBurnedKcal('白米（約230kcal）'), '白米（約230kcal）');
    assert.strictEqual(stripBurnedKcal('ジム（kcal不明）'), 'ジム', '不明の印も外せる');
  });
  console.log('ALL ASSERTIONS PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
