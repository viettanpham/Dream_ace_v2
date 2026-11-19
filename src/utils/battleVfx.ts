import type {
  BattleEvent,
  BattleSpeed,
  CombatFxEvent,
  CombatFxKind,
  CombatSide,
  CombatUnit,
  MechClassId,
  StatusEffectType,
} from '../types/game';

export type BattleEffectsMode = 'full' | 'compact' | 'off';

export type WeaponVfxStyle = 'cannon' | 'beam' | 'missile' | 'area';

export type AttackOutcomeKind =
  | 'normal'
  | 'crit'
  | 'dodge'
  | 'shield_absorbed';

export type StatusVfxKind =
  | 'hp_heal'
  | 'shield_heal'
  | 'sp_restore'
  | 'buff'
  | 'debuff'
  | 'shield_break'
  | 'stealth_enter'
  | 'stealth_reveal';

export const BATTLE_EFFECTS_STORAGE_KEY = 'starfront_battle_effects_mode_v1';
export const MAX_SIMULTANEOUS_EFFECTS_PER_UNIT = 2;

export interface EffectiveVfxConfig {
  mode: BattleEffectsMode;
  showProjectiles: boolean;
  showMainImpactOrHeal: boolean;
  showStatusEffects: boolean;
  showDecorativeParticles: boolean;
  showFloatingNumbers: boolean;
  showAmbientSweep: boolean;
  animationsSkipped: boolean;
}

export interface QueuedUnitVfx {
  id: string;
  unitId: string;
  kind: StatusVfxKind;
  side: CombatSide;
  label: string;
  sign: '+' | '-' | '!' | '×' | '◎' | '';
  statTag?: string;
  amount?: number;
  durationMs: number;
  createdAt: number;
}

export interface UnitEffectQueueState<T extends { id: string }> {
  activeByUnit: Record<string, T[]>;
  pendingByUnit: Record<string, T[]>;
}

/**
 * Reads persisted Battle Effects setting (Full / Compact / Off). Defaults to 'full'.
 */
export function readBattleEffectsMode(): BattleEffectsMode {
  if (typeof window === 'undefined') return 'full';
  try {
    const raw = window.localStorage.getItem(BATTLE_EFFECTS_STORAGE_KEY);
    if (raw === 'full' || raw === 'compact' || raw === 'off') {
      return raw;
    }
    return 'full';
  } catch {
    return 'full';
  }
}

/**
 * Persists Battle Effects setting (Full / Compact / Off) to localStorage.
 */
export function writeBattleEffectsMode(mode: BattleEffectsMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BATTLE_EFFECTS_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota/privacy errors
  }
}

/**
 * Pure selector: resolves attack visual effect style from weapon type / template ID / skill / FX hint.
 * Unknown weapon types always fall back to 'cannon'.
 */
