// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STAT_BLOCK } from '../../data/classes';
import {
  createFreshCampaignState,
  CURRENT_SAVE_VERSION,
  migrateSaveData,
} from '../../engine/migration';
import { buildExportEnvelope } from '../../engine/saveExport';
import { EN_TRANSLATIONS } from '../../i18n/en';
import { VI_TRANSLATIONS } from '../../i18n/vi';
import { useGameStore } from '../../store/useGameStore';
import type { BattleState, CombatUnit } from '../../types/game';
import { getBattleLayoutMode } from '../../utils/battleDisplay';
import {
  BATTLE_LAYOUT_PREFS_STORAGE_KEY,
  DEFAULT_BATTLE_LAYOUT_PREFS,
  readBattleLayoutPrefs,
  resetBattleLayoutPrefs,
  writeBattleLayoutPrefs,
} from '../../utils/battleLayoutPrefs';
import App from '../../App';
import { BattleScreen } from '../BattleScreen';
import { EffectsSettingsPanel } from '../EffectsSettingsPanel';

function makeUnit(
  id: string,
  name: string,
  side: 'ally' | 'enemy',
  row: 'front' | 'middle' | 'back',
  isPlayer = false
): CombatUnit {
  return {
    id,
    name,
    side,
    row,
    formationCol: 0,
    isPlayer,
    classId: 'striker',
    level: 5,
    hp: 300,
    shield: 60,
    sp: 40,
    alive: true,
    statuses: [],
    skillLevels: {},
    skillCooldowns: {},
    usedOnceSkills: [],
    activeToggles: [],
    derived: {
      maxHp: 300,
      maxShield: 60,
      maxSp: 80,
      speed: 20,
      attackPower: 55,
      defenseRating: 25,
      dodgeChance: 10,
      critChance: 15,
      skillPower: 20,
      armorPiercePct: 0,
      splashPct: 0,
      spRegenPerTurn: 0,
      passiveSkillDmgPct: 0,
    },
    baseStats: { ...EMPTY_STAT_BLOCK },
  };
}

