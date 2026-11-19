import { EMPTY_STAT_BLOCK, STAT_KEYS } from '../data/classes';
import {
  DROP_CONFIG,
  EMPTY_EQUIPPED_ITEMS,
  ENCHANT_CONFIG,
  EQUIPMENT_SLOTS,
  getItemDefinition,
  ITEMS_CATALOG,
  SHOP_CONFIG,
} from '../data/items';
import { getSectorById } from '../data/maps';
import type {
  CombatUnit,
  EnchantAttemptResult,
  EquipmentSlot,
  EquippedItems,
  EquipValidationResult,
  ItemDefinition,
  ItemInstance,
  ItemRarity,
  MechClassId,
  StatBlock,
} from '../types/game';

let itemUidSeq = 1;

export function createItemInstance(
  itemId: string,
  enchantLevel = 0
): ItemInstance {
  itemUidSeq += 1;
  return {
    instanceId: `itm_${Date.now().toString(36)}_${itemUidSeq}_${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    itemId,
    enchantLevel: Math.max(0, Math.min(ENCHANT_CONFIG.maxLevel, enchantLevel)),
  };
}

/**
 * Computes effective flat stat bonuses for an item instance,
 * applying +8% per enchant level (rounded cleanly).
 */
export function getEffectiveItemStats(
  itemId: string,
  enchantLevel: number
): StatBlock {
  const def = getItemDefinition(itemId);
  const result: StatBlock = { ...EMPTY_STAT_BLOCK };
  if (!def) return result;

  const multiplier = 1 + Math.max(0, enchantLevel) * ENCHANT_CONFIG.bonusPerLevel;

  for (const key of STAT_KEYS) {
    const base = def.statBonuses[key] ?? 0;
    if (base > 0) {
      result[key] = Math.round(base * multiplier);
    }
  }

  return result;
}

/**
 * Sums all effective flat stat bonuses across all 6 equipped slots.
 */
export function sumEquippedStatBonuses(
  equipped: EquippedItems | undefined | null
): StatBlock {
  const total: StatBlock = { ...EMPTY_STAT_BLOCK };
  if (!equipped) return total;

  for (const slot of EQUIPMENT_SLOTS) {
    const instance = equipped[slot];
    if (!instance) continue;
    const itemStats = getEffectiveItemStats(
      instance.itemId,
      instance.enchantLevel
    );
    for (const key of STAT_KEYS) {
      total[key] += itemStats[key];
    }
  }
  return total;
}

/**
 * Validates whether a pilot of given level and Gear class can equip a ship part.
 */
export function validateEquipRequirement(
  def: ItemDefinition,
  playerLevel: number,
  playerClassId: MechClassId
): EquipValidationResult {
  const missingLevel =
    playerLevel < def.requiredLevel ? def.requiredLevel : null;
  const requiredClass =
    def.classRestriction && def.classRestriction !== playerClassId
      ? def.classRestriction
      : null;

  return {
    canEquip: missingLevel === null && requiredClass === null,
    missingLevel,
    requiredClass,
  };
}

/**
 * Unequips any class-locked parts (Hull Plating / Thrusters) incompatible
 * with the newly selected Gear class and returns them safely to inventory.
 */
export function unequipIncompatibleForClass(
  equipped: EquippedItems,
  inventory: ItemInstance[],
  nextClassId: MechClassId
): {
  equipped: EquippedItems;
  inventory: ItemInstance[];
  unequippedItems: Array<{ itemId: string; enchantLevel: number }>;
} {
  const nextEquipped: EquippedItems = { ...EMPTY_EQUIPPED_ITEMS, ...equipped };
  const nextInventory = [...inventory];
  const unequippedItems: Array<{ itemId: string; enchantLevel: number }> = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const inst = nextEquipped[slot];
    if (!inst) continue;
    const def = getItemDefinition(inst.itemId);
    if (!def) continue;

    if (def.classRestriction && def.classRestriction !== nextClassId) {
      nextEquipped[slot] = null;
      nextInventory.push(inst);
      unequippedItems.push({
        itemId: inst.itemId,
        enchantLevel: inst.enchantLevel,
      });
    }
  }

  return {
    equipped: nextEquipped,
    inventory: nextInventory,
    unequippedItems,
  };
}

/**
 * Sell value is strictly 40% of base item price.
 */
export function getSellPrice(def: ItemDefinition): number {
  return Math.floor(def.price * SHOP_CONFIG.sellPriceRatio);
}

/**
 * Calculates enchant cost & success rate for an equipped ship part.
 */
export function getEnchantMetadata(instance: ItemInstance): {
  currentLevel: number;
  nextLevel: number;
  isMax: boolean;
  cost: number;
  successRate: number;
  currentStats: StatBlock;
  nextStats: StatBlock;
} {
  const def = getItemDefinition(instance.itemId);
  const currentLevel = Math.max(
    0,
    Math.min(ENCHANT_CONFIG.maxLevel, instance.enchantLevel)
  );
  const isMax = currentLevel >= ENCHANT_CONFIG.maxLevel;
  const nextLevel = isMax ? currentLevel : currentLevel + 1;

  const basePrice = def?.price ?? 150;
  const cost = isMax
    ? 0
    : Math.round(
        (ENCHANT_CONFIG.baseCostFloor +
          basePrice * ENCHANT_CONFIG.priceCostFactor) *
          (1 + currentLevel * ENCHANT_CONFIG.levelCostStep)
      );

  const successRate = isMax
    ? 0
    : ENCHANT_CONFIG.successRates[currentLevel] ?? 30;

  return {
    currentLevel,
    nextLevel,
    isMax,
    cost,
    successRate,
    currentStats: getEffectiveItemStats(instance.itemId, currentLevel),
    nextStats: getEffectiveItemStats(instance.itemId, nextLevel),
  };
}

/**
 * Executes an enchant roll (+0 to +10). On failure, part remains unchanged and Credits are lost.
 */
export function resolveEnchantAttempt(
  instance: ItemInstance,
  playerCredits: number
): {
  result: EnchantAttemptResult;
  updatedInstance: ItemInstance;
  remainingCredits: number;
} {
  const meta = getEnchantMetadata(instance);

  if (meta.isMax) {
    return {
      result: {
        attempted: false,
        success: false,
        code: 'max_level',
        itemId: instance.itemId,
        previousLevel: meta.currentLevel,
        newLevel: meta.currentLevel,
        creditsSpent: 0,
        successRate: 0,
      },
      updatedInstance: instance,
      remainingCredits: playerCredits,
    };
  }

  if (playerCredits < meta.cost) {
    return {
      result: {
        attempted: false,
        success: false,
        code: 'insufficient_credits',
        itemId: instance.itemId,
        previousLevel: meta.currentLevel,
        newLevel: meta.currentLevel,
        creditsSpent: meta.cost,
        successRate: meta.successRate,
      },
      updatedInstance: instance,
      remainingCredits: playerCredits,
    };
  }

  const roll = Math.random() * 100;
  const succeeded = roll < meta.successRate;
  const nextCredits = playerCredits - meta.cost;

  if (succeeded) {
    const upgraded: ItemInstance = {
      ...instance,
      enchantLevel: meta.nextLevel,
    };
    return {
      result: {
        attempted: true,
        success: true,
        code: 'success',
        itemId: instance.itemId,
        previousLevel: meta.currentLevel,
        newLevel: meta.nextLevel,
        creditsSpent: meta.cost,
        successRate: meta.successRate,
      },
      updatedInstance: upgraded,
      remainingCredits: nextCredits,
    };
  }

  return {
    result: {
      attempted: true,
      success: false,
      code: 'failed',
      itemId: instance.itemId,
      previousLevel: meta.currentLevel,
      newLevel: meta.currentLevel,
      creditsSpent: meta.cost,
      successRate: meta.successRate,
    },
    updatedInstance: instance,
    remainingCredits: nextCredits,
  };
}

function pickWeightedRarity(weights: Record<ItemRarity, number>): ItemRarity {
  const total = weights.common + weights.rare + weights.epic;
  let roll = Math.random() * total;
  if (roll < weights.common) return 'common';
  roll -= weights.common;
  if (roll < weights.rare) return 'rare';
  return 'epic';
}

/**
 * Rolls enemy ship part drops weighted by rarity and sector difficulty.
 */
export function rollBattleItemDrops(
  enemies: CombatUnit[],
  sectorId: string,
  playerLevel: number,
  won: boolean
): ItemInstance[] {
  const sector = getSectorById(sectorId);
  const cfg = DROP_CONFIG[sector.difficulty];
  const destroyedEnemies = enemies.filter((e) => !e.alive);
  if (destroyedEnemies.length === 0) return [];

  const drops: ItemInstance[] = [];
  const maxReqLevel = Math.max(1, playerLevel + cfg.maxLevelDelta);

  for (let i = 0; i < destroyedEnemies.length; i++) {
    if (drops.length >= cfg.maxDropsPerBattle) break;
    const effectiveChance = won
      ? cfg.perEnemyDropChance
      : cfg.perEnemyDropChance * 0.45;
    if (Math.random() > effectiveChance) continue;

    const rarity = pickWeightedRarity(cfg.rarityWeights);
    let pool = ITEMS_CATALOG.filter(
      (item) => item.rarity === rarity && item.requiredLevel <= maxReqLevel
    );
    if (pool.length === 0) {
      pool = ITEMS_CATALOG.filter((item) => item.rarity === rarity);
    }
    if (pool.length === 0) {
      pool = ITEMS_CATALOG;
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];
    drops.push(createItemInstance(picked.id, 0));
  }

  if (won && drops.length === 0) {
    const pityChance =
      sector.difficulty === 'Elite'
        ? 0.9
        : sector.difficulty === 'Hard'
        ? 0.7
        : 0.45;
    if (Math.random() < pityChance) {
      const rarity = pickWeightedRarity(cfg.rarityWeights);
      let pool = ITEMS_CATALOG.filter(
        (item) => item.rarity === rarity && item.requiredLevel <= maxReqLevel
      );
      if (pool.length === 0) pool = ITEMS_CATALOG;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      drops.push(createItemInstance(picked.id, 0));
    }
  }

  return drops;
}

/**
 * Builds a simulated EquippedItems snapshot for live previewing equip/unequip changes.
 */
export function simulateEquippedChange(
  currentEquipped: EquippedItems,
  change:
    | { type: 'equip'; instance: ItemInstance }
    | { type: 'unequip'; slot: EquipmentSlot }
): EquippedItems {
  const next: EquippedItems = { ...EMPTY_EQUIPPED_ITEMS, ...currentEquipped };
  if (change.type === 'unequip') {
    next[change.slot] = null;
    return next;
  }
  const def = getItemDefinition(change.instance.itemId);
  if (!def) return next;
  next[def.slot] = change.instance;
  return next;
}
