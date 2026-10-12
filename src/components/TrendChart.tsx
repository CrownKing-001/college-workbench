// 趋势曲线组件：体重 / 睡眠共用同一套坐标与样式，避免两处各画一遍。
//
// 设计取舍：
//  · 只画最近 N 条，横轴按「记录条数」等距排布 —— 因为记录是零散的，
//    按真实日期比例画会让中间的空档挤成一团，看不出趋势；
//  · 目标线画成虚线，让「今天够不够」一眼可读；
//  · y 轴上下各留 0.5 的余量，避免点在边缘被裁掉。
import { cn } from '@/lib/utils';

export interface TrendPoint {
  date: string;
  value: number;
}

export function TrendChart({
  points,
  color,
  target,
  targetLabel,
  unit,
  emptyHint,
  /** 低于目标时是否标红（睡眠用；体重不需要） */
  warnBelow,
}: {
  points: TrendPoint[];
  color: string;
  target?: number;
  targetLabel?: string;
  unit?: string;
  emptyHint: string;
  warnBelow?: boolean;
}) {
  if (points.length < 2) {
    return <p className="text-xs text-slate-400 py-6 text-center">{emptyHint}</p>;
  }

  const W = 560;
  const H = 140;
  const PAD = 26;
  const vs = points.map((p) => p.value);

  // 把目标线也纳入取值范围，否则目标线可能跑到图外
  const all = target !== undefined ? [...vs, target] : vs;
  const min = Math.min(...all) - 0.5;
  const max = Math.max(...all) + 0.5;

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');

  // 点太密时只显示首尾与关键点的数值，避免文字互相压叠
  const dense = points.length > 10;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {/* 目标线 */}
      {target !== undefined && (
        <g>
          <line
            x1={PAD} y1={y(target)} x2={W - PAD} y2={y(target)}
            stroke={color} strokeWidth="1" strokeDasharray="4 4" opacity="0.45"
          />
          <text x={W - PAD} y={y(target) - 4} textAnchor="end" fontSize="8" fill={color} opacity="0.75">
            {targetLabel ?? `目标 ${target}${unit ?? ''}`}
          </text>
        </g>
      )}

      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />

      {points.map((p, i) => {
        const low = warnBelow && target !== undefined && p.value < target;
        const showValue = !dense || i === 0 || i === points.length - 1;
        return (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={low ? '#f43f5e' : color} />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#7c8a9c">
              {dense ? (i % 2 === 0 ? p.date.slice(5) : '') : p.date.slice(5)}
            </text>
            {showValue && (
              <text
                x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize="9"
                fill={low ? '#fb7185' : color}
              >
                {p.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 曲线下方的一句话小结 */
export function TrendSummary({
  points,
  target,
  goodText,
  className,
}: {
  points: TrendPoint[];
  target: number;
  goodText: (avg: string) => string;
  className?: string;
}) {
  if (points.length === 0) return null;
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;
  const hit = points.filter((p) => p.value >= target).length;
  const ok = avg >= target;
  return (
    <p className={cn('text-[11px] pt-1.5', ok ? 'text-emerald-400' : 'text-amber-400', className)}>
      {goodText(avg.toFixed(1))}
      <span className="text-slate-500">
        {' '}· 达标 {hit}/{points.length} 天
      </span>
    </p>
  );
}
