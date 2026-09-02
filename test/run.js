// テストランナー: test/ 内の test-*.js を1本ずつ別プロセスで実行する。
// 各テストは失敗時に非0で終了する（assert）。1本でも失敗したら全体を失敗にする。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /^test-.*\.js$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  process.stdout.write(`\n=== ${f} ===\n`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', timeout: 60000 });
  if (r.status !== 0) {
    failed++;
    console.error(`>>> FAILED: ${f} (exit ${r.status})`);
  }
}
console.log(`\n${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
