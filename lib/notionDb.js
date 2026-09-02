// Notionデータベース（1記録=1行）での読み書き。
//
// 従来はNotionページの本文（見出し＋段落＋箇条書き）をテキストとして
// パースしていたが、形式が崩れるとデータ破損につながる（実際に品目が
// 増え続ける不具合が起きた）。データベースの行はプロパティ単位で
// 構造化されているため、この種の事故が構造的に起きない。
//
// ページ本文形式との互換性:
// - 読み取りは lib/history.js と同じ形の day オブジェクトを返すので、
//   フロントエンドと他のサーバー処理はそのまま動く
// - 品目のテキスト形式（「07:30 白米（約240kcal）」など）も従来のまま
// - 移行は既存の記録をDBの行へコピーするだけで、元のページ本文は
//   バックアップとしてそのまま残す

const { todayInfo, dateInfoFor, buildMetaText, formatMealItems, normalizeExerciseContent, calcSleepDuration, CONDITION_LEVELS, MEAL_TYPES } = require('./format');
const { listAllChildren } = require('./notion');
const { applyBedtimeCarry } = require('./history');

const NOTION_VERSION = '2022-06-28';
const DB_TITLE = 'life-log 記録データベース';

const CATEGORY_LABELS = { memo: 'メモ', exercise: '運動', meal: '食事', sleep: '睡眠', condition: '体調', review: 'ふりかえり' };
const LABEL_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_LABELS).map(([k, v]) => [v, k]));

async function dbRequest(token, path, options = {}) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(`Notion API error (${resp.status}): ${data.message || JSON.stringify(data)}`);
    err.notionStatus = resp.status;
    throw err;
  }
  return data;
}

// ---- プロパティの読み書きヘルパー ----------------------------------------

function rt(text) {
  return text ? [{ type: 'text', text: { content: String(text) } }] : [];
}
function readRt(prop) {
  const arr = (prop && (prop.rich_text || prop.title)) || [];
  return arr.map((r) => r.plain_text ?? r.text?.content ?? '').join('');
}
function readSelect(prop) {
  return (prop && prop.select && prop.select.name) || null;
}
function readDate(prop) {
  return (prop && prop.date && prop.date.start) || null;
}

// ---- データベースの発見と作成 --------------------------------------------

// ページ直下に記録データベースがあればそのIDを返す（無ければnull）
async function findDatabaseId(token, pageId) {
  const children = await listAllChildren(token, pageId);
  const db = children.find((b) => b.type === 'child_database' && b.child_database && b.child_database.title === DB_TITLE);
  return db ? db.id : null;
}

async function createDatabase(token, pageId) {
  const data = await dbRequest(token, '/databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: pageId },
      title: rt(DB_TITLE),
      properties: {
        '内容': { title: {} },
        '日付': { date: {} },
        '種類': { select: { options: Object.values(CATEGORY_LABELS).map((name) => ({ name })) } },
        '時刻': { rich_text: {} },
        '食事の種類': { select: { options: MEAL_TYPES.map((name) => ({ name })) } },
        '品目': { rich_text: {} },
        '調子': { select: { options: CONDITION_LEVELS.map((name) => ({ name })) } },
        '排便': { rich_text: {} },
        '補足': { rich_text: {} },
        '就寝': { rich_text: {} },
        '起床': { rich_text: {} },
      },
    }),
  });
  return data.id;
}

// ---- 記録 → 行プロパティ --------------------------------------------------

