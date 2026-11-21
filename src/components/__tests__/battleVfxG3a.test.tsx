// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STAT_BLOCK } from '../../data/classes';
import { sortTurnOrder } from '../../engine/combat';
import { useGameStore } from '../../store/useGameStore';
import type {
  ActiveStatusEffect,
  BattleEvent,
  BattleSpeed,
  BattleState,
  CombatRow,
  CombatUnit,
  MechClassId,
} from '../../types/game';
import {
  BATTLE_EFFECTS_STORAGE_KEY,
  chooseWeaponVfxType,
  completeUnitEffect,
  computeVfxDurationMs,
  createUnitEffectQueue,
  deriveStatusVfxFromDelta,
  enqueueUnitEffect,
  MAX_SIMULTANEOUS_EFFECTS_PER_UNIT,
  readBattleEffectsMode,
  resolveEffectiveVfxConfig,
  shouldSkipDecorativeParticles,
  writeBattleEffectsMode,
} from '../../utils/battleVfx';
import { BattleRadarView } from '../BattleRadarView';
import { BattleScreen } from '../BattleScreen';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function makeUnit(
  id: string,
  name: string,
  side: 'ally' | 'enemy',
  row: CombatRow,
  opts?: {
    classId?: MechClassId;
    isPlayer?: boolean;
    alive?: boolean;
    hp?: number;
    shield?: number;
    sp?: number;
    statuses?: ActiveStatusEffect[];
    animState?: CombatUnit['animState'];
    speed?: number;
  }
): CombatUnit {
  const alive = opts?.alive ?? true;
  const maxHp = 400;
  return {
    id,
    name,
    callsign: name,
    side,
    row,
    formationCol: 0,
    isPlayer: Boolean(opts?.isPlayer),
    classId: opts?.classId ?? 'striker',
    level: 10,
    skillLevel: 1,
    skillLevels: {},
    equippedSkillIds: [],
    skillCooldowns: {},
    usedOnceSkills: [],
    stats: { ...EMPTY_STAT_BLOCK },
    derived: {
      maxHp,
      maxShield: 120,
      maxSp: 60,
      speed: opts?.speed ?? 60,
      attackPower: 45,
      defenseRating: 20,
      dodgeChance: 5,
      critChance: 10,
      skillPower: 30,
      armorPiercePct: 0,
      splashPct: 0,
      spRegenPerTurn: 0,
      passiveSkillDmgPct: 0,
    },
    hp: opts?.hp ?? (alive ? maxHp : 0),
    shield: opts?.shield ?? (alive ? 80 : 0),
    sp: opts?.sp ?? 40,
    isDefending: false,
    alive,
    statuses: opts?.statuses ?? [],
    animState: opts?.animState ?? 'idle',
  };
}

function makeBattle(
  units: CombatUnit[],
  overrides?: Partial<BattleState>
): BattleState {
  const turnOrder = sortTurnOrder(units);
  return {
    sectorId: 'border_outpost',
    deployedGearId: 'striker',
    squadSize: 4,
    round: 1,
    turnCounter: 0,
    turnOrder,
    activeTurnIndex: 0,
    units,
    selectedTargetId: 'e1',
    selectedAllyTargetId: null,
    lastPlayerTargetId: null,
    autoStopNotice: null,
    wingmanChat: null,
    log: [],
    events: [],
    roundSnapshots: [],
    fxEvents: [],
    popups: [],
    explodedUnitIds: [],
    isResolving: false,
    summary: null,
    ...overrides,
  };
}

function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  window.localStorage.clear();
  mockReducedMotion(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useGameStore.getState().setLanguage('en');
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
  vi.restoreAllMocks();
});

