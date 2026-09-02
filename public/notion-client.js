// 他の人が自分のNotionでこのアプリを使うための設定。
// ここで保存する値はこの端末のブラウザ（localStorage）だけに保存され、
// サーバーには保持されない（APIリクエストのたびにヘッダーとして送るだけ）。
//
// オーナー自身の環境（サーバー側に環境変数 NOTION_TOKEN / NOTION_PAGE_ID が
// 設定済み）では、この設定が空のままでもサーバー側がその環境変数に
// フォールバックするので、今まで通り何も設定しなくてよい（後方互換）。
//
// index.html・history.htmlの両方から、他のスクリプトより先に読み込む
// （どちらも起動直後にnotionHeaders()を使ったfetchを行うため）。
const NOTION_SETTINGS_KEY = 'lifelog_notion_settings';

function getNotionSettings() {
  try {
    const raw = localStorage.getItem(NOTION_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setNotionSettings(token, pageId) {
  localStorage.setItem(NOTION_SETTINGS_KEY, JSON.stringify({ token, pageId }));
}

function clearNotionSettings() {
  localStorage.removeItem(NOTION_SETTINGS_KEY);
}

function notionHeaders() {
  const headers = {};
  // Web版（ログインあり）: セッションのトークンを付ける（auth-client.js が用意する）
  if (typeof authAccessToken === 'function') {
    const token = authAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const s = getNotionSettings();
  if (s && s.token && s.pageId) {
    headers['X-Notion-Token'] = s.token;
    headers['X-Notion-Page-Id'] = s.pageId;
  }
  return headers;
}

// 天気を表示する地域（この端末のブラウザだけに保存する）。
// 未設定の場合はサーバー側の既定値（大阪）が使われる。
const WEATHER_LOCATION_KEY = 'lifelog_weather_location';

function getWeatherLocation() {
  try {
    return localStorage.getItem(WEATHER_LOCATION_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setWeatherLocation(name) {
  try {
    if (name) localStorage.setItem(WEATHER_LOCATION_KEY, name);
    else localStorage.removeItem(WEATHER_LOCATION_KEY);
  } catch (e) {
    // プライベートブラウズなどで保存できない場合は既定値のまま使う
  }
}
