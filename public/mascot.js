// マスコットの定義と着せ替え。
// 10種類のドット絵キャラクターから選べて、名前も自由に付けられる。
// 選択はこの端末のlocalStorageに保存する（Notion設定と同じ方針）。
//
// スプライトは12x12のドット絵。viewBoxは上に2行ぶん余白を取ってあり
// （"0 -2 12 14"）、王冠は頭の上のその余白に描く。
// レベル演出のクラス（gohan-stage-*）はどのキャラクターでも共通（節目はgrowth.jsの
// GOHAN_DECO_STAGESが持つ。現在: Lv3 ほっぺ / Lv8 王冠 / Lv14 きらきら / Lv20 金のオーラ）:
//   ほっぺ（gohan-deco-cheeks） / 王冠（gohan-deco-ume） /
//   きらきら（gohan-deco-nori） / 金のオーラ（CSS側のfilter）

const MASCOT_CHARS = [
  {
    id: 'gohan', name: 'ごはんくん',
    difficulty: 'normal', tone: 'normal', bio: 'バランス型の相棒',
    colors: { W: '#f4f1e8', B: '#4a8fd9', E: '#1b2b3d', m: '#1b2b3d' },
    cheeks: [[1, 6], [10, 6]], crown: { cx: 5, topY: 0 },
    map: [
      '...WWWWWW...',
      '..WWWWWWWW..',
      '.WWWWWWWWWW.',
      '.WWWWWWWWWW.',
      'BBBBBBBBBBBB',
      '.BBEBBBBEBB.',
      '.BBBBmmBBBB.',
      '.BBBBBBBBBB.',
      '..BBBBBBBB..',
      '...BBBBBB...',
      '....B..B....',
      '....B..B....',
    ],
  },
  {
    id: 'onigiri', name: 'おにぎりくん',
    difficulty: 'normal', tone: 'gentle', bio: 'おだやかに寄り添う相棒',
    colors: { W: '#f4f1e8', N: '#243324', E: '#2c2c2e', m: '#2c2c2e' },
    cheeks: [[2, 7], [9, 7]], crown: { cx: 5, topY: 0 },
    map: [
      '.....WW.....',
      '....WWWW....',
      '...WWWWWW...',
      '...WWWWWW...',
      '..WWWWWWWW..',
      '..WEWWWWEW..',
      '.WWWWmmWWWW.',
      '.WWWWWWWWWW.',
      'WWWWWWWWWWWW',
      'WWWNNNNNNWWW',
      '.WWNNNNNNWW.',
      '..WW....WW..',
    ],
  },
  {
    id: 'honoo', name: 'ほのおくん',
    difficulty: 'hard', tone: 'strict', bio: '熱血で引っぱる相棒',
    colors: { F: '#ff3b30', Y: '#ffcc00', E: '#5a2400', m: '#5a2400' },
    cheeks: [[3, 9], [8, 9]], crown: { cx: 5, topY: 0 },
    map: [
      '.....F......',
      '....FF......',
      '....FFF..F..',
      '...FFFFF.F..',
      '..FFFFFFFF..',
      '..FFFFFFFF..',
      '.FFFYYYYFF..',
      '.FFYYYYYYF..',
      '.FFYEYYEYFF.',
      '.FFYYmmYYF..',
      '..FFYYYYFF..',
      '...FF..FF...',
    ],
  },
  {
    id: 'kumo', name: 'くもくん',
    difficulty: 'easy', tone: 'sweet', bio: 'ゆるふわ癒やしの相棒',
    colors: { C: '#dfe6f5', E: '#3a3a3c', m: '#3a3a3c' },
    cheeks: [[1, 6], [10, 6]], crown: { cx: 5, topY: 1 },
    map: [
      '............',
      '....CCCC....',
      '..CCCCCCCC..',
      '.CCCCCCCCCC.',
      'CCCCCCCCCCCC',
      'CCECCCCCCECC',
      'CCCCCmmCCCCC',
      'CCCCCCCCCCCC',
      '.CCCCCCCCCC.',
      '..CC..CC....',
      '............',
      '............',
    ],
  },
  {
    id: 'mochi', name: 'もちくん',
    difficulty: 'easy', tone: 'sweet', bio: 'とことん甘やかす相棒',
    colors: { M: '#fdf6ee', E: '#2c2c2e', m: '#2c2c2e' },
    cheeks: [[2, 6], [9, 6]], crown: { cx: 5, topY: 1 },
    map: [
      '............',
      '...MMMMMM...',
      '..MMMMMMMM..',
      '.MMMMMMMMMM.',
      '.MMEMMMMEMM.',
      'MMMMMMMMMMMM',
      'MMMMMmmMMMMM',
      'MMMMMMMMMMMM',
      '.MMMMMMMMMM.',
      '..MM.MM.MM..',
      '............',
      '............',
    ],
  },
  {
    id: 'tamago', name: 'たまごくん',
    difficulty: 'easy', tone: 'gentle', bio: 'やさしく見守る相棒',
    colors: { W: '#fbf7f0', Y: '#ffc93c', E: '#7a4a00', m: '#7a4a00' },
    cheeks: [[1, 6], [10, 6]], crown: { cx: 5, topY: 1 },
    map: [
      '............',
      '..WWWWWW....',
      '.WWWWWWWWW..',
      'WWWWWWWWWWW.',
      'WWWYYYYYWWW.',
      'WWYYEYYEYWWW',
      'WWYYYmmYYWW.',
      '.WWYYYYYWWW.',
      '..WWWWWWWW..',
      '...WW..WW...',
      '............',
      '............',
    ],
  },
  {
    id: 'pan', name: 'パンくん',
    difficulty: 'normal', tone: 'gentle', bio: 'ほんわか励ます相棒',
    colors: { B: '#b97f4b', C: '#f2dcae', E: '#5a3a1a', m: '#5a3a1a' },
    cheeks: [[2, 6], [9, 6]], crown: { cx: 5, topY: 1 },
    map: [
      '............',
      '.BBBBBBBBBB.',
      'BBCCCCCCCCBB',
      'BCCCCCCCCCCB',
      'BCCCCCCCCCCB',
      'BCCECCCCECCB',
      'BCCCCmmCCCCB',
      'BCCCCCCCCCCB',
      '.BBBBBBBBBB.',
      '...B....B...',
      '...B....B...',
      '............',
    ],
  },
  {
    id: 'ringo', name: 'りんごちゃん',
    difficulty: 'normal', tone: 'normal', bio: 'まっすぐ励ます相棒',
    colors: { R: '#ff5a4e', L: '#57b25a', E: '#4a1410', m: '#4a1410' },
    cheeks: [[1, 6], [10, 6]], crown: { cx: 7, topY: 2 },
    map: [
      '.....L......',
      '....LL......',
      '...RRRRRR...',
      '..RRRRRRRR..',
      '.RRRRRRRRRR.',
      '.RRERRRRERR.',
      'RRRRRmmRRRRR',
      '.RRRRRRRRRR.',
      '..RRRRRRRR..',
      '...RRRRRR...',
      '....R..R....',
      '............',
    ],
  },
  {
    id: 'ocha', name: 'おちゃくん',
    difficulty: 'normal', tone: 'normal', bio: '落ち着いて支える相棒',
    colors: { G: '#6cb04a', C: '#f1efe9', E: '#2f3b2a', m: '#2f3b2a' },
    cheeks: [[2, 6], [9, 6]], crown: { cx: 5, topY: 1 },
    map: [
      '............',
      '..GGGGGGGG..',
      '.GGGGGGGGGG.',
      '.CCCCCCCCCC.',
      '.CCECCCCECC.',
      '.CCCCCCCCCC.',
      '.CCCCmmCCCC.',
      '.CCCCCCCCCC.',
      '..CCCCCCCC..',
      '...CCCCCC...',
      '....C..C....',
      '............',
    ],
  },
  {
    id: 'protein', name: 'プロテインくん',
    difficulty: 'extreme', tone: 'strict', bio: 'ストイックな相棒',
    colors: { L: '#e4574f', P: '#e9edf3', D: '#c9a06a', E: '#2c3440', m: '#2c3440' },
    cheeks: [[2, 5], [9, 5]], crown: { cx: 5, topY: 0 },
    map: [
      '....LLLL....',
      '...LLLLLL...',
      '..PPPPPPPP..',
      '..PPPPPPPP..',
      '..PEPPPPEP..',
      '..PPPmmPPP..',
      '..PPPPPPPP..',
      '..PDDDDDDP..',
      '..PDDDDDDP..',
      '..PPPPPPPP..',
      '...P....P...',
      '...P....P...',
    ],
  },
  {
    id: 'danberu', name: 'ダンベルくん',
    difficulty: 'oni', tone: 'oni', bio: '熱血鬼コーチの相棒',
    colors: { D: '#6d6d72', G: '#b9bdc6', E: '#2c2c2e', m: '#2c2c2e' },
    cheeks: [[3, 5], [8, 5]], crown: { cx: 5, topY: 3 },
    map: [
      '.DD......DD.',
      '.DD......DD.',
      'DDD......DDD',
      'DDDGGGGGGDDD',
      'DDDGEGGEGDDD',
      'DDDGGmmGGDDD',
      'DDDGGGGGGDDD',
      'DDD......DDD',
      '.DD......DD.',
      '.DD......DD.',
      '....G..G....',
      '............',
    ],
  },
  {
    id: 'burokkori', name: 'ブロッコリーくん',
    difficulty: 'hard', tone: 'strict', bio: '健康ガチ勢の相棒',
    colors: { G: '#3f9a4d', S: '#bfd98a', E: '#173d1c', m: '#173d1c' },
    cheeks: [[2, 4], [9, 4]], crown: { cx: 5, topY: 0 },
    map: [
      '...GGGGGG...',
      '..GGGGGGGG..',
      '.GGGGGGGGGG.',
      '.GGEGGGGEGG.',
      '.GGGGmmGGGG.',
      '..GGGGGGGG..',
      '....SSSS....',
      '....SSSS....',
      '....S..S....',
      '............',
      '............',
      '............',
    ],
  },
];

