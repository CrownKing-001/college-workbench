// 总览：工作台首页，一眼看清今天要干什么、还有什么没做完
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { Panel, Chip, Bar, Empty, btnPrimary, btnGhost } from '@/components/Panel';
import type { ViewId } from '@/components/Layout';
import {
  CalendarClock, CheckSquare, BookOpen, Footprints, HeartPulse,
  Flame, AlertTriangle, Clock, Target, UtensilsCrossed,
} from 'lucide-react';
import { currentWeek } from '@/data/plan';
import { coursesOn, buildTimeline, toMin } from '@/lib/schedule';
import { daysUntil, fromKey } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { Course } from '@/data/plan';

const KIND_DOT: Record<string, string> = {
  course: 'bg-sky-500',
  strength: 'bg-orange-500',
  run: 'bg-emerald-500',
  test: 'bg-rose-500',
  recovery: 'bg-slate-400',
  game: 'bg-violet-500',
};

/** 欢迎条上最多并排显示几个倒计时 */
const MAX_COUNTDOWNS = 2;

export default function Dashboard({ setView }: { setView: (v: ViewId) => void }) {
  const store = useStore();
  const { courses, todos, assignments, run, health, diet, settings, today } = store;

  const semesterStart = fromKey(settings.semesterStart);
  const week = currentWeek(today, semesterStart);

  const todayCourses = useMemo(
    () => coursesOn((courses ?? []) as Course[], today, semesterStart),
    [courses, today, semesterStart]
  );

  const now = new Date();
  // 空白模板里没有内置训练计划，时间轴只由当天课程生成
  const timeline = useMemo(
    () => buildTimeline(todayCourses, [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayCourses, store.todayKey]
  );

  const openTodos = todos.filter((t) => !t.done);
  const dueSoon = assignments
    .filter((a) => !a.done)
    .map((a) => ({ ...a, days: daysUntil(fromKey(a.due), today) }))
    .sort((a, b) => a.days - b.days);
  const overdue = dueSoon.filter((a) => a.days < 0);

  const runDone = run.length;
  const latestHealth = [...health].sort((a, b) => b.date.localeCompare(a.date))[0];
  const todayDiet = diet.filter((d) => d.date === store.todayKey);
  const todayProtein = todayDiet.reduce((s, d) => s + (d.protein ?? 0), 0);
  const todayCalories = todayDiet.reduce((s, d) => s + (d.calories ?? 0), 0);

  const restCourses = todayCourses.filter((c) => toMin(c.end) > now.getHours() * 60 + now.getMinutes());

  const runTarget = Math.max(1, settings.runTarget || 0);

  // 欢迎条倒计时：取用户自己「重要事项」里最近的两个未过期事项，
  // 不预置也不假设任何具体日期
  const countdowns = useMemo(
    () =>
      [...store.milestones]
        .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), today) >= 0)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        .slice(0, MAX_COUNTDOWNS)
        .map((m) => ({ id: m.id, title: m.title, days: daysUntil(fromKey(m.date!), today) })),
    [store.milestones, today]
  );

  const stats = [
    {
      icon: CalendarClock, label: '今日课程', value: `${restCourses.length}`, unit: '节待上',
      sub: todayCourses.length ? `共 ${todayCourses.length} 节` : '今天没课',
      tone: 'sky' as const, view: 'today' as ViewId,
    },
    {
      icon: CheckSquare, label: '未完成待办', value: `${openTodos.length}`, unit: '项',
      sub: openTodos.filter((t) => t.due && t.due <= store.todayKey).length
        ? `${openTodos.filter((t) => t.due && t.due <= store.todayKey).length} 项今天到期`
        : '暂无到期',
      tone: 'emerald' as const, view: 'todos' as ViewId,
    },
    {
      icon: BookOpen, label: '临近作业', value: `${dueSoon.filter((a) => a.days <= 7).length}`, unit: '个',
      sub: overdue.length ? `${overdue.length} 个已逾期` : '7 天内截止',
      tone: overdue.length ? ('rose' as const) : ('amber' as const), view: 'assignments' as ViewId,
    },
    // 只有开启「运动打卡」时才把这张卡排进去
    ...(settings.runEnabled
      ? [{
          icon: Footprints, label: '运动打卡', value: `${runDone}`, unit: `/ ${settings.runTarget} 次`,
          sub: runDone >= settings.runTarget ? '已达标 🎉' : `还差 ${settings.runTarget - runDone} 次`,
          tone: 'emerald' as const, view: 'run' as ViewId,
        }]
      : []),
    // 未开启时补一张「重要事项」卡，保证网格始终是 4 张
    ...(settings.runEnabled
      ? []
      : [{
          icon: Target, label: '重要事项', value: `${store.milestones.filter((m) => !m.done).length}`, unit: '项',
          sub: countdowns[0] ? `最近「${countdowns[0].title}」` : '还没有待办事项',
          tone: 'sky' as const, view: 'milestones' as ViewId,
        }]),
  ];

  return (
    <div className="space-y-4">
      {/* 欢迎条 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 py-5 shadow-lg shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-emerald-200 text-xs font-medium flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> 第 {week} 教学周
            </p>
            <h1 className="text-2xl font-bold tracking-tight mt-1 text-white">
              {today.getMonth() + 1} 月 {today.getDate()} 日 · 周{'日一二三四五六'[today.getDay()]}
            </h1>
            <p className="text-emerald-100/80 text-sm mt-1">
              {restCourses.length > 0
                ? `今天还有 ${restCourses.length} 节课，最近一节 ${restCourses[0].start} ${restCourses[0].name}`
                : '今天课都上完了，剩下的时间归你安排'}
            </p>
          </div>
          <div className="flex gap-2.5">
            {countdowns.length === 0 ? (
              // 没有待办事项时不留空，给一张指路卡引导用户自己去建
              <button
                onClick={() => setView('milestones')}
                className="bg-white/10 hover:bg-white/20 transition-colors rounded-2xl px-4 py-3 backdrop-blur text-center min-w-[7.5rem] border border-dashed border-white/25"
              >
                <p className="text-[11px] text-emerald-100/90 flex items-center justify-center gap-1">
                  <Target className="w-3 h-3" /> 重要事项
                </p>
                <p className="text-2xl font-extrabold leading-tight text-white">+</p>
                <p className="text-[10px] text-emerald-100/70">还没有倒计时</p>
              </button>
            ) : (
              countdowns.map((e) => (
                <div
                  key={e.id}
                  className="bg-white/10 rounded-2xl px-4 py-3 backdrop-blur text-center min-w-[7.5rem] border border-white/10"
                >
                  <p className="text-[11px] text-emerald-100 flex items-center justify-center gap-1">
                    <Target className="w-3 h-3" /> 距 {e.title}
                  </p>
                  <p className="text-3xl font-extrabold leading-tight tabular-nums text-white">{e.days}</p>
                  <p className="text-[10px] text-emerald-100/80">天</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={() => setView(s.view)}
            className="text-left rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-emerald-300 hover:shadow transition-all"
          >
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-800 tabular-nums">{s.value}</span>
              <span className="text-xs text-slate-400">{s.unit}</span>
            </p>
            <div className="mt-1.5">
              <Chip tone={s.tone}>{s.sub}</Chip>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 今日时间轴 */}
        <Panel
          title="今日时间轴"
          icon={Clock}
          className="lg:col-span-3"
          action={
            <button onClick={() => setView('today')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              查看详情 →
            </button>
          }
        >
          {timeline.length === 0 ? (
            <Empty>今天没有安排，好好休息 🎉</Empty>
          ) : (
            <ol className="relative space-y-2.5 pl-5">
              <span className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-200" />
              {timeline.map((t, i) => (
                <li key={`${t.title}-${i}`} className="relative">
                  <span
                    className={cn(
                      'absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white',
                      KIND_DOT[t.kind] ?? 'bg-slate-300',
                      t.ongoing && 'animate-pulse'
                    )}
                  />
                  <div className={cn(
                    'rounded-xl px-3.5 py-2.5 border',
                    t.ongoing
                      ? 'bg-emerald-50 border-emerald-200'
                      : t.done
                        ? 'bg-slate-50 border-transparent opacity-60'
                        : 'bg-slate-50 border-transparent'
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums w-11 shrink-0">{t.time}</span>
                      <span className={cn('text-sm font-medium text-slate-800 flex-1', t.done && 'line-through')}>
                        {t.title}
                      </span>
                      {t.ongoing && <Chip tone="emerald">进行中</Chip>}
                      {t.minutes > 0 && <span className="text-[10px] text-slate-400">{t.minutes} 分钟</span>}
                    </div>
                    {t.sub && <p className="text-[11px] text-slate-500 mt-0.5 pl-[3.25rem] line-clamp-2">{t.sub}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="lg:col-span-2 space-y-4">
          {/* 待办速览 */}
          <Panel
            title="待办速览"
            icon={CheckSquare}
            action={
              <button onClick={() => setView('todos')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                全部 →
              </button>
            }
          >
            {openTodos.length === 0 ? (
              <Empty>没有待办，清爽 ✨</Empty>
            ) : (
              <ul className="space-y-1.5">
                {openTodos
                  .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
                  .slice(0, 5)
                  .map((t) => {
                    const overdueT = t.due && t.due < store.todayKey;
                    const dueToday = t.due === store.todayKey;
                    return (
                      <li key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          t.priority === 'high' ? 'bg-rose-500' : t.priority === 'low' ? 'bg-slate-300' : 'bg-emerald-500'
                        )} />
                        <span className="text-xs text-slate-700 flex-1 truncate">{t.text}</span>
                        {t.due && (
                          <Chip tone={overdueT ? 'rose' : dueToday ? 'amber' : 'slate'}>
                            {overdueT ? '已逾期' : dueToday ? '今天' : t.due.slice(5)}
                          </Chip>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          {/* 作业 DDL */}
          <Panel
            title="作业倒计时"
            icon={BookOpen}
            action={
              <button onClick={() => setView('assignments')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                全部 →
              </button>
            }
          >
            {dueSoon.length === 0 ? (
              <Empty>没有未完成作业 🎉</Empty>
            ) : (
              <ul className="space-y-1.5">
                {dueSoon.slice(0, 4).map((a) => (
                  <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-700 flex-1 truncate font-medium">{a.title}</span>
                      <Chip tone={a.days < 0 ? 'rose' : a.days <= 2 ? 'amber' : 'sky'}>
                        {a.days < 0 ? `逾期 ${-a.days} 天` : a.days === 0 ? '今天' : `${a.days} 天`}
                      </Chip>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{a.course} · {a.due}{a.dueTime ? ` ${a.dueTime}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* 进度概览：运动卡片跟随设置开关，关闭时由「重要事项」补位 */}
      <div className="grid gap-4 md:grid-cols-3">
        {settings.runEnabled ? (
          <Panel title="运动打卡" icon={Footprints}>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-extrabold text-slate-800 tabular-nums">
                {runDone}<span className="text-sm font-normal text-slate-400"> / {settings.runTarget}</span>
              </p>
              <Chip tone={runDone >= settings.runTarget ? 'emerald' : 'amber'}>
                剩 {Math.max(0, settings.totalWeeks - week + 1)} 周
              </Chip>
            </div>
            <Bar value={runDone} max={runTarget} />
            <p className="text-[11px] text-slate-400 mt-2">
              {runDone >= settings.runTarget
                ? '已达成目标次数，保持住就行'
                : `建议每周 ${Math.max(0, Math.ceil((settings.runTarget - runDone) / Math.max(1, settings.totalWeeks - week + 1)))} 次即可达标`}
            </p>
          </Panel>
        ) : (
          <Panel title="重要事项" icon={Target}>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-extrabold text-slate-800 tabular-nums">
                {store.milestones.filter((m) => !m.done).length}
                <span className="text-sm font-normal text-slate-400"> 项待办</span>
              </p>
              {countdowns[0] && <Chip tone="rose">{countdowns[0].days} 天</Chip>}
            </div>
            <p className="text-[11px] text-slate-400">
              {countdowns[0] ? `最近一项：${countdowns[0].title}` : '还没有待办事项'}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setView('milestones')} className={cn(btnPrimary, 'flex-1 h-8 text-xs')}>
                <Target className="w-3.5 h-3.5" /> 去管理
              </button>
              <button onClick={() => setView('settings')} className={cn(btnGhost, 'flex-1 h-8 text-xs')}>
                去设置
              </button>
            </div>
          </Panel>
        )}

        <Panel title="身体数据" icon={HeartPulse}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400">最新体重</p>
              <p className="text-lg font-bold text-slate-800">
                {latestHealth?.weight ? `${latestHealth.weight} kg` : '--'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">今日蛋白</p>
              <p className="text-lg font-bold text-slate-800">{todayProtein} g</p>
            </div>
          </div>
          <div className="mt-3">
            <Bar value={todayProtein} max={store.proteinTarget} tone={todayProtein >= store.proteinTarget ? 'emerald' : 'amber'} />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {todayProtein >= store.proteinTarget
              ? '今日蛋白已达标 ✅'
              : `还差 ${Math.max(0, store.proteinTarget - todayProtein)}g，继续加餐`}
          </p>
        </Panel>

        <Panel title="今日饮食" icon={UtensilsCrossed}>
          <div className="flex items-end justify-between mb-2">
            <p className="text-2xl font-extrabold text-slate-800 tabular-nums">
              {todayCalories}<span className="text-sm font-normal text-slate-400"> kcal</span>
            </p>
            <Chip tone="amber">{todayDiet.length} 笔</Chip>
          </div>
          <Bar value={todayCalories} max={2400} tone="amber" />
          <p className="text-[11px] text-slate-400 mt-2">
            {todayDiet.length
              ? `已记 ${todayDiet.length} 笔，${todayProtein}g 蛋白`
              : '今天还没记饮食，去「饮食记录」页记一笔吧'}
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setView('diet')} className={cn(btnPrimary, 'flex-1 h-8 text-xs')}>
              <UtensilsCrossed className="w-3.5 h-3.5" /> 去记录
            </button>
            <button onClick={() => setView('health')} className={cn(btnGhost, 'flex-1 h-8 text-xs')}>
              看身体数据
            </button>
          </div>
        </Panel>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-5 py-3.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-sm text-rose-700 flex-1">
            有 <span className="font-bold">{overdue.length}</span> 个作业已经逾期：
            {overdue.slice(0, 3).map((a) => a.title).join('、')}
            {overdue.length > 3 && ' 等'}
          </p>
          <button onClick={() => setView('assignments')} className="text-xs font-medium text-rose-600 hover:text-rose-700 whitespace-nowrap">
            去处理 →
          </button>
        </div>
      )}
    </div>
  );
}
