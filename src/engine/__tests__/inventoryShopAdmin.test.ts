import { beforeEach, describe, expect, it } from 'vitest';
import { BALANCE_CONFIG } from '../../data/balance';
import { EQUIPMENT_SLOTS } from '../../data/items';
import { SHOP_STOCK_CONFIG } from '../../data/shopConfig';
import { useGameStore } from '../../store/useGameStore';
import type { ItemInstance } from '../../types/game';
import { createInitialBattleState } from '../combat';
import { generateItemInstance, getSellPrice } from '../equipment';
import {
  calculateItemPowerScore,
  filterAndSortInventory,
  getDefaultInventoryFilterState,
  isAnyCheatActive,
  isItemUpgradeForGear,
  isItemUsableByGear,
} from '../inventory';
import { createDefaultAdminConfig } from '../migration';
import {
  buildQuickSellPreset,
  DEFAULT_QUICK_SELL_CONFIG,
  evaluateQuickSellCandidates,
} from '../quickSell';
import {
  generateCategorizedShopStock,
  generateWpMarketOffers,
  rollWeightedStockCount,
} from '../shop';
import {
  createDefaultPilotAccount,
  getTotalAvailablePointsForLevel,
} from '../stats';

function createDeterministicRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeItem(
  overrides: Partial<ItemInstance> & { instanceId: string }
): ItemInstance {
  const base = generateItemInstance(
    {
      templateId: overrides.templateId ?? 'tpl_mw_pulse_cannon',
      slot: overrides.slot ?? 'main_weapon',
      tier: overrides.tier ?? 1,
      rarity: overrides.rarity ?? 'common',
      requiredLevel: overrides.requiredLevel ?? 1,
      rollQuality: overrides.rollQuality ?? 50,
      obtainedAt: overrides.obtainedAt,
      isNew: overrides.isNew,
    },
    () => 0.5
  );
  return {
    ...base,
    ...overrides,
  };
}

