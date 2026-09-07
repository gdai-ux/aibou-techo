// gohan-run.js — ヘッダーの相棒を触ると始まる、走って跳ぶだけの小さなゲーム。
//
// 遊び方は Chrome のオフライン画面の恐竜ゲームと同じ：相棒はひとりで走り続け、
// 画面か A ボタンを押すとジャンプ。障害物にぶつかったら終わりで、走った距離が点数。
// ステージは5つ（そうげん→もり→うみ→さばく→うちゅう）。それぞれ決まった距離を
// 走るとゴールの旗が見えてきて、触れるとクリア。次のステージは少し速く、障害物も多い。
// 相棒はハート3つ。障害物にぶつかると1つ減って少しのあいだ無敵、0で終わり。
// ステージをクリアすると1つ回復し、ボス戦にもそのまま持ち越す。
//
// 5つ目をクリアするとボス戦。相手は「サボリ魔王 ダラーン」（記録をサボらせようとする
// 眠そうな魔王）。ボス戦だけ十字キーと B ボタンが増え、B で「ほのおだま」を撃てる。
// 十字キーの ◀▶ で前後に動き、▼ でしゃがみ、▲ か A でジャンプ。魔王が投げてくる
// まくら（低い＝ジャンプ、顔の高さ＝しゃがむ）をよけながら、ほのおだまを当てて倒す。
// 「とじる」や外側を触った時は、いきなり閉じずに一時停止して「ゲームをやめる？」と聞く。
//
// 依存：ページに .page-header .gohan-kun（相棒のSVG）があること。音は app 側の
// ensureAudio / beep / tapSoundEnabled があれば使い、無ければ鳴らさない。
// 入口は window.openGohanRun()（setupGohanTap から呼ばれる）。
(function () {
  'use strict';

  const BEST_KEY = 'gohanRunBest';
  const STAGE_KEY = 'gohanRunBestStage';
  // 画面の論理サイズ（px）。端末の幅に合わせて CSS の transform で拡大縮小する
  const W = 320;
  const H = 240;          // 4:3。縦にも余裕を持たせて、スマホで大きく見せる
  const GROUND = 30;      // 地面の厚み
  const RUNNER = 52;      // 相棒の大きさ
  const RUNNER_X = 40;    // 相棒の立ち位置（左から）
  const GRAVITY = 1700;   // px/s^2
  const JUMP_V = -620;    // 跳んだ瞬間の速さ（px/s、上向きが負）
  // 5つのステージ。length はゴールまでの距離（px）、speed は走り始めの速さ、
  // gapMin/gapMax は障害物が出る間隔（秒）。後のステージほど長く、速く、詰まる
  const STAGES = [
    { key: 'grass',  name: 'そうげん', length: 5000, speed: 270, gapMin: 0.85, gapMax: 1.6 },
    { key: 'forest', name: 'もり',     length: 5800, speed: 290, gapMin: 0.8,  gapMax: 1.5 },
    { key: 'sea',    name: 'うみ',     length: 6600, speed: 310, gapMin: 0.75, gapMax: 1.4 },
    { key: 'desert', name: 'さばく',   length: 7400, speed: 330, gapMin: 0.7,  gapMax: 1.3 },
    { key: 'space',  name: 'うちゅう', length: 8400, speed: 350, gapMin: 0.65, gapMax: 1.2 },
  ];
  // ボス戦
  const BOSS_NAME = 'サボリ魔王 ダラーン';
  const BOSS_HP = 10;         // ほのおだまを当てる回数
  const BOSS_SIZE = 72;
  const PLAYER_HEARTS = 3;
  const MOVE_SPEED = 150;     // ◀▶ で動く速さ（px/s）
  const FIRE_SPEED = 300;     // ほのおだまの速さ（目で追える速さ）
  const FIRE_COOLDOWN = 0.55; // 連射の間隔（秒）
  const HURT_TIME = 1.5;      // やられた後の無敵時間（秒）

  // テーマごとの色と障害物の形（ヘッダーの data-stage と同じキー。castle はボス戦だけ）
  const THEMES = {
    grass:  { sky: 'linear-gradient(180deg,#5c94fc,#a7dcff)', ground: '#8b5e34', line: '#4a9b3f', ob1: '#2f9e44', ob2: '#51cf66', cloud: '#ffffff', ink: '#1c1c1e', shape: 'pipe' },
    // 障害物は空や地面と色がかぶらないように（森は明るい空に濃い木、海は青い海にサンゴ色）
    forest: { sky: 'linear-gradient(180deg,#a9d9b8,#e4f4e9)', ground: '#4c7a3e', line: '#2f5233', ob1: '#6b4226', ob2: '#2e7d32', cloud: '#ffffff', ink: '#1c1c1e', shape: 'tree' },
    sea:    { sky: 'linear-gradient(180deg,#0b3b5c,#1f6f8b)', ground: '#155a73', line: '#4dd0e1', ob1: '#ff6b3d', ob2: '#ffb088', cloud: '#eef6f9', ink: '#f2f2f7', shape: 'hump' },
    desert: { sky: 'linear-gradient(180deg,#f7c873,#fbe4b3)', ground: '#d9a066', line: '#b97a3d', ob1: '#2f9e44', ob2: '#4caf50', cloud: '#f4e3c1', ink: '#1c1c1e', shape: 'cactus' },
    snow:   { sky: 'linear-gradient(180deg,#9fc5e8,#e8f4fb)', ground: '#cfe8f3', line: '#9fd3e8', ob1: '#2f7fb8', ob2: '#8ccbe8', cloud: '#ffffff', ink: '#1c1c1e', shape: 'spike' },
    cave:   { sky: 'linear-gradient(180deg,#1b1a20,#33313a)', ground: '#4a4550', line: '#6b6b78', ob1: '#7a7a88', ob2: '#c4c4d4', cloud: '#6b6b78', ink: '#f2f2f7', shape: 'spike' },
    space:  { sky: 'linear-gradient(180deg,#05051a,#1a1b4a)', ground: '#2b2d6b', line: '#ffd60a', ob1: '#9d4edd', ob2: '#e6c4ff', cloud: '#ffe066', ink: '#f2f2f7', shape: 'ball' },
    castle: { sky: 'linear-gradient(180deg,#2b0a3d,#5a1a5e 70%,#7a2a5a)', ground: '#3a2a3f', line: '#ff5e7a', ob1: '#9d4edd', ob2: '#e6c4ff', cloud: '#5a3d6e', ink: '#f2f2f7', shape: 'ball' },
  };

  // サボリ魔王 ダラーン（16×16のドット絵）。紫のかたまりに金の王冠、半分閉じた目、よだれ
  const BOSS_SVG = (() => {
    const px = [];
    const rect = (x, y, w, h, c) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
    const G = '#ffd60a', B = '#9b5de5', D = '#6a3fb5', K = '#2a1f4a', Wt = '#ffffff', L = '#4a2f80', S = '#8fe3ff';
    rect(4, 0, 1, 1, G); rect(7, 0, 1, 1, G); rect(10, 0, 1, 1, G);
    rect(4, 1, 7, 2, G);
    rect(3, 3, 9, 1, B); rect(2, 4, 11, 1, B); rect(1, 5, 13, 7, B);
    rect(2, 12, 11, 1, D); rect(3, 13, 9, 1, D);
    rect(4, 14, 2, 1, D); rect(9, 14, 2, 1, D);
    // 目（まぶたが半分下りている）
    rect(3, 6, 3, 1, L); rect(9, 6, 3, 1, L);
    rect(3, 7, 3, 1, Wt); rect(9, 7, 3, 1, Wt);
    rect(5, 7, 1, 1, K); rect(9, 7, 1, 1, K);
    // 口とよだれ
    rect(6, 10, 4, 1, K); rect(5, 9, 1, 1, K); rect(10, 9, 1, 1, K);
    rect(10, 11, 1, 2, S);
    return `<svg class="gr-boss-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${px.join('')}</svg>`;
  })();

  const CSS = `
  .gr-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.72); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); touch-action: none;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .gr-overlay *, .gr-invite, .gr-invite * { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
  .gr-overlay.hidden { display: none; }
  /* 携帯ゲーム機の本体 */
  .gr-device { width: min(100vw - 12px, 460px); padding: 12px 12px 18px; border-radius: 24px 24px 44px 24px;
    background: linear-gradient(180deg, #6d55e6, #4b35b8); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    color: #f2f2f7; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; }
  .gr-bezel { background: #2a2530; border-radius: 16px 16px 44px 16px; padding: 12px 12px 16px; }
  .gr-screen-wrap { position: relative; margin: 0 auto; overflow: hidden; border-radius: 6px; }
  .gr-screen { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: hidden; transform-origin: 0 0;
    background: var(--gr-sky); image-rendering: pixelated; user-select: none; -webkit-user-select: none; }
  .gr-ground { position: absolute; left: 0; right: 0; bottom: 0; height: ${GROUND}px; background-color: var(--gr-ground);
    background-image: linear-gradient(var(--gr-line), var(--gr-line) 3px, transparent 3px),
      repeating-linear-gradient(90deg, transparent 0 15px, rgba(0, 0, 0, 0.22) 15px 16px);
    background-size: 100% 100%, 16px 100%; }
  .gr-cloud { position: absolute; top: 18px; width: 30px; height: 12px; border-radius: 999px; background: var(--gr-cloud); opacity: 0.75; }
  .gr-cloud::before, .gr-cloud::after { content: ''; position: absolute; background: inherit; border-radius: 999px; }
  .gr-cloud::before { width: 14px; height: 14px; top: -6px; left: 3px; }
  .gr-cloud::after { width: 18px; height: 16px; top: -8px; left: 14px; }
  .gr-runner { position: absolute; left: ${RUNNER_X}px; bottom: ${GROUND}px; width: ${RUNNER}px; height: ${RUNNER}px; will-change: transform; z-index: 2; }
  .gr-runner .gohan-kun { display: block; width: ${RUNNER}px; height: ${RUNNER}px; }
  .gr-runner.gr-hit .gohan-kun { animation: none; transform: rotate(-18deg); }
  .gr-runner.gr-duck .gohan-kun { animation: none !important; transform: scaleY(0.55); transform-origin: 50% 100%; }
  .gr-runner.gr-hurt { animation: grBlink .15s steps(2) infinite; }
  @keyframes grBlink { to { opacity: 0.25; } }
  .gr-ob { position: absolute; bottom: ${GROUND}px; left: 0; will-change: transform;
    filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.45)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.35)); }
  .gr-ob-pipe, .gr-ob-cactus { border-radius: 3px 3px 0 0; background: linear-gradient(90deg, var(--gr-ob1) 0 25%, var(--gr-ob2) 25% 75%, var(--gr-ob1) 75%); }
  .gr-ob-pipe::before { content: ''; position: absolute; top: -5px; left: -3px; right: -3px; height: 7px; border-radius: 3px; background: inherit; }
  .gr-ob-cactus { border-radius: 8px 8px 2px 2px; }
  .gr-ob-tree { background: var(--gr-ob1); border-radius: 2px; }
  .gr-ob-tree::before { content: ''; position: absolute; top: -12px; left: -8px; right: -8px; height: 20px; border-radius: 50%; background: var(--gr-ob2); }
  .gr-ob-hump { border-radius: 50% 50% 3px 3px / 70% 70% 3px 3px; background: linear-gradient(180deg, var(--gr-ob2), var(--gr-ob1)); }
  .gr-ob-spike { background: linear-gradient(180deg, var(--gr-ob2), var(--gr-ob1)); clip-path: polygon(50% 0%, 100% 100%, 0% 100%); }
  .gr-ob-ball { border-radius: 50%; background: radial-gradient(circle at 35% 35%, var(--gr-ob2), var(--gr-ob1)); }
  .gr-hud { position: absolute; top: 8px; right: 10px; font: 700 13px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; color: var(--gr-ink); opacity: 0.85; }
  .gr-hud .gr-hi { opacity: 0.6; margin-right: 8px; }
  .gr-msg { position: absolute; left: 0; right: 0; top: 46%; transform: translateY(-50%); z-index: 6; text-align: center; color: var(--gr-ink);
    font-size: 16px; font-weight: 800; line-height: 1.6; white-space: pre-line; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25); pointer-events: none; }
  .gr-msg.hidden { display: none; }
  .gr-msg small { display: block; font-size: 11px; font-weight: 600; opacity: 0.8; }
  /* ステージ名と、ゴールまでの進み具合（左上） */
  .gr-stage { position: absolute; top: 8px; left: 10px; color: var(--gr-ink); opacity: 0.9; }
  .gr-stage-name { display: block; font: 800 12px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; }
  .gr-prog { position: relative; margin-top: 5px; width: 110px; height: 5px; border-radius: 999px; background: rgba(127, 127, 127, 0.35); overflow: visible; }
  .gr-prog i { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--gr-ink); opacity: 0.8; }
  .gr-prog::after { content: '⚑'; position: absolute; right: -14px; top: -8px; font-size: 12px; line-height: 1; color: var(--gr-ink); }
  .gr-screen.boss .gr-prog { display: none; }
  /* ゴールの旗（ポールの先に赤い旗） */
  .gr-goal { position: absolute; left: 0; bottom: ${GROUND}px; width: 5px; height: 118px; border-radius: 3px 3px 0 0;
    background: linear-gradient(90deg, #cfd3da, #f4f5f7 50%, #9aa0aa); will-change: transform; }
  .gr-goal::before { content: ''; position: absolute; top: 8px; left: 5px; width: 0; height: 0;
    border-top: 13px solid transparent; border-bottom: 13px solid transparent; border-left: 34px solid #ff453a; }
  .gr-goal::after { content: ''; position: absolute; top: -8px; left: -4px; width: 13px; height: 13px; border-radius: 50%; background: #ffd60a; box-shadow: 0 0 8px rgba(255, 214, 10, 0.7); }
  .gr-runner.gr-clear .gohan-kun { animation: grClearHop .5s ease-in-out infinite !important; }
  @keyframes grClearHop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
  /* ボス戦：ハート、ボスのHP、ボス本体、まくら、ほのおだま */
  .gr-hearts { position: absolute; top: 40px; left: 10px; font-size: 13px; letter-spacing: 2px; color: #ff5e7a; }
  .gr-screen.boss .gr-hearts { top: 24px; }
  .gr-boss-hp { position: absolute; top: 26px; right: 10px; width: 132px; display: none; color: var(--gr-ink); }
  .gr-screen.boss .gr-boss-hp { display: block; }
  .gr-boss-hp b { display: block; font-size: 10px; font-weight: 800; text-align: right; margin-bottom: 3px; }
  .gr-boss-hp i { display: block; height: 7px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.35); overflow: hidden; }
  .gr-boss-hp i span { display: block; height: 100%; width: 100%; background: #34c759; transition: width .2s, background .2s; }
  .gr-boss { position: absolute; left: 0; bottom: ${GROUND}px; width: ${BOSS_SIZE}px; height: ${BOSS_SIZE}px; will-change: transform; z-index: 2;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5)); }
  .gr-boss .gr-boss-svg { display: block; width: 100%; height: 100%; animation: grBossBreath 1.6s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes grBossBreath { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.04, 0.96); } }
  .gr-boss.gr-flash .gr-boss-svg { filter: brightness(3) drop-shadow(0 0 8px #fff); }
  .gr-boss.gr-dash .gr-boss-svg { animation: none; transform: rotate(-12deg); }
  .gr-boss.gr-dead .gr-boss-svg { animation: grBossOut .9s ease-in forwards; }
  @keyframes grBossOut { 40% { transform: scale(1.2) rotate(20deg); filter: brightness(2); } 100% { transform: scale(0) rotate(400deg); opacity: 0; } }
  .gr-pillow { position: absolute; left: 0; bottom: ${GROUND}px; width: 24px; height: 14px; border-radius: 6px; will-change: transform;
    background: linear-gradient(180deg, #fff6e5, #e9d8ff); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .gr-pillow::before { content: 'z'; position: absolute; right: -2px; top: -12px; font: 800 11px/1 sans-serif; color: #8fe3ff; }
  /* ほのおだま：右へ飛ぶ彗星の形（左に尾を引く）。飛ぶ向きがひと目で分かるように */
  .gr-fire { position: absolute; left: 0; bottom: ${GROUND}px; width: 30px; height: 16px; will-change: transform; z-index: 3; }
  .gr-fire i { position: absolute; right: 0; top: 0; width: 16px; height: 16px; border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, #fff6a8, #ff9f1c 55%, #ff3d00); box-shadow: 0 0 12px rgba(255, 140, 0, 0.95); animation: grFireFlicker .12s ease-in-out infinite alternate; }
  .gr-fire b { position: absolute; left: 0; top: 4px; width: 18px; height: 8px; border-radius: 8px 0 0 8px; background: linear-gradient(90deg, rgba(255, 120, 0, 0), #ff9f1c); }
  @keyframes grFireFlicker { from { transform: scale(0.9); } to { transform: scale(1.1); } }
  .gr-muzzle { position: absolute; left: 0; bottom: ${GROUND}px; width: 14px; height: 14px; border-radius: 50%; background: #fff6a8; box-shadow: 0 0 10px #ffb300;
    animation: grMuzzle .18s ease-out forwards; z-index: 3; pointer-events: none; }
  @keyframes grMuzzle { to { transform: scale(2.2); opacity: 0; } }
  /* 当たった時：輪が広がって「HIT!」が浮かぶ */
  .gr-hitfx { position: absolute; left: 0; bottom: ${GROUND}px; width: 20px; height: 20px; pointer-events: none; z-index: 7; }
  .gr-hitfx::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 3px solid #ffd60a; box-shadow: 0 0 10px #ff9f1c; animation: grRing .45s ease-out forwards; }
  .gr-hitfx::after { content: attr(data-text); position: absolute; left: 50%; top: -6px; transform: translateX(-50%); font: 900 14px/1 sans-serif; color: #fff; -webkit-text-stroke: 1px #c0392b;
    text-shadow: 0 2px 0 #c0392b; animation: grHitText .7s ease-out forwards; white-space: nowrap; }
  @keyframes grRing { to { transform: scale(3); opacity: 0; } }
  @keyframes grHitText { 0% { transform: translate(-50%, 0) scale(0.6); opacity: 0; } 25% { transform: translate(-50%, -8px) scale(1.2); opacity: 1; } 100% { transform: translate(-50%, -30px) scale(1); opacity: 0; } }
  .gr-boss.gr-shake { animation: grShake .35s ease-out; }
  @keyframes grShake { 0%, 100% { margin-left: 0; } 20% { margin-left: 8px; } 40% { margin-left: -6px; } 60% { margin-left: 4px; } 80% { margin-left: -2px; } }
  /* 突進の予告：「！」を出してぶるぶる震える */
  .gr-boss.gr-warn .gr-boss-svg { animation: grTremble .1s linear infinite; }
  .gr-boss.gr-warn::after { content: '！'; position: absolute; left: 50%; top: -22px; transform: translateX(-50%); font: 900 20px/1 sans-serif; color: #ff453a; text-shadow: 0 0 6px #fff; }
  @keyframes grTremble { 0%, 100% { transform: translateX(-2px); } 50% { transform: translateX(2px); } }
  /* 一時停止（ゲームをやめる？） */
  .gr-pause { position: absolute; inset: 0; z-index: 9; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); }
  .gr-pause.show { display: flex; }
  .gr-pause-box { background: #1c1a20; color: #f2f2f7; border-radius: 14px; padding: 16px 18px; text-align: center; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.12); }
  .gr-pause-box p { margin: 0 0 12px; font-size: 15px; font-weight: 800; }
  .gr-pause-box button { appearance: none; border: 0; border-radius: 999px; padding: 9px 18px; margin: 0 5px; font-size: 13px; font-weight: 800; cursor: pointer; }
  .gr-pause-box .gr-resume { background: #0a84ff; color: #fff; }
  .gr-pause-box .gr-quit { background: rgba(255, 255, 255, 0.14); color: #f2f2f7; }
  /* ボタン類 */
  .gr-controls { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 12px; margin-top: 18px; padding: 0 8px; }
  .gr-left { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; padding-top: 6px; }
  .gr-right { display: flex; align-items: flex-end; gap: 10px; }
  .gr-bottom { display: flex; justify-content: center; margin-top: 14px; }
  .gr-tip { font-size: 12px; opacity: 0.85; line-height: 1.5; }
  .gr-close { appearance: none; border: 0; border-radius: 999px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer;
    color: #f2f2f7; background: rgba(0, 0, 0, 0.35); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15); }
  .gr-jump, .gr-b { appearance: none; border: 0; border-radius: 50%; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent;
    background: radial-gradient(circle at 35% 30%, #4a4550, #1c1a20); color: #f2f2f7; font-weight: 800;
    box-shadow: 0 6px 0 #0e0d10, 0 10px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15); transform: translateY(0); transition: transform .06s, box-shadow .06s; }
  .gr-jump { width: 96px; height: 96px; font-size: 28px; }
  .gr-b { width: 74px; height: 74px; font-size: 22px; margin-bottom: 4px; }
  .gr-jump small, .gr-b small { display: block; font-size: 10px; font-weight: 700; letter-spacing: 1px; opacity: 0.75; }
  .gr-jump:active, .gr-jump.pressed, .gr-b:active, .gr-b.pressed { transform: translateY(4px); box-shadow: 0 2px 0 #0e0d10, 0 6px 12px rgba(0, 0, 0, 0.45); }
  /* 十字キー（ボス戦だけ） */
  .gr-dpad { display: grid; grid-template-columns: repeat(3, 40px); grid-template-rows: repeat(3, 40px); gap: 0; filter: drop-shadow(0 4px 0 #0e0d10) drop-shadow(0 8px 14px rgba(0, 0, 0, 0.4)); }
  .gr-dpad button { appearance: none; border: 0; padding: 0; margin: 0; background: #1c1a20; color: #f2f2f7; font-size: 15px; cursor: pointer; touch-action: none;
    -webkit-tap-highlight-color: transparent; box-shadow: none; outline: none; }
  .gr-dpad button.pressed { background: #0e0d10; }
  .gr-dpad .gr-up { grid-column: 2; grid-row: 1; border-radius: 8px 8px 0 0; }
  .gr-dpad .gr-left-btn { grid-column: 1; grid-row: 2; border-radius: 8px 0 0 8px; }
  .gr-dpad .gr-mid { grid-column: 2; grid-row: 2; background: #1c1a20; }
  .gr-dpad .gr-mid::after { content: ''; display: block; width: 14px; height: 14px; margin: 11px auto; border-radius: 50%; background: #2a2530; }
  .gr-dpad .gr-right-btn { grid-column: 3; grid-row: 2; border-radius: 0 8px 8px 0; }
  .gr-dpad .gr-down { grid-column: 2; grid-row: 3; border-radius: 0 0 8px 8px; }
  .gr-device:not(.boss) .gr-dpad, .gr-device:not(.boss) .gr-b { display: none; }
  .gr-device.boss .gr-tip { display: none; }
  .gr-lamp { position: absolute; left: 22px; bottom: 26px; width: 8px; height: 8px; border-radius: 50%; background: #7CFC00; box-shadow: 0 0 8px #7CFC00; }
  @media (prefers-reduced-motion: reduce) { .gr-runner .gohan-kun { animation: none !important; } }
  /* 開く時の演出：背景がふわっと暗くなり、本体が下からせり上がり、画面に電源が入る */
  .gr-overlay.gr-enter { animation: grFade .3s ease-out both; }
  .gr-overlay.gr-enter .gr-device { animation: grRise .45s cubic-bezier(.2, .9, .2, 1.08) both; }
  @keyframes grFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes grRise { from { transform: translateY(56px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
  .gr-boot { position: absolute; inset: 0; z-index: 5; background: #0b0b10; display: flex; align-items: center; justify-content: center; }
  .gr-boot::before { content: ''; width: 0; height: 2px; background: #cfeeff; box-shadow: 0 0 14px #cfeeff; animation: grBootLine .6s ease-out .15s both; }
  .gr-boot.done { animation: grBootOut .35s ease-in both; }
  @keyframes grBootLine { 0% { width: 0; height: 2px; opacity: 1; } 55% { width: 88%; height: 2px; opacity: 1; } 100% { width: 88%; height: 100%; opacity: 0; } }
  @keyframes grBootOut { to { opacity: 0; } }
  /* 相棒を触った時の「あそぶ？」の吹き出し（ヘッダーの相棒の下に出る） */
  .gr-invite { position: fixed; z-index: 999; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
    padding: 8px 8px 8px 14px; border-radius: 16px; background: var(--card, #1c1c1e); color: var(--text, #f2f2f7);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.16)); box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.7);
    font-size: 13px; font-weight: 700; white-space: nowrap; animation: grInvitePop .28s cubic-bezier(.2, .9, .2, 1.25) both; }
  .gr-invite::before { content: ''; position: absolute; top: -6px; left: 50%; width: 10px; height: 10px; background: inherit;
    border-left: 1px solid var(--border-strong, rgba(255, 255, 255, 0.16)); border-top: 1px solid var(--border-strong, rgba(255, 255, 255, 0.16));
    transform: translateX(-50%) rotate(45deg); }
  .gr-invite button { appearance: none; border: 0; border-radius: 999px; padding: 7px 14px; font-size: 12px; font-weight: 800; cursor: pointer;
    background: var(--accent, #0a84ff); color: #fff; }
  @keyframes grInvitePop { from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(.9); } to { opacity: 1; transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .gr-overlay.gr-enter, .gr-overlay.gr-enter .gr-device, .gr-invite { animation: none; } }
  `;

  let overlay = null;
  let els = null;
  let raf = 0;
  let last = 0;
  let open = false;
  let invite = null;       // 「あそぶ？」の吹き出し
  let inviteTimer = 0;
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ゲームの状態。'idle'（スタート待ち）→ 'run' → 'clear' → 'intro' → … → 'boss' → 'bosswin' / 'over'
  const g = {
    state: 'idle', y: 0, vy: 0, rx: RUNNER_X, speed: 0, dist: 0, score: 0, best: 0, spawnIn: 0, groundX: 0,
    obstacles: [], clouds: [], overAt: 0, stage: 0, stageDist: 0, goal: null, bestStage: 0,
    held: { left: false, right: false, down: false },
    boss: null, pillows: [], fires: [], hearts: PLAYER_HEARTS, hurt: 0, fireCd: 0,
    paused: false, introLeft: 0, introNext: 'run',
  };

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  function readBestStage() {
    try { return Number(localStorage.getItem(STAGE_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function saveBestStage(v) {
    try { localStorage.setItem(STAGE_KEY, String(v)); } catch (e) { /* 任意 */ }
  }
  const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(5, '0');

  function sound(kind) {
    try {
      if (typeof tapSoundEnabled === 'function' && !tapSoundEnabled()) return;
      if (typeof ensureAudio !== 'function' || typeof beep !== 'function') return;
      const ctx = ensureAudio();
      if (!ctx) return;
      if (kind === 'jump') { beep(ctx, 660, 0, 0.07); beep(ctx, 990, 0.05, 0.09); }
      else if (kind === 'over') { beep(ctx, 220, 0, 0.16, 'square', 0.06); beep(ctx, 165, 0.14, 0.24, 'square', 0.06); }
      else if (kind === 'best') { beep(ctx, 784, 0, 0.08); beep(ctx, 988, 0.08, 0.08); beep(ctx, 1319, 0.16, 0.16); }
      else if (kind === 'boot') { beep(ctx, 1047, 0, 0.06, 'square', 0.05); beep(ctx, 2093, 0.07, 0.16, 'square', 0.05); }
      else if (kind === 'fire') { beep(ctx, 880, 0, 0.05, 'sawtooth', 0.05); beep(ctx, 1320, 0.03, 0.06, 'sawtooth', 0.04); }
      else if (kind === 'hit') { beep(ctx, 330, 0, 0.06, 'square', 0.06); beep(ctx, 494, 0.05, 0.08, 'square', 0.05); }
      else if (kind === 'hurt') { beep(ctx, 196, 0, 0.12, 'square', 0.07); beep(ctx, 147, 0.1, 0.16, 'square', 0.06); }
      else if (kind === 'roar') { beep(ctx, 110, 0, 0.3, 'sawtooth', 0.06); beep(ctx, 92, 0.25, 0.4, 'sawtooth', 0.06); }
      else if (kind === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(ctx, f, i * 0.09, 0.12)); beep(ctx, 1568, 0.5, 0.4); }
    } catch (e) { /* 音は無くても困らない */ }
  }

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'gr-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '相棒のゲーム');
    overlay.innerHTML = `
      <div class="gr-device">
        <div class="gr-bezel">
          <div class="gr-screen-wrap">
            <div class="gr-screen">
              <div class="gr-cloud"></div>
              <div class="gr-cloud"></div>
              <div class="gr-ground"></div>
              <div class="gr-runner gohan-walking"></div>
              <div class="gr-hud"><span class="gr-hi">HI 00000</span><span class="gr-score">00000</span></div>
              <div class="gr-stage"><span class="gr-stage-name">STAGE 1/5</span><div class="gr-prog"><i></i></div></div>
              <div class="gr-hearts"></div>
              <div class="gr-boss-hp"><b></b><i><span></span></i></div>
              <div class="gr-msg"></div>
              <div class="gr-pause"><div class="gr-pause-box"><p>ゲームをやめる？</p><button type="button" class="gr-resume">つづける</button><button type="button" class="gr-quit">やめる</button></div></div>
            </div>
          </div>
        </div>
        <div class="gr-controls">
          <div class="gr-left">
            <div class="gr-tip">画面か <b>A</b> を押すとジャンプ。<br>障害物をよけて、どこまで走れるか。</div>
            <div class="gr-dpad" aria-label="十字キー">
              <button type="button" class="gr-up" data-dir="up" aria-label="ジャンプ">▲</button>
              <button type="button" class="gr-left-btn" data-dir="left" aria-label="左へ">◀</button>
              <div class="gr-mid"></div>
              <button type="button" class="gr-right-btn" data-dir="right" aria-label="右へ">▶</button>
              <button type="button" class="gr-down" data-dir="down" aria-label="しゃがむ">▼</button>
            </div>
          </div>
          <div class="gr-right">
            <button type="button" class="gr-b" aria-label="ほのおだま">B<small>FIRE</small></button>
            <button type="button" class="gr-jump" aria-label="ジャンプ">A<small>JUMP</small></button>
          </div>
        </div>
        <div class="gr-bottom"><button type="button" class="gr-close">とじる</button></div>
      </div>`;
    document.body.appendChild(overlay);
    els = {
      device: overlay.querySelector('.gr-device'),
      wrap: overlay.querySelector('.gr-screen-wrap'),
      screen: overlay.querySelector('.gr-screen'),
      ground: overlay.querySelector('.gr-ground'),
      runner: overlay.querySelector('.gr-runner'),
      hi: overlay.querySelector('.gr-hi'),
      score: overlay.querySelector('.gr-score'),
      msg: overlay.querySelector('.gr-msg'),
      stageName: overlay.querySelector('.gr-stage-name'),
      prog: overlay.querySelector('.gr-prog i'),
      hearts: overlay.querySelector('.gr-hearts'),
      bossName: overlay.querySelector('.gr-boss-hp b'),
      bossBar: overlay.querySelector('.gr-boss-hp i span'),
      jump: overlay.querySelector('.gr-jump'),
      fire: overlay.querySelector('.gr-b'),
      close: overlay.querySelector('.gr-close'),
      dpad: overlay.querySelector('.gr-dpad'),
      pause: overlay.querySelector('.gr-pause'),
    };
    // iOSでは画面の touchstart を止めているとボタンの click が発火しないので、pointerup で反応させる
    els.pause.querySelector('.gr-resume').addEventListener('pointerup', (e) => { e.stopPropagation(); e.preventDefault(); resumeGame(); });
    els.pause.querySelector('.gr-quit').addEventListener('pointerup', (e) => { e.stopPropagation(); e.preventDefault(); close(); });
    els.pause.addEventListener('pointerdown', (e) => e.stopPropagation());
    g.clouds = [...overlay.querySelectorAll('.gr-cloud')].map((el, i) => ({ el, x: 60 + i * 170, y: 14 + i * 22 }));

    // 入力：画面のどこか・Aボタン・スペース/↑キー。ボス戦は十字キーと B も
    const press = (e) => { e.preventDefault(); jump(); };
    els.screen.addEventListener('pointerdown', press);
    els.jump.addEventListener('pointerdown', (e) => { els.jump.classList.add('pressed'); press(e); });
    els.jump.addEventListener('pointerup', () => els.jump.classList.remove('pressed'));
    els.jump.addEventListener('pointercancel', () => els.jump.classList.remove('pressed'));
    els.fire.addEventListener('pointerdown', (e) => { e.preventDefault(); els.fire.classList.add('pressed'); fire(); });
    els.fire.addEventListener('pointerup', () => els.fire.classList.remove('pressed'));
    els.fire.addEventListener('pointercancel', () => els.fire.classList.remove('pressed'));
    els.dpad.querySelectorAll('button').forEach((b) => {
      const dir = b.dataset.dir;
      const down = (e) => { e.preventDefault(); b.classList.add('pressed'); if (dir === 'up') jump(); else g.held[dir] = true; };
      const up = () => { b.classList.remove('pressed'); if (dir !== 'up') g.held[dir] = false; };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    // iOSでは touchstart を止めないと、連打や長押しで文字の選択・コピーの吹き出しが出る
    const stopTouch = (e) => { if (e.target && e.target.closest && e.target.closest('.gr-pause')) return; e.preventDefault(); };
    [els.screen, els.jump, els.fire].forEach((el) => {
      el.addEventListener('touchstart', stopTouch, { passive: false });
      el.addEventListener('contextmenu', stopTouch);
    });
    els.close.addEventListener('click', requestClose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) requestClose(); });
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); g.held.left = true; }
      else if (e.code === 'ArrowRight') { e.preventDefault(); g.held.right = true; }
      else if (e.code === 'ArrowDown') { e.preventDefault(); g.held.down = true; }
      else if (e.code === 'KeyX' || e.code === 'KeyZ' || e.code === 'KeyB') { e.preventDefault(); fire(); }
      else if (e.code === 'Escape') requestClose();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft') g.held.left = false;
      if (e.code === 'ArrowRight') g.held.right = false;
      if (e.code === 'ArrowDown') g.held.down = false;
    });
    window.addEventListener('resize', fit);
  }

  // 端末の幅に合わせて画面を拡大縮小する（論理サイズは W×H のまま）
  function fit() {
    if (!els) return;
    // 枠（bezel）の内側の幅に収める（clientWidth には padding が含まれるので差し引く）
    const bezel = els.wrap.parentElement;
    const cs = getComputedStyle(bezel);
    const inner = (bezel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || W;
    // 縦は、ボタン類（およそ190px）を除いた高さに収める
    const availH = Math.max(H * 0.6, window.innerHeight - 190 - 60);
    const s = Math.max(0.6, Math.min(1.6, inner / W, availH / H));
    els.wrap.style.width = `${Math.round(W * s)}px`;
    els.wrap.style.height = `${Math.round(H * s)}px`;
    els.screen.style.transform = `scale(${s})`;
  }

  // ヘッダーの相棒（今の着せ替え・飾り）をそのまま画面に連れてくる
  function adoptRunner() {
    const src = document.querySelector('.page-header .gohan-kun') || document.querySelector('.gohan-kun');
    els.runner.innerHTML = '';
    if (!src) return;
    const kun = src.cloneNode(true);
    [...kun.classList].forEach((c) => { if (c.startsWith('gohan-play-')) kun.classList.remove(c); });
    kun.removeAttribute('id');
    els.runner.appendChild(kun);
  }

  function applyTheme(key) {
    const t = THEMES[key] || THEMES.grass;
    const s = els.screen.style;
    s.setProperty('--gr-sky', t.sky);
    s.setProperty('--gr-ground', t.ground);
    s.setProperty('--gr-line', t.line);
    s.setProperty('--gr-ob1', t.ob1);
    s.setProperty('--gr-ob2', t.ob2);
    s.setProperty('--gr-cloud', t.cloud);
    s.setProperty('--gr-ink', t.ink);
    g.shape = t.shape;
  }

  function clearField() {
    g.obstacles.forEach((o) => o.el.remove());
    g.obstacles = [];
    if (g.goal) { g.goal.el.remove(); g.goal = null; }
    g.pillows.forEach((p) => p.el.remove());
    g.pillows = [];
    g.fires.forEach((f) => f.el.remove());
    g.fires = [];
    if (g.boss) { g.boss.el.remove(); g.boss = null; }
    els.screen.classList.remove('boss');
    els.device.classList.remove('boss');
    els.runner.classList.remove('gr-duck', 'gr-hurt');
    g.held.left = g.held.right = g.held.down = false;
  }

  function placeRunner() {
    els.runner.style.transform = `translate(${(g.rx - RUNNER_X).toFixed(1)}px, ${(-g.y).toFixed(1)}px)`;
  }

  function reset() {
    g.state = 'idle';
    g.y = 0; g.vy = 0; g.rx = RUNNER_X; g.dist = 0; g.score = 0; g.groundX = 0;
    g.best = readBest();
    g.bestStage = readBestStage();
    g.hearts = PLAYER_HEARTS; g.hurt = 0;
    renderHearts();
    els.hi.textContent = `HI ${pad(g.best)}`;
    els.score.textContent = pad(0);
    clearField();
    placeRunner();
    els.runner.classList.remove('gr-hit', 'gr-clear');
    els.runner.classList.add('gohan-walking');
    setStage(0);
    const bestNote = g.bestStage > STAGES.length ? 'サボリ魔王を撃破済み！' : (g.bestStage >= STAGES.length ? '5ステージクリア済み。次はボス！' : (g.bestStage > 0 ? `ベスト: STAGE ${g.bestStage} クリア` : ''));
    showMsg('タップでスタート', `全5ステージ＋ボス。ゴールの旗をめざそう${bestNote ? '\n' + bestNote : ''}`);
  }

  // ステージを切り替える（テーマ・速さ・障害物をそのステージのものに）
  function setStage(i) {
    g.stage = i;
    const st = STAGES[i];
    g.stageDist = 0;
    g.speed = st.speed;
    g.spawnIn = 1.4;
    g.obstacles.forEach((o) => o.el.remove());
    g.obstacles = [];
    if (g.goal) { g.goal.el.remove(); g.goal = null; }
    applyTheme(st.key);
    els.stageName.textContent = `STAGE ${i + 1}/${STAGES.length}`;
    els.prog.style.width = '0%';
  }

  // クリア後の「次のステージへ」。名前を見せてから走り出す
  function startStage(i) {
    setStage(i);
    g.state = 'intro';
    g.y = 0; g.vy = 0;
    placeRunner();
    els.runner.classList.remove('gr-clear');
    els.runner.classList.add('gohan-walking');
    showMsg(`STAGE ${i + 1}  ${STAGES[i].name}`, 'いくよ！');
    sound('jump');
    g.introLeft = 1.0;
    g.introNext = 'run';
  }

  function showMsg(main, sub) {
    els.msg.innerHTML = '';
    els.msg.appendChild(document.createTextNode(main));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; els.msg.appendChild(s); }
    els.msg.classList.remove('hidden');
  }

  // 遊んでいる最中は、いきなり閉じずに「ゲームをやめる？」と聞く
  function requestClose() {
    if (!open) return;
    if (g.state === 'boot') return;
    if (g.paused) { close(); return; } // 一時停止中にもう一度押したら閉じる
    pauseGame();
  }
  function pauseGame() {
    if (g.paused) return;
    g.paused = true;
    g.held.left = g.held.right = g.held.down = false;
    els.pause.classList.add('show');
  }
  function resumeGame() {
    g.paused = false;
    els.pause.classList.remove('show');
    last = 0; // 止めていた時間ぶん、いきなり進まないように
  }

  function jump() {
    if (g.paused) return;
    if (g.state === 'boot' || g.state === 'intro') return; // 電源が入る・ステージ名を見せている間は待つ
    if (g.state === 'idle') { g.state = 'run'; els.msg.classList.add('hidden'); sound('jump'); g.vy = JUMP_V; return; }
    if (g.state === 'clear') { if (performance.now() - g.overAt > 400) { if (g.stage + 1 >= STAGES.length) startBoss(); else startStage(g.stage + 1); } return; }
    if (g.state === 'over' || g.state === 'bosswin') { if (performance.now() - g.overAt > 450) { reset(); jump(); } return; }
    if (g.y <= 0 && !g.held.down) { g.vy = JUMP_V; sound('jump'); }
  }

  // ほのおだま（ボス戦だけ）
  function fire() {
    if (g.paused) return;
    if (g.state !== 'boss') { if (g.state === 'clear' || g.state === 'over' || g.state === 'bosswin' || g.state === 'idle') jump(); return; }
    if (g.fireCd > 0 || g.fires.length >= 2) return;
    g.fireCd = FIRE_COOLDOWN;
    const el = document.createElement('div');
    el.className = 'gr-fire';
    el.innerHTML = '<b></b><i></i>';
    els.screen.appendChild(el);
    const f = { el, x: g.rx + RUNNER - 14, y: g.y + (g.held.down ? 6 : 24), w: 30, h: 16 };
    el.style.transform = `translate(${f.x}px, ${-f.y}px)`;
    g.fires.push(f);
    // 出た場所が分かるように、相棒の前でぱっと光る
    const m = document.createElement('div');
    m.className = 'gr-muzzle';
    m.style.transform = `translate(${g.rx + RUNNER - 8}px, ${-(f.y + 1)}px)`;
    els.screen.appendChild(m);
    setTimeout(() => m.remove(), 200);
    sound('fire');
  }

  function spawn() {
    // 高さ・幅は少しずつ違う。ときどき2本並べる（後のステージほど高い・2本が増える）
    const tall = Math.random() < 0.3 + g.stage * 0.08;
    const twin = Math.random() < 0.15 + g.stage * 0.07;
    const w = twin ? 44 : (16 + Math.floor(Math.random() * 12));
    const h = tall ? 50 + Math.floor(Math.random() * 12) : 30 + Math.floor(Math.random() * 14);
    const el = document.createElement('div');
    el.className = `gr-ob gr-ob-${g.shape}`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    if (g.shape === 'ball') { el.style.height = `${Math.min(h, 42)}px`; el.style.width = el.style.height; }
    els.screen.appendChild(el);
    const ob = { el, x: W + 20, w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
    ob.el.style.transform = `translateX(${ob.x}px)`;
    g.obstacles.push(ob);
  }

  function spawnGoal() {
    const el = document.createElement('div');
    el.className = 'gr-goal';
    els.screen.appendChild(el);
    g.goal = { el, x: W + 30 };
    el.style.transform = `translateX(${g.goal.x}px)`;
  }

  function updateBest() {
    if (g.score > g.best) { g.best = g.score; saveBest(g.best); els.hi.textContent = `HI ${pad(g.best)}`; return true; }
    return false;
  }

  function stageClear() {
    g.overAt = performance.now();
    els.runner.classList.remove('gohan-walking');
    els.runner.classList.add('gr-clear');
    const cleared = g.stage + 1;
    if (cleared > g.bestStage) { g.bestStage = cleared; saveBestStage(cleared); }
    updateBest();
    // ステージをクリアするとハートが1つ回復する
    if (g.hearts < PLAYER_HEARTS) { g.hearts += 1; renderHearts(); }
    g.state = 'clear';
    if (cleared >= STAGES.length) showMsg(`STAGE ${cleared} クリア！`, 'タップで…ボスがあらわれる');
    else showMsg(`STAGE ${cleared} クリア！`, `タップで次のステージ（${STAGES[cleared].name}）へ`);
    sound('best');
  }

  function gameOver(reason) {
    g.state = 'over';
    g.overAt = performance.now();
    els.runner.classList.remove('gohan-walking', 'gr-duck', 'gr-hurt');
    els.runner.classList.add('gr-hit');
    const newBest = updateBest();
    if (!newBest) sound('over'); else sound('best');
    const where = reason === 'boss' ? 'サボリ魔王にやられた' : `STAGE ${g.stage + 1} で`;
    showMsg(`おわり  ${where} ${g.score} 点`, newBest ? 'ベスト記録！ タップでもう一度' : 'タップでもう一度');
  }

  // ---- ボス戦 ---------------------------------------------------------------
  function startBoss() {
    clearField();
    applyTheme('castle');
    els.screen.classList.add('boss');
    els.device.classList.add('boss');
    els.stageName.textContent = 'BOSS';
    g.state = 'intro';
    g.y = 0; g.vy = 0; g.rx = RUNNER_X; g.speed = 120; g.hurt = 0; g.fireCd = 0; // ハートは持ち越し
    placeRunner();
    els.runner.classList.remove('gr-clear');
    els.runner.classList.add('gohan-walking');
    renderHearts();
    const el = document.createElement('div');
    el.className = 'gr-boss';
    el.innerHTML = BOSS_SVG;
    els.screen.appendChild(el);
    g.boss = { el, hp: BOSS_HP, x: W - BOSS_SIZE - 24, y: 26, t: 0, attackIn: 2.4, dashIn: 9, dash: null, flash: 0 };
    placeBoss();
    els.bossName.textContent = BOSS_NAME;
    els.bossBar.style.width = '100%';
    els.bossBar.style.background = '#34c759';
    showMsg(`BOSS  ${BOSS_NAME}`, '「ねむい…記録なんてサボっちゃえ…」\nB：ほのおだま　▼：しゃがむ　A：ジャンプ');
    sound('roar');
    g.introLeft = 2.8;
    g.introNext = 'boss';
  }

  function placeBoss() {
    const b = g.boss;
    b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${(-b.y).toFixed(1)}px)`;
  }

  function renderHearts() {
    els.hearts.textContent = '♥'.repeat(g.hearts) + '♡'.repeat(Math.max(0, PLAYER_HEARTS - g.hearts));
  }

  function throwPillow(kind) {
    const el = document.createElement('div');
    el.className = 'gr-pillow';
    els.screen.appendChild(el);
    // low: 足もと（ジャンプでよける） / head: 顔の高さ（しゃがんでよける）
    const y = kind === 'head' ? 30 : 2;
    const p = { el, x: g.boss.x - 10, y, w: 24, h: 14, speed: 130 + (BOSS_HP - g.boss.hp) * 6 + Math.random() * 20 };
    el.style.transform = `translate(${p.x}px, ${-p.y}px)`;
    g.pillows.push(p);
  }

  function hurtPlayer() {
    if (g.hurt > 0) return;
    g.hearts -= 1;
    renderHearts();
    sound('hurt');
    if (g.hearts <= 0) { gameOver(g.state === 'boss' ? 'boss' : 'stage'); return; }
    g.hurt = HURT_TIME;
    els.runner.classList.add('gr-hurt');
  }

  function hitFx(x, y, text) {
    const el = document.createElement('div');
    el.className = 'gr-hitfx';
    el.dataset.text = text;
    el.style.transform = `translate(${x}px, ${-y}px)`;
    els.screen.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  function bossHit(x, y) {
    const b = g.boss;
    b.hp -= 1;
    b.flash = 0.35;
    b.el.classList.add('gr-flash');
    b.el.classList.remove('gr-shake'); void b.el.offsetWidth; b.el.classList.add('gr-shake');
    hitFx(x, y, 'HIT!');
    g.score += 50;
    els.score.textContent = pad(g.score);
    const ratio = Math.max(0, b.hp / BOSS_HP);
    els.bossBar.style.width = `${(ratio * 100).toFixed(0)}%`;
    els.bossBar.style.background = ratio > 0.5 ? '#34c759' : (ratio > 0.2 ? '#ffd60a' : '#ff453a');
    sound('hit');
    if (b.hp <= 0) bossWin();
  }

  function bossWin() {
    g.state = 'bosswin';
    g.overAt = performance.now();
    g.score += 500;
    els.score.textContent = pad(g.score);
    g.boss.el.classList.add('gr-dead');
    g.pillows.forEach((p) => p.el.remove()); g.pillows = [];
    els.runner.classList.remove('gohan-walking', 'gr-duck', 'gr-hurt');
    els.runner.classList.add('gr-clear');
    if (STAGES.length + 1 > g.bestStage) { g.bestStage = STAGES.length + 1; saveBestStage(g.bestStage); }
    const newBest = updateBest();
    showMsg(`サボリ魔王をたおした！  ${g.score} 点`, `${newBest ? 'ベスト記録！ ' : ''}ぜんぶクリア！ タップでもう一度`);
    sound('win');
  }

  function bossUpdate(dt) {
    const b = g.boss;
    b.t += dt;
    // 相棒：◀▶ で動く、▼ でしゃがむ、重力
    const duck = g.held.down && g.y <= 0;
    els.runner.classList.toggle('gr-duck', duck);
    if (!duck) {
      if (g.held.left) g.rx -= MOVE_SPEED * dt;
      if (g.held.right) g.rx += MOVE_SPEED * dt;
      g.rx = Math.max(6, Math.min(W * 0.55 - RUNNER, g.rx));
    }
    g.vy += GRAVITY * dt;
    g.y = Math.max(0, g.y - g.vy * dt);
    if (g.y === 0 && g.vy > 0) g.vy = 0;
    els.runner.classList.toggle('gohan-walking', g.y === 0 && !duck);
    placeRunner();
    if (g.hurt > 0) { g.hurt -= dt; if (g.hurt <= 0) els.runner.classList.remove('gr-hurt'); }
    if (g.fireCd > 0) g.fireCd -= dt;
    // 地面と雲はゆっくり流す（にらみ合っている感じ）
    g.groundX -= 40 * dt;
    els.ground.style.backgroundPositionX = `${g.groundX.toFixed(1)}px`;
    g.clouds.forEach((c) => { c.x -= 10 * dt; if (c.x < -40) c.x = W + 20; c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y}px)`; });

    // ボス：ふわふわ浮く。HPが減るほど攻撃が速い。ときどき突進してくる（ジャンプでよける）
    const phase = 1 + 0.6 * ((BOSS_HP - b.hp) / BOSS_HP); // 1 → 1.6
    if (b.dash) {
      b.dash.t += dt;
      const d = b.dash;
      if (d.t < d.warn) {
        // 予告：その場で震える（この間はまだ当たらない）
        b.el.classList.add('gr-warn');
        b.x = d.from;
      } else {
        b.el.classList.remove('gr-warn');
        b.el.classList.add('gr-dash');
        const t = d.t - d.warn;
        if (t < d.out) b.x = d.from + (d.to - d.from) * (t / d.out);
        else if (t < d.out + d.wait) b.x = d.to;
        else if (t < d.out + d.wait + d.back) b.x = d.to + (d.from - d.to) * ((t - d.out - d.wait) / d.back);
        else { b.x = d.from; b.dash = null; b.el.classList.remove('gr-dash'); }
      }
      b.y = b.dash && b.dash.t >= b.dash.warn ? Math.max(0, 26 - 26 * Math.min(1, (b.dash.t - b.dash.warn) / 0.15)) : 26;
    } else {
      b.y = 26 + Math.sin(b.t * 2.2) * 6;
      b.attackIn -= dt;
      if (b.attackIn <= 0) {
        const r = Math.random();
        if (r < 0.5) throwPillow('low');
        else if (r < 0.85) throwPillow('head');
        else { throwPillow('low'); setTimeout(() => { if (open && g.state === 'boss' && g.boss) throwPillow('head'); }, 350); }
        b.attackIn = (2.2 + Math.random() * 1.0) / phase;
      }
      b.dashIn -= dt;
      if (b.dashIn <= 0) {
        b.dash = { t: 0, warn: 0.7, from: b.x, to: g.rx - 30, out: 0.7, wait: 0.2, back: 1.0 };
        b.dashIn = 9 + Math.random() * 4;
        sound('roar');
      }
    }
    if (b.flash > 0) { b.flash -= dt; if (b.flash <= 0) b.el.classList.remove('gr-flash'); }
    placeBoss();

    // 当たり判定用の相棒の箱
    const rh = duck ? 26 : RUNNER - 6;
    const rx1 = g.rx + 10, rx2 = g.rx + RUNNER - 10, ry1 = g.y, ry2 = g.y + rh;
    // 突進中のボスに触れたらダメージ
    if (b.dash && b.dash.t >= b.dash.warn && b.x < rx2 && b.x + BOSS_SIZE > rx1 && b.y < ry2 && b.y + BOSS_SIZE - 10 > ry1) hurtPlayer();

    // ほのおだま：右へ飛んでボスに当たる。まくらも消せる
    for (let i = g.fires.length - 1; i >= 0; i--) {
      const f = g.fires[i];
      f.x += FIRE_SPEED * dt;
      f.el.style.transform = `translate(${f.x.toFixed(1)}px, ${-f.y}px)`;
      let gone = f.x > W + 20;
      const head = f.x + f.w; // 先端
      if (!gone && head > b.x + 8 && f.x + 10 < b.x + BOSS_SIZE - 8 && f.y + f.h > b.y && f.y < b.y + BOSS_SIZE) { bossHit(head - 10, f.y); gone = true; }
      if (!gone) {
        for (let j = g.pillows.length - 1; j >= 0; j--) {
          const p = g.pillows[j];
          if (head > p.x && f.x + 10 < p.x + p.w && f.y + f.h > p.y && f.y < p.y + p.h) { p.el.remove(); g.pillows.splice(j, 1); gone = true; g.score += 10; els.score.textContent = pad(g.score); hitFx(p.x, p.y, '+10'); break; }
        }
      }
      if (gone) { f.el.remove(); g.fires.splice(i, 1); }
      if (g.state !== 'boss') return;
    }
    // まくら：左へ飛んでくる
    for (let i = g.pillows.length - 1; i >= 0; i--) {
      const p = g.pillows[i];
      p.x -= p.speed * dt;
      p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${-p.y}px)`;
      if (p.x + p.w < -10) { p.el.remove(); g.pillows.splice(i, 1); continue; }
      if (p.x < rx2 && p.x + p.w > rx1 && p.y < ry2 && p.y + p.h > ry1) { p.el.remove(); g.pillows.splice(i, 1); hurtPlayer(); if (g.state !== 'boss') return; }
    }
  }

  function tick(t) {
    if (!open) return;
    if (!last) last = t;
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (g.paused) { raf = requestAnimationFrame(tick); return; }
    if (g.state === 'intro') {
      g.introLeft -= dt;
      if (g.introLeft <= 0) { g.state = g.introNext; els.msg.classList.add('hidden'); }
    } else if (g.state === 'boss') {
      bossUpdate(dt);
    } else if (g.state === 'run') {
      const st = STAGES[g.stage];
      g.dist += g.speed * dt;
      g.stageDist += g.speed * dt;
      g.score = Math.floor(g.dist / 12);
      // ステージの中で少しずつ速くなる（ステージが進むほど土台の速さも上がる）
      g.speed = st.speed + Math.min(150, (g.stageDist / st.length) * 150);
      els.score.textContent = pad(g.score);
      els.prog.style.width = `${Math.min(100, (g.stageDist / st.length) * 100).toFixed(1)}%`;

      // 相棒の上下（地面より下には行かない）
      g.vy += GRAVITY * dt;
      g.y = Math.max(0, g.y - g.vy * dt);
      if (g.y === 0 && g.vy > 0) g.vy = 0;
      els.runner.classList.toggle('gohan-walking', g.y === 0);
      placeRunner();

      // 地面と雲を流す
      g.groundX -= g.speed * dt;
      els.ground.style.backgroundPositionX = `${g.groundX.toFixed(1)}px`;
      g.clouds.forEach((c) => {
        c.x -= g.speed * 0.2 * dt;
        if (c.x < -40) c.x = W + 20 + Math.random() * 60;
        c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y}px)`;
      });

      // ゴール：決まった距離を走ったら旗が出てくる。旗の手前は障害物を出さない
      if (!g.goal && g.stageDist >= st.length) spawnGoal();
      if (g.goal) {
        g.goal.x -= g.speed * dt;
        g.goal.el.style.transform = `translateX(${g.goal.x.toFixed(1)}px)`;
        if (g.goal.x <= RUNNER_X + RUNNER - 10) { stageClear(); raf = requestAnimationFrame(tick); return; }
      }

      // 障害物：出す・動かす・当たり判定
      g.spawnIn -= dt;
      const nearGoal = g.stageDist >= st.length - 460;
      if (g.spawnIn <= 0 && !nearGoal) {
        spawn();
        g.spawnIn = st.gapMin + Math.random() * (st.gapMax - st.gapMin);
      }
      if (g.hurt > 0) { g.hurt -= dt; if (g.hurt <= 0) els.runner.classList.remove('gr-hurt'); }
      const rx1 = RUNNER_X + 10;
      const rx2 = RUNNER_X + RUNNER - 10;
      for (let i = g.obstacles.length - 1; i >= 0; i--) {
        const o = g.obstacles[i];
        o.x -= g.speed * dt;
        o.el.style.transform = `translateX(${o.x.toFixed(1)}px)`;
        if (o.x + o.w < -10) { o.el.remove(); g.obstacles.splice(i, 1); continue; }
        const hitX = o.x < rx2 && o.x + o.w > rx1;
        const hitY = g.y < o.h - 5; // 相棒の足が障害物の頭より低い
        if (hitX && hitY && g.hurt <= 0) {
          // ぶつかった障害物は消して、ハートを1つ減らす（0なら終わり）
          o.el.remove(); g.obstacles.splice(i, 1);
          hurtPlayer();
          if (g.state !== 'run') break;
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  // いきなり全画面が開くと驚くので、まず相棒がぴょこんと動いて「あそぶ？」と聞く。
  // 吹き出しの「あそぶ」か、相棒をもう一度触るとゲーム機が開く
  function askToPlay() {
    if (open) return;
    if (invite) { hideInvite(); openGame(); return; }
    const icon = document.querySelector('.page-header .app-icon');
    const kun = icon && icon.querySelector('.gohan-kun');
    if (kun && typeof playGohanTrick === 'function') { try { playGohanTrick(kun); } catch (e) { /* 芸は無くてもよい */ } }
    if (!overlay) build();
    invite = document.createElement('div');
    invite.className = 'gr-invite';
    invite.setAttribute('role', 'dialog');
    invite.innerHTML = 'いっしょにあそぶ？ <button type="button">▶ あそぶ</button>';
    invite.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); hideInvite(); openGame(); });
    document.body.appendChild(invite);
    // ヘッダーの相棒の真下に置く（画面の端からはみ出さないように寄せる）
    const r = icon ? icon.getBoundingClientRect() : { left: 24, right: 74, bottom: 60 };
    const half = invite.offsetWidth / 2 + 8;
    const x = Math.max(half, Math.min(window.innerWidth - half, (r.left + r.right) / 2));
    invite.style.left = `${Math.round(x)}px`;
    invite.style.top = `${Math.round(r.bottom + 8)}px`;
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(hideInvite, 4500);
    setTimeout(() => document.addEventListener('pointerdown', onOutside, { capture: true }), 0);
  }
  function onOutside(e) {
    if (!invite) return;
    const icon = document.querySelector('.page-header .app-icon');
    if (invite.contains(e.target) || (icon && icon.contains(e.target))) return;
    hideInvite();
  }
  function hideInvite() {
    clearTimeout(inviteTimer);
    document.removeEventListener('pointerdown', onOutside, { capture: true });
    if (invite) invite.remove();
    invite = null;
  }

  function openGame() {
    if (!overlay) build();
    open = true;
    g.paused = false;
    els.pause.classList.remove('show');
    adoptRunner();
    reset();
    g.clouds.forEach((c) => { c.el.style.transform = `translate(${c.x}px, ${c.y}px)`; });
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    fit();
    // 本体がせり上がり、画面に電源が入ってからスタート待ちになる
    overlay.classList.toggle('gr-enter', !reduceMotion());
    if (!reduceMotion()) {
      g.state = 'boot';
      els.msg.classList.add('hidden');
      const boot = document.createElement('div');
      boot.className = 'gr-boot';
      els.screen.appendChild(boot);
      setTimeout(() => sound('boot'), 250);
      setTimeout(() => boot.classList.add('done'), 800);
      setTimeout(() => {
        boot.remove();
        if (open && g.state === 'boot') { g.state = 'idle'; els.msg.classList.remove('hidden'); }
      }, 1150);
    }
    last = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function close() {
    open = false;
    cancelAnimationFrame(raf);
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('gr-enter');
      [...overlay.querySelectorAll('.gr-boot')].forEach((b) => b.remove());
      clearField();
      g.paused = false;
      els.pause.classList.remove('show');
    }
    document.body.style.overflow = '';
  }

  window.openGohanRun = askToPlay;
  window.closeGohanRun = close;
  // 動作確認用：開いている時に呼ぶとすぐボス戦になる
  window.gohanRunSkipToBoss = () => { if (open && els) startBoss(); };
})();