export function chooseWeaponVfxType(
  weaponType?: string | null,
  opts?: {
    fxKind?: CombatFxKind | null;
    actorClassId?: MechClassId | null;
    isArea?: boolean;
    skillId?: string | null;
  }
): WeaponVfxStyle {
  if (opts?.isArea) return 'area';

  const normalizedWeapon = String(weaponType ?? '')
    .trim()
    .toLowerCase();

  if (normalizedWeapon) {
    // Area / siege weapons
    if (
      normalizedWeapon === 'area' ||
      normalizedWeapon === 'siege' ||
      normalizedWeapon.includes('artillery') ||
      normalizedWeapon.includes('mortar') ||
      normalizedWeapon.includes('barrage') ||
      normalizedWeapon.includes('bombard') ||
      normalizedWeapon.includes('orbital') ||
      normalizedWeapon.includes('siege') ||
      normalizedWeapon.includes('splash')
    ) {
      return 'area';
    }
    // Missile / torpedo weapons
    if (
      normalizedWeapon === 'missile' ||
      normalizedWeapon === 'torpedo' ||
      normalizedWeapon.includes('missile') ||
      normalizedWeapon.includes('torpedo') ||
      normalizedWeapon.includes('rocket') ||
      normalizedWeapon.includes('homing') ||
      normalizedWeapon.includes('salvo') ||
      normalizedWeapon.includes('swarm')
    ) {
      return 'missile';
    }
    // Beam / laser / rail weapons
    if (
      normalizedWeapon === 'beam' ||
      normalizedWeapon === 'laser' ||
      normalizedWeapon === 'railgun' ||
      normalizedWeapon.includes('beam') ||
      normalizedWeapon.includes('laser') ||
      normalizedWeapon.includes('rail') ||
      normalizedWeapon.includes('lance') ||
      normalizedWeapon.includes('ion') ||
      normalizedWeapon.includes('particle')
    ) {
      return 'beam';
    }
    // Cannon / main gun / kinetic weapons
    if (
      normalizedWeapon === 'cannon' ||
      normalizedWeapon === 'main_gun' ||
      normalizedWeapon === 'gun' ||
      normalizedWeapon.includes('cannon') ||
      normalizedWeapon.includes('gun') ||
      normalizedWeapon.includes('repeater') ||
      normalizedWeapon.includes('scatter') ||
      normalizedWeapon.includes('kinetic') ||
      normalizedWeapon.includes('pulse')
    ) {
      return 'cannon';
    }
    // Explicit unknown weapon type falls back to cannon
    return 'cannon';
  }

  // Fallback to skill hint when no explicit weaponType was supplied
  const normalizedSkill = String(opts?.skillId ?? '')
    .trim()
    .toLowerCase();
  if (normalizedSkill) {
    if (
      normalizedSkill.includes('barrage') ||
      normalizedSkill.includes('orbital') ||
      normalizedSkill.includes('siege') ||
      normalizedSkill.includes('cluster') ||
      normalizedSkill.includes('emp') ||
      normalizedSkill.includes('nova') ||
      normalizedSkill.includes('aoe')
    ) {
      return 'area';
    }
    if (
      normalizedSkill.includes('missile') ||
      normalizedSkill.includes('torpedo') ||
      normalizedSkill.includes('salvo')
    ) {
      return 'missile';
    }
    if (
      normalizedSkill.includes('beam') ||
      normalizedSkill.includes('laser') ||
      normalizedSkill.includes('rail') ||
      normalizedSkill.includes('snipe') ||
      normalizedSkill.includes('pierce')
    ) {
      return 'beam';
    }
  }

  // Fallback to engine CombatFxKind + actor class
  if (opts?.fxKind === 'missile') return 'missile';
  if (opts?.fxKind === 'railgun') return 'beam';
  if (opts?.fxKind === 'laser') {
    if (opts.actorClassId === 'siege') return 'area';
    if (opts.actorClassId === 'support') return 'beam';
    return 'cannon';
  }

  return 'cannon';
}

/**
 * Pure duration calculator: 400..700ms at x1, scaling smoothly with x1/x2/x3/x5/x10.
 */
export function computeVfxDurationMs(
  kind: WeaponVfxStyle | StatusVfxKind | 'defeat',
  battleSpeed: BattleSpeed = 1
): number {
  const baseByKind: Record<WeaponVfxStyle | StatusVfxKind | 'defeat', number> = {
    cannon: 440,
    beam: 480,
    missile: 580,
    area: 640,
    hp_heal: 560,
    shield_heal: 520,
    sp_restore: 460,
    buff: 520,
    debuff: 540,
    shield_break: 560,
    stealth_enter: 500,
    stealth_reveal: 540,
    defeat: 440,
  };
  const baseMs = baseByKind[kind] ?? 460;
  const safeSpeed = Math.max(1, battleSpeed);
  return Math.max(85, Math.round(baseMs / safeSpeed));
}

/**
 * At x5 / x10 speeds, or whenever Effects != Full, decorative particles are skipped
 * while keeping the primary hit/heal effect and floating numbers.
 */
export function shouldSkipDecorativeParticles(
  battleSpeed: BattleSpeed,
  effectsMode: BattleEffectsMode
): boolean {
  return battleSpeed >= 5 || effectsMode !== 'full';
}

/**
 * Resolves exact rendering flags from Effects setting (Full / Compact / Off),
 * battle speed (x1..x10), prefers-reduced-motion, and skipAnimations.
 */
