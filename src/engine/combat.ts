import { EMPTY_STAT_BLOCK, MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getSectorById } from '../data/maps';
import { ALLY_PILOT_POOL, ENEMY_ARCHETYPES } from '../data/pilots';
import { COMBAT_FORMULAS, PROGRESSION_CONFIG } from '../data/progression';
import { getSkillById } from '../data/skills';
import type {
  ActionType,
  BattleState,
  CombatLogEntry,
  CombatSide,
  CombatUnit,
  FloatingPopup,
  MechClassId,
  PlayerCharacter,
  StatBlock,
  UnitAnimState,
} from '../types/game';
import { sumEquippedStatBonuses } from './equipment';
import {
  calculateDerivedStats,
  calculateEffectiveStats,
  generateNpcAllocations,
} from './stats';

let uidCounter = 1;
function nextId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomVariance(): number {
  const { damageVarianceMin, damageVarianceMax } = COMBAT_FORMULAS;
  return (
    damageVarianceMin + Math.random() * (damageVarianceMax - damageVarianceMin)
  );
}

function buildCombatUnit(params: {
  id: string;
  name: string;
  callsign: string;
  side: CombatSide;
  isPlayer: boolean;
  classId: MechClassId;
  level: number;
  allocatedPoints: ReturnType<typeof generateNpcAllocations>;
  equipmentBonuses?: StatBlock;
}): CombatUnit {
  const stats = calculateEffectiveStats(
    params.classId,
    params.level,
    params.allocatedPoints,
    EMPTY_STAT_BLOCK,
    params.equipmentBonuses ?? EMPTY_STAT_BLOCK
  );
  const derived = calculateDerivedStats(params.classId, params.level, stats);

  return {
    id: params.id,
    name: params.name,
    callsign: params.callsign,
    side: params.side,
    isPlayer: params.isPlayer,
    classId: params.classId,
    level: params.level,
    stats,
    derived,
    hp: derived.maxHp,
    shield: derived.maxShield,
    sp: derived.maxSp,
    isDefending: false,
    alive: true,
    animState: 'idle',
  };
}

export function sortTurnOrder(units: CombatUnit[]): string[] {
  return [...units]
    .sort((a, b) => {
      if (b.derived.speed !== a.derived.speed) {
        return b.derived.speed - a.derived.speed;
      }
      if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
      if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
      return a.id.localeCompare(b.id);
    })
    .map((u) => u.id);
}

export function createInitialBattleState(
  player: PlayerCharacter,
  sectorId: string
): BattleState {
  const sector = getSectorById(sectorId);
  const classIds = MECH_CLASS_LIST.map((c) => c.id);

  // 1. Player Unit (includes equipped item flat bonuses + enchant scaling)
  const playerEquipBonuses = sumEquippedStatBonuses(player.equipped);
  const playerUnit = buildCombatUnit({
    id: 'ally_player',
    name: player.name.trim() || 'Commander',
    callsign: 'Lead-1',
    side: 'ally',
    isPlayer: true,
    classId: player.classId,
    level: player.level,
    allocatedPoints: player.allocatedPoints,
    equipmentBonuses: playerEquipBonuses,
  });

  // 2. Three random AI Ally NPCs (varied classes, pilot names, levels near player)
  const usedNames = new Set<string>([playerUnit.name]);
  const usedCallsigns = new Set<string>([playerUnit.callsign]);
  const allyUnits: CombatUnit[] = [playerUnit];

  for (let i = 0; i < 3; i++) {
    let pilotName = randomItem(ALLY_PILOT_POOL.firstNames);
    while (usedNames.has(pilotName)) {
      pilotName = randomItem(ALLY_PILOT_POOL.firstNames);
    }
    usedNames.add(pilotName);

    let callsign = randomItem(ALLY_PILOT_POOL.callsigns);
    while (usedCallsigns.has(callsign)) {
      callsign = randomItem(ALLY_PILOT_POOL.callsigns);
    }
    usedCallsigns.add(callsign);

    const allyClass: MechClassId = randomItem(classIds);
    const levelJitter = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
    const allyLevel = Math.max(1, player.level + levelJitter);

    allyUnits.push(
      buildCombatUnit({
        id: `ally_npc_${i + 1}`,
        name: pilotName,
        callsign,
        side: 'ally',
        isPlayer: false,
        classId: allyClass,
        level: allyLevel,
        allocatedPoints: generateNpcAllocations(allyClass, allyLevel),
      })
    );
  }

  // 3. Four Enemy Mechs scaled to player level + sector offset
  const enemyUnits: CombatUnit[] = [];
  const shuffledEnemyClasses = [...classIds].sort(() => Math.random() - 0.5);

  for (let i = 0; i < sector.enemyCount; i++) {
    const enemyClass = shuffledEnemyClasses[i % shuffledEnemyClasses.length];
    const prefix = randomItem(ENEMY_ARCHETYPES.prefix);
    const suffix = randomItem(ENEMY_ARCHETYPES.suffixByClass[enemyClass]);
    const enemyLevel = Math.max(
      1,
      player.level + sector.levelOffset + (i === 0 ? 0 : Math.floor(Math.random() * 2) - (sector.levelOffset === 0 ? 1 : 0))
    );

    enemyUnits.push(
      buildCombatUnit({
        id: `enemy_${i + 1}`,
        name: `${prefix} ${suffix}`,
        callsign: `Hostile-${i + 1}`,
        side: 'enemy',
        isPlayer: false,
        classId: enemyClass,
        level: Math.max(1, enemyLevel),
        allocatedPoints: generateNpcAllocations(enemyClass, Math.max(1, enemyLevel)),
      })
    );
  }

  const units = [...allyUnits, ...enemyUnits];
  const turnOrder = sortTurnOrder(units);
  const firstEnemyId = enemyUnits[0]?.id ?? null;

  const openingLog: CombatLogEntry = {
    id: nextId('log'),
    round: 1,
    actorName: sector.name,
    tag: 'SYSTEM',
    message: `Engagement started in ${sector.name} (${sector.difficulty}). Turn order locked by Speed.`,
  };

  return {
    sectorId: sector.id,
    sectorName: sector.name,
    units,
    turnOrder,
    activeTurnIndex: 0,
    round: 1,
    selectedTargetId: firstEnemyId,
    log: [openingLog],
    popups: [],
    isResolving: false,
    summary: null,
  };
}

