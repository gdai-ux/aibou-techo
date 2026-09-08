// 1日ぶんの合計ポイント（gohanDayScore、growth.js）を折れ線チャートで見せる部品。
// ホーム画面（index.html）とステータス画面（status.html）の両方から、
// 同じ見た目・同じ操作感で使うのでここに共通化してある。
// 計算そのものはgrowth.jsに任せ、ここは描画とインタラクションだけを持つ。

const SCORE_CHART_DAYS = 14; // グラフに出す日数
const SCORE_CHART_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// チャートの内寸（viewBox）。svgは幅100%で縮尺されるので、この比率のまま
// 置かれたカードの横幅に合わせて縮む。左側はy軸の目盛り(0/50/100)ぶんだけ広めに取る。
const SCORE_CHART_W = 320;
const SCORE_CHART_H = 176;
const SCORE_CHART_PAD = { left: 30, right: 8, top: 12, bottom: 22 };

function scoreChartEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function scoreChartDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// today（今日）からさかのぼって、n日ぶんの日付キーを返す（新しい日が先頭）
function scoreChartRecentDateKeys(today, n) {
  const keys = [];
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i < n; i++) {
    keys.push(scoreChartDateKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return keys;
}

// container（.score-chart の入れ物）に、直近n日ぶんの点数（0〜100点）を
// 折れ線グラフで描く。記録が無い日も0点として出し、抜けなく続けて見えるように
// する（記録がある日だけを拾うと、サボった日が消えて分かりにくいため）。
// 線の色はアクセント色で統一し、点の色だけgohanDayScoreの段階の色を使う
// （他の画面と同じ意味の色になる）。
function renderScoreChart(container, days, today) {
  const byDate = new Map(days.map((d) => [d.dateStr, d]));
  const points = scoreChartRecentDateKeys(today, SCORE_CHART_DAYS).reverse().map((ds) => {
    const [y, m, d] = ds.split('-').map(Number);
    const weekday = SCORE_CHART_WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return { dateStr: ds, label: `${m}/${d}（${weekday}）`, ...gohanDayScore(byDate.get(ds)) };
  });

  if (!points.length) { container.innerHTML = '<div class="empty">まだ記録がありません</div>'; return; }

  const { left, right, top, bottom } = SCORE_CHART_PAD;
  const plotW = SCORE_CHART_W - left - right;
  const plotH = SCORE_CHART_H - top - bottom;
  const n = points.length;
  const xAt = (i) => left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const yAt = (score) => top + (1 - score / 100) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${yAt(0)} L${xAt(0).toFixed(1)},${yAt(0)} Z`;

  // 最後の1点（今日）はまだ記録が増えるかもしれない「進行中」の値なので、
  // 確定した日々とは見た目を変える：最後の区間は点線、点は塗りつぶさず輪っかにし、
  // 「進行中」の直接ラベルを添える（吹き出しにも同じことを添えている）。
  const confirmedPath = points.slice(0, n - 1)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`).join(' ');
  const todaySegmentPath = n > 1
    ? `M${xAt(n - 2).toFixed(1)},${yAt(points[n - 2].score).toFixed(1)} L${xAt(n - 1).toFixed(1)},${yAt(points[n - 1].score).toFixed(1)}`
    : '';
  const todayPoint = points[n - 1];
  // 上下どちらに置いても軸のラベルや枠にぶつからないよう、点の高さで出す向きを変える
  const todayLabelY = todayPoint.score >= 55 ? yAt(todayPoint.score) + 14 : yAt(todayPoint.score) - 9;
  const todayLabel = ''; // 「進行中」の文字は出さない（点線と輪っかの点で伝える）

  // 段階の帯。点がどの帯に乗っているかで NICE〜EXCELLENT が読み取れる（境目は growth.js と同じ）
  const bands = [
    [0, 30, 'var(--grade-nice)', 'NICE'], [30, 55, 'var(--grade-good)', 'GOOD'],
    [55, 85, 'var(--grade-great)', 'GREAT'], [85, 100, 'var(--grade-excellent)', 'EXCELLENT'],
  ].map(([a, b, c, w]) => `
    <rect class="score-band" x="${left}" y="${yAt(b).toFixed(1)}" width="${plotW}" height="${(yAt(a) - yAt(b)).toFixed(1)}" fill="${c}"></rect>
    <text class="band-label" x="${SCORE_CHART_W - right - 3}" y="${(yAt(b) + 8).toFixed(1)}" text-anchor="end" fill="${c}">${w}</text>`).join('');

  const gridLines = [0, 50, 100].map((v) => `
    <line class="grid-line" x1="${left}" x2="${SCORE_CHART_W - right}" y1="${yAt(v)}" y2="${yAt(v)}"></line>
    <text class="axis-label" x="${left - 4}" y="${yAt(v) + 3}" text-anchor="end">${v}</text>`).join('');

  // 端に寄りすぎると文字が見切れるので、狭い端末でもラベルが重ならない間隔で間引く
  const xLabelStep = Math.ceil(n / 5);
  const xLabels = points.map((p, i) => {
    if (i % xLabelStep !== 0 && i !== n - 1) return '';
    const [, m, d] = p.dateStr.split('-');
    return `<text class="axis-label" x="${xAt(i)}" y="${SCORE_CHART_H - 6}" text-anchor="middle">${Number(m)}/${Number(d)}</text>`;
  }).join('');

  const dots = points.map((p, i) => {
    const isToday = i === n - 1;
    // 今日の点だけ、塗りつぶさず輪っか（穴あき）にして「まだ確定していない」ことを見た目で示す。
    // .score-dot のCSS（stroke: var(--card)）に負けないよう、色はインラインstyleで直接指定する。
    return isToday
      ? `<circle class="score-dot score-dot-today" data-i="${i}" cx="${xAt(i)}" cy="${yAt(p.score)}" r="4" fill="var(--card)" style="stroke:${p.color};stroke-width:2.5px"></circle>`
      : `<circle class="score-dot" data-i="${i}" cx="${xAt(i)}" cy="${yAt(p.score)}" r="4.5" fill="${p.color}"></circle>`;
  }).join('');

  container.innerHTML = `
    <svg class="score-chart-svg" viewBox="0 0 ${SCORE_CHART_W} ${SCORE_CHART_H}">
      ${bands}
      ${gridLines}
      ${xLabels}
      <path class="score-area" d="${areaPath}"></path>
      <path class="score-line" d="${confirmedPath}"></path>
      ${todaySegmentPath ? `<path class="score-line score-line-today" d="${todaySegmentPath}"></path>` : ''}
      ${dots}
      ${todayLabel}
      <line class="score-crosshair" y1="${top}" y2="${top + plotH}"></line>
      <rect class="score-hit" x="${left}" y="${top}" width="${plotW}" height="${plotH}"></rect>
    </svg>
    <div class="score-chart-tip"></div>
    <div class="score-chart-legend">
      <span style="--c:var(--grade-nice)">NICE 〜29</span><span style="--c:var(--grade-good)">GOOD 30〜54</span>
      <span style="--c:var(--grade-great)">GREAT 55〜84</span><span style="--c:var(--grade-excellent)">EXCELLENT 85〜</span>
    </div>`;

  attachScoreChartScrub(container, points, { left, plotW, n });

  // 見出し（「ポイントの推移」）の右に、今日の点数と段階を出す。グラフを読まなくても
  // 「今日は何点で、どの段階か」がすぐ分かるように
  const card = container.closest('.card');
  const heading = card && card.querySelector('h2');
  if (heading) {
    let badge = heading.querySelector('.chart-today');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chart-today';
      heading.classList.add('has-today');
      heading.appendChild(badge);
    }
    badge.innerHTML = `今日 <b>${todayPoint.score}</b><small>/100</small>${todayPoint.word ? ` <em>${scoreChartEsc(todayPoint.word)}</em>` : ''}`;
    badge.style.color = todayPoint.score ? todayPoint.color : '';
  }
}