describe('Inventory Engine (filter, sort, usability, upgrade, cheats)', () => {
  it('filters by search resolver, slot, rarity, tier, level, quality, usability, upgrade, locked, and new flags', () => {
    const pilot = createDefaultPilotAccount('Tester', 'striker');
    pilot.gears.striker.level = 5;
    pilot.gears.interceptor.owned = true;
    pilot.gears.interceptor.level = 10;

    const equippedWeapon = makeItem({
      instanceId: 'eq_mw',
      slot: 'main_weapon',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 30,
      obtainedAt: 100,
    });
    pilot.gears.striker.equipped.main_weapon = equippedWeapon.instanceId;

    const upgradeWeapon = makeItem({
      instanceId: 'up_mw',
      slot: 'main_weapon',
      rarity: 'epic',
      tier: 3,
      requiredLevel: 4,
      rollQuality: 90,
      locked: true,
      isNew: true,
      obtainedAt: 200,
    });

    const highLevelInterceptorArmor = makeItem({
      instanceId: 'int_arm',
      templateId: 'tpl_armor_inter_reflex',
      slot: 'armor',
      classRestriction: 'interceptor',
      rarity: 'rare',
      tier: 2,
      requiredLevel: 8,
      rollQuality: 75,
      obtainedAt: 300,
    });

    const inventory = [equippedWeapon, upgradeWeapon, highLevelInterceptorArmor];
    const nameMap: Record<string, string> = {
      eq_mw: 'Starter Cannon',
      up_mw: 'Apex Plasma Cannon',
      int_arm: 'Reflex Cloak',
    };
    const resolver = (it: ItemInstance) => nameMap[it.instanceId] ?? it.templateId;

    // Usable & upgrade checks
    expect(isItemUsableByGear(upgradeWeapon, pilot.gears.striker)).toBe(true);
    expect(
      isItemUsableByGear(highLevelInterceptorArmor, pilot.gears.striker)
    ).toBe(false);
    expect(
      isItemUsableByGear(highLevelInterceptorArmor, pilot.gears.interceptor)
    ).toBe(true);
    expect(
      isItemUpgradeForGear(upgradeWeapon, pilot.gears.striker, inventory)
    ).toBe(true);
    expect(
      isItemUpgradeForGear(equippedWeapon, pilot.gears.striker, inventory)
    ).toBe(false);

    // Search + onlyUpgrades + lockedOnly + newOnly
    const res = filterAndSortInventory(
      inventory,
      {
        ...getDefaultInventoryFilterState(),
        search: 'apex',
        rarities: ['epic'],
        tiers: [3],
        minLevel: 2,
        maxLevel: 6,
        minQuality: 80,
        maxQuality: 100,
        usability: 'selected_gear',
        onlyUpgrades: true,
        lockedOnly: true,
        newOnly: true,
      },
      pilot.gears.striker,
      pilot.gears,
      resolver
    );
    expect(res.map((e) => e.item.instanceId)).toEqual(['up_mw']);
    expect(res[0].isUpgrade).toBe(true);
    expect(res[0].usableBySelected).toBe(true);

    // Usability = any_gear should include highLevelInterceptorArmor
    const anyGearRes = filterAndSortInventory(
      inventory,
      {
        ...getDefaultInventoryFilterState(),
        usability: 'any_gear',
        slot: 'armor',
      },
      pilot.gears.striker,
      pilot.gears,
      resolver
    );
    expect(anyGearRes.map((e) => e.item.instanceId)).toEqual(['int_arm']);
    expect(anyGearRes[0].usableBySelected).toBe(false);
  });

  it('sorts Newest accurately for distinct obtainedAt AND tied obtainedAt (prepended order), plus pinEquippedFirst', () => {
    const pilot = createDefaultPilotAccount('Sorter', 'striker');
    pilot.gears.interceptor.owned = true;

    // Store prepends newer items at index 0
    const newestSameTs = makeItem({
      instanceId: 'item_newest_same_ts',
      obtainedAt: 1000,
    });
    const olderSameTs = makeItem({
      instanceId: 'item_older_same_ts',
      obtainedAt: 1000,
    });
    const oldestDiffTs = makeItem({
      instanceId: 'item_oldest_diff_ts',
      obtainedAt: 500,
    });
    const latestDiffTs = makeItem({
      instanceId: 'item_latest_diff_ts',
      obtainedAt: 2000,
    });
    const equippedSelected = makeItem({
      instanceId: 'item_eq_selected',
      obtainedAt: 100,
    });
    const equippedOther = makeItem({
      instanceId: 'item_eq_other',
      slot: 'sub_weapon',
      templateId: 'tpl_sw_micro_missiles',
      obtainedAt: 150,
    });

    pilot.gears.striker.equipped.main_weapon = equippedSelected.instanceId;
    pilot.gears.interceptor.equipped.sub_weapon = equippedOther.instanceId;

    // Prepended order among tied obtainedAt: newestSameTs comes before olderSameTs
    const inv = [
      newestSameTs,
      olderSameTs,
      latestDiffTs,
      oldestDiffTs,
      equippedOther,
      equippedSelected,
    ];

    const descNoPin = filterAndSortInventory(
      inv,
      {
        ...getDefaultInventoryFilterState(),
        sortBy: 'newest',
        sortDir: 'desc',
        pinEquippedFirst: false,
      },
      pilot.gears.striker,
      pilot.gears
    );
    expect(descNoPin.map((e) => e.item.instanceId)).toEqual([
      'item_latest_diff_ts',
      'item_newest_same_ts',
      'item_older_same_ts',
      'item_oldest_diff_ts',
      'item_eq_other',
      'item_eq_selected',
    ]);

    const ascNoPin = filterAndSortInventory(
      inv,
      {
        ...getDefaultInventoryFilterState(),
        sortBy: 'newest',
        sortDir: 'asc',
        pinEquippedFirst: false,
      },
      pilot.gears.striker,
      pilot.gears
    );
    expect(ascNoPin.map((e) => e.item.instanceId)).toEqual([
      'item_eq_selected',
      'item_eq_other',
      'item_oldest_diff_ts',
      'item_older_same_ts',
      'item_newest_same_ts',
      'item_latest_diff_ts',
    ]);

    // With pinEquippedFirst: equipped on selected -> equipped on other -> unequipped
    const descPinned = filterAndSortInventory(
      inv,
      {
        ...getDefaultInventoryFilterState(),
        sortBy: 'newest',
        sortDir: 'desc',
        pinEquippedFirst: true,
      },
      pilot.gears.striker,
      pilot.gears
    );
    expect(descPinned[0].item.instanceId).toBe('item_eq_selected');
    expect(descPinned[1].item.instanceId).toBe('item_eq_other');
    expect(descPinned[2].item.instanceId).toBe('item_latest_diff_ts');
  });

  it('detects active cheats in AdminConfig including formationBackCapacity', () => {
    const clean = createDefaultAdminConfig();
    expect(isAnyCheatActive(clean)).toBe(false);
    expect(isAnyCheatActive({ ...clean, formationBackCapacity: 2 })).toBe(true);
    expect(isAnyCheatActive({ ...clean, godMode: true })).toBe(true);
  });
});