export interface ActionResolution {
  updatedUnits: CombatUnit[];
  logEntries: CombatLogEntry[];
  popups: FloatingPopup[];
  soundCue:
    | 'laser'
    | 'heavy'
    | 'shield'
    | 'evade'
    | 'defend'
    | 'heal'
    | 'destroy';
}

function applyDamageToUnit(
  attacker: CombatUnit,
  target: CombatUnit,
  rawPower: number,
  defensePierce: number,
  bonusCrit: number,
  round: number,
  actionLabel: string,
  tag: 'ATTACK' | 'SKILL'
): {
  targetAfter: CombatUnit;
  logs: CombatLogEntry[];
  popups: FloatingPopup[];
  anim: UnitAnimState;
  destroyed: boolean;
  evaded: boolean;
  hitShieldOnly: boolean;
} {
  const logs: CombatLogEntry[] = [];
  const popups: FloatingPopup[] = [];

  // Roll evasion
  const dodgeRoll = Math.random() * 100;
  if (dodgeRoll < target.derived.dodgeChance) {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: 'EVADED',
      tone: 'evade',
    });
    logs.push({
      id: nextId('log'),
      round,
      actorName: target.name,
      actorSide: target.side,
      tag: 'EVADE',
      message: `${target.name} evaded ${attacker.name}'s ${actionLabel}!`,
    });
    return {
      targetAfter: { ...target, animState: 'evaded' },
      logs,
      popups,
      anim: 'evaded',
      destroyed: false,
      evaded: true,
      hitShieldOnly: false,
    };
  }

  // Roll critical hit
  const totalCritChance = Math.min(65, attacker.derived.critChance + bonusCrit);
  const isCrit = Math.random() * 100 < totalCritChance;

  const effectiveDefense = Math.max(
    0,
    target.derived.defenseRating * (1 - defensePierce)
  );
  const mitigation =
    COMBAT_FORMULAS.defenseMitigationDivisor /
    (COMBAT_FORMULAS.defenseMitigationDivisor + effectiveDefense);

  let finalDamage = Math.round(rawPower * mitigation * randomVariance());
  if (isCrit) {
    finalDamage = Math.round(finalDamage * COMBAT_FORMULAS.critDamageMultiplier);
  }
  if (target.isDefending) {
    finalDamage = Math.round(finalDamage * COMBAT_FORMULAS.defendDamageMultiplier);
  }
  finalDamage = Math.max(6, finalDamage);

  let nextShield = target.shield;
  let nextHp = target.hp;
  let shieldAbsorbed = 0;
  let hullDamage = 0;

  if (nextShield > 0) {
    shieldAbsorbed = Math.min(nextShield, finalDamage);
    nextShield -= shieldAbsorbed;
    hullDamage = finalDamage - shieldAbsorbed;
  } else {
    hullDamage = finalDamage;
  }

  nextHp = Math.max(0, nextHp - hullDamage);
  const destroyed = nextHp <= 0;
  const hitShieldOnly = shieldAbsorbed > 0 && hullDamage === 0;

  if (hitShieldOnly) {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: isCrit ? `CRIT SHD -${shieldAbsorbed}` : `SHD -${shieldAbsorbed}`,
      tone: 'shield',
    });
  } else if (shieldAbsorbed > 0 && hullDamage > 0) {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: isCrit ? `CRIT -${finalDamage}` : `-${finalDamage}`,
      tone: isCrit ? 'crit' : 'damage',
    });
  } else {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: isCrit ? `CRIT -${hullDamage}` : `-${hullDamage}`,
      tone: isCrit ? 'crit' : 'damage',
    });
  }

  const defendNote = target.isDefending ? ' (Defended)' : '';
  const breakdown =
    shieldAbsorbed > 0 && hullDamage > 0
      ? `${shieldAbsorbed} Shield, ${hullDamage} HP`
      : shieldAbsorbed > 0
      ? `${shieldAbsorbed} Shield`
      : `${hullDamage} HP`;

  logs.push({
    id: nextId('log'),
    round,
    actorName: attacker.name,
    actorSide: attacker.side,
    tag: isCrit ? 'CRIT' : hitShieldOnly ? 'SHIELD' : tag,
    message: `${attacker.name} used ${actionLabel} on ${target.name} for ${breakdown}${isCrit ? ' [CRITICAL]' : ''}${defendNote}.`,
  });

  if (destroyed) {
    logs.push({
      id: nextId('log'),
      round,
      actorName: target.name,
      actorSide: target.side,
      tag: 'KO',
      message: `${target.name} (${MECH_CLASSES[target.classId].name}) was destroyed!`,
    });
  }

  const anim: UnitAnimState = destroyed
    ? 'destroyed'
    : hitShieldOnly
    ? 'shielded'
    : 'hit';

  return {
    targetAfter: {
      ...target,
      shield: nextShield,
      hp: nextHp,
      alive: !destroyed,
      isDefending: destroyed ? false : target.isDefending,
      animState: anim,
    },
    logs,
    popups,
    anim,
    destroyed,
    evaded: false,
    hitShieldOnly,
  };
}

