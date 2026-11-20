import { useEffect, useState } from 'react';
import type {
  StatusBadgeLayout,
  StatusDisplayDefaults,
  StatusDisplaySettings,
} from '../types/game';

export const STATUS_DISPLAY_STORAGE_KEY = 'dreamAce.status.v1';

export const PHONE_MAX_WIDTH_PX = 640;

export const BUILTIN_STATUS_DISPLAY_DEFAULTS: StatusDisplaySettings = {
  badgeLayout: 'B',
  phoneRows: 2,
  desktopRows: 3,
  playerPhoneRows: 1,
  playerDesktopRows: 2,
};

export interface StatusDisplayOverride {
  badgeLayout?: StatusBadgeLayout;
  phoneRows?: number;
  desktopRows?: number;
  playerPhoneRows?: number;
  playerDesktopRows?: number;
}

export function clampStatusAreaRows(value: unknown, fallback = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(5, Math.round(num)));
}

export function clampPlayerStatusRows(value: unknown, fallback = 1): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(2, Math.round(num)));
}

export function sanitizeStatusBadgeLayout(
  value: unknown,
  fallback: StatusBadgeLayout = 'B'
): StatusBadgeLayout {
  if (value === 'A' || value === 'B') return value;
  return fallback;
}

export function sanitizeStatusDisplayDefaults(
  raw: unknown
): StatusDisplayDefaults | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const out: StatusDisplayDefaults = {};
  if (obj.badgeLayout === 'A' || obj.badgeLayout === 'B') {
    out.badgeLayout = obj.badgeLayout;
  }
  if (obj.phoneRows !== undefined && Number.isFinite(Number(obj.phoneRows))) {
    out.phoneRows = clampStatusAreaRows(
      obj.phoneRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.phoneRows
    );
  }
  if (obj.desktopRows !== undefined && Number.isFinite(Number(obj.desktopRows))) {
    out.desktopRows = clampStatusAreaRows(
      obj.desktopRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.desktopRows
    );
  }
  if (
    obj.playerPhoneRows !== undefined &&
    Number.isFinite(Number(obj.playerPhoneRows))
  ) {
    out.playerPhoneRows = clampPlayerStatusRows(
      obj.playerPhoneRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.playerPhoneRows
    );
  }
  if (
    obj.playerDesktopRows !== undefined &&
    Number.isFinite(Number(obj.playerDesktopRows))
  ) {
    out.playerDesktopRows = clampPlayerStatusRows(
      obj.playerDesktopRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows
    );
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const listeners = new Set<() => void>();

export function subscribeStatusDisplayPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitStatusDisplayChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function readStatusDisplayOverride(): StatusDisplayOverride {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STATUS_DISPLAY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};

    const out: StatusDisplayOverride = {};
    if (parsed.badgeLayout === 'A' || parsed.badgeLayout === 'B') {
      out.badgeLayout = parsed.badgeLayout;
    }
    if (parsed.phoneRows !== undefined && Number.isFinite(Number(parsed.phoneRows))) {
      out.phoneRows = clampStatusAreaRows(
        parsed.phoneRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.phoneRows
      );
    }
    if (
      parsed.desktopRows !== undefined &&
      Number.isFinite(Number(parsed.desktopRows))
    ) {
      out.desktopRows = clampStatusAreaRows(
        parsed.desktopRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.desktopRows
      );
    }
    if (
      parsed.playerPhoneRows !== undefined &&
      Number.isFinite(Number(parsed.playerPhoneRows))
    ) {
      out.playerPhoneRows = clampPlayerStatusRows(
        parsed.playerPhoneRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.playerPhoneRows
      );
    }
    if (
      parsed.playerDesktopRows !== undefined &&
      Number.isFinite(Number(parsed.playerDesktopRows))
    ) {
      out.playerDesktopRows = clampPlayerStatusRows(
        parsed.playerDesktopRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows
      );
    }
    return out;
  } catch {
    return {};
  }
}

export function writeStatusDisplayOverride(next: StatusDisplayOverride): void {
  if (typeof window === 'undefined') return;
  try {
    const clean: StatusDisplayOverride = {};
    if (next.badgeLayout === 'A' || next.badgeLayout === 'B') {
      clean.badgeLayout = next.badgeLayout;
    }
    if (next.phoneRows !== undefined) {
      clean.phoneRows = clampStatusAreaRows(
        next.phoneRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.phoneRows
      );
    }
    if (next.desktopRows !== undefined) {
      clean.desktopRows = clampStatusAreaRows(
        next.desktopRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.desktopRows
      );
    }
    if (next.playerPhoneRows !== undefined) {
      clean.playerPhoneRows = clampPlayerStatusRows(
        next.playerPhoneRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.playerPhoneRows
      );
    }
    if (next.playerDesktopRows !== undefined) {
      clean.playerDesktopRows = clampPlayerStatusRows(
        next.playerDesktopRows,
        BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows
      );
    }

    if (Object.keys(clean).length === 0) {
      window.localStorage.removeItem(STATUS_DISPLAY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        STATUS_DISPLAY_STORAGE_KEY,
        JSON.stringify(clean)
      );
    }
  } catch {
    // Ignore storage quota/privacy errors
  }
  emitStatusDisplayChanged();
}

