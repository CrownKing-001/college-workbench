// 全局数据仓库：所有模块共用一份状态，写入后自动落盘。
// 「今天」默认取系统时间，可在「设置」里临时锁定到某一天（复盘 / 演示用）。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  KEYS,
  isDesktop,
  loadAll,
  replaceAll,
  saveData,
  toKey,
} from '@/lib/storage';
import type { Course } from '@/data/plan';
import { DEFAULT_SEMESTER_START, DEFAULT_TOTAL_WEEKS } from '@/data/plan';
import { proteinTargetFor } from '@/data/foods';

// ── 类型 ────────────────────────────────────────────────
export interface HealthLog {
  date: string;
  weight?: number;
  sleep?: number;
  steps?: number;
}

/** 一条饮食记录里的food明细（可选：从食物库点选时会有） */
export interface DietItem {
  foodId?: string;
  name: string;
  qty: number;
  protein: number;
  calories: number;
}

export interface DietLog {
  date: string;
  meal: string;
  text: string;
  protein?: number;
  calories?: number;
  /** 这张记录对应的照片（相对 data 的路径，如 photos/2026-10/xxx.jpg） */
  photo?: string;
  /** 从食物库点选/文本识别出的明细 */
  items?: DietItem[];
}

/** 一次运动打卡记录。type 由用户在「设置」里自定义打卡类型 */
export interface RunLog {
  date: string;
  type: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  due?: string; // YYYY-MM-DD
  priority: 'high' | 'normal' | 'low';
  tag?: string;
}

export interface Assignment {
  id: string;
  course: string;
  title: string;
  detail?: string;
  due: string; // YYYY-MM-DD
  dueTime?: string; // HH:MM
  done: boolean;
  weight?: string; // 占比，如 "20%"
}

/** 一节课的时间段 */
export interface PeriodSlot {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface Settings {
  pinnedDate?: string | null; // 锁定「今天」，null = 跟随系统
  notifyEnabled: boolean;
  notifyMinutesBefore: number;
  semesterStart: string; // YYYY-MM-DD
  totalWeeks: number;
  startMinimized: boolean;
  /** 界面主题：dark = 深色，light = 浅色 */
  theme: 'dark' | 'light';
  /** 作息时间表：每节课的上下课时间。空数组 = 用内置通用作息兜底 */
  periods: PeriodSlot[];
  /** 每日蛋白质目标（g）。留空时按体重自动推算 */
  proteinTargetOverride?: number | null;
  /** 蛋白质系数 g/kg，默认 1.8 */
  proteinFactor: number;
  /** 饮食照片占用上限（MB），超过时提示清理 */
  photoQuotaMB: number;

  // ── 运动打卡（通用，规则完全由用户自己定）────────────────
  /** 起始日期 YYYY-MM-DD；留空表示不限制 */
  runStart?: string;
  /** 结束日期 YYYY-MM-DD；留空表示不限制 */
  runEnd?: string;
  /** 目标打卡次数 */
  runTarget: number;
  /** 是否在导航中显示「运动打卡」 */
  runEnabled: boolean;
  /** 可选的打卡类型，用中文逗号或英文逗号分隔 */
  runTypes: string;
}

/** 用户自建的一键套餐 */
export interface SavedTemplate {
  id: string;
  name: string;
  meal: string;
  items: DietItem[];
}

/** 自定义事项：期末考试 / 竞赛 / 证书 / 报名……用户可自由增删改 */
export interface Milestone {
  id: string;
  /** 名称，如「期末考试」「学科竞赛」「证书报名」 */
  title: string;
  /** 日期 YYYY-MM-DD；留空表示「待定」 */
  date?: string;
  /** 时间 HH:MM，可选 */
  time?: string;
  /** 地点 */
  place?: string;
  /** 分类标签，可自定义，如 考试 / 竞赛 / 证书 */
  category: string;
  /** 图标 emoji，列表与卡片上显示 */
  emoji?: string;
  /** 提前多少天开始提醒（用于首页倒计时醒目提示） */
  remindDaysBefore?: number;
  /** 已完成 */
  done: boolean;
  /** 备注 / 说明 */
  note?: string;
  /** 清单项（备考要带的东西、复习要点……） */
  checklist: string[];
}

/** 从图片里识别出来的一条日期（历史兼容字段，当前识别课表不再产出） */
export interface CalendarEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  emoji: string;
  /** OCR 命中的原始句子，便于核对 */
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  /** 用户是否确认采用 */
  accepted: boolean;
  /** 已写入重要事项的 id（写过后标记，避免重复写入） */
  importedAs?: string;
}

/** 一条图片识别记录（课表识别页面的存档） */
export interface CalendarDoc {
  id: string;
  /** data/ 下的相对路径 */
  relPath: string;
  /** 原始文件名（展示用） */
  name: string;
  /** 识别时的缩放倍数，便于回溯 */
  scale?: number;
  engine?: string;
  /** 识别出的文字行数 */
  lineCount: number;
  createdAt: string;
  /** 所属学年，如 2026-2027 */
  schoolYear?: string;
  events: CalendarEvent[];
}

