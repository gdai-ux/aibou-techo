// 履歴表示（睡眠グラフ・体調グラフ・日別リスト・編集モーダル）の共通ロジック。
// index.html（ホーム埋め込み）と history.html（単独ページ）の両方から読み込む。
// 呼び出し元のHTMLに、以下のIDを持つ要素が存在している必要がある:
//   #sleepChart, #levelChart, #dayList, #editModal（と内部のフォーム要素一式）

// iOS Safariの<input type="time">は、stepを指定してもホイールピッカー自体は
// 1分刻みのまま（実機で確認済みの制限で、Web側からは変更できない）。また、
// 「時」「分」の<select>に置き換えても、iOSのselectのメニューはselect要素の
// 位置に張り付いて開き、開く位置をWeb側から制御する手段が無い（selectを
// position:fixedで画面中央に固定しても、メニューはiOS側の都合で画面上部に
// 寄ってしまう。実機で確認済み）。
//
// そこで、見た目と操作感を標準メニューに寄せた自前のリストを、確実に
// 画面の中央に出す。タップした値をすぐ確定して閉じる挙動・チェックマーク・
// すりガラス風の背景も標準メニューと同じにしている。
//
// 置き換え後も既存コード（buildPayload、now-btn、音声入力の反映、編集モーダルなど）が
// そのまま動くよう、入力欄の.value自体は消さずに視覚的にだけ隠して残し、
// Object.definePropertyで.valueのgetter/setterを差し替える。これにより、
// どこかで `input.value = 'HH:MM'` と代入するだけで、見えている数字も自動的に
// 追従する（呼び出し側を一つずつ書き換える必要がない）。
// allow24を指定すると「24:00〜24:55」を0時に丸めず24時のまま扱う。
// 日本では就寝時刻を「24時に寝た」と表す習慣があり、0時と書くと
// その日の始まりなのか終わりなのか紛らわしいため、就寝欄だけ24時を使えるようにしている。
const TIME_STEP_MINUTES = 5;

function roundToStepMinutes(value, stepMinutes, allow24) {
  if (!value) return value;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const rounded = Math.round((h * 60 + m) / stepMinutes) * stepMinutes;
  const limit = allow24 ? 25 * 60 : 24 * 60;
  const wrapped = ((rounded % limit) + limit) % limit;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// --- 時刻メニュー（画面中央に出す、標準メニュー風のリスト） ----------------
// 実体は画面に1つだけ作って使い回す（開くたびに中身を差し替える）。
let timeMenuEl = null;
let timeMenuOpener = null;

function buildTimeMenu() {
  if (timeMenuEl) return timeMenuEl;
  const overlay = document.createElement('div');
  overlay.className = 'timemenu-overlay hidden';
  overlay.id = 'timeMenuOverlay';
  const panel = document.createElement('div');
  panel.className = 'timemenu-panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', '時刻を選ぶ');
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  // 背景（リストの外側）をタップしたら、何も選ばずに閉じる（標準メニューと同じ）
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTimeMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeTimeMenu();
  });
  timeMenuEl = overlay;
  return overlay;
}

function openTimeMenu(values, selected, onPick) {
  const overlay = buildTimeMenu();
  const panel = overlay.querySelector('.timemenu-panel');
  panel.textContent = '';
  let selectedRow = null;
  values.forEach((v) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'timemenu-item' + (v === selected ? ' selected' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', v === selected ? 'true' : 'false');
    const check = document.createElement('span');
    check.className = 'timemenu-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    const label = document.createElement('span');
    label.textContent = v;
    row.append(check, label);
    // 標準メニューと同じく、タップした値をすぐ確定して閉じる
    row.addEventListener('click', () => { closeTimeMenu(); onPick(v); });
    panel.appendChild(row);
    if (v === selected) selectedRow = row;
  });
  timeMenuOpener = document.activeElement;
  overlay.classList.remove('hidden', 'closing');
  // 開いている間は後ろの画面が動かないようにする
  document.body.classList.add('timemenu-open');
  // いま選ばれている値がリストの中央に来るようにスクロールしておく
  if (selectedRow) {
    panel.scrollTop = selectedRow.offsetTop - (panel.clientHeight - selectedRow.offsetHeight) / 2;
    selectedRow.focus({ preventScroll: true });
  }
}

function closeTimeMenu() {
  if (!timeMenuEl || timeMenuEl.classList.contains('hidden') || timeMenuEl.classList.contains('closing')) return;
  // すっと消えるアニメーションを見せてから隠す
  const el = timeMenuEl;
  el.classList.add('closing');
  setTimeout(() => {
    el.classList.remove('closing');
    el.classList.add('hidden');
  }, 190);
  document.body.classList.remove('timemenu-open');
  if (timeMenuOpener && typeof timeMenuOpener.focus === 'function') timeMenuOpener.focus({ preventScroll: true });
  timeMenuOpener = null;
}

function enhanceTimeInputAsCenteredMenu(input) {
  if (input.dataset.enhanced) return;
  input.dataset.enhanced = '1';

  const nativeValueProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  // 就寝欄（data-allow-24）だけ24時を選べるようにする
  const allow24 = input.hasAttribute('data-allow-24');

  const hours = [];
  for (let h = 0; h <= (allow24 ? 24 : 23); h++) hours.push(String(h).padStart(2, '0'));
  const minutes = [];
  for (let m = 0; m < 60; m += TIME_STEP_MINUTES) minutes.push(String(m).padStart(2, '0'));

  const wrap = document.createElement('div');
  wrap.className = 'time-select-wrap';

  const hourTap = document.createElement('button');
  hourTap.type = 'button';
  hourTap.className = 'time-tap time-tap-hour';
  hourTap.setAttribute('aria-label', '時');
  const hourDisplay = document.createElement('span');
  hourDisplay.className = 'time-select-display';
  hourTap.appendChild(hourDisplay);

  const colon = document.createElement('span');
  colon.className = 'time-select-colon';
  colon.textContent = ':';

  const minTap = document.createElement('button');
  minTap.type = 'button';
  minTap.className = 'time-tap time-tap-minute';
  minTap.setAttribute('aria-label', '分');
  const minDisplay = document.createElement('span');
  minDisplay.className = 'time-select-display';
  minTap.appendChild(minDisplay);

  wrap.append(hourTap, colon, minTap);
  input.insertAdjacentElement('afterend', wrap);
  // display:noneにすると「必須」項目のチェックがスキップされてしまうため、
  // 見た目だけを消すクラスを使う（history.css参照）
  input.classList.add('time-input-hidden');

  function currentValue() {
    return roundToStepMinutes(nativeValueProp.get.call(input), TIME_STEP_MINUTES, allow24) || '00:00';
  }

  function updateDisplay() {
    const [h, m] = currentValue().split(':');
    hourDisplay.textContent = h;
    minDisplay.textContent = m;
  }

  function applyValue(v) {
    nativeValueProp.set.call(input, v);
    updateDisplay();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  hourTap.addEventListener('click', () => {
    const [h, m] = currentValue().split(':');
    openTimeMenu(hours, h, (v) => applyValue(`${v}:${m}`));
  });
  minTap.addEventListener('click', () => {
    const [h, m] = currentValue().split(':');
    openTimeMenu(minutes, m, (v) => applyValue(`${h}:${v}`));
  });

  Object.defineProperty(input, 'value', {
    get() { return nativeValueProp.get.call(input); },
    set(v) {
      nativeValueProp.set.call(input, v);
      updateDisplay();
    },
    configurable: true,
  });

  updateDisplay();
  // 値が空のままだと、画面には既定値（00:00）が表示されているのにinput側は空、
  // という食い違いが起きる。この状態で既定値と同じ時刻を選んでも値が空のまま
  // 送信されて必須チェックに引っかかっていた（実機で発生した不具合）。
  // 表示と値が必ず一致するよう、空の場合は表示中の既定値を書き戻しておく。
  // 初期化時なのでinput/changeイベントは飛ばさない（睡眠時間の自動計算などが
  // 未入力の段階で走ってしまわないようにするため）。
  if (!nativeValueProp.get.call(input)) nativeValueProp.set.call(input, currentValue());
}
// 就寝欄は24:00を保持する必要があり、ネイティブのtime入力は24:00を受け付けない
// （実際にブラウザで確認済み。値が空になる）ため type="text" にしてある。
// そちらもピッカー化の対象に含める。
document.querySelectorAll('input[type="time"][step], input[data-allow-24]').forEach(enhanceTimeInputAsCenteredMenu);

// --- ボトムシートの下スワイプで閉じる -------------------------------------
// すべてのモーダル（.modal-panel）共通。iOSのシートと同じく、
// パネルが最上部までスクロールされている状態で下に引っぱると
// シートが指に付いてきて、大きく引っぱって離すと閉じる。
// 途中で離すと元の位置に戻る。中身のスクロールや入力は邪魔しない。
const SHEET_CLOSE_DISTANCE = 110; // これ以上引っぱって離すと閉じる
let sheetDrag = null;

document.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1) { sheetDrag = null; return; }
  const panel = event.target.closest('.modal-panel');
  if (!panel) return;
  // 文字入力中のドラッグ（選択・カーソル移動）は奪わない
  if (event.target.closest('input, textarea, select')) return;
  const overlay = panel.parentElement;
  sheetDrag = {
    panel,
    overlay,
    startY: event.touches[0].clientY,
    startX: event.touches[0].clientX,
    dragging: false,
    startedAtTop: panel.scrollTop <= 0,
  };
}, { passive: true });

