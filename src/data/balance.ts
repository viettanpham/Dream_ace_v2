import type { BattleSpeed, ItemRarity, SectorDifficulty } from '../types/game';

/**
 * Single centralized balance & economy configuration file for DREAM ACE.
 * All leveling, reward, shop, enchant, garage, and skill upgrade constants live here.
 */
export const BALANCE_CONFIG = {
  // ---- Per-Gear Progression ----
  startingLevel: 1,
  maxLevel: 50,
  initialStatPoints: 3,
  statPointsPerLevel: 3,
  startingCredits: 350,

  // EXP to next level = Math.round(expBase * level ^ expExponent)
  // 60 * level^1.4 -> Lv1->2: 60, Lv2->3: 158, Lv3->4: 279, Lv4->5: 418 (total 915 EXP; ~4-8 battles)
  expBase: 60,
  expExponent: 1.4,

  // ---- Battle Rewards Rebalance ----
  // EXP per enemy = 25 + 8 * enemyLevel
  // Credits per enemy = 60 + 20 * enemyLevel
  rewardMultDefault: 2.0,
  enemyExpBase: 25,
  enemyExpPerLevel: 8,
  enemyCreditsBase: 60,
  enemyCreditsPerLevel: 20,
  bossRewardMultiplier: 5,

  // Victory = 100%; Defeat/Retreat = 50% of destroyed enemies + 20% flat consolation of full victory
  victoryRewardRatio: 1.0,
  defeatDestroyedRatio: 0.5,
  defeatConsolationRatio: 0.2,

  // ---- Garage Unlock Prices (by number of Gears currently owned: 1 -> 2nd Gear, etc.) ----
  garageUnlockPrices: [0, 800, 2000, 4500] as readonly number[],

  // ---- Shop Economy ----
  shopStockSize: 12,
  shopRefreshCost: 120,
  shopSellRatio: 0.4,

  // ---- Enchant (+0 to +10) ----
  enchantMaxLevel: 10,
  enchantBonusPerLevel: 0.08, // +8% rolled stats per level
  enchantSuccessRates: [100, 92, 84, 75, 66, 58, 50, 42, 36, 30] as readonly number[],
  enchantBaseCostFloor: 40,
  enchantPriceCostFactor: 0.14,
  enchantLevelCostStep: 0.45,

  // ---- Skill Levels (1 to 5) ----
  skillMaxLevel: 5,
  // Cost to upgrade FROM level -> level+1 (index 0 = Lv1->2, index 3 = Lv4->5)
  skillUpgradeCosts: [250, 550, 1100, 2200] as readonly number[],

  // ---- Randomized Item Rarity Config ----
  rarityAffixCount: {
    common: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
  } as Record<ItemRarity, number>,

  rarityStatMultiplier: {
    common: 1.0,
    rare: 1.16,
    epic: 1.34,
    legendary: 1.56,
  } as Record<ItemRarity, number>,

  rarityPriceMultiplier: {
    common: 1.0,
    rare: 1.65,
    epic: 2.75,
    legendary: 4.6,
  } as Record<ItemRarity, number>,

  tierStatScale: [1.0, 1.45, 2.05, 2.8] as readonly number[],
  tierPriceScale: [1.0, 1.85, 3.2, 5.4] as readonly number[],

  // ---- Drop Rates per Sector Difficulty ----
  dropConfig: {
    Standard: {
      perEnemyDropChance: 0.28,
      maxDropsPerBattle: 2,
      rarityWeights: { common: 64, rare: 26, epic: 8, legendary: 2 },
      maxTier: 2,
    },
    Hard: {
      perEnemyDropChance: 0.36,
      maxDropsPerBattle: 3,
      rarityWeights: { common: 40, rare: 38, epic: 17, legendary: 5 },
      maxTier: 3,
    },
    Elite: {
      perEnemyDropChance: 0.45,
      maxDropsPerBattle: 3,
      rarityWeights: { common: 18, rare: 38, epic: 31, legendary: 13 },
      maxTier: 4,
    },
  } as Record<
    SectorDifficulty,
    {
      perEnemyDropChance: number;
      maxDropsPerBattle: number;
      rarityWeights: Record<ItemRarity, number>;
      maxTier: number;
    }
  >,

  // ---- Status Effects ----
  burnDamageRatio: 0.08, // 8% of Max HP per turn
  slowSpeedPenalty: 0.3, // -30% Turn Speed
  shieldBreakDuration: 2,

  // ---- Battle Speed Delays (ms) ----
  battleSpeedDelays: {
    1: 760,
    2: 400,
    3: 240,
    5: 120,
    10: 40,
  } as Record<BattleSpeed, number>,
} as const;

export const COMBAT_FORMULAS = {
  hpPerDefense: 8,
  hpPerLevel: 22,
  shieldPerShieldStat: 6,
  shieldPerLevel: 8,
  spPerSpirit: 2,
  spPerLevel: 2,
  speedFuelWeight: 0.85,
  speedEvasionWeight: 0.55,
  dodgePerEvasion: 0.75,
  maxDodgeChance: 42,
  baseCritChance: 8,
  critPerEvasion: 0.4,
  maxCritChance: 65,
  critDamageMultiplier: 1.5,
  defenseMitigationDivisor: 65,
  defendDamageMultiplier: 0.5,
  attackSpGain: 5,
  defendSpGain: 12,
  defendShieldRestoreRatio: 0.16,
  damageVarianceMin: 0.92,
  damageVarianceMax: 1.08,
} as const;

export function getGarageUnlockCost(ownedCount: number): number {
  const idx = Math.max(
    0,
    Math.min(BALANCE_CONFIG.garageUnlockPrices.length - 1, ownedCount)
  );
  return BALANCE_CONFIG.garageUnlockPrices[idx];
}

export function getSkillUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= BALANCE_CONFIG.skillMaxLevel) return null;
  const idx = Math.max(0, currentLevel - 1);
  return BALANCE_CONFIG.skillUpgradeCosts[idx] ?? null;
}
