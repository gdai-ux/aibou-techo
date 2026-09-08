// あいぼうラン（ゲームだけのアプリ）の Service Worker。
// 手帳本体（/sw.js）とは別に /game/ の範囲だけを受け持ち、ホーム画面に追加した
// ゲームがオフラインでも開けるようにする。方式は本体と同じネットワーク優先:
// まずネットワークから取り、成功したらキャッシュを更新、失敗したらキャッシュを返す。
const CACHE = 'aibou-run-v1';

const CORE = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'icon-180.png',
  'icon-512.png',
  '../gohan-run.js',
  '../mascot.js',
  '../growth.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }))
  );
});
