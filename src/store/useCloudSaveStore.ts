import { create } from 'zustand';
import {
  deriveCloudCredentialsForExistingSave,
  deriveCloudCredentialsForNewSave,
  downloadCloudSaveWithKey,
  formatSaveId,
  generateSaveId,
  uploadCloudSaveWithKey,
  type CloudDerivedCredentials,
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
import { isBattleActive, useGameStore } from './useGameStore';

/** Legacy key from SV1b-2 that could contain plaintext PINs — migrated & purged on startup. */
export const LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY = 'dreamAce.cloudSave.link.v1';
/** Safe metadata-only localStorage key holding ONLY { saveId, lastKnownRev, lastSyncedAt }. */
export const CLOUD_SAVE_META_STORAGE_KEY = 'dreamAce.cloud.v1';

export const CLOUD_KEY_IDB_NAME = 'dreamAce.cloud.keys.v1';
export const CLOUD_KEY_IDB_STORE = 'keys';
export const CLOUD_KEY_IDB_RECORD_ID = 'active';

export const CLOUD_AUTOSAVE_MIN_INTERVAL_MS = 30_000;
export const CLOUD_OFFLINE_BACKOFF_MS = [30_000, 120_000, 300_000] as const;

export type CloudSyncStatus =
  | 'idle'
  | 'needs_pin'
  | 'synced'
  | 'saving'
  | 'offline'
  | 'conflict';

export type CloudOverwriteSource =
  | 'open_remote'
  | 'download_linked'
  | 'conflict_use_cloud';

export interface PersistedCloudMeta {
  saveId: string;
  lastKnownRev: number;
  lastSyncedAt: string | null;
}

export interface StoredCloudKeyRecord {
  saveId: string;
  key: CryptoKey;
  verifier: string;
  salt: string;
}

export interface CloudKeyStorage {
  get(): Promise<StoredCloudKeyRecord | null>;
  set(record: StoredCloudKeyRecord): Promise<void>;
  clear(): Promise<void>;
}

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

export interface PendingCloudOverwrite {
  source: CloudOverwriteSource;
  saveId: string;
  rev: number;
  updatedAt: string | null;
  rawState: unknown;
  schemaVersion: number;
  preview: SavePreviewSummary;
  credentials: CloudDerivedCredentials;
  rememberOnDevice: boolean;
}

export type CloudActionResult =
  | {
      ok: true;
      saveId?: string;
      rev?: number;
      needsOverwriteConfirm?: boolean;
    }
  | {
      ok: false;
      conflict?: boolean;
      offline?: boolean;
      deferred?: boolean;
      errorCode?:
        | CloudSaveErrorCode
        | 'BATTLE_ACTIVE'
        | 'NOT_LINKED'
        | 'NEEDS_PIN';
      message: string;
      foundVersion?: number;
      supportedVersion?: number;
    };

export interface CloudSaveStoreState {
  saveId: string | null;
  /** Non-extractable AES-GCM CryptoKey + verifier + salt kept in memory only (or IndexedDB if rememberOnDevice=true). Raw PIN is NEVER stored. */
  credentials: CloudDerivedCredentials | null;
  lastKnownRev: number;
  lastSyncedAt: string | null;
  rememberOnDevice: boolean;
  status: CloudSyncStatus;
  lastError: string | null;
  pendingRetry: boolean;
  offlineRetryAttempt: number;
  deferredUploadPending: boolean;
  pendingSyncAfterUnlock: boolean;
  pendingUnlockAction: 'sync' | 'download' | null;
  lastAutosaveAt: number | null;
  conflict: CloudConflictState | null;
  conflictModalOpen: boolean;
  pinUnlockModalOpen: boolean;
  pendingOverwrite: PendingCloudOverwrite | null;

  isConfigured: () => boolean;
  hydrateCloudSession: (opts?: { force?: boolean }) => Promise<void>;
  createCloudSave: (
    pin: string,
    rememberOnDevice: boolean
  ) => Promise<CloudActionResult>;
  openRemoteSave: (
    saveIdInput: string,
    pin: string,
    rememberOnDevice: boolean
  ) => Promise<CloudActionResult>;
  unlockWithPin: (
    pin: string,
    rememberOnDevice: boolean
  ) => Promise<CloudActionResult>;
  syncNow: (opts?: { isAutosave?: boolean }) => Promise<CloudActionResult>;
  downloadLinkedSave: () => Promise<CloudActionResult>;
  resolveConflictKeepLocal: () => Promise<CloudActionResult>;
  resolveConflictUseCloud: () => Promise<CloudActionResult>;
  confirmPendingOverwrite: () => Promise<CloudActionResult>;
  cancelPendingOverwrite: () => void;
  openConflictModal: () => void;
  closeConflictModal: () => void;
  openPinUnlockModal: (action?: 'sync' | 'download' | null) => void;
  closePinUnlockModal: () => void;
  disconnectCloud: () => Promise<CloudActionResult>;
  setRememberOnDevice: (remember: boolean) => Promise<void>;
  requestAutosave: () => void;
  retryOfflineSync: (opts?: { immediate?: boolean }) => Promise<void>;
  flushDeferredUploadsIfReady: () => void;
  resetCloudStoreForTests: () => void;
}

class IndexedDbCloudKeyStorage implements CloudKeyStorage {
  private openDb(): Promise<IDBDatabase | null> {
    if (typeof globalThis.indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        const req = globalThis.indexedDB.open(CLOUD_KEY_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(CLOUD_KEY_IDB_STORE)) {
            db.createObjectStore(CLOUD_KEY_IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async get(): Promise<StoredCloudKeyRecord | null> {
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CLOUD_KEY_IDB_STORE, 'readonly');
        const store = tx.objectStore(CLOUD_KEY_IDB_STORE);
        const req = store.get(CLOUD_KEY_IDB_RECORD_ID);
        req.onsuccess = () => {
          const val = req.result as Partial<StoredCloudKeyRecord> | undefined;
          db.close();
          if (
            val &&
            typeof val.saveId === 'string' &&
            typeof val.verifier === 'string' &&
            typeof val.salt === 'string' &&
            val.key
          ) {
            resolve({
              saveId: val.saveId,
              key: val.key,
              verifier: val.verifier,
              salt: val.salt,
            });
            return;
          }
          resolve(null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve(null);
      }
    });
  }

  async set(record: StoredCloudKeyRecord): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(CLOUD_KEY_IDB_STORE, 'readwrite');
        const store = tx.objectStore(CLOUD_KEY_IDB_STORE);
        // Store strictly { saveId, key, verifier, salt } — never PIN
        store.put(
          {
            saveId: record.saveId,
            key: record.key,
            verifier: record.verifier,
            salt: record.salt,
          },
          CLOUD_KEY_IDB_RECORD_ID
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve();
      }
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(CLOUD_KEY_IDB_STORE, 'readwrite');
        const store = tx.objectStore(CLOUD_KEY_IDB_STORE);
        store.delete(CLOUD_KEY_IDB_RECORD_ID);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve();
      }
    });
  }
}

