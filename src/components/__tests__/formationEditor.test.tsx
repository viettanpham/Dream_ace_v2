// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORMATION_CONFIG } from '../../data/formationConfig';
import { useGameStore } from '../../store/useGameStore';
import { FormationEditor } from '../FormationEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('FormationEditor UI (3-Row Squad Editor)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGameStore.getState().resetCampaign();
    useGameStore.getState().startCampaign('Commander', 'striker');
    useGameStore.getState().setLanguage('en');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders 3 horizontal rows (front, middle, back) with capacity counts, effect lines, and Auto arrange button', () => {
    act(() => {
      root.render(createElement(FormationEditor));
    });

    const frontRow = container.querySelector('[data-formation-row="front"]');
    const middleRow = container.querySelector('[data-formation-row="middle"]');
    const backRow = container.querySelector('[data-formation-row="back"]');
    expect(frontRow).not.toBeNull();
    expect(middleRow).not.toBeNull();
    expect(backRow).not.toBeNull();

    // Capacity displays like 3/3, 3/3, 2/2
    expect(
      container.querySelector('[data-testid="row-capacity-front"]')?.textContent
    ).toBe('3/3');
    expect(
      container.querySelector('[data-testid="row-capacity-middle"]')?.textContent
    ).toBe('3/3');
    expect(
      container.querySelector('[data-testid="row-capacity-back"]')?.textContent
    ).toBe('2/2');

    // One-line effect descriptions reflect default row modifiers
    expect(frontRow?.textContent).toContain('+10% DEF');
    expect(middleRow?.textContent).toContain('Neutral');
    expect(backRow?.textContent).toContain('-10% DEF');
    expect(backRow?.textContent).toContain('+10% Ranged DMG');

    // Auto arrange button exists
    const buttons = Array.from(container.querySelectorAll('button'));
    const autoBtn = buttons.find((b) =>
      b.textContent?.includes('Auto arrange')
    );
    expect(autoBtn).toBeDefined();
    expect(autoBtn?.className).toContain('min-h-[44px]');
  });

  it('blocks moving a unit into a full row with a clear alert message, and allows tap-to-move into an open row', () => {
    // Increase middle capacity to 4 so middle has an open slot while front (3/3) and back (2/2) are full
    useGameStore.getState().adminUpdateConfig({
      formation: {
        ...DEFAULT_FORMATION_CONFIG,
        rowCapacities: { front: 3, middle: 4, back: 2 },
      },
    });

    act(() => {
      root.render(createElement(FormationEditor));
    });

    // Player lead starts in front row (3/3)
    const leadBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="formation-unit-ally_player"]'
    );
    expect(leadBtn).not.toBeNull();

    // Tap lead unit to select it
    act(() => {
      leadBtn!.click();
    });
    expect(leadBtn!.getAttribute('aria-pressed')).toBe('true');

    // Attempt to tap full Back row (2/2) -> blocked with clear role="alert" message
    const moveToBackBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="move-to-back"]'
    );
    expect(moveToBackBtn).not.toBeNull();
    act(() => {
      moveToBackBtn!.click();
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Back Row is full (2/2)');
    expect(
      useGameStore
        .getState()
        .pilot.squadFormation?.find((u) => u.id === 'ally_player')?.row
    ).toBe('front');

    // Now tap open Middle row (3/4) -> move succeeds and front becomes 2/3, middle becomes 4/4
    const moveToMidBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="move-to-middle"]'
    );
    expect(moveToMidBtn).not.toBeNull();
    act(() => {
      moveToMidBtn!.click();
    });

    expect(
      useGameStore
        .getState()
        .pilot.squadFormation?.find((u) => u.id === 'ally_player')?.row
    ).toBe('middle');
    expect(
      container.querySelector('[data-testid="row-capacity-front"]')?.textContent
    ).toBe('2/3');
    expect(
      container.querySelector('[data-testid="row-capacity-middle"]')?.textContent
    ).toBe('4/4');

    // Clicking "Auto arrange" returns the Striker lead to Front row
    const autoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Auto arrange')
    );
    act(() => {
      autoBtn!.click();
    });

    expect(
      useGameStore
        .getState()
        .pilot.squadFormation?.find((u) => u.id === 'ally_player')?.row
    ).toBe('front');
    expect(useGameStore.getState().pilot.formationCustomized).toBe(false);
  });

  it('keeps all interactive tap targets >= 44px and uses no sub-13px text classes', () => {
    act(() => {
      root.render(createElement(FormationEditor));
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.className).toContain('min-h-[44px]');
    }

    const html = container.innerHTML;
    expect(html).not.toMatch(/\btext-(xs|\[1[012]px\]|\[[0-9]px\])\b/);
  });
});
