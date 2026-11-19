import { BALANCE_CONFIG } from '../data/balance';
import { getSkillById } from '../data/skills';
import type {
  ActionType,
  AutoRepeatSession,
  AutoSafetyConfig,
  AutoStopReason,
  BattleState,
  CombatUnit,
  GearTacticsProfile,
  MechClassId,
  SkillDefinition,
  StatusEffectType,
  TacticsCondition,
  TacticsConditionKind,
  TacticsPresetId,
  TacticsRule,
  TacticsTargetSelector,
} from '../types/game';
import {
  DEBUFF_TYPES,
  getEffectiveUnitSpeed,
  getValidEnemyTargets,
  hasStatus,
  isUnitStealthed,
} from './combat';
import { canUnitUseSkill, isSkillAllowedForClass } from './skills';

export const TACTICS_CONDITION_KINDS: TacticsConditionKind[] = [
  'always',
  'my_hp_below',
  'my_shield_zero',
  'my_sp_gte',
  'my_sp_lt',
  'any_ally_hp_below',
  'any_ally_has_debuff',
  'enemy_count_gte',
  'target_has_shield',
  'target_hp_below',
  'any_enemy_stealthed',
  'round_eq',
  'first_round',
  'boss_present',
  'my_buff_not_active',
  'skill_off_cooldown',
];

export const TACTICS_TARGET_SELECTORS: TacticsTargetSelector[] = [
  'lowest_hp_enemy',
  'highest_hp_enemy',
  'highest_atk_enemy',
  'fastest_enemy',
  'enemy_support_first',
  'enemy_sniper_first',
  'front_row_first',
  'back_row_first',
  'random_enemy',
  'same_as_last_turn',
  'self',
  'lowest_hp_ally',
  'all_allies',
];

export const TACTICS_BUFF_OPTIONS: StatusEffectType[] = [
  'def_up',
  'eva_up',
  'atk_up',
  'spd_up',
  'primary_dmg_up',
  'skill_dmg_up',
  'sure_hit',
  'counter',
  'siege_mode',
  'siege_defense',
  'stealth',
  'regen_hp',
];

const VALID_CONDITIONS = new Set<TacticsConditionKind>(TACTICS_CONDITION_KINDS);
const VALID_SELECTORS = new Set<TacticsTargetSelector>(TACTICS_TARGET_SELECTORS);
const VALID_BUFFS = new Set<StatusEffectType>(TACTICS_BUFF_OPTIONS);

export function createDefaultAutoSafety(): AutoSafetyConfig {
  return {
    stopOnLowHpEnabled: false,
    stopOnLowHpPct: 25,
    stopOnEliteReady: false,
    stopOnBossPresent: false,
    autoRetreatLowHpEnabled: false,
    autoRetreatLowHpPct: 15,
  };
}

let ruleUid = 1;
export function createRuleId(prefix = 'rule'): string {
  ruleUid += 1;
  return `${prefix}_${Date.now().toString(36)}_${ruleUid}`;
}

export function createBlankTacticsRule(): TacticsRule {
  return {
    id: createRuleId('tac'),
    enabled: true,
    condition: { kind: 'always' },
    action: { type: 'attack' },
    targetSelector: 'lowest_hp_enemy',
  };
}

function makeRule(
  id: string,
  condition: TacticsCondition,
  action: TacticsRule['action'],
  targetSelector: TacticsTargetSelector,
  enabled = true
): TacticsRule {
  return { id, enabled, condition, action, targetSelector };
}

/**
 * Sensible class-specific default tactics profiles.
 * Rules use only skills allowed for `classId` + General skills.
 */