const defaultKeyStorage: CloudKeyStorage = new IndexedDbCloudKeyStorage();
let keyStorageOverride: CloudKeyStorage | undefined;
let adapterOverride: CloudStoreAdapter | undefined;

let trailingAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
let offlineRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTrailingAutosave = false;

export function setCloudStoreAdapterForTests(
  adapter: CloudStoreAdapter | undefined
): void {
  adapterOverride = adapter;
}

export function setCloudKeyStorageForTests(
  storage: CloudKeyStorage | undefined
): void {
  keyStorageOverride = storage;
}

export function getActiveCloudAdapter(): CloudStoreAdapter {
  return adapterOverride ?? getDefaultCloudStore();
}

export function getActiveKeyStorage(): CloudKeyStorage {
  return keyStorageOverride ?? defaultKeyStorage;
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

function parseMetaCandidate(raw: string | null): PersistedCloudMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCloudMeta>;
    if (typeof parsed.saveId !== 'string') return null;
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
      lastKnownRev: rev,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Writes ONLY { saveId, lastKnownRev, lastSyncedAt } to dreamAce.cloud.v1.
 * Never writes PIN or cryptographic keys to localStorage.
 */
function writeCloudMeta(meta: PersistedCloudMeta | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!meta) {
      localStorage.removeItem(CLOUD_SAVE_META_STORAGE_KEY);
      return;
    }
    const safePayload: PersistedCloudMeta = {
      saveId: meta.saveId,
      lastKnownRev: meta.lastKnownRev,
      lastSyncedAt: meta.lastSyncedAt,
    };
    localStorage.setItem(CLOUD_SAVE_META_STORAGE_KEY, JSON.stringify(safePayload));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

/**
 * Migrates safe metadata (saveId, lastKnownRev, lastSyncedAt) from legacy key
 * `dreamAce.cloudSave.link.v1` -> `dreamAce.cloud.v1` and unconditionally deletes
 * the legacy key (which may have held plaintext PINs).
 */
export function migrateAndReadCloudMeta(): PersistedCloudMeta | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const legacyRaw = localStorage.getItem(LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY);
    const currentRaw = localStorage.getItem(CLOUD_SAVE_META_STORAGE_KEY);
    let currentMeta = parseMetaCandidate(currentRaw);

    if (legacyRaw !== null) {
      if (!currentMeta) {
        const migrated = parseMetaCandidate(legacyRaw);
        if (migrated) {
          writeCloudMeta(migrated);
          currentMeta = migrated;
        }
      }
      // ALWAYS delete legacy key unconditionally so plaintext PINs are purged
      localStorage.removeItem(LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY);
    }

    return currentMeta;
  } catch {
    return null;
  }
}

