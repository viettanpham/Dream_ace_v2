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
  critChance: number; // 5 to 65 (%)
  skillPower: number;
  armorPiercePct: number; // from equipped weapon/item traits (0 to 50)
  splashPct: number; // splash damage % on basic attacks (0 to 40)
  spRegenPerTurn: number; // bonus SP regen per turn from item traits
}

export type StatusEffectType = 'burn' | 'shield_break' | 'slow';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  turnsRemaining: number;
  sourceName?: string;
}

export type SkillTargetType = 'single_enemy' | 'all_enemies' | 'all_allies';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  spCost: number;
  spCostPerLevel: number;
  targetType: SkillTargetType;
  powerMultiplier: number;
  powerPerLevel: number;
  defensePierce: number; // 0 to 1
  hits: number;
  bonusCrit: number; // percentage points
  shieldRestoreRatio: number; // % of maxShield restored (for support skills)
  hpRestoreRatio: number; // % of maxHp restored (for support skills)
  appliesStatus?: StatusEffectType;
  statusDuration?: number;
  statusChance?: number; // 0 to 1
  cleansesStatus?: boolean;
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
  hasBoss: boolean;
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

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemSpecialTraits {
  critBonusPct?: number;
  armorPiercePct?: number;
  splashPct?: number;
  spRegenPerTurn?: number;
  evasionMod?: number; // can be negative on heavy cannons
}

export interface ItemTemplate {
  id: string;
  nameEn: string;
  nameVi: string;
  descEn: string;
  descVi: string;
  slot: EquipmentSlot;
  tier: number; // 1 to 4
  requiredLevel: number;
  classRestriction: MechClassId | null;
  basePrice: number;
  primaryStat: StatKey;
  primaryRange: [number, number];
  secondaryStat?: StatKey;
  secondaryRange?: [number, number];
  affixPool: StatKey[];
  specialTraits?: ItemSpecialTraits;
}

export interface ItemAffix {
  stat: StatKey;
  value: number;
  suffixId: string;
}

export interface ItemInstance {
  instanceId: string;
  templateId: string;
  slot: EquipmentSlot;
  tier: number;
  requiredLevel: number;
  classRestriction: MechClassId | null;
  rarity: ItemRarity;
  rolledBaseStats: Partial<StatBlock>;
  affixes: ItemAffix[];
  suffixId: string | null;
  rollQuality: number; // 0 to 100
  price: number;
  enchantLevel: number; // 0 to 10
  specialTraits?: ItemSpecialTraits;
}

/**
 * Each Gear stores references (instanceId) to items owned in PilotAccount.inventory.
 * An item instanceId can only be referenced by at most ONE Gear at a time.
 */
export type EquippedSlotIds = Record<EquipmentSlot, string | null>;

export interface EquipValidationResult {
  canEquip: boolean;
  missingLevel: number | null;
  requiredClass: MechClassId | null;
  equippedOnOtherGear: MechClassId | null;
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
  instanceId: string;
  templateId: string;
  previousLevel: number;
  newLevel: number;
  creditsSpent: number;
  successRate: number;
}

export interface GearUnit {
  classId: MechClassId;
  owned: boolean;
  level: number;
  exp: number;
  unspentPoints: number;
  allocatedPoints: StatBlock;
  equipped: EquippedSlotIds;
  skillLevels: Record<string, number>; // skillId -> 1..5
  battlesWon: number;
  battlesFought: number;
}

export interface PilotAccount {
  name: string;
  credits: number;
  inventory: ItemInstance[];
  gears: Record<MechClassId, GearUnit>;
  activeGearId: MechClassId;
  unlockedSectorIds: string[];
}

export type EnemyArchetype = 'drone' | 'gunship' | 'sniper' | 'repair_ship';

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
  archetype?: EnemyArchetype;
  isBoss?: boolean;
  level: number;
  skillLevel: number;
  stats: StatBlock;
  derived: DerivedStats;
  hp: number;
  shield: number;
  sp: number;
  isDefending: boolean;
  alive: boolean;
  statuses: ActiveStatusEffect[];
  animState: UnitAnimState;
}

export type ActionType = 'attack' | 'skill' | 'defend';

export type PopupTone =
  | 'damage'
  | 'crit'
  | 'shield'
  | 'heal'
  | 'evade'
  | 'buff'
  | 'status';

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
  | 'STATUS'
  | 'KO'
  | 'SYSTEM';

export type CombatLogTemplateKey =
  | 'log.battleStart'
  | 'log.defend'
  | 'log.healSquad'
  | 'log.evade'
  | 'log.damage'
  | 'log.destroyed'
  | 'log.statusApplied'
  | 'log.burnTick'
  | 'log.statusCleansed'
  | 'log.splashDamage'
  | 'log.retreat';

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
  retreated?: boolean;
  deployedGearId: MechClassId;
  sectorId: string;
  rounds: number;
  expGained: number;
  creditsGained: number;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  statPointsGained: number;
  battlesToNextLevel: number;
  unlockedSectorId: string | null;
  enemiesDestroyed: number;
  totalEnemies: number;
  alliesSurviving: number;
  droppedItems: ItemInstance[];
}

export interface BattleState {
  sectorId: string;
  deployedGearId: MechClassId;
  units: CombatUnit[];
  turnOrder: string[]; // unit IDs sorted by effective speed
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

export type BattleSpeed = 1 | 2 | 3 | 5 | 10;

export interface AdminConfig {
  godMode: boolean;
  oneHitKills: boolean;
  alwaysWin: boolean;
  rewardMultiplier: number;
}

export type BaseTab = 'gear' | 'garage' | 'skill' | 'shop' | 'map';

export type ScreenState = 'TITLE' | 'HANGAR' | 'SHOP' | 'BATTLE';
