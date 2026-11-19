import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BALANCE_CONFIG, getGarageUnlockCost } from '../data/balance';
import { EMPTY_STAT_BLOCK, MECH_CLASS_LIST } from '../data/classes';
import { getNextSectorId, SECTORS_CATALOG } from '../data/maps';
import { WINGMAN_CHAT_KEYS } from '../data/pilots';
import { getSkillById } from '../data/skills';
import {
  calculateBattleRewards,
  chooseAiDecision,
  createInitialBattleState,
  createRoundHpSnapshot,
  getValidEnemyTargets,
  reconcileRemainingTurnOrder,
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
  acceptBaseBonusMission,
  advanceCampaignMonth,
  applyBaseEngineerBoost,
  applyBattleBaseConsequences,
  type BaseActionResult,
  hirePilotForNextBattle,
  type MonthAdvanceSummary,
  startBaseRepair,
} from '../engine/mapWorld';
import {
  createDefaultAdminConfig,
  createFreshCampaignState,
  CURRENT_SAVE_VERSION,
  migrateSaveData,
} from '../engine/migration';
import {
  buyOpeningCard,
  equipSkillToGearBar,
  learnOrUpgradeSkillOnGear,
  unequipSkillFromGearBar,
} from '../engine/skills';
import {
  allocateGearStats,
  applyExpToGear,
  estimateBattlesToNextLevel,
  getTotalAvailablePointsForLevel,
  resetGearStatAllocations,
} from '../engine/stats';
import {
  chooseAction,
  createBlankTacticsRule,
  createDefaultSimpleTactics,
  createPresetTactics,
  createSimplePresetConfig,
  evaluateAutoSafety,
  generateTacticsFromSimple,
  sanitizeGearTactics,
  shouldStopAutoRepeat,
} from '../engine/tactics';
import type {
  ActionType,
  AdminConfig,
  AutoRepeatLimit,
  AutoRepeatSession,
  AutoSafetyConfig,
  AutoStopReason,
  BaseTab,
  BattleEvent,
  BattleRoundSnapshot,
  BattleSpeed,
  BattleState,
  BattleViewMode,
  CombatLogEntry,
  CombatUnit,
  EnchantAttemptResult,
  EquipmentSlot,
  EquipValidationResult,
  GearTacticsProfile,
  ItemInstance,
  ItemRarity,
  Language,
  MechClassId,
  PilotAccount,
  ScreenState,
  SimpleTacticsConfig,
  SimpleTacticsPresetId,
  SkillValidationResult,
  StatBlock,
  TacticsPresetId,
  TacticsRule,
} from '../types/game';
import { soundFx } from '../utils/sound';

export type ShopSubTab = 'buy' | 'sell' | 'warpoints';

interface GameStoreState {
  // Persisted state (v5 per-Gear + full Skill System + War Points)
  pilot: PilotAccount;
  shopStock: ItemInstance[];
  selectedSectorId: string;
  hasSaveData: boolean;
  muted: boolean;
  battleSpeed: BattleSpeed;
  skipAnimations: boolean;
  battleViewMode: BattleViewMode | null;
  language: Language;
  adminConfig: AdminConfig;

  // Session UI / Battle state (transient)
  screen: ScreenState;
  activeTab: BaseTab;
  shopSubTab: ShopSubTab;
  battle: BattleState | null;
  adminPanelOpen: boolean;
  autoBattleEnabled: boolean;
  tacticsModalOpen: boolean;
  autoRepeatLimit: AutoRepeatLimit;
  autoRepeatSession: AutoRepeatSession | null;

  // Language
  setLanguage: (lang: Language) => void;

  // Navigation & Campaign creation
  setScreen: (screen: ScreenState) => void;
  setActiveTab: (tab: BaseTab) => void;
  setShopSubTab: (subTab: ShopSubTab) => void;
  openWarPointShop: () => void;
  startCampaign: (pilotName?: string, starterClassId?: MechClassId) => void;
  continueCampaign: () => void;
  resetCampaign: () => void;

  // Pilot & Garage (per-Gear) actions
  setPilotName: (name: string) => void;
  selectActiveGear: (classId: MechClassId) => void;
  buyGear: (classId: MechClassId) => { ok: boolean; cost: number };
  commitStatAllocations: (pending: StatBlock) => void;
  resetStatAllocations: () => void;
  selectSector: (sectorId: string) => void;
  repairBase: (sectorId: string) => BaseActionResult;
  advanceMonth: () => MonthAdvanceSummary;
  hireWingmanAtBase: (sectorId: string, classId?: MechClassId) => BaseActionResult;
  acceptMissionAtBase: (sectorId: string) => BaseActionResult;
  useEngineerAtBase: (sectorId: string) => BaseActionResult;

  // Gear Skill System actions (engine-enforced class locks & per-Gear bars)
  learnOrUpgradeSkill: (
    skillId: string
  ) => { validation: SkillValidationResult; newLevel: number };
  equipSkillToBar: (skillId: string) => SkillValidationResult;
  unequipSkillFromBar: (skillId: string) => void;
  buyOpeningCardAction: (cardId: string) => {
    ok: boolean;
    reason: 'ok' | 'invalid_card' | 'already_owned' | 'insufficient_wp';
    cost: number;
  };