describe('G3a Pure Functions: Weapon VFX selection, FIFO queue limit, speed scaling, and Effects settings', () => {
  it('selects cannon, beam, missile, and area effects correctly and falls back to cannon for unknown weapon types', () => {
    expect(chooseWeaponVfxType('tpl_mw_pulse_cannon')).toBe('cannon');
    expect(chooseWeaponVfxType('main_gun')).toBe('cannon');
    expect(chooseWeaponVfxType('tpl_mw_nova_beam')).toBe('beam');
    expect(chooseWeaponVfxType('tpl_mw_rail_lance')).toBe('beam');
    expect(chooseWeaponVfxType('homing_missile')).toBe('missile');
    expect(chooseWeaponVfxType('torpedo_launcher')).toBe('missile');
    expect(chooseWeaponVfxType('siege_mortar')).toBe('area');
    expect(chooseWeaponVfxType('tpl_mw_pulse_cannon', { isArea: true })).toBe(
      'area'
    );
    // Unknown weapon types fall back to cannon
    expect(chooseWeaponVfxType('mystery_flux_emitter_9000')).toBe('cannon');
    expect(chooseWeaponVfxType('')).toBe('cannon');
    expect(chooseWeaponVfxType(null)).toBe('cannon');
  });

  it('enforces max 2 simultaneous effects per unit and promotes queued effects in FIFO order', () => {
    expect(MAX_SIMULTANEOUS_EFFECTS_PER_UNIT).toBe(2);

    let queue = createUnitEffectQueue<{ id: string; tag: string }>();
    queue = enqueueUnitEffect(queue, 'u1', { id: 'e1', tag: 'first' });
    queue = enqueueUnitEffect(queue, 'u1', { id: 'e2', tag: 'second' });
    queue = enqueueUnitEffect(queue, 'u1', { id: 'e3', tag: 'third' });
    queue = enqueueUnitEffect(queue, 'u1', { id: 'e4', tag: 'fourth' });
    // Separate unit has its own independent 2-slot cap
    queue = enqueueUnitEffect(queue, 'u2', { id: 'b1', tag: 'other' });

    expect(queue.activeByUnit['u1'].map((x) => x.id)).toEqual(['e1', 'e2']);
    expect(queue.pendingByUnit['u1'].map((x) => x.id)).toEqual(['e3', 'e4']);
    expect(queue.activeByUnit['u2'].map((x) => x.id)).toEqual(['b1']);

    // Completing e1 promotes e3 (FIFO)
    queue = completeUnitEffect(queue, 'u1', 'e1');
    expect(queue.activeByUnit['u1'].map((x) => x.id)).toEqual(['e2', 'e3']);
    expect(queue.pendingByUnit['u1'].map((x) => x.id)).toEqual(['e4']);

    // Completing e2 promotes e4 (FIFO)
    queue = completeUnitEffect(queue, 'u1', 'e2');
    expect(queue.activeByUnit['u1'].map((x) => x.id)).toEqual(['e3', 'e4']);
    expect(queue.pendingByUnit['u1'] ?? []).toEqual([]);
  });

  it('keeps x1 durations between 400ms and 700ms and scales down monotonically across x1/x2/x3/x5/x10', () => {
    const speeds: BattleSpeed[] = [1, 2, 3, 5, 10];
    const kinds = ['cannon', 'beam', 'missile', 'area', 'hp_heal', 'buff', 'debuff', 'shield_break'] as const;

    for (const kind of kinds) {
      const d1 = computeVfxDurationMs(kind, 1);
      expect(d1).toBeGreaterThanOrEqual(400);
      expect(d1).toBeLessThanOrEqual(700);

      let prev = d1;
      for (const spd of speeds.slice(1)) {
        const cur = computeVfxDurationMs(kind, spd);
        expect(cur).toBeLessThanOrEqual(prev);
        expect(cur).toBeGreaterThan(0);
        prev = cur;
      }
      expect(computeVfxDurationMs(kind, 10)).toBeLessThan(d1);
    }
  });

  it('skips decorative particles at x5 and x10 and resolves Full / Compact / Off / Reduced Motion rules', () => {
    expect(shouldSkipDecorativeParticles(1, 'full')).toBe(false);
    expect(shouldSkipDecorativeParticles(2, 'full')).toBe(false);
    expect(shouldSkipDecorativeParticles(3, 'full')).toBe(false);
    expect(shouldSkipDecorativeParticles(5, 'full')).toBe(true);
    expect(shouldSkipDecorativeParticles(10, 'full')).toBe(true);
    expect(shouldSkipDecorativeParticles(1, 'compact')).toBe(true);
    expect(shouldSkipDecorativeParticles(1, 'off')).toBe(true);

    // Full at x1: everything on
    expect(resolveEffectiveVfxConfig('full', 1, false, false)).toMatchObject({
      showProjectiles: true,
      showMainImpactOrHeal: true,
      showStatusEffects: true,
      showDecorativeParticles: true,
      showFloatingNumbers: true,
      showAmbientSweep: true,
      animationsSkipped: false,
    });

    // Full at x5/x10: keep projectiles, main hit/heal, status FX & numbers; skip decorative particles
    expect(resolveEffectiveVfxConfig('full', 5, false, false)).toMatchObject({
      showProjectiles: true,
      showMainImpactOrHeal: true,
      showStatusEffects: true,
      showDecorativeParticles: false,
      showFloatingNumbers: true,
    });
    expect(resolveEffectiveVfxConfig('full', 10, false, false)).toMatchObject({
      showProjectiles: true,
      showMainImpactOrHeal: true,
      showStatusEffects: true,
      showDecorativeParticles: false,
      showFloatingNumbers: true,
    });

    // Off: remove projectiles, impacts, status FX, sweep — keep floating numbers
    expect(resolveEffectiveVfxConfig('off', 1, false, false)).toMatchObject({
      showProjectiles: false,
      showMainImpactOrHeal: false,
      showStatusEffects: false,
      showDecorativeParticles: false,
      showAmbientSweep: false,
      showFloatingNumbers: true,
      animationsSkipped: false,
    });

    // Reduced motion: keep core combat feedback (floating numbers, hit/projectile markers, status) and skip decorative/ambient effects
    expect(resolveEffectiveVfxConfig('full', 1, true, false)).toMatchObject({
      showProjectiles: true,
      showMainImpactOrHeal: true,
      showStatusEffects: true,
      showDecorativeParticles: false,
      showAmbientSweep: false,
      showFloatingNumbers: true,
      reducedMotion: true,
      animationsSkipped: false,
    });

    // Explicit skipAnimations: skip everything
    expect(resolveEffectiveVfxConfig('full', 1, false, true)).toMatchObject({
      showProjectiles: false,
      showMainImpactOrHeal: false,
      showStatusEffects: false,
      showDecorativeParticles: false,
      showAmbientSweep: false,
      showFloatingNumbers: false,
      animationsSkipped: true,
    });
  });

  it('derives heal, shield restore, SP restore, buff, debuff, shield break, stealth, and reveal VFX from unit deltas', () => {
    const prevUnit = makeUnit('a1', 'ZARA', 'ally', 'front', {
      hp: 200,
      shield: 50,
      sp: 20,
      statuses: [{ type: 'stealth', turnsRemaining: 2, isDebuff: false }],
    });
    const nextUnit = makeUnit('a1', 'ZARA', 'ally', 'front', {
      hp: 260,
      shield: 0,
      sp: 35,
      statuses: [
        { type: 'atk_up', turnsRemaining: 2, isDebuff: false },
        { type: 'burn', turnsRemaining: 2, isDebuff: true },
      ],
    });

    const events: BattleEvent[] = [
      {
        id: 'ev1',
        round: 1,
        turn: 1,
        type: 'heal',
        actorId: 'a1',
        targetId: 'a1',
        amount: 60,
      },
      {
        id: 'ev1b',
        round: 1,
        turn: 1,
        type: 'shield_grant',
        actorId: 'a1',
        targetId: 'a1',
        amount: 25,
      },
      {
        id: 'ev2',
        round: 1,
        turn: 1,
        type: 'status_applied',
        actorId: 'e1',
        targetId: 'a1',
        statusId: 'burn',
        flags: { isDebuff: true },
      },
      {
        id: 'ev3',
        round: 1,
        turn: 1,
        type: 'status_applied',
        actorId: 'a1',
        targetId: 'a1',
        statusId: 'atk_up',
        flags: { isDebuff: false },
      },
    ];

    const items = deriveStatusVfxFromDelta(
      events,
      [prevUnit],
      [nextUnit],
      1,
      1000
    );
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('hp_heal');
    expect(kinds).toContain('shield_heal');
    expect(kinds).toContain('sp_restore');
    expect(kinds).toContain('buff');
    expect(kinds).toContain('debuff');
    expect(kinds).toContain('shield_break');
    expect(kinds).toContain('stealth_reveal');
  });
});

