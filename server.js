const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { appendToObsidian } = require('./lib/obsidian');
const { transcribeAudio } = require('./lib/transcribe');
const { parseVoiceEntry } = require('./lib/parseEntry');
const { withEstimatedCalories, withBurnedCalories, isKcalResolved, isBurnedResolved } = require('./lib/calories');
const { collapseRepeatedItems } = require('./lib/format');
const { fetchHistory } = require('./lib/history');
const { notionStore, pgUserStore, resolveDbId, rememberDbId } = require('./lib/store');
const { userFromRequest, authConfigured } = require('./lib/auth');
const pgStore = require('./lib/pgStore');
const db = require('./lib/db');
const quota = require('./lib/quota');
const notionDb = require('./lib/notionDb');
const crypto = require('crypto');

const { fetchWeather, DEFAULT_LOCATION } = require('./lib/weather');
const { generateDailyReview, REVIEW_TONES, DEFAULT_TONE } = require('./lib/dailyReview');
const { chatWithTrainer, buildChatContext } = require('./lib/trainerChat');
const { yesterdayInfo, todayInfo, dateInfoFor } = require('./lib/format');

const PORT = process.env.PORT || 3800;
const OBSIDIAN_FILE_PATH = process.env.OBSIDIAN_FILE_PATH;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// 保存先のモード。'notion'（既定）は利用者のNotion、'pg' はWeb版の自前DB（要ログイン）
const STORAGE_MODE = process.env.STORAGE === 'pg' ? 'pg' : 'notion';
// Supabase Auth（Web版のログイン）。URL と anon キーはブラウザに渡してよい公開情報
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
// アカウント削除で認証側の利用者も消すための鍵（サーバーだけが持つ。無ければ記録だけ消す）
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const app = express();
// Renderなどのリバースプロキシ配下でも、req.ipが実際の接続元IPになるようにする
// （これが無いと全アクセスがプロキシの内部IPとして扱われ、IPごとのレート制限が
// 意味を成さなくなる）
app.set('trust proxy', true);
app.use(express.json());

// pgモードでは、/api へのリクエストから利用者（JWT）を取り出しておく。
// 未ログインでも 401 はここでは返さず、各ルートが必要な時に LOGIN_REQUIRED を投げる
// （/api/status や /api/weather は未ログインでも使えるため）。
const knownUsers = new Set(); // このプロセスで users 行を用意済みの利用者
app.use('/api', async (req, res, next) => {
  if (STORAGE_MODE !== 'pg') return next();
  try {
    req.user = await userFromRequest(req);
    if (req.user && !knownUsers.has(req.user.id)) {
      await pgStore.ensureUser(req.user.id, req.user.email);
      knownUsers.add(req.user.id);
    }
  } catch (err) {
    console.error('[aibou-techo] 認証の確認に失敗:', err.message);
    req.user = null;
  }
  next();
});

// ---- セキュリティヘッダー ------------------------------------------------
// スクリプトはこのサイト由来のもの（＋各ページのインライン）だけを許可する。
// 万一XSSが紛れ込んでも、外部への送信（connect-src）はこのサイトにしか
// できないため、localStorageのNotionトークンを外へ抜くのが難しくなる。
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; img-src 'self' data:; " +
    // Web版はブラウザから Supabase（ログイン）へ直接つなぐので、そこだけ許可する
    `connect-src 'self'${SUPABASE_URL ? ' ' + SUPABASE_URL : ''}; ` +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// OpenAIを使うエンドポイント（音声文字起こし・スマート音声入力解析・
// 「きのうのふりかえり」生成）には認証もNotion連携チェックも無いため、
// 悪用・誤爆によってオーナーのOpenAI利用料が際限なく増えることを防ぐための
// 簡易レート制限（IPごと・時間窓ごと）。専用のnpmパッケージは使わず、
// メモリ上のカウンターだけで済む簡素な実装にしている。
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10分
const RATE_LIMIT_MAX = 20; // 10分あたり20回まで（音声入力を何度か使う分には十分な余裕を持たせている）
const rateLimitHits = new Map(); // ip -> [timestamp, ...]

