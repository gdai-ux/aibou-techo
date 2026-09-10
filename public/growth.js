// キャラクターの育成（ポイントとレベル）の計算。
// トップ画面（index.html）とステータス画面（status.html）で同じ計算を使うため、
// 素の値を返す関数だけをここにまとめている（画面の書き換えはしない）。
//
// ポイントはどこにも保存せず、直近1年の記録から毎回計算し直す。
// 端末が変わっても同じ結果になり、長く続けるほどレベルが積み上がる。
// サボると1年の窓から古い実績が抜けていくので、維持の動機にもなる。

// 週（月曜はじまり）の運動がこの日数に届くとボーナス。設定画面で変えられる
// （mascot.jsが端末・サーバーへの保存を持つ。未設定なら5日）
const GOHAN_WEEK_BONUS = 35;

function exerciseTarget() {
  return window.exerciseWeeklyTarget ? exerciseWeeklyTarget() : 5;
}

// レベルは累計ポイントだけで決まる（キャラクターや難易度では変わらない）。
// キャラクターを変えても、それまでのポイント・レベルがそのまま引き継がれる。
// 以前は難易度（きびしい相棒ほど大きい）が経験値の倍率になっていたが、
// 着せ替えるたびにレベルの見え方が上下して分かりにくいのでやめた。
// 「難易度」はキャラクターの性格（きびしさ）を表す表示だけに使う。

// レベルのカーブの目盛り。1日の満点を68→100にした時、これも同じ比率
// （100/68≒1.47）で広げて、それまでのレベルが変わらないようにしている
const GOHAN_LEVEL_STEP = 44;

// 累計スコアからレベルを出す（44点ごとに間隔が広がる二乗のカーブ）
function gohanLevel(points) {
  return 1 + Math.floor(Math.sqrt(points / GOHAN_LEVEL_STEP));
}

// そのレベルの次に上がるのに必要な累計pt（レベル式の逆算）
function gohanNextAt(level) {
  return Math.ceil(GOHAN_LEVEL_STEP * level * level);
}

// 運動の記録から種目の数を出す。1件の記録に複数行あれば、1行を1種目として数える
// （空行は数えない。1行だけの記録は1種目）
function gohanExerciseItemCount(exercise) {
  return (exercise || []).reduce((sum, e) => {
    const lines = String(e && e.content || '').split(/\r?\n/).filter((l) => l.trim());
    return sum + Math.max(1, lines.length);
  }, 0);
}

// 1日ぶんのポイントの内訳。合計だけでなく「何で何点入ったか」を返すので、
// ステータス画面でそのまま表として出せる（合計はgohanDayPointsが足すだけ）
function gohanDayPointBreakdown(day) {
  const mins = (day && day.sleep && day.sleep.totalMinutes) || 0;
  const sleepPts = mins >= 7 * 60 ? 25 : mins >= 6 * 60 ? 15 : mins >= 5 * 60 ? 8 : 0;

  const exercise = (day && Array.isArray(day.exercise)) ? day.exercise : [];
  // 1種目目=15、2種目目以降は1種目ごとに+5（1日最大25）。
  // 1回の入力に何行か書くと1件の記録の中に複数の種目が入るので、件数ではなく行の数で数える
  const exerciseItems = gohanExerciseItemCount(exercise);
  const exercisePts = exerciseItems ? Math.min(15 + (exerciseItems - 1) * 5, 25) : 0;

  const mealTypes = new Set(((day && day.meals) || []).map((m) => m.mealType));
  const mealCount = ['朝食', '昼食', '夕食'].filter((t) => mealTypes.has(t)).length;

  const hasCondition = !!(day && Array.isArray(day.condition) && day.condition.length);
  const hasMemo = !!(day && Array.isArray(day.memo) && day.memo.length);
  // 睡眠・運動・3食・体調がそろった日はごほうび
  const perfect = !!(mins && exercise.length && mealCount === 3 && hasCondition);

  return [
    {
      key: 'sleep', label: '睡眠', max: 25, pts: sleepPts,
      detail: mins ? `${Math.floor(mins / 60)}時間${mins % 60}分` : 'まだ記録なし',
    },
    {
      key: 'exercise', label: '運動', max: 25, pts: exercisePts,
      detail: exerciseItems ? `${exerciseItems}種目` : 'まだ記録なし',
    },
    {
      key: 'meal', label: '食事', max: 30, pts: mealCount * 10,
      detail: mealCount ? `朝・昼・夕のうち${mealCount}つ` : 'まだ記録なし',
    },
    {
      key: 'condition', label: '体調', max: 5, pts: hasCondition ? 5 : 0,
      detail: hasCondition ? '記録あり' : 'まだ記録なし',
    },
    {
      key: 'memo', label: 'メモ', max: 5, pts: hasMemo ? 5 : 0,
      detail: hasMemo ? '記録あり' : 'まだ記録なし',
    },
    {
      key: 'perfect', label: 'パーフェクトデー', max: 10, pts: perfect ? 10 : 0,
      detail: perfect ? '睡眠・運動・3食・体調がそろった！' : '睡眠・運動・3食・体調がそろうと',
    },
  ];
}