// 指でなぞる（マウスなら乗せる）と、なぞった位置に一番近い日の点数を
// クロスヘアと吹き出しで出す。線チャートは「点を狙う」より「Xの位置」で
// 拾うほうが指に優しいので、一番近い点にスナップする方式にしている。
function attachScoreChartScrub(container, points, { left, plotW, n }) {
  const svg = container.querySelector('svg');
  const hit = container.querySelector('.score-hit');
  const crosshair = container.querySelector('.score-crosshair');
  const tip = container.querySelector('.score-chart-tip');
  const dotEls = container.querySelectorAll('.score-dot');

  const nearestIndex = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const scale = SCORE_CHART_W / rect.width;
    const x = (clientX - rect.left) * scale;
    const ratio = plotW > 0 ? (x - left) / plotW : 0;
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
  };

  const show = (clientX) => {
    const i = nearestIndex(clientX);
    const p = points[i];
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / SCORE_CHART_W;
    const cx = Number(dotEls[i].getAttribute('cx')) * scale;
    const cy = Number(dotEls[i].getAttribute('cy')) * scale;

    crosshair.setAttribute('x1', dotEls[i].getAttribute('cx'));
    crosshair.setAttribute('x2', dotEls[i].getAttribute('cx'));
    crosshair.style.opacity = '1';

    const isToday = i === points.length - 1;
    tip.innerHTML = `<div class="tip-date">${scoreChartEsc(p.label)}</div>`
      + `<span class="tip-score">${p.score}<small>/100</small></span>`
      + (p.word ? `<span class="tip-word" style="color:${p.color}">${scoreChartEsc(p.word)}</span>` : '');
    tip.style.left = `${cx}px`;
    tip.style.top = `${cy}px`;
    tip.style.setProperty('--tip-shift', '0px');
    tip.classList.add('show');
    // 端に近い点（特に「進行中」の今日）だと、吹き出しがカードの外にはみ出して
    // 見切れることがある。描画されたサイズで測ってから、はみ出したぶんだけ
    // 横にずらす（transformの-50%はCSS側、ずらし量はこのCSS変数で足す）。
    requestAnimationFrame(() => {
      // 前回すでにずらしていると、はみ出し量を「ずらした後」の位置で測って
      // しまい、正しい位置を誤って戻してしまう。測る前に必ず一度0に戻して、
      // 基準となる（ずらす前の）位置で測り直す。
      tip.style.setProperty('--tip-shift', '0px');
      const contRect = container.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      let shift = 0;
      if (tipRect.right > contRect.right - 4) shift = contRect.right - 4 - tipRect.right;
      else if (tipRect.left < contRect.left + 4) shift = contRect.left + 4 - tipRect.left;
      tip.style.setProperty('--tip-shift', `${shift}px`);
    });
  };

  const hide = () => {
    crosshair.style.opacity = '0';
    tip.classList.remove('show');
  };

  hit.addEventListener('pointerdown', (e) => { e.preventDefault(); show(e.clientX); });
  hit.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType !== 'touch') show(e.clientX); });
  hit.addEventListener('pointerup', hide);
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('pointercancel', hide);
}
