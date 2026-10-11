// 待办清单：桌面工作台的任务中心
import { useMemo, useState } from 'react';
import { useStore, uid, type Todo } from '@/store/store';
import { Panel, Empty, Chip, IconButton, inputCls, btnPrimary } from '@/components/Panel';
import { CheckSquare, Plus, Trash2, Calendar, Flag, ListFilter } from 'lucide-react';
import { addDays, toKey } from '@/lib/storage';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'today' | 'overdue' | 'week' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今天' },
  { id: 'overdue', label: '已逾期' },
  { id: 'week', label: '7 天内' },
  { id: 'done', label: '已完成' },
];

const PRIORITY_LABEL: Record<Todo['priority'], { text: string; tone: 'rose' | 'emerald' | 'slate' }> = {
  high: { text: '紧急', tone: 'rose' },
  normal: { text: '普通', tone: 'emerald' },
  low: { text: '次要', tone: 'slate' },
};

export default function Todos() {
  const { todos, setTodos, todayKey } = useStore();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Todo['priority']>('normal');
  const [tag, setTag] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setTodos([
      { id: uid(), text: t, done: false, createdAt: todayKey, due: due || undefined, priority, tag: tag.trim() || undefined },
      ...todos,
    ]);
    setText(''); setDue(''); setTag(''); setPriority('normal');
  };

  const toggle = (id: string) =>
    setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => setTodos(todos.filter((t) => t.id !== id));

  const clearDone = () => setTodos(todos.filter((t) => !t.done));

  const weekEnd = toKey(addDays(new Date(), 7));

  const filtered = useMemo(() => {
    const open = todos.filter((t) => !t.done);
    switch (filter) {
      case 'today': return open.filter((t) => t.due && t.due <= todayKey);
      case 'overdue': return open.filter((t) => t.due && t.due < todayKey);
      case 'week': return open.filter((t) => t.due && t.due >= todayKey && t.due <= weekEnd);
      case 'done': return todos.filter((t) => t.done);
      default: return open;
    }
  }, [todos, filter, todayKey, weekEnd]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const rank = { high: 0, normal: 1, low: 2 };
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return rank[a.priority] - rank[b.priority];
    }),
    [filtered]
  );

  const counts = {
    all: todos.filter((t) => !t.done).length,
    today: todos.filter((t) => !t.done && t.due && t.due <= todayKey).length,
    overdue: todos.filter((t) => !t.done && t.due && t.due < todayKey).length,
    week: todos.filter((t) => !t.done && t.due && t.due >= todayKey && t.due <= weekEnd).length,
    done: todos.filter((t) => t.done).length,
  };

  const quickDates: { label: string; value: string }[] = [
    { label: '今天', value: todayKey },
    { label: '明天', value: toKey(addDays(new Date(), 1)) },
    { label: '本周末', value: toKey(addDays(new Date(), (6 - ((new Date().getDay() + 6) % 7)))) },
    { label: '下周', value: toKey(addDays(new Date(), 7)) },
  ];

  return (
    <div className="space-y-4">
      <Panel title="新建待办" icon={Plus}>
        <div className="flex flex-wrap gap-2">
          <input
            className={cn(inputCls, 'flex-1 min-w-[14rem]')}
            placeholder="要做什么？回车快速添加"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <input
            type="date"
            className={cn(inputCls, 'w-40')}
            value={due}
            onChange={(e) => setDue(e.target.value)}
            title="截止日期"
          />
          <select
            className={cn(inputCls, 'w-24')}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Todo['priority'])}
          >
            <option value="high">紧急</option>
            <option value="normal">普通</option>
            <option value="low">次要</option>
          </select>
          <input
            className={cn(inputCls, 'w-28')}
            placeholder="标签"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <button onClick={add} className={btnPrimary} disabled={!text.trim()}>
            <Plus className="w-4 h-4" /> 添加
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] text-slate-400">快捷日期：</span>
          {quickDates.map((q) => (
            <button
              key={q.label}
              onClick={() => setDue(q.value)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--border-1)] hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-400 transition-colors"
            >
              {q.label}
            </button>
          ))}
          {due && (
            <button onClick={() => setDue('')} className="text-[11px] text-rose-500 hover:text-rose-600">
              清除日期
            </button>
          )}
        </div>
      </Panel>

      <Panel
        title={`待办列表（${sorted.length}）`}
        icon={ListFilter}
        action={
          counts.done > 0 ? (
            <button onClick={clearDone} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
              清除已完成 ({counts.done})
            </button>
          ) : undefined
        }
      >
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

        {sorted.length === 0 ? (
          <Empty>{filter === 'done' ? '还没有完成的事项' : '这里空空的，享受一下吧 ✨'}</Empty>
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((t) => {
              const overdue = t.due && t.due < todayKey && !t.done;
              const isToday = t.due === todayKey;
              return (
                <li
                  key={t.id}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 border transition-colors',
                    t.done
                      ? 'bg-[var(--surface-1)] border-transparent opacity-50'
                      : overdue
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-[var(--surface-3)] border-transparent hover:border-emerald-500/40'
                  )}
                >
                  <button
                    onClick={() => toggle(t.id)}
                    className={cn(
                      'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                      t.done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 hover:border-emerald-400'
                    )}
                    aria-label="完成"
                  >
                    {t.done && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M2 6.5 L4.5 9 L10 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm text-slate-800 truncate', t.done && 'line-through')}>{t.text}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Chip tone={PRIORITY_LABEL[t.priority].tone}>
                        <Flag className="w-2.5 h-2.5" /> {PRIORITY_LABEL[t.priority].text}
                      </Chip>
                      {t.due && (
                        <span className={cn('text-[11px] flex items-center gap-1', overdue ? 'text-rose-600 font-medium' : isToday ? 'text-amber-600 font-medium' : 'text-slate-400')}>
                          <Calendar className="w-3 h-3" />
                          {t.due}
                          {overdue && ' · 已逾期'}
                          {isToday && ' · 今天'}
                        </span>
                      )}
                      {t.tag && <Chip tone="sky">{t.tag}</Chip>}
                    </div>
                  </div>

                  <IconButton onClick={() => remove(t.id)} title="删除" tone="rose">
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {counts.overdue > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-5 py-3 text-sm text-amber-200">
          有 <span className="font-bold">{counts.overdue}</span> 项待办已经超过截止日期，建议重新排一下优先级。
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <CheckSquare className="w-3.5 h-3.5" />
        数据保存在本机数据文件里，关掉程序也不会丢；可在「设置」里导出备份。
      </p>
    </div>
  );
}
