import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  BALANCE_CONFIG,
  getGarageUnlockCost,
  getSkillUpgradeCost,
} from '../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getNextSectorId, SECTORS_CATALOG } from '../data/maps';
import {
  calculateBattleRewards,
  chooseAiDecision,
  createInitialBattleState,
  resolveUnitAction,
  sortTurnOrder,
} from '../engine/combat';
import {
  equipItemOnGear,
  generateItemInstance,
  generateShopStock,
  getItemEquippedByGear,
  getSellPrice,
  resolveEnchantAttempt,
  rollBattleItemDrops,
  unequipInstanceFromAnyGear,
  unequipSlotOnGear,
} from '../engine/equipment';
import {
  createDefaultAdminConfig,
  createFreshCampaignState,
  CURRENT_SAVE_VERSION,
  migrateSaveData,
} from '../engine/migration';
import {
  allocateGearStats,
  applyExpToGear,
  estimateBattlesToNextLevel,
  getTotalAvailablePointsForLevel,
  resetGearStatAllocations,
} from '../engine/stats';
import type {
  ActionType,
  AdminConfig,
  BaseTab,
  BattleSpeed,
  BattleState,
  CombatUnit,
  EnchantAttemptResult,
  EquipmentSlot,
  EquipValidationResult,
  ItemInstance,
  ItemRarity,
  Language,
  MechClassId,
  PilotAccount,
  ScreenState,
  StatBlock,
} from '../types/game';
import { soundFx } from '../utils/sound';

interface GameStoreState {
  // Persisted state (v4 per-Gear model)
  pilot: PilotAccount;
  shopStock: ItemInstance[];
  selectedSectorId: string;
  hasSaveData: boolean;
  muted: boolean;
  battleSpeed: BattleSpeed;
  skipAnimations: boolean;
  language: Language;
  adminConfig: AdminConfig;

  // Session UI / Battle state (transient)
  screen: ScreenState;
  activeTab: BaseTab;
  battle: BattleState | null;
  adminPanelOpen: boolean;

  // Language
  setLanguage: (lang: Language) => void;

  // Navigation & Campaign creation
  setScreen: (screen: ScreenState) => void;
  setActiveTab: (tab: BaseTab) => void;
  startCampaign: (pilotName?: string, starterClassId?: MechClassId) => void;
  continueCampaign: () => void;
  resetCampaign: () => void;

  // Pilot & Garage (per-Gear) actions
  setPilotName: (name: string) => void;
  selectActiveGear: (classId: MechClassId) => void;
  buyGear: (classId: MechClassId) => { ok: boolean; cost: number };
  commitStatAllocations: (pending: StatBlock) => void;
  resetStatAllocations: () => void;
  upgradeActiveGearSkill: () => { ok: boolean; newLevel: number };
  selectSector: (sectorId: string) => void;

  // Equipment, Shop & Enchant actions
  equipItem: (instanceId: string) => EquipValidationResult;
  unequipSlot: (slot: EquipmentSlot) => void;
  unequipInstanceEverywhere: (instanceId: string) => void;
  buyShopItem: (instanceId: string) => { ok: boolean };
  refreshShopStock: () => { ok: boolean; cost: number };
  sellItem: (instanceId: string) => { ok: boolean; creditsEarned: number };
  enchantEquippedSlot: (slot: EquipmentSlot) => EnchantAttemptResult | null;

  // Battle actions
  startBattle: (sectorId?: string) => void;
  selectTarget: (unitId: string) => void;
  performPlayerAction: (action: ActionType) => void;
  performAiTurn: () => void;
  retreatBattle: () => void;
  forceWinBattle: () => void;
  clearExpiredPopups: (ids: string[]) => void;
  clearExpiredFx: (ids: string[]) => void;
  clearExplodedUnits: (ids: string[]) => void;
  returnToHangar: () => void;

  // Audio & Speed controls
  toggleMute: () => void;
  setBattleSpeed: (speed: BattleSpeed) => void;
  toggleSkipAnimations: () => void;