describe('G3a Component Tests: Manual-only aim line, HTML-only VFX overlay, reduced motion, and Effects menu', () => {
  it('shows the targeting line ONLY during Manual target selection (updates on hover) and hides it in Auto, enemy turns, or after action confirmation', () => {
    const player = makeUnit('p1', 'ZARA', 'ally', 'front', {
      isPlayer: true,
      speed: 90,
    });
    const e1 = makeUnit('e1', 'Raider A', 'enemy', 'front', { speed: 70 });
    const e2 = makeUnit('e2', 'Raider B', 'enemy', 'front', { speed: 60 });
    const battle = makeBattle([player, e1, e2], { selectedTargetId: 'e1' });

    const renderRadar = (props: Partial<Parameters<typeof BattleRadarView>[0]>) => {
      act(() => {
        root!.render(
          createElement(BattleRadarView, {
            battle,
            activeUnitId: 'p1',
            validBasicTargetIds: new Set(['e1', 'e2']),
            canPlayerManualAct: true,
            hasSingleAllySkill: false,
            autoBattleEnabled: false,
            skipAnimations: false,
            battleSpeed: 1,
            layoutMode: 'pc',
            onSelectEnemy: vi.fn(),
            onSelectAlly: vi.fn(),
            onInspectUnit: vi.fn(),
            ...props,
          })
        );
      });
    };

    // 1) Manual target selection: thin HTML targeting line shown from p1 -> e1
    renderRadar({});
    let aimLine = container!.querySelector('[data-testid="radar-target-arrow"]');
    expect(aimLine).not.toBeNull();
    expect(aimLine!.tagName.toLowerCase()).toBe('div');
    expect(aimLine!.getAttribute('data-from')).toBe('p1');
    expect(aimLine!.getAttribute('data-to')).toBe('e1');

    // Hovering another valid enemy (e2) updates the Manual targeting line to e2
    const e2Marker = container!.querySelector(
      '[data-testid="radar-unit-e2"]'
    ) as SVGGElement;
    act(() => {
      e2Marker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    aimLine = container!.querySelector('[data-testid="radar-target-arrow"]');
    expect(aimLine?.getAttribute('data-to')).toBe('e2');

    // 2) Auto mode: targeting line is hidden
    renderRadar({ autoBattleEnabled: true });
    expect(
      container!.querySelector('[data-testid="radar-target-arrow"]')
    ).toBeNull();

    // 3) Enemy turn: targeting line is hidden
    renderRadar({ activeUnitId: 'e1', canPlayerManualAct: false });
    expect(
      container!.querySelector('[data-testid="radar-target-arrow"]')
    ).toBeNull();

    // 4) Action confirmed / resolving or FX active: targeting line removed immediately
    renderRadar({
      battle: { ...battle, isResolving: true },
    });
    expect(
      container!.querySelector('[data-testid="radar-target-arrow"]')
    ).toBeNull();

    renderRadar({
      battle: {
        ...battle,
        fxEvents: [
          {
            id: 'fx_attack',
            kind: 'laser',
            fromSide: 'ally',
            fromSlotIndex: 0,
            fromUnitId: 'p1',
            toSide: 'enemy',
            toSlotIndices: [0],
            toUnitIds: ['e1'],
            accentHex: '#38bdf8',
          },
        ],
      },
    });
    expect(
      container!.querySelector('[data-testid="radar-target-arrow"]')
    ).toBeNull();
  });

  it('renders weapon VFX (missile + smoke, beam, area rings, crit/dodge/shield) as HTML overlay elements and skips decorative particles at x5', () => {
    const player = makeUnit('p1', 'ZARA', 'ally', 'front', { isPlayer: true });
    const e1 = makeUnit('e1', 'Raider 1', 'enemy', 'front', { animState: 'hit' });
    const e2 = makeUnit('e2', 'Raider 2', 'enemy', 'front');

    const missileBattle = makeBattle([player, e1, e2], {
      fxEvents: [
        {
          id: 'fx_missile',
          kind: 'missile',
          fromSide: 'ally',
          fromSlotIndex: 0,
          fromUnitId: 'p1',
          toSide: 'enemy',
          toSlotIndices: [0],
          toUnitIds: ['e1'],
          accentHex: '#38bdf8',
        },
      ],
      events: [
        {
          id: 'ev_crit',
          round: 1,
          turn: 1,
          type: 'damage',
          actorId: 'p1',
          targetId: 'e1',
          amount: 140,
          hpDamage: 140,
          flags: { crit: true },
        },
      ],
    });

    // At x1 in Full mode: HTML overlay renders missile, smoke particles, and crit flash (not inside <svg>)
    act(() => {
      root!.render(
        createElement(BattleRadarView, {
          battle: missileBattle,
          activeUnitId: 'p1',
          validBasicTargetIds: new Set(['e1', 'e2']),
          canPlayerManualAct: false,
          hasSingleAllySkill: false,
          autoBattleEnabled: false,
          skipAnimations: false,
          battleSpeed: 1,
          effectsMode: 'full',
          layoutMode: 'pc',
          onSelectEnemy: vi.fn(),
          onSelectAlly: vi.fn(),
          onInspectUnit: vi.fn(),
        })
      );
    });

    const overlay = container!.querySelector('[data-testid="radar-vfx-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay!.tagName.toLowerCase()).toBe('div');
    const fxEl = overlay!.querySelector('[data-testid="radar-fx-fx_missile"]');
    expect(fxEl).not.toBeNull();
    expect(fxEl!.getAttribute('data-weapon-vfx')).toBe('missile');
    expect(
      overlay!.querySelector('[data-testid="vfx-missile-fx_missile-e1"]')
    ).not.toBeNull();
    expect(
      overlay!.querySelector('[data-testid="vfx-particle-smoke-fx_missile-0"]')
    ).not.toBeNull();
    expect(
      overlay!.querySelector('[data-testid="vfx-crit-flash-fx_missile-e1"]')
    ).not.toBeNull();

    // Ensure SVG has zero animated FX nodes
    const svg = container!.querySelector('svg');
    expect(svg!.querySelector('[data-testid^="radar-fx-"]')).toBeNull();

    // At x5: decorative smoke particles are skipped, while projectile & main impact flash remain
    act(() => {
      root!.render(
        createElement(BattleRadarView, {
          battle: missileBattle,
          activeUnitId: 'p1',
          validBasicTargetIds: new Set(['e1', 'e2']),
          canPlayerManualAct: false,
          hasSingleAllySkill: false,
          autoBattleEnabled: false,
          skipAnimations: false,
          battleSpeed: 5,
          effectsMode: 'full',
          layoutMode: 'pc',
          onSelectEnemy: vi.fn(),
          onSelectAlly: vi.fn(),
          onInspectUnit: vi.fn(),
        })
      );
    });

    expect(
      container!.querySelector('[data-testid="vfx-particle-smoke-fx_missile-0"]')
    ).toBeNull();
    expect(
      container!.querySelector('[data-testid="vfx-missile-fx_missile-e1"]')
    ).not.toBeNull();
    expect(
      container!.querySelector('[data-testid="vfx-crit-flash-fx_missile-e1"]')
    ).not.toBeNull();
  });

  it('preserves core combat feedback (fade-only markers & popups) and skips ambient sweep when reduced motion is active', () => {
    mockReducedMotion(true);

    const player = makeUnit('p1', 'ZARA', 'ally', 'front', { isPlayer: true });
    const e1 = makeUnit('e1', 'Raider 1', 'enemy', 'front', { animState: 'hit' });
    const battle = makeBattle([player, e1], {
      fxEvents: [
        {
          id: 'fx_beam',
          kind: 'railgun',
          fromSide: 'ally',
          fromSlotIndex: 0,
          fromUnitId: 'p1',
          toSide: 'enemy',
          toSlotIndices: [0],
          toUnitIds: ['e1'],
          accentHex: '#38bdf8',
        },
      ],
      explodedUnitIds: ['e1'],
      popups: [{ id: 'p_1', unitId: 'e1', text: '-90', tone: 'damage' }],
    });

    act(() => {
      root!.render(
        createElement(BattleRadarView, {
          battle,
          activeUnitId: 'p1',
          validBasicTargetIds: new Set(['e1']),
          canPlayerManualAct: false,
          hasSingleAllySkill: false,
          autoBattleEnabled: false,
          skipAnimations: false,
          battleSpeed: 1,
          effectsMode: 'full',
          reducedMotionMode: 'system',
          layoutMode: 'pc',
          onSelectEnemy: vi.fn(),
          onSelectAlly: vi.fn(),
          onInspectUnit: vi.fn(),
        })
      );
    });

    const radarEl = container!.querySelector('[data-testid="battle-radar-container"]');
    expect(radarEl?.getAttribute('data-reduced-motion')).toBe('true');

    // Core combat feedback stays visible (projectile as fade-only reduced marker, hit flash, damage popup)
    const fxBeam = container!.querySelector('[data-testid="radar-fx-fx_beam"]');
    expect(fxBeam).not.toBeNull();
    expect(fxBeam?.getAttribute('data-reduced-marker')).toBe('true');
    expect(
      container!.querySelector('[data-testid="radar-hit-flash-e1"]')
    ).not.toBeNull();
    expect(
      container!.querySelector('[data-testid="damage-popup"]')
    ).not.toBeNull();

    // Decorative ambient sweep is skipped
    expect(
      container!.querySelector('[data-testid="radar-sweep-layer"]')
    ).toBeNull();
  });

  it('exposes Effects (Full / Compact / Off) in the "..." menu, persists to localStorage, and keeps floating numbers when Off', () => {
    expect(readBattleEffectsMode()).toBe('full');
    writeBattleEffectsMode('compact');
    expect(readBattleEffectsMode()).toBe('compact');
    window.localStorage.clear();

    useGameStore.getState().startBattle('border_outpost');
    const started = useGameStore.getState().battle!;
    const player = started.units.find((u) => u.isPlayer)!;
    const enemy = started.units.find((u) => u.side === 'enemy' && u.alive)!;

    useGameStore.setState({
      battleViewMode: 'radar',
      autoBattleEnabled: false,
      skipAnimations: false,
      battleSpeed: 1,
      battle: {
        ...started,
        fxEvents: [
          {
            id: 'fx_menu_test',
            kind: 'laser',
            fromSide: 'ally',
            fromSlotIndex: 0,
            fromUnitId: player.id,
            toSide: 'enemy',
            toSlotIndices: [0],
            toUnitIds: [enemy.id],
            accentHex: '#38bdf8',
          },
        ],
        popups: [
          {
            id: 'pop_menu_test',
            unitId: enemy.id,
            text: '-88',
            tone: 'damage',
          },
        ],
      },
    });

    act(() => {
      root!.render(createElement(BattleScreen));
    });

    // Initially Full: projectile FX and floating popup both visible
    expect(
      container!.querySelector('[data-testid="radar-fx-fx_menu_test"]')
    ).not.toBeNull();
    expect(
      container!.querySelector('[data-testid="damage-popup"]')
    ).not.toBeNull();

    // Open "..." menu and select Off
    const moreBtn = container!.querySelector(
      '[data-testid="battle-more-btn"]'
    ) as HTMLButtonElement;
    expect(moreBtn).not.toBeNull();
    act(() => {
      moreBtn.click();
    });

    const offBtn = container!.querySelector(
      '[data-testid="battle-effects-off"]'
    ) as HTMLButtonElement;
    expect(offBtn).not.toBeNull();
    act(() => {
      offBtn.click();
    });

    // Persisted to dreamAce.fx.v2; FX projectiles removed; floating damage number still visible
    expect(readBattleEffectsMode()).toBe('off');
    expect(
      JSON.parse(window.localStorage.getItem(BATTLE_EFFECTS_STORAGE_KEY) || '{}')
        .effectsMode
    ).toBe('off');
    expect(
      container!.querySelector('[data-testid="radar-fx-fx_menu_test"]')
    ).toBeNull();
    expect(
      container!.querySelector('[data-testid="damage-popup"]')
    ).not.toBeNull();
  });
});
