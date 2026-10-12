// 体重作息：身体数据、体重曲线、睡眠曲线、训练打卡日历
//
// 注意：饮食相关的记录 / 统计 / 目标已全部搬到「饮食记录」页，
// 这里不再出现任何饮食入口与重复统计 —— 一处记录、一处查看。
import { useMemo, useState } from 'react';
import { useStore, type HealthLog } from '@/store/store';
import { Panel, Empty, IconButton, inputCls, btnPrimary } from '@/components/Panel';
import { currentWeek } from '@/data/plan';
import { isDesktop, fromKey, toKey, addDays } from '@/lib/storage';
import {
  Scale, Moon, Footprints, Dumbbell, Pencil, Trash2, X, CalendarCheck, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CheckinCalendar } from '@/components/CheckinCalendar';
import { TrendChart, TrendSummary } from '@/components/TrendChart';
import type { ViewId } from '@/components/Layout';

/** 睡眠目标（小时）—— 睡眠不足会直接影响恢复与增肌效率 */
const SLEEP_TARGET = 7.5;

/** 把「训练日」设置串解析成 1(周一)~7(周日) 的集合，去空白、去重、丢掉越界值 */
function parseTrainDays(raw: string): Set<number> {
  const out = new Set<number>();
  for (const part of (raw ?? '').split(/[,，]/)) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return out;
}

function WeightChart({ logs }: { logs: HealthLog[] }) {
  const points = [...logs]
    .filter((l) => l.weight)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((l) => ({ date: l.date, value: l.weight! }));

  return (
    <TrendChart
      points={points}
      color="#10b981"
      emptyHint="至少记录 2 天体重后，这里会出现体重曲线"
    />
  );
}