  // Auto Battle & Per-Gear Tactics actions
  setAutoBattleEnabled: (enabled: boolean) => void;
  toggleAutoBattle: () => void;
  setTacticsModalOpen: (open: boolean) => void;
  setActiveGearTactics: (tactics: GearTacticsProfile) => void;
  applySimpleTactics: (patch: Partial<SimpleTacticsConfig>) => void;
  applySimpleTacticsPreset: (presetId: SimpleTacticsPresetId) => void;
  resetTacticsToSimple: () => void;
  loadTacticsPreset: (presetId: TacticsPresetId) => void;
  addTacticsRule: () => void;
  updateTacticsRule: (ruleId: string, patch: Partial<TacticsRule>) => void;
  deleteTacticsRule: (ruleId: string) => void;
  reorderTacticsRules: (fromIndex: number, toIndex: number) => void;
  updateTacticsSafety: (patch: Partial<AutoSafetyConfig>) => void;
  setAutoRepeatLimit: (limit: AutoRepeatLimit) => void;
  startAutoRepeat: (limit?: AutoRepeatLimit, sectorId?: string) => void;
  stopAutoRepeat: (reason?: AutoStopReason) => void;
  clearAutoRepeatSummary: () => void;

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
  selectAllyTarget: (unitId: string) => void;
  performPlayerAction: (action: ActionType, skillId?: string) => void;
  performAutoPlayerTurn: () => void;
  performAiTurn: () => void;
  retreatBattle: () => void;
  forceWinBattle: () => void;
  clearExpiredPopups: (ids: string[]) => void;
  clearExpiredFx: (ids: string[]) => void;
  clearExplodedUnits: (ids: string[]) => void;
  clearWingmanChat: () => void;
  returnToHangar: () => void;

  // Audio, View & Speed controls
  toggleMute: () => void;
  setBattleSpeed: (speed: BattleSpeed) => void;
  toggleSkipAnimations: () => void;
  setBattleViewMode: (mode: BattleViewMode) => void;

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
  adminSetWarPoints: (amount: number) => void;
  adminAddWarPoints: (delta: number) => void;
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
  turnOrder: string[],
  units: CombatUnit[],
  startFromIndex: number
): { nextIndex: number; wrappedRound: boolean } {
  const total = turnOrder.length;
  for (let step = 1; step <= total; step++) {
    const idx = (startFromIndex + step) % total;
    const unitId = turnOrder[idx];
    const unit = units.find((u) => u.id === unitId);
    if (unit && unit.alive) {
      const wrappedRound = startFromIndex + step >= total;
      return { nextIndex: idx, wrappedRound };
    }
  }
  return { nextIndex: startFromIndex, wrappedRound: false };
}

