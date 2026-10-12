// 统一存储层：桌面端走 Electron 文件存储，浏览器（开发预览）自动退回 localStorage。
// 全部异步，调用方用 await；同时带一层内存缓存避免重复读盘。

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  get(key: string, fallback?: unknown): Promise<unknown>;
  set(key: string, value: unknown): Promise<boolean>;
  getAll(): Promise<Record<string, unknown>>;
  replaceAll(obj: Record<string, unknown>): Promise<boolean>;
  dataDir(): Promise<string>;
  openDataDir(): Promise<string>;
  exportBackup(payload: unknown): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  importBackup(): Promise<{ ok: boolean; data?: Record<string, unknown>; filePath?: string; canceled?: boolean; error?: string }>;
  notify(title: string, body: string): Promise<boolean>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  hideToTray(): Promise<void>;
  appInfo(): Promise<{ version: string; electron: string; dataDir: string; portable: boolean }>;
  /** 启动耗时测量，仅测试模式使用 */
  reportMeasure?(payload: { ready: number }): void;
  photo: {
    save(dataUrl: string, dateKey?: string, ext?: string): Promise<{ ok: boolean; relPath?: string; size?: number; error?: string }>;
    pick(dateKey?: string): Promise<{ ok: boolean; canceled?: boolean; files?: { relPath: string; size: number }[]; error?: string }>;
    read(relPath: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
    remove(relPath: string): Promise<boolean>;
    open(relPath: string): Promise<boolean>;
    openDir(): Promise<string>;
    usage(): Promise<{ count: number; bytes: number }>;
  };
  /** 图片识别：选图 → 存进 data/calendars → OCR 识别 */
  calendar: {
    pick(): Promise<CalendarImageResult>;
    importPath(srcPath: string): Promise<CalendarImageResult>;
    ocr(relPath: string, scale?: number): Promise<CalendarOcrResult>;
    /** 课表专用：从图片抽出结构化的课程候选；periods 是用户自定义的作息时间表 */
    timetable(relPath: string, scale?: number, periods?: { start: string; end: string }[]): Promise<TimetableOcrResult>;
    read(relPath: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
    openDir(): Promise<{ ok: boolean; error?: string | null }>;
  };
}

/** 从课表图片里识别出的一条课程候选（确认后才写入课表） */
export interface TimetableCourse {
  /** 1=周一 … 7=周日 */
  day: number;
  name: string;
  place: string;
  /** HH:MM */
  start: string;
  end: string;
  /** 上课周次；null 表示「每周」（图片上没写周次） */
  weeks: number[] | null;
  /** 从图片上读到的周次原文，便于用户核对 */
  weeksLabel: string;
  /** OCR 命中的原始文字，便于核对 */
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  /** 起始节次，仅用于展示 */
  rowIndex: number;
  /** 这门课连排几节 */
  span: number;
}

export interface TimetableOcrResult {
  ok: boolean;
  relPath?: string;
  scale?: number;
  engine?: string;
  lines?: OcrLine[];
  courses?: TimetableCourse[];
  /** 从图片标题/表头识别出的「第N周」，用于校准当前教学周；识别不到时为 null */
  currentWeek?: number | null;
  error?: string;
}

export interface CalendarImageResult {
  ok: boolean;
  canceled?: boolean;
  relPath?: string;
  absPath?: string;
  size?: number;
  error?: string;
}

export interface OcrLine {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface OcrEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  emoji: string;
  raw: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CalendarOcrResult {
  ok: boolean;
  relPath?: string;
  scale?: number;
  engine?: string;
  lines?: OcrLine[];
  events?: OcrEvent[];
  error?: string;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

const bridge = (): DesktopBridge | undefined =>
  typeof window !== 'undefined' ? window.desktop : undefined;

export const isDesktop = (): boolean => Boolean(bridge()?.isDesktop);

/** 数据文件键名集中登记，避免各处写错字符串 */
export const KEYS = {
  health: 'fitplan-health-logs',
  trainDone: 'fitplan-train-done',
  diet: 'fitplan-diet-logs',
  dietSeed: 'fitplan-diet-seed-ids',
  run: 'fitplan-run-logs',
  courses: 'fitplan-courses',
  todos: 'fitplan-todos',
  assignments: 'fitplan-assignments',
  templates: 'fitplan-templates',
  settings: 'fitplan-settings',
  notes: 'fitplan-notes',
  /** 自定义事项：考试 / 竞赛 / 证书……用户可自由增删 */
  milestones: 'fitplan-milestones',
  /** 图片识别记录：原图路径 + 识别结果 */
  calendars: 'fitplan-calendars',
} as const;

export type StoreKey = (typeof KEYS)[keyof typeof KEYS];

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  const d = bridge();
  if (d) {
    const v = await d.get(key, fallback);
    return (v ?? fallback) as T;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveData(key: string, value: unknown): Promise<void> {
  const d = bridge();
  if (d) {
    await d.set(key, value);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满等情况静默 */
  }
}

export async function loadAll(): Promise<Record<string, unknown>> {
  const d = bridge();
  if (d) return d.getAll();
  const out: Record<string, unknown> = {};
  for (const key of Object.values(KEYS)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) out[key] = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export async function replaceAll(obj: Record<string, unknown>): Promise<void> {
  const d = bridge();
  if (d) {
    await d.replaceAll(obj);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }
}

// ── 日期工具（全局共用，统一本地时区格式 YYYY-MM-DD）────────
export function toKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 距今天数：正数=还有几天，0=今天，负数=已过几天 */
export function daysUntil(target: Date, from: Date = new Date()): number {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// ── 预置饮食数据 ────────────────────────────────────────
// 空白模板：不预置任何饮食记录，用户的饮食数据完全由自己录入。
export interface SeedDiet {
  id: string;
  date: string;
  meal: string;
  text: string;
  protein?: number;
  calories?: number;
}

export const DIET_SEED: SeedDiet[] = [];

/**
 * 把预置饮食按 id 合并进现有记录（每台机器只合入一次）。
 * 返回新的 diet 与 seedIds，由调用方写入 store。
 * 空白模板下 DIET_SEED 为空，此函数是空操作，保留以便将来按需预置。
 */
export async function seedDietOnce<D extends { date: string; meal: string; text: string; protein?: number; calories?: number }>(
  diet: D[],
  mergedIds: string[]
): Promise<{ diet: D[]; seed: string[]; merged: number }> {
  const fresh = DIET_SEED.filter((s) => !mergedIds.includes(s.id));
  if (!fresh.length) return { diet, seed: mergedIds, merged: 0 };
  // 去掉预置数据里的 id（它只用于去重，不该混进用户记录）
  const added = fresh.map((s) => {
    const rest: Record<string, unknown> = { ...s };
    delete rest.id;
    return rest as unknown as D;
  });
  return {
    diet: [...diet, ...added],
    seed: [...mergedIds, ...fresh.map((f) => f.id)],
    merged: added.length,
  };
}
