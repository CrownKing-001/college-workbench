// 课表抽取规则的自测：用模拟的 OCR 行（带坐标）验证网格重建与课程解析。
// 这不是正式的测试框架，只是开发期快速验证规则，可随时删。
const assert = require('node:assert');
const {
  extractCourses,
  detectCurrentWeek,
  parseWeekday,
  parseWeeks,
  parsePeriodIndex,
  parseClock,
  cnToNumber,
  looksLikePlace,
} = require('../electron/timetable.cjs');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok   ' + name);
  } catch (err) {
    fail++;
    console.log('  FAIL ' + name + ' → ' + err.message);
  }
}

console.log('— 基础解析 —');
check('parseWeekday 星期一', () => assert.strictEqual(parseWeekday('星期一'), 1));
check('parseWeekday 周二', () => assert.strictEqual(parseWeekday('周二'), 2));
check('parseWeekday 礼拜日', () => assert.strictEqual(parseWeekday('礼拜日'), 7));
check('parseWeekday 星期天', () => assert.strictEqual(parseWeekday('星期天'), 7));
check('parseWeekday 单个日', () => assert.strictEqual(parseWeekday('日'), 7));
check('parseWeekday OCR 坏字 期三', () => assert.strictEqual(parseWeekday('期三'), 3));
check('parseWeekday 无', () => assert.strictEqual(parseWeekday('高等数学'), null));
check('parseWeekday OCR 星期l → 周一', () => assert.strictEqual(parseWeekday('星期l'), 1));
check('parseWeekday OCR 星期目 → 周日', () => assert.strictEqual(parseWeekday('星期目'), 7));
check('parseWeekday OCR 周丨 → 周一', () => assert.strictEqual(parseWeekday('周丨'), 1));
check('parseWeekday OCR 期曰 → 周日', () => assert.strictEqual(parseWeekday('期曰'), 7));
check('parseWeekday OCR 星期- → 周一', () => assert.strictEqual(parseWeekday('星期-'), 1));

check('cnToNumber 十', () => assert.strictEqual(cnToNumber('十'), 10));
check('cnToNumber 十一', () => assert.strictEqual(cnToNumber('十一'), 11));
check('cnToNumber 四', () => assert.strictEqual(cnToNumber('四'), 4));

check('parsePeriodIndex 第1节', () => assert.strictEqual(parsePeriodIndex('第1节'), 1));
check('parsePeriodIndex 第三节', () => assert.strictEqual(parsePeriodIndex('第三节'), 3));
check('parsePeriodIndex 纯数字 5', () => assert.strictEqual(parsePeriodIndex('5'), 5));
check('parsePeriodIndex 三大节', () => assert.strictEqual(parsePeriodIndex('第三大节'), 3));

check('parseClock 08:00', () => assert.strictEqual(parseClock('08:00').text, '08:00'));
check('parseClock 8：00 全角', () => assert.strictEqual(parseClock('8：00').text, '08:00'));
check('parseClock 无', () => assert.strictEqual(parseClock('高数'), null));

console.log('— 当前周检测 —');
check('detectCurrentWeek 标题第5周', () =>
  assert.strictEqual(
    detectCurrentWeek([
      { x: 10, y: 5, w: 200, h: 30, text: '2026-2027学年第1学期' },
      { x: 10, y: 40, w: 100, h: 30, text: '第5周课表' },
    ]),
    5
  ));
check('detectCurrentWeek 忽略课程格子的 1-16周 / 第2-4周', () =>
  assert.strictEqual(
    detectCurrentWeek([
      { x: 10, y: 200, w: 80, h: 20, text: '高等数学 1-16周' },
      { x: 300, y: 200, w: 80, h: 20, text: '数字逻辑 第2-4周' },
      { x: 600, y: 200, w: 80, h: 20, text: '体育 第5-6周' },
    ]),
    null
  ));
check('detectCurrentWeek 无周次', () => assert.strictEqual(detectCurrentWeek([{ x: 1, y: 1, w: 50, h: 20, text: '高等数学' }]), null));
check('detectCurrentWeek 全角数字第１２周', () =>
  assert.strictEqual(detectCurrentWeek([{ x: 1, y: 1, w: 80, h: 30, text: '第１２周课表' }]), 12));

