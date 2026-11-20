import {
  Anchor,
  BatteryCharging,
  Castle,
  Shield,
  Sparkles,
  Sun,
} from 'lucide-react';
import type {
  IconCatalogKind,
  IconCatalogRow,
  StatusBadgeLayout,
  StatusEffectType,
} from '../types/game';

export type CatalogIconSize = 'xs' | 'sm' | 'md' | 'lg';

interface CatalogIconProps {
  row: IconCatalogRow | null;
  fallbackStatusType?: StatusEffectType;
  kindOverride?: IconCatalogKind;
  size?: CatalogIconSize;
  badgeLayout?: StatusBadgeLayout;
  turnsLeft?: number | null;
  stacks?: number;
  allowStack?: boolean;
  showBadges?: boolean;
  showArrowBadge?: boolean;
  className?: string;
}

const SIZE_SPEC: Record<
  CatalogIconSize,
  {
    boxPx: number;
    iconFontPx: number;
    lucideCls: string;
    arrowBoxPx: number;
    arrowFontPx: number;
    turnsFontPx: number;
    turnsClockPx: number;
    stackFontPx: number;
  }
> = {
  xs: {
    boxPx: 18,
    iconFontPx: 12,
    lucideCls: 'w-3 h-3',
    arrowBoxPx: 9,
    arrowFontPx: 7,
    turnsFontPx: 8,
    turnsClockPx: 7,
    stackFontPx: 8,
  },
  sm: {
    boxPx: 22,
    iconFontPx: 14,
    lucideCls: 'w-3.5 h-3.5',
    arrowBoxPx: 10,
    arrowFontPx: 8,
    turnsFontPx: 9,
    turnsClockPx: 8,
    stackFontPx: 9,
  },
  md: {
    boxPx: 28,
    iconFontPx: 18,
    lucideCls: 'w-4 h-4',
    arrowBoxPx: 12,
    arrowFontPx: 9,
    turnsFontPx: 10,
    turnsClockPx: 9,
    stackFontPx: 10,
  },
  lg: {
    boxPx: 34,
    iconFontPx: 22,
    lucideCls: 'w-5 h-5',
    arrowBoxPx: 14,
    arrowFontPx: 10,
    turnsFontPx: 10,
    turnsClockPx: 9,
    stackFontPx: 10,
  },
};

const BUFF_GREEN = '#1D9E75';
const DEBUFF_RED = '#E24B4A';

function renderFallbackLucide(
  type: StatusEffectType | undefined,
  color: string,
  cls: string
) {
  const props = { className: cls, style: { color }, 'aria-hidden': true as const };
  switch (type) {
    case 'evade_all':
      return <Sparkles {...props} />;
    case 'invincible':
      return <Sun {...props} />;
    case 'siege_mode':
      return <Anchor {...props} />;
    case 'siege_defense':
      return <Castle {...props} />;
    case 'charging':
      return <BatteryCharging {...props} />;
    default:
      return <Shield {...props} />;
  }
}

