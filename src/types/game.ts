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
  spRegenPerTurn: number; // bonus SP regen per turn from item traits + passives
  passiveSkillDmgPct: number; // from Striker passive
}

export type StatusEffectType =
  | 'burn'
  | 'shield_break'
  | 'slow'
  | 'silence'
  | 'stealth'
  | 'vulnerable'
  | 'def_up'
  | 'def_down'
  | 'eva_up'
  | 'atk_up'
  | 'spd_up'
  | 'primary_dmg_up'
  | 'skill_dmg_up'
  | 'sure_hit'
  | 'counter'
  | 'evade_all'
  | 'invincible'
  | 'regen_hp'
  | 'siege_mode'
  | 'siege_defense'
  | 'charging';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  turnsRemaining: number; // 99 for active toggle stances
  magnitude?: number; // e.g., 0.25 = +25%
  charges?: number; // e.g., sure_hit (2), counter (1)
  breakOnAttack?: boolean; // Camouflage breaks on next attack
  isDebuff?: boolean;
  sourceSkillId?: string;
  targetId?: string; // stored target for Charge Shot
  sourceName?: string;
}

export type SkillClassScope = 'general' | MechClassId;

export type SkillCategory = 'normal' | 'special' | 'elite' | 'passive';

export type SkillTargetType =
  | 'self'
  | 'single_enemy'
  | 'multi_enemy'
  | 'all_enemies'
  | 'single_ally'
  | 'all_allies';

export type SkillIconKey =
  | 'shield'
  | 'wind'
  | 'flame'
  | 'crosshair'
  | 'target'
  | 'zap'
  | 'bomb'
  | 'battery'
  | 'ghost'
  | 'orbit'
  | 'anchor'
  | 'fortress'
  | 'snowflake'
  | 'shield_off'
  | 'eye_off'
  | 'ray'
  | 'sword'
  | 'rotate'
  | 'corner_down_left'
  | 'gauge'
  | 'radio'
  | 'sparkles'
  | 'skull'
  | 'heart'
  | 'radar'
  | 'bolt'
  | 'plus_circle'
  | 'waves'
  | 'swords'
  | 'shield_plus'
  | 'feather'
  | 'sun'
  | 'cleanse'
  | 'star';

export type SkillEffectKind =
  | 'buff_def'
  | 'buff_eva'
  | 'buff_primary_dmg'
  | 'buff_skill_dmg'
  | 'buff_sure_hit'
  | 'multi_attack'
  | 'splash_attack'
  | 'charge_attack'
  | 'stealth_turns'
  | 'aoe_elite_attack'
  | 'toggle_siege_mode'
  | 'toggle_siege_defense'
  | 'attack_slow'
  | 'attack_shield_break'
  | 'stealth_until_attack'
  | 'pierce_all_elite'
  | 'attack_pierce'
  | 'counter_stance'
  | 'retreat_back_eva'
  | 'buff_speed'
  | 'silence_target'
  | 'evade_all_round'
  | 'berserker_buff'
  | 'heal_single'
  | 'scan_reveal'
  | 'energize_single'
  | 'heal_field_hot'
  | 'energize_shield_field'
  | 'team_atk_up'
  | 'team_def_up'
  | 'team_eva_up'
  | 'invincible_ally'
  | 'purify_team'
  | 'full_recovery_elite'
  | 'passive_skill_dmg'
  | 'passive_def_pct'
  | 'passive_eva_spd'
  | 'passive_sp_regen';

