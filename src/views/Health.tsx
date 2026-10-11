// 健康饮食：身体数据、体重曲线、训练打卡、饮食与蛋白质/热量追踪
import { useEffect, useState } from 'react';
import { useStore, type HealthLog } from '@/store/store';
import { Panel, Empty, Bar, IconButton, inputCls, btnPrimary } from '@/components/Panel';
import { isDesktop, seedDietOnce, fromKey, addDays } from '@/lib/storage';
import { analyzeText } from '@/data/foods';
import {
  Scale, Moon, Footprints, Dumbbell, Pencil, Trash2, X, Apple, Utensils,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MEALS = ['早餐', '午餐', '晚餐', '加餐'];

function WeightChart({ logs }: { logs: HealthLog[] }) {
  const points = [...logs]
    .filter((l) => l.weight)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  if (points.length < 2) {
    return <p className="text-xs text-slate-400 py-6 text-center">至少记录 2 天体重后，这里会出现体重曲线</p>;
  }
  const W = 560, H = 140, PAD = 26;
  const ws = points.map((p) => p.weight!);
  const min = Math.min(...ws) - 0.5;
  const max = Math.max(...ws) + 0.5;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.weight!)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polyline points={line} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.weight!)} r="3.5" fill="#10b981" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-4)">{p.date.slice(5)}</text>
          <text x={x(i)} y={y(p.weight!) - 8} textAnchor="middle" fontSize="9" fill="#34d399">{p.weight}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Health() {
  const store = useStore();
  const { health: logs, setHealth: setLogs, diet, setDiet, dietSeed, setDietSeed, settings, today, todayKey } = store;

  // 目标统一走 store：蛋白质按最近一次体重 × 系数推算（与「饮食记录」页保持一致），
  // 热量目标默认 2400，有体重时按 38 kcal/kg 估算需求。
  const proteinTarget = store.proteinTarget;
  const latestWeightForTarget = [...logs]
    .filter((l) => typeof l.weight === 'number' && l.weight! > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weight;
  const calorieTarget = latestWeightForTarget
    ? Math.round((latestWeightForTarget * 38) / 50) * 50
    : 2400;

  const [weight, setWeight] = useState('');
  const [sleep, setSleep] = useState('');
  const [steps, setSteps] = useState('');
  const [editDate, setEditDate] = useState<string | null>(null);
  const [eWeight, setEWeight] = useState('');
  const [eSleep, setESleep] = useState('');
  const [eSteps, setESteps] = useState('');
  const [meal, setMeal] = useState('午餐');
  const [dText, setDText] = useState('');
  const [dProtein, setDProtein] = useState('');
  const [dCalories, setDCalories] = useState('');
  const [seedMsg, setSeedMsg] = useState('');

  // 空白模板下没有预置饮食记录；保留 seedDietOnce 机制以便将来按需预置。
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await seedDietOnce(diet, dietSeed);
      if (!alive) return;
      if (r.merged > 0) {
        setDiet(r.diet);
        setDietSeed(r.seed);
        setSeedMsg(`已合入 ${r.merged} 条预置饮食记录`);
      }
    })();
    return () => { alive = false; };
  }, [diet, dietSeed, setDiet, setDietSeed]);

  const addDiet = () => {
    if (!dText.trim()) return;
    // 没手填数字时，用食物库按描述自动算；手填了就以手填为准
    const auto = analyzeText(dText);
    const useAuto = !dProtein && !dCalories && auto.matches.some((m) => m.food);
    setDiet([
      ...diet,
      {
        date: todayKey,
        meal,
        text: dText.trim(),
        protein: dProtein ? Number(dProtein) : useAuto ? auto.totalProtein : undefined,
        calories: dCalories ? Number(dCalories) : useAuto ? auto.totalCalories : undefined,
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
      },
    ]);
    if (useAuto) {
      const miss = auto.matches.filter((m) => !m.food).map((m) => m.token);
      setSeedMsg(
        `已按食物库自动计算：${auto.totalProtein}g 蛋白 / ${auto.totalCalories} kcal` +
          (miss.length ? `（未识别：${miss.join('、')}，可去「饮食记录」页点选补充）` : '')
      );
    }
    setDText(''); setDProtein(''); setDCalories('');
  };

  const removeDiet = (idx: number) => setDiet(diet.filter((_, i) => i !== idx));

  const todayDiet = diet.filter((d) => d.date === todayKey);
  const todayProtein = todayDiet.reduce((s, d) => s + (d.protein ?? 0), 0);
  const todayCalories = todayDiet.reduce((s, d) => s + (d.calories ?? 0), 0);

  const mealSummary = MEALS
    .map((m) => ({
      meal: m,
      items: todayDiet.filter((d) => d.meal === m),
      protein: todayDiet.filter((d) => d.meal === m).reduce((s, d) => s + (d.protein ?? 0), 0),
      calories: todayDiet.filter((d) => d.meal === m).reduce((s, d) => s + (d.calories ?? 0), 0),
    }))
    .filter((m) => m.items.length > 0);

  const save = () => {
    if (!weight && !sleep && !steps) return;
    const rest = logs.filter((l) => l.date !== todayKey);
    const prev = logs.find((l) => l.date === todayKey) ?? { date: todayKey };
    setLogs([
      ...rest,
      {
        date: todayKey,
        weight: weight ? Number(weight) : prev.weight,
        sleep: sleep ? Number(sleep) : prev.sleep,
        steps: steps ? Number(steps) : prev.steps,
      },
    ]);
    setWeight(''); setSleep(''); setSteps('');
  };

  const startEdit = (l: HealthLog) => {
    setEditDate(l.date);
    setEWeight(l.weight?.toString() ?? '');
    setESleep(l.sleep?.toString() ?? '');
    setESteps(l.steps?.toString() ?? '');
  };

  const saveEdit = () => {
    if (!editDate) return;
    setLogs(logs.map((l) => l.date === editDate ? {
      date: l.date,
      weight: eWeight ? Number(eWeight) : undefined,
      sleep: eSleep ? Number(eSleep) : undefined,
      steps: eSteps ? Number(eSteps) : undefined,
    } : l));
    setEditDate(null);
  };

  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sortedLogs[0];

  const weekLogs = logs.filter((l) => {
    const d = fromKey(l.date);
    return d >= addDays(today, -6);
  });
  const sleepVals = weekLogs.filter((l) => l.sleep);
  const avgSleep = sleepVals.length
    ? (sleepVals.reduce((s, l) => s + l.sleep!, 0) / sleepVals.length).toFixed(1)
    : '--';

  const stats = [
    {
      icon: Scale, label: '最新体重',
      value: latest?.weight ? `${latest.weight} kg` : '--',
      sub: latest?.weight ? '继续记录，看周趋势' : '开始记录吧',
    },
    { icon: Moon, label: '近 7 天均睡眠', value: `${avgSleep} h`, sub: '建议 7.5 小时以上' },
    { icon: Footprints, label: '今日步数', value: latest?.steps ? `${latest.steps}` : '--', sub: '配合运动打卡更有效' },
    { icon: Dumbbell, label: '记录天数', value: `${sortedLogs.length} 天`, sub: '在下方记录身体数据' },
  ];

  const pastDiet = diet.filter((d) => d.date !== todayKey).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        手动记录每天的身体数据，和训练计划联动——数据保存在本机
        {isDesktop() ? '数据文件' : '浏览器'}里。
      </p>

      {seedMsg && (
        <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-xs text-sky-300">
          {seedMsg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-[var(--surface-1)] border border-[var(--border-2)] shadow-sm px-4 py-3.5">
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </p>
            <p className="text-2xl font-extrabold text-slate-800 mt-1 tabular-nums">{s.value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <Panel title={`记录今天（${todayKey.slice(5)}）`} icon={Scale}>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] text-slate-400">体重 kg</span>
            <input className={cn(inputCls, 'mt-0.5')} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="60.0" inputMode="decimal" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">睡眠 h</span>
            <input className={cn(inputCls, 'mt-0.5')} value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" inputMode="decimal" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">步数</span>
            <input className={cn(inputCls, 'mt-0.5')} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="8000" inputMode="numeric" />
          </label>
        </div>
        <button onClick={save} className={cn(btnPrimary, 'w-full mt-3')}>保存今天的记录</button>
        <div className="rounded-2xl border border-[var(--border-2)] p-3 mt-3">
          <p className="text-[11px] text-slate-400 mb-1">体重趋势（最近 14 条）</p>
          <WeightChart logs={logs} />
        </div>
      </Panel>

      <Panel title={`饮食记录（${todayKey.slice(5)}）`} icon={Utensils}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">蛋白质</span>
              <span className="font-bold text-emerald-300">
                {todayProtein} / {proteinTarget} g {todayProtein >= proteinTarget && '✅'}
              </span>
            </div>
            <div className="mt-2"><Bar value={todayProtein} max={proteinTarget} /></div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {todayProtein >= proteinTarget
                ? '已达标，保持！'
                : `还差 ${proteinTarget - todayProtein}g，约等于 ${Math.ceil((proteinTarget - todayProtein) / 6)} 个鸡蛋`}
            </p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">热量</span>
              <span className="font-bold text-amber-300">{todayCalories} / {calorieTarget} kcal</span>
            </div>
            <div className="mt-2"><Bar value={todayCalories} max={calorieTarget} tone="amber" /></div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {todayCalories === 0
                ? '吃够比吃少重要'
                : todayCalories < calorieTarget
                  ? `还差 ${calorieTarget - todayCalories} kcal`
                  : '已达标'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-slate-400">
          <span>
            目标按最近一次体重 {latestWeightForTarget ?? '—'} kg 推算：
            蛋白 {proteinTarget} g（{settings.proteinFactor} g/kg）、热量 {calorieTarget} kcal。
            可在「设置 → 蛋白质目标」调整系数。
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <select value={meal} onChange={(e) => setMeal(e.target.value)} className={cn(inputCls, 'w-24')}>
            {MEALS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input
            className={cn(inputCls, 'flex-1 min-w-[12rem]')}
            value={dText}
            onChange={(e) => setDText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDiet()}
            placeholder="吃了什么，如：烤鸡腿 + 麻婆豆腐 + 米饭"
          />
          <input className={cn(inputCls, 'w-24')} value={dProtein} onChange={(e) => setDProtein(e.target.value)} placeholder="蛋白 g（可空）" inputMode="numeric" />
          <input className={cn(inputCls, 'w-28')} value={dCalories} onChange={(e) => setDCalories(e.target.value)} placeholder="热量 kcal（可空）" inputMode="numeric" />
          <button onClick={addDiet} className={btnPrimary}>记一笔</button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          蛋白与热量留空时，会按上面这句话在食物库里自动识别并计算（如「鸡腿 + 麻婆豆腐 + 米饭二两」）。
        </p>

        {mealSummary.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-[11px] text-slate-400">今日明细</p>
            {mealSummary.map((m) => (
              <div key={m.meal} className="rounded-xl bg-[var(--surface-3)] border border-[var(--border-2)] px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-2)]">{m.meal}</span>
                  <span className="text-[11px] text-slate-400">
                    {m.protein > 0 && <span className="text-emerald-300 font-semibold">{m.protein}g 蛋白</span>}
                    {m.protein > 0 && m.calories > 0 && ' · '}
                    {m.calories > 0 && <span className="text-amber-300 font-semibold">{m.calories} kcal</span>}
                  </span>
                </div>
                <div className="space-y-1 mt-1.5">
                  {m.items.map((d) => {
                    const idx = diet.indexOf(d);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-slate-400">{d.text}</span>
                        {d.protein ? <span className="text-emerald-300 shrink-0">{d.protein}g</span> : null}
                        {d.calories ? <span className="text-amber-300 shrink-0">{d.calories}kcal</span> : null}
                        <IconButton onClick={() => removeDiet(idx)} title="删除" tone="rose">
                          <Trash2 className="w-3 h-3" />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {pastDiet.length > 0 && (
          <div className="space-y-1.5 mt-4">
            <p className="text-[11px] text-slate-400">以往记录</p>
            {pastDiet.map((d) => {
              const idx = diet.indexOf(d);
              return (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="text-slate-400 shrink-0 w-24 tabular-nums">{d.date.slice(5)} {d.meal}</span>
                  <span className="flex-1 text-slate-700 truncate">{d.text}</span>
                  {d.protein ? <span className="text-emerald-700 font-semibold shrink-0">{d.protein}g</span> : null}
                  {d.calories ? <span className="text-amber-700 shrink-0">{d.calories}kcal</span> : null}
                  <IconButton onClick={() => removeDiet(idx)} title="删除" tone="rose">
                    <Trash2 className="w-3 h-3" />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
          <Apple className="w-3.5 h-3.5" />
          小技巧：把每餐拍照发给我，我帮你估算蛋白质和热量，你照数字填进来就行。
        </p>
      </Panel>

      <Panel title="历史记录（点铅笔可修改）" icon={Pencil}>
        {sortedLogs.length === 0 ? (
          <Empty>还没有记录</Empty>
        ) : (
          <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
            {sortedLogs.map((l) =>
              editDate === l.date ? (
                <div key={l.date} className="flex flex-wrap items-end gap-2 rounded-xl bg-emerald-50/60 border border-emerald-200 px-4 py-3">
                  <span className="text-xs font-semibold text-slate-700 w-20 tabular-nums">{l.date.slice(5)}</span>
                  <label className="block w-24">
                    <span className="text-[10px] text-slate-400">体重 kg</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eWeight} onChange={(e) => setEWeight(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="block w-24">
                    <span className="text-[10px] text-slate-400">睡眠 h</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eSleep} onChange={(e) => setESleep(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="block w-28">
                    <span className="text-[10px] text-slate-400">步数</span>
                    <input className={cn(inputCls, 'h-8 mt-0.5')} value={eSteps} onChange={(e) => setESteps(e.target.value)} inputMode="numeric" />
                  </label>
                  <button onClick={saveEdit} className={cn(btnPrimary, 'h-8 text-xs')}>保存</button>
                  <IconButton onClick={() => setEditDate(null)} title="取消">
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              ) : (
                <div key={l.date} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-700 w-20 shrink-0 tabular-nums">{l.date.slice(5)}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <span>体重 <span className="font-semibold text-slate-800">{l.weight ?? '--'}</span> kg</span>
                    <span>睡眠 <span className="font-semibold text-slate-800">{l.sleep ?? '--'}</span> h</span>
                    <span>步数 <span className="font-semibold text-slate-800">{l.steps ?? '--'}</span></span>
                  </div>
                  <IconButton onClick={() => startEdit(l)} title="编辑" tone="emerald">
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton onClick={() => setLogs(logs.filter((x) => x.date !== l.date))} title="删除" tone="rose">
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              )
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