// dragging中はブラウザのスクロール（iOSのバウンス）を止めたいので passive: false
document.addEventListener('touchmove', (event) => {
  if (!sheetDrag) return;
  const { panel } = sheetDrag;
  const dy = event.touches[0].clientY - sheetDrag.startY;
  const dx = event.touches[0].clientX - sheetDrag.startX;
  if (!sheetDrag.dragging) {
    // 上方向・横方向の動き、またはパネル内をスクロール中なら、シートは掴まない
    if (dy < -6 || panel.scrollTop > 0 || !sheetDrag.startedAtTop) { sheetDrag = null; return; }
    if (dy > 12 && dy > Math.abs(dx)) sheetDrag.dragging = true;
    else return;
  }
  event.preventDefault();
  const offset = Math.max(0, dy);
  panel.style.transition = 'none';
  panel.style.transform = `translateY(${offset}px)`;
}, { passive: false });

function finishSheetDrag(event) {
  if (!sheetDrag) return;
  const drag = sheetDrag;
  sheetDrag = null;
  if (!drag.dragging) return;
  const dy = (event.changedTouches ? event.changedTouches[0].clientY : drag.startY) - drag.startY;
  const { panel, overlay } = drag;
  if (dy > SHEET_CLOSE_DISTANCE) {
    // 下まで滑らせてから閉じる
    panel.style.transition = 'transform 0.2s ease-in';
    panel.style.transform = 'translateY(105%)';
    setTimeout(() => {
      overlay.classList.add('hidden');
      panel.style.transition = '';
      panel.style.transform = '';
    }, 200);
  } else {
    // 途中で離したら元の位置へ戻す
    panel.style.transition = 'transform 0.25s cubic-bezier(.32, .72, 0, 1)';
    panel.style.transform = '';
    setTimeout(() => { panel.style.transition = ''; }, 260);
  }
}
document.addEventListener('touchend', finishSheetDrag, { passive: true });
document.addEventListener('touchcancel', finishSheetDrag, { passive: true });

// 「🕐 今」ボタン（data-target属性で指定した時刻入力欄に現在時刻を入れる）。
// index.htmlのメイン入力フォーム・編集モーダルどちらの時刻欄にも使われる。
// こちらも5分刻みに丸めた時刻を入れる。
function nowHHMM() {
  const d = new Date();
  const raw = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return roundToStepMinutes(raw, 5);
}
document.querySelectorAll('.now-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    target.value = nowHHMM();
    target.dispatchEvent(new Event('input'));
  });
});

const LEVEL_COLORS = {
  '絶好調': 'var(--level-絶好調)',
  '良い': 'var(--level-良い)',
  '普通': 'var(--level-普通)',
  '悪い': 'var(--level-悪い)',
  '最悪': 'var(--level-最悪)',
};