  // Admin CP actions
  setAdminPanelOpen: (open: boolean) => void;
  toggleAdminPanel: () => void;
  adminSetGearLevel: (level: number) => void;
  adminAddGearExp: (amount: number) => void;
  adminSetGearUnspentPoints: (points: number) => void;
  adminAddGearUnspentPoints: (delta: number) => void;
  adminResetGearAllocation: () => void;
  adminSetCredits: (amount: number) => void;
  adminAddCredits: (delta: number) => void;
  adminGenerateItems: (
    slot: EquipmentSlot,
    tier: number,
    rarity: ItemRarity,
    quantity: number
  ) => number;
  adminUnlockAllGears: () => void;
  adminUnlockAllSectors: () => void;
  adminUpdateConfig: (patch: Partial<AdminConfig>) => void;
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
  cue: 'laser' | 'heavy' | 'shield' | 'evade' | 'defend' | 'heal' | 'destroy',
  skipAnim: boolean
): void {
  if (skipAnim) return;
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

function finalizeBattleOutcome(
  state: GameStoreState,
  battle: BattleState,
  updatedUnits: CombatUnit[],
  won: boolean,
  retreated: boolean,
  extraLog = battle.log,
  extraPopups = battle.popups,
  extraFx = battle.fxEvents,
  extraExploded = battle.explodedUnitIds
): Partial<GameStoreState> {
  const deployedGearId = battle.deployedGearId;
  const deployedGear = state.pilot.gears[deployedGearId];

  const rewards = calculateBattleRewards(
    updatedUnits,
    won,
    state.adminConfig.rewardMultiplier
  );
  const droppedItems = rollBattleItemDrops(
    updatedUnits.filter((u) => u.side === 'enemy'),
    battle.sectorId,
    deployedGear.level,
    won
  );

  // Per-Gear EXP: ONLY the deployed Gear receives EXP & battle record!
  const levelResult = applyExpToGear(deployedGear, rewards.expGained, { won });
  const battlesToNextLevel = estimateBattlesToNextLevel(
    levelResult.updatedGear,
    rewards.fullVictoryExp
  );

  // Unlock next campaign sector on victory
  let unlockedSectorId: string | null = null;
  let nextUnlockedSectors = state.pilot.unlockedSectorIds;
  if (won) {
    const candidateNext = getNextSectorId(battle.sectorId);
    if (candidateNext && !state.pilot.unlockedSectorIds.includes(candidateNext)) {
      unlockedSectorId = candidateNext;
      nextUnlockedSectors = [...state.pilot.unlockedSectorIds, candidateNext];
    }
  }

  const nextPilot: PilotAccount = {
    ...state.pilot,
    credits: state.pilot.credits + rewards.creditsGained,
    inventory: [...droppedItems, ...state.pilot.inventory],
    gears: {
      ...state.pilot.gears,
      [deployedGearId]: levelResult.updatedGear,
    },
    unlockedSectorIds: nextUnlockedSectors,
  };

  // Auto-refresh randomized shop stock after every battle!
  const refreshedShopStock = generateShopStock(
    levelResult.updatedGear.level,
    BALANCE_CONFIG.shopStockSize
  );

  if (won) soundFx.playVictory();
  else soundFx.playDefeat();

  const enemies = updatedUnits.filter((u) => u.side === 'enemy');
  const aliveAllies = updatedUnits.filter((u) => u.side === 'ally' && u.alive);

  return {
    pilot: nextPilot,
    shopStock: refreshedShopStock,
    hasSaveData: true,
    battle: {
      ...battle,
      units: updatedUnits,
      log: extraLog,
      popups: extraPopups,
      fxEvents: extraFx,
      explodedUnitIds: extraExploded,
      isResolving: false,
      summary: {
        outcome: won ? 'victory' : 'defeat',
        retreated,
        deployedGearId,
        sectorId: battle.sectorId,
        rounds: battle.round,
        expGained: rewards.expGained,
        creditsGained: rewards.creditsGained,
        leveledUp: levelResult.leveledUp,
        previousLevel: levelResult.previousLevel,
        newLevel: levelResult.newLevel,
        statPointsGained: levelResult.statPointsGained,
        battlesToNextLevel,
        unlockedSectorId,
        enemiesDestroyed: enemies.filter((e) => !e.alive).length,
        totalEnemies: enemies.length,
        alliesSurviving: aliveAllies.length,
        droppedItems,
      },
    },
  };
}

const initialFresh = createFreshCampaignState('Vance', 'striker');

export const useGameStore = create<GameStoreState>()(
  persist(
    (set, get) => ({
      ...initialFresh,
      screen: 'TITLE',
      activeTab: 'gear',
      battle: null,
      adminPanelOpen: false,

      setLanguage: (language) => {
        soundFx.playClick();
        set({ language });
      },

      setScreen: (screen) => {
        soundFx.playClick();
        if (screen === 'SHOP') {
          set({ screen: 'HANGAR', activeTab: 'shop' });
          return;
        }
        set({ screen });
      },

      setActiveTab: (activeTab) => {
        soundFx.playClick();
        set({ screen: 'HANGAR', activeTab });
      },

      startCampaign: (pilotName, starterClassId) => {
        const state = get();
        soundFx.playConfirm();
        if (!state.hasSaveData) {
          const cleanName = (pilotName ?? state.pilot.name).trim().slice(0, 18) || 'Vance';
          const chosenClass = starterClassId ?? state.pilot.activeGearId ?? 'striker';
          const fresh = createFreshCampaignState(cleanName, chosenClass);
          set({
            ...fresh,
            language: state.language,
            muted: state.muted,
            battleSpeed: state.battleSpeed,
            skipAnimations: state.skipAnimations,
            adminConfig: state.adminConfig,
            hasSaveData: true,
            screen: 'HANGAR',
            activeTab: 'gear',
            battle: null,
          });
        } else {
          set({ screen: 'HANGAR', activeTab: 'gear' });
        }
      },

      continueCampaign: () => {
        soundFx.playConfirm();
        set({ screen: 'HANGAR', activeTab: 'gear' });
      },

      resetCampaign: () => {
        const state = get();
        soundFx.playClick();
        const fresh = createFreshCampaignState('Vance', 'striker');
        set({
          ...fresh,
          language: state.language,
          muted: state.muted,
          battleSpeed: state.battleSpeed,
          skipAnimations: state.skipAnimations,
          adminConfig: createDefaultAdminConfig(),
          hasSaveData: false,
          battle: null,
          screen: 'TITLE',
          activeTab: 'gear',
        });
      },

      setPilotName: (name) => {
        const clean = name.slice(0, 18);
        set((state) => ({
          pilot: { ...state.pilot, name: clean },
          hasSaveData: true,
        }));
      },

      selectActiveGear: (classId) => {
        const state = get();
        const targetGear = state.pilot.gears[classId];
        if (!targetGear || !targetGear.owned) return;
        soundFx.playClick();
        set({
          pilot: {
            ...state.pilot,
            activeGearId: classId,
          },
          hasSaveData: true,
        });
      },

      buyGear: (classId) => {
        const state = get();
        const targetGear = state.pilot.gears[classId];
        if (!targetGear || targetGear.owned) {
          return { ok: false, cost: 0 };
        }
        const ownedCount = MECH_CLASS_LIST.filter(
          (c) => state.pilot.gears[c.id].owned
        ).length;
        const cost = getGarageUnlockCost(ownedCount);
        if (state.pilot.credits < cost) {
          return { ok: false, cost };
        }

        soundFx.playVictory();
        set({
          pilot: {
            ...state.pilot,
            credits: state.pilot.credits - cost,
            activeGearId: classId,
            gears: {
              ...state.pilot.gears,
              [classId]: {
                ...targetGear,
                owned: true,
              },
            },
          },
          hasSaveData: true,
        });
        return { ok: true, cost };
      },

      commitStatAllocations: (pending) => {
        const state = get();
        const activeId = state.pilot.activeGearId;
        const activeGear = state.pilot.gears[activeId];
        const nextGear = allocateGearStats(activeGear, pending);
        if (nextGear === activeGear) return;

        soundFx.playConfirm();
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [activeId]: nextGear,
            },
          },
          hasSaveData: true,
        });
      },

      resetStatAllocations: () => {
        const state = get();
        const activeId = state.pilot.activeGearId;
        const activeGear = state.pilot.gears[activeId];
        const nextGear = resetGearStatAllocations(activeGear);

        soundFx.playClick();
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [activeId]: nextGear,
            },
          },
          hasSaveData: true,
        });
      },

      upgradeActiveGearSkill: () => {
        const state = get();
        const activeId = state.pilot.activeGearId;
        const gear = state.pilot.gears[activeId];
        const sigId = MECH_CLASSES[activeId].signatureSkillId;
        const currentLv = gear.skillLevels[sigId] ?? 1;
        const cost = getSkillUpgradeCost(currentLv);
        if (cost === null || state.pilot.credits < cost) {
          return { ok: false, newLevel: currentLv };
        }

        const nextLv = currentLv + 1;
        soundFx.playVictory();
        set({
          pilot: {
            ...state.pilot,
            credits: state.pilot.credits - cost,
            gears: {
              ...state.pilot.gears,
              [activeId]: {
                ...gear,
                skillLevels: {
                  ...gear.skillLevels,
                  [sigId]: nextLv,
                },
              },
            },
          },
          hasSaveData: true,
        });
        return { ok: true, newLevel: nextLv };
      },

      selectSector: (sectorId) => {
        const state = get();
        if (!state.pilot.unlockedSectorIds.includes(sectorId)) return;
        soundFx.playClick();
        set({ selectedSectorId: sectorId, hasSaveData: true });
      },

      equipItem: (instanceId) => {
        const state = get();
        const { pilot: nextPilot, validation } = equipItemOnGear(
          state.pilot,
          state.pilot.activeGearId,
          instanceId
        );
        if (validation.canEquip) {
          soundFx.playConfirm();
          set({ pilot: nextPilot, hasSaveData: true });
        }
        return validation;
      },

      unequipSlot: (slot) => {
        const state = get();
        const nextPilot = unequipSlotOnGear(
          state.pilot,
          state.pilot.activeGearId,
          slot
        );
        if (nextPilot === state.pilot) return;
        soundFx.playClick();
        set({ pilot: nextPilot, hasSaveData: true });
      },

      unequipInstanceEverywhere: (instanceId) => {
        const state = get();
        const nextPilot = unequipInstanceFromAnyGear(state.pilot, instanceId);
        if (nextPilot === state.pilot) return;
        soundFx.playClick();
        set({ pilot: nextPilot, hasSaveData: true });
      },

      buyShopItem: (instanceId) => {
        const state = get();
        const idx = state.shopStock.findIndex(
          (it) => it.instanceId === instanceId
        );
        if (idx === -1) return { ok: false };
        const item = state.shopStock[idx];
        if (state.pilot.credits < item.price) return { ok: false };

        const nextStock = [...state.shopStock];
        nextStock.splice(idx, 1);

        soundFx.playConfirm();
        set({
          pilot: {
            ...state.pilot,
            credits: state.pilot.credits - item.price,
            inventory: [item, ...state.pilot.inventory],
          },
          shopStock: nextStock,
          hasSaveData: true,
        });
        return { ok: true };
      },

      refreshShopStock: () => {
        const state = get();
        const cost = BALANCE_CONFIG.shopRefreshCost;
        if (state.pilot.credits < cost) {
          return { ok: false, cost };
        }
        const activeGear = state.pilot.gears[state.pilot.activeGearId];
        soundFx.playClick();
        set({
          pilot: {
            ...state.pilot,
            credits: state.pilot.credits - cost,
          },
          shopStock: generateShopStock(
            activeGear.level,
            BALANCE_CONFIG.shopStockSize
          ),
          hasSaveData: true,
        });
        return { ok: true, cost };
      },

      sellItem: (instanceId) => {
        const state = get();
        // Cannot sell an item currently equipped on any Gear
        if (getItemEquippedByGear(state.pilot.gears, instanceId) !== null) {
          return { ok: false, creditsEarned: 0 };
        }
        const idx = state.pilot.inventory.findIndex(
          (i) => i.instanceId === instanceId
        );
        if (idx === -1) return { ok: false, creditsEarned: 0 };

        const inst = state.pilot.inventory[idx];
        const sellValue = getSellPrice(inst);
        const nextInventory = [...state.pilot.inventory];
        nextInventory.splice(idx, 1);

        soundFx.playClick();
        set({
          pilot: {
            ...state.pilot,
            credits: state.pilot.credits + sellValue,
            inventory: nextInventory,
          },
          hasSaveData: true,
        });
        return { ok: true, creditsEarned: sellValue };
      },

      enchantEquippedSlot: (slot) => {
        const state = get();
        const activeGear = state.pilot.gears[state.pilot.activeGearId];
        const instanceId = activeGear.equipped[slot];
        if (!instanceId) return null;

        const invIdx = state.pilot.inventory.findIndex(
          (it) => it.instanceId === instanceId
        );
        if (invIdx === -1) return null;

        const instance = state.pilot.inventory[invIdx];
        const { result, updatedInstance, remainingCredits } =
          resolveEnchantAttempt(instance, state.pilot.credits);

        if (!result.attempted) {
          return result;
        }

        if (result.success) {
          soundFx.playVictory();
        } else {
          soundFx.playEvade();
        }

        const nextInventory = [...state.pilot.inventory];
        nextInventory[invIdx] = updatedInstance;

        set({
          pilot: {
            ...state.pilot,
            credits: remainingCredits,
            inventory: nextInventory,
          },
          hasSaveData: true,
        });

        return result;
      },

      startBattle: (sectorId) => {
        const state = get();
        const requestedSector = sectorId ?? state.selectedSectorId;
        const targetSectorId = state.pilot.unlockedSectorIds.includes(
          requestedSector
        )
          ? requestedSector
          : state.pilot.unlockedSectorIds[0] ?? SECTORS_CATALOG[0].id;

        const battleState = createInitialBattleState(state.pilot, targetSectorId);
        soundFx.playConfirm();

        // If Admin "Always Win" is active, auto-resolve immediately into Victory!
        if (state.adminConfig.alwaysWin) {
          const defeatedEnemies = battleState.units.map((u) =>
            u.side === 'enemy'
              ? { ...u, hp: 0, shield: 0, alive: false, animState: 'destroyed' as const }
              : u
          );
          const outcomePatch = finalizeBattleOutcome(
            state,
            battleState,
            defeatedEnemies,
            true,
            false
          );
          set({
            ...outcomePatch,
            selectedSectorId: targetSectorId,
            screen: 'BATTLE',
          });
          return;
        }

        set({
          selectedSectorId: targetSectorId,
          battle: battleState,
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

        const bypassFx = state.skipAnimations || state.battleSpeed === 10;

        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          action,
          battle.selectedTargetId,
          battle.round,
          state.adminConfig
        );
        playCue(resolution.soundCue, bypassFx);

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextLog = [...battle.log, ...resolution.logEntries].slice(-70);
        const nextPopups = bypassFx
          ? []
          : [...battle.popups, ...resolution.popups];
        const nextFx =
          bypassFx || !resolution.fxEvent
            ? []
            : [...battle.fxEvents, resolution.fxEvent];
        const nextExploded =
          bypassFx || resolution.destroyedUnitIds.length === 0
            ? []
            : [...battle.explodedUnitIds, ...resolution.destroyedUnitIds];

        if (aliveEnemies.length === 0 || aliveAllies.length === 0) {
          const won = aliveEnemies.length === 0;
          set(
            finalizeBattleOutcome(
              state,
              battle,
              resolution.updatedUnits,
              won,
              false,
              nextLog,
              nextPopups,
              nextFx,
              nextExploded
            )
          );
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

        // Recalculate turn order on new round (respects Slow status!)
        let nextTurnOrder = battle.turnOrder;
        let finalTurnIndex = nextIndex;
        if (wrappedRound) {
          nextTurnOrder = sortTurnOrder(resolution.updatedUnits);
          const firstAliveIdx = nextTurnOrder.findIndex((id) =>
            resolution.updatedUnits.some((u) => u.id === id && u.alive)
          );
          finalTurnIndex = Math.max(0, firstAliveIdx);
        }

        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );

        set({
          battle: {
            ...updatedBattleBase,
            turnOrder: nextTurnOrder,
            activeTurnIndex: finalTurnIndex,
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

        const bypassFx = state.skipAnimations || state.battleSpeed === 10;
        const decision = chooseAiDecision(activeUnit, battle.units);
        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          decision.action,
          decision.targetId,
          battle.round,
          state.adminConfig
        );
        playCue(resolution.soundCue, bypassFx);

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextLog = [...battle.log, ...resolution.logEntries].slice(-70);
        const nextPopups = bypassFx
          ? []
          : [...battle.popups, ...resolution.popups];
        const nextFx =
          bypassFx || !resolution.fxEvent
            ? []
            : [...battle.fxEvents, resolution.fxEvent];
        const nextExploded =
          bypassFx || resolution.destroyedUnitIds.length === 0
            ? []
            : [...battle.explodedUnitIds, ...resolution.destroyedUnitIds];

        if (aliveEnemies.length === 0 || aliveAllies.length === 0) {
          const won = aliveEnemies.length === 0;
          set(
            finalizeBattleOutcome(
              state,
              battle,
              resolution.updatedUnits,
              won,
              false,
              nextLog,
              nextPopups,
              nextFx,
              nextExploded
            )
          );
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

        let nextTurnOrder = battle.turnOrder;
        let finalTurnIndex = nextIndex;
        if (wrappedRound) {
          nextTurnOrder = sortTurnOrder(resolution.updatedUnits);
          const firstAliveIdx = nextTurnOrder.findIndex((id) =>
            resolution.updatedUnits.some((u) => u.id === id && u.alive)
          );
          finalTurnIndex = Math.max(0, firstAliveIdx);
        }

        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );

        set({
          battle: {
            ...updatedBattleBase,
            turnOrder: nextTurnOrder,
            activeTurnIndex: finalTurnIndex,
            round: wrappedRound ? battle.round + 1 : battle.round,
            selectedTargetId: currentTargetStillAlive
              ? battle.selectedTargetId
              : aliveEnemies[0]?.id ?? null,
          },
        });
      },

      retreatBattle: () => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary) return;
        const retreatLog = [
          ...battle.log,
          {
            id: `log_retreat_${Date.now()}`,
            round: battle.round,
            actorName: state.pilot.name || 'Vance',
            tag: 'SYSTEM' as const,
            templateKey: 'log.retreat' as const,
            params: { actor: state.pilot.name || 'Vance' },
          },
        ];
        set(
          finalizeBattleOutcome(
            state,
            battle,
            battle.units,
            false,
            true,
            retreatLog,
            [],
            [],
            []
          )
        );
      },

      forceWinBattle: () => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary) return;
        const defeatedEnemies = battle.units.map((u) =>
          u.side === 'enemy'
            ? { ...u, hp: 0, shield: 0, alive: false, animState: 'destroyed' as const }
            : u
        );
        set(
          finalizeBattleOutcome(
            state,
            battle,
            defeatedEnemies,
            true,
            false,
            battle.log,
            [],
            [],
            []
          )
        );
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

      setBattleSpeed: (battleSpeed) => {
        soundFx.playClick();
        set({ battleSpeed });
      },

      toggleSkipAnimations: () => {
        soundFx.playClick();
        set((state) => ({ skipAnimations: !state.skipAnimations }));
      },

      // ---- ADMIN CP ACTIONS ----
      setAdminPanelOpen: (adminPanelOpen) => set({ adminPanelOpen }),
      toggleAdminPanel: () =>
        set((state) => ({ adminPanelOpen: !state.adminPanelOpen })),

      adminSetGearLevel: (level) => {
        const state = get();
        const clamped = Math.max(
          1,
          Math.min(BALANCE_CONFIG.maxLevel, Math.floor(level) || 1)
        );
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const totalForLevel = getTotalAvailablePointsForLevel(clamped);
        const spent = Object.values(gear.allocatedPoints).reduce(
          (a, b) => a + b,
          0
        );
        const unspent = Math.max(0, totalForLevel - spent);
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: {
                ...gear,
                level: clamped,
                exp: 0,
                unspentPoints: unspent,
              },
            },
          },
          hasSaveData: true,
        });
      },

      adminAddGearExp: (amount) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const res = applyExpToGear(gear, Math.max(0, Math.floor(amount) || 0));
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: res.updatedGear,
            },
          },
          hasSaveData: true,
        });
      },

      adminSetGearUnspentPoints: (points) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: {
                ...gear,
                unspentPoints: Math.max(0, Math.floor(points) || 0),
              },
            },
          },
          hasSaveData: true,
        });
      },

      adminAddGearUnspentPoints: (delta) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: {
                ...gear,
                unspentPoints: Math.max(
                  0,
                  gear.unspentPoints + (Math.floor(delta) || 0)
                ),
              },
            },
          },
          hasSaveData: true,
        });
      },

      adminResetGearAllocation: () => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: {
                ...gear,
                allocatedPoints: { ...EMPTY_STAT_BLOCK },
                unspentPoints: getTotalAvailablePointsForLevel(gear.level),
              },
            },
          },
          hasSaveData: true,
        });
      },

      adminSetCredits: (amount) => {
        set((state) => ({
          pilot: {
            ...state.pilot,
            credits: Math.max(0, Math.floor(amount) || 0),
          },
          hasSaveData: true,
        }));
      },

      adminAddCredits: (delta) => {
        set((state) => ({
          pilot: {
            ...state.pilot,
            credits: Math.max(
              0,
              state.pilot.credits + (Math.floor(delta) || 0)
            ),
          },
          hasSaveData: true,
        }));
      },

      adminGenerateItems: (slot, tier, rarity, quantity) => {
        const count = Math.max(1, Math.min(20, Math.floor(quantity) || 1));
        const generated: ItemInstance[] = [];
        for (let i = 0; i < count; i++) {
          generated.push(
            generateItemInstance({
              slot,
              tier: Math.max(1, Math.min(4, tier)),
              rarity,
            })
          );
        }
        set((state) => ({
          pilot: {
            ...state.pilot,
            inventory: [...generated, ...state.pilot.inventory],
          },
          hasSaveData: true,
        }));
        return generated.length;
      },

      adminUnlockAllGears: () => {
        set((state) => {
          const nextGears = { ...state.pilot.gears };
          for (const cls of MECH_CLASS_LIST) {
            nextGears[cls.id] = { ...nextGears[cls.id], owned: true };
          }
          return {
            pilot: { ...state.pilot, gears: nextGears },
            hasSaveData: true,
          };
        });
      },

      adminUnlockAllSectors: () => {
        set((state) => ({
          pilot: {
            ...state.pilot,
            unlockedSectorIds: SECTORS_CATALOG.map((s) => s.id),
          },
          hasSaveData: true,
        }));
      },

      adminUpdateConfig: (patch) => {
        set((state) => ({
          adminConfig: {
            ...state.adminConfig,
            ...patch,
          },
        }));
      },
    }),
    {
      name: 'starfront_mech_rpg_save_v1',
      version: CURRENT_SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pilot: state.pilot,
        shopStock: state.shopStock,
        selectedSectorId: state.selectedSectorId,
        hasSaveData: state.hasSaveData,
        muted: state.muted,
        battleSpeed: state.battleSpeed,
        skipAnimations: state.skipAnimations,
        language: state.language,
        adminConfig: state.adminConfig,
      }),
      migrate: (persistedState: unknown, version: number) =>
        migrateSaveData(persistedState, version),
      onRehydrateStorage: () => (state) => {
        if (state) {
          soundFx.setMuted(state.muted);
        }
      },
    }
  )
);
