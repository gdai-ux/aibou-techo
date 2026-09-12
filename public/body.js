// からだの設定（性別・年齢・身長・体重・活動量）と、そこから出す1日の目安カロリー。
// トップ画面と履歴画面のどちらでも「1日の目安」を出せるよう、別ファイルにしている。
// 入力はこの端末のlocalStorageにだけ保存する（サーバーにもNotionにも送らない）。

const BODY_KEY = 'bodyProfile';

// 身体活動レベル（日本人の食事摂取基準の I / II / III に相当）
const BODY_ACTIVITY = {
  low: { label: '低い', pal: 1.50, note: '一日の大半を座って過ごす' },
  normal: { label: 'ふつう', pal: 1.75, note: '通勤・家事・軽い運動をする' },
  high: { label: '高い', pal: 2.00, note: '立ち仕事や運動の習慣がある' },
};

// 身長・体重が分からない時に出す目安（日本人の食事摂取基準2020年版の
// 推定エネルギー必要量／身体活動レベル「ふつう」）
const BODY_DEFAULT_KCAL = {
  male: [{ to: 29, kcal: 2650 }, { to: 49, kcal: 2700 }, { to: 64, kcal: 2600 }, { to: 999, kcal: 2400 }],
  female: [{ to: 29, kcal: 2000 }, { to: 49, kcal: 2050 }, { to: 64, kcal: 1950 }, { to: 999, kcal: 1850 }],
};

function bodyProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(BODY_KEY) || '{}');
    return {
      sex: raw.sex === 'female' ? 'female' : 'male',
      age: Number(raw.age) > 0 ? Number(raw.age) : null,
      height: Number(raw.height) > 0 ? Number(raw.height) : null,
      weight: Number(raw.weight) > 0 ? Number(raw.weight) : null,
      activity: BODY_ACTIVITY[raw.activity] ? raw.activity : 'normal',
    };
  } catch (e) {
    return { sex: 'male', age: null, height: null, weight: null, activity: 'normal' };
  }
}

function saveBodyProfile(p) {
  try { localStorage.setItem(BODY_KEY, JSON.stringify(p)); } catch (e) { /* 保存できなくても今の画面には効く */ }
  if (window.syncLocalSetting) syncLocalSetting(BODY_KEY);
}

// BMI（体重kg ÷ 身長m の二乗）。日本肥満学会の区分も返す
function bodyBmi(p = bodyProfile()) {
  if (!p.height || !p.weight) return null;
  const m = p.height / 100;
  const bmi = p.weight / (m * m);
  const label = bmi < 18.5 ? '低体重' : bmi < 25 ? '普通体重' : bmi < 30 ? '肥満（1度）' : bmi < 35 ? '肥満（2度）' : '肥満（3度以上）';
  return { value: Math.round(bmi * 10) / 10, label };
}

// 基礎代謝量（Mifflin-St Jeorの式）。年齢・身長・体重がそろっている時だけ出せる
function bodyBmr(p = bodyProfile()) {
  if (!p.age || !p.height || !p.weight) return null;
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return Math.round(p.sex === 'female' ? base - 161 : base + 5);
}

// 1日の目安カロリー。
// 身長・体重・年齢がそろっていれば「基礎代謝 × 身体活動レベル」で個人向けに、
// そろっていなければ年齢と性別だけの一般的な目安を返す
function bodyTargetKcal(p = bodyProfile()) {
  const bmr = bodyBmr(p);
  if (bmr) {
    const act = BODY_ACTIVITY[p.activity] || BODY_ACTIVITY.normal;
    return {
      kcal: Math.round((bmr * act.pal) / 10) * 10,
      personalized: true,
      note: `基礎代謝 ${bmr.toLocaleString('ja-JP')}kcal × 身体活動レベル${act.label}（×${act.pal}）`,
    };
  }
  const table = BODY_DEFAULT_KCAL[p.sex] || BODY_DEFAULT_KCAL.male;
  const age = p.age || 35; // 分からない時は成人のまん中あたりで見積もる
  const row = table.find((r) => age <= r.to) || table[table.length - 1];
  const sexLabel = p.sex === 'female' ? '成人女性' : '成人男性';
  return {
    kcal: row.kcal,
    personalized: false,
    note: `${sexLabel}の目安（日本人の食事摂取基準2020年版・身体活動レベルふつう）。身長と体重を入れると、あなたに合わせた値になります`,
  };
}
