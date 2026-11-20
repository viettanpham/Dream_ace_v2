// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadCloudSave } from '../../engine/cloudSave';
import { InMemoryCloudStore } from '../../engine/cloudStore';
import {
  attachCloudAutosaveListeners,
  CLOUD_AUTOSAVE_MIN_INTERVAL_MS,
  CLOUD_SAVE_LINK_STORAGE_KEY,
  setCloudStoreAdapterForTests,
  useCloudSaveStore,
} from '../../store/useCloudSaveStore';
import { useGameStore } from '../../store/useGameStore';
import { CloudConflictDialog } from '../CloudSaveDialogs';
import { CloudSaveSection } from '../CloudSaveSection';
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

describe('SV1b-2 — Cloud Save UI, Title Screen Open Remote, Conflict Dialog & Autosave', () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: InMemoryCloudStore;

  beforeEach(() => {
    localStorage.clear();
    store = new InMemoryCloudStore({
      now: () => '2026-11-20T00:41:00.000Z',
    });
    setCloudStoreAdapterForTests(store);
    useCloudSaveStore.getState().resetCloudStoreForTests();

    useGameStore.getState().resetCampaign();
    useGameStore.getState().startCampaign('Nova', 'striker');
    useGameStore.getState().adminSetCredits(4500);
    useGameStore.getState().setLanguage('vi');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setCloudStoreAdapterForTests(undefined);
    useCloudSaveStore.getState().resetCloudStoreForTests();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows disabled buttons and "Chưa cấu hình cloud" when cloud is unconfigured', () => {
    store.setConfigured(false);

    act(() => {
      root.render(createElement(CloudSaveSection));
    });

    const createBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-create-btn"]'
    );
    const openBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-open-remote-btn"]'
    );
    expect(createBtn?.disabled).toBe(true);
    expect(openBtn?.disabled).toBe(true);
    expect(
      container.querySelector('[data-testid="cloud-not-configured-notice"]')
        ?.textContent
    ).toContain('Chưa cấu hình cloud');
  });

  it('creates cloud save (PIN x2 -> large Save ID + "Mất PIN = mất save"), shows linked UI, toggles Remember on device, and locks Load/Disconnect in battle', async () => {
    act(() => {
      root.render(createElement(TopHud));
    });

    // Open Settings BottomSheet (phone & desktop)
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="tophud-settings-btn"]')!
        .click();
    });

    expect(
      container.querySelector('[data-testid="cloud-save-section"]')
    ).not.toBeNull();

    // Open Create dialog
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="cloud-create-btn"]')!
        .click();
    });

    const pin1 = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-create-pin"]'
    )!;
    const pin2 = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-create-pin-confirm"]'
    )!;
    const submitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-create-submit-btn"]'
    )!;

    // Mismatched PIN fails validation
    act(() => {
      setInputValue(pin1, '1234');
      setInputValue(pin2, '9999');
    });
    act(() => {
      submitBtn.click();
    });
    expect(
      container.querySelector('[data-testid="cloud-create-error"]')
    ).not.toBeNull();

    // Matching PIN creates save and shows big Save ID + lost PIN warning
    act(() => {
      setInputValue(pin1, '2468');
      setInputValue(pin2, '2468');
    });
    act(() => {
      submitBtn.click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-created-save-id"]')
      ).not.toBeNull();
    });

    const createdId = container
      .querySelector('[data-testid="cloud-created-save-id"]')!
      .textContent!.trim();
    expect(createdId).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(
      container.querySelector('[data-testid="cloud-lost-pin-warning"]')
        ?.textContent
    ).toContain('Mất PIN = mất save');

    // Close Create dialog -> linked panel visible
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-created-done-btn"]'
        )!
        .click();
    });

    expect(
      container.querySelector('[data-testid="cloud-linked-save-id"]')?.textContent
    ).toBe(createdId);
    expect(
      container.querySelector('[data-testid="cloud-status-text"]')?.textContent
    ).toContain('Đã đồng bộ lúc');
    expect(localStorage.getItem(CLOUD_SAVE_LINK_STORAGE_KEY)).not.toBeNull();

    // Toggle "Nhớ trên máy này" OFF clears localStorage immediately
    const rememberBox = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-remember-checkbox"]'
    )!;
    expect(rememberBox.checked).toBe(true);
    act(() => {
      rememberBox.click();
    });
    expect(rememberBox.checked).toBe(false);
    expect(localStorage.getItem(CLOUD_SAVE_LINK_STORAGE_KEY)).toBeNull();

    // Enter active battle -> Load & Disconnect buttons are disabled with "Đang trong trận"
    act(() => {
      useGameStore.getState().startBattle('aegis_relay');
    });

    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="cloud-download-btn"]'
      )?.disabled
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="cloud-disconnect-btn"]'
      )?.disabled
    ).toBe(true);
    expect(
      container.querySelector('[data-testid="cloud-battle-locked-notice"]')
        ?.textContent
    ).toContain('Đang trong trận');
  });

  it('opens remote save from TitleScreen with Save ID + PIN, rejects wrong PIN with "Sai PIN", and loads valid save', async () => {
    // Seed a remote save on our in-memory cloud
    useGameStore.getState().resetCampaign();
    useGameStore.getState().startCampaign('RemoteAce', 'siege');
    useGameStore.getState().adminSetCredits(77777);
    const remoteSnapshot = useGameStore.getState().exportSaveStateSnapshot();
    const remoteId = '7K4M9-X2P8Q';
    const seedRes = await uploadCloudSave({
      saveId: remoteId,
      pin: '5566',
      state: remoteSnapshot,
      lastKnownRev: 0,
      adapter: store,
    });
    expect(seedRes.ok).toBe(true);

    // Reset local device to fresh Title screen
    useGameStore.getState().resetCampaign();
    expect(useGameStore.getState().screen).toBe('TITLE');

    act(() => {
      root.render(createElement(TitleScreen));
    });

    const titleOpenBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="title-open-remote-save-btn"]'
    )!;
    expect(titleOpenBtn.textContent).toContain('Mở save từ xa');

    act(() => {
      titleOpenBtn.click();
    });

    const idInput = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-open-save-id"]'
    )!;
    const pinInput = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-open-pin"]'
    )!;
    const submitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-open-submit-btn"]'
    )!;

    // Wrong PIN -> "Sai PIN" and no partial load
    act(() => {
      setInputValue(idInput, '7k4m9 x2p8q');
      setInputValue(pinInput, '0000');
    });
    act(() => {
      submitBtn.click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-open-error"]')?.textContent
      ).toContain('Sai PIN');
    });
    expect(useGameStore.getState().pilot.name).not.toBe('RemoteAce');

    // Correct PIN -> loads campaign & links cloud save
    act(() => {
      setInputValue(pinInput, '5566');
    });
    act(() => {
      submitBtn.click();
    });

    await vi.waitFor(() => {
      expect(useGameStore.getState().pilot.name).toBe('RemoteAce');
    });
    expect(useGameStore.getState().pilot.credits).toBe(77777);
    expect(useGameStore.getState().screen).toBe('HANGAR');
    expect(useCloudSaveStore.getState().saveId).toBe(remoteId);
    expect(useCloudSaveStore.getState().lastKnownRev).toBe(1);
  });

  it('shows conflict dialog with both timestamps + summaries (level, credits, gears) and resolves both Keep Local and Use Cloud', async () => {
    // 1. Create initial cloud save (rev 1)
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('4455', true);
    expect(created.ok).toBe(true);
    const linkedId = useCloudSaveStore.getState().saveId!;

    // 2. Another device uploads rev 2 with different pilot/credits
    const remoteState = useGameStore.getState().exportSaveStateSnapshot();
    remoteState.pilot.name = 'CloudDevicePilot';
    remoteState.pilot.credits = 99999;
    remoteState.pilot.gears.striker.level = 12;
    const device2Up = await uploadCloudSave({
      saveId: linkedId,
      pin: '4455',
      state: remoteState,
      lastKnownRev: 1,
      adapter: store,
    });
    expect(device2Up.ok).toBe(true);

    // 3. Local device modifies credits locally and clicks Sync Now -> triggers Conflict Dialog
    useGameStore.getState().adminSetCredits(11111);
    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement(CloudSaveSection),
          createElement(CloudConflictDialog)
        )
      );
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="cloud-sync-now-btn"]')!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-conflict-dialog"]')
      ).not.toBeNull();
    });

    const localCardText = container.querySelector(
      '[data-testid="cloud-conflict-local-card"]'
    )!.textContent!;
    const remoteCardText = container.querySelector(
      '[data-testid="cloud-conflict-remote-card"]'
    )!.textContent!;

    expect(localCardText).toContain('11,111 CR');
    expect(localCardText).toContain('Gear');
    expect(remoteCardText).toContain('99,999 CR');
    expect(remoteCardText).toContain('Lv.12');
    expect(remoteCardText).toContain('Gear');
    expect(
      container.querySelector('[data-testid="cloud-conflict-local-time"]')
        ?.textContent
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="cloud-conflict-remote-time"]')
        ?.textContent
    ).toBeTruthy();

    // 4. Choose "Giữ bản trên máy" -> uploads rev 3 and clears conflict
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-conflict-keep-local-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-conflict-dialog"]')
      ).toBeNull();
    });
    expect(useCloudSaveStore.getState().lastKnownRev).toBe(3);
    expect(useCloudSaveStore.getState().status).toBe('synced');

    // 5. Trigger a second conflict (rev 4 from cloud) and choose "Lấy bản trên mây"
    const device2Up2 = await uploadCloudSave({
      saveId: linkedId,
      pin: '4455',
      state: remoteState,
      lastKnownRev: 3,
      adapter: store,
    });
    expect(device2Up2.ok).toBe(true);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="cloud-sync-now-btn"]')!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-conflict-dialog"]')
      ).not.toBeNull();
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-conflict-use-cloud-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(useGameStore.getState().pilot.name).toBe('CloudDevicePilot');
    });
    expect(useGameStore.getState().pilot.credits).toBe(99999);
    expect(useCloudSaveStore.getState().lastKnownRev).toBe(4);
  });

  it('autosaves after battle & loop completion with 30s max throttle and retries automatically when back online', async () => {
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('7788', true);
    expect(created.ok).toBe(true);
    expect(store.transactionCount).toBe(1);

    vi.useFakeTimers();
    const detach = attachCloudAutosaveListeners();

    try {
      // Simulate cooldown already elapsed (> 30s since initial create)
      useCloudSaveStore.setState({
        lastAutosaveAt: Date.now() - CLOUD_AUTOSAVE_MIN_INTERVAL_MS - 1000,
      });

      // Trigger #1: battle finishes (battle.summary null -> defined)
      useGameStore.getState().startBattle('aegis_relay');
      useGameStore.getState().retreatBattle();

      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(2);
      });

      // Trigger #2 immediately (within 30s): loop ends -> must NOT upload immediately (throttled!)
      useGameStore.setState({
        autoRepeatSession: {
          active: true,
          limit: 5,
          sectorId: 'aegis_relay',
          completedRuns: 1,
          wins: 1,
          totalExp: 100,
          totalCredits: 200,
          totalWarPoints: 10,
          totalDrops: [],
          stopReason: null,
        },
      });
      useGameStore.getState().stopAutoRepeat('manual_stop');

      // Still 2 immediately after trigger within 30s window
      expect(store.transactionCount).toBe(2);

      // Advance 30 seconds -> trailing throttled autosave fires once -> tx 3
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CLOUD_AUTOSAVE_MIN_INTERVAL_MS + 100);
      });
      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(3);
      });

      // Trigger #3 while offline -> status becomes 'offline' and pendingRetry = true
      const onLineGetter = vi
        .spyOn(navigator, 'onLine', 'get')
        .mockReturnValue(false);
      useCloudSaveStore.setState({
        lastAutosaveAt: Date.now() - CLOUD_AUTOSAVE_MIN_INTERVAL_MS - 1000,
      });
      useCloudSaveStore.getState().requestAutosave();

      expect(useCloudSaveStore.getState().status).toBe('offline');
      expect(useCloudSaveStore.getState().pendingRetry).toBe(true);
      expect(store.transactionCount).toBe(3);

      // Regain connectivity -> 'online' event automatically retries and syncs -> tx 4
      onLineGetter.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(4);
      });
      expect(useCloudSaveStore.getState().status).toBe('synced');
      expect(useCloudSaveStore.getState().pendingRetry).toBe(false);
    } finally {
      detach();
    }
  });
});
