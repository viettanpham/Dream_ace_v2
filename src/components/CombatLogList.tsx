import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
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
import type { CombatLogEntry, CombatUnit, MechClassId } from '../types/game';
import { SP_COLOR_TOKENS } from '../utils/battleDisplay';
import {
  DOCKED_LOG_MAX_ENTRIES,
  filterCombatLogEntries,
  groupCombatLogEntriesByRound,
  parseStructuredCombatLogRow,
  POPUP_LOG_PAGE_SIZE,
  readCombatLogExpandAll,
  type CombatLogActionKind,
  type CombatLogChannel,
  type CombatLogDisplayMode,
  type CombatLogStrongTone,
  type CombatLogValueTone,
} from '../utils/combatLogFormat';
import {
  computeStickScrollState,
  DEFAULT_BOTTOM_THRESHOLD_PX,
} from '../utils/scrollStick';

interface CombatLogListProps {
  entries: CombatLogEntry[];
  /** Optional combat units for pilot vs NPC avatar resolution */
  units?: CombatUnit[];
  /** Pass `true` when visible (e.g., modal/drawer open) so opening jumps cleanly to bottom if pinned */
  active?: boolean;
  /** Compact density for desktop/phone dock vs larger touch-friendly text for popup sheet */
  density?: 'compact' | 'comfortable';
  /** Docked caps to last 200 entries; popup shows all via "Load older" pagination */
  mode?: CombatLogDisplayMode;
  /** Optional controlled channel filter */
  channel?: CombatLogChannel;
  onChannelChange?: (channel: CombatLogChannel) => void;
  /** When true, expands all existing and newly created rounds; defaults to persisted localStorage preference */
  expandAll?: boolean;
  /** Monotonic counter incremented when Expand All / Collapse All is clicked to clear manual per-round overrides */
  expandNonce?: number;
  /** When true (phone Expanded mode), flows inside page scroll with zero nested scroll containers */
  inlineFlow?: boolean;
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

function getAvatarBorderClass(
  role: 'me' | 'ally' | 'enemy' | 'boss' | 'system'
): string {
  switch (role) {
    case 'me':
      return 'border-emerald-400 bg-emerald-950/70';
    case 'ally':
      return 'border-sky-400 bg-sky-950/70';
    case 'boss':
      return 'border-orange-400 bg-orange-950/70';
    case 'enemy':
      return 'border-red-400 bg-red-950/70';
    case 'system':
    default:
      return 'border-slate-500 bg-slate-900';
  }
}

function hashSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function PilotPortraitCropSvg({
  actorName,
  role,
}: {
  actorName: string;
  role: 'me' | 'ally' | 'enemy' | 'boss' | 'system';
}) {
  const seed = hashSeed(actorName);
  const visorColor =
    role === 'me'
      ? '#34d399'
      : role === 'ally'
      ? '#38bdf8'
      : seed % 2 === 0
      ? '#f87171'
      : '#fb923c';
  const suitColor = role === 'me' ? '#065f46' : '#0c4a6e';
  const helmetTrim = seed % 3 === 0 ? '#cbd5e1' : '#94a3b8';

  return (
    <svg
      viewBox="0 0 24 24"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Flight Suit Shoulders */}
      <path d="M3 24c1-5 4-7 9-7s8 2 9 7H3z" fill={suitColor} />
      {/* Pilot Helmet Dome */}
      <circle cx="12" cy="10" r="6.5" fill="#1e293b" stroke={helmetTrim} strokeWidth="1.2" />
      {/* Visor Crop */}
      <path
        d="M7.2 9.4c1.3-1.4 8.3-1.4 9.6 0 .4.5.3 2-.2 2.5-1.4 1.1-7.8 1.1-9.2 0-.5-.5-.6-2-.2-2.5z"
        fill={visorColor}
      />
      {/* Visor Glint */}
      <path d="M8.5 9.3h4.2" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

function NpcClassGlyphSvg({
  classId,
  role,
}: {
  classId: MechClassId;
  role: 'me' | 'ally' | 'enemy' | 'boss' | 'system';
}) {
  const accent =
    role === 'boss' ? '#fb923c' : role === 'ally' ? '#38bdf8' : '#f87171';
  const hull = role === 'boss' ? '#7c2d12' : '#450a0a';

  if (classId === 'interceptor') {
    return (
      <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
        <polygon points="12,3 20,18 12,15 4,18" fill={hull} stroke={accent} strokeWidth="1.4" />
        <circle cx="12" cy="11" r="2" fill={accent} />
      </svg>
    );
  }
  if (classId === 'siege') {
    return (
      <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
        <polygon points="6,5 18,5 21,12 18,19 6,19 3,12" fill={hull} stroke={accent} strokeWidth="1.4" />
        <rect x="8" y="9" width="8" height="6" rx="1" fill={accent} />
      </svg>
    );
  }
  if (classId === 'support') {
    return (
      <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill={hull} stroke={accent} strokeWidth="1.4" />
        <path d="M12 8v8M8 12h8" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  // striker default
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
      <polygon points="12,3 19,10 16,20 8,20 5,10" fill={hull} stroke={accent} strokeWidth="1.4" />
      <polygon points="12,7 15,12 12,16 9,12" fill={accent} />
    </svg>
  );
}

function ActorAvatarBadge({
  actorName,
  isPilotActor,
  classId,
  role,
  faction,
}: {
  actorName: string;
  isPilotActor: boolean;
  classId: MechClassId;
  role: 'me' | 'ally' | 'enemy' | 'boss' | 'system';
  faction: 'ally' | 'enemy' | 'system';
}) {
  return (
    <span
      data-testid="combat-log-avatar"
      data-avatar-type={
        role === 'system' ? 'system' : isPilotActor ? 'pilot' : 'npc'
      }
      className={`relative w-5 h-5 rounded-full border shrink-0 overflow-hidden inline-flex items-center justify-center ${getAvatarBorderClass(
        role
      )}`}
    >
      {role === 'system' ? (
        <Terminal className="w-3 h-3 text-slate-400" aria-hidden="true" />
      ) : isPilotActor ? (
        <PilotPortraitCropSvg actorName={actorName} role={role} />
      ) : (
        <NpcClassGlyphSvg classId={classId} role={role} />
      )}
      <span
        data-testid="combat-log-faction-dot"
        data-faction={faction}
        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#070A10] ${getFactionDotClass(
          faction
        )}`}
      />
    </span>
  );
}

function getStrongRowClass(tone: CombatLogStrongTone | null): string {
  switch (tone) {
    case 'kill':
      return 'bg-red-500/12 border-l-2 border-l-red-400/90 pl-1.5 rounded-r border-b border-b-red-500/20';
    case 'shield-break':
      return 'bg-fuchsia-500/10 border-l-2 border-l-fuchsia-400/90 pl-1.5 rounded-r border-b border-b-fuchsia-500/20';
    case 'crit':
    case 'heavy':
      return 'bg-amber-500/10 border-l-2 border-l-amber-400/90 pl-1.5 rounded-r border-b border-b-amber-500/20';
    case 'heal':
      return 'bg-emerald-500/10 border-l-2 border-l-emerald-400/90 pl-1.5 rounded-r border-b border-b-emerald-500/20';
    default:
      return 'border-b border-slate-800/40 last:border-b-0';
  }
}

function getSentenceToneClass(tone: CombatLogValueTone): string {
  switch (tone) {
    case 'damage':
      return 'text-slate-100';
    case 'heal':
      return 'text-emerald-100';
    case 'shield':
      return 'text-sky-100';
    case 'buff':
      return 'text-amber-100';
    case 'debuff':
      return 'text-purple-100';
    case 'neutral':
    default:
      return 'text-slate-300';
  }
}

/**
 * Structured, round-grouped, channel-filtered, stick-to-bottom Combat Log list.
 * - Groups entries under collapsible "Vòng N" / "Round N" headers (newest round expanded by default)
 * - Row format: [avatar + faction border] [action icon] [natural sentence] [optional dim SP tag]
 * - Strong event highlighting for crit, heavy hit, shield break, kill, and big heal
 * - Channel tabs: All / Allies / Enemies / System (kills & neutral messages included in System)
 */
export function CombatLogList({
  entries,
  units,
  active = true,
  density = 'compact',
  mode = 'docked',
  channel: controlledChannel,
  onChannelChange,
  expandAll: controlledExpandAll,
  expandNonce = 0,
  inlineFlow = false,
  className = '',
}: CombatLogListProps) {
  const { lang, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false);
  const [internalChannel, setInternalChannel] =
    useState<CombatLogChannel>('all');
  const [popupLimit, setPopupLimit] = useState<number>(POPUP_LOG_PAGE_SIZE);
  const [roundOverrides, setRoundOverrides] = useState<Record<number, boolean>>(
    {}
  );
  const [storedExpandAll] = useState<boolean>(() => readCombatLogExpandAll());
  const effectiveExpandAll = controlledExpandAll ?? storedExpandAll;

  useEffect(() => {
    setRoundOverrides({});
  }, [effectiveExpandAll, expandNonce]);

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

  const roundGroups = useMemo(
    () => groupCombatLogEntriesByRound(visibleEntries),
    [visibleEntries]
  );
  const latestRound =
    roundGroups.length > 0 ? roundGroups[roundGroups.length - 1].round : 1;

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
    if (inlineFlow || !active || !isAtBottomRef.current) return;
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
  }, [
    inlineFlow,
    active,
    visibleEntries.length,
    lastEntryId,
    activeChannel,
    scrollToBottom,
  ]);

  const toggleRound = (roundNum: number, currentlyOpen: boolean) => {
    setRoundOverrides((prev) => ({
      ...prev,
      [roundNum]: !currentlyOpen,
    }));
  };

  const isCompact = density === 'compact';

  return (
    <div
      className={`relative ${
        inlineFlow ? '' : 'flex-1 min-h-0'
      } flex flex-col ${className}`}
    >
      {/* Channel Filter Tabs: All / Allies / Enemies / System */}
      <div
        data-testid="combat-log-filters"
        role="tablist"
        aria-label={t('battle.combatLog')}
        className={`shrink-0 border-b border-slate-800/90 bg-[#090E17] flex items-center justify-between gap-1 ${
          isCompact ? 'px-2 py-1' : 'px-3 py-1.5'
        }`}
      >
        <div
          className={`flex items-center gap-1 min-w-0 ${
            inlineFlow ? 'flex-wrap' : 'overflow-x-auto'
          }`}
        >
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

      {/* Log Body grouped by Round (inner scroll when docked/popup, page-flow when inlineFlow) */}
      <div
        ref={scrollRef}
        data-testid="combat-log-scroll"
        onScroll={inlineFlow ? undefined : handleScroll}
        className={`${
          inlineFlow
            ? ''
            : 'flex-1 min-h-0 overflow-y-auto overscroll-contain tactical-scroll'
        } ${
          isCompact
            ? 'px-2.5 py-1.5 space-y-1.5 text-[12px]'
            : 'px-3.5 py-2.5 space-y-2 text-[13px]'
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
          roundGroups.map((grp) => {
            const isOpen =
              roundOverrides[grp.round] ??
              (effectiveExpandAll ? true : grp.round === latestRound);
            return (
              <div
                key={`round-${grp.round}`}
                data-testid={`combat-log-round-group-${grp.round}`}
                className="space-y-0.5"
              >
                <button
                  type="button"
                  data-testid={`combat-log-round-header-${grp.round}`}
                  aria-expanded={isOpen}
                  data-round-open={isOpen ? 'true' : 'false'}
                  onClick={() => toggleRound(grp.round, isOpen)}
                  className="w-full px-2 py-1 rounded border border-slate-800/80 bg-[#0B121F] hover:bg-slate-900 text-[11px] font-semibold text-slate-300 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="font-mono-nums text-slate-100">
                      {t('log.roundHeader', { round: grp.round })}
                    </span>
                  </span>
                  <span className="font-mono-nums text-[10px] text-slate-400">
                    {t('log.roundEntriesCount', { count: grp.entries.length })}
                  </span>
                </button>

                <div
                  data-testid={`combat-log-round-body-${grp.round}`}
                  className={isOpen ? 'space-y-1 pt-0.5' : 'hidden'}
                >
                  {grp.entries.map((entry) => {
                    const row = parseStructuredCombatLogRow(
                      lang,
                      entry,
                      units
                    );

                    return (
                      <div
                        key={entry.id}
                        data-testid="combat-log-entry"
                        data-action-kind={row.actionKind}
                        data-faction={row.faction}
                        data-value-tone={row.valueTone}
                        data-strong={row.isStrong ? 'true' : 'false'}
                        title={row.sentence}
                        className={`leading-snug flex items-center gap-1.5 py-1 pr-1 ${getStrongRowClass(
                          row.strongTone
                        )}`}
                      >
                        {/* [avatar with faction-colored border + faction dot] */}
                        <ActorAvatarBadge
                          actorName={row.actorName || row.actionLabel}
                          isPilotActor={row.isPilotActor}
                          classId={row.actorClassId}
                          role={row.actorFactionRole}
                          faction={row.faction}
                        />

                        {/* [single action icon] */}
                        <ActionKindIcon kind={row.actionKind} />

                        {row.autoBadge && (
                          <span className="font-mono-nums text-[10px] px-1 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                            {row.autoBadge}
                          </span>
                        )}

                        {/* [natural sentence] */}
                        <span
                          data-testid="combat-log-sentence"
                          className={`min-w-0 flex-1 break-words ${getSentenceToneClass(
                            row.valueTone
                          )}`}
                        >
                          {row.sentence}
                        </span>

                        {/* [separate dim skill SP cost] */}
                        {row.spCost !== null && row.spCost > 0 && (
                          <span
                            data-testid="combat-log-sp-cost"
                            className={`font-mono-nums text-[10px] px-1 py-0.5 rounded border shrink-0 whitespace-nowrap ${SP_COLOR_TOKENS.badgeClass}`}
                          >
                            {t('log.spCostTag', { cost: row.spCost })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!inlineFlow && showJumpToLatest && visibleEntries.length > 0 && (
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
