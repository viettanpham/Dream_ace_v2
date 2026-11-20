import {
  CURRENT_SAVE_VERSION,
  migrateSaveData,
  type PersistedCampaignState,
} from './migration';
import {
  base64ToBytes,
  bytesToBase64,
  canonicalJsonStringify,
  derivePbkdf2KeyBits,
  isValidSavePayloadShape,
  isValidSavePin,
  SAVE_PBKDF2_ITERATIONS,
  summarizeSaveStateForPreview,
  validateImportSaveVersion,
  type SavePreviewSummary,
} from './saveExport';
import {
  getDefaultCloudStore,
  isCloudConfigured,
  normalizeCloudTimestamp,
  type CloudSaveChunkDoc,
  type CloudSaveDoc,
  type CloudStoreAdapter,
} from './cloudStore';

export const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CLOUD_SAVE_ID_LENGTH = 10;
export const CLOUD_SAVE_SALT_BYTES = 16;
export const CLOUD_SAVE_IV_BYTES = 12;
export const CLOUD_CHUNK_THRESHOLD_BYTES = 900_000;
export const CLOUD_CHUNK_SIZE_BYTES = 700_000;
export const CLOUD_SAVE_GAME_VERSION = `dream-ace-s${CURRENT_SAVE_VERSION}`;

const SAVE_ID_NORMALIZED_REGEX = /^[0-9A-HJKMNP-TV-Z]{10}$/;

export type CloudSaveErrorCode =
  | 'CLOUD_NOT_CONFIGURED'
  | 'INVALID_SAVE_ID'
  | 'INVALID_PIN'
  | 'WRONG_PIN'
  | 'NOT_FOUND'
  | 'VERSION_TOO_NEW'
  | 'CORRUPT'
  | 'UNSUPPORTED_CRYPTO'
  | 'DECOMPRESSION_UNSUPPORTED'
  | 'STORE_ERROR';

export interface CloudSaveError {
  code: CloudSaveErrorCode;
  message: string;
  foundVersion?: number;
  supportedVersion?: number;
}

export interface CloudUploadParams {
  saveId: string;
  pin: string;
  state: unknown;
  lastKnownRev: number;
  adapter?: CloudStoreAdapter;
  gameVersion?: string;
  clientUpdatedAt?: string;
}

export type CloudUploadResult =
  | {
      ok: true;
      saveId: string;
      rawSaveId: string;
      rev: number;
      updatedAt: string | null;
      compressed: boolean;
      sizeBytes: number;
      chunkCount: number;
      iv: string;
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
      error: CloudSaveError;
    };

export interface CloudDerivedCredentials {
  /** Non-extractable AES-GCM-256 CryptoKey derived via PBKDF2-SHA256 (100,000 iterations). */
  key: CryptoKey;
  /** Base64 SHA-256 of the derived key bits. */
  verifier: string;
  /** Base64 16-byte random salt matching the cloud save document. */
  salt: string;
}

export interface CloudUploadWithKeyParams {
  saveId: string;
  credentials: CloudDerivedCredentials;
  state: unknown;
  lastKnownRev: number;
  adapter?: CloudStoreAdapter;
  gameVersion?: string;
  clientUpdatedAt?: string;
}

export interface CloudDownloadWithKeyParams {
  saveId: string;
  credentials: CloudDerivedCredentials;
  adapter?: CloudStoreAdapter;
}

export interface CloudDownloadParams {
  saveId: string;
  pin: string;
  adapter?: CloudStoreAdapter;
}

export type CloudDownloadResult =
  | {
      ok: true;
      saveId: string;
      rawSaveId: string;
      rev: number;
      schemaVersion: number;
      updatedAt: string | null;
      clientUpdatedAt: string;
      compressed: boolean;
      sizeBytes: number;
      gameVersion: string;
      chunkCount: number;
      rawState: unknown;
      migratedState: PersistedCampaignState;
      preview: SavePreviewSummary;
    }
  | {
      ok: false;
      error: CloudSaveError;
    };

