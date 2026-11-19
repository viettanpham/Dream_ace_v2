import { useEffect, useState } from 'react';
import type { CombatRow, CombatUnit, FloatingPopup } from '../types/game';

export type BattleLayoutMode = 'phone-portrait' | 'tablet' | 'pc';

export type RowExposureState = 'exposed' | 'protected' | 'empty';

export interface PopupAnchorPoint {
  x: number;
  y: number;
}

export interface StaggeredPopupLayout {
  popup: FloatingPopup;
  leftPct: number;
  topPct: number;
  delayMs: number;
  durationMs: number;
  slotIndex: number;
}

export interface StaggeredPopupOptions {
  maxVisible?: number;
  verticalStepPct?: number;
  staggerDelayMs?: number;
  durationMs?: number;
  baseOffsetYPct?: number;
  horizontalSpreadPct?: number;
}

/**
 * Pure responsive layout classifier for the Battle Screen.
 * - Portrait phone (width < 600 and NOT landscape phone) -> 'phone-portrait'
 * - Landscape phone (width > height && height <= 500) -> 'pc' (per spec: landscape phone uses PC layout)
 * - Tablet (600..1023) -> 'tablet'
 * - PC (>= 1024) -> 'pc'
 */
export function getBattleLayoutMode(
  width: number,
  height: number
): BattleLayoutMode {
  const safeW = Number.isFinite(width) && width > 0 ? width : 1024;
  const safeH = Number.isFinite(height) && height > 0 ? height : 768;

  if (safeW > safeH && safeH <= 500) {
    return 'pc';
  }
  if (safeW < 600) {
    return 'phone-portrait';
  }
  if (safeW < 1024) {
    return 'tablet';
  }
  return 'pc';
}

export function useBattleLayoutMode(): BattleLayoutMode {
  const [mode, setMode] = useState<BattleLayoutMode>(() => {
    if (typeof window === 'undefined') return 'pc';
    return getBattleLayoutMode(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setMode(getBattleLayoutMode(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return mode;
}

/**
 * Pure short-name formatter for compact battle tokens and phone turn queue chips.
 * - Normalizes whitespace into a single line (no wrap).
 * - Guarantees output length <= maxLen (default 10).
 * - Uses single ellipsis character '…' when truncated.
 */
export function formatShortUnitName(name: string, maxLen = 10): string {
  const limit = Math.max(1, Math.floor(maxLen));
  const cleaned = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= limit) return cleaned;
  if (limit === 1) return '…';
  const head = cleaned.slice(0, limit - 1).trimEnd();
  return `${head}…`;
}

/**
 * Computes which rows on a side are currently 'exposed' (nearest non-empty row),
 * 'protected' (alive units behind a closer non-empty row), or 'empty'.
 * Mirrors the combat engine's front -> middle -> back targeting order for display only.
 */
export function computeRowExposure(
  units: CombatUnit[],
  side: 'ally' | 'enemy'
): Record<CombatRow, RowExposureState> {
  const rows: CombatRow[] = ['front', 'middle', 'back'];
  const result: Record<CombatRow, RowExposureState> = {
    front: 'empty',
    middle: 'empty',
    back: 'empty',
  };

  let foundExposed = false;
  for (const row of rows) {
    const hasAlive = units.some(
      (u) => u.side === side && u.row === row && u.alive
    );
    if (!hasAlive) {
      result[row] = 'empty';
    } else if (!foundExposed) {
      result[row] = 'exposed';
      foundExposed = true;
    } else {
      result[row] = 'protected';
    }
  }

  return result;
}

/**
 * Pure damage/status popup layout function.
 * - Caps simultaneous visible popups (default 6, keeping newest).
 * - Places popups above the unit body (never covering the unit silhouette/HP bar).
 * - Staggers multiple popups on the same unit (or nearby units) vertically and by time
 *   so floating numbers never overlap each other.
 * - Sets a crisp 800ms fade duration.
 */
export function layoutStaggeredPopups(
  popups: FloatingPopup[],
  posMap: Map<string, PopupAnchorPoint>,
  vw: number,
  vh: number,
  options?: StaggeredPopupOptions
): StaggeredPopupLayout[] {
  const maxVisible = Math.max(1, options?.maxVisible ?? 6);
  const verticalStepPct = options?.verticalStepPct ?? 7.5;
  const staggerDelayMs = options?.staggerDelayMs ?? 110;
  const durationMs = options?.durationMs ?? 800;
  const baseOffsetYPct = options?.baseOffsetYPct ?? 11;
  const horizontalSpreadPct = options?.horizontalSpreadPct ?? 3.5;

  const safeVw = Math.max(1, vw);
  const safeVh = Math.max(1, vh);

  const anchored = popups.filter((p) => posMap.has(p.unitId));
  const capped =
    anchored.length > maxVisible
      ? anchored.slice(anchored.length - maxVisible)
      : anchored;

  const unitSlotCounts = new Map<string, number>();
  const placed: StaggeredPopupLayout[] = [];

  for (const popup of capped) {
    const pos = posMap.get(popup.unitId)!;
    const slotIndex = unitSlotCounts.get(popup.unitId) ?? 0;
    unitSlotCounts.set(popup.unitId, slotIndex + 1);

    const rawLeftPct = (pos.x / safeVw) * 100;
    const rawTopPct = (pos.y / safeVh) * 100;

    // Slight alternating horizontal offset for stacked numbers on the same unit
    const horizontalShift =
      slotIndex === 0
        ? 0
        : (slotIndex % 2 === 1 ? 1 : -1) * horizontalSpreadPct;

    let leftPct = Math.max(10, Math.min(90, rawLeftPct + horizontalShift));
    let topPct = Math.max(
      4,
      Math.min(86, rawTopPct - baseOffsetYPct - slotIndex * verticalStepPct)
    );

    // Avoid cross-unit collision if two adjacent units pop simultaneously
    let guard = 0;
    while (
      guard < 5 &&
      placed.some(
        (other) =>
          Math.abs(other.leftPct - leftPct) < 9 &&
          Math.abs(other.topPct - topPct) < 5.5
      )
    ) {
      topPct = Math.max(4, topPct - verticalStepPct);
      if (topPct <= 4.1) {
        leftPct = Math.max(
          10,
          Math.min(90, leftPct + (guard % 2 === 0 ? 10 : -10))
        );
      }
      guard += 1;
    }

    placed.push({
      popup,
      leftPct: Number(leftPct.toFixed(2)),
      topPct: Number(topPct.toFixed(2)),
      delayMs: slotIndex * staggerDelayMs,
      durationMs,
      slotIndex,
    });
  }

  return placed;
}
