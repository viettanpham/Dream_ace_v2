import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  formatStatusChipShortValue,
  getCatalogRowForStatus,
  getFirstExpiringTurns,
  getStatusVisualKind,
  sortStatusEffects,
} from '../data/statusIconMap';
import { formatStatusEffectDetail, useI18n } from '../i18n';
import type {
  ActiveStatusEffect,
  CombatUnit,
  IconCatalogModRow,
  StatusBadgeLayout,
} from '../types/game';
import { useIsPhoneWidth } from '../utils/statusDisplayPrefs';
import { BottomSheet } from './BottomSheet';
import { CatalogIcon } from './CatalogIcon';
import { StatusChip } from './StatusChip';

interface FixedStatusAreaProps {
  statuses: readonly ActiveStatusEffect[];
  rows: number;
  unit?: CombatUnit | null;
  unitTitle?: string;
  badgeLayout?: StatusBadgeLayout;
  iconMods?: readonly IconCatalogModRow[] | null;
  showLabels?: boolean;
  /** Default px width when DOM measurement is 0 (e.g. jsdom or initial render) */
  fallbackWidthPx?: number;
  compact?: boolean;
  rootTestId?: string;
  chipTestIdPrefix?: string;
  labelTestIdPrefix?: string;
  overflowTestId?: string;
  className?: string;
}

export const STATUS_ROW_GAP_PX = 14;
const ROW_LINE_HEIGHT_PX = 26;
const AREA_PAD_Y_PX = 6;
const CHIP_COL_GAP_PX = 6;

export function getFixedStatusAreaHeightPx(
  rows: number,
  compact = false
): number {
  const safeRows = Math.max(1, Math.min(5, Math.round(rows)));
  const rowH = compact ? 24 : ROW_LINE_HEIGHT_PX;
  const pad = compact ? 4 : AREA_PAD_Y_PX;
  return safeRows * rowH + Math.max(0, safeRows - 1) * STATUS_ROW_GAP_PX + pad;
}

function estimateChipWidthPx(
  shortText: string,
  showLabels: boolean,
  compact: boolean
): number {
  const iconBox = compact ? 20 : 24;
  if (!showLabels) return iconBox + 10;
  return iconBox + 14 + Math.max(24, Math.round(shortText.length * 6.3));
}

function packStatusChips(
  items: ReadonlyArray<{ status: ActiveStatusEffect; widthPx: number }>,
  containerWidthPx: number,
  maxRows: number
): { visible: ActiveStatusEffect[]; overflowCount: number } {
  if (items.length === 0) return { visible: [], overflowCount: 0 };

  const usableW = Math.max(84, containerWidthPx - 12);
  const safeRows = Math.max(1, Math.min(5, maxRows));
  const overflowChipW = 34;

  const fitsCount = (count: number, withOverflow: boolean): boolean => {
    let row = 1;
    let curW = 0;

    const placeWidth = (w: number): boolean => {
      const clampedW = Math.min(usableW, w);
      const needed = curW === 0 ? clampedW : CHIP_COL_GAP_PX + clampedW;
      if (curW + needed <= usableW) {
        curW += needed;
        return true;
      }
      row += 1;
      if (row > safeRows) return false;
      curW = clampedW;
      return true;
    };

    for (let i = 0; i < count; i += 1) {
      if (!placeWidth(items[i].widthPx)) return false;
    }
    if (withOverflow && !placeWidth(overflowChipW)) {
      return false;
    }
    return true;
  };

  if (fitsCount(items.length, false)) {
    return {
      visible: items.map((x) => x.status),
      overflowCount: 0,
    };
  }

  for (let k = items.length - 1; k >= 1; k -= 1) {
    if (fitsCount(k, true)) {
      return {
        visible: items.slice(0, k).map((x) => x.status),
        overflowCount: items.length - k,
      };
    }
  }

  return {
    visible: [],
    overflowCount: items.length,
  };
}

