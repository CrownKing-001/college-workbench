// 清掉测试过程写进 data/ 的假数据，让应用回到「干净的真实数据」状态。
// 用法：node tools/clean-test-data.cjs [--dry]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dry = process.argv.includes('--dry');

const read = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  } catch {
    return fallback;
  }
};
const write = (f, v) => {
  if (dry) {
    console.log(`  [dry] 会写入 ${f}`);
    return;
  }
  fs.writeFileSync(path.join(dataDir, f), JSON.stringify(v, null, 2) + '\n', 'utf8');
};

const TEST_MARK = '冒烟测试';

let changed = 0;

// 待办：去掉测试项
const todos = read('fitplan-todos.json', []);
const todosClean = todos.filter((t) => !String(t.text ?? '').includes(TEST_MARK));
if (todosClean.length !== todos.length) {
  console.log(`待办：移除 ${todos.length - todosClean.length} 条测试数据`);
  write('fitplan-todos.json', todosClean);
  changed++;
}

// 作业：去掉测试项
const assigns = read('fitplan-assignments.json', []);
const assignsClean = assigns.filter((a) => !String(a.title ?? '').includes(TEST_MARK));
if (assignsClean.length !== assigns.length) {
  console.log(`作业：移除 ${assigns.length - assignsClean.length} 条测试数据`);
  write('fitplan-assignments.json', assignsClean);
  changed++;
}

// 重要事项：去掉测试项
const ms = read('fitplan-milestones.json', []);
const msClean = ms.filter((m) => !String(m.title ?? '').includes(TEST_MARK));
if (msClean.length !== ms.length) {
  console.log(`重要事项：移除 ${ms.length - msClean.length} 条测试数据`);
  write('fitplan-milestones.json', msClean);
  changed++;
}

// 饮食：去掉测试产生的重复「鸡腿×1 + 鸡蛋×1 + 米饭×1」以及同键重复
const diet = read('fitplan-diet-logs.json', []);
const seen = new Set();
const dietClean = [];
let dup = 0;
for (const d of diet) {
  const sig = `${d.date}|${d.meal}|${d.text}`;
  if (seen.has(sig)) {
    dup++;
    continue;
  }
  seen.add(sig);
  dietClean.push(d);
}
if (dup) {
  console.log(`饮食：移除 ${dup} 条重复记录`);
  write('fitplan-diet-logs.json', dietClean);
  changed++;
}

// 其余零散测试文件
for (const f of ['smoke-test.json']) {
  const p = path.join(dataDir, f);
  if (fs.existsSync(p)) {
    console.log(`删除测试文件 ${f}`);
    if (!dry) fs.unlinkSync(p);
    changed++;
  }
}

console.log(changed ? `\n完成，共处理 ${changed} 项` : '\n没有需要清理的内容');
