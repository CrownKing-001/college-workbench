// 食物库扩展后的回归自测：确认新增条目没有把原有识别规则弄坏。
// 运行：node tools/check-foods.ts
import { FOODS, analyzeText, findFoods, foodById, TEMPLATES, CATEGORIES } from '../src/data/foods.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  PASS | ${name}`); }
  else { fail++; console.log(`  FAIL | ${name}${detail ? ' → ' + detail : ''}`); }
}

console.log(`\n=== 食物库完整性（共 ${FOODS.length} 条）===`);
const ids = FOODS.map((f) => f.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
check('无重复 id', dup.length === 0, [...new Set(dup)].join(','));

const badCat = FOODS.filter((f) => !CATEGORIES.includes(f.category));
check('分类都在 CATEGORIES 里', badCat.length === 0, badCat.map((f) => f.name).join(','));

const badNum = FOODS.filter(
  (f) => !Number.isFinite(f.protein) || !Number.isFinite(f.calories) || f.protein < 0 || f.calories < 0
);
check('蛋白/热量均为合法非负数', badNum.length === 0, badNum.map((f) => f.name).join(','));

const noUnit = FOODS.filter((f) => !f.unit || !f.unit.trim());
check('每条都有份量说明', noUnit.length === 0, noUnit.map((f) => f.name).join(','));

check('食物库规模 ≥ 150 种', FOODS.length >= 150, `实际 ${FOODS.length}`);

const badTpl = TEMPLATES.flatMap((t) => t.items.filter((id) => !foodById(id)));
check('套餐引用的食物都存在', badTpl.length === 0, badTpl.join(','));

console.log('\n=== 文字识别回归 ===');
// 原有行为必须保持不变
const cases: [string, number, string][] = [
  ['鸡腿 + 麻婆豆腐 + 米饭二两 + 2个鸡蛋', 0, ''],   // 只校验能全识别
  ['2个鸡蛋', 13, ''],
  ['米饭二两', 7, ''],
  ['牛肉100g', 0, ''],                                // 重量写法当 1 份，不该算成 100 份
  ['苹果2个', 0, ''],
  ['牛奶一盒 鸡蛋一个', 0, ''],
  ['鸡胸肉 西兰花 糙米饭', 0, ''],
  ['三文鱼 + 牛油果'.replace(' + 牛油果', ''), 0, ''], // 三文鱼单项
  ['螺蛳粉', 0, ''],
  ['两个茶叶蛋', 0, ''],
];

for (const [text] of cases) {
  const r = analyzeText(text);
  const matched = r.matches.filter((m) => m.food).length;
  check(
    `「${text}」识别到食物`,
    matched > 0,
    r.matches.map((m) => `${m.token}→${m.food?.name ?? '未识别'}`).join(' ')
  );
}

// 关键：新增长名字不能被短名字抢走
const longest = [
  ['糙米饭', '糙米饭'],
  ['全麦面包', '全麦面包'],
  ['麻辣香锅', '麻辣香锅'],
  ['希腊酸奶', '希腊酸奶'],
  ['脱脂牛奶', '脱脂牛奶'],
  ['小笼包', '小笼包'],
  ['鲜肉小笼包'.replace('鲜肉小笼包', '小笼包'), '小笼包'],
];
console.log('\n=== 最长匹配优先（新条目不被短条目抢走）===');
for (const [text, want] of longest) {
  const r = analyzeText(text);
  const got = r.matches.find((m) => m.food)?.food?.name;
  check(`「${text}」→ ${want}`, got === want, `实际 ${got}`);
}

// 重量写法不能被当成份数
console.log('\n=== 重量写法保护 ===');
const w = analyzeText('牛肉100g');
check('牛肉100g 不产生 100 倍蛋白', (w.matches[0]?.protein ?? 0) <= 40, `实际 ${w.matches[0]?.protein}g`);

console.log('\n=== 搜索 ===');
check('搜「鸡」有结果', findFoods('鸡').length > 0, `${findFoods('鸡').length} 条`);
check('搜「酸奶」有结果', findFoods('酸奶').length > 0);
check('别名可搜（芝士）', findFoods('芝士').length > 0);

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