function makeBattle(): BattleState {
  const units = [
    makeUnit('ally_player', 'Vance', 'ally', 'front', true),
    makeUnit('ally_back', 'Support Wing', 'ally', 'back'),
    makeUnit('enemy_front', 'Raider 1', 'enemy', 'front'),
    makeUnit('enemy_back', 'Sniper 1', 'enemy', 'back'),
  ];
  return {
    sectorId: 'aegis_relay',
    deployedGearId: 'striker',
    squadSize: 4,
    round: 1,
    turnCounter: 1,
    units,
    turnOrder: units.map((u) => u.id),
    activeTurnIndex: 0,
    selectedTargetId: 'enemy_front',
    selectedAllyTargetId: 'ally_player',
    lastPlayerTargetId: 'enemy_front',
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
  };
}

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: w,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: h,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('TASK G4a-2a v2 — Battle layout, Camera slot, battleLayoutPrefs, Loop row & Sound default OFF', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    resetBattleLayoutPrefs();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      language: 'vi',
      screen: 'BATTLE',
      battle: makeBattle(),
      autoBattleEnabled: false,
      autoRepeatSession: null,
      battleViewMode: 'card',
      muted: true,
    });
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
      container = null;
    }
    window.localStorage.clear();
  });

  it('1) battleLayoutPrefs read/write/default/reset & SV1a export isolation', async () => {
    window.localStorage.removeItem(BATTLE_LAYOUT_PREFS_STORAGE_KEY);
    expect(readBattleLayoutPrefs()).toEqual(DEFAULT_BATTLE_LAYOUT_PREFS);
    expect(readBattleLayoutPrefs().showActionCamera).toBe(true);

    // Corrupted JSON falls back cleanly to default ON
    window.localStorage.setItem(BATTLE_LAYOUT_PREFS_STORAGE_KEY, '{bad-json');
    expect(readBattleLayoutPrefs()).toEqual({ showActionCamera: true });

    // Write OFF & read back
    const written = writeBattleLayoutPrefs({ showActionCamera: false });
    expect(written).toEqual({ showActionCamera: false });
    expect(readBattleLayoutPrefs()).toEqual({ showActionCamera: false });
    expect(
      JSON.parse(
        window.localStorage.getItem(BATTLE_LAYOUT_PREFS_STORAGE_KEY) || '{}'
      )
    ).toEqual({ showActionCamera: false });

    // Reset restores default ON
    expect(resetBattleLayoutPrefs()).toEqual({ showActionCamera: true });
    expect(readBattleLayoutPrefs()).toEqual({ showActionCamera: true });

    // SV1a export remains isolated from dreamAce.layout.v1
    const s = useGameStore.getState();
    const envelope = await buildExportEnvelope({
      pilot: s.pilot,
      shopStock: s.shopStock,
      wpMarketOffers: s.wpMarketOffers,
      battlesUntilRestock: s.battlesUntilRestock,
      inventoryFilterState: s.inventoryFilterState,
      quickSellConfig: s.quickSellConfig,
      selectedSectorId: s.selectedSectorId,
      hasSaveData: s.hasSaveData,
      muted: s.muted,
      battleSpeed: s.battleSpeed,
      skipAnimations: s.skipAnimations,
      battleViewMode: s.battleViewMode,
      language: s.language,
      adminConfig: s.adminConfig,
      autoRepeatStopOnDefeat: s.autoRepeatStopOnDefeat,
    });
    expect(JSON.stringify(envelope)).not.toContain('showActionCamera');
    expect(JSON.stringify(envelope)).not.toContain(
      BATTLE_LAYOUT_PREFS_STORAGE_KEY
    );
  });

  it('2) Camera slot shows by default (120px phone / 160px desktop) and hides cleanly when OFF via EffectsSettingsPanel', () => {
    setViewport(390, 844);
    act(() => {
      root!.render(createElement(BattleScreen));
    });

    const phoneCam = container!.querySelector(
      '[data-testid="battle-camera-slot"]'
    ) as HTMLElement;
    expect(phoneCam).not.toBeNull();
    expect(phoneCam.getAttribute('data-camera-size')).toBe('phone');
    expect(phoneCam.className).toContain('h-[120px]');
    expect(phoneCam.textContent).toContain('Camera hành động');

    // Camera slot sits directly under player status bar
    const playerBar = container!.querySelector(
      '[data-testid="battle-player-status-bar"]'
    ) as HTMLElement;
    expect(playerBar.nextElementSibling).toBe(phoneCam);

    // Desktop size = 160px
    act(() => {
      setViewport(1280, 800);
    });
    const desktopCam = container!.querySelector(
      '[data-testid="battle-camera-slot"]'
    ) as HTMLElement;
    expect(desktopCam).not.toBeNull();
    expect(desktopCam.getAttribute('data-camera-size')).toBe('desktop');
    expect(desktopCam.className).toContain('h-[160px]');

    // Render BattleScreen + EffectsSettingsPanel together to verify live toggle
    act(() => {
      root!.render(
        createElement(
          'div',
          null,
          createElement(EffectsSettingsPanel),
          createElement(BattleScreen)
        )
      );
    });

    const toggleBtn = container!.querySelector(
      '[data-testid="battle-toggle-action-camera"]'
    ) as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(toggleBtn.textContent).toContain('Camera hành động');
    expect(toggleBtn.textContent).toContain('ON');

    act(() => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
    expect(toggleBtn.textContent).toContain('OFF');
    expect(readBattleLayoutPrefs().showActionCamera).toBe(false);
    expect(
      container!.querySelector('[data-testid="battle-camera-slot"]')
    ).toBeNull();
  });

  it('3) Phone portrait (<=640px) uses page-level scroll, sticky control row only, unclipped radar, stacked card mode, and no AUTO bar', () => {
    expect(getBattleLayoutMode(640, 900)).toBe('phone-portrait');
    expect(getBattleLayoutMode(641, 900)).toBe('tablet');

    setViewport(390, 844);
    useGameStore.setState({
      screen: 'BATTLE',
      battle: makeBattle(),
      autoBattleEnabled: true,
      battleViewMode: 'radar',
    });

    act(() => {
      root!.render(createElement(App));
    });

    // App shell unlocks viewport height/overflow for page-level scroll
    const appShell = container!.firstElementChild as HTMLElement;
    expect(appShell.className).toContain('min-h-[100dvh]');
    expect(appShell.className).not.toContain('overflow-hidden');

    // No separate "AUTO đang chạy" bar
    expect(
      container!.querySelector('[data-testid="battle-auto-collapsed-dock"]')
    ).toBeNull();
    expect(container!.textContent).not.toContain('AUTO đang chạy');

    // Only the small control row is sticky
    const stickyEls = Array.from(container!.querySelectorAll('*')).filter((el) =>
      (el.className || '').toString().split(/\s+/).includes('sticky')
    );
    expect(stickyEls).toHaveLength(1);
    expect(stickyEls[0].getAttribute('data-testid')).toBe(
      'battle-phone-controls'
    );

    // Radar on phone is unclipped (no overflow-hidden or scroll trap)
    const radarBox = container!.querySelector(
      '[data-testid="battle-radar-container"]'
    ) as HTMLElement;
    expect(radarBox).not.toBeNull();
    expect(radarBox.className).toContain('aspect-[380/500]');
    expect(radarBox.className).not.toContain('overflow-hidden');

    // Switch to Card mode: Allies block above Enemies block, zero tabs, zero inner scroll boxes
    act(() => {
      useGameStore.setState({ battleViewMode: 'card' });
    });

    expect(container!.querySelector('[data-testid="card-side-tabs"]')).toBeNull();
    const cardView = container!.querySelector(
      '[data-testid="battle-card-view"]'
    ) as HTMLElement;
    expect(cardView.className).not.toContain('overflow-hidden');
    expect(cardView.querySelector('.overflow-y-auto')).toBeNull();

    const allyBlock = cardView.querySelector('[data-testid="card-side-ally"]');
    const enemyBlock = cardView.querySelector('[data-testid="card-side-enemy"]');
    expect(allyBlock).not.toBeNull();
    expect(enemyBlock).not.toBeNull();
    expect(
      Boolean(
        allyBlock!.compareDocumentPosition(enemyBlock!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

  it('4) Loop button stays outside "..." menu and displays running state + battle counter in control row', () => {
    setViewport(390, 844);
    useGameStore.setState({
      screen: 'BATTLE',
      battle: makeBattle(),
      autoRepeatSession: {
        active: true,
        sectorId: 'aegis_relay',
        limit: 10,
        completedRuns: 2,
        wins: 2,
        totalExp: 100,
        totalCredits: 200,
        totalWarPoints: 10,
        totalDrops: [],
        stopReason: null,
      },
    });

    act(() => {
      root!.render(createElement(BattleScreen));
    });

    const controls = container!.querySelector(
      '[data-testid="battle-phone-controls"]'
    ) as HTMLElement;
    const chip = controls.querySelector(
      '[data-testid="battle-loop-active-chip"]'
    ) as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('data-loop-running')).toBe('true');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(
      chip.querySelector('[data-testid="battle-loop-running-dot"]')
    ).not.toBeNull();
    expect(
      chip.querySelector('[data-testid="battle-loop-progress"]')?.textContent
    ).toBe('3/10');
    expect(
      chip.querySelector('[data-testid="battle-loop-stop"]')
    ).not.toBeNull();
  });

  it('5) Sound defaults to OFF (muted=true) when no saved preference exists and respects saved preferences', () => {
    // Fresh campaign state defaults to muted: true
    const fresh = createFreshCampaignState('Pilot', 'striker');
    expect(fresh.muted).toBe(true);

    // Migration with null / missing muted defaults to muted: true
    expect(migrateSaveData(null, 0).muted).toBe(true);
    expect(
      migrateSaveData({ pilot: fresh.pilot }, CURRENT_SAVE_VERSION - 1).muted
    ).toBe(true);

    // Migration with explicit saved sound preference preserves it
    expect(
      migrateSaveData(
        { pilot: fresh.pilot, muted: false },
        CURRENT_SAVE_VERSION - 1
      ).muted
    ).toBe(false);
    expect(
      migrateSaveData(
        { pilot: fresh.pilot, muted: true },
        CURRENT_SAVE_VERSION - 1
      ).muted
    ).toBe(true);
  });

  it('6) Translation keys exist in both vi.ts and en.ts', () => {
    expect(VI_TRANSLATIONS['battle.actionCamera']).toBe('Camera hành động');
    expect(EN_TRANSLATIONS['battle.actionCamera']).toBe('Action Camera');
    expect(VI_TRANSLATIONS['battle.loopRunningTag']).toBeTruthy();
    expect(EN_TRANSLATIONS['battle.loopRunningTag']).toBeTruthy();
  });
});