export interface SkillDefinition {
  id: string;
  classScope: SkillClassScope;
  category: SkillCategory;
  icon: SkillIconKey;
  unlockLevel: number;
  spCost: number;
  cooldown: number; // turns (0 for toggles / passives / once-per-battle)
  targetType: SkillTargetType;
  effectKind: SkillEffectKind;
  powerMultiplier?: number; // e.g., 1.3 for 130%
  secondaryRatio?: number; // e.g., 0.5 for 50% splash, 0.3 for 30% pierce
  buffMagnitude?: number; // e.g., 0.25 for +25%
  secondaryMagnitude?: number; // e.g., second stat bonus in dual buffs
  duration?: number; // turns
  maxTargets?: number; // e.g., 3 for Strafing Run
  charges?: number; // e.g., 2 for Target Lock
  spAmount?: number; // e.g., +20 SP / +10 SP
  oncePerBattle?: boolean;
  isToggle?: boolean;
  openingCardId?: string;
}

export interface OpeningCardDefinition {
  id: string;
  skillId: string;
  classId: MechClassId;
  category: 'special' | 'elite';
  warPointCost: number;
}

export interface SkillValidationResult {
  ok: boolean;
  reason:
    | 'ok'
    | 'invalid_gear'
    | 'invalid_skill'
    | 'class_mismatch'
    | 'max_level'
    | 'missing_card'
    | 'level_too_low'
    | 'insufficient_credits'
    | 'is_passive'
    | 'not_learned'
    | 'already_equipped'
    | 'bar_full';
  requiredGearLevel?: number;
  requiredCardId?: string;
  cost?: number;
}