// 1回分の枠を消費できたらtrue、上限に達していたらfalseを返す。
function consumeOpenAiQuota(req) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) return false;
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return true;
}

function openaiRateLimit(req, res, next) {
  if (!consumeOpenAiQuota(req)) {
    return res.status(429).json({ error: 'リクエストが多すぎます。しばらく待ってから試してください。' });
  }
  next();
}

// 古いIPのエントリが溜まり続けないよう、定期的に掃除する
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateLimitHits) {
    const fresh = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length) rateLimitHits.set(ip, fresh);
    else rateLimitHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// 他の人がこのアプリを使う場合、自分のNotion integrationトークン・ページIDを
// リクエストヘッダー（X-Notion-Token / X-Notion-Page-Id）で送ってもらうことで、
// サーバー環境変数（オーナー自身のNotion）を上書きできるようにする。
// ヘッダーが無ければ今まで通り環境変数にフォールバックするので、
// オーナー自身の利用（Render本番・ローカル）はこれまでと完全に同じ動作のまま。
function resolveNotionConfig(req) {
  const token = req.get('x-notion-token') || NOTION_TOKEN;
  const pageId = req.get('x-notion-page-id') || NOTION_PAGE_ID;
  return { token, pageId };
}

const NOTION_NOT_CONFIGURED = 'Notionが設定されていません。右上の設定から連携してください。';
const LOGIN_REQUIRED = 'ログインが必要です。';

// リクエストから保存先（store）を決める。pgモードでは認証済みの利用者ごと、
// notionモードではヘッダー/環境変数のNotion設定から作る。無ければ利用者向けのエラー
async function getStore(req) {
  if (STORAGE_MODE === 'pg') {
    if (!req.user) throw new Error(LOGIN_REQUIRED);
    return pgUserStore(req.user.id);
  }
  const { token, pageId } = resolveNotionConfig(req);
  if (!token || !pageId) throw new Error(NOTION_NOT_CONFIGURED);
  return notionStore(token, pageId, { obsidianFilePath: OBSIDIAN_FILE_PATH });
}
const VOICE_UNAVAILABLE = '音声入力は現在ご利用いただけません。';
const CALORIE_UNAVAILABLE = 'カロリーの推定は現在ご利用いただけません。';
const CHAT_UNAVAILABLE = '相棒とのチャットは現在ご利用いただけません。';

// このアプリが自分で投げた「そのまま利用者に見せてよい日本語メッセージ」かどうか。
// OpenAIなど外部APIの生のエラー文をそのまま画面に出さないための判定に使う。
const USER_FACING_MESSAGES = new Set([
  NOTION_NOT_CONFIGURED,
  LOGIN_REQUIRED,
  VOICE_UNAVAILABLE,
  CALORIE_UNAVAILABLE,
  CHAT_UNAVAILABLE,
  '音声が録音できていないようです。もう一度お試しください。',
  '話した内容が読み取れませんでした。もう一度お試しください。',
  'メッセージを入力してください。',
]);
function isUserFacing(err) {
  return USER_FACING_MESSAGES.has(err.message);
}

// Notion APIのエラーをそのまま画面に出すと、英語の技術的なメッセージが
// そのまま利用者に見えてしまい分かりにくい（かつ内部構造が透ける）。
// 原因ごとに、次に何をすればよいかが分かる日本語のメッセージへ変換する。
// 詳細なエラーはサーバーログにだけ残す。
function toUserMessage(err) {
  console.error('[aibou-techo]', err.message);
  if (err.message === LOGIN_REQUIRED) return LOGIN_REQUIRED;
  switch (err.notionStatus) {
    case 401:
      return 'Notionの連携情報が正しくないようです。設定画面でシークレットを確認してください。';
    case 403:
      return 'このNotionページへの権限がありません。ページの「コネクト」から連携を追加してください。';
    case 404:
      return 'Notionページが見つかりません。ページIDが正しいか、ページに連携が追加されているか確認してください。';
    case 429:
      return 'Notion側の制限に達しました。少し待ってからもう一度お試しください。';
    default:
      if (err.notionStatus >= 500) return 'Notion側で問題が起きているようです。少し待ってからもう一度お試しください。';
      // Notion由来でないエラー（バリデーションエラーなど）は、
      // 元々日本語で書かれているのでそのまま見せる
      return err.message;
  }
}

