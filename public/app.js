// ホーム画面（index.html）専用のスクリプト。
// index.html の中に埋め込んでいたものを、そのまま外に出したもの（読み込む位置と順番は同じ）。
// 共通の部品は history.js / growth.js / scoreChart.js / mascot.js にある。
// --- 時計 ---
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
function updateClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('clockTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  document.getElementById('clockDate').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS_JA[d.getDay()]}）`;
  updateDayProgress(d);
}

// その日の0時からの経過を、ゲージと「○% ・ 残り○時間○分」で表す。
// 日付をまたぐ瞬間に100%→0%へ戻るので、そこだけアニメーションを切る。
const DAY_SECONDS = 24 * 60 * 60;
let lastProgressPercent = null;
function updateDayProgress(d) {
  const fill = document.getElementById('dayProgressFill');
  const label = document.getElementById('dayProgressLabel');
  if (!fill || !label) return;

  const elapsed = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const ratio = elapsed / DAY_SECONDS;
  const percent = Math.floor(ratio * 100);

  // 0時をまたいで巻き戻る時は、右から左へ縮む動きが見えないように一瞬で戻す
  if (lastProgressPercent !== null && percent < lastProgressPercent) {
    fill.style.transition = 'none';
    requestAnimationFrame(() => { fill.style.transition = ''; });
  }
  lastProgressPercent = percent;

  fill.style.width = `${(ratio * 100).toFixed(3)}%`;

  const remain = DAY_SECONDS - elapsed;
  const h = Math.floor(remain / 3600);
  const m = Math.floor((remain % 3600) / 60);
  label.textContent = `今日 ${percent}% ・ 残り ${h}時間${m}分`;
}
updateClock();
setInterval(updateClock, 1000);

// --- ミニカレンダー ---
// 左右に払うと前の月・次の月へ動かせる。0が今月、-1が先月。
// さかのぼれるのは1年前まで（育成の計算と同じ範囲）、先は来月まで。
let calendarMonthOffset = 0;
const CALENDAR_MIN_OFFSET = -12;
const CALENDAR_MAX_OFFSET = 1;

// dirを渡すと、指を払った向きから月が入ってくる動きを付ける
async function loadCalendar(dir) {
  const now = new Date();
  const shown = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
  const year = shown.getFullYear();
  const month = shown.getMonth(); // 0-indexed
  document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;
  refreshCalendarNav();

  let recordedDates = new Set();
  try {
    // 過去の月を見ている時は、その月の記録まで届くように多めに読む
    // （サーバー側がNotionの読み込みをキャッシュしているので読みは増えない）
    const days = 45 + Math.max(0, -calendarMonthOffset) * 35;
    const resp = await fetch(`/api/history?days=${days}`, { headers: notionHeaders() });
    const data = await resp.json();
    if (resp.ok && data.days) {
      recordedDates = new Set(data.days.map((d) => d.dateStr));
    }
  } catch (e) {
    // 履歴取得に失敗してもカレンダー自体は表示する
  }

  const grid = document.getElementById('calendarGrid');
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const cells = WEEKDAYS_JA.map((w) => `<div class="cal-weekday">${w}</div>`);
  for (let i = 0; i < startWeekday; i++) {
    cells.push('<div class="cal-day empty"></div>');
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const hasRecord = recordedDates.has(dateStr);
    cells.push(`<div class="cal-day${isToday ? ' today' : ''}" data-date="${dateStr}">${day}${hasRecord ? '<span class="cal-dot"></span>' : ''}</div>`);
  }
  grid.innerHTML = cells.join('');

  if (dir) {
    const card = document.querySelector('.calendar-card');
    card.classList.remove('from-next', 'from-prev');
    void card.getBoundingClientRect(); // リフローを挟んで動きを確実に再スタートさせる
    card.classList.add(dir > 0 ? 'from-next' : 'from-prev');
    setTimeout(() => card.classList.remove('from-next', 'from-prev'), 300);
  }

  grid.querySelectorAll('.cal-day[data-date]').forEach((el) => {
    el.addEventListener('click', () => {
      window.location.href = `history.html#day-${el.dataset.date}`;
    });
  });
}

function moveCalendarMonth(step) {
  const next = Math.min(CALENDAR_MAX_OFFSET, Math.max(CALENDAR_MIN_OFFSET, calendarMonthOffset + step));
  if (next === calendarMonthOffset) return; // これ以上は動かせない
  calendarMonthOffset = next;
  loadCalendar(step);
}

// 端まで来たら、その向きのボタンを押せなくする
function refreshCalendarNav() {
  const prev = document.getElementById('calPrevBtn');
  const next = document.getElementById('calNextBtn');
  if (prev) prev.disabled = calendarMonthOffset <= CALENDAR_MIN_OFFSET;
  if (next) next.disabled = calendarMonthOffset >= CALENDAR_MAX_OFFSET;
}
document.getElementById('calPrevBtn').addEventListener('click', () => moveCalendarMonth(-1));
document.getElementById('calNextBtn').addEventListener('click', () => moveCalendarMonth(1));

// カレンダーはホーム画面には常には出さず、設定（⚙️）の「カレンダー」から
// モーダルで開く。開くたびに読み直すので、記録を直した後も古いままにならない。
function openCalendarModal() {
  document.getElementById('calendarModal').classList.remove('hidden');
  loadCalendar();
}
function closeCalendarModal() {
  document.getElementById('calendarModal').classList.add('hidden');
}
document.getElementById('closeCalendarBtn').addEventListener('click', closeCalendarModal);
document.getElementById('calendarModal').addEventListener('click', (e) => {
  if (e.target.id === 'calendarModal') closeCalendarModal();
});
window.openCalendarModal = openCalendarModal;

// マスコットの育成は直近1年ぶんで計算する。サーバー側がNotion読み込みを
// キャッシュして全リクエストで共有しているので、日数を増やしても
// Notionへの読みは増えない。同じ1年ぶんの記録を「ポイントの推移」の
// チャート（カレンダーがあった場所）にも使い、取得を1回で済ませる。
async function loadGohanGrowth() {
  try {
    const resp = await fetch('/api/history?days=365', { headers: notionHeaders() });
    const data = await resp.json();
    if (resp.ok && data.days) {
      updateGohanGrowth(data.days);
      const chartEl = document.getElementById('homeScoreChart');
      if (chartEl) renderScoreChart(chartEl, data.days, new Date());
    }
  } catch (e) {
    // 取得に失敗したら育成表示は前のまま
  }
}
loadGohanGrowth();

// --- 週間リング（今週の運動が続いているか） ---
// 週の運動の目標日数と育成の計算は growth.js（ステータス画面と共通）にある

// 今日すでに運動している時に出すねぎらいの言葉。
// 375px級の端末でも1行に収まる長さにしている（長いと2行になって
// 下の「あと○日で目標達成」と合わせて縦に伸びてしまうため）。
const TODAY_DONE_MESSAGES = [
  '今日もおつかれさま！',
  'よく動いた1日！',
  '今日の自分、えらい！',
  'ナイスな1日！',
  '積み重ねてるね！',
  '今日も動けたね！',
  'その調子！',
  '体が喜んでるよ！',
  'いい汗かいたね！',
  '今日も一歩前進！',
];
const TODAY_PERFECT_MESSAGE = '今週は毎日達成！';

// 日付から選ぶので、その日のあいだは同じ言葉が出て、日が変わると変わる
// （画面を開き直すたびに変わると落ち着かないため、ランダムにはしない）。
function todayDoneMessage(doneCount, dateStr) {
  if (doneCount >= DAYS_IN_WEEK) return TODAY_PERFECT_MESSAGE;
  const seed = Number(String(dateStr).replace(/-/g, '')) || 0;
  return TODAY_DONE_MESSAGES[seed % TODAY_DONE_MESSAGES.length];
}

// 曜日ごとの小さな炎。リングの中の炎と同じ輪郭を使う（色はCSS側で決める）。
const DAY_FLAME_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4c8 20 24 28 24 50 0 20-11 36-24 36S26 74 26 54c0-16 10-24 14-38 4 12 6 18 10 24 5-10 2-24 0-36Z"></path></svg>';
// 運動していない日に置く雨つぶ（しずく形）
const DAY_RAIN_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 10 C 34 42, 24 56, 24 68 a 26 26 0 0 0 52 0 C 76 56, 66 42, 50 10 Z"></path></svg>';

// リングの中に出す言葉と、その段階の色。週7日のうち何日運動したかで1日ずつ上がる。
// 色はリング・言葉・曜日ドットで共通に使う（--ring-color）。
const RING_STAGES = [
  { word: "LET'S MOVE",  color: 'var(--muted)' },      // 0/7 グレー
  { word: 'NICE',        color: 'var(--accent)' },     // 1/7 青
  { word: 'GOOD',        color: 'var(--accent-2)' },   // 2/7 水色
  { word: 'GREAT!!',     color: 'var(--ok)' },         // 3/7 緑
  { word: 'EXCELLENT!!', color: 'var(--record-ok)' },  // 4/7 黄色
  { word: 'AMAZING!!',   color: 'var(--warn)' },       // 5/7 オレンジ
  { word: 'AWESOME!!',   color: 'var(--pink)' },       // 6/7 ピンク
  { word: 'PERFECT!!!',  color: 'var(--purple)' },     // 7/7 紫
];
function ringStage(days) {
  return RING_STAGES[Math.min(Math.max(days, 0), RING_STAGES.length - 1)];
}

