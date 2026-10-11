// 一次性数据修正：把 data/fitplan-diet-logs.json 里的营养值
// 按 src/data/foods.ts 食物库重算，并补上 items 明细。
// 同时清掉冒烟测试留下的重复记录（同日期+同餐次+同文本视为重复）。
//
// 用法：node tools/fix-diet-data.cjs [--dry]
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry');
const dietPath = path.join(root, 'data/fitplan-diet-logs.json');

const foodsSrc = fs.readFileSync(path.join(root, 'src/data/foods.ts'), 'utf8');
const start = foodsSrc.indexOf('export const FOODS: FoodItem[] = [');
const body = foodsSrc.slice(start, foodsSrc.indexOf('];', start));
const foods = [];
{
  const re = /\{ id: '([^']+)', name: '([^']+)'(?:, alias: \[([^\]]*)\])?, unit: '([^']*)', protein: ([\d.]+), calories: ([\d.]+)/g;
  let m;
  while ((m = re.exec(body))) {
    foods.push({
      id: m[1], name: m[2],
      alias: m[3] ? m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [],
      protein: +m[5], calories: +m[6],
    });
  }
}

// ── 与 src/data/foods.ts 的 analyzeText 保持同一套解析逻辑 ──
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNIT = '个|份|碗|杯|根|块|片|包|勺|两|只|条|盒|瓶|盘|袋|颗|串';
const tokenize = (t) =>
  t.split(/[+＋、,，;；/\n\r\t]|(?:\s+和\s+)|(?:\s*配\s*)/).map((s) => s.trim()).filter((s) => s && s.length <= 20);
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
      if (!food)
        food = foods
          .filter((f) => token.includes(f.name) || f.alias.some((a) => token.includes(a)))
          .sort((a, b) => b.name.length - a.name.length)[0];
      if (food && qty === 1 && p.namePart === token) {
        const inner = parseQty(token.replace(food.name, '').trim() || token);
        if (inner.qty > 1) qty = inner.qty;
      }
    }
    if (food) {
      out.push({
        foodId: food.id, name: food.name, qty,
        protein: Math.round(food.protein * qty * 10) / 10,
        calories: Math.round(food.calories * qty),
      });
    }
  }
  return out;
}

const logs = JSON.parse(fs.readFileSync(dietPath, 'utf8'));

// ① 去重：同 date + meal + text 只保留第一条（冒烟测试重复写入导致）
const seen = new Set();
const deduped = [];
let removed = 0;
for (const l of logs) {
  const sig = `${l.date}|${l.meal}|${l.text}`;
  if (seen.has(sig)) { removed++; continue; }
  seen.add(sig);
  deduped.push(l);
}
console.log(`去重：${logs.length} 条 → ${deduped.length} 条（移除重复 ${removed} 条）`);

// ② 重算营养值 + 补 items
const fixed = [];
let changed = 0;
const unmatched = [];
for (const l of deduped) {
  const items = analyzeText(l.text);
  if (!items.length) {
    unmatched.push(l.text);
    fixed.push(l);
    continue;
  }
  const protein = Math.round(items.reduce((s, i) => s + i.protein, 0));
  const calories = Math.round(items.reduce((s, i) => s + i.calories, 0));
  const diff = protein !== l.protein || calories !== l.calories;
  if (diff) {
    changed++;
    console.log(
      `  ${l.date} ${l.meal}: ${l.text}\n` +
        `      存储 ${l.protein}g/${l.calories}kcal → 修正 ${protein}g/${calories}kcal`
    );
  }
  fixed.push({
    date: l.date, meal: l.meal, text: l.text,
    protein, calories,
    ...(l.photo ? { photo: l.photo } : {}),
    items,
  });
}

console.log(`\n营养值修正：${changed} 条`);
if (unmatched.length) console.log(`未识别、保持原样的文本：${unmatched.join('；')}`);

if (dry) {
  console.log('\n[--dry] 未写盘');
} else {
  fs.writeFileSync(dietPath, JSON.stringify(fixed, null, 2) + '\n', 'utf8');
  console.log(`\n已写入 ${dietPath}`);
}