export function createDefaultTacticsForClass(
  classId: MechClassId
): GearTacticsProfile {
  const safety = createDefaultAutoSafety();

  switch (classId) {
    case 'support':
      return {
        safety,
        rules: [
          makeRule(
            'def_sup_1',
            { kind: 'any_ally_hp_below', value: 45 },
            { type: 'skill', skillId: 'sup_nanite_mend' },
            'lowest_hp_ally'
          ),
          makeRule(
            'def_sup_2',
            { kind: 'any_ally_has_debuff' },
            { type: 'skill', skillId: 'sup_system_purge' },
            'all_allies'
          ),
          makeRule(
            'def_sup_3',
            { kind: 'any_enemy_stealthed' },
            { type: 'skill', skillId: 'sup_lidar_sweep' },
            'lowest_hp_enemy'
          ),
          makeRule(
            'def_sup_4',
            { kind: 'first_round' },
            { type: 'skill', skillId: 'sup_war_hymn' },
            'all_allies'
          ),
          makeRule(
            'def_sup_5',
            { kind: 'my_shield_zero' },
            { type: 'skill', skillId: 'gen_hull_brace' },
            'self'
          ),
          makeRule(
            'def_sup_6',
            { kind: 'always' },
            { type: 'attack' },
            'lowest_hp_enemy'
          ),
        ],
      };

    case 'siege':
      return {
        safety,
        rules: [
          makeRule(
            'def_sge_1',
            { kind: 'my_buff_not_active', buffType: 'siege_mode' },
            { type: 'skill', skillId: 'sge_anchor_protocol' },
            'self'
          ),
          makeRule(
            'def_sge_2',
            { kind: 'target_has_shield' },
            { type: 'skill', skillId: 'sge_aegis_sunder' },
            'highest_hp_enemy'
          ),
          makeRule(
            'def_sge_3',
            { kind: 'boss_present' },
            { type: 'skill', skillId: 'sge_grav_bolas' },
            'highest_atk_enemy'
          ),
          makeRule(
            'def_sge_4',
            { kind: 'my_hp_below', value: 35 },
            { type: 'skill', skillId: 'gen_hull_brace' },
            'self'
          ),
          makeRule(
            'def_sge_5',
            { kind: 'always' },
            { type: 'attack' },
            'front_row_first'
          ),
        ],
      };

    case 'interceptor':
      return {
        safety,
        rules: [
          makeRule(
            'def_int_1',
            { kind: 'my_buff_not_active', buffType: 'spd_up' },
            { type: 'skill', skillId: 'int_mach_surge' },
            'self'
          ),
          makeRule(
            'def_int_2',
            { kind: 'boss_present' },
            { type: 'skill', skillId: 'int_ecm_blackout' },
            'enemy_support_first'
          ),
          makeRule(
            'def_int_3',
            { kind: 'my_hp_below', value: 40 },
            { type: 'skill', skillId: 'gen_thruster_feint' },
            'self'
          ),
          makeRule(
            'def_int_4',
            { kind: 'my_sp_gte', value: 8 },
            { type: 'skill', skillId: 'int_sabot_burst' },
            'enemy_sniper_first'
          ),
          makeRule(
            'def_int_5',
            { kind: 'always' },
            { type: 'attack' },
            'lowest_hp_enemy'
          ),
        ],
      };

    case 'striker':
    default:
      return {
        safety,
        rules: [
          makeRule(
            'def_str_1',
            { kind: 'my_buff_not_active', buffType: 'primary_dmg_up' },
            { type: 'skill', skillId: 'str_hotload_shells' },
            'self'
          ),
          makeRule(
            'def_str_2',
            { kind: 'enemy_count_gte', value: 3 },
            { type: 'skill', skillId: 'str_viper_sweep' },
            'lowest_hp_enemy'
          ),
          makeRule(
            'def_str_3',
            { kind: 'boss_present' },
            { type: 'skill', skillId: 'str_carpet_salvo' },
            'highest_hp_enemy'
          ),
          makeRule(
            'def_str_4',
            { kind: 'my_hp_below', value: 35 },
            { type: 'skill', skillId: 'gen_hull_brace' },
            'self'
          ),
          makeRule(
            'def_str_5',
            { kind: 'always' },
            { type: 'attack' },
            'lowest_hp_enemy'
          ),
        ],
      };
  }
}

/**
 * Generates one of the 4 loadable tactics presets for any Gear class.
 */