// 炎の大きさ。週の目標に届くまではリングの中で育ち（0.34〜0.62）、
// 目標を達成した日からはリングを大きく超えて燃え上がる（0.95〜1.35）。
// 4日目と5日目の間に段差を作ることで、達成した瞬間が見て分かるようにしている。
const FLAME_SPARK_SCALE = 0.34;   // 0日（種火）
const FLAME_PRE_MAX_SCALE = 0.62; // 目標の1日前（リングの内側に収まる大きさ）
const FLAME_BURST_SCALE = 0.95;   // 目標達成（リングを超え始める）
const FLAME_MAX_SCALE = 1.35;     // 全部の日で運動した時
function flameScale(days, target, maxDays) {
  const d = Math.min(Math.max(days, 0), maxDays);
  if (d < target) {
    const ratio = target > 1 ? d / (target - 1) : 1;
    return FLAME_SPARK_SCALE + (FLAME_PRE_MAX_SCALE - FLAME_SPARK_SCALE) * ratio;
  }
  const ratio = maxDays > target ? (d - target) / (maxDays - target) : 1;
  return FLAME_BURST_SCALE + (FLAME_MAX_SCALE - FLAME_BURST_SCALE) * ratio;
}

// リングは週7日すべて運動した時だけ1周する。
// 目標（5日）を分母にすると達成した時点で閉じてしまい、そこから先が見えないため。
const DAYS_IN_WEEK = 7;
// 曜日の炎の明滅を、リング・炎・言葉の明滅と同じ拍にそろえる。
// CSSのanimation-delayでは合わせられない（曜日の炎は記録を取ってから
// 作るので、明滅の始まりがページを開いた時ではなくその瞬間になる）ため、
// すでに動いている明滅の開始時刻をそのまま移し替えている。
function syncRingBlink() {
  const word = document.querySelector('.ring-word');
  if (!word || !word.getAnimations) return;
  const ref = word.getAnimations()[0];
  // 「視差効果を減らす」設定の端末では明滅自体が無いので、そろえるものもない
  if (!ref || ref.startTime === null) return;
  document.querySelectorAll('.exercise-ring-days .dot.done').forEach((dot) => {
    dot.getAnimations().forEach((a) => { a.startTime = ref.startTime; });
  });
}

