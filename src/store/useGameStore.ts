import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EMPTY_STAT_BLOCK, STAT_KEYS } from '../data/classes';
import {
  EMPTY_EQUIPPED_ITEMS,
  EQUIPMENT_SLOTS,
  getItemDefinition,
} from '../data/items';
import { SECTORS_CATALOG } from '../data/maps';
import { PROGRESSION_CONFIG } from '../data/progression';
import {
  calculateBattleRewards,
  chooseAiDecision,
  createInitialBattleState,
  resolveUnitAction,
} from '../engine/combat';
import {
  createItemInstance,
  getSellPrice,
  resolveEnchantAttempt,
  rollBattleItemDrops,
  unequipIncompatibleForClass,
  validateEquipRequirement,
} from '../engine/equipment';
import {
  applyRewardsToPlayer,
  getTotalAvailablePointsForLevel,
  getTotalSpentPoints,
} from '../engine/stats';
import type {
  ActionType,
  BattleState,
  EnchantAttemptResult,
  EquipmentSlot,
  EquippedItems,
  EquipValidationResult,
  ItemInstance,
  Language,
  MechClassId,
  PlayerCharacter,
  ScreenState,
  StatBlock,
} from '../types/game';
import { soundFx } from '../utils/sound';

const SAVE_VERSION = 3;

const createDefaultPlayer = (): PlayerCharacter => ({
  name: 'Vance',
  level: PROGRESSION_CONFIG.startingLevel,
  exp: 0,
  credits: PROGRESSION_CONFIG.startingCredits,
  classId: 'striker',
  unspentPoints: PROGRESSION_CONFIG.initialStatPoints,
  allocatedPoints: { ...EMPTY_STAT_BLOCK },
  equipped: { ...EMPTY_EQUIPPED_ITEMS },
  inventory: [createItemInstance('mw_pulse_carbine', 0)],
  battlesWon: 0,
  battlesFought: 0,
});

function sanitizeEquipped(raw: unknown): EquippedItems {
  const result: EquippedItems = { ...EMPTY_EQUIPPED_ITEMS };
  if (!raw || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;
  for (const slot of EQUIPMENT_SLOTS) {
    const val = record[slot];
    if (
      val &&
      typeof val === 'object' &&
      typeof (val as ItemInstance).instanceId === 'string' &&
      typeof (val as ItemInstance).itemId === 'string' &&
      getItemDefinition((val as ItemInstance).itemId)
    ) {
      result[slot] = {
        instanceId: (val as ItemInstance).instanceId,
        itemId: (val as ItemInstance).itemId,
        enchantLevel: Math.max(
          0,
          Math.min(10, Number((val as ItemInstance).enchantLevel) || 0)
        ),
      };
    }
  }
  return result;
}

function sanitizeInventory(raw: unknown): ItemInstance[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is ItemInstance =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as ItemInstance).instanceId === 'string' &&
        typeof (item as ItemInstance).itemId === 'string' &&
        Boolean(getItemDefinition((item as ItemInstance).itemId))
    )
    .map((item) => ({
      instanceId: item.instanceId,
      itemId: item.itemId,
      enchantLevel: Math.max(0, Math.min(10, Number(item.enchantLevel) || 0)),
    }));
}

interface GameStoreState {
  // Persisted campaign state
  player: PlayerCharacter;
  selectedSectorId: string;
  hasSaveData: boolean;
  muted: boolean;
  battleSpeed: 1 | 2;
  language: Language;

  // Session UI / Battle state (transient)
  screen: ScreenState;
  battle: BattleState | null;
  unequippedNoticeItems: Array<{ itemId: string; enchantLevel: number }>;

  // Language
  setLanguage: (lang: Language) => void;

  // Navigation & Save actions
  setScreen: (screen: ScreenState) => void;
  startCampaign: () => void;
  resetCampaign: () => void;
  clearHangarNotice: () => void;

