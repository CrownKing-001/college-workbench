// 运动打卡：通用打卡页。
// 空白模板不预设任何学校的考核规则：目标次数、打卡类型、起止日期全部读「设置」里用户自己填的值，
// 没有填的部分就不显示对应的提示，页面只负责「计数 + 进度 + 记录管理」。
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { Panel, Empty, Chip, Bar, btnPrimary, btnGhost, IconButton } from '@/components/Panel';
import { currentWeek } from '@/data/plan';
import { fromKey, toKey, daysUntil } from '@/lib/storage';
import { Footprints, Dumbbell, Trash2, Info, CalendarCheck, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 把设置里的类型串拆成选项：中英文逗号都当分隔符，去空白、去重、丢掉空项 */
function parseTypes(raw: string): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

export default function Run() {
  const store = useStore();
  const { run: logs, setRun: setLogs, settings, today } = store;

  const types = useMemo(() => parseTypes(settings.runTypes), [settings.runTypes]);
  const [filter, setFilter] = useState('all');

  const semesterStart = fromKey(settings.semesterStart);
  const week = currentWeek(today, semesterStart);
  const done = logs.length;
  const target = Math.max(1, settings.runTarget || 0);
  const todayKey = toKey(today);
  const todayCount = logs.filter((l) => l.date === todayKey).length;

  // 起止日期留空 = 不限制，相关倒计时整块不渲染
  const hasStart = Boolean(settings.runStart);
  const hasEnd = Boolean(settings.runEnd);
  const startDate = hasStart ? fromKey(settings.runStart!) : null;
  const endDate = hasEnd ? fromKey(settings.runEnd!) : null;
  const daysLeft = endDate ? daysUntil(endDate, today) : null;
  const notStarted = startDate ? daysUntil(startDate, today) > 0 : false;
  const ended = daysLeft !== null && daysLeft < 0;

  // 剩余周数优先按用户填的结束日期算，没填就退回按学期总周数算
  const weeksLeft = endDate
    ? Math.max(0, Math.ceil(daysLeft! / 7))
    : Math.max(0, settings.totalWeeks - week + 1);
  const remain = Math.max(0, target - done);
  // 配速建议只在有目标、有剩余周数时给，避免算出 0 或无穷大这种没意义的数字
  const pace = remain > 0 && weeksLeft > 0 ? Math.ceil(remain / weeksLeft) : 0;

  const add = (type: string) => {
    if (!type) return;
    setLogs([...logs, { date: todayKey, type }]);
  };

  const removeAt = (i: number) => setLogs(logs.filter((_, idx) => idx !== i));

  // 按周统计打卡次数
  const byWeek = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of logs) {
      const w = currentWeek(fromKey(l.date), semesterStart);
      map.set(w, (map.get(w) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [logs, semesterStart]);

  // 类型可能被用户在设置里改掉，记录里留下的旧类型也要能筛出来
  const filterOptions = useMemo(() => {
    const extra = logs.map((l) => l.type).filter((t) => t && !types.includes(t));
    return [...types, ...new Set(extra)];
  }, [types, logs]);

  // 筛选值失效（类型被删掉）时自动回到「全部」
  const activeFilter = filter !== 'all' && filterOptions.includes(filter) ? filter : 'all';
  const filtered = activeFilter === 'all' ? logs : logs.filter((l) => l.type === activeFilter);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="打卡进度" icon={Footprints} className="lg:col-span-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-4xl font-extrabold text-slate-800 tabular-nums">
              {done}
              <span className="text-lg font-medium text-slate-400"> / {target} 次</span>
            </p>
            <p className="text-sm text-slate-500">
              目标完成度{' '}
              <span className="font-bold text-emerald-600 text-lg">
                {Math.min(100, Math.round((done / target) * 100))}
              </span>
              <span className="text-slate-400"> %</span>
            </p>
          </div>

          <div className="mt-3">
            <Bar value={done} max={target} />
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {types.length === 0 ? (
              // 一个类型都没配就不给按钮，直接引导去设置，避免出现空白打卡
              <span className="text-xs text-slate-500">
                还没有打卡类型，去「设置」里填写后这里会出现按钮。
              </span>
            ) : (
              types.map((t, i) => (
                <button
                  key={t}
                  onClick={() => add(t)}
                  className={i === 0 ? btnPrimary : cn(btnGhost, 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15')}
                >
                  {i === 0 ? <Footprints className="w-4 h-4" /> : <Dumbbell className="w-4 h-4" />} {t} +1
                </button>
              ))
            )}
            <button
              onClick={() => setLogs(logs.slice(0, -1))}
              disabled={done === 0}
              className={cn(btnGhost, 'text-slate-500')}
              title="撤销最后一次打卡"
            >
              <Trash2 className="w-4 h-4" /> 撤销
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
            <Chip tone="emerald">今日已打卡 {todayCount} 次</Chip>
            {notStarted ? (
              <Chip tone="sky">距开始还有 {daysUntil(startDate!, today)} 天</Chip>
            ) : (
              <Chip tone={done >= target ? 'emerald' : 'sky'}>
                {done >= target ? '已达成目标' : `还差 ${remain} 次`}
              </Chip>
            )}
            {pace > 0 && (
              <Chip tone="violet">
                剩下 {weeksLeft} 周，每周约 {pace} 次可完成目标
              </Chip>
            )}
            {daysLeft !== null && (
              <Chip tone={daysLeft < 0 ? 'slate' : daysLeft <= 14 ? 'rose' : 'slate'}>
                {daysLeft < 0
                  ? `已于 ${settings.runEnd} 结束`
                  : `距结束 ${daysLeft} 天（${settings.runEnd}）`}
              </Chip>
            )}
          </div>

          {ended && <p className="text-[11px] text-slate-400 mt-2">设定的结束日期已过，记录仍然可以继续补录。</p>}
        </Panel>

        <Panel title="打卡设置" icon={Info} className="lg:col-span-2">
          {notStarted ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              设定的开始日期是 {settings.runStart}，还有 {daysUntil(startDate!, today)} 天。
              在此之前也可以照常记录，进度不会清零。
            </p>
          ) : (
            <ul className="space-y-2">
              <li className="text-xs text-slate-600 leading-relaxed flex gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                <span>目标 {target} 次{done >= target ? '，已经达成 🎉' : `，已完成 ${done} 次`}。</span>
              </li>
              <li className="text-xs text-slate-600 leading-relaxed flex gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                <span>
                  打卡类型：
                  {types.length ? types.join(' / ') : '尚未设置（去「设置」里填写）'}。
                </span>
              </li>
              {hasStart || hasEnd ? (
                <li className="text-xs text-slate-600 leading-relaxed flex gap-2">
                  <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                  <span>
                    统计周期：{hasStart ? settings.runStart : '不限'} ~ {hasEnd ? settings.runEnd : '不限'}。
                  </span>
                </li>
              ) : (
                <li className="text-xs text-slate-600 leading-relaxed flex gap-2">
                  <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                  <span>没有设置起止日期，按累计次数统计，不做时间限制。</span>
                </li>
              )}
            </ul>
          )}
          <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5">
            <p className="text-[11px] text-emerald-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              {pace > 0
                ? `还差 ${remain} 次，剩下 ${weeksLeft} 周，每周约 ${pace} 次就能完成目标`
                : done >= target
                  ? '目标已达成，保持节奏就好'
                  : '目标次数、类型、起止日期都可以在「设置」里随时调整'}
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title={`打卡记录（${filtered.length}）`} icon={CalendarCheck} className="lg:col-span-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {['all', ...filterOptions].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  activeFilter === f
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                )}
              >
                {f === 'all' ? '全部' : f}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Empty>
              {types.length === 0
                ? '还没有打卡类型，去「设置」里填几个再回来打卡。'
                : '还没有记录，完成第一次打卡后开始计数 💪'}
            </Empty>
          ) : (
            <ul className="space-y-1.5 max-h-[22rem] overflow-y-auto pr-1">
              {[...filtered].reverse().map((l) => {
                const realIdx = logs.indexOf(l);
                return (
                  <li key={`${l.date}-${l.type}-${realIdx}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      l.type === types[0] ? 'bg-emerald-500' : 'bg-orange-500'
                    )} />
                    <span className="text-xs text-slate-700 tabular-nums">{l.date}</span>
                    <span className="text-xs text-slate-500 flex-1">{l.type}</span>
                    <IconButton onClick={() => removeAt(realIdx)} title="删除这条" tone="rose">
                      <Trash2 className="w-3 h-3" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="每周分布" icon={Flame} className="lg:col-span-2">
          {byWeek.length === 0 ? (
            <Empty>暂无数据</Empty>
          ) : (
            <ul className="space-y-2">
              {byWeek.map(([w, n]) => (
                <li key={w} className="flex items-center gap-2.5">
                  <span className={cn(
                    'text-[11px] w-12 shrink-0 tabular-nums',
                    w === week ? 'text-emerald-600 font-semibold' : 'text-slate-500'
                  )}>
                    第{w}周
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={n}
                      max={Math.max(pace > 0 ? pace : 3, ...byWeek.map((x) => x[1]))}
                      tone={pace > 0 && n >= pace ? 'emerald' : 'amber'}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 w-8 text-right tabular-nums">{n} 次</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            {pace > 0
              ? `绿条表示该周已达到「每周约 ${pace} 次」的节奏。`
              : '条形长度按你每周的实际打卡次数绘制。'}
          </p>
        </Panel>
      </div>
    </div>
  );
}