// 1日ぶんの合計スコア（1日最大100点＝満点）
function gohanDayPoints(day) {
  return gohanDayPointBreakdown(day).reduce((sum, row) => sum + row.pts, 0);
}

// その日が属する週（月曜はじまり）のキー
function gohanMondayKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

// 記録の配列から累計ポイントを出す。
// 内訳（日々のぶんと週ボーナス）も返すので、ステータス画面で分けて出せる
// 「何をするとどれだけポイントがもらえるか」の一覧。ステータス画面（今日もらった
// ポイントの下）と、設定画面の「ポイントの説明」で同じ文言を出すために共有する。
// 運動の週目標は設定で変えられるので、呼ばれるたびに文言を組み立て直す
function gohanPointRules() {
  return [
    { label: '睡眠', detail: '7時間以上 / 6時間台 / 5時間台', pts: '25 / 15 / 8点' },
    { label: '運動', detail: '1種目15点、2種目から+5点（1行を1種目と数えます）', pts: '最大25点' },
    { label: '食事', detail: '朝・昼・夕 それぞれ記録すると', pts: '各10点' },
    { label: '体調', detail: '1日1回でも記録すれば', pts: '5点' },
    { label: 'メモ', detail: '1日1回でも記録すれば', pts: '5点' },
    { label: 'パーフェクトデー', detail: '睡眠・運動・3食・体調がそろった日', pts: '+10点' },
    { label: '週の運動ボーナス', detail: `月曜はじまりの週で運動${exerciseTarget()}日以上`, pts: `+${GOHAN_WEEK_BONUS}点` },
  ];
}

function gohanTotalPoints(days) {
  let daily = 0;
  const weekExercise = new Map();
  days.forEach((d) => {
    daily += gohanDayPoints(d);
    if (Array.isArray(d.exercise) && d.exercise.length > 0) {
      const wk = gohanMondayKey(d.dateStr);
      weekExercise.set(wk, (weekExercise.get(wk) || 0) + 1);
    }
  });
  let bonusWeeks = 0;
  weekExercise.forEach((count) => { if (count >= exerciseTarget()) bonusWeeks++; });
  return { total: daily + bonusWeeks * GOHAN_WEEK_BONUS, daily, bonusWeeks };
}

// 1日のスコア。育成のポイントと同じ計算で「その日どれだけ記録できたか」を
// 0〜100点で表す（満点がちょうど100になるようにポイント表を組んである）。段階の言葉と色は睡眠グラフ・運動リングと同じ組にそろえて
// あるので、アプリの中で同じ色が同じ意味になる。
// 難易度（キャラの倍率）はレベルの上がりやすさだけに効くもので、
// その日の点数は誰が相棒でも同じになる。
const GOHAN_SCORE_STAGES = [
  { under: 30, word: 'NICE', color: 'var(--sleep-nice)' },            // 青
  { under: 55, word: 'GOOD', color: 'var(--sleep-good)' },            // 水色
  { under: 85, word: 'GREAT', color: 'var(--sleep-great)' },        // 緑
  { under: Infinity, word: 'EXCELLENT', color: 'var(--sleep-excellent)' }, // 黄色
];

