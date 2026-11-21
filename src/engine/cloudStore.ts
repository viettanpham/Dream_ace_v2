import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  ensureAnonymousAuth,
  getFirebaseServices,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
} from '../lib/firebase';

export const CLOUD_SAVES_COLLECTION = 'saves';
export const CLOUD_CHUNKS_SUBCOLLECTION = 'chunks';

export interface CloudSaveDoc {
  schemaVersion: number;
  rev: number;
  updatedAt: unknown;
  clientUpdatedAt: string;
  verifier: string;
  salt: string;
  iv: string;
  payload: string;
  compressed: boolean;
  sizeBytes: number;
  gameVersion: string;
  chunkCount: number;
}

export interface CloudSaveChunkDoc {
  index: number;
  data: string;
  parentRev: number;
}

export interface CommitCloudSaveParams {
  saveId: string;
  expectedLastKnownRev: number;
  doc: Omit<CloudSaveDoc, 'updatedAt'>;
  chunks: CloudSaveChunkDoc[];
}

export type CommitCloudSaveResult =
  | {
      ok: true;
      rev: number;
      updatedAt: string | null;
    }
  | {
      ok: false;
      conflict: true;
      remoteRev: number;
      remoteUpdatedAt: string | null;
    }
  | {
      ok: false;
      conflict: false;
      code: 'VERIFIER_MISMATCH' | 'CLOUD_NOT_CONFIGURED' | 'STORE_ERROR';
      message: string;
    };

export interface CloudStoreAdapter {
  isConfigured(): boolean;
  getSave(saveId: string): Promise<CloudSaveDoc | null>;
  commitSave(params: CommitCloudSaveParams): Promise<CommitCloudSaveResult>;
  getChunks(saveId: string, chunkCount: number): Promise<CloudSaveChunkDoc[]>;
}

export function normalizeCloudTimestamp(
  updatedAt: unknown,
  fallbackIso?: string
): string | null {
  if (updatedAt instanceof Timestamp) {
    return updatedAt.toDate().toISOString();
  }
  if (
    updatedAt &&
    typeof updatedAt === 'object' &&
    'toDate' in updatedAt &&
    typeof (updatedAt as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const d = (updatedAt as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      // fall through
    }
  }
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) {
    return updatedAt.toISOString();
  }
  if (typeof updatedAt === 'string' && updatedAt.trim().length > 0) {
    return updatedAt;
  }
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
    return new Date(updatedAt).toISOString();
  }
  return typeof fallbackIso === 'string' && fallbackIso.trim().length > 0
    ? fallbackIso
    : null;
}

/**
 * Returns true when Firebase cloud save is configured and ready to initialize.
 * Never throws when config is missing or initialization fails.
 */
export function isCloudConfigured(adapter?: CloudStoreAdapter): boolean {
  try {
    if (adapter) {
      return Boolean(adapter.isConfigured());
    }
    return isFirebaseConfigured();
  } catch {
    return false;
  }
}

/**
 * Firestore-backed CloudStoreAdapter.
 * Calls signInAnonymously before the first request and commits parent + chunks in ONE transaction.
 */
export class FirestoreCloudStore implements CloudStoreAdapter {
  isConfigured(): boolean {
    return isFirebaseConfigured();
  }

