// 课表管理：查看 / 编辑 / 增删课程，改动存进数据文件
import { useMemo, useState } from 'react';
import { useStore, uid } from '@/store/store';
import { Panel, Empty, Chip, IconButton, inputCls, btnPrimary, btnGhost } from '@/components/Panel';
import { courseNames, type Course, currentWeek } from '@/data/plan';
import { DAY_LABELS } from '@/lib/schedule';
import { fromKey } from '@/lib/storage';
import { Plus, Pencil, Trash2, Table2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY: Course = {
  day: 1, name: '', start: '08:00', end: '09:35', place: '', weeks: [], teacher: '', credit: undefined,
};

/** 把 weeks 数组压成 "2-4,6-16" 这种紧凑写法 */
function fmtWeeks(weeks: number[]): string {
  if (!weeks.length) return '—';
  const s = [...new Set(weeks)].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return out.join(',');
}

/** 解析 "2-4,6" / "2,3,5" 为周次数组 */
function parseWeeks(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]); const b = Number(m[2]);
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) out.push(w);
    } else if (/^\d+$/.test(part)) {
      out.push(Number(part));
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export default function Courses() {
  const store = useStore();
  const courses: Course[] = store.courses ?? [];
  const [editing, setEditing] = useState<Course | null>(null);
  const [weeksText, setWeeksText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [week, setWeek] = useState(() =>
    Math.min(Math.max(currentWeek(store.today, fromKey(store.settings.semesterStart)), 1), store.settings.totalWeeks)
  );

  const startEdit = (c: Course, idx: number) => {
    setEditing({ ...c, id: c.id ?? `c${idx}` });
    setWeeksText(fmtWeeks(c.weeks));
    setShowAdd(false);
  };

  const startAdd = () => {
    setEditing({ ...EMPTY, id: uid() });
    setWeeksText('2-16');
    setShowAdd(true);
  };

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    const next: Course = {
      ...editing,
      weeks: parseWeeks(weeksText),
      credit: editing.credit === undefined || Number.isNaN(editing.credit) ? undefined : Number(editing.credit),
    };
    const list = [...courses];
    const at = list.findIndex((c, i) => (c.id ?? `c${i}`) === editing.id);
    if (at >= 0) list[at] = next;
    else list.push(next);    store.setCourses(list);
    setEditing(null);
    setShowAdd(false);
  };

  const remove = (c: Course, idx: number) => {
    const key = c.id ?? `c${idx}`;
    store.setCourses(courses.filter((x, i) => (x.id ?? `c${i}`) !== key));
    if (editing && editing.id === key) setEditing(null);
  };

  const byDay = useMemo(() => {
    return DAY_LABELS.map((label, i) => ({
      label,
      day: i + 1,
      items: courses
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => c.day === i + 1)
        .sort((a, b) => a.c.start.localeCompare(b.c.start)),
    }));
  }, [courses]);

  const totalCredit = courses.reduce((s, c) => s + (c.credit ?? 0), 0);
  const names = courseNames(courses);

  return (
    <div className="space-y-4">
      <Panel
        title={`课程总览 · 共 ${courses.length} 条 · ${names.length} 门课${totalCredit ? ` · ${totalCredit} 学分` : ''}`}
        icon={Table2}
        action={
          <div className="flex items-center gap-2">
            <button onClick={startAdd} className={cn(btnPrimary, 'h-8 text-xs')}>
              <Plus className="w-3.5 h-3.5" /> 新增课程
            </button>
          </div>
        }
      >
        {courses.length === 0 && (
          <p className="text-xs text-slate-400 mb-3">
            当前课表为空。点「新增课程」手动录入，或去「课表识别」导入课表图片自动填充。
          </p>
        )}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left text-xs border-separate border-spacing-y-0.5">
            <thead>
              <tr className="text-slate-400">
                <th className="font-medium px-2 py-1.5">课程</th>
                <th className="font-medium px-2 py-1.5 w-16">星期</th>
                <th className="font-medium px-2 py-1.5 w-28">时间</th>
                <th className="font-medium px-2 py-1.5 w-40">地点</th>
                <th className="font-medium px-2 py-1.5 w-24">周次</th>
                <th className="font-medium px-2 py-1.5 w-14">学分</th>
                <th className="font-medium px-2 py-1.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {courses
                .map((c, idx) => ({ c, idx }))
                .sort((a, b) => a.c.day - b.c.day || a.c.start.localeCompare(b.c.start))
                .map(({ c, idx }) => (
                  <tr key={c.id ?? `c${idx}`} className="bg-slate-50 hover:bg-emerald-50/50 transition-colors">
                    <td className="px-2 py-2 rounded-l-lg">
                      <span className="text-slate-800 font-medium">{c.name}</span>
                      {c.tag && <Chip tone="sky" className="ml-2">{c.tag}</Chip>}
                      {c.teacher && <span className="text-slate-400 ml-2">{c.teacher}</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-500">{DAY_LABELS[c.day - 1]}</td>
                    <td className="px-2 py-2 text-slate-600 tabular-nums">{c.start}–{c.end}</td>
                    <td className="px-2 py-2 text-slate-500">{c.place}</td>
                    <td className="px-2 py-2 text-slate-500 tabular-nums">{fmtWeeks(c.weeks)}</td>
                    <td className="px-2 py-2 text-slate-500">{c.credit ?? '—'}</td>
                    <td className="px-2 py-2 rounded-r-lg">
                      <div className="flex items-center gap-0.5">
                        <IconButton onClick={() => startEdit(c, idx)} title="编辑" tone="emerald">
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton onClick={() => remove(c, idx)} title="删除" tone="rose">
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && (
        <Panel title={showAdd ? '新增课程' : '编辑课程'} icon={BookOpen}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="text-[11px] text-slate-400">课程名称 *</span>
              <input
                className={cn(inputCls, 'mt-0.5')}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="如：高等数学"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">星期</span>
              <select
                className={cn(inputCls, 'mt-0.5')}
                value={editing.day}
                onChange={(e) => setEditing({ ...editing, day: Number(e.target.value) })}
              >
                {DAY_LABELS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">标签</span>
              <input
                className={cn(inputCls, 'mt-0.5')}
                value={editing.tag ?? ''}
                onChange={(e) => setEditing({ ...editing, tag: e.target.value || undefined })}
                placeholder="体育课 / 晚课"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">开始时间</span>
              <input type="time" className={cn(inputCls, 'mt-0.5')} value={editing.start}
                onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">结束时间</span>
              <input type="time" className={cn(inputCls, 'mt-0.5')} value={editing.end}
                onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">上课地点</span>
              <input className={cn(inputCls, 'mt-0.5')} value={editing.place}
                onChange={(e) => setEditing({ ...editing, place: e.target.value })} placeholder="如：教学楼 101" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">学分</span>
              <input className={cn(inputCls, 'mt-0.5')} inputMode="decimal"
                value={editing.credit ?? ''}
                onChange={(e) => setEditing({ ...editing, credit: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="3" />
            </label>
            <label className="block lg:col-span-2">
              <span className="text-[11px] text-slate-400">教师</span>
              <input className={cn(inputCls, 'mt-0.5')} value={editing.teacher ?? ''}
                onChange={(e) => setEditing({ ...editing, teacher: e.target.value || undefined })} />
            </label>
            <label className="block lg:col-span-2">
              <span className="text-[11px] text-slate-400">上课周次（支持 2-16 或 2,4,6-8）</span>
              <input className={cn(inputCls, 'mt-0.5')} value={weeksText}
                onChange={(e) => setWeeksText(e.target.value)} placeholder="2-16" />
            </label>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={save} disabled={!editing.name.trim()} className={btnPrimary}>保存</button>
            <button onClick={() => { setEditing(null); setShowAdd(false); }} className={btnGhost}>取消</button>
            <span className="text-[11px] text-slate-400">解析后周次：{fmtWeeks(parseWeeks(weeksText))}</span>
          </div>
        </Panel>
      )}

      {/* 周次网格 */}
      <Panel
        title={`周课表速览 · 第 ${week} 周`}
        icon={Table2}
        action={
          <div className="flex items-center gap-1.5">
            <button onClick={() => setWeek(Math.max(1, week - 1))} className={cn(btnGhost, 'h-7 px-2 text-xs')}>上一周</button>
            <button onClick={() => setWeek(Math.min(store.settings.totalWeeks + 3, week + 1))} className={cn(btnGhost, 'h-7 px-2 text-xs')}>下一周</button>
          </div>
        }
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {byDay.map(({ label, day, items }) => {
            const week2 = currentWeek(store.today, fromKey(store.settings.semesterStart));
            const inWeek = items.filter(({ c }) => c.weeks.includes(week));
            const isTodayCol = week === week2 && day === (store.today.getDay() === 0 ? 7 : store.today.getDay());
            return (
              <div
                key={label}
                className={cn(
                  'rounded-xl border px-3 py-2.5',
                  isTodayCol ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-transparent'
                )}
              >
                <p className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  {label}
                  {isTodayCol && <Chip tone="emerald">今天</Chip>}
                  <span className="ml-auto text-[10px] font-normal text-slate-400">{inWeek.length} 节</span>
                </p>
                {inWeek.length === 0 ? (
                  <p className="text-[11px] text-slate-400">本周无课</p>
                ) : (
                  <ul className="space-y-1">
                    {inWeek.map(({ c, idx }) => (
                      <li key={c.id ?? idx} className="rounded-lg bg-white px-2.5 py-1.5">
                        <div className="flex justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-700 truncate">{c.name}</span>
                          <span className="text-[10px] text-sky-700 tabular-nums whitespace-nowrap">{c.start}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{c.place}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {courses.length === 0 && <Empty>课表是空的，点上面的「新增课程」录入，或用「课表识别」导入课表图片</Empty>}
    </div>
  );
}
