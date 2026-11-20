// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadCloudSave } from '../../engine/cloudSave';
import { InMemoryCloudStore } from '../../engine/cloudStore';
import { EN_TRANSLATIONS } from '../../i18n/en';
import { VI_TRANSLATIONS } from '../../i18n/vi';
import {
  attachCloudAutosaveListeners,
  CLOUD_AUTOSAVE_MIN_INTERVAL_MS,
  CLOUD_OFFLINE_BACKOFF_MS,
  CLOUD_SAVE_META_STORAGE_KEY,
  LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY,
  migrateAndReadCloudMeta,
  setCloudKeyStorageForTests,
  setCloudStoreAdapterForTests,
  useCloudSaveStore,
  type CloudKeyStorage,
  type StoredCloudKeyRecord,
} from '../../store/useCloudSaveStore';
import { isBattleActive, useGameStore } from '../../store/useGameStore';
import {
  CloudConflictDialog,
  UnlockCloudPinDialog,
} from '../CloudSaveDialogs';
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

class InspectableMemoryKeyStorage implements CloudKeyStorage {
  public record: StoredCloudKeyRecord | null = null;
  public writes: StoredCloudKeyRecord[] = [];
  public clears = 0;

  async get(): Promise<StoredCloudKeyRecord | null> {
    return this.record;
  }

  async set(record: StoredCloudKeyRecord): Promise<void> {
    this.record = record;
    this.writes.push(record);
  }

  async clear(): Promise<void> {
    this.record = null;
    this.clears += 1;
  }
}

function assertPinNeverInStorage(
  pin: string,
  keyStorage: InspectableMemoryKeyStorage
) {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const val = localStorage.getItem(key) ?? '';
    expect(val).not.toContain(pin);
  }
  if (keyStorage.record) {
    expect(Object.keys(keyStorage.record).sort()).toEqual([
      'key',
      'salt',
      'saveId',
      'verifier',
    ]);
    expect(keyStorage.record.saveId).not.toContain(pin);
    expect(keyStorage.record.verifier).not.toContain(pin);
    expect(keyStorage.record.salt).not.toContain(pin);
    expect(keyStorage.record.key.extractable).toBe(false);
    expect(JSON.stringify(keyStorage.record)).not.toContain(pin);
  }
}

