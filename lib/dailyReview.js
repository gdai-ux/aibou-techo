// 今日ここまでの記録（睡眠・運動・食事・体調・メモ）を、アプリに住む小さな
// キャラクターが読んで、今日の進み具合に一言つける機能。
// キャラクターは「一緒に健康習慣に取り組む相棒」。口調は5段階（超スパルタ〜
// 超やさしい）で選べる。記録が増えるたびに書き直される。
//
// 毎回ちがうコメントにするために、3つを変えている:
//   1. 切り口（睡眠・カロリー・週の目標…）を毎回ちがうものにする
//   2. 書き出しの型（数字から／課題から／問いかけから…）も毎回変える
//   3. 直近の記録と、今日の数字（摂取kcalと目安、週の運動日数）を渡して、
//      その日にしか言えない具体的な中身にする
// 型を固定すると、どんな記録でも同じ形の文章になってしまう（実際そうなっていた）。

const { dayKcal } = require('./bodyTarget');

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// 毎回ちがう切り口で書かせる。ここが同じだと、言い回しを変えても
// 「褒めて、最後に頑張ろう」の同じ文章になる
const FOCUS_ANGLES = [
  '睡眠の長さと、それが今日の動きにどう効いているか',
  '摂取カロリーと目安との差。あと何kcal使えるか / 何kcal超えているか',
  '食事の中身の偏り（たんぱく質・野菜・炭水化物・脂質のバランス）',
  '運動の中身と強度。前回の同じ種目と比べてどうか',
  '今週の運動日数と目標との差',
  '体調や排便と、食事・睡眠とのつながり',
  'まだ記録が無い項目。今日の抜けを埋めること',
  '時間帯の使い方。この時刻までの進み方が早いか遅いか',
  'ここ数日の流れと比べて、今日は上がっているか落ちているか',
  '水分・間食・アルコールなど、見落としやすいもの',
  '今日いちばん効く一手をひとつだけ',
  '記録の中の数字をひとつ取り上げて、そこだけ掘り下げる',
];