// 品目テキストの末尾に付いているカロリー表記を読み取る。
// 書き込む側は lib/calories.js。形式を変える時は両方直すこと。
const KCAL_PATTERN = /（約([\d,]+)kcal）\s*$/;
// 内容から量が読み取れず、カロリーを推定できなかった記録に付く印
const UNKNOWN_PATTERN = /（kcal不明）\s*$/;
function splitKcal(item) {
  const raw = String(item);
  if (UNKNOWN_PATTERN.test(raw)) {
    return { text: raw.replace(UNKNOWN_PATTERN, '').trim(), kcal: null, unknown: true };
  }
  const m = raw.match(KCAL_PATTERN);
  if (!m) return { text: raw.trim(), kcal: null, unknown: false };
  return { text: raw.replace(KCAL_PATTERN, '').trim(), kcal: Number(m[1].replace(/,/g, '')), unknown: false };
}
// 運動の内容の末尾に付いている消費カロリー表記を読み取る。
// 書き込む側は lib/calories.js。形式を変える時は両方直すこと。
const BURNED_PATTERN = /（約([\d,]+)kcal消費）\s*$/;
function splitBurnedKcal(content) {
  const raw = String(content);
  if (UNKNOWN_PATTERN.test(raw)) {
    return { text: raw.replace(UNKNOWN_PATTERN, '').trim(), kcal: null, unknown: true };
  }
  const m = raw.match(BURNED_PATTERN);
  if (!m) return { text: raw.trim(), kcal: null, unknown: false };
  return { text: raw.replace(BURNED_PATTERN, '').trim(), kcal: Number(m[1].replace(/,/g, '')), unknown: false };
}
function formatKcal(kcal) {
  return `約${kcal.toLocaleString('ja-JP')}kcal`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 今日の日付（YYYY-MM-DD）
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(dateStr, weekday) {
  const parts = dateStr.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}（${weekday}）`;
}

// 睡眠時間の段階。単語と色の対応は今週の運動リングと同じにそろえてある
// （アプリ全体で同じ色が同じ意味になるように）。色は棒グラフと言葉の両方に使う。
const SLEEP_STAGES = [
  { underHours: 5,        word: 'SLEEP MORE',  color: 'var(--sleep-more)' },       // 5時間未満：グレー
  { underHours: 6,        word: 'NICE',        color: 'var(--sleep-nice)' },       // 6時間未満：青
  { underHours: 7,        word: 'GOOD',        color: 'var(--sleep-good)' },       // 7時間未満：水色
  { underHours: 8,        word: 'GREAT!!',     color: 'var(--sleep-great)' },      // 7〜8時間：緑
  { underHours: Infinity, word: 'EXCELLENT!!', color: 'var(--sleep-excellent)' },  // 8時間以上：黄色
];
function sleepStage(totalMinutes) {
  return SLEEP_STAGES.find((s) => totalMinutes < s.underHours * 60)
    || SLEEP_STAGES[SLEEP_STAGES.length - 1];
}

// カロリーの判定がまだ済んでいない記録（食事・運動）の数を数える。
// 付ける処理はサーバー側（/api/backfill-calories）が行い、ここでは
// ボタンを出すかどうかと、件数の表示にだけ使う。
// 推定できなかった記録には「（kcal不明）」の印が付くので、判定済みとして数えない。
// 品目が「先頭 + 同じ並びの繰り返し」になっていないか。
// 以前の不具合で増えてしまった記録を、整える対象として拾うために使う。
function hasRepeatedItems(items) {
  const n = items.length;
  for (let len = 1; len <= Math.floor(n / 2); len++) {
    if (items.slice(n - 2 * len, n - len).join('\u0000') === items.slice(n - len).join('\u0000')) return true;
  }
  return false;
}

function isResolved(text) {
  return KCAL_PATTERN.test(text) || BURNED_PATTERN.test(text) || UNKNOWN_PATTERN.test(text);
}
function countMissingCalories(days) {
  let n = 0;
  for (const day of days) {
    for (const e of day.exercise) {
      if (e.content && !isResolved(e.content)) n++;
    }
    for (const meal of day.meals || []) {
      if (!meal.items.length) continue;
      // カロリーが未判定のもののほか、品目が重複してしまっている記録も整える対象にする
      if (!meal.items.every(isResolved) || hasRepeatedItems(meal.items)) n++;
    }
  }
  return n;
}

function renderSleepChart(days) {
  const recent = days.filter((d) => d.sleep && d.sleep.totalMinutes);
  const el = document.getElementById('sleepChart');
  if (!recent.length) {
    el.innerHTML = `<div class="empty">${periodWord()}の睡眠記録はありません</div>`;
    return;
  }
  const max = Math.max(...recent.map((d) => d.sleep.totalMinutes), 8 * 60);
  el.innerHTML = recent.map((d) => {
    const pct = Math.round((d.sleep.totalMinutes / max) * 100);
    const stage = sleepStage(d.sleep.totalMinutes);
    return `<div class="chart-row">
      <div class="date">${shortDate(d.dateStr, d.weekday)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${stage.color}"></div></div>
      <div class="value">${d.sleep.hours}時間${d.sleep.minutes}分</div>
      <div class="grade" style="color:${stage.color}">${stage.word}</div>
    </div>`;
  }).join('');
}

function renderLevelChart(days) {
  const recent = days.filter((d) => d.condition.some((c) => c.level));
  const el = document.getElementById('levelChart');
  if (!recent.length) {
    el.innerHTML = `<div class="empty">${periodWord()}の体調レベル記録はありません</div>`;
    return;
  }
  el.innerHTML = recent.slice().reverse().map((d) => {
    const withLevel = d.condition.filter((c) => c.level);
    const last = withLevel[withLevel.length - 1];
    const color = LEVEL_COLORS[last.level] || 'var(--border)';
    return `<div class="level-dot">
      <div class="dot" style="background:${color}"></div>
      <div>${Number(d.dateStr.split('-')[2])}日</div>
    </div>`;
  }).join('');
}

// blockId -> 編集に必要な情報。編集モーダルを開く時にここから引く。
const entryIndex = {};
const mealIndex = {};

// 編集モードにしている日（YYYY-MM-DD）。編集・削除のあとに一覧を作り直しても
// その日の編集モードが続くよう、描き直しをまたいで保持する
const editingDays = new Set();

// 時計・マイク・格言アイコンと同じ線画スタイル（絵文字だと浮いて見えるため）
const ICON_EDIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>';
const ICON_TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

function actionButtons(blockId) {
  return `<span class="entry-actions">
    <button type="button" class="icon-btn" data-edit="${blockId}" aria-label="編集">${ICON_EDIT}</button>
    <button type="button" class="icon-btn" data-delete="${blockId}" aria-label="削除">${ICON_TRASH}</button>
  </span>`;
}

// "HH:MM" を分数に変換する（ソート用）。時刻が無い記録は最後尾に回すためnullを返す。
function parseTimeMinutes(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 記録1行の頭（分類名・時刻・カロリーなど）を組み立てる。
// 時刻の大きさはどの記録でもそろえたいので、頭はすべてこの関数を通して作る。
// typed=trueは就寝・起床のように自分で打ち込んだ時刻で、記録した時の時刻が
// 自動で入る他の記録と見分けが付くよう、そこだけ本文と同じ白で出す。
function entryHead(label, time, meta = '', typed = false) {
  const parts = [`<span class="entry-label">${escapeHtml(label)}</span>`];
  if (time) parts.push(`<span class="entry-time${typed ? ' typed' : ''}">${escapeHtml(time)}</span>`);
  // metaは先頭に「・」が付いた文字列（カロリー）か「（7時間5分）」なので、
  // 時刻とはくっつけて出す
  if (meta) parts.push(`<span class="entry-meta">${meta}</span>`);
  return `<span class="entry-head">${parts.join('')}</span>`;
}

function renderDayList(days) {
  const el = document.getElementById('dayList');
  if (!days.length) {
    el.innerHTML = `<div class="empty">${periodWord()}の記録はありません</div>`;
    return;
  }
  el.innerHTML = days.map((d) => {
    // 睡眠・体調・運動・メモ・食事を1つの配列にまとめ、時刻順に並べ替えてから表示する
    // （カテゴリ順ではなく、記録した時刻の早い順に見えるようにするため）。
    // 時刻が無い記録（振り返りを除く）はソートキーをnullにして最後尾に回す。
    const entries = [];
    let dayKcal = 0;       // その日の食事の合計カロリー（推定できたぶんだけ）
    let dayBurnedKcal = 0; // その日の運動の合計消費カロリー（同上）

    if (d.sleep && d.sleep.blockId) {
      const durationText = d.sleep.hours !== undefined && d.sleep.hours !== null
        ? `（${d.sleep.hours}時間${d.sleep.minutes}分）` : '';
      entryIndex[d.sleep.blockId] = { dateStr: d.dateStr, category: 'sleep', bedtime: d.sleep.bedtime, wake: d.sleep.wake };
      // 睡眠記録は起床後（＝その日の見出しの下）に記録されるものなので、
      // 起床は常にその見出しの日のもの。「起床でその日を始める」という
      // 直感的な並びになるよう、起床は時刻の数値に関わらず必ずその日の先頭に
      // 固定表示する。
      entries.push({
        sortMinutes: -Infinity,
        html: `<div class="entry-row"><span class="entry-main">${entryHead('起床', d.sleep.wake || '', durationText, true)}</span>${actionButtons(d.sleep.blockId)}</div>`,
      });
      // 就寝が日をまたいでいる場合（起床時刻が就寝時刻以前の数値）、実際に
      // 寝たのは前日の夜なので、就寝は前日側にbedtimeCarryとして表示される。
      // ここ（見出しの日）では重複して出さない。日をまたいでいない場合
      // （同日内の仮眠など）だけ、就寝も「その日を終える」出来事として
      // 必ずその日の末尾に固定表示する。
      const crossesMidnight = d.sleep.wake && d.sleep.bedtime
        && parseTimeMinutes(d.sleep.wake) !== null && parseTimeMinutes(d.sleep.bedtime) !== null
        && parseTimeMinutes(d.sleep.bedtime) > parseTimeMinutes(d.sleep.wake);
      if (!crossesMidnight) {
        entries.push({
          sortMinutes: Infinity,
          html: `<div class="entry-row"><span class="entry-main">${entryHead('就寝', d.sleep.bedtime || '', '', true)}</span>${actionButtons(d.sleep.blockId)}</div>`,
        });
      }
    }
    // 就寝が日をまたぐ場合、翌日の睡眠記録の就寝時刻をこの日の末尾に表示する
    // （記録自体は翌日の見出しの下にあるので、編集・削除ボタンは付けない）
    if (d.bedtimeCarry) {
      entries.push({
        sortMinutes: Infinity,
        html: `<div class="entry-row"><span class="entry-main">${entryHead('就寝', d.bedtimeCarry.time, '', true)}</span></div>`,
      });
    }
    d.condition.forEach((c) => {
      const levelText = c.level ? `<span style="color:${LEVEL_COLORS[c.level] || 'inherit'}">${escapeHtml(c.level)}</span>` : '';
      const stoolText = c.stool ? `　🚽${escapeHtml(c.stool)}` : '';
      const noteText = c.note ? `${c.level ? '：' : ''}${escapeHtml(c.note)}` : '';
      entryIndex[c.blockId] = { dateStr: d.dateStr, category: 'condition', time: c.time, level: c.level, stool: c.stool, note: c.note };
      entries.push({
        sortMinutes: parseTimeMinutes(c.time),
        html: `<div class="entry-row"><span class="entry-main">${entryHead('体調', c.time)}${levelText}${stoolText}${noteText}</span>${actionButtons(c.blockId)}</div>`,
      });
    });
    d.exercise.forEach((e) => {
      // 内容から消費カロリーの表記を取り出し、食事と同じくラベル側に出す。
      // 推定できなかった記録には（kcal不明）の印を書き込んであるが、それは
      // 「まとめてカロリーを付ける」で何度も試さないための目印なので、
      // 画面には出さない（読む側には意味が分からないため）
      const ex = splitBurnedKcal(e.content);
      if (ex.kcal !== null) dayBurnedKcal += ex.kcal;
      const burnedLabel = ex.kcal !== null ? `・${formatKcal(ex.kcal)}` : '';
      entryIndex[e.blockId] = { dateStr: d.dateStr, category: 'exercise', time: e.time, content: ex.text };
      entries.push({
        sortMinutes: parseTimeMinutes(e.time),
        html: `<div class="entry-row"><span class="entry-main">${entryHead('運動', e.time, burnedLabel)}<span class="entry-text">${escapeHtml(ex.text)}</span></span>${actionButtons(e.blockId)}</div>`,
      });
    });
    d.memo.forEach((m) => {
      entryIndex[m.blockId] = { dateStr: d.dateStr, category: 'memo', time: m.time, content: m.content };
      entries.push({
        sortMinutes: parseTimeMinutes(m.time),
        html: `<div class="entry-row"><span class="entry-main">${entryHead('メモ', m.time)}<span class="entry-text">${escapeHtml(m.content)}</span></span>${actionButtons(m.blockId)}</div>`,
      });
    });
    d.meals.forEach((meal) => {
      if (!meal.items.length) return;
      const type = meal.mealType;
      mealIndex[meal.blockId] = { dateStr: d.dateStr, mealType: type, items: meal.items };
      const firstItemTime = (meal.items[0].match(/^(\d{1,2}:\d{2})\s/) || [])[1] || null;
      // 体調・運動・メモと同じく「ラベル 時刻」の形で見出しに時刻を出すため、
      // 各品目の先頭に付いている時刻表記は取り除く（見出しと二重表示にならないように）
      // 品目テキストからは時刻とカロリー表記を取り除き、カロリーは1食分の
      // 合計としてラベル側にまとめて出す（品目ごとに出すと読みにくいため）。
      const parsed = meal.items
        .map((i) => splitKcal(i.replace(/^\d{1,2}:\d{2}\s/, '')))
        .filter((x) => x.text);
      const kcals = parsed.map((x) => x.kcal).filter((k) => k !== null);
      const mealKcal = kcals.length ? kcals.reduce((a, b) => a + b, 0) : null;
      dayKcal += mealKcal || 0;
      const kcalLabel = mealKcal !== null ? `・${formatKcal(mealKcal)}` : '';
      // 他の記録（体調・運動・メモ）と同じ1行の形にそろえる。
      // 品目が複数ある場合は読点でつないで1行に収める。
      entries.push({
        sortMinutes: parseTimeMinutes(firstItemTime),
        html: `<div class="entry-row"><span class="entry-main">${entryHead(type, firstItemTime, kcalLabel)}${escapeHtml(parsed.map((x) => x.text).join('、'))}</span>${actionButtons(meal.blockId).replace('data-delete', 'data-mealdelete').replace('data-edit', 'data-mealedit')}</div>`,
      });
    });

    // Array.prototype.sortは安定ソートなので、時刻が同じ（またはどちらもnull）
    // 記録同士は元の並び順（睡眠→体調→運動→メモ→食事）のまま保たれる
    entries.sort((a, b) => {
      if (a.sortMinutes === null && b.sortMinutes === null) return 0;
      if (a.sortMinutes === null) return 1;
      if (b.sortMinutes === null) return -1;
      return a.sortMinutes - b.sortMinutes;
    });
    const rows = entries.map((e) => e.html);

    // 「きのうのふりかえり」で生成されたコメントは、時刻を持たないその日の
    // まとめなので、常に一番最後に表示する（編集・削除は対象外）
    if (d.review && d.review.content) {
      rows.push(`<div class="entry-row"><span class="entry-main">${entryHead('振り返り', null)}${escapeHtml(d.review.content)}</span></div>`);
    }

    const lastLevel = d.condition.filter((c) => c.level).pop();
    const dotColor = lastLevel ? (LEVEL_COLORS[lastLevel.level] || 'var(--border)') : 'transparent';

    // 摂取と消費の両方がある日は並べて出す。片方だけの日はそれだけ出す。
    // 単位は末尾に1つだけ付ける（「摂取 約1,120 / 消費 約630kcal」）。
    // 両方に付けると、狭い端末で日付と並ばず2行に折り返してしまうため。
    // 摂取・消費と、今日だけ「1日の目安」を日付の下の行に出す。
    // 以前は日付と同じ行に出していて幅が足りず、単位を末尾に1つしか
    // 付けられなかった（「摂取 約234」が何の数字か分からなかった）ため、
    // 行を分けてそれぞれに kcal を付けている。
    const kcalParts = [];
    if (dayKcal > 0) kcalParts.push(`<span class="day-kcal">摂取 約${dayKcal.toLocaleString('ja-JP')}kcal</span>`);
    if (dayBurnedKcal > 0) kcalParts.push(`<span class="day-kcal">消費 約${dayBurnedKcal.toLocaleString('ja-JP')}kcal</span>`);
    if (d.dateStr === todayDateStr() && window.bodyTargetKcal) {
      const target = bodyTargetKcal();
      kcalParts.push(`<span class="day-kcal day-kcal-target">目安 ${target.kcal.toLocaleString('ja-JP')}kcal</span>`);
    }
    const dayKcalRow = kcalParts.length ? `<div class="day-kcal-row">${kcalParts.join('')}</div>` : '';
    // 記録1件ずつに編集・削除を並べると画面がにぎやかになるので、
    // 日付の行の編集ボタンでその日をまとめて編集モードにする
    // その日のトータルスコア（0〜68点）。計算は育成のポイントと同じもの（growth.js）
    const score = window.gohanDayScore ? gohanDayScore(d) : null;
    const dayScore = score
      ? `<span class="day-score" style="color:${score.color}">${score.score}<small>/${score.max}</small>${score.word ? ` <b>${score.word}</b>` : ''}</span>`
      : '';
    const editing = editingDays.has(d.dateStr);
    const dayEditBtn = `<button type="button" class="icon-btn day-edit-btn${editing ? ' active' : ''}" data-dayedit="${d.dateStr}" aria-pressed="${editing}" aria-label="${d.dateStr}の記録を編集">${ICON_EDIT}</button>`;
    return `<div class="day-card${editing ? ' editing' : ''}" id="day-${d.dateStr}">
      <div class="day-title"><span class="dot" style="background:${dotColor}"></span>${shortDate(d.dateStr, d.weekday)}${dayScore}${dayEditBtn}</div>
      ${dayKcalRow}
      ${rows.join('')}
    </div>`;
  }).join('');

  el.querySelectorAll('[data-dayedit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dateStr = btn.dataset.dayedit;
      const card = document.getElementById(`day-${dateStr}`);
      const on = !editingDays.has(dateStr);
      if (on) editingDays.add(dateStr); else editingDays.delete(dateStr);
      if (card) card.classList.toggle('editing', on);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  });
  el.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
  el.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMetaEntry(btn.dataset.delete));
  });
  el.querySelectorAll('[data-mealedit]').forEach((btn) => {
    btn.addEventListener('click', () => openMealEditModal(btn.dataset.mealedit));
  });
  el.querySelectorAll('[data-mealdelete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMealEntry(btn.dataset.mealdelete));
  });
}

// --- 期間の表示（月 / 週 / 日） ---
// ふだんは「週」（月曜はじまりの今週7日分）だけを見せる。月まるごと並べると
// 記録が多すぎて目的の日にたどり着きにくいため。それより前は「月」に
// 切り替えて、月を送りながら振り返る。「日」は今日の記録だけを見る
let allDays = [];
let viewMode = 'week'; // 'month' | 'week' | 'day'
let viewYear = null;
let viewMonth = null; // 0-indexed

function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// 週は月曜はじまり。月をまたぐ週が「何月の第何週」かは木曜日の属する月で決める
// （7日のうち多い方の月に入る。9/1が火曜なら 8/31〜9/6 が「9月 第1週」）。
// 第n週の n は、その月に属する週を頭から数えた番号
function weekOf(date) {
  const mon = mondayOf(date);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const thu = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3);
  // その月に属する最初の週の月曜を探す（1日を含む週の木曜が前月なら、次の週が第1週）
  let firstMon = mondayOf(new Date(thu.getFullYear(), thu.getMonth(), 1));
  const firstThu = new Date(firstMon.getFullYear(), firstMon.getMonth(), firstMon.getDate() + 3);
  if (firstThu.getMonth() !== thu.getMonth()) firstMon = new Date(firstMon.getFullYear(), firstMon.getMonth(), firstMon.getDate() + 7);
  const n = Math.round((mon - firstMon) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { mon, sun, year: thu.getFullYear(), month: thu.getMonth(), n };
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
function shortDateOf(d) {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_JA[d.getDay()]}）`;
}

// 空の時の文言に使う（「今日の記録はありません」「今週の…」「この月の…」）
function periodWord() {
  return viewMode === 'day' ? '今日' : viewMode === 'week' ? '今週' : 'この月';
}

// 「月 / 週 / 日」の切り替え。月送りの行（.month-nav）の上に置く
function setupPeriodTabs() {
  const nav = document.querySelector('.month-nav');
  if (!nav || document.querySelector('.period-tabs')) return;
  const tabs = document.createElement('div');
  tabs.className = 'period-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = `
    <button type="button" role="tab" data-mode="month">月</button>
    <button type="button" role="tab" data-mode="week">週</button>
    <button type="button" role="tab" data-mode="day">日</button>`;
  tabs.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      if (viewMode === b.dataset.mode) return;
      viewMode = b.dataset.mode;
      if (viewMode === 'month' && viewYear === null) {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
      }
      renderPeriod();
    });
  });
  nav.parentNode.insertBefore(tabs, nav);
}

function renderPeriod() {
  setupPeriodTabs();
  document.querySelectorAll('.period-tabs button').forEach((b) => {
    const on = b.dataset.mode === viewMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  // 月送りの矢印があるのは「月」だけ。「週」「日」は今週・今日だけを見せる
  const nav = document.querySelector('.month-nav');
  if (nav) nav.classList.toggle('no-arrows', viewMode !== 'month');
  if (viewMode === 'day') renderToday();
  else if (viewMode === 'week') renderWeek();
  else renderMonth();
}

function renderToday() {
  const now = new Date();
  const label = document.getElementById('monthLabel');
  if (label) label.innerHTML = `今日<small>${shortDateOf(now)}</small>`;
  const key = ymd(now);
  const todayDays = allDays.filter((d) => d.dateStr === key);
  renderSleepChart(todayDays);
  renderLevelChart(todayDays);
  renderDayList(todayDays);
}

function renderWeek() {
  const w = weekOf(new Date());
  const label = document.getElementById('monthLabel');
  if (label) {
    label.innerHTML = `${w.month + 1}月 第${w.n}週<small>${shortDateOf(w.mon)}〜${shortDateOf(w.sun)}</small>`;
  }
  const from = ymd(w.mon);
  const to = ymd(w.sun);
  const weekDays = allDays.filter((d) => d.dateStr >= from && d.dateStr <= to);
  renderSleepChart(weekDays);
  renderLevelChart(weekDays);
  renderDayList(weekDays);
}

function renderMonth() {
  const label = document.getElementById('monthLabel');
  if (label) label.textContent = `${viewYear}年${viewMonth + 1}月`;

  const key = monthKey(viewYear, viewMonth);
  const monthDays = allDays.filter((d) => d.dateStr.startsWith(key));

  renderSleepChart(monthDays);
  renderLevelChart(monthDays);
  renderDayList(monthDays);

  const now = new Date();
  const nextBtn = document.getElementById('nextMonthBtn');
  if (nextBtn) {
    const isCurrentOrFuture = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth());
    nextBtn.disabled = isCurrentOrFuture;
  }
}

function shiftMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  renderMonth();
}

const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => shiftMonth(-1));
if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => shiftMonth(1));

async function loadHistory() {
  try {
    const resp = await fetch('/api/history?days=730', { headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '取得に失敗しました');
    allDays = data.days;
    // ホーム画面の「今日」カードの数字も同じデータから更新する
    if (typeof renderTodayStats === 'function') renderTodayStats(allDays);

    // ハッシュ指定(#day-YYYY-MM-DD)があれば、その日が今週なら「今週」、
    // それより前ならその月の「月ごと」を初期表示にする（記録直後の再読み込みでは
    // 今の表示（今週 / 見ていた月）をそのまま保つ）
    const hashMatch = location.hash.match(/^#day-(\d{4})-(\d{2})-(\d{2})$/);
    const now = new Date();
    if (viewYear === null) {
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      if (hashMatch) {
        const w = weekOf(now);
        const target = `${hashMatch[1]}-${hashMatch[2]}-${hashMatch[3]}`;
        if (target < ymd(w.mon) || target > ymd(w.sun)) {
          viewMode = 'month';
          viewYear = Number(hashMatch[1]);
          viewMonth = Number(hashMatch[2]) - 1;
        }
      }
    }

    renderPeriod();
    updateBackfillButton();

    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (e) {
    ['sleepChart', 'levelChart', 'dayList'].forEach((id) => {
      document.getElementById(id).innerHTML = `<div class="empty">読み込みエラー: ${escapeHtml(e.message)}</div>`;
    });
  }
}

// --- 過去の記録へのカロリー付け ---
// カロリー推定を入れる前の記録にはカロリーが付いていないので、
// 対象がある時だけ「毎日の記録」の見出しの下にボタンを出す。
// サーバーは1回に決まった件数までしか処理しないので、残りが0になるまで繰り返す。
let backfillRunning = false;

function backfillButton() {
  let btn = document.getElementById('backfillBtn');
  if (btn) return btn;
  const list = document.getElementById('dayList');
  if (!list) return null;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'backfillBtn';
  btn.className = 'backfill-btn';
  btn.hidden = true;
  btn.addEventListener('click', runBackfill);
  list.parentNode.insertBefore(btn, list);
  return btn;
}

function updateBackfillButton() {
  const btn = backfillButton();
  if (!btn || backfillRunning) return;
  const n = countMissingCalories(allDays);
  btn.hidden = n === 0;
  btn.disabled = false;
  btn.textContent = `整える必要がある記録 ${n}件を直す（カロリーの推定・品目の重複）`;
}

// 万一サーバーが残り件数を減らせない状態になっても止まるよう、回数の上限を設ける
const BACKFILL_MAX_ROUNDS = 100;

async function runBackfill() {
  const btn = backfillButton();
  if (!btn || backfillRunning) return;
  backfillRunning = true;
  btn.disabled = true;
  let done = 0;
  let unresolved = 0;
  try {
    for (let round = 0; round < BACKFILL_MAX_ROUNDS; round++) {
      btn.textContent = `記録を整えています…（${done}件おわり）`;
      const resp = await fetch('/api/backfill-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...notionHeaders() },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '処理に失敗しました');
      done += data.updated;
      unresolved += data.unknown || 0;
      if (!data.remaining) break;
    }
    backfillRunning = false;
    await loadHistory();
    // loadHistory 後にボタンの表示は作り直されるので、結果はそのあとに上書きする
    const after = backfillButton();
    if (after) {
      after.hidden = false;
      after.disabled = true;
      after.textContent = unresolved
        ? `${done}件を整えました（${unresolved}件はカロリーを推定できないため × を付けました）`
        : `${done}件を整えました`;
    }
  } catch (e) {
    backfillRunning = false;
    btn.disabled = false;
    btn.textContent = `うまくいきませんでした（${e.message}）。もう一度試す`;
  }
}

// --- 編集モーダル ---
let currentEdit = null; // { mode: 'meta'|'meal', blockId/mealBlockId, category }

const fieldGroups = ['field-time', 'field-content', 'field-bedtime', 'field-level', 'field-items'];
function showFields(...ids) {
  fieldGroups.forEach((id) => { document.getElementById(id).hidden = !ids.includes(id); });
}

const modalOverlay = document.getElementById('editModal');
const modalStatus = document.getElementById('modalStatus');
const editLevelChips = document.querySelectorAll('#editLevelChips .chip');
const editStoolChips = document.querySelectorAll('#editStoolChips .chip');
let editLevelValue = '';
let editStoolValue = '';

editLevelChips.forEach((c) => c.addEventListener('click', () => {
  editLevelValue = editLevelValue === c.dataset.value ? '' : c.dataset.value; // もう一度タップで解除
  editLevelChips.forEach((x) => x.classList.toggle('active', x.dataset.value === editLevelValue));
}));
editStoolChips.forEach((c) => c.addEventListener('click', () => {
  editStoolValue = editStoolValue === c.dataset.value ? '' : c.dataset.value;
  editStoolChips.forEach((x) => x.classList.toggle('active', x.dataset.value === editStoolValue));
}));

function openModal(title) {
  document.getElementById('editModalTitle').textContent = title;
  modalStatus.textContent = '';
  modalStatus.className = 'modal-status';
  modalOverlay.classList.remove('hidden');
  // 閉じている間は高さを測れないので、開いてから中身の行数に合わせる
  modalOverlay.querySelectorAll('textarea.auto-grow').forEach(autoGrowTextarea);
}
function closeModal() {
  modalOverlay.classList.add('hidden');
  currentEdit = null;
}

function openEditModal(blockId) {
  const entry = entryIndex[blockId];
  if (!entry) return;
  currentEdit = { mode: 'meta', blockId, category: entry.category, dateStr: entry.dateStr };

  if (entry.category === 'sleep') {
    showFields('field-bedtime');
    document.getElementById('editBedtime').value = (entry.bedtime || '').padStart(5, '0');
    document.getElementById('editWake').value = (entry.wake || '').padStart(5, '0');
    openModal('睡眠を編集');
  } else if (entry.category === 'condition') {
    showFields('field-time', 'field-level');
    document.getElementById('editTime').value = entry.time || '';
    editLevelValue = entry.level || '';
    editStoolValue = entry.stool || '';
    editLevelChips.forEach((x) => x.classList.toggle('active', x.dataset.value === editLevelValue));
    editStoolChips.forEach((x) => x.classList.toggle('active', x.dataset.value === editStoolValue));
    document.getElementById('editNote').value = entry.note || '';
    openModal('体調を編集');
  } else {
    // exercise / memo
    showFields('field-time', 'field-content');
    document.getElementById('editTime').value = entry.time || '';
    document.getElementById('editContent').value = entry.content || '';
    openModal(entry.category === 'exercise' ? '運動を編集' : 'メモを編集');
  }
}

// 食事の品目は「11:10 パン」のように先頭に時刻が付いた文字列で保存されている
const MEAL_TIME_RE = /^\s*(\d{1,2}:\d{2})\s*/;

function openMealEditModal(mealBlockId) {
  const meal = mealIndex[mealBlockId];
  if (!meal) return;
  currentEdit = { mode: 'meal', mealBlockId, mealType: meal.mealType, dateStr: meal.dateStr };
  showFields('field-time', 'field-items');
  // 品目の先頭に付いている時刻は「時刻」の欄で直せるようにし、品目の欄では品目だけを見せる。
  // カロリー表記は保存時に付け直すので、編集欄では見せない
  const times = meal.items.map((i) => (String(i).match(MEAL_TIME_RE) || [])[1]).filter(Boolean);
  document.getElementById('editTime').value = times[0] ? times[0].padStart(5, '0') : (meal.time || '');
  document.getElementById('editItems').value = meal.items.map((i) => splitKcal(i).text.replace(MEAL_TIME_RE, '')).join('\n');
  openModal(`${meal.mealType}を編集`);
}

// 記録を編集・削除した後に、今日ぶんの表示を追いつかせる。
// 「今日の活動」のコメントは今日ここまでの進み具合への言葉なので、記録の中身が
// 変わったら書き直す（直したはずの内容が古いまま残らないように）。
// カレンダー・今週の運動・育成のポイントも今日の記録から作っているので
// 一緒に更新する。いずれもトップ画面だけの機能なので、履歴画面では何もしない。
function refreshTodayViews(dateStr) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // 過去の日を直した時は、今日の活動に関係がないので何もしない
  if (dateStr && dateStr !== today) return;
  if (window.loadCalendar) loadCalendar();
  if (window.loadExerciseRing) loadExerciseRing();
  if (window.loadGohanGrowth) loadGohanGrowth();
  if (window.regenerateDailyReview) regenerateDailyReview();
}

document.getElementById('cancelEditBtn').addEventListener('click', closeModal);

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  if (!currentEdit) return;
  modalStatus.className = 'modal-status';
  modalStatus.textContent = '保存中…';

  try {
    let resp;
    if (currentEdit.mode === 'meal') {
      // 「時刻」の欄の値を、各品目の先頭に付け直す（欄に時刻を書いてしまっていても二重にならない）
      const time = document.getElementById('editTime').value.trim();
      const items = document.getElementById('editItems').value.split('\n')
        .map((s) => s.trim().replace(MEAL_TIME_RE, ''))
        .filter(Boolean)
        .map((s) => (time ? `${time} ${s}` : s));
      if (!items.length) throw new Error('品目を1つ以上入力してください');
      resp = await fetch('/api/entry/meal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...notionHeaders() },
        body: JSON.stringify({ mealBlockId: currentEdit.mealBlockId, mealType: currentEdit.mealType, items }),
      });
    } else {
      let payload;
      if (currentEdit.category === 'sleep') {
        const bedtime = document.getElementById('editBedtime').value;
        const wake = document.getElementById('editWake').value;
        if (!bedtime || !wake) throw new Error('就寝・起床時刻を入力してください');
        payload = { bedtime, wake };
      } else if (currentEdit.category === 'condition') {
        const editNoteValue = document.getElementById('editNote').value.trim();
        if (!editLevelValue && !editStoolValue && !editNoteValue) {
          throw new Error('調子・排便・内容のいずれかを入力してください');
        }
        payload = { time: document.getElementById('editTime').value, level: editLevelValue, stool: editStoolValue, note: editNoteValue };
      } else {
        const content = document.getElementById('editContent').value.trim();
        if (!content) throw new Error('内容を入力してください');
        payload = { time: document.getElementById('editTime').value, content };
      }
      resp = await fetch('/api/entry/meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...notionHeaders() },
        body: JSON.stringify({ blockId: currentEdit.blockId, category: currentEdit.category, payload }),
      });
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '保存に失敗しました');
    const changedDate = currentEdit.dateStr; // closeModalでcurrentEditが消えるので先に控える
    closeModal();
    await loadHistory();
    refreshTodayViews(changedDate);
  } catch (e) {
    modalStatus.className = 'modal-status err';
    modalStatus.textContent = '❌ ' + e.message;
  }
});

async function deleteMetaEntry(blockId) {
  if (!confirm('この記録を削除しますか？')) return;
  const changedDate = entryIndex[blockId] && entryIndex[blockId].dateStr; // 一覧を作り直すと索引が変わるので先に控える
  try {
    const resp = await fetch(`/api/entry/meta/${blockId}`, { method: 'DELETE', headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '削除に失敗しました');
    await loadHistory();
    refreshTodayViews(changedDate);
  } catch (e) {
    alert('削除に失敗しました: ' + e.message);
  }
}

async function deleteMealEntry(mealBlockId) {
  if (!confirm('この食事の記録（品目すべて）を削除しますか？')) return;
  const changedDate = mealIndex[mealBlockId] && mealIndex[mealBlockId].dateStr; // 先に控える
  try {
    const resp = await fetch(`/api/entry/meal/${mealBlockId}`, { method: 'DELETE', headers: notionHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '削除に失敗しました');
    await loadHistory();
    refreshTodayViews(changedDate);
  } catch (e) {
    alert('削除に失敗しました: ' + e.message);
  }
}

loadHistory();

// --- 他の人が自分のNotionでこのアプリを使うための設定画面 ---
// サーバー環境変数（NOTION_TOKEN/NOTION_PAGE_ID）を使うオーナー自身の環境では
// 何も設定しなくてもこれまで通り使える。他の人が使う場合だけ、自分のNotion
// integrationトークンとページIDをここで設定してもらう（ブラウザ内だけに保存）。
function buildNotionSettingsModal() {
  if (document.getElementById('notionSettingsModal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.id = 'notionSettingsModal';
  overlay.innerHTML = `
    <div class="modal-panel">
      <h3 id="notionSettingsTitle">Notion連携の設定</h3>
      <p class="notion-settings-hint notion-only">
        自分のNotionページに記録したい場合は、ここで自分のNotionの連携情報を設定してください。
        設定はこの端末のブラウザだけに保存され、サーバーには保存されません。
      </p>
      <ol class="notion-settings-steps notion-only">
        <li><a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">Notionのintegrationページ</a>で新しいintegrationを作成し、「Internal Integration Secret」をコピーする</li>
        <li>記録先にしたいNotionページを開き、右上の「…」メニュー→「コネクト」から、作成したintegrationを追加する</li>
        <li>そのページのURLに含まれる32文字のID（ハイフンは省略可）をコピーする</li>
      </ol>
      <div class="notion-only">
        <label>Notionの「Internal Integration Secret」</label>
        <input type="text" id="notionSettingsToken" placeholder="ntn_... または secret_..." autocomplete="off" spellcheck="false" />
        <label>Notion ページID</label>
        <input type="text" id="notionSettingsPageId" placeholder="例）1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d" autocomplete="off" spellcheck="false" />
        <p class="notion-settings-hint">空欄のまま保存すると連携設定を削除します。</p>
      </div>

      <label>天気を表示する地域</label>
      <input type="text" id="weatherLocationInput" placeholder="例）大阪、東京、札幌" autocomplete="off" spellcheck="false" />
      <p class="notion-settings-hint">空欄の場合は大阪の天気を表示します。</p>

      <details class="settings-privacy">
        <summary>データの取り扱いについて</summary>
        <ul>
          <li class="notion-only">入力した記録は、あなた自身が指定したNotionページにのみ保存されます。このアプリのサーバーには保存されません。</li>
          <li class="notion-only">Notionの連携情報（シークレット・ページID）と地域の設定は、この端末のブラウザ内にのみ保存されます。他の人が見ることはできません。</li>
          <li class="auth-only" hidden>入力した記録は、あいぼう手帳のサーバー（あなたのアカウントに紐づく領域）に保存されます。設定の「アカウント」からいつでも全部削除できます。</li>
          <li>音声入力を使った場合、録音した音声と文字起こし結果は、文字に変換するためにOpenAIへ送信されます。変換後はこのアプリでは保持しません。</li>
          <li>「きのうのふりかえり」を使った場合、前日の記録の内容がコメント生成のためOpenAIへ送信されます。</li>
          <li>連携を解除したい場合は、上の欄を空にして保存するか、Notion側でこのintegrationのコネクトを外してください。</li>
        </ul>
      </details>

      <div class="modal-actions">
        <button type="button" class="cancel-btn" id="notionSettingsCancel">キャンセル</button>
        <button type="button" class="save-btn" id="notionSettingsSave">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.classList.add('hidden');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('notionSettingsCancel').addEventListener('click', close);
  document.getElementById('notionSettingsSave').addEventListener('click', () => {
    const token = document.getElementById('notionSettingsToken').value.trim();
    const pageId = document.getElementById('notionSettingsPageId').value.trim();
    if (!token || !pageId) {
      clearNotionSettings();
    } else {
      setNotionSettings(token, pageId);
    }
    setWeatherLocation(document.getElementById('weatherLocationInput').value.trim());
    close();
    location.reload();
  });
}

function openNotionSettingsModal() {
  buildNotionSettingsModal();
  const s = getNotionSettings();
  document.getElementById('notionSettingsToken').value = s ? s.token : '';
  document.getElementById('notionSettingsPageId').value = s ? s.pageId : '';
  document.getElementById('weatherLocationInput').value = getWeatherLocation();
  // Web版（ログインあり）では保存先は自前DBなので、Notionの欄は出さず天気の地域だけにする
  const authMode = !!window.authRequired;
  const modal = document.getElementById('notionSettingsModal');
  modal.querySelectorAll('.notion-only').forEach((el) => { el.hidden = authMode; });
  modal.querySelectorAll('.auth-only').forEach((el) => { el.hidden = !authMode; });
  document.getElementById('notionSettingsTitle').textContent = authMode ? '天気の地域' : 'Notion連携の設定';
  modal.classList.remove('hidden');
}

// --- テーマ（ブラック/ホワイト） ---
// 選択はこの端末のlocalStorageに保存し、各ページの<head>のスクリプトが
// 描画前に読み取って適用する。ここでは切り替えの即時反映だけを行う。
function applyTheme(theme) {
  try { localStorage.setItem('themeSetting', theme); } catch (e) { /* 保存できなくても今の画面には効く */ }
  document.documentElement.classList.toggle('theme-light', theme === 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f2f2f7' : '#000000';
  refreshThemeChoice();
}

function currentTheme() {
  try { return localStorage.getItem('themeSetting') === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
}

function refreshThemeChoice() {
  const cur = currentTheme();
  document.querySelectorAll('#themeChoice button').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.theme === cur);
  });
}

