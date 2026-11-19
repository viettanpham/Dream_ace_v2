import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  HeartHandshake,
  Shield,
  Skull,
  Zap,
} from 'lucide-react';
import { buildTurnQueue } from '../engine/combat';
import { getTeamTagLabel, useI18n } from '../i18n';
import type {
  BattleState,
  MechClassId,
  TeamColorRole,
  TurnQueueEntry,
} from '../types/game';

interface TurnQueueBarProps {
  battle: BattleState;
  bypassFx: boolean;
}

const MAX_NEXT_ROUND_COLLAPSED = 4;

function ClassMiniIcon({
  classId,
  isBoss,
}: {
  classId: MechClassId;
  isBoss: boolean;
}) {
  const cls = 'w-3 h-3 shrink-0';
  if (isBoss) return <Skull className={cls} />;
  switch (classId) {
    case 'striker':
      return <Crosshair className={cls} />;
    case 'interceptor':
      return <Zap className={cls} />;
    case 'siege':
      return <Shield className={cls} />;
    case 'support':
      return <HeartHandshake className={cls} />;
  }
}

function getTeamCssVars(role: TeamColorRole): {
  accent: string;
  bg: string;
  border: string;
} {
  switch (role) {
    case 'me':
      return {
        accent: 'var(--team-me)',
        bg: 'var(--team-me-bg)',
        border: 'var(--team-me-border)',
      };
    case 'ally':
      return {
        accent: 'var(--team-ally)',
        bg: 'var(--team-ally-bg)',
        border: 'var(--team-ally-border)',
      };
    case 'boss':
      return {
        accent: 'var(--team-boss)',
        bg: 'var(--team-boss-bg)',
        border: 'var(--team-boss-border)',
      };
    case 'enemy':
    default:
      return {
        accent: 'var(--team-enemy)',
        bg: 'var(--team-enemy-bg)',
        border: 'var(--team-enemy-border)',
      };
  }
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function QueueChip({
  entry,
  chipKey,
  expanded,
  onToggleExpand,
  activeRef,
  bypassFx,
}: {
  entry: TurnQueueEntry;
  chipKey: string;
  expanded: boolean;
  onToggleExpand: (key: string) => void;
  activeRef?: React.RefObject<HTMLButtonElement | null>;
  bypassFx: boolean;
}) {
  const { lang, t } = useI18n();
  const team = getTeamCssVars(entry.teamRole);
  const teamTag = getTeamTagLabel(lang, entry.teamRole);
  const displayName = entry.isPlayer
    ? t('battle.youSuffix', { name: entry.name })
    : entry.name;
  const isCurrent = entry.phase === 'current';
  const isActed = entry.phase === 'acted';
  const isNextRound = entry.phase === 'next_round';

  const tooltipText = `${teamTag} ${displayName} · SPD ${entry.effectiveSpeed}${
    isActed ? ` (${t('queue.actedHint')})` : ''
  }`;

  return (
    <div className="relative flex flex-col items-center shrink-0 pt-2.5">
      {/* Pulsing ▼ marker strictly above the CURRENTLY ACTING chip */}
      {isCurrent && (
        <span
          aria-hidden="true"
          className={`absolute top-0 left-1/2 -translate-x-1/2 text-[10px] leading-none font-bold ${
            bypassFx ? '' : 'anim-turn-arrow'
          }`}
          style={{ color: 'var(--turn-active)' }}
        >
          ▼
        </span>
      )}

      <button
        ref={isCurrent ? activeRef : undefined}
        type="button"
        onClick={() => onToggleExpand(chipKey)}
        title={tooltipText}
        aria-current={isCurrent ? 'step' : undefined}
        style={
          isCurrent
            ? {
                borderColor: 'var(--turn-active)',
                backgroundColor: 'var(--turn-active-bg)',
              }
            : {
                borderColor: team.border,
                backgroundColor: team.bg,
              }
        }
        className={`group relative rounded-md border px-2 py-1 text-left transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
          isCurrent
            ? `scale-105 z-10 ${bypassFx ? '' : 'anim-turn-active'}`
            : isActed
            ? 'opacity-45 saturate-75 hover:opacity-75'
            : isNextRound
            ? 'opacity-80 hover:opacity-100'
            : 'hover:brightness-110'
        }`}
      >
        {/* Line 1: Colorblind-safe Team Tag + Active / Acted state */}
        <div className="flex items-center justify-between gap-1.5 leading-none">
          <span
            className="text-[9px] font-mono-nums font-bold tracking-wider uppercase whitespace-nowrap"
            style={{ color: team.accent }}
          >
            {teamTag}
          </span>
          {isCurrent ? (
            <span
              className="text-[9px] font-mono-nums font-extrabold tracking-wider uppercase whitespace-nowrap"
              style={{ color: 'var(--turn-active-text)' }}
            >
              {t('queue.actingLabel')}
            </span>
          ) : isActed ? (
            <span className="text-[9px] text-slate-400 whitespace-nowrap hidden sm:inline">
              {t('queue.actedHint')}
            </span>
          ) : null}
        </div>

        {/* Line 2: Class Icon + Name (compact initials on mobile unless expanded/current) + Speed */}
        <div className="mt-1 flex items-center gap-1.5 leading-none">
          <span style={{ color: team.accent }}>
            <ClassMiniIcon classId={entry.classId} isBoss={entry.isBoss} />
          </span>

          {/* Desktop name (truncated cleanly, never mid-word clip) */}
          <span
            className={`hidden sm:inline text-[11px] font-semibold truncate max-w-[112px] ${
              isCurrent ? 'text-[#fefce8]' : 'text-slate-100'
            }`}
          >
            {displayName}
          </span>

          {/* Mobile compact initials (expands to full name on tap or when active) */}
          <span
            className={`sm:hidden text-[11px] font-semibold whitespace-nowrap ${
              isCurrent ? 'text-[#fefce8]' : 'text-slate-100'
            }`}
          >
            {expanded || isCurrent ? displayName : getInitials(entry.name)}
          </span>

          <span
            className={`font-mono-nums text-[10px] font-semibold whitespace-nowrap ${
              entry.isSlowed
                ? 'text-cyan-300'
                : entry.isSpeedBoosted
                ? 'text-emerald-300'
                : isCurrent
                ? 'text-[#fef08a]'
                : 'text-slate-300'
            }`}
          >
            <span className={expanded || isCurrent ? 'inline' : 'hidden sm:inline'}>
              SPD{' '}
            </span>
            {entry.effectiveSpeed}
          </span>
        </div>
      </button>
    </div>
  );
}

export function TurnQueueBar({ battle, bypassFx }: TurnQueueBarProps) {
  const { lang, t } = useI18n();
  const [expandedChipKey, setExpandedChipKey] = useState<string | null>(null);
  const [showAllNextRound, setShowAllNextRound] = useState(false);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  const queue = useMemo(() => buildTurnQueue(battle), [battle]);

  // Auto-scroll active chip into view whenever active actor or round changes
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: bypassFx ? 'auto' : 'smooth',
    });
  }, [queue.current?.unitId, queue.round, bypassFx]);

  const toggleExpand = (key: string) => {
    setExpandedChipKey((prev) => (prev === key ? null : key));
  };

  const visibleNextRound = showAllNextRound
    ? queue.nextRound
    : queue.nextRound.slice(0, MAX_NEXT_ROUND_COLLAPSED);
  const hiddenNextRoundCount = Math.max(
    0,
    queue.nextRound.length - visibleNextRound.length
  );

  const activeTeam = queue.current
    ? getTeamCssVars(queue.current.teamRole)
    : null;
  const activeTag = queue.current
    ? getTeamTagLabel(lang, queue.current.teamRole)
    : '';
  const activeDisplayName = queue.current
    ? queue.current.isPlayer
      ? t('battle.youSuffix', { name: queue.current.name })
      : queue.current.name
    : '';

  return (
    <div className="space-y-1.5 min-w-0 flex-1">
      {/* Row 1: Round indicator + Explicit Active Actor Banner */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <span className="font-display text-sm font-bold tracking-wider uppercase text-slate-100 whitespace-nowrap">
          {t('battle.round', { round: queue.round })}
        </span>

        {queue.current && activeTeam && !battle.summary && (
          <div
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold"
            style={{
              borderColor: 'var(--turn-active)',
              backgroundColor: 'var(--turn-active-bg)',
              color: 'var(--turn-active-text)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: activeTeam.accent }}
            />
            <span className="truncate max-w-[260px] sm:max-w-none">
              {t('queue.actingBanner', {
                tag: activeTag,
                name: activeDisplayName,
              })}
            </span>
            <span className="font-mono-nums text-[10px] opacity-85 whitespace-nowrap">
              · SPD {queue.current.effectiveSpeed}
            </span>
          </div>
        )}
      </div>

      {/* Row 2: Scrollable Turn Queue Track (Acted -> Current -> Upcoming | Round N+1 Preview) */}
      <div
        className="flex items-end gap-1.5 overflow-x-auto pb-1 tactical-scroll"
        aria-label={t('battle.turnOrder')}
      >
        {/* Already acted this round (dimmed) */}
        {queue.acted.map((entry) => {
          const key = `acted_${entry.unitId}`;
          return (
            <QueueChip
              key={key}
              chipKey={key}
              entry={entry}
              expanded={expandedChipKey === key}
              onToggleExpand={toggleExpand}
              bypassFx={bypassFx}
            />
          );
        })}

        {/* Currently acting unit (gold-white frame + pulsing ▼) */}
        {queue.current && (
          <QueueChip
            key={`current_${queue.current.unitId}`}
            chipKey={`current_${queue.current.unitId}`}
            entry={queue.current}
            expanded={expandedChipKey === `current_${queue.current.unitId}`}
            onToggleExpand={toggleExpand}
            activeRef={activeChipRef}
            bypassFx={bypassFx}
          />
        )}

        {/* Upcoming units this round (strictly Speed DESC) */}
        {queue.upcoming.map((entry) => {
          const key = `up_${entry.unitId}`;
          return (
            <QueueChip
              key={key}
              chipKey={key}
              entry={entry}
              expanded={expandedChipKey === key}
              onToggleExpand={toggleExpand}
              bypassFx={bypassFx}
            />
          );
        })}

        {/* Thin Round N+1 Divider + Next Round Preview */}
        {queue.nextRound.length > 0 && (
          <>
            <div
              className="shrink-0 flex flex-col items-center justify-center px-1.5 pb-1 pt-2.5 select-none"
              aria-label={t('queue.nextRoundDivider', { round: queue.round + 1 })}
            >
              <div className="h-9 border-l border-dashed border-slate-600/80 pl-2 flex flex-col justify-center">
                <span className="font-mono-nums text-[9px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  {t('queue.nextRoundDivider', { round: queue.round + 1 })}
                </span>
              </div>
            </div>

            {visibleNextRound.map((entry) => {
              const key = `next_${entry.unitId}`;
              return (
                <QueueChip
                  key={key}
                  chipKey={key}
                  entry={entry}
                  expanded={expandedChipKey === key}
                  onToggleExpand={toggleExpand}
                  bypassFx={bypassFx}
                />
              );
            })}

            {hiddenNextRoundCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllNextRound(true)}
                className="shrink-0 mt-2.5 h-[42px] px-2.5 rounded-md border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-[11px] font-mono-nums font-semibold text-slate-300 cursor-pointer whitespace-nowrap"
              >
                {t('queue.overflowMore', { count: hiddenNextRoundCount })}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