async function syncKeyPersistence(
  saveId: string | null,
  credentials: CloudDerivedCredentials | null,
  rememberOnDevice: boolean
): Promise<void> {
  const storage = getActiveKeyStorage();
  if (rememberOnDevice && saveId && credentials) {
    await storage.set({
      saveId,
      key: credentials.key,
      verifier: credentials.verifier,
      salt: credentials.salt,
    });
  } else {
    await storage.clear();
  }
}

function getNextBackoffDelayMs(attempt: number): number {
  const idx = Math.min(Math.max(0, attempt), CLOUD_OFFLINE_BACKOFF_MS.length - 1);
  return CLOUD_OFFLINE_BACKOFF_MS[idx];
}

function scheduleOfflineRetry(
  attempt: number,
  retryFn: () => Promise<void>
): number {
  if (offlineRetryTimer !== null) {
    clearTimeout(offlineRetryTimer);
    offlineRetryTimer = null;
  }
  const delayMs = getNextBackoffDelayMs(attempt);
  offlineRetryTimer = setTimeout(() => {
    offlineRetryTimer = null;
    void retryFn();
  }, delayMs);
  return attempt + 1;
}

const initialMeta = migrateAndReadCloudMeta();

export const useCloudSaveStore = create<CloudSaveStoreState>((set, get) => ({
  saveId: initialMeta?.saveId ?? null,
  credentials: null,
  lastKnownRev: initialMeta?.lastKnownRev ?? 0,
  lastSyncedAt: initialMeta?.lastSyncedAt ?? null,
  rememberOnDevice: false,
  status: initialMeta ? 'needs_pin' : 'idle',
  lastError: null,
  pendingRetry: false,
  offlineRetryAttempt: 0,
  deferredUploadPending: false,
  pendingSyncAfterUnlock: false,
  pendingUnlockAction: null,
  lastAutosaveAt: null,
  conflict: null,
  conflictModalOpen: false,
  pinUnlockModalOpen: false,
  pendingOverwrite: null,

  isConfigured: () => isCloudConfigured(getActiveCloudAdapter()),

  hydrateCloudSession: async (opts) => {
    const meta = migrateAndReadCloudMeta();
    if (!meta) {
      set({
        saveId: null,
        credentials: null,
        lastKnownRev: 0,
        lastSyncedAt: null,
        rememberOnDevice: false,
        status: 'idle',
        pinUnlockModalOpen: false,
      });
      return;
    }

    // Preserve an already-unlocked in-memory session unless force-hydrating (e.g. simulating reload)
    const current = get();
    if (!opts?.force && current.credentials && current.saveId === meta.saveId) {
      return;
    }

    const storedRecord = await getActiveKeyStorage().get();
    if (storedRecord && storedRecord.saveId === meta.saveId && storedRecord.key) {
      set({
        saveId: meta.saveId,
        credentials: {
          key: storedRecord.key,
          verifier: storedRecord.verifier,
          salt: storedRecord.salt,
        },
        lastKnownRev: meta.lastKnownRev,
        lastSyncedAt: meta.lastSyncedAt,
        rememberOnDevice: true,
        status: 'synced',
        pinUnlockModalOpen: false,
      });
      return;
    }

    // Linked Save ID exists in localStorage, but no key in IndexedDB -> ask PIN once
    set({
      saveId: meta.saveId,
      credentials: null,
      lastKnownRev: meta.lastKnownRev,
      lastSyncedAt: meta.lastSyncedAt,
      rememberOnDevice: false,
      status: 'needs_pin',
      pinUnlockModalOpen: !isBattleActive(),
    });
  },

  createCloudSave: async (pin, rememberOnDevice) => {
    if (isBattleActive()) {
      return {
        ok: false,
        deferred: true,
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
    let derived: CloudDerivedCredentials;
    try {
      derived = await deriveCloudCredentialsForNewSave(trimmedPin);
    } catch {
      set({ status: get().saveId ? 'synced' : 'idle' });
      return {
        ok: false,
        errorCode: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required.',
      };
    }

    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const newSaveId = generateSaveId();

    const res = await uploadCloudSaveWithKey({
      saveId: newSaveId,
      credentials: derived,
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
    // Always write safe metadata { saveId, lastKnownRev, lastSyncedAt } (never PIN)
    writeCloudMeta({
      saveId: res.saveId,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
    });
    // Store non-extractable CryptoKey + verifier + salt in IndexedDB ONLY if rememberOnDevice=true
    await syncKeyPersistence(res.saveId, derived, rememberOnDevice);
    clearAutosaveTimers();
    set({
      saveId: res.saveId,
      credentials: derived,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
      rememberOnDevice,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      deferredUploadPending: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
      pinUnlockModalOpen: false,
      pendingOverwrite: null,
    });

    return { ok: true, saveId: res.saveId, rev: res.rev };
  },

  openRemoteSave: async (saveIdInput, pin, rememberOnDevice) => {
    if (isBattleActive()) {
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
    const verified = await deriveCloudCredentialsForExistingSave({
      saveId: saveIdInput,
      pin: trimmedPin,
      adapter,
    });
    if (!verified.ok) {
      return {
        ok: false,
        offline: verified.error.code === 'STORE_ERROR',
        errorCode: verified.error.code,
        message: verified.error.message,
      };
    }

    const res = await downloadCloudSaveWithKey({
      saveId: verified.saveId,
      credentials: verified.credentials,
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

    const nextSyncedAt =
      res.updatedAt ?? res.clientUpdatedAt ?? new Date().toISOString();

    // If a local save exists, ask "Ghi đè save trên máy?" before replacing
    if (useGameStore.getState().hasSaveData) {
      set({
        pendingOverwrite: {
          source: 'open_remote',
          saveId: res.saveId,
          rev: res.rev,
          updatedAt: nextSyncedAt,
          rawState: res.rawState,
          schemaVersion: res.schemaVersion,
          preview: res.preview,
          credentials: verified.credentials,
          rememberOnDevice,
        },
      });
      return {
        ok: true,
        saveId: res.saveId,
        rev: res.rev,
        needsOverwriteConfirm: true,
      };
    }

    // No local save exists -> apply directly
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

    writeCloudMeta({
      saveId: res.saveId,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
    });
    await syncKeyPersistence(res.saveId, verified.credentials, rememberOnDevice);
    clearAutosaveTimers();
    set({
      saveId: res.saveId,
      credentials: verified.credentials,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
      rememberOnDevice,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      deferredUploadPending: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
      pinUnlockModalOpen: false,
      pendingOverwrite: null,
    });

    return { ok: true, saveId: res.saveId, rev: res.rev };
  },

  unlockWithPin: async (pin, rememberOnDevice) => {
    const state = get();
    if (!state.saveId) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No cloud save linked.',
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

    const verified = await deriveCloudCredentialsForExistingSave({
      saveId: state.saveId,
      pin: pin.trim(),
      adapter,
    });

    if (!verified.ok) {
      return {
        ok: false,
        offline: verified.error.code === 'STORE_ERROR',
        errorCode: verified.error.code,
        message: verified.error.message,
      };
    }

    await syncKeyPersistence(state.saveId, verified.credentials, rememberOnDevice);
    const pendingAction = state.pendingUnlockAction;
    const shouldResumeSync =
      state.pendingSyncAfterUnlock ||
      state.deferredUploadPending ||
      pendingAction === 'sync';

    set({
      credentials: verified.credentials,
      rememberOnDevice,
      status: 'synced',
      lastError: null,
      pinUnlockModalOpen: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
    });

    if (pendingAction === 'download') {
      await get().downloadLinkedSave();
    } else if (shouldResumeSync) {
      if (isBattleActive()) {
        set({ deferredUploadPending: true });
      } else {
        await get().syncNow({ isAutosave: pendingAction !== 'sync' });
      }
    }

    return { ok: true, saveId: state.saveId };
  },

  syncNow: async (opts) => {
    const state = get();
    const adapter = getActiveCloudAdapter();
    if (!state.saveId) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No cloud save linked.',
      };
    }
    if (!state.credentials) {
      set({
        status: 'needs_pin',
        pendingSyncAfterUnlock: true,
        ...(opts?.isAutosave
          ? {}
          : { pinUnlockModalOpen: true, pendingUnlockAction: 'sync' as const }),
      });
      return {
        ok: false,
        errorCode: 'NEEDS_PIN',
        message: 'Cần nhập PIN',
      };
    }
    if (!isCloudConfigured(adapter)) {
      return {
        ok: false,
        errorCode: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    // Uploads must NEVER run during an active battle — defer until it ends
    if (isBattleActive()) {
      set({ deferredUploadPending: true });
      return {
        ok: false,
        deferred: true,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }

    if (isBrowserOffline()) {
      const nextAttempt = scheduleOfflineRetry(state.offlineRetryAttempt, () =>
        get().retryOfflineSync()
      );
      set({
        status: 'offline',
        pendingRetry: true,
        offlineRetryAttempt: nextAttempt,
        deferredUploadPending: false,
        lastError: null,
      });
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: 'Offline',
      };
    }

    const saveId = state.saveId;
    const credentials = state.credentials;
    const expectedRev = state.lastKnownRev;

    set({ status: 'saving', lastError: null, deferredUploadPending: false });

    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const localUpdatedAt = new Date().toISOString();
    const res = await uploadCloudSaveWithKey({
      saveId,
      credentials,
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
      writeCloudMeta({
        saveId,
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
      });
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
        offlineRetryAttempt: 0,
        deferredUploadPending: false,
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
      const localSummary = summarizeSaveStateForPreview(
        snapshot,
        CURRENT_SAVE_VERSION
      );
      const remoteDownload = await downloadCloudSaveWithKey({
        saveId,
        credentials,
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
        offlineRetryAttempt: 0,
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
      const nextAttempt = scheduleOfflineRetry(get().offlineRetryAttempt, () =>
        get().retryOfflineSync()
      );
      set({
        status: 'offline',
        pendingRetry: true,
        offlineRetryAttempt: nextAttempt,
        lastError: null,
        ...(opts?.isAutosave ? { lastAutosaveAt: Date.now() } : {}),
      });
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
    if (isBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    const state = get();
    if (!state.saveId) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No cloud save linked.',
      };
    }
    if (!state.credentials) {
      set({
        status: 'needs_pin',
        pinUnlockModalOpen: true,
        pendingUnlockAction: 'download',
      });
      return {
        ok: false,
        errorCode: 'NEEDS_PIN',
        message: 'Cần nhập PIN',
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

    const res = await downloadCloudSaveWithKey({
      saveId: state.saveId,
      credentials: state.credentials,
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

    const nextSyncedAt =
      res.updatedAt ?? res.clientUpdatedAt ?? new Date().toISOString();

    if (useGameStore.getState().hasSaveData) {
      set({
        pendingOverwrite: {
          source: 'download_linked',
          saveId: res.saveId,
          rev: res.rev,
          updatedAt: nextSyncedAt,
          rawState: res.rawState,
          schemaVersion: res.schemaVersion,
          preview: res.preview,
          credentials: state.credentials,
          rememberOnDevice: state.rememberOnDevice,
        },
      });
      return {
        ok: true,
        saveId: res.saveId,
        rev: res.rev,
        needsOverwriteConfirm: true,
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

    writeCloudMeta({
      saveId: res.saveId,
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
    });
    set({
      lastKnownRev: res.rev,
      lastSyncedAt: nextSyncedAt,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      conflict: null,
      conflictModalOpen: false,
      pendingOverwrite: null,
    });

    return { ok: true, saveId: res.saveId, rev: res.rev };
  },

  resolveConflictKeepLocal: async () => {
    if (isBattleActive()) {
      set({ deferredUploadPending: true });
      return {
        ok: false,
        deferred: true,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }

    const state = get();
    if (!state.saveId || !state.credentials || !state.conflict) {
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
      const nextAttempt = scheduleOfflineRetry(state.offlineRetryAttempt, () =>
        get().retryOfflineSync()
      );
      set({
        status: 'offline',
        pendingRetry: true,
        offlineRetryAttempt: nextAttempt,
      });
      return {
        ok: false,
        offline: true,
        errorCode: 'STORE_ERROR',
        message: 'Offline',
      };
    }

    set({ status: 'saving', lastError: null });
    const snapshot = useGameStore.getState().exportSaveStateSnapshot();
    const localUpdatedAt = new Date().toISOString();

    const res = await uploadCloudSaveWithKey({
      saveId: state.saveId,
      credentials: state.credentials,
      state: snapshot,
      lastKnownRev: state.conflict.remoteRev,
      clientUpdatedAt: localUpdatedAt,
      adapter,
    });

    if (res.ok) {
      const nextSyncedAt = res.updatedAt ?? localUpdatedAt;
      writeCloudMeta({
        saveId: state.saveId,
        lastKnownRev: res.rev,
        lastSyncedAt: nextSyncedAt,
      });
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
        offlineRetryAttempt: 0,
        deferredUploadPending: false,
        lastAutosaveAt: Date.now(),
        conflict: null,
        conflictModalOpen: false,
      });
      return { ok: true, saveId: res.saveId, rev: res.rev };
    }

    if (res.conflict) {
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
    if (isBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    const state = get();
    if (!state.saveId || !state.credentials || !state.conflict) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No active conflict to resolve.',
      };
    }

    let rawState = state.conflict.cloudRawState;
    let schemaVersion = state.conflict.cloudSchemaVersion;
    let preview = state.conflict.cloudSummary;
    let rev = state.conflict.remoteRev;
    let updatedAt = state.conflict.remoteUpdatedAt;

    if (rawState === null || typeof schemaVersion !== 'number' || !preview) {
      const fetched = await downloadCloudSaveWithKey({
        saveId: state.saveId,
        credentials: state.credentials,
        adapter: getActiveCloudAdapter(),
      });
      if (!fetched.ok) {
        return {
          ok: false,
          offline: fetched.error.code === 'STORE_ERROR',
          errorCode: fetched.error.code,
          message: fetched.error.message,
          foundVersion: fetched.error.foundVersion,
          supportedVersion: fetched.error.supportedVersion,
        };
      }
      rawState = fetched.rawState;
      schemaVersion = fetched.schemaVersion;
      preview = fetched.preview;
      rev = fetched.rev;
      updatedAt = fetched.updatedAt ?? fetched.clientUpdatedAt;
    }

    if (useGameStore.getState().hasSaveData) {
      set({
        pendingOverwrite: {
          source: 'conflict_use_cloud',
          saveId: state.saveId,
          rev,
          updatedAt: updatedAt ?? new Date().toISOString(),
          rawState,
          schemaVersion,
          preview,
          credentials: state.credentials,
          rememberOnDevice: state.rememberOnDevice,
        },
      });
      return {
        ok: true,
        saveId: state.saveId,
        rev,
        needsOverwriteConfirm: true,
      };
    }

    const importRes = useGameStore
      .getState()
      .importSaveFromEnvelope(rawState, schemaVersion);
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

    const nextSyncedAt = updatedAt ?? new Date().toISOString();
    writeCloudMeta({
      saveId: state.saveId,
      lastKnownRev: rev,
      lastSyncedAt: nextSyncedAt,
    });
    set({
      lastKnownRev: rev,
      lastSyncedAt: nextSyncedAt,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
      pendingOverwrite: null,
    });
    return { ok: true, saveId: state.saveId, rev };
  },

  confirmPendingOverwrite: async () => {
    if (isBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }

    const pending = get().pendingOverwrite;
    if (!pending) {
      return {
        ok: false,
        errorCode: 'NOT_LINKED',
        message: 'No pending cloud save to apply.',
      };
    }

    const importRes = useGameStore
      .getState()
      .importSaveFromEnvelope(pending.rawState, pending.schemaVersion);
    if (!importRes.ok) {
      set({ pendingOverwrite: null });
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

    const nextSyncedAt = pending.updatedAt ?? new Date().toISOString();
    writeCloudMeta({
      saveId: pending.saveId,
      lastKnownRev: pending.rev,
      lastSyncedAt: nextSyncedAt,
    });
    await syncKeyPersistence(
      pending.saveId,
      pending.credentials,
      pending.rememberOnDevice
    );
    clearAutosaveTimers();

    set({
      saveId: pending.saveId,
      credentials: pending.credentials,
      lastKnownRev: pending.rev,
      lastSyncedAt: nextSyncedAt,
      rememberOnDevice: pending.rememberOnDevice,
      status: 'synced',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      deferredUploadPending: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
      lastAutosaveAt: Date.now(),
      conflict: null,
      conflictModalOpen: false,
      pinUnlockModalOpen: false,
      pendingOverwrite: null,
    });

    return { ok: true, saveId: pending.saveId, rev: pending.rev };
  },

  cancelPendingOverwrite: () => {
    set({ pendingOverwrite: null });
  },

  openConflictModal: () => {
    if (get().conflict) {
      set({ conflictModalOpen: true });
    }
  },

  closeConflictModal: () => {
    set({ conflictModalOpen: false });
  },

  openPinUnlockModal: (action = null) => {
    if (get().saveId && !get().credentials) {
      set({
        pinUnlockModalOpen: true,
        pendingUnlockAction: action,
      });
    }
  },

  closePinUnlockModal: () => {
    set({
      pinUnlockModalOpen: false,
      pendingUnlockAction: null,
    });
  },

  disconnectCloud: async () => {
    if (isBattleActive()) {
      return {
        ok: false,
        errorCode: 'BATTLE_ACTIVE',
        message: 'Đang trong trận',
      };
    }
    clearAutosaveTimers();
    writeCloudMeta(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    await getActiveKeyStorage().clear();
    set({
      saveId: null,
      credentials: null,
      lastKnownRev: 0,
      lastSyncedAt: null,
      rememberOnDevice: false,
      status: 'idle',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      deferredUploadPending: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
      lastAutosaveAt: null,
      conflict: null,
      conflictModalOpen: false,
      pinUnlockModalOpen: false,
      pendingOverwrite: null,
    });
    return { ok: true };
  },

  setRememberOnDevice: async (remember) => {
    const state = get();
    set({ rememberOnDevice: remember });
    // Metadata in localStorage stays intact regardless of rememberOnDevice!
    if (state.saveId) {
      writeCloudMeta({
        saveId: state.saveId,
        lastKnownRev: state.lastKnownRev,
        lastSyncedAt: state.lastSyncedAt,
      });
    }
    // Only IndexedDB key storage is toggled
    await syncKeyPersistence(state.saveId, state.credentials, remember);
  },

  requestAutosave: () => {
    const state = get();
    if (!state.saveId) return;
    if (!isCloudConfigured(getActiveCloudAdapter())) return;
    if (state.status === 'conflict') return;

    // Pause autosave while locked ("Cần nhập PIN")
    if (!state.credentials || state.status === 'needs_pin') {
      set({ pendingSyncAfterUnlock: true });
      return;
    }

    // Never upload during an active battle — defer until battle ends
    if (isBattleActive()) {
      set({ deferredUploadPending: true });
      return;
    }

    if (state.status === 'saving') {
      pendingTrailingAutosave = true;
      return;
    }

    if (isBrowserOffline()) {
      const nextAttempt = scheduleOfflineRetry(state.offlineRetryAttempt, () =>
        get().retryOfflineSync()
      );
      set({
        status: 'offline',
        pendingRetry: true,
        offlineRetryAttempt: nextAttempt,
      });
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
        if (
          !latest.saveId ||
          !latest.credentials ||
          latest.status === 'conflict' ||
          latest.status === 'needs_pin'
        ) {
          return;
        }
        if (isBattleActive()) {
          set({ deferredUploadPending: true });
          return;
        }
        void latest.syncNow({ isAutosave: true });
      }, waitMs);
    }
  },

  retryOfflineSync: async (opts) => {
    const state = get();
    if (!state.saveId || !state.credentials) return;
    if (!state.pendingRetry && state.status !== 'offline') return;
    if (
      state.status === 'saving' ||
      state.status === 'conflict' ||
      state.status === 'needs_pin'
    ) {
      return;
    }

    if (opts?.immediate && offlineRetryTimer !== null) {
      clearTimeout(offlineRetryTimer);
      offlineRetryTimer = null;
    }

    if (isBattleActive()) {
      set({ deferredUploadPending: true });
      return;
    }

    if (isBrowserOffline()) {
      const nextAttempt = scheduleOfflineRetry(state.offlineRetryAttempt, () =>
        get().retryOfflineSync()
      );
      set({
        status: 'offline',
        pendingRetry: true,
        offlineRetryAttempt: nextAttempt,
      });
      return;
    }

    await get().syncNow({ isAutosave: true });
  },

  flushDeferredUploadsIfReady: () => {
    const state = get();
    if (isBattleActive()) return;
    if (!state.saveId || !state.credentials) return;
    if (state.status === 'conflict' || state.status === 'needs_pin') return;
    if (!state.deferredUploadPending) return;

    set({ deferredUploadPending: false });
    if (state.pendingRetry || state.status === 'offline') {
      void get().retryOfflineSync({ immediate: true });
    } else {
      get().requestAutosave();
    }
  },

  resetCloudStoreForTests: () => {
    clearAutosaveTimers();
    writeCloudMeta(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEGACY_CLOUD_SAVE_LINK_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    void getActiveKeyStorage().clear();
    set({
      saveId: null,
      credentials: null,
      lastKnownRev: 0,
      lastSyncedAt: null,
      rememberOnDevice: false,
      status: 'idle',
      lastError: null,
      pendingRetry: false,
      offlineRetryAttempt: 0,
      deferredUploadPending: false,
      pendingSyncAfterUnlock: false,
      pendingUnlockAction: null,
      lastAutosaveAt: null,
      conflict: null,
      conflictModalOpen: false,
      pinUnlockModalOpen: false,
      pendingOverwrite: null,
    });
  },
}));

/**
 * Installs listeners for:
 * 1) Startup hydration (migrates/purges legacy key, loads IndexedDB key or enters 'needs_pin')
 * 2) Autosave after every battle finishes & when an auto-repeat loop ends, plus flushing deferred uploads when leaving/ending battle
 * 3) Immediate retry when the browser regains connectivity (`window` 'online' event)
 */
export function attachCloudAutosaveListeners(): () => void {
  void useCloudSaveStore.getState().hydrateCloudSession();

  const unsubGame = useGameStore.subscribe((next, prev) => {
    const wasActive = isBattleActive(prev);
    const nowActive = isBattleActive(next);
    const battleJustFinished =
      !prev.battle?.summary && Boolean(next.battle?.summary);
    const loopJustEnded =
      Boolean(prev.autoRepeatSession?.active) && !next.autoRepeatSession?.active;

    if (wasActive && !nowActive) {
      const cloud = useCloudSaveStore.getState();
      if (cloud.deferredUploadPending) {
        cloud.flushDeferredUploadsIfReady();
        return;
      }
    }

    if (battleJustFinished || loopJustEnded) {
      useCloudSaveStore.getState().requestAutosave();
    }
  });

  const onOnline = () => {
    const cloud = useCloudSaveStore.getState();
    if (
      cloud.saveId &&
      cloud.credentials &&
      (cloud.pendingRetry || cloud.status === 'offline')
    ) {
      void cloud.retryOfflineSync({ immediate: true });
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
