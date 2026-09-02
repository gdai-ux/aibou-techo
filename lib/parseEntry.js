// 文字起こしされたテキスト(日本語の自然な話し言葉)から、記録アプリの
// カテゴリ(メモ/運動/食事/睡眠/体調)と各フォーム項目をOpenAIに推定させる。
// 「話すだけでどの項目を選ぶか・何を入力するかまで決めてほしい」という
// 音声入力用途向けの構造化データ抽出。

const { MEAL_TYPES, CONDITION_LEVELS, STOOL_OPTIONS } = require('./format');

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `あなたは、音声入力された日本語のライフログ（運動・食事・睡眠・体調・雑多なメモ）を、
記録アプリのフォーム項目に振り分けるアシスタントです。

まず、話されている内容に最も合うカテゴリを1つだけ選んでください:
- memo: 他のどれにも当てはまらない、雑多な出来事や気づき
- exercise: 運動・トレーニングの内容
- meal: 食事の内容（食べたもの）
- sleep: 睡眠（就寝・起床時刻）
- condition: 体調・調子・排便の状態

その上で、話されている内容から読み取れる項目だけを埋めてください。
話されていない・読み取れない項目は必ず null のままにしてください（値を作り上げたり、推測で補ったりしないでください）。

- time: "HH:MM"（24時間表記）。「さっき」「今」のような相対表現しかない場合は null のままにする
- content: memo/exercise の内容。口語的な言い回しは意味を変えない範囲で自然な文に軽く整える
- mealType: 朝食・昼食・夕食・間食・飲み物 のいずれか（お茶やコーヒー、ジュースなどの飲み物だけの時は 飲み物）
- items: 食べたものを1品目ずつの配列にする
- bedtime / wake: 睡眠のみ。"HH:MM"（24時間表記）
- level: 絶好調・良い・普通・悪い・最悪 のいずれか
- stool: 水っぽい・柔らかめ・普通・硬め のいずれか
- note: condition の補足内容`;

const RESPONSE_SCHEMA = {
  name: 'life_log_entry',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ['memo', 'exercise', 'meal', 'sleep', 'condition'] },
      time: { type: ['string', 'null'] },
      content: { type: ['string', 'null'] },
      mealType: { type: ['string', 'null'], enum: [...MEAL_TYPES, null] },
      items: { type: ['array', 'null'], items: { type: 'string' } },
      bedtime: { type: ['string', 'null'] },
      wake: { type: ['string', 'null'] },
      level: { type: ['string', 'null'], enum: [...CONDITION_LEVELS, null] },
      stool: { type: ['string', 'null'], enum: [...STOOL_OPTIONS, null] },
      note: { type: ['string', 'null'] },
    },
    required: ['category', 'time', 'content', 'mealType', 'items', 'bedtime', 'wake', 'level', 'stool', 'note'],
    additionalProperties: false,
  },
};

async function parseVoiceEntry(apiKey, text) {
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
  }
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('解析結果が空でした');
  return JSON.parse(raw);
}

module.exports = { parseVoiceEntry };