// ルートの失敗を利用者向けの形で返す。未ログインだけは 401 にして、
// 画面側がログインへ誘導できるようにする
function sendError(res, err, prefix) {
  if (err instanceof quota.QuotaError) {
    return res.status(429).json({ error: err.message, quota: err.quota });
  }
  const message = toUserMessage(err);
  const status = err.message === LOGIN_REQUIRED ? 401 : 500;
  res.status(status).json({ error: prefix ? `${prefix}: ${message}` : message });
}

// AI機能の利用枠（Web版だけ）。無料枠を超えていれば QuotaError を投げる。
// Notionモード（自分のAPIキーで動かす形）では数えない
async function consumeAiQuota(req, kind) {
  if (STORAGE_MODE !== 'pg') return;
  if (!req.user) throw new Error(LOGIN_REQUIRED);
  await quota.consume(req.user.id, kind);
}

app.get('/api/status', async (req, res) => {
  if (STORAGE_MODE === 'pg') {
    // Web版: 保存先は自前DB。Notionの設定は不要なので「設定済み」として扱う
    return res.json({
      mode: 'pg',
      authRequired: true,
      loggedIn: Boolean(req.user),
      email: req.user ? req.user.email : '',
      quota: req.user ? await quota.usage(req.user.id).catch(() => null) : null,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      obsidianConfigured: false,
      notionConfigured: true,
      voiceConfigured: Boolean(OPENAI_API_KEY),
      storage: 'pg',
    });
  }
  const { token, pageId } = resolveNotionConfig(req);
  let storage = 'page';
  if (token && pageId) {
    const dbId = await resolveDbId(token, pageId);
    if (dbId) storage = 'db';
  }
  res.json({
    mode: 'notion',
    authRequired: false,
    obsidianConfigured: Boolean(OBSIDIAN_FILE_PATH),
    notionConfigured: Boolean(token && pageId),
    voiceConfigured: Boolean(OPENAI_API_KEY),
    storage,
  });
});

// 端末をまたいだ小さな設定（選んだキャラクターなど）。pgモードはログイン利用者に、
// notionモードは連携ページに保存するので、どの端末で開いても同じ内容になる。
// 未ログイン・未設定なら空オブジェクトを返す（表示は端末側の既定値のまま続ける）
app.get('/api/settings', async (req, res) => {
  try {
    res.json(await (await getStore(req)).getSettings());
  } catch (err) {
    res.json({});
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    res.json(await (await getStore(req)).saveSettings(req.body || {}));
  } catch (err) {
    sendError(res, err, '設定の保存に失敗しました');
  }
});

// 天気（地域ごとに15分キャッシュ、Open-Meteoは無料だが叩きすぎないように）。
// 地域は?location=で指定できる（未指定なら大阪）。利用者ごとに異なる地域を
// 見るため、キャッシュは地域名をキーにしたMapで持つ。
const weatherCache = new Map(); // locationName -> { data, fetchedAt }
const WEATHER_CACHE_MS = 15 * 60 * 1000;

app.get('/api/weather', async (req, res) => {
  const requested = (req.query.location || '').toString().trim().slice(0, 60) || DEFAULT_LOCATION.name;
  try {
    const now = Date.now();
    const cached = weatherCache.get(requested);
    if (cached && now - cached.fetchedAt < WEATHER_CACHE_MS) {
      return res.json(cached.data);
    }
    const data = await fetchWeather(requested);
    weatherCache.set(requested, { data, fetchedAt: now });
    res.json(data);
  } catch (err) {
    console.error('天気の取得に失敗しました:', err.message);
    res.status(500).json({ error: '天気を取得できませんでした。' });
  }
});

// Notionページの内容を履歴表示用に構造化して返す
app.get('/api/history', async (req, res) => {
  try {
    const store = await getStore(req);
    const limitDays = Math.min(Number(req.query.days) || 30, 730);
    const days = await store.history(limitDays);
    res.json({ days });
  } catch (err) {
    sendError(res, err);
  }
});

