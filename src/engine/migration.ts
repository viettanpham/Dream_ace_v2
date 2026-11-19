import { BALANCE_CONFIG } from '../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import {
  EMPTY_EQUIPPED_SLOT_IDS,
  EQUIPMENT_SLOTS,
  getItemTemplate,
  ITEM_TEMPLATES,
  LEGACY_ITEM_ID_TO_TEMPLATE,
} from '../data/items';
import { SECTORS_CATALOG } from '../data/maps';
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
import { createDefaultGearUnit, createDefaultPilotAccount } from './stats';

export const CURRENT_SAVE_VERSION = 4;

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

function convertLegacyItemInstance(
  raw: unknown,
  rng: () => number
): ItemInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Already new randomized ItemInstance format?
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

  // Legacy v2/v3 item format: { instanceId, itemId, enchantLevel }
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
 * Pure, crash-proof save migration from v1/v2/v3 (flat player state) or partial v4
 * into the canonical v4 per-Gear PilotAccount model.
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

  // Case A: Already v4 (`pilot` object present)
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
        const sigId = MECH_CLASSES[cls.id].signatureSkillId;
        const skillLv = Math.max(
          1,
          Math.min(
            BALANCE_CONFIG.skillMaxLevel,
            Number(rawGear.skillLevels?.[sigId]) || 1
          )
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
          skillLevels: { [sigId]: skillLv },
          battlesWon: Math.max(0, Number(rawGear.battlesWon) || 0),
          battlesFought: Math.max(0, Number(rawGear.battlesFought) || 0),
        };
      } else {
        gears[cls.id] = baseGear;
      }
    }

    // Ensure at least activeGearId is owned
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
        ? Array.from(new Set(rawPilot.unlockedSectorIds.filter((s) => typeof s === 'string')))
        : [SECTORS_CATALOG[0].id];

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
        inventory: rawInventory,
        gears,
        activeGearId: finalActiveGearId,
        unlockedSectorIds,
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

  // Case B: Legacy v1 / v2 / v3 save (`raw.player`) -> migrate into v4 per-Gear model!
  const legacyPlayer = (raw.player ?? {}) as Record<string, unknown>;
  const legacyClass: MechClassId = VALID_CLASSES.has(
    legacyPlayer.classId as MechClassId
  )
    ? (legacyPlayer.classId as MechClassId)
    : 'striker';

  const migratedInventory: ItemInstance[] = [];
  const equippedIds = { ...EMPTY_EQUIPPED_SLOT_IDS };

  // Migrate legacy equipped items into pilot.inventory and link onto legacyClass Gear
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

  // Migrate legacy bag items
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
      const sigId = MECH_CLASSES[cls.id].signatureSkillId;
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
        skillLevels: { [sigId]: 1 },
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
      inventory: migratedInventory,
      gears,
      activeGearId: legacyClass,
      unlockedSectorIds,
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
