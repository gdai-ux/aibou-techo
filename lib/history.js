// Notionページの内容を読み取り、履歴表示用に構造化データへ変換する。

const { listAllChildren, blockPlainText } = require('./notion');
const { CONDITION_LEVELS, WEEKDAYS } = require('./format');

const MEAL_TYPES = ['朝食', '昼食', '夕食', '間食', '飲み物'];

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// "YYYY-MM-DD" の前日の日付・曜日を返す
function prevDateInfo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateStr: `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`,
    weekday: WEEKDAYS[prev.getUTCDay()],
  };
}

// 「07:30 内容」の形から時刻を取り出す。
// 内容は改行を含むことがある（メモや体調の自由入力）ので、.ではなく[\s\S]で拾う。
// （.は改行に一致しないため、改行を含むメモは時刻を取り出せず、
//   時刻が本文の先頭に残ったまま「時刻なしの記録」として最後に並んでいた）
function parseTimePrefix(text) {
  const m = text.match(/^(\d{1,2}:\d{2})\s+([\s\S]*)$/);
  if (m) return { time: m[1], rest: m[2] };
  return { time: null, rest: text };
}

function parseSleep(text) {
  const m = text.match(/^(\d{1,2}:\d{2})就寝、(\d{1,2}:\d{2})起床(?:（(\d+)時間(\d+)分）)?$/);
  if (!m) return { raw: text };
  const bedtime = m[1];
  const wake = m[2];
  let hours = m[3] !== undefined ? Number(m[3]) : null;
  let minutes = m[4] !== undefined ? Number(m[4]) : null;
  if (hours === null) {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    // 日付をまたいだ時（負）だけ24時間を足す（0分を24時間にしない）
    if (mins < 0) mins += 24 * 60;
    hours = Math.floor(mins / 60);
    minutes = mins % 60;
  }
  return { bedtime, wake, hours, minutes, totalMinutes: hours * 60 + minutes };
}

// 「調子」は必須ではなくなった（排便だけ・内容だけの記録もあり得る）ため、
// levelが無い場合は先頭の（排便：...）だけを見て、残りをnoteとして扱う。
function parseCondition(text) {
  const { time, rest } = parseTimePrefix(text);
  const level = CONDITION_LEVELS.find((l) => rest.startsWith(l)) || null;
  let remainder = level ? rest.slice(level.length) : rest;

  let stool = null;
  const stoolMatch = remainder.match(/^（排便：([^）]+)）/);
  if (stoolMatch) {
    stool = stoolMatch[1];
    remainder = remainder.slice(stoolMatch[0].length);
  }

  let note = '';
  if (remainder.startsWith('：')) {
    note = remainder.slice(1);
  } else if (!level && !stool) {
    // level・stoolどちらも無い場合、残り全体がそのままnote（区切りの「：」は付いていない）
    note = remainder;
  }
  return { time, level, stool, note };
}

// 「14:30 30分」または「30分」を読む。昼寝は長さだけ分かればよいので、
// 就寝・起床の時刻は持たない
function parseNap(text) {
  const { time, rest } = parseTimePrefix(text);
  const m = rest.match(/^(\d+)\s*分$/);
  return { time, minutes: m ? Number(m[1]) : 0 };
}

function parseSimple(text) {
  const { time, rest } = parseTimePrefix(text);
  return { time, content: rest };
}