export function resolveUnitAction(
  units: CombatUnit[],
  actorId: string,
  action: ActionType,
  targetId: string | null,
  round: number
): ActionResolution {
  const actor = units.find((u) => u.id === actorId);
  if (!actor || !actor.alive) {
    return { updatedUnits: units, logEntries: [], popups: [], soundCue: 'laser' };
  }

  const cls = MECH_CLASSES[actor.classId];
  const skill = getSkillById(cls.signatureSkillId);

  // Clone units and reset transient animations (preserving destroyed)
  const nextUnits: CombatUnit[] = units.map((u) => ({
    ...u,
    isDefending: u.id === actorId ? false : u.isDefending,
    animState: u.alive ? 'idle' : 'destroyed',
  }));

  const actorIdx = nextUnits.findIndex((u) => u.id === actorId);
  const logs: CombatLogEntry[] = [];
  const popups: FloatingPopup[] = [];

  // 1. DEFEND ACTION
  if (action === 'defend') {
    const spRecovered = Math.min(
      actor.derived.maxSp - actor.sp,
      COMBAT_FORMULAS.defendSpGain
    );
    const shieldRecovered = Math.min(
      actor.derived.maxShield - actor.shield,
      Math.round(actor.derived.maxShield * COMBAT_FORMULAS.defendShieldRestoreRatio)
    );

    nextUnits[actorIdx] = {
      ...nextUnits[actorIdx],
      isDefending: true,
      sp: actor.sp + spRecovered,
      shield: actor.shield + shieldRecovered,
      animState: 'shielded',
    };

    popups.push({
      id: nextId('pop'),
      unitId: actor.id,
      text:
        shieldRecovered > 0
          ? `DEFEND +${shieldRecovered} SHD`
          : `DEFEND +${spRecovered} SP`,
      tone: 'buff',
    });

    logs.push({
      id: nextId('log'),
      round,
      actorName: actor.name,
      actorSide: actor.side,
      tag: 'DEFEND',
      message: `${actor.name} raised defensive barriers (-50% dmg${
        shieldRecovered > 0 ? `, +${shieldRecovered} Shield` : ''
      }${spRecovered > 0 ? `, +${spRecovered} SP` : ''}).`,
    });

    return {
      updatedUnits: nextUnits,
      logEntries: logs,
      popups,
      soundCue: 'defend',
    };
  }

  // 2. SKILL ACTION
  if (action === 'skill' && actor.sp >= skill.spCost) {
    nextUnits[actorIdx] = {
      ...nextUnits[actorIdx],
      sp: Math.max(0, actor.sp - skill.spCost),
      animState: skill.targetType === 'all_allies' ? 'casting' : 'attacking',
    };

    // Support / Squad Restore Skill
    if (skill.targetType === 'all_allies') {
      const spiritBonus = 1 + actor.stats.spirit * 0.008;
      let totalRestored = 0;

      for (let i = 0; i < nextUnits.length; i++) {
        const ally = nextUnits[i];
        if (ally.side !== actor.side || !ally.alive) continue;

        const shdGain = Math.min(
          ally.derived.maxShield - ally.shield,
          Math.round(ally.derived.maxShield * skill.shieldRestoreRatio * spiritBonus)
        );
        const hpGain = Math.min(
          ally.derived.maxHp - ally.hp,
          Math.round(ally.derived.maxHp * skill.hpRestoreRatio * spiritBonus)
        );

        nextUnits[i] = {
          ...ally,
          shield: ally.shield + shdGain,
          hp: ally.hp + hpGain,
          animState: ally.id === actor.id ? 'casting' : 'shielded',
        };

        totalRestored += shdGain + hpGain;
        const labelParts: string[] = [];
        if (shdGain > 0) labelParts.push(`+${shdGain} SHD`);
        if (hpGain > 0) labelParts.push(`+${hpGain} HP`);

        popups.push({
          id: nextId('pop'),
          unitId: ally.id,
          text: labelParts.length > 0 ? labelParts.join(' ') : 'FULL',
          tone: 'heal',
        });
      }

      logs.push({
        id: nextId('log'),
        round,
        actorName: actor.name,
        actorSide: actor.side,
        tag: 'HEAL',
        message: `${actor.name} activated ${skill.name} (-${skill.spCost} SP), restoring ${totalRestored} combined Shield/HP across the squad.`,
      });

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        soundCue: 'heal',
      };
    }

    // AoE Enemy Skill
    if (skill.targetType === 'all_enemies') {
      let anyDestroyed = false;
      const rawPower =
        (actor.derived.attackPower * 1.45 + actor.derived.skillPower * 0.85) *
        skill.powerMultiplier;

      for (let i = 0; i < nextUnits.length; i++) {
        const enemy = nextUnits[i];
        if (enemy.side === actor.side || !enemy.alive) continue;

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          enemy,
          rawPower,
          skill.defensePierce,
          skill.bonusCrit,
          round,
          skill.name,
          'SKILL'
        );
        nextUnits[i] = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) anyDestroyed = true;
      }

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        soundCue: anyDestroyed ? 'destroy' : 'heavy',
      };
    }

    // Single-target Skill (supports multi-hit)
    const opponents = nextUnits.filter((u) => u.side !== actor.side && u.alive);
    const chosenTarget =
      opponents.find((u) => u.id === targetId) ?? opponents[0];

    if (chosenTarget) {
      const targetIdx = nextUnits.findIndex((u) => u.id === chosenTarget.id);
      let anyDestroyed = false;
      let allEvaded = true;
      let lastHitShieldOnly = false;

      const rawPerHit =
        (actor.derived.attackPower * 1.65 + actor.derived.skillPower * 0.8) *
        skill.powerMultiplier;

      for (let h = 0; h < skill.hits; h++) {
        const currentTarget = nextUnits[targetIdx];
        if (!currentTarget.alive) break;
        const hitLabel =
          skill.hits > 1 ? `${skill.name} (${h + 1}/${skill.hits})` : skill.name;

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          currentTarget,
          rawPerHit,
          skill.defensePierce,
          skill.bonusCrit,
          round,
          hitLabel,
          'SKILL'
        );
        nextUnits[targetIdx] = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) anyDestroyed = true;
        if (!res.evaded) allEvaded = false;
        lastHitShieldOnly = res.hitShieldOnly;
      }

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        soundCue: anyDestroyed
          ? 'destroy'
          : allEvaded
          ? 'evade'
          : lastHitShieldOnly
          ? 'shield'
          : 'heavy',
      };
    }
  }

  // 3. BASIC ATTACK ACTION (also fallback if SP insufficient)
  const spGain = Math.min(
    actor.derived.maxSp - actor.sp,
    COMBAT_FORMULAS.attackSpGain
  );
  nextUnits[actorIdx] = {
    ...nextUnits[actorIdx],
    sp: actor.sp + spGain,
    animState: 'attacking',
  };

  const opponents = nextUnits.filter((u) => u.side !== actor.side && u.alive);
  const chosenTarget = opponents.find((u) => u.id === targetId) ?? opponents[0];

  if (!chosenTarget) {
    return { updatedUnits: nextUnits, logEntries: logs, popups, soundCue: 'laser' };
  }

  const targetIdx = nextUnits.findIndex((u) => u.id === chosenTarget.id);
  const rawAttackPower = actor.derived.attackPower * 2.15;

  const res = applyDamageToUnit(
    nextUnits[actorIdx],
    chosenTarget,
    rawAttackPower,
    0,
    0,
    round,
    'Primary Weapons',
    'ATTACK'
  );
  nextUnits[targetIdx] = res.targetAfter;
  logs.push(...res.logs);
  popups.push(...res.popups);

  return {
    updatedUnits: nextUnits,
    logEntries: logs,
    popups,
    soundCue: res.destroyed
      ? 'destroy'
      : res.evaded
      ? 'evade'
      : res.hitShieldOnly
      ? 'shield'
      : 'laser',
  };
}