  // Hangar actions
  setPilotName: (name: string) => void;
  switchClass: (classId: MechClassId) => void;
  commitStatAllocations: (pending: StatBlock) => void;
  resetStatAllocations: () => void;
  selectSector: (sectorId: string) => void;

  // Equipment, Shop & Enchant actions
  equipItem: (instanceId: string) => EquipValidationResult;
  unequipSlot: (slot: EquipmentSlot) => void;
  buyItem: (itemId: string) => { ok: boolean };
  sellItem: (instanceId: string) => { ok: boolean; creditsEarned: number };
  enchantEquippedSlot: (slot: EquipmentSlot) => EnchantAttemptResult | null;

  // Battle actions
  startBattle: (sectorId?: string) => void;
  selectTarget: (unitId: string) => void;
  performPlayerAction: (action: ActionType) => void;
  performAiTurn: () => void;
  clearExpiredPopups: (ids: string[]) => void;
  clearExpiredFx: (ids: string[]) => void;
  clearExplodedUnits: (ids: string[]) => void;
  returnToHangar: () => void;

  // Audio & speed toggles
  toggleMute: () => void;
  toggleBattleSpeed: () => void;
}

function findNextAliveTurnIndex(
  battle: BattleState,
  startFromIndex: number
): { nextIndex: number; wrappedRound: boolean } {
  const total = battle.turnOrder.length;
  for (let step = 1; step <= total; step++) {
    const idx = (startFromIndex + step) % total;
    const unitId = battle.turnOrder[idx];
    const unit = battle.units.find((u) => u.id === unitId);
    if (unit && unit.alive) {
      const wrappedRound = startFromIndex + step >= total;
      return { nextIndex: idx, wrappedRound };
    }
  }
  return { nextIndex: startFromIndex, wrappedRound: false };
}

function playCue(
  cue: 'laser' | 'heavy' | 'shield' | 'evade' | 'defend' | 'heal' | 'destroy'
): void {
  switch (cue) {
    case 'laser':
      soundFx.playLaser();
      break;
    case 'heavy':
      soundFx.playHeavy();
      break;
    case 'shield':
      soundFx.playShield();
      break;
    case 'evade':
      soundFx.playEvade();
      break;
    case 'defend':
      soundFx.playDefend();
      break;
    case 'heal':
      soundFx.playHeal();
      break;
    case 'destroy':
      soundFx.playDestroy();
      break;
  }
}

