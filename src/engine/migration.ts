import { BALANCE_CONFIG } from '../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASS_LIST } from '../data/classes';
import {
  EMPTY_EQUIPPED_SLOT_IDS,
  EQUIPMENT_SLOTS,
  getItemTemplate,
  ITEM_TEMPLATES,
  LEGACY_ITEM_ID_TO_TEMPLATE,
} from '../data/items';
import { SECTORS_CATALOG } from '../data/maps';
import {
  CLASS_STARTER_SKILLS,
  getOpeningCardById,
  getSkillById,
  LEGACY_SKILL_ID_MAP,
} from '../data/skills';
import type {
  AdminConfig,
  BattleSpeed,
  GearUnit,
  ItemInstance,
  Language,
  MechClassId,
  PilotAccount,
} from '../types/game';
import { generateItemInstance, generateShopStock } from './equipment';
import { isSkillAllowedForClass, MAX_ACTIVE_SKILL_BAR } from './skills';
import { createDefaultGearUnit, createDefaultPilotAccount } from './stats';

export const CURRENT_SAVE_VERSION = 5;

export interface PersistedCampaignState {
  pilot: PilotAccount;
  shopStock: ItemInstance[];
  selectedSectorId: string;
  hasSaveData: boolean;
  muted: boolean;
  battleSpeed: BattleSpeed;
  skipAnimations: boolean;
  language: Language;
  adminConfig: AdminConfig;
}

const VALID_CLASSES = new Set<MechClassId>([
  'striker',
  'interceptor',
  'siege',
  'support',
]);

const VALID_SPEEDS = new Set<BattleSpeed>([1, 2, 3, 5, 10]);

export function createDefaultAdminConfig(): AdminConfig {
  return {
    godMode: false,
    oneHitKills: false,
    alwaysWin: false,
    rewardMultiplier: BALANCE_CONFIG.rewardMultDefault,
  };
}

export function createFreshCampaignState(
  name = 'Vance',
  starterClassId: MechClassId = 'striker',
  rng: () => number = Math.random
): PersistedCampaignState {
  const starterWeapon = generateItemInstance(
    {
      templateId: 'tpl_mw_pulse_cannon',
      tier: 1,
      rarity: 'common',
      requiredLevel: 1,
    },
    rng
  );
  const pilot = createDefaultPilotAccount(name, starterClassId, [starterWeapon]);
  return {
    pilot,
    shopStock: generateShopStock(1, BALANCE_CONFIG.shopStockSize, rng),
    selectedSectorId: SECTORS_CATALOG[0].id,
    hasSaveData: false,
    muted: false,
    battleSpeed: 1,
    skipAnimations: false,
    language: 'vi',
    adminConfig: createDefaultAdminConfig(),
  };
}

function sanitizeGearSkills(
  classId: MechClassId,
  rawSkillLevels: unknown,
  rawEquippedBar: unknown
): { skillLevels: Record<string, number>; equippedSkillBar: string[] } {
  const cleanLevels: Record<string, number> = {};

  if (rawSkillLevels && typeof rawSkillLevels === 'object') {
    for (const [rawId, rawLv] of Object.entries(
      rawSkillLevels as Record<string, unknown>
    )) {
      const mappedId = LEGACY_SKILL_ID_MAP[rawId] ?? rawId;
      const skill = getSkillById(mappedId);
      if (!skill) continue;
      // Strictly strip any cross-class skill!
      if (!isSkillAllowedForClass(skill, classId)) continue;
      const lv = Math.max(
        1,
        Math.min(BALANCE_CONFIG.skillMaxLevel, Number(rawLv) || 1)
      );
      cleanLevels[mappedId] = Math.max(cleanLevels[mappedId] ?? 0, lv);
    }
  }

  // Ensure starter skills for this class are always learned at >= Lv 1
  for (const starterId of CLASS_STARTER_SKILLS[classId]) {
    if (!cleanLevels[starterId]) {
      cleanLevels[starterId] = 1;
    }
  }

  const cleanBar: string[] = [];
  if (Array.isArray(rawEquippedBar)) {
    for (const rawId of rawEquippedBar) {
      if (typeof rawId !== 'string') continue;
      const mappedId = LEGACY_SKILL_ID_MAP[rawId] ?? rawId;
      const skill = getSkillById(mappedId);
      if (
        skill &&
        skill.category !== 'passive' &&
        isSkillAllowedForClass(skill, classId) &&
        (cleanLevels[mappedId] ?? 0) >= 1 &&
        !cleanBar.includes(mappedId) &&
        cleanBar.length < MAX_ACTIVE_SKILL_BAR
      ) {
        cleanBar.push(mappedId);
      }
    }
  }

  if (cleanBar.length === 0) {
    for (const starterId of CLASS_STARTER_SKILLS[classId]) {
      const sk = getSkillById(starterId);
      if (sk && sk.category !== 'passive' && cleanBar.length < MAX_ACTIVE_SKILL_BAR) {
        cleanBar.push(starterId);
      }
    }
  }

  return { skillLevels: cleanLevels, equippedSkillBar: cleanBar };
}

