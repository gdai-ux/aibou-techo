// Notion → Obsidian 同期スクリプト
// クラウド版アプリはNotionにしか書き込めないため、PC起動時などにこれを実行して、
// Notion上にあってObsidianファイルにまだ無い記録を追記する。

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { syncNotionToObsidian } = require('./lib/notionSync');

const OBSIDIAN_FILE_PATH = process.env.OBSIDIAN_FILE_PATH;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;

async function main() {
  if (!OBSIDIAN_FILE_PATH) {
    console.error('OBSIDIAN_FILE_PATH が .env に設定されていません。同期をスキップします。');
    process.exit(1);
  }
  if (!NOTION_TOKEN || !NOTION_PAGE_ID) {
    console.error('NOTION_TOKEN / NOTION_PAGE_ID が .env に設定されていません。同期をスキップします。');
    process.exit(1);
  }

  console.log(`[${new Date().toLocaleString('ja-JP')}] Notion → Obsidian 同期を開始します...`);
  try {
    const result = await syncNotionToObsidian({
      token: NOTION_TOKEN,
      pageId: NOTION_PAGE_ID,
      filePath: OBSIDIAN_FILE_PATH,
    });
    if (result.changed) {
      console.log(`同期完了：${result.changedCount}件のブロックを更新しました（${result.addedDates.join(', ')}）`);
    } else {
      console.log('同期完了：差分はありませんでした（Obsidianは既に最新です）');
    }
  } catch (err) {
    console.error('同期中にエラーが発生しました:', err.message);
    process.exit(1);
  }
}

main();
