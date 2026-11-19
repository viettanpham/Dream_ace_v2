import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { HelpCircle, Radio, X } from 'lucide-react';
import { getTeamColorRole, hasStatus } from '../engine/combat';
import { getClassName, getStatusLabel, useI18n } from '../i18n';
import type {
  ActiveStatusEffect,
  BattleSpeed,
  BattleState,
  CombatFxEvent,
  CombatRow,
  CombatUnit,
  FloatingPopup,
  MechClassId,
  TeamColorRole,
} from '../types/game';
import {
  computeDefeatFadeDurationMs,
  computeHitFlashDurationMs,
  computeRadarFxDurationMs,
  computeRowExposure,
  computeSpeechBubbleAnchor,
  evaluateRadarTargetValidity,
  formatShortUnitName,
  formatSpeechBubbleText,
  getRadarHitAreaSize,
  isCompactPopupTone,
  layoutStaggeredPopups,
  readRadarLegendOpen,
  SPEECH_BUBBLE_DURATION_MS,
  SPEECH_BUBBLE_MAX_CHARS,
  useBattleLayoutMode,
  usePrefersReducedMotion,
  writeRadarLegendOpen,
  type BattleLayoutMode,
  type RowExposureState,
  type TargetInvalidReason,
  type TargetValidityResult,
} from '../utils/battleDisplay';

interface BattleRadarViewProps {
  battle: BattleState;
  activeUnitId: string | null;
  validBasicTargetIds: Set<string>;
  canPlayerManualAct: boolean;
  hasSingleAllySkill: boolean;
  autoBattleEnabled: boolean;
  skipAnimations: boolean;
  speechBubblesEnabled?: boolean;
  battleSpeed?: BattleSpeed;
  layoutMode?: BattleLayoutMode;
  onSelectEnemy: (unitId: string) => void;
  onSelectAlly: (unitId: string) => void;
  onInspectUnit: (unit: CombatUnit) => void;
}

interface TokenPos {
  x: number;
  y: number;
}

interface RowLaneRect {
  side: 'ally' | 'enemy';
  row: CombatRow;
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
  badgeX: number;
  badgeY: number;
  badgeAnchor: 'start' | 'middle' | 'end';
}

type MarkerShapeKind =
  | 'player-hex'
  | 'ally-circle'
  | 'enemy-diamond'
  | 'boss-fortress';

const STAR_DOTS = [
  { x: 12, y: 16, r: 1.1, delay: '0s' },
  { x: 28, y: 72, r: 1.3, delay: '1.2s' },
  { x: 46, y: 22, r: 0.9, delay: '2.4s' },
  { x: 64, y: 84, r: 1.2, delay: '0.7s' },
  { x: 82, y: 28, r: 1.4, delay: '1.9s' },
  { x: 91, y: 64, r: 1.0, delay: '3.1s' },
  { x: 18, y: 48, r: 1.0, delay: '2.8s' },
  { x: 74, y: 51, r: 1.2, delay: '0.4s' },
];

function getTeamHex(role: TeamColorRole): string {
  switch (role) {
    case 'me':
      return '#22c55e';
    case 'ally':
      return '#38bdf8';
    case 'boss':
      return '#f97316';
    case 'enemy':
    default:
      return '#ef4444';
  }
}

function getMarkerShape(unit: CombatUnit): MarkerShapeKind {
  if (unit.side === 'ally') {
    return unit.isPlayer ? 'player-hex' : 'ally-circle';
  }
  return unit.isBoss || unit.isStructure ? 'boss-fortress' : 'enemy-diamond';
}

function getStatusColor(st: ActiveStatusEffect): string {
  switch (st.type) {
    case 'burn':
      return '#fb923c';
    case 'shield_break':
    case 'def_down':
    case 'vulnerable':
      return '#f87171';
    case 'slow':
      return '#22d3ee';
    case 'silence':
      return '#e879f9';
    case 'stealth':
      return '#c084fc';
    case 'siege_mode':
    case 'siege_defense':
    case 'charging':
      return '#fbbf24';
    case 'invincible':
    case 'evade_all':
    case 'regen_hp':
      return '#34d399';
    default:
      return '#38bdf8';
  }
}

function getStatusGlyph(st: ActiveStatusEffect): string {
  switch (st.type) {
    case 'burn':
      return 'F';
    case 'shield_break':
    case 'def_down':
    case 'vulnerable':
      return '!';
    case 'slow':
      return 'S';
    case 'silence':
      return 'X';
    case 'stealth':
      return 'H';
    case 'siege_mode':
    case 'siege_defense':
    case 'charging':
      return '⚡';
    case 'invincible':
    case 'evade_all':
    case 'regen_hp':
      return '+';
    default:
      return '▲';
  }
}

function getPopupColorClass(tone: FloatingPopup['tone']): string {
  switch (tone) {
    case 'crit':
      return 'text-amber-300';
    case 'damage':
      return 'text-red-400';
    case 'shield':
      return 'text-sky-300';
    case 'heal':
      return 'text-emerald-300';
    case 'evade':
      return 'text-slate-200';
    case 'buff':
      return 'text-sky-200';
    case 'status':
      return 'text-orange-300';
  }
}

