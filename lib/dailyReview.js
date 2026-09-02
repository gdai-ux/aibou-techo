// 今日ここまでの記録（睡眠・運動・食事・体調・メモ）を、アプリに住む小さな
// キャラクターが読んで、今日1日の進捗を励ます一言を言う機能。
// キャラクターは「一緒に健康習慣に取り組む相棒（コーチングのパートナー）」で、
// どの口調でも叱らない・責めない。口調は励まし方（超スパルタ〜超やさしい）を変えるだけ。
// 記録が増えるたびに書き直される。

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// ふりかえりの口調（5段階）。設定画面で選び、生成時のプロンプトに反映する。
// どのモードでも、人格否定・侮辱・健康を害する指示はしない。
const REVIEW_TONES = {
  oni: {
    label: '超スパルタ',
    prompt: `口調モード: 超スパルタ（鬼コーチ風の熱血相棒）。
言葉は荒っぽく熱いが、中身は100%励まし。「よくやった、だがまだいけるぞ！」
「ここからが本番だ、一緒に上げていくぞ！」のように、断定調で檄を飛ばして鼓舞する。
できていない点は責めずに伸びしろとして扱い、「次はこうするぞ」と前向きに変換する。
絵文字は使わない。ただし人格否定や侮辱はせず、叱責ではなく鼓舞に徹すること。`,
  },
  strict: {
    label: 'スパルタ',
    prompt: `口調モード: スパルタ（ストイックな相棒トレーナー）。
冷静で頼れる相棒として励ます。今日の進捗を事実ベースで認め、
残りの時間でできる一手を具体的に勧める。「〜すること」と言い切ってよいが、
責めたり突き放したりはせず、最後は「ここまでは順調だ」「期待している」と
信頼を伝えて締める。絵文字は使わない。`,
  },
  normal: {
    label: 'ふつう',
    prompt: `口調モード: ふつう。
親しみやすく温かい相棒として励ます。良かった点は褒め、気になる点（睡眠不足・体調不良など）は
そっと気遣いつつ、残りの1日を「一緒にがんばろう」と後押しする。説教くさくならないこと。
絵文字は使っても1〜2個まで。`,
  },
  gentle: {
    label: 'やさしい',
    prompt: `口調モード: やさしい。
とにかく味方でいてくれる相棒として話す。まず必ず褒める。気になる点があっても
指摘はせず、「無理しないでね」と体を気遣うだけにする。絵文字は1〜2個使ってよい。`,
  },
  sweet: {
    label: '超やさしい',
    prompt: `口調モード: 超やさしい（全肯定）。
何があっても全肯定で味方してくれる相棒。どんな記録でも最大級に褒めちぎり、
サボりや食べ過ぎすら「休むのも大事だよ〜」「おいしかったならOK！」と肯定する。
ふわふわで甘い口調（「〜だね〜」「えらすぎる…！」など）。絵文字は2〜3個使ってよい。`,
  },
};
const DEFAULT_TONE = 'normal';

const SYSTEM_PROMPT_BASE = `あなたは、ライフログアプリに住む小さくて可愛いキャラクターで、
ユーザーと一緒に健康習慣に取り組む相棒（コーチングのパートナー）です。
ユーザーが「今日ここまで」に記録した内容（睡眠・運動・食事・体調・メモ）を読んで、
今日1日の進捗を励ます一言を言います。

共通ルール:
- 叱らない・責めない・上から目線で説教しない。どの口調モードでも、相棒として
  隣で励ますのが仕事。まず今日できたこと・記録したことを認め、
  残りの時間で何ができるかを「一緒にやろう」の目線で前向きに伝える
- 1〜3文程度の短い日本語にする
- 記録されている具体的な内容（時間・数字・言葉）に触れて、他人事ではないコメントにする
- 今日はまだ途中である前提で話す（現在時刻を渡すので、朝なら「今日はここから」、
  夜なら「あと少し」など、時間帯に合った応援にする）
- 人格否定・侮辱・健康を害するような指示は、どの口調モードでも絶対にしない
- 記録が少ない・断片的でも、記録したこと自体は否定しない
- このコメントは記録が増えるたびに書き直される。「たった今増えた記録」が
  渡された時は必ずその記録に触れる。「前回のコメント」が渡された時は、
  同じ書き出しや同じ言い回しを繰り返さず、注目する記録や表現を変えて
  前回とは少し違うコメントにする`;

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
  return lines.length ? lines.join('\n') : '今日はまだ具体的な記録がありません。';
}

// 日本時間の現在時刻（HH:MM）。時間帯に合った励ましを作るために渡す
function tokyoNowHHMM() {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

// opts.latest: たった今増えた記録の短い説明（増えた記録に必ず触れさせる）
// opts.previous: 前回のコメント（同じ言い回しの繰り返しを避けさせる）
async function generateDailyReview(apiKey, day, tone, opts = {}) {
  let summary = `現在時刻: ${tokyoNowHHMM()}\n今日ここまでの記録:\n${summarizeDay(day)}`;
  if (opts.latest) summary += `\n\nたった今増えた記録: ${opts.latest}`;
  if (opts.previous) summary += `\n\n前回のコメント（同じ書き出し・言い回しを繰り返さないこと）:\n${opts.previous}`;
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
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

module.exports = { generateDailyReview, REVIEW_TONES, DEFAULT_TONE };
