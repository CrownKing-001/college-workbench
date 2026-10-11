// 空闲时段分析：热力图 + 空闲时段排名 + 重要事项清单。
// 结论全部由用户自己的课表算出来（freeMatrix），空白模板下不预设任何训练 / 备考方案。
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import type { ViewId } from '@/components/Layout';
import { Panel, Chip, Empty, btnGhost, btnPrimary } from '@/components/Panel';
import { TIME_SLOTS, currentWeek, freeMatrix, type Course } from '@/data/plan';
import { fromKey, daysUntil } from '@/lib/storage';
import {
  CalendarRange, Lightbulb, ClipboardCheck, Dumbbell, Target, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const cellColor = (free: number, total: number) => {
  const ratio = total > 0 ? free / total : 0;
  // 空白模板没有课表时全是 0，用中性灰，避免整页红块看起来像报错
  if (total > 0 && free === 0) return 'bg-rose-500/25 text-rose-200';
  if (total === 0 || free === 0) return 'bg-[var(--border-1)] text-slate-400';
  if (ratio >= 1) return 'bg-emerald-500 text-white';
  if (ratio >= 0.66) return 'bg-emerald-500/30 text-emerald-200';
  if (ratio >= 0.33) return 'bg-amber-500/25 text-amber-200';
  return 'bg-amber-500/15 text-amber-200/80';
};

/** 空闲比例对应的推荐等级，纯按名次/空闲度判定，与具体活动无关 */
const kindBadge: Record<string, { text: string; cls: string }> = {
  best: { text: '最佳', cls: 'bg-emerald-500/20 text-emerald-300' },
  good: { text: '推荐', cls: 'bg-sky-500/20 text-sky-300' },
  ok: { text: '备选', cls: 'bg-[var(--border-1)] text-[var(--text-2)]' },
};

export default function Analysis({ setView }: { setView?: (v: ViewId) => void }) {
  const store = useStore();
  const courses: Course[] = store.courses ?? [];
  const semesterStart = fromKey(store.settings.semesterStart);
  const week = currentWeek(store.today, semesterStart);

  // 分析窗口：当前周起 3 周，看的是「最近这几周」的稳定空闲
  const window3 = useMemo(() => [week, week + 1, week + 2], [week]);
  const matrix = useMemo(() => freeMatrix(courses, window3), [courses, window3]);

  const hasCourses = courses.length > 0;
  const total = window3.length;

  // 全部时段按空闲周数排序，取前几名做推荐
  const flattest = useMemo(() => {
    const out: { day: number; slot: number; free: number }[] = [];
    matrix.forEach((row, d) => row.forEach((free, s) => out.push({ day: d + 1, slot: s, free })));
    return out.sort((a, b) => b.free - a.free).slice(0, 4);
  }, [matrix]);

  // 排序会把时间顺序打乱，热力图下方的标签需要按「周几 → 时间段」的阅读顺序展示
  const ranked = useMemo(
    () => [...flattest].sort((a, b) => a.day - b.day || a.slot - b.slot),
    [flattest]
  );

  const best = flattest[0];
  // 最高空闲周数为 0 说明这几周每个时段都有课，此时不该硬推「最佳时段」
  const hasFree = Boolean(best) && best.free > 0;

  // 统计每个时间段跨天的总空闲量，用来说明「这段日子整体哪个时段最松」
  const bySlot = useMemo(
    () =>
      TIME_SLOTS.map((s, i) => ({
        label: s.label,
        range: `${s.from}:00–${s.to}:00`,
        free: matrix.reduce((acc, row) => acc + (row[i] ?? 0), 0),
        cap: 7 * total,
      })).sort((a, b) => b.free - a.free),
    [matrix, total]
  );

  // 重要事项：按日期排，未完成在前
  const milestones = useMemo(
    () =>
      [...store.milestones].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      }),
    [store.milestones]
  );

  // 空课表：整页只给一个引导，不渲染算不出内容的热力图
  if (!hasCourses) {
    return (
      <div className="space-y-4">
        <Panel title="空闲时段分析" icon={CalendarRange}>
          <Empty>
            还没有课程数据，先把课表填进来，这里会自动算出你每周的空闲时段热力图。
          </Empty>
          {setView && (
            <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
              <button onClick={() => setView('calendar')} className={btnPrimary}>
                导入课表照片
              </button>
              <button onClick={() => setView('courses')} className={btnGhost}>
                手动添加课程 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            「课表识别」可以从课表照片里读出内容，「课程表」页也可以逐条手动录入。
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 leading-relaxed">
        按你导入的课表统计第 {window3[0]}–{window3[2]} 周，共 {courses.length} 门课。
        {hasFree ? (
          <>
            整体最空的是
            <span className="font-semibold text-slate-700">
              {DAYS[best.day - 1]}{TIME_SLOTS[best.slot].label}
            </span>
            ，这 {total} 周里有 {best.free} 周完全没课；下面把空闲时段按可用程度排了序。
          </>
        ) : (
          <>这几周每个时段都排了课，可以考虑换一个分析窗口或调整课程周次。</>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title={`空闲时段热力图（第 ${window3[0]}–${window3[2]} 周）`}
          icon={CalendarRange}
          className="lg:col-span-2"
        >
          <table className="w-full text-center text-xs">
            <thead>
              <tr>
                <th className="pb-2" />
                {TIME_SLOTS.map((s) => (
                  <th key={s.label} className="pb-2 text-slate-500 font-medium">
                    {s.label}
                    <span className="block text-[10px] font-normal text-slate-400">
                      {s.from}:00–{s.to}:00
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d, i) => (
                <tr key={d}>
                  <td className="pr-2 py-1 text-slate-600 font-medium text-left">{d}</td>
                  {matrix[i].map((free, j) => (
                    <td key={j} className="p-0.5">
                      <div
                        className={cn('rounded-lg py-2 font-semibold', cellColor(free, total))}
                        title={`${total} 周中有 ${free} 周该时段完全没课`}
                      >
                        {free}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            数字 = 该时段在这 {total} 周中有几周完全没课。
            <span className="text-emerald-600 font-medium">深绿</span> = 全空，可固定安排；
            <span className="text-rose-600 font-medium">红</span> = 全有课，放弃这个时段。
          </p>

          {hasFree && (
            <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5">
              <p className="text-[11px] text-emerald-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5" /> 本周期最空闲的时段
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ranked.map((f, i) => (
                  <Chip key={`${f.day}-${f.slot}`} tone={i === 0 ? 'emerald' : 'sky'}>
                    {i === 0 ? '最佳 · ' : ''}
                    {DAYS[f.day - 1]} {TIME_SLOTS[f.slot].label} · {f.free}/{total} 周空
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="空闲时段推荐（按优先级）" icon={Lightbulb} className="lg:col-span-3">
          {!hasFree ? (
            <Empty>这几周所有时段都排了课，暂时给不出可固定安排的时间。</Empty>
          ) : (
            <div className="space-y-2.5">
              {flattest.map((f, i) => {
                const ratio = total > 0 ? f.free / total : 0;
                const kind = ratio >= 1 ? 'best' : ratio >= 0.6 ? 'good' : 'ok';
                return (
                  <div key={`${f.day}-${f.slot}`} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="rounded-xl bg-[var(--surface-3)] border border-[var(--border-2)] px-4 py-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/15 rounded-full px-2 py-0.5">
                          {DAYS[f.day - 1]} {TIME_SLOTS[f.slot].label} {TIME_SLOTS[f.slot].from}:00–{TIME_SLOTS[f.slot].to}:00
                        </span>
                        <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-medium', kindBadge[kind].cls)}>
                          {kindBadge[kind].text}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        第 {window3[0]}–{window3[2]} 周里有 {f.free}/{total} 周该时段完全没课
                        {ratio >= 1
                          ? '，每周都稳定空着，适合安排需要固定节奏的事。'
                          : ratio >= 0.6
                            ? '，大多数周都能用，排计划时优先考虑。'
                            : '，只有部分周空着，按周次灵活安排。'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <p className="text-[11px] text-slate-400 mb-2">各时间段整体空闲量（跨周一至周日）</p>
            <div className="space-y-1.5">
              {bySlot.map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-slate-500 w-24 shrink-0">
                    {s.label} <span className="text-slate-600">{s.range}</span>
                  </span>
                  <div className="flex-1">
                    <div className="w-full h-2 rounded-full bg-[var(--border-1)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${s.cap > 0 ? (s.free / s.cap) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 w-16 text-right tabular-nums">
                    {s.free}/{s.cap}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={`重要事项清单（${milestones.filter((m) => !m.done).length} 项待办）`}
          icon={Target}
          action={
            setView && (
              <button onClick={() => setView('milestones')} className={cn(btnGhost, 'h-7 text-xs')}>
                管理 <ArrowRight className="w-3 h-3" />
              </button>
            )
          }
        >
          {milestones.length === 0 ? (
            <Empty>还没有事项。去「重要事项」页添加考试、作业、竞赛、证书报名……都可以。</Empty>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {milestones.map((m) => {
                const d = m.date ? daysUntil(fromKey(m.date), store.today) : null;
                const soon = !m.done && d !== null && d >= 0 && d <= (m.remindDaysBefore ?? 7);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-xl border px-3.5 py-2.5',
                      m.done
                        ? 'bg-[var(--surface-2)] border-[var(--border-1)] opacity-70'
                        : soon
                          ? 'bg-rose-500/12 border-rose-500/35'
                          : 'bg-[var(--surface-3)] border-[var(--border-2)]'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{m.emoji}</span>
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          m.done ? 'text-slate-400 line-through' : 'text-[var(--text-1)]'
                        )}
                      >
                        {m.title}
                      </span>
                      <Chip tone="slate">{m.category}</Chip>
                      {m.done ? (
                        <Chip tone="emerald">已完成</Chip>
                      ) : d === null ? (
                        <Chip tone="slate">未定日期</Chip>
                      ) : d < 0 ? (
                        <Chip tone="slate">已过 {-d} 天</Chip>
                      ) : (
                        <Chip tone={d === 0 || d <= 3 ? 'rose' : d <= 14 ? 'amber' : 'sky'}>
                          {d === 0 ? '就是今天' : `还有 ${d} 天`}
                        </Chip>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {m.date ? `${m.date}${m.time ? ` ${m.time}` : ''}` : '日期待定'}
                      {m.place ? ` · ${m.place}` : ''}
                    </p>
                    {m.note && <p className="text-[11px] text-slate-500 mt-1">{m.note}</p>}
                    {m.checklist.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {m.checklist.map((c, i) => (
                          <li key={`${c}-${i}`} className="text-[11px] text-slate-400 flex gap-1.5">
                            <span className="text-slate-600 mt-0.5 shrink-0">□</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="使用说明" icon={ClipboardCheck}>
            <ul className="space-y-1.5 text-xs text-slate-500 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                <span>热力图完全来自你的课表，改动「课程表」或换一个开学日期，这里的结论会跟着变。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                <span>数字越大代表该时段越稳定地空着，适合安排需要固定节奏的事情。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                <span>只有部分周空着的时段会在推荐里标注周次差异，安排时按周灵活处理。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                <span>「重要事项」里的内容全部可以自己增删改，每条还能带准备清单，临近时顶部会弹倒计时。</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
