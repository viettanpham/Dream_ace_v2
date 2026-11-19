import { describe, expect, it } from 'vitest';
import { BALANCE_CONFIG } from '../../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASSES } from '../../data/classes';
import { EQUIPMENT_SLOTS, ITEM_TEMPLATES } from '../../data/items';
import { SECTORS_CATALOG } from '../../data/maps';
import type { CombatUnit, ItemRarity } from '../../types/game';
import {
  calculateBattleRewards,
  calculateSingleEnemyReward,
  chooseAiDecision,
  createInitialBattleState,
  getEffectiveUnitSpeed,
  hasStatus,
  resolveUnitAction,
} from '../combat';
import {
  equipItemOnGear,
  generateItemInstance,
  generateShopStock,
  getEffectiveItemStats,
  getItemEquippedByGear,
  sumGearEquipmentStats,
  sumGearSpecialTraits,
  unequipSlotOnGear,
  validateEquipOnGear,
} from '../equipment';
import { migrateSaveData } from '../migration';
import {
  allocateGearStats,
  applyExpToGear,
  calculateDerivedStats,
  calculateEffectiveStats,
  createDefaultPilotAccount,
  estimateBattlesToNextLevel,
  getExpForNextLevel,
  resetGearStatAllocations,
} from '../stats';

function createSequenceRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    const val = values[idx % values.length];
    idx += 1;
    return val;
  };
}

describe('1. Per-Gear Leveling & Progression', () => {
  it('computes EXP curve as Math.round(60 * level^1.4)', () => {
    expect(getExpForNextLevel(1)).toBe(60);
    expect(getExpForNextLevel(2)).toBe(Math.round(60 * Math.pow(2, 1.4)));
    expect(getExpForNextLevel(3)).toBe(Math.round(60 * Math.pow(3, 1.4)));
    expect(getExpForNextLevel(4)).toBe(Math.round(60 * Math.pow(4, 1.4)));
    expect(getExpForNextLevel(5)).toBe(Math.round(60 * Math.pow(5, 1.4)));
  });

  it('awards +3 stat points per level ONLY to the leveled Gear and leaves other Gears untouched', () => {
    const pilot = createDefaultPilotAccount('Kira', 'striker');
    pilot.gears.interceptor.owned = true;

    const strikerBefore = pilot.gears.striker;
    const interceptorBefore = { ...pilot.gears.interceptor };

    // Lv1->2 needs 60, Lv2->3 needs 158 -> total 218 EXP -> +6 stat points
    const res = applyExpToGear(strikerBefore, 230, { won: true });
    expect(res.leveledUp).toBe(true);
    expect(res.previousLevel).toBe(1);
    expect(res.newLevel).toBe(3);
    expect(res.statPointsGained).toBe(6);
    expect(res.updatedGear.unspentPoints).toBe(
      BALANCE_CONFIG.initialStatPoints + 6
    );
    expect(res.updatedGear.exp).toBe(12);
    expect(res.updatedGear.battlesFought).toBe(1);
    expect(res.updatedGear.battlesWon).toBe(1);

    // Other Gear remains strictly unchanged at Lv 1
    expect(pilot.gears.interceptor.level).toBe(interceptorBefore.level);
    expect(pilot.gears.interceptor.exp).toBe(0);
    expect(pilot.gears.interceptor.unspentPoints).toBe(
      BALANCE_CONFIG.initialStatPoints
    );
  });

  it('reaches Lv 5 within ~8 battles against Lv 1 enemies using default REWARD_MULT', () => {
    const pilot = createDefaultPilotAccount('Ace', 'interceptor');
    let gear = pilot.gears.interceptor;
    const singleBattleExp =
      4 * calculateSingleEnemyReward(1, false).exp * BALANCE_CONFIG.rewardMultDefault;

    let battles = 0;
    while (gear.level < 5 && battles < 12) {
      battles += 1;
      gear = applyExpToGear(gear, singleBattleExp, { won: true }).updatedGear;
    }

    expect(gear.level).toBeGreaterThanOrEqual(5);
    expect(battles).toBeLessThanOrEqual(8);
    expect(estimateBattlesToNextLevel(pilot.gears.interceptor, singleBattleExp)).toBe(1);
  });
});