export const useGameStore = create<GameStoreState>()(
  persist(
    (set, get) => ({
      player: createDefaultPlayer(),
      selectedSectorId: SECTORS_CATALOG[0].id,
      hasSaveData: false,
      muted: false,
      battleSpeed: 1,
      language: 'vi',
      screen: 'TITLE',
      battle: null,
      unequippedNoticeItems: [],

      setLanguage: (language) => {
        soundFx.playClick();
        set({ language });
      },

      setScreen: (screen) => {
        soundFx.playClick();
        set({ screen, unequippedNoticeItems: [] });
      },

      startCampaign: () => {
        soundFx.playConfirm();
        set({ hasSaveData: true, screen: 'HANGAR' });
      },

      resetCampaign: () => {
        soundFx.playClick();
        set({
          player: createDefaultPlayer(),
          selectedSectorId: SECTORS_CATALOG[0].id,
          hasSaveData: true,
          battle: null,
          unequippedNoticeItems: [],
          screen: 'HANGAR',
        });
      },

      clearHangarNotice: () => set({ unequippedNoticeItems: [] }),

      setPilotName: (name) => {
        const clean = name.slice(0, 18);
        set((state) => ({
          player: { ...state.player, name: clean },
          hasSaveData: true,
        }));
      },

      switchClass: (classId) => {
        const state = get();
        if (state.player.classId === classId) return;

        const { equipped, inventory, unequippedItems } =
          unequipIncompatibleForClass(
            state.player.equipped,
            state.player.inventory,
            classId
          );

        soundFx.playClick();
        set({
          player: {
            ...state.player,
            classId,
            equipped,
            inventory,
          },
          unequippedNoticeItems: unequippedItems,
          hasSaveData: true,
        });
      },

      commitStatAllocations: (pending) => {
        const state = get();
        const totalPending = STAT_KEYS.reduce(
          (sum, key) => sum + Math.max(0, pending[key] || 0),
          0
        );
        if (totalPending <= 0 || totalPending > state.player.unspentPoints) {
          return;
        }

        const nextAllocated = { ...state.player.allocatedPoints };
        for (const key of STAT_KEYS) {
          nextAllocated[key] =
            (nextAllocated[key] || 0) + Math.max(0, pending[key] || 0);
        }

        soundFx.playConfirm();
        set({
          player: {
            ...state.player,
            allocatedPoints: nextAllocated,
            unspentPoints: state.player.unspentPoints - totalPending,
          },
          hasSaveData: true,
        });
      },

      resetStatAllocations: () => {
        const state = get();
        const spent = getTotalSpentPoints(state.player.allocatedPoints);
        if (spent === 0) return;

        soundFx.playClick();
        const totalPoints = getTotalAvailablePointsForLevel(state.player.level);
        set({
          player: {
            ...state.player,
            allocatedPoints: { ...EMPTY_STAT_BLOCK },
            unspentPoints: totalPoints,
          },
          hasSaveData: true,
        });
      },

      selectSector: (sectorId) => {
        soundFx.playClick();
        set({ selectedSectorId: sectorId, hasSaveData: true });
      },

      equipItem: (instanceId) => {
        const state = get();
        const invIdx = state.player.inventory.findIndex(
          (i) => i.instanceId === instanceId
        );
        if (invIdx === -1) {
          return { canEquip: false, missingLevel: null, requiredClass: null };
        }

        const itemInstance = state.player.inventory[invIdx];
        const def = getItemDefinition(itemInstance.itemId);
        if (!def) {
          return { canEquip: false, missingLevel: null, requiredClass: null };
        }

        const validation = validateEquipRequirement(
          def,
          state.player.level,
          state.player.classId
        );
        if (!validation.canEquip) {
          return validation;
        }

        const nextInventory = [...state.player.inventory];
        nextInventory.splice(invIdx, 1);

        const previouslyEquipped = state.player.equipped[def.slot];
        if (previouslyEquipped) {
          nextInventory.push(previouslyEquipped);
        }

        const nextEquipped: EquippedItems = {
          ...state.player.equipped,
          [def.slot]: itemInstance,
        };

        soundFx.playConfirm();
        set({
          player: {
            ...state.player,
            equipped: nextEquipped,
            inventory: nextInventory,
          },
          unequippedNoticeItems: [],
          hasSaveData: true,
        });

        return { canEquip: true, missingLevel: null, requiredClass: null };
      },

      unequipSlot: (slot) => {
        const state = get();
        const current = state.player.equipped[slot];
        if (!current) return;

        soundFx.playClick();
        set({
          player: {
            ...state.player,
            equipped: {
              ...state.player.equipped,
              [slot]: null,
            },
            inventory: [...state.player.inventory, current],
          },
          hasSaveData: true,
        });
      },

      buyItem: (itemId) => {
        const state = get();
        const def = getItemDefinition(itemId);
        if (!def || state.player.credits < def.price) {
          return { ok: false };
        }

        const newInstance = createItemInstance(def.id, 0);
        soundFx.playConfirm();
        set({
          player: {
            ...state.player,
            credits: state.player.credits - def.price,
            inventory: [newInstance, ...state.player.inventory],
          },
          hasSaveData: true,
        });
        return { ok: true };
      },

      sellItem: (instanceId) => {
        const state = get();
        const idx = state.player.inventory.findIndex(
          (i) => i.instanceId === instanceId
        );
        if (idx === -1) return { ok: false, creditsEarned: 0 };

        const inst = state.player.inventory[idx];
        const def = getItemDefinition(inst.itemId);
        if (!def) return { ok: false, creditsEarned: 0 };

        const sellValue = getSellPrice(def);
        const nextInventory = [...state.player.inventory];
        nextInventory.splice(idx, 1);

        soundFx.playClick();
        set({
          player: {
            ...state.player,
            credits: state.player.credits + sellValue,
            inventory: nextInventory,
          },
          hasSaveData: true,
        });
        return { ok: true, creditsEarned: sellValue };
      },

      enchantEquippedSlot: (slot) => {
        const state = get();
        const instance = state.player.equipped[slot];
        if (!instance) return null;

        const { result, updatedInstance, remainingCredits } =
          resolveEnchantAttempt(instance, state.player.credits);

        if (!result.attempted) {
          return result;
        }

        if (result.success) {
          soundFx.playVictory();
        } else {
          soundFx.playEvade();
        }

        set({
          player: {
            ...state.player,
            credits: remainingCredits,
            equipped: {
              ...state.player.equipped,
              [slot]: updatedInstance,
            },
          },
          hasSaveData: true,
        });

        return result;
      },

      startBattle: (sectorId) => {
        const state = get();
        const targetSectorId = sectorId ?? state.selectedSectorId;
        const battleState = createInitialBattleState(
          state.player,
          targetSectorId
        );
        soundFx.playConfirm();
        set({
          selectedSectorId: targetSectorId,
          battle: battleState,
          unequippedNoticeItems: [],
          screen: 'BATTLE',
          hasSaveData: true,
        });
      },

      selectTarget: (unitId) => {
        const { battle } = get();
        if (!battle || battle.summary) return;
        const unit = battle.units.find((u) => u.id === unitId);
        if (!unit || !unit.alive || unit.side !== 'enemy') return;
        soundFx.playClick();
        set({
          battle: {
            ...battle,
            selectedTargetId: unitId,
          },
        });
      },

      performPlayerAction: (action) => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary || battle.isResolving) return;

        const activeUnitId = battle.turnOrder[battle.activeTurnIndex];
        const activeUnit = battle.units.find((u) => u.id === activeUnitId);
        if (!activeUnit || !activeUnit.isPlayer || !activeUnit.alive) return;

        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          action,
          battle.selectedTargetId,
          battle.round
        );
        playCue(resolution.soundCue);

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextLog = [...battle.log, ...resolution.logEntries].slice(-60);
        const nextPopups = [...battle.popups, ...resolution.popups];
        const nextFx = resolution.fxEvent
          ? [...battle.fxEvents, resolution.fxEvent]
          : battle.fxEvents;
        const nextExploded =
          resolution.destroyedUnitIds.length > 0
            ? [...battle.explodedUnitIds, ...resolution.destroyedUnitIds]
            : battle.explodedUnitIds;

        if (aliveEnemies.length === 0 || aliveAllies.length === 0) {
          const won = aliveEnemies.length === 0;
          const rewards = calculateBattleRewards(
            resolution.updatedUnits,
            battle.sectorId,
            won
          );
          const droppedItems = rollBattleItemDrops(
            resolution.updatedUnits.filter((u) => u.side === 'enemy'),
            battle.sectorId,
            state.player.level,
            won
          );
          const levelResult = applyRewardsToPlayer(
            state.player,
            rewards.expGained,
            rewards.creditsGained,
            won
          );

          const finalPlayer: PlayerCharacter = {
            ...levelResult.updatedPlayer,
            inventory: [...droppedItems, ...levelResult.updatedPlayer.inventory],
          };

          if (won) soundFx.playVictory();
          else soundFx.playDefeat();

          set({
            player: finalPlayer,
            battle: {
              ...battle,
              units: resolution.updatedUnits,
              log: nextLog,
              popups: nextPopups,
              fxEvents: nextFx,
              explodedUnitIds: nextExploded,
              isResolving: false,
              summary: {
                outcome: won ? 'victory' : 'defeat',
                sectorId: battle.sectorId,
                rounds: battle.round,
                expGained: rewards.expGained,
                creditsGained: rewards.creditsGained,
                leveledUp: levelResult.leveledUp,
                previousLevel: levelResult.previousLevel,
                newLevel: levelResult.newLevel,
                statPointsGained: levelResult.statPointsGained,
                enemiesDestroyed: resolution.updatedUnits.filter(
                  (u) => u.side === 'enemy' && !u.alive
                ).length,
                alliesSurviving: aliveAllies.length,
                droppedItems,
              },
            },
          });
          return;
        }

        const updatedBattleBase: BattleState = {
          ...battle,
          units: resolution.updatedUnits,
          log: nextLog,
          popups: nextPopups,
          fxEvents: nextFx,
          explodedUnitIds: nextExploded,
        };
        const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
          updatedBattleBase,
          battle.activeTurnIndex
        );

        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );

        set({
          battle: {
            ...updatedBattleBase,
            activeTurnIndex: nextIndex,
            round: wrappedRound ? battle.round + 1 : battle.round,
            selectedTargetId: currentTargetStillAlive
              ? battle.selectedTargetId
              : aliveEnemies[0]?.id ?? null,
            isResolving: false,
          },
        });
      },

      performAiTurn: () => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary) return;

        const activeUnitId = battle.turnOrder[battle.activeTurnIndex];
        const activeUnit = battle.units.find((u) => u.id === activeUnitId);

        if (!activeUnit || !activeUnit.alive) {
          const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
            battle,
            battle.activeTurnIndex
          );
          set({
            battle: {
              ...battle,
              activeTurnIndex: nextIndex,
              round: wrappedRound ? battle.round + 1 : battle.round,
            },
          });
          return;
        }

        if (activeUnit.isPlayer) return;

        const decision = chooseAiDecision(activeUnit, battle.units);
        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          decision.action,
          decision.targetId,
          battle.round
        );
        playCue(resolution.soundCue);

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextLog = [...battle.log, ...resolution.logEntries].slice(-60);
        const nextPopups = [...battle.popups, ...resolution.popups];
        const nextFx = resolution.fxEvent
          ? [...battle.fxEvents, resolution.fxEvent]
          : battle.fxEvents;
        const nextExploded =
          resolution.destroyedUnitIds.length > 0
            ? [...battle.explodedUnitIds, ...resolution.destroyedUnitIds]
            : battle.explodedUnitIds;

        if (aliveEnemies.length === 0 || aliveAllies.length === 0) {
          const won = aliveEnemies.length === 0;
          const rewards = calculateBattleRewards(
            resolution.updatedUnits,
            battle.sectorId,
            won
          );
          const droppedItems = rollBattleItemDrops(
            resolution.updatedUnits.filter((u) => u.side === 'enemy'),
            battle.sectorId,
            state.player.level,
            won
          );
          const levelResult = applyRewardsToPlayer(
            state.player,
            rewards.expGained,
            rewards.creditsGained,
            won
          );

          const finalPlayer: PlayerCharacter = {
            ...levelResult.updatedPlayer,
            inventory: [...droppedItems, ...levelResult.updatedPlayer.inventory],
          };

          if (won) soundFx.playVictory();
          else soundFx.playDefeat();

          set({
            player: finalPlayer,
            battle: {
              ...battle,
              units: resolution.updatedUnits,
              log: nextLog,
              popups: nextPopups,
              fxEvents: nextFx,
              explodedUnitIds: nextExploded,
              summary: {
                outcome: won ? 'victory' : 'defeat',
                sectorId: battle.sectorId,
                rounds: battle.round,
                expGained: rewards.expGained,
                creditsGained: rewards.creditsGained,
                leveledUp: levelResult.leveledUp,
                previousLevel: levelResult.previousLevel,
                newLevel: levelResult.newLevel,
                statPointsGained: levelResult.statPointsGained,
                enemiesDestroyed: resolution.updatedUnits.filter(
                  (u) => u.side === 'enemy' && !u.alive
                ).length,
                alliesSurviving: aliveAllies.length,
                droppedItems,
              },
            },
          });
          return;
        }

        const updatedBattleBase: BattleState = {
          ...battle,
          units: resolution.updatedUnits,
          log: nextLog,
          popups: nextPopups,
          fxEvents: nextFx,
          explodedUnitIds: nextExploded,
        };
        const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
          updatedBattleBase,
          battle.activeTurnIndex
        );

        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );

        set({
          battle: {
            ...updatedBattleBase,
            activeTurnIndex: nextIndex,
            round: wrappedRound ? battle.round + 1 : battle.round,
            selectedTargetId: currentTargetStillAlive
              ? battle.selectedTargetId
              : aliveEnemies[0]?.id ?? null,
          },
        });
      },

      clearExpiredPopups: (ids) => {
        const { battle } = get();
        if (!battle || ids.length === 0) return;
        const idSet = new Set(ids);
        set({
          battle: {
            ...battle,
            popups: battle.popups.filter((p) => !idSet.has(p.id)),
          },
        });
      },

      clearExpiredFx: (ids) => {
        const { battle } = get();
        if (!battle || ids.length === 0) return;
        const idSet = new Set(ids);
        set({
          battle: {
            ...battle,
            fxEvents: battle.fxEvents.filter((f) => !idSet.has(f.id)),
          },
        });
      },

      clearExplodedUnits: (ids) => {
        const { battle } = get();
        if (!battle || ids.length === 0) return;
        const idSet = new Set(ids);
        set({
          battle: {
            ...battle,
            explodedUnitIds: battle.explodedUnitIds.filter(
              (uid) => !idSet.has(uid)
            ),
          },
        });
      },

      returnToHangar: () => {
        soundFx.playClick();
        set({ battle: null, screen: 'HANGAR' });
      },

      toggleMute: () => {
        const nextMuted = !get().muted;
        soundFx.setMuted(nextMuted);
        if (!nextMuted) soundFx.playClick();
        set({ muted: nextMuted });
      },

      toggleBattleSpeed: () => {
        soundFx.playClick();
        set((state) => ({ battleSpeed: state.battleSpeed === 1 ? 2 : 1 }));
      },
    }),
    {
      name: 'starfront_mech_rpg_save_v1',
      version: SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        player: state.player,
        selectedSectorId: state.selectedSectorId,
        hasSaveData: state.hasSaveData,
        muted: state.muted,
        battleSpeed: state.battleSpeed,
        language: state.language,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const fallback = {
          player: createDefaultPlayer(),
          selectedSectorId: SECTORS_CATALOG[0].id,
          hasSaveData: false,
          muted: false,
          battleSpeed: 1 as 1 | 2,
          language: 'vi' as Language,
        };

        if (!persistedState || typeof persistedState !== 'object') {
          return fallback;
        }

        const raw = persistedState as Record<string, unknown>;
        const rawPlayer = (raw.player ?? {}) as Partial<PlayerCharacter>;

        const migratedPlayer: PlayerCharacter = {
          ...createDefaultPlayer(),
          ...rawPlayer,
          allocatedPoints: {
            ...EMPTY_STAT_BLOCK,
            ...(rawPlayer.allocatedPoints ?? {}),
          },
          equipped:
            version < 2
              ? { ...EMPTY_EQUIPPED_ITEMS }
              : sanitizeEquipped(rawPlayer.equipped),
          inventory:
            version < 2 ? [] : sanitizeInventory(rawPlayer.inventory),
        };

        const migratedLanguage: Language =
          raw.language === 'en' || raw.language === 'vi' ? raw.language : 'vi';

        return {
          ...fallback,
          ...raw,
          language: migratedLanguage,
          player: migratedPlayer,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          soundFx.setMuted(state.muted);
        }
      },
    }
  )
);