export function resolveEffectiveVfxConfig(
  effectsMode: BattleEffectsMode,
  battleSpeed: BattleSpeed,
  reducedMotion: boolean,
  skipAnimations: boolean
): EffectiveVfxConfig {
  // prefers-reduced-motion or skipAnimations disables all animated effects cleanly
  if (reducedMotion || skipAnimations) {
    return {
      mode: effectsMode,
      showProjectiles: false,
      showMainImpactOrHeal: false,
      showStatusEffects: false,
      showDecorativeParticles: false,
      showFloatingNumbers: false,
      showAmbientSweep: false,
      animationsSkipped: true,
    };
  }

  // Off mode: removes projectiles/beams/rings/particles, keeps floating numbers
  if (effectsMode === 'off') {
    return {
      mode: 'off',
      showProjectiles: false,
      showMainImpactOrHeal: false,
      showStatusEffects: false,
      showDecorativeParticles: false,
      showFloatingNumbers: true,
      showAmbientSweep: false,
      animationsSkipped: false,
    };
  }

  const isHighSpeed = battleSpeed >= 5;
  const skipParticles = shouldSkipDecorativeParticles(battleSpeed, effectsMode);

  // Compact mode or x5/x10: keep main hit/heal & numbers, skip decorative particles & ambient sweep
  if (effectsMode === 'compact' || isHighSpeed) {
    return {
      mode: effectsMode,
      // At x5/x10 keep only main hit/heal + numbers (skip trailing projectiles & decorative particles)
      showProjectiles: !isHighSpeed,
      showMainImpactOrHeal: true,
      showStatusEffects: !isHighSpeed,
      showDecorativeParticles: false,
      showFloatingNumbers: true,
      showAmbientSweep: false,
      animationsSkipped: false,
    };
  }

  // Full mode at x1 / x2 / x3
  return {
    mode: 'full',
    showProjectiles: true,
    showMainImpactOrHeal: true,
    showStatusEffects: true,
    showDecorativeParticles: !skipParticles,
    showFloatingNumbers: true,
    showAmbientSweep: true,
    animationsSkipped: false,
  };
}

/**
 * Creates an empty per-unit VFX queue state.
 */
export function createUnitEffectQueue<T extends { id: string }>(): UnitEffectQueueState<T> {
  return { activeByUnit: {}, pendingByUnit: {} };
}

/**
 * Enqueues a visual effect for a unit respecting the max simultaneous cap (default 2).
 * Extra effects wait in strict FIFO order until an active slot finishes.
 */
export function enqueueUnitEffect<T extends { id: string }>(
  state: UnitEffectQueueState<T>,
  unitId: string,
  effect: T,
  maxConcurrent: number = MAX_SIMULTANEOUS_EFFECTS_PER_UNIT
): UnitEffectQueueState<T> {
  const cap = Math.max(1, maxConcurrent);
  const currentActive = state.activeByUnit[unitId] ?? [];
  const currentPending = state.pendingByUnit[unitId] ?? [];

  // Prevent duplicate IDs
  if (
    currentActive.some((e) => e.id === effect.id) ||
    currentPending.some((e) => e.id === effect.id)
  ) {
    return state;
  }

  if (currentActive.length < cap) {
    return {
      activeByUnit: {
        ...state.activeByUnit,
        [unitId]: [...currentActive, effect],
      },
      pendingByUnit: state.pendingByUnit,
    };
  }

  return {
    activeByUnit: state.activeByUnit,
    pendingByUnit: {
      ...state.pendingByUnit,
      [unitId]: [...currentPending, effect],
    },
  };
}

/**
 * Removes a finished visual effect and promotes the next queued effect(s) in order
 * up to maxConcurrent (default 2).
 */
export function completeUnitEffect<T extends { id: string }>(
  state: UnitEffectQueueState<T>,
  unitId: string,
  effectId: string,
  maxConcurrent: number = MAX_SIMULTANEOUS_EFFECTS_PER_UNIT
): UnitEffectQueueState<T> {
  const cap = Math.max(1, maxConcurrent);
  const remainingActive = (state.activeByUnit[unitId] ?? []).filter(
    (e) => e.id !== effectId
  );
  const pending = [...(state.pendingByUnit[unitId] ?? [])];

  while (remainingActive.length < cap && pending.length > 0) {
    const next = pending.shift();
    if (next) remainingActive.push(next);
  }

  const nextActiveByUnit = { ...state.activeByUnit };
  const nextPendingByUnit = { ...state.pendingByUnit };

  if (remainingActive.length > 0) {
    nextActiveByUnit[unitId] = remainingActive;
  } else {
    delete nextActiveByUnit[unitId];
  }

  if (pending.length > 0) {
    nextPendingByUnit[unitId] = pending;
  } else {
    delete nextPendingByUnit[unitId];
  }

  return {
    activeByUnit: nextActiveByUnit,
    pendingByUnit: nextPendingByUnit,
  };
}

/**
 * Short stat/status code paired with +/- icons so visual meaning never relies on color alone.
 */
export function getStatusShortTag(statusId?: StatusEffectType): string {
  switch (statusId) {
    case 'atk_up':
    case 'primary_dmg_up':
      return 'ATK';
    case 'skill_dmg_up':
      return 'SKL';
    case 'def_up':
    case 'def_down':
      return 'DEF';
    case 'spd_up':
    case 'slow':
      return 'SPD';
    case 'eva_up':
    case 'evade_all':
      return 'EVA';
    case 'burn':
      return 'BURN';
    case 'silence':
      return 'SIL';
    case 'vulnerable':
      return 'VULN';
    case 'shield_break':
      return 'SHD';
    case 'sure_hit':
      return 'ACC';
    case 'counter':
      return 'CTR';
    case 'invincible':
      return 'INV';
    case 'regen_hp':
      return 'REG';
    case 'stealth':
      return 'STL';
    case 'siege_mode':
    case 'siege_defense':
      return 'SIEGE';
    default:
      return 'STAT';
  }
}

