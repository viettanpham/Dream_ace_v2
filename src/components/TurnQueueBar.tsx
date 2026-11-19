import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Flame,
  ListOrdered,
  Swords,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { buildTurnQueue } from '../engine/combat';
import { getClassName, getTeamTagLabel, useI18n } from '../i18n';
import type {
  BattleSpeed,
  BattleState,
  MechClassId,
  TeamColorRole,
  TurnQueueEntry,
} from '../types/game';
import { formatShortUnitName } from '../utils/battleDisplay';
import { BottomSheet } from './BottomSheet';

export type TurnQueueVariant = 'default' | 'phone' | 'sidebar';

interface TurnQueueBarProps {
  battle: BattleState;
  battleSpeed: BattleSpeed;
  skipAnimations: boolean;
  enrageBonusPct: number;
  variant?: TurnQueueVariant;
  targetName?: string | null;
  onSelectUnit?: (unitId: string) => void;
}

function getTeamCssVar(role: TeamColorRole): string {
  switch (role) {
    case 'me':
      return 'var(--team-me)';
    case 'ally':
      return 'var(--team-ally)';
    case 'boss':
      return 'var(--team-boss)';
    case 'enemy':
    default:
      return 'var(--team-enemy)';
  }
}

function getClassGlyph(classId: MechClassId): string {
  switch (classId) {
    case 'striker':
      return '▲';
    case 'interceptor':
      return '◆';
    case 'siege':
      return '■';
    case 'support':
      return '✚';
  }
}