export function FixedStatusArea({
  statuses,
  rows,
  unit = null,
  unitTitle,
  badgeLayout = 'B',
  iconMods,
  showLabels = true,
  fallbackWidthPx = 280,
  compact = false,
  rootTestId,
  chipTestIdPrefix,
  labelTestIdPrefix,
  overflowTestId,
  className = '',
}: FixedStatusAreaProps) {
  const { lang, t } = useI18n();
  const isPhone = useIsPhoneWidth();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(fallbackWidthPx);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const syncWidth = () => {
      if (el.clientWidth > 0) {
        setMeasuredWidth(el.clientWidth);
      }
    };
    syncWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', syncWidth);
    return () => window.removeEventListener('resize', syncWidth);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDetailOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailOpen]);

  const sorted = useMemo(
    () => sortStatusEffects(statuses, iconMods),
    [statuses, iconMods]
  );

  const packed = useMemo(() => {
    const measured = sorted.map((st) => ({
      status: st,
      widthPx: estimateChipWidthPx(
        formatStatusChipShortValue(lang, st, unit, 1, false),
        showLabels,
        compact
      ),
    }));
    const widthToUse = measuredWidth > 0 ? measuredWidth : fallbackWidthPx;
    return packStatusChips(measured, widthToUse, rows);
  }, [sorted, lang, unit, showLabels, compact, measuredWidth, fallbackWidthPx, rows]);

  const heightPx = getFixedStatusAreaHeightPx(rows, compact);

  const openDetails = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setDetailOpen(true);
  };

  const renderDetailList = () => {
    if (sorted.length === 0) {
      return (
        <div
          data-testid="status-area-detail-empty"
          className="rounded-lg border border-slate-800 bg-[#080D16] px-3 py-2.5 text-xs text-slate-400"
        >
          {t('statusUi.popoverEmpty')}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {sorted.map((st, idx) => {
          const catalogRow = getCatalogRowForStatus(st.type, iconMods);
          const visualKind = getStatusVisualKind(st, catalogRow);
          const detail = formatStatusEffectDetail(lang, st, unit);
          const shortVal = formatStatusChipShortValue(lang, st, unit, 1, false);
          const turns = getFirstExpiringTurns(st, undefined, false);

          return (
            <div
              key={`${st.type}-${idx}`}
              data-testid={`status-detail-item-${st.type}`}
              className={`rounded-lg border px-2.5 py-2 flex items-start gap-2.5 ${
                visualKind === 'debuff'
                  ? 'border-red-500/40 bg-red-950/20'
                  : visualKind === 'buff'
                  ? 'border-emerald-500/40 bg-emerald-950/20'
                  : 'border-slate-700/80 bg-slate-900/70'
              }`}
            >
              <div className="pt-0.5 shrink-0">
                <CatalogIcon
                  row={catalogRow}
                  fallbackStatusType={st.type}
                  kindOverride={visualKind}
                  size="md"
                  badgeLayout={badgeLayout}
                  turnsLeft={turns}
                  stacks={1}
                  allowStack={false}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {detail.label}
                  </span>
                  <span className="text-[11px] font-mono-nums text-slate-300 shrink-0">
                    {turns !== null
                      ? t('statusUi.turnsLabel', { turns })
                      : t('statusUi.turnsInfinite')}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 leading-snug">
                  {detail.fullText}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono-nums text-slate-400">
                  <span>
                    {t('statusUi.valueLabel')}:{' '}
                    <strong className="text-slate-200">{shortVal}</strong>
                  </span>
                  <span>
                    {t('statusUi.stacksLabel')}: <strong className="text-slate-200">1</strong>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div
        ref={areaRef}
        data-testid={rootTestId}
        data-status-area-rows={rows}
        data-status-count={sorted.length}
        role="button"
        tabIndex={0}
        aria-label={t('statusUi.popoverTitle')}
        onClick={openDetails}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setDetailOpen(true);
          }
        }}
        style={{
          height: `${heightPx}px`,
          minHeight: `${heightPx}px`,
          maxHeight: `${heightPx}px`,
          rowGap: `${STATUS_ROW_GAP_PX}px`,
          columnGap: `${CHIP_COL_GAP_PX}px`,
        }}
        className={`w-full min-w-0 flex flex-wrap content-start items-start overflow-hidden py-[3px] px-0.5 rounded cursor-pointer hover:bg-slate-800/30 transition-colors ${className}`}
      >
        {packed.visible.map((st, idx) => (
          <StatusChip
            key={`${st.type}-${idx}`}
            status={st}
            lang={lang}
            unit={unit}
            badgeLayout={badgeLayout}
            iconMods={iconMods}
            size={compact ? 'xs' : 'sm'}
            showLabel={showLabels}
            allowStack={false}
            stacks={1}
            testId={chipTestIdPrefix ? `${chipTestIdPrefix}-${idx}` : undefined}
            labelTestId={
              labelTestIdPrefix ? `${labelTestIdPrefix}-${idx}` : undefined
            }
          />
        ))}

        {packed.overflowCount > 0 && (
          <span
            data-testid={overflowTestId}
            className="inline-flex items-center justify-center h-[22px] px-1.5 rounded border border-slate-600/80 bg-slate-900 text-[10px] font-mono-nums font-bold text-slate-200 shrink-0"
          >
            +{packed.overflowCount}
          </span>
        )}
      </div>

      {/* Responsive full effect list: BottomSheet on phone <= 640px, Popover Modal on desktop > 640px */}
      {isPhone ? (
        <BottomSheet
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={unitTitle ? `${unitTitle} — ${t('statusUi.popoverTitle')}` : t('statusUi.popoverTitle')}
        >
          <div data-testid="status-area-sheet-body" onClick={(e) => e.stopPropagation()}>
            {renderDetailList()}
          </div>
        </BottomSheet>
      ) : (
        detailOpen && (
          <div
            data-testid="status-area-popover-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              data-testid="status-area-popover"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl border border-slate-700 bg-[#0A101B] text-slate-100 shadow-2xl overflow-hidden"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-800 bg-[#0E1624] flex items-center justify-between gap-2 shrink-0">
                <span className="font-display text-sm font-bold text-slate-100 truncate">
                  {unitTitle
                    ? `${unitTitle} — ${t('statusUi.popoverTitle')}`
                    : t('statusUi.popoverTitle')}
                </span>
                <button
                  type="button"
                  data-testid="status-area-popover-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailOpen(false);
                  }}
                  aria-label={t('common.close')}
                  className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 inline-flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto tactical-scroll">
                {renderDetailList()}
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}