// ⚙️ボタンから開く「設定」メニュー。キャラクターの着せ替え（トップ画面のみ）と
// Notion連携を、それぞれ一項目として並べる。
function openSettingsMenu() {
  let overlay = document.getElementById('settingsMenuModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'settingsMenuModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>設定</h3>
        <div class="settings-menu">
          <button type="button" class="settings-menu-item" id="settingsItemMascot">
            <span class="settings-menu-title">キャラクター設定</span>
            <span class="settings-menu-desc">マスコットのきせかえ・名前の変更</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemBody">
            <span class="settings-menu-title">からだの設定</span>
            <span class="settings-menu-desc">身長・体重から1日の目安カロリーを計算します</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemHome">
            <span class="settings-menu-title">ホーム画面の表示</span>
            <span class="settings-menu-desc">ホーム画面に表示する項目をON/OFFで選ぶ</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemCalendar">
            <span class="settings-menu-title">カレンダー</span>
            <span class="settings-menu-desc">月ごとの記録をカレンダーで見る</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemNotion">
            <span class="settings-menu-title" id="settingsItemNotionTitle">Notion連携と天気の地域</span>
            <span class="settings-menu-desc" id="settingsItemNotionDesc">記録の保存先と、天気を表示する地域</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemAccount" hidden>
            <span class="settings-menu-title">アカウント</span>
            <span class="settings-menu-desc" id="settingsItemAccountDesc">ログアウト・アカウントの削除</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemPoints">
            <span class="settings-menu-title">ポイントの説明</span>
            <span class="settings-menu-desc">何をするとどれだけポイントがもらえるか</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemExerciseTarget">
            <span class="settings-menu-title">運動の週目標</span>
            <span class="settings-menu-desc">週に何日運動したら達成にするか</span>
          </button>
          <button type="button" class="settings-menu-item" id="settingsItemMigrate" hidden>
            <span class="settings-menu-title">データベース形式へ移行</span>
            <span class="settings-menu-desc" id="migrateDesc">記録をNotionデータベースにコピーします（元のページは残ります）</span>
          </button>
          <div class="settings-menu-item settings-switch-item" id="settingsItemSound" hidden>
            <span class="settings-menu-title">効果音</span>
            <label class="hs-switch">
              <input type="checkbox" id="soundToggle" />
              <span class="hs-knob"></span>
            </label>
          </div>
          <div class="settings-menu-item settings-switch-item" id="settingsItemFx" hidden>
            <span class="settings-menu-title">演出をひかえめに</span>
            <label class="hs-switch">
              <input type="checkbox" id="fxCalmToggle" />
              <span class="hs-knob"></span>
            </label>
          </div>
          <div class="settings-menu-item settings-switch-item" id="settingsItemHeaderScene" hidden>
            <span class="settings-menu-title">ヘッダーの景色</span>
            <label class="hs-switch">
              <input type="checkbox" id="headerSceneToggle" />
              <span class="hs-knob"></span>
            </label>
          </div>
          <div class="settings-menu-item settings-theme-item">
            <span class="settings-menu-title">テーマ</span>
            <div class="theme-choice" id="themeChoice">
              <button type="button" data-theme="dark">ブラック</button>
              <button type="button" data-theme="light">ホワイト</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('settingsItemMascot').addEventListener('click', () => {
      overlay.classList.add('hidden');
      window.openMascotSettings();
    });
    document.getElementById('settingsItemBody').addEventListener('click', () => {
      overlay.classList.add('hidden');
      openBodySettings();
    });
    document.getElementById('settingsItemHome').addEventListener('click', () => {
      overlay.classList.add('hidden');
      window.openHomeSectionsSettings();
    });
    document.getElementById('settingsItemCalendar').addEventListener('click', () => {
      overlay.classList.add('hidden');
      window.openCalendarModal();
    });
    document.getElementById('settingsItemNotion').addEventListener('click', () => {
      overlay.classList.add('hidden');
      openNotionSettingsModal();
    });
    document.getElementById('settingsItemAccount').addEventListener('click', () => {
      overlay.classList.add('hidden');
      openAccountModal();
    });
    document.getElementById('settingsItemPoints').addEventListener('click', () => {
      overlay.classList.add('hidden');
      openPointRulesModal();
    });
    document.getElementById('settingsItemExerciseTarget').addEventListener('click', () => {
      overlay.classList.add('hidden');
      openExerciseTargetModal();
    });
    document.querySelectorAll('#themeChoice button').forEach((btn) => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
    document.getElementById('soundToggle').addEventListener('change', (e) => {
      if (window.setTapSoundEnabled) setTapSoundEnabled(e.target.checked);
    });
    document.getElementById('fxCalmToggle').addEventListener('change', (e) => {
      if (window.setFxCalm) setFxCalm(e.target.checked);
    });
    document.getElementById('headerSceneToggle').addEventListener('change', (e) => {
      if (window.setHeaderScene) setHeaderScene(e.target.checked);
    });
    document.getElementById('settingsItemMigrate').addEventListener('click', runDbMigration);
  }
  refreshThemeChoice();
  refreshMigrateItem();
  // タップ音はキャラクターのいるトップ画面だけの設定
  const soundItem = document.getElementById('settingsItemSound');
  soundItem.hidden = !window.tapSoundEnabled;
  if (window.tapSoundEnabled) document.getElementById('soundToggle').checked = tapSoundEnabled();
  // 演出の量とヘッダーの景色も、相棒が歩くトップ画面だけの設定
  document.getElementById('settingsItemFx').hidden = !window.setFxCalm;
  if (window.fxCalm) document.getElementById('fxCalmToggle').checked = fxCalm();
  document.getElementById('settingsItemHeaderScene').hidden = !window.setHeaderScene;
  if (window.headerSceneOn) document.getElementById('headerSceneToggle').checked = headerSceneOn();
  // Web版（ログインあり）: 保存先の設定は要らないので「天気の地域」だけにし、アカウントの項目を出す
  const authMode = !!window.authRequired;
  document.getElementById('settingsItemNotionTitle').textContent = authMode ? '天気の地域' : 'Notion連携と天気の地域';
  document.getElementById('settingsItemNotionDesc').textContent = authMode ? '時計に表示する天気の地域' : '記録の保存先と、天気を表示する地域';
  document.getElementById('settingsItemAccount').hidden = !authMode;
  if (authMode) document.getElementById('settingsItemAccountDesc').textContent = window.authEmail ? `${window.authEmail} ・ ログアウト・削除` : 'ログアウト・アカウントの削除';
  // 着せ替え・ホーム画面の表示・カレンダーはトップ画面でだけ出す
  document.getElementById('settingsItemMascot').hidden = !window.openMascotSettings;
  document.getElementById('settingsItemHome').hidden = !window.openHomeSectionsSettings;
  document.getElementById('settingsItemCalendar').hidden = !window.openCalendarModal;
  overlay.classList.remove('hidden');
}

// 保存形式がページ本文のままの時だけ「データベース形式へ移行」を出す
async function refreshMigrateItem() {
  const item = document.getElementById('settingsItemMigrate');
  if (!item) return;
  try {
    const resp = await fetch('/api/status', { headers: notionHeaders() });
    const data = await resp.json();
    item.hidden = !(resp.ok && data.notionConfigured && data.storage === 'page');
  } catch (e) {
    item.hidden = true;
  }
}

// データベース形式への移行。1回の呼び出しで数日ぶんずつコピーし、
// 残りが無くなるまで繰り返す（カロリー整えと同じ方式）
let migrateRunning = false;
async function runDbMigration() {
  if (migrateRunning) return;
  if (!window.confirm('過去の記録をNotionデータベースにコピーします。元のページ本文はバックアップとして残ります。始めますか？（記録の量によって数分かかります）')) return;
  migrateRunning = true;
  const desc = document.getElementById('migrateDesc');
  let migrated = 0;
  try {
    for (let i = 0; i < 400; i++) {
      desc.textContent = `移行中… ${migrated}日ぶんコピーしました`;
      const resp = await fetch('/api/migrate-db', { method: 'POST', headers: { 'Content-Type': 'application/json', ...notionHeaders() }, body: '{}' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '移行に失敗しました');
      migrated += data.migratedDays;
      if (data.remaining <= 0) break;
    }
    desc.textContent = `完了！ ${migrated}日ぶんの記録をデータベースへ移行しました。表示を更新します…`;
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    desc.textContent = `移行に失敗しました: ${e.message}（もう一度押すと続きから再開します）`;
  } finally {
    migrateRunning = false;
  }
}

// --- ポイントの説明（設定画面から） -----------------------------------------
// 何をするとキャラクターの育成ポイントが何点もらえるか、という一覧。
// 内容そのものはgrowth.js（ステータス画面と共通）にある。
function openPointRulesModal() {
  let overlay = document.getElementById('pointRulesModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'pointRulesModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>ポイントの説明</h3>
        <p class="hs-note">1日の記録でもらえるポイントは、下の内訳を全部合わせて<b>最大100pt（満点）</b>です。</p>
        <div class="point-rules">` +
      gohanPointRules().map((r) => `
          <div class="point-rule-row">
            <span class="pr-label">${escapeHtml(r.label)}</span>
            <span class="pr-detail">${escapeHtml(r.detail)}</span>
            <span class="pr-pts">${escapeHtml(r.pts)}</span>
          </div>`).join('') + `
        </div>
        <p class="hs-note">ポイントはどこにも保存せず、直近1年ぶんの記録から毎回計算し直します。記録が続くとキャラクターのレベルが上がり、姿が変わっていきます（ホーム画面の📊ボタンから、今のレベルと積み上げを見られます）。</p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" id="pointRulesClose">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('pointRulesClose').addEventListener('click', () => overlay.classList.add('hidden'));
  }
  overlay.classList.remove('hidden');
}

// --- 運動の週目標（設定画面から） -------------------------------------------
// 週に何日運動したら「今週の運動」を達成扱いにするか。「今日の運動」のリング・
// 週の運動ボーナス（ポイント）の両方に使う値なので、端末とサーバーに保存して
// どちらの画面でも同じ値になるようにしている（mascot.jsが保存を持つ）。
function openExerciseTargetModal() {
  let overlay = document.getElementById('exerciseTargetModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'exerciseTargetModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>運動の週目標</h3>
        <p class="hs-note">週に何日運動したら「今週の運動」を達成にするか。育成ポイントの週ボーナスにも使います。</p>
        <div class="body-choice" id="exerciseTargetChoice">` +
      [1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" data-days="${n}">${n}</button>`).join('') + `
        </div>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" id="exerciseTargetClose">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('exerciseTargetClose').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.querySelectorAll('#exerciseTargetChoice button').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('#exerciseTargetChoice button').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        saveExerciseWeeklyTarget(Number(btn.dataset.days));
        // 今開いている画面のリング・ポイントの見え方もその場で更新する
        if (window.loadExerciseRing) loadExerciseRing();
        if (window.loadStatus) loadStatus();
        if (typeof loadHistory === 'function') loadHistory();
      });
    });
  }
  const current = window.exerciseWeeklyTarget ? exerciseWeeklyTarget() : 5;
  overlay.querySelectorAll('#exerciseTargetChoice button').forEach((b) => b.classList.toggle('selected', Number(b.dataset.days) === current));
  overlay.classList.remove('hidden');
}

// --- アカウント（Web版） -----------------------------------------------------
// ログアウトと、記録を含めた全部の削除。削除は取り消せないので2段階で確認する
function openAccountModal() {
  let overlay = document.getElementById('accountModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'accountModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>アカウント</h3>
        <p class="hs-note" id="accountEmail"></p>
        <div class="point-rules" id="accountQuota"></div>
        <div class="settings-menu">
          <button type="button" class="settings-menu-item" id="accountLogout">
            <span class="settings-menu-title">ログアウト</span>
            <span class="settings-menu-desc">この端末からログアウトします。記録は残ります</span>
          </button>
          <button type="button" class="settings-menu-item" id="accountDelete">
            <span class="settings-menu-title" style="color:var(--err)">アカウントを削除</span>
            <span class="settings-menu-desc">記録・設定をすべて消します。取り消せません</span>
          </button>
        </div>
        <p class="hs-note" id="accountMsg"></p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" id="accountClose">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('accountClose').addEventListener('click', () => overlay.classList.add('hidden'));
    document.getElementById('accountLogout').addEventListener('click', () => {
      if (window.authSignOut) authSignOut();
    });
    document.getElementById('accountDelete').addEventListener('click', async () => {
      if (!window.confirm('本当にアカウントを削除しますか？\n記録・設定はすべて消え、元に戻せません。')) return;
      if (!window.confirm('最終確認です。削除してよろしいですか？')) return;
      const msg = document.getElementById('accountMsg');
      msg.textContent = '削除しています…';
      try {
        await authDeleteAccount();
      } catch (e) {
        msg.textContent = e.message;
      }
    });
  }
  document.getElementById('accountEmail').textContent = window.authEmail ? `ログイン中: ${window.authEmail}` : '';
  document.getElementById('accountMsg').textContent = '';
  overlay.classList.remove('hidden');
  renderAccountQuota();
}

// プランと、AI機能を今どれだけ使ったか（無料枠の残り）を出す
async function renderAccountQuota() {
  const el = document.getElementById('accountQuota');
  if (!el) return;
  el.innerHTML = '';
  try {
    const resp = await fetch('/api/status', { headers: notionHeaders() });
    const data = await resp.json();
    const q = data.quota;
    if (!q) return;
    const rows = [
      { label: 'プラン', detail: '', pts: q.plan === 'premium' ? 'プレミアム' : '無料' },
      { label: '音声入力', detail: '今月', pts: q.voice.limit === null ? `${q.voice.used}回（上限なし）` : `${q.voice.used} / ${q.voice.limit}回` },
      { label: 'ふりかえり', detail: '今週', pts: q.review.limit === null ? `${q.review.used}回（上限なし）` : `${q.review.used} / ${q.review.limit}回` },
    ];
    el.innerHTML = rows.map((r) => `<div class="point-rule-row"><span class="pr-label">${escapeHtml(r.label)}</span>`
      + `<span class="pr-detail">${escapeHtml(r.detail)}</span><span class="pr-pts">${escapeHtml(r.pts)}</span></div>`).join('');
  } catch (e) {
    // 出せなくても致命的ではない
  }
}

// --- からだの設定（身長・体重など） -----------------------------------------
// ここで入れた値から「1日の目安カロリー」を計算して、記録の合計カロリーの
// 横に出す。値はこの端末にだけ保存し、サーバーにもNotionにも送らない。
function openBodySettings() {
  let overlay = document.getElementById('bodyModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'bodyModal';
    overlay.innerHTML = `
      <div class="modal-panel">
        <h3>からだの設定</h3>
        <p class="hs-note">1日の目安カロリーを計算するために使います。入力した値はこの端末にだけ保存され、記録としては送られません。分かるところだけでも大丈夫です。</p>
        <label>性別</label>
        <div class="body-choice" id="bodySex">
          <button type="button" data-sex="male">男性</button>
          <button type="button" data-sex="female">女性</button>
        </div>
        <label>年齢</label>
        <div class="field-row"><input type="number" id="bodyAge" inputmode="numeric" min="1" max="120" placeholder="例）35" /><span class="body-unit">歳</span></div>
        <label>身長</label>
        <div class="field-row"><input type="number" id="bodyHeight" inputmode="decimal" min="80" max="250" step="0.1" placeholder="例）172" /><span class="body-unit">cm</span></div>
        <label>体重</label>
        <div class="field-row"><input type="number" id="bodyWeight" inputmode="decimal" min="20" max="300" step="0.1" placeholder="例）65" /><span class="body-unit">kg</span></div>
        <label>ふだんの活動量</label>
        <div class="body-choice" id="bodyActivity">` +
      Object.entries(BODY_ACTIVITY).map(([key, a]) =>
        `<button type="button" data-activity="${key}">${a.label}</button>`).join('') + `
        </div>
        <div class="body-result" id="bodyResult"></div>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" id="bodyClose">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('bodyClose').addEventListener('click', () => overlay.classList.add('hidden'));
    // 触るたびに保存して、その場で目安カロリーを出し直す
    overlay.querySelectorAll('#bodySex button, #bodyActivity button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        saveBodySettingsFromForm();
      });
    });
    ['bodyAge', 'bodyHeight', 'bodyWeight'].forEach((id) => {
      document.getElementById(id).addEventListener('input', saveBodySettingsFromForm);
    });
  }

  const p = bodyProfile();
  overlay.querySelectorAll('#bodySex button').forEach((b) => b.classList.toggle('selected', b.dataset.sex === p.sex));
  overlay.querySelectorAll('#bodyActivity button').forEach((b) => b.classList.toggle('selected', b.dataset.activity === p.activity));
  document.getElementById('bodyAge').value = p.age || '';
  document.getElementById('bodyHeight').value = p.height || '';
  document.getElementById('bodyWeight').value = p.weight || '';
  renderBodyResult();
  overlay.classList.remove('hidden');
}

