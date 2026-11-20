import { create } from 'zustand';
import {
  downloadCloudSave,
  formatSaveId,
  generateSaveId,
  uploadCloudSave,
  type CloudSaveErrorCode,
} from '../engine/cloudSave';
import {
  getDefaultCloudStore,
  isCloudConfigured,
  type CloudStoreAdapter,
} from '../engine/cloudStore';
import { CURRENT_SAVE_VERSION } from '../engine/migration';
import {
  isValidSavePin,
  summarizeSaveStateForPreview,
  type SavePreviewSummary,
} from '../engine/saveExport';
import { useGameStore } from './useGameStore';

export const CLOUD_SAVE_LINK_STORAGE_KEY = 'dreamAce.cloudSave.link.v1';
export const CLOUD_AUTOSAVE_MIN_INTERVAL_MS = 30_000;
export const CLOUD_OFFLINE_RETRY_INTERVAL_MS = 30_000;

export type CloudSyncStatus = 'idle' | 'synced' | 'saving' | 'offline' | 'conflict';

export interface CloudConflictState {
  remoteRev: number;
  remoteUpdatedAt: string | null;
  localUpdatedAt: string;
  localSummary: SavePreviewSummary;
  cloudSummary: SavePreviewSummary | null;
  cloudRawState: unknown | null;
  cloudSchemaVersion: number | null;
  cloudLoadError: string | null;
}

export interface PersistedCloudLink {
  saveId: string;
  pin: string;
  lastKnownRev: number;
  lastSyncedAt: string | null;
  rememberOnDevice: true;
}

export type CloudActionResult =
  | {
      ok: true;
      saveId?: string;
      rev?: number;
    }
  | {
      ok: false;
      conflict?: boolean;
      offline?: boolean;
      errorCode?: CloudSaveErrorCode | 'BATTLE_ACTIVE' | 'NOT_LINKED';
      message: string;
      foundVersion?: number;
      supportedVersion?: number;
    };

export interface CloudSaveStoreState {
  saveId: string | null;
  pin: string | null;
  lastKnownRev: number;
  lastSyncedAt: string | null;
  rememberOnDevice: boolean;
  status: CloudSyncStatus;
  lastError: string | null;
  pendingRetry: boolean;
  lastAutosaveAt: number | null;
  conflict: CloudConflictState | null;
  conflictModalOpen: boolean;

  isConfigured: () => boolean;
  createCloudSave: (
    pin: string,
    rememberOnDevice: boolean
  ) => Promise<CloudActionResult>;
  openRemoteSave: (
    saveIdInput: string,
    pin: string,
    rememberOnDevice: boolean
  ) => Promise<CloudActionResult>;
  syncNow: (opts?: { isAutosave?: boolean }) => Promise<CloudActionResult>;
  downloadLinkedSave: () => Promise<CloudActionResult>;
  resolveConflictKeepLocal: () => Promise<CloudActionResult>;
  resolveConflictUseCloud: () => Promise<CloudActionResult>;
  openConflictModal: () => void;
  closeConflictModal: () => void;
  disconnectCloud: () => CloudActionResult;
  setRememberOnDevice: (remember: boolean) => void;
  requestAutosave: () => void;
  retryOfflineSync: () => Promise<void>;
  resetCloudStoreForTests: () => void;
}

let adapterOverride: CloudStoreAdapter | undefined;
let trailingAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
let offlineRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTrailingAutosave = false;

export function setCloudStoreAdapterForTests(
  adapter: CloudStoreAdapter | undefined
): void {
  adapterOverride = adapter;
}

export function getActiveCloudAdapter(): CloudStoreAdapter {
  return adapterOverride ?? getDefaultCloudStore();
}

function clearAutosaveTimers(): void {
  if (trailingAutosaveTimer !== null) {
    clearTimeout(trailingAutosaveTimer);
    trailingAutosaveTimer = null;
  }
  if (offlineRetryTimer !== null) {
    clearTimeout(offlineRetryTimer);
    offlineRetryTimer = null;
  }
  pendingTrailingAutosave = false;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isGameBattleActive(): boolean {
  const gs = useGameStore.getState();
  return gs.screen === 'BATTLE' && Boolean(gs.battle && !gs.battle.summary);
}

function readPersistedCloudLink(): PersistedCloudLink | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CLOUD_SAVE_LINK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCloudLink>;
    if (
      typeof parsed.saveId !== 'string' ||
      typeof parsed.pin !== 'string' ||
      !isValidSavePin(parsed.pin)
    ) {
      return null;
    }
    const formatted = formatSaveId(parsed.saveId);
    if (!formatted) return null;
    const rev =
      typeof parsed.lastKnownRev === 'number' &&
      Number.isInteger(parsed.lastKnownRev) &&
      parsed.lastKnownRev >= 0
        ? parsed.lastKnownRev
        : 0;
    return {
      saveId: formatted,
      pin: parsed.pin,
      lastKnownRev: rev,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      rememberOnDevice: true,
    };
  } catch {
    return null;
  }
}

