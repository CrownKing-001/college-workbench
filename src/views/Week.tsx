// 周计划：按教学周查看课程安排
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { Panel, Chip, Empty } from '@/components/Panel';
import { currentWeek, type Course } from '@/data/plan';
import { weekGrid, DAY_LABELS } from '@/lib/schedule';
import { fromKey } from '@/lib/storage';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Week() {
  const store = useStore();
  const { courses, settings, today } = store;
  const semesterStart = fromKey(settings.semesterStart);
  const thisWeek = currentWeek(today, semesterStart);
  const todayDay = today.getDay() === 0 ? 7 : today.getDay();

  // 可查看的周数：以用户设置的总周数为准，再多给 3 周缓冲，方便提前排计划
  const maxWeek = Math.max(1, settings.totalWeeks) + 3;

  const [week, setWeek] = useState(Math.min(Math.max(thisWeek, 1), maxWeek));
  const courseList: Course[] = courses ?? [];

  const grid = useMemo(
    () => weekGrid(courseList, week, semesterStart),
    [courseList, week, semesterStart]
  );

  const weekCourses = grid.reduce((s, d) => s + d.items.length, 0);

  return (
    <div className="space-y-4">
      <Panel title={`第 ${week} 教学周 · 共 ${weekCourses} 节课`} icon={CalendarDays}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setWeek(Math.max(1, week - 1))}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 shrink-0"
            aria-label="上一周"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                  w === week
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-400'
                )}
              >
                第{w}周{w === thisWeek && w !== week ? '·今' : ''}
              </button>
            ))}
          </div>
          <button
            onClick={() => setWeek(Math.min(maxWeek, week + 1))}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 shrink-0"
            aria-label="下一周"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {week === thisWeek && <Chip tone="emerald">当前周</Chip>}
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {grid.map(({ day, date, items }) => {
          const isToday = week === thisWeek && day === todayDay;
          return (
            <div
              key={day}
              className={cn(
                'rounded-2xl bg-white border shadow-sm p-4',
                isToday ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">
                  {DAY_LABELS[day - 1]}
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    {date.getMonth() + 1}/{date.getDate()}
                  </span>
                </p>
                <span className="flex gap-1">
                  {isToday && <Chip tone="emerald">今天</Chip>}
                </span>
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">本周全天无安排</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((c, i) => (
                    <div key={`${c.name}-${i}`} className="rounded-lg bg-sky-500/15 border border-sky-500/25 px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <p className="text-xs font-medium text-[var(--text-1)]">{c.name}</p>
                        <span className="text-[11px] text-sky-300 whitespace-nowrap tabular-nums">
                          {c.start}–{c.end}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{c.place}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {courseList.length === 0 && (
        <Empty>课表为空，去「课表」页新增课程，或用「课表识别」导入课表图片</Empty>
      )}
    </div>
  );
}
