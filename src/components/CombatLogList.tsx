import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  Flame,
  Heart,
  MoveHorizontal,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Terminal,
  Zap,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { CombatLogEntry } from '../types/game';
import {
  DOCKED_LOG_MAX_ENTRIES,
  filterCombatLogEntries,
  parseStructuredCombatLogRow,
  POPUP_LOG_PAGE_SIZE,
  type CombatLogActionKind,
  type CombatLogChannel,
  type CombatLogDisplayMode,
  type CombatLogValueTone,
} from '../utils/combatLogFormat';
import {
  computeStickScrollState,
  DEFAULT_BOTTOM_THRESHOLD_PX,
} from '../utils/scrollStick';

interface CombatLogListProps {
  entries: CombatLogEntry[];
  /** Pass `true` when visible (e.g., modal/drawer open) so opening jumps cleanly to bottom if pinned */
  active?: boolean;
  /** Compact density for desktop/phone dock vs larger touch-friendly text for popup sheet */
  density?: 'compact' | 'comfortable';
  /** Docked caps to last 200 entries; popup shows all via "Load older" pagination */
  mode?: CombatLogDisplayMode;
  /** Optional controlled channel filter */
  channel?: CombatLogChannel;
  onChannelChange?: (channel: CombatLogChannel) => void;
  className?: string;
}

const CHANNELS: CombatLogChannel[] = ['all', 'ally', 'enemy', 'system'];

function ActionKindIcon({ kind }: { kind: CombatLogActionKind }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (kind) {
    case 'attack':
      return <Swords className={`${cls} text-slate-300`} aria-hidden="true" />;
    case 'skill':
      return <Zap className={`${cls} text-amber-300`} aria-hidden="true" />;
    case 'heal':
      return <Heart className={`${cls} text-emerald-400`} aria-hidden="true" />;
    case 'shield':
      return <Shield className={`${cls} text-sky-400`} aria-hidden="true" />;
    case 'buff':
      return <Sparkles className={`${cls} text-amber-300`} aria-hidden="true" />;
    case 'debuff':
      return <Flame className={`${cls} text-purple-400`} aria-hidden="true" />;
    case 'kill':
      return <Skull className={`${cls} text-red-400`} aria-hidden="true" />;
    case 'move-row':
      return (
        <MoveHorizontal className={`${cls} text-cyan-300`} aria-hidden="true" />
      );
    case 'system':
    default:
      return <Terminal className={`${cls} text-slate-400`} aria-hidden="true" />;
  }
}

function getFactionDotClass(faction: 'ally' | 'enemy' | 'system'): string {
  if (faction === 'ally') return 'bg-sky-400';
  if (faction === 'enemy') return 'bg-red-400';
  return 'bg-slate-400';
}

function getActorTextClass(
  entry: CombatLogEntry,
  faction: 'ally' | 'enemy' | 'system'
): string {
  if (entry.actorIsPlayer) return 'text-emerald-300';
  if (faction === 'ally') return 'text-sky-300';
  if (entry.actorIsBoss) return 'text-orange-300';
  if (faction === 'enemy') return 'text-red-300';
  return 'text-slate-400';
}

function getValueToneClass(tone: CombatLogValueTone): string {
  switch (tone) {
    case 'damage':
      return 'text-red-400';
    case 'heal':
      return 'text-emerald-400';
    case 'shield':
      return 'text-sky-400';
    case 'buff':
      return 'text-amber-300';
    case 'debuff':
      return 'text-purple-300';
    case 'neutral':
    default:
      return 'text-slate-300';
  }
}

/**
 * Structured, channel-filtered, stick-to-bottom Combat Log list.
 * - Row format: [turn] [faction dot] [actor] [action icon + skill] -> [target] [colored value]
 * - Channel tabs: All / Allies / Enemies / System (kills & neutral messages included in System)
 * - Docked mode renders only the last 200 entries; Popup mode supports loading all older entries.
 */
