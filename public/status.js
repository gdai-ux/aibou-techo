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
  const belt = gohanBelt(state.level);
  document.getElementById('statusName').textContent = window.mascotName ? mascotName() : 'ごはんくん';
  document.getElementById('statusLevel').textContent = `Lv.${state.level}・${belt.name}`;
  const profile = window.mascotProfile ? mascotProfile() : { bio: '' };
  document.getElementById('statusBio').textContent = profile.bio || '';
  // ゲームでサボリ魔王を倒した回数（端末に残る記録）
  let bossWins = 0;
  try { bossWins = Number(localStorage.getItem('gohanBossWins') || 0) || 0; } catch (e) { /* プライベートモード等 */ }
  let bossEl = document.getElementById('statusBossWins');
  if (bossWins > 0) {
    if (!bossEl) {
      bossEl = document.createElement('div');
      bossEl.id = 'statusBossWins';
      bossEl.className = 'status-boss';
      document.getElementById('statusBio').insertAdjacentElement('afterend', bossEl);
    }
    bossEl.textContent = `🏆 サボリ魔王 撃破 ${bossWins}回`;
  } else if (bossEl) {
    bossEl.remove();
  }

  // レベルの飾り（ほっぺ・王冠…）を今のレベルに合わせて付ける。
  // トップ画面のapplyGohanVisualStateはこの画面には無いので、ここで付け直す
  const stage = gohanDecoStage(state.level);
  document.querySelectorAll('.status-avatar .gohan-kun').forEach((k) => {
    for (let i = 1; i <= 4; i++) k.classList.toggle(`gohan-stage-${i}`, i <= stage);
  });
  // ヘッダーの帯（進化の色）も、姿の変化と同じ節目で切り替える
  const header = document.querySelector('.page-header');
  if (header) {
    header.style.setProperty('--belt-color', belt.color);
    header.style.setProperty('--belt-trim', belt.trim || belt.color);
  }

  // いまのレベルの入り口から次のレベルまでの、どのあたりにいるか
  const start = state.level > 1 ? gohanNextAt(state.level - 1) : 0;
  const span = Math.max(1, state.nextAt - start);
  const ratio = Math.max(0, Math.min(1, (state.total - start) / span));
  document.getElementById('statusBarFill').style.width = `${(ratio * 100).toFixed(1)}%`;
  const need = Math.max(0, state.nextAt - state.total);
  document.getElementById('statusBarLabel').textContent =
    `${state.total.toLocaleString('ja-JP')}点 ・ 次のレベルまで あと${need.toLocaleString('ja-JP')}点`;
}

function renderProfile() {
  const profile = window.mascotProfile ? mascotProfile() : { difficulty: 'normal', tone: 'normal' };
  const diff = (window.MASCOT_DIFFICULTY || {})[profile.difficulty];
  const toneLabels = { oni: '超スパルタ', strict: 'スパルタ', normal: 'ふつう', gentle: 'やさしい', sweet: '超やさしい' };
  document.getElementById('statusProfile').innerHTML = [
    { label: '難易度', detail: diff ? diff.label : '—', value: diff ? diff.stars : '' },
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
      + `<span class="rp">${r.pts > 0 ? '+' : ''}${r.pts}点</span></div>`).join('')
    + `<div class="status-total"><span>今日の合計</span><span class="tp">+${total}点<span style="font-size:12px;color:var(--muted);font-weight:600"> / ${max}点</span></span></div>`;
}

// チャートの描画とインタラクションそのものはscoreChart.js（ホーム画面と共通）にある

function renderStats(days, totals, today) {
  const recorded = new Set(days.filter(hasAnyRecord).map((d) => d.dateStr));
  const streak = streakDays(recorded, today);
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = [...recorded].filter((d) => d.startsWith(monthPrefix)).length;
  const weekKey = gohanMondayKey(dateKey(today));
  const weekExercise = days.filter((d) => (d.exercise || []).length && gohanMondayKey(d.dateStr) === weekKey).length;
  const weeklyTarget = window.exerciseWeeklyTarget ? exerciseWeeklyTarget() : 5;

  const tiles = [
    { value: totals.total.toLocaleString('ja-JP'), unit: '点', label: '累計スコア' },
    { value: streak, unit: '日', label: '連続で記録' },
    { value: recorded.size, unit: '日', label: '記録した日' },
    { value: thisMonth, unit: '日', label: '今月の記録' },
    { value: weekExercise, unit: `/${weeklyTarget}日`, label: '今週の運動' },
    { value: totals.bonusWeeks, unit: '週', label: `運動${weeklyTarget}日を達成` },
  ];
  document.getElementById('statusStats').innerHTML = tiles.map((t) =>
    `<div class="stat-tile"><b>${esc(t.value)}<span style="font-size:12px;font-weight:700;color:var(--muted)">${esc(t.unit)}</span></b>`
    + `<span>${esc(t.label)}</span></div>`).join('');

  document.getElementById('statusStatsNote').textContent =
    `累計スコアの内わけ: 日々の記録 ${totals.daily.toLocaleString('ja-JP')}点 ＋ `
    + `週の運動ボーナス ${(totals.bonusWeeks * GOHAN_WEEK_BONUS).toLocaleString('ja-JP')}点（${totals.bonusWeeks}週ぶん）`;
}