export function createPresetTactics(
  classId: MechClassId,
  presetId: TacticsPresetId,
  equippedSkillBar: string[] = []
): GearTacticsProfile {
  if (presetId === 'class_default') {
    return createDefaultTacticsForClass(classId);
  }

  const safety = createDefaultAutoSafety();
  const barSkills = equippedSkillBar
    .map((id) => getSkillById(id))
    .filter(
      (s): s is SkillDefinition =>
        Boolean(s) && s!.category !== 'passive' && isSkillAllowedForClass(s!, classId)
    );

  const firstHeal = barSkills.find(
    (s) => s.effectKind === 'heal_single' || s.effectKind === 'heal_field_hot'
  );
  const firstOffense = barSkills.find(
    (s) =>
      s.targetType === 'single_enemy' ||
      s.targetType === 'multi_enemy' ||
      s.targetType === 'all_enemies'
  );
  const firstBuff = barSkills.find(
    (s) =>
      s.targetType === 'self' &&
      !s.isToggle &&
      (s.effectKind === 'buff_primary_dmg' ||
        s.effectKind === 'buff_skill_dmg' ||
        s.effectKind === 'buff_speed' ||
        s.effectKind === 'buff_def' ||
        s.effectKind === 'buff_eva')
  );
  const defSkill =
    barSkills.find(
      (s) =>
        s.id === 'gen_hull_brace' ||
        s.id === 'gen_thruster_feint' ||
        s.effectKind === 'toggle_siege_defense' ||
        s.effectKind === 'evade_all_round'
    ) ?? getSkillById('gen_hull_brace');

  if (presetId === 'balanced') {
    const rules: TacticsRule[] = [];
    if (firstHeal) {
      rules.push(
        makeRule(
          createRuleId('bal'),
          { kind: 'any_ally_hp_below', value: 50 },
          { type: 'skill', skillId: firstHeal.id },
          firstHeal.targetType === 'single_ally' ? 'lowest_hp_ally' : 'all_allies'
        )
      );
    }
    rules.push(
      makeRule(
        createRuleId('bal'),
        { kind: 'my_hp_below', value: 30 },
        { type: 'defend' },
        'self'
      )
    );
    if (firstBuff) {
      rules.push(
        makeRule(
          createRuleId('bal'),
          { kind: 'first_round' },
          { type: 'skill', skillId: firstBuff.id },
          'self'
        )
      );
    }
    if (firstOffense) {
      rules.push(
        makeRule(
          createRuleId('bal'),
          { kind: 'my_sp_gte', value: firstOffense.spCost },
          { type: 'skill', skillId: firstOffense.id },
          'lowest_hp_enemy'
        )
      );
    }
    rules.push(
      makeRule(
        createRuleId('bal'),
        { kind: 'always' },
        { type: 'attack' },
        'lowest_hp_enemy'
      )
    );
    return { rules: rules.slice(0, BALANCE_CONFIG.maxTacticsRules), safety };
  }

  if (presetId === 'focus_weak') {
    const rules: TacticsRule[] = [];
    if (firstBuff) {
      rules.push(
        makeRule(
          createRuleId('foc'),
          { kind: 'first_round' },
          { type: 'skill', skillId: firstBuff.id },
          'self'
        )
      );
    }
    if (firstOffense) {
      rules.push(
        makeRule(
          createRuleId('foc'),
          { kind: 'target_hp_below', value: 60 },
          { type: 'skill', skillId: firstOffense.id },
          'lowest_hp_enemy'
        )
      );
      rules.push(
        makeRule(
          createRuleId('foc'),
          { kind: 'my_sp_gte', value: firstOffense.spCost },
          { type: 'skill', skillId: firstOffense.id },
          'enemy_support_first'
        )
      );
    }
    rules.push(
      makeRule(
        createRuleId('foc'),
        { kind: 'always' },
        { type: 'attack' },
        'lowest_hp_enemy'
      )
    );
    return { rules: rules.slice(0, BALANCE_CONFIG.maxTacticsRules), safety };
  }

  // 'defensive'
  const defRules: TacticsRule[] = [];
  if (firstHeal) {
    defRules.push(
      makeRule(
        createRuleId('dfn'),
        { kind: 'any_ally_hp_below', value: 65 },
        { type: 'skill', skillId: firstHeal.id },
        firstHeal.targetType === 'single_ally' ? 'lowest_hp_ally' : 'all_allies'
      )
    );
  }
  defRules.push(
    makeRule(
      createRuleId('dfn'),
      { kind: 'my_hp_below', value: 45 },
      { type: 'defend' },
      'self'
    )
  );
  if (defSkill && isSkillAllowedForClass(defSkill, classId)) {
    defRules.push(
      makeRule(
        createRuleId('dfn'),
        { kind: 'my_shield_zero' },
        { type: 'skill', skillId: defSkill.id },
        'self'
      )
    );
  }
  defRules.push(
    makeRule(
      createRuleId('dfn'),
      { kind: 'always' },
      { type: 'attack' },
      'highest_atk_enemy'
    )
  );
  return {
    rules: defRules.slice(0, BALANCE_CONFIG.maxTacticsRules),
    safety: {
      ...safety,
      stopOnLowHpEnabled: true,
      stopOnLowHpPct: 25,
    },
  };
}

