// あたまの調子（5段階）と、その日のチェック（酒・ポルノ・自慰）が、
// 保存する文言・読み戻し・pgのpayloadのどれでも往復することを確かめる。
// いちばん大事なのは「以前の体調の記録が今まで通り読めること」。
// 体調の文言は（排便：…）の組を並べる形なので、増やしても壊れないようにしてある。
const path = require('path');
const lib = path.join(__dirname, '..', 'lib');
const {
  BRAIN_LEVELS, DAY_FLAGS, buildMetaText, parseConditionExtras, normalizeDayFlags,
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
  const plain = buildMetaText('condition', { level: '普通', stool: '普通', note: '軽い頭痛' });
  check(plain === '普通（排便：普通）：軽い頭痛', 'これまでの文言は1文字も変わらない');

  const full = buildMetaText('condition', {
    level: '良い', brain: '冴えてる', stool: '普通', flags: ['自慰', '酒'], note: '朝から動く',
  });
  check(full === '良い（排便：普通）（あたま：冴えてる）（チェック：酒・自慰）：朝から動く', 'あたまとチェックが文言に入る: ' + full);

  // チェックは一覧の順に並べ直す（押した順で文言が変わると、比べにくいため）
  check(normalizeDayFlags(['自慰', '酒', '酒']).join('・') === '酒・自慰', '押した順に関係なく同じ並びになる');

  // 一覧に無い値は弾く
  let threw = false;
  try { buildMetaText('condition', { level: '普通', brain: 'ばっちり' }); } catch (e) { threw = true; }
  check(threw, '一覧に無いあたまの段階は弾く');
  threw = false;
  try { buildMetaText('condition', { level: '普通', flags: ['たばこ'] }); } catch (e) { threw = true; }
  check(threw, '一覧に無いチェックは弾く');

  // あたまだけ、チェックだけの記録も作れること
  check(buildMetaText('condition', { brain: 'もやもや' }) === '（あたま：もやもや）', 'あたまだけでも記録できる');
  check(buildMetaText('condition', { flags: ['酒'] }) === '（チェック：酒）', 'チェックだけでも記録できる');
  threw = false;
  try { buildMetaText('condition', {}); } catch (e) { threw = true; }
  check(threw, '何も無い記録は作らせない');

  // 組の取り出しは順番を問わないこと（あとから項目が増えても読めるように）
  const a = parseConditionExtras('（あたま：軽い）（排便：硬め）（チェック：ポルノ）：note');
  check(a.brain === '軽い' && a.stool === '硬め' && a.flags.join('') === 'ポルノ' && a.rest === '：note',
    '（キー：値）の組は順番を問わず読める');

  // --- ページ形式：往復 ---
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-30（水）' }] }));
  mockChildren.push(textBlock(`体調：08:00 ${full}`));
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-09-29（火）' }] }));
  mockChildren.push(textBlock(`体調：08:00 ${plain}`)); // あたまを足す前に書かれた記録

  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });
  const now = days.find((d) => d.dateStr === '2026-09-30').condition[0];
  const old = days.find((d) => d.dateStr === '2026-09-29').condition[0];

  check(now.brain === '冴えてる', 'あたまを読み戻せる');
  check(now.flags.join('・') === '酒・自慰', 'チェックを読み戻せる');
  check(now.level === '良い' && now.stool === '普通' && now.note === '朝から動く', '調子・排便・ひとことは壊れない');
  check(now.time === '08:00', '時刻も壊れない');

  check(old.level === '普通' && old.stool === '普通' && old.note === '軽い頭痛', '以前の記録が今まで通り読める');
  check(!old.brain && old.flags.length === 0, '以前の記録は、あたまとチェックが空');

  // --- pg形式（本番はこちら） ---
  const { normalizePayload } = require(path.join(lib, 'pgStore'));
  const pg = normalizePayload('condition', { level: '悪い', brain: '働かない', flags: ['ポルノ', '酒'], note: '' });
  check(pg.brain === '働かない', 'pgのpayloadにあたまが入る');
  check(pg.flags.join('・') === '酒・ポルノ', 'pgのpayloadにチェックが入る（並びもそろう）');
  const pgPlain = normalizePayload('condition', { level: '普通' });
  check(pgPlain.brain === '' && pgPlain.flags.length === 0, '何も選ばなければ空のまま');
  let pgThrew = false;
  try { normalizePayload('condition', { level: '普通', flags: ['たばこ'] }); } catch (e) { pgThrew = true; }
  check(pgThrew, 'pg側でも一覧に無いチェックは弾く');

  // --- AIに渡すもの：あたまは渡す、チェックは渡さない ---
  // ここが今回いちばん大事な一線。外のAI（OpenAI）へ送る文字列そのものを見る
  const sent = summarizeDay({
    dateStr: '2026-09-30', weekday: '水', sleep: null, nap: [], exercise: [], meals: [], memo: [], review: null,
    condition: [{ level: '良い', brain: '冴えてる', stool: '普通', flags: ['酒', 'ポルノ', '自慰'], note: '朝から動く' }],
  });
  check(sent.includes('冴えてる'), 'AIにはあたまの調子を渡す');
  check(sent.includes('良い') && sent.includes('朝から動く'), 'AIには調子とひとことは渡す（今まで通り）');
  check(!sent.includes('ポルノ'), 'AIにポルノは渡さない');
  check(!sent.includes('自慰'), 'AIに自慰は渡さない');
  check(!sent.includes('酒'), 'AIに酒は渡さない');

  if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
  console.log('\nALL ASSERTIONS PASSED');
})();
