const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const META_LABELS = { memo: 'メモ', sleep: '睡眠', exercise: '運動', condition: '体調' };
const MEAL_TYPES = ['朝食', '昼食', '夕食', '間食', '飲み物'];
const CONDITION_LEVELS = ['絶好調', '良い', '普通', '悪い', '最悪'];
const STOOL_OPTIONS = ['水っぽい', '柔らかめ', '普通', '硬め'];
// 以前の表記。過去の記録を編集して保存し直す時に弾かないよう受け付ける
const LEGACY_STOOL_OPTIONS = ['柔らかい', '硬い'];

function pad(n) {
  return String(n).padStart(2, '0');
}

// 日本時間の「今日」の年月日を { year, month, day } で返す。
// サーバーの実行環境（Renderなど）はUTCで動いていることが多く、DateのgetFullYear()等を
// そのまま使うと日本時間の午前0時〜8時台は前日扱いになってしまう（例: JST 6:45は
// UTCでは前日21:45）。必ずAsia/Tokyoで計算する。
function tokyoTodayParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

// 日本時間の「今日」から offsetDays 日ずらした日付情報を "YYYY-MM-DD" と曜日（1文字）で返す。
// Y/M/Dの組をUTC上でのカレンダー演算に使うだけなので、時刻を持たず、
// サーバーのタイムゾーンやDSTに関係なく安全に日をずらせる。
function dateInfoWithOffset(offsetDays) {
  const { year, month, day } = tokyoTodayParts();
  const d = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const weekday = WEEKDAYS[d.getUTCDay()];
  return { dateStr, weekday };
}

// 今日の日付情報を "YYYY-MM-DD" と曜日（1文字）で返す（常に日本時間基準）
function todayInfo() {
  return dateInfoWithOffset(0);
}

// 前日の日付情報を同じ形式で返す（「きのうのふりかえり」機能用）
function yesterdayInfo() {
  return dateInfoWithOffset(-1);
}

// "YYYY-MM-DD" の文字列から dateStr と曜日を返す。形式が不正なら null。
// オフライン再送キューが日をまたいで送ってきた記録を、正しい日の
// ブロックに入れるために使う。
function dateInfoFor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return { dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, weekday: WEEKDAYS[d.getUTCDay()] };
}

// 就寝・起床時刻（"HH:MM"）から睡眠時間を計算する。日をまたぐ場合（起床時刻が就寝時刻以前）
// は翌日起床とみなす。
function calcSleepDuration(bedtime, wake) {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let minutes = (wh * 60 + wm) - (bh * 60 + bm);
  // 日付をまたいだ時（負）だけ24時間を足す。以前は「<= 0」だったため、
  // 就寝と起床が同じ時刻だと0分ではなく24時間として扱われていた
  if (minutes < 0) minutes += 24 * 60;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

// 運動の内容は複数行の入力に対応: 1回の「記録する」で書いた内容は、行がいくつあっても
// 1件の記録として扱う（ジムで何種目かやった、というのを1つのまとまりで残す）。
// ここでは各行の前後の空白と空行を取り除くだけで、行は分けない。
// 1行も無ければエラー。
function splitExerciseLines(content) {
  const lines = String(content || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error('content is required');
  return lines;
}

// 運動の内容を、保存する形（空行なし・各行の前後の空白なし・改行区切り）に整える
function normalizeExerciseContent(content) {
  return splitExerciseLines(content).join('\n');
}

// リクエストボディ(category, payload)のバリデーションと、メタ行/食事行に使うテキストの生成
function buildMetaText(category, payload) {
  const label = META_LABELS[category];
  if (!label) throw new Error(`unknown meta category: ${category}`);
  if (category === 'sleep') {
    if (!payload.bedtime || !payload.wake) throw new Error('bedtime and wake are required');
    const { hours, minutes } = calcSleepDuration(payload.bedtime, payload.wake);
    return `${payload.bedtime}就寝、${payload.wake}起床（${hours}時間${minutes}分）`;
  }
  if (category === 'exercise') {
    // 複数行でも1件の記録。改行はそのまま残す（履歴では行のまま見せる）
    const content = normalizeExerciseContent(payload.content);
    return payload.time ? `${payload.time} ${content}` : content;
  }
  if (category === 'condition') {
    // 「調子」は必須ではない（排便だけ・内容だけの記録も許可する）が、
    // 何も無い記録は意味が無いので、level・stool・noteのいずれか1つは必須にする
    if (payload.level && !CONDITION_LEVELS.includes(payload.level)) {
      throw new Error(`level must be one of ${CONDITION_LEVELS.join(', ')}`);
    }
    if (payload.stool && !STOOL_OPTIONS.includes(payload.stool) && !LEGACY_STOOL_OPTIONS.includes(payload.stool)) {
      throw new Error(`stool must be one of ${STOOL_OPTIONS.join(', ')}`);
    }
    const note = (payload.note || '').trim();
    if (!payload.level && !payload.stool && !note) {
      throw new Error('level, stool, or note is required');
    }
    let body = payload.level || '';
    if (payload.stool) body += `（排便：${payload.stool}）`;
    if (note) body += body ? `：${note}` : note;
    return payload.time ? `${payload.time} ${body}` : body;
  }
  if (category === 'memo') {
    if (!payload.content) throw new Error('content is required');
    return payload.time ? `${payload.time} ${payload.content}` : payload.content;
  }
  throw new Error(`unhandled meta category: ${category}`);
}

// 品目リストが「先頭 + 同じ並びの繰り返し」になっている場合、繰り返しを1つにまとめる。
// 同じ日に同じ食事種別の見出しが2つあると、以前は両方の品目が1つにまとめて読まれ、
// 保存し直すたびに片方ぶんが増えていった。その結果できてしまった記録を元に戻すためのもの。
function collapseRepeatedItems(items) {
  const n = items.length;
  let best = items;
  for (let len = 1; len <= Math.floor(n / 2); len++) {
    // 末尾から長さlenのかたまりを取り、同じ並びが何回続いているか数える
    let reps = 1;
    while ((reps + 1) * len <= n) {
      const prev = items.slice(n - (reps + 1) * len, n - reps * len).join('\u0000');
      const last = items.slice(n - len).join('\u0000');
      if (prev !== last) break;
      reps++;
    }
    if (reps > 1) {
      const collapsed = items.slice(0, n - (reps - 1) * len);
      if (collapsed.length < best.length) best = collapsed;
    }
  }
  return best;
}

function validateMealPayload(payload) {
  if (!MEAL_TYPES.includes(payload.mealType)) {
    throw new Error(`mealType must be one of ${MEAL_TYPES.join(', ')}`);
  }
  const items = (payload.items || []).map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) throw new Error('items must have at least one non-empty entry');
  return items;
}

// 品目リストを検証し、時刻が指定されていれば各品目の先頭に付与する
// （同じ送信内の品目は同じタイミングで食べたものとして、同じ時刻を付ける）。
function formatMealItems(payload) {
  const items = validateMealPayload(payload);
  const time = (payload.time || '').trim();
  return time ? items.map((i) => `${time} ${i}`) : items;
}

module.exports = {
  WEEKDAYS,
  META_LABELS,
  MEAL_TYPES,
  CONDITION_LEVELS,
  STOOL_OPTIONS,
  todayInfo,
  yesterdayInfo,
  dateInfoFor,
  buildMetaText,
  splitExerciseLines,
  normalizeExerciseContent,
  calcSleepDuration,
  validateMealPayload,
  formatMealItems,
  collapseRepeatedItems,
};
