// 指定した地域の現在の天気を取得する。どれもAPIキー不要:
//   1) Open-Meteo Geocoding（地域名 → 緯度経度・タイムゾーン）
//   2) Open-Meteo Forecast（メインの天気取得先）
//   3) wttr.in（Open-Meteoが失敗した時のバックアップ。共有IPの利用制限にかかりやすいため）
//
// 地域を指定しない場合は大阪を既定値にする（このアプリの元々の挙動との互換のため）。

const DEFAULT_LOCATION = { name: '大阪', latitude: 34.6937, longitude: 135.5023, timezone: 'Asia/Tokyo' };

const CATEGORY_ICONS = {
  sunny: '☀️',
  cloudy: '☁️',
  fog: '🌫️',
  rain: '🌧️',
  snow: '❄️',
  storm: '⛈️',
};
const CATEGORY_DESCRIPTIONS = {
  sunny: '晴れ',
  cloudy: '曇り',
  fog: '霧',
  rain: '雨',
  snow: '雪',
  storm: '雷雨',
};

// WMO Weather interpretation codes (Open-Meteo) を天気カテゴリにまとめる
function categorizeWmo(code) {
  if (code === 0) return 'sunny';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloudy';
}

// wttr.inの天気説明文(英語)からカテゴリを判定する
function categorizeFromText(desc) {
  const d = desc.toLowerCase();
  if (d.includes('thunder')) return 'storm';
  if (d.includes('snow') || d.includes('sleet') || d.includes('ice')) return 'snow';
  if (d.includes('rain') || d.includes('drizzle')) return 'rain';
  if (d.includes('fog') || d.includes('mist')) return 'fog';
  if (d.includes('overcast') || d.includes('cloud')) return 'cloudy';
  if (d.includes('sunny') || d.includes('clear')) return 'sunny';
  return 'cloudy';
}

// wttr.inには正確な日出/日没時刻があるが、フォールバック用途なので
// その地域の現地時刻から簡易的に昼夜を判定する（6-18時を昼とみなす）
function isDaytimeIn(timezone) {
  try {
    const hour = Number(
      new Date().toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })
    );
    return hour >= 6 && hour < 18;
  } catch (e) {
    // 不正なタイムゾーン名が来た場合はサーバー時刻で判定する
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18;
  }
}

// Open-Meteoのジオコーディングは日本語の地名を検索できない（実際に叩いて確認済み）。
// このアプリの利用者は日本語で地名を入れるのが自然なので、47都道府県と
// その県庁所在地は内蔵テーブルで引けるようにしておく。
// ここに無い地名（海外の都市名や英語表記など）はOpen-Meteoのジオコーディングに回す。
const JP_LOCATIONS = {
  '北海道': [43.0642, 141.3469], '札幌': [43.0642, 141.3469],
  '青森': [40.8244, 140.7400], '岩手': [39.7036, 141.1527], '盛岡': [39.7036, 141.1527],
  '宮城': [38.2688, 140.8721], '仙台': [38.2688, 140.8721],
  '秋田': [39.7186, 140.1024], '山形': [38.2404, 140.3633],
  '福島': [37.7503, 140.4676], '茨城': [36.3418, 140.4468], '水戸': [36.3418, 140.4468],
  '栃木': [36.5657, 139.8836], '宇都宮': [36.5657, 139.8836],
  '群馬': [36.3907, 139.0604], '前橋': [36.3907, 139.0604],
  '埼玉': [35.8570, 139.6489], 'さいたま': [35.8570, 139.6489],
  '千葉': [35.6051, 140.1233],
  '東京': [35.6895, 139.6917], '東京都': [35.6895, 139.6917],
  '神奈川': [35.4478, 139.6425], '横浜': [35.4478, 139.6425], '川崎': [35.5308, 139.7029],
  '新潟': [37.9026, 139.0232], '富山': [36.6953, 137.2113],
  '石川': [36.5947, 136.6256], '金沢': [36.5947, 136.6256],
  '福井': [36.0652, 136.2216], '山梨': [35.6642, 138.5684], '甲府': [35.6642, 138.5684],
  '長野': [36.6513, 138.1810], '岐阜': [35.3912, 136.7223],
  '静岡': [34.9769, 138.3831], '浜松': [34.7108, 137.7261],
  '愛知': [35.1802, 136.9066], '名古屋': [35.1802, 136.9066],
  '三重': [34.7303, 136.5086], '津': [34.7303, 136.5086],
  '滋賀': [35.0045, 135.8686], '大津': [35.0045, 135.8686],
  '京都': [35.0116, 135.7681],
  '大阪': [34.6937, 135.5023],
  '兵庫': [34.6913, 135.1830], '神戸': [34.6913, 135.1830],
  '奈良': [34.6851, 135.8048],
  '和歌山': [34.2261, 135.1675], '鳥取': [35.5039, 134.2377],
  '島根': [35.4723, 133.0505], '松江': [35.4723, 133.0505],
  '岡山': [34.6618, 133.9350], '広島': [34.3853, 132.4553],
  '山口': [34.1859, 131.4706], '徳島': [34.0658, 134.5593],
  '香川': [34.3401, 134.0434], '高松': [34.3401, 134.0434],
  '愛媛': [33.8416, 132.7657], '松山': [33.8416, 132.7657],
  '高知': [33.5597, 133.5311],
  '福岡': [33.5904, 130.4017], '佐賀': [33.2494, 130.2988],
  '長崎': [32.7448, 129.8737], '熊本': [32.7898, 130.7417],
  '大分': [33.2382, 131.6126], '宮崎': [31.9111, 131.4239],
  '鹿児島': [31.5602, 130.5581], '沖縄': [26.2124, 127.6809], '那覇': [26.2124, 127.6809],
};