// 「きのうのふりかえり」：小さなキャラクターが前日の記録を読んで一言コメントする。
// 生成したコメントはNotion側にその日の記録として書き込み、それを唯一の正とする
// （サーバー再起動で消えるメモリ上のキャッシュには頼らない。Renderの無料枠は
// 一定時間アクセスが無いとプロセスが再起動するため、メモリキャッシュだけだと
// 再起動のたびに前日分が再生成され、日によって表示が変わってしまっていた）。
// 一度生成したコメントは日別の記録として残るので、後から履歴でも振り返れる。
app.get('/api/review', openaiRateLimit, async (req, res) => {
  try {
    const store = await getStore(req);

    // ふりかえりの口調（超スパルタ〜超やさしい）。不正な値は既定にする
    const tone = REVIEW_TONES[req.query.tone] ? req.query.tone : DEFAULT_TONE;
    const regenerate = req.query.regenerate === '1';
    // たった今増えた記録の短い説明（クライアントが記録直後に渡す）。
    // コメントが毎回この記録に触れて少しずつ変わるようにする
    const latest = String(req.query.latest || '').slice(0, 200);

    // ふりかえりの対象は「今日ここまで」の記録。記録が増えたり口調を変えたりした時は
    // regenerate=1 で呼ばれ、その時点の進捗で書き直す
    const { dateStr, weekday } = todayInfo();
    const days = await store.history(5);
    const day = days.find((d) => d.dateStr === dateStr) || null;

    // 保存済みのふりかえりを書いた後で記録が編集・追加されていたら、
    // 中身が食い違うので自動で書き直す（例: 睡眠時間を直したのに、
    // ふりかえりが古い時間のままになる）。記録側の最終編集時刻と、
    // ふりかえり自身の最終編集時刻を比べて判断する。
    const staleReview = !!(day && day.review && day.review.editedAt && day.dataEditedAt
      && day.dataEditedAt > day.review.editedAt);

    // 「作り直す」場合と、上の食い違いを見つけた場合は、
    // 保存済みのふりかえりをいまの進捗・口調で書き換える。
    // 前回のコメントも渡して、同じ言い回しの繰り返しを避けさせる
    if ((regenerate || staleReview) && day && day.review && OPENAI_API_KEY) {
      await consumeAiQuota(req, 'review');
      const comment = await generateDailyReview(OPENAI_API_KEY, day, tone, { latest, previous: day.review.content });
      await store.saveReview(dateStr, weekday, comment, day.review);
      return res.json({ dateStr, weekday, comment, hasData: true });
    }

    // 既にNotionに保存済みのふりかえりがあれば、それをそのまま返す（再生成しない）
    if (day && day.review) {
      return res.json({ dateStr, weekday, comment: day.review.content, hasData: true });
    }

    // 今日の記録がまだ無い場合は、OpenAIを呼ばずに固定メッセージにする（コスト・待ち時間を節約）。
    // この場合は書き込む先も無いため、Notionへの保存はしない。
    if (!day) {
      return res.json({ dateStr, weekday, comment: '今日はまだ記録がないよ。まずは1件、記録してみよう！', hasData: false });
    }

    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY が設定されていません');
    await consumeAiQuota(req, 'review');
    const comment = await generateDailyReview(OPENAI_API_KEY, day, tone, { latest });
    await store.saveReview(dateStr, weekday, comment, null);
    res.json({ dateStr, weekday, comment, hasData: true });
  } catch (err) {
    sendError(res, err);
  }
});