// 書き出しの型。同じ入り方を繰り返さないために毎回指定する
const OPENING_STYLES = [
  'いきなり数字から入る',
  '今日いちばんの問題点から入る',
  '直近数日との比較から入る',
  'できている一点を短く認めてから、すぐ課題に入る',
  '問いかけから入る',
  'これからやることの指示から入る',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ふりかえりの口調（5段階）。設定画面で選び、生成時のプロンプトに反映する。
// どのモードでも、人格否定・侮辱・健康を害する指示はしない。
const REVIEW_TONES = {
  oni: {
    label: '超スパルタ',
    prompt: `口調モード: 超スパルタ（鬼コーチ）。
甘やかさない。足りていない所を最初に突く。命令形で言い切る。
「まだ足りん」「言い訳はいい、今から◯◯をやれ」のように短く強く。
できている所に触れるのは一言まで。ほめて終わらない。
人格否定・侮辱はしない（責めるのは行動であって本人ではない）。絵文字は使わない。`,
  },
  strict: {
    label: 'スパルタ',
    prompt: `口調モード: スパルタ（データで見るトレーナー）。
感情を入れず、数字で評価する。足りない数字を名指しで指摘し、
今日中にやることを言い切る。「〜すること」「〜まで下げろ」などの断定でよい。
慰めや前置きは不要。絵文字は使わない。`,
  },
  normal: {
    label: 'ふつう',
    prompt: `口調モード: ふつう（率直な相棒）。
できている点をひとつ、気になる点をひとつ、はっきり挙げる。
遠回しにせず、思ったことをそのまま言う。説教くさくならない範囲で指摘はする。
絵文字は使っても1個まで。`,
  },
  gentle: {
    label: 'やさしい',
    prompt: `口調モード: やさしい。
味方でいてくれる相棒として、まず認めてから話す。指摘は「〜してみない？」と
提案のかたちにする。体調が悪い日は無理をさせない。絵文字は1〜2個使ってよい。`,
  },
  sweet: {
    label: '超やさしい',
    prompt: `口調モード: 超やさしい（全肯定）。
何があっても全肯定で味方してくれる相棒。どんな記録でも最大級に褒めちぎり、
サボりや食べ過ぎすら「休むのも大事だよ〜」と肯定する。
それでも、最後の一手だけはそっと添える。ふわふわで甘い口調。絵文字は2〜3個使ってよい。`,
  },
};
const DEFAULT_TONE = 'normal';

const SYSTEM_PROMPT_BASE = `あなたは、ライフログアプリに住む小さなキャラクターで、
ユーザーと一緒に健康習慣に取り組む相棒（コーチ）です。
ユーザーが「今日ここまで」に記録した内容（睡眠・運動・食事・体調・メモ）と、
直近数日の流れ、今日の数字を読んで、進み具合に一言つけます。

必ず守ること:
- 日本語で2〜4文。長くしない
- 最後に「今日の残り時間でできる具体的な一手」を必ず1つ入れる。
  数字（分・kcal・回・時刻・品目）を必ず添える。「がんばろう」で終わらせない
- 渡された「今回の切り口」を中心に書く。それ以外の話に広げすぎない
- 渡された「今回の書き出しの型」で始める
- 記録にある具体的な内容（時間・数字・言葉）に触れる。一般論で埋めない
- 記録に無いことを、あったことのように書かない。推測する時は推測と分かる書き方にする
- 今日はまだ途中である前提で話す（現在時刻を渡す）
- 前回のコメントが渡された時は、書き出し・語彙・話題を必ず変える。
  同じ言い回しを二度使わない

してはいけないこと:
- 人格否定・侮辱（指摘するのは行動であって、本人ではない）
- 健康を害する指示（極端な絶食、睡眠を削る、体調不良を押して運動させる など）
- 体調が悪い・睡眠が極端に短いと記録されている日に、無理を強いること。
  その日は「落とす」方向の一手を出す`;

function buildSystemPrompt(tone) {
  const t = REVIEW_TONES[tone] || REVIEW_TONES[DEFAULT_TONE];
  return `${SYSTEM_PROMPT_BASE}\n\n${t.prompt}`;
}

// 前日の構造化データ（lib/history.jsのfetchHistoryが返す1日分）を、
// OpenAIに渡すための簡潔なテキストに変換する
function summarizeDay(day) {
  const lines = [];
  if (day.sleep && day.sleep.bedtime) {
    const duration = day.sleep.hours !== undefined && day.sleep.hours !== null
      ? `（${day.sleep.hours}時間${day.sleep.minutes}分）` : '';
    lines.push(`睡眠: ${day.sleep.bedtime}就寝 → ${day.sleep.wake}起床${duration}`);
  }
  if (day.exercise && day.exercise.length) {
    // 1件の中に複数の種目（改行区切り）が入っていることがあるので、行も「、」でつなぐ
    lines.push(`運動: ${day.exercise.map((e) => String(e.content || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('、')).filter(Boolean).join('、')}`);
  }
  if (day.condition && day.condition.length) {
    const conditionText = day.condition
      .map((c) => [c.level, c.stool ? `排便：${c.stool}` : null, c.note].filter(Boolean).join('・'))
      .filter(Boolean)
      .join('、');
    if (conditionText) lines.push(`体調: ${conditionText}`);
  }
  if (day.memo && day.memo.length) {
    lines.push(`メモ: ${day.memo.map((m) => m.content).filter(Boolean).join('、')}`);
  }
  if (Array.isArray(day.meals)) {
    day.meals.forEach((meal) => {
      if (meal.items && meal.items.length) lines.push(`${meal.mealType}: ${meal.items.join('、')}`);
    });
  }
  const kcal = dayKcal(day);
  if (kcal.total) {
    lines.push(`摂取カロリー合計: 約${kcal.total.toLocaleString('ja-JP')}kcal${kcal.unknown ? `（うち${kcal.unknown}品はkcal不明）` : ''}`);
  }
  return lines.length ? lines.join('\n') : '今日はまだ具体的な記録がありません。';
}

// 直近数日の流れ。「3日続けて睡眠が短い」「運動が2日空いた」のような、
// その日だけ見ても分からない指摘ができるようにする
function summarizeRecent(days, todayStr) {
  if (!Array.isArray(days)) return '';
  const past = days.filter((d) => d.dateStr !== todayStr).slice(0, 6);
  if (!past.length) return '';
  const rows = past.map((d) => {
    const parts = [];
    if (d.sleep && d.sleep.totalMinutes) {
      parts.push(`睡眠${Math.floor(d.sleep.totalMinutes / 60)}時間${d.sleep.totalMinutes % 60}分`);
    }
    const ex = (d.exercise || []).length;
    parts.push(ex ? `運動あり(${ex}件)` : '運動なし');
    const k = dayKcal(d);
    if (k.total) parts.push(`摂取${k.total.toLocaleString('ja-JP')}kcal`);
    if (d.condition && d.condition.length) parts.push(`体調${d.condition[d.condition.length - 1].level}`);
    return `${d.dateStr}: ${parts.join(' / ')}`;
  });
  return rows.join('\n');
}

// 目標に対する今日の位置。ここが無いと助言が一般論になる
function summarizeTargets(targets) {
  if (!targets) return '';
  const lines = [];
  if (targets.kcalTarget) {
    const eaten = targets.kcalEaten || 0;
    const left = targets.kcalTarget - eaten;
    lines.push(`1日の目安カロリー: ${targets.kcalTarget.toLocaleString('ja-JP')}kcal（今日ここまで ${eaten.toLocaleString('ja-JP')}kcal、残り ${left.toLocaleString('ja-JP')}kcal）`);
  }
  if (targets.exerciseTarget) {
    lines.push(`今週の運動: ${targets.exerciseDone || 0}日 / 目標${targets.exerciseTarget}日`);
  }
  return lines.join('\n');
}

// 日本時間の現在時刻（HH:MM）。時間帯に合った励ましを作るために渡す
function tokyoNowHHMM() {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

// opts.latest: たった今増えた記録の短い説明（増えた記録に必ず触れさせる）
// opts.previous: 前回のコメント（同じ言い回しの繰り返しを避けさせる）
async function generateDailyReview(apiKey, day, tone, opts = {}) {
  const focus = opts.focus || pick(FOCUS_ANGLES);
  const opening = opts.opening || pick(OPENING_STYLES);
  let summary = `現在時刻: ${tokyoNowHHMM()}\n今日ここまでの記録:\n${summarizeDay(day)}`;
  const targets = summarizeTargets(opts.targets);
  if (targets) summary += `\n\n今日の数字:\n${targets}`;
  const recent = summarizeRecent(opts.recent, day && day.dateStr);
  if (recent) summary += `\n\n直近の記録（今日より前）:\n${recent}`;
  if (opts.latest) summary += `\n\nたった今増えた記録: ${opts.latest}`;
  if (opts.previous) summary += `\n\n前回のコメント（同じ書き出し・言い回し・話題を繰り返さないこと）:\n${opts.previous}`;
  summary += `\n\n今回の切り口: ${focus}`;
  summary += `\n今回の書き出しの型: ${opening}`;
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      temperature: 0.9,
      messages: [
        { role: 'system', content: buildSystemPrompt(tone) },
        { role: 'user', content: summary },
      ],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
  }
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('レビューの生成に失敗しました');
  return text;
}

module.exports = { generateDailyReview, REVIEW_TONES, DEFAULT_TONE, summarizeDay, summarizeRecent, FOCUS_ANGLES, OPENING_STYLES };