// 相棒の「のうりょく」。直近30日の記録から6つの力を0〜100で出す。
// 睡眠・運動・食事・体調・メモは「その30日で取れたポイント／満点」、
// 「つづける」は30日のうち何日か記録した割合。毎日きちんと記録すると六角形が大きくなる
const ABILITY_DAYS = 30;
function abilityScores(days, today) {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (ABILITY_DAYS - 1));
  const fromKey = dateKey(from);
  const toKey = dateKey(today);
  const recent = days.filter((d) => d.dateStr >= fromKey && d.dateStr <= toKey);
  const sum = { sleep: 0, exercise: 0, meal: 0, condition: 0, memo: 0 };
  const max = { sleep: 25, exercise: 25, meal: 30, condition: 5, memo: 5 };
  recent.forEach((d) => gohanDayPointBreakdown(d).forEach((r) => { if (r.key in sum) sum[r.key] += r.pts; }));
  const pct = (k) => Math.round((100 * sum[k]) / (max[k] * ABILITY_DAYS));
  const recorded = recent.filter(hasAnyRecord).length;
  // 並び順は六角形の上から時計回り
  return [
    { key: 'sleep', label: 'すいみん', value: pct('sleep') },
    { key: 'exercise', label: 'うんどう', value: pct('exercise') },
    { key: 'meal', label: 'しょくじ', value: pct('meal') },
    { key: 'keep', label: 'つづける', value: Math.round((100 * recorded) / ABILITY_DAYS) },
    { key: 'memo', label: 'メモ', value: pct('memo') },
    { key: 'condition', label: 'たいちょう', value: pct('condition') },
  ];
}

function renderAbility(days, today, level) {
  const svg = document.getElementById('statusAbility');
  if (!svg) return;
  const scores = abilityScores(days, today);
  const cx = 170;
  const cy = 130;
  const R = 88;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (r) => scores.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
  // 六角形の色は帯の色（白帯だけは薄すぎるのでアクセント色、黒帯は金の縁取りの色）
  const belt = gohanBelt(level);
  const color = belt.trim || (belt.name === '白帯' ? 'var(--accent)' : belt.color);
  let out = '';
  [0.25, 0.5, 0.75, 1].forEach((f) => { out += `<polygon class="ability-grid" points="${ring(R * f)}"/>`; });
  scores.forEach((_, i) => { const [x, y] = pt(i, R); out += `<line class="ability-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
  const rOf = (sc) => R * Math.max(0.05, Math.min(1, sc.value / 100));
  const area = scores.map((sc, i) => pt(i, rOf(sc)).map((v) => v.toFixed(1)).join(',')).join(' ');
  out += `<polygon class="ability-area" points="${area}" style="fill:${color};stroke:${color}"/>`;
  scores.forEach((sc, i) => {
    const [x, y] = pt(i, rOf(sc));
    out += `<circle class="ability-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`;
    const [lx, ly] = pt(i, R + 26);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : (lx > cx ? 'start' : 'end');
    out += `<text class="ability-label" x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}">${esc(sc.label)}</text>`;
    out += `<text class="ability-value" x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="${anchor}">${sc.value}</text>`;
  });
  svg.innerHTML = out;
  const best = scores.reduce((a, b) => (b.value > a.value ? b : a));
  const weak = scores.reduce((a, b) => (b.value < a.value ? b : a));
  document.getElementById('statusAbilityNote').textContent = scores.some((x) => x.value > 0)
    ? `直近30日の記録から。いちばん得意は「${best.label}」、のびしろは「${weak.label}」。毎日記録すると六角形が大きくなります。`
    : '直近30日の記録から出します。記録が増えると六角形が育っていきます。';
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
  document.getElementById('statusRules').innerHTML = gohanPointRules().map((r) =>
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
  renderAbility(days, today, level);
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
