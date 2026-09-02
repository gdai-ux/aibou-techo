// 運動の内容を複数行で送っても、1回の入力は1件の記録として保存されることを確認する。
// （ジムで何種目かやったものを1つのまとまりで残す。Obsidian・Notionページ・Notion DBの3層とも）
// 各行の前後の空白と空行は取り除き、改行はそのまま残す。
const fs = require('fs');
const assert = require('assert');
const path = require('path');

const { splitExerciseLines, normalizeExerciseContent, buildMetaText, todayInfo } = require(path.join(__dirname, '..', 'lib', 'format'));
const { buildEntryBlocks } = require(path.join(__dirname, '..', 'lib', 'notion'));
const { appendToObsidian } = require(path.join(__dirname, '..', 'lib', 'obsidian'));

// --- 行の整形 ---
assert.deepStrictEqual(splitExerciseLines('ランニング30分'), ['ランニング30分'], '1行はそのまま');
assert.deepStrictEqual(
  splitExerciseLines('ランニング30分\n腹筋20回\r\n\n ストレッチ10分 \n'),
  ['ランニング30分', '腹筋20回', 'ストレッチ10分'],
  '空行は読み飛ばし、前後の空白は削る'
);
assert.strictEqual(
  normalizeExerciseContent('ランニング30分\n\n 腹筋20回 \r\n'),
  'ランニング30分\n腹筋20回',
  '整えた行を改行でつなぐ（1件のまま）'
);
assert.throws(() => normalizeExerciseContent('\n \n'), /content is required/, '中身が無ければエラー');
assert.strictEqual(
  buildMetaText('exercise', { time: '07:30', content: 'ランニング30分\n腹筋20回' }),
  '07:30 ランニング30分\n腹筋20回',
  '時刻は先頭に1回だけ付き、改行は残る'
);
console.log('  normalizeExerciseContent OK');

// --- Notionページ形式: 何行あっても1ブロック ---
const blocks = buildEntryBlocks('exercise', { time: '07:30', content: 'ランニング30分\n腹筋20回\nストレッチ10分' });
assert.strictEqual(blocks.length, 1, '3行でも1ブロック');
const blockText = blocks[0].paragraph.rich_text.map((r) => r.text.content).join('');
assert.strictEqual(blockText, '運動：07:30 ランニング30分\n腹筋20回\nストレッチ10分', 'ラベルと時刻は先頭に1回、行はそのまま');
console.log('  buildEntryBlocks OK');

// --- Obsidian形式: 1件のメタ行（2行目以降は続きの行） ---
const OBS = '/tmp/exercise-multiline-test.md';
fs.writeFileSync(OBS, '');
appendToObsidian(OBS, 'exercise', { time: '07:30', content: 'ランニング30分\n腹筋20回' });
const written = fs.readFileSync(OBS, 'utf8');
const today = todayInfo();
assert.ok(written.includes(`## ${today.dateStr}（${today.weekday}）`), '今日の見出しに入る');
assert.ok(written.includes('**運動**：07:30 ランニング30分\n腹筋20回'), '1件のメタ行に行のまま入る');
assert.strictEqual((written.match(/\*\*運動\*\*：/g) || []).length, 1, '運動のメタ行は1つ');
// 続けてもう1件足しても、前の記録の2行目が壊れない
appendToObsidian(OBS, 'exercise', { time: '18:00', content: 'ストレッチ10分' });
const written2 = fs.readFileSync(OBS, 'utf8');
assert.ok(written2.includes('**運動**：07:30 ランニング30分\n腹筋20回\n**運動**：18:00 ストレッチ10分'), '追記しても行のまま残る');
console.log('  appendToObsidian OK');

// --- Notion DB形式: 何行あっても1行のデータ（dbRequestの呼び出し回数で確認） ---
const notionDb = require(path.join(__dirname, '..', 'lib', 'notionDb'));
const created = [];
global.fetch = async (url, options) => {
  created.push(JSON.parse(options.body));
  return { ok: true, status: 200, json: async () => ({ id: `row-${created.length}` }) };
};
notionDb.dbAppendEntry('token', 'db-id', 'exercise', { time: '07:30', content: 'ランニング30分\n腹筋20回\n\nストレッチ10分 ' })
  .then(() => {
    assert.strictEqual(created.length, 1, '3行でも1件の行');
    const props = created[0].properties;
    assert.strictEqual(props['内容'].title[0].text.content, '運動：07:30 ランニング30分\n腹筋20回\nストレッチ10分', '内容にラベルと時刻が1回付く');
    assert.strictEqual(props['補足'].rich_text[0].text.content, 'ランニング30分\n腹筋20回\nストレッチ10分', '補足は整えた行を改行でつないだもの');
    assert.strictEqual(props['時刻'].rich_text[0].text.content, '07:30');
    console.log('  dbAppendEntry OK');
    console.log('ALL ASSERTIONS PASSED');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
