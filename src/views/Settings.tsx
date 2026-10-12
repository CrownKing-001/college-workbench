// 设置：数据位置、备份导入导出、提醒、学期起点、日期锁定
import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import { Panel, Chip, btnPrimary, btnGhost, inputCls } from '@/components/Panel';
import {
  HardDrive, Download, Upload, Bell, CalendarCog, Trash2, FolderOpen,
  Info, ShieldCheck, BellRing, Target, Image as ImageIcon, Footprints, Clock,
} from 'lucide-react';
import { currentWeek, semesterStartForWeek } from '@/data/plan';
import { fromKey, toKey } from '@/lib/storage';
import { parsePeriodSchedule, formatPeriodSchedule } from '@/lib/periods';
import { cn } from '@/lib/utils';

export default function Settings() {
  const store = useStore();
  const { settings, setSettings, storageDir, desktop } = store;
  const [info, setInfo] = useState<{ version: string; electron: string; dataDir: string; portable: boolean } | null>(null);
  const [tested, setTested] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [photoUsage, setPhotoUsage] = useState({ count: 0, bytes: 0 });
  const [scheduleText, setScheduleText] = useState(() => formatPeriodSchedule(settings.periods ?? []));
  const [scheduleMsg, setScheduleMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** 「当前是第几周」的输入值 */
  const [weekJump, setWeekJump] = useState('');

  /** 按「今天是第 N 周」反推学期起点 */
  const applyWeekJump = () => {
    const n = Number(weekJump);
    if (!Number.isFinite(n) || n < 1 || n > 40) return;
    const start = semesterStartForWeek(n, store.today);
    setSettings({ semesterStart: toKey(start) });
    setWeekJump('');
    setMsg({ kind: 'ok', text: `已按「今天第 ${n} 周」把学期起点设为 ${toKey(start)}，全应用周次已重算。` });
  };

  const importSchedule = () => {
    const parsed = parsePeriodSchedule(scheduleText);
    if (!parsed.length) {
      setScheduleMsg({ kind: 'err', text: '没解析出任何时间段。请按「第1节 8:00-8:45」这种格式，每行一节。' });
      return;
    }
    setSettings({ periods: parsed });
    setScheduleMsg({ kind: 'ok', text: `已导入 ${parsed.length} 节课的作息时间。` });
  };

  // 最近一次体重，用于推算蛋白质目标
  const latestWeight = (() => {
    const last = [...store.health]
      .filter((h) => typeof h.weight === 'number' && h.weight! > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return last?.weight ?? null;
  })();
  const proteinTarget = store.proteinTarget;

  useEffect(() => {
    window.desktop?.appInfo().then(setInfo).catch(() => {});
    window.desktop?.photo?.usage().then(setPhotoUsage).catch(() => {});
  }, []);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const doExport = async () => {
    const payload = store.exportAll();
    if (desktop && window.desktop) {
      const r = await window.desktop.exportBackup(payload);
      if (r.ok) flash('ok', `已导出到 ${r.filePath}`);
      else if (!r.canceled) flash('err', `导出失败：${r.error ?? '未知错误'}`);
      return;
    }
    // 浏览器预览：走下载
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `大学日程备份-${toKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('ok', '已触发下载');
  };

  const doImport = async () => {
    if (desktop && window.desktop) {
      const r = await window.desktop.importBackup();
      if (r.canceled) return;
      if (!r.ok || !r.data) {
        flash('err', `导入失败：${r.error ?? '文件格式不对'}`);
        return;
      }
      await store.importAll(r.data);
      flash('ok', `已从 ${r.filePath} 导入`);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        await store.importAll(data);
        flash('ok', '导入成功');
      } catch {
        flash('err', '文件解析失败');
      }
    };
    input.click();
  };

  const doReset = async () => {
    if (!confirm('确定清空所有数据？待办、作业、健康记录、打卡都会删除，且无法恢复。建议先导出备份。')) return;
    await store.resetAll();
    flash('ok', '已清空全部数据');
  };

  const testNotify = async () => {
    if (!window.desktop) return;
    await window.desktop.notify('大学日程 · 测试通知', '如果你看到这条消息，说明桌面提醒工作正常 ✅');
    setTested(true);
  };

  const week = currentWeek(store.today, fromKey(settings.semesterStart));
  const totalRecords =
    store.health.length + store.diet.length + store.run.length +
    store.todos.length + store.assignments.length;

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn(
          'rounded-xl px-4 py-2.5 text-sm border',
          msg.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        )}>
          {msg.text}
        </div>
      )}

      <Panel title="数据存放位置" icon={HardDrive}>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">所有数据以 JSON 文件保存在程序旁边的 data 目录，删掉程序也不会丢数据。</p>
          <p className="text-xs font-mono text-slate-700 break-all bg-white rounded-lg px-3 py-2 border border-slate-200">
            {storageDir || (desktop ? '读取中…' : '浏览器预览模式（localStorage）')}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => window.desktop?.openDataDir()}
              disabled={!desktop}
              className={cn(btnGhost, 'h-8 text-xs')}
            >
              <FolderOpen className="w-3.5 h-3.5" /> 打开数据目录
            </button>
            <button onClick={doExport} className={cn(btnPrimary, 'h-8 text-xs')}>
              <Download className="w-3.5 h-3.5" /> 导出备份
            </button>
            <button onClick={doImport} className={cn(btnGhost, 'h-8 text-xs')}>
              <Upload className="w-3.5 h-3.5" /> 导入备份
            </button>
            <button onClick={doReset} className={cn(btnGhost, 'h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50')}>
              <Trash2 className="w-3.5 h-3.5" /> 清空全部数据
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-400">
            <span>健康记录 {store.health.length}</span>
            <span>饮食 {store.diet.length}</span>
            <span>运动打卡 {store.run.length}</span>
            <span>待办 {store.todos.length}</span>
            <span>作业 {store.assignments.length}</span>
            <span className="text-slate-500 font-medium">共 {totalRecords} 条</span>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="桌面提醒" icon={Bell}>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifyEnabled}
              onChange={(e) => setSettings({ notifyEnabled: e.target.checked })}
              className="w-4 h-4 accent-emerald-600"
              disabled={!desktop}
            />
            <div className="flex-1">
              <p className="text-sm text-slate-700">开启系统通知提醒</p>
              <p className="text-[11px] text-slate-400">
                课程、作业截止前会弹出 Windows 通知
              </p>
            </div>
            <BellRing className={cn('w-4 h-4', settings.notifyEnabled ? 'text-emerald-500' : 'text-[var(--text-2)]')} />
          </label>

          <label className="block mt-3">
            <span className="text-[11px] text-slate-400">提前多久提醒（分钟）</span>
            <input
              type="number"
              min={1}
              max={120}
              className={cn(inputCls, 'mt-0.5 w-32')}
              value={settings.notifyMinutesBefore}
              onChange={(e) => setSettings({ notifyMinutesBefore: Math.max(1, Number(e.target.value) || 15) })}
            />
          </label>

          <div className="flex items-center gap-2 mt-3">
            <button onClick={testNotify} disabled={!desktop} className={cn(btnGhost, 'h-8 text-xs')}>
              <Bell className="w-3.5 h-3.5" /> 发送测试通知
            </button>
            {tested && <Chip tone="emerald">已发送，看右下角</Chip>}
          </div>
          {!desktop && (
            <p className="text-[11px] text-amber-600 mt-2">
              当前是浏览器预览模式，系统通知只在打包后的桌面程序里生效。
            </p>
          )}
        </Panel>

        <Panel title="学期与日期" icon={CalendarCog}>
          <label className="block">
            <span className="text-[11px] text-slate-400">开学第一周的周一</span>
            <input
              type="date"
              className={cn(inputCls, 'mt-0.5 w-48')}
              value={settings.semesterStart}
              onChange={(e) => setSettings({ semesterStart: e.target.value })}
            />
          </label>
          <p className="text-[11px] text-slate-400 mt-1.5">
            当前推算：第 <span className="font-semibold text-emerald-600">{week}</span> 教学周
          </p>

          {/* 直接按「现在第几周」设置：比手算日期省事，适合开学初或中途校准 */}
          <label className="block mt-4">
            <span className="text-[11px] text-slate-400">当前是第几周（直接填数字，自动反推学期起点）</span>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <input
                type="number"
                min={1}
                max={40}
                placeholder={String(week)}
                className={cn(inputCls, 'w-24')}
                value={weekJump}
                onChange={(e) => setWeekJump(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyWeekJump();
                }}
              />
              <button
                className={cn(btnPrimary, 'h-9 text-xs')}
                disabled={!weekJump || Number(weekJump) < 1 || Number(weekJump) > 40}
                onClick={applyWeekJump}
              >
                设为第 {weekJump && Number(weekJump) >= 1 ? weekJump : 'N'} 周
              </button>
              <span className="text-[11px] text-slate-500">
                按「本周周一 − (N−1) 周」反推，并同步「开学第一周的周一」
              </span>
            </div>
          </label>

          <label className="block mt-4">
            <span className="text-[11px] text-slate-400">锁定「今天」为（用于复盘或演示，留空跟随系统）</span>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="date"
                className={cn(inputCls, 'w-48')}
                value={settings.pinnedDate ?? ''}
                onChange={(e) => setSettings({ pinnedDate: e.target.value || null })}
              />
              {settings.pinnedDate && (
                <button onClick={() => setSettings({ pinnedDate: null })} className={cn(btnGhost, 'h-9 text-xs')}>
                  取消锁定
                </button>
              )}
            </div>
          </label>
          {settings.pinnedDate && (
            <p className="text-[11px] text-amber-600 mt-2">
              已锁定到 {settings.pinnedDate}，整个工作台都按这一天计算（包括提醒）。
            </p>
          )}
        </Panel>

        <Panel title="作息时间表" icon={Clock}>
          <p className="text-[11px] text-slate-400 mb-2">
            不同学校每节课的上下课时间不一样。把本校作息粘贴进来（每行一节），
            「课表识别」就会按这里的时间给课程分配节次时间。
          </p>
          <textarea
            className={cn(inputCls, 'min-h-28 w-full font-mono text-xs leading-relaxed')}
            value={scheduleText}
            onChange={(e) => setScheduleText(e.target.value)}
            placeholder={'第1节 8:00-8:45\n第2节 8:50-9:35\n第3节 9:50-10:35\n……'}
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={importSchedule} className={cn(btnPrimary, 'h-8 text-xs')}>
              解析并保存
            </button>
            <span className="text-[11px] text-slate-400">
              已存 {settings.periods?.length ?? 0} 节
            </span>
          </div>
          {scheduleMsg && (
            <p className={cn('mt-2 text-[11px]', scheduleMsg.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600')}>
              {scheduleMsg.text}
            </p>
          )}
          {(settings.periods?.length ?? 0) > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              {settings.periods!.map((p, i) => (
                <span key={i} className="tabular-nums">
                  第{i + 1}节 {p.start}-{p.end}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="蛋白质目标" icon={Target}>
          <label className="block">
            <span className="text-[11px] text-slate-400">蛋白质系数（g 蛋白 / kg 体重）</span>
            <input
              type="number"
              step="0.1"
              min="1"
              max="3"
              className={cn(inputCls, 'mt-0.5 w-32')}
              value={settings.proteinFactor}
              onChange={(e) => setSettings({ proteinFactor: Number(e.target.value) || 1.8 })}
            />
          </label>
          <p className="text-[11px] text-slate-400 mt-1.5">
            常用范围 1.6–2.2。按最近一次体重 <span className="font-semibold">{latestWeight ?? '—'}</span> kg 推算，
            当前目标 <span className="font-semibold text-emerald-600">{proteinTarget}</span> g/天。
          </p>

          <label className="block mt-4">
            <span className="text-[11px] text-slate-400">手动指定每日目标（留空 = 按体重自动算）</span>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="number"
                min="0"
                className={cn(inputCls, 'w-32')}
                value={settings.proteinTargetOverride ?? ''}
                placeholder="自动"
                onChange={(e) =>
                  setSettings({ proteinTargetOverride: e.target.value ? Number(e.target.value) : null })
                }
              />
              {settings.proteinTargetOverride ? (
                <button
                  onClick={() => setSettings({ proteinTargetOverride: null })}
                  className={cn(btnGhost, 'h-9 text-xs')}
                >
                  改回自动
                </button>
              ) : null}
            </div>
          </label>
        </Panel>

        <Panel title="运动打卡" icon={Footprints}>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.runEnabled}
              onChange={(e) => setSettings({ runEnabled: e.target.checked })}
              className="w-4 h-4 accent-emerald-600"
            />
            <div className="flex-1">
              <p className="text-sm text-slate-700">显示「运动打卡」模块</p>
              <p className="text-[11px] text-slate-400">关闭后导航与首页都不再出现这一项</p>
            </div>
          </label>

          <label className="block mt-3">
            <span className="text-[11px] text-slate-400">目标打卡次数</span>
            <input
              type="number"
              min={1}
              className={cn(inputCls, 'mt-0.5 w-32')}
              value={settings.runTarget}
              onChange={(e) => setSettings({ runTarget: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="text-[11px] text-slate-400">开始日期（可选）</span>
              <input
                type="date"
                className={cn(inputCls, 'mt-0.5 w-full')}
                value={settings.runStart ?? ''}
                onChange={(e) => setSettings({ runStart: e.target.value || undefined })}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">结束日期（可选）</span>
              <input
                type="date"
                className={cn(inputCls, 'mt-0.5 w-full')}
                value={settings.runEnd ?? ''}
                onChange={(e) => setSettings({ runEnd: e.target.value || undefined })}
              />
            </label>
          </div>

          <label className="block mt-3">
            <span className="text-[11px] text-slate-400">打卡类型（用逗号分隔）</span>
            <input
              className={cn(inputCls, 'mt-0.5 w-full')}
              value={settings.runTypes}
              onChange={(e) => setSettings({ runTypes: e.target.value })}
              placeholder="跑步,健步走,健身房,球类,游泳"
            />
          </label>
          <p className="text-[11px] text-slate-400 mt-1.5">
            每个类型会成为「运动打卡」页上的一个按钮，按你自己的习惯改。
          </p>

          <div className="mt-4 pt-3 border-t border-[var(--border-1)]">
            <span className="text-[11px] text-slate-400">训练日（点选一周里安排训练的日子）</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                [1, '一'], [2, '二'], [3, '三'], [4, '四'],
                [5, '五'], [6, '六'], [7, '日'],
              ].map(([n, cn_]) => {
                const set = new Set(
                  (settings.trainDays ?? '')
                    .split(/[,，]/)
                    .map((s) => Number(s.trim()))
                    .filter((x) => Number.isInteger(x) && x >= 1 && x <= 7)
                );
                const on = set.has(n as number);
                return (
                  <button
                    key={n}
                    onClick={() => {
                      if (on) set.delete(n as number);
                      else set.add(n as number);
                      setSettings({ trainDays: [...set].sort((a, b) => a - b).join(',') });
                    }}
                    className={cn(
                      'w-10 h-9 rounded-lg border text-xs font-medium transition-colors',
                      on
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-[var(--surface-3)] border-[var(--border-3)] text-slate-400 hover:border-emerald-500/50 hover:text-[var(--text-1)]'
                    )}
                  >
                    周{cn_}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              「体重作息」的训练打卡日历会标出训练日与休息日，连续打卡只按训练日计算，
              休息日不会打断连续记录。全部取消则不再区分。
            </p>
          </div>
        </Panel>

        <Panel title="饮食照片" icon={ImageIcon}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600">
              已存 <span className="font-semibold tabular-nums">{photoUsage.count}</span> 张，占用{' '}
              <span className="font-semibold tabular-nums">{(photoUsage.bytes / 1048576).toFixed(1)}</span> MB
            </span>
            {window.desktop?.photo && (
              <button onClick={() => window.desktop!.photo.openDir()} className={cn(btnGhost, 'h-9 text-xs')}>
                打开照片文件夹
              </button>
            )}
          </div>
          <label className="block mt-4">
            <span className="text-[11px] text-slate-400">空间提醒阈值（MB，超过时在饮食页提示清理）</span>
            <input
              type="number"
              min="50"
              step="50"
              className={cn(inputCls, 'mt-0.5 w-32')}
              value={settings.photoQuotaMB}
              onChange={(e) => setSettings({ photoQuotaMB: Number(e.target.value) || 500 })}
            />
          </label>
          <p className="text-[11px] text-slate-400 mt-1.5">
            照片保存在 <code className="rounded bg-slate-100 px-1">data/photos/</code> 下，按月份分文件夹，
            随 data 目录一起拷走即可迁移。
          </p>
        </Panel>
      </div>

      <Panel title="关于" icon={Info}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] text-slate-400">程序</p>
            <p className="text-sm font-medium text-slate-700">大学日程 · 桌面工作台</p>
            <p className="text-[11px] text-slate-400 mt-1">
              版本 {info?.version ?? '1.0.0'} · Electron {info?.electron ?? '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] text-slate-400">运行模式</p>
            <p className="text-sm font-medium text-slate-700">
              {info?.portable ? '免安装绿色版' : desktop ? '开发模式' : '浏览器预览'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> 数据 100% 存本机，不联网上传
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          关闭窗口程序会收进右下角托盘继续运行，提醒照常触发；要完全退出请右键托盘图标选「退出」。
        </p>
      </Panel>
    </div>
  );
}
