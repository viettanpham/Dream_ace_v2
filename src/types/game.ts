export type Language = 'vi' | 'en';

export type StatKey =
  | 'attack'
  | 'defense'
  | 'fuel'
  | 'spirit'
  | 'shield'
  | 'evasion';

export type MechClassId = 'striker' | 'interceptor' | 'siege' | 'support';

export type StatBlock = Record<StatKey, number>;

export interface StatMeta {
  key: StatKey;
  label: string;
  shortLabel: string;
  effectSummary: string;
}

export interface DerivedStats {
  maxHp: number;
  maxShield: number;
  maxSp: number;
  speed: number;
  attackPower: number;
  defenseRating: number;
  dodgeChance: number; // 0 to 45 (%)
  critChance: number; // 5 to 40 (%)
  skillPower: number;
}

export type SkillTargetType = 'single_enemy' | 'all_enemies' | 'all_allies';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  spCost: number;
  targetType: SkillTargetType;
  powerMultiplier: number;
  defensePierce: number; // 0 to 1
  hits: number;
  bonusCrit: number; // percentage points
  shieldRestoreRatio: number; // % of maxShield restored (for support skills)
  hpRestoreRatio: number; // % of maxHp restored (for support skills)
}

export interface MechClassDefinition {
  id: MechClassId;
  name: string;
  chassisCode: string;
  role: string;
  description: string;
  accentHex: string;
  baseStats: StatBlock;
  perPointGain: StatBlock;
  baseHp: number;
  baseShield: number;
  baseSp: number;
  baseSpeed: number;
  signatureSkillId: string;
}

export type SectorDifficulty = 'Standard' | 'Hard' | 'Elite';

export interface SectorDefinition {
  id: string;
  name: string;
  regionCode: string;
  difficulty: SectorDifficulty;
  levelOffset: number;
  enemyCount: number;
  expMultiplier: number;
  creditsMultiplier: number;
  description: string;
}

export type EquipmentSlot =
  | 'main_weapon'
  | 'sub_weapon'
  | 'armor'
  | 'engine'
  | 'cpu'
  | 'accessory';

export type ItemRarity = 'common' | 'rare' | 'epic';

export interface ItemDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
  requiredLevel: number;
  classRestriction: MechClassId | null;
  rarity: ItemRarity;
  price: number;
  statBonuses: Partial<StatBlock>;
  description: string;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  enchantLevel: number; // 0 to 10
}

export type EquippedItems = Record<EquipmentSlot, ItemInstance | null>;

export interface EquipValidationResult {
  canEquip: boolean;
  missingLevel: number | null;
  requiredClass: MechClassId | null;
}

export type EnchantResultCode =
  | 'max_level'
  | 'insufficient_credits'
  | 'success'
  | 'failed';

export interface EnchantAttemptResult {
  attempted: boolean;
  success: boolean;
  code: EnchantResultCode;
  itemId: string;
  previousLevel: number;
  newLevel: number;
  creditsSpent: number;
  successRate: number;
}

export interface PlayerCharacter {
  name: string;
  level: number;
  exp: number;
  credits: number;
  classId: MechClassId;
  unspentPoints: number;
  allocatedPoints: StatBlock;
  equipped: EquippedItems;
  inventory: ItemInstance[];
  battlesWon: number;
  battlesFought: number;
}

export type CombatSide = 'ally' | 'enemy';

export type UnitAnimState =
  | 'idle'
  | 'attacking'
  | 'hit'
  | 'shielded'
  | 'evaded'
  | 'casting'
  | 'destroyed';

export interface CombatUnit {
  id: string;
  name: string;
  callsign: string;
  side: CombatSide;
  isPlayer: boolean;
  classId: MechClassId;
  level: number;
  stats: StatBlock;
  derived: DerivedStats;
  hp: number;
  shield: number;
  sp: number;
  isDefending: boolean;
  alive: boolean;
  animState: UnitAnimState;
}

export type ActionType = 'attack' | 'skill' | 'defend';

export type PopupTone = 'damage' | 'crit' | 'shield' | 'heal' | 'evade' | 'buff';

export interface FloatingPopup {
  id: string;
  unitId: string;
  text: string;
  tone: PopupTone;
}

export type CombatLogTag =
  | 'ATTACK'
  | 'SKILL'
  | 'DEFEND'
  | 'CRIT'
  | 'EVADE'
  | 'SHIELD'
  | 'HEAL'
  | 'KO'
  | 'SYSTEM';

export type CombatLogTemplateKey =
  | 'log.battleStart'
  | 'log.defend'
  | 'log.healSquad'
  | 'log.evade'
  | 'log.damage'
  | 'log.destroyed';

export interface CombatLogEntry {
  id: string;
  round: number;
  actorName: string;
  actorSide?: CombatSide;
  tag: CombatLogTag;
  templateKey: CombatLogTemplateKey;
  params: Record<string, string | number>;
}

export type CombatFxKind = 'laser' | 'missile' | 'railgun' | 'heal';

export interface CombatFxEvent {
  id: string;
  kind: CombatFxKind;
  fromSide: CombatSide;
  fromSlotIndex: number; // 0..3
  toSide: CombatSide;
  toSlotIndices: number[];
  accentHex: string;
}

export interface BattleSummary {
  outcome: 'victory' | 'defeat';
  sectorId: string;
  rounds: number;
  expGained: number;
  creditsGained: number;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  statPointsGained: number;
  enemiesDestroyed: number;
  alliesSurviving: number;
  droppedItems: ItemInstance[];
}

export interface BattleState {
  sectorId: string;
  units: CombatUnit[];
  turnOrder: string[]; // unit IDs sorted by speed
  activeTurnIndex: number;
  round: number;
  selectedTargetId: string | null;
  log: CombatLogEntry[];
  popups: FloatingPopup[];
  fxEvents: CombatFxEvent[];
  explodedUnitIds: string[];
  isResolving: boolean;
  summary: BattleSummary | null;
}

export type ScreenState = 'TITLE' | 'HANGAR' | 'SHOP' | 'BATTLE';