function saveBodySettingsFromForm() {
  const picked = (sel) => {
    const el = document.querySelector(`${sel} button.selected`);
    return el ? el.dataset : {};
  };
  saveBodyProfile({
    sex: picked('#bodySex').sex || 'male',
    activity: picked('#bodyActivity').activity || 'normal',
    age: Number(document.getElementById('bodyAge').value) || null,
    height: Number(document.getElementById('bodyHeight').value) || null,
    weight: Number(document.getElementById('bodyWeight').value) || null,
  });
  renderBodyResult();
  // 記録一覧に出している「目安」も新しい値にする
  if (typeof loadHistory === 'function') loadHistory();
}

function renderBodyResult() {
  const el = document.getElementById('bodyResult');
  if (!el) return;
  const p = bodyProfile();
  const target = bodyTargetKcal(p);
  const bmi = bodyBmi(p);
  const bmr = bodyBmr(p);
  el.innerHTML =
    `<div class="body-result-main">1日の目安 <b>${target.kcal.toLocaleString('ja-JP')}kcal</b></div>` +
    (bmi ? `<div class="body-result-sub">BMI ${bmi.value}（${bmi.label}）${bmr ? ` ・ 基礎代謝 ${bmr.toLocaleString('ja-JP')}kcal` : ''}</div>` : '') +
    `<div class="body-result-sub">${escapeHtml(target.note)}</div>`;
}

