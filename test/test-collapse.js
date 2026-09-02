const assert = require('assert');
const { collapseRepeatedItems } = require(require('path').join(__dirname, '..', 'lib/format.js'));
const run = (label, fn) => { fn(); console.log('  OK:', label); };
run('繰り返しが1つにまとまる', () => {
  assert.deepStrictEqual(collapseRepeatedItems(['A','B','C','B','C']), ['A','B','C']);
  assert.deepStrictEqual(collapseRepeatedItems(['B','C','B','C','B','C']), ['B','C']);
});
run('実際に起きた形（先頭1件＋10件が6回）', () => {
  const head = ['ビスケット'];
  const block = Array.from({length:10}, (_,i)=>'品目'+i);
  const broken = head.concat(...Array.from({length:6}, () => block));
  assert.strictEqual(broken.length, 61);
  assert.deepStrictEqual(collapseRepeatedItems(broken), head.concat(block));
});
run('重複が無ければそのまま', () => {
  assert.deepStrictEqual(collapseRepeatedItems(['白米','味噌汁','納豆']), ['白米','味噌汁','納豆']);
  assert.deepStrictEqual(collapseRepeatedItems([]), []);
  assert.deepStrictEqual(collapseRepeatedItems(['白米']), ['白米']);
});
run('同じ品目が2つ並ぶだけなら1つにまとまる（コーヒー2杯など）', () => {
  // 連続する完全な重複は繰り返しとみなす。時刻付きで完全一致する場合に限られる
  assert.deepStrictEqual(collapseRepeatedItems(['12:00 コーヒー','12:00 コーヒー']), ['12:00 コーヒー']);
  // 間に別の品目が挟まっていれば、まとめない
  assert.deepStrictEqual(collapseRepeatedItems(['コーヒー','パン','コーヒー']), ['コーヒー','パン','コーヒー']);
});
console.log('ALL ASSERTIONS PASSED');