function writePersistedCloudLink(link: PersistedCloudLink | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!link) {
      localStorage.removeItem(CLOUD_SAVE_LINK_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CLOUD_SAVE_LINK_STORAGE_KEY, JSON.stringify(link));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

function persistIfRemembered(state: {
  saveId: string | null;
  pin: string | null;
  lastKnownRev: number;
  lastSyncedAt: string | null;
  rememberOnDevice: boolean;
}): void {
  if (state.rememberOnDevice && state.saveId && state.pin) {
    writePersistedCloudLink({
      saveId: state.saveId,
      pin: state.pin,
      lastKnownRev: state.lastKnownRev,
      lastSyncedAt: state.lastSyncedAt,
      rememberOnDevice: true,
    });
  } else {
    writePersistedCloudLink(null);
  }
}

function scheduleOfflineRetry(retryFn: () => Promise<void>): void {
  if (offlineRetryTimer !== null) return;
  offlineRetryTimer = setTimeout(() => {
    offlineRetryTimer = null;
    void retryFn();
  }, CLOUD_OFFLINE_RETRY_INTERVAL_MS);
}

const initialPersisted = readPersistedCloudLink();

export const useCloudSaveStore = create<CloudSaveStoreState>((set, get) => ({
  saveId: initialPersisted?.saveId ?? null,
  pin: initialPersisted?.pin ?? null,
  lastKnownRev: initialPersisted?.lastKnownRev ?? 0,
  lastSyncedAt: initialPersisted?.lastSyncedAt ?? null,
  rememberOnDevice: initialPersisted ? true : false,
  status: initialPersisted ? 'synced' : 'idle',
  lastError: null,
  pendingRetry: false,
  lastAutosaveAt: null,
  conflict: null,
  conflictModalOpen: false,

  isConfigured: () => isCloudConfigured(getActiveCloudAdapter()),

  createCloudSave: async (pin, rememberOnDevice) => {
    const adapter = getActiveCloudAdapter();
    if (!isCloudConfigured(adapter)) {
      return {
        ok: false,
        errorCode: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    const trimmedPin = pin.trim();
    if (!isValidSavePin(trimmedPin)) {
      return {
        ok: false,
        errorCode: 'INVALID_PIN',
        message: 'PIN must be 4 to 8 numeric digits.',
      };
    }

    if (isBrowserOffline()) {
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: 'Offline',
      };
    }

    set({ status: 'saving', lastError: null });
    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const newSaveId = generateSaveId();

    const res = await uploadCloudSave({
      saveId: newSaveId,
      pin: trimmedPin,
      state: snapshot,
      lastKnownRev: 0,
      adapter,
    });

    if (!res.ok) {
      set({ status: get().saveId ? 'synced' : 'idle' });
      if (res.conflict) {
        return {
          ok: false,
          conflict: true,
          message: 'Save ID collision; please retry.',
        };
      }
      return {
        ok: false,
        offline: res.error.code === 'STORE_ERROR',
        errorCode: res.error.code,
        message: res.error.message,
      };
    }

    const nextSyncedAt = res.updatedAt ?? new Date().toISOString();
    const nextLink = {
      saveId: res.saveId,
      pin: trimmedPin,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
      rememberOnDevice,
    };
    persistIfRemembered(nextLink);
    clearAutosaveTimers();
    set({
      ...nextLink,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
    });

    return { ok: true, saveId: res.saveId, rev: res.rev };
  },

  openRemoteSave: async (saveIdInput, pin, rememberOnDevice) => {
    if (isGameBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }

    const adapter = getActiveCloudAdapter();
    if (!isCloudConfigured(adapter)) {
      return {
        ok: false,
        errorCode: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    if (isBrowserOffline()) {
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: 'Offline',
      };
    }

    const trimmedPin = pin.trim();
    const res = await downloadCloudSave({
      saveId: saveIdInput,
      pin: trimmedPin,
      adapter,
    });

    if (!res.ok) {
      return {
        ok: false,
        offline: res.error.code === 'STORE_ERROR',
        errorCode: res.error.code,
        message: res.error.message,
        foundVersion: res.error.foundVersion,
        supportedVersion: res.error.supportedVersion,
      };
    }

    const importRes = useGameStore
      .getState()
      .importSaveFromEnvelope(res.rawState, res.schemaVersion);
    if (!importRes.ok) {
      return {
        ok: false,
        errorCode:
          importRes.code === 'BATTLE_ACTIVE'
            ? 'BATTLE_ACTIVE'
            : importRes.code === 'VERSION_TOO_NEW'
              ? 'VERSION_TOO_NEW'
              : 'CORRUPT',
        message: importRes.error,
      };
    }

    const nextSyncedAt = res.updatedAt ?? res.clientUpdatedAt ?? new Date().toISOString();
    const nextLink = {
      saveId: res.saveId,
      pin: trimmedPin,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
      rememberOnDevice,
    };
    persistIfRemembered(nextLink);
    clearAutosaveTimers();
    set({
      ...nextLink,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
    });

    return { ok: true, saveId: res.saveId, rev: res.rev };
  },

  syncNow: async (opts) => {
    const state = get();
    const adapter = getActiveCloudAdapter();
    if (!state.saveId || !state.pin) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No cloud save linked.',
      };
    }
    if (!isCloudConfigured(adapter)) {
      return {
        ok: false,
        errorCode: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    if (isBrowserOffline()) {
      set({
        status: 'offline',
        pendingRetry: true,
        lastError: null,
      });
      scheduleOfflineRetry(() => get().retryOfflineSync());
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: 'Offline',
      };
    }

    const saveId = state.saveId;
    const pin = state.pin;
    const expectedRev = state.lastKnownRev;

    set({ status: 'saving', lastError: null });

    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const localUpdatedAt = new Date().toISOString();
    const res = await uploadCloudSave({
      saveId,
      pin,
      state: snapshot,
      lastKnownRev: expectedRev,
      clientUpdatedAt: localUpdatedAt,
      adapter,
    });

    // Guard against disconnect while upload was in flight
    if (get().saveId !== saveId) {
      return { ok: false, errorCode: 'NOT_LINKED', message: 'Disconnected' };
    }

    if (res.ok) {
      const nextSyncedAt = res.updatedAt ?? localUpdatedAt;
      const nowMs = Date.now();
      const updated = {
        saveId,
        pin,
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
        rememberOnDevice: get().rememberOnDevice,
      };
      persistIfRemembered(updated);
      if (offlineRetryTimer !== null) {
        clearTimeout(offlineRetryTimer);
        offlineRetryTimer = null;
      }
      set({
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
        status: 'synced',
        lastError: null,
        pendingRetry: false,
        lastAutosaveAt: nowMs,
        conflict: null,
        conflictModalOpen: false,
      });

      if (pendingTrailingAutosave) {
        pendingTrailingAutosave = false;
        get().requestAutosave();
      }
      return { ok: true, saveId: res.saveId, rev: res.rev };
    }

    if (res.conflict) {
      // Fetch remote save preview so Conflict Dialog shows both timestamps & summaries (level, credits, gears)
      const localSummary = summarizeSaveStateForPreview(
        snapshot,
        CURRENT_SAVE_VERSION
      );
      const remoteDownload = await downloadCloudSave({
        saveId,
        pin,
        adapter,
      });

      const conflictState: CloudConflictState = {
        remoteRev: res.remoteRev,
        remoteUpdatedAt: remoteDownload.ok
          ? (remoteDownload.updatedAt ?? res.remoteUpdatedAt)
          : res.remoteUpdatedAt,
        localUpdatedAt,
        localSummary,
        cloudSummary: remoteDownload.ok ? remoteDownload.preview : null,
        cloudRawState: remoteDownload.ok ? remoteDownload.rawState : null,
        cloudSchemaVersion: remoteDownload.ok ? remoteDownload.schemaVersion : null,
        cloudLoadError: remoteDownload.ok ? null : remoteDownload.error.message,
      };

      pendingTrailingAutosave = false;
      set({
        status: 'conflict',
        pendingRetry: false,
        lastError: null,
        conflict: conflictState,
        conflictModalOpen: true,
      });

      return {
        ok: false,
        conflict: true,
        message: 'Conflict detected.',
      };
    }

    if (res.error.code === 'STORE_ERROR' || isBrowserOffline()) {
      set({
        status: 'offline',
        pendingRetry: true,
        lastError: null,
        ...(opts?.isAutosave ? { lastAutosaveAt: Date.now() } : {}),
      });
      scheduleOfflineRetry(() => get().retryOfflineSync());
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: res.error.message,
      };
    }

    set({
      status: 'synced',
      lastError: res.error.message,
    });
    return {
      ok: false,
      errorCode: res.error.code,
      message: res.error.message,
    };
  },

  downloadLinkedSave: async () => {
    if (isGameBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    const state = get();
    if (!state.saveId || !state.pin) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No cloud save linked.',
      };
    }
    return get().openRemoteSave(state.saveId, state.pin, state.rememberOnDevice);
  },

  resolveConflictKeepLocal: async () => {
    const state = get();
    if (!state.saveId || !state.pin || !state.conflict) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No active conflict to resolve.',
      };
    }

    const adapter = getActiveCloudAdapter();
    if (!isCloudConfigured(adapter)) {
      return {
        ok: false,
        errorCode: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    if (isBrowserOffline()) {
      set({ status: 'offline', pendingRetry: true });
      scheduleOfflineRetry(() => get().retryOfflineSync());
      return { ok: false, offline: true, errorCode: 'STORE_ERROR', message: 'Offline' };
    }

    set({ status: 'saving', lastError: null });
    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const localUpdatedAt = new Date().toISOString();

    const res = await uploadCloudSave({
      saveId: state.saveId,
      pin: state.pin,
      state: snapshot,
      lastKnownRev: state.conflict.remoteRev,
      clientUpdatedAt: localUpdatedAt,
      adapter,
    });

    if (res.ok) {
      const nextSyncedAt = res.updatedAt ?? localUpdatedAt;
      persistIfRemembered({
        saveId: state.saveId,
        pin: state.pin,
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
        rememberOnDevice: state.rememberOnDevice,
      });
      set({
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
        status: 'synced',
        lastError: null,
        pendingRetry: false,
        lastAutosaveAt: Date.now(),
        conflict: null,
        conflictModalOpen: false,
      });
      return { ok: true, saveId: res.saveId, rev: res.rev };
    }

    if (res.conflict) {
      // Another remote change occurred simultaneously -> refresh conflict state
      set({ lastKnownRev: state.conflict.remoteRev });
      return get().syncNow();
    }

    set({ status: 'conflict', lastError: res.error.message });
    return {
      ok: false,
      errorCode: res.error.code,
      message: res.error.message,
    };
  },

  resolveConflictUseCloud: async () => {
    if (isGameBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    const state = get();
    if (!state.saveId || !state.pin || !state.conflict) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No active conflict to resolve.',
      };
    }

    // Use already-decrypted cloud payload when available, otherwise re-fetch
    if (
      state.conflict.cloudRawState !== null &&
      typeof state.conflict.cloudSchemaVersion === 'number'
    ) {
      const importRes = useGameStore
        .getState()
        .importSaveFromEnvelope(
          state.conflict.cloudRawState,
          state.conflict.cloudSchemaVersion
        );
      if (!importRes.ok) {
        return {
          ok: false,
          errorCode:
            importRes.code === 'BATTLE_ACTIVE'
              ? 'BATTLE_ACTIVE'
              : importRes.code === 'VERSION_TOO_NEW'
                ? 'VERSION_TOO_NEW'
                : 'CORRUPT',
          message: importRes.error,
        };
      }
      const nextSyncedAt =
        state.conflict.remoteUpdatedAt ?? new Date().toISOString();
      persistIfRemembered({
        saveId: state.saveId,
        pin: state.pin,
        lastKnownRev: state.conflict.remoteRev,
        lastSyncedAt: nextSyncedAt,
        rememberOnDevice: state.rememberOnDevice,
      });
      set({
        lastKnownRev: state.conflict.remoteRev,
        lastSyncedAt: nextSyncedAt,
        status: 'synced',
        lastError: null,
        pendingRetry: false,
        lastAutosaveAt: Date.now(),
        conflict: null,
        conflictModalOpen: false,
      });
      return { ok: true, saveId: state.saveId, rev: state.conflict.remoteRev };
    }

    return get().downloadLinkedSave();
  },

  openConflictModal: () => {
    if (get().conflict) {
      set({ conflictModalOpen: true });
    }
  },

  closeConflictModal: () => {
    set({ conflictModalOpen: false });
  },

  disconnectCloud: () => {
    if (isGameBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    clearAutosaveTimers();
    writePersistedCloudLink(null);
    set({
      saveId: null,
      pin: null,
      lastKnownRev: 0,
      lastSyncedAt: null,
      rememberOnDevice: false,
      status: 'idle',
      lastError: null,
      pendingRetry: false,
      lastAutosaveAt: null,
      conflict: null,
      conflictModalOpen: false,
    });
    return { ok: true };
  },

  setRememberOnDevice: (remember) => {
    const state = get();
    set({ rememberOnDevice: remember });
    persistIfRemembered({
      saveId: state.saveId,
      pin: state.pin,
      lastKnownRev: state.lastKnownRev,
      lastSyncedAt: state.lastSyncedAt,
      rememberOnDevice: remember,
    });
  },

  requestAutosave: () => {
    const state = get();
    if (!state.saveId || !state.pin) return;
    if (!isCloudConfigured(getActiveCloudAdapter())) return;
    if (state.status === 'conflict') return;

    if (state.status === 'saving') {
      pendingTrailingAutosave = true;
      return;
    }

    if (isBrowserOffline()) {
      set({ status: 'offline', pendingRetry: true });
      scheduleOfflineRetry(() => get().retryOfflineSync());
      return;
    }

    const now = Date.now();
    const lastAt = state.lastAutosaveAt;
    if (lastAt === null || now - lastAt >= CLOUD_AUTOSAVE_MIN_INTERVAL_MS) {
      if (trailingAutosaveTimer !== null) {
        clearTimeout(trailingAutosaveTimer);
        trailingAutosaveTimer = null;
      }
      pendingTrailingAutosave = false;
      void get().syncNow({ isAutosave: true });
      return;
    }

    const waitMs = Math.max(50, CLOUD_AUTOSAVE_MIN_INTERVAL_MS - (now - lastAt));
    if (trailingAutosaveTimer === null) {
      trailingAutosaveTimer = setTimeout(() => {
        trailingAutosaveTimer = null;
        const latest = get();
        if (latest.saveId && latest.pin && latest.status !== 'conflict') {
          void latest.syncNow({ isAutosave: true });
        }
      }, waitMs);
    }
  },

  retryOfflineSync: async () => {
    const state = get();
    if (!state.saveId || !state.pin) return;
    if (!state.pendingRetry && state.status !== 'offline') return;
    if (state.status === 'saving' || state.status === 'conflict') return;

    if (isBrowserOffline()) {
      scheduleOfflineRetry(() => get().retryOfflineSync());
      return;
    }

    await get().syncNow({ isAutosave: true });
  },

  resetCloudStoreForTests: () => {
    clearAutosaveTimers();
    writePersistedCloudLink(null);
    set({
      saveId: null,
      pin: null,
      lastKnownRev: 0,
      lastSyncedAt: null,
      rememberOnDevice: false,
      status: 'idle',
      lastError: null,
      pendingRetry: false,
      lastAutosaveAt: null,
      conflict: null,
      conflictModalOpen: false,
    });
  },
}));

/**
 * Installs listeners for:
 * 1) Autosave after every battle finishes (battle.summary transitions null -> defined)
 * 2) Autosave when an auto-repeat loop ends (autoRepeatSession.active transitions true -> false/null)
 * 3) Automatic retry when the browser regains connectivity (`window` 'online' event)
 */
export function attachCloudAutosaveListeners(): () => void {
  const unsubGame = useGameStore.subscribe((next, prev) => {
    const battleJustFinished =
      !prev.battle?.summary && Boolean(next.battle?.summary);
    const loopJustEnded =
      Boolean(prev.autoRepeatSession?.active) && !next.autoRepeatSession?.active;

    if (battleJustFinished || loopJustEnded) {
      useCloudSaveStore.getState().requestAutosave();
    }
  });

  const onOnline = () => {
    const cloud = useCloudSaveStore.getState();
    if (cloud.saveId && (cloud.pendingRetry || cloud.status === 'offline')) {
      void cloud.retryOfflineSync();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }

  return () => {
    unsubGame();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
    clearAutosaveTimers();
  };
}
