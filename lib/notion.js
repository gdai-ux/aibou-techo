const { todayInfo, buildMetaText, formatMealItems, META_LABELS } = require('./format');

const NOTION_VERSION = '2022-06-28';

function textRun(content, bold) {
  return { type: 'text', text: { content }, annotations: bold ? { bold: true } : undefined };
}

function paragraphBlock(richText) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
}

function bulletBlock(content) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [textRun(content, false)] },
  };
}

function headingBlock(content) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [textRun(content, false)] } };
}

function blockPlainText(block) {
  const data = block[block.type];
  if (!data || !data.rich_text) return '';
  return data.rich_text.map((r) => r.plain_text || r.text?.content || '').join('');
}

// メタ系カテゴリ(memo/sleep/exercise/condition)の1行分の rich_text を組み立てる
function buildMetaRichText(category, payload) {
  if (!META_LABELS[category]) throw new Error(`unknown category: ${category}`);
  const label = META_LABELS[category];
  const text = buildMetaText(category, payload);
  return [textRun(`${label}：`, true), textRun(text, false)];
}

function buildEntryBlocks(category, payload) {
  if (category === 'meal') {
    const items = formatMealItems(payload);
    return [paragraphBlock([textRun(payload.mealType, true)]), ...items.map(bulletBlock)];
  }
  // 運動は複数行でも1回の入力=1件（1ブロック）。改行はリッチテキストの中にそのまま残す
  return [paragraphBlock(buildMetaRichText(category, payload))];
}

async function notionRequest(token, path, options = {}) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    // 呼び出し側（server.js）が利用者向けの分かりやすいメッセージに変換できるよう、
    // HTTPステータスをエラーオブジェクトに持たせておく。
    // メッセージ自体はサーバーログ用の詳細なものにしておく。
    const err = new Error(`Notion API error (${resp.status}): ${data.message || JSON.stringify(data)}`);
    err.notionStatus = resp.status;
    throw err;
  }
  return data;
}

async function listAllChildren(token, blockId) {
  let results = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: '100' });
    if (cursor) qs.set('start_cursor', cursor);
    const data = await notionRequest(token, `/blocks/${blockId}/children?${qs.toString()}`);
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