/**
 * Sanitizes a Gear's tactics profile: clamps rule count to max 8,
 * validates conditions/selectors, and strictly strips/blocks cross-class skills!
 */
export function sanitizeGearTactics(
  classId: MechClassId,
  raw: unknown
): GearTacticsProfile {
  const fallback = createDefaultTacticsForClass(classId);
  if (!raw || typeof raw !== 'object') return fallback;

  const obj = raw as Partial<GearTacticsProfile>;
  const rawSafety = (obj.safety ?? {}) as Partial<AutoSafetyConfig>;
  const safety: AutoSafetyConfig = {
    stopOnLowHpEnabled: Boolean(rawSafety.stopOnLowHpEnabled),
    stopOnLowHpPct: Math.max(
      5,
      Math.min(90, Math.round(Number(rawSafety.stopOnLowHpPct) || 25))
    ),
    stopOnEliteReady: Boolean(rawSafety.stopOnEliteReady),
    stopOnBossPresent: Boolean(rawSafety.stopOnBossPresent),
    autoRetreatLowHpEnabled: Boolean(rawSafety.autoRetreatLowHpEnabled),
    autoRetreatLowHpPct: Math.max(
      5,
      Math.min(75, Math.round(Number(rawSafety.autoRetreatLowHpPct) || 15))
    ),
  };

  if (!Array.isArray(obj.rules)) {
    return { rules: fallback.rules, safety };
  }

  const cleanRules: TacticsRule[] = [];
  for (const item of obj.rules) {
    if (cleanRules.length >= BALANCE_CONFIG.maxTacticsRules) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<TacticsRule>;
    const condKind: TacticsConditionKind = VALID_CONDITIONS.has(
      r.condition?.kind as TacticsConditionKind
    )
      ? (r.condition!.kind as TacticsConditionKind)
      : 'always';

    const condition: TacticsCondition = { kind: condKind };
    if (typeof r.condition?.value === 'number' && Number.isFinite(r.condition.value)) {
      condition.value = Math.max(0, Math.min(999, Math.round(r.condition.value)));
    } else if (
      condKind === 'my_hp_below' ||
      condKind === 'any_ally_hp_below' ||
      condKind === 'target_hp_below'
    ) {
      condition.value = 40;
    } else if (condKind === 'my_sp_gte' || condKind === 'my_sp_lt') {
      condition.value = 15;
    } else if (condKind === 'enemy_count_gte') {
      condition.value = 2;
    } else if (condKind === 'round_eq') {
      condition.value = 1;
    }

    if (condKind === 'my_buff_not_active') {
      condition.buffType = VALID_BUFFS.has(
        r.condition?.buffType as StatusEffectType
      )
        ? (r.condition!.buffType as StatusEffectType)
        : 'def_up';
    }

    if (condKind === 'skill_off_cooldown' && typeof r.condition?.skillId === 'string') {
      const condSkill = getSkillById(r.condition.skillId);
      if (condSkill && isSkillAllowedForClass(condSkill, classId)) {
        condition.skillId = condSkill.id;
      }
    }

    const actionType: ActionType =
      r.action?.type === 'skill' || r.action?.type === 'defend'
        ? r.action.type
        : 'attack';

    let cleanAction: TacticsRule['action'] = { type: actionType };
    if (actionType === 'skill') {
      const sk =
        typeof r.action?.skillId === 'string'
          ? getSkillById(r.action.skillId)
          : undefined;
      // Strict engine class-lock: cross-class or passive skills are rejected!
      if (!sk || sk.category === 'passive' || !isSkillAllowedForClass(sk, classId)) {
        cleanAction = { type: 'attack' };
      } else {
        cleanAction = { type: 'skill', skillId: sk.id };
      }
    }

    const targetSelector: TacticsTargetSelector = VALID_SELECTORS.has(
      r.targetSelector as TacticsTargetSelector
    )
      ? (r.targetSelector as TacticsTargetSelector)
      : 'lowest_hp_enemy';

    cleanRules.push({
      id: typeof r.id === 'string' && r.id.length > 0 ? r.id : createRuleId('tac'),
      enabled: r.enabled !== false,
      condition,
      action: cleanAction,
      targetSelector,
    });
  }

  return { rules: cleanRules, safety };
}