async function loadExerciseRing() {
  try {
    const resp = await fetch('/api/history?days=14', { headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok || !data.days) throw new Error('取得に失敗しました');

    // 週に何日運動したら達成扱いにするか（設定画面で変えられる。既定は5日）
    const weeklyTarget = window.exerciseWeeklyTarget ? exerciseWeeklyTarget() : 5;
    const now = new Date();
    // 週の始まりを月曜日にする（getDay()は日曜=0のため月曜起点に変換）
    const mondayOffset = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

    const exerciseDates = new Set(
      data.days.filter((d) => Array.isArray(d.exercise) && d.exercise.length > 0).map((d) => d.dateStr)
    );
    const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
    let doneCount = 0;
    const dayCells = dayLabels.map((label, i) => {
      const cellDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
      const done = exerciseDates.has(dateStr);
      const isFuture = cellDate > now;
      if (done) doneCount++;
      // 運動していない過去の日（と今日）は炎の代わりに雨つぶ。未来の日は薄い炎のまま
      const isRain = !done && !isFuture;
      const icon = isRain ? DAY_RAIN_SVG : DAY_FLAME_SVG;
      return `<div class="ring-day"><div class="lbl">${label}</div><div class="dot${done ? ' done' : ''}${isFuture ? ' future' : ''}${isRain ? ' rain' : ''}">${icon}</div></div>`;
    }).join('');
    document.getElementById('exerciseRingDays').innerHTML = dayCells;
    syncRingBlink();

    const circumference = 2 * Math.PI * 42;
    const progress = Math.min(doneCount / DAYS_IN_WEEK, 1);
    const ring = document.getElementById('exerciseRingProgress');
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference * (1 - progress)}`;

    const stage = ringStage(doneCount);
    // リング・炎・曜日ドットは「週にどれだけ動けたか」を表すので、その色のまま
    const card = document.querySelector('.exercise-ring-card');
    card.style.setProperty('--ring-color', stage.color);
    card.style.setProperty('--flame-scale', flameScale(doneCount, weeklyTarget, DAYS_IN_WEEK).toFixed(3));

    // 今日すでに運動していれば、目標の案内よりねぎらいを優先して出す
    // （「週5日を目標」は下の行の「あと○日」からも分かるので、その日は譲る）
    const todayStr = dateKey(now);
    const doneToday = exerciseDates.has(todayStr);
    // 今日まだ運動していない日は、リングの中の炎を消して雨を降らせる
    card.classList.toggle('ring-no-fire', !doneToday);

    // 中の言葉だけは「今日の成果」を表す。週の段階が進んでいても、今日まだ
    // 運動していなければ気の早い称賛にならないよう、まだ動いていない時の
    // 言葉（LET'S MOVE）に留める。今日動けていれば、週の段階の言葉を見せる
    const wordStage = doneToday ? stage : RING_STAGES[0];
    document.getElementById('exerciseRingWord').textContent = wordStage.word;
    card.style.setProperty('--word-color', wordStage.color);

    const main = document.getElementById('exerciseRingMain');
    main.textContent = doneToday ? todayDoneMessage(doneCount, todayStr) : `週${weeklyTarget}日を目標`;
    main.classList.toggle('celebrate', doneToday);

    // 見出しが「今日の運動」なので、週の話であることはこの行で言い切る
    document.getElementById('exerciseRingSub').textContent = doneCount >= weeklyTarget
      ? `今週は${doneCount}日達成しました🎉`
      : `今週あと${weeklyTarget - doneCount}日で目標達成`;
  } catch (e) {
    // 取得に失敗した場合は静かに諦める（カードは初期表示のまま）
  }
}
loadExerciseRing();

// --- ごはんくんのタップ芸と育成 -------------------------------------------
// タップすると11パターンの動き（ジャンプ・回転・くるり・ぷるぷる…）から
// ランダムに1つ遊ぶ。連続で同じ動きにならないようにだけしている。
// 11番目はその場でおおきくなる（画面中央には出さない）。
const GOHAN_TAP_PATTERNS = 12;
let lastGohanPlay = 0;
function playGohanTrick(kun) {
  // 再生途中なら、いったんリセットして新しい動きを始める
  [...kun.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => kun.classList.remove(c));
  void kun.getBoundingClientRect(); // リフローを挟んでアニメを確実に再スタートさせる
  let n;
  do { n = 1 + Math.floor(Math.random() * GOHAN_TAP_PATTERNS); } while (n === lastGohanPlay);
  lastGohanPlay = n;
  // 12番目は特別。その場では動かず、怒って画面へ発射する
  if (n === 12 && launchGohanRocket(kun)) { playLaunchSound(); return; }
  playTapSound();
  const cls = `gohan-play-${n}`;
  kun.classList.add(cls);
  kun.addEventListener('animationend', () => kun.classList.remove(cls), { once: true });
}

// --- 効果音 ---------------------------------------------------------------
// キャラクターのタップ・記録の完了・成長・レベルアップで鳴らす。
// 音のファイルは持たず、Web Audioでその場で作る（読み込みが増えず、
// ドット絵に合うピコピコ音になる）。
// 音を出せるのはユーザーの操作がきっかけの時だけというブラウザの決まりがあるが、
// タップ自体が操作なので問題ない。
// ※iPhoneの本体スイッチがマナーモードの時は、Web上の音は鳴らせない
//   （音の種類をアプリ側から指定する手段がWebには無いため）。
// 保存キーはタップ音だけだった頃のまま（変えると設定が初期化されるため）
const SOUND_KEY = 'tapSound';
let audioCtx = null;

function tapSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
}
function setTapSoundEnabled(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* 保存できなくても今の画面には効く */ }
}
window.tapSoundEnabled = tapSoundEnabled;
window.setTapSoundEnabled = setTapSoundEnabled;

function ensureAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  // 一度止まった状態になることがあるので、鳴らす前に起こす
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// 1音鳴らす。freqは音の高さ(Hz)、atは何秒後か、durは長さ
function beep(ctx, freq, at, dur, type = 'square', peak = 0.07) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  // 急に鳴らすとプツッと言うので、立ち上がりと余韻を付ける
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.02);
}

// タップした時の「ぴょこっ」。音の高さを少し散らして、連打しても単調にしない
function playTapSound() {
  if (!tapSoundEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const base = [523.25, 587.33, 659.25, 783.99][Math.floor(Math.random() * 4)];
  beep(ctx, base, 0, 0.09);
  beep(ctx, base * 1.5, 0.07, 0.11);
}

// 発射の時の音。低いところから高いところへ一気に駆け上がる
function playLaunchSound() {
  if (!tapSoundEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  // ためのぷるぷる（短い音を3つ）
  beep(ctx, 220, 0, 0.05, 'square', 0.05);
  beep(ctx, 220, 0.09, 0.05, 'square', 0.05);
  beep(ctx, 260, 0.18, 0.05, 'square', 0.05);
  // 発射
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + 0.32;
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

// 記録できた時の「ピロン♪」。低い方から3つ、明るく駆け上がる
function playRecordSound() {
  if (!tapSoundEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  beep(ctx, 659.25, 0, 0.10, 'triangle', 0.09);    // ミ
  beep(ctx, 783.99, 0.09, 0.10, 'triangle', 0.09); // ソ
  beep(ctx, 1046.50, 0.18, 0.26, 'triangle', 0.10); // 高いド（少し伸ばす）
}

// キャラクターが成長する時の「ぽわん」。やわらかい音で2つ、下から上へ
function playGrowSound() {
  if (!tapSoundEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  beep(ctx, 440.00, 0, 0.16, 'sine', 0.09);
  beep(ctx, 659.25, 0.11, 0.30, 'sine', 0.10);
}

// レベルアップ専用のファンファーレ。他の音（記録・成長）とはっきり違うよう、
// 前触れの3連符 → 駆け上がり → 和音で伸ばす → 上でキラッ、の4段構えにしている。
// 最後の和音（ド・ミ・ソ・高いド）が「やりきった」感じを出す肝
function playLevelUpSound() {
  if (!tapSoundEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  // 前触れ（ソ・ソ・ソ）
  [0, 0.075, 0.15].forEach((t) => beep(ctx, 392.00, t, 0.07, 'square', 0.06));
  // 駆け上がり（ド・ミ・ソ・高いド）
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
    beep(ctx, f, 0.27 + i * 0.1, 0.12, 'square', 0.07);
  });
  // 到達した和音を重ねて伸ばす（音を重ねるので1つずつは控えめに）
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
    beep(ctx, f, 0.67, 0.95, i < 2 ? 'triangle' : 'square', 0.05);
  });
  // 仕上げのきらめき
  [1318.51, 1567.98, 2093.00].forEach((f, i) => {
    beep(ctx, f, 0.82 + i * 0.09, 0.28, 'sine', 0.04);
  });
}

// 怒って身体ごと発射し、画面の端で跳ね返りながら飛び回って、元の位置に戻る。
// 飛ぶのは複製したキャラクターで、その間は元のキャラクターを消しておく
// （「身体が飛び出した」ように見せるため）。
// 出せなかった時はfalseを返し、呼び出し側は普通の芸に切り替える。
function launchGohanRocket(kun) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (document.querySelector('.gohan-fly-overlay')) return false;
  const home = kun.closest('.app-icon, .review-avatar');
  const r = kun.getBoundingClientRect();
  if (!home || !r.width) return false;

  const SIZE = 48;
  const startX = r.left + r.width / 2 - SIZE / 2;
  const startY = r.top + r.height / 2 - SIZE / 2;

  const overlay = document.createElement('div');
  overlay.className = 'gohan-fly-overlay';
  const flyer = document.createElement('div');
  flyer.className = 'gohan-flyer winding';
  flyer.style.left = `${startX}px`;
  flyer.style.top = `${startY}px`;
  const clone = kun.cloneNode(true);
  [...clone.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => clone.classList.remove(c));
  flyer.appendChild(clone);
  const anger = document.createElement('span');
  anger.className = 'gohan-anger';
  anger.textContent = '💢';
  flyer.appendChild(anger);
  overlay.appendChild(flyer);
  document.body.appendChild(overlay);

  // 発射中は元のキャラクターを隠す（2体に見えないように）
  home.style.visibility = 'hidden';
  const restore = () => {
    home.style.visibility = '';
    overlay.remove();
  };

  // 画面の端で跳ね返りながら進む道すじを作る
  const pad = 30;
  const W = window.innerWidth - SIZE - pad;
  const H = window.innerHeight - SIZE - pad;
  // 打ち出す向き。真横に近いと画面を横滑りするだけで飛び回って見えないので、
  // 必ず斜め下（右下か左下）へ飛ばす。キャラクターは画面の上にいるため、
  // 下向きに撃ち出すと画面全体を使って跳ね回る。
  let deg = 35 + Math.random() * 35;           // 右下（35〜70度）
  if (Math.random() < 0.5) deg = 180 - deg;    // 半分は左下へ
  const angle = deg * Math.PI / 180;
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);
  let x = startX;
  let y = startY;
  const points = [{ x, y }];
  for (let i = 0; i < 5; i++) {
    const dist = 240 + Math.random() * 300;
    x += vx * dist;
    y += vy * dist;
    if (x < pad) { x = pad + (pad - x); vx = -vx; }
    if (x > W) { x = W - (x - W); vx = -vx; }
    if (y < pad) { y = pad + (pad - y); vy = -vy; }
    if (y > H) { y = H - (y - H); vy = -vy; }
    points.push({ x: Math.max(pad, Math.min(W, x)), y: Math.max(pad, Math.min(H, y)) });
  }
  points.push({ x: startX, y: startY }); // 最後は元の位置へ帰ってくる

  const frames = points.map((p, i) => ({
    transform: `translate(${(p.x - startX).toFixed(1)}px, ${(p.y - startY).toFixed(1)}px) rotate(${i * 220}deg) scale(${i === points.length - 1 ? 1 : 1.1})`,
  }));

  // ためを見せてから飛び出す
  setTimeout(() => {
    flyer.classList.remove('winding');
    const anim = flyer.animate(frames, { duration: 1500, easing: 'ease-in-out', fill: 'forwards' });
    anim.onfinish = restore;
    // 何かの理由でアニメーションが終わらなくても、必ず片付ける
    setTimeout(restore, 2200);
  }, 320);
  return true;
}

// 記録完了後の成長演出で、画面中央にキャラクターを大きく表示する
// （緑のオーラ・リング・+Npt付き）。
// ヘッダーのSVGをそのまま複製するので、着せ替えやレベルの飾りも引き継がれる
function showGohanBig(deltaPts) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.gohan-big-overlay')) return;
  const src = document.querySelector('.app-icon .gohan-kun');
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.className = 'gohan-big-overlay big-grow';
  const stage = document.createElement('div');
  stage.className = 'gohan-big-stage';
  const clone = src.cloneNode(true);
  [...clone.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => clone.classList.remove(c));
  stage.appendChild(clone);
  const ring = document.createElement('span');
  ring.className = 'big-grow-ring';
  stage.appendChild(ring);
  if (deltaPts > 0) {
    const exp = document.createElement('span');
    exp.className = 'big-grow-exp';
    exp.textContent = `+${deltaPts}pt`;
    stage.appendChild(exp);
  }
  overlay.appendChild(stage);
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1700);
}
function setupGohanTap(container) {
  container.classList.add('gohan-tappable');
  // 触ったら動く。以前はここで育成ステータスの吹き出しも出していたが、
  // 画面を覆って動きが見えないうえ、着せ替えは設定画面から行えるのでやめた。
  // レベル・ポイントはキャラクター設定の画面に出している（mascot.js）。
  //
  // キャラクターのSVGは着せ替え（mascot.jsのmascotRenderAll）で
  // outerHTMLごと差し替わる＝別のノードになるため、ここで掴んでおくと
  // 差し替え後は画面に無いノードを動かすことになり、何も起きなくなる。
  // 押された時にその場で探すこと。
  container.addEventListener('click', () => {
    const kun = container.querySelector('.gohan-kun');
    if (kun) playGohanTrick(kun);
  });
}
document.querySelectorAll('.app-icon, .review-avatar').forEach(setupGohanTap);

// --- ごはんくんの育成 -----------------------------------------------------
// ポイントとレベルの計算そのものは growth.js にある（ステータス画面と共通）。
// ここでは、計算した結果をヘッダーのキャラクターに反映する部分を持つ。
let gohanState = null;
// 記録した直後は、カテゴリ別のリアクションが終わってからお祝いしたいので、
// レベルアップ演出を読み込み時点では出さず、記録側のタイミングに任せる
let deferLevelUpCelebration = false;
// キャラクター設定の画面（mascot.js）から、いまの育成の様子を読めるようにする
window.gohanGrowthState = () => gohanState;

function updateGohanGrowth(days) {
  const { total } = gohanTotalPoints(days);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayDay = days.find((d) => d.dateStr === todayStr);

  // 直近の記録が2日以上前なら眠そうにする（レベルは下げない）
  const latest = days.map((d) => d.dateStr).sort().pop();
  let sleepy = !latest;
  if (latest) {
    const [y, m, d] = latest.split('-').map(Number);
    sleepy = (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) >= 2 * 24 * 60 * 60 * 1000;
  }

  gohanState = {
    total,
    todayPts: todayDay ? gohanDayPoints(todayDay) : 0,
    todayScore: gohanDayScore(todayDay),
    sleepy,
  };

  applyGohanVisualState(); // ここで現在のキャラの難易度からlevel/nextAtが計算される
  renderTodayScore();
  const level = gohanState.level;

  // 前回見たレベルより上がっていたらレベルアップ演出。
  // ポイント自体は保存しない方針のまま、「最後に見たレベル」だけを
  // この端末に覚えておく（演出を出すかどうかの判定にしか使わない）
  let seen = 0;
  try { seen = Number(localStorage.getItem('gohanLevelSeen') || 0); } catch (e) { /* プライベートモード等 */ }
  if (seen > 0 && level > seen && !deferLevelUpCelebration) playGohanLevelUp(seen);
  try { localStorage.setItem('gohanLevelSeen', String(level)); } catch (e) { /* 保存できなくても演出以外に影響なし */ }
}

// 「今日の活動」の見出しの右に、今日のスコア（0〜100点）を出す。
// 記録するたびに育成を計算し直すので、そのついでにここも書き換わる
function renderTodayScore() {
  const el = document.getElementById('reviewScore');
  if (!el || !gohanState || !gohanState.todayScore) return;
  const s = gohanState.todayScore;
  el.style.color = s.color;
  el.innerHTML = `${s.score}<small>/${s.max}</small>${s.word ? ` <b>${s.word}</b>` : ''} <span class="review-live">・進行中</span>`;
  el.hidden = false;
}

// レベルに応じた見た目（飾り・バッジ・眠そう状態）をキャラクターに反映する。
// キャラクターを着せ替えた直後（mascot.jsがSVGを描き替えた後）にも呼ばれる。
function applyGohanVisualState() {
  if (!gohanState) return;
  // レベルは「累計ポイント×キャラの難易度」から毎回計算する
  // （着せ替えで難易度が変わっても、ポイントはそのままにレベルの見え方が変わる）
  const level = gohanLevel(gohanState.total);
  gohanState.level = level;
  gohanState.nextAt = gohanNextAt(level);
  // レベルの節目で飾りが増える（節目はgrowth.jsのGOHAN_DECO_STAGES）: Lv3ほっぺ / Lv8王冠 / Lv14きらきら / Lv20金のオーラ
  const stage = gohanDecoStage(level);
  document.querySelectorAll('.gohan-kun').forEach((k) => {
    for (let i = 1; i <= 4; i++) k.classList.toggle(`gohan-stage-${i}`, i <= stage);
  });
  // ヘッダーの帯（進化の色）も、姿の変化と同じ節目で切り替える
  const belt = gohanBelt(level);
  const header = document.querySelector('.page-header');
  if (header) {
    header.style.setProperty('--belt-color', belt.color);
    header.style.setProperty('--belt-trim', belt.trim || belt.color);
  }
  const walker = document.querySelector('.app-icon');
  if (walker) walker.classList.toggle('gohan-sleepy', gohanState.sleepy);
  // 頭上のバッジに「名前 Lv.○・帯の色」を出す（名前は着せ替え設定に従う）
  const badge = document.getElementById('gohanLv');
  if (badge) {
    badge.textContent = `${window.mascotName ? mascotName() : 'ごはんくん'} Lv.${level}・${belt.name}`;
    badge.hidden = false;
  }
}

// 記録完了後の「成長」演出: 画面中央にキャラクターがでっかく登場し、
// 緑のオーラをまとってぐんっと大きくなる。ヘッダーのキャラ本人も
// ひとまわり大きくなって戻り、緑のリングが広がる。獲得ポイントがあれば
// 「+Npt」が頭の上に浮かぶ。
// レベルが上がった記録は、こちらではなく専用のお祝い（playGohanLevelUp）を出す
function playGohanGrow(deltaPts, leveledUp, prevLevel) {
  if (leveledUp) { playGohanLevelUp(prevLevel, deltaPts); return; }
  const walker = document.querySelector('.app-icon');
  const kun = walker && walker.querySelector('.gohan-kun');
  if (!kun || walker.querySelector('.gohan-grow-fx')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  playGrowSound();
  showGohanBig(deltaPts);
  [...kun.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => kun.classList.remove(c));
  void kun.getBoundingClientRect();
  walker.classList.add('gohan-growing');
  kun.classList.add('gohan-play-grow');
  const fx = document.createElement('span');
  fx.className = 'gohan-grow-fx';
  fx.innerHTML = '<span class="grow-ring"></span>' +
    (deltaPts > 0 ? `<span class="grow-exp">+${deltaPts}pt</span>` : '');
  walker.appendChild(fx);
  setTimeout(() => {
    fx.remove();
    walker.classList.remove('gohan-growing');
    kun.classList.remove('gohan-play-grow');
  }, 1400);
}

// 記録が成功した時、ヘッダーのキャラ本人もカテゴリに合わせて反応する。
// 食事=もぐもぐ / 運動=スクワット3回 / 睡眠=うとうと💤 / 体調=うなずき /
// メモ=ばんざいジャンプ。合わせて小さなハートが舞う。
// クラス名を gohan-play-* にしてあるので、歩き回りは反応中は自動で止まる
const GOHAN_CELEBRATE = {
  meal: 'gohan-play-munch',
  exercise: 'gohan-play-workout',
  sleep: 'gohan-play-doze',
  condition: 'gohan-play-nod',
  memo: 'gohan-play-cheer',
};
function celebrateGohan(cat) {
  const walker = document.querySelector('.app-icon');
  const kun = walker && walker.querySelector('.gohan-kun');
  if (!kun) return;
  [...kun.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => kun.classList.remove(c));
  void kun.getBoundingClientRect();
  const cls = GOHAN_CELEBRATE[cat] || 'gohan-play-cheer';
  kun.classList.add(cls);
  kun.addEventListener('animationend', () => kun.classList.remove(cls), { once: true });
  if (cat === 'sleep') {
    walker.classList.add('gohan-zz');
    setTimeout(() => walker.classList.remove('gohan-zz'), 1700);
  }
  if (!walker.querySelector('.gohan-cheer-fx')) {
    const fx = document.createElement('span');
    fx.className = 'gohan-cheer-fx';
    let html = '';
    for (let i = 0; i < 5; i++) {
      const left = 5 + Math.random() * 75;
      const delay = (Math.random() * 0.5).toFixed(2);
      html += `<span style="left:${left}%;animation-delay:${delay}s">♥</span>`;
    }
    fx.innerHTML = html;
    walker.appendChild(fx);
    setTimeout(() => fx.remove(), 1900);
  }
}

// 記録完了時、ボタンの上に金色のキラキラを撒く。
// テキストを差し替えると一緒に消えるので、後片付けは不要
function spawnSubmitSparkles(btn) {
  const fx = document.createElement('span');
  fx.className = 'submit-sparkles';
  let html = '';
  for (let i = 0; i < 12; i++) {
    const left = 6 + Math.random() * 88;           // ボタンの横方向にばらまく
    const delay = (Math.random() * 0.9).toFixed(2); // 時間差で順にきらめく
    const rise = (18 + Math.random() * 18).toFixed(0);
    html += `<i style="left:${left}%;animation-delay:${delay}s;--rise:-${rise}px"></i>`;
  }
  fx.innerHTML = html;
  btn.appendChild(fx);
}

// レベルアップした時だけの、画面いっぱいのお祝い。
// 金色の光が広がり、衝撃波が3重に走り、キャラクターが大きく跳ねて、
// 「LEVEL UP!」と「Lv.4 → Lv.5」が出て、紙吹雪が舞う。
// 記録のたびに出る「成長」（緑）とはっきり別物に見えるようにしている。
function showLevelUpCelebration(fromLevel = 0, deltaPts = 0) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.lvup-overlay')) return;
  const src = document.querySelector('.app-icon .gohan-kun');
  if (!src) return;

  const overlay = document.createElement('div');
  overlay.className = 'lvup-overlay';
  const flash = document.createElement('div');
  flash.className = 'lvup-flash';
  overlay.appendChild(flash);

  const stage = document.createElement('div');
  stage.className = 'lvup-hero-stage';

  // 衝撃波を3重に。少しずつ遅らせて走らせる
  [0, 0.18, 0.36].forEach((delay) => {
    const wave = document.createElement('span');
    wave.className = 'lvup-wave';
    wave.style.animationDelay = `${delay}s`;
    stage.appendChild(wave);
  });

  // ヘッダーのキャラクターをそのまま複製する（着せ替えや飾りも引き継がれる）
  const clone = src.cloneNode(true);
  [...clone.classList].filter((c) => c.startsWith('gohan-play-')).forEach((c) => clone.classList.remove(c));
  stage.appendChild(clone);

  const text = document.createElement('span');
  text.className = 'lvup-big-text';
  text.textContent = 'LEVEL UP!';
  stage.appendChild(text);

  if (deltaPts > 0) {
    const pt = document.createElement('span');
    pt.className = 'lvup-pt';
    pt.textContent = `+${deltaPts}pt`;
    stage.appendChild(pt);
  }

  // 「Lv.4 → Lv.5」。上がる前のレベルが分からない時は新しいレベルだけ出す
  if (gohanState) {
    const levels = document.createElement('span');
    levels.className = 'lvup-levels';
    levels.innerHTML = (fromLevel > 0 ? `<span class="lvup-from">Lv.${fromLevel}</span><span class="lvup-arrow">▶</span>` : '')
      + `<span class="lvup-to">Lv.${gohanState.level}</span>`;
    stage.appendChild(levels);
  }

  // 紙吹雪。全方位へ飛ばし、色と回り方を散らす
  const COLORS = ['#ffd60a', '#ff9f0a', '#fff3b0', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const dist = 90 + Math.random() * 120;
    const piece = document.createElement('span');
    piece.className = 'lvup-confetti';
    piece.style.cssText = `--dx:${(Math.cos(angle) * dist).toFixed(0)}px;`
      + `--dy:${(Math.sin(angle) * dist).toFixed(0)}px;`
      + `--rot:${Math.round(180 + Math.random() * 540)}deg;`
      + `--c:${COLORS[i % COLORS.length]};`
      + `animation-delay:${(Math.random() * 0.25).toFixed(2)}s`;
    stage.appendChild(piece);
  }

  overlay.appendChild(stage);
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2500);
}

// レベルアップ演出。まずヘッダーで金色のリングときらきらが弾け、
// 続けて画面いっぱいのお祝い（showLevelUpCelebration）へつなぐ。
// fromLevelは上がる前のレベル（「Lv.4 → Lv.5」の左側）
function playGohanLevelUp(fromLevel = 0, deltaPts = 0) {
  playLevelUpSound();
  // ヘッダーがきらめいた直後に、画面いっぱいのお祝いへ
  setTimeout(() => showLevelUpCelebration(fromLevel, deltaPts), 240);
  const walker = document.querySelector('.app-icon');
  if (!walker || walker.querySelector('.gohan-levelup-fx')) return;
  walker.classList.add('gohan-levelup');
  const badge = document.getElementById('gohanLv');
  if (badge) badge.classList.add('pop');
  const fx = document.createElement('div');
  fx.className = 'gohan-levelup-fx';
  // 文字は直後の画面いっぱいのお祝いに任せ、ここはリングときらきらだけ
  let html = '<div class="lvup-ring"></div>';
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10;
    const r = 20 + Math.random() * 14;
    html += `<span class="lvup-spark" style="--dx:${(Math.cos(angle) * r).toFixed(0)}px;--dy:${(Math.sin(angle) * r).toFixed(0)}px"></span>`;
  }
  fx.innerHTML = html;
  walker.appendChild(fx);
  setTimeout(() => {
    fx.remove();
    walker.classList.remove('gohan-levelup');
    if (badge) badge.classList.remove('pop');
  }, 1900);
}

// ヘッダーの中を自由に動き回る。歩く・止まる・宙に浮いてふわふわする・
// 勢いよく飛ぶ、を気まぐれに繰り返し、端まで来たら引き返す。
// 顔が左右対称なので向きの反転は不要。
// 横位置(x)と高さ(y)はJSが .app-icon のtransformで動かし、
// ふわふわ・傾きといった細かい揺れはCSSのアニメーションが担当する。
function startGohanRoam() {
  const header = document.querySelector('.page-header');
  const walker = header && header.querySelector('.app-icon');
  if (!walker || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  header.classList.add('gohan-roam');
  // 着せ替えでSVGは別のノードに差し替わるので、掴んだままにせず毎回探す
  const currentKun = () => walker.querySelector('.gohan-kun');
  const title = header.querySelector('h1');

  let x = null;
  let y = 0;        // 0が地上。マイナスで浮き上がる
  let targetY = 0;
  let dir = 1;
  let phase = 'pause';
  let phaseUntil = performance.now() + 1500;
  let last = null;

  function bounds() {
    const w = header.clientWidth;
    // 右側のボタン群（設定・履歴）にかぶらない範囲で動く
    const btns = header.querySelector('.header-actions') || header.lastElementChild;
    // 頭上のバッジ（中心から左右に40pxほど張り出す）が画面端や
    // 右上のボタンにかぶらないよう、動ける範囲は内側に狭めておく
    const right = btns && btns !== walker ? btns.getBoundingClientRect().left - header.getBoundingClientRect().left - 62 : w - 140;
    return { min: 24, max: Math.max(60, right) };
  }

  // 浮き上がれる高さ。頭上のバッジがヘッダーの外へ出ない範囲にとどめる
  function maxRise() {
    const room = header.clientHeight - walker.offsetHeight - 6 - 20;
    return Math.max(6, Math.min(34, room));
  }

  const sleepy = () => walker.classList.contains('gohan-sleepy');

  function setPhase(next, t) {
    phase = next;
    walker.classList.toggle('gohan-walking', next === 'walk');
    walker.classList.toggle('gohan-floating', next === 'float');
    walker.classList.toggle('gohan-flying', next === 'fly');
    const rise = maxRise();
    if (next === 'float') targetY = -rise * (0.55 + Math.random() * 0.45);
    else if (next === 'fly') targetY = -rise;
    else targetY = 0;
    if (next === 'walk' || next === 'fly') {
      if (Math.random() < 0.5) dir = -dir;
    }
    const durations = {
      pause: 1200 + Math.random() * 2400,
      walk: 1500 + Math.random() * 2500,
      float: 2200 + Math.random() * 2600,
      fly: 1400 + Math.random() * 1600,
    };
    phaseUntil = t + durations[next];
    // 立ち止まった時、たまに芸をする
    if (next === 'pause' && Math.random() < 0.3) {
      const kun = currentKun();
      if (kun) playGohanTrick(kun);
    }
  }

  // 次に何をするかを気まぐれに決める。眠い時は地上でゆっくりするだけ
  function nextPhase() {
    if (sleepy()) return phase === 'walk' ? 'pause' : 'walk';
    const r = Math.random();
    // 浮いた後・飛んだ後は、いったん地上に戻る
    if (phase === 'float' || phase === 'fly') return r < 0.5 ? 'pause' : 'walk';
    if (phase === 'walk') return r < 0.35 ? 'pause' : (r < 0.7 ? 'float' : 'fly');
    return r < 0.5 ? 'walk' : (r < 0.8 ? 'float' : 'fly'); // pauseの次
  }

  function tick(t) {
    if (last === null) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const b = bounds();
    if (x === null) {
      // 最初はタイトルのすぐ右から歩き始める
      x = Math.min(b.max, title ? title.getBoundingClientRect().right - header.getBoundingClientRect().left + 6 : b.min);
    }
    if (t >= phaseUntil) setPhase(nextPhase(), t);

    const kun = currentKun();
    const playing = !!kun && [...kun.classList].some((c) => c.startsWith('gohan-play-'));
    // 芸をしている間は、地上に降りてその場で見せる
    const goingTo = playing ? 0 : targetY;

    if (!playing && phase !== 'pause') {
      const speed = phase === 'fly' ? 62 : phase === 'float' ? 12 : (sleepy() ? 8 : 26);
      x += dir * speed * dt;
      if (x <= b.min) { x = b.min; dir = 1; }
      if (x >= b.max) { x = b.max; dir = -1; }
    }
    // 高さはゆっくり近づける（ふわっと上がって、ふわっと降りる）
    y += (goingTo - y) * Math.min(1, dt * 4);
    walker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
startGohanRoam();

// --- 今日の活動のコメント（小さなキャラクターのAIレビュー） ---
// latest には「たった今増えた記録」の短い説明を渡す。サーバーがAIに伝えて、
// 記録が増えるたびにその記録に触れた少し違うコメントに書き直される
async function loadDailyReview(regenerate = false, latest = '') {
  const textEl = document.getElementById('reviewText');
  const labelEl = document.getElementById('reviewLabel');
  // 口調（超スパルタ〜超やさしい）は設定で選び、生成時にサーバーへ渡す
  // 口調は選択中キャラクターの性格に従う（もちくん=超やさしい、ダンベルくん=超スパルタ等）
  const tone = window.mascotProfile ? mascotProfile().tone : 'normal';
  try {
    if (regenerate) textEl.textContent = 'いまの進捗で書き直し中…';
    const latestParam = regenerate && latest ? `&latest=${encodeURIComponent(latest)}` : '';
    const resp = await fetch(`/api/review?tone=${encodeURIComponent(tone)}${regenerate ? '&regenerate=1' : ''}${latestParam}`, { headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '取得に失敗しました');
    if (data.dateStr) {
      const parts = data.dateStr.split('-');
      labelEl.textContent = `今日の活動（${Number(parts[1])}/${Number(parts[2])} ${data.weekday}）`;
    }
    textEl.className = 'review-text';
    textEl.textContent = data.comment;
  } catch (e) {
    textEl.className = 'review-text err';
    textEl.textContent = 'ふりかえりを読み込めませんでした';
  }
}
loadDailyReview();

// 設定で口調を変えた時に、表示中のふりかえりをその場で作り直す（history.jsから呼ばれる）
function regenerateDailyReview() {
  loadDailyReview(true);
}

// 「たった今増えた記録」の短い説明を作る（ふりかえりの書き直しに添える）
function reviewLatestLabel(cat, payload) {
  const trim = (s, n = 50) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  };
  if (cat === 'meal') return `食事（${payload.mealType}：${trim((payload.items || []).join('、'))}）`;
  if (cat === 'sleep') return `睡眠（${payload.bedtime}就寝→${payload.wake}起床）`;
  if (cat === 'condition') return `体調（${trim([payload.level, payload.stool, payload.note].filter(Boolean).join('・'))}）`;
  if (cat === 'exercise') return `運動（${trim(payload.content)}）`;
  return `メモ（${trim(payload.content)}）`;
}

// --- カテゴリ切り替え（セグメントコントロール） ---
const segItems = document.querySelectorAll('.seg-item');
const segThumb = document.getElementById('segThumb');
const forms = document.querySelectorAll('.form');
let currentCat = 'memo';

// パーセンテージ＋translateXの計算だと、gap分の誤差が右のタブほど積み重なって
// ズレていた（右端の「体調」で特に目立った）ので、実際のレイアウト幅を測って
// left/widthを直接指定する。
function positionSegThumb(activeItem) {
  if (!segThumb || !activeItem) return;
  segThumb.style.left = `${activeItem.offsetLeft}px`;
  segThumb.style.width = `${activeItem.offsetWidth}px`;
}

// stepを渡すと、その向きに合わせて新しいフォームが滑り込んでくる
// （1 … 左スワイプで次のカテゴリ、-1 … 右スワイプで前のカテゴリ）
function setCategory(cat, step = 0) {
  if (cat === currentCat) return;
  currentCat = cat;
  const activeItem = Array.from(segItems).find((t) => t.dataset.cat === cat);
  segItems.forEach((t) => t.classList.toggle('active', t.dataset.cat === cat));
  positionSegThumb(activeItem);
  forms.forEach((f) => {
    f.classList.remove('from-next', 'from-prev');
    f.hidden = f.id !== `form-${cat}`;
  });
  if (step) document.getElementById(`form-${cat}`).classList.add(step > 0 ? 'from-next' : 'from-prev');
  // 表示された内容欄の高さを、いまの行数に合わせて測り直す
  document.querySelectorAll(`#form-${cat} .auto-grow`).forEach(refitTextarea);
  clearTimeout(statusClearTimer);
  statusEl.className = '';
  statusEl.textContent = '';
  submitBtn.classList.remove('success');
  submitBtn.textContent = '記録する';
}

segItems.forEach(t => t.addEventListener('click', () => setCategory(t.dataset.cat)));
positionSegThumb(document.querySelector('.seg-item.active'));
window.addEventListener('resize', () => positionSegThumb(document.querySelector('.seg-item.active')));

// カテゴリのカードが左右にスワイプできることを、説明文なしで最初の数回だけ
// 体で覚えてもらう（タップやスワイプで一度操作したら、以後は出さない）
(function showSwipeHintOnce() {
  const KEY = 'swipeHintShown';
  let shown = 0;
  try { shown = Number(localStorage.getItem(KEY) || 0); } catch (e) { /* プライベートモード等 */ }
  if (shown >= 2) return;
  const panel = document.querySelector('.input-panel');
  if (!panel) return;
  const stop = () => {
    try { localStorage.setItem(KEY, String(shown + 2)); } catch (e) { /* 保存できなくても演出以外に影響なし */ }
  };
  panel.addEventListener('touchstart', stop, { once: true, passive: true });
  segItems.forEach((t) => t.addEventListener('click', stop, { once: true }));
  setTimeout(() => {
    panel.classList.add('swipe-hint');
    panel.addEventListener('animationend', () => panel.classList.remove('swipe-hint'), { once: true });
    try { localStorage.setItem(KEY, String(shown + 1)); } catch (e) { /* 保存できなくても演出以外に影響なし */ }
  }, 700);
})();

// --- 左右スワイプでのカテゴリ切り替え・月送り ---
//
// カテゴリの切り替えはタブ自体と入力フォームのカードの上でだけ受け付ける
// （画面全体で受けると、カレンダーや履歴を触っている時にも切り替わるため）。
// カレンダーのカードの上では、同じ払う動きで月を送る。
// 縦スクロールを邪魔しないよう、指を離した時にだけ判定し、途中で
// preventDefaultはしない。
const CATEGORY_ORDER = Array.from(segItems).map((t) => t.dataset.cat);
const SWIPE_AREA = '#categoryTabs, #entryCard';
const SWIPE_MIN_X = 44;       // これ以上の横移動で切り替え
const SWIPE_MAX_TIME = 1000;  // ゆっくりした指の移動は「スワイプ」とみなさない
const SWIPE_RATIO = 1.2;      // 縦より横に、これだけはっきり動いていること

function moveCategory(step) {
  const next = CATEGORY_ORDER[CATEGORY_ORDER.indexOf(currentCat) + step];
  if (next) setCategory(next, step);
}

// 触った場所が、それ自体を横スクロールできる要素の中かどうか
function insideScrollableRow(element) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 2) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