export function chooseAiDecision(
  actor: CombatUnit,
  units: CombatUnit[]
): { action: ActionType; targetId: string | null } {
  const cls = MECH_CLASSES[actor.classId];
  const skill = getSkillById(cls.signatureSkillId);
  const allies = units.filter((u) => u.side === actor.side && u.alive);
  const enemies = units.filter((u) => u.side !== actor.side && u.alive);

  if (enemies.length === 0) {
    return { action: 'defend', targetId: null };
  }

  // Support AI prioritizes healing/shielding injured allies
  if (skill.targetType === 'all_allies' && actor.sp >= skill.spCost) {
    const injuredCount = allies.filter(
      (a) => a.hp < a.derived.maxHp * 0.78 || a.shield < a.derived.maxShield * 0.45
    ).length;
    if (injuredCount >= 1) {
      return { action: 'skill', targetId: null };
    }
  }

  // Pick smart target: 60% focus lowest remaining total EHP, 40% random living target
  const sortedEnemies = [...enemies].sort(
    (a, b) => a.hp + a.shield - (b.hp + b.shield)
  );
  const target =
    Math.random() < 0.6 ? sortedEnemies[0] : randomItem(enemies);

  // Offensive Skill check
  if (skill.targetType !== 'all_allies' && actor.sp >= skill.spCost) {
    const skillChance = skill.targetType === 'all_enemies' && enemies.length >= 2 ? 0.72 : 0.55;
    if (Math.random() < skillChance) {
      return { action: 'skill', targetId: target.id };
    }
  }

  // Tactical Defend if low HP and low SP
  if (actor.hp < actor.derived.maxHp * 0.28 && actor.sp < skill.spCost && Math.random() < 0.35) {
    return { action: 'defend', targetId: null };
  }

  return { action: 'attack', targetId: target.id };
}