describe('2. Per-Gear Stat Allocation & Respec', () => {
  it('allocates points strictly on the targeted Gear and updates effective & derived stats', () => {
    const pilot = createDefaultPilotAccount('Kira', 'interceptor');
    const gear = pilot.gears.interceptor;

    const baseStats = calculateEffectiveStats(
      gear.classId,
      gear.level,
      gear.allocatedPoints
    );
    const updated = allocateGearStats(gear, { attack: 2, evasion: 1 });

    expect(updated.unspentPoints).toBe(0);
    expect(updated.allocatedPoints.attack).toBe(2);
    expect(updated.allocatedPoints.evasion).toBe(1);

    const newStats = calculateEffectiveStats(
      updated.classId,
      updated.level,
      updated.allocatedPoints
    );
    const cls = MECH_CLASSES.interceptor;
    expect(newStats.attack).toBe(baseStats.attack + 2 * cls.perPointGain.attack);
    expect(newStats.evasion).toBe(
      baseStats.evasion + 1 * cls.perPointGain.evasion
    );

    // Rejects overspending beyond unspentPoints
    const rejected = allocateGearStats(updated, { attack: 1 });
    expect(rejected).toBe(updated);

    // Respec refunds all points strictly on this Gear
    const reset = resetGearStatAllocations(updated);
    expect(reset.allocatedPoints).toEqual(EMPTY_STAT_BLOCK);
    expect(reset.unspentPoints).toBe(BALANCE_CONFIG.initialStatPoints);
  });

  it('includes equipped item rolled stats, enchant scaling, and special traits in derived stats', () => {
    const pilot = createDefaultPilotAccount('Vance', 'striker');
    const railLance = generateItemInstance(
      {
        templateId: 'tpl_mw_rail_lance', // has critBonusPct: 12
        tier: 2,
        rarity: 'epic',
        requiredLevel: 1,
        enchantLevel: 5, // +40%
      },
      () => 0.5
    );
    pilot.inventory.push(railLance);
    const equippedPilot = equipItemOnGear(pilot, 'striker', railLance.instanceId).pilot;
    const gear = equippedPilot.gears.striker;

    const bonuses = sumGearEquipmentStats(gear, equippedPilot.inventory);
    const traits = sumGearSpecialTraits(gear, equippedPilot.inventory);
    const effective = calculateEffectiveStats(
      gear.classId,
      gear.level,
      gear.allocatedPoints,
      EMPTY_STAT_BLOCK,
      bonuses,
      traits
    );
    const derived = calculateDerivedStats(gear.classId, gear.level, effective, traits);
    const baseDerived = calculateDerivedStats(
      gear.classId,
      gear.level,
      calculateEffectiveStats(gear.classId, gear.level, gear.allocatedPoints)
    );

    expect(bonuses.attack).toBeGreaterThan(0);
    expect(traits.critBonusPct).toBe(8);
    expect(derived.attackPower).toBe(baseDerived.attackPower + bonuses.attack);
    expect(derived.critChance).toBeGreaterThan(baseDerived.critChance);
  });
});