export function CatalogIcon({
  row,
  fallbackStatusType,
  kindOverride,
  size = 'sm',
  badgeLayout = 'B',
  turnsLeft = null,
  stacks = 1,
  allowStack = false,
  showBadges = true,
  showArrowBadge = true,
  className = '',
}: CatalogIconProps) {
  const spec = SIZE_SPEC[size];
  const kind: IconCatalogKind = kindOverride ?? row?.kind ?? 'normal';
  const baseColor = row?.color ?? '#94A3B8';
  const iconColor = kind === 'buff' ? BUFF_GREEN : baseColor;

  const hasValidTurns =
    showBadges &&
    turnsLeft !== null &&
    turnsLeft !== undefined &&
    Number.isFinite(turnsLeft) &&
    turnsLeft > 0 &&
    turnsLeft < 50;

  const hasStackBadge =
    showBadges && allowStack && Number.isFinite(stacks) && stacks >= 2;

  const arrowCornerClass =
    badgeLayout === 'A'
      ? '-bottom-1 -right-1'
      : '-bottom-1 -left-1';

  const turnsCornerClass =
    badgeLayout === 'A'
      ? '-bottom-1.5 -left-1.5'
      : '-bottom-1.5 -right-1.5';

  const renderGlyph = () => {
    if (!row) {
      return renderFallbackLucide(fallbackStatusType, iconColor, spec.lucideCls);
    }
    if (Array.isArray(row.layers) && row.layers.length > 0) {
      return (
        <span
          className="relative inline-flex items-center justify-center"
          style={{ width: spec.iconFontPx, height: spec.iconFontPx }}
          aria-hidden="true"
        >
          {row.layers.map((layer, idx) => (
            <span
              key={`${row.id}-layer-${idx}`}
              className="material-symbols-outlined absolute inset-0 flex items-center justify-center leading-none select-none"
              style={{
                fontSize: `${spec.iconFontPx}px`,
                color: layer.color,
                opacity: layer.opacity ?? 1,
              }}
            >
              {layer.symbol}
            </span>
          ))}
        </span>
      );
    }
    return (
      <span
        className="material-symbols-outlined leading-none select-none"
        style={{
          fontSize: `${spec.iconFontPx}px`,
          color: iconColor,
        }}
        aria-hidden="true"
      >
        {row.symbol}
      </span>
    );
  };

  return (
    <span
      data-testid="catalog-icon-root"
      data-icon-kind={kind}
      data-badge-layout={badgeLayout}
      data-catalog-id={row?.id ?? 'unmapped'}
      style={{
        width: `${spec.boxPx}px`,
        height: `${spec.boxPx}px`,
      }}
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
    >
      {/* Shape frame by kind */}
      {kind === 'buff' ? (
        <span
          data-testid="status-icon-frame"
          data-frame-shape="round"
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{
            border: `1.5px solid ${BUFF_GREEN}`,
            backgroundColor: 'rgba(29, 158, 117, 0.16)',
          }}
        >
          {renderGlyph()}
        </span>
      ) : kind === 'debuff' ? (
        <span
          data-testid="status-icon-frame"
          data-frame-shape="hex"
          className="status-hex-frame w-full h-full flex items-center justify-center p-[1.5px]"
          style={{
            backgroundColor: DEBUFF_RED,
          }}
        >
          <span
            className="status-hex-frame w-full h-full flex items-center justify-center"
            style={{
              backgroundColor: '#251015',
            }}
          >
            {renderGlyph()}
          </span>
        </span>
      ) : (
        <span
          data-testid="status-icon-frame"
          data-frame-shape="rounded-square"
          className="w-full h-full rounded-[4px] flex items-center justify-center"
          style={{
            border: `1.5px solid ${baseColor}`,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
          }}
        >
          {renderGlyph()}
        </span>
      )}

      {/* Arrow Badge (buff = up, debuff = down, normal = none) */}
      {showArrowBadge && (kind === 'buff' || kind === 'debuff') && (
        <span
          data-testid="status-arrow-badge"
          data-arrow-dir={kind === 'buff' ? 'up' : 'down'}
          style={{
            width: `${spec.arrowBoxPx}px`,
            height: `${spec.arrowBoxPx}px`,
            backgroundColor: kind === 'buff' ? BUFF_GREEN : DEBUFF_RED,
          }}
          className={`pointer-events-none absolute ${arrowCornerClass} z-10 rounded-full flex items-center justify-center border border-[#070B12] shadow-xs`}
          aria-hidden="true"
        >
          <span
            className="material-symbols-outlined text-white leading-none select-none"
            style={{ fontSize: `${spec.arrowFontPx}px` }}
          >
            {kind === 'buff' ? 'arrow_upward' : 'arrow_downward'}
          </span>
        </span>
      )}

      {/* Turns Left Badge (outside bottom corner so it does not cover the icon) */}
      {hasValidTurns && (
        <span
          data-testid="status-turns-badge"
          style={{ fontSize: `${spec.turnsFontPx}px` }}
          className={`pointer-events-none absolute ${turnsCornerClass} z-20 inline-flex items-center gap-[1px] px-[3px] py-[0.5px] rounded-full bg-[#060A12] border border-slate-500/80 text-slate-100 font-mono-nums font-bold leading-none shadow-sm`}
        >
          <span
            className="material-symbols-outlined text-slate-300 leading-none select-none"
            style={{ fontSize: `${spec.turnsClockPx}px` }}
            aria-hidden="true"
          >
            schedule
          </span>
          <span>{turnsLeft}</span>
        </span>
      )}

      {/* Stack Badge (yellow "x2", ONLY when allowStack=true and stacks >= 2) */}
      {hasStackBadge && (
        <span
          data-testid="status-stack-badge"
          style={{ fontSize: `${spec.stackFontPx}px` }}
          className="pointer-events-none absolute -top-1.5 -right-1.5 z-20 px-[3px] py-[0.5px] rounded-full bg-amber-400 border border-[#060A12] text-slate-950 font-mono-nums font-extrabold leading-none shadow-sm"
        >
          x{Math.floor(stacks)}
        </span>
      )}
    </span>
  );
}