// Notionページの子ブロックを、日付ごとの構造化データ配列に変換する（新しい日付が先頭）
async function fetchHistory({ token, pageId, limitDays = 30 }) {
  const children = await listAllChildren(token, pageId);
  const days = [];
  let current = null;
  let currentMeal = null;

  // ふりかえり以外の記録が最後に編集された時刻を控えておく。
  // 「ふりかえりを書いた後に記録が直されたか」を見分けるために使う
  // （直されていれば、次に開いた時に書き直す）
  const noteDataEdit = (day, block) => {
    const t = block.last_edited_time;
    if (!t) return;
    if (!day.dataEditedAt || t > day.dataEditedAt) day.dataEditedAt = t;
  };

  for (const b of children) {
    if (b.type === 'heading_2') {
      const text = blockPlainText(b);
      const m = text.match(/^(\d{4}-\d{2}-\d{2})（(.)）$/);
      if (!m) {
        current = null;
        currentMeal = null;
        continue;
      }
      current = { dateStr: m[1], weekday: m[2], sleep: null, nap: [], exercise: [], condition: [], memo: [], meals: [], review: null, bedtimeCarry: null, dataEditedAt: null };
      days.push(current);
      currentMeal = null;
      continue;
    }

    if (!current) continue;

    if (b.type === 'paragraph') {
      const text = blockPlainText(b);
      const mealHeader = MEAL_TYPES.find((mt) => text === mt);
      if (mealHeader) {
        // 同じ日に同じ食事種別を2回追記すると、Notion側は見出しが2つ並ぶ。
        // これを1つの記録にまとめてしまうと、編集して保存し直した時に
        // 片方の見出しにだけ全品目を書き戻すことになり、品目が増え続ける。
        // 見出しごとに別の記録として扱う。
        currentMeal = { mealType: mealHeader, blockId: b.id, items: [] };
        current.meals.push(currentMeal);
        noteDataEdit(current, b);
        continue;
      }
      currentMeal = null;
      if (text.startsWith('睡眠：')) {
        current.sleep = { blockId: b.id, ...parseSleep(text.slice(3)) };
        noteDataEdit(current, b);
        continue;
      }
      if (text.startsWith('昼寝：')) {
        current.nap.push({ blockId: b.id, ...parseNap(text.slice(3)) });
        noteDataEdit(current, b);
        continue;
      }
      if (text.startsWith('運動：')) {
        current.exercise.push({ blockId: b.id, ...parseSimple(text.slice(3)) });
        noteDataEdit(current, b);
        continue;
      }
      if (text.startsWith('体調：')) {
        current.condition.push({ blockId: b.id, ...parseCondition(text.slice(3)) });
        noteDataEdit(current, b);
        continue;
      }
      if (text.startsWith('メモ：')) {
        current.memo.push({ blockId: b.id, ...parseSimple(text.slice(3)) });
        noteDataEdit(current, b);
        continue;
      }
      if (text.startsWith('振り返り：')) {
        current.review = { blockId: b.id, content: text.slice(5), editedAt: b.last_edited_time || null };
        continue;
      }
      continue;
    }

    if (b.type === 'bulleted_list_item' && currentMeal) {
      currentMeal.items.push(blockPlainText(b));
      noteDataEdit(current, b);
    }
  }

  // 睡眠記録は「記録した日（＝起床後にその日の見出しの下へ記録した日）」の下に
  // まとまって保存される。就寝時刻・起床時刻を1回で入力するフォームの都合上、
  // 実際に記録するのは起きた後（＝見出しの日＝起床した日）になるため、
  // 起床は常にその見出しの日のもの。一方、就寝が日をまたぐ場合
  // （起床時刻が就寝時刻以前の数値＝前の晩に寝て当日の朝に起きた場合）、
  // 就寝したのは実際には前日の夜である。前日の記録を見た時にも就寝時刻が
  // 分かるよう、睡眠記録自体はそのままに、前日のデータへ就寝時刻を付加しておく
  // （前日の見出しがまだ無い＝その日は他に何も記録していない場合は、
  // 表示用の空の日データを新しく作って差し込む）。
  applyBedtimeCarry(days);

  return days.slice(0, limitDays);
}

// 就寝の日またぎ処理（DBモードのlib/notionDb.jsからも使う共有処理）
function applyBedtimeCarry(days) {
  for (const day of days.slice()) {
    const sleep = day.sleep;
    if (!sleep || !sleep.bedtime || !sleep.wake) continue;
    if (timeToMinutes(sleep.bedtime) <= timeToMinutes(sleep.wake)) continue; // 日をまたいでいない（同日内の仮眠など）

    const prev = prevDateInfo(day.dateStr);
    let prevDay = days.find((d) => d.dateStr === prev.dateStr);
    if (!prevDay) {
      prevDay = { dateStr: prev.dateStr, weekday: prev.weekday, sleep: null, nap: [], exercise: [], condition: [], memo: [], meals: [], review: null, bedtimeCarry: null, dataEditedAt: null };
      // daysは新しい日付が先頭なので、その並びを保ったまま挿入する
      const insertIdx = days.findIndex((d) => d.dateStr < prev.dateStr);
      if (insertIdx === -1) days.push(prevDay); else days.splice(insertIdx, 0, prevDay);
    }
    prevDay.bedtimeCarry = { time: sleep.bedtime, toDateStr: day.dateStr };
  }
}

module.exports = { fetchHistory, applyBedtimeCarry };