// カテゴリごとのペイロードを行プロパティに変換する。
// buildMetaText（従来のテキスト組み立て）を通すことで、値の検証も従来と同じになる。
function entryProperties(category, payload, dateStr) {
  const props = {
    '日付': { date: { start: dateStr } },
    '種類': { select: { name: CATEGORY_LABELS[category] } },
  };
  if (category === 'meal') {
    const items = formatMealItems(payload); // 検証込み（時刻の接頭辞も従来のまま）
    props['時刻'] = { rich_text: rt(payload.time || '') };
    props['食事の種類'] = { select: { name: payload.mealType } };
    props['品目'] = { rich_text: rt(items.join('\n')) };
    props['内容'] = { title: rt(`${payload.mealType}：${(payload.items || []).join('、')}`.slice(0, 200)) };
    return props;
  }
  if (category === 'review') {
    props['内容'] = { title: rt(payload.content) };
    return props;
  }
  const text = buildMetaText(category, payload); // 検証込み
  props['内容'] = { title: rt(`${CATEGORY_LABELS[category]}：${text}`.slice(0, 200)) };
  if (category === 'sleep') {
    props['就寝'] = { rich_text: rt(payload.bedtime) };
    props['起床'] = { rich_text: rt(payload.wake) };
  } else if (category === 'condition') {
    props['時刻'] = { rich_text: rt(payload.time || '') };
    if (payload.level) props['調子'] = { select: { name: payload.level } };
    else props['調子'] = { select: null };
    props['排便'] = { rich_text: rt(payload.stool || '') };
    props['補足'] = { rich_text: rt((payload.note || '').trim()) };
  } else {
    // memo / exercise（運動は複数行でも1件。空行や前後の空白だけ整える）
    props['時刻'] = { rich_text: rt(payload.time || '') };
    props['補足'] = { rich_text: rt(category === 'exercise' ? normalizeExerciseContent(payload.content) : payload.content) };
  }
  return props;
}

async function dbAppendEntry(token, dbId, category, payload, dateInfo) {
  const { dateStr } = dateInfo || todayInfo();
  // 運動は複数行でも1回の入力=1件（1行のデータ）
  await dbRequest(token, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { type: 'database_id', database_id: dbId }, properties: entryProperties(category, payload, dateStr) }),
  });
}

// メタ系（メモ/運動/睡眠/体調）の行を編集する。日付と種類は変えない
async function dbUpdateMeta(token, rowId, category, payload) {
  const props = entryProperties(category, payload, '1970-01-01');
  delete props['日付'];
  delete props['種類'];
  await dbRequest(token, `/pages/${rowId}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
}

// 食事の品目を書き換える（時刻の接頭辞付きの従来形式のまま受け取る）
async function dbUpdateMealItems(token, rowId, items) {
  await dbRequest(token, `/pages/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        '品目': { rich_text: rt(items.join('\n')) },
      },
    }),
  });
}

// 行を削除する（Notionではアーカイブ）
async function dbDeleteRow(token, rowId) {
  await dbRequest(token, `/pages/${rowId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
}

// ふりかえり行のコメントを書き換える（口調モードを変えて作り直した時に使う）
async function dbUpdateReview(token, rowId, comment) {
  await dbRequest(token, `/pages/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { '内容': { title: rt(comment) } } }),
  });
}

async function dbAppendReview(token, dbId, dateStr, comment) {
  await dbRequest(token, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'database_id', database_id: dbId },
      properties: entryProperties('review', { content: comment }, dateStr),
    }),
  });
}

// ---- 行 → dayオブジェクト（lib/history.jsと同じ形） -----------------------