describe('Quick Sell Engine & Store Undo Reducer', () => {
  beforeEach(() => {
    useGameStore.getState().resetCampaign();
  });

  it('combines filters with strict AND logic and always excludes equipped, locked, and favorited items', () => {
    const pilot = createDefaultPilotAccount('Seller', 'striker');
    pilot.gears.striker.level = 6;
    pilot.gears.interceptor.owned = true;
    pilot.gears.interceptor.level = 6;

    const eq = makeItem({
      instanceId: 'qs_eq',
      rarity: 'rare',
      tier: 2,
      requiredLevel: 5,
      rollQuality: 70,
    });
    const lockedCommon = makeItem({
      instanceId: 'qs_locked',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 20,
      locked: true,
    });
    const favCommon = makeItem({
      instanceId: 'qs_fav',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 20,
      favorited: true,
    });
    const matchCommon = makeItem({
      instanceId: 'qs_match',
      rarity: 'common',
      tier: 1,
      requiredLevel: 2,
      rollQuality: 30,
    });
    const failQualityCommon = makeItem({
      instanceId: 'qs_high_q',
      rarity: 'common',
      tier: 1,
      requiredLevel: 2,
      rollQuality: 95,
    });
    const higherReqLevelCommon = makeItem({
      instanceId: 'qs_high_lv',
      rarity: 'common',
      tier: 1,
      requiredLevel: 6,
      rollQuality: 30,
    });

    pilot.gears.striker.equipped.main_weapon = eq.instanceId;
    const inv = [
      eq,
      lockedCommon,
      favCommon,
      matchCommon,
      failQualityCommon,
      higherReqLevelCommon,
    ];

    // No filter enabled -> returns empty safely
    const noFilter = evaluateQuickSellCandidates(
      inv,
      { ...DEFAULT_QUICK_SELL_CONFIG, maxRarity: null },
      pilot.gears.striker,
      pilot.gears
    );
    expect(noFilter.hasAnyFilterEnabled).toBe(false);
    expect(noFilter.matchingItems).toHaveLength(0);

    // AND filter: common + belowEquippedLevel + maxRollQuality <= 50 + worseThanEquipped
    const res = evaluateQuickSellCandidates(
      inv,
      {
        maxRarity: 'common',
        maxTier: 1,
        maxRequiredLevel: 4,
        belowEquippedLevel: true,
        maxSellValue: 9999,
        maxRollQuality: 50,
        worseThanEquipped: true,
        worseThanEquippedScope: 'selected',
      },
      pilot.gears.striker,
      pilot.gears
    );

    expect(res.excludedStats).toEqual({
      equipped: 1,
      locked: 1,
      favorited: 1,
    });
    expect(res.matchingItems.map((i) => i.instanceId)).toEqual(['qs_match']);
    expect(res.totalCredits).toBe(getSellPrice(matchCommon));

    // Presets
    const belowLvPreset = buildQuickSellPreset('sell_below_level', 10);
    expect(belowLvPreset.maxRequiredLevel).toBe(9);
    const worsePreset = buildQuickSellPreset('sell_worse_than_equipped', 10);
    expect(worsePreset.worseThanEquipped).toBe(true);
  });

  it('supports worseThanEquippedScope="any_owned" and executes + undoes Quick Sell via store reducers', () => {
    const store = useGameStore.getState();
    store.startCampaign('Alpha', 'striker');
    const st1 = useGameStore.getState();
    const startCredits = st1.pilot.credits;

    const eq = makeItem({
      instanceId: 'qs_store_eq',
      rarity: 'epic',
      tier: 3,
      requiredLevel: 1,
      rollQuality: 90,
    });
    const junk1 = makeItem({
      instanceId: 'qs_store_junk1',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 10,
    });
    const locked1 = makeItem({
      instanceId: 'qs_store_locked1',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 10,
      locked: true,
    });
    const fav1 = makeItem({
      instanceId: 'qs_store_fav1',
      rarity: 'common',
      tier: 1,
      requiredLevel: 1,
      rollQuality: 10,
      favorited: true,
    });

    useGameStore.setState((s) => ({
      pilot: {
        ...s.pilot,
        inventory: [junk1, locked1, fav1, eq],
        gears: {
          ...s.pilot.gears,
          striker: {
            ...s.pilot.gears.striker,
            equipped: {
              ...s.pilot.gears.striker.equipped,
              main_weapon: eq.instanceId,
            },
          },
        },
      },
    }));

    const check = evaluateQuickSellCandidates(
      useGameStore.getState().pilot.inventory,
      {
        ...DEFAULT_QUICK_SELL_CONFIG,
        maxRarity: null,
        worseThanEquipped: true,
        worseThanEquippedScope: 'any_owned',
      },
      useGameStore.getState().pilot.gears.striker,
      useGameStore.getState().pilot.gears
    );
    expect(calculateItemPowerScore(junk1)).toBeLessThan(
      calculateItemPowerScore(eq)
    );
    expect(check.matchingItems.map((i) => i.instanceId)).toEqual(['qs_store_junk1']);

    // Even if all IDs are passed, executeQuickSell enforces protected exclusions
    const soldRes = useGameStore
      .getState()
      .executeQuickSell(['qs_store_junk1', 'qs_store_locked1', 'qs_store_fav1', 'qs_store_eq']);
    expect(soldRes.soldCount).toBe(1);
    expect(soldRes.creditsEarned).toBe(getSellPrice(junk1));

    const afterSell = useGameStore.getState();
    expect(afterSell.pilot.credits).toBe(startCredits + soldRes.creditsEarned);
    expect(afterSell.pilot.inventory.map((i) => i.instanceId)).not.toContain(
      'qs_store_junk1'
    );
    expect(afterSell.pilot.inventory).toHaveLength(3);
    expect(afterSell.quickSellUndo?.soldItems).toHaveLength(1);

    // Undo restores item and deducts earned Credits
    const undoRes = useGameStore.getState().undoQuickSell();
    expect(undoRes).toEqual({ ok: true, restoredCount: 1 });
    const afterUndo = useGameStore.getState();
    expect(afterUndo.pilot.credits).toBe(startCredits);
    expect(afterUndo.pilot.inventory.map((i) => i.instanceId)).toContain(
      'qs_store_junk1'
    );
    expect(afterUndo.quickSellUndo).toBeNull();
  });
});

