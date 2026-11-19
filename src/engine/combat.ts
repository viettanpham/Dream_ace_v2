import { BALANCE_CONFIG, COMBAT_FORMULAS } from '../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getSectorById } from '../data/maps';
import {
  ALLY_PILOT_POOL,
  ENEMY_ARCHETYPE_DEFS,
  ENEMY_PREFIXES,
} from '../data/pilots';
import { getScaledSkillStats, getSkillById } from '../data/skills';
import type {
  ActionType,
  ActiveStatusEffect,
  AdminConfig,
  BattleState,
  CombatFxEvent,
  CombatFxKind,
  CombatLogEntry,
  CombatSide,
  CombatUnit,
  EnemyArchetype,
  FloatingPopup,
  ItemSpecialTraits,
  MechClassId,
  PilotAccount,
  StatBlock,
  StatusEffectType,
  UnitAnimState,
} from '../types/game';
import { sumGearEquipmentStats, sumGearSpecialTraits } from './equipment';
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

function randomItem<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomVariance(rng: () => number = Math.random): number {
  const { damageVarianceMin, damageVarianceMax } = COMBAT_FORMULAS;
  return damageVarianceMin + rng() * (damageVarianceMax - damageVarianceMin);
}

function getSlotIndex(units: CombatUnit[], unitId: string): number {
  const target = units.find((u) => u.id === unitId);
  if (!target) return 0;
  const sameSide = units.filter((u) => u.side === target.side);
  const idx = sameSide.findIndex((u) => u.id === unitId);
  return Math.max(0, idx);
}

export function hasStatus(unit: CombatUnit, type: StatusEffectType): boolean {
  return unit.statuses.some((s) => s.type === type && s.turnsRemaining > 0);
}

export function getEffectiveUnitSpeed(unit: CombatUnit): number {
  const base = unit.derived.speed;
  if (hasStatus(unit, 'slow')) {
    return Math.max(1, Math.round(base * (1 - BALANCE_CONFIG.slowSpeedPenalty)));
  }
  return base;
}

function addOrRefreshStatus(
  statuses: ActiveStatusEffect[],
  type: StatusEffectType,
  duration: number,
  sourceName?: string
): ActiveStatusEffect[] {
  const filtered = statuses.filter((s) => s.type !== type);
  return [...filtered, { type, turnsRemaining: duration, sourceName }];
}

function buildCombatUnit(params: {
  id: string;
  name: string;
  callsign: string;
  side: CombatSide;
  isPlayer: boolean;
  classId: MechClassId;
  archetype?: EnemyArchetype;
  isBoss?: boolean;
  level: number;
  skillLevel?: number;
  allocatedPoints: StatBlock;
  equipmentBonuses?: StatBlock;
  specialTraits?: ItemSpecialTraits;
}): CombatUnit {
  const stats = calculateEffectiveStats(
    params.classId,
    params.level,
    params.allocatedPoints,
    EMPTY_STAT_BLOCK,
    params.equipmentBonuses ?? EMPTY_STAT_BLOCK,
    params.specialTraits
  );
  const baseDerived = calculateDerivedStats(
    params.classId,
    params.level,
    stats,
    params.specialTraits
  );

  // Apply Enemy Archetype & Boss stat tuning
  const archDef = params.archetype
    ? ENEMY_ARCHETYPE_DEFS[params.archetype]
    : null;
  const bossHpMult = params.isBoss ? 1.85 : 1;
  const bossAtkMult = params.isBoss ? 1.25 : 1;

  const derived = archDef
    ? {
        ...baseDerived,
        maxHp: Math.round(baseDerived.maxHp * archDef.hpMult * bossHpMult),
        maxShield: Math.round(
          baseDerived.maxShield * archDef.shieldMult * (params.isBoss ? 1.5 : 1)
        ),
        attackPower: Math.round(
          baseDerived.attackPower * archDef.attackMult * bossAtkMult
        ),
        speed: Math.max(1, Math.round(baseDerived.speed * archDef.speedMult)),
      }
    : baseDerived;

  return {
    id: params.id,
    name: params.name,
    callsign: params.callsign,
    side: params.side,
    isPlayer: params.isPlayer,
    classId: params.classId,
    archetype: params.archetype,
    isBoss: Boolean(params.isBoss),
    level: params.level,
    skillLevel: params.skillLevel ?? 1,
    stats,
    derived,
    hp: derived.maxHp,
    shield: derived.maxShield,
    sp: derived.maxSp,
    isDefending: false,
    alive: true,
    statuses: [],
    animState: 'idle',
  };
}

