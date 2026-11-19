import { useEffect, useRef } from 'react';
import { Crosshair, FastForward, Package, Shield, Sparkles, Swords } from 'lucide-react';
import { MECH_CLASSES, STAT_KEYS, STAT_META } from '../data/classes';
import {
  EQUIPMENT_SLOT_META,
  getItemDefinition,
  RARITY_META,
} from '../data/items';
import { getSkillById } from '../data/skills';
import { useGameStore } from '../store/useGameStore';
import type { CombatLogEntry } from '../types/game';
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

export function BattleScreen() {
  const battle = useGameStore((s) => s.battle);
  const battleSpeed = useGameStore((s) => s.battleSpeed);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const performPlayerAction = useGameStore((s) => s.performPlayerAction);
  const performAiTurn = useGameStore((s) => s.performAiTurn);
  const clearExpiredPopups = useGameStore((s) => s.clearExpiredPopups);
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

  // Clean up floating popups after animation completes
  useEffect(() => {
    if (!battle || battle.popups.length === 0) return;
    const ids = battle.popups.map((p) => p.id);
    const timer = window.setTimeout(() => {
      clearExpiredPopups(ids);
    }, 980);
    return () => window.clearTimeout(timer);
  }, [battle?.popups, clearExpiredPopups]);

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
      const skill = getSkillById(MECH_CLASSES[playerUnit.classId].signatureSkillId);

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

  // Build ordered queue starting from activeTurnIndex for clarity
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
      <div className="shrink-0 border-b border-slate-800/80 bg-[#0B1018]/90 px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 py-0.5">
          <div className="shrink-0 flex items-center gap-2 text-xs">
            <span className="font-display text-sm font-bold tracking-wide text-amber-400 whitespace-nowrap">
              Round {battle.round}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400 whitespace-nowrap">Turn Order (Speed)</span>
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
                  <span>{unit.isPlayer ? `${unit.name} (You)` : unit.name}</span>
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
          title="Toggle AI turn pacing"
        >
          <FastForward className="w-3.5 h-3.5 text-amber-400" />
          <span>{battleSpeed}x</span>
        </button>
      </div>

      {/* MAIN 4v4 BATTLEFIELD ARENA */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="mx-auto max-w-[1400px] h-full grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {/* Ally Squad (Left) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-display text-sm font-semibold tracking-wider text-sky-400 uppercase">
                Allied Squadron
              </span>
              <span className="font-mono-nums text-slate-400">
                {allies.filter((u) => u.alive).length} / {allies.length} Operational
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
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                />
              ))}
            </div>
          </div>

          {/* Enemy Squad (Right) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-display text-sm font-semibold tracking-wider text-red-400 uppercase">
                Hostile Forces · {battle.sectorName}
              </span>
              <span className="font-mono-nums text-slate-400">
                {enemies.filter((u) => u.alive).length} / {enemies.length} Active
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
                  popups={battle.popups.filter((p) => p.unitId === unit.id)}
                  onSelect={() => selectTarget(unit.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM COMMAND DOCK & COMBAT LOG */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#0B1018]/98 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Player Action Deck (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {isPlayerTurn ? (
                <span className="font-semibold text-amber-400">
                  Your Turn — Select a target enemy and choose an action
                </span>
              ) : battle.summary ? (
                <span className="font-semibold text-slate-300">
                  Battle Concluded
                </span>
              ) : (
                <span className="text-slate-300">
                  AI Executing:{' '}
                  <strong className="text-slate-100">
                    {activeUnit?.name ?? 'Unit'}
                  </strong>{' '}
                  ({activeUnit ? MECH_CLASSES[activeUnit.classId].name : ''})
                </span>
              )}

              {selectedTarget && selectedTarget.alive && (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Crosshair className="w-3.5 h-3.5 text-red-400" />
                  <span>
                    Target: <strong className="text-slate-200">{selectedTarget.name}</strong>
                  </span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Attack */}
              <button
                type="button"
                disabled={!isPlayerTurn}
                onClick={() => performPlayerAction('attack')}
                className="h-14 px-3.5 rounded border border-amber-500/70 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Swords className="w-4 h-4 shrink-0" />
                    <span>Attack</span>
                  </div>
                  <div className="text-[11px] opacity-80 truncate">
                    Primary strike · +5 SP
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-black/15">
                  1
                </kbd>
              </button>

              {/* Skill */}
              <button
                type="button"
                disabled={!canUseSkill}
                onClick={() => performPlayerAction('skill')}
                title={playerSkill?.description}
                className="h-14 px-3.5 rounded border border-sky-500/60 bg-sky-500/15 hover:bg-sky-500/25 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-100 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                    <Sparkles className="w-4 h-4 shrink-0 text-sky-400" />
                    <span className="truncate">{playerSkill?.name ?? 'Skill'}</span>
                  </div>
                  <div className="text-[11px] text-sky-300/80 font-mono-nums truncate">
                    Cost {playerSkill?.spCost ?? 0} SP ·{' '}
                    {playerSkill?.targetType === 'all_enemies'
                      ? 'All Enemies'
                      : playerSkill?.targetType === 'all_allies'
                      ? 'All Allies'
                      : 'Target'}
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-300">
                  2
                </kbd>
              </button>

              {/* Defend */}
              <button
                type="button"
                disabled={!isPlayerTurn}
                onClick={() => performPlayerAction('defend')}
                className="h-14 px-3.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-100 transition-colors cursor-pointer text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Shield className="w-4 h-4 shrink-0 text-sky-400" />
                    <span>Defend</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    -50% dmg · +12 SP · +SHD
                  </div>
                </div>
                <kbd className="font-mono-nums text-[11px] px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-300">
                  3
                </kbd>
              </button>
            </div>
          </div>

          {/* Combat Log (5 cols) */}
          <div className="lg:col-span-5 rounded border border-slate-800 bg-[#080C12] flex flex-col h-28 sm:h-32">
            <div className="px-3 py-1.5 border-b border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Combat Log</span>
              <span className="font-mono-nums">{battle.log.length} events</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 text-xs tactical-scroll">
              {battle.log.map((entry) => (
                <div key={entry.id} className="leading-snug flex items-baseline gap-2">
                  <span className="font-mono-nums text-[10px] text-slate-500 shrink-0">
                    R{entry.round}
                  </span>
                  <span
                    className={`font-mono-nums text-[10px] font-semibold shrink-0 w-12 ${getLogTagStyle(
                      entry.tag
                    )}`}
                  >
                    {entry.tag}
                  </span>
                  <span className="text-slate-300">{entry.message}</span>
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
                {battle.summary.sectorName} · {battle.summary.rounds} Rounds
              </div>
              <h2
                id="battle-outcome-title"
                className="font-display text-4xl font-bold tracking-wide text-slate-50"
              >
                {battle.summary.outcome === 'victory'
                  ? 'Sortie Victory'
                  : 'Squadron Defeated'}
              </h2>
              <p className="text-sm text-slate-400">
                {battle.summary.outcome === 'victory'
                  ? 'All hostile mechs neutralized. Salvage bounty and combat data recorded.'
                  : 'Allied units forced to withdraw. Partial telemetry salvaged.'}
              </p>
            </div>

            {/* Level-Up Callout */}
            {battle.summary.leveledUp && (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-bold text-emerald-300">
                    Level Up: Lv.{battle.summary.previousLevel} → Lv.
                    {battle.summary.newLevel}
                  </div>
                  <div className="text-xs text-emerald-200/80">
                    Visit the Hangar to spend your new stat points.
                  </div>
                </div>
                <div className="font-mono-nums text-lg font-bold text-emerald-300 whitespace-nowrap">
                  +{battle.summary.statPointsGained} PTS
                </div>
              </div>
            )}

            {/* Rewards Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">EXP Earned</div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-amber-400">
                  +{battle.summary.expGained} EXP
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">Credits Awarded</div>
                <div className="mt-0.5 font-mono-nums text-xl font-bold text-slate-100">
                  +{battle.summary.creditsGained.toLocaleString()} CR
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">Hostiles Destroyed</div>
                <div className="mt-0.5 font-mono-nums text-lg font-semibold text-slate-200">
                  {battle.summary.enemiesDestroyed} / 4
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#090D14] p-3">
                <div className="text-xs text-slate-400">Allies Surviving</div>
                <div className="mt-0.5 font-mono-nums text-lg font-semibold text-slate-200">
                  {battle.summary.alliesSurviving} / 4
                </div>
              </div>
            </div>

            {/* Salvaged Item Drops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  <span>Salvaged Equipment Drops</span>
                </span>
                <span className="font-mono-nums">
                  {battle.summary.droppedItems.length} item
                  {battle.summary.droppedItems.length === 1 ? '' : 's'}
                </span>
              </div>

              {battle.summary.droppedItems.length === 0 ? (
                <div className="rounded border border-slate-800/80 bg-[#090D14] px-3 py-2.5 text-xs text-slate-500">
                  No intact chassis modules recovered from wreckage.
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
                            {def.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {EQUIPMENT_SLOT_META[def.slot].label} ·{' '}
                            {RARITY_META[def.rarity].label} · Lv.{def.requiredLevel}
                            {def.classRestriction
                              ? ` · ${MECH_CLASSES[def.classRestriction].name}`
                              : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono-nums text-[11px] text-emerald-400 shrink-0">
                          {STAT_KEYS.filter((k) => (def.statBonuses[k] ?? 0) > 0)
                            .map((k) => `+${def.statBonuses[k]} ${STAT_META[k].shortLabel}`)
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
                Return to Hangar
              </button>
              <button
                type="button"
                onClick={() => startBattle()}
                className="flex-1 h-11 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Next Sortie
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