// カードの大半は入力欄とボタンなので、その上を一律に除外すると
// スワイプできる場所がほとんど無くなってしまう（実際に「効きにくい」原因だった）。
// 横の指の動きが本当に邪魔になるのは「いま編集中の文字入力欄」
// （文字の選択・カーソル移動と衝突する）だけなので、そこだけ除外する。
// ボタンやチップは、スワイプ分（44px以上）動けばブラウザがタップ扱いに
// しないので、スワイプの開始地点として使って問題ない。
function insideTextField(element) {
  const field = element.closest && element.closest('input, textarea');
  return !!field && field === document.activeElement;
}

// 指定した範囲の中で左右に払われた時だけ、handler(step)を呼ぶ。
// stepは左へ払えば1（次へ）、右へ払えば-1（前へ）。
function onHorizontalSwipe(areaSelector, handler) {
  let swipe = null;

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { swipe = null; return; }
    const target = event.target;
    const inArea = target.closest && target.closest(areaSelector);
    if (!inArea || insideTextField(target) || insideScrollableRow(target)) { swipe = null; return; }
    const touch = event.touches[0];
    swipe = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });

  document.addEventListener('touchend', (event) => {
    if (!swipe) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    const elapsed = Date.now() - swipe.time;
    swipe = null;
    if (elapsed > SWIPE_MAX_TIME) return;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    handler(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
}

onHorizontalSwipe(SWIPE_AREA, moveCategory);
// カレンダーの上で払うと、前の月・次の月へ
onHorizontalSwipe('.calendar-card', moveCalendarMonth);

// PCではキーボードの左右でも移動できるようにする（入力中は除く）
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const active = document.activeElement;
  if (active && active.closest && active.closest('input, textarea, select')) return;
  if (event.key === 'ArrowLeft') moveCategory(-1);
  else if (event.key === 'ArrowRight') moveCategory(1);
});