async function appendChildren(token, blockId, children, afterId) {
  const body = { children };
  if (afterId) body.after = afterId;
  return notionRequest(token, `/blocks/${blockId}/children`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteBlock(token, blockId) {
  return notionRequest(token, `/blocks/${blockId}`, { method: 'DELETE' });
}

// メタ系カテゴリ(memo/sleep/exercise/condition)の既存ブロック1件を、新しい内容で上書きする
async function updateMetaBlock(token, blockId, category, payload) {
  const richText = buildMetaRichText(category, payload);
  return notionRequest(token, `/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({ paragraph: { rich_text: richText } }),
  });
}

// 指定した日付・食事種別の品目リストを、新しいitemsで丸ごと置き換える。
// mealBlockId は「朝食」等の見出し段落ブロックのID。
async function updateMealItems(token, pageId, mealBlockId, items) {
  const children = await listAllChildren(token, pageId);
  const headerIdx = children.findIndex((b) => b.id === mealBlockId);
  if (headerIdx === -1) throw new Error('meal block not found');

  // 既存の品目(bulleted_list_item)を、次のparagraph/heading_2が出るまで収集して削除
  for (let i = headerIdx + 1; i < children.length; i++) {
    if (children[i].type !== 'bulleted_list_item') break;
    await deleteBlock(token, children[i].id);
  }

  const validItems = items.map((s) => String(s).trim()).filter(Boolean);
  if (!validItems.length) throw new Error('items must have at least one non-empty entry');
  await appendChildren(token, pageId, validItems.map(bulletBlock), mealBlockId);
}

// 食事エントリ(見出し段落＋品目リスト)を丸ごと削除する
async function deleteMealBlock(token, pageId, mealBlockId) {
  const children = await listAllChildren(token, pageId);
  const headerIdx = children.findIndex((b) => b.id === mealBlockId);
  if (headerIdx === -1) throw new Error('meal block not found');

  for (let i = headerIdx + 1; i < children.length; i++) {
    if (children[i].type !== 'bulleted_list_item') break;
    await deleteBlock(token, children[i].id);
  }
  await deleteBlock(token, mealBlockId);
}

// pageId の Notion ページに、今日の日付見出しの下へ entry を追記する。
// 見出しが無ければ、ページ冒頭（案内文の直後）に新規作成する。
async function appendToNotion(token, pageId, category, payload, dateInfo) {
  // dateInfo（{dateStr, weekday}）を渡すとその日のブロックに記録する。
  // 省略時は今日（オフライン再送キューが日をまたいだ時に使う）
  const { dateStr, weekday } = dateInfo || todayInfo();
  const headingText = `${dateStr}（${weekday}）`;

  const children = await listAllChildren(token, pageId);
  const headingIdx = children.findIndex((b) => b.type === 'heading_2' && blockPlainText(b) === headingText);
  const newBlocks = buildEntryBlocks(category, payload);

  if (headingIdx === -1) {
    const firstHeadingIdx = children.findIndex((b) => b.type === 'heading_2');
    let afterId;
    if (firstHeadingIdx > 0) {
      afterId = children[firstHeadingIdx - 1].id;
    } else if (firstHeadingIdx === -1 && children.length) {
      afterId = children[children.length - 1].id;
    }
    await appendChildren(token, pageId, [headingBlock(headingText), ...newBlocks], afterId);
    return;
  }

  let endIdx = children.length;
  for (let i = headingIdx + 1; i < children.length; i++) {
    if (children[i].type === 'heading_2') {
      endIdx = i;
      break;
    }
  }
  const afterId = children[endIdx - 1].id;
  await appendChildren(token, pageId, newBlocks, afterId);
}

// 「きのうのふりかえり」のコメントを、対象日付（今日とは限らない）の見出しの下に
// 追記する。生成は1日1回だけにしたいので、その日の見出しが既に無い＝記録が無い日には
// 呼ばない前提（呼び出し側でdayの有無を見て判断する）。見出しが見つからない場合はエラー。
async function appendReviewComment(token, pageId, dateStr, weekday, comment) {
  const headingText = `${dateStr}（${weekday}）`;
  const children = await listAllChildren(token, pageId);
  const headingIdx = children.findIndex((b) => b.type === 'heading_2' && blockPlainText(b) === headingText);
  if (headingIdx === -1) throw new Error(`${headingText}の見出しが見つかりません`);

  let endIdx = children.length;
  for (let i = headingIdx + 1; i < children.length; i++) {
    if (children[i].type === 'heading_2') {
      endIdx = i;
      break;
    }
  }
  const afterId = children[endIdx - 1].id;
  const block = paragraphBlock([textRun('振り返り：', true), textRun(comment, false)]);
  await appendChildren(token, pageId, [block], afterId);
}

// ふりかえりのコメントを書き換える（口調モードを変えて作り直した時に使う）
async function updateReviewBlock(token, blockId, comment) {
  await notionRequest(token, `/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      paragraph: { rich_text: [textRun('振り返り：', true), textRun(comment, false)] },
    }),
  });
}

// 端末をまたいだ小さな設定（選んだキャラクターなど）を、記録用データベースとは別に
// 連携ページ自身に保存する。専用のブロックを1つ持つだけで、DBは増やさない。
// これにより、どの端末で開いてもサーバー（Notion）から同じ設定を読み直せる。
const SETTINGS_MARKER = 'aibou-techo-settings: ';

function isSettingsBlock(block) {
  return block.type === 'paragraph' && blockPlainText(block).startsWith(SETTINGS_MARKER);
}

// 保存されている設定を読み取る。無ければ（未保存・壊れている）空オブジェクト
async function readSettings(token, pageId) {
  const children = await listAllChildren(token, pageId);
  const block = children.find(isSettingsBlock);
  if (!block) return {};
  try {
    return JSON.parse(blockPlainText(block).slice(SETTINGS_MARKER.length));
  } catch (e) {
    return {};
  }
}

// 設定を保存する（既にブロックがあれば上書き、無ければページ末尾に作る）
async function writeSettings(token, pageId, settings) {
  const richText = [textRun(SETTINGS_MARKER + JSON.stringify(settings), false)];
  const children = await listAllChildren(token, pageId);
  const block = children.find(isSettingsBlock);
  if (block) {
    await notionRequest(token, `/blocks/${block.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paragraph: { rich_text: richText } }),
    });
  } else {
    await appendChildren(token, pageId, [paragraphBlock(richText)]);
  }
}

module.exports = {
  appendToNotion,
  buildEntryBlocks,
  appendReviewComment,
  updateReviewBlock,
  readSettings,
  writeSettings,
  listAllChildren,
  blockPlainText,
  updateMetaBlock,
  updateMealItems,
  deleteMealBlock,
  deleteBlock,
};