export interface AutoSafetyEvaluation {
  shouldStopAuto: boolean;
  shouldRetreat: boolean;
  reason: AutoStopReason | null;
}

/**
 * Evaluates Auto-battle safety rules before executing the player's Auto turn.
 */
export function evaluateAutoSafety(
  state: BattleState,
  actor: CombatUnit,
  safety: AutoSafetyConfig
): AutoSafetyEvaluation {
  const hpPct =
    actor.derived.maxHp > 0 ? (actor.hp / actor.derived.maxHp) * 100 : 0;

  if (safety.autoRetreatLowHpEnabled && hpPct < safety.autoRetreatLowHpPct) {
    return {
      shouldStopAuto: true,
      shouldRetreat: true,
      reason: 'auto_retreat',
    };
  }

  if (safety.stopOnLowHpEnabled && hpPct < safety.stopOnLowHpPct) {
    return {
      shouldStopAuto: true,
      shouldRetreat: false,
      reason: 'low_hp',
    };
  }

  if (
    safety.stopOnBossPresent &&
    state.units.some((u) => u.side !== actor.side && u.alive && u.isBoss)
  ) {
    return {
      shouldStopAuto: true,
      shouldRetreat: false,
      reason: 'boss_present',
    };
  }

  if (safety.stopOnEliteReady) {
    const eliteReady = actor.equippedSkillIds.some((sid) => {
      const sk = getSkillById(sid);
      return sk?.category === 'elite' && canUnitUseSkill(actor, sid).canUse;
    });
    if (eliteReady) {
      return {
        shouldStopAuto: true,
        shouldRetreat: false,
        reason: 'elite_ready',
      };
    }
  }

  return { shouldStopAuto: false, shouldRetreat: false, reason: null };
}

/**
 * Pure check for whether an Auto-Repeat batch should stop after a battle concludes.
 */
export function shouldStopAutoRepeat(
  session: AutoRepeatSession,
  outcome: 'victory' | 'defeat',
  retreated: boolean,
  inventoryCount: number,
  maxInventorySize: number = BALANCE_CONFIG.maxInventorySize
): { stop: boolean; reason: AutoStopReason | null } {
  if (retreated) return { stop: true, reason: 'retreat' };
  if (outcome === 'defeat') return { stop: true, reason: 'defeat' };
  if (inventoryCount >= maxInventorySize) {
    return { stop: true, reason: 'inventory_full' };
  }
  if (session.limit !== 'infinite' && session.completedRuns >= session.limit) {
    return { stop: true, reason: 'completed' };
  }
  return { stop: false, reason: null };
}

function pickEnemyBySelector(
  state: BattleState,
  actor: CombatUnit,
  selector: TacticsTargetSelector,
  rng: () => number,
  actionType: ActionType = 'attack',
  skillId?: string
): CombatUnit | null {
  const enemies = getValidEnemyTargets(state.units, actor, actionType, skillId);
  if (enemies.length === 0) return null;

  const byIdTie = (a: CombatUnit, b: CombatUnit) => a.id.localeCompare(b.id);

  switch (selector) {
    case 'highest_hp_enemy':
      return [...enemies].sort((a, b) => b.hp - a.hp || byIdTie(a, b))[0];

    case 'highest_atk_enemy':
      return [...enemies].sort(
        (a, b) => b.derived.attackPower - a.derived.attackPower || byIdTie(a, b)
      )[0];

    case 'fastest_enemy':
      return [...enemies].sort(
        (a, b) =>
          getEffectiveUnitSpeed(b) - getEffectiveUnitSpeed(a) || byIdTie(a, b)
      )[0];

    case 'enemy_support_first': {
      const supports = enemies.filter(
        (e) => e.archetype === 'repair_ship' || e.classId === 'support'
      );
      const pool = supports.length > 0 ? supports : enemies;
      return [...pool].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
    }

    case 'enemy_sniper_first': {
      const snipers = enemies.filter(
        (e) => e.archetype === 'sniper' || e.classId === 'interceptor'
      );
      const pool = snipers.length > 0 ? snipers : enemies;
      return [...pool].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
    }

    case 'front_row_first': {
      const front = enemies.filter((e) => e.row === 'front');
      const pool = front.length > 0 ? front : enemies;
      return [...pool].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
    }

    case 'back_row_first': {
      const back = enemies.filter((e) => e.row === 'back');
      const pool = back.length > 0 ? back : enemies;
      return [...pool].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
    }

    case 'random_enemy': {
      const idx = Math.min(
        enemies.length - 1,
        Math.max(0, Math.floor(rng() * enemies.length))
      );
      return enemies[idx];
    }

    case 'same_as_last_turn': {
      if (state.lastPlayerTargetId) {
        const prev = enemies.find((e) => e.id === state.lastPlayerTargetId);
        if (prev) return prev;
      }
      return [...enemies].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
    }

    case 'lowest_hp_enemy':
    default:
      return [...enemies].sort((a, b) => a.hp - b.hp || byIdTie(a, b))[0];
  }
}