// 相棒とのチャット（専属パーソナルトレーナー役）。会話の履歴はサーバーに保存せず、
// クライアントが持ち回す（history）。直近の記録は毎回読み直して文脈として渡す。
app.post('/api/chat', openaiRateLimit, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) throw new Error(CHAT_UNAVAILABLE);
    // ログインの確認は先に（枠の消費より前に、未ログインをはっきり案内する）
    if (STORAGE_MODE === 'pg' && !req.user) throw new Error(LOGIN_REQUIRED);
    const message = String((req.body && req.body.message) || '').trim().slice(0, 1000);
    if (!message) throw new Error('メッセージを入力してください。');
    await consumeAiQuota(req, 'chat');

    const tone = REVIEW_TONES[req.body.tone] ? req.body.tone : DEFAULT_TONE;
    const name = String((req.body && req.body.name) || '').trim().slice(0, 20);
    const bio = String((req.body && req.body.bio) || '').trim().slice(0, 100);
    const rawHistory = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-16)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) }));

    // 直近の記録を文脈として渡す。読めなくても（Notion未設定など）チャット自体は続ける
    let context = '';
    try {
      const store = await getStore(req);
      const days = await store.history(7);
      context = buildChatContext(days, todayInfo().dateStr);
    } catch (e) { /* 文脈なしで返す */ }

    const reply = await chatWithTrainer(OPENAI_API_KEY, { tone, name, bio, context, history, message });
    res.json({ reply });
  } catch (err) {
    sendError(res, err, '相棒とのチャットに失敗しました');
  }
});

// 録音した音声(生バイナリ)を受け取り、OpenAIで文字起こしして返す
app.post('/api/transcribe', openaiRateLimit, express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) throw new Error(VOICE_UNAVAILABLE);
    // ログインの確認は先に（未ログインの空リクエストを「録音できていない」と案内しないように）、
    // 枠の消費は本文の確認の後に（失敗したリクエストで枠を減らさないように）
    if (STORAGE_MODE === 'pg' && !req.user) throw new Error(LOGIN_REQUIRED);
    if (!req.body || !req.body.length) throw new Error('音声が録音できていないようです。もう一度お試しください。');
    await consumeAiQuota(req, 'voice');
    const mimeType = req.headers['content-type'] || 'audio/webm';
    const text = await transcribeAudio(OPENAI_API_KEY, req.body, mimeType);
    res.json({ text });
  } catch (err) {
    if (err instanceof quota.QuotaError || err.message === LOGIN_REQUIRED) return sendError(res, err);
    console.error('[aibou-techo] 文字起こし失敗:', err.message);
    res.status(500).json({ error: isUserFacing(err) ? err.message : '音声をうまく聞き取れませんでした。もう一度お試しください。' });
  }
});

// 文字起こし済みのテキストから、カテゴリと入力項目をOpenAIに推定させる
// （音声だけで項目選択・入力までまとめて行う「スマート音声入力」用）
app.post('/api/parse-entry', openaiRateLimit, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) throw new Error(VOICE_UNAVAILABLE);
    if (STORAGE_MODE === 'pg' && !req.user) throw new Error(LOGIN_REQUIRED);
    const text = (req.body?.text || '').trim();
    if (!text) throw new Error('話した内容が読み取れませんでした。もう一度お試しください。');
    const parsed = await parseVoiceEntry(OPENAI_API_KEY, text);
    res.json(parsed);
  } catch (err) {
    if (err.message === LOGIN_REQUIRED) return sendError(res, err);
    console.error('[aibou-techo] 音声解析失敗:', err.message);
    res.status(500).json({ error: isUserFacing(err) ? err.message : '内容をうまく読み取れませんでした。もう一度お試しください。' });
  }
});

// 食事の記録に、品目から推定したおおよそのカロリーを書き足す。
// カロリーはあくまでおまけなので、キーが無い・上限に達している・推定に失敗した
// といった場合は、何も付けずに記録そのものは通す（payloadは変更しない）。
// 返り値は1食分の合計kcal（推定できなければnull）。
async function attachCalories(req, mealType, payload) {
  if (!OPENAI_API_KEY) return null;
  const items = (payload.items || []).map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) return null;
  if (!consumeOpenAiQuota(req)) return null;
  try {
    await consumeAiQuota(req, 'calorie');
    const estimated = await withEstimatedCalories(OPENAI_API_KEY, mealType, items);
    payload.items = estimated.items;
    return estimated.totalKcal;
  } catch (err) {
    console.error('[aibou-techo] カロリー推定に失敗:', err.message);
    return null;
  }
}