describe('3. Randomized Item Generation & Enchant Scaling', () => {
  it('defines at least 5 distinct item templates per slot', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const count = ITEM_TEMPLATES.filter((t) => t.slot === slot).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it('generates 0/1/2/3 affixes by rarity, rollQuality in [1..100], and scales with min/max RNG and tier', () => {
    const rarities: ItemRarity[] = ['common', 'rare', 'epic', 'legendary'];

    for (const rarity of rarities) {
      const lowRoll = generateItemInstance(
        { templateId: 'tpl_mw_pulse_cannon', tier: 1, rarity, requiredLevel: 1 },
        () => 0
      );
      const highRoll = generateItemInstance(
        { templateId: 'tpl_mw_pulse_cannon', tier: 1, rarity, requiredLevel: 1 },
        () => 0.9999
      );

      expect(lowRoll.affixes).toHaveLength(BALANCE_CONFIG.rarityAffixCount[rarity]);
      expect(highRoll.affixes).toHaveLength(BALANCE_CONFIG.rarityAffixCount[rarity]);
      expect(lowRoll.rollQuality).toBeGreaterThanOrEqual(1);
      expect(highRoll.rollQuality).toBe(100);
      expect(highRoll.rolledBaseStats.attack!).toBeGreaterThan(
        lowRoll.rolledBaseStats.attack!
      );

      if (rarity === 'common') {
        expect(lowRoll.suffixId).toBeNull();
      } else {
        expect(lowRoll.suffixId).not.toBeNull();
      }
    }

    const tier1 = generateItemInstance(
      { templateId: 'tpl_mw_pulse_cannon', tier: 1, rarity: 'rare', requiredLevel: 1 },
      () => 0.5
    );
    const tier3 = generateItemInstance(
      { templateId: 'tpl_mw_pulse_cannon', tier: 3, rarity: 'rare', requiredLevel: 7 },
      () => 0.5
    );
    expect(tier3.rolledBaseStats.attack!).toBeGreaterThan(
      tier1.rolledBaseStats.attack!
    );

    // Enchant +5 adds +40% to rolled stats
    const baseEff = getEffectiveItemStats(tier1, 0);
    const plus5Eff = getEffectiveItemStats(tier1, 5);
    expect(plus5Eff.attack).toBe(Math.round(baseEff.attack * 1.4));
  });

  it('generates randomized shop stock covering all 6 equipment slots', () => {
    const stock = generateShopStock(5, 12, createSequenceRng([0.15, 0.45, 0.75, 0.92]));
    expect(stock).toHaveLength(12);
    const slotsPresent = new Set(stock.map((i) => i.slot));
    for (const slot of EQUIPMENT_SLOTS) {
      expect(slotsPresent.has(slot)).toBe(true);
    }
    const uniqueIds = new Set(stock.map((i) => i.instanceId));
    expect(uniqueIds.size).toBe(12);
  });
});

describe('4. Rebalanced Reward Formula (Victory vs Defeat & Boss)', () => {
  function makeEnemy(id: string, level: number, alive: boolean, isBoss = false): CombatUnit {
    return {
      id,
      name: id,
      callsign: isBoss ? 'BOSS' : 'Hostile',
      side: 'enemy',
      isPlayer: false,
      classId: 'striker',
      archetype: 'gunship',
      isBoss,
      level,
      skillLevel: 1,
      stats: { ...EMPTY_STAT_BLOCK },
      derived: {
        maxHp: 100,
        maxShield: 50,
        maxSp: 40,
        speed: 30,
        attackPower: 20,
        defenseRating: 10,
        dodgeChance: 5,
        critChance: 10,
        skillPower: 20,
        armorPiercePct: 0,
        splashPct: 0,
        spRegenPerTurn: 0,
      },
      hp: alive ? 100 : 0,
      shield: alive ? 50 : 0,
      sp: 40,
      isDefending: false,
      alive,
      statuses: [],
      animState: alive ? 'idle' : 'destroyed',
    };
  }

  it('matches EXP = 25 + 8*lv, Credits = 60 + 20*lv, and x5 for bosses', () => {
    expect(calculateSingleEnemyReward(1, false)).toEqual({ exp: 33, credits: 80 });
    expect(calculateSingleEnemyReward(5, false)).toEqual({ exp: 65, credits: 160 });
    expect(calculateSingleEnemyReward(5, true)).toEqual({ exp: 325, credits: 800 });
  });

  it('grants 100% on victory and 50% destroyed + 20% full consolation on defeat/retreat', () => {
    const enemies = [
      makeEnemy('e1', 2, false), // 41 exp, 100 cr
      makeEnemy('e2', 2, false), // 41 exp, 100 cr
      makeEnemy('e3', 2, true),  // 41 exp, 100 cr
      makeEnemy('e4', 2, true),  // 41 exp, 100 cr
    ];
    // Full raw: 164 exp, 400 cr. With mult 2.0 => 328 exp, 800 cr.
    const victory = calculateBattleRewards(enemies, true, 2.0);
    expect(victory.fullVictoryExp).toBe(328);
    expect(victory.fullVictoryCredits).toBe(800);
    expect(victory.expGained).toBe(328);
    expect(victory.creditsGained).toBe(800);

    // Defeat with 2/4 enemies destroyed:
    // 50% of destroyed (82 * 2.0 * 0.5 = 82) + 20% of full victory (328 * 0.2 = 65.6) = 147.6 -> 148
    // Credits: 50% of destroyed (200 * 2.0 * 0.5 = 200) + 20% of full victory (800 * 0.2 = 160) = 360
    const defeatHalf = calculateBattleRewards(enemies, false, 2.0);
    expect(defeatHalf.expGained).toBe(Math.round(82 + 65.6));
    expect(defeatHalf.creditsGained).toBe(360);

    // Defeat with 0 enemies destroyed: flat 20% consolation only
    const allAlive = enemies.map((e) => ({ ...e, alive: true, hp: 100 }));
    const defeatZero = calculateBattleRewards(allAlive, false, 2.0);
    expect(defeatZero.expGained).toBe(Math.round(328 * 0.2));
    expect(defeatZero.creditsGained).toBe(Math.round(800 * 0.2));
  });
});

describe('5. Equipment Rules (Per-Gear Exclusivity, Class Locks, Level Requirement)', () => {
  it('enforces 1-instance-per-Gear exclusivity, Armor/Engine class locks, and requiredLevel', () => {
    let pilot = createDefaultPilotAccount('Kira', 'striker');
    pilot.gears.interceptor.owned = true;

    const universalWeapon = generateItemInstance(
      { templateId: 'tpl_mw_pulse_cannon', tier: 1, rarity: 'rare', requiredLevel: 1 },
      () => 0.5
    );
    const highLevelWeapon = generateItemInstance(
      { templateId: 'tpl_mw_rail_lance', tier: 3, rarity: 'epic', requiredLevel: 8 },
      () => 0.5
    );
    const strikerArmor = generateItemInstance(
      { templateId: 'tpl_ar_striker_vanguard', tier: 1, rarity: 'common', requiredLevel: 1 },
      () => 0.5
    );
    const interceptorEngine = generateItemInstance(
      { templateId: 'tpl_en_interceptor_vector', tier: 1, rarity: 'common', requiredLevel: 1 },
      () => 0.5
    );

    pilot.inventory.push(
      universalWeapon,
      highLevelWeapon,
      strikerArmor,
      interceptorEngine
    );

    // 1) Equip universal weapon on Striker -> succeeds
    const eq1 = equipItemOnGear(pilot, 'striker', universalWeapon.instanceId);
    expect(eq1.validation.canEquip).toBe(true);
    pilot = eq1.pilot;
    expect(getItemEquippedByGear(pilot.gears, universalWeapon.instanceId)).toBe('striker');

    // 2) Trying to equip the SAME instance on Interceptor -> blocked with equippedOnOtherGear
    const eq2 = equipItemOnGear(pilot, 'interceptor', universalWeapon.instanceId);
    expect(eq2.validation.canEquip).toBe(false);
    expect(eq2.validation.equippedOnOtherGear).toBe('striker');

    // 3) After unequipping from Striker, Interceptor can equip it
    pilot = unequipSlotOnGear(pilot, 'striker', 'main_weapon');
    const eq3 = equipItemOnGear(pilot, 'interceptor', universalWeapon.instanceId);
    expect(eq3.validation.canEquip).toBe(true);
    pilot = eq3.pilot;
    expect(getItemEquippedByGear(pilot.gears, universalWeapon.instanceId)).toBe('interceptor');

    // 4) Class-locked Armor (Striker) blocked on Interceptor; Engine (Interceptor) blocked on Striker
    const wrongArmor = validateEquipOnGear(
      strikerArmor,
      pilot.gears.interceptor,
      pilot.gears
    );
    expect(wrongArmor.canEquip).toBe(false);
    expect(wrongArmor.requiredClass).toBe('striker');

    const wrongEngine = validateEquipOnGear(
      interceptorEngine,
      pilot.gears.striker,
      pilot.gears
    );
    expect(wrongEngine.canEquip).toBe(false);
    expect(wrongEngine.requiredClass).toBe('interceptor');

    // 5) Required level check blocks equipping high-level item on Lv 1 Gear
    const tooLow = validateEquipOnGear(
      highLevelWeapon,
      pilot.gears.striker,
      pilot.gears
    );
    expect(tooLow.canEquip).toBe(false);
    expect(tooLow.missingLevel).toBe(8);
  });
});

describe('6. Save Migration (v1 / v2 / v3 / Corrupt -> v4 Per-Gear Model)', () => {
  it('migrates a legacy v3 flat player save into PilotAccount without crashing or losing progress', () => {
    const legacyV3 = {
      player: {
        name: 'Kira',
        classId: 'siege',
        level: 6,
        exp: 45,
        credits: 2450,
        unspentPoints: 4,
        allocatedPoints: {
          attack: 5,
          defense: 3,
          fuel: 1,
          spirit: 2,
          shield: 2,
          evasion: 1,
        },
        battlesWon: 4,
        battlesFought: 5,
        inventory: [
          { instanceId: 'old_bag_1', itemId: 'mw_plasma_lance', enchantLevel: 2 },
        ],
        equipped: {
          main_weapon: {
            instanceId: 'old_eq_mw',
            itemId: 'mw_hyperion_railgun',
            enchantLevel: 4,
          },
          sub_weapon: null,
          armor: {
            instanceId: 'old_eq_arm',
            itemId: 'ar_siege_bulwark',
            enchantLevel: 1,
          },
          engine: null,
          cpu: null,
          accessory: null,
        },
      },
      selectedSectorId: SECTORS_CATALOG[1].id,
      hasSaveData: true,
      language: 'vi',
      battleSpeed: 2,
    };

    const migrated = migrateSaveData(legacyV3, 3, () => 0.5);

    expect(migrated.pilot.name).toBe('Kira');
    expect(migrated.pilot.credits).toBe(2450);
    expect(migrated.pilot.activeGearId).toBe('siege');

    // Siege inherits legacy progress and equipped items
    expect(migrated.pilot.gears.siege.owned).toBe(true);
    expect(migrated.pilot.gears.siege.level).toBe(6);
    expect(migrated.pilot.gears.siege.exp).toBe(45);
    expect(migrated.pilot.gears.siege.unspentPoints).toBe(4);
    expect(migrated.pilot.gears.siege.allocatedPoints.attack).toBe(5);
    expect(migrated.pilot.gears.siege.equipped.main_weapon).toBe('old_eq_mw');
    expect(migrated.pilot.gears.siege.equipped.armor).toBe('old_eq_arm');

    // Other 3 Gears are initialized as locked Lv 1 units
    expect(migrated.pilot.gears.striker.owned).toBe(false);
    expect(migrated.pilot.gears.striker.level).toBe(1);
    expect(migrated.pilot.gears.interceptor.owned).toBe(false);
    expect(migrated.pilot.gears.support.owned).toBe(false);

    // Migrated items exist in shared inventory with preserved enchant levels
    const eqWeapon = migrated.pilot.inventory.find((i) => i.instanceId === 'old_eq_mw');
    const bagWeapon = migrated.pilot.inventory.find((i) => i.instanceId === 'old_bag_1');
    expect(eqWeapon?.enchantLevel).toBe(4);
    expect(bagWeapon?.enchantLevel).toBe(2);
    expect(migrated.shopStock.length).toBe(BALANCE_CONFIG.shopStockSize);
  });

  it('handles null/corrupt payloads safely by returning a valid default campaign', () => {
    const fromNull = migrateSaveData(null, 1, () => 0.5);
    expect(fromNull.pilot.gears[fromNull.pilot.activeGearId].owned).toBe(true);
    expect(fromNull.shopStock.length).toBeGreaterThan(0);

    const fromBroken = migrateSaveData({ pilot: { activeGearId: 'invalid' } }, 4, () => 0.5);
    expect(fromBroken.pilot.gears[fromBroken.pilot.activeGearId].owned).toBe(true);
  });
});

describe('7. Combat Depth (Status Effects & Enemy Archetypes)', () => {
  it('applies Burn DoT at turn start, Slow reduces speed by 30%, and Shield Break bypasses shields', () => {
    const pilot = createDefaultPilotAccount('Vance', 'striker');
    const battle = createInitialBattleState(
      pilot,
      SECTORS_CATALOG[0].id,
      createSequenceRng([0.1, 0.35, 0.6, 0.85])
    );

    const player = battle.units.find((u) => u.id === 'ally_player')!;
    const enemy = battle.units.find((u) => u.side === 'enemy')!;

    // Slow reduces speed by 30%
    const slowedUnit: CombatUnit = {
      ...player,
      statuses: [{ type: 'slow', turnsRemaining: 2 }],
    };
    expect(getEffectiveUnitSpeed(slowedUnit)).toBe(
      Math.max(1, Math.round(player.derived.speed * (1 - BALANCE_CONFIG.slowSpeedPenalty)))
    );

    // Shield Break causes direct hull damage even when shield > 0
    const brokenEnemy: CombatUnit = {
      ...enemy,
      shield: 200,
      hp: 300,
      statuses: [{ type: 'shield_break', turnsRemaining: 2 }],
    };
    const unitsForBreak = battle.units.map((u) =>
      u.id === enemy.id ? brokenEnemy : u
    );
    const attackRes = resolveUnitAction(
      unitsForBreak,
      player.id,
      'attack',
      enemy.id,
      1,
      undefined,
      () => 0.99 // avoid dodge & crit
    );
    const enemyAfter = attackRes.updatedUnits.find((u) => u.id === enemy.id)!;
    expect(enemyAfter.shield).toBe(200); // Shield bypassed completely
    expect(enemyAfter.hp).toBeLessThan(300);

    // Burn ticks 8% maxHp at start of the burned unit's turn
    const burnedPlayer: CombatUnit = {
      ...player,
      hp: player.derived.maxHp,
      statuses: [{ type: 'burn', turnsRemaining: 2 }],
    };
    const unitsForBurn = battle.units.map((u) =>
      u.id === player.id ? burnedPlayer : u
    );
    const burnRes = resolveUnitAction(
      unitsForBurn,
      player.id,
      'defend',
      null,
      2,
      undefined,
      () => 0.5
    );
    const playerAfterBurn = burnRes.updatedUnits.find((u) => u.id === player.id)!;
    const expectedBurn = Math.max(
      5,
      Math.round(player.derived.maxHp * BALANCE_CONFIG.burnDamageRatio)
    );
    expect(playerAfterBurn.hp).toBe(player.derived.maxHp - expectedBurn);
    expect(hasStatus(playerAfterBurn, 'burn')).toBe(true); // 1 turn remaining
  });

  it('Sniper archetype always targets the lowest-HP opposing ship', () => {
    const pilot = createDefaultPilotAccount('Vance', 'striker');
    const battle = createInitialBattleState(
      pilot,
      SECTORS_CATALOG[0].id,
      createSequenceRng([0.1, 0.35, 0.6, 0.85])
    );
    const sniper = battle.units.find((u) => u.archetype === 'sniper')!;
    const lowestAlly = battle.units.find((u) => u.id === 'ally_npc_2')!;

    const tweakedUnits = battle.units.map((u) =>
      u.id === lowestAlly.id ? { ...u, hp: 15 } : u
    );
    const decision = chooseAiDecision(sniper, tweakedUnits, () => 0.99);
    expect(decision.targetId).toBe(lowestAlly.id);
  });
});
