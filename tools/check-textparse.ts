// 文字解析自测：用真实格式的课表文字 / 校历文字验证解析规则。
// 直接 node 运行（Node 22+ 支持 .ts 类型擦除）。
import assert from 'node:assert';
import { parseTimetableText, parseCalendarText } from '../src/lib/textParse.ts';

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log('  ok   ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL ' + name + ' → ' + (e as Error).message);
  }
}

const TIMETABLE = `周一

1. 高级语言程序设计 A1，3-4 节（10:00-11:35），瑞安楼阶 3，第 4 周
2. 高等数学 B (I)，5-6 节（13:30-15:05），南 229，【非本周】
3. 线性代数 B，9-10 节（18:30-20:05），北 229，第 4 周

周三

1. 体育 (1)，1-2 节（08:00-09:35），爱校路足球场（2 号），第 4 周
2. 大学物理实验 B2 (I)，5-6 节（13:30-15:05），物理馆 2-4 楼，第 4 周
3. 专业导论（计算机与电子类），9-10 节（18:30-20:05），北 301，第 4 周

周五

1. 学术英语，3-4 节（10:00-11:35），南 318，第 4 周
2. 卓越星，9 节（18:30-19:15），第 4 周

周六

1. 大学美育，7-8 节（15:30-17:05），线上课堂，【非本周】
2. 社会实践，9-10 节（18:30-20:05），线上课堂，第 4 周`;

const r = parseTimetableText(TIMETABLE);
console.log('— 课表文字 —');
console.log('  解析出 ' + r.courses.length + ' 门，推测是第 ' + r.textWeek + ' 周');
for (const c of r.courses) {
  console.log(
    `    周${c.day} ${c.start}-${c.end} | ${c.name} | @${c.place || '(无)'} | ${c.weeksLabel} | 第${c.rowIndex}节/连排${c.span}${c.nonThisWeek ? ' | 非本周' : ''}`
  );
}

check('解析出 10 门课', () => assert.strictEqual(r.courses.length, 10));
check('推测为第 4 周', () => assert.strictEqual(r.textWeek, 4));

check('高级语言程序设计：周三/3-4节/瑞安楼阶3', () => {
  const c = r.courses.find((x) => x.name.includes('高级语言程序') && x.day === 1);
  assert.ok(c, '没找到');
  assert.strictEqual(c.start, '10:00');
  assert.strictEqual(c.end, '11:35');
  assert.strictEqual(c.place, '瑞安楼阶 3');
  assert.strictEqual(c.span, 2);
});

check('【非本周】被标记', () => {
  const c = r.courses.find((x) => x.name.includes('高等数学'));
  assert.ok(c, '没找到');
  assert.strictEqual(c.nonThisWeek, true);
  assert.strictEqual(c.place, '南 229');
});

check('没有地点的「卓越星」也能解析', () => {
  const c = r.courses.find((x) => x.name.includes('卓越星'));
  assert.ok(c, '没找到');
  assert.strictEqual(c.day, 5);
  assert.strictEqual(c.start, '18:30');
  assert.strictEqual(c.end, '19:15');
  assert.strictEqual(c.place, '');
});

check('括号里的括号不误切：爱校路足球场（2 号）', () => {
  const c = r.courses.find((x) => x.name.includes('体育'));
  assert.ok(c, '没找到');
  assert.ok(c.place.includes('足球场'), '地点不对: ' + c.place);
});

check('周六两门都被解析', () => {
  const sat = r.courses.filter((x) => x.day === 6);
  assert.strictEqual(sat.length, 2);
});

const CAL = `- 本科新生：9 月 4 日 - 9 月 20 日军训及入学教育，**9 月 21 日本科新生开课**
- 研究生新生：9 月 5 日报到、9 月 6 日报到；**9 月 7 日（周一）为秋季学期第 1 周**
- 秋季学期：9 月 7 日～次年 1 月 17 日，共 19 周（教学 17 周，考试 2 周）

## 重要节假日标注

2026：中秋节 (9.25)、国庆节 (10.1)
2027：元旦 (1.1)、除夕、春节、妇女节 (3.8)、清明节 (4.5)、劳动节 (5.1)、端午节 (6.9)

## 周次 - 时间对应表

### 秋季学期（2026.9–2027.1）

第 1 周：9.7–9.13
第 2 周：9.14–9.20
第 3 周：9.21–9.27
第 4 周：9.28–10.4
第 5 周：10.5–10.11
第 17 周：12.28–2027.1.3`;

const c2 = parseCalendarText(CAL);
console.log('— 校历文字 —');
console.log('  学期起点 =', c2.semesterStart, '| 总周数 =', c2.totalWeeks, '| 周次表 =', c2.weeks.length, '条');
console.log('  关键日期：');
for (const e of c2.events) console.log(`    ${e.date}  ${e.emoji} ${e.title}`);
if (c2.warnings.length) console.log('  警告：' + c2.warnings.join(' / '));

check('学期起点 = 2026-09-07', () => assert.strictEqual(c2.semesterStart, '2026-09-07'));
check('总周数 = 19', () => assert.strictEqual(c2.totalWeeks, 19));
check('周次表解析出 6 条', () => assert.strictEqual(c2.weeks.length, 6));
check('第 5 周 = 10.5–10.11', () => {
  const w = c2.weeks.find((x) => x.week === 5);
  assert.ok(w, '没找到第 5 周');
  assert.strictEqual(w.start, '2026-10-05');
  assert.strictEqual(w.end, '2026-10-11');
});
check('跨年周正确：第 17 周结束于 2027-01-03', () => {
  const w = c2.weeks.find((x) => x.week === 17);
  assert.ok(w, '没找到第 17 周');
  assert.strictEqual(w.end, '2027-01-03');
});
check('军训起始日取区间起点 = 2026-09-04', () => {
  const e = c2.events.find((x) => x.title.includes('军训'));
  assert.ok(e, '没找到军训');
  assert.strictEqual(e.date, '2026-09-04');
});
check('本科新生开课 = 2026-09-21', () => {
  const e = c2.events.find((x) => x.title.includes('开课'));
  assert.ok(e, '没找到开课');
  assert.strictEqual(e.date, '2026-09-21');
});
check('中秋节 = 2026-09-25', () => {
  const e = c2.events.find((x) => x.title === '中秋节');
  assert.ok(e, '没找到中秋');
  assert.strictEqual(e.date, '2026-09-25');
});
check('国庆节 = 2026-10-01', () => {
  const e = c2.events.find((x) => x.title === '国庆节');
  assert.ok(e, '没找到国庆');
  assert.strictEqual(e.date, '2026-10-01');
});
check('元旦 = 2027-01-01（跨年）', () => {
  const e = c2.events.find((x) => x.title === '元旦');
  assert.ok(e, '没找到元旦');
  assert.strictEqual(e.date, '2027-01-01');
});
check('清明节 = 2027-04-05', () => {
  const e = c2.events.find((x) => x.title === '清明节');
  assert.ok(e, '没找到清明');
  assert.strictEqual(e.date, '2027-04-05');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