export function CombatLogList({
  entries,
  active = true,
  density = 'compact',
  mode = 'docked',
  channel: controlledChannel,
  onChannelChange,
  className = '',
}: CombatLogListProps) {
  const { lang, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false);
  const [internalChannel, setInternalChannel] =
    useState<CombatLogChannel>('all');
  const [popupLimit, setPopupLimit] = useState<number>(POPUP_LOG_PAGE_SIZE);

  const activeChannel = controlledChannel ?? internalChannel;
  const setChannel = (ch: CombatLogChannel) => {
    if (onChannelChange) onChannelChange(ch);
    else setInternalChannel(ch);
  };

  const filteredEntries = useMemo(
    () => filterCombatLogEntries(entries, activeChannel),
    [entries, activeChannel]
  );

  const visibleLimit =
    mode === 'docked' ? DOCKED_LOG_MAX_ENTRIES : popupLimit;
  const hiddenOlderCount = Math.max(0, filteredEntries.length - visibleLimit);
  const visibleEntries = useMemo(
    () =>
      hiddenOlderCount > 0
        ? filteredEntries.slice(filteredEntries.length - visibleLimit)
        : filteredEntries,
    [filteredEntries, hiddenOlderCount, visibleLimit]
  );

  const lastEntryId =
    visibleEntries.length > 0
      ? visibleEntries[visibleEntries.length - 1].id
      : 'empty';

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

  // Stick to bottom whenever new entries arrive (or popup opens), ONLY while pinned to bottom
  useLayoutEffect(() => {
    if (!active || !isAtBottomRef.current) return;
    scrollToBottom();

    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      const rafId = window.requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom();
        }
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [active, visibleEntries.length, lastEntryId, activeChannel, scrollToBottom]);

  const isCompact = density === 'compact';

  return (
    <div className={`relative flex-1 min-h-0 flex flex-col ${className}`}>
      {/* Channel Filter Tabs: All / Allies / Enemies / System */}
      <div
        data-testid="combat-log-filters"
        role="tablist"
        aria-label={t('battle.combatLog')}
        className={`shrink-0 border-b border-slate-800/90 bg-[#090E17] flex items-center justify-between gap-1 ${
          isCompact ? 'px-2 py-1' : 'px-3 py-1.5'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {CHANNELS.map((ch) => {
            const isSelected = activeChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                role="tab"
                aria-selected={isSelected}
                data-testid={`combat-log-filter-${ch}`}
                onClick={() => setChannel(ch)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? ch === 'ally'
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/60'
                      : ch === 'enemy'
                      ? 'bg-red-500/25 text-red-200 border border-red-400/60'
                      : ch === 'system'
                      ? 'bg-slate-700 text-slate-100 border border-slate-500'
                      : 'bg-sky-500 text-slate-950 border border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {t(`log.filter.${ch}` as const)}
              </button>
            );
          })}
        </div>
        {mode === 'docked' && hiddenOlderCount > 0 && (
          <span
            data-testid="combat-log-docked-cap"
            className="font-mono-nums text-[10px] text-slate-500 shrink-0"
          >
            {t('log.dockedCapHint', {
              shown: visibleEntries.length,
              total: filteredEntries.length,
            })}
          </span>
        )}
      </div>

      {/* Scrollable Log Body */}
      <div
        ref={scrollRef}
        data-testid="combat-log-scroll"
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain tactical-scroll ${
          isCompact
            ? 'px-2.5 py-1.5 space-y-1 text-[12px]'
            : 'px-3.5 py-2.5 space-y-1.5 text-[13px]'
        }`}
      >
        {mode === 'popup' && hiddenOlderCount > 0 && (
          <div className="pb-1 flex justify-center">
            <button
              type="button"
              data-testid="combat-log-load-older"
              onClick={() =>
                setPopupLimit((prev) => prev + POPUP_LOG_PAGE_SIZE)
              }
              className="px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sky-300 text-[12px] font-semibold cursor-pointer"
            >
              {t('log.loadOlder', { count: hiddenOlderCount })}
            </button>
          </div>
        )}

        {visibleEntries.length === 0 ? (
          <div
            data-testid="combat-log-empty"
            className="py-4 text-center text-[12px] text-slate-500"
          >
            {t('log.emptyChannel')}
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const row = parseStructuredCombatLogRow(lang, entry);
            const isSystemRow = row.actionKind === 'system';

            return (
              <div
                key={entry.id}
                data-testid="combat-log-entry"
                data-action-kind={row.actionKind}
                data-faction={row.faction}
                data-value-tone={row.valueTone}
                title={row.fallbackText}
                className="leading-snug flex items-center flex-wrap gap-x-1.5 gap-y-0.5 py-0.5 border-b border-slate-800/40 last:border-b-0"
              >
                {/* [turn] */}
                <span className="font-mono-nums text-slate-500 shrink-0 text-[11px]">
                  {row.turnLabel}
                </span>

                {/* [colored faction dot: ally=blue, enemy=red, system=gray] */}
                <span
                  data-testid="combat-log-faction-dot"
                  data-faction={row.faction}
                  className={`w-2 h-2 rounded-full shrink-0 ${getFactionDotClass(
                    row.faction
                  )}`}
                />

                {row.autoBadge && (
                  <span className="font-mono-nums text-[10px] px-1 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                    {row.autoBadge}
                  </span>
                )}

                {isSystemRow ? (
                  <>
                    <ActionKindIcon kind="system" />
                    <span className="text-slate-300">{row.actionLabel}</span>
                  </>
                ) : (
                  <>
                    {/* [actor name] */}
                    {row.actorName && (
                      <span
                        data-testid="combat-log-actor"
                        className={`font-semibold ${getActorTextClass(
                          entry,
                          row.faction
                        )}`}
                      >
                        {row.actorName}
                      </span>
                    )}

                    {/* [action icon + skill/action name] */}
                    <span
                      data-testid="combat-log-action"
                      className="inline-flex items-center gap-1 text-slate-200"
                    >
                      <ActionKindIcon kind={row.actionKind} />
                      <span>{row.actionLabel}</span>
                    </span>

                    {/* -> [target] */}
                    {row.targetName && (
                      <>
                        <span className="text-slate-500" aria-hidden="true">
                          →
                        </span>
                        <span
                          data-testid="combat-log-target"
                          className="font-medium text-slate-100"
                        >
                          {row.targetName}
                        </span>
                      </>
                    )}

                    {/* [colored value] */}
                    {row.valueText && (
                      <span
                        data-testid="combat-log-value"
                        className={`font-mono-nums font-bold ${getValueToneClass(
                          row.valueTone
                        )}`}
                      >
                        {row.valueText}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {showJumpToLatest && visibleEntries.length > 0 && (
        <button
          type="button"
          data-testid="combat-log-jump-latest"
          onClick={handleJumpToLatest}
          className="absolute right-3 bottom-2 z-10 min-h-[44px] px-3 py-1 rounded-full border border-sky-400/70 bg-sky-500/95 hover:bg-sky-400 text-slate-950 font-semibold text-[12px] shadow-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5 shrink-0" />
          <span>{t('battle.jumpToLatest')}</span>
        </button>
      )}
    </div>
  );
}
