// 校历识别：选一张学校校历图片 → 本地 OCR 识别 → 逐条确认 → 写入重要事项。
//
// 与「课表识别」的区别：课表识别的是课程网格（课程名/星期/节次/教室/周次），
// 校历识别的是自然语言说明区里的关键日期（报到/上课/考试/放假），并可用
// 「正式上课 / 教学周」那天反推学期起点（进而校准当前教学周）。
//
// 设计取舍：
//  · OCR 一定有错（「清」认成「消」、日期串行），所以**绝不自动写入**，
//    一律先列出识别结果让你逐条勾选、可改日期和标题，确认后才落库。
//  · 识别引擎用 Windows 自带的 Windows.Media.Ocr，不联网、不装依赖、照片不出本机。
//  · 原图存进 data/calendars，识别结果存 data/fitplan-calendars.json，可反复查看。
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Panel, Empty, btnPrimary, btnGhost,
} from '@/components/Panel';
import { useStore, uid, type CalendarDoc, type CalendarEvent, type Milestone } from '@/store/store';
import { ScanLine, ImageUp, Trash2, FileText, Plus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseCalendarText, type CalendarTextResult } from '@/lib/textParse';
import { CALENDAR_AI_PROMPT, copyToClipboard } from '@/lib/aiPrompts';