export function updateStatusDisplayOverride(
  patch: Partial<StatusDisplayOverride>
): StatusDisplayOverride {
  const merged: StatusDisplayOverride = {
    ...readStatusDisplayOverride(),
    ...patch,
  };
  writeStatusDisplayOverride(merged);
  return readStatusDisplayOverride();
}

export function clearStatusDisplayOverride(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STATUS_DISPLAY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  emitStatusDisplayChanged();
}

/**
 * Precedence: Player local override > Admin CP default > Built-in default.
 */
export function resolveEffectiveStatusDisplaySettings(
  adminDefaults?: StatusDisplayDefaults | null,
  playerOverride?: StatusDisplayOverride | null
): StatusDisplaySettings {
  const admin = sanitizeStatusDisplayDefaults(adminDefaults) ?? {};
  const player = playerOverride ?? {};

  const rawLayout =
    player.badgeLayout ??
    admin.badgeLayout ??
    BUILTIN_STATUS_DISPLAY_DEFAULTS.badgeLayout;
  const rawPhoneRows =
    player.phoneRows ??
    admin.phoneRows ??
    BUILTIN_STATUS_DISPLAY_DEFAULTS.phoneRows;
  const rawDesktopRows =
    player.desktopRows ??
    admin.desktopRows ??
    BUILTIN_STATUS_DISPLAY_DEFAULTS.desktopRows;
  const rawPlayerPhoneRows =
    player.playerPhoneRows ??
    admin.playerPhoneRows ??
    BUILTIN_STATUS_DISPLAY_DEFAULTS.playerPhoneRows;
  const rawPlayerDesktopRows =
    player.playerDesktopRows ??
    admin.playerDesktopRows ??
    BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows;

  return {
    badgeLayout: sanitizeStatusBadgeLayout(
      rawLayout,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.badgeLayout
    ),
    phoneRows: clampStatusAreaRows(
      rawPhoneRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.phoneRows
    ),
    desktopRows: clampStatusAreaRows(
      rawDesktopRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.desktopRows
    ),
    playerPhoneRows: clampPlayerStatusRows(
      rawPlayerPhoneRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.playerPhoneRows
    ),
    playerDesktopRows: clampPlayerStatusRows(
      rawPlayerDesktopRows,
      BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows
    ),
  };
}

export function isPhoneWidthViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= PHONE_MAX_WIDTH_PX;
}

export function useIsPhoneWidth(): boolean {
  const [isPhone, setIsPhone] = useState<boolean>(() => isPhoneWidthViewport());

  useEffect(() => {
    const sync = () => setIsPhone(isPhoneWidthViewport());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return isPhone;
}

export function useStatusDisplaySettings(
  adminDefaults?: StatusDisplayDefaults | null
): {
  settings: StatusDisplaySettings;
  override: StatusDisplayOverride;
  hasOverride: boolean;
  isPhoneWidth: boolean;
  activeUnitRows: number;
  activePlayerRows: number;
  updateOverride: (patch: Partial<StatusDisplayOverride>) => void;
  resetToDefaults: () => void;
} {
  const [override, setOverride] = useState<StatusDisplayOverride>(() =>
    readStatusDisplayOverride()
  );
  const isPhoneWidth = useIsPhoneWidth();

  useEffect(() => {
    const sync = () => setOverride(readStatusDisplayOverride());
    const unsub = subscribeStatusDisplayPrefs(sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STATUS_DISPLAY_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const settings = resolveEffectiveStatusDisplaySettings(adminDefaults, override);

  return {
    settings,
    override,
    hasOverride: Object.keys(override).length > 0,
    isPhoneWidth,
    activeUnitRows: isPhoneWidth ? settings.phoneRows : settings.desktopRows,
    activePlayerRows: isPhoneWidth
      ? settings.playerPhoneRows
      : settings.playerDesktopRows,
    updateOverride: (patch) => {
      const next = updateStatusDisplayOverride(patch);
      setOverride(next);
    },
    resetToDefaults: () => {
      clearStatusDisplayOverride();
      setOverride({});
    },
  };
}