function SleepChart({ logs }: { logs: HealthLog[] }) {
  const points = [...logs]
    .filter((l) => typeof l.sleep === 'number' && l.sleep! > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((l) => ({ date: l.date, value: l.sleep! }));

  return (
    <>
      <TrendChart
        points={points}
        color="#38bdf8"
        target={SLEEP_TARGET}
        targetLabel={`目标 ${SLEEP_TARGET}h`}
        unit="h"
        warnBelow
        emptyHint="至少记录 2 天睡眠后，这里会出现睡眠曲线"
      />
      <TrendSummary
        points={points}
        target={SLEEP_TARGET}
        goodText={(avg) =>
          Number(avg) >= SLEEP_TARGET
            ? `近 ${points.length} 天平均 ${avg}h，达标 ✅`
            : `近 ${points.length} 天平均 ${avg}h，低于 ${SLEEP_TARGET}h 目标`
        }
      />
    </>
  );
}

export default function Health({ setView }: { setView?: (v: ViewId) => void }) {
  const store = useStore();
  const { health: logs, setHealth: setLogs, trainDone: done, setTrainDone: setDone, settings, today, todayKey } = store;

  const [weight, setWeight] = useState('');
  const [sleep, setSleep] = useState('');
  const [steps, setSteps] = useState('');
  const [editDate, setEditDate] = useState<string | null>(null);
  const [eWeight, setEWeight] = useState('');
  const [eSleep, setESleep] = useState('');
  const [eSteps, setESteps] = useState('');

  const save = () => {
    if (!weight && !sleep && !steps) return;
    const rest = logs.filter((l) => l.date !== todayKey);
    const prev = logs.find((l) => l.date === todayKey) ?? { date: todayKey };
    setLogs([
      ...rest,
      {
        date: todayKey,
        weight: weight ? Number(weight) : prev.weight,
        sleep: sleep ? Number(sleep) : prev.sleep,
        steps: steps ? Number(steps) : prev.steps,
      },
    ]);
    setWeight(''); setSleep(''); setSteps('');
  };

  const startEdit = (l: HealthLog) => {
    setEditDate(l.date);
    setEWeight(l.weight?.toString() ?? '');
    setESleep(l.sleep?.toString() ?? '');
    setESteps(l.steps?.toString() ?? '');
  };

  const saveEdit = () => {
    if (!editDate) return;
    setLogs(logs.map((l) => l.date === editDate ? {
      date: l.date,
      weight: eWeight ? Number(eWeight) : undefined,
      sleep: eSleep ? Number(eSleep) : undefined,
      steps: eSteps ? Number(eSteps) : undefined,
    } : l));
    setEditDate(null);
  };

  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sortedLogs[0];

  const weekLogs = logs.filter((l) => fromKey(l.date) >= addDays(today, -6));
  const sleepVals = weekLogs.filter((l) => l.sleep);
  const avgSleep = sleepVals.length
    ? (sleepVals.reduce((s, l) => s + l.sleep!, 0) / sleepVals.length).toFixed(1)
    : '--';

  const semesterStart = fromKey(settings.semesterStart);
  const week = currentWeek(today, semesterStart);

  // 用户自己定的训练日（设置 → 训练日）；留空则不区分训练日与休息日
  const trainDays = useMemo(() => parseTrainDays(settings.trainDays), [settings.trainDays]);
  const hasPlan = trainDays.size > 0;

  /** 某一天是否安排了训练（周一=1 … 周日=7） */
  const isTrainDay = (key: string) => {
    if (!hasPlan) return false;
    const d = fromKey(key).getDay();
    return trainDays.has(d === 0 ? 7 : d);
  };

  // 本周 7 天的训练打卡
  const weekDays = useMemo(() => {
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const key = toKey(d);
      return {
        key,
        day: d.getDate(),
        wd: '日一二三四五六'[d.getDay()],
        isToday: key === todayKey,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, todayKey, semesterStart]);

  const doneCount = weekDays.filter((d) => done.includes(d.key)).length;

  const stats = [
    {
      icon: Scale, label: '最新体重',
      value: latest?.weight ? `${latest.weight} kg` : '--',
      sub: latest?.weight ? '继续记录，看趋势曲线' : '开始记录吧',
      chip: 'bg-emerald-500/12 text-emerald-400',
    },
    {
      icon: Moon, label: '近 7 天均睡眠',
      value: `${avgSleep} h`,
      sub: `目标 ≥ ${SLEEP_TARGET}h，恢复关键`,
      chip: 'bg-sky-500/12 text-sky-400',
    },
    {
      icon: Footprints, label: '今日步数',
      value: latest?.steps ? `${latest.steps}` : '--',
      sub: '配合训练打卡更有效',
      chip: 'bg-violet-500/12 text-violet-400',
    },
    {
      icon: Dumbbell, label: '本周训练',
      value: `${doneCount}/7 天`,
      sub: '在右侧日历中点选',
      chip: 'bg-amber-500/12 text-amber-400',
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        手动记录每天的身体数据，和训练计划联动——数据保存在本机
        {isDesktop() ? '数据文件' : '浏览器'}里。
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-surface card-lift px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className={cn('icon-chip', s.chip)}>
                <s.icon className="w-4 h-4" />
              </span>
              <span className="text-[11px] text-slate-400 flex-1 truncate">{s.label}</span>
            </div>
            <p className="text-2xl font-extrabold text-[var(--text-1)] mt-2.5 tnum leading-none">{s.value}</p>
            <p className="text-[11px] text-slate-500 mt-1.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`记录今天（${todayKey.slice(5)}）`} icon={Scale}>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[11px] text-slate-400">体重 kg</span>
              <input className={cn(inputCls, 'mt-0.5')} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="60.0" inputMode="decimal" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">睡眠 h</span>
              <input className={cn(inputCls, 'mt-0.5')} value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" inputMode="decimal" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">步数</span>
              <input className={cn(inputCls, 'mt-0.5')} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="8000" inputMode="numeric" />
            </label>
          </div>
          <button onClick={save} className={cn(btnPrimary, 'w-full mt-3')}>保存今天的记录</button>
          <div className="rounded-2xl border border-[var(--border-2)] bg-[var(--surface-2)] p-3 mt-3">
            <p className="text-[11px] text-slate-400 mb-1">体重趋势（最近 14 条）</p>
            <WeightChart logs={logs} />
          </div>
          <div className="rounded-2xl border border-[var(--border-2)] bg-[var(--surface-2)] p-3 mt-3">
            <p className="text-[11px] text-slate-400 mb-1">
              睡眠趋势（最近 14 条）
              <span className="text-slate-500"> · 低于 {SLEEP_TARGET}h 的点会标红</span>
            </p>
            <SleepChart logs={logs} />
          </div>
        </Panel>

        <Panel title={`训练打卡日历（第 ${week} 周）`} icon={CalendarCheck}>
          <CheckinCalendar
            done={done}
            todayKey={todayKey}
            onToggle={(key) =>
              setDone(done.includes(key) ? done.filter((k) => k !== key) : [...done, key].sort())
            }
            dayInfo={(key) => ({
              planned: isTrainDay(key),
              title: isTrainDay(key) ? '训练日' : '休息日',
            })}
            // 连续打卡只看「训练日」：休息日不打断连续记录
            streakScope={hasPlan ? isTrainDay : undefined}
          />
          <p className="text-[11px] text-slate-400 pt-3">
            {hasPlan
              ? '点任意日期即可补打卡或取消。连续天数按「训练日」计算，休息日不会打断。'
              : '点任意日期即可补打卡或取消。还没有设置训练日，去「设置 → 训练日」填一下就能看到安排和连续统计。'}
          </p>

          {/* 本周一览：把日历里这一周单独摊平，看得更直白 */}
          <div className="mt-4 pt-3 border-t border-[var(--border-1)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-slate-400">本周一览</p>
              <p className="text-[11px] text-slate-500">
                已打卡 <span className="font-semibold text-emerald-400">{doneCount}</span>
                {hasPlan ? ` / ${weekDays.filter((d) => isTrainDay(d.key)).length} 个训练日` : ' 天'}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d) => {
                const hit = done.includes(d.key);
                const planned = isTrainDay(d.key);
                return (
                  <button
                    key={d.key}
                    onClick={() =>
                      setDone(hit ? done.filter((k) => k !== d.key) : [...done, d.key].sort())
                    }
                    title={`${d.key} 周${d.wd}${planned ? ' · 训练日' : ' · 休息日'}${hit ? ' · 已打卡' : ''}`}
                    className={cn(
                      'rounded-lg py-1.5 text-center border transition-colors',
                      hit
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : planned
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-[var(--surface-3)] border-[var(--border-2)] text-slate-400 hover:bg-[var(--surface-4)]',
                      d.isToday && 'ring-1 ring-sky-400/60'
                    )}
                  >
                    <span className="block text-[10px] leading-tight">{d.day}</span>
                    <span className="block text-[9px] opacity-75 leading-tight">周{d.wd}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>

      {/* 饮食入口：只做引导，不在这里记录 —— 记录与统计统一在「饮食记录」页 */}
      <div className="rounded-2xl bg-[var(--surface-1)] border border-[var(--border-2)] px-5 py-3.5 flex flex-wrap items-center gap-3">
        <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-xs text-slate-400 flex-1 min-w-[14rem]">
          饮食记录、蛋白质与热量统计、食物库和照片存档都在「饮食记录」页，这里不再重复显示。
        </p>
        {setView && (
          <button onClick={() => setView('diet')} className={cn(btnPrimary, 'h-8 text-xs shrink-0')}>
            去饮食记录 →
          </button>
        )}
      </div>

      <Panel title="历史记录（点铅笔可修改）" icon={Pencil}>
        {sortedLogs.length === 0 ? (
          <Empty>还没有记录</Empty>
        ) : (
          <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
            {sortedLogs.map((l) =>
              editDate === l.date ? (
                <div key={l.date} className="flex flex-wrap items-end gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3">
                  <span className="text-xs font-semibold text-[var(--text-2)] w-20 tabular-nums">{l.date.slice(5)}</span>
                  <label className="block w-24">
                    <span className="text-[10px] text-slate-400">体重 kg</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eWeight} onChange={(e) => setEWeight(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="block w-24">
                    <span className="text-[10px] text-slate-400">睡眠 h</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eSleep} onChange={(e) => setESleep(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="block w-28">
                    <span className="text-[10px] text-slate-400">步数</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eSteps} onChange={(e) => setESteps(e.target.value)} inputMode="numeric" />
                  </label>
                  <button onClick={saveEdit} className={cn(btnPrimary, 'h-8 text-xs')}>保存</button>
                  <IconButton onClick={() => setEditDate(null)} title="取消">
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              ) : (
                <div key={l.date} className="flex items-center gap-3 rounded-xl bg-[var(--surface-3)] px-4 py-2.5">
                  <span className="text-xs font-semibold text-[var(--text-2)] w-20 shrink-0 tabular-nums">{l.date.slice(5)}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-xs text-slate-400">
                    <span>体重 <span className="font-semibold text-[var(--text-1)]">{l.weight ?? '--'}</span> kg</span>
                    <span>睡眠 <span className="font-semibold text-[var(--text-1)]">{l.sleep ?? '--'}</span> h</span>
                    <span>步数 <span className="font-semibold text-[var(--text-1)]">{l.steps ?? '--'}</span></span>
                  </div>
                  <IconButton onClick={() => startEdit(l)} title="编辑" tone="emerald">
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton onClick={() => setLogs(logs.filter((x) => x.date !== l.date))} title="删除" tone="rose">
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              )
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