export interface StoreShape {
  health: HealthLog[];
  trainDone: string[];
  diet: DietLog[];
  dietSeed: string[];
  run: RunLog[];
  courses: Course[] | null; // null = 还没初始化，首次运行会置为空课表
  todos: Todo[];
  assignments: Assignment[];
  templates: SavedTemplate[];
  milestones: Milestone[];
  /** 图片识别记录 */
  calendars: CalendarDoc[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  pinnedDate: null,
  notifyEnabled: false,
  notifyMinutesBefore: 15,
  semesterStart: toKey(DEFAULT_SEMESTER_START),
  totalWeeks: DEFAULT_TOTAL_WEEKS,
  startMinimized: false,
  theme: 'dark',
  periods: [],
  proteinTargetOverride: null,
  proteinFactor: 1.8,
  photoQuotaMB: 500,
  runStart: '',
  runEnd: '',
  runTarget: 30,
  runEnabled: true,
  runTypes: '跑步,健步走,健身房,球类,游泳,骑行',
};

const FALLBACK: StoreShape = {
  health: [],
  trainDone: [],
  diet: [],
  dietSeed: [],
  run: [],
  courses: null,
  todos: [],
  assignments: [],
  templates: [],
  milestones: [],
  calendars: [],
  settings: DEFAULT_SETTINGS,
};

/**
 * 首次运行时写入的默认事项。
 * 空白模板：不预置任何个人事项，完全留空由用户自己添加。
 */
export const DEFAULT_MILESTONES: Milestone[] = [];

interface StoreApi extends StoreShape {
  ready: boolean;
  today: Date;
  todayKey: string;
  setHealth: (v: HealthLog[]) => void;
  setTrainDone: (v: string[]) => void;
  setDiet: (v: DietLog[]) => void;
  setDietSeed: (v: string[]) => void;
  setRun: (v: RunLog[]) => void;
  setCourses: (v: Course[] | null) => void;
  setTodos: (v: Todo[]) => void;
  setAssignments: (v: Assignment[]) => void;
  setTemplates: (v: SavedTemplate[]) => void;
  setMilestones: (v: Milestone[]) => void;
  setCalendars: (v: CalendarDoc[]) => void;
  setSettings: (v: Partial<Settings>) => void;
  /** 当前生效的每日蛋白质目标（结合体重与用户覆盖值） */
  proteinTarget: number;
  exportAll: () => Record<string, unknown>;
  importAll: (obj: Record<string, unknown>) => Promise<void>;
  resetAll: () => Promise<void>;
  storageDir: string;
  desktop: boolean;
}

const StoreCtx = createContext<StoreApi | null>(null);

const nowDate = (settings: Settings): Date => {
  if (settings.pinnedDate) {
    const [y, m, d] = settings.pinnedDate.split('-').map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [shape, setShape] = useState<StoreShape>(FALLBACK);
  const [ready, setReady] = useState(false);
  const [storageDir, setStorageDir] = useState('');
  const [tick, setTick] = useState(0);
  const hydrated = useRef(false);

  // 首次装载：一次性读出全部数据
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await loadAll();
      if (!alive) return;
      const merged: StoreShape = { ...FALLBACK };
      for (const [k, v] of Object.entries(all)) {
        if (k === KEYS.settings) merged.settings = { ...DEFAULT_SETTINGS, ...(v as Settings) };
        else if (k === KEYS.health) merged.health = (v as HealthLog[]) ?? [];
        else if (k === KEYS.trainDone) merged.trainDone = (v as string[]) ?? [];
        else if (k === KEYS.diet) merged.diet = (v as DietLog[]) ?? [];
        else if (k === KEYS.dietSeed) merged.dietSeed = (v as string[]) ?? [];
        else if (k === KEYS.run) merged.run = (v as RunLog[]) ?? [];
        else if (k === KEYS.courses) merged.courses = (v as Course[]) ?? null;
        else if (k === KEYS.todos) merged.todos = (v as Todo[]) ?? [];
        else if (k === KEYS.assignments) merged.assignments = (v as Assignment[]) ?? [];
        else if (k === KEYS.templates) merged.templates = (v as SavedTemplate[]) ?? [];
        else if (k === KEYS.milestones) merged.milestones = (v as Milestone[]) ?? [];
        else if (k === KEYS.calendars) {
          // 老数据可能缺字段，补默认值，避免 UI 读到 undefined 崩掉
          merged.calendars = ((v as CalendarDoc[]) ?? []).map((c) => ({
            ...c,
            events: (c.events ?? []).map((e) => ({ ...e, accepted: e.accepted !== false })),
          }));
        }
      }
      setShape(merged);
      hydrated.current = true;
      setReady(true);
      if (window.desktop?.isDesktop) {
        window.desktop.dataDir().then(setStorageDir).catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 每分钟刷新一次「今天」，让跨零点 / 定时提醒能自然滚动
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // 装载完成前不写盘，避免用空数据覆盖已有文件
  const persist = useCallback((key: string, value: unknown) => {
    if (!hydrated.current) return;
    void saveData(key, value);
  }, []);

  const update = useCallback(
    <K extends keyof StoreShape>(key: K, value: StoreShape[K], storeKey: string) => {
      setShape((prev) => ({ ...prev, [key]: value }));
      persist(storeKey, value);
    },
    [persist]
  );

  const api = useMemo<StoreApi>(() => {
    const today = nowDate(shape.settings);
    return {
      ...shape,
      ready,
      today,
      todayKey: toKey(today),
      storageDir,
      desktop: isDesktop(),
      setHealth: (v) => update('health', v, KEYS.health),
      setTrainDone: (v) => update('trainDone', v, KEYS.trainDone),
      setDiet: (v) => update('diet', v, KEYS.diet),
      setDietSeed: (v) => update('dietSeed', v, KEYS.dietSeed),
      setRun: (v) => update('run', v, KEYS.run),
      setCourses: (v) => update('courses', v, KEYS.courses),
      setTodos: (v) => update('todos', v, KEYS.todos),
      setAssignments: (v) => update('assignments', v, KEYS.assignments),
      setTemplates: (v) => update('templates', v, KEYS.templates),
      setMilestones: (v) => update('milestones', v, KEYS.milestones),
      setCalendars: (v) => update('calendars', v, KEYS.calendars),
      setSettings: (patch) => {
        const next = { ...shape.settings, ...patch };
        setShape((prev) => ({ ...prev, settings: next }));
        persist(KEYS.settings, next);
      },
      proteinTarget: (() => {
        const override = shape.settings.proteinTargetOverride;
        if (typeof override === 'number' && override > 0) return override;
        // 取最近一次体重记录来推算
        const latest = [...shape.health]
          .filter((h) => typeof h.weight === 'number' && h.weight! > 0)
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        return proteinTargetFor(latest?.weight ?? 0, shape.settings.proteinFactor);
      })(),
      exportAll: () => ({
        __app: 'university-desk',
        __version: 1,
        __exportedAt: new Date().toISOString(),
        [KEYS.health]: shape.health,
        [KEYS.trainDone]: shape.trainDone,
        [KEYS.diet]: shape.diet,
        [KEYS.run]: shape.run,
        [KEYS.courses]: shape.courses,
        [KEYS.todos]: shape.todos,
        [KEYS.assignments]: shape.assignments,
        [KEYS.templates]: shape.templates,
        [KEYS.milestones]: shape.milestones,
        [KEYS.calendars]: shape.calendars,
        [KEYS.settings]: shape.settings,
      }),
      importAll: async (obj) => {
        const pick = <T,>(k: string, fallback: T): T => (obj[k] === undefined ? fallback : (obj[k] as T));
        const next: StoreShape = {
          health: pick(KEYS.health, shape.health),
          trainDone: pick(KEYS.trainDone, shape.trainDone),
          diet: pick(KEYS.diet, shape.diet),
          dietSeed: shape.dietSeed,
          run: pick(KEYS.run, shape.run),
          courses: pick(KEYS.courses, shape.courses),
          todos: pick(KEYS.todos, shape.todos),
          assignments: pick(KEYS.assignments, shape.assignments),
          templates: pick(KEYS.templates, shape.templates),
          milestones: (pick(KEYS.milestones, shape.milestones) ?? []).map((m) => ({
            ...m,
            checklist: Array.isArray(m.checklist) ? m.checklist : [],
          })),
          calendars: (pick(KEYS.calendars, shape.calendars) ?? []).map((c) => ({
            ...c,
            events: (c.events ?? []).map((e) => ({ ...e, accepted: e.accepted !== false })),
          })),
          settings: { ...DEFAULT_SETTINGS, ...pick(KEYS.settings, shape.settings) },
        };
        await replaceAll({
          [KEYS.health]: next.health,
          [KEYS.trainDone]: next.trainDone,
          [KEYS.diet]: next.diet,
          [KEYS.run]: next.run,
          [KEYS.courses]: next.courses,
          [KEYS.todos]: next.todos,
          [KEYS.assignments]: next.assignments,
          [KEYS.templates]: next.templates,
          [KEYS.milestones]: next.milestones,
          [KEYS.calendars]: next.calendars,
          [KEYS.settings]: next.settings,
        });
        setShape(next);
      },
      resetAll: async () => {
        await replaceAll({
          [KEYS.health]: [],
          [KEYS.trainDone]: [],
          [KEYS.diet]: [],
          [KEYS.dietSeed]: [],
          [KEYS.run]: [],
          [KEYS.courses]: [],
          [KEYS.todos]: [],
          [KEYS.assignments]: [],
          [KEYS.templates]: [],
          [KEYS.milestones]: [],
          [KEYS.calendars]: [],
          [KEYS.settings]: DEFAULT_SETTINGS,
        });
        setShape({ ...FALLBACK, courses: [], settings: DEFAULT_SETTINGS });
      },
    };
    // tick 参与依赖：跨天后 today 会自动更新
  }, [shape, ready, storageDir, update, persist, tick]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

let seq = 0;
export const uid = (): string =>
  `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
