// 作业 DDL 追踪：按课程登记作业，倒计时 + 逾期预警
import { useMemo, useState } from 'react';
import { useStore, uid, type Assignment } from '@/store/store';
import { Panel, Empty, Chip, IconButton, inputCls, btnPrimary } from '@/components/Panel';
import { BookOpen, Plus, Trash2, Check, Clock, AlertTriangle } from 'lucide-react';
import { daysUntil, fromKey } from '@/lib/storage';
import { courseNames, type Course } from '@/data/plan';
import { cn } from '@/lib/utils';

type Filter = 'pending' | 'week' | 'overdue' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: '未完成' },
  { id: 'week', label: '7 天内' },
  { id: 'overdue', label: '已逾期' },
  { id: 'done', label: '已完成' },
];

export default function Assignments() {
  const store = useStore();
  const { assignments, setAssignments, courses, today } = store;

  const [course, setCourse] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [weight, setWeight] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');

  const names = useMemo(() => courseNames((courses ?? []) as Course[]), [courses]);

  const add = () => {
    if (!title.trim() || !due) return;
    const a: Assignment = {
      id: uid(),
      course: course.trim() || '其他',
      title: title.trim(),
      detail: detail.trim() || undefined,
      due,
      dueTime: dueTime || undefined,
      done: false,
      weight: weight.trim() || undefined,
    };
    setAssignments([...assignments, a]);
    setTitle(''); setDetail(''); setDue(''); setDueTime(''); setWeight('');
  };

  const toggle = (id: string) =>
    setAssignments(assignments.map((a) => (a.id === id ? { ...a, done: !a.done } : a)));
  const remove = (id: string) => setAssignments(assignments.filter((a) => a.id !== id));

  const withDays = useMemo(
    () => assignments.map((a) => ({ ...a, days: daysUntil(fromKey(a.due), today) })),
    [assignments, today]
  );

  const filtered = useMemo(() => {
    const arr = withDays.filter((a) => {
      switch (filter) {
        case 'pending': return !a.done;
        case 'week': return !a.done && a.days >= 0 && a.days <= 7;
        case 'overdue': return !a.done && a.days < 0;
        case 'done': return a.done;
      }
    });
    return arr.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.due.localeCompare(b.due);
    });
  }, [withDays, filter]);

  const counts = {
    pending: withDays.filter((a) => !a.done).length,
    week: withDays.filter((a) => !a.done && a.days >= 0 && a.days <= 7).length,
    overdue: withDays.filter((a) => !a.done && a.days < 0).length,
    done: withDays.filter((a) => a.done).length,
  };

  // 按课程分组统计未完成
  const byCourse = useMemo(() => {
    const map = new Map<string, { total: number; done: number; next?: number }>();
    for (const a of withDays) {
      const cur = map.get(a.course) ?? { total: 0, done: 0 };
      cur.total++;
      if (a.done) cur.done++;
      else if (!a.done && (cur.next === undefined || a.days < cur.next)) cur.next = a.days;
      map.set(a.course, cur);
    }
    return [...map.entries()].sort((a, b) => (a[1].next ?? 999) - (b[1].next ?? 999));
  }, [withDays]);


  return (
    <div className="space-y-4">
      <Panel title="登记作业" icon={Plus}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-[11px] text-slate-400">课程</span>
            <input
              className={cn(inputCls, 'mt-0.5')}
              list="course-options"
              placeholder="从课表选或手动输入"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
            />
            <datalist id="course-options">
              {names.map((n) => <option key={n} value={n} />)}
            </datalist>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] text-slate-400">作业标题 *</span>
            <input
              className={cn(inputCls, 'mt-0.5')}
              placeholder="如：第 3 章习题 1–12"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">截止日期 *</span>
            <input type="date" className={cn(inputCls, 'mt-0.5')} value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">截止时间</span>
            <input type="time" className={cn(inputCls, 'mt-0.5')} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">占分比重</span>
            <input className={cn(inputCls, 'mt-0.5')} placeholder="如 20%" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="text-[11px] text-slate-400">备注</span>
            <input className={cn(inputCls, 'mt-0.5')} placeholder="要求、提交方式等" value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
        </div>
        <div className="mt-3">
          <button onClick={add} disabled={!title.trim() || !due} className={btnPrimary}>
            <Plus className="w-4 h-4" /> 添加作业
          </button>
          {!due && <span className="ml-3 text-[11px] text-slate-400">截止日期是必填项</span>}
        </div>
      </Panel>

      {byCourse.length > 0 && (
        <Panel title="按课程统计" icon={BookOpen}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byCourse.map(([name, s]) => (
              <div key={name} className="rounded-xl bg-[var(--surface-3)] border border-[var(--border-2)] px-3.5 py-2.5">
                <p className="text-xs font-medium text-[var(--text-2)] truncate">{name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-500">{s.done}/{s.total} 已完成</span>
                  {s.next !== undefined && (
                    <Chip tone={s.next < 0 ? 'rose' : s.next <= 2 ? 'amber' : 'sky'}>
                      {s.next < 0 ? `逾期 ${-s.next} 天` : `最近 ${s.next} 天`}
                    </Chip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`作业列表（${filtered.length}）`} icon={Clock}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                filter === f.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
              )}
            >
              {f.label}
              {counts[f.id] > 0 && (
                <span className={cn('ml-1.5', filter === f.id ? 'text-white/80' : 'text-slate-400')}>
                  {counts[f.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Empty>{filter === 'done' ? '还没有完成的作业' : '没有符合条件的作业 🎉'}</Empty>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((a) => {
              const overdue = a.days < 0 && !a.done;
              return (
                <li
                  key={a.id}
                  className={cn(
                    'group rounded-xl px-3.5 py-2.5 border flex items-start gap-3',
                    a.done
                      ? 'bg-[var(--surface-1)] border-transparent opacity-50'
                      : overdue
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : a.days <= 2
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-[var(--surface-3)] border-transparent'
                  )}
                >
                  <button
                    onClick={() => toggle(a.id)}
                    className={cn(
                      'w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                      a.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
                    )}
                    aria-label="完成"
                  >
                    {a.done && <Check className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm font-medium text-slate-800', a.done && 'line-through')}>
                        {a.title}
                      </span>
                      {a.weight && <Chip tone="violet">{a.weight}</Chip>}
                      {overdue && (
                        <Chip tone="rose">
                          <AlertTriangle className="w-2.5 h-2.5" /> 逾期 {-a.days} 天
                        </Chip>
                      )}
                      {!a.done && a.days === 0 && <Chip tone="amber">今天截止</Chip>}
                      {!a.done && a.days === 1 && <Chip tone="amber">明天截止</Chip>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {a.course} · {a.due}{a.dueTime ? ` ${a.dueTime}` : ''}
                      {!a.done && a.days > 1 && ` · 还有 ${a.days} 天`}
                    </p>
                    {a.detail && <p className="text-[11px] text-slate-400 mt-0.5">{a.detail}</p>}
                  </div>

                  <IconButton onClick={() => remove(a.id)} title="删除" tone="rose">
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {counts.overdue > 0 && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          有 <span className="font-bold">{counts.overdue}</span> 个作业已逾期，尽快补交或联系老师。
        </div>
      )}
    </div>
  );
}