// 難易度（相棒の性格のきびしさを表す目安。マックスは星5。レベルには影響しない）の表示用ラベルと星
const MASCOT_DIFFICULTY = {
  easy: { label: 'やさしい', stars: '★' },
  normal: { label: 'ふつう', stars: '★★' },
  hard: { label: 'きびしい', stars: '★★★' },
  extreme: { label: '激きびしい', stars: '★★★★' },
  oni: { label: '鬼', stars: '★★★★★' },
};
const MASCOT_TONE_LABELS = { oni: '超スパルタ', strict: 'スパルタ', normal: 'ふつう', gentle: 'やさしい', sweet: '超やさしい' };

const MASCOT_STORAGE_KEY = 'mascotSettings';

function mascotLoadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(MASCOT_STORAGE_KEY) || '{}');
    return { char: raw.char || 'gohan', name: raw.name || '' };
  } catch (e) {
    return { char: 'gohan', name: '' };
  }
}

function mascotSaveSettings(settings) {
  try { localStorage.setItem(MASCOT_STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* 保存できなくても表示は変わる */ }
}

// 端末をまたぐ小さな設定（キャラクター・運動の週目標など）をサーバーに保存する
// 共通口。送れなくても、この端末の表示はlocalStorageの値で成立する
async function pushSettingsToServer(patch) {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(typeof notionHeaders === 'function' ? notionHeaders() : {}) },
      body: JSON.stringify(patch),
    });
  } catch (e) { /* オフライン等。次に保存できた時に上書きされる */ }
}