export interface BattleSkillUsability {
  canUse: boolean;
  reason:
    | 'ok'
    | 'class_mismatch'
    | 'not_equipped'
    | 'silenced'
    | 'charging'
    | 'on_cooldown'
    | 'already_used'
    | 'blocked_by_siege'
    | 'insufficient_sp';
  cooldownRemaining: number;
  spCost: number;
  isToggleActive?: boolean;
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
  evasionMod?: number;
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

export type TacticsConditionKind =
  | 'always'
  | 'my_hp_below'
  | 'my_shield_zero'
  | 'my_sp_gte'
  | 'my_sp_lt'
  | 'any_ally_hp_below'
  | 'any_ally_has_debuff'
  | 'enemy_count_gte'
  | 'target_has_shield'
  | 'target_hp_below'
  | 'any_enemy_stealthed'
  | 'round_eq'
  | 'first_round'
  | 'boss_present'
  | 'my_buff_not_active'
  | 'skill_off_cooldown';

export type TacticsTargetSelector =
  | 'lowest_hp_enemy'
  | 'highest_hp_enemy'
  | 'highest_atk_enemy'
  | 'fastest_enemy'
  | 'enemy_support_first'
  | 'enemy_sniper_first'
  | 'front_row_first'
  | 'back_row_first'
  | 'random_enemy'
  | 'same_as_last_turn'
  | 'self'
  | 'lowest_hp_ally'
  | 'all_allies';

export interface TacticsCondition {
  kind: TacticsConditionKind;
  value?: number; // percentage (0..100), SP amount, enemy count, or round number
  buffType?: StatusEffectType; // used by my_buff_not_active
  skillId?: string; // used by skill_off_cooldown
}

export interface TacticsActionSpec {
  type: ActionType;
  skillId?: string;
}

export interface TacticsRule {
  id: string;
  enabled: boolean;
  condition: TacticsCondition;
  action: TacticsActionSpec;
  targetSelector: TacticsTargetSelector;
}

export interface AutoSafetyConfig {
  stopOnLowHpEnabled: boolean;
  stopOnLowHpPct: number; // default 25
  stopOnEliteReady: boolean;
  stopOnBossPresent: boolean;
  autoRetreatLowHpEnabled: boolean; // OFF by default
  autoRetreatLowHpPct: number; // default 15
}

export type TacticsPresetId =
  | 'class_default'
  | 'balanced'
  | 'focus_weak'
  | 'defensive';

export interface GearTacticsProfile {
  rules: TacticsRule[];
  safety: AutoSafetyConfig;
}

export type AutoRepeatLimit = 1 | 5 | 10 | 'infinite';

export type AutoStopReason =
  | 'completed'
  | 'defeat'
  | 'retreat'
  | 'low_hp'
  | 'elite_ready'
  | 'boss_present'
  | 'auto_retreat'
  | 'inventory_full'
  | 'manual_stop';

export interface AutoRepeatSession {
  active: boolean;
  limit: AutoRepeatLimit;
  sectorId: string;
  completedRuns: number;
  wins: number;
  totalExp: number;
  totalCredits: number;
  totalWarPoints: number;
  totalDrops: ItemInstance[];
  stopReason: AutoStopReason | null;
}

export type TeamColorRole = 'me' | 'ally' | 'enemy' | 'boss';

export interface TurnQueueEntry {
  unitId: string;
  name: string;
  classId: MechClassId;
  side: CombatSide;
  isPlayer: boolean;
  isBoss: boolean;
  teamRole: TeamColorRole;
  effectiveSpeed: number;
  baseSpeed: number;
  isSlowed: boolean;
  isSpeedBoosted: boolean;
  phase: 'acted' | 'current' | 'upcoming' | 'next_round';
}

export interface TurnQueueView {
  round: number;
  acted: TurnQueueEntry[];
  current: TurnQueueEntry | null;
  upcoming: TurnQueueEntry[];
  nextRound: TurnQueueEntry[];
}

export interface GearUnit {
  classId: MechClassId;
  owned: boolean;
  level: number;
  exp: number;
  unspentPoints: number;
  allocatedPoints: StatBlock;
  equipped: EquippedSlotIds;
  skillLevels: Record<string, number>; // learned skillId -> 1..5
  equippedSkillBar: string[]; // up to 6 active skills (class + general only)
  tactics: GearTacticsProfile;
  battlesWon: number;
  battlesFought: number;
}

export interface PilotAccount {
  name: string;
  credits: number;
  warPoints: number;
  ownedOpeningCards: string[];
  inventory: ItemInstance[];
  gears: Record<MechClassId, GearUnit>;
  activeGearId: MechClassId;
  unlockedSectorIds: string[];
  capturedSectorIds: string[];
}

export type EnemyArchetype = 'drone' | 'gunship' | 'sniper' | 'repair_ship';

export type CombatSide = 'ally' | 'enemy';

export type CombatRow = 'front' | 'back';

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
  row: CombatRow;
  isPlayer: boolean;
  classId: MechClassId;
  archetype?: EnemyArchetype;
  isBoss?: boolean;
  level: number;
  skillLevel: number; // fallback for NPCs
  skillLevels: Record<string, number>;
  equippedSkillIds: string[]; // up to 6 active skills
  skillCooldowns: Record<string, number>; // skillId -> turns remaining
  usedOnceSkills: string[]; // Elite skills already consumed this battle
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
  | 'log.healSingle'
  | 'log.energize'
  | 'log.evade'
  | 'log.damage'
  | 'log.destroyed'
  | 'log.statusApplied'
  | 'log.burnTick'
  | 'log.regenTick'
  | 'log.statusCleansed'
  | 'log.splashDamage'
  | 'log.retreat'
  | 'log.buffApplied'
  | 'log.stanceToggle'
  | 'log.charging'
  | 'log.counterAttack'
  | 'log.scanReveal'
  | 'log.invincibleBlock'
  | 'log.silencedBlocked';

export interface CombatLogEntry {
  id: string;
  round: number;
  actorName: string;
  actorSide?: CombatSide;
  actorIsPlayer?: boolean;
  actorIsBoss?: boolean;
  autoRuleNumber?: number; // >0 => [AUTO #N], 0 => [AUTO] fallback
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
  warPointsGained: number;
  baseCaptureBonusWp: number;
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
  turnOrder: string[];
  activeTurnIndex: number;
  round: number;
  selectedTargetId: string | null;
  selectedAllyTargetId: string | null;
  lastPlayerTargetId: string | null;
  autoStopNotice: AutoStopReason | null;
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
