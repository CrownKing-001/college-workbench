// 饮食记录：全应用**唯一**的饮食入口 —— 拍照存档 + 食物库点选 + 文字识别 + 套餐复用 + 手动记账 + 历史回顾。
//
// 「体重作息」页不再记录或统计任何饮食数据，避免同一份数据两处各记一遍。
//
// 记录方式有四种，可以混用：
//   · 点食物库 → 精确到份数，算得最准
//   · 写一句话 → 自动在食物库里识别并折算营养
//   · 选一张照片 → 存档留证
//   · 直接手填蛋白 / 热量 → 识别不出来时的兜底
import { useEffect, useMemo, useState } from 'react';
import { useStore, uid } from '@/store/store';
import type { DietItem, DietLog } from '@/store/store';
import { CATEGORIES, FOODS, TEMPLATES, analyzeText, foodById } from '@/data/foods';
import type { FoodItem } from '@/data/foods';
import { Panel, Empty, Bar, Chip, IconButton, Field, inputCls, btnPrimary, btnGhost } from '@/components/Panel';
import { toKey, seedDietOnce } from '@/lib/storage';
import {
  Camera, Search, Sparkles, Trash2, X, Plus, ChevronDown, ChevronUp, Flame, Utensils, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MEALS = ['早餐', '午餐', '晚餐', '加餐'] as const;

/** 一天里各餐次的默认顺序 */
const mealOrder = (m: string) => {
  const i = MEALS.indexOf(m as (typeof MEALS)[number]);
  return i < 0 ? 99 : i;
};

export default function Diet() {
  const store = useStore();
  const todayKey = store.todayKey;
  const logs = store.diet;

  const [meal, setMeal] = useState<string>('午餐');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<DietItem[]>([]);
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('全部');
  const [preview, setPreview] = useState<string>('');
  const [saveTpl, setSaveTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [photoUsage, setPhotoUsage] = useState({ count: 0, bytes: 0 });

  // 手动记账（识别不出来时的兜底）：手填了数字就以手填为准
  const [mText, setMText] = useState('');
  const [mProtein, setMProtein] = useState('');
  const [mCalories, setMCalories] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    window.desktop?.photo?.usage().then(setPhotoUsage).catch(() => {});
  }, []);
  const quotaBytes = (store.settings.photoQuotaMB || 500) * 1048576;
  const overQuota = photoUsage.bytes > quotaBytes;

  // 合入外部预置饮食记录（按 id 去重，只合入一次）。空白模板没有预置数据，这里通常无事发生。
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await seedDietOnce(logs, store.dietSeed);
      if (!alive) return;
      if (r.merged > 0) {
        store.setDiet(r.diet);
        store.setDietSeed(r.seed);
        setMsg(`已合入 ${r.merged} 条预置饮食记录`);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, store.dietSeed]);

  // ── 目标值 ────────────────────────────────────────────
  // 蛋白按最近一次体重 × 系数（与「体重作息」同源，都读 store）；热量按 38 kcal/kg 估算需求。
  const target = store.proteinTarget;
  const latestWeight = [...store.health]
    .filter((l) => typeof l.weight === 'number' && l.weight! > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weight;
  const calorieTarget = latestWeight ? Math.round((latestWeight * 38) / 50) * 50 : 2400;

  // ── 今日汇总 ──────────────────────────────────────────
  // 保留原数组下标，删除时按下标定位 —— 比对象引用比较可靠。
  const todayIndexed = useMemo(
    () =>
      logs
        .map((l, idx) => ({ log: l, idx }))
        .filter((x) => x.log.date === todayKey)
        .sort((a, b) => mealOrder(a.log.meal) - mealOrder(b.log.meal)),
    [logs, todayKey]
  );
  const todayLogs = todayIndexed.map((x) => x.log);
  const todayProtein = todayLogs.reduce((s, l) => s + (l.protein ?? 0), 0);
  const todayCalories = todayLogs.reduce((s, l) => s + (l.calories ?? 0), 0);

  /** 今日明细按餐次分组 */
  const mealSummary = MEALS.map((m) => {
    const items = todayIndexed.filter((x) => x.log.meal === m);
    return {
      meal: m,
      items,
      protein: items.reduce((s, x) => s + (x.log.protein ?? 0), 0),
      calories: items.reduce((s, x) => s + (x.log.calories ?? 0), 0),
    };
  }).filter((m) => m.items.length > 0);

  // ── 近 7 天趋势 ───────────────────────────────────────
  const trend = useMemo(() => {
    const out: { date: string; protein: number; calories: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(store.today);
      d.setDate(d.getDate() - i);
      const k = toKey(d);
      const day = logs.filter((l) => l.date === k);
      out.push({
        date: k,
        protein: day.reduce((s, l) => s + (l.protein ?? 0), 0),
        calories: day.reduce((s, l) => s + (l.calories ?? 0), 0),
      });
    }
    return out;
  }, [logs, store.today]);
  const maxTrend = Math.max(target, ...trend.map((t) => t.protein), 1);

  // ── 历史（非今天），按日期倒序 ────────────────────────
  const history = useMemo(
    () =>
      logs
        .map((l, idx) => ({ log: l, idx }))
        .filter((x) => x.log.date !== todayKey)
        .sort((a, b) => b.log.date.localeCompare(a.log.date)),
    [logs, todayKey]
  );
  const historyDays = useMemo(() => {
    const map = new Map<string, { log: DietLog; idx: number }[]>();
    for (const x of history) {
      if (!map.has(x.log.date)) map.set(x.log.date, []);
      map.get(x.log.date)!.push(x);
    }
    return [...map.entries()];
  }, [history]);
  const shownDays = showAllHistory ? historyDays : historyDays.slice(0, 7);

  // ── 食物库筛选 ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list: FoodItem[] = FOODS;
    if (cat !== '全部') list = list.filter((f) => f.category === cat);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (f) => f.name.toLowerCase().includes(s) || (f.alias ?? []).some((a) => a.toLowerCase().includes(s))
      );
    }
    return list;
  }, [q, cat]);

  // ── 待保存的合计 ──────────────────────────────────────
  const pickedProtein = picked.reduce((s, i) => s + i.protein, 0);
  const pickedCalories = picked.reduce((s, i) => s + i.calories, 0);

  const addFood = (f: FoodItem, qty = 1) => {
    setPicked((prev) => {
      const idx = prev.findIndex((p) => p.foodId === f.id);
      if (idx >= 0) {
        const next = [...prev];
        const cur = next[idx];
        const q = cur.qty + qty;
        next[idx] = {
          ...cur,
          qty: q,
          protein: Math.round(f.protein * q * 10) / 10,
          calories: Math.round(f.calories * q),
        };
        return next;
      }
      return [
        ...prev,
        { foodId: f.id, name: f.name, qty, protein: Math.round(f.protein * qty * 10) / 10, calories: Math.round(f.calories * qty) },
      ];
    });
  };

  const changeQty = (i: number, delta: number) => {
    setPicked((prev) => {
      const next = [...prev];
      const it = next[i];
      const food = it.foodId ? foodById(it.foodId) : undefined;
      const qty = Math.max(0.5, Math.round((it.qty + delta) * 2) / 2);
      next[i] = {
        ...it,
        qty,
        protein: food ? Math.round(food.protein * qty * 10) / 10 : it.protein,
        calories: food ? Math.round(food.calories * qty) : it.calories,
      };
      return next;
    });
  };

  /** 把文字描述识别成食物并加入清单 */
  const recognizeText = () => {
    if (!text.trim()) return;
    const r = analyzeText(text);
    const hit = r.matches.filter((m) => m.food);
    if (!hit.length) {
      setMsg('没识别出具体食物，可以直接点下面的食物库，或换个说法试试');
      return;
    }
    setPicked((prev) => {
      const next = [...prev];
      for (const m of hit) {
        const f = m.food!;
        const idx = next.findIndex((p) => p.foodId === f.id);
        if (idx >= 0) {
          const cur = next[idx];
          const qty = cur.qty + m.qty;
          next[idx] = { ...cur, qty, protein: Math.round(f.protein * qty * 10) / 10, calories: Math.round(f.calories * qty) };
        } else {
          next.push({ foodId: f.id, name: f.name, qty: m.qty, protein: m.protein, calories: m.calories });
        }
      }
      return next;
    });
    const miss = r.matches.filter((m) => !m.food).map((m) => m.token);
    setMsg(
      `识别出 ${hit.length} 项，合计 ${r.totalProtein}g 蛋白${miss.length ? `；未识别：${miss.join('、')}` : ''}`
    );
    setText('');
  };

  /** 手动记一笔：手填了蛋白/热量就用填的，否则按描述在食物库自动算 */
  const addManual = () => {
    if (!mText.trim()) return;
    const auto = analyzeText(mText);
    const useAuto = !mProtein && !mCalories && auto.matches.some((m) => m.food);
    const entry: DietLog = {
      date: todayKey,
      meal,
      text: mText.trim(),
      protein: mProtein ? Number(mProtein) : useAuto ? auto.totalProtein : undefined,
      calories: mCalories ? Number(mCalories) : useAuto ? auto.totalCalories : undefined,
      items: useAuto
        ? auto.matches
            .filter((m) => m.food)
            .map((m) => ({
              foodId: m.food!.id,
              name: m.food!.name,
              qty: m.qty,
              protein: m.protein,
              calories: m.calories,
            }))
        : undefined,
    };
    store.setDiet([...logs, entry]);
    if (useAuto) {
      const miss = auto.matches.filter((m) => !m.food).map((m) => m.token);
      setMsg(
        `已按食物库自动计算：${auto.totalProtein}g 蛋白 / ${auto.totalCalories} kcal` +
          (miss.length ? `（未识别：${miss.join('、')}，可在下面食物库点选补充）` : '')
      );
    } else {
      setMsg(`已记录${meal}：${mText.trim()}`);
    }
    setMText(''); setMProtein(''); setMCalories('');
  };

  /** 选照片：桌面端拷进 data/photos；浏览器退回内联 base64 */
  const choosePhoto = async () => {
    setMsg('');
    const d = window.desktop;
    if (d?.photo) {
      setBusy(true);
      const r = await d.photo.pick(todayKey);
      setBusy(false);
      if (r.ok && r.files?.length) {
        // 一张记录对应一张照片，多选时取第一张，其余也存下来但只挂第一张
        setPhoto(r.files[0].relPath);
        setMsg(r.files.length > 1 ? `已保存 ${r.files.length} 张照片，本餐关联第 1 张` : '照片已保存到 data/photos');
      } else if (!r.canceled) {
        setMsg(r.error ?? '选图失败');
      }
      return;
    }
    // 浏览器预览模式
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => setPhoto(String(fr.result));
      fr.readAsDataURL(f);
    };
    input.click();
  };

  const save = () => {
    if (!picked.length && !text.trim() && !photo) {
      setMsg('至少选一个食物、写一句描述或加一张照片');
      return;
    }
    const items = picked.length
      ? picked
      : analyzeText(text)
          .matches.filter((m) => m.food)
          .map((m) => ({
            foodId: m.food!.id, name: m.food!.name, qty: m.qty, protein: m.protein, calories: m.calories,
          }));
    const protein = items.reduce((s, i) => s + i.protein, 0);
    const calories = items.reduce((s, i) => s + i.calories, 0);
    const desc = picked.length
      ? picked.map((p) => `${p.name}×${p.qty}`).join(' + ')
      : text.trim() || (photo ? '（仅照片）' : '');

    const entry: DietLog = {
      date: todayKey,
      meal,
      text: desc,
      protein: Math.round(protein),
      calories: Math.round(calories),
      photo,
      items: items.length ? items : undefined,
    };

    store.setDiet([...logs, entry]);
    setPicked([]);
    setText('');
    setPhoto(undefined);
    setMsg(`已记录${meal}：${Math.round(protein)}g 蛋白 / ${Math.round(calories)} kcal`);
  };

  /** 套用内置套餐模板 */
  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setMeal(t.meal);
    const items: DietItem[] = [];
    for (const fid of t.items) {
      const f = foodById(fid);
      if (f) items.push({ foodId: f.id, name: f.name, qty: 1, protein: f.protein, calories: f.calories });
    }
    setPicked(items);
    setMsg(`已套用「${t.name}」，确认无误后点保存`);
  };

  /** 套用自己存过的套餐 */
  const applySaved = (id: string) => {
    const t = store.templates.find((x) => x.id === id);
    if (!t) return;
    setMeal(t.meal);
    setPicked(t.items.map((i) => ({ ...i })));
    setMsg(`已套用「${t.name}」`);
  };

  const commitTemplate = () => {
    const name = tplName.trim() || `${meal}套餐`;
    store.setTemplates([...store.templates, { id: uid(), name, meal, items: picked.map((p) => ({ ...p })) }]);
    setSaveTpl(false);
    setTplName('');
    setMsg(`已存为套餐「${name}」，下次一键复用`);
  };

  /** 按下标删除（下标来自原始 diet 数组，可靠且不受排序影响） */
  const deleteAt = (idx: number) => store.setDiet(logs.filter((_, i) => i !== idx));

  const openPhoto = async (rel: string) => {
    const d = window.desktop;
    if (d?.photo) {
      const r = await d.photo.read(rel);
      if (r.ok && r.dataUrl) setPreview(r.dataUrl);
      else setMsg(r.error ?? '打不开照片');
      return;
    }
    setPreview(rel);
  };

  return (
    <div className="space-y-4">
      {overQuota && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <span>⚠️ 饮食照片已占用 {(photoUsage.bytes / 1048576).toFixed(1)} MB，超过设定上限{' '}
            {(quotaBytes / 1048576).toFixed(0)} MB。可到设置里调高上限，或打开照片文件夹清理旧照片。</span>
          {window.desktop?.photo && (
            <button onClick={() => window.desktop!.photo.openDir()} className="ml-auto shrink-0 underline">
              打开文件夹
            </button>
          )}
        </div>
      )}

      {/* ── 今日概览 ─────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="今日蛋白质" icon={Flame} tone={todayProtein >= target ? 'emerald' : 'amber'}>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'text-3xl font-semibold tnum',
              todayProtein >= target ? 'text-emerald-400' : 'text-amber-400'
            )}>
              {Math.round(todayProtein)}
            </span>
            <span className="text-sm text-slate-400">/ {target} g</span>
          </div>
          <div className="mt-2.5">
            <Bar value={todayProtein} max={target} tone={todayProtein >= target ? 'emerald' : 'amber'} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {todayProtein >= target
              ? '已达标，保持住 ✅'
              : `还差 ${Math.round(target - todayProtein)} g，约等于 ${Math.ceil((target - todayProtein) / 6.5)} 个鸡蛋`}
          </p>
        </Panel>

        <Panel title="今日热量" icon={Utensils} tone="amber">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tnum text-[var(--text-1)]">{Math.round(todayCalories)}</span>
            <span className="text-sm text-slate-400">/ {calorieTarget} kcal</span>
          </div>
          <div className="mt-2.5">
            <Bar value={todayCalories} max={calorieTarget} tone="amber" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {todayCalories === 0
              ? '吃够比吃少重要'
              : todayCalories < calorieTarget
                ? `还差 ${calorieTarget - Math.round(todayCalories)} kcal`
                : '已达标'}
            <span className="text-slate-600"> · 共 {todayLogs.length} 笔</span>
          </p>
        </Panel>

        <Panel title="近 7 天蛋白" icon={TrendingUp} tone="sky">
          {trend.every((t) => t.protein === 0) ? (
            <Empty icon={TrendingUp} className="py-4">
              最近 7 天还没有记录，记满几天就能看到趋势了
            </Empty>
          ) : (
            <div className="flex h-16 items-end gap-1">
              {trend.map((t) => (
                <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-full rounded-sm transition-colors',
                      t.protein === 0
                        ? 'bg-[var(--border-2)]'
                        : t.protein >= target
                          ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                          : 'bg-gradient-to-t from-amber-600/70 to-amber-400/80'
                    )}
                    style={{ height: `${Math.max(4, (t.protein / maxTrend) * 52)}px` }}
                    title={`${t.date}：${Math.round(t.protein)}g 蛋白 / ${Math.round(t.calories)} kcal`}
                  />
                  <span className="text-[10px] text-slate-500 tnum">{t.date.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            目标按最近一次体重 {latestWeight ?? '—'} kg 推算：蛋白 {target} g
            （{store.settings.proteinFactor} g/kg）、热量 {calorieTarget} kcal。
          </p>
        </Panel>
      </div>

      {/* ── 手动记一笔 ───────────────────────────────── */}
      <Panel title="快速记一笔" icon={Plus}>
        <div className="flex flex-wrap gap-2">
          <select value={meal} onChange={(e) => setMeal(e.target.value)} className={cn(inputCls, 'w-24')}>
            {MEALS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input
            className={cn(inputCls, 'flex-1 min-w-[12rem]')}
            value={mText}
            onChange={(e) => setMText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManual()}
            placeholder="吃了什么，如：烤鸡腿 + 麻婆豆腐 + 米饭二两"
          />
          <input
            className={cn(inputCls, 'w-28')}
            value={mProtein}
            onChange={(e) => setMProtein(e.target.value)}
            placeholder="蛋白 g（可空）"
            inputMode="numeric"
          />
          <input
            className={cn(inputCls, 'w-32')}
            value={mCalories}
            onChange={(e) => setMCalories(e.target.value)}
            placeholder="热量 kcal（可空）"
            inputMode="numeric"
          />
          <button onClick={addManual} className={btnPrimary}>记一笔</button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          蛋白与热量留空时，会按上面这句话在食物库里自动识别并计算；填了数字就以你填的为准。
        </p>
      </Panel>

      {/* ── 记录一餐（点选 / 拍照）───────────────────── */}
      <Panel
        title={`记录一餐 · ${todayKey}`}
        icon={Camera}
        action={
          <div className="flex gap-1">
            {MEALS.map((m) => (
              <button
                key={m}
                onClick={() => setMeal(m)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  meal === m
                    ? 'bg-emerald-600 text-white font-medium'
                    : 'bg-[var(--surface-3)] text-slate-400 hover:bg-[var(--surface-4)] hover:text-[var(--text-1)]'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        }
      >
        <div className="space-y-3">
          {/* 拍照 */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={choosePhoto} disabled={busy} className={btnPrimary}>
              <Camera className="w-4 h-4" /> {busy ? '保存中…' : photo ? '换一张照片' : '选照片 / 拍照'}
            </button>
            {photo && (
              <>
                <button onClick={() => openPhoto(photo)} className={btnGhost}>查看</button>
                <button onClick={() => setPhoto(undefined)} className={btnGhost}>移除</button>
                <span className="text-xs text-slate-500">已关联照片</span>
              </>
            )}
            {window.desktop?.photo && (
              <button
                onClick={() => window.desktop!.photo.openDir()}
                className="ml-auto text-xs text-slate-500 hover:text-[var(--text-2)] transition-colors"
              >
                打开照片文件夹
              </button>
            )}
          </div>

          {/* 文字识别 */}
          <Field label="或者：描述一下吃了什么（自动识别营养）">
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && recognizeText()}
                placeholder="例：鸡腿 + 麻婆豆腐 + 米饭二两 + 2个鸡蛋"
              />
              <button onClick={recognizeText} className={btnGhost}>
                <Sparkles className="w-4 h-4" /> 识别
              </button>
            </div>
          </Field>

          {/* 快速套餐 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">快捷套餐：</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className="rounded-full border border-[var(--border-3)] bg-[var(--surface-3)] px-2.5 py-1 text-xs text-[var(--text-2)] hover:border-emerald-500/60 hover:text-emerald-300 transition-colors"
              >
                {t.name}
              </button>
            ))}
            {store.templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applySaved(t.id)}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:border-emerald-400 transition-colors"
                title="我自己存的套餐"
              >
                ★ {t.name}
              </button>
            ))}
          </div>

          {/* 待保存清单 */}
          {picked.length > 0 && (
            <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-2)]">本餐清单</span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {Math.round(pickedProtein)}g 蛋白 · {Math.round(pickedCalories)} kcal
                </span>
              </div>
              <div className="space-y-1">
                {picked.map((p, i) => (
                  <div key={`${p.foodId}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-[var(--text-2)] truncate">{p.name}</span>
                    <button
                      onClick={() => changeQty(i, -0.5)}
                      className="h-6 w-6 rounded-md bg-[var(--surface-4)] text-slate-400 hover:text-[var(--text-1)] transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xs tabular-nums text-[var(--text-2)]">{p.qty}</span>
                    <button
                      onClick={() => changeQty(i, 0.5)}
                      className="h-6 w-6 rounded-md bg-[var(--surface-4)] text-slate-400 hover:text-[var(--text-1)] transition-colors"
                    >
                      +
                    </button>
                    <span className="w-16 text-right text-xs tabular-nums text-slate-400">
                      {Math.round(p.protein)}g
                    </span>
                    <IconButton onClick={() => setPicked(picked.filter((_, idx) => idx !== i))} title="移除" tone="rose">
                      <X className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 保存 */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} className={btnPrimary}>
              保存{meal}记录
            </button>
            {picked.length > 0 && (
              <>
                <button onClick={() => setPicked([])} className={btnGhost}>清空清单</button>
                {saveTpl ? (
                  <span className="flex items-center gap-1">
                    <input
                      className={cn(inputCls, 'w-36 h-8')}
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="套餐名字"
                      autoFocus
                    />
                    <button onClick={commitTemplate} className={btnGhost}>确定</button>
                    <button onClick={() => setSaveTpl(false)} className={btnGhost}>取消</button>
                  </span>
                ) : (
                  <button onClick={() => setSaveTpl(true)} className={btnGhost}>存为我的套餐</button>
                )}
              </>
            )}
            {msg && <span className="text-xs text-emerald-400">{msg}</span>}
          </div>
        </div>
      </Panel>

      {/* ── 食物库 ───────────────────────────────────── */}
      <Panel
        title={`食物库 · 点一下加入本餐（${FOODS.length} 种）`}
        icon={Search}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className={cn(inputCls, 'max-w-56')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜食物，如 鸡、豆腐、米饭"
          />
          <div className="flex flex-wrap gap-1">
            {['全部', ...CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs transition-colors',
                  cat === c
                    ? 'bg-emerald-600 text-white font-medium'
                    : 'bg-[var(--surface-3)] text-slate-400 hover:bg-[var(--surface-4)] hover:text-[var(--text-1)]'
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
            {filtered.length} 项
          </span>
        </div>
        <div className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto pr-1 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => addFood(f)}
              className="group rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] p-2.5 text-left transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10"
            >
              <div className="truncate text-sm font-medium text-[var(--text-1)]">{f.name}</div>
              <div className="truncate text-[11px] text-slate-500">{f.unit}</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-emerald-400">
                {f.protein}g 蛋白 · {f.calories} kcal
              </div>
            </button>
          ))}
          {!filtered.length && (
            <p className="col-span-full py-4 text-center text-sm text-slate-500">
              没找到，换个词试试 —— 食物库覆盖 {FOODS.length} 种常见食堂/外卖食物
            </p>
          )}
        </div>
      </Panel>

      {/* ── 今日明细（按餐次分组）────────────────────── */}
      <Panel title={`今日已记录（${todayLogs.length} 笔）`} icon={Utensils}>
        {mealSummary.length === 0 ? (
          <Empty>今天还没有饮食记录，用上面任意一种方式记一笔吧</Empty>
        ) : (
          <div className="space-y-3">
            {mealSummary.map((m) => (
              <div key={m.meal} className="rounded-xl bg-[var(--surface-2)] border border-[var(--border-2)] px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-2)] flex items-center gap-1.5">
                    <Chip>{m.meal}</Chip>
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {m.protein > 0 && <span className="text-emerald-400 font-semibold">{Math.round(m.protein)}g 蛋白</span>}
                    {m.protein > 0 && m.calories > 0 && ' · '}
                    {m.calories > 0 && <span className="text-amber-400 font-semibold">{Math.round(m.calories)} kcal</span>}
                  </span>
                </div>
                <div className="space-y-1 mt-2">
                  {m.items.map(({ log: d, idx }) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs">
                      {d.photo && (
                        <button onClick={() => openPhoto(d.photo!)} className="shrink-0" title="点击查看照片">
                          <PhotoThumb rel={d.photo} />
                        </button>
                      )}
                      <span className="flex-1 text-[var(--text-2)] truncate">{d.text}</span>
                      {d.protein ? <span className="text-emerald-400 shrink-0 tabular-nums">{Math.round(d.protein)}g</span> : null}
                      {d.calories ? <span className="text-amber-400 shrink-0 tabular-nums">{Math.round(d.calories)}kcal</span> : null}
                      <IconButton onClick={() => deleteAt(idx)} title="删除这条记录" tone="rose">
                        <Trash2 className="w-3 h-3" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── 历史记录 ─────────────────────────────────── */}
      {historyDays.length > 0 && (
        <Panel
          title={`历史记录（${history.length} 笔 / ${historyDays.length} 天）`}
          icon={ChevronDown}
          action={
            historyDays.length > 7 ? (
              <button
                onClick={() => setShowAllHistory((v) => !v)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
              >
                {showAllHistory ? <>收起 <ChevronUp className="w-3 h-3" /></> : <>查看全部 <ChevronDown className="w-3 h-3" /></>}
              </button>
            ) : undefined
          }
        >
          <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
            {shownDays.map(([date, items]) => {
              const dayProtein = items.reduce((s, x) => s + (x.log.protein ?? 0), 0);
              const dayCalories = items.reduce((s, x) => s + (x.log.calories ?? 0), 0);
              return (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-[var(--text-2)] tabular-nums">{date}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {Math.round(dayProtein)}g 蛋白 · {Math.round(dayCalories)} kcal
                    </span>
                    <span className="flex-1 h-px bg-[var(--border-1)]" />
                    {dayProtein >= target && <Chip tone="emerald">达标</Chip>}
                  </div>
                  <div className="space-y-1">
                    {items
                      .sort((a, b) => mealOrder(a.log.meal) - mealOrder(b.log.meal))
                      .map(({ log: d, idx }) => (
                        <div key={idx} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                          {d.photo && (
                            <button onClick={() => openPhoto(d.photo!)} className="shrink-0" title="点击查看照片">
                              <PhotoThumb rel={d.photo} />
                            </button>
                          )}
                          <span className="text-slate-500 shrink-0 w-10">{d.meal}</span>
                          <span className="flex-1 text-[var(--text-2)] truncate">{d.text}</span>
                          {d.protein ? <span className="text-emerald-400 shrink-0 tabular-nums">{Math.round(d.protein)}g</span> : null}
                          {d.calories ? <span className="text-amber-400 shrink-0 tabular-nums">{Math.round(d.calories)}kcal</span> : null}
                          <IconButton onClick={() => deleteAt(idx)} title="删除这条记录" tone="rose">
                            <Trash2 className="w-3 h-3" />
                          </IconButton>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* 照片预览弹层 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          onClick={() => setPreview('')}
        >
          <img src={preview} alt="饮食照片" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

/** 缩略图：桌面端按需从磁盘读，浏览器直接用 dataURL */
function PhotoThumb({ rel }: { rel: string }) {
  // 浏览器预览模式（没有桌面桥）时 rel 本身就是可直接用的地址，
  // 可以同步拿到初始值，不必先渲染一帧占位再 setState。
  const viaBridge = Boolean(window.desktop?.photo);
  const [src, setSrc] = useState(viaBridge ? '' : rel);

  useEffect(() => {
    if (!viaBridge) return;
    let alive = true;
    window.desktop!.photo.read(rel).then((r) => {
      // 回调里 setState 属于异步数据回流，不是级联渲染
      if (alive && r.ok && r.dataUrl) setSrc(r.dataUrl);
    });
    return () => { alive = false; };
  }, [rel, viaBridge]);

  if (!src) return <div className="h-12 w-12 animate-pulse rounded bg-[var(--surface-4)]" />;
  return <img src={src} alt="" className="h-12 w-12 rounded object-cover" />;
}
