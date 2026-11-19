import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { formatCombatLogMessage, getLogTagLabel, useI18n } from '../i18n';
import type { CombatLogEntry } from '../types/game';
import {
  computeStickScrollState,
  DEFAULT_BOTTOM_THRESHOLD_PX,
} from '../utils/scrollStick';

interface CombatLogListProps {
  entries: CombatLogEntry[];
  /** Pass `true` when visible (e.g., modal/drawer open) so opening jumps cleanly to bottom if pinned */
  active?: boolean;
  /** Compact density for desktop dock vs larger touch-friendly text for mobile sheet */
  density?: 'compact' | 'comfortable';
  className?: string;
}

function getLogActorColor(entry: CombatLogEntry): string | undefined {
  if (entry.actorIsPlayer) return 'var(--team-me)';
  if (entry.actorSide === 'ally') return 'var(--team-ally)';
  if (entry.actorIsBoss) return 'var(--team-boss)';
  if (entry.actorSide === 'enemy') return 'var(--team-enemy)';
  return undefined;
}

function getLogTagStyle(tag: CombatLogEntry['tag']): string {
  switch (tag) {
    case 'CRIT':
      return 'text-amber-400';
    case 'KO':
      return 'text-red-400';
    case 'SHIELD':
      return 'text-sky-400';
    case 'HEAL':
      return 'text-emerald-400';
    case 'DEFEND':
      return 'text-sky-300';
    case 'STATUS':
      return 'text-orange-400';
    case 'EVADE':
      return 'text-slate-300';
    case 'SKILL':
      return 'text-amber-300';
    case 'ATTACK':
      return 'text-slate-300';
    default:
      return 'text-slate-400';
  }
}

/**
 * Reusable stick-to-bottom Combat Log list for both Desktop panel and Mobile Expand Log drawer.
 * - Uses direct scrollTop = scrollHeight inside useLayoutEffect (+ rAF for 5x/10x bursts).
 * - Automatically pauses sticking if user scrolls up > 24px and shows a "Jump to latest" button.
 * - Uses stable entry.id keys and never resets scrollTop on unrelated re-renders.
 */
export function CombatLogList({
  entries,
  active = true,
  density = 'compact',
  className = '',
}: CombatLogListProps) {
  const { lang, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false);

  const lastEntryId =
    entries.length > 0 ? entries[entries.length - 1].id : 'empty';

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = computeStickScrollState(
      {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
      },
      DEFAULT_BOTTOM_THRESHOLD_PX
    );
    isAtBottomRef.current = next.isAtBottom;
    setShowJumpToLatest((prev) =>
      prev === next.showJumpToLatest ? prev : next.showJumpToLatest
    );
  }, []);

  const handleJumpToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
    scrollToBottom();
  }, [scrollToBottom]);

  // Stick to bottom whenever new log entries arrive (or drawer opens), ONLY while pinned to bottom
  useLayoutEffect(() => {
    if (!active || !isAtBottomRef.current) return;
    scrollToBottom();

    // Schedule a follow-up rAF so rapid multi-event bursts (5x / 10x) stay pinned after layout paint
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const rafId = window.requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom();
        }
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [active, entries.length, lastEntryId, scrollToBottom]);

  const isCompact = density === 'compact';

  return (
    <div className={`relative flex-1 min-h-0 flex flex-col ${className}`}>
      <div
        ref={scrollRef}
        data-testid="combat-log-scroll"
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain tactical-scroll ${
          isCompact
            ? 'px-3 py-2 space-y-1.5 text-[13px]'
            : 'p-4 space-y-2 text-[14px]'
        }`}
      >
        {entries.map((entry) => {
          const actorColor = getLogActorColor(entry);
          return (
            <div
              key={entry.id}
              data-testid="combat-log-entry"
              className="leading-snug flex items-baseline gap-2"
            >
              <span className="font-mono-nums text-slate-500 shrink-0 text-[12px]">
                R{entry.round}
              </span>
              <span
                className={`font-mono-nums font-semibold shrink-0 w-14 text-[12px] ${getLogTagStyle(
                  entry.tag
                )}`}
              >
                {getLogTagLabel(lang, entry.tag)}
              </span>
              <span
                className={isCompact ? 'text-slate-200' : 'text-slate-100'}
                style={
                  actorColor
                    ? {
                        borderLeft: `2px solid ${actorColor}`,
                        paddingLeft: isCompact ? '6px' : '8px',
                      }
                    : undefined
                }
              >
                {formatCombatLogMessage(lang, entry)}
              </span>
            </div>
          );
        })}
      </div>

      {showJumpToLatest && entries.length > 0 && (
        <button
          type="button"
          data-testid="combat-log-jump-latest"
          onClick={handleJumpToLatest}
          className="absolute right-3 bottom-2 z-10 min-h-[44px] px-3.5 py-1.5 rounded-full border border-sky-400/70 bg-sky-500/95 hover:bg-sky-400 text-slate-950 font-semibold text-[13px] shadow-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <ArrowDown className="w-4 h-4 shrink-0" />
          <span>{t('battle.jumpToLatest')}</span>
        </button>
      )}
    </div>
  );
}