export function calculateBattleRewards(
  units: CombatUnit[],
  sectorId: string,
  won: boolean
): { expGained: number; creditsGained: number } {
  const sector = getSectorById(sectorId);
  const enemies = units.filter((u) => u.side === 'enemy');
  const avgEnemyLevel =
    enemies.length > 0
      ? enemies.reduce((sum, e) => sum + e.level, 0) / enemies.length
      : 1;

  const baseExp =
    (PROGRESSION_CONFIG.baseVictoryExp +
      avgEnemyLevel * PROGRESSION_CONFIG.expPerEnemyLevel) *
    sector.expMultiplier;

  const baseCredits =
    (PROGRESSION_CONFIG.baseVictoryCredits +
      avgEnemyLevel * PROGRESSION_CONFIG.creditsPerEnemyLevel) *
    sector.creditsMultiplier;

  if (won) {
    return {
      expGained: Math.round(baseExp),
      creditsGained: Math.round(baseCredits),
    };
  }

  const destroyedCount = enemies.filter((e) => !e.alive).length;
  const partialBonus = 1 + destroyedCount * 0.12;
  return {
    expGained: Math.round(
      baseExp * PROGRESSION_CONFIG.defeatExpRatio * partialBonus
    ),
    creditsGained: Math.round(
      baseCredits * PROGRESSION_CONFIG.defeatCreditsRatio * partialBonus
    ),
  };
}
