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
  } catch (e) {
    // 天気取得に失敗しても、表示はそのまま続ける
  }
}

applyWeatherTheme();
