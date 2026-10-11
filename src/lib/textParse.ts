// 文字解析：把「课表文字」「校历文字」解析成结构化数据。
//
// 为什么单独做一套：图片 OCR 必然有误差（相邻格子被连成一行、小字表头丢失），
// 而**用户从教务系统复制出来的文字是确定的**。给两个识别页各加一个「粘贴文字」
// 入口，可靠性和准确率都远高于识图。
//
// 两类文字的格式都不固定，所以这里用「按标点切分 + 逐段分类」的宽松规则，
// 而不是靠固定模板；解析不出的部分一律留给用户在确认表里改。
import type { TimetableCourse } from '@/lib/storage';

// ── 公共小工具 ──────────────────────────────────────────
const WEEKDAY_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
};

/** 全角数字/标点归一化（只用于匹配，不改原始文本） */
function norm(s: string): string {
  return String(s || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/：/g, ':')
    .replace(/[－—–~～]/g, '-')
    .replace(/\u00a0|\u3000/g, ' ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 第几周标记行的解析：整行只有「周一 / 星期一 / 礼拜一」这类 */
function parseWeekdayLine(line: string): number | null {
  const t = norm(line).replace(/\s/g, '').replace(/[.、:：,，]/g, '');
  const m = t.match(/^(?:周|星期|礼拜)([一二三四五六日天七1-7])$/);
  if (!m) return null;
  return WEEKDAY_MAP[m[1]] ?? null;
}

/** 节次 → 默认时间（找不到用户自定义作息时的兜底，与 timetable.cjs 保持一致） */
const DEFAULT_PERIOD_TIMES = [
  { start: '08:00', end: '08:45' }, { start: '08:55', end: '09:40' },
  { start: '10:00', end: '10:45' }, { start: '10:55', end: '11:40' },
  { start: '13:30', end: '14:15' }, { start: '14:25', end: '15:10' },
  { start: '15:30', end: '16:15' }, { start: '16:25', end: '17:10' },
  { start: '18:30', end: '19:15' }, { start: '19:25', end: '20:10' },
  { start: '20:20', end: '21:05' }, { start: '21:15', end: '22:00' },
];

function range(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

// ── 课表文字 ────────────────────────────────────────────
export interface ParsedCourse extends TimetableCourse {
  /** 文字里标了「非本周」：这门课在本周不上 */
  nonThisWeek: boolean;
}

export interface TimetableTextResult {
  courses: ParsedCourse[];
  /** 文字里反复出现的「第 N 周」——说明这份课表是第 N 周的 */
  textWeek: number | null;
  warnings: string[];
}

const RE_TIME = /(\d{1,2})\s*:\s*(\d{2})\s*-\s*(\d{1,2})\s*:\s*(\d{2})/;
const RE_PERIOD = /(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*节/;
const RE_WEEK_RANGE = /第?\s*(\d{1,2})\s*-\s*(\d{1,2})\s*周/;
const RE_WEEK_ONE = /第\s*(\d{1,2})\s*周/;
const RE_NON_CURRENT = /非本周|本周无|停课|不上/;
const RE_ODD = /单周|单数周|\(单\)/;
const RE_EVEN = /双周|双数周|\(双\)/;

/** 解析一行课程：「名称，节次（时间），地点，第 N 周」 */
function parseCourseLine(line: string, day: number, periods?: { start: string; end: string }[]): ParsedCourse | null {
  // 去掉行首序号：`1.` / `1、` / `1)` / `①`
  const body = line.trim().replace(/^\s*(?:\d{1,2}\s*[.、)．]|[①-⑨])\s*/, '');
  if (!body) return null;

  const parts = body.split(/[，,;；]/).map((s) => s.trim()).filter(Boolean);
  const name = (parts[0] || '').replace(/[*_`]/g, '').trim();
  if (!name) return null;

  let place = '';
  let start = '';
  let end = '';
  let rowIndex = 0;
  let span = 1;
  let weeks: number[] | null = null;
  let weeksLabel = '';
  let nonThisWeek = false;

  for (let i = 1; i < parts.length; i++) {
    const raw = parts[i];
    const p = norm(raw);

    // 1) 时间 + 节次：「3-4 节（10:00-11:35）」
    const tm = p.match(RE_TIME);
    if (tm) {
      start = `${pad2(+tm[1])}:${tm[2]}`;
      end = `${pad2(+tm[3])}:${tm[4]}`;
      const pm = p.match(RE_PERIOD);
      if (pm) {
        rowIndex = +pm[1];
        span = pm[2] ? Math.max(1, +pm[2] - +pm[1] + 1) : 1;
      }
      if (!weeksLabel && RE_WEEK_ONE.test(p)) weeksLabel = raw;
      continue;
    }

    // 2) 只有节次、没写时间：「3-4 节」
    const pm = p.match(RE_PERIOD);
    if (pm) {
      rowIndex = +pm[1];
      span = pm[2] ? Math.max(1, +pm[2] - +pm[1] + 1) : 1;
      continue;
    }

    // 3) 周次信息
    if (RE_NON_CURRENT.test(p)) {
      nonThisWeek = true;
      weeksLabel = raw;
      continue;
    }
    const wr = p.match(RE_WEEK_RANGE);
    if (wr) {
      weeks = range(+wr[1], +wr[2]);
      weeksLabel = raw;
      continue;
    }
    if (RE_ODD.test(p) || RE_EVEN.test(p)) {
      const isOdd = RE_ODD.test(p);
      weeks = Array.from({ length: 30 }, (_, i) => i + 1).filter((w) => (isOdd ? w % 2 === 1 : w % 2 === 0));
      weeksLabel = raw;
      continue;
    }
    if (RE_WEEK_ONE.test(p)) {
      // 只写「第 4 周」= 这门课在第 4 周有；整份课表通常就是那一周的
      weeksLabel = raw;
      continue;
    }

    // 4) 剩下的当地点
    if (!place) place = raw;
  }

  // 没写时间但有节次：用用户作息表 / 内置兜底推算
  if (!start && rowIndex > 0) {
    const list = periods && periods.length ? periods : DEFAULT_PERIOD_TIMES;
    const si = Math.min(list.length - 1, rowIndex - 1);
    const ei = Math.min(list.length - 1, si + span - 1);
    start = list[si]?.start ?? '08:00';
    end = list[ei]?.end ?? '09:40';
  }
  if (!start) {
    start = '08:00';
    end = '09:40';
  }

  return {
    day,
    name,
    place,
    start,
    end,
    weeks,
    weeksLabel,
    raw: line.trim(),
    confidence: place ? 'high' : 'medium',
    rowIndex: rowIndex || 1,
    span,
    nonThisWeek,
  };
}

/**
 * 解析整份课表文字。
 * 支持「周一 / 星期二 / 礼拜三」这类分节标题，下面跟若干条课程。
 */
export function parseTimetableText(
  text: string,
  periods?: { start: string; end: string }[]
): TimetableTextResult {
  const lines = String(text || '').split(/\r?\n/);
  const courses: ParsedCourse[] = [];
  const warnings: string[] = [];
  let curDay: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const day = parseWeekdayLine(line);
    if (day != null) {
      curDay = day;
      continue;
    }
    // 整行只有星期数（如「1」）也算分节标题，但要在已经进入课表区域之后
    if (/^[1-7]$/.test(line) && curDay != null) {
      curDay = +line;
      continue;
    }
    if (curDay == null) continue;

    const c = parseCourseLine(line, curDay, periods);
    if (c) courses.push(c);
  }

  if (!courses.length) warnings.push('没有解析出任何课程，请检查文字里是否包含「周一」这类分节标题。');

  // 文字里出现最多的「第 N 周」，作为「这份课表属于第几周」的推断
  const weekHits = new Map<number, number>();
  for (const line of lines) {
    const m = norm(line).match(RE_WEEK_ONE);
    if (m) {
      const w = +m[1];
      weekHits.set(w, (weekHits.get(w) || 0) + 1);
    }
  }
  let textWeek: number | null = null;
  let best = 0;
  for (const [w, n] of weekHits) {
    if (n > best) {
      best = n;
      textWeek = w;
    }
  }

  return { courses, textWeek, warnings };
}

// ── 校历文字 ────────────────────────────────────────────
export interface WeekRange {
  week: number;
  start: string; // YYYY-MM-DD
  end: string;
  label: string;
}

export interface ParsedCalendarEvent {
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  emoji: string;
  raw: string;
}

export interface CalendarTextResult {
  /** 第 1 周周一（YYYY-MM-DD），用于校准教学周 */
  semesterStart: string | null;
  totalWeeks: number | null;
  weeks: WeekRange[];
  events: ParsedCalendarEvent[];
  warnings: string[];
}

/** 从文字里推断学年起始年（秋季学期：8~12 月属起始年，1~7 月属次年） */
function guessBaseYear(text: string): number {
  const t = norm(text);
  // 优先「秋季学期（2026.9」这类
  const m1 = t.match(/秋季学期[（(]?\s*(20\d{2})/);
  if (m1) return +m1[1];
  const m2 = t.match(/(20\d{2})\s*[：:]/); // 「2026：中秋节」
  if (m2) return +m2[1];
  const years = [...t.matchAll(/(20\d{2})/g)].map((m) => +m[1]);
  if (years.length) return Math.min(...years);
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/** 月份 → 完整日期（跨年：1~7 月算次年） */
function ymd(baseYear: number, month: number, day: number): string {
  const y = month >= 8 ? baseYear : baseYear + 1;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

const EVENT_RULES: { re: RegExp; title: string; category: string; emoji: string }[] = [
  { re: /军训|入学教育/, title: '军训及入学教育', category: '教务', emoji: '🥾' },
  { re: /新生开课|本科新生开课/, title: '新生开课', category: '教务', emoji: '🎓' },
  { re: /报到/, title: '新生报到', category: '教务', emoji: '🧳' },
  { re: /正式上课|教学周开始/, title: '正式上课', category: '教务', emoji: '🎓' },
  { re: /期末考试|考试周/, title: '期末考试周', category: '考试', emoji: '📚' },
  { re: /寒假/, title: '寒假', category: '假期', emoji: '❄️' },
  { re: /暑假|暑期/, title: '暑假', category: '假期', emoji: '☀️' },
  { re: /中秋节|中秋/, title: '中秋节', category: '假期', emoji: '🥮' },
  { re: /国庆节|国庆/, title: '国庆节', category: '假期', emoji: '🇨🇳' },
  { re: /元旦/, title: '元旦', category: '假期', emoji: '🎊' },
  { re: /除夕/, title: '除夕', category: '假期', emoji: '🧧' },
  { re: /春节/, title: '春节', category: '假期', emoji: '🧨' },
  { re: /妇女节/, title: '妇女节', category: '假期', emoji: '🌷' },
  { re: /清明节/, title: '清明节', category: '假期', emoji: '🌱' },
  { re: /劳动节/, title: '劳动节', category: '假期', emoji: '💪' },
  { re: /青年节/, title: '青年节', category: '假期', emoji: '🎈' },
  { re: /儿童节/, title: '儿童节', category: '假期', emoji: '🧸' },
  { re: /端午节/, title: '端午节', category: '假期', emoji: '🍡' },
  { re: /建党节/, title: '建党节', category: '假期', emoji: '🚩' },
  { re: /建军节/, title: '建军节', category: '假期', emoji: '🎖️' },
  { re: /毕业|离校/, title: '毕业生离校', category: '教务', emoji: '🎓' },
];

/**
 * 解析整份校历文字。
 * 重点抓三样东西：
 *  1. 「第 1 周：9.7-9.13」这类周次-日期对应表（最可靠，能直接得到学期起点）；
 *  2. 「共 19 周」这类总周数；
 *  3. 军训 / 开课 / 节假日等关键日期。
 */
export function parseCalendarText(text: string): CalendarTextResult {
  const src = String(text || '');
  const lines = src.split(/\r?\n/);
  const baseYear = guessBaseYear(src);
  const weeks: WeekRange[] = [];
  const events: ParsedCalendarEvent[] = [];
  const warnings: string[] = [];
  let totalWeeks: number | null = null;

  // 1) 周次 - 日期对应表
  for (const raw of lines) {
    const l = norm(raw).trim();
    const m = l.match(/^第\s*(\d{1,2})\s*周\s*[:：]?\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*-\s*(?:(\d{4})\s*[.\-/])?\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
    if (!m) continue;
    const week = +m[1];
    const sm = +m[2];
    const sd = +m[3];
    const ey = m[4] ? +m[4] : 0;
    const em = +m[5];
    const ed = +m[6];
    const start = ymd(baseYear, sm, sd);
    const endY = ey || (em >= 8 ? baseYear : baseYear + 1);
    const end = `${endY}-${pad2(em)}-${pad2(ed)}`;
    weeks.push({ week, start, end, label: raw.trim() });
  }

  // 2) 总周数：「共 19 周」
  const tw = norm(src).match(/共\s*(\d{1,2})\s*周/);
  if (tw) totalWeeks = +tw[1];

  // 3) 关键日期：按「小句」抽 —— 一条小句里通常只有一个日期 + 一个事件
  for (const raw of lines) {
    const line = norm(raw).trim();
    if (!line || line.length > 200) continue;
    // 「2027：元旦 (1.1)、除夕、…」这类行首显式年份，对该行所有日期都生效
    const lineYear = (line.match(/(20\d{2})\s*[:：]/) || [])[1] || '';
    const clauses = line.split(/[，,;；、]/).map((s) => s.trim()).filter(Boolean);

    for (const clause of clauses) {
      const hits = EVENT_RULES.filter((r) => r.re.test(clause));
      if (!hits.length) continue;

      const dates: { month: number; day: number; index: number }[] = [];
      for (const m of clause.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)) {
        dates.push({ month: +m[1], day: +m[2], index: m.index ?? 0 });
      }
      for (const m of clause.matchAll(/(?:^|[^\d.])(\d{1,2})\s*[.]\s*(\d{1,2})(?![\d])/g)) {
        dates.push({ month: +m[1], day: +m[2], index: m.index ?? 0 });
      }
      if (!dates.length) continue;
      const first = [...dates].sort((a, b) => a.index - b.index)[0];

      for (const rule of hits) {
        const hit = clause.match(rule.re);
        if (!hit) continue;
        const at = clause.indexOf(hit[0]);
        // 事件名在前 → 取其后最近的日期；日期在前（如「9月4日-9月20日军训」）→ 取区间起始日
        const pick =
          at < first.index
            ? dates.filter((d) => d.index >= at).sort((a, b) => a.index - b.index)[0]
            : first;
        if (!pick || !(pick.month >= 1 && pick.month <= 12) || !(pick.day >= 1 && pick.day <= 31)) continue;
        const date = lineYear
          ? `${lineYear}-${pad2(pick.month)}-${pad2(pick.day)}`
          : ymd(baseYear, pick.month, pick.day);
        if (events.some((e) => e.title === rule.title && e.date === date)) continue;
        events.push({ title: rule.title, date, category: rule.category, emoji: rule.emoji, raw: clause });
      }
    }
  }

  // 4) 学期起点：优先第 1 周的周一；否则找「第 1 周」关键词行
  let semesterStart: string | null = null;
  const w1 = weeks.find((w) => w.week === 1);
  if (w1) semesterStart = w1.start;
  if (!semesterStart) {
    const l1 = lines.map((l) => norm(l)).find((l) => /第\s*1\s*周|第\s*一\s*周/.test(l));
    if (l1) {
      const d = l1.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (d) semesterStart = ymd(baseYear, +d[1], +d[2]);
    }
  }

  if (!weeks.length) warnings.push('没找到「第 1 周：9.7–9.13」这类周次-日期对应表，学期起点可能不准。');
  if (!semesterStart) warnings.push('没能推断出学期起点（第 1 周周一）。');
  if (!totalWeeks) warnings.push('没找到「共 N 周」，总周数需要你在设置里确认。');

  events.sort((a, b) => a.date.localeCompare(b.date));
  weeks.sort((a, b) => a.week - b.week);
  return { semesterStart, totalWeeks, weeks, events, warnings };
}