describe('Shop Engine & Store Restock Triggers', () => {
  beforeEach(() => {
    useGameStore.getState().resetCampaign();
  });

  it('bounds rollWeightedStockCount to [3, 10] and skews distribution toward lower counts', () => {
    const rng = createDeterministicRng(777);
    let lowCount = 0;
    let highCount = 0;
    for (let i = 0; i < 400; i++) {
      const c = rollWeightedStockCount(
        SHOP_STOCK_CONFIG.minStockPerCategory,
        SHOP_STOCK_CONFIG.maxStockPerCategory,
        SHOP_STOCK_CONFIG.stockCountWeights,
        0,
        rng
      );
      expect(c).toBeGreaterThanOrEqual(3);
      expect(c).toBeLessThanOrEqual(10);
      if (c <= 5) lowCount += 1;
      else highCount += 1;
    }
    expect(lowCount).toBeGreaterThan(highCount);
  });

  it('generates 3..10 items per slot category and 3..10 rotating WP offers, never empty', () => {
    const rng = createDeterministicRng(12345);
    const stock = generateCategorizedShopStock(5, { priceMultiplier: 1.5 }, rng);
    expect(stock.length).toBeGreaterThanOrEqual(EQUIPMENT_SLOTS.length * 3);
    for (const slot of EQUIPMENT_SLOTS) {
      const slotItems = stock.filter((s) => s.slot === slot);
      expect(slotItems.length).toBeGreaterThanOrEqual(3);
      expect(slotItems.length).toBeLessThanOrEqual(10);
      expect(slotItems.every((s) => !s.soldOut)).toBe(true);
    }

    const wpOffers = generateWpMarketOffers({}, rng);
    expect(wpOffers.length).toBeGreaterThanOrEqual(3);
    expect(wpOffers.length).toBeLessThanOrEqual(10);
    expect(wpOffers.some((o) => o.kind === 'equipment_crate')).toBe(true);
    expect(wpOffers.some((o) => o.kind === 'enchant_stone')).toBe(true);
  });

  it('marks bought shop items as soldOut instead of removing, and restocks on refresh, month advance, and battle completion', () => {
    useGameStore.getState().startCampaign('Merchant', 'striker');
    useGameStore.getState().adminSetCredits(50000);

    const initialStock = useGameStore.getState().shopStock;
    expect(initialStock.length).toBeGreaterThan(0);
    const target = initialStock[0];

    // Buy marks soldOut = true and blocks second purchase
    const buy1 = useGameStore.getState().buyShopItem(target.instanceId);
    expect(buy1.ok).toBe(true);
    const updatedTarget = useGameStore
      .getState()
      .shopStock.find((s) => s.instanceId === target.instanceId);
    expect(updatedTarget?.soldOut).toBe(true);
    expect(useGameStore.getState().shopStock.length).toBe(initialStock.length);

    const buy2 = useGameStore.getState().buyShopItem(target.instanceId);
    expect(buy2.ok).toBe(false);

    // Paid refresh deducts refreshCostCredits and clears soldOut
    const crBeforeRefresh = useGameStore.getState().pilot.credits;
    const refreshRes = useGameStore.getState().refreshShopStock();
    expect(refreshRes).toEqual({
      ok: true,
      cost: SHOP_STOCK_CONFIG.refreshCostCredits,
    });
    expect(useGameStore.getState().pilot.credits).toBe(
      crBeforeRefresh - SHOP_STOCK_CONFIG.refreshCostCredits
    );
    expect(useGameStore.getState().shopStock.every((s) => !s.soldOut)).toBe(true);

    // Advance month triggers restock
    const firstIdBeforeMonth = useGameStore.getState().shopStock[0].instanceId;
    useGameStore.getState().advanceMonth();
    const afterMonthStock = useGameStore.getState().shopStock;
    expect(afterMonthStock.length).toBeGreaterThanOrEqual(EQUIPMENT_SLOTS.length * 3);
    expect(afterMonthStock.every((s) => !s.soldOut)).toBe(true);
    expect(afterMonthStock[0].instanceId).not.toBe(firstIdBeforeMonth);

    // Battle completion (forceWinBattle) triggers auto-restock when countdown reaches 0
    const firstIdBeforeBattle = useGameStore.getState().shopStock[0].instanceId;
    useGameStore.getState().startBattle('border_outpost');
    useGameStore.getState().forceWinBattle();
    expect(useGameStore.getState().shopStock[0].instanceId).not.toBe(
      firstIdBeforeBattle
    );
    expect(useGameStore.getState().battlesUntilRestock).toBe(
      SHOP_STOCK_CONFIG.restockEveryNBattles
    );
  });
});