function getWebCrypto(): Crypto | null {
  const c = globalThis.crypto;
  if (!c || !c.subtle || typeof c.getRandomValues !== 'function') {
    return null;
  }
  return c;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalizes a user-entered Save ID by stripping dashes/spaces and uppercasing.
 * Returns the canonical 10-character Crockford Base32 ID (no I, L, O, U) or null if invalid.
 */
export function normalizeSaveId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[-\s]+/g, '').toUpperCase();
  if (!SAVE_ID_NORMALIZED_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Formats a Save ID as `XXXXX-XXXXX` for display. Returns null if invalid.
 */
export function formatSaveId(input: string): string | null {
  const norm = normalizeSaveId(input);
  if (!norm) return null;
  return `${norm.slice(0, 5)}-${norm.slice(5)}`;
}

export function isValidSaveId(input: string): boolean {
  return normalizeSaveId(input) !== null;
}

/**
 * Generates a cryptographically random 10-character Crockford Base32 Save ID
 * using crypto.getRandomValues, formatted as `XXXXX-XXXXX`.
 */
export function generateSaveId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto getRandomValues is required to generate a Save ID.');
  }
  const bytes = new Uint8Array(CLOUD_SAVE_ID_LENGTH);
  cryptoApi.getRandomValues(bytes);
  let raw = '';
  for (let i = 0; i < CLOUD_SAVE_ID_LENGTH; i++) {
    // 256 is divisible by 32 -> zero modulo bias
    raw += CROCKFORD_BASE32_ALPHABET[bytes[i] & 31];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function isGzipSupported(): boolean {
  return (
    typeof globalThis.CompressionStream === 'function' &&
    typeof globalThis.DecompressionStream === 'function'
  );
}

async function runByteTransformStream(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  const readPromise = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const copy = new Uint8Array(value);
        chunks.push(copy);
        totalLength += copy.byteLength;
      }
    }
  })();

  const writePromise = (async () => {
    // Write in 64 KB slices while reader drains concurrently to avoid backpressure deadlock
    const sliceSize = 64 * 1024;
    for (let offset = 0; offset < input.byteLength; offset += sliceSize) {
      const slice = new Uint8Array(
        input.subarray(offset, Math.min(offset + sliceSize, input.byteLength))
      );
      await writer.write(slice);
    }
    await writer.close();
  })();

  await Promise.all([writePromise, readPromise]);

  const out = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}

export async function gzipCompressBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  return runByteTransformStream(input, stream);
}

export async function gzipDecompressBytes(
  input: Uint8Array
): Promise<Uint8Array> {
  const stream = new DecompressionStream('gzip');
  return runByteTransformStream(input, stream);
}

/**
 * Derives the AES-GCM-256 key and key verifier from PIN + salt using SV1a's
 * PBKDF2-SHA256 helper (100,000 iterations).
 * verifier = base64(SHA-256(derivedKeyBits)).
 */
export async function deriveCloudKeyAndVerifier(
  pin: string,
  salt: Uint8Array
): Promise<{ key: CryptoKey; verifier: string }> {
  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    throw new Error('UNSUPPORTED_CRYPTO');
  }
  const keyBits = await derivePbkdf2KeyBits(pin, salt, SAVE_PBKDF2_ITERATIONS);
  const verifierBuffer = await cryptoApi.subtle.digest(
    'SHA-256',
    new Uint8Array(keyBits)
  );
  const verifier = bytesToBase64(new Uint8Array(verifierBuffer));
  const key = await cryptoApi.subtle.importKey(
    'raw',
    new Uint8Array(keyBits),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return { key, verifier };
}

/**
 * Generates a fresh random 16-byte salt and derives non-extractable AES-GCM CryptoKey + verifier + salt
 * for a brand-new cloud save. Caller can discard the raw PIN immediately afterwards.
 */
export async function deriveCloudCredentialsForNewSave(
  pin: string
): Promise<CloudDerivedCredentials> {
  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    throw new Error('UNSUPPORTED_CRYPTO');
  }
  const saltBytes = new Uint8Array(CLOUD_SAVE_SALT_BYTES);
  cryptoApi.getRandomValues(saltBytes);
  const { key, verifier } = await deriveCloudKeyAndVerifier(pin, saltBytes);
  return {
    key,
    verifier,
    salt: bytesToBase64(saltBytes),
  };
}

export type VerifyPinForSaveResult =
  | {
      ok: true;
      saveId: string;
      rawSaveId: string;
      credentials: CloudDerivedCredentials;
      remoteRev: number;
      remoteUpdatedAt: string | null;
    }
  | {
      ok: false;
      error: CloudSaveError;
    };

