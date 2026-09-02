// 記録された内容から、おおよそのカロリー(kcal)をOpenAIに推定させる。
//   - 食事：品目ごとの摂取カロリー（「白米（約230kcal）」）
//   - 運動：その運動での消費カロリー（「ジムで筋トレ1時間（約280kcal消費）」）
// 「ナスの味噌汁」「腹筋マシン27キロ×3、バイク5キロ」のような自由な書き方でも
// 扱えるよう、表を持たずOpenAIに目安として答えてもらう。
// あくまで概算なので、外れていても記録そのものは成立するよう、
// 呼び出し側は失敗時にカロリー無しで記録を続けること。

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// 記録テキストに書き込む形式。品目の末尾に付ける（例: 「白米（約230kcal）」）。
// public/history.js 側でも同じ形を読み取っているので、変える時は両方直すこと。
const KCAL_PATTERN = /（約([\d,]+)kcal）\s*$/;

// 内容から量が読み取れず、カロリーを推定できなかった記録に付ける印。
// これを残さないと「カロリーが付いていない記録」として何度も対象になり、
// いつまでも消えなくなるため、推定できなかったことも記録に残す。
const UNKNOWN_MARK = '（kcal不明）';
const UNKNOWN_PATTERN = /（kcal不明）\s*$/;

// カロリーの判定が済んでいる（数値が付いている、または推定できないと分かっている）か
function isKcalResolved(text) {
  return KCAL_PATTERN.test(text) || UNKNOWN_PATTERN.test(text);
}

// 明らかにおかしい値（1品目で数千kcalなど）は採用しない
const MAX_KCAL_PER_ITEM = 3000;

// 運動の消費カロリー。1回の運動でこれを超える値は採用しない
// （フルマラソンでもおよそ2500kcal程度のため）
const MAX_BURNED_KCAL = 3000;

// 消費カロリーの表記。摂取（「（約230kcal）」）と見分けられるよう「消費」を付ける。
// public/history.js 側でも同じ形を読み取っているので、変える時は両方直すこと。
const BURNED_PATTERN = /（約([\d,]+)kcal消費）\s*$/;

const SYSTEM_PROMPT = `あなたは日本の食事の栄養に詳しいアシスタントです。
渡された品目リストについて、1品目ずつ「1人前として普通に食べる量」のカロリー(kcal)を概算してください。

- 分量の指定がない場合は、日本の一般的な1人前を想定してください
  （例: 白米＝茶碗1杯、味噌汁＝お椀1杯、コーヒー＝マグ1杯）
- 分量や個数が書かれている場合（「白米2杯」「唐揚げ5個」など）はその量で計算してください
- 「鶏肉と大根」のような料理名は、料理1皿として概算してください
- 水・お茶・ブラックコーヒーなど、ほぼ0kcalのものは 0 にしてください
- 食べ物か飲み物か判断できないもの、量が全く見当もつかないものは null にしてください
- 返す配列は、渡された品目と必ず同じ順番・同じ個数にしてください`;

const RESPONSE_SCHEMA = {
  name: 'meal_calories',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      calories: {
        type: 'array',
        description: '品目ごとの概算カロリー(kcal)。順番は入力と同じ。判断できないものはnull。',
        items: { type: ['integer', 'null'] },
      },
    },
    required: ['calories'],
    additionalProperties: false,
  },
};

const BURNED_SYSTEM_PROMPT = `あなたは運動生理学に詳しいアシスタントです。
渡された運動の記録について、その運動で消費したおおよそのカロリー(kcal)を答えてください。

- 体重60kg前後の成人が行った場合を想定してください
- 時間や回数、重量、距離が書かれていればそれを使って計算してください
  （例：「バイク5キロ」「腹筋マシン27キロ×3セット」「ランニング30分」）
- 時間が書かれていない場合は、その運動を一般的に行う長さ（30分〜1時間程度）を想定してください
- 複数の種目が書かれている場合は、合計の消費カロリーを答えてください
- 運動と呼べる内容が読み取れない場合、または量が全く見当もつかない場合は null にしてください
- 基礎代謝は含めず、その運動でよけいに消費したぶんだけを答えてください`;

