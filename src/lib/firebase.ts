import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import generatedConfig from '../../firebase-applet-config.json';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface FirebaseRuntimeServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  config: FirebaseAppletConfig;
}

const REMIX_PLACEHOLDER_PROJECT_ID = 'remixed-project-id';

let configOverride: Partial<FirebaseAppletConfig> | null | undefined = undefined;
let cachedServices: FirebaseRuntimeServices | null = null;
let initAttempted = false;
let initFailed = false;
let pendingAnonSignIn: Promise<User | null> | null = null;

export function isValidFirebaseConfig(
  raw: unknown
): raw is FirebaseAppletConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  const projectId =
    typeof obj.projectId === 'string' ? obj.projectId.trim() : '';
  const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey.trim() : '';
  const appId = typeof obj.appId === 'string' ? obj.appId.trim() : '';

  if (!projectId || !apiKey || !appId) {
    return false;
  }
  if (projectId === REMIX_PLACEHOLDER_PROJECT_ID) {
    return false;
  }
  return true;
}

function resolveActiveConfig(): unknown {
  if (configOverride !== undefined) {
    return configOverride;
  }
  return generatedConfig;
}

/**
 * Lazily initializes Firebase App, Auth, and Firestore using the generated
 * `firebase-applet-config.json` committed in the repository.
 * Never throws; returns null if config is missing/invalid or SDK init fails.
 */
export function getFirebaseServices(): FirebaseRuntimeServices | null {
  if (cachedServices) {
    return cachedServices;
  }
  if (initAttempted && initFailed) {
    return null;
  }

  initAttempted = true;
  const activeConfig = resolveActiveConfig();
  if (!isValidFirebaseConfig(activeConfig)) {
    initFailed = true;
    return null;
  }

  try {
    const existingApps = getApps();
    const app =
      existingApps.length > 0 ? existingApps[0] : initializeApp(activeConfig);
    const auth = getAuth(app);
    const db = activeConfig.firestoreDatabaseId
      ? getFirestore(app, activeConfig.firestoreDatabaseId)
      : getFirestore(app);
    cachedServices = { app, auth, db, config: activeConfig };
    initFailed = false;
    return cachedServices;
  } catch {
    initFailed = true;
    cachedServices = null;
    return null;
  }
}

/**
 * Returns true if Firebase config is valid and SDK services initialize cleanly.
 * Never throws, allowing the game to boot completely offline.
 */
export function isFirebaseConfigured(): boolean {
  return getFirebaseServices() !== null;
}

/**
 * Ensures an authenticated Firebase session using Anonymous Auth before any
 * Firestore read/write. Coalesces concurrent calls and never throws on boot.
 */
export async function ensureAnonymousAuth(): Promise<User | null> {
  const services = getFirebaseServices();
  if (!services) {
    return null;
  }
  if (services.auth.currentUser) {
    return services.auth.currentUser;
  }
  if (!pendingAnonSignIn) {
    pendingAnonSignIn = signInAnonymously(services.auth)
      .then((cred) => cred.user)
      .finally(() => {
        pendingAnonSignIn = null;
      });
  }
  return pendingAnonSignIn;
}

/**
 * Diagnostic connectivity probe for Firestore (opt-in; never called on offline boot or unit tests).
 */
export async function testFirestoreConnection(): Promise<boolean> {
  const services = getFirebaseServices();
  if (!services) return false;
  try {
    await getDocFromServer(doc(services.db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const services = getFirebaseServices();
  const user = services?.auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Test helper to override or clear the Firebase config without touching disk.
 */
export function setFirebaseConfigOverrideForTests(
  override: Partial<FirebaseAppletConfig> | null | undefined
): void {
  configOverride = override;
  cachedServices = null;
  initAttempted = false;
  initFailed = false;
  pendingAnonSignIn = null;
}