console.log('— 周次解析 —');
check('1-16周', () => {
  const r = parseWeeks('1-16周');
  assert.strictEqual(r.weeks.length, 16);
  assert.strictEqual(r.weeks[0], 1);
  assert.strictEqual(r.weeks[15], 16);
});
check('2-16双周', () => {
  const r = parseWeeks('2-16双周');
  assert.deepStrictEqual(r.weeks, [2, 4, 6, 8, 10, 12, 14, 16]);
});
check('1-16周(单)', () => {
  const r = parseWeeks('1-16周(单)');
  assert.deepStrictEqual(r.weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
});
check('无周次 → null', () => assert.strictEqual(parseWeeks('高等数学').weeks, null));

console.log('— 教室识别 —');
check('理科楼B324', () => assert.ok(looksLikePlace('理科楼B324')));
check('教学楼 109', () => assert.ok(looksLikePlace('教学楼 109')));
check('B324', () => assert.ok(looksLikePlace('B324')));
check('高等数学 不是教室', () => assert.ok(!looksLikePlace('高等数学')));
check('程序设计基础 不是教室', () => assert.ok(!looksLikePlace('程序设计基础及实践')));
check('体育与健康 不是教室（含"体育"的课程名）', () => assert.ok(!looksLikePlace('体育与健康')));
check('大学物理实验 不是教室（含"实验"的课程名）', () => assert.ok(!looksLikePlace('大学物理实验')));
check('教学方法 不是教室（含"教学"的课程名）', () => assert.ok(!looksLikePlace('教学方法')));
check('体育馆 是教室', () => assert.ok(looksLikePlace('体育馆')));
check('体育场 是教室', () => assert.ok(looksLikePlace('体育场')));

console.log('— 网格重建（模拟一张 7 天 × 4 节的课表 OCR 结果）—');
// 表头：每天列中心 x = 200, 350, 500, 650, 800, 950, 1100
const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const headerLines = days.map((d, i) => ({ x: 160 + i * 150, y: 100, w: 80, h: 24, text: d }));
// 左侧节次标记
const rowLines = [1, 2, 3, 4].map((n) => ({ x: 20, y: 150 + (n - 1) * 100, w: 60, h: 24, text: '第' + n + '节' }));

const cell = (dayIdx, rowIdx, text, sub) => {
  const out = [{ x: 150 + dayIdx * 150, y: 150 + (rowIdx - 1) * 100, w: 130, h: 22, text }];
  if (sub) out.push({ x: 150 + dayIdx * 150, y: 175 + (rowIdx - 1) * 100, w: 130, h: 18, text: sub });
  return out;
};

const lines = [
  ...headerLines,
  ...rowLines,
  // 周一第1节：程序设计基础及实践 / 理科楼B324 / 1-16周
  ...cell(0, 1, '程序设计基础及实践', '理科楼B324'),
  { x: 150, y: 197, w: 130, h: 18, text: '1-16周' },
  // 周一第2节：同一门课连堂（应合并成一条，跨度 2 节）
  ...cell(0, 2, '程序设计基础及实践', '理科楼B324'),
  // 周三第3节：数字逻辑 / 2-16双周
  ...cell(2, 3, '数字逻辑及实践', '理科楼B324'),
  { x: 450, y: 397, w: 130, h: 18, text: '2-16周' },
  // 周五第1节：高等数学（一）
  ...cell(4, 1, '高等数学（一）', '教学楼109'),
  { x: 750, y: 197, w: 130, h: 18, text: '3-15周' },
];

const courses = extractCourses(lines);
console.log('  抽到 ' + courses.length + ' 条：');
for (const c of courses) {
  console.log(
    `    周${c.day} ${c.start}-${c.end} ${c.name} @ ${c.place || '(无教室)'} 周次=${
      c.weeks ? c.weeks.join(',') : '每周'
    } 置信=${c.confidence} 跨${c.span}节`
  );
}

check('抽到 3 条课程', () => assert.strictEqual(courses.length, 3));

check('周一连堂合并为一条且跨 2 节', () => {
  const c = courses.find((x) => x.day === 1 && x.name.includes('程序设计'));
  assert.ok(c, '没找到周一的程序设计课');
  assert.strictEqual(c.span, 2);
  assert.strictEqual(c.place, '理科楼B324');
});

check('周三次逻辑课解析正确', () => {
  const c = courses.find((x) => x.day === 3);
  assert.ok(c, '没找到周三的课');
  assert.ok(c.name.includes('数字逻辑'), '课程名不对: ' + c.name);
  assert.deepStrictEqual(c.weeks, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

check('周五高数教室与周次正确', () => {
  const c = courses.find((x) => x.day === 5);
  assert.ok(c, '没找到周五的课');
  assert.ok(c.name.includes('高等数学'), '课程名不对: ' + c.name);
  assert.strictEqual(c.place, '教学楼109');
  assert.strictEqual(c.weeks.length, 13);
});

check('课程名没有被教室或周次污染', () => {
  for (const c of courses) {
    assert.ok(!/B324|109|周/.test(c.name), '课程名被污染: ' + c.name);
  }
});

console.log('— 回归：含"体育/实验"的课程名不应被误当教室丢掉 —');
const lines2 = [
  ...days.map((d, i) => ({ x: 160 + i * 150, y: 100, w: 80, h: 24, text: d })),
  ...[1, 2].map((n) => ({ x: 20, y: 150 + (n - 1) * 100, w: 60, h: 24, text: '第' + n + '节' })),
  { x: 150, y: 150, w: 130, h: 22, text: '体育与健康' },
  { x: 150, y: 175, w: 130, h: 18, text: '体育馆' },
  { x: 150, y: 197, w: 130, h: 18, text: '1-16周' },
];
const courses2 = extractCourses(lines2);
check('体育与健康 作为课程被抽出（未被当教室丢弃）', () => {
  const c = courses2.find((x) => x.day === 1);
  assert.ok(c, '没抽出周一的课');
  assert.ok(c.name.includes('体育'), '课程名不对: ' + c.name);
  assert.strictEqual(c.place, '体育馆');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