describe('Admin Reducers & Formation Capacity Wiring', () => {
  beforeEach(() => {
    useGameStore.getState().resetCampaign();
  });

  it('respects both formationFrontCapacity and formationBackCapacity in createInitialBattleState', () => {
    const pilot = createDefaultPilotAccount('Tactician', 'striker');
    pilot.hiredWingman = {
      sourceSectorId: 'aegis_relay',
      callsign: 'Apex Merc',
      classId: 'siege',
      bonusLevel: 2,
    };

    // 4v4 with backCap = 1, frontCap = 4 -> 3 front + 1 back (plus merc in front since back is full)
    const b1 = createInitialBattleState(pilot, 'border_outpost', createDeterministicRng(9), 4, {
      formationFrontCapacity: 4,
      formationBackCapacity: 1,
    });
    const baseAllies = b1.units.filter(
      (u) => u.side === 'ally' && u.id !== 'ally_hired_merc'
    );
    const enemies1 = b1.units.filter((u) => u.side === 'enemy');
    expect(baseAllies.filter((u) => u.row === 'front')).toHaveLength(3);
    expect(baseAllies.filter((u) => u.row === 'back')).toHaveLength(1);
    expect(enemies1.filter((u) => u.row === 'front')).toHaveLength(3);
    expect(enemies1.filter((u) => u.row === 'back')).toHaveLength(1);
    expect(b1.units.find((u) => u.id === 'ally_hired_merc')?.row).toBe('front');

    // 6v6 with backCap = 2, frontCap = 4 -> 4 front + 2 back
    const b2 = createInitialBattleState(pilot, 'border_outpost', createDeterministicRng(9), 6, {
      formationFrontCapacity: 4,
      formationBackCapacity: 2,
    });
    const enemies2 = b2.units.filter((u) => u.side === 'enemy');
    expect(enemies2.filter((u) => u.row === 'front')).toHaveLength(4);
    expect(enemies2.filter((u) => u.row === 'back')).toHaveLength(2);
  });

  it('exercises Admin CP store reducers (Pilot, Items, Shop, Skills, Battle, Campaign, System)', () => {
    const store = useGameStore.getState();
    store.startCampaign('AdminTester', 'striker');

    // Unlock / Toggle
    store.unlockAdminMode(true);
    expect(useGameStore.getState().adminUnlocked).toBe(true);
    expect(useGameStore.getState().adminPanelOpen).toBe(true);
    store.setAdminPanelOpen(false);
    expect(useGameStore.getState().adminPanelOpen).toBe(false);

    // Pilot & Gear
    store.adminSetGearLevel(15, 'striker');
    expect(useGameStore.getState().pilot.gears.striker.level).toBe(15);
    store.adminAddGearUnspentPoints(7, 'striker');
    expect(useGameStore.getState().pilot.gears.striker.unspentPoints).toBeGreaterThanOrEqual(7);
    store.adminResetGearAllocation('striker');
    expect(useGameStore.getState().pilot.gears.striker.unspentPoints).toBe(
      getTotalAvailablePointsForLevel(15)
    );
    store.adminUnlockAllGears();
    expect(
      Object.values(useGameStore.getState().pilot.gears).every((g) => g.owned)
    ).toBe(true);
    store.adminSetCredits(10000);
    store.adminAddCredits(2500);
    expect(useGameStore.getState().pilot.credits).toBe(12500);
    store.adminSetWarPoints(500);
    store.adminAddWarPoints(250);
    expect(useGameStore.getState().pilot.warPoints).toBe(750);

    // Items: generate + fill + delete (protects locked & equipped)
    const added = store.adminGenerateItems('main_weapon', 2, 'epic', 3, {
      requiredLevel: 5,
      rollQuality: 88,
    });
    expect(added).toBe(3);
    const filled = store.adminFillInventory(10);
    expect(filled).toBe(10);

    const firstId = useGameStore.getState().pilot.inventory[0].instanceId;
    useGameStore.getState().toggleItemLock(firstId);
    const removed = useGameStore.getState().adminDeleteItems('all_unequipped');
    expect(removed).toBeGreaterThan(0);
    expect(
      useGameStore.getState().pilot.inventory.some((i) => i.instanceId === firstId)
    ).toBe(true);

    // Shop: force add + restock
    store.adminForceAddShopItem({
      slot: 'cpu',
      tier: 3,
      rarity: 'legendary',
    });
    expect(useGameStore.getState().shopStock[0].rarity).toBe('legendary');
    store.adminRestockShopNow();
    expect(useGameStore.getState().shopStock.length).toBeGreaterThan(0);

    // Skills & Opening Cards
    store.adminGrantAllOpeningCards();
    expect(useGameStore.getState().pilot.ownedOpeningCards.length).toBeGreaterThan(0);
    store.adminUnlockAllSkillsForGear('striker', true);
    expect(
      Object.values(useGameStore.getState().pilot.gears.striker.skillLevels).some(
        (lv) => lv === BALANCE_CONFIG.skillMaxLevel
      )
    ).toBe(true);

    // Battle live controls
    store.startBattle('border_outpost');
    store.adminSkipBattleToRound(25);
    expect(useGameStore.getState().battle?.round).toBe(25);
    store.adminResetBattleCooldowns();
    const playerUnit = useGameStore
      .getState()
      .battle?.units.find((u) => u.isPlayer);
    expect(playerUnit?.sp).toBe(playerUnit?.derived.maxSp);

    // Campaign
    store.adminSetCampaignMonth(12);
    expect(useGameStore.getState().pilot.campaignMonth).toBe(12);
    store.adminSetBaseFaction('iron_citadel', 'allied');
    expect(useGameStore.getState().pilot.baseStates.iron_citadel.faction).toBe(
      'allied'
    );
    store.adminUnlockAllSectors();

    // Config + Export/Import JSON round-trip
    store.adminUpdateConfig({
      godMode: true,
      formationBackCapacity: 3,
    });
    expect(useGameStore.getState().adminConfig.godMode).toBe(true);
    const exported = useGameStore.getState().adminExportSaveJson();
    store.adminSetCredits(1);
    const imported = useGameStore.getState().adminImportSaveJson(exported);
    expect(imported.ok).toBe(true);
    expect(useGameStore.getState().pilot.credits).toBe(12500);
  });
});