// 運動の記録に、内容から推定したおおよその消費カロリーを書き足す。
// 食事と同じく、推定できなければ何も付けずに記録そのものは通す。
async function attachBurnedCalories(req, payload) {
  if (!OPENAI_API_KEY) return null;
  const content = (payload.content || '').trim();
  if (!content) return null;
  if (!consumeOpenAiQuota(req)) return null;
  try {
    await consumeAiQuota(req, 'calorie');
    const estimated = await withBurnedCalories(OPENAI_API_KEY, content);
    payload.content = estimated.content;
    return estimated.burnedKcal;
  } catch (err) {
    console.error('[aibou-techo] 消費カロリーの推定に失敗:', err.message);
    return null;
  }
}

// --- 過去の記録へのカロリー付け（バックフィル） ---
// カロリー推定を入れる前に記録したぶんには、当然カロリーが付いていない。
// あとからまとめて推定して書き足すための処理。
// OpenAIとNotionへの呼び出しが記録数だけ発生するので、1回のリクエストでは
// BACKFILL_BATCH件までにとどめ、残りは呼び出し側が繰り返す
// （1件あたり数百ミリ秒かかるため、まとめてやるとリクエストが時間切れになる）。
const BACKFILL_BATCH = 12;
const MEAL_TIME_PREFIX = /^(\d{1,2}:\d{2})\s/;

// カロリーの判定が済んでいない記録を集める。
// 推定できなかった記録には「（kcal不明）」の印が付くので、対象には入らない
// （印を付けないと、いつまでも対象に残り続けてしまう）。
function collectBackfillTargets(days) {
  const targets = [];
  for (const day of days) {
    for (const e of day.exercise) {
      if (e.content && !isBurnedResolved(e.content)) {
        targets.push({ kind: 'exercise', blockId: e.blockId, time: e.time, content: e.content });
      }
    }
    for (const meal of day.meals) {
      if (!meal.items.length) continue;
      // 1品目でも判定が済んでいない、または品目が重複している食事を対象にする
      const needsKcal = !meal.items.every(isKcalResolved);
      const duplicated = collapseRepeatedItems(meal.items).length < meal.items.length;
      if (!needsKcal && !duplicated) continue;
      targets.push({ kind: 'meal', blockId: meal.blockId, mealType: meal.mealType, items: meal.items });
    }
  }
  return targets;
}

// 1件ぶんカロリーを付ける。実際にカロリーが付いたら true、
// 内容から推定できずカロリーが付かなかったら false を返す。
async function backfillOne(store, target) {
  if (target.kind === 'exercise') {
    const { content, burnedKcal } = await withBurnedCalories(OPENAI_API_KEY, target.content);
    await store.updateMeta(target.blockId, 'exercise', { time: target.time, content });
    return burnedKcal !== null;
  }
  // 以前の不具合で品目が増えてしまった記録は、繰り返しを1つにまとめてから扱う
  const items = collapseRepeatedItems(target.items);
  // 品目の先頭に付いている時刻は推定に渡さず、書き戻す時に付け直す
  const parts = items.map((raw) => {
    const m = raw.match(MEAL_TIME_PREFIX);
    return { time: m ? m[1] : '', text: raw.replace(MEAL_TIME_PREFIX, '') };
  });
  const estimated = await withEstimatedCalories(OPENAI_API_KEY, target.mealType, parts.map((p) => p.text));
  const restored = estimated.items.map((text, i) => (parts[i].time ? `${parts[i].time} ${text}` : text));
  await store.updateMealItems(target.blockId, restored);
  // 1品目でも推定できなければ、その品目には「（kcal不明）」が付く
  return estimated.items.every((i) => !/（kcal不明）\s*$/.test(i));
}

