// 一次性核对脚本：把 data/fitplan-diet-logs.json 里记录的营养值
// 与 src/data/foods.ts 食物库重算的结果对比，找出对不上的条目。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const foodsSrc = fs.readFileSync(path.join(root, 'src/data/foods.ts'), 'utf8');

const re = /\{ id: '([^']+)', name: '([^']+)'(?:, alias: \[([^\]]*)\])?, unit: '([^']*)', protein: ([\d.]+), calories: ([\d.]+)/g;
const foods = [];
let m;
while ((m = re.exec(foodsSrc))) {
  foods.push({
    id: m[1],
    name: m[2],
    alias: m[3] ? m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [],
    unit: m[4],
    protein: +m[5],
    calories: +m[6],
  });
}
console.log('食物库条目数:', foods.length);

const byId = new Map(foods.map((f) => [f.id, f]));

// 复刻 analyzeText 的匹配逻辑（与 src/data/foods.ts 保持一致）
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNIT = '个|份|碗|杯|根|块|片|包|勺|两|只|条|盒|瓶|盘|袋|颗|串';
const tokenize = (text) =>
  text.split(/[+＋、,，;；/\n\r\t]|(?:\s+和\s+)|(?:\s*配\s*)/).map((s) => s.trim()).filter((s) => s && s.length <= 20);

const findFoods = (q) => {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return foods.filter((f) => f.name.toLowerCase().includes(s) || f.alias.some((a) => a.toLowerCase().includes(s)));
};

function parseQty(token) {
  const lead = token.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})?\\s*(.+)$`));
  if (lead && lead[2].trim()) return { qty: Number(lead[1]), namePart: lead[2].trim() };
  const leadCn = token.match(new RegExp(`^([一二两三四五六七八九十])\\s*(?:${UNIT})?\\s*(.+)$`));
  if (leadCn && CN_NUM[leadCn[1]] && leadCn[2].trim()) return { qty: CN_NUM[leadCn[1]], namePart: leadCn[2].trim() };
  const trail = token.match(new RegExp(`^(.+?)\\s*([一二两三四五六七八九十]|\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})$`));
  if (trail) {
    const qty = /^\d/.test(trail[2]) ? Number(trail[2]) : CN_NUM[trail[2]];
    if (trail[1].trim() && qty) return { qty, namePart: trail[1].trim() };
  }
  return { qty: 1, namePart: token };
}

function analyzeText(text) {
  const out = [];
  for (const token of tokenize(text)) {
    let food = foods.find((f) => f.name === token || f.alias.includes(token));
    let qty = 1;
    if (!food) {
      const p = parseQty(token);
      qty = p.qty;
      food = foods.find((f) => f.name === p.namePart || f.alias.includes(p.namePart));
      if (!food) food = findFoods(p.namePart).sort((a, b) => b.name.length - a.name.length)[0];
      if (!food) {
        food = foods
          .filter((f) => token.includes(f.name) || f.alias.some((a) => token.includes(a)))
          .sort((a, b) => b.name.length - a.name.length)[0];
      }
      if (food && qty === 1 && p.namePart === token) {
        const inner = parseQty(token.replace(food.name, '').trim() || token);
        if (inner.qty > 1) qty = inner.qty;
      }
    }
    out.push(food
      ? { token, food: food.name, qty, protein: Math.round(food.protein * qty * 10) / 10, calories: Math.round(food.calories * qty) }
      : { token, food: null, qty, protein: 0, calories: 0 });
  }
  return {
    matches: out,
    totalProtein: Math.round(out.reduce((s, x) => s + x.protein, 0)),
    totalCalories: Math.round(out.reduce((s, x) => s + x.calories, 0)),
  };
}

const logs = JSON.parse(fs.readFileSync(path.join(root, 'data/fitplan-diet-logs.json'), 'utf8'));
console.log('\n饮食记录条数:', logs.length);
console.log('\n日期        餐次   文本 / 存储值 / 重算值 / 判定');
console.log('-'.repeat(96));

let mismatch = 0;
for (const log of logs) {
  const r = analyzeText(log.text);
  const unnoted = r.matches.filter((x) => !x.food).map((x) => x.token);
  const ok = r.totalProtein === log.protein && r.totalCalories === log.calories;
  if (!ok) mismatch++;
  console.log(
    `${log.date}  ${String(log.meal).padEnd(4)} ${log.text}`
  );
  console.log(
    `                      存储 ${String(log.protein).padStart(4)}g/${String(log.calories).padStart(4)}kcal` +
      `  重算 ${String(r.totalProtein).padStart(4)}g/${String(r.totalCalories).padStart(4)}kcal` +
      `  ${ok ? 'OK' : '<<< 不一致'}${unnoted.length ? `  未识别: ${unnoted.join('、')}` : ''}`
  );
}
console.log('-'.repeat(96));
console.log(`不一致 ${mismatch} / ${logs.length} 条`);
