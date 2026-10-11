// 今日：日期切换 + 课程 + 当天待办/作业
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { Panel, Empty, Chip, btnGhost } from '@/components/Panel';
import {
  BookOpen, ChevronLeft, ChevronRight, CheckCheck,
  CheckSquare, BookMarked, Clock,
} from 'lucide-react';
import { currentWeek, type Course } from '@/data/plan';
import { coursesOn, toMin, buildTimeline, addDays, keyOf } from '@/lib/schedule';
import { fromKey, daysUntil } from '@/lib/storage';
import { cn } from '@/lib/utils';

export default function Today() {
  const store = useStore();
  const { courses, today, settings, todos, setTodos, assignments } = store;
  const [offset, setOffset] = useState(0);

  const view = addDays(today, offset);
  const isToday = offset === 0;
  const semesterStart = fromKey(settings.semesterStart);
  const week = currentWeek(view, semesterStart);

  const allCourses = useMemo(
    () => coursesOn((courses ?? []) as Course[], view, semesterStart),
    [courses, view, semesterStart]
  );

  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  // 今天的课：已结束的不再占用视线
  const shown = isToday ? allCourses.filter((c) => toMin(c.end) > curMin) : allCourses;
  const finished = isToday ? allCourses.length - shown.length : 0;

  const timeline = useMemo(
    () => buildTimeline(allCourses, [], isToday ? now : new Date(view.getFullYear(), view.getMonth(), view.getDate(), 0, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCourses, isToday, offset, store.todayKey]
  );

  const viewKey = keyOf(view);
  const dayTodos = todos.filter((t) => !t.done && t.due && t.due <= viewKey);
  const dayAssign = assignments
    .filter((a) => !a.done && daysUntil(fromKey(a.due), view) <= 0)
    .slice(0, 6);

  const dateStr = `${view.getMonth() + 1} 月 ${view.getDate()} 日`;
  const weekdayStr = `周${'日一二三四五六'[view.getDay()]}`;

  return (
    <div className="space-y-4">
      {/* 日期切换 */}
      <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl shadow-sm px-3 py-2">
        <button
          onClick={() => setOffset(offset - 1)}
          className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          aria-label="前一天"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">
            {dateStr} · {weekdayStr}
            {isToday && <span className="ml-2 text-xs font-normal text-emerald-600">今天</span>}
            {offset === 1 && <span className="ml-2 text-xs font-normal text-sky-600">明天</span>}
            {offset > 1 && <span className="ml-2 text-xs font-normal text-slate-400">{offset} 天后</span>}
            {offset < 0 && <span className="ml-2 text-xs font-normal text-slate-400">{offset} 天前</span>}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">第 {week} 教学周</p>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setOffset(0)}
              className="text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 rounded-full px-3 py-1.5 transition-colors"
            >
              回到今天
            </button>
          )}
          <button
            onClick={() => setOffset(offset + 1)}
            className="w-9 h-9 rounded-xl bg-[var(--surface-3)] hover:bg-[var(--surface-4)] border border-[var(--border-2)] flex items-center justify-center text-slate-400 transition-colors"
            aria-label="后一天"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 课程 */}
        <Panel
          title={`${isToday ? '今日' : '当日'}课程（${isToday ? `还有 ${shown.length}` : shown.length} 节）`}
          icon={BookOpen}
          className="lg:col-span-2"
          action={
            finished > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-400">
                <CheckCheck className="w-3.5 h-3.5" /> 已上完 {finished} 节
              </span>
            ) : undefined
          }
        >
          {shown.length === 0 ? (
            <Empty>
              {allCourses.length > 0 && isToday
                ? '今天的课都上完了 🎉'
                : '这一天没有课，时间都是你的 🎉'}
            </Empty>
          ) : (
            <ul className="space-y-2">
              {shown.map((c) => {
                const ongoing = isToday && toMin(c.start) <= curMin && curMin < toMin(c.end);
                return (
                  <li
                    key={c.uid}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-4 py-3 border',
                      ongoing ? 'bg-emerald-500/12 border-emerald-500/35' : 'bg-sky-500/12 border-transparent'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-sm flex items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        {c.tag && <Chip tone="sky">{c.tag}</Chip>}
                        {ongoing && <Chip tone="emerald">进行中</Chip>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{c.place}</p>
                    </div>
                    <span className="text-sm font-semibold text-sky-300 whitespace-nowrap tabular-nums ml-3">
                      {c.start}–{c.end}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* 当日待办 / 作业 */}
        <div className="lg:col-span-3 space-y-4">
          <Panel title="当天要处理的事" icon={CheckSquare}>
            {dayTodos.length === 0 && dayAssign.length === 0 ? (
              <Empty>没有到期的待办和作业 🎉</Empty>
            ) : (
              <div className="space-y-3">
                {dayTodos.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1.5">待办</p>
                    <ul className="space-y-1">
                      {dayTodos.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-3)] border border-[var(--border-2)] px-3 py-2">
                          <button
                            onClick={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: true } : x)))}
                            className="w-4 h-4 rounded border-2 border-slate-600 hover:border-emerald-400 shrink-0"
                            aria-label="完成"
                          />
                          <span className="text-xs text-[var(--text-2)] flex-1 truncate">{t.text}</span>
                          {t.due && t.due < viewKey && <Chip tone="rose">逾期</Chip>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {dayAssign.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1.5">作业</p>
                    <ul className="space-y-1">
                      {dayAssign.map((a) => {
                        const d = daysUntil(fromKey(a.due), view);
                        return (
                          <li key={a.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-3)] border border-[var(--border-2)] px-3 py-2">
                            <BookMarked className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="text-xs text-[var(--text-2)] flex-1 truncate">
                              <span className="text-slate-500">{a.course} · </span>{a.title}
                            </span>
                            <Chip tone={d < 0 ? 'rose' : 'amber'}>
                              {d < 0 ? `逾期 ${-d} 天` : '今天截止'}
                            </Chip>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* 完整时间轴 */}
      <Panel title="当日完整时间轴" icon={Clock}>
        {timeline.length === 0 ? (
          <Empty>这一天没有任何安排</Empty>
        ) : (
          <ol className="relative space-y-2 pl-5">
            <span className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-2)]" />
            {timeline.map((t, i) => (
              <li key={`${t.title}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-5 top-2 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--header)]',
                    t.kind === 'course' ? 'bg-sky-500' : 'bg-slate-600',
                    t.ongoing && 'animate-pulse'
                  )}
                />
                <div className={cn('rounded-xl px-3.5 py-2 border', t.ongoing ? 'bg-emerald-500/12 border-emerald-500/30' : 'bg-[var(--surface-3)] border-[var(--border-2)]')}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400 tabular-nums w-11 shrink-0">{t.time}</span>
                    <span className="text-sm text-[var(--text-1)] flex-1">{t.title}</span>
                    {t.minutes > 0 && <span className="text-[10px] text-slate-500">{t.minutes} 分钟</span>}
                    {t.ongoing && <Chip tone="emerald">进行中</Chip>}
                  </div>
                  {t.sub && <p className="text-[11px] text-slate-500 mt-0.5 pl-[3.25rem] line-clamp-2">{t.sub}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {!isToday && (
        <button onClick={() => setOffset(0)} className={cn(btnGhost, 'w-full')}>
          回到今天
        </button>
      )}
    </div>
  );
}
