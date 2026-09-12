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

// --- 設定を端末の外にも残す ---------------------------------------------
// もともと設定はこの端末のlocalStorageにしか無く、ホーム画面のアプリを入れ直すと
// まとめて消えていた。実際に、選んでいたキャラクターが既定の「ごはんくん」に戻り、
// からだの設定（＝摂取kcalの目安）も初期値に戻ってしまった。
// キャラクターだけはサーバーに保存する口があったが、「サーバーにまだ無い時に
// この端末の値を上げておく」処理が無かったため、アプリの中で選び直していない限り
// サーバーには一度も入らず、消えたら取り戻せなかった。
//
// ここでは2つを足す:
//   1. 種まき … サーバーに無く、この端末に値がある設定は、起動時に上げておく
//   2. 取り戻し … この端末に無く、サーバーにある設定は、起動時に書き戻す
// 「この端末にある値」を勝手に上書きはしない。押し負けて設定が戻るのを防ぐため
// （それこそ今回困ったことなので）。

// localStorageの中身をそのまま預ける設定。端末をまたいで残したいものだけ。
// 入れないもの: 未送信キュー・チャット履歴・ゲームの記録など、その端末限りのもの
const SYNCED_LOCAL_KEYS = [
  'bodyProfile',               // 身長・体重・目標（摂取kcalの目安のもと）
  'homeSections',              // ホーム画面に出す項目
  'themeSetting',              // ブラック / ホワイト
  'fontLarge',                 // 文字を大きめに
  'tapSound',                  // 効果音
  'fxLevel',                   // 演出をひかえめに
  'headerScene',               // ヘッダーの景色
  'lifelog-quote-favorites',   // 格言のお気に入り
  'lifelog-quote-pinned',      // 固定した格言
];

// 直近にサーバーから受け取った内容。1項目だけ変えた時に、他の項目を
// 消してしまわないよう、ここへ重ねてから丸ごと送る
let serverLocalMirror = {};

function localSettingsSnapshot(keys) {
  const out = {};
  keys.forEach((k) => {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    } catch (e) { /* 読めない端末では何も預けない */ }
  });
  return out;
}

// 書き戻した設定を画面に効かせる。項目ごとに反映処理を呼び分けると抜けが出るので、
// 一度だけ読み込み直す（入れ直した直後の一回だけ起きる）
const SETTINGS_RESTORED_KEY = 'settingsRestoredAt';
function reloadOnceAfterRestore() {
  try {
    const at = Number(sessionStorage.getItem(SETTINGS_RESTORED_KEY) || 0);
    if (at && Date.now() - at < 60 * 1000) return; // 繰り返さない
    sessionStorage.setItem(SETTINGS_RESTORED_KEY, String(Date.now()));
  } catch (e) { /* 使えなくても読み込み直す */ }
  location.reload();
}