function resolveRuleTarget(
  state: BattleState,
  actor: CombatUnit,
  rule: TacticsRule,
  skillDef: SkillDefinition | undefined,
  rng: () => number
): { targetUnit: CombatUnit | null; targetId: string | null; valid: boolean } {
  const allies = state.units.filter((u) => u.side === actor.side && u.alive);

  if (rule.action.type === 'defend') {
    return { targetUnit: actor, targetId: null, valid: true };
  }

  if (rule.action.type === 'skill' && skillDef) {
    if (skillDef.targetType === 'self') {
      return { targetUnit: actor, targetId: actor.id, valid: true };
    }
    if (skillDef.targetType === 'all_allies') {
      return {
        targetUnit: allies[0] ?? actor,
        targetId: null,
        valid: allies.length > 0,
      };
    }
    if (skillDef.targetType === 'single_ally') {
      if (rule.targetSelector === 'self') {
        return { targetUnit: actor, targetId: actor.id, valid: true };
      }
      const lowestAlly = [...allies].sort(
        (a, b) =>
          a.hp / Math.max(1, a.derived.maxHp) -
            b.hp / Math.max(1, b.derived.maxHp) || a.id.localeCompare(b.id)
      )[0];
      return lowestAlly
        ? { targetUnit: lowestAlly, targetId: lowestAlly.id, valid: true }
        : { targetUnit: null, targetId: null, valid: false };
    }
    // Enemy-targeting skill (single_enemy, multi_enemy, all_enemies)
    const enemy = pickEnemyBySelector(
      state,
      actor,
      rule.targetSelector,
      rng,
      'skill',
      skillDef.id
    );
    return enemy
      ? { targetUnit: enemy, targetId: enemy.id, valid: true }
      : { targetUnit: null, targetId: null, valid: false };
  }

  // Basic attack -> must pick a valid enemy (respecting Front/Back row rules)
  const enemy = pickEnemyBySelector(
    state,
    actor,
    rule.targetSelector,
    rng,
    'attack'
  );
  return enemy
    ? { targetUnit: enemy, targetId: enemy.id, valid: true }
    : { targetUnit: null, targetId: null, valid: false };
}

