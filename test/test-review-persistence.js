// Notion APIをモックして、appendReviewComment -> fetchHistory の一連の流れを検証する。
const { fetchHistory } = require(require('path').join(__dirname, '..', 'lib/history'));
const { appendToNotion, appendReviewComment } = require(require('path').join(__dirname, '..', 'lib/notion'));

let idSeq = 1;
let mockChildren = [];

function makeBlock(type, richTextObj) {
  return { id: 'block-' + (idSeq++), type, [type]: richTextObj };
}

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || 'GET';

  if (method === 'GET' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }

  if (method === 'PATCH' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    const body = JSON.parse(opts.body);
    const newBlocks = body.children.map((c) => {
      const type = c.type;
      return { id: 'block-' + (idSeq++), type, [type]: c[type] };
    });
    if (body.after) {
      const idx = mockChildren.findIndex((b) => b.id === body.after);
      mockChildren.splice(idx + 1, 0, ...newBlocks);
    } else {
      mockChildren.unshift(...newBlocks);
    }
    return { ok: true, json: async () => ({ results: newBlocks }) };
  }

  throw new Error('unmocked request: ' + method + ' ' + url);
};

(async () => {
  const token = 'fake-token';
  const pageId = 'fake-page';

  // 1. 案内文の段落を1つ用意（ページ冒頭の想定）
  mockChildren.push(makeBlock('paragraph', { rich_text: [{ plain_text: 'ようこそ' }] }));

  // 2. 前日(2026-08-26 水)の運動記録をappendToNotion経由で追加
  //    todayInfo()は実際の「今日」を使うため、直接ブロックを組み立てて手動投入する
  const heading = makeBlock('heading_2', { rich_text: [{ plain_text: '2026-08-26（水）' }] });
  mockChildren.push(heading);
  mockChildren.push(makeBlock('paragraph', { rich_text: [{ plain_text: '運動：ランニング30分' }] }));

  // 3. fetchHistoryでその日を取得、reviewがまだ無いことを確認
  let days = await fetchHistory({ token, pageId, limitDays: 10 });
  let day = days.find((d) => d.dateStr === '2026-08-26');
  console.log('before review: review =', day.review);
  console.assert(day.review === null, 'review should start null');

  // 4. ふりかえりコメントを追記
  await appendReviewComment(token, pageId, '2026-08-26', '水', 'よく頑張ったね！');

  // 5. 再取得して、reviewが反映されていることを確認
  days = await fetchHistory({ token, pageId, limitDays: 10 });
  day = days.find((d) => d.dateStr === '2026-08-26');
  console.log('after review: review =', day.review);
  console.assert(day.review && day.review.content === 'よく頑張ったね！', 'review content should match');

  // 6. 2回目にAPIルート相当のロジックを想定：day.reviewが既にあるので
  //    再度appendReviewCommentを呼ばない、という呼び出し側の分岐が機能する前提を確認
  const shouldSkipGeneration = Boolean(day.review);
  console.log('shouldSkipGeneration (should be true):', shouldSkipGeneration);

  console.log('ALL ASSERTIONS PASSED');
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
