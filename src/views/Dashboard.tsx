// 总览：工作台首页，一眼看清今天要干什么、还有什么没做完
import { useMemo, useState } from 'react';
import { useStore, type Milestone } from '@/store/store';
import { Panel, Chip, Bar, Empty, btnPrimary, btnGhost } from '@/components/Panel';
import type { ViewId } from '@/components/Layout';
import {
  CalendarClock, CheckSquare, BookOpen, Footprints, HeartPulse,
  Flame, AlertTriangle, Clock, Target, GraduationCap, UtensilsCrossed, TrendingUp,
  Plus, Pencil, X,
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

export default function Dashboard({ setView }: { setView: (v: ViewId) => void }) {
  const store = useStore();
  const { courses, todos, assignments, run, health, diet, settings, today, milestones, setMilestones } = store;

  const semesterStart = fromKey(settings.semesterStart);
  const week = currentWeek(today, semesterStart);

  // ── 绿色欢迎条上的倒计时卡片 ──
  // 与「重要事项」共用同一份 milestones 数据：
  //  · 卡片只显示被「钉」到总览上的（milestone.pinned）；
  //  · 「添加」是从重要事项里挑选，不新建 —— 避免两处数据各说各话。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  /** 有日期的里程碑（date 可选，留空=待定） */
  const datedMilestones = useMemo(
    () => milestones.filter((m): m is Milestone & { date: string } => !!m.date),
    [milestones]
  );

  /**
   * 已钉住的：按日期排序，全部显示。
   * 不限制条数 —— 写死条数会让「钉了却看不见」的事项被误以为添加失败；
   * 这里靠 flex-wrap 自动换行、条数多时缩小卡片来容纳。
   */
  const dashMilestones = useMemo(() => {
    const ICONS = [CalendarClock, GraduationCap, Flame, TrendingUp];
    const pinned = datedMilestones
      .filter((m) => m.pinned)
      .sort((a, b) => a.date.localeCompare(b.date));
    return pinned.map((m, i) => ({
      id: m.id,
      label: m.title,
      date: m.date,
      icon: ICONS[i % ICONS.length],
      cls: 'text-emerald-100',
    }));
  }, [datedMilestones]);

  /** 可挑选的：有日期、未钉住、且还没过太久 */
  const availableMilestones = useMemo(
    () =>
      datedMilestones
        .filter((m) => !m.pinned && daysUntil(fromKey(m.date), today) >= -1)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [datedMilestones, today]
  );

  const startEdit = (id: string, title: string, date: string) => {
    setEditingId(id);
    setDraftTitle(title);
    setDraftDate(date);
  };

  const saveMilestone = () => {
    const title = draftTitle.trim();
    if (!title || !draftDate) {
      setEditingId(null);
      return;
    }
    if (editingId) {
      setMilestones(milestones.map((m) => (m.id === editingId ? { ...m, title, date: draftDate } : m)));
    }
    setEditingId(null);
  };

  /** 从总览移除 = 取消钉住，数据仍保留在重要事项里，不会被删掉 */
  const removeMilestone = (id: string) =>
    setMilestones(milestones.map((m) => (m.id === id ? { ...m, pinned: false } : m)));

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

  /** 最近一个未完成、还没过期的事项，用于「重要事项」指标卡的副标题 */
  const nextMilestone = useMemo(
    () =>
      [...store.milestones]
        .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), today) >= 0)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0],
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
          sub: nextMilestone ? `最近「${nextMilestone.title}」` : '还没有待办事项',
          tone: 'sky' as const, view: 'milestones' as ViewId,
        }]),
  ];

  return (
    <div className="space-y-4">
      {/* 欢迎条
          注意：这里**不能**加 overflow-hidden。倒计时卡片上的「添加」是一个
          absolute 下拉面板，会被 overflow-hidden 裁掉，表现为「点了没反应 / 看不见」。
          发光效果改由下面那层自带 overflow-hidden 的容器去裁，效果一样。 */}
      <div className="relative rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 py-5 shadow-lg shadow-emerald-950/30">
        {/* 装饰光斑层：只在这一层裁剪，不影响到外面的下拉面板 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        >
          <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="absolute -left-20 -bottom-28 w-64 h-64 rounded-full bg-teal-400/10 blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-emerald-100/90 text-xs font-medium flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> 第 {week} 教学周
            </p>
            <h1 className="text-2xl font-bold tracking-tight mt-1 text-white">
              {today.getMonth() + 1} 月 {today.getDate()} 日
              <span className="text-emerald-100/70 font-medium text-lg ml-2">
                周{'日一二三四五六'[today.getDay()]}
              </span>
            </h1>
            <p className="text-emerald-100/80 text-sm mt-1">
              {restCourses.length > 0
                ? `今天还有 ${restCourses.length} 节课，最近一节 ${restCourses[0].start} ${restCourses[0].name}`
                : '今天课都上完了，剩下的时间归你安排'}
            </p>
          </div>
          {/* 钉住的事项全部展示；条数多时卡片自动变小并换行，不再被截断 */}
          <div className="flex gap-2 flex-wrap justify-end max-w-[46rem]">
            {dashMilestones.map((e) => {
              const isEditing = editingId === e.id;
              const d = daysUntil(fromKey(e.date), today);
              const compact = dashMilestones.length > 4;
              return (
                <div
                  key={e.id}
                  className={cn(
                    'bg-white/10 rounded-2xl backdrop-blur text-center border border-white/10 group relative',
                    compact ? 'px-3 py-2 min-w-[5.5rem]' : 'px-4 py-3 min-w-[7.5rem]'
                  )}
                >
                  {isEditing ? (
                    // 就地编辑：改标题和日期，回车或点✓保存
                    <div className="space-y-1.5">
                      <input
                        value={draftTitle}
                        onChange={(ev) => setDraftTitle(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') saveMilestone();
                          if (ev.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full rounded-md bg-white/20 px-1.5 py-1 text-[11px] text-white outline-none placeholder:text-white/50"
                        placeholder="名称"
                      />
                      <input
                        type="date"
                        value={draftDate}
                        onChange={(ev) => setDraftDate(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') saveMilestone();
                          if (ev.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full rounded-md bg-white/20 px-1.5 py-1 text-[11px] text-white outline-none"
                      />
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={saveMilestone}
                          className="rounded-md bg-white/25 hover:bg-white/35 px-2 py-0.5 text-[10px] text-white"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[10px] text-white/80"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={cn('flex items-center justify-center gap-1', compact ? 'text-[10px]' : 'text-[11px]', e.cls)}>
                        <e.icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                        <span className="truncate max-w-[6rem]">距 {e.label}</span>
                      </p>
                      <p className={cn('font-extrabold leading-tight tabular-nums text-white', compact ? 'text-2xl' : 'text-3xl')}>
                        {d < 0 ? '✓' : d}
                      </p>
                      <p className={cn('text-[10px]', e.cls)}>{d < 0 ? '已完成' : '天'}</p>
                      {/* 悬停出现编辑/移除，不占平时空间 */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(e.id, e.label, e.date)}
                          title="修改"
                          className="w-5 h-5 rounded-md bg-white/20 hover:bg-white/35 flex items-center justify-center text-white"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => removeMilestone(e.id)}
                          title="从总览移除（事项本身保留）"
                          className="w-5 h-5 rounded-md bg-white/20 hover:bg-rose-500/70 flex items-center justify-center text-white"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* 添加：从「重要事项」里挑一个放上来，而不是新建一个。
                这样绿色条和重要事项页共用同一份数据，两边永远一致。 */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                title="从重要事项中选择要显示的事项"
                className={cn(
                  'rounded-2xl border border-dashed border-white/30 bg-white/5 hover:bg-white/15',
                  'flex flex-col items-center justify-center gap-1 text-white/75 hover:text-white',
                  'transition-colors',
                  // 一个都没钉时给一块和倒计时卡等高的引导区，避免只剩一条小窄条
                  dashMilestones.length === 0
                    ? 'px-6 py-4 min-w-[13rem]'
                    : 'px-4 py-3 min-w-[5rem]'
                )}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px] whitespace-nowrap">
                  {dashMilestones.length === 0 ? '添加倒计时' : '添加'}
                </span>
                {dashMilestones.length === 0 && (
                  <span className="text-[10px] text-white/50 whitespace-nowrap">从重要事项里挑</span>
                )}
              </button>

              {pickerOpen && (
                <>
                  {/* 点空白处关闭 */}
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-20 w-72 max-h-80 overflow-y-auto rounded-xl bg-[var(--surface-1)] border border-[var(--border-3)] shadow-2xl shadow-black/50 p-1.5">
                    <p className="px-2 py-1.5 text-[10px] text-slate-400">
                      从「重要事项」中选择（已显示的不会再列出）
                    </p>
                    {availableMilestones.length === 0 ? (
                      <p className="px-2 py-3 text-[11px] text-slate-500 text-center">
                        重要事项里已经没有可添加的了，
                        <button
                          onClick={() => { setPickerOpen(false); setView('milestones'); }}
                          className="text-emerald-400 hover:underline"
                        >
                          去新建 →
                        </button>
                      </p>
                    ) : (
                      availableMilestones.map((m) => {
                        const d = daysUntil(fromKey(m.date), today);
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              setMilestones(
                                milestones.map((x) =>
                                  x.id === m.id ? { ...x, pinned: true } : x
                                )
                              );
                              setPickerOpen(false);
                            }}
                            className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-[var(--surface-3)] transition-colors flex items-center gap-2"
                          >
                            <span className="text-sm">{m.emoji ?? '📌'}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs text-[var(--text-2)] truncate">{m.title}</span>
                              <span className="block text-[10px] text-slate-500">
                                {m.date}
                                {m.category ? ` · ${m.category}` : ''}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'text-[10px] tabular-nums shrink-0',
                                d < 0 ? 'text-slate-500' : d <= 7 ? 'text-rose-400' : 'text-emerald-400'
                              )}
                            >
                              {d < 0 ? '已过' : `${d} 天`}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const accent: Record<string, string> = {
            sky: 'bg-sky-500/12 text-sky-400',
            emerald: 'bg-emerald-500/12 text-emerald-400',
            amber: 'bg-amber-500/12 text-amber-400',
            rose: 'bg-rose-500/12 text-rose-400',
          };
          return (
            <button
              key={s.label}
              onClick={() => setView(s.view)}
              className="card-surface card-lift text-left px-4 py-3.5 group"
            >
              <div className="flex items-center gap-2.5">
                <span className={cn('icon-chip', accent[s.tone] ?? accent.emerald)}>
                  <s.icon className="w-4 h-4" />
                </span>
                <span className="text-[11px] text-slate-400 flex-1 truncate">{s.label}</span>
              </div>
              <p className="mt-2.5 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-[var(--text-1)] tnum leading-none">{s.value}</span>
                <span className="text-xs text-slate-400">{s.unit}</span>
              </p>
              <div className="mt-2.5">
                <Chip tone={s.tone}>{s.sub}</Chip>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-5 items-start">
        {/* 今日时间轴 */}
        <Panel
          title="今日时间轴"
          icon={Clock}
          tone="sky"
          className="lg:col-span-3"
          action={
            <button onClick={() => setView('today')} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              查看详情 →
            </button>
          }
        >
          {timeline.length === 0 ? (
            <Empty icon={Clock}>
              今天没有课程安排，好好休息 🎉
              <br />
              想加事情可以去「待办清单」或「重要事项」。
            </Empty>
          ) : (
            <ol className="relative space-y-2.5 pl-5">
              <span className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-2)]" />
              {timeline.map((t, i) => (
                <li key={`${t.title}-${i}`} className="relative">
                  <span
                    className={cn(
                      'absolute -left-5 top-2 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--surface-1)]',
                      KIND_DOT[t.kind] ?? 'bg-slate-300',
                      t.ongoing && 'animate-pulse'
                    )}
                  />
                  <div className={cn(
                    'rounded-xl px-3.5 py-2.5 border',
                    t.ongoing
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : t.done
                        ? 'bg-[var(--surface-2)] border-transparent opacity-60'
                        : 'bg-[var(--surface-2)] border-[var(--border-1)]'
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 tnum w-11 shrink-0">{t.time}</span>
                      <span className={cn('text-sm font-medium text-[var(--text-1)] flex-1', t.done && 'line-through')}>
                        {t.title}
                      </span>
                      {t.ongoing && <Chip tone="emerald">进行中</Chip>}
                      {t.minutes > 0 && <span className="text-[10px] text-slate-400">{t.minutes} 分钟</span>}
                    </div>
                    {t.sub && <p className="text-[11px] text-slate-400 mt-0.5 pl-[3.25rem] line-clamp-2">{t.sub}</p>}
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
            tone="emerald"
            action={
              <button onClick={() => setView('todos')} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                全部 →
              </button>
            }
          >
            {openTodos.length === 0 ? (
              <Empty icon={CheckSquare}>没有待办，清爽 ✨</Empty>
            ) : (
              <ul className="space-y-1.5">
                {openTodos
                  .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
                  .slice(0, 5)
                  .map((t) => {
                    const overdueT = t.due && t.due < store.todayKey;
                    const dueToday = t.due === store.todayKey;
                    return (
                      <li key={t.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border-1)] px-3 py-2">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          t.priority === 'high' ? 'bg-rose-500' : t.priority === 'low' ? 'bg-slate-500' : 'bg-emerald-500'
                        )} />
                        <span className="text-xs text-[var(--text-2)] flex-1 truncate">{t.text}</span>
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
            tone="violet"
            action={
              <button onClick={() => setView('assignments')} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                全部 →
              </button>
            }
          >
            {dueSoon.length === 0 ? (
              <Empty icon={BookOpen}>没有未完成作业 🎉</Empty>
            ) : (
              <ul className="space-y-1.5">
                {dueSoon.slice(0, 4).map((a) => (
                  <li key={a.id} className="rounded-lg bg-[var(--surface-2)] border border-[var(--border-1)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-2)] flex-1 truncate font-medium">{a.title}</span>
                      <Chip tone={a.days < 0 ? 'rose' : a.days <= 2 ? 'amber' : 'sky'}>
                        {a.days < 0 ? `逾期 ${-a.days} 天` : a.days === 0 ? '今天' : `${a.days} 天`}
                      </Chip>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{a.course} · {a.due}{a.dueTime ? ` ${a.dueTime}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* 进度概览：运动卡片跟随设置开关，关闭时由「重要事项」补位 */}
      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {settings.runEnabled ? (
          <Panel title="运动打卡" icon={Footprints} tone="emerald" className="flex flex-col">
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-extrabold text-[var(--text-1)] tnum">
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
          <Panel title="重要事项" icon={Target} tone="rose">
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-extrabold text-[var(--text-1)] tnum">
                {store.milestones.filter((m) => !m.done).length}
                <span className="text-sm font-normal text-slate-400"> 项待办</span>
              </p>
              {nextMilestone && (
                <Chip tone="rose">{daysUntil(fromKey(nextMilestone.date!), today)} 天</Chip>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {nextMilestone ? `最近一项：${nextMilestone.title}` : '还没有待办事项'}
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

        <Panel title="身体数据" icon={HeartPulse} tone="rose">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400">最新体重</p>
              <p className="text-lg font-bold text-[var(--text-1)] tnum">
                {latestHealth?.weight ? `${latestHealth.weight} kg` : '--'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">今日蛋白</p>
              <p className="text-lg font-bold text-[var(--text-1)] tnum">{todayProtein} g</p>
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

        <Panel title="今日饮食" icon={UtensilsCrossed} tone="amber">
          <div className="flex items-end justify-between mb-2">
            <p className="text-2xl font-extrabold text-[var(--text-1)] tnum">
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
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-3.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="text-sm text-rose-300 flex-1">
            有 <span className="font-bold">{overdue.length}</span> 个作业已经逾期：
            {overdue.slice(0, 3).map((a) => a.title).join('、')}
            {overdue.length > 3 && ' 等'}
          </p>
          <button onClick={() => setView('assignments')} className="text-xs font-medium text-rose-300 hover:text-rose-200 whitespace-nowrap transition-colors">
            去处理 →
          </button>
        </div>
      )}
    </div>
  );
}
