import type { CombatRow, FormationConfig, MechClassId } from '../types/game';

export const FORMATION_ROWS: readonly CombatRow[] = ['front', 'middle', 'back'] as const;

/**
 * Centralized 3-row formation configuration (editable in Admin CP).
 * - Row capacities default: front 3, middle 3, back 2 (total 8 per side).
 * - Row modifiers default:
 *   - front:  +10% DEF, 0% damage
 *   - middle: neutral (0% DEF, 0% damage)
 *   - back:   -10% DEF, +10% damage for ranged weapons
 */
export const DEFAULT_FORMATION_CONFIG: FormationConfig = {
  rowCapacities: {
    front: 3,
    middle: 3,
    back: 2,
  },
  maxUnitsPerSide: 8,
  rowModifiers: {
    front: {
      defensePct: 0.1,
      damagePct: 0,
      rangedDamagePct: 0,
    },
    middle: {
      defensePct: 0,
      damagePct: 0,
      rangedDamagePct: 0,
    },
    back: {
      defensePct: -0.1,
      damagePct: 0,
      rangedDamagePct: 0.1,
    },
  },
};

export interface ClassFormationPreference {
  /** Preferred rows in priority order */
  preferred: CombatRow[];
  /** Whether this class naturally balances across its first two preferred rows */
  flexPair?: [CombatRow, CombatRow];
  /** Lower number places first so strict-row classes claim their primary row before flex classes */
  placementPriority: number;
}

/**
 * Default auto-placement preferences by class:
 * - Striker     -> front
 * - Interceptor -> front / middle
 * - Siege       -> back
 * - Support     -> middle / back
 */
export const CLASS_FORMATION_PREFERENCES: Record<MechClassId, ClassFormationPreference> = {
  striker: {
    preferred: ['front', 'middle', 'back'],
    placementPriority: 1,
  },
  siege: {
    preferred: ['back', 'middle', 'front'],
    placementPriority: 1,
  },
  interceptor: {
    preferred: ['front', 'middle', 'back'],
    flexPair: ['front', 'middle'],
    placementPriority: 2,
  },
  support: {
    preferred: ['middle', 'back', 'front'],
    flexPair: ['middle', 'back'],
    placementPriority: 2,
  },
};

export function cloneFormationConfig(
  cfg: FormationConfig = DEFAULT_FORMATION_CONFIG
): FormationConfig {
  return {
    rowCapacities: {
      front: cfg.rowCapacities.front,
      middle: cfg.rowCapacities.middle,
      back: cfg.rowCapacities.back,
    },
    maxUnitsPerSide: cfg.maxUnitsPerSide,
    rowModifiers: {
      front: { ...cfg.rowModifiers.front },
      middle: { ...cfg.rowModifiers.middle },
      back: { ...cfg.rowModifiers.back },
    },
  };
}