/**
 * Evaluates attack outcome (normal / crit / dodge / shield_absorbed) for a target from
 * the recent BattleEvent slice associated with a CombatFxEvent.
 */
export function resolveTargetAttackOutcome(
  targetId: string,
  recentEvents: BattleEvent[],
  targetUnit?: CombatUnit
): { outcome: AttackOutcomeKind; isSplash: boolean } {
  const matching = recentEvents.filter((e) => e.targetId === targetId);

  if (
    matching.some((e) => e.type === 'dodge' || e.flags?.dodge) ||
    targetUnit?.animState === 'evaded'
  ) {
    return { outcome: 'dodge', isSplash: false };
  }

  const dmgEvent = matching.find((e) => e.type === 'damage');
  if (dmgEvent) {
    const isSplash = Boolean(dmgEvent.flags?.splash);
    if (dmgEvent.flags?.crit) {
      return { outcome: 'crit', isSplash };
    }
    if (
      dmgEvent.flags?.shieldAbsorbed ||
      ((dmgEvent.shieldAbsorbed ?? 0) > 0 && (dmgEvent.hpDamage ?? 0) === 0)
    ) {
      return { outcome: 'shield_absorbed', isSplash };
    }
    return { outcome: 'normal', isSplash };
  }

  if (targetUnit?.animState === 'shielded') {
    return { outcome: 'shield_absorbed', isSplash: false };
  }

  return { outcome: 'normal', isSplash: false };
}

/**
 * Resolves the weapon VFX style for a live CombatFxEvent using actor info,
 * optional player weapon template ID, and recent BattleEvent context.
 */
export function resolveFxWeaponStyle(
  fx: CombatFxEvent,
  actor: CombatUnit | undefined,
  targetCount: number,
  recentEvents: BattleEvent[],
  playerWeaponId?: string | null
): WeaponVfxStyle {
  const hasSplashEvent = recentEvents.some(
    (e) => e.type === 'damage' && e.flags?.splash
  );
  const castEvent = recentEvents.find(
    (e) => e.actorId === actor?.id && e.type === 'skill_cast'
  );
  const isArea =
    targetCount > 1 ||
    hasSplashEvent ||
    (actor?.classId === 'siege' && fx.kind === 'railgun');

  const explicitWeapon =
    actor?.isPlayer && !castEvent ? playerWeaponId ?? null : null;

  return chooseWeaponVfxType(explicitWeapon, {
    fxKind: fx.kind,
    actorClassId: actor?.classId ?? null,
    isArea,
    skillId: castEvent?.skillId ?? null,
  });
}

/**
 * Derives status visual effects (HP heal, Shield heal, SP restore, Buff, Debuff,
 * Shield Break, Stealth enter / reveal) from newly arrived BattleEvents & unit state delta.
 */