// 起動時に、サーバー側の設定と端末の設定を照らし合わせる。サーバーの方が
// 新しければ（別の端末で選び直していたら）、この端末の表示も合わせ直す
async function mascotSyncFromServer() {
  try {
    const resp = await fetch('/api/settings', { headers: typeof notionHeaders === 'function' ? notionHeaders() : {} });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data) return;
    const seed = {};
    if (data.mascot && data.mascot.char) {
      const current = mascotLoadSettings();
      if (data.mascot.char !== current.char || (data.mascot.name || '') !== current.name) {
        mascotSaveSettings({ char: data.mascot.char, name: data.mascot.name || '' });
        mascotRenderAll();
        if (window.regenerateDailyReview) regenerateDailyReview();
      }
    } else {
      // サーバーにまだ無い。この端末で選んである時だけ上げておく。
      // 既定のままの端末が上げると、他の端末の選択を上書きしてしまうため
      const current = mascotLoadSettings();
      if (current.char !== 'gohan' || current.name) seed.mascot = current;
    }
    if (data.exerciseTarget && data.exerciseTarget !== exerciseWeeklyTarget()) {
      try { localStorage.setItem(EXERCISE_TARGET_KEY, String(data.exerciseTarget)); } catch (e) { /* 保存できなくても表示は変わる */ }
      if (window.loadExerciseRing) loadExerciseRing();
    } else if (!data.exerciseTarget) {
      const v = exerciseWeeklyTarget();
      if (v !== EXERCISE_TARGET_DEFAULT) seed.exerciseTarget = v;
    }

    // その他の設定（localStorageの中身をそのまま預けているもの）
    const mirror = (data && data.local) || {};
    serverLocalMirror = { ...mirror };
    const localSeed = {};
    let restored = 0;
    SYNCED_LOCAL_KEYS.forEach((k) => {
      let mine = null;
      try { mine = localStorage.getItem(k); } catch (e) { return; }
      const theirs = Object.prototype.hasOwnProperty.call(mirror, k) ? mirror[k] : null;
      if (mine !== null && theirs !== mine) {
        localSeed[k] = mine; // この端末の値を正とし、サーバーにも置いておく
      } else if (mine === null && typeof theirs === 'string') {
        try { localStorage.setItem(k, theirs); restored += 1; } catch (e) { /* 書けなければあきらめる */ }
      }
    });
    if (Object.keys(localSeed).length) {
      serverLocalMirror = { ...mirror, ...localSeed };
      seed.local = serverLocalMirror;
    }
    if (Object.keys(seed).length) pushSettingsToServer(seed);
    if (restored) reloadOnceAfterRestore();
  } catch (e) { /* オフライン等。端末に保存済みの設定で表示を続ける */ }
}

// 設定を変えた時に呼ぶ。変えた直後にサーバーへも置いておく
function syncLocalSetting(key) {
  if (!SYNCED_LOCAL_KEYS.includes(key)) return;
  let value = null;
  try { value = localStorage.getItem(key); } catch (e) { return; }
  const next = { ...serverLocalMirror };
  // 端末側で消した設定は、預けている方からも消す（消したのに戻ってこないように）
  if (value === null) delete next[key]; else next[key] = value;
  serverLocalMirror = next;
  pushSettingsToServer({ local: serverLocalMirror });
}
window.syncLocalSetting = syncLocalSetting;

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
// 直前に描いたキャラクター。着せ替えで「別のキャラに変わった」時だけ演出を出すために持つ
let mascotRenderedChar = null;

function mascotRenderAll(opts = {}) {
  const char = mascotCurrentChar();
  const selector = '.app-icon .gohan-kun, .review-avatar .gohan-kun, .status-avatar .gohan-kun, .chat-intro-avatar .gohan-kun';
  const swap = () => {
    document.querySelectorAll(selector).forEach((el) => {
      el.outerHTML = mascotSvg(char);
    });
    // レベルの飾り・眠そう状態などを付け直す（index.html側で定義される）
    if (typeof applyGohanVisualState === 'function') applyGohanVisualState();
  };
  const prevId = mascotRenderedChar;
  const changed = prevId !== null && prevId !== char.id;
  mascotRenderedChar = char.id;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!opts.animate || !changed || reduce) { swap(); return; }
  // 相棒同士のバトンタッチ。前の相棒と新しい相棒が並んでバトンを渡し、
  // 前の相棒は走り去り、新しい相棒が跳んで喜ぶ。途中で画面の相棒も差し替わる
  const prev = MASCOT_CHARS.find((c) => c.id === prevId) || MASCOT_CHARS[0];
  const oldSvg = document.querySelector(selector);
  mascotBatonPass(prev, char, oldSvg, () => {
    swap();
    const fresh = [...document.querySelectorAll(selector)];
    fresh.forEach((el) => el.classList.add('mascot-swap-in'));
    setTimeout(() => fresh.forEach((el) => el.classList.remove('mascot-swap-in')), 700);
  });
}

