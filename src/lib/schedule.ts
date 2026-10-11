// 课表相关派生计算：把课程数组变成「今天有什么课」这类可直接渲染的数据
import {
  type Course,
  DEFAULT_SEMESTER_START,
  currentWeek,
  mondayOf,
  weekMonday,
} from '@/data/plan';

export const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** JS getDay() → 1=周一 … 7=周日 */
export const dayNum = (d: Date): number => (d.getDay() === 0 ? 7 : d.getDay());

export interface CourseInstance extends Course {
  /** 这条课在本周的唯一键，用于 React key 与作业关联 */
  uid: string;
  date: Date;
  dateKey: string;
}

export function coursesOn(
  courses: Course[],
  date: Date,
  semesterStart: Date = DEFAULT_SEMESTER_START,
  totalWeeks = 20
): CourseInstance[] {
  const week = currentWeek(date, semesterStart);
  const day = dayNum(date);
  return courses
    .filter((c) => c.day === day && c.weeks.includes(week))
    .filter(() => week >= 1 && week <= totalWeeks)
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((c) => ({
      ...c,
      uid: `${c.name}|${c.start}|${day}`,
      date,
      dateKey: keyOf(date),
    }));
}

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 某一周 7 天的授课情况，供周视图使用 */
export function weekGrid(
  courses: Course[],
  week: number,
  semesterStart: Date = DEFAULT_SEMESTER_START
): { day: number; date: Date; dateKey: string; items: Course[] }[] {
  const mon = weekMonday(week, semesterStart);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(mon, i);
    const day = i + 1;
    return {
      day,
      date,
      dateKey: keyOf(date),
      items: courses
        .filter((c) => c.day === day && c.weeks.includes(week))
        .sort((a, b) => toMin(a.start) - toMin(b.start)),
    };
  });
}

/** 今天剩下的课（今天的课里还没结束的） */
export function remainingToday(items: CourseInstance[], now: Date): CourseInstance[] {
  const cur = now.getHours() * 60 + now.getMinutes();
  return items.filter((c) => toMin(c.end) > cur);
}

/** 正在进行中的课 */
export function ongoingNow(items: CourseInstance[], now: Date): CourseInstance | undefined {
  const cur = now.getHours() * 60 + now.getMinutes();
  return items.find((c) => toMin(c.start) <= cur && cur < toMin(c.end));
}

/**
 * 生成今天的日程时间轴：课程 + 训练安排，按时间排序。
 * 用于「今日」页的纵向时间轴视图。
 */
export interface TimelineItem {
  time: string;
  sortKey: number;
  minutes: number; // 时长（分钟），"可选"/"全天" 之类为 0
  title: string;
  sub: string;
  kind: 'course' | 'strength' | 'run' | 'test' | 'recovery' | 'game';
  ongoing?: boolean;
  done?: boolean;
}

export function buildTimeline(
  courseItems: CourseInstance[],
  sessions: { time: string; title: string; detail: string; kind: TimelineItem['kind'] }[],
  now: Date
): TimelineItem[] {
  const cur = now.getHours() * 60 + now.getMinutes();
  const items: TimelineItem[] = [];

  for (const c of courseItems) {
    const s = toMin(c.start);
    const e = toMin(c.end);
    items.push({
      time: c.start,
      sortKey: s,
      minutes: e - s,
      title: c.name,
      sub: c.place,
      kind: 'course',
      ongoing: s <= cur && cur < e,
      done: e <= cur,
    });
  }

  for (const s of sessions) {
    const isClock = /^\d{1,2}:\d{2}$/.test(s.time.trim());
    const start = isClock ? toMin(s.time.trim()) : -1;
    items.push({
      time: s.time,
      // 「可选」「全天」这类没有具体时间的排在当天末尾
      sortKey: start >= 0 ? start : 24 * 60 + items.length,
      minutes: 0,
      title: s.title,
      sub: s.detail,
      kind: s.kind,
    });
  }

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

/** 本周还剩下几节课 */
export function countWeekCourses(courses: Course[], week: number): number {
  return courses.filter((c) => c.weeks.includes(week)).length;
}

export { mondayOf };
