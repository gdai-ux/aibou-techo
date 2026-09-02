// Web版（自前DBモード）のログイン。
//
// ログインそのものは Supabase Auth（メールのマジックリンク）に任せる。
// このファイルの仕事は3つ:
//   1. 起動時に「ログインが必要か・していないか」を /api/status で確かめ、
//      必要ならログイン画面（login.html）へ送る
//   2. ログイン後のセッション（アクセストークン）を localStorage から読んで、
//      API呼び出しのヘッダー（notion-client.js の notionHeaders）に付けられるようにする
//   3. ログアウト・アカウント削除
//
// Notionモード（従来）では /api/status が authRequired=false を返すので、何もしない。
// index.html / history.html / status.html から notion-client.js の後に読み込む。

const AUTH_STATUS_KEY = 'aibou_auth_status'; // 最後に見た /api/status の要点（起動を速くするため）

// supabase-js が localStorage に保存するセッション（sb-<ref>-auth-token）から
// アクセストークンだけを同期的に取り出す。起動直後の fetch にも間に合わせるため、
// supabase-js の初期化を待たない
function authAccessToken() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const s = JSON.parse(raw);
      const token = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
      if (token) return token;
    }
  } catch (e) { /* 読めなければ未ログイン扱い */ }
  return null;
}

let supabaseClient = null;

function authClient(config) {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !config || !config.supabaseUrl || !config.supabaseAnonKey) return null;
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return supabaseClient;
}

// 起動時の確認。ログインが必要なのにしていなければログイン画面へ。
// ログイン済みなら supabase-js を立ち上げて、トークンの自動更新を任せる
async function authBoot() {
  let status = null;
  try {
    const resp = await fetch('/api/status', { headers: notionHeaders() });
    status = await resp.json();
  } catch (e) {
    return; // サーバーに届かない時は、キャッシュ表示（オフライン）に任せる
  }
  try { localStorage.setItem(AUTH_STATUS_KEY, JSON.stringify({ authRequired: !!status.authRequired })); } catch (e) { /* 任意 */ }
  if (!status.authRequired) return;

  const client = authClient(status);
  if (!status.loggedIn) {
    // マジックリンクから戻ってきた直後は、URLの code をセッションに交換してから判断する
    if (client && /[?&]code=/.test(location.search)) {
      const { data } = await client.auth.getSession();
      if (data && data.session) {
        // URLの code を消して、きれいに開き直す（記録の読み込みもやり直される）
        location.replace(location.pathname);
        return;
      }
    }
    const next = encodeURIComponent(location.pathname.replace(/^\//, '') || 'index.html');
    location.replace(`login.html?next=${next}`);
    return;
  }
  // ログイン済み: トークンが切れそうなら supabase-js が裏で更新してくれる
  if (client) client.auth.getSession().catch(() => {});
}

async function authSignOut() {
  const client = authClient(readAuthConfig());
  try { if (client) await client.auth.signOut(); } catch (e) { /* ローカルの掃除だけでも進める */ }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
    }
  } catch (e) { /* 任意 */ }
  location.replace('login.html');
}

// アカウント削除。サーバーが記録と認証側の利用者を消す
async function authDeleteAccount() {
  const resp = await fetch('/api/account', { method: 'DELETE', headers: notionHeaders() });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'アカウントの削除に失敗しました');
  await authSignOut();
}

let authConfigCache = null;
function readAuthConfig() { return authConfigCache; }
// /api/status の結果を authClient に渡すための入口（history.js の設定画面から使う）
async function authConfig() {
  if (authConfigCache) return authConfigCache;
  const resp = await fetch('/api/status', { headers: notionHeaders() });
  authConfigCache = await resp.json();
  return authConfigCache;
}

// この端末で最後に見た「ログインが必要なモードか」。起動直後の出し分けに使う
function authRequiredCached() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_STATUS_KEY) || 'null');
    return !!(s && s.authRequired);
  } catch (e) { return false; }
}

authBoot();