app.post('/api/backfill-calories', openaiRateLimit, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) throw new Error(CALORIE_UNAVAILABLE);
    const store = await getStore(req);

    const days = await store.history(730);
    const targets = collectBackfillTargets(days);
    const batch = targets.slice(0, BACKFILL_BATCH);

    let updated = 0;
    let unknown = 0;
    let failed = 0;
    for (const target of batch) {
      try {
        // 推定できなかった記録には「（kcal不明）」が書き込まれるので、
        // 次回からは対象に入らない
        if (await backfillOne(store, target)) updated++;
        else unknown++;
      } catch (err) {
        // 1件失敗しても残りは続ける（次回の呼び出しで再度対象になる）
        console.error('[aibou-techo] カロリーの後付けに失敗:', target.kind, err.message);
        failed++;
      }
    }
    await store.sync();
    // remaining は「今回まだ手を付けていない件数」。呼び出し側はこれが0になるまで繰り返す。
    res.json({ updated, unknown, failed, remaining: targets.length - batch.length, total: targets.length });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/entry', async (req, res) => {
  const { category, payload, dateStr } = req.body || {};
  if (!category || !payload) {
    return res.status(400).json({ error: 'category と payload は必須です' });
  }

  // オフライン再送キューが日をまたいで送ってきた記録は、入力した日の
  // ブロックに入れる。今日〜3日前だけ受け付ける（それ以外は不正扱い）
  let dateInfo = null;
  if (dateStr) {
    dateInfo = dateInfoFor(dateStr);
    if (!dateInfo) {
      return res.status(400).json({ error: 'dateStr は YYYY-MM-DD 形式で指定してください' });
    }
    const today = todayInfo().dateStr;
    const diffDays = (Date.parse(today) - Date.parse(dateInfo.dateStr)) / (24 * 60 * 60 * 1000);
    if (diffDays < 0 || diffDays > 3) {
      return res.status(400).json({ error: 'dateStr は今日から3日前までの日付だけ指定できます' });
    }
    if (dateInfo.dateStr === today) dateInfo = null; // 今日なら従来通り
  }

  const result = { obsidian: null, notion: null };
  const warnings = [];

  if (category === 'meal') {
    result.totalKcal = await attachCalories(req, payload.mealType, payload);
  } else if (category === 'exercise') {
    result.burnedKcal = await attachBurnedCalories(req, payload);
  }

  // OBSIDIAN_FILE_PATH が無い環境（クラウドデプロイなど）では、Obsidianへの記録は
  // スキップし、保存先への記録のみ行う（Web版の自前DBモードでは常にスキップ）。
  if (OBSIDIAN_FILE_PATH && STORAGE_MODE === 'notion') {
    try {
      result.obsidian = appendToObsidian(OBSIDIAN_FILE_PATH, category, payload, dateInfo);
    } catch (err) {
      warnings.push(`Obsidianへの記録に失敗しました: ${toUserMessage(err)}`);
    }
  }

  try {
    const store = await getStore(req);
    await store.append(category, payload, dateInfo);
    result.notion = 'ok';
  } catch (err) {
    if (err.message === LOGIN_REQUIRED) return sendError(res, err);
    warnings.push(`記録の保存に失敗しました: ${toUserMessage(err)}`);
  }

  if (warnings.length && !result.notion && !result.obsidian) {
    return res.status(500).json({ error: warnings.join(' / '), result });
  }
  if (warnings.length) {
    return res.status(207).json({ warning: warnings.join(' / '), result });
  }

  res.json({ ok: true, result });
});

// ---- アカウント削除（Web版） -----------------------------------------------
// 記録・利用回数・契約を全部消し、認証側（Supabase）の利用者も消す。
// 認証側の削除には service role の鍵が要るので、無い環境では記録だけ消す
// （その場合もアプリのデータは残らない）。
app.delete('/api/account', async (req, res) => {
  if (STORAGE_MODE !== 'pg') return res.status(400).json({ error: 'このモードではアカウントはありません' });
  try {
    if (!req.user) throw new Error(LOGIN_REQUIRED);
    await pgStore.deleteUser(req.user.id);
    knownUsers.delete(req.user.id);
    let authDeleted = false;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(req.user.id)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      });
      authDeleted = resp.ok;
      if (!resp.ok) console.error('[aibou-techo] 認証側の利用者削除に失敗:', resp.status);
    }
    res.json({ ok: true, authDeleted });
  } catch (err) {
    sendError(res, err, 'アカウントの削除に失敗しました');
  }
});

// ---- データベース形式への移行 --------------------------------------------
// 1回の呼び出しで、まだ移行していない日付を古い方から最大5日ぶんコピーする。
// フロント側は remaining が 0 になるまで繰り返し呼ぶ（カロリー整えと同じ方式）。
// 元のページ本文は消さず、バックアップとしてそのまま残す。
const MIGRATE_DAYS_PER_CALL = 5;