const mealChips = document.querySelectorAll('.meal-types .chip');
const mealTypeInput = document.querySelector('input[name="mealType"]');
function defaultMealType() {
  const h = new Date().getHours();
  if (h < 10) return '朝食';
  if (h < 15) return '昼食';
  if (h < 21) return '夕食';
  return '間食';
}
function setMealType(v) {
  mealTypeInput.value = v;
  mealChips.forEach(c => c.classList.toggle('active', c.dataset.meal === v));
}
mealChips.forEach(c => c.addEventListener('click', () => setMealType(c.dataset.meal)));
setMealType(defaultMealType());

const conditionChips = document.querySelectorAll('.condition-levels .chip');
const conditionLevelInput = document.querySelector('input[name="level"]');
function setConditionLevel(v) {
  conditionLevelInput.value = v;
  conditionChips.forEach(c => c.classList.toggle('active', c.dataset.level === v));
}
conditionChips.forEach(c => c.addEventListener('click', () => {
  const next = conditionLevelInput.value === c.dataset.level ? '' : c.dataset.level; // もう一度タップで解除
  setConditionLevel(next);
}));

const stoolChips = document.querySelectorAll('.stool-options .chip');
const stoolInput = document.querySelector('input[name="stool"]');
function setStool(v) {
  const next = stoolInput.value === v ? '' : v; // もう一度タップで解除
  stoolInput.value = next;
  stoolChips.forEach(c => c.classList.toggle('active', c.dataset.stool === next));
}
stoolChips.forEach(c => c.addEventListener('click', () => setStool(c.dataset.stool)));
setConditionLevel('普通');

