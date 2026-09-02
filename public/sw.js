// あいぼう手帳 の Service Worker。
// ネットワーク優先＋キャッシュフォールバック方式:
//   - まずネットワークに取りに行き、成功したらキャッシュを更新して返す
//     （デプロイ直後でも常に最新が表示される）
//   - オフラインやサーバーのスリープ中は、最後に見た内容をキャッシュから返す
//     （アプリが開けるので、オフライン再送キューで記録もできる）
// 記録の書き込み（POST等）はここでは触らない。オフライン時の再送は
// index.html側のキュー（localStorage）が担当する。
const CACHE = 'aibou-techo-v1';

// 最初に確保しておく骨格。それ以外のGETも一度見れば自動でキャッシュされる
const CORE = [
  './',
  'index.html',
  'history.html',
  'status.html',
  'history.css',
  'history.js',
  'mascot.js',
  'growth.js',
  'scoreChart.js',
  'status.js',
  'body.js',
  'weather.js',
  'quotes.js',
  'pull-refresh.js',
  'notion-client.js',
  'manifest.json',
  'icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// キャッシュ対象: 同一オリジンのGETのうち、静的ファイルと
// 「オフラインでも見られると嬉しい」読み取りAPIだけ
function shouldCache(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/api/')) return true; // 静的ファイル
  return url.pathname === '/api/history' || url.pathname === '/api/weather' || url.pathname === '/api/status';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // 書き込みは素通し
  const url = new URL(req.url);
  if (!shouldCache(url)) return;

  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => {
        if (hit) return hit;
        // HTMLへのナビゲーションなら、トップのキャッシュで代用する
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }))
  );
});