// 選んだキャラクターをサーバーにも保存し、他の端末でも同じキャラで開けるようにする
function mascotPushToServer(settings) {
  pushSettingsToServer({ mascot: settings });
}

// --- 運動の週目標（週に何日運動したら達成扱いにするか） -----------------------
const EXERCISE_TARGET_KEY = 'exerciseTargetSetting';
const EXERCISE_TARGET_DEFAULT = 5;

function exerciseWeeklyTarget() {
  try {
    const v = Number(localStorage.getItem(EXERCISE_TARGET_KEY));
    return v >= 1 && v <= 7 ? v : EXERCISE_TARGET_DEFAULT;
  } catch (e) {
    return EXERCISE_TARGET_DEFAULT;
  }
}

function saveExerciseWeeklyTarget(days) {
  const v = Math.min(7, Math.max(1, Number(days) || EXERCISE_TARGET_DEFAULT));
  try { localStorage.setItem(EXERCISE_TARGET_KEY, String(v)); } catch (e) { /* 保存できなくても表示は変わる */ }
  pushSettingsToServer({ exerciseTarget: v });
  return v;
}

// 起動時に、サーバー側の設定と端末の設定を照らし合わせる。サーバーの方が
// 新しければ（別の端末で選び直していたら）、この端末の表示も合わせ直す
async function mascotSyncFromServer() {
  try {
    const resp = await fetch('/api/settings', { headers: typeof notionHeaders === 'function' ? notionHeaders() : {} });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data) return;
    if (data.mascot && data.mascot.char) {
      const current = mascotLoadSettings();
      if (data.mascot.char !== current.char || (data.mascot.name || '') !== current.name) {
        mascotSaveSettings({ char: data.mascot.char, name: data.mascot.name || '' });
        mascotRenderAll();
        if (window.regenerateDailyReview) regenerateDailyReview();
      }
    }
    if (data.exerciseTarget && data.exerciseTarget !== exerciseWeeklyTarget()) {
      try { localStorage.setItem(EXERCISE_TARGET_KEY, String(data.exerciseTarget)); } catch (e) { /* 保存できなくても表示は変わる */ }
      if (window.loadExerciseRing) loadExerciseRing();
    }
  } catch (e) { /* オフライン等。端末に保存済みの設定で表示を続ける */ }
}