// バトンタッチの演出（約2.8秒）。画面の上に小さなステージを重ねて見せる。
// 触ると飛ばせる。onSwap は途中（バトンを渡した後）で1回だけ呼ぶ
function mascotBatonPass(prevChar, nextChar, oldSvg, onSwap) {
  mascotEnsureSwapStyle();
  const TOTAL = 2800;
  const SWAP_AT = 1500;
  // 今の飾り（ほっぺ・王冠…）は両方の相棒に付けたまま見せる
  const deco = oldSvg ? [...oldSvg.classList].filter((c) => /^gohan-stage-\d$/.test(c)) : [];
  const withDeco = (svgHtml) => {
    const t = document.createElement('div');
    t.innerHTML = svgHtml;
    const svg = t.firstElementChild;
    deco.forEach((c) => svg.classList.add(c));
    return svg.outerHTML;
  };
  const oldHtml = oldSvg ? (() => { const c = oldSvg.cloneNode(true); [...c.classList].forEach((k) => { if (k.startsWith('gohan-play-') || k.startsWith('mascot-swap')) c.classList.remove(k); }); c.removeAttribute('id'); return c.outerHTML; })() : withDeco(mascotSvg(prevChar));
  const newHtml = withDeco(mascotSvg(nextChar));
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const ov = document.createElement('div');
  ov.className = 'mb-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', '相棒のバトンタッチ');
  ov.innerHTML = `
    <div class="mb-stage">
      <div class="mb-title"><b>${esc(prevChar.name)}</b><span class="mb-arrow">→</span><b>${esc(nextChar.name)}</b></div>
      <div class="mb-ground"></div>
      <div class="mb-kun mb-old">${oldHtml}</div>
      <div class="mb-kun mb-new">${newHtml}</div>
      <div class="mb-baton"></div>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<i class="mb-spark" style="--a:${i * 45}deg"></i>`).join('')}
      <div class="mb-caption">バトンタッチ！<small>これからは ${esc(nextChar.name)} が相棒</small></div>
    </div>`;
  document.body.appendChild(ov);

  let swapped = false;
  let done = false;
  const doSwap = () => { if (swapped) return; swapped = true; try { onSwap(); } catch (e) { /* 差し替えは必ず行う */ } };
  const finish = () => { if (done) return; done = true; doSwap(); ov.classList.add('mb-out'); setTimeout(() => ov.remove(), 260); };
  ov.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(); });
  // 音：走ってきた時に軽く、バトンを渡した時にしっかり
  setTimeout(() => { if (!done && typeof playTapSound === 'function') { try { playTapSound(); } catch (e) { /* 任意 */ } } }, 700);
  setTimeout(() => { if (!done && typeof playGrowSound === 'function') { try { playGrowSound(); } catch (e) { /* 任意 */ } } }, 1000);
  setTimeout(doSwap, SWAP_AT);
  setTimeout(finish, TOTAL);
}

// 着せ替え演出のスタイル。mascot.js を読むどの画面でも使えるよう、ここで1回だけ入れる
function mascotEnsureSwapStyle() {
  if (document.getElementById('mascotSwapStyle')) return;
  const st = document.createElement('style');
  st.id = 'mascotSwapStyle';
  st.textContent = `
  .gohan-kun.mascot-swap-in { animation: mascotSwapIn .6s cubic-bezier(.2,.9,.2,1.15) both !important; transform-origin: 50% 100%; }
  @keyframes mascotSwapIn {
    0%   { transform: scale(0.05); filter: brightness(4) drop-shadow(0 0 16px #fff); opacity: 0; }
    50%  { transform: scale(1.28); filter: brightness(2) drop-shadow(0 0 12px #fff); opacity: 1; }
    75%  { transform: scale(0.94); filter: none; }
    100% { transform: none; filter: none; }
  }
  /* バトンタッチのステージ */
  .mb-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.62); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    animation: mbFade .25s ease-out both; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; }
  .mb-overlay.mb-out { animation: mbFadeOut .25s ease-in both; }
  @keyframes mbFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mbFadeOut { to { opacity: 0; } }
  .mb-stage { position: relative; width: min(100vw - 32px, 360px); height: 250px; overflow: hidden; border-radius: 20px;
    background: linear-gradient(180deg, #5c94fc, #a7dcff 72%, #4a9b3f 72%, #4a9b3f 75%, #8b5e34 75%);
    box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.8); font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; }
  .mb-title { position: absolute; top: 16px; left: 0; right: 0; text-align: center; font-size: 15px; font-weight: 900; color: #1c1c1e;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6); }
  .mb-title .mb-arrow { margin: 0 8px; opacity: 0.7; }
  .mb-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 25%; }
  .mb-kun { position: absolute; left: 50%; bottom: 25%; width: 96px; height: 96px; margin-left: -48px; will-change: transform; }
  .mb-kun .gohan-kun { display: block; width: 96px; height: 96px; animation: mbBob .3s ease-in-out infinite; transform-origin: 50% 100%; }
  .mb-old { animation: mbOld 2.8s linear both; }
  .mb-new { animation: mbNew 2.8s linear both; }
  /* 走っている間だけ弾む。止まっている区間は上で止める */
  .mb-old .gohan-kun { animation: mbBobOld 2.8s linear both; }
  .mb-new .gohan-kun { animation: mbBobNew 2.8s linear both; }
  @keyframes mbBob { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(4deg); } }
  @keyframes mbBobOld { 0%, 46% { transform: none; } 50%, 58%, 66%, 74% { transform: translateY(-5px) rotate(-5deg); } 54%, 62%, 70%, 78% { transform: translateY(0) rotate(5deg); } 80%, 100% { transform: none; } }
  @keyframes mbBobNew { 0%, 4%, 12%, 20% { transform: translateY(-5px) rotate(5deg); } 8%, 16%, 24% { transform: translateY(0) rotate(-5deg); } 28%, 100% { transform: none; } }
  @keyframes mbOld {
    0%, 30% { transform: translateX(-46px); }
    35% { transform: translate(-46px, -22px); }
    40%, 46% { transform: translateX(-46px); }
    78%, 100% { transform: translateX(-360px); }
  }
  @keyframes mbNew {
    0% { transform: translateX(340px); }
    28%, 30% { transform: translateX(46px); }
    35% { transform: translate(46px, -22px); }
    40%, 46% { transform: translateX(46px); }
    60% { transform: translateX(0); }
    68% { transform: translate(0, -30px); }
    76% { transform: translateX(0); }
    84% { transform: translate(0, -16px); }
    90%, 100% { transform: translateX(0); }
  }
  /* バトン：前の相棒の右手から新しい相棒の左手へ */
  .mb-baton { position: absolute; left: 50%; bottom: calc(25% + 44px); width: 34px; height: 8px; margin-left: -17px; border-radius: 4px;
    background: linear-gradient(90deg, #ffd60a, #ff9f1c); box-shadow: 0 0 8px rgba(255, 214, 10, 0.8); animation: mbBaton 2.8s linear both; }
  @keyframes mbBaton {
    0%, 30% { transform: translateX(-14px) rotate(-20deg); opacity: 1; }
    35% { transform: translate(0, -26px) rotate(0); }
    40%, 46% { transform: translateX(14px) rotate(20deg); opacity: 1; }
    60% { transform: translateX(-32px) rotate(20deg); opacity: 1; }
    66%, 100% { transform: translateX(-32px) rotate(20deg); opacity: 0; }
  }
  .mb-spark { position: absolute; left: 50%; bottom: calc(25% + 60px); width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #fff6a8;
    box-shadow: 0 0 8px #ffd60a; opacity: 0; animation: mbSpark 2.8s linear both; }
  @keyframes mbSpark {
    0%, 34% { transform: rotate(var(--a)) translateY(0) scale(0.4); opacity: 0; }
    36% { opacity: 1; }
    50% { transform: rotate(var(--a)) translateY(-56px) scale(1.2); opacity: 0; }
    100% { opacity: 0; }
  }
  .mb-caption { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 18px; font-weight: 900; color: #fff;
    text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35), 0 0 12px rgba(0, 0, 0, 0.35); opacity: 0; animation: mbCaption 2.8s linear both; }
  .mb-caption small { display: block; font-size: 12px; font-weight: 700; margin-top: 4px; opacity: 0.95; }
  @keyframes mbCaption { 0%, 44% { opacity: 0; transform: translateY(8px); } 52%, 100% { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .mb-overlay { display: none; } }`;
  document.head.appendChild(st);
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
    mascotRenderAll({ animate: true }); // 別のキャラに変えた時だけ進化の演出が出る
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
