// 桌面工作台外壳：左侧导航 + 顶部状态条 + 内容区
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/store';
import {
  LayoutDashboard, CalendarDays, CheckSquare, BookOpen, Footprints,
  HeartPulse, Lightbulb, Settings as SettingsIcon, Flame,
  CalendarClock, Minus, Square, X, HardDrive, Bell, UtensilsCrossed,
  Target, ScanLine, Sun, Moon,
} from 'lucide-react';
import { currentWeek, WEEKDAY_CN } from '@/data/plan';
import { daysUntil, fromKey, toKey } from '@/lib/storage';

export type ViewId =
  | 'dashboard' | 'today' | 'week' | 'todos' | 'assignments'
  | 'courses' | 'run' | 'health' | 'diet' | 'analysis' | 'milestones'
  | 'calendar' | 'calendarAcademic' | 'settings';

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: 'dashboard', label: '总览', icon: LayoutDashboard, group: '工作台' },
  { id: 'today', label: '今日', icon: CalendarClock, group: '工作台' },
  { id: 'todos', label: '待办清单', icon: CheckSquare, group: '工作台' },
  { id: 'assignments', label: '作业 DDL', icon: BookOpen, group: '工作台' },
  { id: 'milestones', label: '重要事项', icon: Target, group: '工作台' },
  { id: 'week', label: '周计划', icon: CalendarDays, group: '学习' },
  { id: 'courses', label: '课表', icon: BookOpen, group: '学习' },
  { id: 'calendar', label: '课表识别', icon: ScanLine, group: '学习' },
  { id: 'calendarAcademic', label: '校历识别', icon: ScanLine, group: '学习' },
  { id: 'run', label: '运动打卡', icon: Footprints, group: '运动' },
  { id: 'diet', label: '饮食记录', icon: UtensilsCrossed, group: '运动' },
  { id: 'analysis', label: '智能分析', icon: Lightbulb, group: '运动' },
  { id: 'health', label: '体重作息', icon: HeartPulse, group: '运动' },
  { id: 'settings', label: '设置', icon: SettingsIcon, group: '系统' },
];

const GROUPS = ['工作台', '学习', '运动', '系统'];

function CountdownChip({ label, date, icon: Icon, accent }: {
  label: string; date: Date; icon: typeof Flame; accent: string;
}) {
  const d = daysUntil(date);
  const done = d < 0;
  return (
    <div className={cn('flex items-center gap-2 rounded-xl px-3 py-1.5 border', accent)}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[11px] text-slate-500 whitespace-nowrap">{label}</span>
      <span className="text-sm font-bold tabular-nums whitespace-nowrap">
        {done ? '✓' : `${d} 天`}
      </span>
    </div>
  );
}

/**
 * 顶部时钟独立成组件：每秒只重渲染这一小块，
 * 避免整个外壳（含 11 个导航项）跟着每秒重渲染。
 */
function HeaderClock({ pinned, today }: { pinned: string | null; today: Date }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="text-right leading-tight">
      <p className="text-[10px] text-slate-500">{pinned ? '已锁定日期' : '现在时间'}</p>
      <p className="text-xs font-semibold tabular-nums text-[var(--text-2)]">
        {pinned
          ? `${today.getMonth() + 1}/${today.getDate()} 周${WEEKDAY_CN[today.getDay()]}`
          : `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`}
      </p>
    </div>
  );
}

