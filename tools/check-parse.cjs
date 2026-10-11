// 饮食解析边界用例测试：尽量覆盖中文口语里的各种写法，找出识别不到的情况。
// 用法：node tools/check-parse.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/data/foods.ts'), 'utf8');
const start = src.indexOf('export const FOODS: FoodItem[] = [');
const body = src.slice(start, src.indexOf('];', start));

const foods = [];
{
  const re = /\{ id: '([^']+)', name: '([^']+)'(?:, alias: \[([^\]]*)\])?, unit: '([^']*)', protein: ([\d.]+), calories: ([\d.]+)/g;
  let m;
  while ((m = re.exec(body))) {
    foods.push({
      id: m[1], name: m[2],
      alias: m[3] ? m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [],
      unit: m[4], protein: +m[5], calories: +m[6],
    });
  }
}

// —— 与 src/data/foods.ts 同步的解析实现 ——
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNIT = '个|份|碗|杯|根|块|片|包|勺|两|只|条|盒|瓶|盘|袋|颗|串';
const WEIGHT_UNIT = /^(.*?)\s*(\d+(?:\.\d+)?)\s*(g|G|克|kg|KG|千克|ml|ML|毫升|斤)$/;
const tokenize = (t) => {
  const glued = t.replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(?=(?:${UNIT}))`, 'g'), '$1');
  return glued
    .split(/[+＋、,，;；/\n\r\t]|(?:\s+和\s+)|(?:\s*配\s*)/)
    .flatMap((seg) => seg.split(/\s+/))
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 20);
};
const findFoods = (q) => {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return foods.filter((f) => f.name.toLowerCase().includes(s) || f.alias.some((a) => a.toLowerCase().includes(s)));
};

function parseQty(token) {
  const w = token.match(WEIGHT_UNIT);
  if (w && w[1].trim()) return { qty: 1, namePart: w[1].trim(), approx: `${w[2]}${w[3]}` };
  const lead = token.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})?\\s*(.+)$`));
  if (lead && lead[2].trim()) return { qty: Number(lead[1]), namePart: lead[2].trim() };
  const leadCn = token.match(new RegExp(`^([一二两三四五六七八九十])\\s*(?:${UNIT})?\\s*(.+)$`));
  if (leadCn && CN_NUM[leadCn[1]] && leadCn[2].trim()) return { qty: CN_NUM[leadCn[1]], namePart: leadCn[2].trim() };
  const trail = token.match(new RegExp(`^(.+?)\\s*([一二两三四五六七八九十]|\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})$`));
  if (trail) {
    const qty = /^\d/.test(trail[2]) ? Number(trail[2]) : CN_NUM[trail[2]];
    if (trail[1].trim() && qty) return { qty, namePart: trail[1].trim() };
  }
  const times = token.match(/^(.+?)\s*[xX×*]\s*(\d+(?:\.\d+)?)$/);
  if (times) {
    const qty = Number(times[2]);
    if (times[1].trim() && qty > 0) return { qty, namePart: times[1].trim() };
  }
  const mid = token.match(new RegExp(`^(.+?)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})$`));
  if (mid) {
    const qty = Number(mid[2]);
    if (mid[1].trim() && qty > 0) return { qty, namePart: mid[1].trim() };
  }
  return { qty: 1, namePart: token };
}

function analyzeText(text) {
  const out = [];
  for (const token of tokenize(text)) {
    let food = foods.find((f) => f.name === token || f.alias.includes(token));
    let qty = 1;
    let approx;
    if (!food) {
      const p = parseQty(token);
      qty = p.qty;
      approx = p.approx;
      food = foods.find((f) => f.name === p.namePart || f.alias.includes(p.namePart));
      if (!food) food = findFoods(p.namePart).sort((a, b) => b.name.length - a.name.length)[0];
      if (!food) food = foods.filter((f) => token.includes(f.name) || f.alias.some((a) => token.includes(a))).sort((a, b) => b.name.length - a.name.length)[0];
      if (food && qty === 1 && p.namePart === token) {
        const inner = parseQty(token.replace(food.name, '').trim() || token);
        if (inner.qty > 1 && !inner.approx) qty = inner.qty;
      }
    }
    out.push(food
      ? { token, food: food.name, qty, protein: Math.round(food.protein * qty * 10) / 10, calories: Math.round(food.calories * qty), approx }
      : { token, food: null, qty, protein: 0, calories: 0, approx });
  }
  return { matches: out, totalProtein: Math.round(out.reduce((s, x) => s + x.protein, 0)), totalCalories: Math.round(out.reduce((s, x) => s + x.calories, 0)) };
}