export function sortTurnOrder(units: CombatUnit[]): string[] {
  return [...units]
    .sort((a, b) => {
      const spdDiff = getEffectiveUnitSpeed(b) - getEffectiveUnitSpeed(a);
      if (spdDiff !== 0) return spdDiff;
      if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
      if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
      return a.id.localeCompare(b.id);
    })
    .map((u) => u.id);
}

export function createInitialBattleState(
  pilot: PilotAccount,
  sectorId: string,
  rng: () => number = Math.random
): BattleState {
  const sector = getSectorById(sectorId);
  const activeGear = pilot.gears[pilot.activeGearId];
  const classIds = MECH_CLASS_LIST.map((c) => c.id);

  // 1. Player's Deployed Gear (per-Gear level, stats, equipment, and skill level)
  const playerEquipBonuses = sumGearEquipmentStats(activeGear, pilot.inventory);
  const playerTraits = sumGearSpecialTraits(activeGear, pilot.inventory);
  const sigSkillId = MECH_CLASSES[activeGear.classId].signatureSkillId;
  const playerSkillLevel = activeGear.skillLevels[sigSkillId] ?? 1;

  const playerUnit = buildCombatUnit({
    id: 'ally_player',
    name: pilot.name.trim() || 'Vance',
    callsign: 'Lead-1',
    side: 'ally',
    isPlayer: true,
    classId: activeGear.classId,
    level: activeGear.level,
    skillLevel: playerSkillLevel,
    allocatedPoints: activeGear.allocatedPoints,
    equipmentBonuses: playerEquipBonuses,
    specialTraits: playerTraits,
  });

  // 2. Three random AI Ally Pilots scaled to active Gear level
  const usedNames = new Set<string>([playerUnit.name]);
  const usedCallsigns = new Set<string>([playerUnit.callsign]);
  const allyUnits: CombatUnit[] = [playerUnit];

  for (let i = 0; i < 3; i++) {
    const remainingNames = ALLY_PILOT_POOL.firstNames.filter(
      (n) => !usedNames.has(n)
    );
    const pilotName =
      remainingNames.length > 0
        ? randomItem(remainingNames, rng)
        : `Wingman-${i + 1}`;
    usedNames.add(pilotName);

    const remainingCallsigns = ALLY_PILOT_POOL.callsigns.filter(
      (c) => !usedCallsigns.has(c)
    );
    const callsign =
      remainingCallsigns.length > 0
        ? randomItem(remainingCallsigns, rng)
        : `Wing-${i + 1}`;
    usedCallsigns.add(callsign);

    const allyClass: MechClassId = randomItem(classIds, rng);
    const levelJitter = Math.floor(rng() * 3) - 1;
    const allyLevel = Math.max(1, activeGear.level + levelJitter);

    allyUnits.push(
      buildCombatUnit({
        id: `ally_npc_${i + 1}`,
        name: pilotName,
        callsign,
        side: 'ally',
        isPlayer: false,
        classId: allyClass,
        level: allyLevel,
        skillLevel: Math.min(5, Math.max(1, Math.ceil(allyLevel / 4))),
        allocatedPoints: generateNpcAllocations(allyClass, allyLevel, rng),
      })
    );
  }

  // 3. Four Hostile Starfighters with Distinct Tactical Archetypes
  const archetypeRoster: EnemyArchetype[] = [
    'gunship',
    'sniper',
    'drone',
    'repair_ship',
  ];
  const enemyUnits: CombatUnit[] = [];

  for (let i = 0; i < sector.enemyCount; i++) {
    const archetype = archetypeRoster[i % archetypeRoster.length];
    const archDef = ENEMY_ARCHETYPE_DEFS[archetype];
    const isBoss = sector.hasBoss && i === 0;
    const prefix = randomItem(ENEMY_PREFIXES, rng);
    const baseName = isBoss
      ? randomItem(archDef.bossNames, rng)
      : randomItem(archDef.names, rng);
    const enemyLevel = Math.max(
      1,
      activeGear.level +
        sector.levelOffset +
        (isBoss
          ? 1
          : i === 0
          ? 0
          : Math.floor(rng() * 2) - (sector.levelOffset === 0 ? 1 : 0))
    );

    enemyUnits.push(
      buildCombatUnit({
        id: `enemy_${i + 1}`,
        name: `${prefix} ${baseName}`,
        callsign: isBoss ? 'BOSS' : `Hostile-${i + 1}`,
        side: 'enemy',
        isPlayer: false,
        classId: archDef.classId,
        archetype,
        isBoss,
        level: Math.max(1, enemyLevel),
        skillLevel: Math.min(5, Math.max(1, Math.ceil(enemyLevel / 4))),
        allocatedPoints: generateNpcAllocations(
          archDef.classId,
          Math.max(1, enemyLevel),
          rng
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
    deployedGearId: activeGear.classId,
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
  tag: 'ATTACK' | 'SKILL',
  adminConfig?: AdminConfig,
  rng: () => number = Math.random
): {
  targetAfter: CombatUnit;
  logs: CombatLogEntry[];
  popups: FloatingPopup[];
  anim: UnitAnimState;
  destroyed: boolean;
  evaded: boolean;
  hitShieldOnly: boolean;
  damageDealt: number;
} {
  const logs: CombatLogEntry[] = [];
  const popups: FloatingPopup[] = [];

  // Admin God Mode: Player takes 0 damage
  if (adminConfig?.godMode && target.isPlayer) {
    popups.push({
      id: nextId('pop'),
      unitId: target.id,
      text: 'GOD 0',
      tone: 'shield',
    });
    return {
      targetAfter: { ...target, animState: 'shielded' },
      logs,
      popups,
      anim: 'shielded',
      destroyed: false,
      evaded: false,
      hitShieldOnly: true,
      damageDealt: 0,
    };
  }

  // Roll evasion (bypassed if admin oneHitKills on player)
  const isOneHit = Boolean(adminConfig?.oneHitKills && attacker.isPlayer);
  if (!isOneHit && rng() * 100 < target.derived.dodgeChance) {
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
      damageDealt: 0,
    };
  }

  const totalCritChance = Math.min(75, attacker.derived.critChance + bonusCrit);
  const isCrit = isOneHit || rng() * 100 < totalCritChance;

  const totalPierce = Math.min(
    0.85,
    defensePierce + attacker.derived.armorPiercePct / 100
  );
  const effectiveDefense = Math.max(
    0,
    target.derived.defenseRating * (1 - totalPierce)
  );
  const mitigation =
    COMBAT_FORMULAS.defenseMitigationDivisor /
    (COMBAT_FORMULAS.defenseMitigationDivisor + effectiveDefense);

  let finalDamage = isOneHit
    ? 99999
    : Math.round(rawPower * mitigation * randomVariance(rng));
  if (!isOneHit && isCrit) {
    finalDamage = Math.round(finalDamage * COMBAT_FORMULAS.critDamageMultiplier);
  }
  if (!isOneHit && target.isDefending) {
    finalDamage = Math.round(finalDamage * COMBAT_FORMULAS.defendDamageMultiplier);
  }
  finalDamage = Math.max(6, finalDamage);

  // Shield Break status disables shield absorption for its duration!
  const shieldDisabled = hasStatus(target, 'shield_break');
  let nextShield = target.shield;
  let nextHp = target.hp;
  let shieldAbsorbed = 0;
  let hullDamage = 0;

  if (!shieldDisabled && nextShield > 0) {
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
      statuses: destroyed ? [] : target.statuses,
      animState: anim,
    },
    logs,
    popups,
    anim,
    destroyed,
    evaded: false,
    hitShieldOnly,
    damageDealt: finalDamage,
  };
}

function tryInflictStatus(
  target: CombatUnit,
  statusType: StatusEffectType,
  duration: number,
  chance: number,
  actorName: string,
  round: number,
  rng: () => number
): {
  targetAfter: CombatUnit;
  logs: CombatLogEntry[];
  popups: FloatingPopup[];
} {
  if (!target.alive || rng() > chance) {
    return { targetAfter: target, logs: [], popups: [] };
  }

  const label =
    statusType === 'burn'
      ? 'BURN'
      : statusType === 'shield_break'
      ? 'SHD BREAK'
      : 'SLOW';

  return {
    targetAfter: {
      ...target,
      statuses: addOrRefreshStatus(
        target.statuses,
        statusType,
        duration,
        actorName
      ),
    },
    logs: [
      {
        id: nextId('log'),
        round,
        actorName,
        tag: 'STATUS',
        templateKey: 'log.statusApplied',
        params: {
          target: target.name,
          status: statusType,
          turns: duration,
        },
      },
    ],
    popups: [
      {
        id: nextId('pop'),
        unitId: target.id,
        text: label,
        tone: 'status',
      },
    ],
  };
}

export function resolveUnitAction(
  units: CombatUnit[],
  actorId: string,
  action: ActionType,
  targetId: string | null,
  round: number,
  adminConfig?: AdminConfig,
  rng: () => number = Math.random
): ActionResolution {
  const originalActor = units.find((u) => u.id === actorId);
  if (!originalActor || !originalActor.alive) {
    return {
      updatedUnits: units,
      logEntries: [],
      popups: [],
      fxEvent: null,
      destroyedUnitIds: [],
      soundCue: 'laser',
    };
  }

  const cls = MECH_CLASSES[originalActor.classId];
  const baseSkill = getSkillById(cls.signatureSkillId);
  const scaledSkill = getScaledSkillStats(baseSkill, originalActor.skillLevel);
  const fromSlotIndex = getSlotIndex(units, originalActor.id);

  // Clone units and reset transient animations
  const nextUnits: CombatUnit[] = units.map((u) => ({
    ...u,
    isDefending: u.id === actorId ? false : u.isDefending,
    animState: u.alive ? 'idle' : 'destroyed',
  }));

  const actorIdx = nextUnits.findIndex((u) => u.id === actorId);
  const logs: CombatLogEntry[] = [];
  const popups: FloatingPopup[] = [];
  const destroyedUnitIds: string[] = [];

  // ---- Start-of-turn passive SP regen (from item traits) & Burn DoT + status ticks ----
  let actor = nextUnits[actorIdx];
  if (actor.derived.spRegenPerTurn > 0) {
    actor = {
      ...actor,
      sp: Math.min(actor.derived.maxSp, actor.sp + actor.derived.spRegenPerTurn),
    };
  }

  if (hasStatus(actor, 'burn')) {
    const burnDmg =
      adminConfig?.godMode && actor.isPlayer
        ? 0
        : Math.max(5, Math.round(actor.derived.maxHp * BALANCE_CONFIG.burnDamageRatio));
    const nextHp = Math.max(0, actor.hp - burnDmg);
    const burnedOut = nextHp <= 0;
    actor = {
      ...actor,
      hp: nextHp,
      alive: !burnedOut,
      animState: burnedOut ? 'destroyed' : 'hit',
    };
    if (burnDmg > 0) {
      popups.push({
        id: nextId('pop'),
        unitId: actor.id,
        text: `BURN -${burnDmg}`,
        tone: 'status',
      });
      logs.push({
        id: nextId('log'),
        round,
        actorName: actor.name,
        actorSide: actor.side,
        tag: 'STATUS',
        templateKey: 'log.burnTick',
        params: { target: actor.name, damage: burnDmg },
      });
    }
    if (burnedOut) {
      destroyedUnitIds.push(actor.id);
      logs.push({
        id: nextId('log'),
        round,
        actorName: actor.name,
        actorSide: actor.side,
        tag: 'KO',
        templateKey: 'log.destroyed',
        params: { target: actor.name, classId: actor.classId },
      });
    }
  }

  // Tick down active status durations on this actor
  actor = {
    ...actor,
    statuses: actor.alive
      ? actor.statuses
          .map((s) => ({ ...s, turnsRemaining: s.turnsRemaining - 1 }))
          .filter((s) => s.turnsRemaining > 0)
      : [],
  };
  nextUnits[actorIdx] = actor;

  // If Burn destroyed the actor before it could act, end its turn immediately
  if (!actor.alive) {
    return {
      updatedUnits: nextUnits,
      logEntries: logs,
      popups,
      fxEvent: null,
      destroyedUnitIds,
      soundCue: 'destroy',
    };
  }

  // 1. DEFEND ACTION (Energy Shield Bubble)
  if (action === 'defend') {
    const spRecovered = Math.min(
      actor.derived.maxSp - actor.sp,
      COMBAT_FORMULAS.defendSpGain
    );
    const shieldBlocked = hasStatus(actor, 'shield_break');
    const shieldRecovered = shieldBlocked
      ? 0
      : Math.min(
          actor.derived.maxShield - actor.shield,
          Math.round(
            actor.derived.maxShield * COMBAT_FORMULAS.defendShieldRestoreRatio
          )
        );

    nextUnits[actorIdx] = {
      ...actor,
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
          : `DEFEND +${spRecovered} SP`,
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

  // 2. SKILL ACTION (scaled by skill level 1..5)
  if (action === 'skill' && actor.sp >= scaledSkill.spCost) {
    nextUnits[actorIdx] = {
      ...actor,
      sp: Math.max(0, actor.sp - scaledSkill.spCost),
      animState: baseSkill.targetType === 'all_allies' ? 'casting' : 'attacking',
    };

    // Support / Repair Beam Skill (restores Shield & HP + cleanses statuses)
    if (baseSkill.targetType === 'all_allies') {
      const spiritBonus = 1 + actor.stats.spirit * 0.008;
      let totalRestored = 0;
      let cleansedAny = false;
      const healedSlotIndices: number[] = [];

      for (let i = 0; i < nextUnits.length; i++) {
        const ally = nextUnits[i];
        if (ally.side !== actor.side || !ally.alive) continue;

        healedSlotIndices.push(getSlotIndex(units, ally.id));

        const hadStatuses = ally.statuses.length > 0;
        const nextStatuses = baseSkill.cleansesStatus ? [] : ally.statuses;
        if (baseSkill.cleansesStatus && hadStatuses) cleansedAny = true;

        const shdGain = Math.min(
          ally.derived.maxShield - ally.shield,
          Math.round(
            ally.derived.maxShield *
              scaledSkill.shieldRestoreRatio *
              spiritBonus
          )
        );
        const hpGain = Math.min(
          ally.derived.maxHp - ally.hp,
          Math.round(
            ally.derived.maxHp * scaledSkill.hpRestoreRatio * spiritBonus
          )
        );

        nextUnits[i] = {
          ...ally,
          shield: ally.shield + shdGain,
          hp: ally.hp + hpGain,
          statuses: nextStatuses,
          animState: ally.id === actor.id ? 'casting' : 'shielded',
        };

        totalRestored += shdGain + hpGain;
        const labelParts: string[] = [];
        if (shdGain > 0) labelParts.push(`+${shdGain} SHD`);
        if (hpGain > 0) labelParts.push(`+${hpGain} HP`);
        if (baseSkill.cleansesStatus && hadStatuses) labelParts.push('CLEANSE');

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
          skillId: baseSkill.id,
          spCost: scaledSkill.spCost,
          total: totalRestored,
        },
      });

      if (cleansedAny) {
        logs.push({
          id: nextId('log'),
          round,
          actorName: actor.name,
          actorSide: actor.side,
          tag: 'STATUS',
          templateKey: 'log.statusCleansed',
          params: { actor: actor.name },
        });
      }

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

    // AoE Railgun Skill (Siege -> applies Shield Break)
    if (baseSkill.targetType === 'all_enemies') {
      const rawPower =
        (actor.derived.attackPower * 1.45 + actor.derived.skillPower * 0.85) *
        scaledSkill.powerMultiplier;
      const targetSlotIndices: number[] = [];

      for (let i = 0; i < nextUnits.length; i++) {
        const enemy = nextUnits[i];
        if (enemy.side === actor.side || !enemy.alive) continue;
        targetSlotIndices.push(getSlotIndex(units, enemy.id));

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          enemy,
          rawPower,
          baseSkill.defensePierce,
          baseSkill.bonusCrit,
          round,
          { skillId: baseSkill.id, hitIndex: 1, totalHits: 1 },
          'SKILL',
          adminConfig,
          rng
        );
        let targetAfter = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) {
          destroyedUnitIds.push(enemy.id);
        } else if (!res.evaded && baseSkill.appliesStatus) {
          const st = tryInflictStatus(
            targetAfter,
            baseSkill.appliesStatus,
            baseSkill.statusDuration ?? 2,
            scaledSkill.statusChance || 0.75,
            actor.name,
            round,
            rng
          );
          targetAfter = st.targetAfter;
          logs.push(...st.logs);
          popups.push(...st.popups);
        }
        nextUnits[i] = targetAfter;
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

    // Single-target Skill (Striker Burn / Interceptor Slow)
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
        scaledSkill.powerMultiplier;

      for (let h = 0; h < baseSkill.hits; h++) {
        const currentTarget = nextUnits[targetIdx];
        if (!currentTarget.alive) break;

        const res = applyDamageToUnit(
          nextUnits[actorIdx],
          currentTarget,
          rawPerHit,
          baseSkill.defensePierce,
          baseSkill.bonusCrit,
          round,
          { skillId: baseSkill.id, hitIndex: h + 1, totalHits: baseSkill.hits },
          'SKILL',
          adminConfig,
          rng
        );
        nextUnits[targetIdx] = res.targetAfter;
        logs.push(...res.logs);
        popups.push(...res.popups);
        if (res.destroyed) destroyedUnitIds.push(chosenTarget.id);
        if (!res.evaded) allEvaded = false;
        lastHitShieldOnly = res.hitShieldOnly;
      }

      // Apply skill status effect once if target survived and wasn't completely evaded
      if (
        !allEvaded &&
        nextUnits[targetIdx].alive &&
        baseSkill.appliesStatus
      ) {
        const st = tryInflictStatus(
          nextUnits[targetIdx],
          baseSkill.appliesStatus,
          baseSkill.statusDuration ?? 2,
          scaledSkill.statusChance || 0.8,
          actor.name,
          round,
          rng
        );
        nextUnits[targetIdx] = st.targetAfter;
        logs.push(...st.logs);
        popups.push(...st.popups);
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

  // 3. BASIC ATTACK ACTION (includes item Splash trait & enemy archetype status effects)
  const spGain = Math.min(
    actor.derived.maxSp - actor.sp,
    COMBAT_FORMULAS.attackSpGain
  );
  nextUnits[actorIdx] = {
    ...actor,
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
    'ATTACK',
    adminConfig,
    rng
  );
  nextUnits[targetIdx] = res.targetAfter;
  logs.push(...res.logs);
  popups.push(...res.popups);
  if (res.destroyed) destroyedUnitIds.push(chosenTarget.id);

  // Enemy Archetype basic attack status chance
  if (!res.evaded && nextUnits[targetIdx].alive && actor.archetype) {
    const archDef = ENEMY_ARCHETYPE_DEFS[actor.archetype];
    if (archDef.inflictsStatus && archDef.statusChance) {
      const st = tryInflictStatus(
        nextUnits[targetIdx],
        archDef.inflictsStatus,
        2,
        archDef.statusChance * 0.55,
        actor.name,
        round,
        rng
      );
      nextUnits[targetIdx] = st.targetAfter;
      logs.push(...st.logs);
      popups.push(...st.popups);
    }
  }

  // Splash damage trait (from Missile Pod / Nova Beam / Singularity Core)
  const fxTargetSlots = [targetSlotIdx];
  if (!res.evaded && actor.derived.splashPct > 0 && res.damageDealt > 0) {
    const splashDmg = Math.max(
      4,
      Math.round((res.damageDealt * actor.derived.splashPct) / 100)
    );
    const otherOpponent = nextUnits.find(
      (u) => u.side !== actor.side && u.alive && u.id !== chosenTarget.id
    );
    if (otherOpponent) {
      const oIdx = nextUnits.findIndex((u) => u.id === otherOpponent.id);
      fxTargetSlots.push(getSlotIndex(units, otherOpponent.id));
      const shieldDisabled = hasStatus(otherOpponent, 'shield_break');
      const actualSplash =
        adminConfig?.godMode && otherOpponent.isPlayer ? 0 : splashDmg;
      let nextShd = otherOpponent.shield;
      let nextHp = otherOpponent.hp;
      if (!shieldDisabled && nextShd > 0) {
        const abs = Math.min(nextShd, actualSplash);
        nextShd -= abs;
        nextHp = Math.max(0, nextHp - (actualSplash - abs));
      } else {
        nextHp = Math.max(0, nextHp - actualSplash);
      }
      const splashKo = nextHp <= 0;
      nextUnits[oIdx] = {
        ...otherOpponent,
        shield: nextShd,
        hp: nextHp,
        alive: !splashKo,
        animState: splashKo ? 'destroyed' : 'hit',
      };
      if (actualSplash > 0) {
        popups.push({
          id: nextId('pop'),
          unitId: otherOpponent.id,
          text: `SPLASH -${actualSplash}`,
          tone: 'damage',
        });
        logs.push({
          id: nextId('log'),
          round,
          actorName: actor.name,
          actorSide: actor.side,
          tag: 'ATTACK',
          templateKey: 'log.splashDamage',
          params: {
            actor: actor.name,
            target: otherOpponent.name,
            damage: actualSplash,
          },
        });
      }
      if (splashKo) {
        destroyedUnitIds.push(otherOpponent.id);
        logs.push({
          id: nextId('log'),
          round,
          actorName: otherOpponent.name,
          actorSide: otherOpponent.side,
          tag: 'KO',
          templateKey: 'log.destroyed',
          params: { target: otherOpponent.name, classId: otherOpponent.classId },
        });
      }
    }
  }

  return {
    updatedUnits: nextUnits,
    logEntries: logs,
    popups,
    fxEvent: {
      id: nextId('fx'),
      kind:
        actor.classId === 'striker' || actor.derived.splashPct > 0
          ? 'missile'
          : 'laser',
      fromSide: actor.side,
      fromSlotIndex,
      toSide: chosenTarget.side,
      toSlotIndices: fxTargetSlots,
      accentHex: actor.side === 'ally' ? '#38BDF8' : '#F97316',
    },
    destroyedUnitIds,
    soundCue:
      destroyedUnitIds.length > 0
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
  units: CombatUnit[],
  rng: () => number = Math.random
): { action: ActionType; targetId: string | null } {
  const cls = MECH_CLASSES[actor.classId];
  const baseSkill = getSkillById(cls.signatureSkillId);
  const scaledSkill = getScaledSkillStats(baseSkill, actor.skillLevel);
  const allies = units.filter((u) => u.side === actor.side && u.alive);
  const enemies = units.filter((u) => u.side !== actor.side && u.alive);

  if (enemies.length === 0) {
    return { action: 'defend', targetId: null };
  }

  // Repair Ship / Support archetype strongly prioritizes healing injured allies
  if (baseSkill.targetType === 'all_allies' && actor.sp >= scaledSkill.spCost) {
    const injuredCount = allies.filter(
      (a) =>
        a.hp < a.derived.maxHp * 0.85 ||
        a.shield < a.derived.maxShield * 0.5 ||
        a.statuses.length > 0
    ).length;
    if (injuredCount >= 1) {
      return { action: 'skill', targetId: null };
    }
  }

  // Sniper archetype ALWAYS targets lowest HP opponent!
  let target: CombatUnit;
  if (actor.archetype === 'sniper') {
    target = [...enemies].sort((a, b) => a.hp - b.hp)[0];
  } else {
    const sortedEnemies = [...enemies].sort(
      (a, b) => a.hp + a.shield - (b.hp + b.shield)
    );
    target = rng() < 0.6 ? sortedEnemies[0] : randomItem(enemies, rng);
  }

  if (baseSkill.targetType !== 'all_allies' && actor.sp >= scaledSkill.spCost) {
    const skillChance =
      actor.archetype === 'sniper' || actor.archetype === 'gunship'
        ? 0.7
        : baseSkill.targetType === 'all_enemies' && enemies.length >= 2
        ? 0.72
        : 0.55;
    if (rng() < skillChance) {
      return { action: 'skill', targetId: target.id };
    }
  }

  if (
    actor.archetype === 'gunship' &&
    actor.hp < actor.derived.maxHp * 0.35 &&
    actor.sp < scaledSkill.spCost &&
    rng() < 0.45
  ) {
    return { action: 'defend', targetId: null };
  }

  return { action: 'attack', targetId: target.id };
}

/**
 * Pure per-enemy base reward formula (before global REWARD_MULT).
 * EXP per enemy = 25 + 8 * enemyLevel (x5 for bosses)
 * Credits per enemy = 60 + 20 * enemyLevel (x5 for bosses)
 */
export function calculateSingleEnemyReward(
  enemyLevel: number,
  isBoss = false
): { exp: number; credits: number } {
  const lv = Math.max(1, enemyLevel);
  const bossMult = isBoss ? BALANCE_CONFIG.bossRewardMultiplier : 1;
  return {
    exp: (BALANCE_CONFIG.enemyExpBase + BALANCE_CONFIG.enemyExpPerLevel * lv) * bossMult,
    credits:
      (BALANCE_CONFIG.enemyCreditsBase + BALANCE_CONFIG.enemyCreditsPerLevel * lv) *
      bossMult,
  };
}

/**
 * Rebalanced Battle Rewards:
 * - Full victory pool = sum(enemyReward) * rewardMult
 * - Victory = 100% of full victory pool
 * - Defeat / Retreat = 50% of rewards of enemies destroyed + 20% flat consolation of full victory
 */
export function calculateBattleRewards(
  units: CombatUnit[],
  won: boolean,
  rewardMult: number = BALANCE_CONFIG.rewardMultDefault
): {
  expGained: number;
  creditsGained: number;
  fullVictoryExp: number;
  fullVictoryCredits: number;
} {
  const enemies = units.filter((u) => u.side === 'enemy');

  let fullExpRaw = 0;
  let fullCreditsRaw = 0;
  let destroyedExpRaw = 0;
  let destroyedCreditsRaw = 0;

  for (const enemy of enemies) {
    const r = calculateSingleEnemyReward(enemy.level, Boolean(enemy.isBoss));
    fullExpRaw += r.exp;
    fullCreditsRaw += r.credits;
    if (!enemy.alive) {
      destroyedExpRaw += r.exp;
      destroyedCreditsRaw += r.credits;
    }
  }

  const fullVictoryExp = Math.round(fullExpRaw * rewardMult);
  const fullVictoryCredits = Math.round(fullCreditsRaw * rewardMult);

  if (won) {
    return {
      expGained: Math.round(fullVictoryExp * BALANCE_CONFIG.victoryRewardRatio),
      creditsGained: Math.round(
        fullVictoryCredits * BALANCE_CONFIG.victoryRewardRatio
      ),
      fullVictoryExp,
      fullVictoryCredits,
    };
  }

  const destroyedExp =
    destroyedExpRaw * rewardMult * BALANCE_CONFIG.defeatDestroyedRatio;
  const destroyedCredits =
    destroyedCreditsRaw * rewardMult * BALANCE_CONFIG.defeatDestroyedRatio;

  const consolationExp = fullVictoryExp * BALANCE_CONFIG.defeatConsolationRatio;
  const consolationCredits =
    fullVictoryCredits * BALANCE_CONFIG.defeatConsolationRatio;

  return {
    expGained: Math.round(destroyedExp + consolationExp),
    creditsGained: Math.round(destroyedCredits + consolationCredits),
    fullVictoryExp,
    fullVictoryCredits,
  };
}
