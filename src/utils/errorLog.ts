export interface AppErrorLogEntry {
  id: string;
  timestamp: number;
  source: string;
  message: string;
  stack?: string;
}

const MAX_LOG_ENTRIES = 50;
let logSeq = 1;
let entries: AppErrorLogEntry[] = [];
const listeners = new Set<() => void>();
let globalInstalled = false;

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Ignore listener failure
    }
  }
}

export function recordAppError(
  source: string,
  error: unknown,
  extraStack?: string
): void {
  const errObj = error instanceof Error ? error : null;
  const message = errObj
    ? `${errObj.name}: ${errObj.message}`
    : typeof error === 'string'
    ? error
    : String(error ?? 'Unknown error');
  const stack = [errObj?.stack, extraStack].filter(Boolean).join('\n\n') || undefined;
  logSeq += 1;
  entries = [
    {
      id: `err_${Date.now().toString(36)}_${logSeq}`,
      timestamp: Date.now(),
      source,
      message,
      stack,
    },
    ...entries,
  ].slice(0, MAX_LOG_ENTRIES);
  notify();
}

export function getErrorLogs(): AppErrorLogEntry[] {
  return entries;
}

export function clearErrorLogs(): void {
  entries = [];
  notify();
}

export function subscribeErrorLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installGlobalErrorCapture(): void {
  if (globalInstalled || typeof window === 'undefined') return;
  globalInstalled = true;
  window.addEventListener('error', (event) => {
    recordAppError('window.error', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordAppError('unhandledrejection', event.reason);
  });
}