function injectNotionSettingsButton() {
  const header = document.querySelector('.page-header');
  if (!header || document.getElementById('notionSettingsBtn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'notionSettingsBtn';
  btn.className = 'icon-btn-circle';
  btn.setAttribute('aria-label', '設定');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  btn.addEventListener('click', openSettingsMenu);

  // index.html・history.htmlどちらも.page-headerはjustify-content: space-between
  // の2要素前提のレイアウトなので、既存の右側の要素と一緒にまとめて包み、
  // 3つに分かれて間延びしないようにする。並びの入れ替え（ホーム画面だけ
  // ステータスボタンを先に出す）は、ここでは触らずCSSのorderで行う
  // （history.htmlの「記録に戻る」リンクの並びは変えたくないため）。
  const lastChild = header.lastElementChild;
  if (lastChild) {
    const wrap = document.createElement('div');
    wrap.className = 'header-actions';
    header.insertBefore(wrap, lastChild);
    wrap.appendChild(btn);
    wrap.appendChild(lastChild);
  } else {
    header.appendChild(btn);
  }
}

// 初回アクセス時など、Notionが未設定（サーバーの既定値も無い）の場合は
// 設定を促す（自分専用デプロイでは既にサーバー側が設定済みなので出ない）
async function checkNotionSetupNeeded() {
  injectNotionSettingsButton();
  try {
    const resp = await fetch('/api/status', { headers: notionHeaders() });
    const data = await resp.json();
    // Web版（ログインあり）かどうかを画面全体で共有する（設定メニューの出し分けに使う）
    window.authRequired = !!data.authRequired;
    window.authEmail = data.email || '';
    // 記録ボタンの下の一言を、実際の保存先に合わせる
    // （Web版はNotionもObsidianも使わないので、その名前を出さない）
    const hint = document.getElementById('saveHint');
    if (hint) {
      if (data.authRequired) hint.textContent = '記録はあなたのアカウントに保存され、スマホでもPCでも同じ内容が見られます';
      else if (data.obsidianConfigured) hint.textContent = 'Obsidian と Notion の両方に自動で追記されます';
      else hint.textContent = 'Notion に自動で追記されます';
    }
    if (!data.notionConfigured && !data.authRequired) openNotionSettingsModal();
  } catch (e) {
    // ステータス取得に失敗しても致命的ではないので何もしない
  }
}
checkNotionSetupNeeded();

// --- 入力欄の自動リサイズ（トップ画面の内容欄・品目欄と、編集シートの品目欄で共通） ---
// .auto-grow を付けた欄は、改行して行が増えるたびにその行数ぶん背が伸びる。
// 10行ぶんで止め、そこから先は欄の中でスクロールさせる。
const AUTO_GROW_MAX_HEIGHT = 268; // 10行ぶん（1行24px × 10 ＋ 上下の余白26px ＋ 枠線2px）
function autoGrowTextarea(ta) {
  if (!ta) return;
  // 表示されていない欄（別カテゴリのフォーム・閉じているシート）は高さを測れない
  // （scrollHeightが0になる）ので、表示された時に測り直す
  if (!ta.offsetParent && !ta.offsetHeight) return;
  // 空の時は、書き方の見本（プレースホルダー）が切れない高さにする。
  // 見本を実際に値として入れてから測るのが要点。空のままだと、ブラウザに
  // よってはプレースホルダーのぶんの高さを返さず（iOS Safariは1行ぶんしか
  // 返さない）、折り返して2行になる見本がはみ出して下が詰まって見える。
  // 改行を含む見本だけでなく、折り返して複数行になる見本もあるため、
  // 空の時は常にこの方法で測る。
  // プログラムからの代入では input は飛ばず、同じ処理の中で元に戻すので
  // 画面がちらつくこともない
  const placeholder = ta.placeholder || '';
  const measuringPlaceholder = !ta.value && !!placeholder;
  if (measuringPlaceholder) ta.value = placeholder;
  // いったん高さを空にしてからscrollHeightを読むと、行が減った時にも縮む。
  // box-sizing: border-box なので、scrollHeightに上下の枠線ぶん(2px)を足す
  ta.style.height = 'auto';
  const needed = ta.scrollHeight + 2;
  if (measuringPlaceholder) ta.value = '';
  ta.style.height = `${Math.min(needed, AUTO_GROW_MAX_HEIGHT)}px`;
  ta.style.overflowY = needed > AUTO_GROW_MAX_HEIGHT ? 'auto' : 'hidden';
}
window.autoGrowTextarea = autoGrowTextarea;

document.querySelectorAll('textarea.auto-grow').forEach((ta) => {
  ta.addEventListener('input', () => autoGrowTextarea(ta));
  autoGrowTextarea(ta);
});

// キーボードの改行（Enter）キーによる「暗黙のフォーム送信」を止める。
// このアプリのフォームにはactionが無いため、iOSで改行キーを押すと同じページへの
// GET送信＝ページの再読み込みが起きてしまう。フォームがリセットされて記録された
// ように見えるのに、実際には何も保存されない。記録・保存は必ずボタンから行うので、
// フォーム自体の送信はすべて無効にする（メモ等のtextarea内の改行は影響を受けない）。
document.querySelectorAll('form').forEach((form) => {
  form.addEventListener('submit', (event) => event.preventDefault());
});
