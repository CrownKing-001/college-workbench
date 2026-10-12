// 打卡日历：把「哪些天打卡了」画成月历，一眼看出连续性和漏掉的日子。
//
// 设计取舍：
//  · 用真实的月历网格（而不是一行 7 个格子的周条），才能跨月看长期坚持情况；
//  · 有训练计划的日子用浅色底标出来，打了卡的实心填充 —— 这样「该练没练」也看得出来；
//  · 点格子可直接补打卡 / 取消，不用回到上面的列表；
//  · 连续打卡天数按「有训练计划的天」计算，休息日不会打断连续记录。
//
// 主题：全部走 CSS 变量（--surface-* / --border-* / --text-*），深浅色自动适配。
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toKey } from '@/lib/storage';

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];

export interface CalendarDayInfo {
  /** 这一天是否有训练安排 */
  planned?: boolean;
  /** 计划内容，作为悬浮提示 */
  title?: string;
}

export function CheckinCalendar({
  done,
  onToggle,
  todayKey,
  dayInfo,
  /** 连续打卡统计只看这些日子（通常是「有训练计划的天」） */
  streakScope,
  /** 额外的可点状态：某些项目（如运动打卡关闭时）可禁用点击 */
  className,
}: {
  done: string[];
  onToggle: (key: string) => void;
  todayKey: string;
  dayInfo?: (key: string) => CalendarDayInfo;
  streakScope?: (key: string) => boolean;
  className?: string;
}) {
  const today = new Date(todayKey + 'T00:00:00');
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const doneSet = useMemo(() => new Set(done), [done]);

  // 生成当月网格（周一为第一列），前后补上邻月的日期以填满 6 行
  const cells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    // getDay(): 0=周日 … 6=周六 → 转成「周一=0」
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - lead);

    const out: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      out.push({
        key: toKey(d),
        day: d.getDate(),
        inMonth: d.getMonth() === m,
      });
    }
    return out;
  }, [cursor]);

  // 当月的打卡次数
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const monthDone = done.filter((k) => k.startsWith(monthPrefix)).length;

  // 连续打卡：从今天往回数，遇到「该练却没打」就停；休息日跳过不计入也不打断
  const streak = useMemo(() => {
    if (!streakScope) return 0;
    let n = 0;
    const d = new Date(today);
    for (let i = 0; i < 400; i++) {
      const k = toKey(d);
      if (doneSet.has(k)) {
        n++;
      } else if (streakScope(k)) {
        // 该练没练 → 连续中断（但今天还没结束，允许今天未打卡不算断）
        if (k !== todayKey) break;
      }
      d.setDate(d.getDate() - 1);
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSet, streakScope, todayKey, todayKey]);

  const shift = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => shift(-1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-[var(--surface-4)] hover:text-[var(--text-1)] transition-colors"
          aria-label="上个月"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-1)]">
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </p>
          <p className="text-[10px] text-slate-500">
            本月打卡 {monthDone} 天
            {streakScope && streak > 0 && (
              <span className="ml-1.5 text-emerald-400 font-medium">连续 {streak} 天</span>
            )}
          </p>
        </div>
        <button
          onClick={() => shift(1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-[var(--surface-4)] hover:text-[var(--text-1)] transition-colors"
          aria-label="下个月"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_HEAD.map((w) => (
          <div key={w} className="text-center text-[10px] text-slate-500">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const isDone = doneSet.has(c.key);
          const info = dayInfo?.(c.key);
          const isToday = c.key === todayKey;
          const isFuture = c.key > todayKey;
          return (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              disabled={isFuture}
              title={
                `${c.key}${info?.title ? ' · ' + info.title : ''}` +
                (isFuture ? ' · 还没到' : isDone ? ' · 已打卡（点击取消）' : ' · 未打卡（点击补打卡）')
              }
              className={cn(
                'relative h-9 rounded-lg text-[11px] flex items-center justify-center transition-colors border',
                // 非本月的日期淡出，但仍然可点（方便补上个月漏掉的）
                !c.inMonth && 'opacity-35',
                isFuture && 'cursor-not-allowed opacity-20',
                isDone
                  ? 'bg-emerald-500 border-emerald-500 text-white font-semibold shadow-sm shadow-emerald-900/30'
                  : info?.planned
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-[var(--surface-3)] border-transparent text-slate-400 hover:bg-[var(--surface-4)]',
                isToday && !isDone && 'ring-1 ring-sky-400/60'
              )}
            >
              {c.day}
              {isDone && (
                <Check className="w-2.5 h-2.5 absolute bottom-0.5 right-0.5 opacity-80" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> 已打卡
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500/10 border border-emerald-500/30 inline-block" /> 有训练安排
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[var(--surface-3)] border border-[var(--border-2)] inline-block" /> 休息日
        </span>
      </div>
    </div>
  );
}