function convertLegacyItemInstance(
  raw: unknown,
  rng: () => number
): ItemInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.instanceId === 'string' &&
    typeof obj.templateId === 'string' &&
    getItemTemplate(obj.templateId) &&
    obj.rolledBaseStats &&
    typeof obj.rolledBaseStats === 'object'
  ) {
    const tpl = getItemTemplate(obj.templateId)!;
    return {
      instanceId: obj.instanceId,
      templateId: tpl.id,
      slot: tpl.slot,
      tier: Math.max(1, Math.min(4, Number(obj.tier) || tpl.tier)),
      requiredLevel: Math.max(1, Number(obj.requiredLevel) || tpl.requiredLevel),
      classRestriction: tpl.classRestriction,
      rarity:
        obj.rarity === 'common' ||
        obj.rarity === 'rare' ||
        obj.rarity === 'epic' ||
        obj.rarity === 'legendary'
          ? obj.rarity
          : 'common',
      rolledBaseStats: obj.rolledBaseStats as ItemInstance['rolledBaseStats'],
      affixes: Array.isArray(obj.affixes) ? obj.affixes : [],
      suffixId: typeof obj.suffixId === 'string' ? obj.suffixId : null,
      rollQuality: Math.max(1, Math.min(100, Number(obj.rollQuality) || 50)),
      price: Math.max(60, Number(obj.price) || tpl.basePrice),
      enchantLevel: Math.max(
        0,
        Math.min(BALANCE_CONFIG.enchantMaxLevel, Number(obj.enchantLevel) || 0)
      ),
      specialTraits: tpl.specialTraits ? { ...tpl.specialTraits } : undefined,
    };
  }

  if (typeof obj.itemId === 'string') {
    const mappedTemplateId =
      LEGACY_ITEM_ID_TO_TEMPLATE[obj.itemId] ?? ITEM_TEMPLATES[0].id;
    const generated = generateItemInstance(
      {
        templateId: mappedTemplateId,
        rarity: 'rare',
        enchantLevel: Math.max(
          0,
          Math.min(BALANCE_CONFIG.enchantMaxLevel, Number(obj.enchantLevel) || 0)
        ),
      },
      rng
    );
    if (typeof obj.instanceId === 'string' && obj.instanceId.length > 0) {
      generated.instanceId = obj.instanceId;
    }
    return generated;
  }

  return null;
}

/**
 * Pure, crash-proof save migration from v1/v2/v3/v4 into canonical v5 (full Gear Skill System + War Points).
 */
