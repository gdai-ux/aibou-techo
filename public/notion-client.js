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

// ログイン（Supabase Auth）の共通設定。login.html と auth-client.js の両方が
// これを使って supabase-js を初期化する（片方だけ直すとログインが壊れるので一箇所にまとめる）。
//
// flowTypeは 'implicit'。既定の 'pkce' は、リンクを送った時にそのブラウザの
// localStorageへ保存した合言葉（code_verifier）と照合する方式のため、
// 「リンクを送ったブラウザ」と「リンクを開くブラウザ」が同じでないと成立しない。
// スマホではメールアプリが自前のブラウザでリンクを開く（Safariで申し込んでも
// Gmailアプリ内のブラウザで開かれる）ので、localStorageが別物になり必ず失敗していた。
// 'implicit' はトークンがURLに直接載って返るので、どのブラウザで開いても通る。
const SUPABASE_AUTH_OPTIONS = {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
};

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

// APIを呼ぶ共通の入口。
//
// アクセストークンは1時間で切れる。切れたトークンで送るとサーバーは401を返し、
// 画面には「読み込めませんでした」や「読み込み中…」だけが残っていた。
// 起動直後の読み込みは、トークンの取り直し（auth-client.js の authBoot）を
// 待たずに走るので、しばらくぶりに開くたび高い確率でこうなっていた。
// ここで401を受けたら、トークンを取り直して1度だけ送り直す。
// 同時に何本も401になっても、取り直しは1回にまとめる
let apiRefreshing = null;

function apiRefreshToken() {
  if (!apiRefreshing) {
    apiRefreshing = (async () => {
      try {
        if (typeof authClient !== 'function' || typeof authRefreshedToken !== 'function') return null;
        let config = typeof readAuthConfig === 'function' ? readAuthConfig() : null;
        if (!config && typeof authConfig === 'function') config = await authConfig();
        const client = authClient(config);
        return client ? await authRefreshedToken(client) : null;
      } catch (e) {
        return null;
      }
    })();
    // 取り直しが終わったら忘れる（次に切れた時は、また取り直せるように）
    apiRefreshing.finally(() => { apiRefreshing = null; });
  }
  return apiRefreshing;
}

async function apiFetch(url, options = {}) {
  const send = (extra) => fetch(url, {
    ...options,
    headers: { ...notionHeaders(), ...(options.headers || {}), ...(extra || {}) },
  });
  const resp = await send();
  if (resp.status !== 401) return resp;
  const token = await apiRefreshToken();
  if (!token) return resp;  // 取り直せないなら、401をそのまま返す（呼び出し側がエラー表示する）
  return send({ Authorization: `Bearer ${token}` });
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
