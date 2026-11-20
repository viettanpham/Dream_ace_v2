// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_EQUIP_CONFIG } from '../../data/autoEquipConfig';
import { EQUIPMENT_SLOTS } from '../../data/items';
import {
  applyAutoEquipPlan,
  buildAutoEquipPlan,
  scoreItemForClass,
  undoAutoEquipSnapshot,
} from '../../engine/autoEquip';
import { generateItemInstance } from '../../engine/equipment';
import {
  filterAndSortInventory,
  getDefaultInventoryFilterState,
} from '../../engine/inventory';
import { createDefaultPilotAccount } from '../../engine/stats';
import { EN_TRANSLATIONS } from '../../i18n/en';
import { VI_TRANSLATIONS } from '../../i18n/vi';
import { useGameStore } from '../../store/useGameStore';
import type { ItemInstance, StatBlock } from '../../types/game';
import { GearView } from '../GearView';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeCustomItem(
  overrides: Partial<ItemInstance> & {
    instanceId: string;
    rolledBaseStats?: Partial<StatBlock>;
  }
): ItemInstance {
  const base = generateItemInstance(
    {
      templateId: overrides.templateId ?? 'tpl_mw_pulse_cannon',
      slot: overrides.slot ?? 'main_weapon',
      tier: overrides.tier ?? 1,
      rarity: overrides.rarity ?? 'common',
      requiredLevel: overrides.requiredLevel ?? 1,
      rollQuality: overrides.rollQuality ?? 50,
    },
    () => 0.5
  );
  return {
    ...base,
    affixes: [],
    specialTraits: undefined,
    ...overrides,
  };
}