export function migrateSaveData(
  persistedState: unknown,
  version: number,
  rng: () => number = Math.random
): PersistedCampaignState {
  const fallback = createFreshCampaignState('Vance', 'striker', rng);

  if (!persistedState || typeof persistedState !== 'object') {
    return fallback;
  }

  const raw = persistedState as Record<string, unknown>;
  const language: Language =
    raw.language === 'en' || raw.language === 'vi' ? raw.language : 'vi';
  const rawSpeed = Number(raw.battleSpeed) as BattleSpeed;
  const battleSpeed: BattleSpeed = VALID_SPEEDS.has(rawSpeed) ? rawSpeed : 1;
  const skipAnimations = Boolean(raw.skipAnimations);
  const muted = Boolean(raw.muted);
  const hasSaveData = Boolean(raw.hasSaveData);
  const selectedSectorId =
    typeof raw.selectedSectorId === 'string' &&
    SECTORS_CATALOG.some((s) => s.id === raw.selectedSectorId)
      ? raw.selectedSectorId
      : SECTORS_CATALOG[0].id;

  const rawAdmin = (raw.adminConfig ?? {}) as Partial<AdminConfig>;
  const adminConfig: AdminConfig = {
    godMode: Boolean(rawAdmin.godMode),
    oneHitKills: Boolean(rawAdmin.oneHitKills),
    alwaysWin: Boolean(rawAdmin.alwaysWin),
    rewardMultiplier:
      typeof rawAdmin.rewardMultiplier === 'number' &&
      rawAdmin.rewardMultiplier > 0
        ? rawAdmin.rewardMultiplier
        : BALANCE_CONFIG.rewardMultDefault,
  };

  // Case A: v4 / v5 (`pilot` object present)
  if (version >= 4 && raw.pilot && typeof raw.pilot === 'object') {
    const rawPilot = raw.pilot as Partial<PilotAccount>;
    const rawInventory = Array.isArray(rawPilot.inventory)
      ? rawPilot.inventory
          .map((it) => convertLegacyItemInstance(it, rng))
          .filter((it): it is ItemInstance => it !== null)
      : [];

    const invIds = new Set(rawInventory.map((i) => i.instanceId));
    const claimedIds = new Set<string>();

    const activeGearId: MechClassId = VALID_CLASSES.has(
      rawPilot.activeGearId as MechClassId
    )
      ? (rawPilot.activeGearId as MechClassId)
      : 'striker';

    const gears = {} as Record<MechClassId, GearUnit>;
    for (const cls of MECH_CLASS_LIST) {
      const rawGear = rawPilot.gears?.[cls.id];
      const baseGear = createDefaultGearUnit(cls.id, cls.id === activeGearId);
      if (rawGear && typeof rawGear === 'object') {
        const cleanEquipped = { ...EMPTY_EQUIPPED_SLOT_IDS };
        for (const slot of EQUIPMENT_SLOTS) {
          const refId = rawGear.equipped?.[slot];
          if (
            typeof refId === 'string' &&
            invIds.has(refId) &&
            !claimedIds.has(refId)
          ) {
            cleanEquipped[slot] = refId;
            claimedIds.add(refId);
          }
        }
        const { skillLevels, equippedSkillBar } = sanitizeGearSkills(
          cls.id,
          rawGear.skillLevels,
          rawGear.equippedSkillBar
        );
        gears[cls.id] = {
          classId: cls.id,
          owned: Boolean(rawGear.owned),
          level: Math.max(
            1,
            Math.min(BALANCE_CONFIG.maxLevel, Number(rawGear.level) || 1)
          ),
          exp: Math.max(0, Number(rawGear.exp) || 0),
          unspentPoints: Math.max(0, Number(rawGear.unspentPoints) || 0),
          allocatedPoints: {
            ...EMPTY_STAT_BLOCK,
            ...(rawGear.allocatedPoints ?? {}),
          },
          equipped: cleanEquipped,
          skillLevels,
          equippedSkillBar,
          battlesWon: Math.max(0, Number(rawGear.battlesWon) || 0),
          battlesFought: Math.max(0, Number(rawGear.battlesFought) || 0),
        };
      } else {
        gears[cls.id] = baseGear;
      }
    }

    if (!gears[activeGearId].owned) {
      const anyOwned = MECH_CLASS_LIST.find((c) => gears[c.id].owned);
      if (!anyOwned) {
        gears[activeGearId].owned = true;
      }
    }

    const finalActiveGearId = gears[activeGearId].owned
      ? activeGearId
      : MECH_CLASS_LIST.find((c) => gears[c.id].owned)?.id ?? 'striker';

    const unlockedSectorIds =
      Array.isArray(rawPilot.unlockedSectorIds) &&
      rawPilot.unlockedSectorIds.length > 0
        ? Array.from(
            new Set(
              rawPilot.unlockedSectorIds.filter((s) => typeof s === 'string')
            )
          )
        : [SECTORS_CATALOG[0].id];

    const capturedSectorIds = Array.isArray(rawPilot.capturedSectorIds)
      ? Array.from(
          new Set(rawPilot.capturedSectorIds.filter((s) => typeof s === 'string'))
        )
      : [];

    const ownedOpeningCards = Array.isArray(rawPilot.ownedOpeningCards)
      ? Array.from(
          new Set(
            rawPilot.ownedOpeningCards.filter(
              (id) => typeof id === 'string' && Boolean(getOpeningCardById(id))
            )
          )
        )
      : [];

    const rawShop = Array.isArray(raw.shopStock)
      ? raw.shopStock
          .map((it) => convertLegacyItemInstance(it, rng))
          .filter((it): it is ItemInstance => it !== null)
      : [];

    const activeGearLevel = gears[finalActiveGearId].level;

    return {
      pilot: {
        name:
          typeof rawPilot.name === 'string' && rawPilot.name.trim().length > 0
            ? rawPilot.name.slice(0, 18)
            : 'Vance',
        credits: Math.max(0, Number(rawPilot.credits) || 0),
        warPoints: Math.max(0, Number(rawPilot.warPoints) || 0),
        ownedOpeningCards,
        inventory: rawInventory,
        gears,
        activeGearId: finalActiveGearId,
        unlockedSectorIds,
        capturedSectorIds,
      },
      shopStock:
        rawShop.length > 0
          ? rawShop
          : generateShopStock(activeGearLevel, BALANCE_CONFIG.shopStockSize, rng),
      selectedSectorId,
      hasSaveData,
      muted,
      battleSpeed,
      skipAnimations,
      language,
      adminConfig,
    };
  }

  // Case B: Legacy v1 / v2 / v3 save (`raw.player`) -> migrate into v5 per-Gear model!
  const legacyPlayer = (raw.player ?? {}) as Record<string, unknown>;
  const legacyClass: MechClassId = VALID_CLASSES.has(
    legacyPlayer.classId as MechClassId
  )
    ? (legacyPlayer.classId as MechClassId)
    : 'striker';

  const migratedInventory: ItemInstance[] = [];
  const equippedIds = { ...EMPTY_EQUIPPED_SLOT_IDS };

  if (legacyPlayer.equipped && typeof legacyPlayer.equipped === 'object') {
    const eqMap = legacyPlayer.equipped as Record<string, unknown>;
    for (const slot of EQUIPMENT_SLOTS) {
      const converted = convertLegacyItemInstance(eqMap[slot], rng);
      if (converted && converted.slot === slot) {
        if (
          !converted.classRestriction ||
          converted.classRestriction === legacyClass
        ) {
          migratedInventory.push(converted);
          equippedIds[slot] = converted.instanceId;
        } else {
          migratedInventory.push(converted);
        }
      }
    }
  }

  if (Array.isArray(legacyPlayer.inventory)) {
    for (const item of legacyPlayer.inventory) {
      const converted = convertLegacyItemInstance(item, rng);
      if (converted) {
        migratedInventory.push(converted);
      }
    }
  }

  const gears = {} as Record<MechClassId, GearUnit>;
  for (const cls of MECH_CLASS_LIST) {
    if (cls.id === legacyClass) {
      const { skillLevels, equippedSkillBar } = sanitizeGearSkills(
        cls.id,
        undefined,
        undefined
      );
      gears[cls.id] = {
        classId: cls.id,
        owned: true,
        level: Math.max(
          1,
          Math.min(BALANCE_CONFIG.maxLevel, Number(legacyPlayer.level) || 1)
        ),
        exp: Math.max(0, Number(legacyPlayer.exp) || 0),
        unspentPoints: Math.max(
          0,
          Number(legacyPlayer.unspentPoints) ?? BALANCE_CONFIG.initialStatPoints
        ),
        allocatedPoints: {
          ...EMPTY_STAT_BLOCK,
          ...((legacyPlayer.allocatedPoints as Record<string, number>) ?? {}),
        },
        equipped: equippedIds,
        skillLevels,
        equippedSkillBar,
        battlesWon: Math.max(0, Number(legacyPlayer.battlesWon) || 0),
        battlesFought: Math.max(0, Number(legacyPlayer.battlesFought) || 0),
      };
    } else {
      gears[cls.id] = createDefaultGearUnit(cls.id, false);
    }
  }

  const migratedLevel = gears[legacyClass].level;
  const unlockedSectorIds = [SECTORS_CATALOG[0].id];
  if (gears[legacyClass].battlesWon >= 1) {
    unlockedSectorIds.push(SECTORS_CATALOG[1].id);
  }
  if (gears[legacyClass].battlesWon >= 3) {
    unlockedSectorIds.push(SECTORS_CATALOG[2].id);
  }

  return {
    pilot: {
      name:
        typeof legacyPlayer.name === 'string' &&
        legacyPlayer.name.trim().length > 0
          ? legacyPlayer.name.slice(0, 18)
          : 'Vance',
      credits: Math.max(
        0,
        Number(legacyPlayer.credits) ?? BALANCE_CONFIG.startingCredits
      ),
      warPoints: 0,
      ownedOpeningCards: [],
      inventory: migratedInventory,
      gears,
      activeGearId: legacyClass,
      unlockedSectorIds,
      capturedSectorIds: [],
    },
    shopStock: generateShopStock(
      migratedLevel,
      BALANCE_CONFIG.shopStockSize,
      rng
    ),
    selectedSectorId,
    hasSaveData: hasSaveData || gears[legacyClass].battlesFought > 0,
    muted,
    battleSpeed,
    skipAnimations,
    language,
    adminConfig,
  };
}
