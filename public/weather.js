// 大阪の天気を取得して、時計の横にアイコンとテキストで表示する。
// index.html / history.html 両方から読み込む。#weatherIcon / #weatherLabel があれば反映する。
// 時計カード（.clock-card）があれば、天候×昼夜に応じた背景グラデーションも当てる
// （晴れの昼は青空、晴れの夜は紺色の夜空、雨・曇り・雪・霧・雷雨もそれぞれの色合いに）。

const WEATHER_THEMES = {
  'sunny-day':    { colors: ['#0a84ff', '#5ac8fa'], glow: 'rgba(10, 132, 255, 0.45)' },
  'sunny-night':  { colors: ['#0f1b42', '#28356f'], glow: 'rgba(15, 27, 66, 0.55)' },
  'cloudy-day':   { colors: ['#64748b', '#98a6b8'], glow: 'rgba(100, 116, 139, 0.45)' },
  'cloudy-night': { colors: ['#1e2530', '#333d4b'], glow: 'rgba(15, 18, 24, 0.6)' },
  'rain-day':     { colors: ['#3b5875', '#5b7c9a'], glow: 'rgba(35, 52, 70, 0.5)' },
  'rain-night':   { colors: ['#101923', '#223244'], glow: 'rgba(10, 15, 21, 0.6)' },
  'fog-day':      { colors: ['#6b7280', '#98a0ac'], glow: 'rgba(90, 96, 107, 0.45)' },
  'fog-night':    { colors: ['#22262b', '#3a3f46'], glow: 'rgba(15, 17, 20, 0.6)' },
  'snow-day':     { colors: ['#5f81a0', '#96bad3'], glow: 'rgba(66, 92, 114, 0.45)' },
  'snow-night':   { colors: ['#152030', '#2b3b4c'], glow: 'rgba(10, 15, 22, 0.6)' },
  'storm-day':    { colors: ['#332b52', '#584a86'], glow: 'rgba(42, 33, 68, 0.55)' },
  'storm-night':  { colors: ['#1c1734', '#362a58'], glow: 'rgba(15, 12, 26, 0.65)' },
};

// "#0a84ff" のような16進の色を、指定した透明度のrgba()にする
function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function applyClockCardTheme(category, isDay) {
  const card = document.querySelector('.clock-card');
  if (!card || !category) return;
  const key = `${category}-${isDay === false ? 'night' : 'day'}`;
  const theme = WEATHER_THEMES[key] || WEATHER_THEMES['cloudy-day'];
  // 天気の色をベタで塗るとカードだけが浮いて他のカードが負けてしまうので、
  // 半透明の層として重ね、下地のカード色を透かせる。
  // background-image だけを差し替えることで、背景色（--card）はCSS側のまま残る。
  card.style.backgroundImage =
    `linear-gradient(160deg, ${withAlpha(theme.colors[0], 0.62)}, ${withAlpha(theme.colors[1], 0.3)})`;
  card.style.boxShadow = `var(--shadow), var(--edge), 0 14px 34px -22px ${theme.glow}`;
}


// --- ヘッダーの空 -----------------------------------------------------------
// ヘッダーの背景は、以前はキャラクターの「帯の色」で塗っていたが、帯はやめた。
// いまは天気と時間帯で空の色を決める。外の空と画面の中の空がそろっていると、
// アプリを開いた時に「今日はこういう日」と一目で分かる。
// 足元の景色（草原→森→…）はレベルで変わるので、そちらはそのまま。

// 天気ごとの「昼の空」。朝焼け・夕焼け・夜は、この色を寄せて作る
// （24通りを手で決めると調整しきれないので、混ぜて作っている）
const SKY_BASE = {
  sunny:  ['#5c94fc', '#a7dcff'],
  cloudy: ['#8a96a6', '#c3ccd7'],
  rain:   ['#5a6b7d', '#8d9aa8'],
  fog:    ['#8d939c', '#c4c8ce'],
  snow:   ['#7e97ad', '#cfe2ee'],
  storm:  ['#4a4566', '#7b76a0'],
};

// 時間帯。朝焼け → 昼 → 夕焼け → 夜。
// top と bottom で寄せ方を変えているのは、朝焼け・夕焼けは地平線側だけが
// 濃く染まるから（上下を同じだけ混ぜると、空全体が紫になって不自然だった）
const SKY_BANDS = [
  { key: 'dawn',  from: 5,  to: 8,  toward: '#ffb27a', top: 0.20, bottom: 0.52 },
  { key: 'day',   from: 8,  to: 16, toward: null,      top: 0,    bottom: 0 },
  { key: 'dusk',  from: 16, to: 19, toward: '#ff7a45', top: 0.30, bottom: 0.62 },
  { key: 'night', from: 19, to: 29, toward: '#0a1026', top: 0.80, bottom: 0.68 }, // 19時〜翌5時
];

function skyBandNow(hour = new Date().getHours()) {
  const h = hour < 5 ? hour + 24 : hour;
  return SKY_BANDS.find((b) => h >= b.from && h < b.to) || SKY_BANDS[1];
}

// 16進の色を混ぜる（t=0でa、t=1でb）
function mixHex(a, b, t) {
  const parse = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`;
}

let lastWeatherCategory = 'cloudy';

function applyHeaderSky(category) {
  if (category) lastWeatherCategory = category;
  const base = SKY_BASE[lastWeatherCategory] || SKY_BASE.cloudy;
  const band = skyBandNow();
  const top = band.toward ? mixHex(base[0], band.toward, band.top) : base[0];
  const bottom = band.toward ? mixHex(base[1], band.toward, band.bottom) : base[1];
  document.querySelectorAll('.page-header').forEach((header) => {
    header.style.setProperty('--sky-top', top);
    header.style.setProperty('--sky-bottom', bottom);
    header.dataset.sky = band.key;
    header.dataset.weather = lastWeatherCategory;
  });
}

// 時間が進めば空も変わる（開きっぱなしでも夕方・夜になったら暗くなる）
setInterval(() => applyHeaderSky(), 5 * 60 * 1000);

async function applyWeatherTheme() {
  try {
    // 地域は設定画面で各自が指定する（未設定ならサーバー側の既定値＝大阪）
    const location = typeof getWeatherLocation === 'function' ? getWeatherLocation() : '';
    const url = location ? `/api/weather?location=${encodeURIComponent(location)}` : '/api/weather';
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '天気の取得に失敗しました');

    const temp = data.temperature !== undefined && data.temperature !== null ? `${Math.round(data.temperature)}℃` : '';

    const icon = document.getElementById('weatherIcon');
    if (icon && data.icon) icon.textContent = data.icon;

    const label = document.getElementById('weatherLabel');
    if (label && data.description) {
      // 地名はサーバーが実際に取得できた地域名を使う（表記ゆれをそのまま反映する）
      const place = data.locationName || location || '';
      label.textContent = `${place ? place + ' ' : ''}${data.description}${temp ? '　' + temp : ''}`;
    }

    applyClockCardTheme(data.category, data.isDay);
    applyHeaderSky(data.category);
  } catch (e) {
    // 天気取得に失敗しても、表示はそのまま続ける
  }
}

applyHeaderSky();
applyWeatherTheme();
