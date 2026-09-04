// 相棒とのチャット（専属パーソナルトレーナー役）。
// キャラクターの人格（名前・口調・性格）をシステムプロンプトに反映しつつ、
// 直近の記録を渡して「あなたの記録」を踏まえた返答にする。
// 症状の診断や治療方針など、医療的な判断が要る話題には立ち入らず、
// 必ず病院・専門家への相談を勧める（自己判断させない）。

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const { REVIEW_TONES, DEFAULT_TONE, summarizeDay } = require('./dailyReview');

// チャットは「ふりかえり」より正確さが求められる（運動・栄養の相談に答えるため）ので、
// カロリー推定・ふりかえりより上位のモデルを使う
const CHAT_MODEL = 'gpt-5.4';

// 会話として毎回渡す安全のための境界線。どのキャラクター・口調でも共通で守る
const SAFETY_SCOPE = `扱ってよい範囲:
- 一般的な運動のやり方・フォーム・メニューの提案
- 一般的な栄養・食事の考え方
- 継続のコツ、モチベーションの話、記録の振り返り

扱ってはいけない範囲（診断・治療の助言はせず、必ず病院や専門家への相談を勧める）:
- 症状の診断、持病がある場合の運動可否の判断、薬との相互作用
- 具体的な病名を挙げた治療方針
- 摂食障害や極端な食事制限につながるような助言

一般的な運動・栄養の話をする時も、断定しすぎず「体調に合わせて」「無理のない範囲で」を
添えること。ケガ・痛み・持病・薬に関する相談が来たら、まず「それは病院で相談してね」と
伝えてから、話せる範囲（生活習慣としての工夫など）があれば補う。`;

function buildSystemPrompt({ tone, name, bio }) {
  const t = REVIEW_TONES[tone] || REVIEW_TONES[DEFAULT_TONE];
  const displayName = name || 'あいぼう';
  return `あなたは「${displayName}」という名前の、ユーザー専属のパーソナルトレーナー兼相棒です。${bio ? `性格: ${bio}。` : ''}
ユーザーが日々の運動・食事・睡眠・体調を記録するアプリの中に住んでいて、
今回はチャット画面でユーザーの相談に答えます。

${t.prompt}

${SAFETY_SCOPE}

会話のルール:
- 返答は日本語で、2〜5文程度を目安にする（長すぎる説明は避け、要点をまとめる）
- 「今の記録」が渡された時は、それを踏まえた具体的な返答にする（渡された数字や内容に触れる）
- 初対面のように振る舞わず、続きの会話として自然に返す
- 人格否定・侮辱はしない（口調が厳しめの設定でも、鼓舞であって攻撃ではない）`;
}

// 直近の記録から、チャットの文脈として渡す短い要約を作る。
// 「今日」の詳細（summarizeDay）＋「直近7日」の運動日数だけの軽い要約にとどめる
// （渡す情報を絞ることで、トークン数とAI費用を抑える）。
function buildChatContext(days, todayDateStr) {
  const today = days.find((d) => d.dateStr === todayDateStr);
  const exerciseDays = days.filter((d) => Array.isArray(d.exercise) && d.exercise.length > 0).length;
  const lines = [`直近7日で運動した日数: ${exerciseDays}日`];
  lines.push(today ? `今日ここまでの記録:\n${summarizeDay(today)}` : '今日はまだ記録が無い');
  return lines.join('\n');
}

// tone/name/bio: 選んでいるキャラクターの人格。context: buildChatContextの結果。
// history: [{role:'user'|'assistant', content}]の直近ぶん。message: 今回の発言
async function chatWithTrainer(apiKey, { tone, name, bio, context, history, message }) {
  const systemContent = context
    ? `${buildSystemPrompt({ tone, name, bio })}\n\n今の記録:\n${context}`
    : buildSystemPrompt({ tone, name, bio });
  const messages = [
    { role: 'system', content: systemContent },
    ...(history || []),
    { role: 'user', content: message },
  ];
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: CHAT_MODEL, temperature: 0.8, messages }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
  }
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('返答の生成に失敗しました');
  return text;
}

module.exports = { chatWithTrainer, buildChatContext };