function enrichLogEntries(
  entries: CombatLogEntry[],
  actor: CombatUnit,
  autoRuleNumber?: number
): CombatLogEntry[] {
  return entries.map((e, idx) => ({
    ...e,
    actorSide: e.actorSide ?? actor.side,
    actorIsPlayer: e.actorName === actor.name ? actor.isPlayer : e.actorIsPlayer,
    actorIsBoss: e.actorName === actor.name ? Boolean(actor.isBoss) : e.actorIsBoss,
    // Tag the primary action log entry with [AUTO #N] when executed by Auto tactics
    autoRuleNumber:
      autoRuleNumber !== undefined && idx === 0 ? autoRuleNumber : e.autoRuleNumber,
  }));
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

function appendRoundSnapshot(
  snapshots: BattleRoundSnapshot[],
  round: number,
  units: CombatUnit[]
): BattleRoundSnapshot[] {
  const snap = createRoundHpSnapshot(round, units);
  const idx = snapshots.findIndex((s) => s.round === round);
  if (idx >= 0) {
    const next = [...snapshots];
    next[idx] = snap;
    return next;
  }
  return [...snapshots, snap];
}

function stampTurnEvents(
  events: BattleEvent[],
  turnNumber: number
): BattleEvent[] {
  return events.map((e) => ({ ...e, turn: turnNumber }));
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
  extraExploded = battle.explodedUnitIds,
  extraEvents = battle.events,
  extraTurnCounter = battle.turnCounter
): Partial<GameStoreState> {
  const deployedGearId = battle.deployedGearId;
  const deployedGear = state.pilot.gears[deployedGearId];
  const alreadyCaptured = state.pilot.capturedSectorIds.includes(battle.sectorId);

  const rewards = calculateBattleRewards(
    updatedUnits,
    won,
    state.adminConfig.rewardMultiplier,
    battle.sectorId,
    alreadyCaptured
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

  // Unlock next campaign sector & record base capture on victory
  let unlockedSectorId: string | null = null;
  let nextUnlockedSectors = state.pilot.unlockedSectorIds;
  let nextCapturedSectors = state.pilot.capturedSectorIds;
  if (won) {
    if (!alreadyCaptured) {
      nextCapturedSectors = [...state.pilot.capturedSectorIds, battle.sectorId];
    }
    const candidateNext = getNextSectorId(battle.sectorId);
    if (candidateNext && !state.pilot.unlockedSectorIds.includes(candidateNext)) {
      unlockedSectorId = candidateNext;
      nextUnlockedSectors = [...state.pilot.unlockedSectorIds, candidateNext];
    }
  }

  const basePilotBeforeConsequences: PilotAccount = {
    ...state.pilot,
    credits: state.pilot.credits + rewards.creditsGained,
    warPoints: state.pilot.warPoints + rewards.warPointsGained,
    inventory: [...droppedItems, ...state.pilot.inventory],
    gears: {
      ...state.pilot.gears,
      [deployedGearId]: levelResult.updatedGear,
    },
    unlockedSectorIds: nextUnlockedSectors,
    capturedSectorIds: nextCapturedSectors,
  };

  // Freshly captured bases start Damaged; repelled raids clear alert; hired wingman/engineer boost consumed; bonus missions paid
  const baseConseq = applyBattleBaseConsequences(
    basePilotBeforeConsequences,
    battle.sectorId,
    won
  );
  // Advance campaign calendar 1 month after each completed non-retreat sortie
  const monthStep = retreated
    ? { pilot: baseConseq.pilot }
    : advanceCampaignMonth(baseConseq.pilot);
  const nextPilot: PilotAccount = monthStep.pilot;

  // Auto-refresh randomized shop stock after every battle
  const refreshedShopStock = generateShopStock(
    levelResult.updatedGear.level,
    BALANCE_CONFIG.shopStockSize
  );

  if (won) soundFx.playVictory();
  else soundFx.playDefeat();

  const enemies = updatedUnits.filter((u) => u.side === 'enemy');
  const aliveAllies = updatedUnits.filter((u) => u.side === 'ally' && u.alive);

  // Update Auto-Repeat batch session if active
  let nextAutoRepeat = state.autoRepeatSession;
  if (state.autoRepeatSession?.active) {
    const updatedSession: AutoRepeatSession = {
      ...state.autoRepeatSession,
      completedRuns: state.autoRepeatSession.completedRuns + 1,
      wins: state.autoRepeatSession.wins + (won ? 1 : 0),
      totalExp: state.autoRepeatSession.totalExp + rewards.expGained,
      totalCredits: state.autoRepeatSession.totalCredits + rewards.creditsGained,
      totalWarPoints:
        state.autoRepeatSession.totalWarPoints + rewards.warPointsGained,
      totalDrops: [...state.autoRepeatSession.totalDrops, ...droppedItems],
    };
    const stopCheck = shouldStopAutoRepeat(
      updatedSession,
      won ? 'victory' : 'defeat',
      retreated,
      nextPilot.inventory.length,
      BALANCE_CONFIG.maxInventorySize
    );
    nextAutoRepeat = stopCheck.stop
      ? {
          ...updatedSession,
          active: false,
          stopReason: updatedSession.stopReason ?? stopCheck.reason,
        }
      : updatedSession;
  }

  return {
    pilot: nextPilot,
    shopStock: refreshedShopStock,
    hasSaveData: true,
    autoRepeatSession: nextAutoRepeat,
    battle: {
      ...battle,
      units: updatedUnits,
      turnCounter: extraTurnCounter,
      log: extraLog,
      events: extraEvents,
      roundSnapshots: appendRoundSnapshot(
        battle.roundSnapshots,
        battle.round,
        updatedUnits
      ),
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
        warPointsGained: rewards.warPointsGained,
        baseCaptureBonusWp: rewards.baseCaptureBonusWp,
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
      shopSubTab: 'buy',
      battle: null,
      adminPanelOpen: false,
      autoBattleEnabled: false,
      tacticsModalOpen: false,
      autoRepeatLimit: 1,
      autoRepeatSession: null,

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

      setShopSubTab: (shopSubTab) => {
        soundFx.playClick();
        set({ shopSubTab });
      },

      openWarPointShop: () => {
        soundFx.playClick();
        set({ screen: 'HANGAR', activeTab: 'shop', shopSubTab: 'warpoints' });
      },

      startCampaign: (pilotName, starterClassId) => {
        const state = get();
        soundFx.playConfirm();
        if (!state.hasSaveData) {
          const cleanName =
            (pilotName ?? state.pilot.name).trim().slice(0, 18) || 'Vance';
          const chosenClass =
            starterClassId ?? state.pilot.activeGearId ?? 'striker';
          const fresh = createFreshCampaignState(cleanName, chosenClass);
          set({
            ...fresh,
            language: state.language,
            muted: state.muted,
            battleSpeed: state.battleSpeed,
            skipAnimations: state.skipAnimations,
            battleViewMode: state.battleViewMode,
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
          battleViewMode: state.battleViewMode,
          adminConfig: createDefaultAdminConfig(),
          hasSaveData: false,
          battle: null,
          screen: 'TITLE',
          activeTab: 'gear',
          shopSubTab: 'buy',
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

      // ---- GEAR SKILL SYSTEM ACTIONS ----
      learnOrUpgradeSkill: (skillId) => {
        const state = get();
        const res = learnOrUpgradeSkillOnGear(
          state.pilot,
          state.pilot.activeGearId,
          skillId
        );
        if (res.validation.ok) {
          soundFx.playVictory();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return { validation: res.validation, newLevel: res.newLevel };
      },

      equipSkillToBar: (skillId) => {
        const state = get();
        const res = equipSkillToGearBar(
          state.pilot,
          state.pilot.activeGearId,
          skillId
        );
        if (res.validation.ok) {
          soundFx.playConfirm();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return res.validation;
      },

      unequipSkillFromBar: (skillId) => {
        const state = get();
        const nextPilot = unequipSkillFromGearBar(
          state.pilot,
          state.pilot.activeGearId,
          skillId
        );
        if (nextPilot === state.pilot) return;
        soundFx.playClick();
        set({ pilot: nextPilot, hasSaveData: true });
      },

      buyOpeningCardAction: (cardId) => {
        const state = get();
        const res = buyOpeningCard(state.pilot, cardId);
        if (res.ok) {
          soundFx.playVictory();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return { ok: res.ok, reason: res.reason, cost: res.cost };
      },

      // ---- AUTO BATTLE & PER-GEAR TACTICS ACTIONS ----
      setAutoBattleEnabled: (enabled) => {
        soundFx.playClick();
        set((state) => ({
          autoBattleEnabled: enabled,
          battle: state.battle
            ? {
                ...state.battle,
                autoStopNotice: enabled ? null : state.battle.autoStopNotice,
              }
            : null,
        }));
      },

      toggleAutoBattle: () => {
        const next = !get().autoBattleEnabled;
        get().setAutoBattleEnabled(next);
      },

      setTacticsModalOpen: (tacticsModalOpen) => {
        soundFx.playClick();
        set({ tacticsModalOpen });
      },

      setActiveGearTactics: (tactics) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const clean = sanitizeGearTactics(gear.classId, tactics);
        set({
          pilot: {
            ...state.pilot,
            gears: {
              ...state.pilot.gears,
              [id]: {
                ...gear,
                tactics: clean,
              },
            },
          },
          hasSaveData: true,
        });
      },

      applySimpleTactics: (patch) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const currentSimple =
          gear.tactics.simple ??
          createDefaultSimpleTactics(gear.classId, gear.equippedSkillBar);
        const nextSimple: SimpleTacticsConfig = {
          ...currentSimple,
          ...patch,
        };
        const generated = generateTacticsFromSimple(
          gear.classId,
          nextSimple,
          gear.equippedSkillBar,
          gear.tactics.safety
        );
        soundFx.playClick();
        get().setActiveGearTactics(generated);
      },

      applySimpleTacticsPreset: (presetId) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const presetSimple = createSimplePresetConfig(
          presetId,
          gear.classId,
          gear.equippedSkillBar
        );
        const generated = generateTacticsFromSimple(
          gear.classId,
          presetSimple,
          gear.equippedSkillBar,
          gear.tactics.safety
        );
        soundFx.playConfirm();
        get().setActiveGearTactics(generated);
      },

      resetTacticsToSimple: () => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const baseSimple =
          gear.tactics.simple ??
          createDefaultSimpleTactics(gear.classId, gear.equippedSkillBar);
        const generated = generateTacticsFromSimple(
          gear.classId,
          baseSimple,
          gear.equippedSkillBar,
          gear.tactics.safety
        );
        soundFx.playConfirm();
        get().setActiveGearTactics(generated);
      },

      loadTacticsPreset: (presetId) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        soundFx.playConfirm();
        const preset = createPresetTactics(
          gear.classId,
          presetId,
          gear.equippedSkillBar
        );
        get().setActiveGearTactics({
          ...preset,
          mode: 'custom',
          simple:
            gear.tactics.simple ??
            createDefaultSimpleTactics(gear.classId, gear.equippedSkillBar),
        });
      },

      addTacticsRule: () => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        if (gear.tactics.rules.length >= BALANCE_CONFIG.maxTacticsRules) return;
        soundFx.playClick();
        get().setActiveGearTactics({
          ...gear.tactics,
          mode: 'custom',
          rules: [...gear.tactics.rules, createBlankTacticsRule()],
        });
      },

      updateTacticsRule: (ruleId, patch) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const nextRules = gear.tactics.rules.map((r) =>
          r.id === ruleId ? { ...r, ...patch } : r
        );
        get().setActiveGearTactics({
          ...gear.tactics,
          mode: 'custom',
          rules: nextRules,
        });
      },

      deleteTacticsRule: (ruleId) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        soundFx.playClick();
        get().setActiveGearTactics({
          ...gear.tactics,
          mode: 'custom',
          rules: gear.tactics.rules.filter((r) => r.id !== ruleId),
        });
      },

      reorderTacticsRules: (fromIndex, toIndex) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        const rules = [...gear.tactics.rules];
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= rules.length ||
          toIndex >= rules.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const [moved] = rules.splice(fromIndex, 1);
        rules.splice(toIndex, 0, moved);
        soundFx.playClick();
        get().setActiveGearTactics({
          ...gear.tactics,
          mode: 'custom',
          rules,
        });
      },

      updateTacticsSafety: (patch) => {
        const state = get();
        const id = state.pilot.activeGearId;
        const gear = state.pilot.gears[id];
        get().setActiveGearTactics({
          ...gear.tactics,
          safety: {
            ...gear.tactics.safety,
            ...patch,
          },
        });
      },

      setAutoRepeatLimit: (autoRepeatLimit) => {
        soundFx.playClick();
        set({ autoRepeatLimit });
      },

      startAutoRepeat: (limit, sectorId) => {
        const state = get();
        const chosenLimit = limit ?? state.autoRepeatLimit;
        const chosenSector =
          sectorId ?? state.battle?.sectorId ?? state.selectedSectorId;

        if (state.pilot.inventory.length >= BALANCE_CONFIG.maxInventorySize) {
          set({
            autoRepeatLimit: chosenLimit,
            autoRepeatSession: {
              active: false,
              limit: chosenLimit,
              sectorId: chosenSector,
              completedRuns: 0,
              wins: 0,
              totalExp: 0,
              totalCredits: 0,
              totalWarPoints: 0,
              totalDrops: [],
              stopReason: 'inventory_full',
            },
          });
          return;
        }

        soundFx.playConfirm();
        set({
          autoRepeatLimit: chosenLimit,
          autoBattleEnabled: true,
          autoRepeatSession: {
            active: true,
            limit: chosenLimit,
            sectorId: chosenSector,
            completedRuns: 0,
            wins: 0,
            totalExp: 0,
            totalCredits: 0,
            totalWarPoints: 0,
            totalDrops: [],
            stopReason: null,
          },
        });

        // If not currently in an ongoing battle, start immediately
        if (!state.battle || state.battle.summary) {
          get().startBattle(chosenSector);
        }
      },

      stopAutoRepeat: (reason = 'manual_stop') => {
        const state = get();
        if (!state.autoRepeatSession) return;
        soundFx.playClick();
        set({
          autoRepeatSession: {
            ...state.autoRepeatSession,
            active: false,
            stopReason: state.autoRepeatSession.stopReason ?? reason,
          },
        });
      },

      clearAutoRepeatSummary: () => {
        soundFx.playClick();
        set({ autoRepeatSession: null });
      },

      selectSector: (sectorId) => {
        const state = get();
        if (!state.pilot.unlockedSectorIds.includes(sectorId)) return;
        soundFx.playClick();
        set({ selectedSectorId: sectorId, hasSaveData: true });
      },

      repairBase: (sectorId) => {
        const state = get();
        const res = startBaseRepair(state.pilot, sectorId);
        if (res.ok) {
          soundFx.playConfirm();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return res;
      },

      advanceMonth: () => {
        const state = get();
        const summary = advanceCampaignMonth(state.pilot);
        soundFx.playConfirm();
        set({ pilot: summary.pilot, hasSaveData: true });
        return summary;
      },

      hireWingmanAtBase: (sectorId, classId = 'interceptor') => {
        const state = get();
        const res = hirePilotForNextBattle(state.pilot, sectorId, classId);
        if (res.ok) {
          soundFx.playConfirm();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return res;
      },

      acceptMissionAtBase: (sectorId) => {
        const state = get();
        const res = acceptBaseBonusMission(state.pilot, sectorId);
        if (res.ok) {
          soundFx.playConfirm();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return res;
      },

      useEngineerAtBase: (sectorId) => {
        const state = get();
        const res = applyBaseEngineerBoost(state.pilot, sectorId);
        if (res.ok) {
          soundFx.playConfirm();
          set({ pilot: res.pilot, hasSaveData: true });
        }
        return res;
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

        const battleState = createInitialBattleState(
          state.pilot,
          targetSectorId,
          Math.random,
          state.adminConfig.battleSizeOverride
        );
        soundFx.playConfirm();

        if (state.adminConfig.alwaysWin) {
          const defeatedEnemies = battleState.units.map((u) =>
            u.side === 'enemy'
              ? {
                  ...u,
                  hp: 0,
                  shield: 0,
                  alive: false,
                  animState: 'destroyed' as const,
                }
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

      selectAllyTarget: (unitId) => {
        const { battle } = get();
        if (!battle || battle.summary) return;
        const unit = battle.units.find((u) => u.id === unitId);
        if (!unit || !unit.alive || unit.side !== 'ally') return;
        soundFx.playClick();
        set({
          battle: {
            ...battle,
            selectedAllyTargetId: unitId,
          },
        });
      },

      performPlayerAction: (action, skillId) => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary || battle.isResolving) return;

        const activeUnitId = battle.turnOrder[battle.activeTurnIndex];
        const activeUnit = battle.units.find((u) => u.id === activeUnitId);
        if (!activeUnit || !activeUnit.isPlayer || !activeUnit.alive) return;

        const bypassFx = state.skipAnimations || state.battleSpeed === 10;

        // Route single_ally skills to selectedAllyTargetId; offensive actions to selectedTargetId
        const skillDef = skillId ? getSkillById(skillId) : undefined;
        const resolvedTargetId =
          action === 'skill' && skillDef?.targetType === 'single_ally'
            ? battle.selectedAllyTargetId ?? activeUnit.id
            : battle.selectedTargetId;

        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          action,
          resolvedTargetId,
          battle.round,
          state.adminConfig,
          Math.random,
          skillId
        );
        playCue(resolution.soundCue, bypassFx);

        const targetedEnemy =
          resolvedTargetId &&
          battle.units.some((u) => u.id === resolvedTargetId && u.side === 'enemy')
            ? resolvedTargetId
            : battle.lastPlayerTargetId;

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextTurnCounter = battle.turnCounter + 1;
        const nextEvents = [
          ...battle.events,
          ...stampTurnEvents(resolution.events, nextTurnCounter),
        ].slice(-5000);
        const enrichedLogs = enrichLogEntries(resolution.logEntries, activeUnit);
        const nextLog = [...battle.log, ...enrichedLogs];
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
              nextExploded,
              nextEvents,
              nextTurnCounter
            )
          );
          return;
        }

        // Reconcile upcoming units in current round by live Speed DESC
        const reconciledOrder = reconcileRemainingTurnOrder(
          battle.turnOrder,
          battle.activeTurnIndex,
          resolution.updatedUnits
        );
        const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
          reconciledOrder,
          resolution.updatedUnits,
          battle.activeTurnIndex
        );

        let nextTurnOrder = reconciledOrder;
        let finalTurnIndex = nextIndex;
        const nextRound = wrappedRound ? battle.round + 1 : battle.round;
        let nextSnapshots = appendRoundSnapshot(
          battle.roundSnapshots,
          battle.round,
          resolution.updatedUnits
        );
        if (wrappedRound) {
          nextTurnOrder = sortTurnOrder(resolution.updatedUnits);
          const firstAliveIdx = nextTurnOrder.findIndex((id) =>
            resolution.updatedUnits.some((u) => u.id === id && u.alive)
          );
          finalTurnIndex = Math.max(0, firstAliveIdx);
          nextSnapshots = appendRoundSnapshot(
            nextSnapshots,
            nextRound,
            resolution.updatedUnits
          );
        }

        const playerNext = resolution.updatedUnits.find((u) => u.isPlayer);
        const validFrontEnemies = playerNext
          ? getValidEnemyTargets(resolution.updatedUnits, playerNext, 'attack')
          : aliveEnemies;
        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );
        const currentAllyStillAlive = aliveAllies.some(
          (a) => a.id === battle.selectedAllyTargetId
        );

        set({
          battle: {
            ...battle,
            units: resolution.updatedUnits,
            turnCounter: nextTurnCounter,
            log: nextLog,
            events: nextEvents,
            roundSnapshots: nextSnapshots,
            popups: nextPopups,
            fxEvents: nextFx,
            explodedUnitIds: nextExploded,
            turnOrder: nextTurnOrder,
            activeTurnIndex: finalTurnIndex,
            round: nextRound,
            selectedTargetId: currentTargetStillAlive
              ? battle.selectedTargetId
              : validFrontEnemies[0]?.id ?? aliveEnemies[0]?.id ?? null,
            selectedAllyTargetId: currentAllyStillAlive
              ? battle.selectedAllyTargetId
              : aliveAllies[0]?.id ?? null,
            lastPlayerTargetId: targetedEnemy,
            autoStopNotice: null,
            isResolving: false,
          },
        });
      },

      performAutoPlayerTurn: () => {
        const state = get();
        const { battle } = state;
        if (!battle || battle.summary || battle.isResolving || !state.autoBattleEnabled) {
          return;
        }

        const activeUnitId = battle.turnOrder[battle.activeTurnIndex];
        const activeUnit = battle.units.find((u) => u.id === activeUnitId);
        if (!activeUnit || !activeUnit.isPlayer || !activeUnit.alive) return;

        const deployedGear = state.pilot.gears[battle.deployedGearId];
        const tactics = deployedGear.tactics;

        // 1. Evaluate Safety Stops before executing Auto turn
        const safetyEval = evaluateAutoSafety(battle, activeUnit, tactics.safety);
        if (safetyEval.shouldRetreat) {
          set((prev) => ({
            autoBattleEnabled: false,
            autoRepeatSession: prev.autoRepeatSession?.active
              ? {
                  ...prev.autoRepeatSession,
                  stopReason: 'auto_retreat',
                }
              : prev.autoRepeatSession,
          }));
          get().retreatBattle();
          return;
        }
        if (safetyEval.shouldStopAuto && safetyEval.reason) {
          soundFx.playEvade();
          set((prev) => ({
            autoBattleEnabled: false,
            autoRepeatSession: prev.autoRepeatSession?.active
              ? {
                  ...prev.autoRepeatSession,
                  active: false,
                  stopReason: safetyEval.reason,
                }
              : prev.autoRepeatSession,
            battle: prev.battle
              ? { ...prev.battle, autoStopNotice: safetyEval.reason }
              : null,
          }));
          return;
        }

        // 2. Evaluate pure Tactics engine (top-to-bottom priority)
        const choice = chooseAction(battle, activeUnit, tactics, Math.random);
        const autoRuleNumber =
          choice.matchedRuleIndex !== null ? choice.matchedRuleIndex + 1 : 0;

        const bypassFx = state.skipAnimations || state.battleSpeed === 10;
        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          choice.action,
          choice.targetId,
          battle.round,
          state.adminConfig,
          Math.random,
          choice.skillId
        );
        playCue(resolution.soundCue, bypassFx);

        const targetedEnemy =
          choice.targetId &&
          battle.units.some((u) => u.id === choice.targetId && u.side === 'enemy')
            ? choice.targetId
            : battle.lastPlayerTargetId;

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextTurnCounter = battle.turnCounter + 1;
        const nextEvents = [
          ...battle.events,
          ...stampTurnEvents(resolution.events, nextTurnCounter),
        ].slice(-5000);
        const enrichedLogs = enrichLogEntries(
          resolution.logEntries,
          activeUnit,
          autoRuleNumber
        );
        const nextLog = [...battle.log, ...enrichedLogs];
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
              nextExploded,
              nextEvents,
              nextTurnCounter
            )
          );
          return;
        }

        const reconciledOrder = reconcileRemainingTurnOrder(
          battle.turnOrder,
          battle.activeTurnIndex,
          resolution.updatedUnits
        );
        const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
          reconciledOrder,
          resolution.updatedUnits,
          battle.activeTurnIndex
        );

        let nextTurnOrder = reconciledOrder;
        let finalTurnIndex = nextIndex;
        const nextRound = wrappedRound ? battle.round + 1 : battle.round;
        let nextSnapshots = appendRoundSnapshot(
          battle.roundSnapshots,
          battle.round,
          resolution.updatedUnits
        );
        if (wrappedRound) {
          nextTurnOrder = sortTurnOrder(resolution.updatedUnits);
          const firstAliveIdx = nextTurnOrder.findIndex((id) =>
            resolution.updatedUnits.some((u) => u.id === id && u.alive)
          );
          finalTurnIndex = Math.max(0, firstAliveIdx);
          nextSnapshots = appendRoundSnapshot(
            nextSnapshots,
            nextRound,
            resolution.updatedUnits
          );
        }

        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === (targetedEnemy ?? battle.selectedTargetId)
        );
        const currentAllyStillAlive = aliveAllies.some(
          (a) => a.id === battle.selectedAllyTargetId
        );

        set({
          battle: {
            ...battle,
            units: resolution.updatedUnits,
            turnCounter: nextTurnCounter,
            log: nextLog,
            events: nextEvents,
            roundSnapshots: nextSnapshots,
            popups: nextPopups,
            fxEvents: nextFx,
            explodedUnitIds: nextExploded,
            turnOrder: nextTurnOrder,
            activeTurnIndex: finalTurnIndex,
            round: nextRound,
            selectedTargetId: currentTargetStillAlive
              ? targetedEnemy ?? battle.selectedTargetId
              : aliveEnemies[0]?.id ?? null,
            selectedAllyTargetId: currentAllyStillAlive
              ? battle.selectedAllyTargetId
              : aliveAllies[0]?.id ?? null,
            lastPlayerTargetId: targetedEnemy,
            autoStopNotice: null,
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
            battle.turnOrder,
            battle.units,
            battle.activeTurnIndex
          );
          let nextTurnOrder = battle.turnOrder;
          let finalTurnIndex = nextIndex;
          if (wrappedRound) {
            nextTurnOrder = sortTurnOrder(battle.units);
            finalTurnIndex = Math.max(
              0,
              nextTurnOrder.findIndex((id) =>
                battle.units.some((u) => u.id === id && u.alive)
              )
            );
          }
          set({
            battle: {
              ...battle,
              turnOrder: nextTurnOrder,
              activeTurnIndex: finalTurnIndex,
              round: wrappedRound ? battle.round + 1 : battle.round,
            },
          });
          return;
        }

        // If player is mid-Charge Shot, auto-release their charged attack immediately!
        const playerIsCharging =
          activeUnit.isPlayer &&
          activeUnit.statuses.some((s) => s.type === 'charging');
        if (activeUnit.isPlayer && !playerIsCharging) return;

        const bypassFx = state.skipAnimations || state.battleSpeed === 10;
        const decision = playerIsCharging
          ? {
              action: 'attack' as ActionType,
              targetId: battle.selectedTargetId,
              skillId: undefined,
            }
          : chooseAiDecision(activeUnit, battle.units);

        const resolution = resolveUnitAction(
          battle.units,
          activeUnit.id,
          decision.action,
          decision.targetId,
          battle.round,
          state.adminConfig,
          Math.random,
          decision.skillId
        );
        playCue(resolution.soundCue, bypassFx);

        const aliveEnemies = resolution.updatedUnits.filter(
          (u) => u.side === 'enemy' && u.alive
        );
        const aliveAllies = resolution.updatedUnits.filter(
          (u) => u.side === 'ally' && u.alive
        );

        const nextTurnCounter = battle.turnCounter + 1;
        const nextEvents = [
          ...battle.events,
          ...stampTurnEvents(resolution.events, nextTurnCounter),
        ].slice(-5000);
        const enrichedLogs = enrichLogEntries(resolution.logEntries, activeUnit);
        const nextLog = [...battle.log, ...enrichedLogs];
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
              nextExploded,
              nextEvents,
              nextTurnCounter
            )
          );
          return;
        }

        // Reconcile upcoming units in current round by live Speed DESC
        const reconciledOrder = reconcileRemainingTurnOrder(
          battle.turnOrder,
          battle.activeTurnIndex,
          resolution.updatedUnits
        );
        const { nextIndex, wrappedRound } = findNextAliveTurnIndex(
          reconciledOrder,
          resolution.updatedUnits,
          battle.activeTurnIndex
        );

        let nextTurnOrder = reconciledOrder;
        let finalTurnIndex = nextIndex;
        const nextRound = wrappedRound ? battle.round + 1 : battle.round;
        let nextSnapshots = appendRoundSnapshot(
          battle.roundSnapshots,
          battle.round,
          resolution.updatedUnits
        );
        if (wrappedRound) {
          nextTurnOrder = sortTurnOrder(resolution.updatedUnits);
          const firstAliveIdx = nextTurnOrder.findIndex((id) =>
            resolution.updatedUnits.some((u) => u.id === id && u.alive)
          );
          finalTurnIndex = Math.max(0, firstAliveIdx);
          nextSnapshots = appendRoundSnapshot(
            nextSnapshots,
            nextRound,
            resolution.updatedUnits
          );
        }

        // Occasional AI wingman radio callout (~28% chance when animations are enabled)
        let nextWingmanChat = battle.wingmanChat ?? null;
        if (
          !bypassFx &&
          activeUnit.side === 'ally' &&
          !activeUnit.isPlayer &&
          Math.random() < 0.28
        ) {
          const textKey =
            WINGMAN_CHAT_KEYS[
              Math.floor(Math.random() * WINGMAN_CHAT_KEYS.length)
            ];
          nextWingmanChat = {
            id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            unitId: activeUnit.id,
            unitName: activeUnit.name,
            textKey,
          };
        }

        const playerNext = resolution.updatedUnits.find((u) => u.isPlayer);
        const validFrontEnemies = playerNext
          ? getValidEnemyTargets(resolution.updatedUnits, playerNext, 'attack')
          : aliveEnemies;
        const currentTargetStillAlive = aliveEnemies.some(
          (e) => e.id === battle.selectedTargetId
        );
        const currentAllyStillAlive = aliveAllies.some(
          (a) => a.id === battle.selectedAllyTargetId
        );

        set({
          battle: {
            ...battle,
            units: resolution.updatedUnits,
            turnCounter: nextTurnCounter,
            log: nextLog,
            events: nextEvents,
            roundSnapshots: nextSnapshots,
            popups: nextPopups,
            fxEvents: nextFx,
            explodedUnitIds: nextExploded,
            wingmanChat: nextWingmanChat,
            turnOrder: nextTurnOrder,
            activeTurnIndex: finalTurnIndex,
            round: nextRound,
            selectedTargetId: currentTargetStillAlive
              ? battle.selectedTargetId
              : validFrontEnemies[0]?.id ?? aliveEnemies[0]?.id ?? null,
            selectedAllyTargetId: currentAllyStillAlive
              ? battle.selectedAllyTargetId
              : aliveAllies[0]?.id ?? null,
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
            ? {
                ...u,
                hp: 0,
                shield: 0,
                alive: false,
                animState: 'destroyed' as const,
              }
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

      clearWingmanChat: () => {
        const { battle } = get();
        if (!battle || !battle.wingmanChat) return;
        set({
          battle: {
            ...battle,
            wingmanChat: null,
          },
        });
      },

      returnToHangar: () => {
        soundFx.playClick();
        set({
          battle: null,
          screen: 'HANGAR',
          autoRepeatSession: null,
        });
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

      setBattleViewMode: (battleViewMode) => {
        soundFx.playClick();
        set({ battleViewMode });
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

      adminSetWarPoints: (amount) => {
        set((state) => ({
          pilot: {
            ...state.pilot,
            warPoints: Math.max(0, Math.floor(amount) || 0),
          },
          hasSaveData: true,
        }));
      },

      adminAddWarPoints: (delta) => {
        set((state) => ({
          pilot: {
            ...state.pilot,
            warPoints: Math.max(
              0,
              state.pilot.warPoints + (Math.floor(delta) || 0)
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
        battleViewMode: state.battleViewMode,
        language: state.language,
        adminConfig: state.adminConfig,
      }),
      migrate: (persistedState: unknown, version: number) =>
        migrateSaveData(persistedState, version),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[useGameStore] Failed to rehydrate persisted state:', error);
          return;
        }
        if (state) {
          // Validate & sanitize persisted UI slice so corrupted preferences cannot crash on reload
          const validSpeeds: BattleSpeed[] = [1, 2, 3, 5, 10];
          if (!validSpeeds.includes(state.battleSpeed)) {
            state.battleSpeed = 1;
          }
          if (
            state.battleViewMode !== null &&
            state.battleViewMode !== 'card' &&
            state.battleViewMode !== 'radar'
          ) {
            state.battleViewMode = null;
          }
          if (state.language !== 'en' && state.language !== 'vi') {
            state.language = 'vi';
          }
          if (
            typeof state.selectedSectorId !== 'string' ||
            !SECTORS_CATALOG.some((s) => s.id === state.selectedSectorId)
          ) {
            state.selectedSectorId = SECTORS_CATALOG[0].id;
          }
          if (!state.adminConfig || typeof state.adminConfig !== 'object') {
            state.adminConfig = createDefaultAdminConfig();
          } else if (
            typeof state.adminConfig.rewardMultiplier !== 'number' ||
            !Number.isFinite(state.adminConfig.rewardMultiplier) ||
            state.adminConfig.rewardMultiplier <= 0
          ) {
            state.adminConfig = {
              ...createDefaultAdminConfig(),
              ...state.adminConfig,
              rewardMultiplier: BALANCE_CONFIG.rewardMultDefault,
            };
          }
          // Ensure transient modal/UI flags are always reset on reload
          state.adminPanelOpen = false;
          state.tacticsModalOpen = false;
          state.muted = Boolean(state.muted);
          state.skipAnimations = Boolean(state.skipAnimations);
          soundFx.setMuted(state.muted);
        }
      },
    }
  )
);