function getPolygonPoints(sides: number, radius: number, offsetDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i += 1) {
    const rad = ((offsetDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(
      `${(Math.cos(rad) * radius).toFixed(2)},${(Math.sin(rad) * radius).toFixed(2)}`
    );
  }
  return pts.join(' ');
}

function getDiamondPoints(radius: number): string {
  const r = radius * 1.1;
  return `0,${(-r).toFixed(2)} ${r.toFixed(2)},0 0,${r.toFixed(2)} ${(-r).toFixed(2)},0`;
}

function getFortressPoints(radius: number): string {
  const half = radius * 0.96;
  const cham = radius * 0.34;
  return `${(-half + cham).toFixed(2)},${(-half).toFixed(2)} ${(half - cham).toFixed(2)},${(-half).toFixed(2)} ${half.toFixed(2)},${(-half + cham).toFixed(2)} ${half.toFixed(2)},${(half - cham).toFixed(2)} ${(half - cham).toFixed(2)},${half.toFixed(2)} ${(-half + cham).toFixed(2)},${half.toFixed(2)} ${(-half).toFixed(2)},${(half - cham).toFixed(2)} ${(-half).toFixed(2)},${(-half + cham).toFixed(2)}`;
}

const ClassCenterIcon = memo(function ClassCenterIcon({
  classId,
  isStructure,
  isBoss,
  color,
  facingAngle,
  scale = 1,
}: {
  classId: MechClassId;
  isStructure?: boolean;
  isBoss?: boolean;
  color: string;
  facingAngle: number;
  scale?: number;
}) {
  const tx = `scale(${scale.toFixed(2)}) rotate(${facingAngle})`;
  if (isStructure || isBoss) {
    return (
      <g transform={tx}>
        <rect
          x="-5.5"
          y="-5.5"
          width="11"
          height="11"
          rx="1.5"
          fill={color}
          fillOpacity="0.28"
          stroke={color}
          strokeWidth="1.5"
        />
        <line
          x1="0"
          y1="-2"
          x2="0"
          y2="-9.5"
          stroke="#f8fafc"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="0" cy="0" r="2.4" fill="#f8fafc" />
      </g>
    );
  }

  switch (classId) {
    case 'interceptor':
      return (
        <g transform={tx}>
          <polygon
            points="0,-9 6.6,6.6 0,3.4 -6.6,6.6"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <polygon points="0,-6 2,2 0,0.9 -2,2" fill="#f8fafc" />
        </g>
      );
    case 'siege':
      return (
        <g transform={tx}>
          <polygon
            points="-2,-9.5 2,-9.5 3,-2.3 7,-1 7,6.5 -7,6.5 -7,-1 -3,-2.3"
            fill={color}
            fillOpacity="0.32"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect x="-1.2" y="-8.8" width="2.4" height="7.8" fill="#f8fafc" />
        </g>
      );
    case 'support':
      return (
        <g transform={tx}>
          <circle
            cx="0"
            cy="0"
            r="6.5"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.4"
          />
          <rect x="-8.6" y="-2.5" width="2" height="5" rx="0.9" fill={color} />
          <rect x="6.6" y="-2.5" width="2" height="5" rx="0.9" fill={color} />
          <path
            d="M 0 -3.5 V 3.5 M -3.5 0 H 3.5"
            stroke="#f8fafc"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
      );
    case 'striker':
    default:
      return (
        <g transform={tx}>
          <polygon
            points="0,-8.5 3,-1.8 8.8,3 8.2,6.5 2,4.2 0,7.2 -2,4.2 -8.2,6.5 -8.8,3 -3,-1.8"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="0" cy="-1.2" r="1.8" fill="#f8fafc" />
        </g>
      );
  }
});

/**
 * Builds 3-row lanes per side with content-aware widths/heights so populated rows fill
 * the field comfortably and empty rows shrink instead of leaving large empty gaps.
 */
function buildRowLanes(
  isLandscape: boolean,
  vw: number,
  vh: number,
  units: CombatUnit[]
): RowLaneRect[] {
  const hasUnits = (side: 'ally' | 'enemy', row: CombatRow) =>
    units.some((u) => u.side === side && u.row === row);

  const distribute = (
    totalSpan: number,
    gap: number,
    weights: number[]
  ): number[] => {
    const usable = Math.max(60, totalSpan - gap * (weights.length - 1));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    return weights.map((w) => (usable * w) / sum);
  };

  if (isLandscape) {
    const padX = 10;
    const centerGap = 16;
    const laneGap = 5;
    const halfW = (vw - padX * 2 - centerGap) / 2;
    const y = 8;
    const h = vh - 16;

    const allyRows: CombatRow[] = ['back', 'middle', 'front'];
    const enemyRows: CombatRow[] = ['front', 'middle', 'back'];

    const allyWeights = allyRows.map((r) => (hasUnits('ally', r) ? 1.28 : 0.56));
    const enemyWeights = enemyRows.map((r) =>
      hasUnits('enemy', r) ? 1.28 : 0.56
    );
    const allyWidths = distribute(halfW, laneGap, allyWeights);
    const enemyWidths = distribute(halfW, laneGap, enemyWeights);

    const lanes: RowLaneRect[] = [];
    let curX = padX;
    allyRows.forEach((row, i) => {
      const colW = allyWidths[i];
      lanes.push({
        side: 'ally',
        row,
        x: curX,
        y,
        w: colW,
        h,
        labelX: curX + colW / 2,
        labelY: y + 13,
        labelAnchor: 'middle',
        badgeX: curX + colW / 2,
        badgeY: y + 24,
        badgeAnchor: 'middle',
      });
      curX += colW + laneGap;
    });

    curX = padX + halfW + centerGap;
    enemyRows.forEach((row, i) => {
      const colW = enemyWidths[i];
      lanes.push({
        side: 'enemy',
        row,
        x: curX,
        y,
        w: colW,
        h,
        labelX: curX + colW / 2,
        labelY: y + 13,
        labelAnchor: 'middle',
        badgeX: curX + colW / 2,
        badgeY: y + 24,
        badgeAnchor: 'middle',
      });
      curX += colW + laneGap;
    });

    return lanes;
  }

  // Portrait 6 horizontal bands: Enemy Back -> Middle -> Front || Ally Front -> Middle -> Back
  const padX = 8;
  const padY = 8;
  const centerGap = 12;
  const laneGap = 4;
  const halfH = (vh - padY * 2 - centerGap) / 2;
  const w = vw - padX * 2;

  const enemyRows: CombatRow[] = ['back', 'middle', 'front'];
  const allyRows: CombatRow[] = ['front', 'middle', 'back'];

  const enemyHeights = distribute(
    halfH,
    laneGap,
    enemyRows.map((r) => (hasUnits('enemy', r) ? 1.26 : 0.58))
  );
  const allyHeights = distribute(
    halfH,
    laneGap,
    allyRows.map((r) => (hasUnits('ally', r) ? 1.26 : 0.58))
  );

  const lanes: RowLaneRect[] = [];
  let curY = padY;
  enemyRows.forEach((row, i) => {
    const rowH = enemyHeights[i];
    lanes.push({
      side: 'enemy',
      row,
      x: padX,
      y: curY,
      w,
      h: rowH,
      labelX: padX + 7,
      labelY: curY + 11,
      labelAnchor: 'start',
      badgeX: padX + w - 7,
      badgeY: curY + 11,
      badgeAnchor: 'end',
    });
    curY += rowH + laneGap;
  });

  curY = padY + halfH + centerGap;
  allyRows.forEach((row, i) => {
    const rowH = allyHeights[i];
    lanes.push({
      side: 'ally',
      row,
      x: padX,
      y: curY,
      w,
      h: rowH,
      labelX: padX + 7,
      labelY: curY + 11,
      labelAnchor: 'start',
      badgeX: padX + w - 7,
      badgeY: curY + 11,
      badgeAnchor: 'end',
    });
    curY += rowH + laneGap;
  });

  return lanes;
}

function computeUnitPositions(
  units: CombatUnit[],
  lanes: RowLaneRect[],
  isLandscape: boolean
): Map<string, TokenPos> {
  const map = new Map<string, TokenPos>();

  for (const lane of lanes) {
    const rowUnits = units
      .filter((u) => u.side === lane.side && u.row === lane.row)
      .sort((a, b) => (a.formationCol ?? 0) - (b.formationCol ?? 0));

    const count = rowUnits.length;
    if (count === 0) continue;

    rowUnits.forEach((unit, idx) => {
      const frac = (idx + 0.5) / count;
      if (isLandscape) {
        const topSafe = lane.y + 34;
        const bottomSafe = lane.y + lane.h - 26;
        const x = lane.x + lane.w / 2;
        const y = topSafe + frac * Math.max(20, bottomSafe - topSafe);
        map.set(unit.id, { x, y });
      } else {
        const leftSafe = lane.x + 32;
        const rightSafe = lane.x + lane.w - 32;
        const x = leftSafe + frac * Math.max(20, rightSafe - leftSafe);
        const y = lane.y + lane.h * 0.54;
        map.set(unit.id, { x, y });
      }
    });
  }

  return map;
}

function resolveFxEndpoints(
  fx: CombatFxEvent,
  battle: BattleState,
  posMap: Map<string, TokenPos>
): { from: TokenPos | null; targets: Array<{ id: string; pos: TokenPos }> } {
  const fromSideUnits = battle.units.filter((u) => u.side === fx.fromSide);
  const toSideUnits = battle.units.filter((u) => u.side === fx.toSide);

  const fromId = fx.fromUnitId ?? fromSideUnits[fx.fromSlotIndex]?.id;
  const from = fromId ? posMap.get(fromId) ?? null : null;

  const targetIds =
    fx.toUnitIds && fx.toUnitIds.length > 0
      ? fx.toUnitIds
      : fx.toSlotIndices
          .map((idx) => toSideUnits[idx]?.id)
          .filter((id): id is string => Boolean(id));

  const targets = targetIds
    .map((id) => {
      const pos = posMap.get(id);
      return pos ? { id, pos } : null;
    })
    .filter((entry): entry is { id: string; pos: TokenPos } => Boolean(entry));

  return { from, targets };
}

interface RadarUnitMarkerProps {
  unit: CombatUnit;
  x: number;
  y: number;
  idx: number;
  tokenRadius: number;
  hitSize: number;
  barW: number;
  facingAngle: number;
  isActive: boolean;
  isTargeted: boolean;
  isBlockedByRow: boolean;
  isHitFlashing: boolean;
  isDefeatFading: boolean;
  hitFlashDurationMs: number;
  defeatFadeDurationMs: number;
  autoBattleEnabled: boolean;
  animationsSkipped: boolean;
  hoverTooltip: string;
  autoBadgeText: string;
  onTap: (unitId: string) => void;
  onLongPressStart: (unitId: string) => void;
  onLongPressCancel: () => void;
}

const RadarUnitMarker = memo(function RadarUnitMarker({
  unit,
  x,
  y,
  idx,
  tokenRadius,
  hitSize,
  barW,
  facingAngle,
  isActive,
  isTargeted,
  isBlockedByRow,
  isHitFlashing,
  isDefeatFading,
  hitFlashDurationMs,
  defeatFadeDurationMs,
  autoBattleEnabled,
  animationsSkipped,
  hoverTooltip,
  autoBadgeText,
  onTap,
  onLongPressStart,
  onLongPressCancel,
}: RadarUnitMarkerProps) {
  const isEnemy = unit.side === 'enemy';
  const role = getTeamColorRole(unit);
  const teamHex = unit.alive ? getTeamHex(role) : '#475569';
  const shape = getMarkerShape(unit);
  const isStealthed = unit.alive && hasStatus(unit, 'stealth');

  const shortName = formatShortUnitName(unit.name, 10);

  // Down units draw smaller & dimmer so they do not clutter active lanes
  const visualRadius = unit.alive
    ? tokenRadius
    : Math.max(9, Math.round(tokenRadius * 0.52));

  const hpRatio = Math.max(
    0,
    Math.min(1, unit.hp / Math.max(1, unit.derived.maxHp))
  );
  const shdRatio = Math.max(
    0,
    Math.min(1, unit.shield / Math.max(1, unit.derived.maxShield))
  );
  const hpFillColor = !unit.alive
    ? '#475569'
    : hpRatio <= 0.25
    ? '#ef4444'
    : hpRatio <= 0.55
    ? '#fb923c'
    : '#22c55e';

  const visibleStatuses = unit.alive ? unit.statuses.slice(0, 2) : [];
  const extraStatuses = unit.alive ? Math.max(0, unit.statuses.length - 2) : 0;

  const markerOpacity = !unit.alive
    ? 0.26
    : isStealthed
    ? 0.55
    : isBlockedByRow
    ? 0.56
    : 1;

  const iconScale = Math.max(0.85, Math.min(1.3, visualRadius / 20));
  const hexOuter = getPolygonPoints(6, visualRadius + 0.5, -90);
  const hexInner = getPolygonPoints(6, Math.max(6, visualRadius - 3.2), -90);
  const diamondOuter = getDiamondPoints(visualRadius);
  const diamondInner = getDiamondPoints(Math.max(6, visualRadius - 3.5));
  const fortressOuter = getFortressPoints(visualRadius);
  const fortressInner = getFortressPoints(Math.max(6, visualRadius - 3.6));

  return (
    <g
      data-testid={`radar-unit-${unit.id}`}
      data-unit-row={unit.row}
      data-unit-side={unit.side}
      data-marker-shape={shape}
      data-visual-radius={visualRadius}
      data-acting={isActive ? 'true' : 'false'}
      data-targeted={isTargeted ? 'true' : 'false'}
      data-blocked-by-row={isBlockedByRow ? 'true' : 'false'}
      data-unit-down={!unit.alive ? 'true' : 'false'}
      transform={`translate(${x}, ${y})`}
      role="button"
      tabIndex={0}
      aria-label={hoverTooltip}
      aria-disabled={!unit.alive ? 'true' : undefined}
      onClick={() => onTap(unit.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap(unit.id);
        }
      }}
      onPointerDown={() => onLongPressStart(unit.id)}
      onPointerUp={onLongPressCancel}
      onPointerCancel={onLongPressCancel}
      onPointerLeave={onLongPressCancel}
      className={
        !unit.alive
          ? 'cursor-not-allowed focus:outline-none'
          : 'cursor-pointer focus:outline-none'
      }
    >
      <title>{hoverTooltip}</title>

      {/* Invisible >= 44px hit target area (independent of visual icon radius) */}
      <rect
        data-testid={`radar-hit-area-${unit.id}`}
        data-hit-size={hitSize}
        x={-hitSize / 2}
        y={-hitSize / 2}
        width={hitSize}
        height={hitSize}
        rx={hitSize / 2}
        fill="transparent"
      />

      {/* Core visual body with dimmed/down opacity */}
      <g opacity={markerOpacity}>
        <g
          className={
            unit.alive && !animationsSkipped ? 'anim-token-hover' : undefined
          }
          style={
            unit.alive && !animationsSkipped
              ? { animationDelay: `${(idx % 5) * 0.4}s` }
              : undefined
          }
        >
          {/* Acting Unit Ring (distinct gold-white halo) */}
          {isActive && unit.alive && (
            <circle
              data-testid={`radar-acting-ring-${unit.id}`}
              cx="0"
              cy="0"
              r={visualRadius + 7}
              fill="rgba(254, 240, 138, 0.14)"
              stroke="#fef08a"
              strokeWidth="2.4"
            />
          )}

          {/* Current Target Ring (distinct dashed/reticle ring) */}
          {isTargeted && unit.alive && (
            <g
              data-testid={`radar-target-ring-${unit.id}`}
              className={animationsSkipped ? undefined : 'anim-reticle-pulse'}
            >
              <circle
                cx="0"
                cy="0"
                r={visualRadius + 6}
                fill="none"
                stroke={isEnemy ? '#f87171' : '#34d399'}
                strokeWidth="1.6"
                strokeDasharray="4 3"
              />
              <path
                d={`M ${-visualRadius - 7} ${-visualRadius + 2} V ${-visualRadius - 7} H ${-visualRadius + 2}
                    M ${visualRadius - 2} ${-visualRadius - 7} H ${visualRadius + 7} V ${-visualRadius + 2}
                    M ${visualRadius + 7} ${visualRadius - 2} V ${visualRadius + 7} H ${visualRadius - 2}
                    M ${-visualRadius + 2} ${visualRadius + 7} H ${-visualRadius - 7} V ${visualRadius - 2}`}
                fill="none"
                stroke={isEnemy ? '#ef4444' : '#22c55e'}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Defending / Invincible Shield Aura */}
          {unit.alive &&
            (unit.isDefending || hasStatus(unit, 'invincible')) && (
              <circle
                cx="0"
                cy="0"
                r={visualRadius + 4}
                fill="rgba(56, 189, 248, 0.14)"
                stroke="#38bdf8"
                strokeWidth="1.4"
                strokeDasharray="3 3"
              />
            )}

          {/* Color-blind readable team shape + outline */}
          {shape === 'player-hex' && (
            <g>
              <polygon
                points={hexOuter}
                fill={unit.alive ? '#0a1622' : '#0b1019'}
                stroke={isActive ? '#fef08a' : teamHex}
                strokeWidth={isActive ? '2.4' : unit.alive ? '2' : '1.2'}
                strokeLinejoin="round"
              />
              {unit.alive && (
                <polygon
                  points={hexInner}
                  fill="none"
                  stroke={teamHex}
                  strokeOpacity="0.55"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              )}
            </g>
          )}

          {shape === 'ally-circle' && (
            <circle
              cx="0"
              cy="0"
              r={visualRadius}
              fill={unit.alive ? '#0b1320' : '#0b1019'}
              stroke={isActive ? '#fef08a' : teamHex}
              strokeWidth={isActive ? '2.2' : unit.alive ? '1.8' : '1.2'}
              strokeDasharray={isStealthed ? '3 2' : undefined}
            />
          )}

          {shape === 'enemy-diamond' && (
            <g>
              <polygon
                points={diamondOuter}
                fill={unit.alive ? '#140b12' : '#0b1019'}
                stroke={isActive ? '#fef08a' : teamHex}
                strokeWidth={isActive ? '2.2' : unit.alive ? '1.9' : '1.2'}
                strokeDasharray={isStealthed ? '3 2' : undefined}
                strokeLinejoin="miter"
              />
              {unit.alive && (
                <polygon
                  points={diamondInner}
                  fill="none"
                  stroke={teamHex}
                  strokeOpacity="0.45"
                  strokeWidth="0.9"
                  strokeDasharray="2 2"
                />
              )}
            </g>
          )}

          {shape === 'boss-fortress' && (
            <g>
              <polygon
                points={fortressOuter}
                fill={unit.alive ? '#170f0c' : '#0b1019'}
                stroke={isActive ? '#fef08a' : teamHex}
                strokeWidth={isActive ? '2.4' : unit.alive ? '2.1' : '1.2'}
                strokeLinejoin="miter"
              />
              {unit.alive && (
                <polygon
                  points={fortressInner}
                  fill="none"
                  stroke={teamHex}
                  strokeOpacity="0.6"
                  strokeWidth="1.1"
                />
              )}
            </g>
          )}

          {/* Center Role Icon or small dim Down X */}
          {unit.alive ? (
            <ClassCenterIcon
              classId={unit.classId}
              isStructure={unit.isStructure}
              isBoss={unit.isBoss}
              color={teamHex}
              facingAngle={facingAngle}
              scale={iconScale}
            />
          ) : (
            <path
              d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
              stroke="#64748b"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          )}

          {/* Up to 2 Status Icons (+N when more) */}
          {visibleStatuses.length > 0 && (
            <g
              data-testid={`radar-status-${unit.id}`}
              transform={`translate(${visualRadius - 4}, ${-visualRadius + 1})`}
            >
              {visibleStatuses.map((st, sIdx) => (
                <g
                  key={`${st.type}-${sIdx}`}
                  data-testid={`radar-status-icon-${unit.id}-${sIdx}`}
                  transform={`translate(${sIdx * 12}, 0)`}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r="5.8"
                    fill="#050a12"
                    stroke={getStatusColor(st)}
                    strokeWidth="1.4"
                  />
                  <text
                    x="0"
                    y="2.7"
                    textAnchor="middle"
                    fontSize="7.4"
                    fontFamily="monospace"
                    fontWeight="800"
                    fill={getStatusColor(st)}
                  >
                    {getStatusGlyph(st)}
                  </text>
                </g>
              ))}
              {extraStatuses > 0 && (
                <text
                  data-testid={`radar-status-overflow-${unit.id}`}
                  x={visibleStatuses.length * 12 + 1}
                  y="2.8"
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="800"
                  fill="#e2e8f0"
                >
                  +{extraStatuses}
                </text>
              )}
            </g>
          )}

          {/* AUTO Badge on Player Token */}
          {unit.isPlayer && autoBattleEnabled && unit.alive && (
            <g transform={`translate(0, ${-visualRadius - 10})`}>
              <rect
                x="-15"
                y="-6"
                width="30"
                height="11"
                rx="3"
                fill="#22c55e"
              />
              <text
                x="0"
                y="2.2"
                textAnchor="middle"
                fontSize="7.5"
                fontFamily="monospace"
                fontWeight="800"
                fill="#020617"
              >
                {autoBadgeText}
              </text>
            </g>
          )}
        </g>

        {/* Alive: HP + Shield Bars + Name Plate | Down: Compact dim name only */}
        {unit.alive ? (
          <g transform={`translate(0, ${visualRadius + 5})`}>
            <rect
              x={-barW / 2}
              y="0"
              width={barW}
              height="3.8"
              rx="1.5"
              fill="#1e293b"
            />
            <g transform={`translate(${-barW / 2}, 0)`}>
              <rect
                x="0"
                y="0"
                width={barW}
                height="3.8"
                rx="1.5"
                fill={hpFillColor}
                style={{
                  transform: `scaleX(${hpRatio})`,
                  transformOrigin: '0px 0px',
                }}
              />
            </g>

            <rect
              x={-barW / 2}
              y="4.8"
              width={barW}
              height="2.4"
              rx="1"
              fill="#1e293b"
            />
            {unit.derived.maxShield > 0 && (
              <g transform={`translate(${-barW / 2}, 4.8)`}>
                <rect
                  x="0"
                  y="0"
                  width={barW}
                  height="2.4"
                  rx="1"
                  fill={hasStatus(unit, 'shield_break') ? '#ef4444' : '#38bdf8'}
                  style={{
                    transform: `scaleX(${shdRatio})`,
                    transformOrigin: '0px 0px',
                  }}
                />
              </g>
            )}

            <rect
              x={-barW / 2 - 4}
              y="8.6"
              width={barW + 8}
              height="12.5"
              rx="3"
              fill="rgba(5, 10, 18, 0.9)"
            />
            <text
              data-testid="radar-unit-name"
              x="0"
              y="17.8"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="700"
              fill={isActive ? '#fef08a' : '#f1f5f9'}
            >
              {shortName}
            </text>
          </g>
        ) : (
          <text
            data-testid="radar-unit-name"
            x="0"
            y={visualRadius + 10}
            textAnchor="middle"
            fontSize="8"
            fontWeight="600"
            fill="#64748b"
          >
            {shortName}
          </text>
        )}
      </g>

      {/* Small Lock Icon when unit cannot be targeted because a front/middle row is alive */}
      {isBlockedByRow && unit.alive && (
        <g
          data-testid={`radar-lock-${unit.id}`}
          transform={`translate(${visualRadius - 1}, ${visualRadius - 2})`}
        >
          <circle
            cx="0"
            cy="0"
            r="7.5"
            fill="#090f1a"
            stroke="#fbbf24"
            strokeWidth="1.4"
          />
          <path
            d="M -2.5 -0.8 V -2.6 A 2.5 2.5 0 0 1 2.5 -2.6 V -0.8"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <rect
            x="-3.6"
            y="-0.8"
            width="7.2"
            height="5.2"
            rx="1"
            fill="#fbbf24"
          />
        </g>
      )}

      {/* Brief Hit Flash Overlay (transform/opacity only; skipped on reduced motion) */}
      {!animationsSkipped && isHitFlashing && (
        <g
          data-testid={`radar-hit-flash-${unit.id}`}
          className="pointer-events-none anim-radar-hit-flash"
          style={{ '--hit-dur': `${hitFlashDurationMs}ms` } as CSSProperties}
        >
          <circle
            cx="0"
            cy="0"
            r={visualRadius + 4}
            fill="rgba(255, 255, 255, 0.55)"
            stroke="#fef08a"
            strokeWidth="2.4"
          />
        </g>
      )}

      {/* Defeat Fade-Out Overlay (~400ms, transform/opacity only; skipped on reduced motion) */}
      {!animationsSkipped && isDefeatFading && (
        <g
          data-testid={`radar-defeat-fade-${unit.id}`}
          className="pointer-events-none anim-radar-defeat-fade"
          style={
            { '--defeat-dur': `${defeatFadeDurationMs}ms` } as CSSProperties
          }
        >
          <circle
            cx="0"
            cy="0"
            r={visualRadius + 5}
            fill="rgba(239, 68, 68, 0.25)"
            stroke="#f87171"
            strokeWidth="2.2"
          />
        </g>
      )}
    </g>
  );
});

export function BattleRadarView({
  battle,
  activeUnitId,
  validBasicTargetIds,
  canPlayerManualAct,
  hasSingleAllySkill,
  autoBattleEnabled,
  skipAnimations,
  speechBubblesEnabled = true,
  battleSpeed = 1,
  layoutMode: layoutModeProp,
  onSelectEnemy,
  onSelectAlly,
  onInspectUnit,
}: BattleRadarViewProps) {
  const { lang, t } = useI18n();
  const detectedMode = useBattleLayoutMode();
  const prefersReducedMotion = usePrefersReducedMotion();
  const layoutMode = layoutModeProp ?? detectedMode;
  const isLandscape = layoutMode !== 'phone-portrait';
  const animationsSkipped = skipAnimations || prefersReducedMotion;

  const [legendOpen, setLegendOpen] = useState<boolean>(() =>
    readRadarLegendOpen()
  );
  const [invalidToast, setInvalidToast] = useState<string | null>(null);
  const [fadingDefeatIds, setFadingDefeatIds] = useState<string[]>([]);
  const [visibleBubbleId, setVisibleBubbleId] = useState<string | null>(
    battle.wingmanChat?.id ?? null
  );

  const toastTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const prevAliveMapRef = useRef<Map<string, boolean>>(new Map());
  const defeatTimersRef = useRef<Map<string, number>>(new Map());

  const defeatFadeDurationMs = computeDefeatFadeDurationMs(battleSpeed);
  const hitFlashDurationMs = computeHitFlashDurationMs(battleSpeed);

  const toggleLegend = useCallback(() => {
    setLegendOpen((prev) => {
      const next = !prev;
      writeRadarLegendOpen(next);
      return next;
    });
  }, []);

  const showInvalidToast = useCallback((message: string) => {
    setInvalidToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setInvalidToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  // Auto-hide speech bubble after 1.5s cleanly even when rendered standalone
  useEffect(() => {
    const chatId = battle.wingmanChat?.id ?? null;
    if (!chatId || !speechBubblesEnabled) {
      setVisibleBubbleId(null);
      return;
    }
    setVisibleBubbleId(chatId);
    const timer = window.setTimeout(() => {
      setVisibleBubbleId((cur) => (cur === chatId ? null : cur));
    }, SPEECH_BUBBLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [battle.wingmanChat?.id, speechBubblesEnabled]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      defeatTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      defeatTimersRef.current.clear();
    };
  }, []);

  // Purely visual defeat fade-out tracker (~400ms scaled by speed); skipped under reduced motion
  useEffect(() => {
    const prevMap = prevAliveMapRef.current;
    const newlyDefeated: string[] = [];

    for (const u of battle.units) {
      const wasAlive = prevMap.get(u.id);
      if (wasAlive === true && !u.alive) {
        newlyDefeated.push(u.id);
      }
      prevMap.set(u.id, u.alive);
    }

    if (animationsSkipped || newlyDefeated.length === 0) return;

    setFadingDefeatIds((prev) => {
      const next = new Set(prev);
      for (const id of newlyDefeated) next.add(id);
      return Array.from(next);
    });

    for (const id of newlyDefeated) {
      const existing = defeatTimersRef.current.get(id);
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      const timerId = window.setTimeout(() => {
        setFadingDefeatIds((prev) => prev.filter((x) => x !== id));
        defeatTimersRef.current.delete(id);
      }, defeatFadeDurationMs + 40);
      defeatTimersRef.current.set(id, timerId);
    }
  }, [battle.units, animationsSkipped, defeatFadeDurationMs]);

  // Tighter viewBox so 4v4 fills the field well and 8v8 still fits with zero clipping
  const vw = isLandscape ? 720 : 380;
  const vh = isLandscape ? 420 : 500;
  const cx = vw / 2;
  const cy = vh / 2;

  const lanes = useMemo(
    () => buildRowLanes(isLandscape, vw, vh, battle.units),
    [isLandscape, vw, vh, battle.units]
  );

  const posMap = useMemo(
    () => computeUnitPositions(battle.units, lanes, isLandscape),
    [battle.units, lanes, isLandscape]
  );

  const enemyExposure = useMemo(
    () => computeRowExposure(battle.units, 'enemy'),
    [battle.units]
  );
  const allyExposure = useMemo(
    () => computeRowExposure(battle.units, 'ally'),
    [battle.units]
  );

  // Adaptive unit marker scaling: larger in 4v4 so units fill the field, clean fit in 8v8
  const maxUnitsInRow = useMemo(() => {
    const counts = new Map<string, number>();
    let max = 1;
    for (const u of battle.units) {
      const key = `${u.side}:${u.row}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next > max) max = next;
    }
    return max;
  }, [battle.units]);

  const tokenRadius = isLandscape
    ? maxUnitsInRow <= 2 && battle.squadSize <= 4
      ? 26
      : maxUnitsInRow <= 3
      ? 22
      : 19
    : maxUnitsInRow <= 2 && battle.squadSize <= 4
    ? 22
    : maxUnitsInRow <= 3
    ? 18
    : 16;

  const hitSize = getRadarHitAreaSize(isLandscape);
  const barW = isLandscape ? (tokenRadius >= 24 ? 62 : 56) : 52;

  // Active unit and targeting actor
  const activeUnit = useMemo(
    () => battle.units.find((u) => u.id === activeUnitId) ?? null,
    [battle.units, activeUnitId]
  );

  const targetingActor = useMemo(() => {
    if (activeUnit && activeUnit.side === 'ally' && activeUnit.alive) {
      return activeUnit;
    }
    return (
      battle.units.find((u) => u.isPlayer && u.alive) ??
      battle.units.find((u) => u.side === 'ally' && u.alive) ??
      null
    );
  }, [activeUnit, battle.units]);

  const enemyValidityMap = useMemo(() => {
    const map = new Map<string, TargetValidityResult>();
    for (const unit of battle.units) {
      if (unit.side !== 'enemy') continue;
      const result = evaluateRadarTargetValidity(
        battle.units,
        targetingActor,
        unit,
        'attack'
      );
      if (
        !result.ignoresRowBlocking &&
        result.valid &&
        validBasicTargetIds.size > 0 &&
        !validBasicTargetIds.has(unit.id)
      ) {
        map.set(unit.id, {
          ...result,
          valid: false,
          blockedByRow: true,
          reason:
            enemyExposure.front === 'exposed'
              ? 'front_row_alive'
              : 'middle_row_alive',
          blockingRow: enemyExposure.front === 'exposed' ? 'front' : 'middle',
        });
      } else {
        map.set(unit.id, result);
      }
    }
    return map;
  }, [battle.units, targetingActor, validBasicTargetIds, enemyExposure]);

  const fxHitTargetIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of battle.units) {
      if (u.animState === 'hit') set.add(u.id);
    }
    for (const fx of battle.fxEvents) {
      if (fx.kind === 'heal') continue;
      const { targets } = resolveFxEndpoints(fx, battle, posMap);
      for (const entry of targets) {
        set.add(entry.id);
      }
    }
    return set;
  }, [battle, posMap]);

  const defeatFadingSet = useMemo(() => {
    const set = new Set<string>(fadingDefeatIds);
    for (const id of battle.explodedUnitIds) {
      set.add(id);
    }
    return set;
  }, [fadingDefeatIds, battle.explodedUnitIds]);

  // All floating text (damage + buff/status like "WPN +30%") shares the same max-6 stagger queue
  const staggeredPopups = useMemo(
    () =>
      layoutStaggeredPopups(battle.popups, posMap, vw, vh, {
        maxVisible: 6,
        verticalStepPct: 6.2,
        staggerDelayMs: 110,
        durationMs: 800,
        baseOffsetYPct: 8,
      }),
    [battle.popups, posMap, vw, vh]
  );

  const getInvalidReasonMessage = useCallback(
    (reason: TargetInvalidReason | null): string => {
      switch (reason) {
        case 'front_row_alive':
          return t('radar.invalidFrontAlive');
        case 'middle_row_alive':
          return t('radar.invalidMiddleAlive');
        case 'stealthed':
          return t('radar.invalidStealthed');
        case 'unit_down':
          return t('radar.invalidDown');
        default:
          return t('radar.invalidFrontAlive');
      }
    },
    [t]
  );

  const interactionRef = useRef({
    battle,
    canPlayerManualAct,
    hasSingleAllySkill,
    enemyValidityMap,
    onSelectEnemy,
    onSelectAlly,
    onInspectUnit,
    showInvalidToast,
    getInvalidReasonMessage,
  });
  interactionRef.current = {
    battle,
    canPlayerManualAct,
    hasSingleAllySkill,
    enemyValidityMap,
    onSelectEnemy,
    onSelectAlly,
    onInspectUnit,
    showInvalidToast,
    getInvalidReasonMessage,
  };

  const handleTokenTap = useCallback((unitId: string) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    const ctx = interactionRef.current;
    const unit = ctx.battle.units.find((u) => u.id === unitId);
    if (!unit) return;

    const isEnemy = unit.side === 'enemy';
    const isEnemySelected = ctx.battle.selectedTargetId === unit.id;
    const isAllySelected = ctx.battle.selectedAllyTargetId === unit.id;

    if (!unit.alive) {
      if (ctx.canPlayerManualAct) {
        ctx.showInvalidToast(ctx.getInvalidReasonMessage('unit_down'));
      }
      return;
    }

    if (isEnemy && ctx.canPlayerManualAct) {
      const validity = ctx.enemyValidityMap.get(unit.id);
      if (validity && !validity.valid) {
        ctx.showInvalidToast(ctx.getInvalidReasonMessage(validity.reason));
        return;
      }
      if (!isEnemySelected) {
        ctx.onSelectEnemy(unit.id);
        return;
      }
    }

    if (
      !isEnemy &&
      ctx.hasSingleAllySkill &&
      ctx.canPlayerManualAct &&
      !isAllySelected
    ) {
      ctx.onSelectAlly(unit.id);
      return;
    }

    ctx.onInspectUnit(unit);
  }, []);

  const handleLongPressStart = useCallback((unitId: string) => {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      const ctx = interactionRef.current;
      const unit = ctx.battle.units.find((u) => u.id === unitId);
      if (unit) ctx.onInspectUnit(unit);
    }, 420);
  }, []);

  const handleLongPressCancel = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const aimArrow = useMemo(() => {
    if (battle.summary || !activeUnit || !activeUnit.alive) return null;
    const from = posMap.get(activeUnit.id);
    if (!from) return null;

    let targetUnit: CombatUnit | null = null;
    if (activeUnit.side === 'ally') {
      if (hasSingleAllySkill && battle.selectedAllyTargetId) {
        const allyTarget = battle.units.find(
          (u) => u.id === battle.selectedAllyTargetId && u.alive
        );
        if (allyTarget && allyTarget.id !== activeUnit.id) {
          targetUnit = allyTarget;
        }
      }
      if (!targetUnit && battle.selectedTargetId) {
        const enemyTarget = battle.units.find(
          (u) => u.id === battle.selectedTargetId && u.alive
        );
        if (enemyTarget) targetUnit = enemyTarget;
      }
    } else {
      const exposedAllyRow =
        allyExposure.front === 'exposed'
          ? 'front'
          : allyExposure.middle === 'exposed'
          ? 'middle'
          : 'back';
      targetUnit =
        battle.units.find(
          (u) => u.side === 'ally' && u.alive && u.row === exposedAllyRow
        ) ??
        battle.units.find((u) => u.side === 'ally' && u.alive) ??
        null;
    }

    if (!targetUnit || targetUnit.id === activeUnit.id) return null;
    const to = posMap.get(targetUnit.id);
    if (!to) return null;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const padStart = tokenRadius + 10;
    const padEnd = tokenRadius + 12;
    if (dist <= padStart + padEnd + 4) return null;

    const ux = dx / dist;
    const uy = dy / dist;
    return {
      x1: from.x + ux * padStart,
      y1: from.y + uy * padStart,
      x2: to.x - ux * padEnd,
      y2: to.y - uy * padEnd,
      isAllySupport: targetUnit.side === activeUnit.side,
      fromId: activeUnit.id,
      toId: targetUnit.id,
    };
  }, [
    battle.summary,
    battle.units,
    battle.selectedTargetId,
    battle.selectedAllyTargetId,
    activeUnit,
    hasSingleAllySkill,
    allyExposure,
    posMap,
    tokenRadius,
  ]);

  // Compact speech bubble (single short line <= 28 chars, collision-avoiding anchor, auto-hides after 1.5s, toggleable)
  const activeBubble = useMemo(() => {
    if (
      !speechBubblesEnabled ||
      !battle.wingmanChat ||
      visibleBubbleId !== battle.wingmanChat.id
    ) {
      return null;
    }
    const unit = battle.units.find(
      (u) => u.id === battle.wingmanChat?.unitId && u.alive
    );
    if (!unit) return null;
    const anchor = computeSpeechBubbleAnchor(unit.id, posMap, vw, vh);
    if (!anchor) return null;
    const rawMsg = t(battle.wingmanChat.textKey as Parameters<typeof t>[0]);
    const text = formatSpeechBubbleText(
      unit.name,
      rawMsg,
      SPEECH_BUBBLE_MAX_CHARS
    );
    return {
      id: battle.wingmanChat.id,
      text,
      fullText: `${unit.name}: ${rawMsg}`,
      leftPct: anchor.leftPct,
      topPct: anchor.topPct,
    };
  }, [
    speechBubblesEnabled,
    battle.wingmanChat,
    battle.units,
    visibleBubbleId,
    posMap,
    vw,
    vh,
    t,
  ]);

  const getRowLabel = (row: CombatRow) =>
    row === 'front'
      ? t('common.frontRow')
      : row === 'middle'
      ? t('common.middleRow')
      : t('common.backRow');

  const getExposureLabel = (state: RowExposureState) =>
    state === 'exposed'
      ? t('battle.rowExposed')
      : state === 'protected'
      ? t('battle.rowProtected')
      : t('battle.rowEmpty');

  const autoBadgeText = t('auto.badge');

  return (
    <div
      data-testid="battle-radar-container"
      data-animations-skipped={animationsSkipped ? 'true' : 'false'}
      style={{ touchAction: 'pan-y' }}
      className="relative flex-1 min-h-0 w-full h-full flex items-center justify-center overflow-hidden rounded-lg border border-slate-800/90 bg-[#050A12] select-none touch-pan-y"
    >
      {/* Main Tactical 3-Row Radar SVG — scales to fit with zero inner scroll & zero clipping */}
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: 'pan-y' }}
        className="w-full h-full touch-pan-y"
        role="img"
        aria-label={t('battle.viewRadar')}
      >
        <defs>
          <radialGradient id="radarBgGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0f2538" stopOpacity="0.6" />
            <stop offset="55%" stopColor="#07111d" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#04080f" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="radarSweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.14" />
          </linearGradient>
          <marker
            id="radarAimArrowEnemy"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#f87171" />
          </marker>
          <marker
            id="radarAimArrowAlly"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#34d399" />
          </marker>
        </defs>

        <rect x="0" y="0" width={vw} height={vh} fill="url(#radarBgGlow)" />

        {STAR_DOTS.map((st, idx) => (
          <circle
            key={idx}
            cx={(st.x / 100) * vw}
            cy={(st.y / 100) * vh}
            r={st.r}
            fill="#bae6fd"
            opacity="0.3"
            className={animationsSkipped ? undefined : 'anim-radar-star'}
            style={animationsSkipped ? undefined : { animationDelay: st.delay }}
          />
        ))}

        {[0.34, 0.66, 0.96].map((scale, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={Math.min(vw, vh) * 0.46 * scale}
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.08"
            strokeWidth="1"
            strokeDasharray={i === 1 ? '4 5' : undefined}
          />
        ))}

        {!animationsSkipped && (
          <g
            data-testid="radar-sweep-layer"
            className="anim-radar-sweep"
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          >
            <path
              d={`M ${cx} ${cy} L ${cx} ${cy - Math.max(vw, vh) * 0.52} A ${
                Math.max(vw, vh) * 0.52
              } ${Math.max(vw, vh) * 0.52} 0 0 1 ${
                cx + Math.max(vw, vh) * 0.22
              } ${cy - Math.max(vw, vh) * 0.46} Z`}
              fill="url(#radarSweepGrad)"
            />
          </g>
        )}

        {/* 3-ROW CONTENT-FIT LANE BANDS (smaller Exposed/Protected labels) */}
        {lanes.map((lane) => {
          const exposure =
            lane.side === 'enemy'
              ? enemyExposure[lane.row]
              : allyExposure[lane.row];
          const isEnemySide = lane.side === 'enemy';
          const isExposed = exposure === 'exposed';
          const isProtected = exposure === 'protected';

          const fillColor = isExposed
            ? isEnemySide
              ? 'rgba(239, 68, 68, 0.11)'
              : 'rgba(56, 189, 248, 0.11)'
            : isProtected
            ? 'rgba(15, 23, 42, 0.62)'
            : 'rgba(15, 23, 42, 0.24)';

          const strokeColor = isExposed
            ? isEnemySide
              ? 'rgba(248, 113, 113, 0.6)'
              : 'rgba(56, 189, 248, 0.6)'
            : isProtected
            ? 'rgba(148, 163, 184, 0.42)'
            : 'rgba(51, 65, 85, 0.28)';

          const labelFill = isExposed
            ? isEnemySide
              ? '#fca5a5'
              : '#7dd3fc'
            : '#94a3b8';

          const badgeFill = isExposed
            ? isEnemySide
              ? '#f87171'
              : '#38bdf8'
            : isProtected
            ? '#fbbf24'
            : '#64748b';

          return (
            <g
              key={`${lane.side}-${lane.row}`}
              data-row-band={`${lane.side}-${lane.row}`}
              data-row-state={exposure}
            >
              <rect
                x={lane.x}
                y={lane.y}
                width={lane.w}
                height={lane.h}
                rx="6"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isExposed ? '1.6' : '1'}
                strokeDasharray={
                  isProtected || exposure === 'empty' ? '4 4' : undefined
                }
              />
              <text
                x={lane.labelX}
                y={lane.labelY}
                textAnchor={lane.labelAnchor}
                fontSize={isLandscape ? '9' : '8.5'}
                fontFamily="monospace"
                fontWeight="700"
                fill={labelFill}
              >
                {getRowLabel(lane.row)}
              </text>
              <text
                x={lane.badgeX}
                y={lane.badgeY}
                textAnchor={lane.badgeAnchor}
                fontSize={isLandscape ? '8' : '7.5'}
                fontFamily="monospace"
                fontWeight="700"
                fill={badgeFill}
              >
                {getExposureLabel(exposure)}
              </text>
            </g>
          );
        })}

        {/* Center Frontline Divider */}
        {isLandscape ? (
          <line
            x1={cx}
            y1="8"
            x2={cx}
            y2={vh - 8}
            stroke="#f59e0b"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
        ) : (
          <line
            x1="8"
            y1={cy}
            x2={vw - 8}
            y2={cy}
            stroke="#f59e0b"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
        )}

        {/* Actor-to-Target Aim Line & Arrow */}
        {aimArrow && (
          <g
            data-testid="radar-target-arrow"
            data-from={aimArrow.fromId}
            data-to={aimArrow.toId}
            className="pointer-events-none"
          >
            <line
              x1={aimArrow.x1}
              y1={aimArrow.y1}
              x2={aimArrow.x2}
              y2={aimArrow.y2}
              stroke={aimArrow.isAllySupport ? '#34d399' : '#f87171'}
              strokeOpacity="0.72"
              strokeWidth="1.8"
              strokeDasharray="5 4"
              strokeLinecap="round"
              markerEnd={
                aimArrow.isAllySupport
                  ? 'url(#radarAimArrowAlly)'
                  : 'url(#radarAimArrowEnemy)'
              }
            />
          </g>
        )}

        {/* MEMOIZED UNIT MARKERS */}
        {battle.units.map((unit, idx) => {
          const pos = posMap.get(unit.id);
          if (!pos) return null;

          const isEnemy = unit.side === 'enemy';
          const isActive = activeUnitId === unit.id && !battle.summary;
          const isTargeted =
            unit.alive &&
            ((isEnemy && battle.selectedTargetId === unit.id) ||
              (!isEnemy &&
                hasSingleAllySkill &&
                battle.selectedAllyTargetId === unit.id));

          const validity = isEnemy ? enemyValidityMap.get(unit.id) : undefined;
          const isBlockedByRow = Boolean(
            unit.alive && isEnemy && validity?.blockedByRow
          );

          const facingAngle = isLandscape
            ? isEnemy
              ? -90
              : 90
            : isEnemy
            ? 180
            : 0;

          const hoverTooltip = `${unit.name} (${getClassName(
            lang,
            unit.classId
          )}) · ${getRowLabel(unit.row)} · HP ${unit.hp}/${
            unit.derived.maxHp
          } · SHD ${unit.shield}/${unit.derived.maxShield}${
            unit.statuses.length > 0
              ? ` · ${unit.statuses
                  .map((s) => getStatusLabel(lang, s.type))
                  .join(', ')}`
              : ''
          }`;

          return (
            <RadarUnitMarker
              key={unit.id}
              unit={unit}
              x={pos.x}
              y={pos.y}
              idx={idx}
              tokenRadius={tokenRadius}
              hitSize={hitSize}
              barW={barW}
              facingAngle={facingAngle}
              isActive={isActive}
              isTargeted={isTargeted}
              isBlockedByRow={isBlockedByRow}
              isHitFlashing={fxHitTargetIds.has(unit.id)}
              isDefeatFading={defeatFadingSet.has(unit.id)}
              hitFlashDurationMs={hitFlashDurationMs}
              defeatFadeDurationMs={defeatFadeDurationMs}
              autoBattleEnabled={autoBattleEnabled}
              animationsSkipped={animationsSkipped}
              hoverTooltip={hoverTooltip}
              autoBadgeText={autoBadgeText}
              onTap={handleTokenTap}
              onLongPressStart={handleLongPressStart}
              onLongPressCancel={handleLongPressCancel}
            />
          );
        })}

        {/* COMPOSITOR-ONLY COMBAT FX LAYER */}
        {!animationsSkipped &&
          battle.fxEvents.map((fx) => {
            const { from, targets } = resolveFxEndpoints(fx, battle, posMap);
            if (!from || targets.length === 0) return null;
            const durationMs = computeRadarFxDurationMs(fx.kind, battleSpeed);

            return (
              <g
                key={fx.id}
                data-testid={`radar-fx-${fx.id}`}
                data-fx-kind={fx.kind}
                data-fx-duration={durationMs}
                className="pointer-events-none"
              >
                {targets.map(({ id: targetId, pos: to }) => {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const dist = Math.max(1, Math.hypot(dx, dy));
                  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                  const isBeam = fx.kind === 'railgun' || fx.kind === 'heal';
                  const accent = fx.kind === 'heal' ? '#34d399' : fx.accentHex;

                  if (isBeam) {
                    return (
                      <g
                        key={targetId}
                        transform={`translate(${from.x}, ${from.y}) rotate(${angleDeg.toFixed(
                          2
                        )})`}
                      >
                        <g
                          className="anim-radar-beam"
                          style={
                            { '--fx-dur': `${durationMs}ms` } as CSSProperties
                          }
                        >
                          <rect
                            x="0"
                            y={fx.kind === 'railgun' ? -3 : -2}
                            width={dist}
                            height={fx.kind === 'railgun' ? 6 : 4}
                            rx="2"
                            fill={accent}
                            fillOpacity="0.45"
                          />
                          <rect
                            x="0"
                            y="-1"
                            width={dist}
                            height="2"
                            rx="1"
                            fill={fx.kind === 'heal' ? '#a7f3d0' : '#fef9c3'}
                          />
                        </g>
                      </g>
                    );
                  }

                  return (
                    <g
                      key={targetId}
                      transform={`translate(${from.x}, ${from.y})`}
                    >
                      <g
                        className="anim-radar-projectile"
                        style={
                          {
                            '--dx': `${dx.toFixed(1)}px`,
                            '--dy': `${dy.toFixed(1)}px`,
                            '--fx-dur': `${durationMs}ms`,
                          } as CSSProperties
                        }
                      >
                        <g transform={`rotate(${angleDeg.toFixed(2)})`}>
                          <rect
                            x={fx.kind === 'missile' ? -11 : -8}
                            y={fx.kind === 'missile' ? -2.4 : -1.8}
                            width={fx.kind === 'missile' ? 16 : 13}
                            height={fx.kind === 'missile' ? 4.8 : 3.6}
                            rx="2"
                            fill={accent}
                          />
                          <circle cx="4" cy="0" r="2.2" fill="#ffffff" />
                        </g>
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}
      </svg>

      {/* Collapsible Tactical Legend (closed by default, persisted in localStorage) */}
      <div className="absolute top-1.5 right-1.5 z-30 flex flex-col items-end">
        <button
          type="button"
          data-testid="radar-legend-toggle"
          aria-expanded={legendOpen}
          aria-controls="radar-legend-panel"
          onClick={toggleLegend}
          className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-slate-700/90 bg-[#08101c]/92 hover:bg-slate-800/95 text-slate-200 text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
        >
          {legendOpen ? (
            <X className="w-4 h-4 text-slate-300 shrink-0" />
          ) : (
            <HelpCircle className="w-4 h-4 text-sky-400 shrink-0" />
          )}
          <span className="whitespace-nowrap">{t('radar.legendToggle')}</span>
        </button>

        {legendOpen && (
          <div
            id="radar-legend-panel"
            data-testid="radar-legend-panel"
            className="mt-1.5 w-[248px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-700/90 bg-[#070E1A]/96 p-2.5 shadow-xl text-[12px] text-slate-200 space-y-2"
          >
            <div className="font-semibold text-slate-100 border-b border-slate-800 pb-1">
              {t('radar.legendTitle')}
            </div>

            <div className="space-y-1.5 leading-snug">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                  <circle cx="9" cy="9" r="6.5" fill="rgba(254,240,138,0.16)" stroke="#fef08a" strokeWidth="2" />
                </svg>
                <span>{t('radar.legendActing')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                  <circle cx="9" cy="9" r="6" fill="none" stroke="#ef4444" strokeWidth="1.6" strokeDasharray="3 2" />
                  <path d="M 4 9 H 13 M 10 6 L 13.5 9 L 10 12" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{t('radar.legendTarget')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                  <circle cx="9" cy="9" r="7" fill="#090f1a" stroke="#fbbf24" strokeWidth="1.3" />
                  <path d="M 6.8 8.5 V 7 A 2.2 2.2 0 0 1 11.2 7 V 8.5" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                  <rect x="5.8" y="8.5" width="6.4" height="4.6" rx="1" fill="#fbbf24" />
                </svg>
                <span>{t('radar.legendLocked')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                  <polygon points="9,2 15,5.5 15,12.5 9,16 3,12.5 3,5.5" fill="#0a1622" stroke="#22c55e" strokeWidth="1.6" />
                </svg>
                <span>{t('radar.legendAllyShape')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                  <polygon points="9,2 16,9 9,16 2,9" fill="#140b12" stroke="#ef4444" strokeWidth="1.6" />
                </svg>
                <span>{t('radar.legendEnemyShape')}</span>
              </div>

              <div className="flex items-center gap-2 pt-0.5 border-t border-slate-800/90">
                <svg width="18" height="14" viewBox="0 0 18 14" className="shrink-0">
                  <rect x="1" y="2" width="16" height="10" rx="2" fill="rgba(239,68,68,0.16)" stroke="#f87171" strokeWidth="1.5" />
                </svg>
                <span>{t('radar.legendExposed')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="14" viewBox="0 0 18 14" className="shrink-0">
                  <rect x="1" y="2" width="16" height="10" rx="2" fill="rgba(15,23,42,0.65)" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 2" />
                </svg>
                <span>{t('radar.legendProtected')}</span>
              </div>

              <div className="flex items-center gap-2">
                <svg width="18" height="14" viewBox="0 0 18 14" className="shrink-0">
                  <rect x="1" y="2" width="16" height="10" rx="2" fill="rgba(15,23,42,0.25)" stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
                </svg>
                <span>{t('radar.legendEmpty')}</span>
              </div>

              <div className="text-[12px] text-slate-400 pt-0.5 border-t border-slate-800/90">
                {t('radar.legendLongRange')} · {t('radar.legendDown')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invalid Target Reason One-Line Toast (non-blocking) */}
      {invalidToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="radar-invalid-target-toast"
          className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 max-w-[92%] rounded-lg border border-amber-400/70 bg-[#120e08]/95 px-3 py-1.5 text-[13px] font-semibold text-amber-200 shadow-lg whitespace-nowrap truncate"
        >
          {invalidToast}
        </div>
      )}

      {/* Staggered Floating Popups (max 6 simultaneous; buffs/status rendered compact & tight-anchored) */}
      {!animationsSkipped && staggeredPopups.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {staggeredPopups.map((item) => {
            const isSmall = isCompactPopupTone(item.popup.tone);
            return (
              <div
                key={item.popup.id}
                data-testid="damage-popup"
                data-popup-compact={isSmall ? 'true' : 'false'}
                style={{
                  left: `${item.leftPct}%`,
                  top: `${item.topPct}%`,
                  animationDelay: `${item.delayMs}ms`,
                  animationDuration: `${item.durationMs}ms`,
                }}
                className={`absolute z-20 font-display font-bold tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] whitespace-nowrap ${
                  isSmall
                    ? 'text-[12px] px-1 rounded bg-[#050a12]/80 anim-popup-tight'
                    : item.popup.tone === 'crit'
                    ? 'text-[17px] anim-popup'
                    : 'text-[15px] anim-popup'
                } ${getPopupColorClass(item.popup.tone)}`}
              >
                {item.popup.text}
              </div>
            );
          })}
        </div>
      )}

      {/* Compact Single-Line Unit Speech Bubble (<= 28 chars, collision-avoiding, 1.5s auto-hide, toggleable) */}
      {activeBubble && (
        <div
          data-testid="radar-speech-bubble"
          title={activeBubble.fullText}
          style={{
            left: `${activeBubble.leftPct}%`,
            top: `${activeBubble.topPct}%`,
          }}
          className="pointer-events-none absolute z-30 -translate-x-1/2 max-w-[205px] rounded-md border border-sky-400/65 bg-[#071322]/94 px-2 py-0.5 shadow-md flex items-center gap-1 whitespace-nowrap"
        >
          <Radio className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
          <span
            data-testid="radar-speech-bubble-text"
            className="text-[12px] leading-tight font-medium text-sky-100 truncate"
          >
            {activeBubble.text}
          </span>
        </div>
      )}
    </div>
  );
}
