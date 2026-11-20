import { useEffect, useState } from 'react';

export const BATTLE_LAYOUT_PREFS_STORAGE_KEY = 'dreamAce.layout.v1';

export interface BattleLayoutPrefs {
  showActionCamera: boolean;
}

export const DEFAULT_BATTLE_LAYOUT_PREFS: BattleLayoutPrefs = {
  showActionCamera: true,
};

const listeners = new Set<() => void>();

export function subscribeBattleLayoutPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitBattleLayoutPrefsChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function sanitizeBattleLayoutPrefs(raw: unknown): BattleLayoutPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BATTLE_LAYOUT_PREFS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    showActionCamera:
      typeof obj.showActionCamera === 'boolean'
        ? obj.showActionCamera
        : DEFAULT_BATTLE_LAYOUT_PREFS.showActionCamera,
  };
}

export function readBattleLayoutPrefs(): BattleLayoutPrefs {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BATTLE_LAYOUT_PREFS };
  }
  try {
    const raw = window.localStorage.getItem(BATTLE_LAYOUT_PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_BATTLE_LAYOUT_PREFS };
    }
    const parsed: unknown = JSON.parse(raw);
    return sanitizeBattleLayoutPrefs(parsed);
  } catch {
    return { ...DEFAULT_BATTLE_LAYOUT_PREFS };
  }
}

export function writeBattleLayoutPrefs(
  patch: Partial<BattleLayoutPrefs>
): BattleLayoutPrefs {
  const current = readBattleLayoutPrefs();
  const next = sanitizeBattleLayoutPrefs({ ...current, ...patch });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        BATTLE_LAYOUT_PREFS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Ignore storage quota/availability failures
    }
  }
  emitBattleLayoutPrefsChanged();
  return next;
}

export function resetBattleLayoutPrefs(): BattleLayoutPrefs {
  const next = { ...DEFAULT_BATTLE_LAYOUT_PREFS };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        BATTLE_LAYOUT_PREFS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Ignore storage quota/availability failures
    }
  }
  emitBattleLayoutPrefsChanged();
  return next;
}

export function useBattleLayoutPrefs(): [
  BattleLayoutPrefs,
  (patch: Partial<BattleLayoutPrefs>) => void,
] {
  const [prefs, setPrefs] = useState<BattleLayoutPrefs>(() =>
    readBattleLayoutPrefs()
  );

  useEffect(() => {
    const refresh = () => setPrefs(readBattleLayoutPrefs());
    const unsub = subscribeBattleLayoutPrefs(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === BATTLE_LAYOUT_PREFS_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = (patch: Partial<BattleLayoutPrefs>) => {
    const next = writeBattleLayoutPrefs(patch);
    setPrefs(next);
  };

  return [prefs, update];
}
