// 利用者の認証（Web版・自前DBモード）。
//
// ログインそのものは Supabase Auth（メールのマジックリンク）に任せ、
// サーバーはクライアントが送ってくる JWT（Authorization: Bearer ...）を検証して
// 「誰か」だけを確定する。検証方法は2通り:
//   - SUPABASE_JWT_SECRET  … 共有鍵（HS256）。従来からの Supabase プロジェクトと、
//                             ローカル開発・テストで使う
//   - SUPABASE_JWKS_URL    … 公開鍵（JWKS）。新しい Supabase プロジェクトの既定
// どちらも無ければ認証は動かない（サーバー起動時に警告）。

const { jwtVerify, createRemoteJWKSet, SignJWT } = require('jose');

let jwks = null;

function authConfigured() {
  return Boolean(process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWKS_URL);
}

// トークンを検証して { id, email } を返す。不正なら例外
async function verifyToken(token) {
  const options = { algorithms: undefined };
  let key;
  if (process.env.SUPABASE_JWT_SECRET) {
    key = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
    options.algorithms = ['HS256'];
  } else if (process.env.SUPABASE_JWKS_URL) {
    if (!jwks) jwks = createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL));
    key = jwks;
  } else {
    throw new Error('認証が設定されていません');
  }
  const { payload } = await jwtVerify(token, key, {
    algorithms: options.algorithms,
    // Supabase の JWT は aud が 'authenticated'。ローカルで作るテスト用トークンも同じにする
    audience: 'authenticated',
  });
  if (!payload.sub) throw new Error('トークンに利用者IDがありません');
  return { id: String(payload.sub), email: payload.email ? String(payload.email) : '' };
}

// リクエストから利用者を取り出す（無ければ null）
async function userFromRequest(req) {
  const header = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  try {
    return await verifyToken(m[1].trim());
  } catch (e) {
    return null;
  }
}

// テスト・ローカル開発用: 共有鍵で署名したトークンを作る（Supabase が発行するものと同じ形）
async function signTestToken(user, secret, expiresIn = '1h') {
  return new SignJWT({ email: user.email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

module.exports = { authConfigured, verifyToken, userFromRequest, signTestToken };