function evaluateCondition(
  state: BattleState,
  actor: CombatUnit,
  rule: TacticsRule,
  resolvedTarget: CombatUnit | null,
  rng: () => number
): boolean {
  const { condition } = rule;
  const allies = state.units.filter((u) => u.side === actor.side && u.alive);
  const aliveEnemies = state.units.filter((u) => u.side !== actor.side && u.alive);
  const myHpPct =
    actor.derived.maxHp > 0 ? (actor.hp / actor.derived.maxHp) * 100 : 0;

  switch (condition.kind) {
    case 'always':
      return true;

    case 'my_hp_below':
      return myHpPct < (condition.value ?? 40);

    case 'my_shield_zero':
      return actor.shield <= 0;

    case 'my_sp_gte':
      return actor.sp >= (condition.value ?? 15);

    case 'my_sp_lt':
      return actor.sp < (condition.value ?? 15);

    case 'any_ally_hp_below': {
      const threshold = condition.value ?? 45;
      return allies.some(
        (a) => a.derived.maxHp > 0 && (a.hp / a.derived.maxHp) * 100 < threshold
      );
    }

    case 'any_ally_has_debuff':
      return allies.some((a) =>
        a.statuses.some((s) => s.turnsRemaining > 0 && DEBUFF_TYPES.has(s.type))
      );

    case 'enemy_count_gte':
      return aliveEnemies.length >= (condition.value ?? 2);

    case 'target_has_shield': {
      const candidate =
        resolvedTarget && resolvedTarget.side !== actor.side
          ? resolvedTarget
          : pickEnemyBySelector(state, actor, rule.targetSelector, rng);
      return Boolean(candidate && candidate.shield > 0);
    }

    case 'target_hp_below': {
      const threshold = condition.value ?? 50;
      const candidate =
        resolvedTarget && resolvedTarget.side !== actor.side
          ? resolvedTarget
          : pickEnemyBySelector(state, actor, rule.targetSelector, rng);
      if (!candidate || candidate.derived.maxHp <= 0) return false;
      return (candidate.hp / candidate.derived.maxHp) * 100 < threshold;
    }

    case 'any_enemy_stealthed':
      return aliveEnemies.some((e) => isUnitStealthed(e));

    case 'round_eq':
      return state.round === (condition.value ?? 1);

    case 'first_round':
      return state.round === 1;

    case 'boss_present':
      return aliveEnemies.some((e) => Boolean(e.isBoss));

    case 'my_buff_not_active': {
      const buffType = condition.buffType ?? 'def_up';
      return !hasStatus(actor, buffType);
    }

    case 'skill_off_cooldown': {
      const checkSkillId =
        condition.skillId ??
        (rule.action.type === 'skill' ? rule.action.skillId : undefined);
      if (!checkSkillId) return false;
      const sk = getSkillById(checkSkillId);
      if (!sk || !isSkillAllowedForClass(sk, actor.classId)) return false;
      return canUnitUseSkill(actor, checkSkillId).canUse;
    }

    default:
      return false;
  }
}

export interface TacticsChoiceResult {
  action: ActionType;
  skillId?: string;
  targetId: string | null;
  matchedRuleIndex: number | null; // 0-based index of matched rule, null if fallback
  matchedRuleId?: string;
}

/**
 * Pure, deterministic Tactics evaluator for the player's Gear in Auto Mode.
 * Evaluates rules top-to-bottom; the first enabled rule whose condition is true
 * AND whose action is usable (SP, cooldown, class-locked, valid target) executes.
 * Fallback: basic Attack on the lowest-HP enemy.
 */
export function chooseAction(
  state: BattleState,
  actor: CombatUnit,
  tactics: GearTacticsProfile,
  rng: () => number = Math.random
): TacticsChoiceResult {
  const rules = (tactics?.rules ?? []).slice(0, BALANCE_CONFIG.maxTacticsRules);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule.enabled) continue;

    let skillDef: SkillDefinition | undefined;
    if (rule.action.type === 'skill') {
      const sid = rule.action.skillId;
      if (!sid) continue;
      skillDef = getSkillById(sid);
      // Engine-enforced class lock & active-bar/SP/CD/Silence validation
      if (!skillDef || !isSkillAllowedForClass(skillDef, actor.classId)) {
        continue;
      }
      if (!canUnitUseSkill(actor, sid).canUse) {
        continue;
      }
    }

    const targetRes = resolveRuleTarget(state, actor, rule, skillDef, rng);
    if (!targetRes.valid) continue;

    const condMet = evaluateCondition(
      state,
      actor,
      rule,
      targetRes.targetUnit,
      rng
    );
    if (!condMet) continue;

    return {
      action: rule.action.type,
      skillId: rule.action.type === 'skill' ? rule.action.skillId : undefined,
      targetId: targetRes.targetId,
      matchedRuleIndex: i,
      matchedRuleId: rule.id,
    };
  }

  // Fallback: basic Attack on lowest-HP enemy
  const fallbackEnemy = pickEnemyBySelector(state, actor, 'lowest_hp_enemy', rng);
  if (fallbackEnemy) {
    return {
      action: 'attack',
      targetId: fallbackEnemy.id,
      matchedRuleIndex: null,
    };
  }

  return {
    action: 'defend',
    targetId: null,
    matchedRuleIndex: null,
  };
}
