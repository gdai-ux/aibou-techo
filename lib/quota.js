// AI機能（音声入力・ふりかえり）の利用枠。
//
// 無料プランでは回数に上限を置き、プレミアムは無制限。回数は ai_events に
// 1回1行で残し、窓（月・週）の中の行数で数える。行が1回ごとに残るので、
// 後から「誰がどれだけ使ったか（＝AI費用）」も追える。
//
// 上限は環境変数で上書きできる（テストと、あとで枠を調整する時のため）。

const { query } = require('./db');

const FREE_LIMITS = {
  voice: { limit: Number(process.env.AI_FREE_VOICE_LIMIT || 20), window: 'month', label: '音声入力', unit: '今月' },
  review: { limit: Number(process.env.AI_FREE_REVIEW_LIMIT || 3), window: 'week', label: 'ふりかえり', unit: '今週' },
  chat: { limit: Number(process.env.AI_FREE_CHAT_LIMIT || 15), window: 'week', label: '相棒とのチャット', unit: '今週' },
};

class QuotaError extends Error {
  constructor(kind, used, limit) {
    const def = FREE_LIMITS[kind];
    super(`${def.unit}の${def.label}の無料枠（${limit}回）を使い切りました。プレミアムなら回数の上限なく使えます。`);
    this.quota = { kind, used, limit };
    this.status = 429;
  }
}

// 窓の始まり。月は1日の0時、週は月曜の0時（サーバーのローカル時刻）
function windowStart(window) {
  const now = new Date();
  if (window === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// 「プレミアムかどうか」は契約（lib/billing.js）が判定する。手動付与（users.plan）・
// Stripeでの契約中に加えて、無料トライアル中もここではプレミアム扱いになる
// （トライアル中はAI機能も無制限にするため）
async function userPlan(userId) {
  const billing = require('./billing');
  const st = await billing.status(userId);
  return st.aiPlan;
}

async function countSince(userId, kind, since) {
  const r = await query(
    `SELECT count(*)::int AS n FROM ai_events WHERE user_id = $1 AND kind = $2 AND created_at >= $3`,
    [userId, kind, since]
  );
  return r.rows[0].n;
}

// 1回ぶん使う。無料枠を超えていれば QuotaError を投げる（何も記録しない）。
// 上限が無い種類（カロリー推定など）は数えるだけ
async function consume(userId, kind) {
  const def = FREE_LIMITS[kind];
  if (def) {
    const plan = await userPlan(userId);
    if (plan !== 'premium') {
      const used = await countSince(userId, kind, windowStart(def.window));
      if (used >= def.limit) throw new QuotaError(kind, used, def.limit);
    }
  }
  await query(`INSERT INTO ai_events (user_id, kind) VALUES ($1, $2)`, [userId, kind]);
}

// 設定画面などに出す「いま何回使ったか」
async function usage(userId) {
  const plan = await userPlan(userId);
  const out = { plan };
  for (const [kind, def] of Object.entries(FREE_LIMITS)) {
    out[kind] = { used: await countSince(userId, kind, windowStart(def.window)), limit: plan === 'premium' ? null : def.limit, window: def.window };
  }
  return out;
}

module.exports = { FREE_LIMITS, QuotaError, consume, usage, userPlan, windowStart };
