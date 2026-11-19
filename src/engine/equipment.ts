import { EMPTY_STAT_BLOCK, MECH_CLASSES, STAT_KEYS } from '../data/classes';
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
 * Validates whether a player of given level and class can equip an item.
 */
export function validateEquipRequirement(
  def: ItemDefinition,
  playerLevel: number,
  playerClassId: MechClassId
): EquipValidationResult {
  const reasons: string[] = [];

  if (playerLevel < def.requiredLevel) {
    reasons.push(`Requires Lv.${def.requiredLevel}`);
  }
  if (def.classRestriction && def.classRestriction !== playerClassId) {
    reasons.push(`${MECH_CLASSES[def.classRestriction].name} class only`);
  }

  if (reasons.length > 0) {
    return { canEquip: false, reason: reasons.join(' · ') };
  }
  return { canEquip: true, reason: null };
}

/**
 * Unequips any class-locked items that do not match the newly selected class
 * and returns them safely to the inventory.
 */
export function unequipIncompatibleForClass(
  equipped: EquippedItems,
  inventory: ItemInstance[],
  nextClassId: MechClassId
): {
  equipped: EquippedItems;
  inventory: ItemInstance[];
  unequippedNames: string[];
} {
  const nextEquipped: EquippedItems = { ...EMPTY_EQUIPPED_ITEMS, ...equipped };
  const nextInventory = [...inventory];
  const unequippedNames: string[] = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const inst = nextEquipped[slot];
    if (!inst) continue;
    const def = getItemDefinition(inst.itemId);
    if (!def) continue;

    if (def.classRestriction && def.classRestriction !== nextClassId) {
      nextEquipped[slot] = null;
      nextInventory.push(inst);
      unequippedNames.push(
        inst.enchantLevel > 0 ? `${def.name} +${inst.enchantLevel}` : def.name
      );
    }
  }

  return {
    equipped: nextEquipped,
    inventory: nextInventory,
    unequippedNames,
  };
}

/**
 * Sell value is strictly 40% of base item price.
 */
export function getSellPrice(def: ItemDefinition): number {
  return Math.floor(def.price * SHOP_CONFIG.sellPriceRatio);
}

/**
 * Calculates enchant cost & success rate for an equipped item instance.
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
 * Executes an enchant roll (+0 to +10). On failure, item remains unchanged and Credits are lost.
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
  const def = getItemDefinition(instance.itemId);
  const itemName = def?.name ?? 'Equipment';

  if (meta.isMax) {
    return {
      result: {
        attempted: false,
        success: false,
        previousLevel: meta.currentLevel,
        newLevel: meta.currentLevel,
        creditsSpent: 0,
        message: `${itemName} is already at maximum enchant (+${ENCHANT_CONFIG.maxLevel}).`,
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
        previousLevel: meta.currentLevel,
        newLevel: meta.currentLevel,
        creditsSpent: 0,
        message: `Insufficient Credits (need ${meta.cost.toLocaleString()} CR).`,
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
        previousLevel: meta.currentLevel,
        newLevel: meta.nextLevel,
        creditsSpent: meta.cost,
        message: `Enchant succeeded! ${itemName} upgraded to +${meta.nextLevel} (+${Math.round(
          meta.nextLevel * ENCHANT_CONFIG.bonusPerLevel * 100
        )}% bonus).`,
      },
      updatedInstance: upgraded,
      remainingCredits: nextCredits,
    };
  }

  return {
    result: {
      attempted: true,
      success: false,
      previousLevel: meta.currentLevel,
      newLevel: meta.currentLevel,
      creditsSpent: meta.cost,
      message: `Enchant failed (${meta.successRate}% chance). ${itemName} remains +${meta.currentLevel}; ${meta.cost.toLocaleString()} CR spent.`,
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
 * Rolls enemy item drops weighted by rarity and sector difficulty.
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

  // On Victory, guarantee at least 1 drop in Hard/Elite or 50% boost if nothing dropped yet
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
