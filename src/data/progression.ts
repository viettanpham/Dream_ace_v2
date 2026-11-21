import { BALANCE_CONFIG, COMBAT_FORMULAS } from './balance';

export { BALANCE_CONFIG, COMBAT_FORMULAS };

/**
 * Compatibility facade forwarding progression constants from the single centralized balance.ts config.
 */
export const PROGRESSION_CONFIG = {
  startingLevel: BALANCE_CONFIG.startingLevel,
  maxLevel: BALANCE_CONFIG.maxLevel,
  initialStatPoints: BALANCE_CONFIG.initialStatPoints,
  statPointsPerLevel: BALANCE_CONFIG.statPointsPerLevel,
  startingCredits: BALANCE_CONFIG.startingCredits,
  expBase: BALANCE_CONFIG.expBase,
  expExponent: BALANCE_CONFIG.expExponent,
  rewardMultDefault: BALANCE_CONFIG.rewardMultDefault,
} as const;
