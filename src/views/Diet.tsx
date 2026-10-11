// 饮食记录：拍照存档 + 食物库点选 + 文字识别 + 套餐复用
import { useMemo, useState } from 'react';
import { useStore, uid } from '@/store/store';
import type { DietItem, DietLog } from '@/store/store';
import { CATEGORIES, FOODS, TEMPLATES, analyzeText, foodById } from '@/data/foods';
import type { FoodItem } from '@/data/foods';
import { Panel, Empty, Bar, Chip, IconButton, Field, inputCls, btnPrimary, btnGhost } from '@/components/Panel';
import { toKey } from '@/lib/storage';

const MEALS = ['早餐', '午餐', '晚餐', '加餐'] as const;

/** 一天里各餐次的默认顺序 */
const mealOrder = (m: string) => {
  const i = MEALS.indexOf(m as (typeof MEALS)[number]);
  return i < 0 ? 99 : i;
};

export default function Diet() {
  const store = useStore();
  const todayKey = store.todayKey;

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

  useMemo(() => {
    window.desktop?.photo?.usage().then(setPhotoUsage).catch(() => {});
  }, []);
  const quotaBytes = (store.settings.photoQuotaMB || 500) * 1048576;
  const overQuota = photoUsage.bytes > quotaBytes;

  // ── 已有记录 ──────────────────────────────────────────
  const logs = store.diet;
  const todayLogs = useMemo(
    () => logs.filter((l) => l.date === todayKey).sort((a, b) => mealOrder(a.meal) - mealOrder(b.meal)),
    [logs, todayKey]
  );
  const todayProtein = todayLogs.reduce((s, l) => s + (l.protein ?? 0), 0);
  const todayCalories = todayLogs.reduce((s, l) => s + (l.calories ?? 0), 0);
  const target = store.proteinTarget;

  // 近 7 天趋势
  const trend = useMemo(() => {
    const out: { date: string; protein: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(store.today);
      d.setDate(d.getDate() - i);
      const k = toKey(d);
      out.push({ date: k, protein: logs.filter((l) => l.date === k).reduce((s, l) => s + (l.protein ?? 0), 0) });
    }
    return out;
  }, [logs, store.today]);
  const maxTrend = Math.max(target, ...trend.map((t) => t.protein), 1);

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
        next[idx] = {
          ...cur,
          qty: cur.qty + qty,
          protein: Math.round(f.protein * (cur.qty + qty) * 10) / 10,
          calories: Math.round(f.calories * (cur.qty + qty)),
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

  const save = async () => {
    if (!picked.length && !text.trim() && !photo) {
      setMsg('至少选一个食物、写一句描述或加一张照片');
      return;
    }
    const items = picked.length ? picked : analyzeText(text).matches.filter((m) => m.food).map((m) => ({
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

  const useTemplate = (id: string) => {
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

  const useSaved = (id: string) => {
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

  const deleteLog = (target: DietLog) => {
    store.setDiet(logs.filter((l) => l !== target));
  };

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
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>⚠️ 饮食照片已占用 {(photoUsage.bytes / 1048576).toFixed(1)} MB，超过设定上限{' '}
            {(quotaBytes / 1048576).toFixed(0)} MB。可到设置里调高上限，或打开照片文件夹清理旧照片。</span>
          {window.desktop?.photo && (
            <button onClick={() => window.desktop!.photo.openDir()} className="ml-auto shrink-0 underline">
              打开文件夹
            </button>
          )}
        </div>
      )}
      {/* 今日概览 */}
      <div className="grid grid-cols-3 gap-3">
        <Panel title="今日蛋白质">
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-semibold tabular-nums ${todayProtein >= target ? 'text-emerald-600' : 'text-amber-600'}`}>
              {Math.round(todayProtein)}
            </span>
            <span className="text-sm text-slate-400">/ {target} g</span>
          </div>
          <Bar value={todayProtein} max={target} />
          <p className="mt-1 text-xs text-slate-500">
            {todayProtein >= target ? '已达标，保持住' : `还差 ${Math.round(target - todayProtein)} g`}
          </p>
        </Panel>
        <Panel title="今日热量">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tabular-nums text-slate-700">{Math.round(todayCalories)}</span>
            <span className="text-sm text-slate-400">kcal</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">共 {todayLogs.length} 餐记录</p>
        </Panel>
        <Panel title="近 7 天蛋白">
          <div className="flex h-16 items-end gap-1">
            {trend.map((t) => (
              <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-sm ${t.protein >= target ? 'bg-emerald-400' : 'bg-amber-300'}`}
                  style={{ height: `${Math.max(3, (t.protein / maxTrend) * 52)}px` }}
                  title={`${t.date}：${Math.round(t.protein)}g`}
                />
                <span className="text-[10px] text-slate-400">{t.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 记录区 */}
      <Panel
        title={`记录一餐 · ${todayKey}`}
        action={
          <div className="flex gap-1">
            {MEALS.map((m) => (
              <button
                key={m}
                onClick={() => setMeal(m)}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  meal === m ? 'bg-emerald-600 text-white' : 'bg-[var(--border-1)] text-slate-400 hover:bg-[var(--border-2)] hover:text-[var(--text-1)]'
                }`}
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
              📷 {busy ? '保存中…' : photo ? '换一张照片' : '选照片 / 拍照'}
            </button>
            {photo && (
              <>
                <button onClick={() => openPhoto(photo)} className={btnGhost}>
                  查看
                </button>
                <button onClick={() => setPhoto(undefined)} className={btnGhost}>
                  移除
                </button>
                <span className="text-xs text-slate-500">已关联照片</span>
              </>
            )}
            {window.desktop?.photo && (
              <button onClick={() => window.desktop!.photo.openDir()} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
                打开照片文件夹
              </button>
            )}
          </div>

          {/* 文字识别 */}
          <div>
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
                  识别
                </button>
              </div>
            </Field>
          </div>

          {/* 快速套餐 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">快捷套餐：</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => useTemplate(t.id)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400 hover:bg-slate-50"
              >
                {t.name}
              </button>
            ))}
            {store.templates.map((t) => (
              <button
                key={t.id}
                onClick={() => useSaved(t.id)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 hover:border-emerald-400"
                title="我自己存的套餐"
              >
                ★ {t.name}
              </button>
            ))}
          </div>

          {/* 待保存清单 */}
          {picked.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">本餐清单</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {Math.round(pickedProtein)}g 蛋白 · {Math.round(pickedCalories)} kcal
                </span>
              </div>
              <div className="space-y-1">
                {picked.map((p, i) => (
                  <div key={`${p.foodId}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-700">{p.name}</span>
                    <button onClick={() => changeQty(i, -0.5)} className="h-5 w-5 rounded bg-white text-slate-500 hover:bg-slate-200">
                      −
                    </button>
                    <span className="w-8 text-center text-xs tabular-nums text-slate-600">{p.qty}</span>
                    <button onClick={() => changeQty(i, 0.5)} className="h-5 w-5 rounded bg-white text-slate-500 hover:bg-slate-200">
                      +
                    </button>
                    <span className="w-16 text-right text-xs tabular-nums text-slate-500">{Math.round(p.protein)}g</span>
                    <IconButton onClick={() => setPicked(picked.filter((_, idx) => idx !== i))} title="移除">
                      ×
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
                <button onClick={() => setPicked([])} className={btnGhost}>
                  清空清单
                </button>
                {saveTpl ? (
                  <span className="flex items-center gap-1">
                    <input
                      className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="套餐名字"
                      autoFocus
                    />
                    <button onClick={commitTemplate} className={btnGhost}>
                      确定
                    </button>
                    <button onClick={() => setSaveTpl(false)} className={btnGhost}>
                      取消
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setSaveTpl(true)} className={btnGhost}>
                    存为我的套餐
                  </button>
                )}
              </>
            )}
            {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          </div>
        </div>
      </Panel>

      {/* 食物库 */}
      <Panel title="食物库 · 点一下加入本餐">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} max-w-56`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜食物，如 鸡、豆腐、米饭"
          />
          <div className="flex flex-wrap gap-1">
            {['全部', ...CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  cat === c
                    ? 'bg-emerald-500 text-white font-medium'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => addFood(f)}
              className="group rounded-lg border border-slate-200 p-2 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
            >
              <div className="truncate text-sm font-medium text-slate-700">{f.name}</div>
              <div className="truncate text-[11px] text-slate-400">{f.unit}</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-emerald-600">
                {f.protein}g 蛋白 · {f.calories} kcal
              </div>
            </button>
          ))}
          {!filtered.length && <p className="col-span-full py-4 text-center text-sm text-slate-400">没找到，换个词试试</p>}
        </div>
      </Panel>

      {/* 今日已记录 */}
      <Panel title={`今日已记录（${todayLogs.length}）`}>
        {todayLogs.length === 0 ? (
          <Empty>今天还没有饮食记录</Empty>
        ) : (
          <div className="space-y-2">
            {todayLogs.map((l, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-2">
                {l.photo && (
                  <button onClick={() => openPhoto(l.photo!)} className="shrink-0" title="点击查看照片">
                    <PhotoThumb rel={l.photo} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Chip>{l.meal}</Chip>
                    <span className="text-xs tabular-nums text-slate-500">
                      {Math.round(l.protein ?? 0)}g 蛋白 · {Math.round(l.calories ?? 0)} kcal
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-700">{l.text}</p>
                </div>
                <IconButton onClick={() => deleteLog(l)} title="删除这条记录">
                  ×
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* 照片预览弹层 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview('')}
        >
          <img src={preview} alt="饮食照片" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

/** 缩略图：桌面端按需从磁盘读，浏览器直接用 dataURL */
function PhotoThumb({ rel }: { rel: string }) {
  const [src, setSrc] = useState('');
  useMemo(() => {
    const d = window.desktop;
    if (d?.photo) {
      d.photo.read(rel).then((r) => {
        if (r.ok && r.dataUrl) setSrc(r.dataUrl);
      });
    } else {
      setSrc(rel);
    }
  }, [rel]);
  if (!src) return <div className="h-12 w-12 animate-pulse rounded bg-slate-200" />;
  return <img src={src} alt="" className="h-12 w-12 rounded object-cover" />;
}
