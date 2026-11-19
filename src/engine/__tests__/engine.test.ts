import { describe, expect, it } from 'vitest';
import { BALANCE_CONFIG } from '../../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASSES } from '../../data/classes';
import { EQUIPMENT_SLOTS, ITEM_TEMPLATES } from '../../data/items';
import { SECTORS_CATALOG } from '../../data/maps';
import {
  getScaledSkillStats,
  getSkillById,
  OPENING_CARDS_LIST,
  SKILLS_LIST,
} from '../../data/skills';
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
  buyOpeningCard,
  canUnitUseSkill,
  equipSkillToGearBar,
  getGearPassiveBonuses,
  getRequiredGearLevelForSkillLevel,
  getSkillsForClass,
  learnOrUpgradeSkillOnGear,
  MAX_ACTIVE_SKILL_BAR,
  unequipSkillFromGearBar,
  validateEquipSkillOnBar,
  validateLearnOrUpgradeSkill,
} from '../skills';
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
      4 *
      calculateSingleEnemyReward(1, false).exp *
      BALANCE_CONFIG.rewardMultDefault;

    let battles = 0;
    while (gear.level < 5 && battles < 12) {
      battles += 1;
      gear = applyExpToGear(gear, singleBattleExp, { won: true }).updatedGear;
    }

    expect(gear.level).toBeGreaterThanOrEqual(5);
    expect(battles).toBeLessThanOrEqual(8);
    expect(
      estimateBattlesToNextLevel(pilot.gears.interceptor, singleBattleExp)
    ).toBe(1);
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
    expect(newStats.attack).toBe(
      baseStats.attack + 2 * cls.perPointGain.attack
    );
    expect(newStats.evasion).toBe(
      baseStats.evasion + 1 * cls.perPointGain.evasion
    );

    const rejected = allocateGearStats(updated, { attack: 1 });
    expect(rejected).toBe(updated);

    const reset = resetGearStatAllocations(updated);
    expect(reset.allocatedPoints).toEqual(EMPTY_STAT_BLOCK);
    expect(reset.unspentPoints).toBe(BALANCE_CONFIG.initialStatPoints);
  });

  it('includes equipped item rolled stats, enchant scaling, and special traits in derived stats', () => {
    const pilot = createDefaultPilotAccount('Vance', 'striker');
    const railLance = generateItemInstance(
      {
        templateId: 'tpl_mw_rail_lance',
        tier: 2,
        rarity: 'epic',
        requiredLevel: 1,
        enchantLevel: 5,
      },
      () => 0.5
    );
    pilot.inventory.push(railLance);
    const equippedPilot = equipItemOnGear(
      pilot,
      'striker',
      railLance.instanceId
    ).pilot;
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
    const derived = calculateDerivedStats(
      gear.classId,
      gear.level,
      effective,
      traits
    );
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

      expect(lowRoll.affixes).toHaveLength(
        BALANCE_CONFIG.rarityAffixCount[rarity]
      );
      expect(highRoll.affixes).toHaveLength(
        BALANCE_CONFIG.rarityAffixCount[rarity]
      );
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

    const baseEff = getEffectiveItemStats(tier1, 0);
    const plus5Eff = getEffectiveItemStats(tier1, 5);
    expect(plus5Eff.attack).toBe(Math.round(baseEff.attack * 1.4));
  });

  it('generates randomized shop stock covering all 6 equipment slots', () => {
    const stock = generateShopStock(
      5,
      12,
      createSequenceRng([0.15, 0.45, 0.75, 0.92])
    );
    expect(stock).toHaveLength(12);
    const slotsPresent = new Set(stock.map((i) => i.slot));
    for (const slot of EQUIPMENT_SLOTS) {
      expect(slotsPresent.has(slot)).toBe(true);
    }
    const uniqueIds = new Set(stock.map((i) => i.instanceId));
    expect(uniqueIds.size).toBe(12);
  });
});

