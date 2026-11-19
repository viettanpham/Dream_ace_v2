import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Crosshair,
  Flag,
  HeartHandshake,
  Info,
  Package,
  Repeat,
  Settings,
  Shield,
  Square,
  ZapOff,
} from 'lucide-react';
import { BALANCE_CONFIG } from '../data/balance';
import { STAT_KEYS } from '../data/classes';
import { RARITY_META } from '../data/items';
import { getScaledSkillStats, getSkillById } from '../data/skills';
import { hasStatus } from '../engine/combat';
import { getEffectiveItemStats } from '../engine/equipment';
import { canUnitUseSkill } from '../engine/skills';
import {
  formatCombatLogMessage,
  getAutoStopReasonLabel,
  getBattleSkillReason,
  getClassName,
  getItemInstanceName,
  getLogTagLabel,
  getRarityLabel,
  getSectorName,
  getSkillDesc,
  getSkillName,
  getSkillTargetLabel,
  getSlotLabel,
  getStatShort,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type {
  AutoRepeatLimit,
  BattleSpeed,
  CombatFxEvent,
  CombatLogEntry,
} from '../types/game';
import { BattleUnitCard } from './BattleUnitCard';
import { SkillIcon } from './SkillIcon';
import { TurnQueueBar } from './TurnQueueBar';

const BATTLE_SPEEDS: BattleSpeed[] = [1, 2, 3, 5, 10];
const REPEAT_OPTIONS: AutoRepeatLimit[] = [1, 5, 10, 'infinite'];

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

function BattleFxOverlay({ fxEvents }: { fxEvents: CombatFxEvent[] }) {
  if (fxEvents.length === 0) return null;

  const slotY = (idx: number) => 15 + idx * 23.5;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none hidden md:block absolute inset-0 z-30 h-full w-full"
      aria-hidden="true"
    >
      {fxEvents.map((fx) => {
        const x1 = fx.fromSide === 'ally' ? 18 : 82;
        const y1 = slotY(fx.fromSlotIndex);

        if (fx.kind === 'heal') {
          const xAnchor = fx.fromSide === 'ally' ? 14 : 86;
          return (
            <g key={fx.id}>
              {fx.toSlotIndices.map((tIdx) => {
                const y2 = slotY(tIdx);
                return (
                  <g key={tIdx}>
                    <line
                      x1={xAnchor}
                      y1={y1}
                      x2={xAnchor}
                      y2={y2}
                      stroke="#10B981"
                      strokeWidth="1.2"
                      className="anim-beam"
                    />
                    <circle
                      cx={xAnchor}
                      cy={y2}
                      r="3.2"
                      fill="#10B981"
                      fillOpacity="0.45"
                      className="anim-impact-flash"
                    />
                  </g>
                );
              })}
            </g>
          );
        }

        const x2 = fx.toSide === 'enemy' ? 84 : 16;

        if (fx.kind === 'railgun') {
          return (
            <g key={fx.id}>
              {fx.toSlotIndices.map((tIdx) => {
                const y2 = slotY(tIdx);
                return (
                  <g key={tIdx}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={fx.accentHex}
                      strokeWidth="2.4"
                      opacity="0.4"
                      className="anim-beam"
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#FEF9C3"
                      strokeWidth="0.85"
                      className="anim-beam"
                    />
                  </g>
                );
              })}
            </g>
          );
        }

        if (fx.kind === 'missile') {
          return (
            <g key={fx.id}>
              {fx.toSlotIndices.map((tIdx) => {
                const y2 = slotY(tIdx);
                const midX = (x1 + x2) / 2;
                const ctrlY1 = Math.max(4, Math.min(96, (y1 + y2) / 2 - 9));
                const ctrlY2 = Math.max(4, Math.min(96, (y1 + y2) / 2 + 9));
                return (
                  <g key={tIdx}>
                    <path
                      d={`M ${x1} ${y1} Q ${midX} ${ctrlY1} ${x2} ${y2}`}
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="0.6"
                      opacity="0.45"
                      className="anim-missile"
                    />
                    <path
                      d={`M ${x1} ${y1} Q ${midX} ${ctrlY1} ${x2} ${y2}`}
                      fill="none"
                      stroke={fx.accentHex}
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      className="anim-missile"
                    />
                    <path
                      d={`M ${x1} ${y1} Q ${midX} ${ctrlY2} ${x2} ${y2}`}
                      fill="none"
                      stroke="#FDE047"
                      strokeWidth="1"
                      strokeLinecap="round"
                      className="anim-missile"
                    />
                  </g>
                );
              })}
            </g>
          );
        }

        return (
          <g key={fx.id}>
            {fx.toSlotIndices.map((tIdx) => {
              const y2 = slotY(tIdx);
              return (
                <g key={tIdx}>
                  <line
                    x1={x1}
                    y1={y1 - 1.2}
                    x2={x2}
                    y2={y2 - 0.8}
                    stroke={fx.accentHex}
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    className="anim-bolt"
                  />
                  <line
                    x1={x1}
                    y1={y1 + 1.2}
                    x2={x2}
                    y2={y2 + 0.8}
                    stroke="#FFFFFF"
                    strokeWidth="0.7"
                    strokeLinecap="round"
                    className="anim-bolt"
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function BattleScreen() {
  const { lang, t } = useI18n();
  const battle = useGameStore((s) => s.battle);
  const battleSpeed = useGameStore((s) => s.battleSpeed);
  const skipAnimations = useGameStore((s) => s.skipAnimations);
  const autoBattleEnabled = useGameStore((s) => s.autoBattleEnabled);
  const autoRepeatLimit = useGameStore((s) => s.autoRepeatLimit);
  const autoRepeatSession = useGameStore((s) => s.autoRepeatSession);
  const tacticsModalOpen = useGameStore((s) => s.tacticsModalOpen);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const selectAllyTarget = useGameStore((s) => s.selectAllyTarget);
  const performPlayerAction = useGameStore((s) => s.performPlayerAction);
  const performAutoPlayerTurn = useGameStore((s) => s.performAutoPlayerTurn);
  const performAiTurn = useGameStore((s) => s.performAiTurn);
  const retreatBattle = useGameStore((s) => s.retreatBattle);
  const clearExpiredPopups = useGameStore((s) => s.clearExpiredPopups);
  const clearExpiredFx = useGameStore((s) => s.clearExpiredFx);
  const clearExplodedUnits = useGameStore((s) => s.clearExplodedUnits);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const startBattle = useGameStore((s) => s.startBattle);
  const setBattleSpeed = useGameStore((s) => s.setBattleSpeed);
  const toggleSkipAnimations = useGameStore((s) => s.toggleSkipAnimations);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const setAutoBattleEnabled = useGameStore((s) => s.setAutoBattleEnabled);
  const toggleAutoBattle = useGameStore((s) => s.toggleAutoBattle);
  const setTacticsModalOpen = useGameStore((s) => s.setTacticsModalOpen);
  const setAutoRepeatLimit = useGameStore((s) => s.setAutoRepeatLimit);
  const startAutoRepeat = useGameStore((s) => s.startAutoRepeat);
  const stopAutoRepeat = useGameStore((s) => s.stopAutoRepeat);
  const clearAutoRepeatSummary = useGameStore((s) => s.clearAutoRepeatSummary);

  const [inspectedSkillId, setInspectedSkillId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const bypassFx = skipAnimations || battleSpeed === 10;

  const activeUnitId = battle ? battle.turnOrder[battle.activeTurnIndex] : null;
  const activeUnit =
    battle?.units.find((u) => u.id === activeUnitId) ?? null;
  const isPlayerCharging = Boolean(
    activeUnit?.isPlayer && activeUnit.alive && hasStatus(activeUnit, 'charging')
  );
  // If player is mid-Charge Shot, auto-release on their turn via performAiTurn
  const isPlayerTurn = Boolean(
    battle &&
      !battle.summary &&
      activeUnit?.isPlayer &&
      activeUnit.alive &&
      !isPlayerCharging
  );

  // Auto-scroll combat log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: bypassFx ? 'auto' : 'smooth' });
  }, [battle?.log.length, bypassFx]);

  useEffect(() => {
    if (!battle || battle.popups.length === 0) return;
    const ids = battle.popups.map((p) => p.id);
    const timer = window.setTimeout(() => {
      clearExpiredPopups(ids);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [battle?.popups, clearExpiredPopups]);

  useEffect(() => {
    if (!battle || battle.fxEvents.length === 0) return;
    const ids = battle.fxEvents.map((f) => f.id);
    const timer = window.setTimeout(() => {
      clearExpiredFx(ids);
    }, 480);
    return () => window.clearTimeout(timer);
  }, [battle?.fxEvents, clearExpiredFx]);

  useEffect(() => {
    if (!battle || battle.explodedUnitIds.length === 0) return;
    const ids = [...battle.explodedUnitIds];
    const timer = window.setTimeout(() => {
      clearExplodedUnits(ids);
    }, 640);
    return () => window.clearTimeout(timer);
  }, [battle?.explodedUnitIds, clearExplodedUnits]);

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

  // Automatic Player Turn scheduler when Auto Mode is ON (pauses while Tactics modal is open)
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
    const delayMs = skipAnimations ? Math.min(baseDelay, 60) : Math.max(40, Math.round(baseDelay * 0.75));
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

  // Auto-Repeat next battle launcher when a battle concludes and repeat session is still active
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

  if (!battle) return null;

  const allies = battle.units.filter((u) => u.side === 'ally');
  const enemies = battle.units.filter((u) => u.side === 'enemy');
  const playerUnit = allies.find((u) => u.isPlayer);
  const playerSkillIds = playerUnit?.equippedSkillIds ?? [];
  const hasSingleAllySkill = playerSkillIds.some(
    (id) => getSkillById(id)?.targetType === 'single_ally'
  );

  const selectedTarget = enemies.find((e) => e.id === battle.selectedTargetId);
  const selectedAlly = allies.find((a) => a.id === battle.selectedAllyTargetId);
  const sectorLabel = getSectorName(lang, battle.sectorId);

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

  const canPlayerManualAct = isPlayerTurn && !autoBattleEnabled;
  const showRepeatBatchSummary = Boolean(
    battle.summary && autoRepeatSession && !autoRepeatSession.active
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-tactical-grid overflow-hidden">
      {/* TOP BAR: TURN QUEUE + MANUAL/AUTO TOGGLE + TACTICS GEAR + AUTO-REPEAT + SPEED + SKIP + RETREAT */}
      <div className="shrink-0 border-b border-slate-800/80 bg-[#0A0F18]/95 px-3 sm:px-6 py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
        <TurnQueueBar battle={battle} bypassFx={bypassFx} />

        {/* Battle Controls Cluster */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Manual | Auto Segmented Toggle (Hotkey A) */}
          <div
            className="inline-flex items-center rounded border border-slate-700 bg-slate-950 p-0.5"
            role="group"
            title={t('auto.hotkeyHint')}
            aria-label={t('auto.hotkeyHint')}
          >
            <button
              type="button"
              onClick={() => setAutoBattleEnabled(false)}
              className={`h-7 px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                !autoBattleEnabled
                  ? 'bg-slate-200 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t('auto.manual')}
            </button>
            <button
              type="button"
              onClick={() => setAutoBattleEnabled(true)}
              className={`h-7 px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                autoBattleEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <span>{t('auto.auto')}</span>
              <kbd className="font-mono-nums text-[9px] px-1 rounded bg-black/20">
                A
              </kbd>
            </button>
          </div>

          {/* Tactics Editor Gear Icon */}
          <button
            type="button"
            onClick={() => setTacticsModalOpen(true)}
            title={t('auto.tacticsBtn')}
            aria-label={t('auto.tacticsBtn')}
            className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-emerald-400/70 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Auto-Repeat Counter / Selector */}
          {autoRepeatSession?.active ? (
            <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-emerald-500/60 bg-emerald-500/15 text-emerald-200 text-[11px] font-mono-nums font-semibold">
              <Repeat className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">
                {autoRepeatSession.limit === 'infinite'
                  ? t('auto.repeatRunningInf', {
                      current: autoRepeatSession.completedRuns + 1,
                    })
                  : t('auto.repeatRunningCount', {
                      current: Math.min(
                        autoRepeatSession.limit,
                        autoRepeatSession.completedRuns + 1
                      ),
                      total: autoRepeatSession.limit,
                    })}
              </span>
              <button
                type="button"
                onClick={() => stopAutoRepeat('manual_stop')}
                className="ml-1 px-1.5 py-0.5 rounded bg-red-500/80 hover:bg-red-500 text-white inline-flex items-center gap-1 text-[10px] font-sans font-bold cursor-pointer"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>{t('auto.repeatStop')}</span>
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center rounded border border-slate-700 bg-slate-950 overflow-hidden h-8">
              <select
                value={String(autoRepeatLimit)}
                onChange={(e) => {
                  const v = e.target.value;
                  setAutoRepeatLimit(
                    v === 'infinite' ? 'infinite' : (Number(v) as 1 | 5 | 10)
                  );
                }}
                aria-label={t('auto.repeatLabel')}
                className="h-full bg-transparent pl-2 pr-1 text-[11px] font-mono-nums text-slate-200 focus:outline-none cursor-pointer"
              >
                {REPEAT_OPTIONS.map((opt) => (
                  <option key={String(opt)} value={String(opt)} className="bg-slate-900">
                    {repeatLabelFor(opt)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => startAutoRepeat(autoRepeatLimit, battle.sectorId)}
                title={t('auto.repeatStart')}
                className="h-full px-2 border-l border-slate-800 bg-slate-900 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Repeat className="w-3 h-3" />
                <span className="hidden sm:inline">{t('auto.repeatLabel')}</span>
              </button>
            </div>
          )}

          {/* Speed Controls: 1x 2x 3x 5x 10x */}
          <div
            className="inline-flex items-center rounded border border-slate-800 bg-slate-950 p-0.5"
            role="group"
            aria-label="Battle speed"
          >
            {BATTLE_SPEEDS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setBattleSpeed(spd)}
                className={`h-7 px-2 rounded text-[11px] font-mono-nums font-semibold transition-colors cursor-pointer ${
                  battleSpeed === spd
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleSkipAnimations}
            aria-pressed={skipAnimations}
            className={`h-8 px-2.5 inline-flex items-center gap-1 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              skipAnimations
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ZapOff className="w-3 h-3" />
            <span>{t('battle.skipAnim')}</span>
          </button>

          {!battle.summary && (
            <button
              type="button"
              onClick={retreatBattle}
              className="h-8 px-2.5 inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] font-medium cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-3 h-3" />
              <span>{t('battle.retreat')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Safety Pause Banner (if Auto stopped on Low HP / Boss / Elite Ready) */}
      {battle.autoStopNotice && !battle.summary && (
        <div className="shrink-0 border-b border-orange-500/40 bg-orange-500/12 px-4 sm:px-6 py-1.5 flex items-center justify-between gap-2 text-xs text-orange-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>
              {t('auto.pausedNotice', {
                reason: getAutoStopReasonLabel(lang, battle.autoStopNotice),
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAutoBattleEnabled(true)}
            className="px-2 py-0.5 rounded border border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-[11px] font-semibold cursor-pointer"
          >
            {t('auto.auto')}
          </button>
        </div>
      )}

      {/* MAIN 4v4 SPACE BATTLEFIELD ARENA */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3">
        <div className="relative mx-auto max-w-[1400px] h-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {!bypassFx && <BattleFxOverlay fxEvents={battle.fxEvents} />}

          {/* Allied Fighter Wing (clickable when player has single_ally skills) */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-display text-sm font-semibold tracking-wider text-sky-400 uppercase">
                {t('battle.alliedWing')}
              </span>
              <span className="font-mono-nums text-slate-400">
                {t('battle.operational', {
                  alive: allies.filter((u) => u.alive).length,
                  total: allies.length,
                })}
              </span>
            </div>
            <div className="space-y-2">
              {allies.map((unit) => (
                <BattleUnitCard
                  key={unit.id}
                  unit={unit}
                  isActiveTurn={activeUnitId === unit.id && !battle.summary}
                  isTargeted={
                    hasSingleAllySkill &&
                    battle.selectedAllyTargetId === unit.id &&
                    unit.alive
                  }
                  canTarget={canPlayerManualAct && unit.alive}
                  exploding={battle.explodedUnitIds.includes(unit.id)}
                  skipAnimations={bypassFx}
                  autoActive={unit.isPlayer && autoBattleEnabled}
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                  onSelect={() => selectAllyTarget(unit.id)}
                />
              ))}
            </div>
          </div>

          {/* Hostile Wing */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs px-1">
              <span
                className="font-display text-sm font-semibold tracking-wider uppercase"
                style={{ color: 'var(--team-enemy)' }}
              >
                {t('battle.hostileWing', { sector: sectorLabel })}
              </span>
              <span className="font-mono-nums text-slate-400">
                {t('battle.activeCount', {
                  alive: enemies.filter((u) => u.alive).length,
                  total: enemies.length,
                })}
              </span>
            </div>
            <div className="space-y-2">
              {enemies.map((unit) => (
                <BattleUnitCard
                  key={unit.id}
                  unit={unit}
                  isActiveTurn={activeUnitId === unit.id && !battle.summary}
                  isTargeted={battle.selectedTargetId === unit.id && unit.alive}
                  canTarget={
                    canPlayerManualAct && unit.alive && !hasStatus(unit, 'stealth')
                  }
                  exploding={battle.explodedUnitIds.includes(unit.id)}
                  skipAnimations={bypassFx}
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                  onSelect={() => selectTarget(unit.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM COMMAND DOCK (BASE ACTIONS + 6-SLOT SKILL BAR) & COMBAT LOG */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#0A0F18]/98 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-8 flex flex-col justify-between gap-2">
            {/* Turn Banner + Target Locks */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {isPlayerCharging ? (
                <span className="font-semibold text-amber-300">
                  {t('battle.chargingTurn')}
                </span>
              ) : isPlayerTurn && autoBattleEnabled ? (
                <span className="font-semibold text-emerald-400">
                  {t('auto.autoTurnRunning', {
                    gear: getClassName(lang, battle.deployedGearId),
                  })}
                </span>
              ) : isPlayerTurn ? (
                <span
                  className="font-semibold"
                  style={{ color: 'var(--turn-active-text)' }}
                >
                  {t('battle.yourTurn')}
                </span>
              ) : battle.summary ? (
                <span className="font-semibold text-slate-300">
                  {autoRepeatSession?.active
                    ? t('auto.repeatNextSoon')
                    : t('battle.concluded')}
                </span>
              ) : (
                <span className="text-slate-300">
                  {t('battle.aiTurn')}{' '}
                  <strong className="text-slate-100">
                    {activeUnit?.name ?? ''}
                  </strong>{' '}
                  ({activeUnit ? getClassName(lang, activeUnit.classId) : ''})
                </span>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {hasSingleAllySkill && selectedAlly && selectedAlly.alive && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <HeartHandshake className="w-3.5 h-3.5" />
                    <span>
                      {t('battle.allyLock')}{' '}
                      <strong className="text-emerald-200">
                        {selectedAlly.name}
                      </strong>
                    </span>
                  </span>
                )}

                {selectedTarget && selectedTarget.alive && (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Crosshair className="w-3.5 h-3.5 text-red-400" />
                    <span>
                      {t('battle.targetLock')}{' '}
                      <strong className="text-slate-200">
                        {selectedTarget.name}
                      </strong>
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Action Row: Fire + Shield + 6-Slot Equipped Skill Bar */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              {/* Basic Commands (Fire + Shield) */}
              <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1.5 sm:w-40 shrink-0">
                <button
                  type="button"
                  disabled={!canPlayerManualAct}
                  onClick={() => performPlayerAction('attack')}
                  className="h-10 px-2.5 rounded border border-emerald-500/70 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 transition-colors cursor-pointer text-left flex items-center justify-between gap-1.5"
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-semibold text-xs truncate">
                      {t('battle.actionAttack')}
                    </span>
                  </div>
                  <kbd className="font-mono-nums text-[10px] px-1 rounded bg-black/15">
                    1
                  </kbd>
                </button>

                <button
                  type="button"
                  disabled={!canPlayerManualAct}
                  onClick={() => performPlayerAction('defend')}
                  className="h-10 px-2.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-100 transition-colors cursor-pointer text-left flex items-center justify-between gap-1.5"
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                    <span className="font-semibold text-xs truncate">
                      {t('battle.actionDefend')}
                    </span>
                  </div>
                  <kbd className="font-mono-nums text-[10px] px-1 rounded bg-slate-950/60 text-slate-300">
                    Q
                  </kbd>
                </button>
              </div>

              {/* 6-Slot Equipped Skill Bar */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5">
                {playerSkillIds.length === 0 ? (
                  <div className="col-span-full rounded border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-center text-xs text-slate-500">
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
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setInspectedSkillId(skill.id);
                        }}
                        title={`${getSkillName(lang, skill.id)} (Lv.${lv}) — ${getSkillDesc(
                          lang,
                          skill.id
                        )}${reasonText ? ` [${reasonText}]` : ''}`}
                        className={`relative min-h-[84px] p-2 rounded border text-left transition-colors flex flex-col justify-between gap-1 ${borderClass} ${
                          clickable ? 'cursor-pointer' : 'cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="w-6 h-6 rounded bg-slate-950/80 border border-slate-700/80 flex items-center justify-center shrink-0">
                            <SkillIcon icon={skill.icon} className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isToggleOn && (
                              <span className="px-1 rounded bg-emerald-500 text-slate-950 font-mono-nums text-[9px] font-bold">
                                {t('battle.skillOnTag')}
                              </span>
                            )}
                            {isUsedOnce && (
                              <span className="px-1 rounded bg-red-500/80 text-white font-mono-nums text-[9px] font-bold">
                                {t('battle.skillUsedTag')}
                              </span>
                            )}
                            {usability.cooldownRemaining > 0 && (
                              <span className="px-1 rounded bg-slate-950 text-red-300 border border-red-500/50 font-mono-nums text-[10px] font-bold">
                                CD {usability.cooldownRemaining}
                              </span>
                            )}
                            <kbd className="font-mono-nums text-[9px] px-1 rounded bg-black/30 text-slate-300">
                              {idx + 2}
                            </kbd>
                          </div>
                        </div>

                        <div className="text-[11px] font-semibold leading-tight line-clamp-2">
                          {getSkillName(lang, skill.id)}
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono-nums opacity-90">
                          <span
                            className={
                              playerUnit.sp < usability.spCost
                                ? 'text-red-400 font-bold'
                                : 'text-amber-300 font-semibold'
                            }
                          >
                            {usability.spCost} SP
                          </span>
                          <span className="text-slate-400">
                            {skill.oncePerBattle
                              ? '1x'
                              : skill.cooldown > 0
                              ? `${skill.cooldown}t`
                              : '—'}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Inline Skill Tooltip / Inspector Strip */}
            {inspectedSkill && inspectedScaled && inspectedUsability && (
              <div className="rounded border border-slate-800 bg-[#070B12] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-semibold text-slate-100 shrink-0">
                    {getSkillName(lang, inspectedSkill.id)} (Lv.{inspectedLv})
                  </span>
                  <span className="text-slate-400 truncate">
                    {getSkillDesc(lang, inspectedSkill.id)}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono-nums shrink-0">
                  <span className="text-sky-300">
                    {getSkillTargetLabel(lang, inspectedSkill.targetType)}
                  </span>
                  {!inspectedUsability.canUse && (
                    <span className="text-red-400 font-semibold">
                      · {getBattleSkillReason(lang, inspectedUsability)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Combat Log */}
          <div className="lg:col-span-4 rounded border border-slate-800 bg-[#070A10] flex flex-col h-32 lg:h-auto lg:max-h-36">
            <div className="px-3 py-1.5 border-b border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">
                {t('battle.combatLog')}
              </span>
              <span className="font-mono-nums">
                {t('battle.eventsCount', { count: battle.log.length })}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 text-xs tactical-scroll">
              {battle.log.map((entry) => {
                const actorColor = getLogActorColor(entry);
                return (
                  <div
                    key={entry.id}
                    className="leading-snug flex items-baseline gap-2"
                  >
                    <span className="font-mono-nums text-[10px] text-slate-500 shrink-0">
                      R{entry.round}
                    </span>
                    <span
                      className={`font-mono-nums text-[10px] font-semibold shrink-0 w-14 ${getLogTagStyle(
                        entry.tag
                      )}`}
                    >
                      {getLogTagLabel(lang, entry.tag)}
                    </span>
                    <span
                      className="text-slate-300"
                      style={actorColor ? { borderLeft: `2px solid ${actorColor}`, paddingLeft: '6px' } : undefined}
                    >
                      {formatCombatLogMessage(lang, entry)}
                    </span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* AUTO-REPEAT BATCH SUMMARY MODAL (when a repeat session finishes or stops) */}
      {showRepeatBatchSummary && autoRepeatSession && (
        <div
          className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="repeat-summary-title"
        >
          <div className="w-full max-w-md rounded-lg border border-emerald-500/50 bg-[#0E1521] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto tactical-scroll">
            <div className="space-y-1">
              <div className="text-xs font-semibold tracking-widest uppercase text-emerald-400 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" />
                <span>{getSectorName(lang, autoRepeatSession.sectorId)}</span>
              </div>
              <h2
                id="repeat-summary-title"
                className="font-display text-3xl font-bold tracking-wide text-slate-50"
              >
                {t('auto.repeatSummaryTitle')}
              </h2>
              {autoRepeatSession.stopReason && (
                <p className="text-xs text-orange-300 font-medium">
                  {getAutoStopReasonLabel(lang, autoRepeatSession.stopReason)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('auto.repeatLabel')}
                </div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-emerald-400">
                  {t('auto.repeatSummaryRuns', {
                    wins: autoRepeatSession.wins,
                    runs: autoRepeatSession.completedRuns,
                  })}
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.expEarned', {
                    gear: getClassName(lang, battle.deployedGearId),
                  })}
                </div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-amber-400">
                  +{autoRepeatSession.totalExp.toLocaleString()} EXP
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.creditsAwarded')}
                </div>
                <div className="mt-0.5 font-mono-nums text-lg font-bold text-slate-100">
                  +{autoRepeatSession.totalCredits.toLocaleString()} CR
                </div>
              </div>

              <div className="rounded border border-purple-500/40 bg-purple-500/10 p-3">
                <div className="text-xs text-purple-200">
                  {t('summary.warPointsAwarded')}
                </div>
                <div className="mt-0.5 font-mono-nums text-lg font-bold text-purple-300">
                  +{autoRepeatSession.totalWarPoints.toLocaleString()} WP
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
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
                <div className="rounded border border-slate-800/80 bg-[#090D14] px-3 py-2 text-xs text-slate-500">
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
                        className={`text-xs font-semibold truncate ${
                          RARITY_META[inst.rarity].textClass
                        }`}
                      >
                        {getItemInstanceName(lang, inst)}
                      </span>
                      <span className="text-[11px] font-mono-nums text-slate-400 shrink-0">
                        {getSlotLabel(lang, inst.slot)} · T{inst.tier}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={returnToHangar}
                className="flex-1 h-11 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                {t('nav.returnHangar')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAutoRepeatSummary();
                  startAutoRepeat(autoRepeatLimit, battle.sectorId);
                }}
                className="flex-1 h-11 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
              >
                {t('auto.repeatStart')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / DEFEAT / RETREAT RESULTS MODAL (suppressed while Auto-Repeat is actively launching next run) */}
      {battle.summary && !autoRepeatSession?.active && !showRepeatBatchSummary && (
        <div
          className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-outcome-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#0E1521] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto tactical-scroll">
            <div className="space-y-1">
              <div
                className={`text-xs font-semibold tracking-widest uppercase ${
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
                className="font-display text-4xl font-bold tracking-wide text-slate-50"
              >
                {battle.summary.outcome === 'victory'
                  ? t('summary.victory')
                  : battle.summary.retreated
                  ? t('summary.retreatTitle')
                  : t('summary.defeat')}
              </h2>
              <p className="text-sm text-slate-400">
                {battle.summary.outcome === 'victory'
                  ? t('summary.victoryDesc')
                  : t('summary.defeatDesc')}
              </p>
            </div>

            {battle.summary.leveledUp && (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-bold text-emerald-300">
                    {t('summary.levelUp', {
                      gear: getClassName(lang, battle.summary.deployedGearId),
                      prev: battle.summary.previousLevel,
                      next: battle.summary.newLevel,
                    })}
                  </div>
                  <div className="text-xs text-emerald-200/80">
                    {t('summary.levelUpDesc')}
                  </div>
                </div>
                <div className="font-mono-nums text-lg font-bold text-emerald-300 whitespace-nowrap">
                  +{battle.summary.statPointsGained} PTS
                </div>
              </div>
            )}

            {battle.summary.unlockedSectorId && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300">
                {t('summary.sectorUnlocked', {
                  sector: getSectorName(lang, battle.summary.unlockedSectorId),
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.expEarned', {
                    gear: getClassName(lang, battle.summary.deployedGearId),
                  })}
                </div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-amber-400">
                  +{battle.summary.expGained} EXP
                </div>
                <div className="text-[11px] font-mono-nums text-slate-400 mt-0.5">
                  {battle.summary.newLevel >= BALANCE_CONFIG.maxLevel
                    ? t('summary.maxLevelReached')
                    : t('summary.battlesToNext', {
                        count: battle.summary.battlesToNextLevel,
                        next: battle.summary.newLevel + 1,
                      })}
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.creditsAwarded')}
                </div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-slate-100">
                  +{battle.summary.creditsGained.toLocaleString()} CR
                </div>
              </div>

              <div className="col-span-2 rounded border border-purple-500/40 bg-purple-500/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-purple-200 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span>{t('summary.warPointsAwarded')}</span>
                  </div>
                  {battle.summary.baseCaptureBonusWp > 0 && (
                    <div className="text-[11px] text-purple-300/90 mt-0.5">
                      {t('summary.captureBonusNote', {
                        wp: battle.summary.baseCaptureBonusWp,
                      })}
                    </div>
                  )}
                </div>
                <div className="font-mono-nums text-xl font-bold text-purple-300">
                  +{battle.summary.warPointsGained} WP
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.hostilesDestroyed')}
                </div>
                <div className="mt-0.5 font-mono-nums text-lg font-semibold text-slate-200">
                  {battle.summary.enemiesDestroyed} /{' '}
                  {battle.summary.totalEnemies}
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.alliesSurviving')}
                </div>
                <div className="mt-0.5 font-mono-nums text-lg font-semibold text-slate-200">
                  {battle.summary.alliesSurviving} / 4
                </div>
              </div>
            </div>

            {/* Randomized Salvaged Drops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
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
                <div className="rounded border border-slate-800/80 bg-[#090D14] px-3 py-2.5 text-xs text-slate-500">
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
                            className={`text-xs font-semibold truncate ${
                              RARITY_META[inst.rarity].textClass
                            }`}
                          >
                            {getItemInstanceName(lang, inst)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {getSlotLabel(lang, inst.slot)} ·{' '}
                            {getRarityLabel(lang, inst.rarity)} · T{inst.tier}{' '}
                            · {inst.rollQuality}%
                          </div>
                        </div>
                        <div className="text-right font-mono-nums text-[11px] text-emerald-400 shrink-0">
                          {STAT_KEYS.filter((k) => stats[k] > 0)
                            .map((k) => `+${stats[k]} ${getStatShort(lang, k)}`)
                            .join(' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={returnToHangar}
                className="flex-1 h-11 px-4 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                {t('nav.returnHangar')}
              </button>
              <button
                type="button"
                onClick={() => startBattle()}
                className="flex-1 h-11 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                {t('summary.nextSortie')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
