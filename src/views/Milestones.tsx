// 重要事项：期末考试 / 竞赛 / 证书 / 报名 / 出行……全部由用户自由增删改。
import { useMemo, useState } from 'react';
import { useStore, uid, type Milestone } from '@/store/store';
import { Panel, Empty, Chip, IconButton, Field, inputCls, btnPrimary, btnGhost } from '@/components/Panel';
import { fromKey, daysUntil } from '@/lib/storage';
import {
  Plus, Pencil, Trash2, X, Check, CalendarClock, ListChecks, Sparkles, Copy, Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** 常用分类，用户也可以自己输入 */
const CATEGORIES = ['考试', '竞赛', '证书', '作业', '报名', '活动', '其他'];

/** 新建时的快捷模板：常见事项一键生成，再自己微调 */
const PRESETS: { label: string; emoji: string; category: string; checklist: string[] }[] = [
  {
    label: '期末考试', emoji: '📝', category: '考试',
    checklist: ['整理课件与笔记', '刷近 3 年真题', '背公式/单词', '考前确认考场与时间', '带学生证 + 文具'],
  },
  {
    label: '学科竞赛', emoji: '🏆', category: '竞赛',
    checklist: ['确认报名截止时间', '组队并分工', '准备作品/材料', '赛前模拟演练'],
  },
  {
    label: '证书报名', emoji: '🎓', category: '证书',
    checklist: ['确认报名入口与截止日', '准备证件照与身份证', '缴费并保存凭证'],
  },
  {
    label: '课程作业 DDL', emoji: '📄', category: '作业',
    checklist: ['列提纲', '查资料', '写完初稿', '检查格式与参考文献', '提交前再读一遍'],
  },
];

/** 距今天数 → 展示文案与配色 */
function urgency(dateKey: string | undefined, today: Date, done: boolean) {
  if (done) return { text: '已完成', tone: 'emerald' as const, level: 3 };
  if (!dateKey) return { text: '未定日期', tone: 'slate' as const, level: 3 };
  const d = daysUntil(fromKey(dateKey), today);
  if (d < 0) return { text: `已过 ${-d} 天`, tone: 'slate' as const, level: 3 };
  if (d === 0) return { text: '就是今天', tone: 'rose' as const, level: 0 };
  if (d <= 3) return { text: `还有 ${d} 天`, tone: 'rose' as const, level: 0 };
  if (d <= 14) return { text: `还有 ${d} 天`, tone: 'amber' as const, level: 1 };
  return { text: `还有 ${d} 天`, tone: 'sky' as const, level: 2 };
}

const emptyDraft = (): Milestone => ({
  id: '',
  title: '',
  date: '',
  time: '',
  place: '',
  category: '考试',
  emoji: '📌',
  remindDaysBefore: 7,
  done: false,
  note: '',
  checklist: [],
});

export default function Milestones() {
  const store = useStore();
  const { milestones: list, setMilestones, today } = store;

  const [editing, setEditing] = useState<Milestone | null>(null);
  const [newItem, setNewItem] = useState('');
  const [filter, setFilter] = useState<string>('全部');
  const [showDone, setShowDone] = useState(true);
  const [note, setNote] = useState('');

  const cats = useMemo(() => {
    const s = new Set(list.map((m) => m.category).filter(Boolean));
    return ['全部', ...Array.from(s)];
  }, [list]);

  const visible = useMemo(() => {
    let out = [...list];
    if (filter !== '全部') out = out.filter((m) => m.category === filter);
    if (!showDone) out = out.filter((m) => !m.done);
    // 未完成在前；都按日期升序，没日期的排最后
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  }, [list, filter, showDone]);

  const upcoming = useMemo(
    () =>
      list
        .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), today) >= 0)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [list, today]
  );

  const startNew = () => {
    setEditing(emptyDraft());
    setNote('');
  };

  const startEdit = (m: Milestone) => {
    setEditing({ ...m, checklist: [...m.checklist] });
    setNote('');
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setEditing((prev) => ({
      ...(prev ?? emptyDraft()),
      title: p.label,
      emoji: p.emoji,
      category: p.category,
      checklist: [...p.checklist],
    }));
    setNote(`已套用「${p.label}」模板，改一下日期就能存`);
  };

  const save = () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) {
      setNote('名称不能为空');
      return;
    }
    const clean: Milestone = {
      ...editing,
      title,
      category: editing.category.trim() || '其他',
      emoji: editing.emoji?.trim() || '📌',
      date: editing.date || undefined,
      time: editing.time || undefined,
      place: editing.place?.trim() || undefined,
      note: editing.note?.trim() || undefined,
      checklist: editing.checklist.map((c) => c.trim()).filter(Boolean),
    };
    if (editing.id) {
      setMilestones(list.map((m) => (m.id === editing.id ? clean : m)));
      setNote(`已更新「${title}」`);
    } else {
      setMilestones([...list, { ...clean, id: uid() }]);
      setNote(`已添加「${title}」`);
    }
    setEditing(null);
  };

  const remove = (m: Milestone) => setMilestones(list.filter((x) => x.id !== m.id));

  /**
   * 钉住 / 取消钉住：只影响「总览绿色条是否显示这个倒计时」，不删事项本身。
   * 这是总览倒计时卡片唯一的开关 —— 两边共用同一份数据。
   */
  const togglePin = (m: Milestone) =>
    setMilestones(list.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)));

  const duplicate = (m: Milestone) =>
    setMilestones([...list, { ...m, id: uid(), title: `${m.title}（副本）`, checklist: [...m.checklist] }]);

  const toggleDone = (m: Milestone) =>
    setMilestones(list.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)));

  const toggleCheck = (m: Milestone, idx: number) =>
    setMilestones(
      list.map((x) =>
        x.id === m.id ? { ...x, checklist: x.checklist.filter((_, i) => i !== idx) } : x
      )
    );

  // 编辑态里勾掉清单项
  const dropDraftCheck = (idx: number) =>
    setEditing((prev) => (prev ? { ...prev, checklist: prev.checklist.filter((_, i) => i !== idx) } : prev));

  const addDraftCheck = () => {
    const v = newItem.trim();
    if (!v) return;
    setEditing((prev) => (prev ? { ...prev, checklist: [...prev.checklist, v] } : prev));
    setNewItem('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500 flex-1 min-w-[16rem]">
          期末考试、竞赛、证书报名……都记在这里。
          距离近的会标红，也能加到系统提醒里。
        </p>
        <button onClick={startNew} className={btnPrimary}>
          <Plus className="w-4 h-4" /> 新建事项
        </button>
      </div>

      {note && (
        <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-xs text-sky-300 flex items-center gap-2">
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote('')} className="shrink-0 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 编辑 / 新建表单 */}
      {editing && (
        <Panel title={editing.id ? '编辑事项' : '新建事项'} icon={Sparkles}>
          {!editing.id && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <span className="text-xs text-slate-400">快捷模板：</span>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="rounded-full border border-[var(--border-3)] bg-[var(--surface-3)] px-2.5 py-1 text-xs text-[var(--text-2)] hover:border-emerald-500/60 hover:text-emerald-300 transition-colors"
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="名称（必填）" className="sm:col-span-2">
              <input
                className={inputCls}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="如：高数期末考试"
              />
            </Field>
            <Field label="图标">
              <input
                className={cn(inputCls, 'w-20 text-center')}
                value={editing.emoji ?? ''}
                onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                placeholder="📌"
              />
            </Field>
            <Field label="分类">
              <input
                className={inputCls}
                list="ms-cats"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                placeholder="考试 / 竞赛 / 证书…"
              />
              <datalist id="ms-cats">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="日期">
              <input
                type="date"
                className={inputCls}
                value={editing.date ?? ''}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </Field>
            <Field label="时间（可选）">
              <input
                type="time"
                className={inputCls}
                value={editing.time ?? ''}
                onChange={(e) => setEditing({ ...editing, time: e.target.value })}
              />
            </Field>
            <Field label="地点（可选）" className="sm:col-span-2">
              <input
                className={inputCls}
                value={editing.place ?? ''}
                onChange={(e) => setEditing({ ...editing, place: e.target.value })}
                placeholder="如：教学楼 101"
              />
            </Field>
            <Field label="提前提醒（天）" className="lg:col-span-1">
              <input
                type="number"
                min="0"
                className={inputCls}
                value={editing.remindDaysBefore ?? 7}
                onChange={(e) =>
                  setEditing({ ...editing, remindDaysBefore: Number(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="备注（可选）" className="sm:col-span-2 lg:col-span-3">
              <input
                className={inputCls}
                value={editing.note ?? ''}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="补充说明"
              />
            </Field>
          </div>

          <div className="mt-4">
            <p className="text-[11px] text-slate-400 mb-1.5">准备清单 / 复习要点</p>
            <div className="space-y-1">
              {editing.checklist.map((c, i) => (
                <div key={`${c}-${i}`} className="flex items-center gap-2 rounded-lg bg-[var(--surface-3)] px-3 py-1.5">
                  <span className="flex-1 text-xs text-[var(--text-2)]">{c}</span>
                  <IconButton onClick={() => dropDraftCheck(i)} title="移除" tone="rose">
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className={inputCls}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDraftCheck()}
                placeholder="加一条，如：带准考证"
              />
              <button onClick={addDraftCheck} className={btnGhost}>
                添加
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={save} className={btnPrimary}>
              <Check className="w-4 h-4" /> 保存
            </button>
            <button onClick={() => setEditing(null)} className={btnGhost}>
              取消
            </button>
          </div>
        </Panel>
      )}

      {/* 最近要来 */}
      {upcoming.length > 0 && (
        <Panel title="接下来" icon={CalendarClock}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.slice(0, 6).map((m) => {
              const u = urgency(m.date, today, m.done);
              const d = daysUntil(fromKey(m.date!), today);
              const soon = d <= (m.remindDaysBefore ?? 7);
              return (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-xl px-4 py-3 border',
                    soon ? 'bg-rose-500/12 border-rose-500/35' : 'bg-[var(--surface-3)] border-[var(--border-2)]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{m.emoji}</span>
                    <span className="text-xs font-semibold text-[var(--text-1)] flex-1 truncate">{m.title}</span>
                    <Chip tone={u.tone}>{u.text}</Chip>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {m.date}
                    {m.time ? ` ${m.time}` : ''}
                    {m.place ? ` · ${m.place}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* 全部事项 */}
      <Panel
        title={`全部事项（${visible.length}${visible.length !== list.length ? ` / ${list.length}` : ''}）`}
        icon={ListChecks}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs border transition-colors',
                  filter === c
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-[var(--surface-3)] text-slate-400 border-[var(--border-3)] hover:border-emerald-500/50 hover:text-[var(--text-1)]'
                )}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setShowDone((v) => !v)}
              className="rounded-full px-2.5 py-1 text-xs border border-[var(--border-3)] bg-[var(--surface-3)] text-slate-400 hover:text-[var(--text-1)] transition-colors"
            >
              {showDone ? '隐藏已完成' : '显示已完成'}
            </button>
          </div>
        }
      >
        {visible.length === 0 ? (
          <Empty>
            {list.length === 0 ? '还没有事项，点右上角「新建事项」加一个吧' : '当前筛选下没有内容'}
          </Empty>
        ) : (
          <div className="space-y-2">
            {visible.map((m) => {
              const u = urgency(m.date, today, m.done);
              return (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-xl border px-4 py-3',
                    m.done ? 'bg-[var(--surface-2)] border-[var(--border-1)] opacity-70' : 'bg-[var(--surface-3)] border-[var(--border-2)]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleDone(m)}
                      title={m.done ? '标记为未完成' : '标记为已完成'}
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0 mt-0.5 transition-colors',
                        m.done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-500 text-transparent hover:border-emerald-400'
                      )}
                    >
                      <Check className="w-3 h-3" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base">{m.emoji}</span>
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            m.done ? 'text-slate-400 line-through' : 'text-[var(--text-1)]'
                          )}
                        >
                          {m.title}
                        </span>
                        <Chip tone="slate">{m.category}</Chip>
                        {!m.done && <Chip tone={u.tone}>{u.text}</Chip>}
                        {m.done && <Chip tone="emerald">已完成</Chip>}
                        {m.pinned && <Chip tone="amber">已钉到总览</Chip>}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                        {m.date ? `${m.date}${m.time ? ` ${m.time}` : ''}` : '日期待定'}
                        {m.place ? ` · ${m.place}` : ''}
                        {m.remindDaysBefore ? ` · 提前 ${m.remindDaysBefore} 天提醒` : ''}
                      </p>
                      {m.note && <p className="text-[11px] text-slate-500 mt-1">{m.note}</p>}

                      {m.checklist.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {m.checklist.map((c, i) => (
                            <li key={`${c}-${i}`} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                              <button
                                onClick={() => toggleCheck(m, i)}
                                title="点一下划掉这条"
                                className="mt-0.5 w-3 h-3 rounded-sm border border-slate-500 hover:border-emerald-400 shrink-0"
                              />
                              <span className="flex-1">{c}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => togglePin(m)}
                        title={m.pinned ? '取消在总览显示倒计时' : '在总览显示倒计时'}
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
                          m.pinned
                            ? 'text-amber-400 bg-amber-500/15 hover:bg-amber-500/25'
                            : 'text-slate-500 hover:text-[var(--text-1)] hover:bg-[var(--border-2)]'
                        )}
                      >
                        <Pin className={cn('w-3.5 h-3.5', m.pinned && 'fill-current')} />
                      </button>
                      <IconButton onClick={() => duplicate(m)} title="复制一份" tone="slate">
                        <Copy className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton onClick={() => startEdit(m)} title="编辑" tone="emerald">
                        <Pencil className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton onClick={() => remove(m)} title="删除" tone="rose">
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <p className="text-[11px] text-slate-500">
        提示：点图钉 📌 把事项钉到「总览」首页的绿色条上显示倒计时；清单里的小方框点一下就划掉，方便考前一天逐条核对。
        数据存在本机 <code className="rounded bg-[var(--surface-3)] px-1">data/fitplan-milestones.json</code>，可直接备份。
      </p>
    </div>
  );
}
