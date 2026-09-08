// 同じ記録の二重登録よけ。
//
// 送信中に通信が切れると、サーバー側では保存できているのに端末は「失敗」と
// 判断して再送キューに入れ、あとで同じ記録をもう一度送ってくる
// （iPhoneでアプリを切り替えた時や、サーバーの起き上がり待ちの間に起きやすい。
// 食事はカロリー推定でOpenAIを呼ぶぶん時間がかかるので、特に起きやすい）。
// 同じ端末のアプリとSafariの両方が開いていて、両方がキューを送ることもある。
//
// そこで /api/entry は、保存の前に次の2つを確かめる:
//  (1) 端末が記録ごとに付けたID（clientId）を一定時間おぼえておき、同じIDなら保存しない
//  (2) 同じ日に、時刻も内容もまったく同じ記録がすでにあれば保存しない
//      （サーバーが再起動してIDを忘れていても、こちらで防げる）
// どちらも「保存済み」として成功を返すので、端末側のキューはきれいに空になる。

// 品目や運動の末尾に付くカロリーの注記（「（約230kcal）」「（約200kcal消費）」「（kcal不明）」）。
// 保存済みの記録には付いていて、送られてくる記録には付いていないので、比べる時は外す
const KCAL_NOTE = /（(約[\d,]+kcal(消費)?|kcal不明)）\s*$/;
const TIME_PREFIX = /^(\d{1,2}):(\d{2})\s+/;

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const stripNote = (s) => norm(s).replace(KCAL_NOTE, '').trim();
const stripTime = (s) => norm(s).replace(TIME_PREFIX, '');
const stripLines = (s) => String(s == null ? '' : s).split(/\r?\n/).map(stripNote).filter(Boolean).join('\n');

// 「8:10」と「08:10」を同じ時刻として比べる
function timeKey(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(norm(t));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : norm(t);
}
const sameTime = (a, b) => timeKey(a) === timeKey(b);

// その日の記録（lib/history.js の day オブジェクト）の中に、payload と同じ内容の
// 記録があれば返す。無ければ null
function findDuplicate(day, category, payload) {
  if (!day || !payload) return null;
  const p = payload;
  if (category === 'meal') {
    const want = (p.items || []).map(stripNote).map(stripTime).filter(Boolean);
    if (!want.length) return null;
    return (day.meals || []).find((m) => {
      if ((m.mealType || '') !== (p.mealType || '')) return false;
      const items = (m.items || []).map(norm);
      const have = items.map(stripNote).map(stripTime).filter(Boolean);
      // 保存済みの品目は先頭に「HH:MM 」が付いている。時刻が違えば別の食事
      const first = TIME_PREFIX.exec(items[0] || '');
      const itemTime = first ? `${first[1]}:${first[2]}` : '';
      if (norm(p.time) || itemTime) { if (!sameTime(p.time, itemTime)) return false; }
      return have.length === want.length && have.every((x, i) => x === want[i]);
    }) || null;
  }
  if (category === 'sleep') {
    const s = day.sleep;
    return s && s.bedtime && sameTime(s.bedtime, p.bedtime) && sameTime(s.wake, p.wake) ? s : null;
  }
  if (category === 'condition') {
    return (day.condition || []).find((c) => sameTime(c.time || '', p.time || '')
      && norm(c.level) === norm(p.level) && norm(c.stool) === norm(p.stool) && norm(c.note) === norm(p.note)) || null;
  }
  if (category === 'memo' || category === 'exercise') {
    const want = stripLines(p.content);
    if (!want) return null;
    return (day[category] || []).find((e) => sameTime(e.time || '', p.time || '') && stripLines(e.content) === want) || null;
  }
  return null;
}

// 端末が付けた記録ID → 保存結果、を一定時間おぼえておく（サーバーが生きている間だけ）
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_MAX = 2000;
const recent = new Map();

function rememberEntry(key, result) {
  recent.delete(key);
  recent.set(key, { at: Date.now(), result });
  while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
}

function recallEntry(key) {
  const hit = recent.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > RECENT_TTL_MS) { recent.delete(key); return null; }
  return hit.result;
}

// 端末が付けるIDとして受け付ける形（UUIDか、それに準じる短い英数字）
function normalizeClientId(id) {
  return typeof id === 'string' && /^[\w-]{8,64}$/.test(id) ? id : '';
}

module.exports = { findDuplicate, rememberEntry, recallEntry, normalizeClientId, RECENT_TTL_MS };