// 内蔵テーブルから引く（「〜都/道/府/県/市」が付いていても引けるようにする）
function lookupJapaneseLocation(name) {
  const trimmed = name.replace(/[都道府県市]$/, '');
  const hit = JP_LOCATIONS[name] || JP_LOCATIONS[trimmed];
  if (!hit) return null;
  return { name, latitude: hit[0], longitude: hit[1], timezone: 'Asia/Tokyo' };
}

// 地域名（「大阪」「Tokyo」「London」など）から緯度経度・タイムゾーンを引く。
// 見つからない場合はnullを返す（呼び出し側で既定値にフォールバックする）。
async function geocodeLocation(name) {
  const jp = lookupJapaneseLocation(name);
  if (jp) return jp;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ja&format=json`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Open-Meteo geocoding error: ${JSON.stringify(data)}`);
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone || 'auto',
  };
}

async function fetchFromOpenMeteo(location) {
  const tz = encodeURIComponent(location.timezone || 'auto');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=weather_code,temperature_2m,is_day&timezone=${tz}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Open-Meteo error: ${JSON.stringify(data)}`);
  const category = categorizeWmo(data.current?.weather_code);
  return { category, temperature: data.current?.temperature_2m, isDay: data.current?.is_day === 1 };
}

async function fetchFromWttr(location) {
  const resp = await fetch(`https://wttr.in/${encodeURIComponent(location.name)}?format=j1`);
  const data = await resp.json();
  if (!resp.ok) throw new Error(`wttr.in error: ${JSON.stringify(data)}`);
  const current = data.current_condition?.[0];
  if (!current) throw new Error('wttr.in: no current_condition');
  const category = categorizeFromText(current.weatherDesc?.[0]?.value || '');
  return { category, temperature: Number(current.temp_C), isDay: isDaytimeIn(location.timezone) };
}

// 地域名を渡すとその地域の天気を返す。省略・未解決の場合は大阪の天気を返す。
async function fetchWeather(locationName) {
  let location = DEFAULT_LOCATION;
  const requested = (locationName || '').trim();
  if (requested && requested !== DEFAULT_LOCATION.name) {
    try {
      const found = await geocodeLocation(requested);
      if (found) location = found;
    } catch (e) {
      // 地域の解決に失敗した場合は既定値（大阪）のまま続行する
    }
  }

  let result;
  try {
    result = await fetchFromOpenMeteo(location);
  } catch (primaryErr) {
    try {
      result = await fetchFromWttr(location);
    } catch (fallbackErr) {
      throw new Error(`両方の天気取得先で失敗しました（Open-Meteo: ${primaryErr.message} / wttr.in: ${fallbackErr.message}）`);
    }
  }
  // 「晴れ」は夜間だと🌙（月）にする。それ以外のカテゴリは昼夜共通のアイコンのまま。
  const isClearNight = result.category === 'sunny' && result.isDay === false;
  const icon = isClearNight ? '🌙' : CATEGORY_ICONS[result.category];
  const description = isClearNight ? '快晴' : CATEGORY_DESCRIPTIONS[result.category];
  return {
    locationName: location.name,
    category: result.category,
    isDay: result.isDay,
    icon,
    description,
    label: `${icon} ${description}`,
    temperature: result.temperature,
  };
}

module.exports = { fetchWeather, DEFAULT_LOCATION };