function nowHHMM() {
  const d = new Date();
  // 5分刻みの時刻欄に合わせて、現在時刻も一番近い5分単位に丸める
  const rounded = Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5;
  const wrapped = ((rounded % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
document.querySelectorAll('input[type="time"][name="time"]').forEach(i => i.value = nowHHMM());

function calcSleepDuration(bedtime, wake) {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let minutes = (wh * 60 + wm) - (bh * 60 + bm);
  if (minutes <= 0) minutes += 24 * 60;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

const bedtimeInput = document.querySelector('#form-sleep input[name="bedtime"]');
const wakeInput = document.querySelector('#form-sleep input[name="wake"]');
const sleepDurationEl = document.getElementById('sleepDuration');
function updateSleepDuration() {
  if (!bedtimeInput.value || !wakeInput.value) {
    sleepDurationEl.textContent = '';
    return;
  }
  const { hours, minutes } = calcSleepDuration(bedtimeInput.value, wakeInput.value);
  sleepDurationEl.textContent = `睡眠時間: ${hours}時間${minutes}分`;
}
bedtimeInput.addEventListener('input', updateSleepDuration);
wakeInput.addEventListener('input', updateSleepDuration);

// 内容欄は1行分の高さから始まり、改行して行が増えるたびにその行数ぶん背が伸びる。
// 10行ぶんを超えたらそれ以上は伸ばさず、中でスクロールさせる。
// 入力欄の自動リサイズ（autoGrowTextarea）は history.js に置いてある。
// トップ画面と履歴画面の編集シートで同じ動きにするための共通処理で、
// .auto-grow を付けた欄に対して読み込み時に自動で効く。
// ここでは、値をプログラムから入れ替えた時だけ高さを合わせ直す。
function refitTextarea(ta) {
  if (window.autoGrowTextarea) autoGrowTextarea(ta);
}

function buildPayload(cat) {
  const form = document.getElementById(`form-${cat}`);
  const data = new FormData(form);
  if (cat === 'meal') {
    const items = (data.get('items') || '').split('\n').map(s => s.trim()).filter(Boolean);
    return { mealType: data.get('mealType'), items, time: data.get('time') || '' };
  }
  const obj = {};
  for (const [k, v] of data.entries()) obj[k] = v;
  return obj;
}

const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
let statusClearTimer = null;

// --- オフライン再送キュー ---------------------------------------------------
// 送信に失敗した記録（通信エラー・サーバーの5xx）は端末のlocalStorageに貯め、
// 接続が戻り次第自動で送り直す。入力し直しをなくすための仕組み。
// 4xx（内容の不備）は再送しても直らないので貯めない。
// 記録した日付（dateStr）も一緒に持ち、日をまたいで送られても
// 正しい日のブロックに入るようにしている（サーバー側が対応済み）。
const ENTRY_QUEUE_KEY = 'entryQueue';
const ENTRY_QUEUE_MAX = 50;

function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function loadEntryQueue() {
  try { return JSON.parse(localStorage.getItem(ENTRY_QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function saveEntryQueue(queue) {
  try { localStorage.setItem(ENTRY_QUEUE_KEY, JSON.stringify(queue.slice(0, ENTRY_QUEUE_MAX))); } catch (e) { /* 保存できない環境では諦める */ }
}
function updateQueueNotice() {
  const el = document.getElementById('queueNotice');
  if (!el) return;
  const queue = loadEntryQueue();
  const n = queue.length;
  el.hidden = n === 0;
  if (n === 0) return;
  // 何度送っても失敗する記録（サーバー側の問題等）は、他の記録を巻き込んで
  // 詰まらせないよう自動再送を止めている。その状態を利用者に伝え、
  // 「今すぐ送信」で改めて試すか、諦めて削除するかを選べるようにする
  const stuckCount = queue.filter((item) => item.stuck).length;
  const text = stuckCount > 0
    ? `送信できない記録が${stuckCount}件あります。もう一度試すか、諦めて削除できます。`
    : `未送信の記録が${n}件あります。接続が戻り次第、自動で記録します。`;
  el.innerHTML =
    `<span class="queue-notice-text">${text}</span>` +
    `<span class="queue-notice-actions">` +
    `<button type="button" class="queue-notice-retry" id="queueRetryBtn">今すぐ送信</button>` +
    (stuckCount > 0 ? `<button type="button" class="queue-notice-discard" id="queueDiscardBtn">削除</button>` : '') +
    `</span>`;
  document.getElementById('queueRetryBtn').addEventListener('click', (e) => {
    e.target.disabled = true;
    e.target.textContent = '送信中…';
    flushEntryQueue({ force: true });
  });
  const discardBtn = document.getElementById('queueDiscardBtn');
  if (discardBtn) {
    discardBtn.addEventListener('click', () => {
      if (!window.confirm(`送信できない記録${stuckCount}件を削除します。内容は失われます。よろしいですか？`)) return;
      saveEntryQueue(loadEntryQueue().filter((item) => !item.stuck));
      updateQueueNotice();
    });
  }
}
function queueEntry(category, payload) {
  const queue = loadEntryQueue();
  queue.push({ category, payload, dateStr: todayLocalStr(), queuedAt: Date.now() });
  saveEntryQueue(queue);
  updateQueueNotice();
}

// この回数だけ5xxが続いた記録は「詰まった」ものとして扱い、以後は自動で再送しない
// （毎回失敗する記録が先頭に居座ると、後ろの記録まで一緒に送れなくなっていたため）
const ENTRY_QUEUE_MAX_ATTEMPTS = 5;

let entryQueueFlushing = false;
// opts.force: true の間は、詰まった記録も含めて全件もう一度試す（「今すぐ送信」用）
async function flushEntryQueue(opts = {}) {
  if (entryQueueFlushing) return;
  const queue = loadEntryQueue();
  if (!queue.length) return;
  entryQueueFlushing = true;
  let sent = 0;
  let offline = false; // 一度検知したら、それ以降はどの記録も試すだけ無駄
  try {
    const remaining = [];
    for (const item of queue) {
      if (offline || (item.stuck && !opts.force)) { remaining.push(item); continue; }
      let resp;
      try {
        resp = await fetch('/api/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...notionHeaders() },
          body: JSON.stringify({ category: item.category, payload: item.payload, dateStr: item.dateStr }),
        });
      } catch (e) {
        offline = true; // まだオフライン。この記録も、後ろの記録も次の機会に
        remaining.push(item);
        continue;
      }
      if (resp.ok || resp.status === 207) {
        sent++;
        continue; // 送れたのでキューから外す（remainingに積まない）
      }
      if (resp.status >= 400 && resp.status < 500) {
        continue; // 再送しても直らない記録（3日以上前になった等）。捨てる
      }
      // 5xx: サーバー側の問題。何度も同じ記録で失敗するなら、他の記録を
      // 巻き込まないよう自動再送を止め、利用者の判断（今すぐ送信・削除）を待つ
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts >= ENTRY_QUEUE_MAX_ATTEMPTS) item.stuck = true;
      remaining.push(item);
    }
    saveEntryQueue(remaining);
  } finally {
    entryQueueFlushing = false;
  }
  updateQueueNotice();
  if (sent > 0) {
    statusEl.className = '';
    statusEl.textContent = `たまっていた${sent}件の記録を送信しました`;
    setTimeout(() => { if (statusEl.textContent.includes('たまっていた')) statusEl.textContent = ''; }, 4000);
    loadHistory();
    loadCalendar();
    loadExerciseRing();
    loadGohanGrowth();
  }
}
// 開いた時・回線が戻った時・アプリに戻ってきた時・その後は15秒おきに再送を試みる。
// 「online」イベントはスマホ回線では当てにならず（弱電波→復活を検知できないことが
// 多い）、これだけに頼ると通知が実際より長く出続けて「固まっている」ように見える。
// アプリへの復帰（タブ切り替え・他アプリから戻る）は確実に検知できるので、
// そのたびにも試すことで、体感の待ち時間を大きく減らす。
// 未送信が無い間は毎回すぐ抜けるだけ（通信は発生しない）ので、頻度を上げても軽い。
updateQueueNotice();
flushEntryQueue();
window.addEventListener('online', flushEntryQueue);
window.addEventListener('focus', flushEntryQueue);
document.addEventListener('visibilitychange', () => { if (!document.hidden) flushEntryQueue(); });
setInterval(flushEntryQueue, 15 * 1000);

// 記録成功・キュー保存の後に入力欄を空にする（共通処理）
function clearFormAfterRecord(form) {
  if (currentCat === 'meal') {
    form.querySelector('textarea[name="items"]').value = '';
  } else if (currentCat === 'exercise' || currentCat === 'memo') {
    const contentField = form.querySelector('[name="content"]');
    contentField.value = '';
    refitTextarea(contentField); // 1行分の高さに戻す
  } else if (currentCat === 'condition') {
    form.querySelector('input[name="note"]').value = '';
  }
}

submitBtn.addEventListener('click', async () => {
  const form = document.getElementById(`form-${currentCat}`);
  if (!form.reportValidity()) return;

  // 「調子」は必須ではない（排便だけ・内容だけの記録も許可する）が、
  // 何も入力せずに送信されるとサーバー側のエラーが生の英語のまま表示されてしまうため、
  // 「調子・排便・内容」のいずれか1つも無い場合だけここで弾く。
  if (currentCat === 'condition') {
    const note = document.getElementById('conditionNote').value.trim();
    if (!conditionLevelInput.value && !stoolInput.value && !note) {
      statusEl.className = 'err';
      statusEl.textContent = '調子・排便・内容のいずれかを入力してください';
      return;
    }
  }

  const payload = buildPayload(currentCat);
  submitBtn.disabled = true;
  clearTimeout(statusClearTimer);
  submitBtn.classList.remove('success');
  submitBtn.textContent = '記録する';
  statusEl.className = '';
  statusEl.textContent = '記録中…';

  try {
    const resp = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...notionHeaders() },
      body: JSON.stringify({ category: currentCat, payload }),
    });
    const data = await resp.json();
    if (resp.ok) {
      statusEl.className = '';
      // 食事はカロリーを推定して一緒に記録しているので、その概算を知らせる
      // （推定できなかった時は今まで通り何も出さない）
      const r = data.result || {};
      statusEl.textContent =
        (currentCat === 'meal' && r.totalKcal) ? `おおよそ ${r.totalKcal.toLocaleString('ja-JP')}kcal として記録しました`
        : (currentCat === 'exercise' && r.burnedKcal) ? `おおよそ ${r.burnedKcal.toLocaleString('ja-JP')}kcal 消費として記録しました`
        : '';
      submitBtn.classList.add('success');
      // マスコット（ヘッダーのSVGを使い回す）と一緒にお祝いし、キラキラを撒く
      const gohan = document.querySelector('.app-icon .gohan-kun');
      submitBtn.innerHTML = (gohan ? gohan.outerHTML : '') + '<span class="submit-msg">記録が完了しました</span>';
      spawnSubmitSparkles(submitBtn);
      playRecordSound();
      celebrateGohan(currentCat);
      statusClearTimer = setTimeout(() => {
        // 中身をふわっと消してから、色の遷移とともに元のボタンに戻る
        submitBtn.classList.add('leaving');
        statusClearTimer = setTimeout(() => {
          submitBtn.classList.remove('success', 'leaving');
          submitBtn.classList.add('returned');
          submitBtn.textContent = '記録する';
          statusEl.textContent = '';
          setTimeout(() => submitBtn.classList.remove('returned'), 400);
        }, 260);
      }, 3000);
      clearFormAfterRecord(form);
      // 記録直後は「これまでの記録」「カレンダー」「今週の運動」がまだ
      // ページ読み込み時点のデータのままなので、最新の状態に更新する
      loadHistory();
      loadCalendar();
      loadExerciseRing();
      // 育成を再計算し、カテゴリ別リアクションが終わった頃に「成長」演出を出す。
      // レベルが上がった記録では、ヘッダーのレベルアップ演出に続けて
      // 中央の演出を金色で出す（記録するたびに必ず中央の演出が見られる）
      const prevTotal = gohanState ? gohanState.total : null;
      const prevLevel = gohanState ? gohanState.level : null;
      deferLevelUpCelebration = true;
      loadGohanGrowth().finally(() => { deferLevelUpCelebration = false; }).then(() => {
        if (!gohanState || prevTotal === null) return;
        const leveledUp = prevLevel !== null && gohanState.level > prevLevel;
        const delta = gohanState.total - prevTotal;
        setTimeout(() => playGohanGrow(delta, leveledUp, prevLevel), 1100);
      });
      // ふりかえりは「今日ここまでの進捗」へのコメントなので、記録のたびに
      // 「何を記録したか」を添えて書き直す（毎回少しずつ違うコメントになる）
      loadDailyReview(true, reviewLatestLabel(currentCat, payload));
    } else if (resp.status === 207) {
      statusEl.className = 'err';
      statusEl.textContent = '⚠️ ' + (data.warning || '一部失敗しました');
    } else if (resp.status >= 500) {
      // サーバー側の一時的な失敗（スリープ明け・Notion障害など）は端末に貯めて自動再送する
      queueEntry(currentCat, payload);
      clearFormAfterRecord(form);
      statusEl.className = '';
      statusEl.textContent = '今は送信できなかったので端末に保存しました。接続が戻り次第、自動で記録します';
    } else {
      statusEl.className = 'err';
      statusEl.textContent = '❌ ' + (data.error || '記録に失敗しました');
    }
  } catch (e) {
    // 通信エラー（オフライン・タイムアウト）。入力を失わないよう端末に貯める
    queueEntry(currentCat, payload);
    clearFormAfterRecord(form);
    statusEl.className = '';
    statusEl.textContent = '今は送信できなかったので端末に保存しました。接続が戻り次第、自動で記録します';
  } finally {
    submitBtn.disabled = false;
  }
});

// --- 音声入力 ---
let activeRecorder = null;

// マイクの許可は最初の1回だけにする。
// 録音のたびに getUserMedia を呼び、終わったらトラックを止めていたため、
// iPhoneでは録音するたびに「マイクへのアクセスを求めています」が出ていた。
// 一度もらったストリームは持ったまま使い回し、録音していない間は
// トラックを無効（enabled=false）にして音を拾わないようにしておく。
// アプリを離れた時は手放して、マイク使用中の表示が残らないようにする。
let micStream = null;

async function getMicStream() {
  const live = micStream && micStream.getTracks().some((t) => t.readyState === 'live');
  if (!live) {
    // 端末を抜き差しされた等でストリームが死んでいたら取り直す（ここで許可を聞かれる）
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  micStream.getTracks().forEach((t) => { t.enabled = true; });
  return micStream;
}

// 録音が終わった時。許可は保ったまま、音だけ拾わないようにする
function pauseMic() {
  if (micStream) micStream.getTracks().forEach((t) => { t.enabled = false; });
}

// アプリを離れた時。マイクを完全に手放す（次に使う時は許可を聞かれる）
function releaseMic() {
  if (!micStream) return;
  micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseMic(); });
window.addEventListener('pagehide', releaseMic);

function pickMimeType() {
  const candidates = ['audio/mp4', 'audio/webm', 'audio/wav'];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function startRecording(button, targetEl) {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('このブラウザは音声入力に対応していません');
    return;
  }
  let stream;
  try {
    stream = await getMicStream();
  } catch (e) {
    alert('マイクを使用できませんでした: ' + e.message);
    return;
  }

  const mimeType = pickMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = async () => {
    pauseMic();
    activeRecorder = null;
    button.classList.remove('recording');
    button.disabled = true;
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm', ...notionHeaders() },
        body: blob,
      });
      const data = await resp.json();
      if (resp.ok && data.text) {
        const t = data.text.trim();
        const sep = targetEl.tagName === 'TEXTAREA' ? '\n' : ' ';
        targetEl.value = targetEl.value ? `${targetEl.value}${sep}${t}` : t;
        targetEl.dispatchEvent(new Event('input'));
      } else {
        // 無料枠を使い切った時（429）は、失敗ではなく案内としてそのまま見せる
        alert(resp.status === 429 ? data.error : '文字起こしに失敗しました: ' + (data.error || '不明なエラー'));
      }
    } catch (e) {
      alert('通信エラー: ' + e.message);
    } finally {
      button.disabled = false;
    }
  };
  recorder.start();
  activeRecorder = recorder;
  button.classList.add('recording');
}