describe('SV1b-2 / SV1b-2-fix — Cloud Save Security, Unlock, Overwrite, Backoff & Battle Deferral', () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: InMemoryCloudStore;
  let keyStorage: InspectableMemoryKeyStorage;

  beforeEach(() => {
    localStorage.clear();
    store = new InMemoryCloudStore({
      now: () => '2026-11-20T00:41:00.000Z',
    });
    keyStorage = new InspectableMemoryKeyStorage();
    setCloudStoreAdapterForTests(store);
    setCloudKeyStorageForTests(keyStorage);
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
    setCloudKeyStorageForTests(undefined);
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

  it('NEVER stores PIN in localStorage or IndexedDB (Nhớ defaults OFF, toggling ON stores non-extractable CryptoKey only, toggling OFF clears IDB while keeping dreamAce.cloud.v1, and legacy key is migrated & deleted)', async () => {
    // 0. Verify legacy dreamAce.cloudSave.link.v1 containing plaintext PIN is migrated & purged
    localStorage.setItem(
      LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY,
      JSON.stringify({
        saveId: '7K4M9-X2P8Q',
        pin: '918273',
        lastKnownRev: 4,
        lastSyncedAt: '2026-11-19T12:00:00.000Z',
      })
    );
    const migrated = migrateAndReadCloudMeta();
    expect(migrated).toEqual({
      saveId: '7K4M9-X2P8Q',
      lastKnownRev: 4,
      lastSyncedAt: '2026-11-19T12:00:00.000Z',
    });
    expect(localStorage.getItem(LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY)).toBeNull();
    const migratedRaw = localStorage.getItem(CLOUD_SAVE_META_STORAGE_KEY);
    expect(migratedRaw).not.toBeNull();
    expect(migratedRaw).not.toContain('918273');
    expect(Object.keys(JSON.parse(migratedRaw!)).sort()).toEqual([
      'lastKnownRev',
      'lastSyncedAt',
      'saveId',
    ]);
    localStorage.clear();

    // 1. Create cloud save via Settings UI — "Nhớ trên máy này" defaults to OFF
    act(() => {
      root.render(createElement(TopHud));
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="tophud-settings-btn"]')!
        .click();
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="cloud-create-btn"]')!
        .click();
    });

    const createRememberBox = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-create-remember"]'
    )!;
    expect(createRememberBox.checked).toBe(false);

    const pin1 = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-create-pin"]'
    )!;
    const pin2 = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-create-pin-confirm"]'
    )!;
    const submitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-create-submit-btn"]'
    )!;

    // Mismatched PIN fails
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

    // Matching PIN creates save with Nhớ = OFF
    const secretPin = '246813';
    act(() => {
      setInputValue(pin1, secretPin);
      setInputValue(pin2, secretPin);
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

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-created-done-btn"]'
        )!
        .click();
    });

    // Check Nhớ OFF state: localStorage has ONLY { saveId, lastKnownRev, lastSyncedAt }, IDB is empty, no PIN anywhere
    const metaOffRaw = localStorage.getItem(CLOUD_SAVE_META_STORAGE_KEY);
    expect(metaOffRaw).not.toBeNull();
    const metaOff = JSON.parse(metaOffRaw!);
    expect(Object.keys(metaOff).sort()).toEqual([
      'lastKnownRev',
      'lastSyncedAt',
      'saveId',
    ]);
    expect(metaOff.saveId).toBe(createdId);
    expect(metaOff.lastKnownRev).toBe(1);
    expect(keyStorage.record).toBeNull();
    assertPinNeverInStorage(secretPin, keyStorage);

    // 2. Toggle "Nhớ trên máy này" ON -> IndexedDB receives { saveId, key (non-extractable), verifier, salt }, NEVER PIN
    const rememberBox = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-remember-checkbox"]'
    )!;
    expect(rememberBox.checked).toBe(false);

    await act(async () => {
      rememberBox.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(keyStorage.record).not.toBeNull();
    });
    expect(rememberBox.checked).toBe(true);
    expect(keyStorage.record!.saveId).toBe(createdId);
    expect(keyStorage.record!.key.extractable).toBe(false);
    assertPinNeverInStorage(secretPin, keyStorage);

    // 3. Toggle "Nhớ trên máy này" OFF -> clears IndexedDB, keeps dreamAce.cloud.v1 metadata (still no PIN)
    await act(async () => {
      rememberBox.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(keyStorage.record).toBeNull();
    });
    expect(rememberBox.checked).toBe(false);
    const metaStillThere = localStorage.getItem(CLOUD_SAVE_META_STORAGE_KEY);
    expect(metaStillThere).not.toBeNull();
    expect(JSON.parse(metaStillThere!).saveId).toBe(createdId);
    assertPinNeverInStorage(secretPin, keyStorage);
  });

  it('reload with linked Save ID and no key enters "Cần nhập PIN", pauses autosave, shows Unlock dialog (wrong PIN = "Sai PIN"), and unlocks & resumes sync', async () => {
    // Create save with Nhớ = OFF (meta in localStorage, no key in IndexedDB)
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('314159', false);
    expect(created.ok).toBe(true);
    const linkedId = useCloudSaveStore.getState().saveId!;
    expect(store.transactionCount).toBe(1);
    expect(keyStorage.record).toBeNull();

    // Simulate reload: wipe in-memory key & force hydrate
    useCloudSaveStore.setState({ credentials: null, lastAutosaveAt: null });
    await useCloudSaveStore.getState().hydrateCloudSession({ force: true });

    expect(useCloudSaveStore.getState().saveId).toBe(linkedId);
    expect(useCloudSaveStore.getState().status).toBe('needs_pin');
    expect(useCloudSaveStore.getState().pinUnlockModalOpen).toBe(true);

    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement(CloudSaveSection),
          createElement(UnlockCloudPinDialog)
        )
      );
    });

    expect(
      container.querySelector('[data-testid="cloud-status-text"]')?.textContent
    ).toContain('Cần nhập PIN');
    expect(
      container.querySelector('[data-testid="cloud-unlock-pin-dialog"]')
    ).not.toBeNull();

    // Autosave is paused while locked (requestAutosave queues pendingSyncAfterUnlock, does NOT upload)
    useCloudSaveStore.getState().requestAutosave();
    expect(store.transactionCount).toBe(1);
    expect(useCloudSaveStore.getState().pendingSyncAfterUnlock).toBe(true);

    // Wrong PIN -> shows "Sai PIN" and remains locked
    const unlockPinInput = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-unlock-pin-input"]'
    )!;
    const unlockSubmitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-unlock-submit-btn"]'
    )!;
    act(() => {
      setInputValue(unlockPinInput, '000000');
    });
    act(() => {
      unlockSubmitBtn.click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-unlock-error"]')
          ?.textContent
      ).toContain('Sai PIN');
    });
    expect(useCloudSaveStore.getState().status).toBe('needs_pin');
    expect(store.transactionCount).toBe(1);

    // Valid PIN -> unlocks, closes dialog, and resumes queued sync (tx 1 -> 2)
    act(() => {
      setInputValue(unlockPinInput, '314159');
    });
    act(() => {
      unlockSubmitBtn.click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-unlock-pin-dialog"]')
      ).toBeNull();
    });
    await vi.waitFor(() => {
      expect(store.transactionCount).toBe(2);
    });
    expect(useCloudSaveStore.getState().status).toBe('synced');
    expect(useCloudSaveStore.getState().credentials).not.toBeNull();
    assertPinNeverInStorage('314159', keyStorage);
  });

  it('reload with Remember ON restores key silently from IndexedDB without asking for PIN', async () => {
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('654321', true);
    expect(created.ok).toBe(true);
    expect(keyStorage.record).not.toBeNull();

    // Simulate reload: clear in-memory credentials, force hydrate
    useCloudSaveStore.setState({ credentials: null, status: 'idle' });
    await useCloudSaveStore.getState().hydrateCloudSession({ force: true });

    expect(useCloudSaveStore.getState().status).toBe('synced');
    expect(useCloudSaveStore.getState().credentials).not.toBeNull();
    expect(useCloudSaveStore.getState().pinUnlockModalOpen).toBe(false);
    expect(useCloudSaveStore.getState().rememberOnDevice).toBe(true);
    assertPinNeverInStorage('654321', keyStorage);
  });

  it('opens remote save from TitleScreen when no local save exists (rejects wrong PIN with "Sai PIN" and loads valid save directly)', async () => {
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

    // Fresh Title screen with NO local save (hasSaveData === false)
    useGameStore.getState().resetCampaign();
    expect(useGameStore.getState().hasSaveData).toBe(false);
    expect(useGameStore.getState().screen).toBe('TITLE');

    act(() => {
      root.render(createElement(TitleScreen));
    });

    const titleOpenBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="title-open-remote-save-btn"]'
    )!;
    act(() => {
      titleOpenBtn.click();
    });

    // Remember checkbox defaults to OFF
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="cloud-open-remember"]'
      )?.checked
    ).toBe(false);

    const idInput = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-open-save-id"]'
    )!;
    const pinInput = container.querySelector<HTMLInputElement>(
      '[data-testid="cloud-open-pin"]'
    )!;
    const submitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-open-submit-btn"]'
    )!;

    // Wrong PIN -> "Sai PIN"
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

    // Correct PIN -> loads directly (no overwrite prompt because !hasSaveData)
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
    assertPinNeverInStorage('5566', keyStorage);
  });

  it('shows "Ghi đè save trên máy?" with [Xuất save (SV1a) trước] [Ghi đè] [Hủy] for Open Remote, Download Linked, and Conflict Use Cloud when a local save exists', async () => {
    // Seed a remote save distinct from local pilot "Nova" (4500 CR)
    const remoteState = structuredClone(
      useGameStore.getState().exportSaveStateSnapshot()
    );
    remoteState.pilot.name = 'CloudCommander';
    remoteState.pilot.credits = 88888;
    const remoteId = '9M3N7-K4P2W';
    const seedRes = await uploadCloudSave({
      saveId: remoteId,
      pin: '7744',
      state: remoteState,
      lastKnownRev: 0,
      adapter: store,
    });
    expect(seedRes.ok).toBe(true);
    expect(useGameStore.getState().hasSaveData).toBe(true);

    // Mock URL.createObjectURL / revokeObjectURL for SV1a backup download verification
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:sv1a-backup-test');
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

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

    // A) "Mở save từ xa" while local save exists -> asks "Ghi đè save trên máy?"
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-open-remote-btn"]'
        )!
        .click();
    });
    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[data-testid="cloud-open-save-id"]'
        )!,
        remoteId
      );
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[data-testid="cloud-open-pin"]'
        )!,
        '7744'
      );
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-open-submit-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
      ).not.toBeNull();
    });

    const overwriteDialog = container.querySelector(
      '[data-testid="cloud-overwrite-confirm-dialog"]'
    )!;
    expect(overwriteDialog.textContent).toContain('Ghi đè save trên máy?');
    expect(
      container.querySelector('[data-testid="cloud-overwrite-export-btn"]')
        ?.textContent
    ).toContain('Xuất save (SV1a) trước');
    expect(
      container.querySelector('[data-testid="cloud-overwrite-confirm-btn"]')
        ?.textContent
    ).toContain('Ghi đè');
    expect(
      container.querySelector('[data-testid="cloud-overwrite-cancel-btn"]')
        ?.textContent
    ).toContain('Hủy');

    // Local save must NOT have been overwritten yet
    expect(useGameStore.getState().pilot.name).toBe('Nova');

    // Click [Xuất save (SV1a) trước] -> triggers SV1a JSON export & keeps dialog open
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-overwrite-export-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-overwrite-exported-notice"]')
      ).not.toBeNull();
    });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="cloud-overwrite-exported-notice"]')
        ?.textContent
    ).toContain('dream-ace-save-');
    expect(useGameStore.getState().pilot.name).toBe('Nova');

    // Click [Hủy] -> cancels overwrite, local save untouched
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-overwrite-cancel-btn"]'
        )!
        .click();
    });
    expect(
      container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
    ).toBeNull();
    expect(useGameStore.getState().pilot.name).toBe('Nova');

    // Re-open "Mở save từ xa", submit again & click [Ghi đè] -> applies remote save
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-open-remote-btn"]'
        )!
        .click();
    });
    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[data-testid="cloud-open-save-id"]'
        )!,
        remoteId
      );
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[data-testid="cloud-open-pin"]'
        )!,
        '7744'
      );
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-open-submit-btn"]'
        )!
        .click();
    });
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
      ).not.toBeNull();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-overwrite-confirm-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(useGameStore.getState().pilot.name).toBe('CloudCommander');
      expect(
        container.querySelector('[data-testid="cloud-download-btn"]')
      ).not.toBeNull();
    });
    expect(useGameStore.getState().pilot.credits).toBe(88888);

    // B) "Tải từ mây" while linked & local save exists -> also shows "Ghi đè save trên máy?"
    useGameStore.getState().adminSetCredits(1234);
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="cloud-download-btn"]')!
        .click();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
      ).not.toBeNull();
    });
    // Still local credits until confirmed
    expect(useGameStore.getState().pilot.credits).toBe(1234);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-overwrite-confirm-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(useGameStore.getState().pilot.credits).toBe(88888);
    });
  });

  it('shows conflict dialog with both timestamps + summaries (level, credits, gears) and resolves both Keep Local and Use Cloud (via overwrite confirmation)', async () => {
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('4455', false);
    expect(created.ok).toBe(true);
    const linkedId = useCloudSaveStore.getState().saveId!;

    // Another device uploads rev 2
    const remoteState = structuredClone(
      useGameStore.getState().exportSaveStateSnapshot()
    );
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

    // 1. Choose "Giữ bản trên máy" -> uploads rev 3
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

    // 2. Trigger second conflict (rev 4 from cloud) and choose "Lấy bản trên mây" -> opens Overwrite Confirm first
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

    // Overwrite confirmation must appear before local save is replaced
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
      ).not.toBeNull();
    });
    expect(useGameStore.getState().pilot.name).toBe('Nova');

    // Confirm overwrite -> applies cloud save & closes both dialogs
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cloud-overwrite-confirm-btn"]'
        )!
        .click();
    });

    await vi.waitFor(() => {
      expect(useGameStore.getState().pilot.name).toBe('CloudDevicePilot');
      expect(useCloudSaveStore.getState().lastKnownRev).toBe(4);
    });
    expect(useGameStore.getState().pilot.credits).toBe(99999);
    expect(
      container.querySelector('[data-testid="cloud-conflict-dialog"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cloud-overwrite-confirm-dialog"]')
    ).toBeNull();
  });

  it('uses strict offline retry backoff (30s -> 2m -> 5m -> 5m), resets on success, and retries immediately on browser online event', async () => {
    expect(CLOUD_OFFLINE_BACKOFF_MS).toEqual([30_000, 120_000, 300_000]);

    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('7788', false);
    expect(created.ok).toBe(true);
    expect(store.transactionCount).toBe(1);

    vi.useFakeTimers();
    const detach = attachCloudAutosaveListeners();

    try {
      const onLineSpy = vi
        .spyOn(navigator, 'onLine', 'get')
        .mockReturnValue(false);

      // Initial sync fails offline -> schedules retry #1 at 30s (offlineRetryAttempt = 1)
      const firstFail = await useCloudSaveStore.getState().syncNow();
      expect(firstFail.ok).toBe(false);
      expect(useCloudSaveStore.getState().status).toBe('offline');
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(1);

      const retrySpy = vi.spyOn(
        useCloudSaveStore.getState(),
        'retryOfflineSync'
      );

      // 29s: retry #1 has NOT fired yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(0);

      // +1s (= 30s): retry #1 fires -> still offline -> schedules retry #2 at 120s (attempt = 2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(1);
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(2);

      // +119s: retry #2 has NOT fired yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(119_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(1);

      // +1s (= 120s): retry #2 fires -> still offline -> schedules retry #3 at 300s (attempt = 3)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(2);
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(3);

      // +299s: retry #3 has NOT fired yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(299_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(2);

      // +1s (= 300s): retry #3 fires -> still offline -> stays at 300s (attempt = 4)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(3);
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(4);

      // +299s: retry #4 still hasn't fired; +1s (= 300s) fires retry #4
      await act(async () => {
        await vi.advanceTimersByTimeAsync(299_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(3);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(retrySpy).toHaveBeenCalledTimes(4);
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(5);
      expect(store.transactionCount).toBe(1);

      // Regain connectivity -> 'online' event retries IMMEDIATELY, succeeds, and resets backoff to 0
      onLineSpy.mockReturnValue(true);
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(2);
      });
      expect(useCloudSaveStore.getState().status).toBe('synced');
      expect(useCloudSaveStore.getState().pendingRetry).toBe(false);
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(0);

      // Subsequent offline failure starts back at 30s (attempt 1), confirming reset!
      onLineSpy.mockReturnValue(false);
      await useCloudSaveStore.getState().syncNow();
      expect(useCloudSaveStore.getState().offlineRetryAttempt).toBe(1);
    } finally {
      detach();
    }
  });

  it('defers all uploads during active battle (manual, trailing autosave, retry), disables [Lưu lên mây ngay] with "Đang trong trận", and uploads once battle ends', async () => {
    const created = await useCloudSaveStore
      .getState()
      .createCloudSave('8899', false);
    expect(created.ok).toBe(true);
    expect(store.transactionCount).toBe(1);

    vi.useFakeTimers();
    const detach = attachCloudAutosaveListeners();

    try {
      act(() => {
        root.render(createElement(CloudSaveSection));
      });

      // Ensure 30s throttle cooldown is already satisfied
      useCloudSaveStore.setState({
        lastAutosaveAt: Date.now() - CLOUD_AUTOSAVE_MIN_INTERVAL_MS - 1000,
      });

      // Start an active battle
      act(() => {
        useGameStore.getState().startBattle('aegis_relay');
      });
      expect(isBattleActive()).toBe(true);

      // UI checks: [Lưu lên mây ngay], [Tải từ mây], [Ngắt kết nối cloud] are all disabled with "Đang trong trận"
      const syncBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="cloud-sync-now-btn"]'
      )!;
      const downloadBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="cloud-download-btn"]'
      )!;
      const disconnectBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="cloud-disconnect-btn"]'
      )!;
      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.textContent).toContain('Đang trong trận');
      expect(downloadBtn.disabled).toBe(true);
      expect(disconnectBtn.disabled).toBe(true);
      expect(
        container.querySelector('[data-testid="cloud-battle-locked-notice"]')
          ?.textContent
      ).toContain('Đang trong trận');

      // Direct syncNow() during active battle must NOT upload — must defer!
      const syncDuringBattle = await useCloudSaveStore.getState().syncNow();
      expect(syncDuringBattle.ok).toBe(false);
      if (!syncDuringBattle.ok) {
        expect(syncDuringBattle.errorCode).toBe('BATTLE_ACTIVE');
        expect(syncDuringBattle.deferred).toBe(true);
      }
      expect(useCloudSaveStore.getState().deferredUploadPending).toBe(true);
      expect(store.transactionCount).toBe(1);

      // Requesting autosave during active battle must ALSO defer (no upload)
      useCloudSaveStore.getState().requestAutosave();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CLOUD_AUTOSAVE_MIN_INTERVAL_MS + 500);
      });
      expect(store.transactionCount).toBe(1);

      // End battle (retreat -> battle.summary set -> isBattleActive becomes false)
      act(() => {
        useGameStore.getState().retreatBattle();
      });
      expect(isBattleActive()).toBe(false);

      // Deferred upload flushes automatically after battle ends -> tx 1 -> 2
      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(2);
      });
      expect(useCloudSaveStore.getState().deferredUploadPending).toBe(false);
      expect(useCloudSaveStore.getState().status).toBe('synced');

      // Also verify 30s trailing autosave throttling outside battle (loop end within 30s)
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
      expect(store.transactionCount).toBe(2);

      // Start another battle BEFORE the 30s trailing timer fires -> timer must defer while in battle!
      act(() => {
        useGameStore.getState().startBattle('aegis_relay');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CLOUD_AUTOSAVE_MIN_INTERVAL_MS + 100);
      });
      expect(store.transactionCount).toBe(2);
      expect(useCloudSaveStore.getState().deferredUploadPending).toBe(true);

      // Leave battle -> deferred trailing autosave now uploads -> tx 3
      act(() => {
        useGameStore.getState().retreatBattle();
      });
      await vi.waitFor(() => {
        expect(store.transactionCount).toBe(3);
      });
    } finally {
      detach();
    }
  });

  it('has complete non-empty vi and en translations for every cloud.* key', () => {
    const enCloudKeys = Object.keys(EN_TRANSLATIONS)
      .filter((k) => k.startsWith('cloud.'))
      .sort();
    const viCloudKeys = Object.keys(VI_TRANSLATIONS)
      .filter((k) => k.startsWith('cloud.'))
      .sort();

    expect(enCloudKeys.length).toBeGreaterThan(0);
    expect(viCloudKeys).toEqual(enCloudKeys);

    for (const key of enCloudKeys) {
      const enVal = EN_TRANSLATIONS[key as keyof typeof EN_TRANSLATIONS];
      const viVal = VI_TRANSLATIONS[key as keyof typeof VI_TRANSLATIONS];
      expect(typeof enVal).toBe('string');
      expect(enVal.trim().length).toBeGreaterThan(0);
      expect(typeof viVal).toBe('string');
      expect(viVal.trim().length).toBeGreaterThan(0);
    }
  });
});