function gohanDayScore(day) {
  const rows = gohanDayPointBreakdown(day || {});
  const score = rows.reduce((sum, r) => sum + r.pts, 0);
  const max = rows.reduce((sum, r) => sum + r.max, 0);
  const ratio = max ? score / max : 0;
  // まだ1件も記録していない日は、言葉を出さずに0点だけ見せる。
  // 段階の境目は満点が100点なので、そのまま点数で判定できる
  const stage = score === 0
    ? { word: '', color: 'var(--sleep-more)' }
    : GOHAN_SCORE_STAGES.find((st) => score < st.under);
  return { score, max, ratio, word: stage.word, color: stage.color };
}

// レベルの節目で増える飾り。ステータス画面で「次は何が増えるか」を出すのにも使う。
// ほっぺ以降（特に王冠）は「ちゃんと続けた人だけの見た目」になるよう、
// 段階を追うごとに間隔を広げてある（王冠だけ早く着くと安っぽく見えるため）
const GOHAN_DECO_STAGES = [
  { level: 3, name: 'ほっぺ', note: '顔にほんのり色がつく' },
  { level: 8, name: '王冠', note: '頭に飾りがのる' },
  { level: 14, name: 'きらきら', note: '飾りがもう一つ増える' },
  { level: 20, name: '金のオーラ', note: 'まわりが金色に光る' },
];

// レベルから飾りの段階（0〜4）を出す
function gohanDecoStage(level) {
  return level >= 20 ? 4 : level >= 14 ? 3 : level >= 8 ? 2 : level >= 3 ? 1 : 0;
}

// 進化の色（武道の帯の色）。姿の変化（飾り）と同じ節目で、帯の色も一緒に上がる
// ようにして、段階が上がった時の「ランクアップ感」を強める。
// 白 → 黄 → 緑 → 茶 → 黒（黒帯は金の縁取りで強さを示す）
const GOHAN_BELT_COLORS = [
  { name: '白帯', color: '#e6e6ec' },
  { name: '黄帯', color: '#ffd60a' },
  { name: '緑帯', color: '#34c759' },
  { name: '茶帯', color: '#8b5e34' },
  { name: '黒帯', color: '#1c1c1e', trim: '#ffd60a' },
];

// レベルから、いまの帯（{name, color, trim?}）を出す
function gohanBelt(level) {
  return GOHAN_BELT_COLORS[gohanDecoStage(level)];
}

// ヘッダーの足元の「ステージ」演出（背景のテーマ）。帯より細かく切り替わり、
// レベルが上がるほど景色が草原→森→海→砂漠→雪山→洞窟→宇宙と移り変わっていく。
// 茶帯のあたりで洞窟（土の中）に、黒帯のあたりで宇宙（夜空に金色の星）に
// なるよう、帯の色のイメージに合わせて境目を選んである
const GOHAN_STAGE_THEMES = [
  { level: 1, key: 'grass', name: '草原' },
  { level: 3, key: 'forest', name: '森' },
  { level: 5, key: 'sea', name: '海' },
  { level: 8, key: 'desert', name: '砂漠' },
  { level: 11, key: 'snow', name: '雪山' },
  { level: 14, key: 'cave', name: '洞窟' },
  { level: 20, key: 'space', name: '宇宙' },
];

// レベルから、いまのステージのテーマを出す
function gohanStageTheme(level) {
  let theme = GOHAN_STAGE_THEMES[0];
  for (const t of GOHAN_STAGE_THEMES) {
    if (level >= t.level) theme = t;
  }
  return theme;
}
