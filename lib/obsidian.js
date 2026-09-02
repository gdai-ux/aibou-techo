const fs = require('fs');
const { todayInfo, buildMetaText, formatMealItems, MEAL_TYPES, META_LABELS } = require('./format');

const DEFAULT_INTRO =
  '> [!note] Claudeチャットや専用アプリでログを伝えると、ObsidianとNotion両方に同じ内容を追記します。\n\n# 🍚 体調・食事記録';

// ファイル全体を「intro（最初の日付見出しより前の部分）」と「日付ブロックの配列」に分解する。
// 既存の書式・改行を極力壊さないよう、対象外のブロックは文字列のまま保持する。
function splitContent(content) {
  if (!content || !content.trim()) {
    return { intro: DEFAULT_INTRO, blocks: [] };
  }
  const lines = content.split(/\r?\n/);
  const headerIdxs = [];
  lines.forEach((l, i) => {
    if (/^## \d{4}-\d{2}-\d{2}/.test(l)) headerIdxs.push(i);
  });
  if (!headerIdxs.length) {
    return { intro: content.replace(/\s+$/, ''), blocks: [] };
  }
  const introLines = lines.slice(0, headerIdxs[0]);
  while (introLines.length && introLines[introLines.length - 1].trim() === '') introLines.pop();
  const intro = introLines.join('\n');

  const blocks = [];
  for (let i = 0; i < headerIdxs.length; i++) {
    const start = headerIdxs[i];
    const end = i + 1 < headerIdxs.length ? headerIdxs[i + 1] : lines.length;
    const blockLines = lines.slice(start, end);
    while (blockLines.length && blockLines[blockLines.length - 1].trim() === '') blockLines.pop();
    blocks.push(blockLines.join('\n'));
  }
  return { intro, blocks };
}

// 1つの日付ブロック（見出し行を除いた本文）を、メタ行(睡眠/運動/体調)と食事セクションに分解する
function parseBlockBody(bodyLines) {
  const metaLines = [];
  const meals = {};
  let currentMeal = null;
  for (const raw of bodyLines) {
    const line = raw;
    if (line.trim() === '') {
      currentMeal = null;
      continue;
    }
    const mealHeaderMatch = line.match(/^\*\*(朝食|昼食|夕食|間食|飲み物)\*\*$/);
    if (mealHeaderMatch) {
      currentMeal = mealHeaderMatch[1];
      meals[currentMeal] = meals[currentMeal] || [];
      continue;
    }
    if (currentMeal) {
      const itemMatch = line.match(/^-\s?(.*)$/);
      if (itemMatch) {
        meals[currentMeal].push(itemMatch[1]);
        continue;
      }
    }
    metaLines.push(line);
  }
  return { metaLines, meals };
}

function buildBlockText({ dateStr, weekday, metaLines, meals }) {
  const sections = [];
  if (metaLines.length) sections.push(metaLines.join('\n'));
  for (const mealType of MEAL_TYPES) {
    if (meals[mealType] && meals[mealType].length) {
      sections.push(`**${mealType}**\n` + meals[mealType].map((i) => `- ${i}`).join('\n'));
    }
  }
  const header = `## ${dateStr}（${weekday}）`;
  return sections.length ? `${header}\n\n${sections.join('\n\n')}` : header;
}

function applyEntry(block, category, payload) {
  if (category === 'meal') {
    const items = formatMealItems(payload);
    block.meals[payload.mealType] = block.meals[payload.mealType] || [];
    block.meals[payload.mealType].push(...items);
    return;
  }
  if (!META_LABELS[category]) throw new Error(`unknown category: ${category}`);
  // 運動は複数行でも1回の入力=1件。改行はそのまま残す（2行目以降はラベルなしの続きの行になる）
  const text = buildMetaText(category, payload);
  block.metaLines.push(`**${META_LABELS[category]}**：${text}`);
}

function assembleContent(intro, blocks) {
  const parts = [];
  if (intro && intro.trim()) parts.push(intro);
  parts.push(...blocks);
  return parts.join('\n\n') + '\n';
}

// filePath の Obsidian ノートに、今日の日付ブロックとして entry を追記する。
// 今日のブロックが既にあれば追記マージし、無ければ先頭（最新日付側）に新規作成する。
function appendToObsidian(filePath, category, payload, dateInfo) {
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const { intro, blocks } = splitContent(content);
  // dateInfoを渡すとその日のブロックに記録する（省略時は今日）
  const { dateStr, weekday } = dateInfo || todayInfo();

  const idx = blocks.findIndex((b) => b.split('\n')[0] === `## ${dateStr}（${weekday}）`);

  let block;
  if (idx === -1) {
    block = { dateStr, weekday, metaLines: [], meals: {} };
  } else {
    const bodyLines = blocks[idx].split('\n').slice(1);
    const parsed = parseBlockBody(bodyLines);
    block = { dateStr, weekday, metaLines: parsed.metaLines, meals: parsed.meals };
  }

  applyEntry(block, category, payload);
  const newBlockText = buildBlockText(block);

  if (idx === -1) {
    blocks.unshift(newBlockText);
  } else {
    blocks[idx] = newBlockText;
  }

  const newContent = assembleContent(intro, blocks);
  fs.writeFileSync(filePath, newContent, 'utf8');
  return newBlockText;
}

module.exports = { appendToObsidian, splitContent, parseBlockBody, buildBlockText, assembleContent };
