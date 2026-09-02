// ステータス画面（status.html）。
// 相棒の今の姿・レベル・今日のポイントの内訳・これまでの積み上げを出す。
// 計算そのものは growth.js（トップ画面と共通）に任せ、ここは見せ方だけを持つ。

const STATUS_DAYS = 400; // 育成は直近1年ぶんで計算するので、それに届く日数を読む

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 何かしら記録がある日か（就寝の繰り越しだけで作られた空の日は数えない）
function hasAnyRecord(day) {
  return !!(day.sleep || (day.exercise || []).length || (day.condition || []).length
    || (day.memo || []).length || (day.meals || []).length);
}

// 今日（まだ今日の記録が無ければ昨日）から数えて、何日続けて記録できているか
function streakDays(recorded, today) {
  let count = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!recorded.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (recorded.has(dateKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function renderHero(state) {
  document.getElementById('statusName').textContent = window.mascotName ? mascotName() : 'ごはんくん';
  document.getElementById('statusLevel').textContent = `Lv.${state.level}`;
  const profile = window.mascotProfile ? mascotProfile() : { bio: '' };
  document.getElementById('statusBio').textContent = profile.bio || '';

  // レベルの飾り（ほっぺ・王冠…）を今のレベルに合わせて付ける。
  // トップ画面のapplyGohanVisualStateはこの画面には無いので、ここで付け直す
  const stage = gohanDecoStage(state.level);
  document.querySelectorAll('.status-avatar .gohan-kun').forEach((k) => {
    for (let i = 1; i <= 4; i++) k.classList.toggle(`gohan-stage-${i}`, i <= stage);
  });

  // いまのレベルの入り口から次のレベルまでの、どのあたりにいるか
  const start = state.level > 1 ? gohanNextAt(state.level - 1) : 0;
  const span = Math.max(1, state.nextAt - start);
  const ratio = Math.max(0, Math.min(1, (state.total - start) / span));
  document.getElementById('statusBarFill').style.width = `${(ratio * 100).toFixed(1)}%`;
  const need = Math.max(0, state.nextAt - state.total);
  document.getElementById('statusBarLabel').textContent =
    `${state.total.toLocaleString('ja-JP')}pt ・ 次のレベルまで あと${need.toLocaleString('ja-JP')}pt`;
}

function renderProfile() {
  const profile = window.mascotProfile ? mascotProfile() : { difficulty: 'normal', tone: 'normal' };
  const diff = (window.MASCOT_DIFFICULTY || {})[profile.difficulty];
  const toneLabels = { oni: '超スパルタ', strict: 'スパルタ', normal: 'ふつう', gentle: 'やさしい', sweet: '超やさしい' };
  const mult = GOHAN_DIFFICULTY_MULT[profile.difficulty] || 1;
  document.getElementById('statusProfile').innerHTML = [
    { label: '難易度', detail: diff ? `${diff.stars} ${diff.label}` : '—', value: `×${mult}` },
    { label: '口調', detail: toneLabels[profile.tone] || 'ふつう', value: '' },
  ].map((r) => `<div class="status-row"><span class="rl">${esc(r.label)}</span>`
    + `<span class="rd">${esc(r.detail)}</span>`
    + `<span class="rp">${esc(r.value)}</span></div>`).join('');
}

function renderToday(todayDay) {
  const rows = gohanDayPointBreakdown(todayDay || {});
  const total = rows.reduce((sum, r) => sum + r.pts, 0);
  const max = rows.reduce((sum, r) => sum + r.max, 0);
  document.getElementById('statusToday').innerHTML =
    rows.map((r) => `<div class="status-row ${r.pts > 0 ? 'got' : 'miss'}">`
      + `<span class="rl">${esc(r.label)}</span>`
      + `<span class="rd">${esc(r.detail)}</span>`
      + `<span class="rp">${r.pts > 0 ? '+' : ''}${r.pts}pt</span></div>`).join('')
    + `<div class="status-total"><span>今日の合計</span><span class="tp">+${total}pt<span style="font-size:12px;color:var(--muted);font-weight:600"> / ${max}pt</span></span></div>`;
}

// チャートの描画とインタラクションそのものはscoreChart.js（ホーム画面と共通）にある

function renderStats(days, totals, today) {
  const recorded = new Set(days.filter(hasAnyRecord).map((d) => d.dateStr));
  const streak = streakDays(recorded, today);
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = [...recorded].filter((d) => d.startsWith(monthPrefix)).length;
  const weekKey = gohanMondayKey(dateKey(today));
  const weekExercise = days.filter((d) => (d.exercise || []).length && gohanMondayKey(d.dateStr) === weekKey).length;

  const tiles = [
    { value: totals.total.toLocaleString('ja-JP'), unit: 'pt', label: '累計ポイント' },
    { value: streak, unit: '日', label: '連続で記録' },
    { value: recorded.size, unit: '日', label: '記録した日（1年）' },
    { value: thisMonth, unit: '日', label: '今月の記録' },
    { value: weekExercise, unit: `/${EXERCISE_WEEKLY_TARGET}日`, label: '今週の運動' },
    { value: totals.bonusWeeks, unit: '週', label: `運動${EXERCISE_WEEKLY_TARGET}日を達成` },
  ];
  document.getElementById('statusStats').innerHTML = tiles.map((t) =>
    `<div class="stat-tile"><b>${esc(t.value)}<span style="font-size:12px;font-weight:700;color:var(--muted)">${esc(t.unit)}</span></b>`
    + `<span>${esc(t.label)}</span></div>`).join('');

  document.getElementById('statusStatsNote').textContent =
    `累計ポイントの内わけ: 日々の記録 ${totals.daily.toLocaleString('ja-JP')}pt ＋ `
    + `週の運動ボーナス ${(totals.bonusWeeks * GOHAN_WEEK_BONUS).toLocaleString('ja-JP')}pt（${totals.bonusWeeks}週ぶん）`;
}

function renderDeco(level) {
  document.getElementById('statusDeco').innerHTML = GOHAN_DECO_STAGES.map((s) => {
    const open = level >= s.level;
    return `<div class="status-row deco-row ${open ? 'open' : 'locked'}">`
      + `<span class="rl"><span class="deco-mark">${open ? '✓' : '　'}</span>${esc(s.name)}</span>`
      + `<span class="rd">${esc(s.note)}</span>`
      + `<span class="rp">Lv.${s.level}</span></div>`;
  }).join('');
}

function renderRules() {
  // 一覧そのものはgrowth.js（設定画面の「ポイントの説明」と共通）にある
  document.getElementById('statusRules').innerHTML = GOHAN_POINT_RULES.map((r) =>
    `<div class="status-row"><span class="rl">${esc(r.label)}</span>`
    + `<span class="rd">${esc(r.detail)}</span>`
    + `<span class="rp">${esc(r.pts)}</span></div>`).join('');
}

// 読み込んだ記録。着せ替えで難易度が変わるとレベルも変わるので、
// 取り直さずに出し直せるよう持っておく
let statusDays = null;

function renderAll(days) {
  const totals = gohanTotalPoints(days);
  const level = gohanLevel(totals.total);
  const today = new Date();

  renderProfile();
  renderHero({ total: totals.total, level, nextAt: gohanNextAt(level) });
  renderToday(days.find((d) => d.dateStr === dateKey(today)));
  renderScoreChart(document.getElementById('statusScoreChart'), days, today);
  renderStats(days, totals, today);
  renderDeco(level);
}

async function loadStatus() {
  renderRules();
  try {
    const resp = await fetch(`/api/history?days=${STATUS_DAYS}`, { headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '記録を読み込めませんでした');
    statusDays = data.days || [];
    renderAll(statusDays);
  } catch (e) {
    document.getElementById('statusToday').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    document.getElementById('statusBarLabel').textContent = '記録を読み込めませんでした';
  }
}

// mascot.jsは、キャラクターを描き替えたあとにこの名前の関数を呼ぶ約束になっている
// （トップ画面ではレベルの飾りを付け直す関数）。この画面では、着せ替えで難易度が
// 変わるとレベルも変わるので、取り直さずにその場で出し直す
function applyGohanVisualState() {
  if (statusDays) renderAll(statusDays);
}

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  // 着せ替え画面（mascot.js）はこの画面からも開ける。
  // 保存するとmascot.js側がキャラクターを描き替え、続けて
  // applyGohanVisualState()（下）が呼ばれてステータスも出し直される
  const btn = document.getElementById('openMascotBtn');
  if (btn && window.openMascotSettings) btn.addEventListener('click', openMascotSettings);
  else if (btn) btn.hidden = true;
});
// 引っ張って更新（pull-refresh.js）からも呼ばれる
window.loadStatus = loadStatus;