document.querySelectorAll('.voice-btn').forEach((btn) => {
  const targetEl = document.getElementById(btn.dataset.target);
  btn.addEventListener('click', () => {
    if (activeRecorder && activeRecorder.state === 'recording') {
      activeRecorder.stop();
      return;
    }
    startRecording(btn, targetEl);
  });
});

// --- スマート音声入力（話すだけでカテゴリ・項目を自動で選んで入力する） ---
const smartVoiceBtn = document.getElementById('smartVoiceBtn');
const smartVoiceStatus = document.getElementById('smartVoiceStatus');
const smartVoiceStatusRow = document.getElementById('smartVoiceStatusRow');
const smartVoiceDismissBtn = document.getElementById('smartVoiceDismissBtn');
// ふだんは何も出さず（アイコンボタンの下に空の行が残らないよう行ごと隠す）、
// 録音中・結果・エラーの時だけ出す
const SMART_VOICE_DEFAULT_TEXT = '';
let smartRecorder = null;

// エラー/完了（ok・err）は自動では消えないので✕ボタンで手動で消せるようにする。
// 録音中・解析中などの一時的な状態では✕は出さない。
function setSmartVoiceStatus(text, kind) {
  smartVoiceStatus.className = kind ? `smart-voice-status ${kind}` : 'smart-voice-status';
  smartVoiceStatus.textContent = text;
  smartVoiceStatusRow.classList.toggle('show-dismiss', kind === 'ok' || kind === 'err');
  smartVoiceStatusRow.hidden = !text;
}
smartVoiceDismissBtn.addEventListener('click', () => {
  setSmartVoiceStatus(SMART_VOICE_DEFAULT_TEXT, '');
});