describe('4. Rebalanced Reward Formula (Victory vs Defeat & Boss + War Points)', () => {
  function makeEnemy(
    id: string,
    level: number,
    alive: boolean,
    isBoss = false
  ): CombatUnit {
    return {
      id,
      name: id,
      callsign: isBoss ? 'BOSS' : 'Hostile',
      side: 'enemy',
      row: 'front',
      isPlayer: false,
      classId: 'striker',
      archetype: 'gunship',
      isBoss,
      level,
      skillLevel: 1,
      skillLevels: { str_hotload_shells: 1 },
      equippedSkillIds: ['str_hotload_shells'],
      skillCooldowns: {},
      usedOnceSkills: [],
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
        passiveSkillDmgPct: 0,
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

  it('matches EXP = 25 + 8*lv, Credits = 60 + 20*lv, War Points = 4 + lv, and x5 for bosses', () => {
    expect(calculateSingleEnemyReward(1, false)).toEqual({
      exp: 33,
      credits: 80,
      warPoints: 5,
    });
    expect(calculateSingleEnemyReward(5, false)).toEqual({
      exp: 65,
      credits: 160,
      warPoints: 9,
    });
    expect(calculateSingleEnemyReward(5, true)).toEqual({
      exp: 325,
      credits: 800,
      warPoints: 45,
    });
  });

  it('grants 100% on victory (+ first-capture WP bonus) and 50% destroyed + 20% consolation on defeat', () => {
    const enemies = [
      makeEnemy('e1', 2, false),
      makeEnemy('e2', 2, false),
      makeEnemy('e3', 2, true),
      makeEnemy('e4', 2, true),
    ];
    const victoryFirstCapture = calculateBattleRewards(
      enemies,
      true,
      2.0,
      SECTORS_CATALOG[0].id,
      false
    );
    expect(victoryFirstCapture.fullVictoryExp).toBe(328);
    expect(victoryFirstCapture.fullVictoryCredits).toBe(800);
    expect(victoryFirstCapture.expGained).toBe(328);
    expect(victoryFirstCapture.creditsGained).toBe(800);
    expect(victoryFirstCapture.baseCaptureBonusWp).toBe(
      BALANCE_CONFIG.warPointsBaseCaptureBonus.Standard
    );
    expect(victoryFirstCapture.warPointsGained).toBeGreaterThan(
      BALANCE_CONFIG.warPointsBaseCaptureBonus.Standard
    );

    const defeatHalf = calculateBattleRewards(enemies, false, 2.0);
    expect(defeatHalf.expGained).toBe(Math.round(82 + 65.6));
    expect(defeatHalf.creditsGained).toBe(360);
    expect(defeatHalf.baseCaptureBonusWp).toBe(0);

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

    const eq1 = equipItemOnGear(pilot, 'striker', universalWeapon.instanceId);
    expect(eq1.validation.canEquip).toBe(true);
    pilot = eq1.pilot;
    expect(getItemEquippedByGear(pilot.gears, universalWeapon.instanceId)).toBe(
      'striker'
    );

    const eq2 = equipItemOnGear(
      pilot,
      'interceptor',
      universalWeapon.instanceId
    );
    expect(eq2.validation.canEquip).toBe(false);
    expect(eq2.validation.equippedOnOtherGear).toBe('striker');

    pilot = unequipSlotOnGear(pilot, 'striker', 'main_weapon');
    const eq3 = equipItemOnGear(
      pilot,
      'interceptor',
      universalWeapon.instanceId
    );
    expect(eq3.validation.canEquip).toBe(true);
    pilot = eq3.pilot;
    expect(getItemEquippedByGear(pilot.gears, universalWeapon.instanceId)).toBe(
      'interceptor'
    );

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

    const tooLow = validateEquipOnGear(
      highLevelWeapon,
      pilot.gears.striker,
      pilot.gears
    );
    expect(tooLow.canEquip).toBe(false);
    expect(tooLow.missingLevel).toBe(8);
  });
});

describe('6. Save Migration (v1 / v2 / v3 / v4 / Corrupt -> v5 Skill System)', () => {
  it('migrates legacy v3 save and strips illegal cross-class skills from v4 saves', () => {
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
    expect(migrated.pilot.warPoints).toBeGreaterThanOrEqual(0);
    expect(migrated.pilot.gears.siege.equippedSkillBar.length).toBeGreaterThan(0);
    expect(
      migrated.pilot.gears.siege.equippedSkillBar.every((id) => {
        const sk = getSkillById(id);
        return sk && (sk.classScope === 'general' || sk.classScope === 'siege');
      })
    ).toBe(true);

    // Verify v4 save with injected cross-class skill gets sanitized
    const tamperedV4 = createDefaultPilotAccount('Vance', 'striker');
    tamperedV4.gears.striker.skillLevels['sge_starbreaker_lance'] = 3;
    tamperedV4.gears.striker.equippedSkillBar.push('sge_starbreaker_lance');
    const sanitized = migrateSaveData({ pilot: tamperedV4 }, 4, () => 0.5);
    expect(
      sanitized.pilot.gears.striker.skillLevels['sge_starbreaker_lance']
    ).toBeUndefined();
    expect(
      sanitized.pilot.gears.striker.equippedSkillBar.includes(
        'sge_starbreaker_lance'
      )
    ).toBe(false);
  });

  it('handles null/corrupt payloads safely by returning a valid default campaign', () => {
    const fromNull = migrateSaveData(null, 1, () => 0.5);
    expect(fromNull.pilot.gears[fromNull.pilot.activeGearId].owned).toBe(true);
    expect(fromNull.shopStock.length).toBeGreaterThan(0);

    const fromBroken = migrateSaveData(
      { pilot: { activeGearId: 'invalid' } },
      4,
      () => 0.5
    );
    expect(fromBroken.pilot.gears[fromBroken.pilot.activeGearId].owned).toBe(
      true
    );
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

    const slowedUnit: CombatUnit = {
      ...player,
      statuses: [{ type: 'slow', turnsRemaining: 2 }],
    };
    expect(getEffectiveUnitSpeed(slowedUnit)).toBe(
      Math.max(
        1,
        Math.round(player.derived.speed * (1 - BALANCE_CONFIG.slowSpeedPenalty))
      )
    );

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
      () => 0.99
    );
    const enemyAfter = attackRes.updatedUnits.find((u) => u.id === enemy.id)!;
    expect(enemyAfter.shield).toBe(200);
    expect(enemyAfter.hp).toBeLessThan(300);

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
    const playerAfterBurn = burnRes.updatedUnits.find(
      (u) => u.id === player.id
    )!;
    const expectedBurn = Math.max(
      5,
      Math.round(player.derived.maxHp * BALANCE_CONFIG.burnDamageRatio)
    );
    expect(playerAfterBurn.hp).toBe(player.derived.maxHp - expectedBurn);
    expect(hasStatus(playerAfterBurn, 'burn')).toBe(true);
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

describe('8. Gear Skill System — Class Locks & Per-Point Stat Gains', () => {
  it('matches exact per-point stat gains for all 4 Gear classes', () => {
    expect(MECH_CLASSES.siege.perPointGain).toEqual({
      attack: 4,
      evasion: 1,
      defense: 3,
      shield: 4,
      spirit: 3,
      fuel: 3,
    });
    expect(MECH_CLASSES.striker.perPointGain).toEqual({
      attack: 3,
      evasion: 3,
      defense: 3,
      shield: 3,
      spirit: 3,
      fuel: 3,
    });
    expect(MECH_CLASSES.interceptor.perPointGain).toEqual({
      attack: 4,
      defense: 2,
      evasion: 4,
      shield: 2,
      spirit: 2,
      fuel: 2,
    });
    expect(MECH_CLASSES.support.perPointGain).toEqual({
      defense: 4,
      fuel: 3,
      attack: 2,
      evasion: 2,
      shield: 3,
      spirit: 4,
    });
  });

  it('enforces class-lock in the engine for learning, equipping, and casting skills', () => {
    expect(SKILLS_LIST.length).toBe(38);
    const pilot = createDefaultPilotAccount('Kira', 'striker');
    pilot.credits = 50000;
    pilot.gears.striker.level = 30;

    // Striker catalog contains ONLY striker + general skills
    const strikerSkills = getSkillsForClass('striker');
    expect(
      strikerSkills.every(
        (s) => s.classScope === 'striker' || s.classScope === 'general'
      )
    ).toBe(true);

    // Engine rejects learning Siege/Interceptor/Support skills on Striker
    const learnSiege = validateLearnOrUpgradeSkill(
      pilot,
      'striker',
      'sge_anchor_protocol'
    );
    expect(learnSiege.ok).toBe(false);
    expect(learnSiege.reason).toBe('class_mismatch');

    const learnSupport = learnOrUpgradeSkillOnGear(
      pilot,
      'striker',
      'sup_nanite_mend'
    );
    expect(learnSupport.validation.ok).toBe(false);
    expect(learnSupport.validation.reason).toBe('class_mismatch');
    expect(learnSupport.pilot.credits).toBe(50000);

    // Engine rejects equipping a cross-class skill onto Striker's bar
    const eqCross = validateEquipSkillOnBar(
      pilot.gears.striker,
      'int_sabot_burst'
    );
    expect(eqCross.ok).toBe(false);
    expect(eqCross.reason).toBe('class_mismatch');

    // Engine ALLOWS General skills on any class
    const learnGeneral = learnOrUpgradeSkillOnGear(
      pilot,
      'striker',
      'gen_thruster_feint'
    );
    expect(learnGeneral.validation.ok).toBe(true);
    expect(learnGeneral.newLevel).toBe(1);

    // Battle engine rejects casting cross-class skill even if injected
    const battle = createInitialBattleState(pilot, SECTORS_CATALOG[0].id);
    const playerUnit = battle.units.find((u) => u.isPlayer)!;
    const crossUsability = canUnitUseSkill(playerUnit, 'sup_nanite_mend');
    expect(crossUsability.canUse).toBe(false);
    expect(crossUsability.reason).toBe('class_mismatch');
  });
});

describe('9. Per-Gear Skill Bars (Max 6), Passives Always ON, & Level Gate', () => {
  it('enforces max 6 active skills, rejects passives on bar, keeps Gear bars independent, and applies passives to stats', () => {
    let pilot = createDefaultPilotAccount('Vance', 'striker');
    pilot.credits = 100000;
    pilot.gears.striker.level = 30;
    pilot.gears.siege.owned = true;
    pilot.gears.siege.level = 30;

    // Learn enough Striker + General active skills to exceed 6
    const activeIds = [
      'str_hotload_shells',
      'str_ordnance_amp',
      'str_deadeye_link',
      'str_viper_sweep',
      'str_carpet_salvo',
      'str_solar_capacitor',
      'gen_hull_brace',
      'gen_thruster_feint',
    ];
    for (const id of activeIds) {
      if ((pilot.gears.striker.skillLevels[id] ?? 0) === 0) {
        pilot = learnOrUpgradeSkillOnGear(pilot, 'striker', id).pilot;
      }
    }

    // Auto-slotting caps strictly at 6
    expect(pilot.gears.striker.equippedSkillBar).toHaveLength(
      MAX_ACTIVE_SKILL_BAR
    );

    // Attempting to equip a 7th active skill fails with 'bar_full'
    const unslottedId = activeIds.find(
      (id) => !pilot.gears.striker.equippedSkillBar.includes(id)
    )!;
    const eq7th = equipSkillToGearBar(pilot, 'striker', unslottedId);
    expect(eq7th.validation.ok).toBe(false);
    expect(eq7th.validation.reason).toBe('bar_full');

    // Unequipping one frees a slot for the 7th skill
    const removedId = pilot.gears.striker.equippedSkillBar[0];
    pilot = unequipSkillFromGearBar(pilot, 'striker', removedId);
    expect(pilot.gears.striker.equippedSkillBar).toHaveLength(5);
    const eqAfterFree = equipSkillToGearBar(pilot, 'striker', unslottedId);
    expect(eqAfterFree.validation.ok).toBe(true);
    pilot = eqAfterFree.pilot;
    expect(pilot.gears.striker.equippedSkillBar).toHaveLength(6);

    // Siege's skill bar remains completely independent of Striker's changes
    expect(pilot.gears.siege.equippedSkillBar).toEqual([
      'sge_anchor_protocol',
      'gen_hull_brace',
    ]);

    // Passive skills cannot be placed on the active bar, but apply permanently once learned
    const baseDerived = calculateDerivedStats(
      'striker',
      30,
      calculateEffectiveStats('striker', 30, pilot.gears.striker.allocatedPoints)
    );
    pilot = learnOrUpgradeSkillOnGear(
      pilot,
      'striker',
      'str_passive_ordnance'
    ).pilot;
    pilot = learnOrUpgradeSkillOnGear(
      pilot,
      'striker',
      'str_passive_ordnance'
    ).pilot; // Lv 2 -> +10% skill dmg
    const eqPassive = equipSkillToGearBar(
      pilot,
      'striker',
      'str_passive_ordnance'
    );
    expect(eqPassive.validation.ok).toBe(false);
    expect(eqPassive.validation.reason).toBe('is_passive');

    const passives = getGearPassiveBonuses(pilot.gears.striker);
    expect(passives.skillDmgPct).toBeCloseTo(0.1, 3);
    const withPassiveDerived = calculateDerivedStats(
      'striker',
      30,
      calculateEffectiveStats(
        'striker',
        30,
        pilot.gears.striker.allocatedPoints,
        EMPTY_STAT_BLOCK,
        EMPTY_STAT_BLOCK,
        {},
        passives
      ),
      {},
      passives
    );
    expect(withPassiveDerived.passiveSkillDmgPct).toBeCloseTo(0.1, 3);
    expect(baseDerived.passiveSkillDmgPct).toBe(0);
  });

  it('enforces Gear level gate unlockLevel + 4*(n-1) and +10% effect scaling per level', () => {
    const skill = getSkillById('str_viper_sweep')!; // unlockLevel: 8, powerMultiplier: 0.6
    expect(getRequiredGearLevelForSkillLevel(skill, 1)).toBe(8);
    expect(getRequiredGearLevelForSkillLevel(skill, 2)).toBe(12);
    expect(getRequiredGearLevelForSkillLevel(skill, 3)).toBe(16);
    expect(getRequiredGearLevelForSkillLevel(skill, 5)).toBe(24);

    expect(getScaledSkillStats(skill, 1).powerMultiplier).toBe(0.6);
    expect(getScaledSkillStats(skill, 5).powerMultiplier).toBe(0.84); // 0.6 * 1.4

    const pilot = createDefaultPilotAccount('Kira', 'striker');
    pilot.credits = 50000;
    pilot.gears.striker.level = 7; // 1 level below unlockLevel 8
    const tooLow = validateLearnOrUpgradeSkill(
      pilot,
      'striker',
      'str_viper_sweep'
    );
    expect(tooLow.ok).toBe(false);
    expect(tooLow.reason).toBe('level_too_low');
    expect(tooLow.requiredGearLevel).toBe(8);
  });
});

describe('10. War Point Shop & Special/Elite Opening Cards', () => {
  it('blocks Special/Elite learning without Opening Card, enforces WP cost, and unlocks after purchase', () => {
    expect(OPENING_CARDS_LIST.length).toBe(9);
    let pilot = createDefaultPilotAccount('Ace', 'siege');
    pilot.credits = 100000;
    pilot.warPoints = 50; // Not enough for Elite card (160 WP)
    pilot.gears.siege.level = 30;

    // Cannot learn Elite Starbreaker Lance without Opening Card
    const blockedNoCard = validateLearnOrUpgradeSkill(
      pilot,
      'siege',
      'sge_starbreaker_lance'
    );
    expect(blockedNoCard.ok).toBe(false);
    expect(blockedNoCard.reason).toBe('missing_card');
    expect(blockedNoCard.requiredCardId).toBe('card_sge_starbreaker_lance');

    // Buying card with insufficient WP fails
    const buyFail = buyOpeningCard(pilot, 'card_sge_starbreaker_lance');
    expect(buyFail.ok).toBe(false);
    expect(buyFail.reason).toBe('insufficient_wp');

    // Grant WP and purchase card
    pilot.warPoints = 200;
    const buyOk = buyOpeningCard(pilot, 'card_sge_starbreaker_lance');
    expect(buyOk.ok).toBe(true);
    expect(buyOk.pilot.warPoints).toBe(40);
    expect(
      buyOk.pilot.ownedOpeningCards.includes('card_sge_starbreaker_lance')
    ).toBe(true);
    pilot = buyOk.pilot;

    // Duplicate purchase rejected
    const buyDup = buyOpeningCard(pilot, 'card_sge_starbreaker_lance');
    expect(buyDup.ok).toBe(false);
    expect(buyDup.reason).toBe('already_owned');

    // Now Elite skill can be learned with Credits
    const learnElite = learnOrUpgradeSkillOnGear(
      pilot,
      'siege',
      'sge_starbreaker_lance'
    );
    expect(learnElite.validation.ok).toBe(true);
    expect(learnElite.newLevel).toBe(1);
  });
});

describe('11. Battle Skill Mechanics (SP, CD, Once-Per-Battle, Silence, Siege, Charge, Counter, Scan)', () => {
  it('deducts SP, sets & decrements cooldowns, enforces Elite once-per-battle, and blocks skills when Silenced', () => {
    const pilot = createDefaultPilotAccount('Ace', 'striker');
    pilot.gears.striker.level = 30;
    pilot.gears.striker.skillLevels = {
      str_viper_sweep: 1,
      str_skyfall_protocol: 1,
      gen_hull_brace: 1,
    };
    pilot.gears.striker.equippedSkillBar = [
      'str_viper_sweep',
      'str_skyfall_protocol',
      'gen_hull_brace',
    ];

    const battle = createInitialBattleState(
      pilot,
      SECTORS_CATALOG[0].id,
      createSequenceRng([0.2, 0.5, 0.8])
    );
    const enemy = battle.units.find((u) => u.side === 'enemy')!;
    let units = battle.units.map((u) =>
      u.isPlayer ? { ...u, sp: 100, derived: { ...u.derived, maxSp: 120 } } : u
    );

    // 1) Cast Viper Strafe (SP 18, CD 3)
    const cast1 = resolveUnitAction(
      units,
      'ally_player',
      'skill',
      enemy.id,
      1,
      undefined,
      () => 0.99,
      'str_viper_sweep'
    );
    units = cast1.updatedUnits;
    const pAfter1 = units.find((u) => u.isPlayer)!;
    expect(pAfter1.sp).toBe(82);
    expect(pAfter1.skillCooldowns['str_viper_sweep']).toBe(3);
    expect(canUnitUseSkill(pAfter1, 'str_viper_sweep').canUse).toBe(false);
    expect(canUnitUseSkill(pAfter1, 'str_viper_sweep').reason).toBe(
      'on_cooldown'
    );

    // 2) Cast Elite Skyfall Saturation (SP 60, oncePerBattle: true)
    const castElite = resolveUnitAction(
      units,
      'ally_player',
      'skill',
      enemy.id,
      2,
      undefined,
      () => 0.99,
      'str_skyfall_protocol'
    );
    units = castElite.updatedUnits;
    const pAfterElite = units.find((u) => u.isPlayer)!;
    // Start of turn 2 decremented Viper Strafe CD from 3 -> 2
    expect(pAfterElite.skillCooldowns['str_viper_sweep']).toBe(2);
    expect(pAfterElite.usedOnceSkills.includes('str_skyfall_protocol')).toBe(
      true
    );

    // Even with full SP refilled, Elite skill cannot be used a second time
    const pRefilled: CombatUnit = { ...pAfterElite, sp: 120 };
    const eliteSecond = canUnitUseSkill(pRefilled, 'str_skyfall_protocol');
    expect(eliteSecond.canUse).toBe(false);
    expect(eliteSecond.reason).toBe('already_used');

    // 3) Silence blocks all active skills
    const pSilenced: CombatUnit = {
      ...pRefilled,
      statuses: [{ type: 'silence', turnsRemaining: 2, isDebuff: true }],
    };
    const silencedCheck = canUnitUseSkill(pSilenced, 'gen_hull_brace');
    expect(silencedCheck.canUse).toBe(false);
    expect(silencedCheck.reason).toBe('silenced');
  });

  it('handles Siege Mode toggle & Camouflage conflict, Charge Shot 2-turn release, Counter riposte, and Lidar Scan reveal', () => {
    // A) Siege Mode toggle ON -> blocks Thermal Masking -> toggle OFF costs 0 SP
    const siegePilot = createDefaultPilotAccount('Iron', 'siege');
    siegePilot.gears.siege.level = 25;
    siegePilot.gears.siege.skillLevels = {
      sge_anchor_protocol: 1,
      sge_thermal_mask: 1,
    };
    siegePilot.gears.siege.equippedSkillBar = [
      'sge_anchor_protocol',
      'sge_thermal_mask',
    ];
    const siegeBattle = createInitialBattleState(
      siegePilot,
      SECTORS_CATALOG[0].id
    );
    let siegeUnits = siegeBattle.units.map((u) =>
      u.isPlayer ? { ...u, sp: 50 } : u
    );

    siegeUnits = resolveUnitAction(
      siegeUnits,
      'ally_player',
      'skill',
      null,
      1,
      undefined,
      () => 0.99,
      'sge_anchor_protocol'
    ).updatedUnits;
    const pSiegeOn = siegeUnits.find((u) => u.isPlayer)!;
    expect(hasStatus(pSiegeOn, 'siege_mode')).toBe(true);
    expect(pSiegeOn.sp).toBe(38); // -12 SP
    expect(canUnitUseSkill(pSiegeOn, 'sge_thermal_mask').reason).toBe(
      'blocked_by_siege'
    );

    // Toggle Siege Mode OFF -> costs 0 SP
    siegeUnits = resolveUnitAction(
      siegeUnits,
      'ally_player',
      'skill',
      null,
      2,
      undefined,
      () => 0.99,
      'sge_anchor_protocol'
    ).updatedUnits;
    const pSiegeOff = siegeUnits.find((u) => u.isPlayer)!;
    expect(hasStatus(pSiegeOff, 'siege_mode')).toBe(false);
    expect(pSiegeOff.sp).toBe(38); // 0 SP to turn off
    expect(canUnitUseSkill(pSiegeOff, 'sge_thermal_mask').canUse).toBe(true);

    // B) Charge Shot (2-turn execution)
    const strPilot = createDefaultPilotAccount('Nova', 'striker');
    strPilot.gears.striker.level = 20;
    strPilot.gears.striker.skillLevels = { str_solar_capacitor: 1 };
    strPilot.gears.striker.equippedSkillBar = ['str_solar_capacitor'];
    const strBattle = createInitialBattleState(strPilot, SECTORS_CATALOG[0].id);
    const strEnemy = strBattle.units.find((u) => u.side === 'enemy')!;
    let strUnits = strBattle.units.map((u) =>
      u.isPlayer ? { ...u, sp: 50 } : u.id === strEnemy.id ? { ...u, hp: 999, shield: 0 } : u
    );

    // Turn 1: starts charging
    strUnits = resolveUnitAction(
      strUnits,
      'ally_player',
      'skill',
      strEnemy.id,
      1,
      undefined,
      () => 0.99,
      'str_solar_capacitor'
    ).updatedUnits;
    expect(hasStatus(strUnits.find((u) => u.isPlayer)!, 'charging')).toBe(true);
    expect(strUnits.find((u) => u.id === strEnemy.id)!.hp).toBe(999);

    // Turn 2: auto-fires charged devastation shot
    strUnits = resolveUnitAction(
      strUnits,
      'ally_player',
      'attack',
      strEnemy.id,
      2,
      undefined,
      () => 0.99
    ).updatedUnits;
    expect(hasStatus(strUnits.find((u) => u.isPlayer)!, 'charging')).toBe(false);
    expect(strUnits.find((u) => u.id === strEnemy.id)!.hp).toBeLessThan(999);

    // C) Lidar Scan reveals stealth and applies Vulnerable
    const supPilot = createDefaultPilotAccount('Echo', 'support');
    supPilot.gears.support.level = 10;
    supPilot.gears.support.skillLevels = { sup_lidar_sweep: 1 };
    supPilot.gears.support.equippedSkillBar = ['sup_lidar_sweep'];
    const supBattle = createInitialBattleState(supPilot, SECTORS_CATALOG[0].id);
    let supUnits = supBattle.units.map((u) =>
      u.isPlayer
        ? { ...u, sp: 40 }
        : u.side === 'enemy'
        ? { ...u, statuses: [{ type: 'stealth' as const, turnsRemaining: 2 }] }
        : u
    );
    supUnits = resolveUnitAction(
      supUnits,
      'ally_player',
      'skill',
      null,
      1,
      undefined,
      () => 0.99,
      'sup_lidar_sweep'
    ).updatedUnits;
    const enemiesAfterScan = supUnits.filter((u) => u.side === 'enemy');
    expect(enemiesAfterScan.every((e) => !hasStatus(e, 'stealth'))).toBe(true);
    expect(enemiesAfterScan.every((e) => hasStatus(e, 'vulnerable'))).toBe(true);

    // D) Snap-Turn Riposte counter-attacks incoming enemy hit
    const intPilot = createDefaultPilotAccount('Dart', 'interceptor');
    intPilot.gears.interceptor.level = 10;
    intPilot.gears.interceptor.skillLevels = { int_snap_riposte: 1 };
    intPilot.gears.interceptor.equippedSkillBar = ['int_snap_riposte'];
    const intBattle = createInitialBattleState(intPilot, SECTORS_CATALOG[0].id);
    const attackerEnemy = intBattle.units.find((u) => u.side === 'enemy')!;
    let intUnits = intBattle.units.map((u) =>
      u.isPlayer
        ? { ...u, sp: 40 }
        : u.id === attackerEnemy.id
        ? { ...u, hp: 500, shield: 0 }
        : u
    );
    intUnits = resolveUnitAction(
      intUnits,
      'ally_player',
      'skill',
      null,
      1,
      undefined,
      () => 0.99,
      'int_snap_riposte'
    ).updatedUnits;
    expect(hasStatus(intUnits.find((u) => u.isPlayer)!, 'counter')).toBe(true);

    const counterRes = resolveUnitAction(
      intUnits,
      attackerEnemy.id,
      'attack',
      'ally_player',
      1,
      undefined,
      () => 0.99
    );
    const enemyAfterRiposte = counterRes.updatedUnits.find(
      (u) => u.id === attackerEnemy.id
    )!;
    expect(enemyAfterRiposte.hp).toBeLessThan(500);
    expect(
      counterRes.logEntries.some((l) => l.templateKey === 'log.counterAttack')
    ).toBe(true);
  });
});
