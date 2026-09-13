// 1日の目安カロリーの計算。画面側（public/body.js）と同じ式をサーバーでも使う。
// ふりかえりのコメントで「目安に対してあと何kcal」と言えるようにするため。
// ＊public/body.js と数式を必ず合わせること（片方だけ直すと、画面の数字と
//   ふりかえりの数字が食い違う）。

const BODY_ACTIVITY = {
  low: { label: '低い', pal: 1.50 },
  normal: { label: 'ふつう', pal: 1.75 },
  high: { label: '高い', pal: 2.00 },
};

const BODY_DEFAULT_KCAL = {
  male: [{ to: 29, kcal: 2650 }, { to: 49, kcal: 2700 }, { to: 64, kcal: 2600 }, { to: 999, kcal: 2400 }],
  female: [{ to: 29, kcal: 2000 }, { to: 49, kcal: 2050 }, { to: 64, kcal: 1950 }, { to: 999, kcal: 1850 }],
};

// settings.local.bodyProfile は、画面側が localStorage に入れている文字列がそのまま入る
function parseBodyProfile(raw) {
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    return {
      sex: p.sex === 'female' ? 'female' : 'male',
      age: Number(p.age) > 0 ? Number(p.age) : null,
      height: Number(p.height) > 0 ? Number(p.height) : null,
      weight: Number(p.weight) > 0 ? Number(p.weight) : null,
      activity: BODY_ACTIVITY[p.activity] ? p.activity : 'normal',
    };
  } catch (e) {
    return null;
  }
}

function bodyTargetKcal(profile) {
  const p = profile;
  if (!p) return null;
  if (p.age && p.height && p.weight) {
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    const bmr = Math.round(p.sex === 'female' ? base - 161 : base + 5);
    const act = BODY_ACTIVITY[p.activity] || BODY_ACTIVITY.normal;
    return Math.round((bmr * act.pal) / 10) * 10;
  }
  const table = BODY_DEFAULT_KCAL[p.sex] || BODY_DEFAULT_KCAL.male;
  const age = p.age || 35;
  const row = table.find((r) => age <= r.to) || table[table.length - 1];
  return row.kcal;
}

// 食事の品目の末尾に付く「（約250kcal）」を足し上げる（画面側と同じ書式）
function dayKcal(day) {
  let total = 0;
  let unknown = 0;
  (day && day.meals ? day.meals : []).forEach((meal) => {
    (meal.items || []).forEach((item) => {
      const m = /（約([\d,]+)kcal）\s*$/.exec(String(item));
      if (m) total += Number(m[1].replace(/,/g, ''));
      else unknown += 1;
    });
  });
  return { total, unknown };
}

module.exports = { parseBodyProfile, bodyTargetKcal, dayKcal };