function ConveyorChip({
  entry,
  isActive,
  compactPhone,
  animateShift,
  onInspect,
}: {
  entry: TurnQueueEntry;
  isActive: boolean;
  compactPhone: boolean;
  animateShift: boolean;
  onInspect: (entry: TurnQueueEntry) => void;
}) {
  const { lang, t } = useI18n();
  const teamColor = getTeamCssVar(entry.teamRole);
  const teamTag = getTeamTagLabel(lang, entry.teamRole);
  const fullTooltip = `${teamTag} ${entry.name} (${getClassName(
    lang,
    entry.classId
  )}) · ${t('queue.speedLabel')} ${entry.effectiveSpeed}`;

  const speedColor = entry.isSlowed
    ? 'text-red-300'
    : entry.isSpeedBoosted
    ? 'text-emerald-300'
    : isActive
    ? 'text-amber-100'
    : 'text-slate-300';

  if (isActive) {
    return (
      <button
        type="button"
        data-testid="turn-queue-chip"
        data-unit-id={entry.unitId}
        data-acting="true"
        data-phase={entry.phase}
        onClick={() => onInspect(entry)}
        title={fullTooltip}
        aria-label={fullTooltip}
        className={`relative shrink-0 rounded-md border-2 bg-amber-400/18 text-left transition-colors cursor-pointer select-none ${
          compactPhone ? 'w-[104px] px-1.5 py-1' : 'w-[156px] px-2 py-1'
        } ${animateShift ? 'anim-conveyor-shift' : ''}`}
        style={{
          borderColor: 'var(--turn-active)',
          boxShadow:
            '0 0 12px rgba(254, 240, 138, 0.35), inset 0 0 8px rgba(254, 240, 138, 0.14)',
        }}
      >
        <span
          className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] leading-none text-amber-200 ${
            animateShift ? 'anim-turn-arrow' : ''
          }`}
          aria-hidden="true"
        >
          ▼
        </span>

        <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider uppercase">
          <span
            className="px-1 rounded-sm leading-tight truncate"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              color: teamColor,
              border: `1px solid ${teamColor}`,
            }}
          >
            {compactPhone ? getClassGlyph(entry.classId) : teamTag}
          </span>
          <span className="text-amber-200 truncate">{t('queue.actingNow')}</span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="text-[12px] font-bold text-white truncate">
            {compactPhone ? formatShortUnitName(entry.name, 8) : entry.name}
          </span>
          <span
            className={`font-mono-nums text-[11px] font-bold shrink-0 inline-flex items-center gap-0.5 ${speedColor}`}
          >
            {entry.isSlowed && (
              <TrendingDown className="w-2.5 h-2.5 text-red-400" />
            )}
            {entry.isSpeedBoosted && (
              <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
            )}
            {entry.effectiveSpeed}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="turn-queue-chip"
      data-unit-id={entry.unitId}
      data-acting="false"
      data-phase={entry.phase}
      onClick={() => onInspect(entry)}
      title={fullTooltip}
      aria-label={fullTooltip}
      className={`shrink-0 rounded border bg-[#0E1522] hover:bg-slate-800/80 text-left cursor-pointer select-none ${
        compactPhone ? 'w-[68px] px-1.5 py-1' : 'w-[126px] px-1.5 py-1'
      } ${entry.phase === 'next_round' ? 'opacity-85' : ''} ${
        animateShift ? 'anim-conveyor-shift' : ''
      }`}
      style={{
        borderColor: 'rgba(51, 65, 85, 0.9)',
        borderLeftWidth: '3px',
        borderLeftColor: teamColor,
      }}
    >
      {compactPhone ? (
        <div className="flex flex-col items-center justify-center leading-tight">
          <div className="flex items-center gap-0.5 text-[11px] font-bold">
            <span style={{ color: teamColor }}>
              {getClassGlyph(entry.classId)}
            </span>
            <span className="text-slate-100 truncate">
              {formatShortUnitName(entry.name, 6)}
            </span>
          </div>
          <span className={`font-mono-nums text-[10px] ${speedColor}`}>
            {entry.effectiveSpeed}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 text-[12px] leading-tight">
          <span
            className="text-[10px] font-bold shrink-0"
            style={{ color: teamColor }}
          >
            {teamTag}
          </span>
          <span className="text-slate-200 font-medium truncate flex-1">
            {entry.name}
          </span>
          <span
            className={`font-mono-nums text-[11px] font-semibold shrink-0 inline-flex items-center gap-0.5 ${speedColor}`}
          >
            {entry.isSlowed && (
              <TrendingDown className="w-2.5 h-2.5 text-red-400" />
            )}
            {entry.isSpeedBoosted && (
              <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
            )}
            {entry.effectiveSpeed}
          </span>
        </div>
      )}
    </button>
  );
}

/**
 * Turn Queue Bar supporting 3 responsive variants:
 * - 'default': Non-scrolling conveyor track (preserves existing desktop/SSR TurnQueueBar tests).
 * - 'phone': One-line max-44px strip with internal horizontal scroll only, large acting chip ("ACTOR > Target"),
 *            and next 4-5 small chips.
 * - 'sidebar': Compact vertical/grid panel for Tablet/PC right column with hover tooltips.
 */
export function TurnQueueBar({
  battle,
  battleSpeed,
  skipAnimations,
  enrageBonusPct,
  variant = 'default',
  targetName = null,
  onSelectUnit,
}: TurnQueueBarProps) {
  const { lang, t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const popoverAnchorRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(240, window.innerWidth - 220) : 720
  );
  const [isPhone, setIsPhone] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [inspectedEntry, setInspectedEntry] = useState<TurnQueueEntry | null>(
    null
  );

  const animateShift = battleSpeed <= 2 && !skipAnimations;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (variant !== 'default') return;
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const rectW = el.getBoundingClientRect?.().width ?? el.clientWidth;
      if (typeof rectW === 'number' && rectW > 0) {
        setTrackWidth(rectW);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === 'number' && w > 0) {
        setTrackWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

  useEffect(() => {
    if (!overflowOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (
        popoverAnchorRef.current &&
        !popoverAnchorRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [overflowOpen]);

  const queue = useMemo(() => buildTurnQueue(battle), [battle]);
  const currentRoundChips = queue.current;
  const nextRoundChips = queue.next;

  const handleChipClick = (entry: TurnQueueEntry) => {
    if (onSelectUnit) {
      onSelectUnit(entry.unitId);
    } else {
      setInspectedEntry(entry);
    }
  };

  const { visibleCurrent, visibleNext, showDivider, hiddenCount } = useMemo(() => {
    const gap = 6;
    const activeW = (isPhone ? 104 : 156) + gap;
    const chipW = (isPhone ? 68 : 126) + gap;
    const dividerW = (isPhone ? 62 : 84) + gap;
    const overflowBtnW = 54;
    const usableW = Math.max(activeW, trackWidth - 8);

    const totalChips = currentRoundChips.length + nextRoundChips.length;
    if (totalChips === 0) {
      return {
        visibleCurrent: [] as TurnQueueEntry[],
        visibleNext: [] as TurnQueueEntry[],
        showDivider: false,
        hiddenCount: 0,
      };
    }

    const fullRequiredW =
      (currentRoundChips.length > 0 ? activeW : 0) +
      Math.max(0, currentRoundChips.length - 1) * chipW +
      (nextRoundChips.length > 0 ? dividerW : 0) +
      nextRoundChips.length * chipW;

    const needsOverflow = fullRequiredW > usableW;
    let remainingW = Math.max(
      activeW,
      usableW - (needsOverflow ? overflowBtnW : 0)
    );

    const visCur: TurnQueueEntry[] = [];
    const visNext: TurnQueueEntry[] = [];

    for (let i = 0; i < currentRoundChips.length; i++) {
      const cost = i === 0 ? activeW : chipW;
      if (i === 0 || remainingW >= cost) {
        visCur.push(currentRoundChips[i]);
        remainingW -= cost;
      } else {
        break;
      }
    }

    let divVisible = false;
    if (
      visCur.length === currentRoundChips.length &&
      nextRoundChips.length > 0 &&
      remainingW >= dividerW + chipW
    ) {
      divVisible = true;
      remainingW -= dividerW;
      for (let i = 0; i < nextRoundChips.length; i++) {
        if (remainingW >= chipW) {
          visNext.push(nextRoundChips[i]);
          remainingW -= chipW;
        } else {
          break;
        }
      }
    }

    const hidden = totalChips - (visCur.length + visNext.length);
    return {
      visibleCurrent: visCur,
      visibleNext: visNext,
      showDivider: divVisible,
      hiddenCount: Math.max(0, hidden),
    };
  }, [currentRoundChips, nextRoundChips, trackWidth, isPhone]);

  const enragePct = Math.round(enrageBonusPct * 100);
  const enrageMult = (1 + enrageBonusPct).toFixed(1);

  // PHONE ONE-LINE STRIP VARIANT (max 44px, internal scroll only, acting chip "SHORT > Target" + next 4-5 chips)
  if (variant === 'phone') {
    const actingEntry = !battle.summary ? currentRoundChips[0] ?? null : null;
    const upcomingCombined = [
      ...currentRoundChips.slice(actingEntry ? 1 : 0),
      ...nextRoundChips,
    ].slice(0, 5);

    const actorShort = actingEntry ? formatShortUnitName(actingEntry.name, 10) : '';
    const targetShort = targetName ? formatShortUnitName(targetName, 10) : '';
    const actingLabel =
      actingEntry && targetShort
        ? `${actorShort} > ${targetShort}`
        : actorShort;

    return (
      <div
        data-testid="turn-queue-phone-strip"
        className="h-11 max-h-[44px] shrink-0 w-full border-b border-slate-800/80 bg-[#0A0F18]/95 px-2 flex items-center gap-2 overflow-hidden"
      >
        {/* Compact Round Badge */}
        <span
          data-testid="turn-queue-round-chip"
          title={
            enragePct > 0
              ? t('queue.enrageChipTooltip', { pct: enragePct })
              : t('battle.round', { round: queue.round })
          }
          className={`shrink-0 inline-flex items-center gap-1 px-2 h-8 rounded font-mono-nums text-[12px] font-bold whitespace-nowrap ${
            enragePct > 0
              ? 'bg-red-950/75 border border-red-500/65 text-slate-100'
              : 'bg-slate-900 border border-slate-700 text-slate-200'
          }`}
        >
          <span>R{queue.round}</span>
          {enragePct > 0 && (
            <span
              data-testid="turn-queue-enrage-badge"
              className="inline-flex items-center gap-0.5 text-orange-300"
            >
              <Flame className="w-3 h-3 text-orange-400" />
              <span>x{enrageMult}</span>
            </span>
          )}
        </span>

        {/* Inner Horizontally Scrollable Track (never scrolls page) */}
        <div
          data-testid="turn-queue-phone-track"
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto battle-strip-scroll"
          aria-label={t('queue.fullQueueTitle')}
        >
          {actingEntry && (
            <button
              type="button"
              data-testid="turn-queue-acting-chip"
              data-unit-id={actingEntry.unitId}
              data-acting="true"
              onClick={() => handleChipClick(actingEntry)}
              className="shrink-0 h-8 px-2.5 rounded-md border bg-amber-400/18 text-[13px] font-bold text-amber-100 whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                borderColor: 'var(--turn-active)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getTeamCssVar(actingEntry.teamRole) }}
              />
              <span>{actingLabel}</span>
            </button>
          )}

          {upcomingCombined.map((entry, idx) => {
            const color = getTeamCssVar(entry.teamRole);
            return (
              <button
                key={`${entry.phase}-${entry.unitId}-${idx}`}
                type="button"
                data-testid="turn-queue-phone-next-chip"
                data-unit-id={entry.unitId}
                onClick={() => handleChipClick(entry)}
                className={`shrink-0 h-8 px-2 rounded border border-slate-700/90 bg-[#0E1522] text-[12px] font-semibold text-slate-200 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer ${
                  entry.phase === 'next_round' ? 'opacity-75' : ''
                }`}
              >
                <span
                  className="text-[12px] leading-none"
                  style={{ color }}
                  aria-hidden="true"
                >
                  {getClassGlyph(entry.classId)}
                </span>
                <span>{formatShortUnitName(entry.name, 8)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // SIDEBAR VARIANT (Tablet / PC right column)
  if (variant === 'sidebar') {
    const actingEntry = !battle.summary ? currentRoundChips[0] ?? null : null;
    const upcomingList = [
      ...currentRoundChips.slice(actingEntry ? 1 : 0),
      ...nextRoundChips,
    ].slice(0, 6);

    const actingLabel =
      actingEntry && targetName
        ? `${formatShortUnitName(actingEntry.name, 10)} > ${formatShortUnitName(
            targetName,
            10
          )}`
        : actingEntry
        ? actingEntry.name
        : '';

    return (
      <div
        data-testid="turn-queue-sidebar"
        className="rounded-lg border border-slate-800 bg-[#0A101B] p-2 space-y-2 shrink-0"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {!battle.summary && (
              <span
                data-testid="turn-queue-combat-icon"
                title={t('queue.inCombat')}
                aria-label={t('queue.inCombat')}
                className="inline-flex items-center justify-center w-6 h-6 rounded bg-sky-500/12 border border-sky-500/35 text-sky-300 shrink-0"
              >
                <Swords className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            )}
            <span
              data-testid="turn-queue-round-chip"
              title={
                enragePct > 0
                  ? t('queue.enrageChipTooltip', { pct: enragePct })
                  : undefined
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono-nums text-[12px] font-bold whitespace-nowrap ${
                enragePct > 0
                  ? 'bg-red-950/70 border border-red-500/65 text-slate-100'
                  : 'bg-slate-900 border border-slate-700 text-slate-100'
              }`}
            >
              <span>{t('battle.round', { round: queue.round })}</span>
              {enragePct > 0 && (
                <span
                  data-testid="turn-queue-enrage-badge"
                  title={t('queue.enrageChipTooltip', { pct: enragePct })}
                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/25 text-orange-300 text-[12px] font-bold leading-none"
                >
                  <Flame className="w-3 h-3 text-orange-400 shrink-0" />
                  <span>x{enrageMult}</span>
                </span>
              )}
            </span>
          </div>

          <span className="text-[12px] text-slate-400 font-medium truncate">
            {t('battle.turnOrder')}
          </span>
        </div>

        {/* Acting Unit Highlight */}
        {actingEntry && (
          <button
            type="button"
            data-testid="turn-queue-acting-chip"
            data-unit-id={actingEntry.unitId}
            data-acting="true"
            onClick={() => handleChipClick(actingEntry)}
            title={`${getTeamTagLabel(lang, actingEntry.teamRole)} ${
              actingEntry.name
            } (${getClassName(lang, actingEntry.classId)}) · ${t(
              'queue.speedLabel'
            )} ${actingEntry.effectiveSpeed}`}
            className="w-full min-h-[44px] px-2.5 py-1.5 rounded-lg border bg-amber-400/15 hover:bg-amber-400/20 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
            style={{ borderColor: 'var(--turn-active)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="px-1.5 py-0.5 rounded text-[12px] font-mono-nums font-bold shrink-0"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  color: getTeamCssVar(actingEntry.teamRole),
                  border: `1px solid ${getTeamCssVar(actingEntry.teamRole)}`,
                }}
              >
                {getTeamTagLabel(lang, actingEntry.teamRole)}
              </span>
              <span className="text-[13px] font-bold text-amber-100 truncate">
                {actingLabel}
              </span>
            </div>
            <span className="font-mono-nums text-[12px] font-bold text-amber-200 shrink-0">
              SPD {actingEntry.effectiveSpeed}
            </span>
          </button>
        )}

        {/* Upcoming Chips Row */}
        {upcomingList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {upcomingList.map((entry, idx) => {
              const color = getTeamCssVar(entry.teamRole);
              const tip = `${getTeamTagLabel(lang, entry.teamRole)} ${
                entry.name
              } (${getClassName(lang, entry.classId)}) · ${t(
                'queue.speedLabel'
              )} ${entry.effectiveSpeed}`;
              return (
                <button
                  key={`sb-${entry.phase}-${entry.unitId}-${idx}`}
                  type="button"
                  onClick={() => handleChipClick(entry)}
                  title={tip}
                  className={`px-2 py-1 rounded border border-slate-700/90 bg-[#0E1522] hover:bg-slate-800 text-[12px] inline-flex items-center gap-1 cursor-pointer transition-colors ${
                    entry.phase === 'next_round' ? 'opacity-75' : ''
                  }`}
                >
                  <span style={{ color }} aria-hidden="true">
                    {getClassGlyph(entry.classId)}
                  </span>
                  <span className="font-medium text-slate-200 whitespace-nowrap">
                    {formatShortUnitName(entry.name, 9)}
                  </span>
                  <span className="font-mono-nums text-slate-400">
                    {entry.effectiveSpeed}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // DEFAULT CONVEYOR VARIANT (preserves all TurnQueueBar.test.tsx invariants)
  return (
    <div
      data-testid="turn-queue-bar"
      className="relative flex items-center gap-2 min-w-0 w-full"
    >
      {/* Left Header Badges: [Swords icon (tooltip)] [Round N (+ inline flame x1.7 when enraged)] */}
      <div
        data-testid="turn-queue-header"
        className="flex items-center gap-1.5 shrink-0"
      >
        {!battle.summary && (
          <span
            data-testid="turn-queue-combat-icon"
            title={t('queue.inCombat')}
            aria-label={t('queue.inCombat')}
            className="inline-flex items-center justify-center w-7 h-7 rounded bg-sky-500/12 border border-sky-500/35 text-sky-300 shrink-0"
          >
            <Swords className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        )}

        <span
          data-testid="turn-queue-round-chip"
          title={
            enragePct > 0
              ? t('queue.enrageChipTooltip', { pct: enragePct })
              : undefined
          }
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono-nums text-[12px] font-bold whitespace-nowrap ${
            enragePct > 0
              ? 'bg-red-950/70 border border-red-500/65 text-slate-100'
              : 'bg-slate-900 border border-slate-700 text-slate-100'
          }`}
        >
          <span>{t('battle.round', { round: queue.round })}</span>
          {enragePct > 0 && (
            <span
              data-testid="turn-queue-enrage-badge"
              title={t('queue.enrageChipTooltip', { pct: enragePct })}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/25 text-orange-300 text-[11px] font-bold leading-none"
            >
              <Flame className="w-3 h-3 text-orange-400 shrink-0" aria-hidden="true" />
              <span>x{enrageMult}</span>
            </span>
          )}
        </span>
      </div>

      {/* Fixed-Width Non-Scrolling Conveyor Track (overflow-hidden, zero scrollbar, zero auto-scroll) */}
      <div
        ref={trackRef}
        data-testid="turn-queue-track"
        key={animateShift ? `${battle.round}-${battle.activeTurnIndex}` : 'static'}
        className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden pt-2 pb-0.5"
        aria-label={t('queue.fullQueueTitle')}
      >
        {visibleCurrent.map((entry, idx) => (
          <ConveyorChip
            key={`cur-${entry.unitId}`}
            entry={entry}
            isActive={idx === 0 && !battle.summary}
            compactPhone={isPhone}
            animateShift={animateShift}
            onInspect={handleChipClick}
          />
        ))}

        {showDivider && (
          <div
            data-testid="turn-queue-divider"
            className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded border border-dashed border-slate-700 bg-slate-950/90 text-[11px] font-mono-nums font-semibold text-slate-400 whitespace-nowrap"
          >
            <span>{t('queue.nextRound', { round: queue.round + 1 })}</span>
          </div>
        )}

        {visibleNext.map((entry) => (
          <ConveyorChip
            key={`next-${entry.unitId}`}
            entry={entry}
            isActive={false}
            compactPhone={isPhone}
            animateShift={animateShift}
            onInspect={handleChipClick}
          />
        ))}
      </div>

      {/* "+N" Overflow Trigger + Anchored Full-Queue Popover */}
      {hiddenCount > 0 && (
        <div ref={popoverAnchorRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="turn-queue-overflow"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-expanded={overflowOpen}
            aria-haspopup="dialog"
            title={t('queue.overflowHint', { count: hiddenCount })}
            aria-label={t('queue.overflowHint', { count: hiddenCount })}
            className="min-h-[34px] min-w-[44px] px-2 rounded border border-slate-600 bg-slate-900 hover:bg-slate-800 hover:border-amber-400/60 text-[12px] font-mono-nums font-bold text-amber-300 inline-flex items-center justify-center gap-0.5 cursor-pointer"
          >
            <span>+{hiddenCount}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {overflowOpen && (
            <div
              role="dialog"
              data-testid="turn-queue-popover"
              aria-label={t('queue.fullQueueTitle')}
              className="absolute right-0 top-full mt-2 z-50 w-[min(92vw,340px)] max-h-[70vh] flex flex-col rounded-lg border border-slate-700 bg-[#0B111D] shadow-2xl overflow-hidden"
            >
              <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-[#080C15] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-100">
                  <ListOrdered className="w-3.5 h-3.5 text-amber-300" />
                  <span>{t('queue.fullQueueTitle')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOverflowOpen(false)}
                  aria-label={t('common.close')}
                  className="h-8 w-8 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 tactical-scroll">
                <div className="space-y-1.5">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-amber-300">
                    {t('queue.currentRoundGroup', { round: queue.round })}
                  </div>
                  {currentRoundChips.map((entry, idx) => {
                    const color = getTeamCssVar(entry.teamRole);
                    const isFirst = idx === 0 && !battle.summary;
                    return (
                      <div
                        key={`pop-cur-${entry.unitId}`}
                        className={`rounded border px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                          isFirst
                            ? 'border-amber-300 bg-amber-400/15'
                            : 'border-slate-800 bg-[#0A101B]'
                        }`}
                        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span
                            className="text-[12px] font-bold shrink-0"
                            style={{ color }}
                          >
                            {getTeamTagLabel(lang, entry.teamRole)}
                          </span>
                          <span className="text-[13px] font-semibold text-slate-100 truncate">
                            {entry.name}
                          </span>
                          {isFirst && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-300 text-slate-950 text-[11px] font-bold uppercase shrink-0">
                              {t('queue.actingNow')}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-nums text-[12px] text-slate-300 shrink-0">
                          {t('queue.speedLabel')} {entry.effectiveSpeed}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
                    {t('queue.nextRoundGroup', { round: queue.round + 1 })}
                  </div>
                  {nextRoundChips.map((entry) => {
                    const color = getTeamCssVar(entry.teamRole);
                    return (
                      <div
                        key={`pop-next-${entry.unitId}`}
                        className="rounded border border-slate-800/80 bg-[#090E18] px-2.5 py-1.5 flex items-center justify-between gap-2"
                        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span
                            className="text-[12px] font-bold shrink-0"
                            style={{ color }}
                          >
                            {getTeamTagLabel(lang, entry.teamRole)}
                          </span>
                          <span className="text-[13px] text-slate-200 truncate">
                            {entry.name}
                          </span>
                        </div>
                        <div className="font-mono-nums text-[12px] text-slate-400 shrink-0">
                          {t('queue.speedLabel')} {entry.effectiveSpeed}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tap-to-inspect chip full name sheet */}
      <BottomSheet
        open={Boolean(inspectedEntry)}
        onClose={() => setInspectedEntry(null)}
        title={inspectedEntry?.name ?? ''}
        subtitle={
          inspectedEntry
            ? `${getTeamTagLabel(lang, inspectedEntry.teamRole)} · ${getClassName(
                lang,
                inspectedEntry.classId
              )}`
            : undefined
        }
      >
        {inspectedEntry && (
          <div className="rounded-lg border border-slate-800 bg-[#0A101B] p-4 space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('queue.speedLabel')}</span>
              <span className="font-mono-nums font-bold text-slate-100">
                {inspectedEntry.effectiveSpeed} (Base {inspectedEntry.baseSpeed})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">
                {t('battle.round', { round: queue.round })}
              </span>
              <span className="text-amber-300 font-semibold">
                {inspectedEntry.phase === 'current'
                  ? t('queue.actingNow')
                  : inspectedEntry.phase === 'next_round'
                  ? t('queue.nextRound', { round: queue.round + 1 })
                  : t('queue.upcomingLabel')}
              </span>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
