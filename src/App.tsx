// 应用入口：视图路由 + 全局数据提供 + 桌面提醒
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from '@/store/store';
import Layout, { NAV, type ViewId } from '@/components/Layout';
import Dashboard from '@/views/Dashboard';
import { useReminders } from '@/lib/reminders';

// 启动优化：除首屏「总览」外，其余 11 个视图全部按需加载。
// 这样首屏只需要解析总览用到的代码，冷启动明显更快。
const Today = lazy(() => import('@/views/Today'));
const Todos = lazy(() => import('@/views/Todos'));
const Assignments = lazy(() => import('@/views/Assignments'));
const Week = lazy(() => import('@/views/Week'));
const Courses = lazy(() => import('@/views/Courses'));
const Run = lazy(() => import('@/views/Run'));
const Diet = lazy(() => import('@/views/Diet'));
const Health = lazy(() => import('@/views/Health'));
const Analysis = lazy(() => import('@/views/Analysis'));
const Milestones = lazy(() => import('@/views/Milestones'));
const CalendarScan = lazy(() => import('@/views/CalendarScan'));
const CalendarAcademic = lazy(() => import('@/views/CalendarAcademic'));
const Settings = lazy(() => import('@/views/Settings'));

/** 懒加载视图时的占位，避免切换瞬间白屏 */
function ViewLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-2)] border-t-emerald-400" />
        <p className="text-xs text-slate-500">载入中…</p>
      </div>
    </div>
  );
}

const ALL_VIEWS = new Set<string>(NAV.map((n) => n.id));

/** 从 URL hash 里读视图 id（如 #/diet → 'diet'），非法或缺失时返回 null */
function viewFromHash(): ViewId | null {
  const raw = window.location.hash.replace(/^#\/?/, '').trim().split('?')[0];
  return raw && ALL_VIEWS.has(raw) ? (raw as ViewId) : null;
}

/**
 * URL 里可以临时指定主题：?theme=light / ?theme=dark。
 * 只影响本次显示，不写进设置 —— 方便分享固定主题的链接，也方便自动化截图。
 * 写法既支持 #/diet?theme=light，也支持 /?theme=light#/diet。
 *
 * 在**模块加载时**读一次：路由副作用会重写 hash，等到 React effect 里再读就晚了。
 * 同时把它固化成 THEME_PARAM，让切换视图时也不会把这个参数弄丢。
 */
const THEME_OVERRIDE: 'dark' | 'light' | null = (() => {
  if (typeof window === 'undefined') return null;
  const fromSearch = window.location.search.replace(/^\?/, '');
  const fromHash = window.location.hash.split('?')[1] ?? '';
  for (const q of [fromHash, fromSearch]) {
    const t = new URLSearchParams(q).get('theme');
    if (t === 'light' || t === 'dark') return t;
  }
  return null;
})();

/** 路由重写 hash 时要保留的查询串（没有主题覆盖时为空） */
const THEME_PARAM = THEME_OVERRIDE ? `?theme=${THEME_OVERRIDE}` : '';

function Shell() {
  const store = useStore();
  // 初始视图优先取 URL hash —— 这样刷新/分享链接都能回到同一个页面，
  // 浏览器的前进后退也能在视图之间切换。
  const [view, setView] = useState<ViewId>(() => viewFromHash() ?? 'dashboard');
  const measureSent = useRef(false);
  useReminders();

  // 视图 → hash。用 replaceState 避免每切一次页面都往历史里塞一条。
  // 保留 ?theme= 参数，否则切个视图主题覆盖就丢了。
  useEffect(() => {
    const want = `#/${view}${THEME_PARAM}`;
    if (window.location.hash !== want) {
      window.history.replaceState(null, '', want);
    }
  }, [view]);

  // hash → 视图（浏览器前进/后退、外部改 hash）
  useEffect(() => {
    const onHash = () => {
      const v = viewFromHash();
      if (v) setView(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 空白模板：首次运行时课表与重要事项都保持为空，
  // 由用户在「课表」页手动添加，或用「课表识别」导入图片自动填充。
  useEffect(() => {
    if (!store.ready) return;
    if (store.courses === null) store.setCourses([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  // 主题：把设置里的深/浅色写到 <html data-theme>，供 CSS 变量切换。
  useEffect(() => {
    document.documentElement.dataset.theme = THEME_OVERRIDE ?? store.settings.theme ?? 'dark';
  }, [store.settings.theme]);

  // 首屏数据就绪后上报一次耗时（仅测量模式有接收方，正常运行无副作用）
  useEffect(() => {
    if (!store.ready || measureSent.current) return;
    measureSent.current = true;
    try {
      window.desktop?.reportMeasure?.({ ready: Math.round(performance.now()) });
    } catch {
      /* 浏览器预览模式没有这个接口 */
    }
  }, [store.ready]);

  if (!store.ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--surface-0)] text-[var(--text-2)]">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-slate-400">正在载入工作台数据…</p>
        </div>
      </div>
    );
  }

  return (
    <Layout view={view} setView={setView}>
      <Suspense fallback={<ViewLoading />}>
        {view === 'dashboard' && <Dashboard setView={setView} />}
        {view === 'today' && <Today />}
        {view === 'todos' && <Todos />}
        {view === 'assignments' && <Assignments />}
        {view === 'week' && <Week />}
        {view === 'courses' && <Courses />}
        {view === 'run' && <Run />}
        {view === 'diet' && <Diet />}
        {view === 'health' && <Health setView={setView} />}
        {view === 'analysis' && <Analysis setView={setView} />}
        {view === 'milestones' && <Milestones />}
        {view === 'calendar' && <CalendarScan />}
        {view === 'calendarAcademic' && <CalendarAcademic />}
        {view === 'settings' && <Settings />}
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
