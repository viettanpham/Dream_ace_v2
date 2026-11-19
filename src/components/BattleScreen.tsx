import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Backpack,
  BarChart3,
  Bot,
  ChevronUp,
  Crosshair,
  Flag,
  HeartHandshake,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Radar,
  Repeat,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  Zap,
  ZapOff,
} from 'lucide-react';
import { BALANCE_CONFIG } from '../data/balance';
import { STAT_KEYS } from '../data/classes';
import { RARITY_META } from '../data/items';
import { getScaledSkillStats, getSkillById } from '../data/skills';
import {
  getEffectiveUnitSpeed,
  getEnemyEnrageBonusPct,
  getTeamColorRole,
  getValidEnemyTargets,
  hasStatus,
  isLongRangeAction,
} from '../engine/combat';
import { getEffectiveItemStats } from '../engine/equipment';
import { canUnitUseSkill } from '../engine/skills';
import {
  formatCombatLogMessage,
  getAutoStopReasonLabel,
  getBattleSkillReason,
  getClassName,
  getItemInstanceName,
  getRarityLabel,
  getSectorName,
  getSkillDesc,
  getSkillName,
  getSkillTargetLabel,
  getSlotLabel,
  getStatShort,
  getStatusLabel,
  getTeamTagLabel,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type {
  AutoRepeatLimit,
  BattleSpeed,
  CombatRow,
  CombatUnit,
} from '../types/game';
import {
  computeRowExposure,
  formatShortUnitName,
  useBattleLayoutMode,
  type RowExposureState,
} from '../utils/battleDisplay';
import { BattleRadarView } from './BattleRadarView';
import { BattleStatsModal } from './BattleStatsModal';
import { BattleUnitCard } from './BattleUnitCard';
import { BottomSheet } from './BottomSheet';
import { CombatLogList } from './CombatLogList';
import { ErrorBoundary } from './ErrorBoundary';
import { SkillIcon } from './SkillIcon';
import { StatBar } from './StatBar';
import { TurnQueueBar } from './TurnQueueBar';
import { UnitDetailSheet } from './UnitDetailSheet';

const BATTLE_SPEEDS: BattleSpeed[] = [1, 2, 3, 5, 10];
const PHONE_CYCLE_SPEEDS: BattleSpeed[] = [1, 2, 3];
const REPEAT_OPTIONS: AutoRepeatLimit[] = [1, 5, 10, 'infinite'];
const ROWS_ORDER: CombatRow[] = ['front', 'middle', 'back'];

function getTeamAccentVar(unit: CombatUnit): string {
  const role = getTeamColorRole(unit);
  if (role === 'me') return 'var(--team-me)';
  if (role === 'ally') return 'var(--team-ally)';
  if (role === 'boss') return 'var(--team-boss)';
  return 'var(--team-enemy)';
}

export function BattleScreen() {
  const { lang, t } = useI18n();
  const battle = useGameStore((s) => s.battle);
  const adminConfig = useGameStore((s) => s.adminConfig);
  const battleSpeed = useGameStore((s) => s.battleSpeed);
  const skipAnimations = useGameStore((s) => s.skipAnimations);
  const autoBattleEnabled = useGameStore((s) => s.autoBattleEnabled);
  const autoRepeatLimit = useGameStore((s) => s.autoRepeatLimit);
  const autoRepeatSession = useGameStore((s) => s.autoRepeatSession);
  const tacticsModalOpen = useGameStore((s) => s.tacticsModalOpen);
  const battleViewMode = useGameStore((s) => s.battleViewMode);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const selectAllyTarget = useGameStore((s) => s.selectAllyTarget);
  const performPlayerAction = useGameStore((s) => s.performPlayerAction);
  const performAutoPlayerTurn = useGameStore((s) => s.performAutoPlayerTurn);
  const performAiTurn = useGameStore((s) => s.performAiTurn);
  const retreatBattle = useGameStore((s) => s.retreatBattle);
  const clearExpiredPopups = useGameStore((s) => s.clearExpiredPopups);
  const clearExpiredFx = useGameStore((s) => s.clearExpiredFx);
  const clearExplodedUnits = useGameStore((s) => s.clearExplodedUnits);
  const clearWingmanChat = useGameStore((s) => s.clearWingmanChat);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const startBattle = useGameStore((s) => s.startBattle);
  const setBattleSpeed = useGameStore((s) => s.setBattleSpeed);
  const setBattleViewMode = useGameStore((s) => s.setBattleViewMode);
  const toggleSkipAnimations = useGameStore((s) => s.toggleSkipAnimations);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const setAutoBattleEnabled = useGameStore((s) => s.setAutoBattleEnabled);
  const toggleAutoBattle = useGameStore((s) => s.toggleAutoBattle);
  const setTacticsModalOpen = useGameStore((s) => s.setTacticsModalOpen);
  const setAutoRepeatLimit = useGameStore((s) => s.setAutoRepeatLimit);
  const startAutoRepeat = useGameStore((s) => s.startAutoRepeat);
  const stopAutoRepeat = useGameStore((s) => s.stopAutoRepeat);
  const clearAutoRepeatSummary = useGameStore((s) => s.clearAutoRepeatSummary);

  const layoutMode = useBattleLayoutMode();
  const isPhonePortrait = layoutMode === 'phone-portrait';

  const [inspectedSkillId, setInspectedSkillId] = useState<string | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [phoneUnitSheetId, setPhoneUnitSheetId] = useState<string | null>(null);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [skillsSheetOpen, setSkillsSheetOpen] = useState(false);
  const [suppliesSheetOpen, setSuppliesSheetOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);

  const bypassFx = skipAnimations || battleSpeed === 10;

  const effectiveViewMode =
    battleViewMode ?? (isPhonePortrait ? 'radar' : 'radar');

  const activeUnitId = battle ? battle.turnOrder[battle.activeTurnIndex] : null;
  const activeUnit =
    battle?.units.find((u) => u.id === activeUnitId) ?? null;
  const isPlayerCharging = Boolean(
    activeUnit?.isPlayer && activeUnit.alive && hasStatus(activeUnit, 'charging')
  );
  const isPlayerTurn = Boolean(
    battle &&
      !battle.summary &&
      activeUnit?.isPlayer &&
      activeUnit.alive &&
      !isPlayerCharging
  );

  useEffect(() => {
    if (!battle || battle.popups.length === 0) return;
    const ids = battle.popups.map((p) => p.id);
    const timer = window.setTimeout(() => {
      clearExpiredPopups(ids);
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [battle?.popups, clearExpiredPopups]);

  useEffect(() => {
    if (!battle || battle.fxEvents.length === 0) return;
    const ids = battle.fxEvents.map((f) => f.id);
    const fxCleanupMs = Math.max(
      140,
      Math.round(500 / Math.max(1, Math.min(3, battleSpeed)))
    );
    const timer = window.setTimeout(() => {
      clearExpiredFx(ids);
    }, fxCleanupMs);
    return () => window.clearTimeout(timer);
  }, [battle?.fxEvents, battleSpeed, clearExpiredFx]);

  useEffect(() => {
    if (!battle || battle.explodedUnitIds.length === 0) return;
    const ids = [...battle.explodedUnitIds];
    const timer = window.setTimeout(() => {
      clearExplodedUnits(ids);
    }, 640);
    return () => window.clearTimeout(timer);
  }, [battle?.explodedUnitIds, clearExplodedUnits]);

  useEffect(() => {
    if (!battle?.wingmanChat) return;
    const timer = window.setTimeout(() => {
      clearWingmanChat();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [battle?.wingmanChat, clearWingmanChat]);

  // Automatic AI (and player Charge Shot auto-release) scheduler
  useEffect(() => {
    if (!battle || battle.summary || isPlayerTurn) return;
    const baseDelay = BALANCE_CONFIG.battleSpeedDelays[battleSpeed] ?? 760;
    const delayMs = skipAnimations ? Math.min(baseDelay, 60) : baseDelay;
    const timer = window.setTimeout(() => {
      performAiTurn();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    battle?.activeTurnIndex,
    battle?.round,
    battle?.summary,
    isPlayerTurn,
    battleSpeed,
    skipAnimations,
    performAiTurn,
  ]);

  // Automatic Player Turn scheduler when Auto Mode is ON
  useEffect(() => {
    if (
      !battle ||
      battle.summary ||
      !isPlayerTurn ||
      !autoBattleEnabled ||
      tacticsModalOpen
    ) {
      return;
    }
    const baseDelay = BALANCE_CONFIG.battleSpeedDelays[battleSpeed] ?? 760;
    const delayMs = skipAnimations
      ? Math.min(baseDelay, 60)
      : Math.max(40, Math.round(baseDelay * 0.75));
    const timer = window.setTimeout(() => {
      performAutoPlayerTurn();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    battle?.activeTurnIndex,
    battle?.round,
    battle?.summary,
    isPlayerTurn,
    autoBattleEnabled,
    tacticsModalOpen,
    battleSpeed,
    skipAnimations,
    performAutoPlayerTurn,
  ]);

  // Auto-Repeat next battle launcher
  useEffect(() => {
    if (!battle?.summary || !autoRepeatSession?.active) return;
    const delayMs = skipAnimations || battleSpeed >= 5 ? 320 : 850;
    const timer = window.setTimeout(() => {
      startBattle(autoRepeatSession.sectorId);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    battle?.summary,
    autoRepeatSession?.active,
    autoRepeatSession?.completedRuns,
    autoRepeatSession?.sectorId,
    battleSpeed,
    skipAnimations,
    startBattle,
  ]);

  // Keyboard shortcuts: A Auto/Manual, M Mute, 1 Fire, 2-7 Skills, Q Shield, Tab Cycle Enemy
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!battle || tacticsModalOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleAutoBattle();
        return;
      }
      if (e.key.toLowerCase() === 'm') {
        toggleMute();
        return;
      }
      if (battle.summary || !isPlayerTurn || autoBattleEnabled) return;

      const playerUnit = battle.units.find((u) => u.isPlayer);
      if (!playerUnit) return;

      if (e.key === '1') {
        e.preventDefault();
        performPlayerAction('attack');
      } else if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        performPlayerAction('defend');
      } else if (['2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const slotIdx = Number(e.key) - 2;
        const skillId = playerUnit.equippedSkillIds[slotIdx];
        if (skillId && canUnitUseSkill(playerUnit, skillId).canUse) {
          e.preventDefault();
          performPlayerAction('skill', skillId);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const aliveEnemies = battle.units.filter(
          (u) => u.side === 'enemy' && u.alive && !hasStatus(u, 'stealth')
        );
        const pool =
          aliveEnemies.length > 0
            ? aliveEnemies
            : battle.units.filter((u) => u.side === 'enemy' && u.alive);
        if (pool.length > 0) {
          const curIdx = pool.findIndex(
            (u) => u.id === battle.selectedTargetId
          );
          const nextEnemy = pool[(curIdx + 1) % pool.length];
          selectTarget(nextEnemy.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    battle,
    isPlayerTurn,
    autoBattleEnabled,
    tacticsModalOpen,
    performPlayerAction,
    selectTarget,
    toggleAutoBattle,
    toggleMute,
  ]);

  const playerUnitForTargets = battle?.units.find(
    (u) => u.side === 'ally' && u.isPlayer
  );
  const validBasicTargetIds = useMemo(() => {
    if (!battle || !playerUnitForTargets) return new Set<string>();
    return new Set(
      getValidEnemyTargets(battle.units, playerUnitForTargets, 'attack').map(
        (u) => u.id
      )
    );
  }, [battle, playerUnitForTargets]);

  const enemyExposure = useMemo(
    () => (battle ? computeRowExposure(battle.units, 'enemy') : null),
    [battle]
  );
  const allyExposure = useMemo(
    () => (battle ? computeRowExposure(battle.units, 'ally') : null),
    [battle]
  );

  if (!battle) return null;

  const allies = battle.units.filter((u) => u.side === 'ally');
  const enemies = battle.units.filter((u) => u.side === 'enemy');
  const playerUnit = playerUnitForTargets;
  const playerSkillIds = playerUnit?.equippedSkillIds ?? [];
  const hasSingleAllySkill = playerSkillIds.some(
    (id) => getSkillById(id)?.targetType === 'single_ally'
  );
  const playerHasLongRangeBasic = playerUnit
    ? isLongRangeAction(playerUnit, 'attack')
    : false;

  const selectedTarget = enemies.find((e) => e.id === battle.selectedTargetId);
  const selectedAlly = allies.find((a) => a.id === battle.selectedAllyTargetId);
  const phoneSheetUnit = phoneUnitSheetId
    ? battle.units.find((u) => u.id === phoneUnitSheetId) ?? null
    : null;

  // Sidebar detail unit on Tablet/PC: explicitly inspected -> selected enemy -> active unit -> player
  const sidebarUnit: CombatUnit | null =
    (inspectedUnitId
      ? battle.units.find((u) => u.id === inspectedUnitId)
      : null) ??
    (selectedTarget && selectedTarget.alive ? selectedTarget : null) ??
    activeUnit ??
    playerUnit ??
    null;

  // Determine the acting unit's display target for the turn queue chip ("ACTOR > Target")
  const actingTargetName = (() => {
    if (!activeUnit || battle.summary) return null;
    if (activeUnit.side === 'ally') {
      if (selectedTarget && selectedTarget.alive) return selectedTarget.name;
      const firstValid = getValidEnemyTargets(
        battle.units,
        activeUnit,
        'attack'
      )[0];
      return firstValid?.name ?? null;
    }
    const firstValidAlly = getValidEnemyTargets(
      battle.units,
      activeUnit,
      'attack'
    )[0];
    return firstValidAlly?.name ?? null;
  })();

  const sectorLabel = getSectorName(lang, battle.sectorId);
  const enrageBonusPct = getEnemyEnrageBonusPct(
    battle.round,
    adminConfig.softEnrageEnabled
  );

  const inspectedSkill = inspectedSkillId
    ? getSkillById(inspectedSkillId)
    : undefined;
  const inspectedUsability =
    playerUnit && inspectedSkill
      ? canUnitUseSkill(playerUnit, inspectedSkill.id)
      : null;
  const inspectedLv =
    playerUnit && inspectedSkill
      ? playerUnit.skillLevels[inspectedSkill.id] ?? 1
      : 1;
  const inspectedScaled = inspectedSkill
    ? getScaledSkillStats(inspectedSkill, inspectedLv)
    : null;

  const repeatLabelFor = (opt: AutoRepeatLimit): string => {
    if (opt === 1) return t('auto.repeat1');
    if (opt === 5) return t('auto.repeat5');
    if (opt === 10) return t('auto.repeat10');
    return t('auto.repeatInfinite');
  };

  const cyclePhoneSpeed = () => {
    const idx = PHONE_CYCLE_SPEEDS.indexOf(battleSpeed);
    const next =
      idx === -1
        ? PHONE_CYCLE_SPEEDS[0]
        : PHONE_CYCLE_SPEEDS[(idx + 1) % PHONE_CYCLE_SPEEDS.length];
    setBattleSpeed(next);
  };

  const canPlayerManualAct = isPlayerTurn && !autoBattleEnabled;
  const showRepeatBatchSummary = Boolean(
    battle.summary && autoRepeatSession && !autoRepeatSession.active
  );

  const allyRemainingHp = allies.reduce(
    (acc, u) => acc + (u.alive ? u.hp : 0),
    0
  );
  const enemyRemainingHp = enemies.reduce(
    (acc, u) => acc + (u.alive ? u.hp : 0),
    0
  );
  const totalRemainingHp = Math.max(1, allyRemainingHp + enemyRemainingHp);
  const allySharePct = Math.round((allyRemainingHp / totalRemainingHp) * 100);
  const enemySharePct = 100 - allySharePct;
  const aliveAlliesCount = allies.filter((u) => u.alive).length;
  const aliveEnemiesCount = enemies.filter((u) => u.alive).length;

  const latestLog =
    battle.log.length > 0 ? battle.log[battle.log.length - 1] : null;

  const handleInspectUnit = (unit: CombatUnit) => {
    setInspectedUnitId(unit.id);
    if (isPhonePortrait) {
      setPhoneUnitSheetId(unit.id);
    }
  };

  const getRowTitle = (row: CombatRow) =>
    row === 'front'
      ? t('common.frontRow')
      : row === 'middle'
      ? t('common.middleRow')
      : t('common.backRow');

  const getExposureLabel = (state: RowExposureState) =>
    state === 'exposed'
      ? t('battle.rowExposed')
      : state === 'protected'
      ? t('battle.rowProtected')
      : t('battle.rowEmpty');

  const renderCardUnit = (unit: CombatUnit, compact: boolean) => {
    const isEnemy = unit.side === 'enemy';
    const frontBlocked =
      isEnemy && unit.alive && !validBasicTargetIds.has(unit.id);
    const wingmanChatText =
      battle.wingmanChat && battle.wingmanChat.unitId === unit.id
        ? t(battle.wingmanChat.textKey as Parameters<typeof t>[0])
        : null;

    return (
      <BattleUnitCard
        key={unit.id}
        unit={unit}
        compact={compact}
        frontBlocked={frontBlocked}
        wingmanChatText={wingmanChatText}
        isActiveTurn={activeUnitId === unit.id && !battle.summary}
        isTargeted={
          isEnemy
            ? battle.selectedTargetId === unit.id && unit.alive
            : hasSingleAllySkill &&
              battle.selectedAllyTargetId === unit.id &&
              unit.alive
        }
        canTarget={
          isEnemy
            ? canPlayerManualAct && unit.alive && !hasStatus(unit, 'stealth')
            : canPlayerManualAct && unit.alive && hasSingleAllySkill
        }
        exploding={battle.explodedUnitIds.includes(unit.id)}
        skipAnimations={bypassFx}
        autoActive={unit.isPlayer && autoBattleEnabled}
        popups={battle.popups.filter((p) => p.unitId === unit.id)}
        onSelect={
          isEnemy
            ? () => {
                selectTarget(unit.id);
                setInspectedUnitId(unit.id);
              }
            : () => {
                selectAllyTarget(unit.id);
                setInspectedUnitId(unit.id);
              }
        }
        onInspect={() => handleInspectUnit(unit)}
      />
    );
  };

  const renderThreeRowCardSide = (
    side: 'ally' | 'enemy',
    units: CombatUnit[],
    compact: boolean
  ) => {
    const exposureMap =
      side === 'enemy' ? enemyExposure : allyExposure;
    const orderedRows: CombatRow[] =
      side === 'enemy' && isPhonePortrait
        ? ['back', 'middle', 'front']
        : ROWS_ORDER;

    return (
      <div className="space-y-2" data-testid={`card-side-${side}`}>
        <div className="flex items-center justify-between text-[13px] px-1">
          <span
            className="font-display text-[15px] font-bold tracking-wider uppercase"
            style={{
              color:
                side === 'enemy' ? 'var(--team-enemy)' : 'var(--team-ally)',
            }}
          >
            {side === 'enemy'
              ? t('battle.hostileWing', { sector: sectorLabel })
              : t('battle.alliedWing')}
          </span>
          <span className="font-mono-nums text-[12px] text-slate-400">
            {side === 'enemy'
              ? t('battle.activeCount', {
                  alive: aliveEnemiesCount,
                  total: enemies.length,
                })
              : t('battle.operational', {
                  alive: aliveAlliesCount,
                  total: allies.length,
                })}
          </span>
        </div>

        {orderedRows.map((row) => {
          const rowUnits = units
            .filter((u) => u.row === row)
            .sort((a, b) => (a.formationCol ?? 0) - (b.formationCol ?? 0));
          const exposure = exposureMap?.[row] ?? 'empty';
          const isExposed = exposure === 'exposed';
          const isProtected = exposure === 'protected';

          return (
            <div
              key={`${side}-${row}`}
              data-card-row={`${side}-${row}`}
              data-row-state={exposure}
              className={`rounded-lg border p-2 space-y-2 ${
                isExposed
                  ? side === 'enemy'
                    ? 'border-red-500/45 bg-red-950/15'
                    : 'border-sky-500/45 bg-sky-950/15'
                  : isProtected
                  ? 'border-dashed border-slate-700/90 bg-slate-950/55'
                  : 'border-dashed border-slate-800/70 bg-slate-950/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[12px] font-mono-nums font-bold">
                <span
                  className={
                    isExposed
                      ? side === 'enemy'
                        ? 'text-red-300'
                        : 'text-sky-300'
                      : 'text-slate-400'
                  }
                >
                  {getRowTitle(row)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[12px] ${
                    isExposed
                      ? side === 'enemy'
                        ? 'bg-red-500/20 text-red-200'
                        : 'bg-sky-500/20 text-sky-200'
                      : isProtected
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {getExposureLabel(exposure)}
                </span>
              </div>

              {rowUnits.length > 0 && (
                <div
                  className={`grid gap-2 ${
                    compact ? 'grid-cols-2' : 'grid-cols-1 xl:grid-cols-2'
                  }`}
                >
                  {rowUnits.map((u) => renderCardUnit(u, compact))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFieldContent = () => {
    if (effectiveViewMode === 'radar') {
      return (
        <BattleRadarView
          battle={battle}
          activeUnitId={activeUnitId}
          validBasicTargetIds={validBasicTargetIds}
          canPlayerManualAct={canPlayerManualAct}
          hasSingleAllySkill={hasSingleAllySkill}
          autoBattleEnabled={autoBattleEnabled}
          skipAnimations={bypassFx}
          battleSpeed={battleSpeed}
          layoutMode={layoutMode}
          onSelectEnemy={(id) => {
            selectTarget(id);
            setInspectedUnitId(id);
          }}
          onSelectAlly={(id) => {
            selectAllyTarget(id);
            setInspectedUnitId(id);
          }}
          onInspectUnit={handleInspectUnit}
        />
      );
    }

    return (
      <div
        style={{ touchAction: 'pan-y' }}
        className="flex-1 min-h-0 overflow-y-auto tactical-scroll touch-pan-y p-2 space-y-4"
      >
        <div
          className={`grid gap-4 items-start ${
            isPhonePortrait ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'
          }`}
        >
          {isPhonePortrait ? (
            <>
              {renderThreeRowCardSide('enemy', enemies, true)}
              {renderThreeRowCardSide('ally', allies, true)}
            </>
          ) : (
            <>
              {renderThreeRowCardSide('ally', allies, battle.squadSize > 4)}
              {renderThreeRowCardSide('enemy', enemies, battle.squadSize > 4)}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderSidebarSelectedUnit = () => {
    if (!sidebarUnit) {
      return (
        <div
          data-testid="battle-selected-unit-panel"
          className="rounded-lg border border-slate-800 bg-[#0A101B] p-3 text-[13px] text-slate-400 shrink-0"
        >
          {t('battle.noUnitSelected')}
        </div>
      );
    }

    const isEnemy = sidebarUnit.side === 'enemy';
    const teamRole = getTeamColorRole(sidebarUnit);
    const teamAccent = getTeamAccentVar(sidebarUnit);
    const hpRatio = Math.max(
      0,
      Math.min(1, sidebarUnit.hp / Math.max(1, sidebarUnit.derived.maxHp))
    );
    const hpColor =
      hpRatio <= 0.25
        ? 'bg-red-500'
        : hpRatio <= 0.55
        ? 'bg-orange-400'
        : 'bg-emerald-500';
    const exposure =
      (isEnemy ? enemyExposure : allyExposure)?.[sidebarUnit.row] ?? 'empty';
    const isBlocked =
      isEnemy && sidebarUnit.alive && !validBasicTargetIds.has(sidebarUnit.id);
    const isStealthed = hasStatus(sidebarUnit, 'stealth');
    const isLocked =
      (isEnemy && battle.selectedTargetId === sidebarUnit.id) ||
      (!isEnemy &&
        hasSingleAllySkill &&
        battle.selectedAllyTargetId === sidebarUnit.id);

    return (
      <div
        data-testid="battle-selected-unit-panel"
        className="rounded-lg border border-slate-800 bg-[#0A101B] p-2.5 space-y-2 shrink-0"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[12px] font-mono-nums font-bold px-1.5 py-0.5 rounded border shrink-0"
              style={{ color: teamAccent, borderColor: teamAccent }}
            >
              {getTeamTagLabel(lang, teamRole)}
            </span>
            <span
              className="font-display text-[15px] font-bold truncate"
              style={{ color: sidebarUnit.alive ? teamAccent : '#94a3b8' }}
              title={sidebarUnit.name}
            >
              {sidebarUnit.name}
            </span>
          </div>
          <span className="text-[12px] font-mono-nums text-slate-300 shrink-0">
            {getRowTitle(sidebarUnit.row)} · {getExposureLabel(exposure)}
          </span>
        </div>

        <div className="space-y-1.5">
          <StatBar
            label="HP"
            value={sidebarUnit.hp}
            max={sidebarUnit.derived.maxHp}
            fillClassName={hpColor}
            heightClassName="h-2"
            instant={bypassFx}
            compactHeader
          />
          <div className="grid grid-cols-2 gap-2">
            <StatBar
              label="SHD"
              labelClassName="text-sky-400"
              valueClassName="text-sky-200"
              value={sidebarUnit.shield}
              max={Math.max(1, sidebarUnit.derived.maxShield)}
              valueText={`${sidebarUnit.shield}/${sidebarUnit.derived.maxShield}`}
              fillClassName="bg-sky-400"
              heightClassName="h-1.5"
              instant={bypassFx}
              compactHeader
            />
            <StatBar
              label="SP"
              labelClassName="text-purple-300"
              valueClassName="text-purple-200"
              value={sidebarUnit.sp}
              max={Math.max(1, sidebarUnit.derived.maxSp)}
              valueText={`${sidebarUnit.sp}/${sidebarUnit.derived.maxSp}`}
              fillClassName="bg-purple-400"
              heightClassName="h-1.5"
              instant={bypassFx}
              compactHeader
            />
          </div>
        </div>

        {/* Fixed-width tabular telemetry */}
        <div className="grid grid-cols-5 gap-1 text-center font-mono-nums text-[12px]">
          <div className="rounded bg-slate-900/90 border border-slate-800 py-1">
            <div className="text-slate-400">ATK</div>
            <div className="font-bold text-slate-100">
              {sidebarUnit.derived.attackPower}
            </div>
          </div>
          <div className="rounded bg-slate-900/90 border border-slate-800 py-1">
            <div className="text-slate-400">DEF</div>
            <div className="font-bold text-slate-100">
              {sidebarUnit.derived.defenseRating}
            </div>
          </div>
          <div className="rounded bg-slate-900/90 border border-slate-800 py-1">
            <div className="text-slate-400">SPD</div>
            <div className="font-bold text-sky-300">
              {getEffectiveUnitSpeed(sidebarUnit)}
            </div>
          </div>
          <div className="rounded bg-slate-900/90 border border-slate-800 py-1">
            <div className="text-slate-400">EVA</div>
            <div className="font-bold text-emerald-300">
              {sidebarUnit.derived.dodgeChance}%
            </div>
          </div>
          <div className="rounded bg-slate-900/90 border border-slate-800 py-1">
            <div className="text-slate-400">CRT</div>
            <div className="font-bold text-amber-300">
              {sidebarUnit.derived.critChance}%
            </div>
          </div>
        </div>

        {isBlocked && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[12px] text-amber-200 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{t('battle.frontRowBlocked')}</span>
          </div>
        )}

        {sidebarUnit.statuses.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sidebarUnit.statuses.slice(0, 4).map((st) => (
              <span
                key={st.type}
                className={`px-1.5 py-0.5 rounded border text-[12px] font-mono-nums ${
                  st.isDebuff
                    ? 'border-red-500/45 bg-red-500/12 text-red-200'
                    : 'border-sky-500/45 bg-sky-500/12 text-sky-200'
                }`}
              >
                {getStatusLabel(lang, st.type)}
              </span>
            ))}
          </div>
        )}

        {sidebarUnit.alive && isEnemy && !isStealthed && canPlayerManualAct && (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => selectTarget(sidebarUnit.id)}
            className={`w-full min-h-[44px] px-3 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
              isLocked
                ? 'border border-red-500/45 bg-red-500/15 text-red-200 cursor-default'
                : 'bg-red-500 hover:bg-red-400 text-slate-950 cursor-pointer'
            }`}
          >
            <Crosshair className="w-4 h-4 shrink-0" />
            <span>
              {isLocked ? t('battle.targetLockedBtn') : t('battle.lockTargetBtn')}
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-tactical-grid overflow-hidden">
      {isPhonePortrait ? (
        /* ==================== PHONE PORTRAIT LAYOUT (< 600px portrait) ==================== */
        <div
          data-testid="battle-phone-layout"
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          {/* 2) One-line turn queue strip (max 44px) */}
          <TurnQueueBar
            battle={battle}
            battleSpeed={battleSpeed}
            skipAnimations={skipAnimations}
            enrageBonusPct={enrageBonusPct}
            variant="phone"
            targetName={actingTargetName}
            onSelectUnit={(id) => {
              const u = battle.units.find((x) => x.id === id);
              if (u) handleInspectUnit(u);
            }}
          />

          {/* 3) One compact control row (max 48px): Auto, Speed Cycle, View Switch, "..." More */}
          <div
            data-testid="battle-phone-controls"
            className="h-12 max-h-[48px] shrink-0 border-b border-slate-800/80 bg-[#080D16] px-2 flex items-center justify-between gap-2"
          >
            <button
              type="button"
              data-testid="battle-auto-toggle"
              onClick={toggleAutoBattle}
              aria-pressed={autoBattleEnabled}
              className={`min-h-[44px] flex-1 px-2 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                autoBattleEnabled
                  ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Bot className="w-4 h-4 shrink-0" />
              <span>{autoBattleEnabled ? t('auto.auto') : t('auto.manual')}</span>
            </button>

            <button
              type="button"
              data-testid="battle-speed-cycle"
              onClick={cyclePhoneSpeed}
              title={t('battle.speedCycleTooltip')}
              aria-label={t('battle.speedCycleTooltip')}
              className="min-h-[44px] min-w-[56px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sky-300 font-mono-nums text-[13px] font-bold inline-flex items-center justify-center cursor-pointer whitespace-nowrap"
            >
              {battleSpeed}x
            </button>

            <button
              type="button"
              data-testid="battle-view-switch"
              onClick={() =>
                setBattleViewMode(
                  effectiveViewMode === 'radar' ? 'card' : 'radar'
                )
              }
              title={t('battle.viewSwitchTooltip')}
              aria-label={t('battle.viewSwitchTooltip')}
              className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {effectiveViewMode === 'radar' ? (
                <>
                  <LayoutGrid className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{t('battle.viewCard')}</span>
                </>
              ) : (
                <>
                  <Radar className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{t('battle.viewRadar')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="battle-more-btn"
              onClick={() => setMoreActionsOpen(true)}
              aria-label={t('battle.moreActions')}
              title={t('battle.moreActions')}
              className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 inline-flex items-center justify-center cursor-pointer shrink-0"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Safety Pause Notice (when Auto paused on Low HP / Boss / Elite) */}
          {battle.autoStopNotice && !battle.summary && (
            <div className="shrink-0 border-b border-orange-500/40 bg-orange-500/12 px-2 py-1 flex items-center justify-between gap-2 text-[12px] text-orange-200">
              <span className="truncate">
                {t('auto.pausedNotice', {
                  reason: getAutoStopReasonLabel(lang, battle.autoStopNotice),
                })}
              </span>
              <button
                type="button"
                onClick={() => setAutoBattleEnabled(true)}
                className="min-h-[32px] px-2 rounded border border-emerald-400/60 bg-emerald-500/20 text-emerald-200 font-semibold shrink-0 cursor-pointer"
              >
                {t('auto.auto')}
              </button>
            </div>
          )}

          {/* 4) Battlefield — takes ALL remaining height with no inner scroll & no clipping */}
          <div className="flex-1 min-h-0 flex flex-col p-2 overflow-hidden">
            {renderFieldContent()}
          </div>

          {/* 5) One-line log ticker (latest event only, opens full log bottom sheet) */}
          <div className="shrink-0 px-2 pb-1">
            <button
              type="button"
              data-testid="battle-log-ticker"
              onClick={() => setLogSheetOpen(true)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-slate-800 bg-[#080D16] hover:bg-slate-900 flex items-center justify-between gap-2 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ScrollText className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-[13px] text-slate-200 truncate">
                  {latestLog
                    ? formatCombatLogMessage(lang, latestLog)
                    : t('battle.logSheetHint', { count: battle.log.length })}
                </span>
              </div>
              <span className="text-[12px] font-mono-nums text-slate-400 inline-flex items-center gap-1 shrink-0">
                <span>{battle.log.length}</span>
                <ChevronUp className="w-4 h-4" />
              </span>
            </button>
          </div>

          {/* 6) Single-row bottom action dock — collapses to thin bar in Auto mode */}
          <div className="shrink-0 border-t border-slate-800/90 bg-[#0A0F18]/98 px-2 py-2 pb-safe">
            {autoBattleEnabled ? (
              <div
                data-testid="battle-auto-collapsed-dock"
                className="min-h-[44px] px-3 rounded-lg border border-emerald-500/40 bg-emerald-500/12 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 text-[13px] font-semibold text-emerald-200">
                  <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{t('battle.autoCollapsedBar')}</span>
                </div>
                <button
                  type="button"
                  data-testid="battle-auto-resume-manual"
                  onClick={() => setAutoBattleEnabled(false)}
                  className="min-h-[36px] px-3 rounded-md border border-slate-600 bg-slate-900 hover:bg-slate-800 text-slate-100 text-[13px] font-semibold shrink-0 cursor-pointer"
                >
                  {t('battle.switchManual')}
                </button>
              </div>
            ) : (
              <div
                data-testid="battle-manual-dock"
                className="grid grid-cols-4 gap-2"
              >
                <button
                  type="button"
                  data-testid="battle-action-attack"
                  disabled={!canPlayerManualAct}
                  onClick={() => performPlayerAction('attack')}
                  className="min-h-[44px] px-2 rounded-lg border border-emerald-500/70 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Crosshair className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('battle.actionAttack')}</span>
                </button>

                <button
                  type="button"
                  data-testid="battle-action-skill"
                  onClick={() => setSkillsSheetOpen(true)}
                  className="min-h-[44px] px-2 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4 text-sky-300 shrink-0" />
                  <span className="truncate">{t('battle.actionSkills')}</span>
                </button>

                <button
                  type="button"
                  data-testid="battle-action-defend"
                  disabled={!canPlayerManualAct}
                  onClick={() => performPlayerAction('defend')}
                  className="min-h-[44px] px-2 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 text-slate-100 font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="truncate">{t('battle.actionDefend')}</span>
                </button>

                <button
                  type="button"
                  data-testid="battle-action-item"
                  onClick={() => setSuppliesSheetOpen(true)}
                  className="min-h-[44px] px-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Backpack className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">{t('battle.actionItem')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== TABLET (600-1023) & PC (>= 1024) & LANDSCAPE PHONE LAYOUT ==================== */
        <div
          data-testid="battle-desktop-layout"
          className="flex-1 min-h-0 grid grid-cols-[minmax(0,65fr)_minmax(260px,35fr)] gap-2 p-2 overflow-hidden"
        >
          {/* LEFT COLUMN (~65%): Controls + Balance Bar + Field + Action Bar under field */}
          <div className="min-w-0 min-h-0 flex flex-col gap-2 overflow-hidden">
            {/* Compact Toolbar with PC Hover Tooltips */}
            <div className="shrink-0 rounded-lg border border-slate-800/90 bg-[#0A0F18]/95 px-2 py-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Manual | Auto */}
                <div
                  className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950 p-0.5"
                  role="group"
                  title={t('auto.hotkeyHint')}
                >
                  <button
                    type="button"
                    onClick={() => setAutoBattleEnabled(false)}
                    className={`min-h-[36px] px-2.5 rounded-md text-[13px] font-semibold transition-colors cursor-pointer ${
                      !autoBattleEnabled
                        ? 'bg-slate-200 text-slate-950'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {t('auto.manual')}
                  </button>
                  <button
                    type="button"
                    data-testid="battle-auto-toggle"
                    onClick={() => setAutoBattleEnabled(true)}
                    className={`min-h-[36px] px-2.5 rounded-md text-[13px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      autoBattleEnabled
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <span>{t('auto.auto')}</span>
                    <kbd className="font-mono-nums text-[12px] px-1 rounded bg-black/20">
                      A
                    </kbd>
                  </button>
                </div>

                {/* Speeds 1x 2x 3x 5x 10x */}
                <div
                  className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5"
                  role="group"
                  aria-label="Battle speed"
                >
                  {BATTLE_SPEEDS.map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setBattleSpeed(spd)}
                      title={`${spd}x`}
                      className={`min-h-[36px] px-2 rounded-md text-[12px] font-mono-nums font-bold transition-colors cursor-pointer ${
                        battleSpeed === spd
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {/* Radar | Card View Switch */}
                <div
                  className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950 p-0.5"
                  role="group"
                  aria-label={t('battle.viewModeLabel')}
                >
                  <button
                    type="button"
                    onClick={() => setBattleViewMode('radar')}
                    title={t('battle.viewRadar')}
                    className={`min-h-[36px] px-2.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      effectiveViewMode === 'radar'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <Radar className="w-3.5 h-3.5" />
                    <span>{t('battle.viewRadar')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBattleViewMode('card')}
                    title={t('battle.viewCard')}
                    className={`min-h-[36px] px-2.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      effectiveViewMode === 'card'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>{t('battle.viewCard')}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setTacticsModalOpen(true)}
                  title={t('auto.tacticsBtn')}
                  aria-label={t('auto.tacticsBtn')}
                  className="min-h-[36px] min-w-[36px] px-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 inline-flex items-center justify-center cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {/* Auto-Repeat */}
                {autoRepeatSession?.active ? (
                  <div className="inline-flex items-center gap-1.5 min-h-[36px] px-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 text-emerald-200 text-[12px] font-mono-nums font-semibold">
                    <Repeat className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="whitespace-nowrap">
                      {autoRepeatSession.limit === 'infinite'
                        ? `#${autoRepeatSession.completedRuns + 1}`
                        : `${Math.min(
                            autoRepeatSession.limit,
                            autoRepeatSession.completedRuns + 1
                          )}/${autoRepeatSession.limit}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => stopAutoRepeat('manual_stop')}
                      className="px-2 py-0.5 rounded bg-red-500/90 hover:bg-red-500 text-white text-[12px] font-sans font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>{t('auto.repeatStop')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden min-h-[36px]">
                    <select
                      value={String(autoRepeatLimit)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAutoRepeatLimit(
                          v === 'infinite'
                            ? 'infinite'
                            : (Number(v) as 1 | 5 | 10)
                        );
                      }}
                      aria-label={t('auto.repeatLabel')}
                      className="min-h-[36px] bg-transparent pl-2 pr-1 text-[12px] font-mono-nums text-slate-200 focus:outline-none cursor-pointer"
                    >
                      {REPEAT_OPTIONS.map((opt) => (
                        <option
                          key={String(opt)}
                          value={String(opt)}
                          className="bg-slate-900"
                        >
                          {repeatLabelFor(opt)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        startAutoRepeat(autoRepeatLimit, battle.sectorId)
                      }
                      title={t('auto.repeatStart')}
                      className="min-h-[36px] px-2 border-l border-slate-800 bg-slate-900 hover:bg-emerald-500/20 text-emerald-300 text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleSkipAnimations}
                  aria-pressed={skipAnimations}
                  title={t('battle.skipAnim')}
                  className={`min-h-[36px] px-2 rounded-lg border text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    skipAnimations
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ZapOff className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setStatsModalOpen(true)}
                  title={t('stats.title')}
                  aria-label={t('stats.title')}
                  className="min-h-[36px] px-2.5 rounded-lg border border-sky-500/45 bg-sky-500/12 hover:bg-sky-500/22 text-sky-200 text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t('stats.btn')}</span>
                </button>

                {!battle.summary && (
                  <button
                    type="button"
                    onClick={retreatBattle}
                    title={t('battle.retreat')}
                    aria-label={t('battle.retreat')}
                    className="min-h-[36px] px-2.5 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">{t('battle.retreat')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Compact Balance of Power Meter */}
            <div className="shrink-0 px-1 flex items-center gap-2 text-[12px] font-mono-nums">
              <span className="font-bold text-sky-300 w-10 text-left">
                {aliveAlliesCount}/{allies.length}
              </span>
              <div className="flex-1 h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${allySharePct}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-300"
                />
                <div
                  style={{ width: `${enemySharePct}%` }}
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
                />
              </div>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-bold text-amber-300 shrink-0">
                {battle.squadSize}v{battle.squadSize}
              </span>
              <span className="font-bold text-red-400 w-10 text-right">
                {aliveEnemiesCount}/{enemies.length}
              </span>
            </div>

            {battle.autoStopNotice && !battle.summary && (
              <div className="shrink-0 rounded-lg border border-orange-500/40 bg-orange-500/12 px-3 py-1.5 flex items-center justify-between gap-2 text-[13px] text-orange-200">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                  <span className="truncate">
                    {t('auto.pausedNotice', {
                      reason: getAutoStopReasonLabel(lang, battle.autoStopNotice),
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoBattleEnabled(true)}
                  className="min-h-[36px] px-3 rounded border border-emerald-400/60 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[12px] font-semibold cursor-pointer shrink-0"
                >
                  {t('auto.auto')}
                </button>
              </div>
            )}

            {/* Main Field */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {renderFieldContent()}
            </div>

            {/* Action Bar Under the Field */}
            <div className="shrink-0 rounded-lg border border-slate-800/90 bg-[#0A0F18]/98 p-2 space-y-2">
              {autoBattleEnabled ? (
                <div
                  data-testid="battle-auto-collapsed-dock"
                  className="min-h-[44px] px-3 rounded-lg border border-emerald-500/40 bg-emerald-500/12 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200 min-w-0">
                    <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      {t('auto.autoTurnRunning', {
                        gear: getClassName(lang, battle.deployedGearId),
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="battle-auto-resume-manual"
                    onClick={() => setAutoBattleEnabled(false)}
                    className="min-h-[36px] px-3 rounded-md border border-slate-600 bg-slate-900 hover:bg-slate-800 text-slate-100 text-[13px] font-semibold cursor-pointer shrink-0"
                  >
                    {t('battle.switchManual')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Turn Status + Active Locks */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] px-1">
                    <div className="font-semibold truncate">
                      {isPlayerCharging ? (
                        <span className="text-amber-300">
                          {t('battle.chargingTurn')}
                        </span>
                      ) : isPlayerTurn ? (
                        <span style={{ color: 'var(--turn-active-text)' }}>
                          {t('battle.yourTurnShort')}
                        </span>
                      ) : battle.summary ? (
                        <span className="text-slate-300">
                          {autoRepeatSession?.active
                            ? t('auto.repeatNextSoon')
                            : t('battle.concluded')}
                        </span>
                      ) : (
                        <span className="text-slate-300">
                          {t('battle.aiTurnShort', {
                            name: activeUnit?.name ?? '',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[12px]">
                      {playerHasLongRangeBasic && (
                        <span className="font-mono-nums text-sky-300">
                          {t('battle.longRangeReady')}
                        </span>
                      )}
                      {hasSingleAllySkill && selectedAlly && selectedAlly.alive && (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <HeartHandshake className="w-3.5 h-3.5" />
                          <span>{selectedAlly.name}</span>
                        </span>
                      )}
                      {selectedTarget && selectedTarget.alive && (
                        <span className="inline-flex items-center gap-1 text-red-300">
                          <Crosshair className="w-3.5 h-3.5 text-red-400" />
                          <span className="font-semibold">
                            {selectedTarget.name}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Single-Row Core + Skill Controls */}
                  <div
                    data-testid="battle-manual-dock"
                    className="flex items-stretch gap-2"
                  >
                    {/* Basic Attack / Defend / Item */}
                    <div className="flex items-stretch gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-testid="battle-action-attack"
                        disabled={!canPlayerManualAct}
                        onClick={() => performPlayerAction('attack')}
                        title={`${t('battle.actionAttack')} (1)`}
                        className="min-h-[44px] px-3 rounded-lg border border-emerald-500/70 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-[13px] inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Crosshair className="w-4 h-4 shrink-0" />
                        <span>{t('battle.actionAttack')}</span>
                        <kbd className="font-mono-nums text-[12px] px-1 rounded bg-black/15">
                          1
                        </kbd>
                      </button>

                      <button
                        type="button"
                        data-testid="battle-action-defend"
                        disabled={!canPlayerManualAct}
                        onClick={() => performPlayerAction('defend')}
                        title={`${t('battle.actionDefend')} (Q)`}
                        className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 text-slate-100 font-semibold text-[13px] inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>{t('battle.actionDefend')}</span>
                        <kbd className="font-mono-nums text-[12px] px-1 rounded bg-slate-950/70 text-slate-300">
                          Q
                        </kbd>
                      </button>

                      <button
                        type="button"
                        data-testid="battle-action-item"
                        onClick={() => setSuppliesSheetOpen(true)}
                        title={t('battle.suppliesTitle')}
                        className="min-h-[44px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-[13px] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Backpack className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="hidden xl:inline">
                          {t('battle.actionItem')}
                        </span>
                      </button>
                    </div>

                    {/* Equipped Skill Slots (hover tooltips on PC) */}
                    <div className="flex-1 min-w-0 grid grid-cols-3 xl:grid-cols-6 gap-1.5">
                      {playerSkillIds.length === 0 ? (
                        <div className="col-span-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-center text-[13px] text-slate-500">
                          {t('battle.noSkillsSlotted')}
                        </div>
                      ) : (
                        playerSkillIds.slice(0, 6).map((skillId, idx) => {
                          const skill = getSkillById(skillId);
                          if (!skill || !playerUnit) return null;
                          const usability = canUnitUseSkill(playerUnit, skill.id);
                          const clickable = canPlayerManualAct && usability.canUse;
                          const reasonText = getBattleSkillReason(lang, usability);
                          const lv = playerUnit.skillLevels[skill.id] ?? 1;
                          const isToggleOn = Boolean(usability.isToggleActive);
                          const isUsedOnce =
                            skill.oncePerBattle &&
                            playerUnit.usedOnceSkills.includes(skill.id);

                          const borderClass = isToggleOn
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                            : !clickable
                            ? 'border-slate-800 bg-slate-900/70 text-slate-500 opacity-65'
                            : skill.category === 'elite'
                            ? 'border-amber-400/80 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100'
                            : skill.category === 'special'
                            ? 'border-purple-400/80 bg-purple-500/15 hover:bg-purple-500/25 text-purple-100'
                            : 'border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100';

                          return (
                            <button
                              key={skill.id}
                              type="button"
                              disabled={!clickable}
                              onClick={() => {
                                if (clickable) {
                                  performPlayerAction('skill', skill.id);
                                }
                              }}
                              onMouseEnter={() => setInspectedSkillId(skill.id)}
                              onFocus={() => setInspectedSkillId(skill.id)}
                              title={`${getSkillName(lang, skill.id)} (Lv.${lv}) — ${getSkillDesc(
                                lang,
                                skill.id
                              )}${reasonText ? ` [${reasonText}]` : ''}`}
                              className={`min-h-[44px] px-2 py-1 rounded-lg border text-left transition-colors flex flex-col justify-between gap-0.5 ${borderClass} ${
                                clickable ? 'cursor-pointer' : 'cursor-not-allowed'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <SkillIcon
                                  icon={skill.icon}
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                                <span className="font-mono-nums text-[12px] font-bold text-amber-300">
                                  {isToggleOn
                                    ? t('battle.skillOnTag')
                                    : isUsedOnce
                                    ? t('battle.skillUsedTag')
                                    : usability.cooldownRemaining > 0
                                    ? `CD${usability.cooldownRemaining}`
                                    : `${usability.spCost}`}
                                </span>
                              </div>
                              <div className="text-[12px] font-semibold leading-tight truncate">
                                {getSkillName(lang, skill.id)}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* PC Skill Hover Tooltip Bar */}
                  {inspectedSkill && inspectedScaled && inspectedUsability && (
                    <div className="rounded border border-slate-800 bg-[#070B12] px-2.5 py-1 flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="font-semibold text-slate-100 shrink-0">
                          {getSkillName(lang, inspectedSkill.id)} (Lv.{inspectedLv})
                        </span>
                        <span className="text-slate-400 truncate">
                          {getSkillDesc(lang, inspectedSkill.id)}
                        </span>
                      </div>
                      <span className="font-mono-nums text-sky-300 shrink-0">
                        {getSkillTargetLabel(lang, inspectedSkill.targetType)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (~35%): Turn Queue + Selected Unit Detail + Full Combat Log */}
          <aside className="min-w-0 min-h-0 flex flex-col gap-2 overflow-hidden">
            <TurnQueueBar
              battle={battle}
              battleSpeed={battleSpeed}
              skipAnimations={skipAnimations}
              enrageBonusPct={enrageBonusPct}
              variant="sidebar"
              targetName={actingTargetName}
              onSelectUnit={(id) => setInspectedUnitId(id)}
            />

            {renderSidebarSelectedUnit()}

            <div className="flex-1 min-h-0 rounded-lg border border-slate-800 bg-[#070A10] flex flex-col overflow-hidden">
              <div className="shrink-0 px-3 py-2 border-b border-slate-800/90 flex items-center justify-between text-[12px] text-slate-400">
                <span className="font-semibold text-slate-200">
                  {t('battle.combatLog')}
                </span>
                <span className="font-mono-nums">
                  {t('battle.eventsCount', { count: battle.log.length })}
                </span>
              </div>
              <CombatLogList
                entries={battle.log}
                active={!isPhonePortrait}
                density="compact"
              />
            </div>
          </aside>
        </div>
      )}

      {/* ==================== PHONE MORE ACTIONS ("...") BOTTOM SHEET ==================== */}
      <BottomSheet
        open={moreActionsOpen}
        onClose={() => setMoreActionsOpen(false)}
        title={t('battle.moreActions')}
        subtitle={`${sectorLabel} · ${battle.squadSize}v${battle.squadSize}`}
      >
        <div className="space-y-4">
          {/* Full Speed Picker (1x / 2x / 3x / 5x / 10x) */}
          <div className="space-y-2">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Speed
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BATTLE_SPEEDS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setBattleSpeed(spd)}
                  className={`min-h-[44px] rounded-lg border font-mono-nums text-[13px] font-bold cursor-pointer ${
                    battleSpeed === spd
                      ? 'border-sky-400 bg-sky-500 text-slate-950'
                      : 'border-slate-700 bg-slate-900 text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Repeat */}
          <div className="rounded-lg border border-slate-800 bg-[#080D16] p-3 space-y-2">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              {t('auto.repeatLabel')}
            </div>
            {autoRepeatSession?.active ? (
              <button
                type="button"
                onClick={() => {
                  stopAutoRepeat('manual_stop');
                  setMoreActionsOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t('auto.repeatStop')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={String(autoRepeatLimit)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAutoRepeatLimit(
                      v === 'infinite' ? 'infinite' : (Number(v) as 1 | 5 | 10)
                    );
                  }}
                  aria-label={t('auto.repeatLabel')}
                  className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[13px] font-mono-nums text-slate-100"
                >
                  {REPEAT_OPTIONS.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                      {repeatLabelFor(opt)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    startAutoRepeat(autoRepeatLimit, battle.sectorId);
                    setMoreActionsOpen(false);
                  }}
                  className="min-h-[44px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Repeat className="w-4 h-4" />
                  <span>{t('auto.repeatStart')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => {
                setMoreActionsOpen(false);
                setTacticsModalOpen(true);
              }}
              className="min-h-[44px] px-3.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100 text-[13px] font-semibold flex items-center gap-2.5 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
              <span>{t('auto.tacticsBtn')}</span>
            </button>

            <button
              type="button"
              onClick={toggleSkipAnimations}
              aria-pressed={skipAnimations}
              className={`min-h-[44px] px-3.5 rounded-lg border text-[13px] font-semibold flex items-center justify-between cursor-pointer ${
                skipAnimations
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                  : 'border-slate-700 bg-slate-900 text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                <ZapOff className="w-4 h-4 text-sky-400" />
                <span>{t('battle.skipAnim')}</span>
              </span>
              <span className="font-mono-nums text-[12px]">
                {skipAnimations ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMoreActionsOpen(false);
                setStatsModalOpen(true);
              }}
              className="min-h-[44px] px-3.5 rounded-lg border border-sky-500/45 bg-sky-500/12 text-sky-200 text-[13px] font-semibold flex items-center gap-2.5 cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-sky-400" />
              <span>{t('stats.title')}</span>
            </button>

            {!battle.summary && (
              <button
                type="button"
                onClick={() => {
                  setMoreActionsOpen(false);
                  retreatBattle();
                }}
                className="min-h-[44px] px-3.5 rounded-lg border border-red-500/45 bg-red-500/12 text-red-200 text-[13px] font-semibold flex items-center gap-2.5 cursor-pointer"
              >
                <Flag className="w-4 h-4 text-red-400" />
                <span>{t('battle.retreat')}</span>
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* ==================== PHONE SKILLS BOTTOM SHEET ==================== */}
      <BottomSheet
        open={skillsSheetOpen}
        onClose={() => setSkillsSheetOpen(false)}
        title={t('battle.skillsSheetTitle')}
        subtitle={
          playerUnit
            ? `SP ${playerUnit.sp}/${playerUnit.derived.maxSp}`
            : undefined
        }
      >
        {playerSkillIds.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-center text-[13px] text-slate-400">
            {t('battle.noSkillsSlotted')}
          </div>
        ) : (
          <div className="space-y-2">
            {playerSkillIds.slice(0, 6).map((skillId) => {
              const skill = getSkillById(skillId);
              if (!skill || !playerUnit) return null;
              const usability = canUnitUseSkill(playerUnit, skill.id);
              const clickable = canPlayerManualAct && usability.canUse;
              const isToggleOn = Boolean(usability.isToggleActive);
              const isUsedOnce =
                skill.oncePerBattle &&
                playerUnit.usedOnceSkills.includes(skill.id);
              const reasonText = getBattleSkillReason(lang, usability);

              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    if (clickable) {
                      performPlayerAction('skill', skill.id);
                      setSkillsSheetOpen(false);
                    }
                  }}
                  className={`w-full min-h-[56px] p-3 rounded-lg border text-left flex items-start justify-between gap-3 transition-colors ${
                    isToggleOn
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                      : !clickable
                      ? 'border-slate-800 bg-slate-900/70 text-slate-500 opacity-65'
                      : skill.category === 'elite'
                      ? 'border-amber-400/80 bg-amber-500/15 text-amber-100 cursor-pointer'
                      : skill.category === 'special'
                      ? 'border-purple-400/80 bg-purple-500/15 text-purple-100 cursor-pointer'
                      : 'border-sky-500/50 bg-sky-500/15 text-sky-100 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded bg-slate-950/80 border border-slate-700 flex items-center justify-center shrink-0">
                      <SkillIcon icon={skill.icon} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold leading-tight truncate">
                        {getSkillName(lang, skill.id)}
                      </div>
                      <div className="text-[12px] text-slate-300 mt-0.5 leading-snug">
                        {getSkillDesc(lang, skill.id)}
                      </div>
                      {!usability.canUse && reasonText && (
                        <div className="text-[12px] text-red-400 font-semibold mt-0.5">
                          {reasonText}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono-nums text-[12px] font-bold text-amber-300 shrink-0">
                    {isToggleOn
                      ? t('battle.skillOnTag')
                      : isUsedOnce
                      ? t('battle.skillUsedTag')
                      : usability.cooldownRemaining > 0
                      ? `CD ${usability.cooldownRemaining}`
                      : `${usability.spCost} SP`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>

      {/* ==================== AUTO-REPEAT BATCH SUMMARY MODAL ==================== */}
      <ErrorBoundary
        variant="panel"
        title={t('auto.repeatSummaryTitle')}
        resetKey={showRepeatBatchSummary}
        onClose={clearAutoRepeatSummary}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        {showRepeatBatchSummary && autoRepeatSession && (
          <div
            className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeat-summary-title"
          >
            <div className="w-full max-w-md rounded-lg border border-emerald-500/50 bg-[#0E1521] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto tactical-scroll">
              <div className="space-y-1">
                <div className="text-[12px] font-semibold tracking-widest uppercase text-emerald-400 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{getSectorName(lang, autoRepeatSession.sectorId)}</span>
                </div>
                <h2
                  id="repeat-summary-title"
                  className="font-display text-[20px] font-bold tracking-wide text-slate-50"
                >
                  {t('auto.repeatSummaryTitle')}
                </h2>
                {autoRepeatSession.stopReason && (
                  <p className="text-[13px] text-orange-300 font-medium">
                    {getAutoStopReasonLabel(lang, autoRepeatSession.stopReason)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                  <div className="text-[12px] text-slate-400">
                    {t('auto.repeatLabel')}
                  </div>
                  <div className="mt-0.5 font-mono-nums text-[20px] font-bold text-emerald-400">
                    {t('auto.repeatSummaryRuns', {
                      wins: autoRepeatSession.wins,
                      runs: autoRepeatSession.completedRuns,
                    })}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                  <div className="text-[12px] text-slate-400">
                    {t('summary.expEarned', {
                      gear: getClassName(lang, battle.deployedGearId),
                    })}
                  </div>
                  <div className="mt-0.5 font-mono-nums text-[20px] font-bold text-amber-400">
                    +{autoRepeatSession.totalExp.toLocaleString()} EXP
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                  <div className="text-[12px] text-slate-400">
                    {t('summary.creditsAwarded')}
                  </div>
                  <div className="mt-0.5 font-mono-nums text-[15px] font-bold text-slate-100">
                    +{autoRepeatSession.totalCredits.toLocaleString()} CR
                  </div>
                </div>

                <div className="rounded border border-purple-500/40 bg-purple-500/10 p-3">
                  <div className="text-[12px] text-purple-200">
                    {t('summary.warPointsAwarded')}
                  </div>
                  <div className="mt-0.5 font-mono-nums text-[15px] font-bold text-purple-300">
                    +{autoRepeatSession.totalWarPoints.toLocaleString()} WP
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                    <Package className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('summary.dropsTitle')}</span>
                  </span>
                  <span className="font-mono-nums">
                    {t('common.itemCount', {
                      count: autoRepeatSession.totalDrops.length,
                    })}
                  </span>
                </div>
                {autoRepeatSession.totalDrops.length === 0 ? (
                  <div className="rounded border border-slate-800/80 bg-[#090D14] px-3 py-2 text-[13px] text-slate-500">
                    {t('summary.noDrops')}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto tactical-scroll">
                    {autoRepeatSession.totalDrops.map((inst) => (
                      <div
                        key={inst.instanceId}
                        className={`rounded border bg-[#090D14] px-3 py-1.5 flex items-center justify-between gap-2 ${
                          RARITY_META[inst.rarity].borderClass
                        }`}
                      >
                        <span
                          className={`text-[13px] font-semibold truncate ${
                            RARITY_META[inst.rarity].textClass
                          }`}
                        >
                          {getItemInstanceName(lang, inst)}
                        </span>
                        <span className="text-[12px] font-mono-nums text-slate-400 shrink-0">
                          {getSlotLabel(lang, inst.slot)} · T{inst.tier}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStatsModalOpen(true)}
                  className="w-full min-h-[44px] px-4 rounded-lg border border-sky-500/50 bg-sky-500/12 hover:bg-sky-500/22 text-sky-200 font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  <span>{t('stats.title')}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={returnToHangar}
                    className="flex-1 min-h-[44px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] transition-colors cursor-pointer"
                  >
                    {t('nav.returnHangar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAutoRepeatSummary();
                      startAutoRepeat(autoRepeatLimit, battle.sectorId);
                    }}
                    className="flex-1 min-h-[44px] px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-[13px] transition-colors cursor-pointer"
                  >
                    {t('auto.repeatStart')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>

      {/* ==================== VICTORY / DEFEAT / RETREAT RESULTS MODAL ==================== */}
      <ErrorBoundary
        variant="panel"
        title={t('summary.victory')}
        resetKey={Boolean(battle.summary)}
        onClose={returnToHangar}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        {battle.summary &&
          !autoRepeatSession?.active &&
          !showRepeatBatchSummary && (
            <div
              className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="battle-outcome-title"
            >
              <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#0E1521] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto tactical-scroll">
                <div className="space-y-1">
                  <div
                    className={`text-[12px] font-semibold tracking-widest uppercase ${
                      battle.summary.outcome === 'victory'
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {t('summary.rounds', {
                      sector: getSectorName(lang, battle.summary.sectorId),
                      rounds: battle.summary.rounds,
                    })}
                  </div>
                  <h2
                    id="battle-outcome-title"
                    className="font-display text-[20px] font-bold tracking-wide text-slate-50"
                  >
                    {battle.summary.outcome === 'victory'
                      ? t('summary.victory')
                      : battle.summary.retreated
                      ? t('summary.retreatTitle')
                      : t('summary.defeat')}
                  </h2>
                  <p className="text-[13px] text-slate-400">
                    {battle.summary.outcome === 'victory'
                      ? t('summary.victoryDesc')
                      : t('summary.defeatDesc')}
                  </p>
                </div>

                {battle.summary.leveledUp && (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-[15px] font-bold text-emerald-300">
                        {t('summary.levelUp', {
                          gear: getClassName(
                            lang,
                            battle.summary.deployedGearId
                          ),
                          prev: battle.summary.previousLevel,
                          next: battle.summary.newLevel,
                        })}
                      </div>
                      <div className="text-[12px] text-emerald-200/80">
                        {t('summary.levelUpDesc')}
                      </div>
                    </div>
                    <div className="font-mono-nums text-[15px] font-bold text-emerald-300 whitespace-nowrap">
                      +{battle.summary.statPointsGained} PTS
                    </div>
                  </div>
                )}

                {battle.summary.unlockedSectorId && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-[13px] font-semibold text-amber-300">
                    {t('summary.sectorUnlocked', {
                      sector: getSectorName(
                        lang,
                        battle.summary.unlockedSectorId
                      ),
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                    <div className="text-[12px] text-slate-400">
                      {t('summary.expEarned', {
                        gear: getClassName(lang, battle.summary.deployedGearId),
                      })}
                    </div>
                    <div className="mt-0.5 font-mono-nums text-[20px] font-bold text-amber-400">
                      +{battle.summary.expGained} EXP
                    </div>
                    <div className="text-[12px] font-mono-nums text-slate-400 mt-0.5">
                      {battle.summary.newLevel >= BALANCE_CONFIG.maxLevel
                        ? t('summary.maxLevelReached')
                        : t('summary.battlesToNext', {
                            count: battle.summary.battlesToNextLevel,
                            next: battle.summary.newLevel + 1,
                          })}
                    </div>
                  </div>

                  <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                    <div className="text-[12px] text-slate-400">
                      {t('summary.creditsAwarded')}
                    </div>
                    <div className="mt-0.5 font-mono-nums text-[20px] font-bold text-slate-100">
                      +{battle.summary.creditsGained.toLocaleString()} CR
                    </div>
                  </div>

                  <div className="col-span-2 rounded border border-purple-500/40 bg-purple-500/10 p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] text-purple-200 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-purple-400" />
                        <span>{t('summary.warPointsAwarded')}</span>
                      </div>
                      {battle.summary.baseCaptureBonusWp > 0 && (
                        <div className="text-[12px] text-purple-300/90 mt-0.5">
                          {t('summary.captureBonusNote', {
                            wp: battle.summary.baseCaptureBonusWp,
                          })}
                        </div>
                      )}
                    </div>
                    <div className="font-mono-nums text-[20px] font-bold text-purple-300">
                      +{battle.summary.warPointsGained} WP
                    </div>
                  </div>

                  <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                    <div className="text-[12px] text-slate-400">
                      {t('summary.hostilesDestroyed')}
                    </div>
                    <div className="mt-0.5 font-mono-nums text-[15px] font-semibold text-slate-200">
                      {battle.summary.enemiesDestroyed} /{' '}
                      {battle.summary.totalEnemies}
                    </div>
                  </div>

                  <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                    <div className="text-[12px] text-slate-400">
                      {t('summary.alliesSurviving')}
                    </div>
                    <div className="mt-0.5 font-mono-nums text-[15px] font-semibold text-slate-200">
                      {battle.summary.alliesSurviving} / {battle.squadSize}
                    </div>
                  </div>
                </div>

                {/* Salvaged Drops */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px] text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('summary.dropsTitle')}</span>
                    </span>
                    <span className="font-mono-nums">
                      {t('common.itemCount', {
                        count: battle.summary.droppedItems.length,
                      })}
                    </span>
                  </div>

                  {battle.summary.droppedItems.length === 0 ? (
                    <div className="rounded border border-slate-800/80 bg-[#090D14] px-3 py-2.5 text-[13px] text-slate-500">
                      {t('summary.noDrops')}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto tactical-scroll">
                      {battle.summary.droppedItems.map((inst) => {
                        const stats = getEffectiveItemStats(inst);
                        return (
                          <div
                            key={inst.instanceId}
                            className={`rounded border bg-[#090D14] px-3 py-2 flex items-center justify-between gap-2 ${
                              RARITY_META[inst.rarity].borderClass
                            }`}
                          >
                            <div className="min-w-0">
                              <div
                                className={`text-[13px] font-semibold truncate ${
                                  RARITY_META[inst.rarity].textClass
                                }`}
                              >
                                {getItemInstanceName(lang, inst)}
                              </div>
                              <div className="text-[12px] text-slate-400">
                                {getSlotLabel(lang, inst.slot)} ·{' '}
                                {getRarityLabel(lang, inst.rarity)} · T
                                {inst.tier} · {inst.rollQuality}%
                              </div>
                            </div>
                            <div className="text-right font-mono-nums text-[12px] text-emerald-400 shrink-0">
                              {STAT_KEYS.filter((k) => stats[k] > 0)
                                .map(
                                  (k) => `+${stats[k]} ${getStatShort(lang, k)}`
                                )
                                .join(' ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStatsModalOpen(true)}
                    className="w-full min-h-[44px] px-4 rounded-lg border border-sky-500/50 bg-sky-500/12 hover:bg-sky-500/22 text-sky-200 font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4 text-sky-400" />
                    <span>{t('stats.title')}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={returnToHangar}
                      className="flex-1 min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[13px] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t('nav.returnHangar')}
                    </button>
                    <button
                      type="button"
                      onClick={() => startBattle()}
                      className="flex-1 min-h-[44px] px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-[13px] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t('summary.nextSortie')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </ErrorBoundary>

      {/* ==================== PHONE UNIT DETAIL SHEET (full name & stats) ==================== */}
      <ErrorBoundary
        variant="panel"
        title={phoneSheetUnit?.name ?? 'Unit Telemetry'}
        resetKey={phoneUnitSheetId ?? 'none'}
        onClose={() => setPhoneUnitSheetId(null)}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        <UnitDetailSheet
          unit={phoneSheetUnit}
          onClose={() => setPhoneUnitSheetId(null)}
          isTargeted={Boolean(
            phoneSheetUnit &&
              ((phoneSheetUnit.side === 'enemy' &&
                battle.selectedTargetId === phoneSheetUnit.id) ||
                (phoneSheetUnit.side === 'ally' &&
                  hasSingleAllySkill &&
                  battle.selectedAllyTargetId === phoneSheetUnit.id))
          )}
          canLockEnemy={canPlayerManualAct}
          canLockAlly={canPlayerManualAct && hasSingleAllySkill}
          frontRowBlocked={Boolean(
            phoneSheetUnit &&
              phoneSheetUnit.side === 'enemy' &&
              !validBasicTargetIds.has(phoneSheetUnit.id)
          )}
          onLockEnemy={selectTarget}
          onLockAlly={selectAllyTarget}
        />
      </ErrorBoundary>

      {/* ==================== MOBILE COMBAT LOG BOTTOM SHEET ==================== */}
      <ErrorBoundary
        variant="panel"
        title={t('battle.combatLog')}
        resetKey={logSheetOpen}
        onClose={() => setLogSheetOpen(false)}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        <BottomSheet
          open={logSheetOpen}
          onClose={() => setLogSheetOpen(false)}
          title={t('battle.combatLog')}
          subtitle={t('battle.eventsCount', { count: battle.log.length })}
          maxHeightClass="h-[78dvh] max-h-[86dvh]"
          bodyScrollable={false}
        >
          <CombatLogList
            entries={battle.log}
            active={logSheetOpen}
            density="comfortable"
          />
        </BottomSheet>
      </ErrorBoundary>

      {/* ==================== FIELD SUPPLIES & TACTICS BOTTOM SHEET ==================== */}
      <ErrorBoundary
        variant="panel"
        title={t('battle.suppliesTitle')}
        resetKey={suppliesSheetOpen}
        onClose={() => setSuppliesSheetOpen(false)}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        <BottomSheet
          open={suppliesSheetOpen}
          onClose={() => setSuppliesSheetOpen(false)}
          title={t('battle.suppliesTitle')}
          footer={
            <button
              type="button"
              onClick={() => {
                setSuppliesSheetOpen(false);
                setTacticsModalOpen(true);
              }}
              className="w-full min-h-[44px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>{t('battle.openTactics')}</span>
            </button>
          }
        >
          <div className="rounded-lg border border-slate-800 bg-[#080D16] p-4 text-[13px] text-slate-300 leading-relaxed flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{t('battle.noConsumables')}</span>
          </div>
        </BottomSheet>
      </ErrorBoundary>

      {/* ==================== BATTLE STATISTICS MODAL ==================== */}
      <ErrorBoundary
        variant="panel"
        title={t('stats.title')}
        resetKey={statsModalOpen}
        onClose={() => setStatsModalOpen(false)}
        onReloadBattle={() => startBattle(battle.sectorId)}
      >
        <BattleStatsModal
          open={statsModalOpen}
          onClose={() => setStatsModalOpen(false)}
          battle={battle}
          enrageBonusPct={enrageBonusPct}
        />
      </ErrorBoundary>
    </div>
  );
}