describe('Task AE — Auto-Equip Engine, Inventory Unusable Sort & GearView UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().resetCampaign();
    useGameStore.getState().startCampaign('Ace', 'striker');
    useGameStore.getState().setLanguage('vi');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('1. Class-based Scoring, Quality/Tier, and Admin-Editable Weights', () => {
    it('picks EVA/SPD/CRT items for Interceptor, DEF/SHD/SPR for Support, and ATK/longRange for Siege', () => {
      const pilot = createDefaultPilotAccount('Tester', 'interceptor');
      pilot.gears.interceptor.owned = true;
      pilot.gears.interceptor.level = 10;
      pilot.gears.support.owned = true;
      pilot.gears.support.level = 10;
      pilot.gears.siege.owned = true;
      pilot.gears.siege.level = 10;

      const evaCpu = makeCustomItem({
        instanceId: 'cpu_eva_spd',
        templateId: 'tpl_cpu_tactical',
        slot: 'cpu',
        tier: 2,
        rollQuality: 70,
        rolledBaseStats: { evasion: 14, fuel: 10 },
        specialTraits: { critBonusPct: 8 },
      });
      const tankCpu = makeCustomItem({
        instanceId: 'cpu_def_shd',
        templateId: 'tpl_cpu_tactical',
        slot: 'cpu',
        tier: 2,
        rollQuality: 70,
        rolledBaseStats: { defense: 14, shield: 12, spirit: 10 },
      });
      const longRangeRail = makeCustomItem({
        instanceId: 'mw_longrange',
        templateId: 'tpl_mw_railgun',
        slot: 'main_weapon',
        tier: 2,
        rollQuality: 75,
        rolledBaseStats: { attack: 18, defense: 4 },
        specialTraits: { longRange: true, critBonusPct: 5 },
      });
      const shortRangeEvaGun = makeCustomItem({
        instanceId: 'mw_short_eva',
        templateId: 'tpl_mw_pulse_cannon',
        slot: 'main_weapon',
        tier: 2,
        rollQuality: 75,
        rolledBaseStats: { attack: 10, evasion: 12, fuel: 8 },
      });

      // Higher tier & quality tie-breaker check
      const lowerTierAcc = makeCustomItem({
        instanceId: 'acc_t1_low',
        templateId: 'tpl_acc_capacitor',
        slot: 'accessory',
        tier: 1,
        rollQuality: 30,
        rolledBaseStats: { attack: 8 },
      });
      const higherTierAcc = makeCustomItem({
        instanceId: 'acc_t3_high',
        templateId: 'tpl_acc_capacitor',
        slot: 'accessory',
        tier: 3,
        rollQuality: 95,
        rolledBaseStats: { attack: 8 },
        locked: true, // Locked items MUST still be eligible for auto-equip
      });

      pilot.inventory = [
        evaCpu,
        tankCpu,
        longRangeRail,
        shortRangeEvaGun,
        lowerTierAcc,
        higherTierAcc,
      ];

      // Interceptor favors EVA/SPD/CRT -> picks cpu_eva_spd and higherTierAcc (even though locked)
      const intPlan = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'interceptor',
      });
      const intCpu = intPlan.gearPlans[0].slots.find((s) => s.slot === 'cpu');
      const intAcc = intPlan.gearPlans[0].slots.find(
        (s) => s.slot === 'accessory'
      );
      expect(intCpu?.nextItem?.instanceId).toBe('cpu_eva_spd');
      expect(intAcc?.nextItem?.instanceId).toBe('acc_t3_high');
      expect(
        scoreItemForClass(higherTierAcc, 'interceptor')
      ).toBeGreaterThan(scoreItemForClass(lowerTierAcc, 'interceptor'));

      // Support favors DEF/SHD/SPR -> picks cpu_def_shd
      const supPlan = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'support',
      });
      const supCpu = supPlan.gearPlans[0].slots.find((s) => s.slot === 'cpu');
      expect(supCpu?.nextItem?.instanceId).toBe('cpu_def_shd');

      // Siege favors ATK + longRange -> picks mw_longrange
      const sgePlan = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'siege',
      });
      const sgeMw = sgePlan.gearPlans[0].slots.find(
        (s) => s.slot === 'main_weapon'
      );
      expect(sgeMw?.nextItem?.instanceId).toBe('mw_longrange');

      // Custom Admin weights override changes choice cleanly
      const customConfig = {
        ...DEFAULT_AUTO_EQUIP_CONFIG,
        classWeights: {
          ...DEFAULT_AUTO_EQUIP_CONFIG.classWeights,
          interceptor: {
            ...DEFAULT_AUTO_EQUIP_CONFIG.classWeights.interceptor,
            defense: 10,
            shield: 10,
            evasion: 0.1,
            fuel: 0.1,
            critBonusPct: 0.1,
          },
        },
      };
      const overriddenPlan = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'interceptor',
        config: customConfig,
      });
      expect(
        overriddenPlan.gearPlans[0].slots.find((s) => s.slot === 'cpu')
          ?.nextItem?.instanceId
      ).toBe('cpu_def_shd');
    });
  });

  describe('2. Margin Rule (+3%), Compatibility, No Double Assignment & Undo', () => {
    it('enforces the +3% margin rule before replacing an equipped item', () => {
      const pilot = createDefaultPilotAccount('MarginTester', 'striker');
      pilot.gears.striker.level = 10;

      // Score with custom weights where score == 100 exact
      const testConfig = {
        ...DEFAULT_AUTO_EQUIP_CONFIG,
        replaceMarginPct: 0.03,
        classWeights: {
          ...DEFAULT_AUTO_EQUIP_CONFIG.classWeights,
          striker: {
            ...DEFAULT_AUTO_EQUIP_CONFIG.classWeights.striker,
            attack: 1,
            tierBonus: 0,
            qualityWeight: 0,
          },
        },
      };

      const equipped = makeCustomItem({
        instanceId: 'mw_eq_100',
        slot: 'main_weapon',
        rolledBaseStats: { attack: 100 },
      });
      const slightlyBetter = makeCustomItem({
        instanceId: 'mw_cand_102',
        slot: 'main_weapon',
        rolledBaseStats: { attack: 102 }, // +2% (< +3% margin)
      });
      pilot.gears.striker.equipped.main_weapon = equipped.instanceId;
      pilot.inventory = [equipped, slightlyBetter];

      const planKeep = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'striker',
        config: testConfig,
      });
      const slotKeep = planKeep.gearPlans[0].slots.find(
        (s) => s.slot === 'main_weapon'
      )!;
      expect(slotKeep.changed).toBe(false);
      expect(slotKeep.nextItem?.instanceId).toBe('mw_eq_100');

      // Now add an item with score 103 (+3% >= threshold) -> SHOULD replace
      const enoughBetter = makeCustomItem({
        instanceId: 'mw_cand_103',
        slot: 'main_weapon',
        rolledBaseStats: { attack: 103 },
      });
      pilot.inventory = [equipped, slightlyBetter, enoughBetter];

      const planReplace = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'striker',
        config: testConfig,
      });
      const slotReplace = planReplace.gearPlans[0].slots.find(
        (s) => s.slot === 'main_weapon'
      )!;
      expect(slotReplace.changed).toBe(true);
      expect(slotReplace.nextItem?.instanceId).toBe('mw_cand_103');
    });

    it('never touches items equipped on another Gear in single mode, never double-assigns in All Gears mode, and Undo restores exact state', () => {
      const pilot = createDefaultPilotAccount('MultiGear', 'striker');
      pilot.gears.striker.level = 10;
      pilot.gears.interceptor.owned = true;
      pilot.gears.interceptor.level = 10;

      const bestGunOnInterceptor = makeCustomItem({
        instanceId: 'mw_best_on_int',
        slot: 'main_weapon',
        tier: 3,
        rollQuality: 95,
        rolledBaseStats: { attack: 35, evasion: 10 },
      });
      const midGunFree = makeCustomItem({
        instanceId: 'mw_mid_free',
        slot: 'main_weapon',
        tier: 2,
        rollQuality: 70,
        rolledBaseStats: { attack: 20 },
      });
      const weakGunOnStriker = makeCustomItem({
        instanceId: 'mw_weak_on_str',
        slot: 'main_weapon',
        tier: 1,
        rollQuality: 40,
        rolledBaseStats: { attack: 8 },
      });
      const unusableHighLv = makeCustomItem({
        instanceId: 'mw_lv30',
        slot: 'main_weapon',
        tier: 4,
        requiredLevel: 30,
        rolledBaseStats: { attack: 90 },
      });
      const wrongClassArmor = makeCustomItem({
        instanceId: 'ar_siege_only',
        templateId: 'tpl_ar_siege_juggernaut',
        slot: 'armor',
        classRestriction: 'siege',
        tier: 4,
        rolledBaseStats: { defense: 80 },
      });

      pilot.gears.striker.equipped.main_weapon = weakGunOnStriker.instanceId;
      pilot.gears.interceptor.equipped.main_weapon =
        bestGunOnInterceptor.instanceId;
      pilot.inventory = [
        bestGunOnInterceptor,
        midGunFree,
        weakGunOnStriker,
        unusableHighLv,
        wrongClassArmor,
      ];

      // Single mode on Striker MUST NOT take bestGunOnInterceptor; picks midGunFree
      const singlePlan = buildAutoEquipPlan(pilot, {
        mode: 'single',
        targetGearId: 'striker',
      });
      const singleMw = singlePlan.gearPlans[0].slots.find(
        (s) => s.slot === 'main_weapon'
      )!;
      expect(singleMw.nextItem?.instanceId).toBe('mw_mid_free');
      expect(
        singlePlan.gearPlans[0].slots.find((s) => s.slot === 'armor')?.nextItem
      ).toBeNull();

      // All-Gears mode (Striker first, Interceptor second):
      // Striker gets bestGunOnInterceptor (reassignedFromGear: 'interceptor'),
      // Interceptor gets midGunFree (never assigned to both!)
      const allPlan = buildAutoEquipPlan(pilot, {
        mode: 'all',
        gearOrder: ['striker', 'interceptor'],
      });
      const strMw = allPlan.gearPlans
        .find((g) => g.gearId === 'striker')!
        .slots.find((s) => s.slot === 'main_weapon')!;
      const intMw = allPlan.gearPlans
        .find((g) => g.gearId === 'interceptor')!
        .slots.find((s) => s.slot === 'main_weapon')!;
      expect(strMw.nextItem?.instanceId).toBe('mw_best_on_int');
      expect(strMw.reassignedFromGear).toBe('interceptor');
      expect(intMw.nextItem?.instanceId).toBe('mw_mid_free');

      // Apply & verify zero duplicate assignments across all gears
      const { pilot: afterApply, undoSnapshot } = applyAutoEquipPlan(
        pilot,
        allPlan
      );
      const assignedIds: string[] = [];
      for (const gid of ['striker', 'interceptor'] as const) {
        for (const sl of EQUIPMENT_SLOTS) {
          const id = afterApply.gears[gid].equipped[sl];
          if (id) assignedIds.push(id);
        }
      }
      expect(new Set(assignedIds).size).toBe(assignedIds.length);
      expect(afterApply.gears.striker.equipped.main_weapon).toBe(
        'mw_best_on_int'
      );
      expect(afterApply.gears.interceptor.equipped.main_weapon).toBe(
        'mw_mid_free'
      );

      // Undo restores exact prior equipment
      const afterUndo = undoAutoEquipSnapshot(afterApply, undoSnapshot);
      expect(afterUndo.gears.striker.equipped.main_weapon).toBe(
        'mw_weak_on_str'
      );
      expect(afterUndo.gears.interceptor.equipped.main_weapon).toBe(
        'mw_best_on_int'
      );
    });
  });

  describe('3. Unusable Items Sort Last in Inventory', () => {
    it('sorts wrong-class and level-too-low items to the bottom across sort modes while keeping filters working', () => {
      const pilot = createDefaultPilotAccount('SortTester', 'striker');
      pilot.gears.striker.level = 5;

      const usableCommon = makeCustomItem({
        instanceId: 'usable_common',
        tier: 1,
        rarity: 'common',
        requiredLevel: 1,
        rolledBaseStats: { attack: 5 },
      });
      const unusableWrongClass = makeCustomItem({
        instanceId: 'unusable_class',
        templateId: 'tpl_ar_inter_reflex',
        slot: 'armor',
        classRestriction: 'interceptor',
        tier: 4,
        rarity: 'legendary',
        requiredLevel: 1,
        rolledBaseStats: { evasion: 50 },
      });
      const unusableHighLv = makeCustomItem({
        instanceId: 'unusable_lv',
        slot: 'main_weapon',
        tier: 4,
        rarity: 'legendary',
        requiredLevel: 20,
        rolledBaseStats: { attack: 80 },
      });

      const inv = [unusableHighLv, unusableWrongClass, usableCommon];

      // Even sorted by powerScore desc (where unusable items have way higher scores), usable comes FIRST
      const byPower = filterAndSortInventory(
        inv,
        {
          ...getDefaultInventoryFilterState(),
          sortBy: 'powerScore',
          sortDir: 'desc',
        },
        pilot.gears.striker,
        pilot.gears
      );
      expect(byPower[0].item.instanceId).toBe('usable_common');
      expect(byPower[0].usableBySelected).toBe(true);
      expect(byPower.slice(1).every((e) => !e.usableBySelected)).toBe(true);

      // Existing filter usability='selected_gear' still filters out unusable items
      const onlyUsable = filterAndSortInventory(
        inv,
        {
          ...getDefaultInventoryFilterState(),
          usability: 'selected_gear',
        },
        pilot.gears.striker,
        pilot.gears
      );
      expect(onlyUsable.map((e) => e.item.instanceId)).toEqual([
        'usable_common',
      ]);
    });
  });

  describe('4. GearView UI: Preview Modal, Apply, Undo Toast, Dimmed Unusable & i18n Parity', () => {
    it('renders Auto-Equip buttons, opens preview dialog with Hiện tại → Mới & Giữ nguyên, applies and undoes via toast', () => {
      const strongWeapon = makeCustomItem({
        instanceId: 'ui_strong_mw',
        slot: 'main_weapon',
        tier: 3,
        rarity: 'epic',
        rollQuality: 90,
        requiredLevel: 1,
        rolledBaseStats: { attack: 40 },
      });
      const weakWeapon = makeCustomItem({
        instanceId: 'ui_weak_mw',
        slot: 'main_weapon',
        tier: 1,
        rarity: 'common',
        rollQuality: 30,
        requiredLevel: 1,
        rolledBaseStats: { attack: 5 },
      });
      const existingCpu = makeCustomItem({
        instanceId: 'ui_existing_cpu',
        templateId: 'tpl_cpu_tactical',
        slot: 'cpu',
        tier: 2,
        rarity: 'rare',
        rollQuality: 60,
        requiredLevel: 1,
        rolledBaseStats: { spirit: 12 },
      });
      const unusableArmor = makeCustomItem({
        instanceId: 'ui_unusable_armor',
        templateId: 'tpl_ar_siege_juggernaut',
        slot: 'armor',
        classRestriction: 'siege',
        tier: 4,
        rarity: 'legendary',
        requiredLevel: 15,
        rolledBaseStats: { defense: 55 },
      });

      useGameStore.setState((s) => ({
        ...s,
        pilot: {
          ...s.pilot,
          inventory: [
            unusableArmor,
            strongWeapon,
            weakWeapon,
            existingCpu,
          ],
          gears: {
            ...s.pilot.gears,
            striker: {
              ...s.pilot.gears.striker,
              level: 5,
              equipped: {
                ...s.pilot.gears.striker.equipped,
                main_weapon: weakWeapon.instanceId,
                cpu: existingCpu.instanceId,
              },
            },
          },
        },
      }));

      act(() => {
        root.render(createElement(GearView));
      });

      // Unusable card is rendered last in DOM order, dimmed, with short reason label
      const cards = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-testid^="inv-card-"]')
      );
      expect(cards.length).toBe(4);
      const lastCard = cards[cards.length - 1];
      expect(lastCard.dataset.testid).toBe('inv-card-ui_unusable_armor');
      expect(lastCard.dataset.unusable).toBe('true');
      const reasonEl = lastCard.querySelector(
        '[data-testid="inv-unusable-reason"]'
      );
      expect(reasonEl?.textContent).toContain('Siege');
      expect(reasonEl?.textContent).toContain('Lv.15');

      // Click "Tự động trang bị"
      const autoEquipBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="auto-equip-btn"]'
      );
      expect(autoEquipBtn).not.toBeNull();
      expect(autoEquipBtn?.textContent).toContain('Tự động trang bị');
      expect(
        container.querySelector('[data-testid="auto-equip-all-btn"]')
          ?.textContent
      ).toContain('Tất cả Gear');

      act(() => {
        autoEquipBtn!.click();
      });

      // Preview modal opens with "Hiện tại → Mới", score diff, stat delta, and "Giữ nguyên"
      const modal = container.querySelector('[data-testid="autoequip-modal"]');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('Hiện tại → Mới');
      expect(modal?.textContent).toContain('Giữ nguyên');
      expect(
        container.querySelector(
          '[data-testid="autoequip-score-diff-striker-main_weapon"]'
        )
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="autoequip-keep-striker-cpu"]')
          ?.textContent
      ).toBe('Giữ nguyên');

      // Equipment has NOT changed yet before clicking Áp dụng
      expect(
        useGameStore.getState().pilot.gears.striker.equipped.main_weapon
      ).toBe('ui_weak_mw');

      // Click Áp dụng
      const applyBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="autoequip-apply-btn"]'
      );
      expect(applyBtn?.textContent).toContain('Áp dụng');
      act(() => {
        applyBtn!.click();
      });

      // Modal closed, equipment updated, Undo toast visible
      expect(container.querySelector('[data-testid="autoequip-modal"]')).toBeNull();
      expect(
        useGameStore.getState().pilot.gears.striker.equipped.main_weapon
      ).toBe('ui_strong_mw');

      const undoToast = container.querySelector(
        '[data-testid="autoequip-undo-toast"]'
      );
      expect(undoToast).not.toBeNull();

      // Click "Hoàn tác" -> restores weakWeapon
      const undoBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="autoequip-undo-btn"]'
      );
      expect(undoBtn?.textContent).toBe('Hoàn tác');
      act(() => {
        undoBtn!.click();
      });

      expect(
        useGameStore.getState().pilot.gears.striker.equipped.main_weapon
      ).toBe('ui_weak_mw');
      expect(
        container.querySelector('[data-testid="autoequip-undo-toast"]')
      ).toBeNull();
    });

    it('keeps vi/en i18n keys in complete parity', () => {
      const enKeys = Object.keys(EN_TRANSLATIONS).sort();
      const viKeys = Object.keys(VI_TRANSLATIONS).sort();
      expect(viKeys).toEqual(enKeys);
    });
  });
});