export function deriveStatusVfxFromDelta(
  newEvents: BattleEvent[],
  prevUnits: CombatUnit[],
  currentUnits: CombatUnit[],
  battleSpeed: BattleSpeed,
  nowTs: number
): QueuedUnitVfx[] {
  const prevMap = new Map(prevUnits.map((u) => [u.id, u]));
  const currMap = new Map(currentUnits.map((u) => [u.id, u]));
  const derived: QueuedUnitVfx[] = [];
  const emittedKeys = new Set<string>();

  const pushUnique = (dedupKey: string, item: QueuedUnitVfx) => {
    if (emittedKeys.has(dedupKey)) return;
    emittedKeys.add(dedupKey);
    derived.push(item);
  };

  for (const ev of newEvents) {
    const targetId = ev.targetId ?? ev.actorId;
    const unit = currMap.get(targetId);
    if (!unit) continue;

    if (ev.type === 'heal' && (ev.amount ?? 0) > 0) {
      pushUnique(`heal:${ev.id}`, {
        id: `vfx_heal_${ev.id}`,
        unitId: unit.id,
        kind: 'hp_heal',
        side: unit.side,
        label: `+${ev.amount}`,
        sign: '+',
        amount: ev.amount,
        durationMs: computeVfxDurationMs('hp_heal', battleSpeed),
        createdAt: nowTs,
      });
    } else if (ev.type === 'shield_grant' && (ev.amount ?? 0) > 0) {
      pushUnique(`shd:${ev.id}`, {
        id: `vfx_shd_${ev.id}`,
        unitId: unit.id,
        kind: 'shield_heal',
        side: unit.side,
        label: `+${ev.amount}`,
        sign: '+',
        statTag: 'SHD',
        amount: ev.amount,
        durationMs: computeVfxDurationMs('shield_heal', battleSpeed),
        createdAt: nowTs,
      });
    } else if (ev.type === 'status_applied' && ev.statusId) {
      if (ev.statusId === 'shield_break') {
        pushUnique(`sbreak:${unit.id}:${ev.id}`, {
          id: `vfx_sbreak_${ev.id}`,
          unitId: unit.id,
          kind: 'shield_break',
          side: unit.side,
          label: 'SHD',
          sign: '×',
          statTag: 'SHD',
          durationMs: computeVfxDurationMs('shield_break', battleSpeed),
          createdAt: nowTs,
        });
      } else if (ev.statusId === 'stealth') {
        pushUnique(`stealth_in:${unit.id}:${ev.id}`, {
          id: `vfx_stealth_${ev.id}`,
          unitId: unit.id,
          kind: 'stealth_enter',
          side: unit.side,
          label: 'STL',
          sign: '',
          statTag: 'STL',
          durationMs: computeVfxDurationMs('stealth_enter', battleSpeed),
          createdAt: nowTs,
        });
      } else if (ev.flags?.isDebuff) {
        const tag = getStatusShortTag(ev.statusId);
        pushUnique(`debuff:${unit.id}:${ev.statusId}:${ev.id}`, {
          id: `vfx_debuff_${ev.id}`,
          unitId: unit.id,
          kind: 'debuff',
          side: unit.side,
          label: `-${tag}`,
          sign: '-',
          statTag: tag,
          durationMs: computeVfxDurationMs('debuff', battleSpeed),
          createdAt: nowTs,
        });
      } else {
        const tag = getStatusShortTag(ev.statusId);
        pushUnique(`buff:${unit.id}:${ev.statusId}:${ev.id}`, {
          id: `vfx_buff_${ev.id}`,
          unitId: unit.id,
          kind: 'buff',
          side: unit.side,
          label: `+${tag}`,
          sign: '+',
          statTag: tag,
          durationMs: computeVfxDurationMs('buff', battleSpeed),
          createdAt: nowTs,
        });
      }
    }
  }

  // Detect SP restore, shield break transition, and stealth reveal from unit snapshots
  for (const unit of currentUnits) {
    const prev = prevMap.get(unit.id);
    if (!prev || !unit.alive) continue;

    // SP restore
    if (unit.sp > prev.sp) {
      const gained = unit.sp - prev.sp;
      pushUnique(`sp:${unit.id}:${unit.sp}`, {
        id: `vfx_sp_${unit.id}_${nowTs}_${gained}`,
        unitId: unit.id,
        kind: 'sp_restore',
        side: unit.side,
        label: `+${gained} SP`,
        sign: '+',
        statTag: 'SP',
        amount: gained,
        durationMs: computeVfxDurationMs('sp_restore', battleSpeed),
        createdAt: nowTs,
      });
    }

    // Stealth reveal: had stealth before, no longer has stealth now
    const hadStealth = prev.statuses.some((s) => s.type === 'stealth');
    const hasStealthNow = unit.statuses.some((s) => s.type === 'stealth');
    if (hadStealth && !hasStealthNow) {
      pushUnique(`reveal:${unit.id}`, {
        id: `vfx_reveal_${unit.id}_${nowTs}`,
        unitId: unit.id,
        kind: 'stealth_reveal',
        side: unit.side,
        label: '◎',
        sign: '◎',
        statTag: 'SCAN',
        durationMs: computeVfxDurationMs('stealth_reveal', battleSpeed),
        createdAt: nowTs,
      });
    }

    // Shield dropped from >0 to 0 without explicit shield_break status event
    if (prev.shield > 0 && unit.shield === 0) {
      const alreadyHasBreak = derived.some(
        (d) => d.unitId === unit.id && d.kind === 'shield_break'
      );
      if (!alreadyHasBreak) {
        pushUnique(`shd_zero:${unit.id}`, {
          id: `vfx_shdzero_${unit.id}_${nowTs}`,
          unitId: unit.id,
          kind: 'shield_break',
          side: unit.side,
          label: 'SHD',
          sign: '×',
          statTag: 'SHD',
          durationMs: computeVfxDurationMs('shield_break', battleSpeed),
          createdAt: nowTs,
        });
      }
    }
  }

  return derived;
}
