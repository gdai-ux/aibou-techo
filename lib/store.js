// 記録の保存先を1つの顔にそろえる層。
//
// server.js のルートは、保存先が何かを気にせず store の同じメソッドを呼ぶ。
//   - notionStore … 従来の「利用者のNotion」（ページ本文形式 / データベース形式を自動判定）
//   - pgUserStore … Web版の自前DB（利用者IDごと）
//
// どちらも読み取りは60秒だけキャッシュし、書き込みの直後に必ず捨てる
// （画面を1回開くと /api/history が複数回呼ばれるため）。

const crypto = require('crypto');
const { cached, invalidate } = require('./cache');
const notion = require('./notion');
const notionDb = require('./notionDb');
const pgStore = require('./pgStore');
const { fetchHistory } = require('./history');
const { syncNotionToObsidian } = require('./notionSync');

const HISTORY_CACHE_TTL_MS = 60 * 1000;
const HISTORY_FETCH_DAYS = 730;

// ---- Notion（従来） -------------------------------------------------------

// ページ直下に記録データベースがあればDBモード。5分キャッシュする
// （データベースは一度作れば消えない前提。移行直後はキャッシュを直接更新する）
const dbIdCache = new Map(); // pageId -> { dbId, expiresAt }

async function resolveDbId(token, pageId) {
  const hit = dbIdCache.get(pageId);
  if (hit && hit.expiresAt > Date.now()) return hit.dbId;
  let dbId = null;
  try {
    dbId = await notionDb.findDatabaseId(token, pageId);
  } catch (err) {
    // 判定に失敗した時は従来モードで動かす（次のリクエストで再判定）
    return null;
  }
  dbIdCache.set(pageId, { dbId, expiresAt: Date.now() + 5 * 60 * 1000 });
  return dbId;
}

function rememberDbId(pageId, dbId) {
  dbIdCache.set(pageId, { dbId, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function notionCacheKey(token, pageId) {
  // トークンそのものはキーに残さない（ログやダンプに混ざらないように）
  const t = crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);
  return `history:${pageId}:${t}`;
}

function notionStore(token, pageId, { obsidianFilePath } = {}) {
  const key = notionCacheKey(token, pageId);
  const inv = () => invalidate(`history:${pageId}:`);
  return {
    kind: 'notion',
    async storage() {
      return (await resolveDbId(token, pageId)) ? 'db' : 'page';
    },
    async history(limitDays) {
      const all = await cached(key, HISTORY_CACHE_TTL_MS, async () => {
        const dbId = await resolveDbId(token, pageId);
        return dbId
          ? notionDb.dbFetchHistory(token, dbId, HISTORY_FETCH_DAYS)
          : fetchHistory({ token, pageId, limitDays: HISTORY_FETCH_DAYS });
      });
      // キャッシュした配列は共有物なので、切り出しだけ行い中身は書き換えない
      return all.slice(0, limitDays);
    },
    async append(category, payload, dateInfo) {
      const dbId = await resolveDbId(token, pageId);
      if (dbId) await notionDb.dbAppendEntry(token, dbId, category, payload, dateInfo);
      else await notion.appendToNotion(token, pageId, category, payload, dateInfo);
      inv();
    },
    async updateMeta(id, category, payload) {
      const dbId = await resolveDbId(token, pageId);
      if (dbId) await notionDb.dbUpdateMeta(token, id, category, payload);
      else await notion.updateMetaBlock(token, id, category, payload);
      inv();
    },
    async updateMealItems(id, items) {
      const dbId = await resolveDbId(token, pageId);
      if (dbId) await notionDb.dbUpdateMealItems(token, id, items);
      else await notion.updateMealItems(token, pageId, id, items);
      inv();
    },
    async removeMeta(id) {
      const dbId = await resolveDbId(token, pageId);
      if (dbId) await notionDb.dbDeleteRow(token, id);
      else await notion.deleteBlock(token, id);
      inv();
    },
    async removeMeal(id) {
      const dbId = await resolveDbId(token, pageId);
      if (dbId) await notionDb.dbDeleteRow(token, id);
      else await notion.deleteMealBlock(token, pageId, id);
      inv();
    },
    // ふりかえりを保存する。existing（その日の保存済みふりかえり）があれば書き換える
    async saveReview(dateStr, weekday, comment, existing) {
      const dbId = await resolveDbId(token, pageId);
      if (existing) {
        if (dbId) await notionDb.dbUpdateReview(token, existing.blockId, comment);
        else await notion.updateReviewBlock(token, existing.blockId, comment);
      } else if (dbId) {
        await notionDb.dbAppendReview(token, dbId, dateStr, comment);
      } else {
        await notion.appendReviewComment(token, pageId, dateStr, weekday, comment);
      }
      inv();
    },
    async getSettings() {
      return notion.readSettings(token, pageId);
    },
    async saveSettings(patch) {
      const merged = { ...(await notion.readSettings(token, pageId)), ...patch };
      await notion.writeSettings(token, pageId, merged);
      return merged;
    },
    invalidate: inv,
    // 編集後、ローカル環境ならNotionの最新内容でObsidianファイルを追いつかせる。
    // Obsidianはサーバーのローカルファイルに書き込む都合上、これが設定されているのは
    // 基本的にオーナー自身のローカル環境だけ
    async sync() {
      if (!obsidianFilePath || !token || !pageId) return;
      try {
        await syncNotionToObsidian({ token, pageId, filePath: obsidianFilePath });
      } catch (err) {
        console.error('Obsidian同期に失敗しました:', err.message);
      }
    },
  };
}

// ---- 自前DB（Web版） -----------------------------------------------------

function pgUserStore(userId) {
  const key = `history:pg:${userId}`;
  const inv = () => invalidate(key);
  return {
    kind: 'pg',
    async storage() { return 'pg'; },
    async history(limitDays) {
      const all = await cached(key, HISTORY_CACHE_TTL_MS, () => pgStore.fetchHistory(userId, HISTORY_FETCH_DAYS));
      return all.slice(0, limitDays);
    },
    async append(category, payload, dateInfo) { await pgStore.appendEntry(userId, category, payload, dateInfo); inv(); },
    async updateMeta(id, category, payload) { await pgStore.updateMeta(userId, id, category, payload); inv(); },
    async updateMealItems(id, items) { await pgStore.updateMealItems(userId, id, items); inv(); },
    async removeMeta(id) { await pgStore.deleteEntry(userId, id); inv(); },
    async removeMeal(id) { await pgStore.deleteEntry(userId, id); inv(); },
    async saveReview(dateStr, weekday, comment) { await pgStore.upsertReview(userId, dateStr, comment); inv(); },
    async getSettings() { return pgStore.getSettings(userId); },
    async saveSettings(patch) { return pgStore.updateSettings(userId, patch); },
    invalidate: inv,
    async sync() { /* 自前DBにはObsidian同期は無い */ },
  };
}

module.exports = { notionStore, pgUserStore, resolveDbId, rememberDbId };
