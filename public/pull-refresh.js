// 「引っ張って更新」（pull-to-refresh）。
// ホーム画面に追加して使う場合など、ブラウザ標準の引っ張り更新が効かない環境でも
// 同じ体験ができるように、タッチ操作で自前実装している。
// リングだけでは何が起きているのか分かりにくいので、リングと言葉を並べた
// 小さな帯を出し、「引っぱって更新」→「離して更新」→「更新中…」→
// 「更新しました」と変えていく。
// index.html / history.html / status.html から読み込む。ページ内に存在する
// loadCalendar / applyWeatherTheme / renderQuote / loadHistory / loadStatus を
// 見つけたものだけ呼び出して再読み込みする（関数がなければ何もしない）。

(function () {
  const THRESHOLD = 64; // これ以上引っ張って離すと更新される
  const MAX_PULL = 110;
  const RESISTANCE = 0.5; // 引っ張りに抵抗をつける
  // 読み込みが速すぎると「更新中…」が一瞬で消えて何が起きたか分からないので、
  // 最低これだけは見せる
  const MIN_SPIN = 450;
  const RADIUS = 15;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const TEXT_PULL = '引っぱって更新';
  const TEXT_ARMED = '離して更新';
  const TEXT_LOADING = '更新中…';
  const TEXT_DONE = '更新しました';

  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator';
  indicator.innerHTML = `
    <div class="pull-refresh-pill">
      <svg class="pull-refresh-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="pull-refresh-track" cx="18" cy="18" r="${RADIUS}"></circle>
        <circle class="pull-refresh-progress" cx="18" cy="18" r="${RADIUS}"></circle>
      </svg>
      <svg class="pull-refresh-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12.5 9.5 18 20 7"></path>
      </svg>
      <span class="pull-refresh-text">${TEXT_PULL}</span>
    </div>
  `;
  document.body.prepend(indicator);

  const pill = indicator.querySelector('.pull-refresh-pill');
  const label = indicator.querySelector('.pull-refresh-text');
  const progressCircle = indicator.querySelector('.pull-refresh-progress');
  progressCircle.style.strokeDasharray = String(CIRCUMFERENCE);
  progressCircle.style.strokeDashoffset = String(CIRCUMFERENCE);

  // ヘッダーのすぐ下に置く。ヘッダーの高さはキャラクターの大きさなどで
  // 変わるため、CSSに数字で書かず、そのつど実測して合わせる
  // （数字で書いていた時、ヘッダーが高くなってインジケーターが隠れていた）
  function placeIndicator() {
    const header = document.querySelector('.page-header');
    if (!header) return;
    const bottom = header.getBoundingClientRect().bottom;
    if (bottom > 0) indicator.style.top = `${Math.round(bottom) + 10}px`;
  }
  placeIndicator();
  window.addEventListener('resize', placeIndicator);

  let startY = null;
  let pulling = false;
  let refreshing = false;

  // 何かのシート・ダイアログが開いている間は、引っ張り更新を無効にする。
  // シートを下スワイプで閉じるジェスチャーが、背景ページの更新として
  // 誤爆しないようにするため。個別のIDではなく共通クラスで見ることで、
  // 今後モーダルが増えても対応漏れが起きないようにしている
  function isModalOpen() {
    return !!document.querySelector('.modal-overlay:not(.hidden), .timemenu-overlay:not(.hidden)');
  }

  // 引っ張った量(0〜1)に応じて、リングを満たしつつ帯を出す。
  // 帯はヘッダー下の固定位置に置き、大きく動かすのではなく、その場で
  // リングが満ちていくことと言葉の変化で「あと少しで更新される」を伝える。
  function setPull(dist) {
    const clamped = Math.min(dist, MAX_PULL);
    const progress = Math.min(clamped / THRESHOLD, 1);
    pill.style.transform = `translateY(${progress * 6}px) scale(${0.85 + progress * 0.15})`;
    pill.style.opacity = String(0.2 + progress * 0.8);
    progressCircle.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    const armed = progress >= 1;
    indicator.classList.toggle('armed', armed);
    label.textContent = armed ? TEXT_ARMED : TEXT_PULL;
  }

  function resetPull() {
    pill.style.transform = '';
    pill.style.opacity = '';
    indicator.classList.remove('armed', 'done');
    label.textContent = TEXT_PULL;
    progressCircle.style.strokeDasharray = String(CIRCUMFERENCE);
    progressCircle.style.strokeDashoffset = String(CIRCUMFERENCE);
  }

  async function refreshPage() {
    const tasks = [];
    if (typeof loadCalendar === 'function') tasks.push(loadCalendar());
    if (typeof applyWeatherTheme === 'function') tasks.push(applyWeatherTheme());
    if (typeof renderQuote === 'function') renderQuote();
    if (typeof loadHistory === 'function') tasks.push(loadHistory());
    if (typeof loadStatus === 'function') tasks.push(loadStatus());
    await Promise.allSettled(tasks);
  }

  document.addEventListener('touchstart', (e) => {
    if (refreshing || isModalOpen() || window.scrollY > 0) {
      startY = null;
      return;
    }
    startY = e.touches[0].clientY;
    pulling = true;
    placeIndicator();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling || startY === null || refreshing) return;
    if (window.scrollY > 0 || isModalOpen()) {
      pulling = false;
      resetPull();
      return;
    }
    const dist = e.touches[0].clientY - startY;
    if (dist <= 0) {
      resetPull();
      return;
    }
    setPull(dist * RESISTANCE);
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    const armed = indicator.classList.contains('armed');
    if (!armed || refreshing) {
      resetPull();
      return;
    }
    refreshing = true;
    const startedAt = Date.now();
    indicator.classList.remove('armed');
    indicator.classList.add('spinning');
    label.textContent = TEXT_LOADING;
    pill.style.opacity = '1';
    pill.style.transform = 'translateY(6px) scale(1)';
    // リングを「一部だけ塗られた弧」に切り替えて、くるくる回るスピナー表示にする
    progressCircle.style.strokeDasharray = `${CIRCUMFERENCE * 0.28} ${CIRCUMFERENCE}`;
    progressCircle.style.strokeDashoffset = '0';
    try {
      await refreshPage();
    } finally {
      const spent = Date.now() - startedAt;
      if (spent < MIN_SPIN) await new Promise((r) => setTimeout(r, MIN_SPIN - spent));
      // 終わったことが分かるよう、チェックに変えて少しだけ見せてから消す
      indicator.classList.remove('spinning');
      indicator.classList.add('done');
      label.textContent = TEXT_DONE;
      setTimeout(() => {
        refreshing = false;
        resetPull();
      }, 900);
    }
  });

  document.addEventListener('touchcancel', () => {
    pulling = false;
    if (!refreshing) resetPull();
  });
})();
