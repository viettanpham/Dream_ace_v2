// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SAVE_VERSION } from '../../engine/migration';
import {
  buildExportEnvelope,
  SAVE_IMPORT_BACKUP_STORAGE_KEY,
} from '../../engine/saveExport';
import { useGameStore } from '../../store/useGameStore';
import { SaveTransferSection } from '../SaveTransferSection';
import { TitleScreen } from '../TitleScreen';
import { TopHud } from '../TopHud';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function selectJsonFile(
  input: HTMLInputElement,
  filename: string,
  content: string
) {
  const file = new File([content], filename, { type: 'application/json' });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    });
  }
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await vi.waitFor(() => {
    const hasPrompt = Boolean(
      document.querySelector('[data-testid="save-pin-prompt"]')
    );
    const hasConfirm = Boolean(
      document.querySelector('[data-testid="save-import-confirm-dialog"]')
    );
    const hasError = Boolean(
      document.querySelector('[data-testid="save-import-error"]')
    );
    expect(hasPrompt || hasConfirm || hasError).toBe(true);
  });
}

describe('SV1a UI — SaveTransferSection (Export/Import Save with Optional PIN, Confirm Dialog, Undo, vi/en)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().resetCampaign();
    useGameStore.getState().startCampaign('AlphaPilot', 'striker');
    useGameStore.getState().adminSetCredits(5000);
    useGameStore.getState().setLanguage('vi');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Xuất save button, client-side PIN note, and exports encrypted & plain save with dream-ace-save-YYYYMMDD-HHmm.json filename', async () => {
    const createdDownloads: Array<{ filename: string; text: string }> = [];
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((text) => {
        const last = createdDownloads[createdDownloads.length - 1];
        if (last) last.text = text;
      });
      return 'blob:mock-save';
    });
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        createdDownloads.push({ filename: this.download, text: '' });
      });

    act(() => {
      root.render(createElement(SaveTransferSection));
    });

    const exportBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-export-btn"]'
    );
    expect(exportBtn?.textContent).toContain('Xuất save');
    expect(
      container.querySelector('[data-testid="save-pin-client-note"]')?.textContent
    ).toContain('client-side');

    // Mismatched PIN confirmation shows error without exporting
    const pinInput = container.querySelector<HTMLInputElement>(
      '[data-testid="save-export-pin"]'
    )!;
    const confirmInput = container.querySelector<HTMLInputElement>(
      '[data-testid="save-export-pin-confirm"]'
    )!;

    act(() => {
      setInputValue(pinInput, '1234');
      setInputValue(confirmInput, '5678');
    });
    await act(async () => {
      exportBtn!.click();
    });
    expect(
      container.querySelector('[data-testid="save-import-error"]')?.textContent
    ).toContain('không khớp');
    expect(clickSpy).not.toHaveBeenCalled();

    // Matching valid 4-8 digit PIN succeeds and downloads dream-ace-save-YYYYMMDD-HHmm.json
    act(() => {
      setInputValue(pinInput, '4321');
      setInputValue(confirmInput, '4321');
    });
    act(() => {
      exportBtn!.click();
    });
    await vi.waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createdDownloads[0].filename).toMatch(
      /^dream-ace-save-\d{8}-\d{4}\.json$/
    );
    expect(
      container.querySelector('[data-testid="save-status-message"]')?.textContent
    ).toContain(createdDownloads[0].filename);

    // Language switch to EN updates labels cleanly
    act(() => {
      useGameStore.getState().setLanguage('en');
    });
    expect(exportBtn?.textContent).toContain('Export Save');
    expect(
      container.querySelector('[data-testid="save-pin-client-note"]')?.textContent
    ).toContain('client side');

    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('handles encrypted PIN prompt flow (wrong PIN error -> valid PIN -> confirm dialog with exportedAt, saveVersion, progress -> replace & Hoàn tác import)', async () => {
    // Prepare an encrypted save snapshot for Pilot "BetaAce"
    const betaSnapshot = structuredClone(
      useGameStore.getState().exportSaveStateSnapshot()
    );
    betaSnapshot.pilot.name = 'BetaAce';
    betaSnapshot.pilot.credits = 12345;
    betaSnapshot.pilot.warPoints = 450;

    const encryptedEnvelope = await buildExportEnvelope(betaSnapshot, '998877', {
      exportedAt: '2026-11-10T08:30:00.000Z',
    });

    act(() => {
      root.render(createElement(SaveTransferSection));
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      '[data-testid="save-import-file-input"]'
    )!;

    await selectJsonFile(
      fileInput,
      'encrypted-save.json',
      JSON.stringify(encryptedEnvelope)
    );

    // PIN prompt dialog opens
    const pinPrompt = container.querySelector('[data-testid="save-pin-prompt"]');
    expect(pinPrompt).not.toBeNull();

    // Enter wrong PIN -> stays in prompt, shows error, current save untouched
    const importPinInput = container.querySelector<HTMLInputElement>(
      '[data-testid="save-import-pin-input"]'
    )!;
    const pinSubmitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-import-pin-submit"]'
    )!;

    act(() => {
      setInputValue(importPinInput, '111111');
    });
    act(() => {
      pinSubmitBtn.click();
    });
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="save-import-pin-error"]')
      ).not.toBeNull();
    });

    expect(
      container.querySelector('[data-testid="save-import-pin-error"]')?.textContent
    ).toContain('Sai mã PIN');
    expect(useGameStore.getState().pilot.name).toBe('AlphaPilot');

    // Enter correct PIN -> opens confirm dialog with exportedAt, saveVersion & campaign progress
    act(() => {
      setInputValue(importPinInput, '998877');
    });
    act(() => {
      pinSubmitBtn.click();
    });
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="save-import-confirm-dialog"]')
      ).not.toBeNull();
    });

    expect(container.querySelector('[data-testid="save-pin-prompt"]')).toBeNull();
    const confirmDialog = container.querySelector(
      '[data-testid="save-import-confirm-dialog"]'
    );
    expect(confirmDialog).not.toBeNull();
    expect(
      container.querySelector('[data-testid="save-confirm-version"]')?.textContent
    ).toBe(`v${CURRENT_SAVE_VERSION}`);
    expect(
      container.querySelector('[data-testid="save-confirm-exported-at"]')?.textContent
    ).not.toBe('');
    const progressText =
      container.querySelector('[data-testid="save-confirm-progress"]')?.textContent ?? '';
    expect(progressText).toContain('BetaAce');
    expect(progressText).toContain('12,345');

    // Confirm replace -> store updates atomically, backup saved, "Hoàn tác import" visible
    const confirmReplaceBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-import-confirm-btn"]'
    )!;
    act(() => {
      confirmReplaceBtn.click();
    });

    expect(useGameStore.getState().pilot.name).toBe('BetaAce');
    expect(useGameStore.getState().pilot.credits).toBe(12345);
    expect(localStorage.getItem(SAVE_IMPORT_BACKUP_STORAGE_KEY)).not.toBeNull();

    const undoBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-undo-import-btn"]'
    );
    expect(undoBtn?.textContent).toContain('Hoàn tác import');

    act(() => {
      undoBtn!.click();
    });

    expect(useGameStore.getState().pilot.name).toBe('AlphaPilot');
    expect(useGameStore.getState().pilot.credits).toBe(5000);
    expect(localStorage.getItem(SAVE_IMPORT_BACKUP_STORAGE_KEY)).toBeNull();
  });

  it('shows clear errors on wrong app, invalid JSON, checksum mismatch, and newer saveVersion without touching current save; disables import during active battle', async () => {
    act(() => {
      root.render(createElement(SaveTransferSection));
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      '[data-testid="save-import-file-input"]'
    )!;
    const snapshot = useGameStore.getState().exportSaveStateSnapshot();

    // 1) Invalid JSON
    await selectJsonFile(fileInput, 'bad.json', 'not-json');
    expect(
      container.querySelector('[data-testid="save-import-error"]')?.textContent
    ).toContain('JSON');

    // 2) Wrong app
    const plainEnv = await buildExportEnvelope(snapshot);
    await selectJsonFile(
      fileInput,
      'other.json',
      JSON.stringify({ ...plainEnv, app: 'someone-else' })
    );
    expect(
      container.querySelector('[data-testid="save-import-error"]')?.textContent
    ).toContain('Dream Ace');

    // 3) Checksum mismatch
    await selectJsonFile(
      fileInput,
      'tampered.json',
      JSON.stringify({ ...plainEnv, checksum: '0'.repeat(64) })
    );
    expect(
      container.querySelector('[data-testid="save-import-error"]')?.textContent
    ).toContain('checksum');

    // 4) Newer saveVersion refused
    const v10Env = await buildExportEnvelope(snapshot, undefined, {
      saveVersion: CURRENT_SAVE_VERSION + 1,
    });
    await selectJsonFile(fileInput, 'v10.json', JSON.stringify(v10Env));
    expect(
      container.querySelector('[data-testid="save-import-error"]')?.textContent
    ).toContain(`v${CURRENT_SAVE_VERSION + 1}`);

    // Current save remains completely untouched
    expect(useGameStore.getState().pilot.name).toBe('AlphaPilot');
    expect(useGameStore.getState().pilot.credits).toBe(5000);

    // 5) Active battle disables import button & file input
    act(() => {
      useGameStore.getState().startBattle('aegis_relay');
    });
    const importBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-import-btn"]'
    );
    expect(importBtn?.disabled).toBe(true);
    expect(fileInput.disabled).toBe(true);
    expect(
      container.querySelector('[data-testid="save-battle-active-notice"]')
    ).not.toBeNull();
  });

  it('mounts SaveTransferSection inside TopHud Settings BottomSheet and TitleScreen save sheet', () => {
    // 1) TopHud Settings sheet
    act(() => {
      root.render(createElement(TopHud));
    });
    const settingsBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="tophud-settings-btn"]'
    );
    expect(settingsBtn).not.toBeNull();

    act(() => {
      settingsBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="save-transfer-section"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="save-export-btn"]')?.textContent
    ).toContain('Xuất save');

    // 2) TitleScreen save sheet
    act(() => {
      useGameStore.getState().setScreen('TITLE');
      root.render(createElement(TitleScreen));
    });

    const titleSaveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="title-save-transfer-btn"]'
    );
    expect(titleSaveBtn).not.toBeNull();

    act(() => {
      titleSaveBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="save-transfer-section"]')
    ).not.toBeNull();
  });
});