const BURNED_RESPONSE_SCHEMA = {
  name: 'exercise_calories',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      burnedKcal: {
        type: ['integer', 'null'],
        description: 'その運動で消費したおおよそのカロリー(kcal)。判断できない場合はnull。',
      },
    },
    required: ['burnedKcal'],
    additionalProperties: false,
  },
};

// 運動の内容から消費カロリーを推定する。判断できなければnullを返す。
async function estimateBurnedCalories(apiKey, content) {
  const data = await askOpenAI(apiKey, BURNED_SYSTEM_PROMPT, content, BURNED_RESPONSE_SCHEMA);
  const v = data.burnedKcal;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const kcal = Math.round(v);
  if (kcal <= 0 || kcal > MAX_BURNED_KCAL) return null;
  return kcal;
}

// 運動の内容から、消費カロリー表記を付けた内容と、その値を返す。
async function withBurnedCalories(apiKey, content) {
  const plain = stripBurnedKcal(content);
  const kcal = await estimateBurnedCalories(apiKey, plain);
  return {
    content: kcal === null ? `${plain}${UNKNOWN_MARK}` : `${plain}（約${kcal}kcal消費）`,
    burnedKcal: kcal,
  };
}

// 運動の内容から、既に付いている消費カロリー表記（不明の印を含む）を取り除く
function stripBurnedKcal(content) {
  return String(content).replace(BURNED_PATTERN, '').replace(UNKNOWN_PATTERN, '').trim();
}

// 運動の内容について、カロリーの判定が済んでいるか
function isBurnedResolved(content) {
  return BURNED_PATTERN.test(content) || UNKNOWN_PATTERN.test(content);
}

// 品目文字列から、既に付いているカロリー表記（不明の印を含む）を取り除く。
// （編集して保存し直した時に「約230kcal（約230kcal）」と重ならないようにする）
function stripKcal(item) {
  return String(item).replace(KCAL_PATTERN, '').replace(UNKNOWN_PATTERN, '').trim();
}

// 品目文字列にカロリー表記を付ける。推定できなかった場合は不明の印を付ける。
function appendKcal(item, kcal) {
  const base = stripKcal(item);
  if (kcal === null || kcal === undefined) return `${base}${UNKNOWN_MARK}`;
  return `${base}（約${kcal}kcal）`;
}

// OpenAIに構造化された答えを求める共通処理（食事・運動で使う）
async function askOpenAI(apiKey, systemPrompt, userContent, schema) {
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: schema },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
  }
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('カロリーの推定結果が空でした');
  return JSON.parse(raw);
}

// 品目リストのカロリーを推定して、[数値|null, ...] を品目と同じ順番で返す。
async function estimateItemCalories(apiKey, mealType, items) {
  const parsed = await askOpenAI(apiKey, SYSTEM_PROMPT, JSON.stringify({ mealType, items }), RESPONSE_SCHEMA);
  const list = Array.isArray(parsed.calories) ? parsed.calories : [];
  // 個数がずれた場合や、常識外の値が返った場合は、その品目だけカロリー無しにする
  return items.map((_, i) => {
    const v = list[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const kcal = Math.round(v);
    if (kcal < 0 || kcal > MAX_KCAL_PER_ITEM) return null;
    return kcal;
  });
}

// 品目リストにカロリー表記を付けたリストと、その合計を返す。
// 推定に失敗した場合は元のリストをそのまま返す（記録自体は止めない）。
async function withEstimatedCalories(apiKey, mealType, items) {
  const plain = items.map(stripKcal);
  const kcals = await estimateItemCalories(apiKey, mealType, plain);
  const known = kcals.filter((k) => typeof k === 'number');
  return {
    items: plain.map((item, i) => appendKcal(item, kcals[i])),
    totalKcal: known.length ? known.reduce((a, b) => a + b, 0) : null,
  };
}

module.exports = {
  estimateItemCalories, withEstimatedCalories, stripKcal, appendKcal, KCAL_PATTERN,
  estimateBurnedCalories, withBurnedCalories, stripBurnedKcal, BURNED_PATTERN,
  UNKNOWN_MARK, UNKNOWN_PATTERN, isKcalResolved, isBurnedResolved,
};
