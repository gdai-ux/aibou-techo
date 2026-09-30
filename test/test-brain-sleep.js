// あたまの調子（5段階）と、前の晩のチェック（酒・ポルノ・自慰）が、
// 睡眠の記録に乗って往復することを確かめる。
// いちばん大事なのは2つ。
//  1. 以前の睡眠の記録が今まで通り読めること（「質：」は行末まで読む形なので、
//     タグの入れ方を間違えると質の一部として読み込まれてしまう）
//  2. チェックが外のAIへ送られないこと
const path = require('path');
const lib = path.join(__dirname, '..', 'lib');
const {
  BRAIN_LEVELS, DAY_FLAGS, buildMetaText, extractExtraTags, normalizeDayFlags,
} = require(path.join(lib, 'format'));
const { fetchHistory } = require(path.join(lib, 'history'));
const { summarizeDay } = require(path.join(lib, 'dailyReview'));

let idSeq = 1;
let mockChildren = [];
const makeBlock = (type, rich) => ({ id: 'block-' + (idSeq++), type, [type]: rich });
const textBlock = (text) => makeBlock('paragraph', { rich_text: [{ plain_text: text }] });

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
  check(BRAIN_LEVELS.length === 5, 'あたまは5段階: ' + BRAIN_LEVELS.join('/'));
  check(DAY_FLAGS.join('・') === '酒・ポルノ・自慰', 'チェックは3つ: ' + DAY_FLAGS.join('・'));

  // 何も足さない記録は、これまでと1文字も変わらないこと（過去の記録が読めなくなるため）
  const plain = buildMetaText('sleep', { bedtime: '23:30', wake: '07:00', quality: '浅い' });
  check(plain === '23:30就寝、07:00起床（7時間30分） 質：浅い', 'これまでの睡眠の文言は1文字も変わらない');

  const full = buildMetaText('sleep', {
    bedtime: '22:00', wake: '06:30', quality: '浅い', brain: 'もやもや', flags: ['自慰', '酒'],
  });
  check(full === '22:00就寝、06:30起床（8時間30分）（あたま：もやもや）（チェック：酒・自慰） 質：浅い',
    'あたまとチェックが睡眠の文言に入る: ' + full);

  // 「質：」は行末まで読む形なので、タグは必ずその前に置くこと
  check(full.indexOf('（あたま') < full.indexOf('質：'), 'タグは「質：」より前にある');

  // チェックは一覧の順に並べ直す（押した順で文言が変わると、比べにくいため）
  check(normalizeDayFlags(['自慰', '酒', '酒']).join('・') === '酒・自慰', '押した順に関係なく同じ並びになる');

  // 一覧に無い値は弾く
  let threw = false;
  try { buildMetaText('sleep', { bedtime: '22:00', wake: '06:30', brain: 'ばっちり' }); } catch (e) { threw = true; }
  check(threw, '一覧に無いあたまの段階は弾く');
  threw = false;
  try { buildMetaText('sleep', { bedtime: '22:00', wake: '06:30', flags: ['たばこ'] }); } catch (e) { threw = true; }
  check(threw, '一覧に無いチェックは弾く');

  // タグは文字列のどこにあっても取り出せること
  const a = extractExtraTags('22:00就寝、06:30起床（8時間30分）（チェック：ポルノ）（あたま：軽い） 質：ぐっすり');
  check(a.brain === '軽い' && a.flags.join('') === 'ポルノ', 'タグは順番を問わず読める');
  check(a.rest === '22:00就寝、06:30起床（8時間30分） 質：ぐっすり', 'タグを抜いた残りは元の文言');

  // --- ページ形式：往復 ---
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-30（水）' }] }));
  mockChildren.push(textBlock(`睡眠：${full}`));
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-29（火）' }] }));
  mockChildren.push(textBlock(`睡眠：${plain}`)); // あたまを足す前に書かれた記録

  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });
  const now = days.find((d) => d.dateStr === '2026-09-30').sleep;
  const old = days.find((d) => d.dateStr === '2026-09-29').sleep;

  check(now.brain === 'もやもや', 'あたまを読み戻せる');
  check(now.flags.join('・') === '酒・自慰', 'チェックを読み戻せる');
  check(now.bedtime === '22:00' && now.wake === '06:30', '就寝・起床は壊れない');
  check(now.totalMinutes === 510, '睡眠時間も壊れない');
  check(now.quality === '浅い', '眠りの質が「（あたま：…）」を飲み込んでいない');

  check(old.bedtime === '23:30' && old.quality === '浅い' && old.totalMinutes === 450,
    '以前の記録が今まで通り読める');
  check(!old.brain && old.flags.length === 0, '以前の記録は、あたまとチェックが空');

  // --- pg形式（本番はこちら） ---
  const { normalizePayload } = require(path.join(lib, 'pgStore'));
  const pg = normalizePayload('sleep', { bedtime: '22:00', wake: '06:30', quality: '浅い', brain: '働かない', flags: ['ポルノ', '酒'] });
  check(pg.brain === '働かない', 'pgのpayloadにあたまが入る');
  check(pg.flags.join('・') === '酒・ポルノ', 'pgのpayloadにチェックが入る（並びもそろう）');
  check(pg.quality === '浅い', 'pgのpayloadの眠りの質は今まで通り');
  const pgPlain = normalizePayload('sleep', { bedtime: '22:00', wake: '06:30' });
  check(pgPlain.brain === '' && pgPlain.flags.length === 0, '何も選ばなければ空のまま');
  let pgThrew = false;
  try { normalizePayload('sleep', { bedtime: '22:00', wake: '06:30', flags: ['たばこ'] }); } catch (e) { pgThrew = true; }
  check(pgThrew, 'pg側でも一覧に無いチェックは弾く');

  // --- AIに渡すもの：あたまは渡す、チェックは渡さない ---
  // ここが今回いちばん大事な一線。外のAI（OpenAI）へ送る文字列そのものを見る
  const sent = summarizeDay({
    dateStr: '2026-09-30', weekday: '水', nap: [], exercise: [], meals: [], memo: [], condition: [], review: null,
    sleep: { bedtime: '22:00', wake: '06:30', hours: 8, minutes: 30, totalMinutes: 510, quality: '浅い', brain: 'もやもや', flags: ['酒', 'ポルノ', '自慰'] },
  });
  check(sent.includes('もやもや'), 'AIにはあたまの調子を渡す');
  check(sent.includes('浅い') && sent.includes('22:00'), 'AIには睡眠と質は渡す（今まで通り）');
  check(!sent.includes('ポルノ'), 'AIにポルノは渡さない');
  check(!sent.includes('自慰'), 'AIに自慰は渡さない');
  check(!sent.includes('酒'), 'AIに酒は渡さない');

  if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
  console.log('\nALL ASSERTIONS PASSED');
})();
