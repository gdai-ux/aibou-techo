// 自前DB（Postgres）での記録の読み書き。
//
// Notionデータベース形式（lib/notionDb.js）と同じ約束で動く:
// - 1件の記録 = entries の1行。blockId の代わりに行の id を返す
// - 読み取りは lib/history.js と同じ形の day オブジェクトを返すので、
//   画面側・ふりかえり・カロリー整えはそのまま動く
// - 品目のテキスト形式（「07:30 白米（約240kcal）」）も従来のまま
//
// 入力の検証は従来と同じ関数（buildMetaText / formatMealItems）に通す。
// 利用者の区別は user_id で行い、他人の行は読めも書けもしない。

const { query } = require('./db');
const {
  todayInfo, dateInfoFor, buildMetaText, formatMealItems, normalizeExerciseContent, calcSleepDuration,
} = require('./format');
const { applyBedtimeCarry } = require('./history');

const CATEGORIES = ['sleep', 'exercise', 'memo', 'condition', 'meal', 'review'];

// カテゴリごとの payload を検証して、DBに入れる形にそろえる
function normalizePayload(category, payload) {
  if (!CATEGORIES.includes(category)) throw new Error(`unknown category: ${category}`);
  const p = payload || {};
  if (category === 'meal') {
    const items = formatMealItems(p); // 検証込み。時刻の接頭辞も従来どおり付く
    return { time: (p.time || '').trim(), mealType: p.mealType, items };
  }
  if (category === 'review') {
    const content = String(p.content || '').trim();
    if (!content) throw new Error('content is required');
    return { content };
  }
  buildMetaText(category, p); // 検証だけ（不正なら例外）
  if (category === 'sleep') return { bedtime: p.bedtime, wake: p.wake };
  if (category === 'condition') {
    return { time: (p.time || '').trim(), level: p.level || '', stool: p.stool || '', note: (p.note || '').trim() };
  }
  // memo / exercise
  const content = category === 'exercise' ? normalizeExerciseContent(p.content) : String(p.content);
  return { time: (p.time || '').trim(), content };
}

// 利用者の行を用意する（認証側で作られた id と email をそのまま使う）
async function ensureUser(id, email) {
  await query(
    `INSERT INTO users (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [id, email]
  );
}

async function appendEntry(userId, category, payload, dateInfo) {
  const { dateStr } = dateInfo || todayInfo();
  const data = normalizePayload(category, payload);
  const r = await query(
    `INSERT INTO entries (user_id, date, category, payload) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, dateStr, category, data]
  );
  return { id: r.rows[0].id };
}

// メタ系（メモ/運動/睡眠/体調）を書き換える。日付と種類は変えない
async function updateMeta(userId, id, category, payload) {
  const data = normalizePayload(category, payload);
  const r = await query(
    `UPDATE entries SET payload = $4, updated_at = now()
     WHERE id = $1 AND user_id = $2 AND category = $3`,
    [id, userId, category, data]
  );
  if (!r.rowCount) throw new Error('記録が見つかりません');
}

// 食事の品目を書き換える（時刻の接頭辞付きの従来形式のまま受け取る）
async function updateMealItems(userId, id, items) {
  const clean = (items || []).map((s) => String(s).trim()).filter(Boolean);
  if (!clean.length) throw new Error('items must have at least one non-empty entry');
  const r = await query(
    `UPDATE entries SET payload = payload || jsonb_build_object('items', $3::jsonb), updated_at = now()
     WHERE id = $1 AND user_id = $2 AND category = 'meal'`,
    [id, userId, JSON.stringify(clean)]
  );
  if (!r.rowCount) throw new Error('記録が見つかりません');
}

