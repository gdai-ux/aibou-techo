// --- アプリ自身が新しくなっていないか見て、読み込み直す ---
// ホーム画面に追加して使っていると画面はずっと開いたままになり、
// 「引っぱって更新」も中のデータを取り直すだけなので、アプリ本体
// （HTML/CSS/JS）は最初に開いた時のものが何日も残りつづける。
// 実際に、直したはずの画面が何日も古いまま見えていたことがある。
// ここでは index.html の ETag（サーバーのファイルが変われば変わる）を
// 覚えておき、変わっていたら読み込み直す。
// 書きかけの入力がある時は消えてしまうので、その時は見送る。

(function () {
  const PAGE = 'index.html';
  // 読み込み直した直後にまた読み込み直す、を繰り返さないための間隔
  const RELOAD_GAP_MS = 60 * 1000;
  const RELOAD_KEY = 'appReloadedAt';

  let baseline = null;
  let reloading = false;

  // サーバー側のアプリ本体が入れ替わったかどうかの目印。
  // 中身は要らないので HEAD だけ。オフラインなら null（何もしない）
  async function fingerprint() {
    try {
      const resp = await fetch(PAGE, { method: 'HEAD', cache: 'no-store' });
      if (!resp.ok) return null;
      return resp.headers.get('etag') || resp.headers.get('last-modified') || null;
    } catch (e) {
      return null;
    }
  }

  // 「書きかけ」とみなすのは、いま画面に出ていて、人が打ち込む欄だけ。
  // 時刻の欄（data-allow-24）は最初から「00:00」が入っているので、これを
  // 書きかけと数えると永遠に読み込み直せなくなる。閉じている編集画面の欄も、
  // 画面に出ていないので数えない
  function hasUnsavedInput() {
    const fields = document.querySelectorAll('textarea, input[type="text"], input[type="search"], input[type="number"]');
    return [...fields].some((el) => {
      if (el.matches('[data-allow-24]')) return false;
      if (el.offsetParent === null) return false;
      return String(el.value || '').trim() !== '';
    });
  }

  function reloadedJustNow() {
    try {
      const at = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      return at && Date.now() - at < RELOAD_GAP_MS;
    } catch (e) {
      return false;
    }
  }

  // 新しい版があれば true。書きかけが無ければそのまま読み込み直す
  async function checkAppUpdate() {
    if (reloading) return true;
    const now = await fingerprint();
    if (!now) return false;
    if (!baseline) { baseline = now; return false; }
    if (now === baseline) return false;
    if (hasUnsavedInput() || reloadedJustNow()) return true;
    reloading = true;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) { /* 使えなくても読み込み直す */ }
    location.reload();
    return true;
  }

  window.checkAppUpdate = checkAppUpdate;

  fingerprint().then((tag) => { if (!baseline) baseline = tag; });

  // ホーム画面のアプリは、閉じずに何日も開いたままになりやすい。
  // 前面に戻ってきた時にも見る
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAppUpdate();
  });
})();