// 解析結果をフォームに反映する。話されていない項目はそのまま（デフォルト値）にする。
function applyParsedEntry(parsed) {
  const cat = parsed.category;
  if (!cat || !document.getElementById(`form-${cat}`)) return;
  setCategory(cat);

  if (cat === 'memo' || cat === 'exercise') {
    if (parsed.time) document.getElementById(`${cat}Time`).value = parsed.time;
    if (parsed.content) {
      const contentEl = document.getElementById(`${cat}Content`);
      contentEl.value = parsed.content;
      refitTextarea(contentEl); // 行数に合わせて背を伸ばす
    }
  } else if (cat === 'meal') {
    if (parsed.time) document.getElementById('mealTime').value = parsed.time;
    if (parsed.mealType) setMealType(parsed.mealType);
    if (parsed.items && parsed.items.length) {
      document.getElementById('mealItems').value = parsed.items.join('\n');
    }
  } else if (cat === 'sleep') {
    if (parsed.bedtime) bedtimeInput.value = parsed.bedtime;
    if (parsed.wake) wakeInput.value = parsed.wake;
    updateSleepDuration();
  } else if (cat === 'condition') {
    if (parsed.time) document.getElementById('conditionTime').value = parsed.time;
    if (parsed.level) setConditionLevel(parsed.level);
    if (parsed.stool) setStool(parsed.stool);
    if (parsed.note) document.getElementById('conditionNote').value = parsed.note;
  }
}

async function startSmartRecording() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('このブラウザは音声入力に対応していません');
    return;
  }
  let stream;
  try {
    stream = await getMicStream();
  } catch (e) {
    alert('マイクを使用できませんでした: ' + e.message);
    return;
  }

  const mimeType = pickMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = async () => {
    pauseMic();
    smartRecorder = null;
    smartVoiceBtn.classList.remove('recording');
    smartVoiceBtn.disabled = true;
    setSmartVoiceStatus('文字起こし中…', '');
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      const transcribeResp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm', ...notionHeaders() },
        body: blob,
      });
      const transcribeData = await transcribeResp.json();
      if (!transcribeResp.ok || !transcribeData.text) {
        throw new Error(transcribeData.error || '文字起こしに失敗しました');
      }

      setSmartVoiceStatus(`「${transcribeData.text}」を解析中…`, '');
      const parseResp = await fetch('/api/parse-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...notionHeaders() },
        body: JSON.stringify({ text: transcribeData.text }),
      });
      const parsed = await parseResp.json();
      if (!parseResp.ok) throw new Error(parsed.error || '内容の解析に失敗しました');

      applyParsedEntry(parsed);
      setSmartVoiceStatus(`✅「${transcribeData.text}」→ 内容を反映しました。確認して「記録する」を押してください`, 'ok');
    } catch (e) {
      setSmartVoiceStatus(e.message, 'err');
    } finally {
      smartVoiceBtn.disabled = false;
    }
  };
  recorder.start();
  smartRecorder = recorder;
  smartVoiceBtn.classList.add('recording');
  setSmartVoiceStatus('録音中…もう一度タップで終了', '');
}

smartVoiceBtn.addEventListener('click', () => {
  if (smartRecorder && smartRecorder.state === 'recording') {
    smartRecorder.stop();
    return;
  }
  startSmartRecording();
});

// --- ホーム画面の表示設定 ---
// どの項目を表示するかをこの端末のlocalStorage（homeSections）に保存する。
// 保存形式は { quote: false } のように「OFFの項目だけfalse」。未記載はON扱いなので
// 新しい項目が増えても既定で表示される。記録フォームは常に表示する。
const HOME_SECTIONS = [
  { key: 'clock', label: '時計と天気' },
  { key: 'quote', label: '今日の格言' },
  { key: 'review', label: '今日の活動' },
  { key: 'chart', label: 'ポイントの推移' },
  { key: 'exercise', label: '今日の運動' },
  { key: 'voice', label: '音声で記録' },
  { key: 'records', label: 'これまでの記録' },
];

function homeSectionsSetting() {
  try { return JSON.parse(localStorage.getItem('homeSections') || '{}') || {}; } catch (e) { return {}; }
}

function setHomeSection(key, on) {
  const s = homeSectionsSetting();
  if (on) delete s[key]; else s[key] = false;
  try { localStorage.setItem('homeSections', JSON.stringify(s)); } catch (e) { /* 保存できなくても今の画面には効く */ }
  document.documentElement.classList.toggle('hs-off-' + key, !on);
}

window.openHomeSectionsSettings = function () {
  let overlay = document.getElementById('homeSectionsModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'homeSectionsModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>ホーム画面の表示</h3>
        <p class="hs-note">OFFにした項目はホーム画面に表示されなくなります。記録フォームはいつでも表示されます。</p>
        <div class="hs-list">` +
      HOME_SECTIONS.map((s) => `
          <label class="hs-row" data-key="${s.key}">
            <span class="hs-label">${s.label}</span>
            <span class="hs-switch"><input type="checkbox" /><span class="hs-knob"></span></span>
          </label>`).join('') + `
        </div>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" id="homeSectionsClose">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('homeSectionsClose').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.querySelectorAll('.hs-row input').forEach((input) => {
      input.addEventListener('change', () => {
        setHomeSection(input.closest('.hs-row').dataset.key, input.checked);
      });
    });
  }
  const cur = homeSectionsSetting();
  overlay.querySelectorAll('.hs-row').forEach((row) => {
    row.querySelector('input').checked = cur[row.dataset.key] !== false;
  });
  overlay.classList.remove('hidden');
};
