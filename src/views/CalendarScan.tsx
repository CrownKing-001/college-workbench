// 课表识别：导入一张课程表图片 → 本地 OCR 识别 → 重建表格网格 → 逐条确认后导入课表。
//
// 设计取舍：
//  · OCR 一定会有错（课程名认错字、周次串行、教室串到隔壁格子），所以**绝不自动写入**。
//    一律先列出识别结果，用户逐条核对、修改、取消勾选，确认后才写进课表。
//  · 识别引擎用 Windows 自带的 Windows.Media.Ocr，不联网、不装依赖、照片不出本机。
//  · 原图存进 data/calendars，跟着数据目录一起备份。
//
// 与「日期抽取」的区别：日期抽取针对自然语言说明，课表是网格
// （横轴星期、纵轴节次），所以底层共用同一个 OCR，后处理是两套规则。
import { useCallback, useMemo, useState } from 'react';
import { Panel, Empty, btnPrimary, btnGhost } from '@/components/Panel';
import { useStore, uid, type CalendarDoc } from '@/store/store';
import { currentWeek, semesterStartForWeek, type Course } from '@/data/plan';
import { fromKey, toKey, type TimetableCourse } from '@/lib/storage';
import { parseTimetableText } from '@/lib/textParse';
import { TIMETABLE_AI_PROMPT, copyToClipboard } from '@/lib/aiPrompts';
import { ScanLine, ImageUp, Plus, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const CONFIDENCE_LABEL: Record<string, { text: string; cls: string }> = {
  high: { text: '高', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  medium: { text: '中', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  low: { text: '低', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

/** 草稿行：在识别结果基础上加一个「是否导入」勾选 */
interface DraftCourse extends TimetableCourse {
  id: string;
  accepted: boolean;
  /** 周次输入框的文本形式，便于用户手改（如 "1-16" / "2,4,6"） */
  weeksText: string;
}

/** 把周次数组转成可编辑的紧凑文本：连续段写成 a-b，其余逗号分隔 */
function weeksToText(weeks: number[] | null): string {
  if (!weeks || !weeks.length) return '';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(',');
}

/** 解析用户手改过的周次文本，支持 "1-16" / "1,3,5" / "1-16,18" */
function parseWeeksText(text: string): number[] | null {
  const t = String(text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!t.trim()) return null;
  const out = new Set<number>();
  for (const seg of t.split(/[,，、\s]+/).filter(Boolean)) {
    const m = seg.match(/^(\d{1,2})\s*[-–~至]\s*(\d{1,2})$/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) if (w >= 1 && w <= 30) out.add(w);
      continue;
    }
    const n = Number(seg);
    if (Number.isInteger(n) && n >= 1 && n <= 30) out.add(n);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

export default function CalendarScan() {
  const store = useStore();
  const docs = store.calendars;
  const [busy, setBusy] = useState<'' | 'pick' | 'ocr'>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [draft, setDraft] = useState<DraftCourse[] | null>(null);
  const [preview, setPreview] = useState('');
  const [docName, setDocName] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [detectedWeek, setDetectedWeek] = useState<number | null>(null);
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);

  const desktopReady = Boolean(window.desktop?.calendar?.timetable);

  // 当前教学周（用于「只导入本周」过滤与提示）
  const currentWeekNum = currentWeek(store.today, fromKey(store.settings.semesterStart));

  const notify = useCallback((kind: 'ok' | 'err' | 'info', text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), 8000);
  }, []);

  /** 复制「给 AI 的指令」，让用户拿去做第一步 */
  const copyPrompt = useCallback(() => {
    if (copyToClipboard(TIMETABLE_AI_PROMPT)) {
      notify('ok', '已复制指令。把它连同你的课表原文发给豆包等 AI，再把 AI 输出的文字粘贴到下面的输入框。');
    } else {
      setPromptOpen(true);
      notify('err', '自动复制失败，已展开指令原文，请手动全选复制。');
    }
  }, [notify]);

  /** 用图片里识别出的「第N周」校准当前教学周 */
  const applyCurrentWeek = useCallback(() => {
    if (!detectedWeek) return;
    const start = semesterStartForWeek(detectedWeek, store.today);
    store.setSettings({ semesterStart: toKey(start) });
    notify('ok', `已把当前周设为第 ${detectedWeek} 周（学期起点调整为 ${toKey(start)}），全应用的周次会据此重算。`);
  }, [detectedWeek, notify, store]);

  /** 解析粘贴的课表文字：不经过 OCR，比识图可靠得多（文字是确定的） */
  const parsePasted = useCallback(() => {
    const res = parseTimetableText(pasteText, store.settings.periods);
    if (!res.courses.length) {
      notify('err', res.warnings[0] || '没有解析出课程，请检查文字里是否包含「周一」这类分节标题。');
      return;
    }
    setDocName('粘贴的文字');
    setDetectedWeek(res.textWeek);
    setDraft(
      res.courses.map((c) => ({
        ...c,
        id: uid(),
        // 标了「非本周」的课默认不勾选，否则会被当成每周都上
        accepted: !c.nonThisWeek,
        weeksText: weeksToText(c.weeks),
      }))
    );
    setRawLines(pasteText.split(/\r?\n/));
    notify(
      'ok',
      `解析出 ${res.courses.length} 门课程${res.textWeek ? `（这份文字属于第 ${res.textWeek} 周）` : ''}，请核对后导入。`
    );
  }, [notify, pasteText, store.settings.periods]);

  /** 把识别出的课程转成可编辑草稿 */
  const toDraft = useCallback(
    (courses: TimetableCourse[]): DraftCourse[] =>
      courses.map((c) => ({
        ...c,
        id: uid(),
        accepted: true,
        weeksText: weeksToText(c.weeks),
      })),
    []
  );

  /** 载入原图预览 */
  const loadPreview = useCallback(async (relPath: string) => {
    const d = window.desktop;
    if (!d?.calendar) return;
    try {
      const r = await d.calendar.read(relPath);
      if (r.ok && r.dataUrl) setPreview(r.dataUrl);
    } catch {
      /* 预览失败不影响识别结果 */
    }
  }, []);

  /** 选图 + 识别课表 */
  const pickAndScan = useCallback(async () => {
    const cal = window.desktop?.calendar;
    if (!cal?.timetable) {
      notify('err', '浏览器预览模式不支持选图识别，请用桌面版打开。');
      return;
    }
    setBusy('pick');
    try {
      const picked = await cal.pick();
      if (!picked.ok) {
        if (!picked.canceled) notify('err', '选图失败：' + (picked.error ?? '未知错误'));
        return;
      }
      setBusy('ocr');
      notify('info', '正在识别课表，图片会先放大再识别，通常需要 5～15 秒…');
      const res = await cal.timetable(picked.relPath!, 3, store.settings.periods);
      if (!res.ok) {
        notify('err', '识别失败：' + (res.error ?? '未知错误'));
        return;
      }
      const name = (picked.relPath ?? '').split(/[\\/]/).pop() ?? '课表';
      setDocName(name);
      setDetectedWeek(res.currentWeek ?? null);
      setDraft(toDraft(res.courses ?? []));
      setRawLines((res.lines ?? []).map((l) => l.text));
      await loadPreview(picked.relPath!);
      notify(
        res.courses?.length ? 'ok' : 'err',
        res.courses?.length
          ? `识别完成：读出 ${res.lines?.length ?? 0} 行文字，找到 ${res.courses.length} 门课程，请逐条核对后导入。`
          : `读出 ${res.lines?.length ?? 0} 行文字，但没能重建出课表网格。可在下方「原始识别文本」里核对，或换一张更清晰、表格线更清楚的截图。`
      );
    } catch (err) {
      notify('err', '出错：' + String(err));
    } finally {
      setBusy('');
    }
  }, [loadPreview, notify, toDraft]);

  /** 拖拽导入 */
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const cal = window.desktop?.calendar;
      if (!cal?.timetable) {
        notify('err', '浏览器预览模式不支持拖拽导入，请用桌面版。');
        return;
      }
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      const anyF = f as unknown as { path?: string };
      if (!anyF.path) {
        notify('err', '没能拿到文件路径，请改用「选择课表图片」。');
        return;
      }
      setBusy('ocr');
      try {
        const imported = await cal.importPath(anyF.path);
        if (!imported.ok) {
          notify('err', '导入失败：' + (imported.error ?? '未知错误'));
          return;
        }
        notify('info', '正在识别…');
        const res = await cal.timetable(imported.relPath!, 3, store.settings.periods);
        if (!res.ok) {
          notify('err', '识别失败：' + (res.error ?? '未知错误'));
          return;
        }
        setDocName(f.name);
        setDetectedWeek(res.currentWeek ?? null);
        setDraft(toDraft(res.courses ?? []));
        setRawLines((res.lines ?? []).map((l) => l.text));
        await loadPreview(imported.relPath!);
        notify('ok', `识别完成，找到 ${res.courses?.length ?? 0} 门课程，请核对后导入。`);
      } catch (err) {
        notify('err', '出错：' + String(err));
      } finally {
        setBusy('');
      }
    },
    [loadPreview, notify, toDraft]
  );

  const updateDraft = (id: string, patch: Partial<DraftCourse>) =>
    setDraft((d) => (d ? d.map((c) => (c.id === id ? { ...c, ...patch } : c)) : d));

  const removeDraft = (id: string) => setDraft((d) => (d ? d.filter((c) => c.id !== id) : d));

  const addBlank = () =>
    setDraft((d) => [
      ...(d ?? []),
      {
        id: uid(),
        day: 1,
        name: '',
        place: '',
        start: '08:00',
        end: '09:40',
        weeks: null,
        weeksLabel: '',
        weeksText: '',
        raw: '',
        confidence: 'low',
        rowIndex: 1,
        span: 1,
        accepted: true,
      },
    ]);

  /** 勾选「只导入本周」时，草稿只保留当前教学周上课的课程 */
  const visibleDraft = useMemo(() => {
    if (!onlyThisWeek || !draft) return draft;
    return draft.filter((c) => {
      const weeks = parseWeeksText(c.weeksText) ?? c.weeks;
      if (!weeks || !weeks.length) return true; // 每周都上
      return weeks.includes(currentWeekNum);
    });
  }, [draft, onlyThisWeek, currentWeekNum]);

  const acceptedCount = useMemo(
    () => visibleDraft?.filter((c) => c.accepted && c.name.trim()).length ?? 0,
    [visibleDraft]
  );

  /** 把勾选的课程写进课表 */
  const importToCourses = useCallback(() => {
    if (!visibleDraft) return;
    const good = visibleDraft.filter((c) => c.accepted && c.name.trim());
    if (!good.length) {
      notify('err', '没有勾选任何课程（需要有课程名）。');
      return;
    }
    // 已有课表按「课程名 + 星期 + 开始时间」判重，避免重复导入
    const existing = new Set((store.courses ?? []).map((c) => `${c.name}|${c.day}|${c.start}`));
    const fresh = good.filter((c) => !existing.has(`${c.name.trim()}|${c.day}|${c.start}`));
    const skipped = good.length - fresh.length;

    const newOnes: Course[] = fresh.map((c) => {
      const weeks = parseWeeksText(c.weeksText);
      return {
        id: uid(),
        day: c.day,
        name: c.name.trim(),
        start: c.start,
        end: c.end,
        place: c.place.trim(),
        // 图片上没写周次时，用「整个学期」表达，让课表页每天都能显示出来
        weeks: weeks ?? Array.from({ length: store.settings.totalWeeks }, (_, i) => i + 1),
        tag: '导入',
      };
    });

    store.setCourses([...(store.courses ?? []), ...newOnes]);
    notify(
      'ok',
      `已导入 ${newOnes.length} 门课程${skipped ? `，跳过 ${skipped} 门已存在的` : ''}。去「课表」页就能看到。`
    );
  }, [visibleDraft, notify, store]);

  /** 把这次识别作为一条记录存档，便于以后回看 */
  const saveDoc = useCallback(() => {
    if (!draft?.length) return;
    const doc: CalendarDoc = {
      id: uid(),
      relPath: '',
      name: docName || '课表',
      lineCount: rawLines.length,
      createdAt: new Date().toISOString(),
      events: [],
    };
    store.setCalendars([doc, ...docs]);
    notify('ok', '已把这次识别记入下方「识别记录」。');
  }, [draft, docName, docs, notify, rawLines.length, store]);

  const deleteDoc = (id: string) => store.setCalendars(docs.filter((d) => d.id !== id));

  return (
    <div className="space-y-4">
      {/* ── 顶部说明 + 操作 ── */}
      <Panel
        title="课表识别"
        icon={ScanLine}
        action={
          <div className="flex items-center gap-1.5">
            {preview && (
              <button className={btnGhost} onClick={() => window.desktop?.calendar?.openDir()}>
                打开图片目录
              </button>
            )}
            <button className={btnPrimary} onClick={pickAndScan} disabled={busy !== '' || !desktopReady}>
              <ImageUp className="h-4 w-4" />
              {busy ? (busy === 'pick' ? '选择中…' : '识别中…') : '选择课表图片'}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-400">
          <span className="mr-2 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-300">
            ⚠ 不稳定 · 测试版
          </span>
          导入一张课程表截图或照片，自动读出「课程名 / 星期 / 节次 / 教室 / 周次」——
          识别结果会先列出来让你逐条核对，确认后才写进课表。
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'rounded-lg border border-dashed px-4 py-3 text-sm transition',
            dragOver ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-[var(--border-2)] text-slate-500'
          )}
        >
          {dragOver ? '松手即可导入并识别' : '把课表图片拖到这里，或点右上角「选择课表图片」'}
          <span className="ml-2 text-xs text-slate-400">
            · 用 Windows 自带 OCR，照片不出本机、不联网
          </span>
        </div>

        {/* ── 粘贴文字：不经过 OCR，比识图可靠得多 ── */}
        <div className="mt-3 border-t border-[var(--border-1)] pt-3">
          <button className={btnGhost} onClick={() => setPasteOpen((v) => !v)}>
            <FileText className="h-4 w-4" />
            {pasteOpen ? '收起文字粘贴' : '粘贴课表文字（推荐：比识图可靠）'}
          </button>
          {pasteOpen && (
            <div className="mt-2 space-y-2">
              {/* 第一步：把指令发给 AI，让它把课表整理成固定格式 */}
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                <p className="text-xs text-sky-200">
                  <b>第一步</b>：复制下面的指令，连同你的课表原文（或截图）发给豆包等 AI，让它按固定格式输出；
                  <b>第二步</b>：把 AI 输出的文字粘贴到下面，点「解析文字」。
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className={btnPrimary} onClick={copyPrompt}>
                    <FileText className="h-4 w-4" />
                    复制给 AI 的指令
                  </button>
                  <button className={btnGhost} onClick={() => setPromptOpen((v) => !v)}>
                    {promptOpen ? '隐藏指令原文' : '查看指令原文'}
                  </button>
                </div>
                {promptOpen && (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-2)] bg-[var(--surface-0)] p-2 text-[11px] leading-relaxed text-slate-400">
                    {TIMETABLE_AI_PROMPT}
                  </pre>
                )}
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder={'周一\n\n1. 高级语言程序设计 A1，3-4 节（10:00-11:35），瑞安楼阶 3，第 4 周\n2. 线性代数 B，9-10 节（18:30-20:05），北 229，第 4 周\n\n周二\n\n1. ……'}
                className="w-full rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] p-2 font-mono text-xs leading-relaxed text-[var(--text-1)]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnPrimary} onClick={parsePasted} disabled={!pasteText.trim()}>
                  解析文字
                </button>
                <span className="text-[11px] text-slate-500">
                  从教务系统复制出来的文字最准，不受截图清晰度影响；支持「周一」分节、节次、时间、教室、周次、非本周
                </span>
              </div>
            </div>
          )}
        </div>

        {!desktopReady && (
          <p className="mt-2 text-xs text-amber-300">
            当前是浏览器预览模式，选图与识别只能在桌面版里用（识别需要调用系统 OCR）。
          </p>
        )}

        {msg && (
          <p
            className={cn(
              'mt-2 text-xs',
              msg.kind === 'ok' ? 'text-emerald-300' : msg.kind === 'err' ? 'text-rose-300' : 'text-slate-400'
            )}
          >
            {msg.text}
          </p>
        )}
      </Panel>

      {!draft ? (
        <Panel title="还没有识别结果" icon={ScanLine}>
          <div className="space-y-2 text-sm text-slate-400">
            <p>用法：</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>拿到自己的课表（教务系统截图、拍屏幕、拍纸质版都行）</li>
              <li>点上面「选择课表图片」，程序会先放大再识别，提高小字准确率</li>
              <li>识别结果会列成一张表，你逐条核对、改错、取消勾选错的</li>
              <li>点「导入课表」，这些课就会出现在「课表」页，周计划也会跟着更新</li>
            </ol>
            <p className="pt-1 text-xs text-slate-500">
              建议：截图上最好带「星期一…星期日」的表头和左侧节次，程序靠它们重建表格；
              只有课程方块、没有表头的图会走保守的等分列估算，准确率会下降。
            </p>
            <p className="pt-1 text-xs text-slate-500">
              本周还是全部：只导了某一周的课表（教务周课表）就直接导入，没标周次的课会按「每周」处理；
              若是整学期总课表，导入后可勾选「只导入本周」只取当前周上课的课程。
              若图片标题里写了「第N周」，程序会自动检测出来，一键校准当前周。
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── 左：识别结果确认表 ── */}
          <div className="space-y-4">
            <Panel
              title={`识别结果核对${docName ? ` · ${docName}` : ''}`}
              icon={CheckCircle2}
              action={
                <div className="flex items-center gap-1.5">
                  <button className={btnGhost} onClick={() => setShowRaw((v) => !v)}>
                    <FileText className="h-4 w-4" />
                    原始文本
                  </button>
                  <button className={btnGhost} onClick={addBlank}>
                    <Plus className="h-4 w-4" />
                    手动加一条
                  </button>
                  <button className={btnGhost} onClick={saveDoc} disabled={!draft.length}>
                    存档
                  </button>
                  <button className={btnPrimary} onClick={importToCourses} disabled={acceptedCount === 0}>
                    导入课表{acceptedCount ? ` (${acceptedCount})` : ''}
                  </button>
                </div>
              }
            >
              {detectedWeek && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
                  <span className="text-emerald-300">检测到这是「第 {detectedWeek} 周」的课表</span>
                  <button className={btnGhost} onClick={applyCurrentWeek}>
                    设为当前周
                  </button>
                </div>
              )}

              {draft.length === 0 ? (
                <p className="text-sm text-slate-400">
                  这张图没能重建出课表。点「原始文本」看看识别到了什么，或者换一张带表头、更清晰的截图重试；
                  也可以点「手动加一条」自己录入。
                </p>
              ) : (
                <div className="space-y-1.5">
                  {onlyThisWeek && visibleDraft!.length === 0 && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      本周（第 {currentWeekNum} 周）没有匹配的课程。取消下方「只导入本周」即可看到全部识别出的课程。
                    </p>
                  )}
                  {visibleDraft!.map((c) => {
                    const conf = CONFIDENCE_LABEL[c.confidence] ?? CONFIDENCE_LABEL.medium;
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'rounded-lg border px-2.5 py-2 text-sm',
                          c.accepted ? 'border-[var(--border-2)] bg-[var(--surface-1)]' : 'border-[var(--border-1)] bg-[var(--surface-2)] opacity-60'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            checked={c.accepted}
                            onChange={(e) => updateDraft(c.id, { accepted: e.target.checked })}
                            className="h-4 w-4 shrink-0 accent-emerald-500"
                            title="勾选后才会导入"
                          />
                          <select
                            value={c.day}
                            onChange={(e) => updateDraft(c.id, { day: +e.target.value })}
                            className="shrink-0 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-1 text-xs text-[var(--text-1)]"
                          >
                            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                              <option key={d} value={d} className="bg-[var(--surface-0)]">
                                {WEEKDAY_LABEL[d]}
                              </option>
                            ))}
                          </select>
                          <input
                            value={c.name}
                            onChange={(e) => updateDraft(c.id, { name: e.target.value })}
                            placeholder="课程名"
                            className="min-w-[8rem] flex-1 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-sm text-[var(--text-1)]"
                          />
                          <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', conf.cls)}>
                            置信 {conf.text}
                          </span>
                          <button
                            onClick={() => removeDraft(c.id)}
                            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                            title="删除这一条"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">
                            时间
                            <input
                              type="time"
                              value={c.start}
                              onChange={(e) => updateDraft(c.id, { start: e.target.value })}
                              className="rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-xs text-[var(--text-1)]"
                            />
                            –
                            <input
                              type="time"
                              value={c.end}
                              onChange={(e) => updateDraft(c.id, { end: e.target.value })}
                              className="rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-xs text-[var(--text-1)]"
                            />
                          </label>
                          <label className="flex min-w-[10rem] flex-1 items-center gap-1 text-[11px] text-slate-500">
                            教室
                            <input
                              value={c.place}
                              onChange={(e) => updateDraft(c.id, { place: e.target.value })}
                              placeholder="如 理科楼 B324"
                              className="min-w-[6rem] flex-1 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-xs text-[var(--text-1)]"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">
                            周次
                            <input
                              value={c.weeksText}
                              onChange={(e) => updateDraft(c.id, { weeksText: e.target.value })}
                              placeholder="留空=每周"
                              className="w-28 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-xs text-[var(--text-1)]"
                              title="支持 1-16、1,3,5、2-16 这类写法；留空表示每周都上"
                            />
                          </label>
                          <span className="text-[10px] text-slate-500">
                            第 {c.rowIndex} 节起 · 连排 {c.span} 节
                          </span>
                        </div>

                        {c.raw && (
                          <p className="mt-1 w-full truncate pl-6 text-[11px] text-slate-500" title={c.raw}>
                            原文：{c.raw}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--border-1)] pt-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={onlyThisWeek}
                    onChange={(e) => setOnlyThisWeek(e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-500"
                  />
                  只导入本周（第 {currentWeekNum} 周）上课的课程
                </label>
                <span className="text-[11px] text-slate-500">
                  周次留空表示「每周都上」；没识别出周次可手动填
                  <code className="mx-1 rounded bg-[var(--surface-0)] px-1">1-16</code>
                </span>
              </div>
            </Panel>

            {showRaw && (
              <Panel
                title="原始识别文本"
                icon={FileText}
                action={
                  <button className={btnGhost} onClick={() => setShowRaw(false)}>
                    收起
                  </button>
                }
              >
                <p className="mb-2 text-[11px] text-slate-500">
                  如果某门课没识别出来，多半是这一句识别错了，可据此手动补。
                </p>
                <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] p-3 text-[11px] leading-relaxed text-slate-400">
                  {rawLines.join('\n') || '（空）'}
                </pre>
              </Panel>
            )}
          </div>

          {/* ── 右：图片预览 + 识别记录 ── */}
          <div className="space-y-4">
            <Panel title="原图" icon={ImageUp}>
              {preview ? (
                <img
                  src={preview}
                  alt="课表原图"
                  className="w-full rounded-lg border border-[var(--border-2)]"
                  onClick={() => window.desktop?.calendar?.openDir()}
                  title="点击打开图片所在目录"
                />
              ) : (
                <Empty>（没有可预览的图片）</Empty>
              )}
            </Panel>

            <Panel title={`识别记录 (${docs.length})`} icon={FileText}>
              {docs.length === 0 ? (
                <Empty>还没有存档的识别记录</Empty>
              ) : (
                <div className="space-y-1.5">
                  {docs.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[var(--text-1)]">{d.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {d.createdAt.slice(0, 10)} · {d.lineCount} 行
                        </p>
                      </div>
                      <button
                        onClick={() => deleteDoc(d.id)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                        title="删除这条记录"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
