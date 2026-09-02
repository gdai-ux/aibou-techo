const { buildMetaText } = require(require('path').join(__dirname, '..', 'lib/format'));
const { fetchHistory } = require(require('path').join(__dirname, '..', 'lib/history'));

let idSeq = 1;
let mockChildren = [];
function makeBlock(type, richTextObj) {
  return { id: 'block-' + (idSeq++), type, [type]: richTextObj };
}
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || 'GET';
  if (method === 'GET' && u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }
  throw new Error('unmocked: ' + method + ' ' + url);
};

function textBlock(text) {
  return makeBlock('paragraph', { rich_text: [{ plain_text: text }] });
}

(async () => {
  mockChildren.push(makeBlock('heading_2', { rich_text: [{ plain_text: '2026-08-26（水）' }] }));

  const cases = [
    { label: 'stool only', payload: { time: '13:00', level: '', stool: '水っぽい', note: '' } },
    { label: 'note only', payload: { time: '13:05', level: '', stool: '', note: '頭痛がした' } },
    { label: 'stool + note', payload: { time: '13:10', level: '', stool: '柔らかい', note: '腹痛あり' } },
    { label: 'level only (existing)', payload: { time: '13:15', level: '良い', stool: '', note: '' } },
    { label: 'level + stool + note (existing)', payload: { time: '13:20', level: '普通', stool: '硬い', note: 'いつも通り' } },
  ];

  for (const c of cases) {
    const text = buildMetaText('condition', c.payload);
    console.log(c.label, '-> stored text:', JSON.stringify(text));
    mockChildren.push(textBlock(`体調：${text}`));
  }

  // empty everything should throw
  try {
    buildMetaText('condition', { time: '13:25', level: '', stool: '', note: '' });
    console.error('FAIL: empty condition should have thrown');
    process.exit(1);
  } catch (e) {
    console.log('empty condition correctly threw:', e.message);
  }

  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 5 });
  const day = days.find((d) => d.dateStr === '2026-08-26');
  console.log('parsed condition entries:');
  day.condition.forEach((c) => console.log(JSON.stringify(c)));

  const expectations = [
    { time: '13:00', level: null, stool: '水っぽい', note: '' },
    { time: '13:05', level: null, stool: null, note: '頭痛がした' },
    { time: '13:10', level: null, stool: '柔らかい', note: '腹痛あり' },
    { time: '13:15', level: '良い', stool: null, note: '' },
    { time: '13:20', level: '普通', stool: '硬い', note: 'いつも通り' },
  ];

  let allOk = true;
  expectations.forEach((exp, i) => {
    const got = day.condition[i];
    const ok = got.time === exp.time && got.level === exp.level && got.stool === exp.stool && got.note === exp.note;
    if (!ok) {
      allOk = false;
      console.error('MISMATCH at', i, 'expected', exp, 'got', got);
    }
  });

  if (allOk) {
    console.log('ALL ROUND-TRIP ASSERTIONS PASSED');
  } else {
    process.exit(1);
  }
})();