// —— 用例：[输入, 期望的 蛋白g/千卡（null 表示只检查能否识别）] ——
const CASES = [
  // 基本组合
  ['鸡腿 + 鸡蛋 + 米饭', '30/425'],
  // 份数写法：数字在前
  ['2个鸡蛋', '13/150'],
  ['3个鸡腿', '60/540'],
  ['2 个鸡蛋', '13/150'],
  ['1.5碗米饭', '5/255'],
  // 份数写法：量词后置
  ['苹果一个', '1/100'],
  ['鸡蛋两个', '13/150'],
  ['米饭二两', '7/340'],
  ['牛奶一盒', '8/160'],
  ['鸡腿两个', '40/360'],
  // 中文数字在前
  ['两个鸡蛋', '13/150'],
  ['三片奶酪', '15/210'],
  // 别名
  ['水煮蛋', '7/75'],
  ['2个水煮蛋', '13/150'],
  ['鸡胸', '28/150'],
  ['烤鸡腿', '20/180'],
  // 混合
  ['烤鸡腿 + 麻婆豆腐 + 西兰花炒木耳 + 米饭', '41/670'],
  ['青菜 + 花菜 + 红烧狮子头 + 米饭二两', '23/745'],
  ['鸡腿 + 酱黄豆 + 炒青菜 + 米饭', '39/570'],
  ['饼干两包', '16/960'],
  // 分隔符变体
  ['鸡腿、鸡蛋、米饭', '30/425'],
  ['鸡腿，鸡蛋，米饭', '30/425'],
  ['鸡腿 和 鸡蛋', '27/255'],
  ['鸡腿配米饭', '24/350'],
  ['鸡腿/鸡蛋/米饭', '30/425'],
  // 不可识别（应记为 0，但不能崩）
  ['外星食物xyz', '0/0'],
  ['', '0/0'],
  // 超长文本不应参与匹配
  ['这是一个非常非常长的描述超过二十个字符所以会被丢弃', '0/0'],
  // 更贴近真实的写法
  ['早饭：包子两个 + 豆浆一杯', null],
  ['中午食堂 鸡腿 米饭 青菜', null],
  ['牛奶一盒 鸡蛋一个', '15/235'],
  ['苹果2个', '1/200'],
  ['鸡腿x2', '40/360'],
  ['鸡腿X3', '60/540'],
  ['鸡蛋×2', '13/150'],
  // 重量写法：不能当份数（曾把「牛肉100g」算成 100 份 = 2000g 蛋白）
  ['牛肉100g', '20/200'],
  ['牛奶250ml', '8/160'],
  ['鸡胸肉 200 克', null],
];

console.log('饮食解析边界用例');
console.log('='.repeat(78));
let pass = 0, fail = 0;
for (const [input, expect] of CASES) {
  const r = analyzeText(input);
  const got = `${r.totalProtein}/${r.totalCalories}`;
  // expect 为 null 时只要求「能识别出至少一样食物」，用于观察口语写法
  const ok = expect === null ? r.matches.some((m) => m.food) : got === expect;
  if (ok) pass++; else fail++;
  const detail = r.matches.map((x) => `${x.food ?? '❌' + x.token}×${x.qty}`).join(' + ') || '(空)';
  const expLabel = expect === null ? '(能识别即可)' : expect;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${JSON.stringify(input).padEnd(46)} 期望 ${String(expLabel).padEnd(9)} 实得 ${got.padEnd(9)} ${ok ? '' : '<<< 不符'}`);
  if (!ok || expect === null) console.log(`       └ 解析明细：${detail}`);
}
console.log('='.repeat(78));
console.log(`${pass}/${CASES.length} 通过${fail ? `，${fail} 个不符` : ''}`);
process.exit(fail ? 1 : 0);