app.post('/api/migrate-db', async (req, res) => {
  if (STORAGE_MODE === 'pg') return res.status(400).json({ error: '自前DBでは移行は不要です' });
  try {
    const { token, pageId } = resolveNotionConfig(req);
    if (!token || !pageId) throw new Error(NOTION_NOT_CONFIGURED);

    let dbId = await resolveDbId(token, pageId);
    if (!dbId) {
      dbId = await notionDb.createDatabase(token, pageId);
      rememberDbId(pageId, dbId);
    }

    // 従来形式のページ本文から全期間を読む（キャッシュは通さない）
    const legacyDays = await fetchHistory({ token, pageId, limitDays: 3650 });
    const doneDates = await notionDb.dbListDates(token, dbId);
    const hasRecords = (d) =>
      d.sleep || d.review || d.exercise.length || d.condition.length || d.memo.length || d.meals.length;
    const targets = legacyDays.filter((d) => hasRecords(d) && !doneDates.has(d.dateStr));

    // 古い日付から順に移す（途中で失敗してもやり直しが単純になる）
    const batch = targets.slice(-MIGRATE_DAYS_PER_CALL);
    let migratedRows = 0;
    for (const day of batch) {
      migratedRows += await notionDb.migrateDay(token, dbId, day);
    }
    notionStore(token, pageId).invalidate();
    res.json({
      migratedDays: batch.length,
      migratedRows,
      remaining: targets.length - batch.length,
      total: legacyDays.filter(hasRecords).length,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// メタ系エントリ(メモ/運動/睡眠/体調)を編集する
app.put('/api/entry/meta', async (req, res) => {
  const { blockId, category, payload } = req.body || {};
  if (!blockId || !category || !payload) {
    return res.status(400).json({ error: 'blockId, category, payload は必須です' });
  }
  try {
    const store = await getStore(req);
    // 運動の内容を書き換えたら消費カロリーも合わなくなるので、推定し直してから保存する
    let burnedKcal = null;
    if (category === 'exercise') burnedKcal = await attachBurnedCalories(req, payload);
    await store.updateMeta(blockId, category, payload);
    await store.sync();
    res.json({ ok: true, burnedKcal });
  } catch (err) {
    sendError(res, err, '編集に失敗しました');
  }
});

// 食事エントリ(品目リスト)を編集する
app.put('/api/entry/meal', async (req, res) => {
  const { mealBlockId, items, mealType } = req.body || {};
  if (!mealBlockId || !Array.isArray(items)) {
    return res.status(400).json({ error: 'mealBlockId, items は必須です' });
  }
  try {
    const store = await getStore(req);
    // 品目を書き換えたらカロリーも合わなくなるので、推定し直してから保存する
    const edited = { items };
    const totalKcal = await attachCalories(req, mealType || null, edited);
    await store.updateMealItems(mealBlockId, edited.items);
    await store.sync();
    res.json({ ok: true, totalKcal });
  } catch (err) {
    sendError(res, err, '編集に失敗しました');
  }
});

// メタ系エントリを削除する
app.delete('/api/entry/meta/:blockId', async (req, res) => {
  try {
    const store = await getStore(req);
    await store.removeMeta(req.params.blockId);
    await store.sync();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, '削除に失敗しました');
  }
});

// 食事エントリ(見出し＋品目)を丸ごと削除する
app.delete('/api/entry/meal/:mealBlockId', async (req, res) => {
  try {
    const store = await getStore(req);
    await store.removeMeal(req.params.mealBlockId);
    await store.sync();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, '削除に失敗しました');
  }
});

async function start() {
  if (STORAGE_MODE === 'pg') {
    // 自前DBのモード: 起動時にスキーマを整え、認証の設定が無ければ注意を出す
    await db.migrate();
    if (!authConfigured()) console.warn('[aibou-techo] SUPABASE_JWT_SECRET も SUPABASE_JWKS_URL も無いため、ログインできません');
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`あいぼう手帳 server running: http://localhost:${PORT} (storage: ${STORAGE_MODE})`);
  });
}
start().catch((err) => {
  console.error('[aibou-techo] 起動に失敗しました:', err.message);
  process.exit(1);
});
