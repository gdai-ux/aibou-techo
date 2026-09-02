// 改行を含むメモ・体調から時刻を取り出せることを確認する。
// 以前は正規表現の「.」が改行に一致しないせいで時刻を取り出せず、
// 時刻が本文の先頭に残ったまま「時刻なしの記録」として最後に並んでいた。
const assert = require('assert');
const path = require('path');
const { fetchHistory } = require(path.join(__dirname, '..', 'lib/history'));

let idSeq = 1;
const mockChildren = [];
function makeBlock(type, text) {
  return { id: 'block-' + (idSeq++), type, [type]: { rich_text: [{ plain_text: text }] } };
}
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if ((opts.method || 'GET') === 'GET' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }
  throw new Error('unmocked: ' + url);
};

const MULTILINE = '睡眠時間が十分なだけで活力がぜんぜん違う。\nあとで見返す用のメモ。';

mockChildren.push(makeBlock('heading_2', '2026-09-01（火）'));
mockChildren.push(makeBlock('paragraph', 'メモ：10:25 ループエンジニアリング'));
mockChildren.push(makeBlock('paragraph', `メモ：09:30 ${MULTILINE}`));
mockChildren.push(makeBlock('paragraph', 'メモ：11:10 アウトプットが最初'));
mockChildren.push(makeBlock('paragraph', '体調：08:00 良い：なんとなくだるい。\n夕方には戻った。'));

(async () => {
  const [day] = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });

  const multi = day.memo.find((m) => m.content.startsWith('睡眠時間'));
  assert.ok(multi, '改行を含むメモが読める');
  assert.strictEqual(multi.time, '09:30', '改行を含んでいても時刻を取り出せる');
  assert.strictEqual(multi.content, MULTILINE, '本文の先頭に時刻が残らない');
  console.log('  改行を含むメモの時刻 OK');

  // 表示側は時刻の分数で並べ替えるので、全件に時刻があることが並び順の前提になる
  assert.deepStrictEqual(day.memo.map((m) => m.time), ['10:25', '09:30', '11:10'], '3件とも時刻を持つ');
  console.log('  時刻の取りこぼしなし OK');

  const cond = day.condition[0];
  assert.strictEqual(cond.time, '08:00', '体調も改行を含んで時刻を取り出せる');
  assert.strictEqual(cond.level, '良い', '調子はそのまま読める');
  assert.strictEqual(cond.note, 'なんとなくだるい。\n夕方には戻った。', '内容は改行ごと残る');
  console.log('  改行を含む体調 OK');

  console.log('\nALL ASSERTIONS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