async function deleteEntry(userId, id) {
  const r = await query(`DELETE FROM entries WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!r.rowCount) throw new Error('記録が見つかりません');
}

// その日のふりかえりを保存する（無ければ作り、あれば書き換える）
async function upsertReview(userId, dateStr, comment) {
  const data = normalizePayload('review', { content: comment });
  const r = await query(
    `INSERT INTO entries (user_id, date, category, payload) VALUES ($1, $2, 'review', $3)
     ON CONFLICT (user_id, date) WHERE category = 'review'
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
     RETURNING id`,
    [userId, dateStr, data]
  );
  return { id: r.rows[0].id };
}

function emptyDay(dateStr) {
  const info = dateInfoFor(dateStr) || { dateStr, weekday: '？' };
  return { dateStr: info.dateStr, weekday: info.weekday, sleep: null, exercise: [], condition: [], memo: [], meals: [], review: null, bedtimeCarry: null, dataEditedAt: null };
}

const orNull = (s) => (s ? s : null);

// 直近 limitDays 日ぶんの記録を、日ごとの構造（新しい日が先頭）で返す
async function fetchHistory(userId, limitDays) {
  const r = await query(
    `SELECT id, to_char(date, 'YYYY-MM-DD') AS date_str, category, payload, updated_at
     FROM entries
     WHERE user_id = $1 AND date >= (CURRENT_DATE - ($2::int + 2))
     ORDER BY date DESC, created_at ASC`,
    [userId, limitDays]
  );

  const byDate = new Map();
  const days = [];
  for (const row of r.rows) {
    let day = byDate.get(row.date_str);
    if (!day) {
      day = emptyDay(row.date_str);
      byDate.set(row.date_str, day);
      days.push(day);
    }
    const p = row.payload || {};
    const editedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    // ふりかえり以外の記録が最後に編集された時刻を控える
    // （ふりかえりを書いた後に記録が直されたかを見分けるため）
    if (row.category !== 'review' && editedAt && (!day.dataEditedAt || editedAt > day.dataEditedAt)) {
      day.dataEditedAt = editedAt;
    }
    if (row.category === 'memo' || row.category === 'exercise') {
      day[row.category].push({ blockId: row.id, time: orNull(p.time), content: p.content || '' });
    } else if (row.category === 'condition') {
      day.condition.push({ blockId: row.id, time: orNull(p.time), level: orNull(p.level), stool: orNull(p.stool), note: p.note || '' });
    } else if (row.category === 'sleep') {
      if (p.bedtime && p.wake) {
        const { hours, minutes } = calcSleepDuration(p.bedtime, p.wake);
        day.sleep = { blockId: row.id, bedtime: p.bedtime, wake: p.wake, hours, minutes, totalMinutes: hours * 60 + minutes };
      } else {
        day.sleep = { blockId: row.id, raw: '' };
      }
    } else if (row.category === 'meal') {
      day.meals.push({ mealType: p.mealType || '間食', blockId: row.id, items: Array.isArray(p.items) ? p.items : [] });
    } else if (row.category === 'review') {
      day.review = { blockId: row.id, content: p.content || '', editedAt };
    }
  }

  days.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  applyBedtimeCarry(days);
  return days.slice(0, limitDays);
}

// 記録がある日付の集合（移行の再開などに使う）
async function listDates(userId) {
  const r = await query(
    `SELECT DISTINCT to_char(date, 'YYYY-MM-DD') AS date_str FROM entries WHERE user_id = $1`,
    [userId]
  );
  return new Set(r.rows.map((x) => x.date_str));
}

// 利用者のデータを全部消す（アカウント削除用。users の行ごと消えるので entries も連鎖で消える）
async function deleteUser(userId) {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}

// 端末をまたいだ小さな設定（選んだキャラクターなど）
async function getSettings(userId) {
  const r = await query(`SELECT settings FROM users WHERE id = $1`, [userId]);
  return (r.rows[0] && r.rows[0].settings) || {};
}

// 既存の設定に patch をマージして保存し、マージ後の内容を返す
async function updateSettings(userId, patch) {
  const r = await query(
    `UPDATE users SET settings = settings || $2::jsonb WHERE id = $1 RETURNING settings`,
    [userId, JSON.stringify(patch || {})]
  );
  return (r.rows[0] && r.rows[0].settings) || {};
}

module.exports = {
  normalizePayload, ensureUser, appendEntry, updateMeta, updateMealItems, deleteEntry, upsertReview,
  fetchHistory, listDates, deleteUser, getSettings, updateSettings,
};
