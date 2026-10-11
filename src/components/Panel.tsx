// 工作台通用小部件：卡片、区块标题、空状态、进度条、徽标
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  title, icon: Icon, action, children, className, bodyClass,
}: {
  title?: string;
  icon?: typeof import('lucide-react').Flame;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn('rounded-2xl bg-[var(--surface-1)] border border-[var(--border-2)] shadow-lg shadow-black/20', className)}>
      {title && (
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          {Icon && <Icon className="w-4 h-4 text-emerald-400" />}
          <h2 className="text-sm font-semibold text-[var(--text-1)] flex-1">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn('px-5 pb-5', !title && 'pt-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500 py-6 text-center">{children}</p>;
}

export function Bar({ value, max, tone = 'emerald' }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-400',
    sky: 'bg-sky-500',
    rose: 'bg-rose-500',
  };
  return (
    <div className="w-full h-2 rounded-full bg-[var(--border-1)] overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-300', tones[tone] ?? tones.emerald)}
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
    slate: 'bg-[var(--border-1)] text-[var(--text-2)]',
    emerald: 'bg-emerald-500/15 text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-300',
    sky: 'bg-sky-500/15 text-sky-300',
    violet: 'bg-violet-500/15 text-violet-300',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function IconButton({
  onClick, title, children, tone = 'slate', disabled,
}: {
  onClick?: () => void; title?: string; children: ReactNode;
  tone?: 'slate' | 'rose' | 'emerald'; disabled?: boolean;
}) {
  const tones = {
    slate: 'text-slate-500 hover:text-[var(--text-1)] hover:bg-[var(--border-2)]',
    rose: 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/15',
    emerald: 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/15',
  };
  return (
    <button
      onClick={onClick}
      title={title}
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
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

export const inputCls =
  'w-full h-9 rounded-lg border border-[var(--border-3)] bg-[var(--header)] px-2.5 text-sm text-[var(--text-1)] placeholder:text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:pointer-events-none';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--border-3)] bg-[var(--surface-3)] hover:bg-[var(--surface-4)] px-3.5 text-sm font-medium text-[var(--text-2)] transition-colors disabled:opacity-40 disabled:pointer-events-none';