function mascotCurrentChar() {
  const s = mascotLoadSettings();
  return MASCOT_CHARS.find((c) => c.id === s.char) || MASCOT_CHARS[0];
}

// 選択中キャラの性格（難易度・口調）。育成のレベル計算とふりかえりの口調が変わる
function mascotProfile() {
  const c = mascotCurrentChar();
  return { difficulty: c.difficulty || 'normal', tone: c.tone || 'normal', bio: c.bio || '' };
}

// 表示名（未設定ならキャラクターの既定名）
function mascotName() {
  const s = mascotLoadSettings();
  return s.name.trim() || mascotCurrentChar().name;
}

// キャラクター定義からSVG文字列を作る（行ごとに同じ色の連続をまとめる）
function mascotSvg(char) {
  const rects = [];
  char.map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      const color = char.colors[ch];
      const x0 = x;
      while (x < row.length && row[x] !== '.' && char.colors[row[x]] === color) x++;
      rects.push(`<rect x="${x0}" y="${y}" width="${x - x0}" height="1" fill="${color}"/>`);
    }
  });
  // レベルで増える飾り（既定は非表示。CSSのgohan-stage-*で出す）
  const cheeks = char.cheeks.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#f79bb1"/>`).join('');
  const { cx, topY } = char.crown;
  const crown =
    `<rect x="${cx - 1}" y="${topY - 1}" width="3" height="1" fill="#ffd60a"/>` +
    `<rect x="${cx - 1}" y="${topY - 2}" width="1" height="1" fill="#ffd60a"/>` +
    `<rect x="${cx + 1}" y="${topY - 2}" width="1" height="1" fill="#ffd60a"/>`;
  const sparkle = '<rect x="0" y="0" width="1" height="1" fill="#ffd60a"/><rect x="11" y="3" width="1" height="1" fill="#ffd60a"/>';
  return `<svg class="gohan-kun" viewBox="0 -2 12 14" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}` +
    `<g class="gohan-deco gohan-deco-cheeks">${cheeks}</g>` +
    `<g class="gohan-deco gohan-deco-ume">${crown}</g>` +
    `<g class="gohan-deco gohan-deco-nori">${sparkle}</g></svg>`;
}

// ヘッダー・ふりかえりカード・ステータス画面のキャラクターを、
// 選択中のものに描き替える
function mascotRenderAll() {
  const char = mascotCurrentChar();
  document.querySelectorAll('.app-icon .gohan-kun, .review-avatar .gohan-kun, .status-avatar .gohan-kun, .chat-intro-avatar .gohan-kun').forEach((el) => {
    el.outerHTML = mascotSvg(char);
  });
  // レベルの飾り・眠そう状態などを付け直す（index.html側で定義される）
  if (typeof applyGohanVisualState === 'function') applyGohanVisualState();
}