const CATEGORY_TONE: Record<string, string> = {
  教务: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  考试: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  假期: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  活动: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

const CONFIDENCE_LABEL: Record<string, { text: string; cls: string }> = {
  high: { text: '高', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  medium: { text: '中', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  low: { text: '低', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

/** 给识别结果推一个分类默认值 */
function guessCategory(title: string): string {
  if (/考|测试|四级|六级/.test(title)) return '考试';
  if (/假|节/.test(title)) return '假期';
  if (/运动会|活动|比赛|晚会/.test(title)) return '活动';
  return '教务';
}

export default function CalendarAcademic() {
  const store = useStore();
  const docs = store.calendars;

  const [busy, setBusy] = useState<'' | 'pick' | 'ocr'>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(docs[0]?.id ?? null);
  const [preview, setPreview] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  /** 粘贴文字解析出的学期信息（可直接应用到设置） */
  const [parsedCal, setParsedCal] = useState<CalendarTextResult | null>(null);

  // 正在编辑的识别结果（确认前先放这里，不污染 store）
  const [draft, setDraft] = useState<CalendarEvent[] | null>(null);

  const active = useMemo(() => docs.find((d) => d.id === activeId) ?? docs[0] ?? null, [docs, activeId]);

  // 切到某张校历时，把它的识别结果载入草稿
  useEffect(() => {
    if (!active) {
      setDraft(null);
      setPreview('');
      return;
    }
    setDraft(active.events.map((e) => ({ ...e })));
    let alive = true;
    const d = window.desktop;
    if (d?.calendar && active.relPath) {
      d.calendar
        .read(active.relPath)
        .then((r) => {
          if (alive && r.ok && r.dataUrl) setPreview(r.dataUrl);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [active]);

  const desktopReady = Boolean(window.desktop?.calendar);

  const notify = useCallback((kind: 'ok' | 'err' | 'info', text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), 6000);
  }, []);

  /** 复制「给 AI 的指令」，让用户拿去做第一步 */
  const copyPrompt = useCallback(() => {
    if (copyToClipboard(CALENDAR_AI_PROMPT)) {
      notify('ok', '已复制指令。把它连同你的校历原文发给豆包等 AI，再把 AI 输出的文字粘贴到下面的输入框。');
    } else {
      setPromptOpen(true);
      notify('err', '自动复制失败，已展开指令原文，请手动全选复制。');
    }
  }, [notify]);

  /** 选图 + 识别 */
  const pickAndScan = useCallback(async () => {
    const cal = window.desktop?.calendar;
    if (!cal) {
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
      notify('info', '正在识别，密集表格会放大后处理，通常需要 5～15 秒…');
      const res = await cal.ocr(picked.relPath!, 3);
      if (!res.ok) {
        notify('err', '识别失败：' + (res.error ?? '未知错误'));
        return;
      }
      const doc: CalendarDoc = {
        id: uid(),
        relPath: picked.relPath!,
        name: (picked.relPath ?? '').split(/[\\/]/).pop() ?? '校历',
        scale: res.scale,
        engine: res.engine,
        lineCount: res.lines?.length ?? 0,
        createdAt: new Date().toISOString(),
        events: (res.events ?? []).map((e) => ({ ...e, id: uid(), accepted: true })),
      };
      store.setCalendars([doc, ...docs]);
      setActiveId(doc.id);
      notify(
        doc.events.length ? 'ok' : 'err',
        doc.events.length
          ? `识别完成：读出 ${doc.lineCount} 行文字，找到 ${doc.events.length} 个关键日期，请逐条核对后写入。`
          : `读出 ${doc.lineCount} 行文字，但没找到可识别的关键日期。可在下方「原始识别文本」里核对，或换一张更清晰的照片。`
      );
    } catch (err) {
      notify('err', '出错：' + String(err));
    } finally {
      setBusy('');
    }
  }, [docs, notify, store]);

  /** 拖拽导入 */
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const cal = window.desktop?.calendar;
      if (!cal) {
        notify('err', '浏览器预览模式不支持拖拽导入，请用桌面版。');
        return;
      }
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      const anyF = f as unknown as { path?: string };
      if (!anyF.path) {
        notify('err', '没能拿到文件路径，请改用「选择校历图片」。');
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
        const res = await cal.ocr(imported.relPath!, 3);
        if (!res.ok) {
          notify('err', '识别失败：' + (res.error ?? '未知错误'));
          return;
        }
        const doc: CalendarDoc = {
          id: uid(),
          relPath: imported.relPath!,
          name: f.name,
          scale: res.scale,
          engine: res.engine,
          lineCount: res.lines?.length ?? 0,
          createdAt: new Date().toISOString(),
          events: (res.events ?? []).map((x) => ({ ...x, id: uid(), accepted: true })),
        };
        store.setCalendars([doc, ...docs]);
        setActiveId(doc.id);
        notify('ok', `识别完成，找到 ${doc.events.length} 个关键日期。`);
      } catch (err) {
        notify('err', '出错：' + String(err));
      } finally {
        setBusy('');
      }
    },
    [docs, notify, store]
  );

  const updateDraft = (id: string, patch: Partial<CalendarEvent>) =>
    setDraft((d) => (d ? d.map((e) => (e.id === id ? { ...e, ...patch } : e)) : d));

  const removeDraft = (id: string) => setDraft((d) => (d ? d.filter((e) => e.id !== id) : d));

  const addBlank = () =>
    setDraft((d) => [
      ...(d ?? []),
      {
        id: uid(),
        title: '',
        date: store.todayKey,
        category: '教务',
        emoji: '📌',
        raw: '',
        confidence: 'low',
        accepted: true,
      },
    ]);

  const acceptedCount = draft?.filter((e) => e.accepted && e.title && e.date).length ?? 0;

  /**
   * 把勾选的条目写进「重要事项」。
   * 图片识别和粘贴文字两条路径都走这里 —— 所以**不能**要求必须有 active
   * （粘贴文字没有对应的识别记录，之前那个 `!active` 判断会让按钮静默失效）。
   */
  const importToMilestones = useCallback(() => {
    if (!draft) return;
    const good = draft.filter((e) => e.accepted && e.title.trim() && e.date);
    if (!good.length) {
      notify('err', '没有勾选任何有效条目（需要同时有标题和日期）。');
      return;
    }
    // 已有的事项按「标题 + 日期」判重，避免重复导入
    const existing = new Set(store.milestones.map((m) => `${m.title}|${m.date ?? ''}`));
    const fresh = good.filter((e) => !existing.has(`${e.title.trim()}|${e.date}`));
    const skipped = good.length - fresh.length;

    const newOnes: Milestone[] = fresh.map((e) => ({
      id: 'ms-' + e.id,
      title: e.title.trim(),
      date: e.date,
      category: e.category || guessCategory(e.title),
      emoji: e.emoji || '📌',
      remindDaysBefore: e.category === '假期' ? 3 : 7,
      done: false,
      checklist: [],
      note: e.raw ? `来自校历识别：${e.raw}` : '来自校历识别',
    }));

    // 记下已写入的 id，便于在页面上标出「已写入」
    const importedIds = new Map(fresh.map((e, i) => [e.id, newOnes[i].id]));

    store.setMilestones([...store.milestones, ...newOnes]);

    // 更新草稿上的「已写入」标记（两条路径都需要）
    setDraft((d) =>
      d ? d.map((e) => ({ ...e, importedAs: importedIds.get(e.id) ?? e.importedAs })) : d
    );

    // 若有对应的识别记录，把状态一并回写
    if (active) {
      const nextEvents = active.events.map((e) => ({
        ...e,
        accepted: draft.find((x) => x.id === e.id)?.accepted ?? e.accepted,
        importedAs: importedIds.get(e.id) ?? e.importedAs,
      }));
      store.setCalendars(docs.map((d) => (d.id === active.id ? { ...d, events: nextEvents } : d)));
    }

    notify(
      'ok',
      `已添加 ${newOnes.length} 条到「重要事项」${skipped ? `，跳过 ${skipped} 条已存在的` : ''}。去「重要事项」页就能看到倒计时。`
    );
  }, [active, draft, docs, notify, store]);

  /** 顺带把教学周起止写进设置 */
  const applyTeachingWeeks = useCallback(() => {
    if (!draft) return;
    const start = draft.find((e) => e.accepted && /正式上课|教学周/.test(e.title) && e.date);
    if (!start) {
      notify('err', '没找到「正式上课 / 教学周」这类条目，无法推断学期起点。');
      return;
    }
    store.setSettings({ semesterStart: start.date });
    notify('ok', `已把学期起点设为 ${start.date}，周计划与本学期周次会据此重算。`);
  }, [draft, notify, store]);

  /** 解析粘贴的校历文字：能直接拿到学期起点、总周数、关键日期，比识图可靠 */
  const parsePasted = useCallback(() => {
    const res = parseCalendarText(pasteText);
    if (!res.events.length && !res.semesterStart) {
      notify('err', res.warnings[0] || '没有解析出内容，请检查文字里是否包含日期。');
      return;
    }
    setParsedCal(res);
    // 与图片识别保持一致：文字解析也存一条「识别记录」，
    // 这样结果区、逐条核对、「添加到重要事项」、原始文本回看全都和识图路径一样。
    const doc: CalendarDoc = {
      id: uid(),
      relPath: '',
      name: '粘贴的校历文字',
      scale: 1,
      engine: '文字解析',
      lineCount: pasteText.split(/\r?\n/).filter((l) => l.trim()).length,
      createdAt: new Date().toISOString(),
      events: res.events.map((e) => ({
        id: uid(),
        title: e.title,
        date: e.date,
        category: e.category,
        emoji: e.emoji,
        raw: e.raw,
        confidence: 'high' as const,
        accepted: true,
      })),
    };
    store.setCalendars([doc, ...docs]);
    // 切到这条记录会触发 useEffect，把 events 载入可编辑草稿
    setActiveId(doc.id);
    setRawLines(pasteText.split(/\r?\n/));
    notify(
      'ok',
      `解析出 ${res.events.length} 个关键日期${res.semesterStart ? `，学期起点 ${res.semesterStart}` : ''}${
        res.totalWeeks ? `，共 ${res.totalWeeks} 周` : ''
      }，已存入「识别记录」，请核对后点「添加到重要事项」。`
    );
  }, [docs, notify, pasteText, store]);

  /** 把文字解析出的学期起点 / 总周数写进设置 */
  const applyParsedSettings = useCallback(() => {
    if (!parsedCal) return;
    const patch: { semesterStart?: string; totalWeeks?: number } = {};
    if (parsedCal.semesterStart) patch.semesterStart = parsedCal.semesterStart;
    if (parsedCal.totalWeeks) patch.totalWeeks = parsedCal.totalWeeks;
    if (!Object.keys(patch).length) {
      notify('err', '这段文字里没有学期起点或总周数，无法应用。');
      return;
    }
    store.setSettings(patch);
    notify(
      'ok',
      `已应用${parsedCal.semesterStart ? `：学期起点 ${parsedCal.semesterStart}` : ''}${
        parsedCal.totalWeeks ? `${parsedCal.semesterStart ? '，' : '：'}总周数 ${parsedCal.totalWeeks}` : ''
      }。周计划与当前教学周已重算。`
    );
  }, [notify, parsedCal, store]);

  const deleteDoc = (id: string) => {
    store.setCalendars(docs.filter((d) => d.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const openRaw = () => {
    if (!active) return;
    const d = window.desktop;
    if (!d?.calendar) return;
    // 重新读一遍原始文本（识别结果里没存行，避免文件过大）
    d.calendar.ocr(active.relPath, active.scale || 3).then((r) => {
      if (r.ok) {
        setRawLines((r.lines ?? []).map((l) => l.text));
        setShowRaw(true);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* ── 顶部说明 + 操作 ── */}
      <Panel
        title="校历识别"
        icon={ScanLine}
        action={
          <div className="flex items-center gap-1.5">
            {docs.length > 0 && (
              <button className={btnGhost} onClick={() => window.desktop?.calendar?.openDir()}>
                打开图片目录
              </button>
            )}
            <button className={btnPrimary} onClick={pickAndScan} disabled={busy !== '' || !desktopReady}>
              <ImageUp className="h-4 w-4" />
              {busy ? (busy === 'pick' ? '选择中…' : '识别中…') : '选择校历图片'}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-400">
          <span className="mr-2 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-300">
            ⚠ 不稳定 · 测试版
          </span>
          拍一张学校校历的照片，自动读出报到、上课、考试、放假等关键日期 —— 识别结果会先列出来让你核对，确认后才写入。
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
          {dragOver ? '松手即可导入并识别' : '把校历图片拖到这里，或点右上角「选择校历图片」'}
          <span className="ml-2 text-xs text-slate-400">
            · 用 Windows 自带 OCR，照片不出本机、不联网
          </span>
        </div>

        {/* ── 粘贴文字：校历文字里常自带「周次-日期对应表」，比识图可靠得多 ── */}
        <div className="mt-3 border-t border-[var(--border-1)] pt-3">
          <button className={btnGhost} onClick={() => setPasteOpen((v) => !v)}>
            <FileText className="h-4 w-4" />
            {pasteOpen ? '收起文字粘贴' : '粘贴校历文字（推荐：比识图可靠）'}
          </button>
          {pasteOpen && (
            <div className="mt-2 space-y-2">
              {/* 第一步：把指令发给 AI，让它把校历整理成固定格式 */}
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                <p className="text-xs text-sky-200">
                  <b>第一步</b>：复制下面的指令，连同你的校历原文（或截图）发给豆包等 AI，让它按固定格式输出；
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
                    {CALENDAR_AI_PROMPT}
                  </pre>
                )}
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder={'秋季学期：9 月 7 日～次年 1 月 17 日，共 19 周\n\n第 1 周：9.7–9.13\n第 2 周：9.14–9.20\n\n2026：中秋节 (9.25)、国庆节 (10.1)'}
                className="w-full rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] p-2 font-mono text-xs leading-relaxed text-[var(--text-1)]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnPrimary} onClick={parsePasted} disabled={!pasteText.trim()}>
                  解析文字
                </button>
                {parsedCal && (parsedCal.semesterStart || parsedCal.totalWeeks) && (
                  <button className={btnGhost} onClick={applyParsedSettings}>
                    应用学期设置
                    {parsedCal.semesterStart ? `（起点 ${parsedCal.semesterStart}` : '（'}
                    {parsedCal.totalWeeks ? `${parsedCal.semesterStart ? '，' : ''}共 ${parsedCal.totalWeeks} 周）` : '）'}
                  </button>
                )}
                <span className="text-[11px] text-slate-500">
                  支持「第 N 周：9.7–9.13」周次表、「共 19 周」、军训/开课/节假日等关键日期
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

      {docs.length === 0 && !draft ? (
        <Panel title="还没有识别记录" icon={ScanLine}>
          <div className="space-y-2 text-sm text-slate-400">
            <p>用法很简单：</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>拿到学校的校历图片（拍屏幕、拍纸质版、截图都行）</li>
              <li>点上面「选择校历图片」，程序会自动放大 3 倍再识别，提高小字准确率</li>
              <li>识别结果会列出来，你逐条核对、改错、勾选</li>
              <li>点「添加到重要事项」，这些日期就会出现在「重要事项」页并开始倒计时</li>
            </ol>
            <p className="pt-1 text-xs text-slate-500">
              建议：照片尽量正着拍、别反光，把「说明」那一栏也拍进去 —— 关键日期通常写在说明里。
              识别到「正式上课 / 教学周」后，还能用它一键校准学期起点（也就是当前的「第几周」）。
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── 左：识别结果确认表 ── */}
          <div className="space-y-4">
            <Panel
              title={`识别结果核对${active ? ` · ${active.name}` : ''}`}
              icon={CheckCircle2}
              action={
                <div className="flex items-center gap-1.5">
                  <button className={btnGhost} onClick={openRaw} disabled={!active}>
                    <FileText className="h-4 w-4" />
                    原始文本
                  </button>
                  <button className={btnGhost} onClick={addBlank} disabled={!draft}>
                    <Plus className="h-4 w-4" />
                    手动加一条
                  </button>
                  <button className={btnPrimary} onClick={importToMilestones} disabled={acceptedCount === 0}>
                    <Plus className="h-4 w-4" />
                    添加到重要事项{acceptedCount ? ` (${acceptedCount})` : ''}
                  </button>
                </div>
              }
            >
              {active && (
                <p className="mb-2 text-[11px] text-slate-500">
                  {active.engine ?? 'OCR'} · 读出 {active.lineCount} 行 · 找到 {active.events.length} 个日期
                </p>
              )}
              {!draft || draft.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {active
                    ? '这张图没识别出关键日期。点「原始文本」看看识别到了什么，或者换一张更清晰的照片重试。'
                    : '还没有可添加的日期。用上面的「选择校历图片」识别，或点「粘贴校历文字」把 AI 整理好的校历贴进来。'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {draft.map((e) => {
                    const conf = CONFIDENCE_LABEL[e.confidence] ?? CONFIDENCE_LABEL.medium;
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          'flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-sm',
                          e.accepted ? 'border-[var(--border-2)] bg-[var(--surface-1)]' : 'border-[var(--border-1)] bg-[var(--surface-2)] opacity-60'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={e.accepted}
                          onChange={(ev) => updateDraft(e.id, { accepted: ev.target.checked })}
                          className="h-4 w-4 shrink-0 accent-emerald-500"
                          title="勾选后才会写入"
                        />
                        <input
                          value={e.emoji}
                          onChange={(ev) => updateDraft(e.id, { emoji: ev.target.value })}
                          className="w-9 shrink-0 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-1 py-0.5 text-center text-base text-[var(--text-1)]"
                          maxLength={2}
                        />
                        <input
                          value={e.title}
                          onChange={(ev) => updateDraft(e.id, { title: ev.target.value })}
                          placeholder="事项名称"
                          className="min-w-[7rem] flex-1 rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-sm text-[var(--text-1)]"
                        />
                        <input
                          type="date"
                          value={e.date}
                          onChange={(ev) => updateDraft(e.id, { date: ev.target.value })}
                          className="rounded border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-sm text-[var(--text-1)]"
                        />
                        <select
                          value={e.category}
                          onChange={(ev) => updateDraft(e.id, { category: ev.target.value })}
                          className={cn(
                            'rounded border px-1.5 py-1 text-xs',
                            CATEGORY_TONE[e.category] ?? 'border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-1)]'
                          )}
                        >
                          {['教务', '考试', '假期', '活动'].map((c) => (
                            <option key={c} value={c} className="bg-[var(--surface-0)] text-[var(--text-1)]">
                              {c}
                            </option>
                          ))}
                        </select>
                        <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', conf.cls)}>
                          置信 {conf.text}
                        </span>
                        {e.importedAs && (
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            已写入
                          </span>
                        )}
                        <button
                          onClick={() => removeDraft(e.id)}
                          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                          title="删除这一条"
                        >
                          删除
                        </button>
                        {e.raw && (
                          <p className="w-full truncate pl-6 text-[11px] text-slate-500" title={e.raw}>
                            原文：{e.raw}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-1)] pt-3">
                <button className={btnGhost} onClick={applyTeachingWeeks} disabled={!draft?.length}>
                  用识别结果校准学期起点
                </button>
                <span className="text-xs text-slate-500">
                  会把「正式上课 / 教学周」那天设为学期第 1 周起点
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
                  如果关键日期没抽出来，多半是这一句识别错了，可据此手动补。
                </p>
                <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] p-3 text-[11px] leading-relaxed text-slate-400">
                  {rawLines.join('\n') || '（空）'}
                </pre>
              </Panel>
            )}
          </div>

          {/* ── 右：图片预览 + 历史记录 ── */}
          <div className="space-y-4">
            <Panel title="原图" icon={ImageUp}>
              {preview ? (
                <img
                  src={preview}
                  alt="校历原图"
                  className="w-full rounded-lg border border-[var(--border-2)]"
                  onClick={() => window.desktop?.calendar?.openDir()}
                  title="点击打开图片所在目录"
                />
              ) : (
                <Empty>（没有可预览的图片）</Empty>
              )}
            </Panel>

            <Panel title={`识别记录 (${docs.length})`} icon={FileText}>
              <div className="space-y-1.5">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
                      d.id === active?.id
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-[var(--border-2)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]'
                    )}
                  >
                    <button onClick={() => setActiveId(d.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[var(--text-1)]">{d.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {d.createdAt.slice(0, 10)} · {d.events.length} 个日期 · {d.lineCount} 行
                      </p>
                    </button>
                    <button
                      onClick={() => deleteDoc(d.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                      title="删除这条记录（不会删掉已写入的重要事项）"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
