// クラウド版アプリはNotionにしか書き込めないため、PCが起動している時に
// Notionページの内容を読み取り、Obsidianファイルに反映するための同期ロジック。
// Notionを正（source of truth）として扱い、Notion上に存在する日付ブロックは
// 内容が違えば丸ごと上書きする（追記だけでなく、編集・削除も反映されるように）。

const fs = require('fs');
const { listAllChildren, blockPlainText } = require('./notion');
const { splitContent, buildBlockText, assembleContent } = require('./obsidian');
const { META_LABELS, MEAL_TYPES } = require('./format');

const META_LABEL_LIST = Object.values(META_LABELS); // ['睡眠', '運動', '体調']

// Notionページの子ブロックを、Obsidian側と同じ { dateStr, weekday, metaLines, meals } の
// 配列に変換する（見出し(heading_2)ごとに1日分のブロックとして区切る）。
function parseNotionBlocksIntoDays(children) {
  const days = [];
  let current = null;
  let currentMeal = null;

  for (const b of children) {
    if (b.type === 'heading_2') {
      const text = blockPlainText(b);
      const m = text.match(/^(\d{4}-\d{2}-\d{2})（(.)）$/);
      if (!m) {
        current = null;
        currentMeal = null;
        continue;
      }
      current = { dateStr: m[1], weekday: m[2], metaLines: [], meals: {} };
      days.push(current);
      currentMeal = null;
      continue;
    }

    if (!current) continue; // 日付見出しより前（案内文など）は無視

    if (b.type === 'paragraph') {
      const text = blockPlainText(b);
      const mealHeader = MEAL_TYPES.find((mt) => text === mt);
      if (mealHeader) {
        currentMeal = mealHeader;
        current.meals[mealHeader] = current.meals[mealHeader] || [];
        continue;
      }
      const metaLabel = META_LABEL_LIST.find((label) => text.startsWith(`${label}：`));
      if (metaLabel) {
        current.metaLines.push(`**${metaLabel}**：${text.slice(metaLabel.length + 1)}`);
      }
      currentMeal = null;
      continue;
    }

    if (b.type === 'bulleted_list_item' && currentMeal) {
      const text = blockPlainText(b);
      current.meals[currentMeal].push(text);
      continue;
    }
  }

  return days;
}

// Notionページを読み取り、Notion上に存在する日付ブロックの内容でObsidianファイルを
// 上書きする（新規追加・編集・削除のいずれも反映される）。Notionに無い日付ブロック
// （このアプリ以前からの記録など）はそのまま保持する。
async function syncNotionToObsidian({ token, pageId, filePath }) {
  const children = await listAllChildren(token, pageId);
  const notionDays = parseNotionBlocksIntoDays(children);

  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const { intro, blocks } = splitContent(content);

  // dateStr -> raw block text（Obsidian側の現状）
  const byDate = new Map();
  const dateOrder = [];
  blocks.forEach((raw) => {
    const headerLine = raw.split('\n')[0];
    const m = headerLine.match(/^## (\d{4}-\d{2}-\d{2})（(.)）$/);
    if (!m) return; // 想定外フォーマットのブロックは触らない（このsyncでは無視）
    const dateStr = m[1];
    dateOrder.push(dateStr);
    byDate.set(dateStr, raw);
  });

  let changedCount = 0;
  const changedDates = [];

  for (const nb of notionDays) {
    const newRaw = buildBlockText(nb);
    const existingRaw = byDate.get(nb.dateStr);
    if (existingRaw === undefined) {
      dateOrder.push(nb.dateStr);
    }
    if (existingRaw !== newRaw) {
      byDate.set(nb.dateStr, newRaw);
      changedCount++;
      changedDates.push(nb.dateStr);
    }
  }

  if (!changedCount) {
    return { changed: false, changedCount: 0, addedDates: [] };
  }

  const uniqueDates = Array.from(new Set(dateOrder)).sort((a, b) => b.localeCompare(a));
  const newBlocks = uniqueDates.map((d) => byDate.get(d));
  const newContent = assembleContent(intro, newBlocks);
  fs.writeFileSync(filePath, newContent, 'utf8');

  return { changed: true, changedCount, addedDates: Array.from(new Set(changedDates)) };
}

module.exports = { syncNotionToObsidian, parseNotionBlocksIntoDays };