  async getSave(saveId: string): Promise<CloudSaveDoc | null> {
    const services = getFirebaseServices();
    if (!services) return null;
    await ensureAnonymousAuth();

    const path = `${CLOUD_SAVES_COLLECTION}/${saveId}`;
    try {
      const snap = await getDoc(doc(services.db, CLOUD_SAVES_COLLECTION, saveId));
      if (!snap.exists()) return null;
      return snap.data() as CloudSaveDoc;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async commitSave(params: CommitCloudSaveParams): Promise<CommitCloudSaveResult> {
    const services = getFirebaseServices();
    if (!services) {
      return {
        ok: false,
        conflict: false,
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    await ensureAnonymousAuth();
    const { saveId, expectedLastKnownRev, doc: nextDoc, chunks } = params;
    const parentPath = `${CLOUD_SAVES_COLLECTION}/${saveId}`;

    try {
      return await runTransaction(services.db, async (tx) => {
        const parentRef = doc(services.db, CLOUD_SAVES_COLLECTION, saveId);
        const existingSnap = await tx.get(parentRef);

        if (!existingSnap.exists()) {
          if (expectedLastKnownRev > 0) {
            return {
              ok: false,
              conflict: true,
              remoteRev: 0,
              remoteUpdatedAt: null,
            } as const;
          }
          const createdRev = 1;
          tx.set(parentRef, {
            ...nextDoc,
            rev: createdRev,
            updatedAt: serverTimestamp(),
          });
          for (const chunk of chunks) {
            const chunkRef = doc(
              services.db,
              CLOUD_SAVES_COLLECTION,
              saveId,
              CLOUD_CHUNKS_SUBCOLLECTION,
              String(chunk.index)
            );
            tx.set(chunkRef, {
              index: chunk.index,
              data: chunk.data,
              parentRev: createdRev,
            });
          }
          return {
            ok: true,
            rev: createdRev,
            updatedAt: nextDoc.clientUpdatedAt,
          } as const;
        }

        const remote = existingSnap.data() as CloudSaveDoc;
        if (remote.rev > expectedLastKnownRev) {
          return {
            ok: false,
            conflict: true,
            remoteRev: remote.rev,
            remoteUpdatedAt: normalizeCloudTimestamp(
              remote.updatedAt,
              remote.clientUpdatedAt
            ),
          } as const;
        }

        if (remote.rev !== expectedLastKnownRev) {
          return {
            ok: false,
            conflict: true,
            remoteRev: remote.rev,
            remoteUpdatedAt: normalizeCloudTimestamp(
              remote.updatedAt,
              remote.clientUpdatedAt
            ),
          } as const;
        }

        if (remote.verifier !== nextDoc.verifier) {
          return {
            ok: false,
            conflict: false,
            code: 'VERIFIER_MISMATCH',
            message: 'Sai PIN',
          } as const;
        }

        const updatedRev = remote.rev + 1;
        tx.set(parentRef, {
          ...nextDoc,
          rev: updatedRev,
          updatedAt: serverTimestamp(),
        });
        for (const chunk of chunks) {
          const chunkRef = doc(
            services.db,
            CLOUD_SAVES_COLLECTION,
            saveId,
            CLOUD_CHUNKS_SUBCOLLECTION,
            String(chunk.index)
          );
          tx.set(chunkRef, {
            index: chunk.index,
            data: chunk.data,
            parentRev: updatedRev,
          });
        }

        return {
          ok: true,
          rev: updatedRev,
          updatedAt: nextDoc.clientUpdatedAt,
        } as const;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, parentPath);
    }
  }

  async getChunks(
    saveId: string,
    chunkCount: number
  ): Promise<CloudSaveChunkDoc[]> {
    const services = getFirebaseServices();
    if (!services || chunkCount <= 0) return [];
    await ensureAnonymousAuth();

    const results: CloudSaveChunkDoc[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const path = `${CLOUD_SAVES_COLLECTION}/${saveId}/${CLOUD_CHUNKS_SUBCOLLECTION}/${i}`;
      try {
        const chunkRef = doc(
          services.db,
          CLOUD_SAVES_COLLECTION,
          saveId,
          CLOUD_CHUNKS_SUBCOLLECTION,
          String(i)
        );
        const snap = await getDoc(chunkRef);
        if (snap.exists()) {
          results.push(snap.data() as CloudSaveChunkDoc);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
    return results;
  }
}

export interface InMemoryCloudStoreOptions {
  configured?: boolean;
  now?: () => string;
}

/**
 * In-memory CloudStoreAdapter mock for Vitest unit tests (zero network traffic).
 * Mirrors Firestore transaction semantics including atomic parent+chunk writes,
 * optimistic revision locking, and verifier immutability.
 */
export class InMemoryCloudStore implements CloudStoreAdapter {
  private readonly saves = new Map<string, CloudSaveDoc>();
  private readonly chunks = new Map<string, Map<number, CloudSaveChunkDoc>>();
  private configured: boolean;
  private readonly now: () => string;
  public transactionCount = 0;

  constructor(options: InMemoryCloudStoreOptions = {}) {
    this.configured = options.configured ?? true;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  setConfigured(configured: boolean): void {
    this.configured = configured;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  seedRawSave(
    saveId: string,
    saveDoc: CloudSaveDoc,
    saveChunks: CloudSaveChunkDoc[] = []
  ): void {
    this.saves.set(saveId, structuredClone(saveDoc));
    const map = new Map<number, CloudSaveChunkDoc>();
    for (const c of saveChunks) {
      map.set(c.index, structuredClone(c));
    }
    this.chunks.set(saveId, map);
  }

  async getSave(saveId: string): Promise<CloudSaveDoc | null> {
    if (!this.configured) return null;
    const found = this.saves.get(saveId);
    return found ? structuredClone(found) : null;
  }

  async commitSave(params: CommitCloudSaveParams): Promise<CommitCloudSaveResult> {
    if (!this.configured) {
      return {
        ok: false,
        conflict: false,
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      };
    }

    const { saveId, expectedLastKnownRev, doc: nextDoc, chunks } = params;
    const remote = this.saves.get(saveId);

    if (!remote) {
      if (expectedLastKnownRev > 0) {
        return {
          ok: false,
          conflict: true,
          remoteRev: 0,
          remoteUpdatedAt: null,
        };
      }
      const serverIso = this.now();
      const createdRev = 1;
      const storedParent: CloudSaveDoc = {
        ...structuredClone(nextDoc),
        rev: createdRev,
        updatedAt: serverIso,
      };
      const chunkMap = new Map<number, CloudSaveChunkDoc>();
      for (const c of chunks) {
        chunkMap.set(c.index, {
          index: c.index,
          data: c.data,
          parentRev: createdRev,
        });
      }
      this.saves.set(saveId, storedParent);
      this.chunks.set(saveId, chunkMap);
      this.transactionCount += 1;
      return {
        ok: true,
        rev: createdRev,
        updatedAt: serverIso,
      };
    }

    if (remote.rev !== expectedLastKnownRev) {
      return {
        ok: false,
        conflict: true,
        remoteRev: remote.rev,
        remoteUpdatedAt: normalizeCloudTimestamp(
          remote.updatedAt,
          remote.clientUpdatedAt
        ),
      };
    }

    if (remote.verifier !== nextDoc.verifier) {
      return {
        ok: false,
        conflict: false,
        code: 'VERIFIER_MISMATCH',
        message: 'Sai PIN',
      };
    }

    const serverIso = this.now();
    const updatedRev = remote.rev + 1;
    const storedParent: CloudSaveDoc = {
      ...structuredClone(nextDoc),
      rev: updatedRev,
      updatedAt: serverIso,
    };
    const existingChunks =
      this.chunks.get(saveId) ?? new Map<number, CloudSaveChunkDoc>();
    for (const c of chunks) {
      existingChunks.set(c.index, {
        index: c.index,
        data: c.data,
        parentRev: updatedRev,
      });
    }
    this.saves.set(saveId, storedParent);
    this.chunks.set(saveId, existingChunks);
    this.transactionCount += 1;
    return {
      ok: true,
      rev: updatedRev,
      updatedAt: serverIso,
    };
  }

  async getChunks(
    saveId: string,
    chunkCount: number
  ): Promise<CloudSaveChunkDoc[]> {
    if (!this.configured || chunkCount <= 0) return [];
    const map = this.chunks.get(saveId);
    if (!map) return [];
    const out: CloudSaveChunkDoc[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = map.get(i);
      if (chunk) {
        out.push(structuredClone(chunk));
      }
    }
    return out;
  }
}

let defaultCloudStore: CloudStoreAdapter | null = null;

export function getDefaultCloudStore(): CloudStoreAdapter {
  if (!defaultCloudStore) {
    defaultCloudStore = new FirestoreCloudStore();
  }
  return defaultCloudStore;
}
