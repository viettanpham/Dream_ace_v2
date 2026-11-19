import { EMPTY_STAT_BLOCK, MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getSectorById } from '../data/maps';
import { ALLY_PILOT_POOL, ENEMY_ARCHETYPES } from '../data/pilots';
import { COMBAT_FORMULAS, PROGRESSION_CONFIG } from '../data/progression';
import { getSkillById } from '../data/skills';
import type {
  ActionType,
  BattleState,
  CombatFxEvent,
  CombatFxKind,
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

function getSlotIndex(units: CombatUnit[], unitId: string): number {
  const target = units.find((u) => u.id === unitId);
  if (!target) return 0;
  const sameSide = units.filter((u) => u.side === target.side);
  const idx = sameSide.findIndex((u) => u.id === unitId);
  return Math.max(0, idx);
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

  // 1. Player Fighter Gear (includes equipped ship part bonuses + enchant scaling)
  const playerEquipBonuses = sumEquippedStatBonuses(player.equipped);
  const playerUnit = buildCombatUnit({
    id: 'ally_player',
    name: player.name.trim() || 'Vance',
    callsign: 'Lead-1',
    side: 'ally',
    isPlayer: true,
    classId: player.classId,
    level: player.level,
    allocatedPoints: player.allocatedPoints,
    equipmentBonuses: playerEquipBonuses,
  });

  // 2. Three random AI Ally Pilots
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
    const levelJitter = Math.floor(Math.random() * 3) - 1;
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

  // 3. Four Hostile Starfighters & Alien Drones
  const enemyUnits: CombatUnit[] = [];
  const shuffledEnemyClasses = [...classIds].sort(() => Math.random() - 0.5);

  for (let i = 0; i < sector.enemyCount; i++) {
    const enemyClass = shuffledEnemyClasses[i % shuffledEnemyClasses.length];
    const prefix = randomItem(ENEMY_ARCHETYPES.prefix);
    const suffix = randomItem(ENEMY_ARCHETYPES.suffixByClass[enemyClass]);
    const enemyLevel = Math.max(
      1,
      player.level +
        sector.levelOffset +
        (i === 0
          ? 0
          : Math.floor(Math.random() * 2) - (sector.levelOffset === 0 ? 1 : 0))
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
        allocatedPoints: generateNpcAllocations(
          enemyClass,
          Math.max(1, enemyLevel)
        ),
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
    templateKey: 'log.battleStart',
    params: {
      sectorId: sector.id,
      difficulty: sector.difficulty,
    },
  };

  return {
    sectorId: sector.id,
    units,
    turnOrder,
    activeTurnIndex: 0,
    round: 1,
    selectedTargetId: firstEnemyId,
    log: [openingLog],
    popups: [],
    fxEvents: [],
    explodedUnitIds: [],
    isResolving: false,
    summary: null,
  };
}

export interface ActionResolution {
  updatedUnits: CombatUnit[];
  logEntries: CombatLogEntry[];
  popups: FloatingPopup[];
  fxEvent: CombatFxEvent | null;
  destroyedUnitIds: string[];
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
  actionMeta: { skillId: string; hitIndex: number; totalHits: number },
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
      templateKey: 'log.evade',
      params: {
        target: target.name,
        actor: attacker.name,
        skillId: actionMeta.skillId,
        hitIndex: actionMeta.hitIndex,
        totalHits: actionMeta.totalHits,
      },
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
  } else {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: isCrit ? `CRIT -${finalDamage}` : `-${finalDamage}`,
      tone: isCrit ? 'crit' : 'damage',
    });
  }

  logs.push({
    id: nextId('log'),
    round,
    actorName: attacker.name,
    actorSide: attacker.side,
    tag: isCrit ? 'CRIT' : hitShieldOnly ? 'SHIELD' : tag,
    templateKey: 'log.damage',
    params: {
      actor: attacker.name,
      target: target.name,
      skillId: actionMeta.skillId,
      hitIndex: actionMeta.hitIndex,
      totalHits: actionMeta.totalHits,
      shieldAbsorbed,
      hullDamage,
      isCrit: isCrit ? 1 : 0,
      isDefending: target.isDefending ? 1 : 0,
    },
  });

  if (destroyed) {
    logs.push({
      id: nextId('log'),
      round,
      actorName: target.name,
      actorSide: target.side,
      tag: 'KO',
      templateKey: 'log.destroyed',
      params: {
        target: target.name,
        classId: target.classId,
      },
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
    return {
      updatedUnits: units,
      logEntries: [],
      popups: [],
      fxEvent: null,
      destroyedUnitIds: [],
      soundCue: 'laser',
    };
  }

  const cls = MECH_CLASSES[actor.classId];
  const skill = getSkillById(cls.signatureSkillId);
  const fromSlotIndex = getSlotIndex(units, actor.id);

  // Clone units and reset transient animations (preserving destroyed)
  const nextUnits: CombatUnit[] = units.map((u) => ({
    ...u,
    isDefending: u.id === actorId ? false : u.isDefending,
    animState: u.alive ? 'idle' : 'destroyed',
  }));

  const actorIdx = nextUnits.findIndex((u) => u.id === actorId);
  const logs: CombatLogEntry[] = [];
  const popups: FloatingPopup[] = [];
  const destroyedUnitIds: string[] = [];

  // 1. DEFEND ACTION (Energy Shield Bubble)
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
          ? `SHIELD +${shieldRecovered}`
          : `SHIELD +${spRecovered} SP`,
      tone: 'buff',
    });

    logs.push({
      id: nextId('log'),
      round,
      actorName: actor.name,
      actorSide: actor.side,
      tag: 'DEFEND',
      templateKey: 'log.defend',
      params: {
        actor: actor.name,
        shieldRecovered,
        spRecovered,
      },
    });

    return {
      updatedUnits: nextUnits,
      logEntries: logs,
      popups,
      fxEvent: null,
      destroyedUnitIds,
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

    // Support / Repair Beam Skill
    if (skill.targetType === 'all_allies') {
      const spiritBonus = 1 + actor.stats.spirit * 0.008;
      let totalRestored = 0;
      const healedSlotIndices: number[] = [];

      for (let i = 0; i < nextUnits.length; i++) {
        const ally = nextUnits[i];
        if (ally.side !== actor.side || !ally.alive) continue;

        healedSlotIndices.push(getSlotIndex(units, ally.id));

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
        templateKey: 'log.healSquad',
        params: {
          actor: actor.name,
          skillId: skill.id,
          spCost: skill.spCost,
          total: totalRestored,
        },
      });

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        fxEvent: {
          id: nextId('fx'),
          kind: 'heal',
          fromSide: actor.side,
          fromSlotIndex,
          toSide: actor.side,
          toSlotIndices: healedSlotIndices,
          accentHex: '#10B981',
        },
        destroyedUnitIds,
        soundCue: 'heal',
      };
    }

    // AoE Railgun Skill (Siege)
    if (skill.targetType === 'all_enemies') {
      const rawPower =
        (actor.derived.attackPower * 1.45 + actor.derived.skillPower * 0.85) *
        skill.powerMultiplier;
      const targetSlotIndices: number[] = [];

      for (let i = 0; i < nextUnits.length; i++) {
        const enemy = nextUnits[i];
        if (enemy.side === actor.side || !enemy.alive) continue;
        targetSlotIndices.push(getSlotIndex(units, enemy.id));

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          enemy,
          rawPower,
          skill.defensePierce,
          skill.bonusCrit,
          round,
          { skillId: skill.id, hitIndex: 1, totalHits: 1 },
          'SKILL'
        );
        nextUnits[i] = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) destroyedUnitIds.push(enemy.id);
      }

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        fxEvent: {
          id: nextId('fx'),
          kind: 'railgun',
          fromSide: actor.side,
          fromSlotIndex,
          toSide: actor.side === 'ally' ? 'enemy' : 'ally',
          toSlotIndices: targetSlotIndices,
          accentHex: actor.side === 'ally' ? '#F59E0B' : '#EF4444',
        },
        destroyedUnitIds,
        soundCue: destroyedUnitIds.length > 0 ? 'destroy' : 'heavy',
      };
    }

    // Single-target Skill (Striker bomb/missile salvo, Interceptor twin laser strafe)
    const opponents = nextUnits.filter((u) => u.side !== actor.side && u.alive);
    const chosenTarget =
      opponents.find((u) => u.id === targetId) ?? opponents[0];

    if (chosenTarget) {
      const targetIdx = nextUnits.findIndex((u) => u.id === chosenTarget.id);
      const targetSlotIdx = getSlotIndex(units, chosenTarget.id);
      let allEvaded = true;
      let lastHitShieldOnly = false;

      const rawPerHit =
        (actor.derived.attackPower * 1.65 + actor.derived.skillPower * 0.8) *
        skill.powerMultiplier;

      for (let h = 0; h < skill.hits; h++) {
        const currentTarget = nextUnits[targetIdx];
        if (!currentTarget.alive) break;

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          currentTarget,
          rawPerHit,
          skill.defensePierce,
          skill.bonusCrit,
          round,
          { skillId: skill.id, hitIndex: h + 1, totalHits: skill.hits },
          'SKILL'
        );
        nextUnits[targetIdx] = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) destroyedUnitIds.push(chosenTarget.id);
        if (!res.evaded) allEvaded = false;
        lastHitShieldOnly = res.hitShieldOnly;
      }

      const fxKind: CombatFxKind =
        actor.classId === 'striker' ? 'missile' : 'laser';

      return {
        updatedUnits: nextUnits,
        logEntries: logs,
        popups,
        fxEvent: {
          id: nextId('fx'),
          kind: fxKind,
          fromSide: actor.side,
          fromSlotIndex,
          toSide: chosenTarget.side,
          toSlotIndices: [targetSlotIdx],
          accentHex: actor.side === 'ally' ? cls.accentHex : '#EF4444',
        },
        destroyedUnitIds,
        soundCue:
          destroyedUnitIds.length > 0
            ? 'destroy'
            : allEvaded
            ? 'evade'
            : lastHitShieldOnly
            ? 'shield'
            : 'heavy',
      };
    }
  }

  // 3. BASIC ATTACK ACTION (Laser bolts / missile volley)
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
    return {
      updatedUnits: nextUnits,
      logEntries: logs,
      popups,
      fxEvent: null,
      destroyedUnitIds,
      soundCue: 'laser',
    };
  }

  const targetIdx = nextUnits.findIndex((u) => u.id === chosenTarget.id);
  const targetSlotIdx = getSlotIndex(units, chosenTarget.id);
  const rawAttackPower = actor.derived.attackPower * 2.15;

  const res = applyDamageToUnit(
    nextUnits[actorIdx],
    chosenTarget,
    rawAttackPower,
    0,
    0,
    round,
    { skillId: '', hitIndex: 1, totalHits: 1 },
    'ATTACK'
  );
  nextUnits[targetIdx] = res.targetAfter;
  logs.push(...res.logs);
  popups.push(...res.popups);
  if (res.destroyed) destroyedUnitIds.push(chosenTarget.id);

  return {
    updatedUnits: nextUnits,
    logEntries: logs,
    popups,
    fxEvent: {
      id: nextId('fx'),
      kind: actor.classId === 'striker' ? 'missile' : 'laser',
      fromSide: actor.side,
      fromSlotIndex,
      toSide: chosenTarget.side,
      toSlotIndices: [targetSlotIdx],
      accentHex: actor.side === 'ally' ? '#38BDF8' : '#F97316',
    },
    destroyedUnitIds,
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

  if (skill.targetType === 'all_allies' && actor.sp >= skill.spCost) {
    const injuredCount = allies.filter(
      (a) => a.hp < a.derived.maxHp * 0.78 || a.shield < a.derived.maxShield * 0.45
    ).length;
    if (injuredCount >= 1) {
      return { action: 'skill', targetId: null };
    }
  }

  const sortedEnemies = [...enemies].sort(
    (a, b) => a.hp + a.shield - (b.hp + b.shield)
  );
  const target =
    Math.random() < 0.6 ? sortedEnemies[0] : randomItem(enemies);

  if (skill.targetType !== 'all_allies' && actor.sp >= skill.spCost) {
    const skillChance =
      skill.targetType === 'all_enemies' && enemies.length >= 2 ? 0.72 : 0.55;
    if (Math.random() < skillChance) {
      return { action: 'skill', targetId: target.id };
    }
  }

  if (
    actor.hp < actor.derived.maxHp * 0.28 &&
    actor.sp < skill.spCost &&
    Math.random() < 0.35
  ) {
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
