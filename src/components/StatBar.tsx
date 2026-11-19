import { useEffect, useRef, useState } from 'react';

export interface StatBarProps {
  value: number;
  max: number;
  label?: string;
  labelClassName?: string;
  valueText?: string;
  valueClassName?: string;
  fillClassName: string;
  trailClassName?: string;
  trackClassName?: string;
  heightClassName?: string;
  instant?: boolean;
  showTrail?: boolean;
  compactHeader?: boolean;
  title?: string;
}

/**
 * Shared left-anchored progress/stat bar (HP, Shield, SP, EXP).
 * Always fills left-to-right (dir="ltr", left-0, clamped 0..100%),
 * never shrinks toward center at any battle speed or when skipAnimations is active,
 * and renders a smooth lagging damage trail when values drop.
 */
export function StatBar({
  value,
  max,
  label,
  labelClassName = 'text-slate-400',
  valueText,
  valueClassName = 'text-slate-100',
  fillClassName,
  trailClassName = 'bg-white/35',
  trackClassName = 'bg-slate-900',
  heightClassName = 'h-2',
  instant = false,
  showTrail = true,
  compactHeader = false,
  title,
}: StatBarProps) {
  const safeMax = Math.max(1, max);
  const clampedValue = Math.max(0, Math.min(safeMax, value));
  const pct = Math.max(0, Math.min(100, (clampedValue / safeMax) * 100));

  const prevPctRef = useRef<number>(pct);
  const [trailPct, setTrailPct] = useState<number>(pct);

  useEffect(() => {
    const prev = prevPctRef.current;
    prevPctRef.current = pct;

    if (!showTrail || instant) {
      setTrailPct(pct);
      return;
    }

    if (pct < prev) {
      // Keep trail at previous higher width briefly, then drain smoothly to new pct
      setTrailPct(prev);
      const frame = window.requestAnimationFrame(() => {
        setTrailPct(pct);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    // On heal/increase, snap trail immediately to match fill
    setTrailPct(pct);
  }, [pct, instant, showTrail]);

  const displayValue =
    valueText ?? `${Math.round(clampedValue)}/${Math.round(safeMax)}`;
  const hasHeader = Boolean(label || valueText !== '');

  return (
    <div
      dir="ltr"
      title={title ?? (label ? `${label}: ${displayValue}` : displayValue)}
      className={compactHeader ? 'space-y-0.5' : 'space-y-1'}
    >
      {hasHeader && (label || valueText) && (
        <div
          className={`flex items-center justify-between font-mono-nums ${
            compactHeader ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          {label ? <span className={labelClassName}>{label}</span> : <span />}
          <span className={valueClassName}>{displayValue}</span>
        </div>
      )}

      <div
        className={`relative w-full ${heightClassName} rounded-sm ${trackClassName} overflow-hidden`}
        role="progressbar"
        aria-valuenow={Math.round(clampedValue)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-label={label}
      >
        {/* Lagging damage trail (anchored strictly at left edge) */}
        {showTrail && !instant && (
          <div
            className={`absolute inset-y-0 left-0 origin-left ${trailClassName} meter-trail`}
            style={{ width: `${Math.max(pct, trailPct)}%` }}
          />
        )}

        {/* Primary left-anchored fill */}
        <div
          className={`absolute inset-y-0 left-0 origin-left ${fillClassName} ${
            instant ? '' : 'meter-fill'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
