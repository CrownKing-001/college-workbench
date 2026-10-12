// 把 eslint 的 JSON 输出整理成「按文件分组」的简表，方便一眼看出哪些文件有问题。
// 用法：npx eslint . -f json > lint.json; node tools/lint-summary.cjs lint.json
const fs = require('node:fs');

const file = process.argv[2] || 'lint.json';
let raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const results = JSON.parse(raw);

let totalErr = 0;
let totalWarn = 0;
for (const f of results) {
  if (!f.messages.length) continue;
  const rel = f.filePath.replace(/^.*ck-college-blank[\\/]/, '');
  const errs = f.messages.filter((m) => m.severity === 2);
  totalErr += errs.length;
  totalWarn += f.messages.length - errs.length;
  console.log(`\n${rel}   errors=${errs.length} warnings=${f.messages.length - errs.length}`);
  for (const m of f.messages) {
    const tag = m.severity === 2 ? 'ERR ' : 'warn';
    const rule = m.ruleId || '';
    console.log(`   ${tag} L${m.line} [${rule}] ${String(m.message).split('\n')[0].slice(0, 100)}`);
  }
}
console.log(`\n合计：${totalErr} errors, ${totalWarn} warnings`);