// --- 着せ替えモーダル -----------------------------------------------------
function buildMascotModal() {
  if (document.getElementById('mascotModal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.id = 'mascotModal';
  overlay.innerHTML = `
    <div class="modal-panel">
      <h3>キャラクター設定</h3>
      <div class="mascot-status" id="mascotStatus" hidden></div>
      <label>キャラクター</label>
      <div class="mascot-grid" id="mascotGrid"></div>
      <label>名前（空欄ならキャラクターの名前になります）</label>
      <input type="text" id="mascotNameInput" maxlength="12" autocomplete="off" />
      <div class="modal-actions">
        <button type="button" class="cancel-btn" id="mascotCancel">キャンセル</button>
        <button type="button" class="save-btn" id="mascotSave">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  document.getElementById('mascotCancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('mascotSave').addEventListener('click', () => {
    const picked = overlay.querySelector('.mascot-cell.selected');
    const settings = {
      char: picked ? picked.dataset.char : 'gohan',
      name: document.getElementById('mascotNameInput').value.trim(),
    };
    mascotSaveSettings(settings);
    mascotPushToServer(settings);
    overlay.classList.add('hidden');
    mascotRenderAll();
    // ふりかえりの口調はキャラの性格に従うので、新しいキャラの口調で書き直す
    if (window.regenerateDailyReview) regenerateDailyReview();
  });
}

function openMascotSettings() {
  buildMascotModal();
  const overlay = document.getElementById('mascotModal');
  const grid = document.getElementById('mascotGrid');
  const nameInput = document.getElementById('mascotNameInput');
  const settings = mascotLoadSettings();
  grid.textContent = '';
  MASCOT_CHARS.forEach((char) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'mascot-cell' + (char.id === settings.char ? ' selected' : '');
    cell.dataset.char = char.id;
    const diff = MASCOT_DIFFICULTY[char.difficulty || 'normal'];
    cell.innerHTML = `${mascotSvg(char)}<span class="mascot-cell-name">${char.name}</span>` +
      `<span class="mascot-cell-meta">難易度${diff.stars}・${MASCOT_TONE_LABELS[char.tone || 'normal']}</span>`;
    cell.addEventListener('click', () => {
      grid.querySelectorAll('.mascot-cell').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      nameInput.placeholder = char.name;
    });
    grid.appendChild(cell);
  });
  nameInput.value = settings.name;
  nameInput.placeholder = mascotCurrentChar().name;
  renderMascotStatus();
  overlay.classList.remove('hidden');
}

// いまの育成の様子（レベル・ポイント・次のレベルまで）を設定画面に出す。
// 以前はキャラクターをタップした時の吹き出しに出していたが、画面を覆って
// せっかくの動きが見えないため、設定画面に移した。
// gohanStateはトップ画面（index.html）が持つので、履歴画面では何も出さない。
function renderMascotStatus() {
  const el = document.getElementById('mascotStatus');
  if (!el) return;
  const st = window.gohanGrowthState ? window.gohanGrowthState() : null;
  if (!st) { el.hidden = true; return; }
  const need = Math.max(0, st.nextAt - st.total);
  const name = mascotName().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const diff = MASCOT_DIFFICULTY[mascotProfile().difficulty];
  el.innerHTML =
    `<b>${name} Lv.${st.level}</b>` +
    `<span class="mascot-status-sub">${st.total}pt・今日 +${st.todayPts}pt${diff ? '・難易度' + diff.stars : ''}</span>` +
    `<span class="mascot-status-sub">${st.sleepy ? 'ちょっと眠そう…記録を再開すると元気になるよ' : `次のレベルまで あと${need}pt`}</span>`;
  el.hidden = false;
}

// 設定メニュー（history.js）から呼べるように公開する
window.openMascotSettings = openMascotSettings;
window.mascotName = mascotName;
window.mascotProfile = mascotProfile;
window.MASCOT_DIFFICULTY = MASCOT_DIFFICULTY;
window.exerciseWeeklyTarget = exerciseWeeklyTarget;
window.saveExerciseWeeklyTarget = saveExerciseWeeklyTarget;

// 読み込み時に、保存されているキャラクターで描き替えておく（まずは端末の値で
// 即座に表示し、サーバー側の設定が違えば追って合わせ直す）
document.addEventListener('DOMContentLoaded', () => {
  mascotRenderAll();
  mascotSyncFromServer();
});