/**
 * Fetches an existing cloud save's salt & verifier, derives the non-extractable CryptoKey from PIN,
 * and verifies it against the remote verifier. Returns "Sai PIN" on mismatch without loading payload/chunks.
 */
export async function deriveCloudCredentialsForExistingSave(params: {
  saveId: string;
  pin: string;
  adapter?: CloudStoreAdapter;
}): Promise<VerifyPinForSaveResult> {
  const adapter = params.adapter ?? getDefaultCloudStore();
  if (!isCloudConfigured(adapter)) {
    return {
      ok: false,
      error: {
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      },
    };
  }

  const normalizedId = normalizeSaveId(params.saveId);
  if (!normalizedId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SAVE_ID',
        message: 'Save ID must be 10 Crockford Base32 characters.',
      },
    };
  }
  const formattedId = `${normalizedId.slice(0, 5)}-${normalizedId.slice(5)}`;

  const trimmedPin = typeof params.pin === 'string' ? params.pin.trim() : '';
  if (!isValidSavePin(trimmedPin)) {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required.',
      },
    };
  }

  let doc: CloudSaveDoc | null;
  try {
    doc = await adapter.getSave(normalizedId);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!doc) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Cloud save not found.',
      },
    };
  }

  const saltBytes = typeof doc.salt === 'string' ? base64ToBytes(doc.salt) : null;
  if (!saltBytes || saltBytes.byteLength < 8 || typeof doc.verifier !== 'string') {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save has invalid cryptographic metadata.',
      },
    };
  }

  try {
    const { key, verifier } = await deriveCloudKeyAndVerifier(trimmedPin, saltBytes);
    if (!constantTimeEqual(verifier, doc.verifier)) {
      return {
        ok: false,
        error: {
          code: 'WRONG_PIN',
          message: 'Sai PIN',
        },
      };
    }
    return {
      ok: true,
      saveId: formattedId,
      rawSaveId: normalizedId,
      credentials: {
        key,
        verifier,
        salt: doc.salt,
      },
      remoteRev: doc.rev,
      remoteUpdatedAt: normalizeCloudTimestamp(doc.updatedAt, doc.clientUpdatedAt),
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function splitCiphertextIntoChunks(
  cipherB64: string,
  parentRev: number
): { inlinePayload: string; chunks: CloudSaveChunkDoc[] } {
  if (cipherB64.length <= CLOUD_CHUNK_THRESHOLD_BYTES) {
    return { inlinePayload: cipherB64, chunks: [] };
  }
  const chunks: CloudSaveChunkDoc[] = [];
  for (
    let offset = 0, index = 0;
    offset < cipherB64.length;
    offset += CLOUD_CHUNK_SIZE_BYTES, index += 1
  ) {
    chunks.push({
      index,
      data: cipherB64.slice(offset, offset + CLOUD_CHUNK_SIZE_BYTES),
      parentRev,
    });
  }
  return { inlinePayload: '', chunks };
}

/**
 * Uploads an encrypted save snapshot to `saves/{saveId}` (and `saves/{saveId}/chunks/{n}` if > 900 KB)
 * in a single atomic transaction with optimistic revision locking (`rev = lastKnownRev + 1`).
 * Never silently overwrites a higher remote revision.
 */
export async function uploadCloudSave(
  params: CloudUploadParams
): Promise<CloudUploadResult> {
  const adapter = params.adapter ?? getDefaultCloudStore();
  if (!isCloudConfigured(adapter)) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      },
    };
  }

  const normalizedId = normalizeSaveId(params.saveId);
  if (!normalizedId) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'INVALID_SAVE_ID',
        message: 'Save ID must be 10 Crockford Base32 characters.',
      },
    };
  }
  const formattedId = `${normalizedId.slice(0, 5)}-${normalizedId.slice(5)}`;

  const trimmedPin = typeof params.pin === 'string' ? params.pin.trim() : '';
  if (!isValidSavePin(trimmedPin)) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'INVALID_PIN',
        message: 'PIN must be 4 to 8 numeric digits.',
      },
    };
  }

  if (
    params.state === null ||
    typeof params.state !== 'object' ||
    Array.isArray(params.state)
  ) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'CORRUPT',
        message: 'Save state must be a plain JSON object.',
      },
    };
  }

  const lastKnownRev =
    typeof params.lastKnownRev === 'number' &&
    Number.isInteger(params.lastKnownRev) &&
    params.lastKnownRev >= 0
      ? params.lastKnownRev
      : 0;

  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required for cloud save encryption.',
      },
    };
  }

  let remote: CloudSaveDoc | null;
  try {
    remote = await adapter.getSave(normalizedId);
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (remote) {
    if (remote.rev > lastKnownRev || remote.rev !== lastKnownRev) {
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
  } else if (lastKnownRev > 0) {
    return {
      ok: false,
      conflict: true,
      remoteRev: 0,
      remoteUpdatedAt: null,
    };
  }

  // Reuse stored salt on update so verifier stays invariant for Firestore rules; generate fresh random salt on create.
  let saltBytes: Uint8Array;
  if (remote) {
    const decodedSalt = base64ToBytes(remote.salt);
    if (!decodedSalt || decodedSalt.byteLength < 8) {
      return {
        ok: false,
        conflict: false,
        error: {
          code: 'CORRUPT',
          message: 'Remote save has an invalid salt.',
        },
      };
    }
    saltBytes = decodedSalt;
  } else {
    const freshSalt = new Uint8Array(CLOUD_SAVE_SALT_BYTES);
    cryptoApi.getRandomValues(freshSalt);
    saltBytes = freshSalt;
  }

  let key: CryptoKey;
  let verifier: string;
  try {
    const derived = await deriveCloudKeyAndVerifier(trimmedPin, saltBytes);
    key = derived.key;
    verifier = derived.verifier;
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (remote && !constantTimeEqual(verifier, remote.verifier)) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  // Serialize -> gzip (if CompressionStream available) -> encrypt with a FRESH random IV
  const normalizedState = JSON.parse(JSON.stringify(params.state));
  const serializedJson = canonicalJsonStringify(normalizedState);
  const rawUtf8Bytes = new TextEncoder().encode(serializedJson);

  let payloadPlainBytes: Uint8Array = rawUtf8Bytes;
  let compressed = false;
  if (isGzipSupported()) {
    try {
      payloadPlainBytes = await gzipCompressBytes(rawUtf8Bytes);
      compressed = true;
    } catch {
      payloadPlainBytes = rawUtf8Bytes;
      compressed = false;
    }
  }

  const ivBytes = new Uint8Array(CLOUD_SAVE_IV_BYTES);
  cryptoApi.getRandomValues(ivBytes);

  let cipherB64: string;
  try {
    const cipherBuf = await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      key,
      new Uint8Array(payloadPlainBytes)
    );
    cipherB64 = bytesToBase64(new Uint8Array(cipherBuf));
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const nextRev = lastKnownRev + 1;
  const { inlinePayload, chunks } = splitCiphertextIntoChunks(
    cipherB64,
    nextRev
  );
  const clientUpdatedAt =
    typeof params.clientUpdatedAt === 'string' &&
    params.clientUpdatedAt.trim().length > 0
      ? params.clientUpdatedAt
      : new Date().toISOString();
  const gameVersion =
    typeof params.gameVersion === 'string' &&
    params.gameVersion.trim().length > 0
      ? params.gameVersion
      : CLOUD_SAVE_GAME_VERSION;

  const saltB64 = bytesToBase64(saltBytes);
  const ivB64 = bytesToBase64(ivBytes);

  try {
    const commitRes = await adapter.commitSave({
      saveId: normalizedId,
      expectedLastKnownRev: lastKnownRev,
      doc: {
        schemaVersion: CURRENT_SAVE_VERSION,
        rev: nextRev,
        clientUpdatedAt,
        verifier,
        salt: saltB64,
        iv: ivB64,
        payload: inlinePayload,
        compressed,
        sizeBytes: rawUtf8Bytes.byteLength,
        gameVersion,
        chunkCount: chunks.length,
      },
      chunks,
    });

    if (!commitRes.ok) {
      if (commitRes.conflict) {
        return {
          ok: false,
          conflict: true,
          remoteRev: commitRes.remoteRev,
          remoteUpdatedAt: commitRes.remoteUpdatedAt,
        };
      }
      if (commitRes.code === 'VERIFIER_MISMATCH') {
        return {
          ok: false,
          conflict: false,
          error: { code: 'WRONG_PIN', message: 'Sai PIN' },
        };
      }
      return {
        ok: false,
        conflict: false,
        error: {
          code:
            commitRes.code === 'CLOUD_NOT_CONFIGURED'
              ? 'CLOUD_NOT_CONFIGURED'
              : 'STORE_ERROR',
          message: commitRes.message,
        },
      };
    }

    return {
      ok: true,
      saveId: formattedId,
      rawSaveId: normalizedId,
      rev: commitRes.rev,
      updatedAt: commitRes.updatedAt,
      compressed,
      sizeBytes: rawUtf8Bytes.byteLength,
      chunkCount: chunks.length,
      iv: ivB64,
    };
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Downloads and decrypts a cloud save from `saves/{saveId}` (and its chunks if chunkCount > 0),
 * refuses schemaVersion > CURRENT_SAVE_VERSION, validates PIN verifier before loading chunks,
 * and runs the exact SV1a migration path (`migrateSaveData`).
 */
export async function downloadCloudSave(
  params: CloudDownloadParams
): Promise<CloudDownloadResult> {
  const adapter = params.adapter ?? getDefaultCloudStore();
  if (!isCloudConfigured(adapter)) {
    return {
      ok: false,
      error: {
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      },
    };
  }

  const normalizedId = normalizeSaveId(params.saveId);
  if (!normalizedId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SAVE_ID',
        message: 'Save ID must be 10 Crockford Base32 characters.',
      },
    };
  }
  const formattedId = `${normalizedId.slice(0, 5)}-${normalizedId.slice(5)}`;

  const trimmedPin = typeof params.pin === 'string' ? params.pin.trim() : '';
  if (!isValidSavePin(trimmedPin)) {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required for cloud save decryption.',
      },
    };
  }

  let doc: CloudSaveDoc | null;
  try {
    doc = await adapter.getSave(normalizedId);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!doc) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Cloud save not found.',
      },
    };
  }

  if (
    typeof doc.schemaVersion !== 'number' ||
    !Number.isInteger(doc.schemaVersion) ||
    doc.schemaVersion < 1
  ) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save has an invalid schemaVersion.',
      },
    };
  }

  // Refuse saves created by a newer schemaVersion before decrypting or migrating
  const versionCheck = validateImportSaveVersion(
    doc.schemaVersion,
    CURRENT_SAVE_VERSION
  );
  if (!versionCheck.ok) {
    return {
      ok: false,
      error: {
        code: 'VERSION_TOO_NEW',
        message: versionCheck.error.message,
        foundVersion: versionCheck.error.foundVersion,
        supportedVersion: versionCheck.error.supportedVersion,
      },
    };
  }

  const saltBytes = typeof doc.salt === 'string' ? base64ToBytes(doc.salt) : null;
  const ivBytes = typeof doc.iv === 'string' ? base64ToBytes(doc.iv) : null;
  if (
    !saltBytes ||
    saltBytes.byteLength < 8 ||
    !ivBytes ||
    ivBytes.byteLength !== CLOUD_SAVE_IV_BYTES ||
    typeof doc.verifier !== 'string' ||
    doc.verifier.length === 0
  ) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save is missing valid cryptographic parameters.',
      },
    };
  }

  let key: CryptoKey;
  let verifier: string;
  try {
    const derived = await deriveCloudKeyAndVerifier(trimmedPin, saltBytes);
    key = derived.key;
    verifier = derived.verifier;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!constantTimeEqual(verifier, doc.verifier)) {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  // Reassemble ciphertext (inline or chunked)
  const chunkCount =
    typeof doc.chunkCount === 'number' &&
    Number.isInteger(doc.chunkCount) &&
    doc.chunkCount >= 0
      ? doc.chunkCount
      : 0;

  let cipherB64: string;
  if (chunkCount > 0) {
    let chunks: CloudSaveChunkDoc[];
    try {
      chunks = await adapter.getChunks(normalizedId, chunkCount);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'STORE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    if (chunks.length !== chunkCount) {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Cloud save chunks are incomplete.',
        },
      };
    }

    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const c = sorted[i];
      if (
        !c ||
        c.index !== i ||
        c.parentRev !== doc.rev ||
        typeof c.data !== 'string'
      ) {
        return {
          ok: false,
          error: {
            code: 'CORRUPT',
            message: 'Cloud save chunk integrity check failed.',
          },
        };
      }
      parts.push(c.data);
    }
    cipherB64 = parts.join('');
  } else {
    if (typeof doc.payload !== 'string' || doc.payload.length === 0) {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Cloud save payload is empty.',
        },
      };
    }
    cipherB64 = doc.payload;
  }

  const cipherBytes = base64ToBytes(cipherB64);
  if (!cipherBytes || cipherBytes.byteLength < 16) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save ciphertext is malformed.',
      },
    };
  }

  let plainBytes: Uint8Array;
  try {
    const plainBuf = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      key,
      new Uint8Array(cipherBytes)
    );
    plainBytes = new Uint8Array(plainBuf);
  } catch {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  if (doc.compressed) {
    if (typeof globalThis.DecompressionStream !== 'function') {
      return {
        ok: false,
        error: {
          code: 'DECOMPRESSION_UNSUPPORTED',
          message: 'Browser does not support DecompressionStream for gzip saves.',
        },
      };
    }
    try {
      plainBytes = await gzipDecompressBytes(plainBytes);
    } catch {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Failed to decompress cloud save payload.',
        },
      };
    }
  }

  let rawState: unknown;
  try {
    const jsonText = new TextDecoder().decode(plainBytes);
    rawState = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Decrypted cloud save is not valid JSON.',
      },
    };
  }

  if (!isValidSavePayloadShape(rawState, doc.schemaVersion)) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save payload is missing required pilot data.',
      },
    };
  }

  // Run the exact same migration path & preview builder as SV1a import
  const migratedState = migrateSaveData(rawState, doc.schemaVersion);
  const preview = summarizeSaveStateForPreview(rawState, doc.schemaVersion);

  return {
    ok: true,
    saveId: formattedId,
    rawSaveId: normalizedId,
    rev: doc.rev,
    schemaVersion: doc.schemaVersion,
    updatedAt: normalizeCloudTimestamp(doc.updatedAt, doc.clientUpdatedAt),
    clientUpdatedAt: doc.clientUpdatedAt,
    compressed: Boolean(doc.compressed),
    sizeBytes: doc.sizeBytes,
    gameVersion: doc.gameVersion,
    chunkCount,
    rawState,
    migratedState,
    preview,
  };
}

