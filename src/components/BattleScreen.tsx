import { useEffect, useRef } from 'react';
import { Crosshair, FastForward, Package, Shield, Sparkles } from 'lucide-react';
import { MECH_CLASSES, STAT_KEYS } from '../data/classes';
import { getItemDefinition, RARITY_META } from '../data/items';
import { getSkillById } from '../data/skills';
import {
  formatCombatLogMessage,
  getClassName,
  getItemName,
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
import type { CombatFxEvent, CombatLogEntry } from '../types/game';
import { BattleUnitCard } from './BattleUnitCard';

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
 * Pure CSS/SVG space projectile overlay: laser bolts, missile trails, railgun beams, and repair beams
 * travelling across the 4v4 battlefield from attacker slot to target slot(s).
 */
function BattleFxOverlay({ fxEvents }: { fxEvents: CombatFxEvent[] }) {
  if (fxEvents.length === 0) return null;

  const slotY = (idx: number) => 15 + idx * 23.5; // % heights aligned with the 4 unit rows

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

        // Default: Twin Laser Bolts
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
  const selectTarget = useGameStore((s) => s.selectTarget);
  const performPlayerAction = useGameStore((s) => s.performPlayerAction);
  const performAiTurn = useGameStore((s) => s.performAiTurn);
  const clearExpiredPopups = useGameStore((s) => s.clearExpiredPopups);
  const clearExpiredFx = useGameStore((s) => s.clearExpiredFx);
  const clearExplodedUnits = useGameStore((s) => s.clearExplodedUnits);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const startBattle = useGameStore((s) => s.startBattle);
  const toggleBattleSpeed = useGameStore((s) => s.toggleBattleSpeed);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  const activeUnitId = battle ? battle.turnOrder[battle.activeTurnIndex] : null;
  const activeUnit =
    battle?.units.find((u) => u.id === activeUnitId) ?? null;
  const isPlayerTurn = Boolean(
    battle && !battle.summary && activeUnit?.isPlayer && activeUnit.alive
  );

  // Auto-scroll combat log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [battle?.log.length]);

  // Clean up floating popups
  useEffect(() => {
    if (!battle || battle.popups.length === 0) return;
    const ids = battle.popups.map((p) => p.id);
    const timer = window.setTimeout(() => {
      clearExpiredPopups(ids);
    }, 980);
    return () => window.clearTimeout(timer);
  }, [battle?.popups, clearExpiredPopups]);

  // Clean up laser/missile FX trails
  useEffect(() => {
    if (!battle || battle.fxEvents.length === 0) return;
    const ids = battle.fxEvents.map((f) => f.id);
    const timer = window.setTimeout(() => {
      clearExpiredFx(ids);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [battle?.fxEvents, clearExpiredFx]);

  // Clean up ship explosion particle bursts
  useEffect(() => {
    if (!battle || battle.explodedUnitIds.length === 0) return;
    const ids = [...battle.explodedUnitIds];
    const timer = window.setTimeout(() => {
      clearExplodedUnits(ids);
    }, 680);
    return () => window.clearTimeout(timer);
  }, [battle?.explodedUnitIds, clearExplodedUnits]);

  // Automatic AI turn scheduler
  useEffect(() => {
    if (!battle || battle.summary || isPlayerTurn) return;
    const delayMs = battleSpeed === 2 ? 420 : 780;
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
    performAiTurn,
  ]);

  // Keyboard shortcuts during player turn
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!battle) return;
      if (e.key.toLowerCase() === 'm') {
        toggleMute();
        return;
      }
      if (battle.summary || !isPlayerTurn) return;

      const playerUnit = battle.units.find((u) => u.isPlayer);
      if (!playerUnit) return;
      const skill = getSkillById(
        MECH_CLASSES[playerUnit.classId].signatureSkillId
      );

      if (e.key === '1') {
        e.preventDefault();
        performPlayerAction('attack');
      } else if (e.key === '2' && playerUnit.sp >= skill.spCost) {
        e.preventDefault();
        performPlayerAction('skill');
      } else if (e.key === '3') {
        e.preventDefault();
        performPlayerAction('defend');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const aliveEnemies = battle.units.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        if (aliveEnemies.length > 0) {
          const curIdx = aliveEnemies.findIndex(
            (u) => u.id === battle.selectedTargetId
          );
          const nextEnemy = aliveEnemies[(curIdx + 1) % aliveEnemies.length];
          selectTarget(nextEnemy.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [battle, isPlayerTurn, performPlayerAction, selectTarget, toggleMute]);

  if (!battle) return null;

  const allies = battle.units.filter((u) => u.side === 'ally');
  const enemies = battle.units.filter((u) => u.side === 'enemy');
  const playerUnit = allies.find((u) => u.isPlayer);
  const playerSkill = playerUnit
    ? getSkillById(MECH_CLASSES[playerUnit.classId].signatureSkillId)
    : null;
  const canUseSkill = Boolean(
    isPlayerTurn && playerUnit && playerSkill && playerUnit.sp >= playerSkill.spCost
  );

  const selectedTarget = enemies.find((e) => e.id === battle.selectedTargetId);
  const sectorLabel = getSectorName(lang, battle.sectorId);

  const orderedLivingIds: string[] = [];
  for (let i = 0; i < battle.turnOrder.length; i++) {
    const idx = (battle.activeTurnIndex + i) % battle.turnOrder.length;
    const id = battle.turnOrder[idx];
    const unit = battle.units.find((u) => u.id === id);
    if (unit && unit.alive) {
      orderedLivingIds.push(id);
    }
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-tactical-grid overflow-hidden">
      {/* TOP TURN ORDER RIBBON */}
      <div className="shrink-0 border-b border-slate-800/80 bg-[#0A0F18]/90 px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 py-0.5">
          <div className="shrink-0 flex items-center gap-2 text-xs">
            <span className="font-display text-sm font-bold tracking-wide text-amber-400 whitespace-nowrap">
              {t('battle.round', { round: battle.round })}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400 whitespace-nowrap">
              {t('battle.turnOrder')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {orderedLivingIds.map((id, idx) => {
              const unit = battle.units.find((u) => u.id === id);
              if (!unit) return null;
              const isCurrent = idx === 0;
              return (
                <div
                  key={id}
                  className={`px-2.5 py-1 rounded border text-[11px] whitespace-nowrap flex items-center gap-1.5 ${
                    isCurrent
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200 font-semibold'
                      : unit.side === 'ally'
                      ? 'border-slate-800 bg-slate-900/90 text-sky-300'
                      : 'border-slate-800 bg-slate-900/90 text-red-300'
                  }`}
                >
                  <span>
                    {unit.isPlayer
                      ? t('battle.youSuffix', { name: unit.name })
                      : unit.name}
                  </span>
                  <span className="font-mono-nums text-[10px] opacity-75">
                    {unit.derived.speed}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleBattleSpeed}
          className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-mono-nums text-slate-200 cursor-pointer"
          title={t('battle.toggleSpeed')}
        >
          <FastForward className="w-3.5 h-3.5 text-amber-400" />
          <span>{battleSpeed}x</span>
        </button>
      </div>

      {/* MAIN 4v4 SPACE BATTLEFIELD ARENA */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="relative mx-auto max-w-[1400px] h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Laser / Missile / Railgun / Repair Beam Overlay */}
          <BattleFxOverlay fxEvents={battle.fxEvents} />

          {/* Allied Fighter Wing (Left) */}
          <div className="space-y-2.5 relative z-10">
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
            <div className="space-y-2.5">
              {allies.map((unit) => (
                <BattleUnitCard
                  key={unit.id}
                  unit={unit}
                  isActiveTurn={activeUnitId === unit.id && !battle.summary}
                  isTargeted={false}
                  canTarget={false}
                  exploding={battle.explodedUnitIds.includes(unit.id)}
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                />
              ))}
            </div>
          </div>

          {/* Hostile Ships & Alien Drones (Right) */}
          <div className="space-y-2.5 relative z-10">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-display text-sm font-semibold tracking-wider text-red-400 uppercase">
                {t('battle.hostileWing', { sector: sectorLabel })}
              </span>
              <span className="font-mono-nums text-slate-400">
                {t('battle.activeCount', {
                  alive: enemies.filter((u) => u.alive).length,
                  total: enemies.length,
                })}
              </span>
            </div>
            <div className="space-y-2.5">
              {enemies.map((unit) => (
                <BattleUnitCard
                  key={unit.id}
                  unit={unit}
                  isActiveTurn={activeUnitId === unit.id && !battle.summary}
                  isTargeted={battle.selectedTargetId === unit.id && unit.alive}
                  canTarget={isPlayerTurn && unit.alive}
                  exploding={battle.explodedUnitIds.includes(unit.id)}
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                  onSelect={() => selectTarget(unit.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM COMMAND DOCK & COMBAT LOG */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#0A0F18]/98 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Player Command Deck (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {isPlayerTurn ? (
                <span className="font-semibold text-amber-400">
                  {t('battle.yourTurn')}
                </span>
              ) : battle.summary ? (
                <span className="font-semibold text-slate-300">
                  {t('battle.concluded')}
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

              {selectedTarget && selectedTarget.alive && (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Attack / Fire Weapons */}
              <button
                type="button"
                disabled={!isPlayerTurn}
                onClick={() => performPlayerAction('attack')}
                className="h-14 px-3.5 rounded border border-amber-500/70 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 shrink-0" />
                    <span>{t('battle.actionAttack')}</span>
                  </div>
                  <div className="text-[11px] opacity-80 truncate">
                    {t('battle.actionAttackSub')}
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-black/15">
                  1
                </kbd>
              </button>

              {/* Signature Ship Skill */}
              <button
                type="button"
                disabled={!canUseSkill}
                onClick={() => performPlayerAction('skill')}
                title={playerSkill ? getSkillDesc(lang, playerSkill.id) : ''}
                className="h-14 px-3.5 rounded border border-sky-500/60 bg-sky-500/15 hover:bg-sky-500/25 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-100 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                    <Sparkles className="w-4 h-4 shrink-0 text-sky-400" />
                    <span className="truncate">
                      {playerSkill ? getSkillName(lang, playerSkill.id) : ''}
                    </span>
                  </div>
                  <div className="text-[11px] text-sky-300/80 font-mono-nums truncate">
                    {playerSkill
                      ? t('battle.actionSkillSub', {
                          cost: playerSkill.spCost,
                          target: getSkillTargetLabel(
                            lang,
                            playerSkill.targetType,
                            playerSkill.hits
                          ),
                        })
                      : ''}
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-300">
                  2
                </kbd>
              </button>

              {/* Defend / Energy Shield Bubble */}
              <button
                type="button"
                disabled={!isPlayerTurn}
                onClick={() => performPlayerAction('defend')}
                className="h-14 px-3.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-100 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Shield className="w-4 h-4 shrink-0 text-sky-400" />
                    <span>{t('battle.actionDefend')}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {t('battle.actionDefendSub')}
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-300">
                  3
                </kbd>
              </button>
            </div>
          </div>

          {/* Live-Translated Combat Log (5 cols) */}
          <div className="lg:col-span-5 rounded border border-slate-800 bg-[#070A10] flex flex-col h-28 sm:h-32">
            <div className="px-3 py-1.5 border-b border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">
                {t('battle.combatLog')}
              </span>
              <span className="font-mono-nums">
                {t('battle.eventsCount', { count: battle.log.length })}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 text-xs tactical-scroll">
              {battle.log.map((entry) => (
                <div key={entry.id} className="leading-snug flex items-baseline gap-2">
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
                  <span className="text-slate-300">
                    {formatCombatLogMessage(lang, entry)}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* VICTORY / DEFEAT MODAL */}
      {battle.summary && (
        <div
          className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-outcome-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#0E1521] p-6 space-y-5 shadow-2xl">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.expEarned')}
                </div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-amber-400">
                  +{battle.summary.expGained} EXP
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
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">
                  {t('summary.hostilesDestroyed')}
                </div>
                <div className="mt-0.5 font-mono-nums text-lg font-semibold text-slate-200">
                  {battle.summary.enemiesDestroyed} / 4
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

            {/* Salvaged Ship Part Drops */}
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
                    const def = getItemDefinition(inst.itemId);
                    if (!def) return null;
                    return (
                      <div
                        key={inst.instanceId}
                        className={`rounded border bg-[#090D14] px-3 py-2 flex items-center justify-between gap-2 ${
                          RARITY_META[def.rarity].borderClass
                        }`}
                      >
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              RARITY_META[def.rarity].textClass
                            }`}
                          >
                            {getItemName(lang, def.id)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {getSlotLabel(lang, def.slot)} ·{' '}
                            {getRarityLabel(lang, def.rarity)} ·{' '}
                            {t('common.levelShort')}
                            {def.requiredLevel}
                            {def.classRestriction
                              ? ` · ${getClassName(lang, def.classRestriction)}`
                              : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono-nums text-[11px] text-emerald-400 shrink-0">
                          {STAT_KEYS.filter((k) => (def.statBonuses[k] ?? 0) > 0)
                            .map(
                              (k) =>
                                `+${def.statBonuses[k]} ${getStatShort(lang, k)}`
                            )
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
