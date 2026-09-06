// gohan-run.js — ヘッダーの相棒を触ると始まる、走って跳ぶだけの小さなゲーム。
//
// 遊び方は Chrome のオフライン画面の恐竜ゲームと同じ：相棒はひとりで走り続け、
// 画面か A ボタンを押すとジャンプ。障害物にぶつかったら終わりで、走った距離が点数。
// 画面はゲームボーイのような携帯機の見た目にし、ヘッダーのステージのテーマ
// （草原・森・海・砂漠・雪山・洞窟・宇宙）に合わせて空・地面・障害物の色と形が変わる。
//
// 依存：ページに .page-header .gohan-kun（相棒のSVG）があること。音は app 側の
// ensureAudio / beep / tapSoundEnabled があれば使い、無ければ鳴らさない。
// 入口は window.openGohanRun()（setupGohanTap から呼ばれる）。
(function () {
  'use strict';

  const BEST_KEY = 'gohanRunBest';
  // 画面の論理サイズ（px）。端末の幅に合わせて CSS の transform で拡大縮小する
  const W = 320;
  const H = 180;
  const GROUND = 24;      // 地面の厚み
  const RUNNER = 40;      // 相棒の大きさ
  const RUNNER_X = 36;    // 相棒の立ち位置（左から）
  const GRAVITY = 1500;   // px/s^2
  const JUMP_V = -540;    // 跳んだ瞬間の速さ（px/s、上向きが負）
  const BASE_SPEED = 230; // 走り始めの速さ（px/s）

  // テーマごとの色と障害物の形（ヘッダーの data-stage と同じキー）
  const THEMES = {
    grass:  { sky: 'linear-gradient(180deg,#5c94fc,#a7dcff)', ground: '#8b5e34', line: '#4a9b3f', ob1: '#2f9e44', ob2: '#51cf66', cloud: '#ffffff', ink: '#1c1c1e', shape: 'pipe' },
    forest: { sky: 'linear-gradient(180deg,#1f3b2a,#3b6b45)', ground: '#2f5233', line: '#8a5a34', ob1: '#6b4226', ob2: '#3d7a3d', cloud: '#5b7a5b', ink: '#f2f2f7', shape: 'tree' },
    sea:    { sky: 'linear-gradient(180deg,#0b3b5c,#1f6f8b)', ground: '#1f6f8b', line: '#4dd0e1', ob1: '#1f6f8b', ob2: '#4dd0e1', cloud: '#eef6f9', ink: '#f2f2f7', shape: 'hump' },
    desert: { sky: 'linear-gradient(180deg,#f7c873,#fbe4b3)', ground: '#d9a066', line: '#b97a3d', ob1: '#2f9e44', ob2: '#4caf50', cloud: '#f4e3c1', ink: '#1c1c1e', shape: 'cactus' },
    snow:   { sky: 'linear-gradient(180deg,#9fc5e8,#e8f4fb)', ground: '#cfe8f3', line: '#9fd3e8', ob1: '#9fd3e8', ob2: '#eaf7fb', cloud: '#ffffff', ink: '#1c1c1e', shape: 'spike' },
    cave:   { sky: 'linear-gradient(180deg,#1b1a20,#33313a)', ground: '#4a4550', line: '#6b6b78', ob1: '#5a5a66', ob2: '#8d8d99', cloud: '#6b6b78', ink: '#f2f2f7', shape: 'spike' },
    space:  { sky: 'linear-gradient(180deg,#05051a,#1a1b4a)', ground: '#2b2d6b', line: '#ffd60a', ob1: '#7b2cbf', ob2: '#c77dff', cloud: '#ffe066', ink: '#f2f2f7', shape: 'ball' },
  };

  const CSS = `
  .gr-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.72); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); touch-action: none; }
  .gr-overlay.hidden { display: none; }
  /* 携帯ゲーム機の本体 */
  .gr-device { width: min(100vw - 24px, 400px); padding: 14px 14px 18px; border-radius: 22px 22px 40px 22px;
    background: linear-gradient(180deg, #6d55e6, #4b35b8); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    color: #f2f2f7; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; }
  .gr-bezel { background: #2a2530; border-radius: 14px 14px 40px 14px; padding: 14px 18px 18px; }
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
  .gr-runner { position: absolute; left: ${RUNNER_X}px; bottom: ${GROUND}px; width: ${RUNNER}px; height: ${RUNNER}px; will-change: transform; }
  .gr-runner .gohan-kun { display: block; width: ${RUNNER}px; height: ${RUNNER}px; }
  .gr-runner.gr-hit .gohan-kun { animation: none; transform: rotate(-18deg); }
  .gr-ob { position: absolute; bottom: ${GROUND}px; left: 0; will-change: transform; }
  .gr-ob-pipe, .gr-ob-cactus { border-radius: 3px 3px 0 0; background: linear-gradient(90deg, var(--gr-ob1) 0 25%, var(--gr-ob2) 25% 75%, var(--gr-ob1) 75%); }
  .gr-ob-pipe::before { content: ''; position: absolute; top: -5px; left: -3px; right: -3px; height: 7px; border-radius: 3px; background: inherit; }
  .gr-ob-cactus { border-radius: 8px 8px 2px 2px; }
  .gr-ob-tree { background: var(--gr-ob1); border-radius: 2px; }
  .gr-ob-tree::before { content: ''; position: absolute; top: -12px; left: -8px; right: -8px; height: 20px; border-radius: 50%; background: var(--gr-ob2); }
  .gr-ob-hump { border-radius: 50% 50% 3px 3px / 70% 70% 3px 3px; background: linear-gradient(180deg, var(--gr-ob2), var(--gr-ob1)); }
  .gr-ob-spike { background: linear-gradient(180deg, var(--gr-ob2), var(--gr-ob1)); clip-path: polygon(50% 0%, 100% 100%, 0% 100%); }
  .gr-ob-ball { border-radius: 50%; background: radial-gradient(circle at 35% 35%, var(--gr-ob2), var(--gr-ob1)); }
  .gr-hud { position: absolute; top: 6px; right: 8px; font: 700 11px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; color: var(--gr-ink); opacity: 0.85; }
  .gr-hud .gr-hi { opacity: 0.6; margin-right: 8px; }
  .gr-msg { position: absolute; left: 0; right: 0; top: 46%; transform: translateY(-50%); text-align: center; color: var(--gr-ink);
    font-size: 13px; font-weight: 700; line-height: 1.6; white-space: pre-line; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25); pointer-events: none; }
  .gr-msg.hidden { display: none; }
  .gr-msg small { display: block; font-size: 10px; font-weight: 600; opacity: 0.8; }
  /* ボタン類 */
  .gr-controls { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; margin-top: 18px; padding: 0 6px; }
  .gr-left { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .gr-tip { font-size: 11px; opacity: 0.85; line-height: 1.5; }
  .gr-close { appearance: none; border: 0; border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
    color: #f2f2f7; background: rgba(0, 0, 0, 0.35); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15); }
  .gr-jump { appearance: none; border: 0; width: 76px; height: 76px; border-radius: 50%; cursor: pointer; touch-action: none;
    background: radial-gradient(circle at 35% 30%, #4a4550, #1c1a20); color: #f2f2f7; font-size: 22px; font-weight: 800;
    box-shadow: 0 6px 0 #0e0d10, 0 10px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15); transform: translateY(0); transition: transform .06s, box-shadow .06s; }
  .gr-jump small { display: block; font-size: 9px; font-weight: 700; letter-spacing: 1px; opacity: 0.75; }
  .gr-jump:active, .gr-jump.pressed { transform: translateY(4px); box-shadow: 0 2px 0 #0e0d10, 0 6px 12px rgba(0, 0, 0, 0.45); }
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

  // ゲームの状態。'idle'（スタート待ち）→ 'run' → 'over'（もう一度待ち）
  const g = { state: 'idle', y: 0, vy: 0, speed: BASE_SPEED, dist: 0, score: 0, best: 0, spawnIn: 0, groundX: 0, obstacles: [], clouds: [], overAt: 0 };

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ }
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
              <div class="gr-msg"></div>
            </div>
          </div>
        </div>
        <div class="gr-controls">
          <div class="gr-left">
            <button type="button" class="gr-close">とじる</button>
            <div class="gr-tip">画面か <b>A</b> を押すとジャンプ。<br>障害物をよけて、どこまで走れるか。</div>
          </div>
          <button type="button" class="gr-jump" aria-label="ジャンプ">A<small>JUMP</small></button>
        </div>
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
      jump: overlay.querySelector('.gr-jump'),
      close: overlay.querySelector('.gr-close'),
    };
    g.clouds = [...overlay.querySelectorAll('.gr-cloud')].map((el, i) => ({ el, x: 60 + i * 170, y: 14 + i * 22 }));

    // 入力：画面のどこか・Aボタン・スペース/↑キー
    const press = (e) => { e.preventDefault(); jump(); };
    els.screen.addEventListener('pointerdown', press);
    els.jump.addEventListener('pointerdown', (e) => { els.jump.classList.add('pressed'); press(e); });
    els.jump.addEventListener('pointerup', () => els.jump.classList.remove('pressed'));
    els.jump.addEventListener('pointercancel', () => els.jump.classList.remove('pressed'));
    els.close.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
      if (e.code === 'Escape') close();
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
    const s = Math.max(0.6, Math.min(1.6, inner / W));
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

  function applyTheme() {
    const header = document.querySelector('.page-header');
    const key = (header && header.dataset.stage) || 'grass';
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

  function reset() {
    g.state = 'idle';
    g.y = 0; g.vy = 0; g.speed = BASE_SPEED; g.dist = 0; g.score = 0; g.spawnIn = 1.2; g.groundX = 0;
    g.obstacles.forEach((o) => o.el.remove());
    g.obstacles = [];
    g.best = readBest();
    els.hi.textContent = `HI ${pad(g.best)}`;
    els.score.textContent = pad(0);
    els.runner.style.transform = 'translateY(0)';
    els.runner.classList.remove('gr-hit');
    els.runner.classList.add('gohan-walking');
    showMsg('タップでスタート', 'Aボタンか画面を押すとジャンプ');
  }

  function showMsg(main, sub) {
    els.msg.innerHTML = '';
    els.msg.appendChild(document.createTextNode(main));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; els.msg.appendChild(s); }
    els.msg.classList.remove('hidden');
  }

  function jump() {
    if (g.state === 'boot') return; // 電源が入るまでは待つ
    if (g.state === 'idle') { g.state = 'run'; els.msg.classList.add('hidden'); sound('jump'); g.vy = JUMP_V; return; }
    if (g.state === 'over') { if (performance.now() - g.overAt > 450) { reset(); jump(); } return; }
    if (g.y <= 0) { g.vy = JUMP_V; sound('jump'); }
  }

  function spawn() {
    // 高さ・幅は少しずつ違う。ときどき2本並べる
    const tall = Math.random() < 0.35;
    const twin = Math.random() < 0.22;
    const w = twin ? 34 : (12 + Math.floor(Math.random() * 10));
    const h = tall ? 40 + Math.floor(Math.random() * 10) : 24 + Math.floor(Math.random() * 12);
    const el = document.createElement('div');
    el.className = `gr-ob gr-ob-${g.shape}`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    if (g.shape === 'ball') { el.style.height = `${Math.min(h, 34)}px`; el.style.width = el.style.height; }
    els.screen.appendChild(el);
    const ob = { el, x: W + 20, w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
    ob.el.style.transform = `translateX(${ob.x}px)`;
    g.obstacles.push(ob);
  }

  function gameOver() {
    g.state = 'over';
    g.overAt = performance.now();
    els.runner.classList.remove('gohan-walking');
    els.runner.classList.add('gr-hit');
    let sub = 'タップでもう一度';
    if (g.score > g.best) { g.best = g.score; saveBest(g.best); els.hi.textContent = `HI ${pad(g.best)}`; sub = 'ベスト記録！ タップでもう一度'; sound('best'); }
    else sound('over');
    showMsg(`おわり  ${g.score} 点`, sub);
  }

  function tick(t) {
    if (!open) return;
    if (!last) last = t;
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    if (g.state === 'run') {
      g.dist += g.speed * dt;
      g.score = Math.floor(g.dist / 12);
      g.speed = BASE_SPEED + Math.min(320, g.score * 0.6);
      els.score.textContent = pad(g.score);

      // 相棒の上下（地面より下には行かない）
      g.vy += GRAVITY * dt;
      g.y = Math.max(0, g.y - g.vy * dt);
      if (g.y === 0 && g.vy > 0) g.vy = 0;
      els.runner.classList.toggle('gohan-walking', g.y === 0);
      els.runner.style.transform = `translateY(${(-g.y).toFixed(1)}px)`;

      // 地面と雲を流す
      g.groundX -= g.speed * dt;
      els.ground.style.backgroundPositionX = `${g.groundX.toFixed(1)}px`;
      g.clouds.forEach((c) => {
        c.x -= g.speed * 0.2 * dt;
        if (c.x < -40) c.x = W + 20 + Math.random() * 60;
        c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y}px)`;
      });

      // 障害物：出す・動かす・当たり判定
      g.spawnIn -= dt;
      if (g.spawnIn <= 0) {
        spawn();
        g.spawnIn = (0.85 + Math.random() * 1.0) * (260 / g.speed);
      }
      const rx1 = RUNNER_X + 8;
      const rx2 = RUNNER_X + RUNNER - 8;
      for (let i = g.obstacles.length - 1; i >= 0; i--) {
        const o = g.obstacles[i];
        o.x -= g.speed * dt;
        o.el.style.transform = `translateX(${o.x.toFixed(1)}px)`;
        if (o.x + o.w < -10) { o.el.remove(); g.obstacles.splice(i, 1); continue; }
        const hitX = o.x < rx2 && o.x + o.w > rx1;
        const hitY = g.y < o.h - 4; // 相棒の足が障害物の頭より低い
        if (hitX && hitY) { gameOver(); break; }
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
    applyTheme();
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
        if (open && g.state === 'boot') { g.state = 'idle'; showMsg('タップでスタート', 'Aボタンか画面を押すとジャンプ'); }
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
    }
    document.body.style.overflow = '';
  }

  window.openGohanRun = askToPlay;
  window.closeGohanRun = close;
})();