/**
 * Uploads an encrypted save snapshot using pre-derived credentials (non-extractable AES-GCM CryptoKey + verifier + salt),
 * allowing autosave and manual sync without ever storing the raw PIN.
 */
export async function uploadCloudSaveWithKey(
  params: CloudUploadWithKeyParams
): Promise<CloudUploadResult> {
  const adapter = params.adapter ?? getDefaultCloudStore();
  if (!isCloudConfigured(adapter)) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      },
    };
  }

  const normalizedId = normalizeSaveId(params.saveId);
  if (!normalizedId) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'INVALID_SAVE_ID',
        message: 'Save ID must be 10 Crockford Base32 characters.',
      },
    };
  }
  const formattedId = `${normalizedId.slice(0, 5)}-${normalizedId.slice(5)}`;

  if (
    params.state === null ||
    typeof params.state !== 'object' ||
    Array.isArray(params.state)
  ) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'CORRUPT',
        message: 'Save state must be a plain JSON object.',
      },
    };
  }

  const lastKnownRev =
    typeof params.lastKnownRev === 'number' &&
    Number.isInteger(params.lastKnownRev) &&
    params.lastKnownRev >= 0
      ? params.lastKnownRev
      : 0;

  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required for cloud save encryption.',
      },
    };
  }

  const { key, verifier, salt } = params.credentials;
  const decodedSalt = base64ToBytes(salt);
  if (!key || !decodedSalt || decodedSalt.byteLength < 8 || !verifier) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'CORRUPT',
        message: 'Invalid derived cloud credentials.',
      },
    };
  }

  let remote: CloudSaveDoc | null;
  try {
    remote = await adapter.getSave(normalizedId);
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (remote) {
    if (remote.rev > lastKnownRev || remote.rev !== lastKnownRev) {
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
    if (!constantTimeEqual(verifier, remote.verifier) || salt !== remote.salt) {
      return {
        ok: false,
        conflict: false,
        error: {
          code: 'WRONG_PIN',
          message: 'Sai PIN',
        },
      };
    }
  } else if (lastKnownRev > 0) {
    return {
      ok: false,
      conflict: true,
      remoteRev: 0,
      remoteUpdatedAt: null,
    };
  }

  const normalizedState = JSON.parse(JSON.stringify(params.state));
  const serializedJson = canonicalJsonStringify(normalizedState);
  const rawUtf8Bytes = new TextEncoder().encode(serializedJson);

  let payloadPlainBytes: Uint8Array = rawUtf8Bytes;
  let compressed = false;
  if (isGzipSupported()) {
    try {
      payloadPlainBytes = await gzipCompressBytes(rawUtf8Bytes);
      compressed = true;
    } catch {
      payloadPlainBytes = rawUtf8Bytes;
      compressed = false;
    }
  }

  const ivBytes = new Uint8Array(CLOUD_SAVE_IV_BYTES);
  cryptoApi.getRandomValues(ivBytes);

  let cipherB64: string;
  try {
    const cipherBuf = await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      key,
      new Uint8Array(payloadPlainBytes)
    );
    cipherB64 = bytesToBase64(new Uint8Array(cipherBuf));
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const nextRev = lastKnownRev + 1;
  const { inlinePayload, chunks } = splitCiphertextIntoChunks(cipherB64, nextRev);
  const clientUpdatedAt =
    typeof params.clientUpdatedAt === 'string' &&
    params.clientUpdatedAt.trim().length > 0
      ? params.clientUpdatedAt
      : new Date().toISOString();
  const gameVersion =
    typeof params.gameVersion === 'string' &&
    params.gameVersion.trim().length > 0
      ? params.gameVersion
      : CLOUD_SAVE_GAME_VERSION;
  const ivB64 = bytesToBase64(ivBytes);

  try {
    const commitRes = await adapter.commitSave({
      saveId: normalizedId,
      expectedLastKnownRev: lastKnownRev,
      doc: {
        schemaVersion: CURRENT_SAVE_VERSION,
        rev: nextRev,
        clientUpdatedAt,
        verifier,
        salt,
        iv: ivB64,
        payload: inlinePayload,
        compressed,
        sizeBytes: rawUtf8Bytes.byteLength,
        gameVersion,
        chunkCount: chunks.length,
      },
      chunks,
    });

    if (!commitRes.ok) {
      if (commitRes.conflict) {
        return {
          ok: false,
          conflict: true,
          remoteRev: commitRes.remoteRev,
          remoteUpdatedAt: commitRes.remoteUpdatedAt,
        };
      }
      if (commitRes.code === 'VERIFIER_MISMATCH') {
        return {
          ok: false,
          conflict: false,
          error: { code: 'WRONG_PIN', message: 'Sai PIN' },
        };
      }
      return {
        ok: false,
        conflict: false,
        error: {
          code:
            commitRes.code === 'CLOUD_NOT_CONFIGURED'
              ? 'CLOUD_NOT_CONFIGURED'
              : 'STORE_ERROR',
          message: commitRes.message,
        },
      };
    }

    return {
      ok: true,
      saveId: formattedId,
      rawSaveId: normalizedId,
      rev: commitRes.rev,
      updatedAt: commitRes.updatedAt,
      compressed,
      sizeBytes: rawUtf8Bytes.byteLength,
      chunkCount: chunks.length,
      iv: ivB64,
    };
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Downloads and decrypts a cloud save using pre-derived credentials (non-extractable AES-GCM CryptoKey + verifier + salt).
 */
export async function downloadCloudSaveWithKey(
  params: CloudDownloadWithKeyParams
): Promise<CloudDownloadResult> {
  const adapter = params.adapter ?? getDefaultCloudStore();
  if (!isCloudConfigured(adapter)) {
    return {
      ok: false,
      error: {
        code: 'CLOUD_NOT_CONFIGURED',
        message: 'Cloud save is not configured.',
      },
    };
  }

  const normalizedId = normalizeSaveId(params.saveId);
  if (!normalizedId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SAVE_ID',
        message: 'Save ID must be 10 Crockford Base32 characters.',
      },
    };
  }
  const formattedId = `${normalizedId.slice(0, 5)}-${normalizedId.slice(5)}`;

  const cryptoApi = getWebCrypto();
  if (!cryptoApi) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CRYPTO',
        message: 'Web Crypto API is required for cloud save decryption.',
      },
    };
  }

  let doc: CloudSaveDoc | null;
  try {
    doc = await adapter.getSave(normalizedId);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'STORE_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!doc) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Cloud save not found.',
      },
    };
  }

  if (
    typeof doc.schemaVersion !== 'number' ||
    !Number.isInteger(doc.schemaVersion) ||
    doc.schemaVersion < 1
  ) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save has an invalid schemaVersion.',
      },
    };
  }

  const versionCheck = validateImportSaveVersion(
    doc.schemaVersion,
    CURRENT_SAVE_VERSION
  );
  if (!versionCheck.ok) {
    return {
      ok: false,
      error: {
        code: 'VERSION_TOO_NEW',
        message: versionCheck.error.message,
        foundVersion: versionCheck.error.foundVersion,
        supportedVersion: versionCheck.error.supportedVersion,
      },
    };
  }

  const ivBytes = typeof doc.iv === 'string' ? base64ToBytes(doc.iv) : null;
  if (
    !ivBytes ||
    ivBytes.byteLength !== CLOUD_SAVE_IV_BYTES ||
    typeof doc.verifier !== 'string' ||
    doc.verifier.length === 0
  ) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save is missing valid cryptographic parameters.',
      },
    };
  }

  const { key, verifier } = params.credentials;
  if (!constantTimeEqual(verifier, doc.verifier)) {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  const chunkCount =
    typeof doc.chunkCount === 'number' &&
    Number.isInteger(doc.chunkCount) &&
    doc.chunkCount >= 0
      ? doc.chunkCount
      : 0;

  let cipherB64: string;
  if (chunkCount > 0) {
    let chunks: CloudSaveChunkDoc[];
    try {
      chunks = await adapter.getChunks(normalizedId, chunkCount);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'STORE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    if (chunks.length !== chunkCount) {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Cloud save chunks are incomplete.',
        },
      };
    }

    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const c = sorted[i];
      if (
        !c ||
        c.index !== i ||
        c.parentRev !== doc.rev ||
        typeof c.data !== 'string'
      ) {
        return {
          ok: false,
          error: {
            code: 'CORRUPT',
            message: 'Cloud save chunk integrity check failed.',
          },
        };
      }
      parts.push(c.data);
    }
    cipherB64 = parts.join('');
  } else {
    if (typeof doc.payload !== 'string' || doc.payload.length === 0) {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Cloud save payload is empty.',
        },
      };
    }
    cipherB64 = doc.payload;
  }

  const cipherBytes = base64ToBytes(cipherB64);
  if (!cipherBytes || cipherBytes.byteLength < 16) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save ciphertext is malformed.',
      },
    };
  }

  let plainBytes: Uint8Array;
  try {
    const plainBuf = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      key,
      new Uint8Array(cipherBytes)
    );
    plainBytes = new Uint8Array(plainBuf);
  } catch {
    return {
      ok: false,
      error: {
        code: 'WRONG_PIN',
        message: 'Sai PIN',
      },
    };
  }

  if (doc.compressed) {
    if (typeof globalThis.DecompressionStream !== 'function') {
      return {
        ok: false,
        error: {
          code: 'DECOMPRESSION_UNSUPPORTED',
          message: 'Browser does not support DecompressionStream for gzip saves.',
        },
      };
    }
    try {
      plainBytes = await gzipDecompressBytes(plainBytes);
    } catch {
      return {
        ok: false,
        error: {
          code: 'CORRUPT',
          message: 'Failed to decompress cloud save payload.',
        },
      };
    }
  }

  let rawState: unknown;
  try {
    const jsonText = new TextDecoder().decode(plainBytes);
    rawState = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Decrypted cloud save is not valid JSON.',
      },
    };
  }

  if (!isValidSavePayloadShape(rawState, doc.schemaVersion)) {
    return {
      ok: false,
      error: {
        code: 'CORRUPT',
        message: 'Cloud save payload is missing required pilot data.',
      },
    };
  }

  const migratedState = migrateSaveData(rawState, doc.schemaVersion);
  const preview = summarizeSaveStateForPreview(rawState, doc.schemaVersion);

  return {
    ok: true,
    saveId: formattedId,
    rawSaveId: normalizedId,
    rev: doc.rev,
    schemaVersion: doc.schemaVersion,
    updatedAt: normalizeCloudTimestamp(doc.updatedAt, doc.clientUpdatedAt),
    clientUpdatedAt: doc.clientUpdatedAt,
    compressed: Boolean(doc.compressed),
    sizeBytes: doc.sizeBytes,
    gameVersion: doc.gameVersion,
    chunkCount,
    rawState,
    migratedState,
    preview,
  };
}

// Convenient short aliases matching prompt terminology
export const upload = uploadCloudSave;
export const download = downloadCloudSave;
