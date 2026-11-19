import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Flame,
  ListOrdered,
  Swords,
  TrendingDown,
  TrendingUp,
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
import { BottomSheet } from './BottomSheet';

interface TurnQueueBarProps {
  battle: BattleState;
  battleSpeed: BattleSpeed;
  skipAnimations: boolean;
  enrageBonusPct: number;
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

function getCompactInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
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
        onClick={() => onInspect(entry)}
        title={fullTooltip}
        aria-label={fullTooltip}
        className={`relative shrink-0 rounded-md border-2 bg-amber-400/18 text-left transition-colors cursor-pointer select-none ${
          compactPhone ? 'w-[96px] px-1.5 py-1' : 'w-[146px] px-2 py-1'
        } ${animateShift ? 'anim-conveyor-shift' : ''}`}
        style={{
          borderColor: 'var(--turn-active)',
          boxShadow:
            '0 0 12px rgba(254, 240, 138, 0.35), inset 0 0 8px rgba(254, 240, 138, 0.14)',
        }}
      >
        {/* Pulsing ▼ marker */}
        <span
          className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] leading-none text-amber-200 ${
            animateShift ? 'animate-bounce' : ''
          }`}
          aria-hidden="true"
        >
          ▼
        </span>

        <div className="flex items-center justify-between gap-1 text-[9px] font-bold tracking-wider uppercase">
          <span
            className="px-1 py-0.2 rounded-sm leading-tight truncate"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              color: teamColor,
              border: `1px solid ${teamColor}`,
            }}
          >
            {compactPhone ? getClassGlyph(entry.classId) : teamTag}
          </span>
          <span className="text-amber-200 truncate">{t('queue.actingNow')}</span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="text-[11px] font-bold text-white truncate">
            {compactPhone ? getCompactInitials(entry.name) : entry.name}
          </span>
          <span
            className={`font-mono-nums text-[10px] font-bold shrink-0 inline-flex items-center gap-0.5 ${speedColor}`}
          >
            {entry.isSlowed && <TrendingDown className="w-2.5 h-2.5 text-red-400" />}
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
      onClick={() => onInspect(entry)}
      title={fullTooltip}
      aria-label={fullTooltip}
      className={`shrink-0 rounded border bg-[#0E1522] hover:bg-slate-800/80 text-left cursor-pointer select-none ${
        compactPhone ? 'w-[62px] px-1.5 py-1' : 'w-[122px] px-1.5 py-1'
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
          <div className="flex items-center gap-0.5 text-[10px] font-bold">
            <span style={{ color: teamColor }}>{getClassGlyph(entry.classId)}</span>
            <span className="text-slate-100 truncate">
              {getCompactInitials(entry.name)}
            </span>
          </div>
          <span className={`font-mono-nums text-[10px] ${speedColor}`}>
            {entry.effectiveSpeed}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 text-[11px] leading-tight">
          <span
            className="text-[9px] font-bold shrink-0"
            style={{ color: teamColor }}
          >
            {teamTag}
          </span>
          <span className="text-slate-200 font-medium truncate flex-1">
            {entry.name}
          </span>
          <span
            className={`font-mono-nums text-[10px] font-semibold shrink-0 inline-flex items-center gap-0.5 ${speedColor}`}
          >
            {entry.isSlowed && <TrendingDown className="w-2.5 h-2.5 text-red-400" />}
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
 * Conveyor-style Turn Queue Bar:
 * [Round N] [In combat] [Enrage?]  chip1(ACTING) chip2... | Round N+1 | next1 next2... [+N]
 * - Zero horizontal scroll, zero auto-scroll.
 * - Uses ResizeObserver to fit exact number of fixed-width chips + overflow "+N" popover/sheet.
 * - Brief shift animation at 1x-2x (when !skipAnimations); instant at 3x+ or skipAnimations.
 */
export function TurnQueueBar({
  battle,
  battleSpeed,
  skipAnimations,
  enrageBonusPct,
}: TurnQueueBarProps) {
  const { lang, t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(560);
  const [isPhone, setIsPhone] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [inspectedEntry, setInspectedEntry] = useState<TurnQueueEntry | null>(null);

  const animateShift = battleSpeed <= 2 && !skipAnimations;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === 'number' && w > 0) {
        setTrackWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const queue = useMemo(() => buildTurnQueue(battle), [battle]);

  // Conveyor items (NO acted units at the front!)
  const currentRoundChips = useMemo(() => {
    const list: TurnQueueEntry[] = [];
    if (queue.current) list.push(queue.current);
    list.push(...queue.upcoming);
    return list;
  }, [queue]);

  const nextRoundChips = queue.nextRound;

  // Compute exact visible chip budget from measured container width
  const { visibleCurrent, visibleNext, showDivider, hiddenCount } = useMemo(() => {
    const activeW = isPhone ? 102 : 152;
    const chipW = isPhone ? 68 : 128;
    const dividerW = isPhone ? 58 : 82;
    const overflowBtnW = 48;

    const totalChips = currentRoundChips.length + nextRoundChips.length;
    if (totalChips === 0) {
      return {
        visibleCurrent: [] as TurnQueueEntry[],
        visibleNext: [] as TurnQueueEntry[],
        showDivider: false,
        hiddenCount: 0,
      };
    }

    // Reserve space for overflow chip if total exceeds budget
    const fullRequiredW =
      (currentRoundChips.length > 0 ? activeW : 0) +
      Math.max(0, currentRoundChips.length - 1) * chipW +
      (nextRoundChips.length > 0 ? dividerW : 0) +
      nextRoundChips.length * chipW;

    const needsOverflow = fullRequiredW > trackWidth;
    let remainingW = Math.max(
      activeW,
      trackWidth - (needsOverflow ? overflowBtnW : 0)
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

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      {/* Left Header Badges: [Round N] [In combat] [Enrage?] */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="px-2 py-1 rounded bg-slate-900 border border-slate-700 font-mono-nums text-[11px] font-bold text-slate-100 whitespace-nowrap">
          {t('battle.round', { round: queue.round })}
        </span>

        {!battle.summary && (
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/12 border border-sky-500/35 text-[11px] font-semibold text-sky-300 whitespace-nowrap">
            <Swords className="w-3 h-3" />
            <span>{t('queue.inCombat')}</span>
          </span>
        )}

        {enragePct > 0 && (
          <span
            title={t('queue.enrageTooltip', { pct: enragePct, mult: enrageMult })}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 border border-red-500/70 text-[11px] font-mono-nums font-bold text-red-200 whitespace-nowrap animate-pulse"
          >
            <Flame className="w-3 h-3 text-orange-400 shrink-0" />
            <span>{t('queue.enrageBadge', { pct: enragePct })}</span>
            <span className="hidden sm:inline text-orange-300">({enrageMult}x)</span>
          </span>
        )}
      </div>

      {/* Fixed-Width Non-Scrolling Conveyor Track */}
      <div
        ref={trackRef}
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
            onInspect={setInspectedEntry}
          />
        ))}

        {showDivider && (
          <div className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded border border-dashed border-slate-700 bg-slate-950/90 text-[10px] font-mono-nums font-semibold text-slate-400 whitespace-nowrap">
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
            onInspect={setInspectedEntry}
          />
        ))}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setOverflowOpen(true)}
            title={t('queue.overflowHint', { count: hiddenCount })}
            aria-label={t('queue.overflowHint', { count: hiddenCount })}
            className="shrink-0 min-h-[34px] min-w-[40px] px-2 rounded border border-slate-600 bg-slate-900 hover:bg-slate-800 hover:border-amber-400/60 text-[11px] font-mono-nums font-bold text-amber-300 inline-flex items-center justify-center gap-0.5 cursor-pointer"
          >
            <span>+{hiddenCount}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Full Conveyor Queue Popover / BottomSheet */}
      <BottomSheet
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        title={t('queue.fullQueueTitle')}
        subtitle={t('battle.round', { round: queue.round })}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
              <ListOrdered className="w-3.5 h-3.5" />
              <span>{t('queue.currentRoundGroup', { round: queue.round })}</span>
            </div>
            <div className="space-y-1.5">
              {currentRoundChips.map((entry, idx) => {
                const color = getTeamCssVar(entry.teamRole);
                const isFirst = idx === 0 && !battle.summary;
                return (
                  <div
                    key={`sheet-cur-${entry.unitId}`}
                    className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                      isFirst
                        ? 'border-amber-300 bg-amber-400/15'
                        : 'border-slate-800 bg-[#0A101B]'
                    }`}
                    style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className="text-xs font-bold shrink-0"
                        style={{ color }}
                      >
                        {getTeamTagLabel(lang, entry.teamRole)}
                      </span>
                      <span className="text-sm font-semibold text-slate-100 truncate">
                        {entry.name}
                      </span>
                      {isFirst && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-300 text-slate-950 text-[10px] font-bold uppercase">
                          {t('queue.actingNow')}
                        </span>
                      )}
                    </div>
                    <div className="font-mono-nums text-xs text-slate-300 shrink-0">
                      {t('queue.speedLabel')} {entry.effectiveSpeed}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('queue.nextRoundGroup', { round: queue.round + 1 })}
            </div>
            <div className="space-y-1.5">
              {nextRoundChips.map((entry) => {
                const color = getTeamCssVar(entry.teamRole);
                return (
                  <div
                    key={`sheet-next-${entry.unitId}`}
                    className="rounded-lg border border-slate-800/80 bg-[#090E18] px-3 py-2 flex items-center justify-between gap-2"
                    style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className="text-xs font-bold shrink-0"
                        style={{ color }}
                      >
                        {getTeamTagLabel(lang, entry.teamRole)}
                      </span>
                      <span className="text-sm text-slate-200 truncate">
                        {entry.name}
                      </span>
                    </div>
                    <div className="font-mono-nums text-xs text-slate-400 shrink-0">
                      {t('queue.speedLabel')} {entry.effectiveSpeed}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Tap-to-inspect chip full name sheet (for mobile/long names) */}
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
          <div className="rounded-lg border border-slate-800 bg-[#0A101B] p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('queue.speedLabel')}</span>
              <span className="font-mono-nums font-bold text-slate-100">
                {inspectedEntry.effectiveSpeed} (Base {inspectedEntry.baseSpeed})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('battle.round', { round: queue.round })}</span>
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
