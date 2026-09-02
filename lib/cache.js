// 外部サイトへの取得結果を短時間だけメモリに置いておくための、ごく小さな仕組み。
//
// 投資アプリの画面は「開くたびに何十件も外部へ取りに行く」構造なので、
// キャッシュが無いと画面を開き直すだけで外部サイトへ大量のリクエストが飛ぶ。
// 専用のnpmパッケージは足さず、このアプリで必要な分だけを自前で持つ。
//
// 同じキーへの取得が同時に走った場合は、後から来たほうが先行中の取得に相乗りする
// （single flight）。人気の画面を複数人が同時に開いても、外へ出るのは1回で済む。

const entries = new Map(); // key -> { value, expiresAt } / inflight -> Promise

const inflight = new Map();

// key の値をキャッシュから返す。無ければ load() で取得して ttlMs の間だけ保持する。
async function cached(key, ttlMs, load) {
  const hit = entries.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  const running = inflight.get(key);
  if (running) return running;

  const promise = (async () => {
    try {
      const value = await load();
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (err) {
      // 取得に失敗した時、期限切れの古い値が残っていればそれを返す。
      // 「一時的に外部サイトが不調」で画面が真っ白になるより、
      // 少し古いデータが出るほうが実用的なため。
      if (hit) return hit.value;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// 期限切れのエントリが溜まり続けないよう、定期的に掃除する
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of entries) {
    // 期限切れでも「取得失敗時の予備」として1時間は残す
    if (entry.expiresAt + 60 * 60 * 1000 < now) entries.delete(key);
  }
}, 10 * 60 * 1000).unref();

// 指定した接頭辞で始まるキーのキャッシュを捨てる。
// 書き込みの直後に呼び、その後の読み込みが必ず最新を見るようにする。
function invalidate(keyPrefix) {
  for (const key of entries.keys()) {
    if (key.startsWith(keyPrefix)) entries.delete(key);
  }
}

module.exports = { cached, invalidate };