async function queryAllRows(token, dbId, body) {
  const rows = [];
  let cursor = undefined;
  do {
    const data = await dbRequest(token, `/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return rows;
}

function emptyDay(dateStr) {
  const info = dateInfoFor(dateStr) || { dateStr, weekday: '？' };
  return { dateStr: info.dateStr, weekday: info.weekday, sleep: null, exercise: [], condition: [], memo: [], meals: [], review: null, bedtimeCarry: null, dataEditedAt: null };
}

async function dbFetchHistory(token, dbId, limitDays) {
  // 余裕を持った日付で絞ってから、日単位でlimitDaysに切り詰める
  const now = todayInfo().dateStr;
  const [y, m, d] = now.split('-').map(Number);
  const cutoffDate = new Date(Date.UTC(y, m - 1, d - (limitDays + 2)));
  const cutoff = `${cutoffDate.getUTCFullYear()}-${String(cutoffDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getUTCDate()).padStart(2, '0')}`;

  const rows = await queryAllRows(token, dbId, {
    filter: { property: '日付', date: { on_or_after: cutoff } },
    sorts: [{ property: '日付', direction: 'descending' }],
  });

  const byDate = new Map();
  const days = [];
  for (const row of rows) {
    const p = row.properties || {};
    const dateStr = (readDate(p['日付']) || '').slice(0, 10);
    const label = readSelect(p['種類']);
    const category = LABEL_TO_CATEGORY[label];
    if (!dateStr || !category) continue;
    let day = byDate.get(dateStr);
    if (!day) {
      day = emptyDay(dateStr);
      byDate.set(dateStr, day);
      days.push(day);
    }
    const time = readRt(p['時刻']) || null; // 従来のパーサーは時刻なしをnullで返すので揃える
    // ふりかえり以外の記録が最後に編集された時刻を控える
    // （ふりかえりを書いた後に記録が直されたかを見分けるため）
    const noteDataEdit = () => {
      const t = row.last_edited_time;
      if (t && (!day.dataEditedAt || t > day.dataEditedAt)) day.dataEditedAt = t;
    };
    if (category !== 'review') noteDataEdit();
    if (category === 'memo') {
      day.memo.push({ blockId: row.id, time, content: readRt(p['補足']) });
    } else if (category === 'exercise') {
      day.exercise.push({ blockId: row.id, time, content: readRt(p['補足']) });
    } else if (category === 'condition') {
      day.condition.push({ blockId: row.id, time, level: readSelect(p['調子']), stool: readRt(p['排便']) || null, note: readRt(p['補足']) });
    } else if (category === 'sleep') {
      const bedtime = readRt(p['就寝']);
      const wake = readRt(p['起床']);
      if (bedtime && wake) {
        const { hours, minutes } = calcSleepDuration(bedtime, wake);
        day.sleep = { blockId: row.id, bedtime, wake, hours, minutes, totalMinutes: hours * 60 + minutes };
      } else {
        day.sleep = { blockId: row.id, raw: readRt(p['内容']) };
      }
    } else if (category === 'meal') {
      const itemsText = readRt(p['品目']);
      day.meals.push({
        mealType: readSelect(p['食事の種類']) || '間食',
        blockId: row.id,
        items: itemsText ? itemsText.split('\n').filter(Boolean) : [],
      });
    } else if (category === 'review') {
      day.review = { blockId: row.id, content: readRt(p['内容']), editedAt: row.last_edited_time || null };
    }
  }

  // 新しい日付が先頭（クエリのソートに依存せず自前でも並べ直す）
  days.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  applyBedtimeCarry(days);
  return days.slice(0, limitDays);
}

// ---- 移行 -----------------------------------------------------------------

// DBに既に入っている日付の集合（移行の途中再開・二重実行防止に使う）
async function dbListDates(token, dbId) {
  const rows = await queryAllRows(token, dbId, {});
  const dates = new Set();
  for (const row of rows) {
    const dateStr = (readDate((row.properties || {})['日付']) || '').slice(0, 10);
    if (dateStr) dates.add(dateStr);
  }
  return dates;
}

// 従来形式のdayオブジェクト1日分を、DBの行としてコピーする
async function migrateDay(token, dbId, day) {
  let rowCount = 0;
  const add = async (category, payload) => {
    await dbAppendEntry(token, dbId, category, payload, { dateStr: day.dateStr });
    rowCount++;
  };
  for (const m of day.memo) await add('memo', { time: m.time, content: m.content });
  for (const e of day.exercise) await add('exercise', { time: e.time, content: e.content });
  for (const c of day.condition) await add('condition', { time: c.time, level: c.level, stool: c.stool, note: c.note });
  if (day.sleep && day.sleep.bedtime && day.sleep.wake) {
    await add('sleep', { bedtime: day.sleep.bedtime, wake: day.sleep.wake });
  }
  for (const meal of day.meals) {
    // 品目は時刻・カロリー付きの従来テキストのまま行へ移す（表示・整え機能が同じ前提で動く）
    await dbRequest(token, '/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'database_id', database_id: dbId },
        properties: {
          '日付': { date: { start: day.dateStr } },
          '種類': { select: { name: '食事' } },
          '食事の種類': { select: { name: meal.mealType } },
          '品目': { rich_text: rt(meal.items.join('\n')) },
          '内容': { title: rt(`${meal.mealType}：${meal.items.join('、')}`.slice(0, 200)) },
        },
      }),
    });
    rowCount++;
  }
  if (day.review && day.review.content) await add('review', { content: day.review.content });
  return rowCount;
}

module.exports = {
  DB_TITLE,
  findDatabaseId,
  createDatabase,
  dbAppendEntry,
  dbUpdateMeta,
  dbUpdateMealItems,
  dbDeleteRow,
  dbAppendReview,
  dbUpdateReview,
  dbFetchHistory,
  dbListDates,
  migrateDay,
};
