import {
  formatStatusChipShortValue,
  getCatalogRowForStatus,
  getFirstExpiringTurns,
  getStatusVisualKind,
} from '../data/statusIconMap';
import { formatStatusEffectDetail } from '../i18n';
import type {
  ActiveStatusEffect,
  CombatUnit,
  IconCatalogModRow,
  Language,
  StatusBadgeLayout,
} from '../types/game';
import { CatalogIcon, type CatalogIconSize } from './CatalogIcon';

export interface StatusChipProps {
  status: ActiveStatusEffect;
  lang: Language;
  unit?: CombatUnit | null;
  badgeLayout?: StatusBadgeLayout;
  iconMods?: readonly IconCatalogModRow[] | null;
  size?: CatalogIconSize;
  showLabel?: boolean;
  /** Engine currently does not add additive stacks; pass true only when stacked data is supplied */
  allowStack?: boolean;
  stacks?: number;
  stackTurns?: readonly number[];
  testId?: string;
  labelTestId?: string;
  className?: string;
}

/**
 * Shared compact StatusChip:
 * - Renders catalog icon (or neutral Lucide fallback for allowlisted unmapped statuses)
 * - Shows short value text ONLY (e.g. "+30% ST", "+184 HP/lượt") — NO effect name, NO "(N lượt)"
 * - Respects badgeLayout (A/B) for arrow + turns corner placement
 * - Shows yellow "x2" stack badge ONLY when allowStack === true && stacks >= 2
 */
export function StatusChip({
  status,
  lang,
  unit = null,
  badgeLayout = 'B',
  iconMods,
  size = 'sm',
  showLabel = true,
  allowStack = false,
  stacks = 1,
  stackTurns,
  testId,
  labelTestId,
  className = '',
}: StatusChipProps) {
  const catalogRow = getCatalogRowForStatus(status.type, iconMods);
  const visualKind = getStatusVisualKind(status, catalogRow);
  const shortValue = formatStatusChipShortValue(
    lang,
    status,
    unit,
    stacks,
    allowStack
  );
  const turnsLeft = getFirstExpiringTurns(status, stackTurns, allowStack);
  const fullDetail = formatStatusEffectDetail(lang, status, unit);

  const chipTintClass =
    visualKind === 'debuff'
      ? 'border-red-500/45 bg-red-950/35 text-red-100'
      : visualKind === 'buff'
      ? 'border-emerald-500/45 bg-emerald-950/35 text-emerald-100'
      : 'border-slate-600/60 bg-slate-900/75 text-slate-200';

  return (
    <span
      data-testid={testId}
      data-status-type={status.type}
      data-status-kind={visualKind}
      data-badge-layout={badgeLayout}
      title={fullDetail.fullText}
      className={`inline-flex items-center gap-1.5 rounded-md border pl-0.5 pr-1.5 py-0.5 font-mono-nums text-[10px] font-semibold leading-none shrink-0 ${chipTintClass} ${className}`}
    >
      <CatalogIcon
        row={catalogRow}
        fallbackStatusType={status.type}
        kindOverride={visualKind}
        size={size}
        badgeLayout={badgeLayout}
        turnsLeft={turnsLeft}
        stacks={stacks}
        allowStack={allowStack}
      />
      {showLabel && (
        <span
          data-testid={labelTestId}
          className="whitespace-nowrap leading-none"
        >
          {shortValue}
        </span>
      )}
    </span>
  );
}
