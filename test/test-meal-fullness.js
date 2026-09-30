// 食事の「おなかの具合（満腹 / まだ入る）」が、保存する文言・読み戻し・
// pgのpayloadのどれでも往復することを確かめる。
// 品目の中に混ぜると kcal の読み取りを壊すので、品目とは別の場所に持っている。
// おなかの具合を選ばない記録が、これまでと1文字も変わらないことも見る。
const path = require('path');
const {
  FULLNESS_OPTIONS, mealHeadingText, parseMealHeading, validateMealPayload,
} = require(path.join(__dirname, '..', 'lib/format'));
const { fetchHistory } = require(path.join(__dirname, '..', 'lib/history'));
const { buildEntryBlocks } = require(path.join(__dirname, '..', 'lib/notion'));

let idSeq = 1;
let mockChildren = [];
const makeBlock = (type, rich) => ({ id: 'block-' + (idSeq++), type, [type]: rich });
const textBlock = (text) => makeBlock('paragraph', { rich_text: [{ plain_text: text }] });
const bullet = (text) => makeBlock('bulleted_list_item', { rich_text: [{ plain_text: text }] });

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if ((opts.method || 'GET') === 'GET' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }
  throw new Error('unmocked: ' + url);
};

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('  NG:', msg); } else console.log('  ok:', msg); };

(async () => {
  check(FULLNESS_OPTIONS.length === 2, 'おなかの具合は2つ: ' + FULLNESS_OPTIONS.join('/'));

  // 選ばない時の見出しは、これまでの記録と1文字も変わらないこと
  check(mealHeadingText({ mealType: '昼食', items: ['白米'] }) === '昼食', '選ばない時の見出しは今まで通り');
  check(mealHeadingText({ mealType: '昼食', items: ['白米'], fullness: '満腹' }) === '昼食（満腹）', '選ぶと見出しに付く');

  // 見出しの読み戻し
  const a = parseMealHeading('間食（まだ入る）');
  check(a && a.mealType === '間食' && a.fullness === 'まだ入る', '見出しから種類と具合を取り出せる');
  const b = parseMealHeading('夕食');
  check(b && b.mealType === '夕食' && b.fullness === '', '以前の記録（種類だけ）も読める');

  // 食事でない行や、知らない言葉を取り違えないこと
  check(parseMealHeading('睡眠：22:00就寝') === null, '食事でない行は拾わない');
  check(parseMealHeading('昼食（ぺこぺこ）') === null, '一覧に無い言葉は食事の見出しと見なさない');

  // 知らない値は弾く
  let threw = false;
  try { validateMealPayload({ mealType: '昼食', items: ['白米'], fullness: 'ぱんぱん' }); } catch (e) { threw = true; }
  check(threw, '一覧に無い具合は保存させない');

  // ページ形式: 書いた見出しがそのまま
  const blocks = buildEntryBlocks('meal', { mealType: '昼食', items: ['白米', '味噌汁'], fullness: '満腹' });
  const heading = blocks[0].paragraph.rich_text.map((r) => r.text.content).join('');
  check(heading === '昼食（満腹）', 'ページ形式は見出しに書く');
  check(blocks.length === 3, '品目のぶんのブロックはそのまま');

  // ページ形式: 読み戻し。具合ありと具合なしを同じ日に並べる
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-30（水）' }] }));
  mockChildren.push(textBlock('昼食（満腹）'));
  mockChildren.push(bullet('12:30 白米 250kcal'));
  mockChildren.push(bullet('12:30 味噌汁 40kcal'));
  mockChildren.push(textBlock('夕食'));
  mockChildren.push(bullet('19:00 カレー 700kcal'));

  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });
  const day = days.find((d) => d.dateStr === '2026-09-30');
  const lunch = day.meals.find((m) => m.mealType === '昼食');
  const dinner = day.meals.find((m) => m.mealType === '夕食');

  check(lunch && lunch.fullness === '満腹', '具合を読み戻せる');
  check(lunch && lunch.items.length === 2, '具合が付いても品目は壊れない');
  check(lunch && lunch.items[0] === '12:30 白米 250kcal', '品目の時刻とkcalの表記も壊れない');
  check(dinner && dinner.fullness === '', '具合なしの記録は空のまま');
  check(dinner && dinner.items.length === 1, '具合なしの記録も今まで通り読める');

  // pg側（本番はこちら）の payload も同じ形で持つこと
  const { normalizePayload } = require(path.join(__dirname, '..', 'lib/pgStore'));
  check(normalizePayload('meal', { mealType: '夕食', items: ['カレー'], fullness: 'まだ入る' }).fullness === 'まだ入る',
    'pgのpayloadに具合が入る');
  check(normalizePayload('meal', { mealType: '夕食', items: ['カレー'] }).fullness === '',
    '具合を選ばなくても保存できる');
  let pgThrew = false;
  try { normalizePayload('meal', { mealType: '夕食', items: ['カレー'], fullness: 'ぱんぱん' }); } catch (e) { pgThrew = true; }
  check(pgThrew, 'pg側でも一覧に無い具合は弾く');

  if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
  console.log('\nALL ASSERTIONS PASSED');
})();
