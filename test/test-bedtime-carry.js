const { fetchHistory } = require(require('path').join(__dirname, '..', 'lib/history'));

let idSeq = 1;
function makeBlock(type, richTextObj) {
  return { id: 'block-' + (idSeq++), type, [type]: richTextObj };
}
function textBlock(text) {
  return makeBlock('paragraph', { rich_text: [{ plain_text: text }] });
}
function heading(text) {
  return makeBlock('heading_2', { rich_text: [{ plain_text: text }] });
}

// 現実のワークフロー：睡眠記録は「起きた後」に記録するため、見出しの日＝起床した日。
// 08-27（木）の見出しの下に「23:30就寝、06:20起床」がある = 08-26の夜に寝て、
// 08-27の朝に起きて、08-27のうちに記録した、という意味。
const mockChildren = [
  heading('2026-08-27（木）'),
  textBlock('睡眠：23:30就寝、06:20起床（6時間50分）'),
  textBlock('体調：普通'),
  heading('2026-08-25（火）'),
  // 08-25にも起きた後に記録した睡眠（前夜=08-24就寝）
  textBlock('睡眠：22:00就寝、07:00起床（9時間0分）'),
  // 08-26 has no heading at all (gap day) — should get synthesized for bedtimeCarry
];

global.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname.match(/^\/v1\/blocks\/.+\/children$/)) {
    return { ok: true, json: async () => ({ results: mockChildren, has_more: false, next_cursor: null }) };
  }
  throw new Error('unmocked: ' + url);
};

(async () => {
  const days = await fetchHistory({ token: 't', pageId: 'p', limitDays: 30 });
  console.log('all dateStrs in order:', days.map((d) => d.dateStr));

  const d0827 = days.find((d) => d.dateStr === '2026-08-27');
  console.log('08-27 bedtimeCarry (should be null; bedtime belongs to 08-26):', d0827.bedtimeCarry);
  console.log('08-27 sleep (unchanged, still has bedtime+wake):', d0827.sleep);

  const d0826 = days.find((d) => d.dateStr === '2026-08-26');
  console.log('08-26 (synthesized, should carry bedtime 23:30 -> 08-27):', d0826 ? d0826.bedtimeCarry : 'MISSING DAY');
  console.log('08-26 weekday (should be 水):', d0826 ? d0826.weekday : '-');

  const d0824 = days.find((d) => d.dateStr === '2026-08-24');
  console.log('08-24 (synthesized, should carry bedtime 22:00 -> 08-25):', d0824 ? d0824.bedtimeCarry : 'MISSING DAY');

  let allOk = true;
  if (!d0826 || !d0826.bedtimeCarry || d0826.bedtimeCarry.time !== '23:30' || d0826.bedtimeCarry.toDateStr !== '2026-08-27') {
    console.error('FAIL: 08-26 should carry bedtime=23:30 pointing to 08-27');
    allOk = false;
  }
  if (d0826 && d0826.weekday !== '水') {
    console.error('FAIL: 08-26 weekday should be 水');
    allOk = false;
  }
  if (!d0824 || !d0824.bedtimeCarry || d0824.bedtimeCarry.time !== '22:00' || d0824.bedtimeCarry.toDateStr !== '2026-08-25') {
    console.error('FAIL: 08-24 should carry bedtime=22:00 pointing to 08-25, got:', d0824);
    allOk = false;
  }
  if (d0827.bedtimeCarry !== null) {
    console.error('FAIL: 08-27 should NOT have its own bedtimeCarry (nothing sleeps crossing into 08-28 here)');
    allOk = false;
  }
  // order check: days should remain sorted descending by dateStr
  const dateStrs = days.map((d) => d.dateStr);
  const sorted = [...dateStrs].sort().reverse();
  if (JSON.stringify(dateStrs) !== JSON.stringify(sorted)) {
    console.error('FAIL: days not in correct descending order:', dateStrs);
    allOk = false;
  }

  console.log(allOk ? 'ALL ASSERTIONS PASSED' : 'SOME ASSERTIONS FAILED');
  process.exit(allOk ? 0 : 1);
})();
