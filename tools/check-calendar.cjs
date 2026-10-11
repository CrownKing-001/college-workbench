// 校验校历抽取逻辑：直接用真实 OCR 结果跑一遍，看抽出来的关键日期对不对。
// 用法：node tools/check-calendar.cjs [ocr.json 路径]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { recognize, extractEvents, normalize } = require('../electron/ocr.cjs');

const root = path.resolve(__dirname, '..');
const img = process.argv[2] || path.join(os.homedir(), 'Downloads', 'IMG_1273.JPG');

console.log('OCR 引擎自检');
console.log('='.repeat(74));

let lines;
try {
  // 先放大再识别（和 App 里走的路径一致）
  const up = path.join(os.tmpdir(), 'check-cal-3x.png');
  require('node:child_process').execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'electron', 'upscale-windows.ps1')],
    { env: { ...process.env, OCR_IMG: img, OCR_OUT: up, OCR_SCALE: '3' }, stdio: 'pipe' }
  );
  lines = recognize(up);
  fs.unlinkSync(up);
} catch (err) {
  console.error('OCR 失败：', err.message);
  process.exit(1);
}

console.log(`识别出 ${lines.length} 行文本`);

const events = extractEvents(lines);
console.log(`\n抽取到 ${events.length} 个关键日期：\n`);
console.log('日期          分类   事件                    置信   原文片段');
console.log('-'.repeat(74));
for (const e of events) {
  console.log(
    `${e.date}  ${e.category.padEnd(5)} ${(e.emoji + ' ' + e.title).padEnd(22)} ${e.confidence.padEnd(6)} ${e.raw.slice(0, 26)}`
  );
}

// ── 期望值（人工核对华东师大 2024-2027 校历说明区）──
const EXPECT = [
  ['2024-09-13', '缴费注册'],
  ['2024-09-14', '正式上课'],
  ['2024-09-11', '新生报到'],
  ['2024-09-25', '中秋节'],
  ['2024-10-01', '国庆节'],
  ['2024-10-27', '校运动会'],
  ['2027-01-01', '元旦'],
  ['2027-01-18', '寒假'],
  ['2027-02-21', '缴费注册'],
  ['2027-02-22', '正式上课'],
  ['2027-03-08', '妇女节'],
  ['2027-04-05', '清明节'],
  ['2027-05-01', '劳动节'],
  ['2027-06-09', '端午节'],
  ['2027-06-28', '暑期学期'],
];

console.log('\n' + '='.repeat(74));
console.log('与人工核对的期望值比对：');
let hit = 0;
for (const [date, title] of EXPECT) {
  const ok = events.some((e) => e.date === date && e.title.includes(title.replace('开始', '')));
  if (ok) hit++;
  console.log(`${ok ? 'PASS' : 'MISS'} | ${date}  ${title}`);
}
console.log('-'.repeat(74));
console.log(`${hit}/${EXPECT.length} 命中`);

// 也报一下抽取结果里但不在期望清单里的（可能是误报或额外发现）
const extra = events.filter((e) => !EXPECT.some(([d, t]) => d === e.date && e.title.includes(t.replace('开始', ''))));
if (extra.length) {
  console.log(`\n额外抽到 ${extra.length} 条（需人工判断是否有效）：`);
  for (const e of extra) console.log(`  ${e.date} ${e.title} [${e.confidence}]`);
}