export default function Layout({
  view, setView, children,
}: {
  view: ViewId;
  setView: (v: ViewId) => void;
  children: ReactNode;
}) {
  const store = useStore();
  const [collapsed, setCollapsed] = useState(false);

  const week = currentWeek(store.today, fromKey(store.settings.semesterStart));
  const openTodos = store.todos.filter((t) => !t.done).length;
  const urgentAssign = store.assignments.filter(
    (a) => !a.done && daysUntil(fromKey(a.due), store.today) <= 3
  ).length;

  // 顶部倒计时：取最近 2 个未完成、且还没过期的「重要事项」
  const upcoming = [...store.milestones]
    .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), store.today) >= 0)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .slice(0, 2);

  // 导航小红点：进入提醒窗口的未完成事项数
  const urgentMilestones = store.milestones.filter(
    (m) =>
      !m.done &&
      m.date &&
      daysUntil(fromKey(m.date), store.today) >= 0 &&
      daysUntil(fromKey(m.date), store.today) <= (m.remindDaysBefore ?? 7)
  ).length;

  const badges: Partial<Record<ViewId, number>> = {
    todos: openTodos,
    assignments: urgentAssign,
    milestones: urgentMilestones,
  };

  const isDesktopApp = store.desktop;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-1)]">
      {/* 侧边导航 */}
      <aside
        className={cn(
          'shrink-0 flex flex-col bg-[var(--sidebar)] text-[var(--text-2)] transition-all duration-200 border-r border-[var(--border-1)]',
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-[var(--border-1)]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-1)] leading-tight truncate">大学日程</p>
              <p className="text-[10px] text-slate-500 leading-tight">桌面工作台</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {GROUPS.map((g) => {
            // 关闭「运动打卡」时整项从导航里摘掉，分组为空则连标题一起隐藏
            const items = NAV.filter(
              (n) => n.group === g && !(n.id === 'run' && !store.settings.runEnabled)
            );
            if (!items.length) return null;
            return (
              <div key={g}>
                {!collapsed && (
                  <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {g}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((n) => {
                    const active = view === n.id;
                    const badge = badges[n.id];
                    return (
                      <button
                        key={n.id}
                        onClick={() => setView(n.id)}
                        title={collapsed ? n.label : undefined}
                        className={cn(
                          'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-emerald-600 text-white font-medium shadow-sm shadow-emerald-900/40'
                            : 'text-slate-400 hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]'
                        )}
                      >
                        <n.icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="flex-1 text-left truncate">{n.label}</span>}
                        {!collapsed && !!badge && badge > 0 && (
                          <span className={cn(
                            'text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                            active ? 'bg-white/25 text-white' : 'bg-emerald-500/20 text-emerald-300'
                          )}>
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 shrink-0 border-t border-[var(--border-1)] text-slate-500 hover:text-[var(--text-1)] text-xs transition-colors"
        >
          {collapsed ? '»' : '« 收起'}
        </button>
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 自定义标题栏（桌面端） */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-[var(--header)] border-b border-[var(--border-1)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-[var(--text-1)] whitespace-nowrap">
              {NAV.find((n) => n.id === view)?.label}
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              第 {week} 教学周
            </span>
          </div>

          <div className="flex-1" />

          <div className="hidden lg:flex items-center gap-2">
            {/* 倒计时跟随「重要事项」里的用户数据，不写死任何具体事项；
                图标统一用中性的 Target，避免对分类做假设 */}
            {upcoming.map((m) => (
              <CountdownChip
                key={m.id}
                label={m.title}
                date={fromKey(m.date!)}
                icon={Target}
                accent={cn(
                  'bg-rose-500/10 border-rose-500/30 text-rose-300',
                  daysUntil(fromKey(m.date!), store.today) > 14 &&
                    'bg-sky-500/10 border-sky-500/30 text-sky-300'
                )}
              />
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-[var(--border-1)]">
            <HeaderClock pinned={store.settings.pinnedDate ?? null} today={store.today} />
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-[var(--border-1)]">
            <button
              onClick={() =>
                store.setSettings({ theme: store.settings.theme === 'dark' ? 'light' : 'dark' })
              }
              title={store.settings.theme === 'dark' ? '切换到浅色' : '切换到深色'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[var(--border-1)] hover:text-[var(--text-2)] transition-colors"
            >
              {store.settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setView('settings')}
              title={store.settings.notifyEnabled ? '提醒已开启' : '提醒已关闭'}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                store.settings.notifyEnabled
                  ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25'
                  : 'text-slate-500 hover:bg-[var(--border-1)] hover:text-[var(--text-2)]'
              )}
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('settings')}
              title="数据存放位置"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[var(--border-1)] hover:text-[var(--text-2)] transition-colors"
            >
              <HardDrive className="w-4 h-4" />
            </button>
          </div>

          {isDesktopApp && (
            <div className="flex items-center gap-0.5 pl-2">
              <button
                onClick={() => window.desktop?.minimize()}
                title="最小化"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[var(--border-1)] hover:text-[var(--text-1)] transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.desktop?.toggleMaximize()}
                title="最大化 / 还原"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[var(--border-1)] hover:text-[var(--text-1)] transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => window.desktop?.hideToTray()}
                title="收进托盘"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {/* 内容 */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-5 py-5 space-y-5">{children}</div>
        </main>

        <footer className="h-7 shrink-0 flex items-center gap-3 px-4 bg-white border-t border-slate-200 text-[10px] text-slate-400">
          {/* 底部只显示由用户数据推导出来的中性信息，
              不写死训练分化、跑步赛季这类个人计划 */}
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3 h-3" /> 第 {week} 教学周
          </span>
          <span>·</span>
          <span className="tabular-nums">
            {store.today.getFullYear()} 年 {store.today.getMonth() + 1} 月 {store.today.getDate()} 日 周
            {WEEKDAY_CN[store.today.getDay()]}
          </span>
          <span className="flex-1" />
          <span>
            {store.desktop
              ? `数据已保存到本机文件 · ${store.storageDir || 'data 目录'}`
              : '浏览器预览模式 · 数据存在 localStorage'}
          </span>
          <span className="tabular-nums">{toKey(store.today)}</span>
        </footer>
      </div>
    </div>
  );
}

export { NAV };
