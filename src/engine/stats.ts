import { EMPTY_STAT_BLOCK, MECH_CLASSES, STAT_KEYS } from '../data/classes';
import { COMBAT_FORMULAS, PROGRESSION_CONFIG } from '../data/progression';
import type {
  DerivedStats,
  MechClassId,
  PlayerCharacter,
  StatBlock,
} from '../types/game';

/**
 * Computes effective 6-stat block from a mech class definition, level,
 * committed allocated points, optional pending preview allocations,
 * and optional flat equipment bonuses.
 */
export function calculateEffectiveStats(
  classId: MechClassId,
  level: number,
  allocatedPoints: StatBlock,
  pendingPoints: StatBlock = EMPTY_STAT_BLOCK,
  equipmentBonuses: StatBlock = EMPTY_STAT_BLOCK
): StatBlock {
  const cls = MECH_CLASSES[classId];
  const levelBonus = Math.max(0, level - 1);

  const result = { ...EMPTY_STAT_BLOCK };
  for (const key of STAT_KEYS) {
    const totalPts = (allocatedPoints[key] || 0) + (pendingPoints[key] || 0);
    // Natural small chassis scaling per level + class-specific per-point gain
    const naturalGrowth = Math.floor(levelBonus * (cls.perPointGain[key] * 0.35));
    const equipBonus = equipmentBonuses[key] || 0;
    result[key] =
      cls.baseStats[key] +
      naturalGrowth +
      totalPts * cls.perPointGain[key] +
      equipBonus;
  }
  return result;
}

/**
 * Derives combat metrics (HP, Shield, SP, Turn Speed, Dodge, Crit, Skill Power)
 * from the 6 effective stats and level.
 */
export function calculateDerivedStats(
  classId: MechClassId,
  level: number,
  stats: StatBlock
): DerivedStats {
  const cls = MECH_CLASSES[classId];
  const lvl = Math.max(1, level);

  const maxHp = Math.round(
    cls.baseHp +
      stats.defense * COMBAT_FORMULAS.hpPerDefense +
      (lvl - 1) * COMBAT_FORMULAS.hpPerLevel
  );

  const maxShield = Math.round(
    cls.baseShield +
      stats.shield * COMBAT_FORMULAS.shieldPerShieldStat +
      (lvl - 1) * COMBAT_FORMULAS.shieldPerLevel
  );

  const maxSp = Math.round(
    cls.baseSp +
      stats.spirit * COMBAT_FORMULAS.spPerSpirit +
      (lvl - 1) * COMBAT_FORMULAS.spPerLevel
  );

  const speed = Math.round(
    cls.baseSpeed +
      stats.fuel * COMBAT_FORMULAS.speedFuelWeight +
      stats.evasion * COMBAT_FORMULAS.speedEvasionWeight
  );

  const dodgeChance = Math.min(
    COMBAT_FORMULAS.maxDodgeChance,
    Math.round(stats.evasion * COMBAT_FORMULAS.dodgePerEvasion)
  );

  const critChance = Math.min(
    COMBAT_FORMULAS.maxCritChance,
    Math.round(
      COMBAT_FORMULAS.baseCritChance +
        stats.evasion * COMBAT_FORMULAS.critPerEvasion
    )
  );

  const skillPower = Math.round(stats.attack * 0.7 + stats.spirit * 0.85);

  return {
    maxHp,
    maxShield,
    maxSp,
    speed,
    attackPower: stats.attack,
    defenseRating: stats.defense,
    dodgeChance,
    critChance,
    skillPower,
  };
}

export function getExpForNextLevel(level: number): number {
  const lvl = Math.max(1, level);
  return (
    PROGRESSION_CONFIG.baseExpToLevel +
    (lvl - 1) * PROGRESSION_CONFIG.expGrowthLinear +
    (lvl - 1) * (lvl - 1) * PROGRESSION_CONFIG.expGrowthQuadratic
  );
}

export function getTotalSpentPoints(allocatedPoints: StatBlock): number {
  return STAT_KEYS.reduce((sum, key) => sum + (allocatedPoints[key] || 0), 0);
}

export function getTotalAvailablePointsForLevel(level: number): number {
  return (
    PROGRESSION_CONFIG.initialStatPoints +
    Math.max(0, level - 1) * PROGRESSION_CONFIG.statPointsPerLevel
  );
}

export interface LevelUpResult {
  updatedPlayer: PlayerCharacter;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  statPointsGained: number;
}

export function applyRewardsToPlayer(
  player: PlayerCharacter,
  expGained: number,
  creditsGained: number,
  won: boolean
): LevelUpResult {
  let level = player.level;
  let exp = player.exp + expGained;
  let unspentPoints = player.unspentPoints;
  let statPointsGained = 0;

  while (level < PROGRESSION_CONFIG.maxLevel) {
    const needed = getExpForNextLevel(level);
    if (exp >= needed) {
      exp -= needed;
      level += 1;
      unspentPoints += PROGRESSION_CONFIG.statPointsPerLevel;
      statPointsGained += PROGRESSION_CONFIG.statPointsPerLevel;
    } else {
      break;
    }
  }

  const updatedPlayer: PlayerCharacter = {
    ...player,
    level,
    exp,
    credits: player.credits + creditsGained,
    unspentPoints,
    battlesFought: player.battlesFought + 1,
    battlesWon: player.battlesWon + (won ? 1 : 0),
  };

  return {
    updatedPlayer,
    leveledUp: level > player.level,
    previousLevel: player.level,
    newLevel: level,
    statPointsGained,
  };
}

/**
 * Generates an NPC stat allocation block weighted toward that class's strongest per-point gains.
 */
export function generateNpcAllocations(
  classId: MechClassId,
  level: number
): StatBlock {
  const cls = MECH_CLASSES[classId];
  const totalPoints = getTotalAvailablePointsForLevel(level);
  const block: StatBlock = { ...EMPTY_STAT_BLOCK };

  // Build weighted pool based on class per-point gains
  const weightedKeys: Array<keyof StatBlock> = [];
  for (const key of STAT_KEYS) {
    const weight = Math.max(1, cls.perPointGain[key]);
    for (let i = 0; i < weight; i++) {
      weightedKeys.push(key);
    }
  }

  for (let i = 0; i < totalPoints; i++) {
    const pick = weightedKeys[Math.floor(Math.random() * weightedKeys.length)];
    block[pick] += 1;
  }

  return block;
}
