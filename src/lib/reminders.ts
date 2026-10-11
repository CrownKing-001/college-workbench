// 桌面提醒引擎：每天检查课程 / 作业 DDL / 待办，到点弹系统通知。
// 只在桌面端生效（浏览器预览没有通知通道）。
import { useEffect, useRef } from 'react';
import { useStore } from '@/store/store';
import { KEYS, loadData, saveData, toKey, daysUntil, fromKey } from '@/lib/storage';
import { type Course } from '@/data/plan';
import { coursesOn, toMin } from '@/lib/schedule';
import { isDesktop } from '@/lib/storage';

/** 今天已经弹过的提醒 id，避免重复打扰 */
const SENT_KEY = 'fitplan-notified';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
}

/** 计算此刻应该弹出的提醒（纯函数，便于单独测试） */
export function computeDue(
  now: Date,
  courses: Course[],
  todos: { id: string; text: string; done: boolean; due?: string }[],
  assignments: { id: string; course: string; title: string; due: string; dueTime?: string; done: boolean }[],
  leadMinutes: number,
  semesterStart: Date
): DueReminder[] {
  const out: DueReminder[] = [];
  const cur = now.getHours() * 60 + now.getMinutes();

  // 1) 课程：提前 leadMinutes 提醒
  for (const c of coursesOn(courses, now, semesterStart)) {
    const diff = toMin(c.start) - cur;
    if (diff >= 0 && diff <= leadMinutes) {
      out.push({
        id: `course:${c.dateKey}:${c.name}:${c.start}`,
        title: `${diff === 0 ? '现在上课' : `${diff} 分钟后上课`}`,
        body: `${c.name}\n${c.start}–${c.end} · ${c.place}`,
      });
    }
  }

  // 2) 作业 DDL：当天 20:00 汇总提醒 + 到期前 leadMinutes
  const todayKey = toKey(now);
  for (const a of assignments) {
    if (a.done) continue;
    if (a.due !== todayKey) continue;
    if (!a.dueTime) {
      // 没写具体时间：晚上 20:00 提醒一次
      if (cur >= 20 * 60 && cur < 20 * 60 + 5) {
        out.push({
          id: `assign:${a.id}:${todayKey}`,
          title: '今天到期的作业',
          body: `${a.course} · ${a.title}`,
        });
      }
      continue;
    }
    const diff = toMin(a.dueTime) - cur;
    if (diff >= 0 && diff <= leadMinutes) {
      out.push({
        id: `assign:${a.id}:${todayKey}`,
        title: `作业 ${diff === 0 ? '现在截止' : `${diff} 分钟后截止`}`,
        body: `${a.course} · ${a.title}`,
      });
    }
  }

  // 3) 待办：今天到期的高优先级事项，早上 9:00 提醒
  const overdueOrToday = todos.filter((t) => !t.done && t.due && t.due <= todayKey);
  if (overdueOrToday.length && cur >= 9 * 60 && cur < 9 * 60 + 5) {
    out.push({
      id: `todos:${todayKey}`,
      title: `今天有 ${overdueOrToday.length} 项待办`,
      body: overdueOrToday.slice(0, 4).map((t) => `· ${t.text}`).join('\n'),
    });
  }

  return out;
}

/** 提醒引擎：挂载在应用根部 */
export function useReminders() {
  const { courses, todos, assignments, settings, today, ready } = useStore();
  const sentRef = useRef<Set<string>>(new Set());

  // 载入「已提醒」记录
  useEffect(() => {
    (async () => {
      const arr = await loadData<string[]>(SENT_KEY, []);
      sentRef.current = new Set(arr);
    })();
  }, []);

  useEffect(() => {
    if (!ready || !settings.notifyEnabled || !isDesktop()) return;

    const run = async () => {
      const now = new Date();
      const list = computeDue(
        now,
        courses ?? [],
        todos,
        assignments,
        settings.notifyMinutesBefore,
        fromKey(settings.semesterStart)
      );
      let changed = false;
      for (const r of list) {
        if (sentRef.current.has(r.id)) continue;
        sentRef.current.add(r.id);
        changed = true;
        try {
          await window.desktop?.notify(r.title, r.body);
        } catch {
          /* 通知失败不影响主流程 */
        }
      }
      if (changed) {
        // 只保留最近 300 条，防止文件无限增长
        const arr = [...sentRef.current].slice(-300);
        sentRef.current = new Set(arr);
        await saveData(SENT_KEY, arr);
      }
    };

    void run();
    const t = setInterval(run, 60000);
    return () => clearInterval(t);
  }, [ready, settings, courses, todos, assignments, today]);

  // 跨天时清掉「已提醒」记录，让新的一天能正常提醒
  useEffect(() => {
    const k = toKey(today);
    const last = localStorage.getItem('fitplan-notified-day');
    if (last !== k) {
      localStorage.setItem('fitplan-notified-day', k);
    }
  }, [today]);
}

/** 供「今日」页显示的到期提醒预览（不需要等到通知时间） */
export function upcomingReminders(
  now: Date,
  courses: Course[],
  assignments: { id: string; course: string; title: string; due: string; dueTime?: string; done: boolean }[],
  semesterStart: Date
): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  const cur = now.getHours() * 60 + now.getMinutes();

  for (const c of coursesOn(courses, now, semesterStart)) {
    const diff = toMin(c.start) - cur;
    if (diff > 0) out.push({ label: `${diff} 分钟后`, detail: `${c.name} · ${c.place}` });
  }
  for (const a of assignments) {
    if (a.done) continue;
    const d = daysUntil(fromKey(a.due), now);
    if (d < 0) out.push({ label: `已逾期 ${-d} 天`, detail: `${a.course} · ${a.title}` });
    else if (d === 0) out.push({ label: '今天截止', detail: `${a.course} · ${a.title}` });
    else if (d === 1) out.push({ label: '明天截止', detail: `${a.course} · ${a.title}` });
  }
  return out.slice(0, 6);
}

export { KEYS };
