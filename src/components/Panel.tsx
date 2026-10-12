// 工作台通用小部件：卡片、区块标题、空状态、进度条、徽标
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 图标底座的配色：不同区块用不同色相，页面才不会一片灰 */
export type PanelTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'slate';

const TONE_ICON: Record<PanelTone, string> = {
  emerald: 'bg-emerald-500/12 text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-400',
  amber: 'bg-amber-500/12 text-amber-400',
  rose: 'bg-rose-500/12 text-rose-400',
  violet: 'bg-violet-500/12 text-violet-400',
  slate: 'bg-[var(--chip-bg)] text-slate-400',
};

export function Panel({
  title, icon: Icon, action, children, className, bodyClass, tone = 'emerald',
}: {
  title?: string;
  icon?: typeof import('lucide-react').Flame;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  /** 标题图标的主色，默认品牌绿 */
  tone?: PanelTone;
}) {
  return (
    // 注意：这里刻意**不加** overflow-hidden —— 卡片里常放下拉面板 / 弹出层，
    // 一旦裁剪就会表现为「点了没反应」。圆角靠标题栏自己的 rounded-t 处理。
    <section className={cn('card-surface', className)}>
      {title && (
        <div
          className="flex items-center gap-2.5 px-5 pt-4 pb-3 rounded-t-2xl border-b border-[var(--border-1)]"
          style={{ backgroundImage: 'var(--panel-head)' }}
        >
          {Icon && (
            <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', TONE_ICON[tone])}>
              <Icon className="w-4 h-4" />
            </span>
          )}
          <h2 className="text-sm font-semibold text-[var(--text-1)] flex-1 tracking-tight">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn('px-5 py-4', !title && 'pt-5', bodyClass)}>{children}</div>
    </section>
  );
}

/**
 * 空状态：给一个淡图标 + 一句话，比一大片留白友好得多。
 * 尽量让空面板看起来是「设计过的」而不是「坏了」。
 */
export function Empty({
  children, icon: Icon, className,
}: {
  children: ReactNode;
  icon?: typeof import('lucide-react').Flame;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-7 text-center', className)}>
      {Icon && (
        <span className="w-9 h-9 rounded-xl bg-[var(--chip-bg)] flex items-center justify-center">
          <Icon className="w-4 h-4 text-slate-500" />
        </span>
      )}
      <p className="text-xs text-slate-500 leading-relaxed max-w-[22rem]">{children}</p>
    </div>
  );
}

export function Bar({
  value, max, tone = 'emerald', className,
}: {
  value: number; max: number; tone?: string; className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tones: Record<string, string> = {
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    amber: 'bg-gradient-to-r from-amber-500 to-orange-400',
    sky: 'bg-gradient-to-r from-sky-500 to-cyan-400',
    rose: 'bg-gradient-to-r from-rose-500 to-pink-400',
    violet: 'bg-gradient-to-r from-violet-500 to-purple-400',
  };
  return (
    <div className={cn('w-full h-2 rounded-full bg-[var(--border-1)] overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', tones[tone] ?? tones.emerald)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Chip({
  children, tone = 'slate', className,
}: {
  children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; className?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-[var(--chip-bg)] text-[var(--text-3)]',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    rose: 'bg-rose-500/15 text-rose-400',
    sky: 'bg-sky-500/15 text-sky-400',
    violet: 'bg-violet-500/15 text-violet-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function IconButton({
  onClick, title, children, tone = 'slate', disabled,
}: {
  onClick?: () => void; title?: string; children: ReactNode;
  tone?: 'slate' | 'rose' | 'emerald' | 'amber'; disabled?: boolean;
}) {
  const tones = {
    slate: 'text-slate-500 hover:text-[var(--text-1)] hover:bg-[var(--border-2)]',
    rose: 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/15',
    emerald: 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/15',
    amber: 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/15',
  };
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
        tones[tone],
        disabled && 'opacity-30 pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label, children, className,
}: {
  label: string; children: ReactNode; className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls =
  'w-full h-9 rounded-lg border border-[var(--border-3)] bg-[var(--surface-3)] px-2.5 text-sm text-[var(--text-1)] placeholder:text-slate-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 text-sm font-medium text-white whitespace-nowrap shadow-sm shadow-emerald-900/20 transition-colors disabled:opacity-40 disabled:pointer-events-none';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--border-3)] bg-[var(--surface-3)] hover:bg-[var(--surface-4)] px-3.5 text-sm font-medium text-[var(--text-2)] whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none';
