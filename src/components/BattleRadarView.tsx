import { useMemo, useRef } from 'react';
import { Radio } from 'lucide-react';
import { getTeamColorRole, hasStatus } from '../engine/combat';
import { getClassName, getStatusLabel, useI18n } from '../i18n';
import type {
  ActiveStatusEffect,
  BattleState,
  CombatFxEvent,
  CombatRow,
  CombatUnit,
  FloatingPopup,
  MechClassId,
  TeamColorRole,
} from '../types/game';
import {
  computeRowExposure,
  formatShortUnitName,
  layoutStaggeredPopups,
  useBattleLayoutMode,
  type BattleLayoutMode,
  type RowExposureState,
} from '../utils/battleDisplay';

interface BattleRadarViewProps {
  battle: BattleState;
  activeUnitId: string | null;
  validBasicTargetIds: Set<string>;
  canPlayerManualAct: boolean;
  hasSingleAllySkill: boolean;
  autoBattleEnabled: boolean;
  skipAnimations: boolean;
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

const SPARK_VECTORS = [
  { dx: 18, dy: -16 },
  { dx: 24, dy: 4 },
  { dx: 14, dy: 20 },
  { dx: -16, dy: 19 },
  { dx: -23, dy: -2 },
  { dx: -15, dy: -18 },
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

function ClassCenterIcon({
  classId,
  isStructure,
  isBoss,
  color,
  facingAngle,
}: {
  classId: MechClassId;
  isStructure?: boolean;
  isBoss?: boolean;
  color: string;
  facingAngle: number;
}) {
  if (isStructure || isBoss) {
    return (
      <g transform={`rotate(${facingAngle})`}>
        <rect
          x="-6"
          y="-6"
          width="12"
          height="12"
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
          y2="-10"
          stroke="#f8fafc"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="0" cy="0" r="2.6" fill="#f8fafc" />
      </g>
    );
  }

  switch (classId) {
    case 'interceptor':
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="0,-9.5 7,7 0,3.6 -7,7"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <polygon points="0,-6.5 2.2,2.2 0,1 -2.2,2.2" fill="#f8fafc" />
        </g>
      );
    case 'siege':
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="-2,-10 2,-10 3.2,-2.5 7.5,-1 7.5,7 -7.5,7 -7.5,-1 -3.2,-2.5"
            fill={color}
            fillOpacity="0.32"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect x="-1.3" y="-9.2" width="2.6" height="8.2" fill="#f8fafc" />
        </g>
      );
    case 'support':
      return (
        <g transform={`rotate(${facingAngle})`}>
          <circle
            cx="0"
            cy="0"
            r="7"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.4"
          />
          <rect x="-9.2" y="-2.8" width="2.2" height="5.6" rx="1" fill={color} />
          <rect x="7" y="-2.8" width="2.2" height="5.6" rx="1" fill={color} />
          <path
            d="M 0 -3.8 V 3.8 M -3.8 0 H 3.8"
            stroke="#f8fafc"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
      );
    case 'striker':
    default:
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="0,-9 3.2,-2 9.5,3.2 8.8,7 2.2,4.5 0,7.8 -2.2,4.5 -8.8,7 -9.5,3.2 -3.2,-2"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="0" cy="-1.2" r="1.9" fill="#f8fafc" />
        </g>
      );
  }
}

function buildRowLanes(
  isLandscape: boolean,
  vw: number,
  vh: number
): RowLaneRect[] {
  if (isLandscape) {
    // 6 vertical columns: Ally Back | Ally Middle | Ally Front || Enemy Front | Enemy Middle | Enemy Back
    const padX = 12;
    const centerGap = 20;
    const laneGap = 6;
    const halfW = (vw - padX * 2 - centerGap) / 2;
    const colW = (halfW - laneGap * 2) / 3;
    const y = 10;
    const h = vh - 20;

    const allyRows: CombatRow[] = ['back', 'middle', 'front'];
    const enemyRows: CombatRow[] = ['front', 'middle', 'back'];

    const lanes: RowLaneRect[] = [];
    allyRows.forEach((row, i) => {
      const x = padX + i * (colW + laneGap);
      lanes.push({
        side: 'ally',
        row,
        x,
        y,
        w: colW,
        h,
        labelX: x + colW / 2,
        labelY: y + 15,
        labelAnchor: 'middle',
        badgeX: x + colW / 2,
        badgeY: y + 29,
        badgeAnchor: 'middle',
      });
    });

    const rightStart = padX + halfW + centerGap;
    enemyRows.forEach((row, i) => {
      const x = rightStart + i * (colW + laneGap);
      lanes.push({
        side: 'enemy',
        row,
        x,
        y,
        w: colW,
        h,
        labelX: x + colW / 2,
        labelY: y + 15,
        labelAnchor: 'middle',
        badgeX: x + colW / 2,
        badgeY: y + 29,
        badgeAnchor: 'middle',
      });
    });

    return lanes;
  }

  // Portrait 6 horizontal bands: Enemy Back -> Middle -> Front || Ally Front -> Middle -> Back
  const padX = 8;
  const padY = 8;
  const centerGap = 14;
  const laneGap = 5;
  const halfH = (vh - padY * 2 - centerGap) / 2;
  const rowH = (halfH - laneGap * 2) / 3;
  const w = vw - padX * 2;

  const enemyRows: CombatRow[] = ['back', 'middle', 'front'];
  const allyRows: CombatRow[] = ['front', 'middle', 'back'];

  const lanes: RowLaneRect[] = [];
  enemyRows.forEach((row, i) => {
    const y = padY + i * (rowH + laneGap);
    lanes.push({
      side: 'enemy',
      row,
      x: padX,
      y,
      w,
      h: rowH,
      labelX: padX + 8,
      labelY: y + 13,
      labelAnchor: 'start',
      badgeX: padX + w - 8,
      badgeY: y + 13,
      badgeAnchor: 'end',
    });
  });

  const bottomStart = padY + halfH + centerGap;
  allyRows.forEach((row, i) => {
    const y = bottomStart + i * (rowH + laneGap);
    lanes.push({
      side: 'ally',
      row,
      x: padX,
      y,
      w,
      h: rowH,
      labelX: padX + 8,
      labelY: y + 13,
      labelAnchor: 'start',
      badgeX: padX + w - 8,
      badgeY: y + 13,
      badgeAnchor: 'end',
    });
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
        const topSafe = lane.y + 42;
        const bottomSafe = lane.y + lane.h - 28;
        const x = lane.x + lane.w / 2;
        const y = topSafe + frac * Math.max(20, bottomSafe - topSafe);
        map.set(unit.id, { x, y });
      } else {
        const leftSafe = lane.x + 34;
        const rightSafe = lane.x + lane.w - 34;
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
): { from: TokenPos | null; targets: TokenPos[] } {
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
    .map((id) => posMap.get(id))
    .filter((p): p is TokenPos => Boolean(p));

  return { from, targets };
}

export function BattleRadarView({
  battle,
  activeUnitId,
  validBasicTargetIds,
  canPlayerManualAct,
  hasSingleAllySkill,
  autoBattleEnabled,
  skipAnimations,
  layoutMode: layoutModeProp,
  onSelectEnemy,
  onSelectAlly,
  onInspectUnit,
}: BattleRadarViewProps) {
  const { lang, t } = useI18n();
  const detectedMode = useBattleLayoutMode();
  const layoutMode = layoutModeProp ?? detectedMode;
  const isLandscape = layoutMode !== 'phone-portrait';

  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const vw = isLandscape ? 820 : 380;
  const vh = isLandscape ? 460 : 520;
  const cx = vw / 2;
  const cy = vh / 2;

  const lanes = useMemo(
    () => buildRowLanes(isLandscape, vw, vh),
    [isLandscape, vw, vh]
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

  const staggeredPopups = useMemo(
    () =>
      layoutStaggeredPopups(battle.popups, posMap, vw, vh, {
        maxVisible: 6,
        verticalStepPct: 7.5,
        staggerDelayMs: 110,
        durationMs: 800,
      }),
    [battle.popups, posMap, vw, vh]
  );

  const tokenRadius = isLandscape ? 20 : battle.squadSize >= 8 ? 16 : 18;
  const barW = isLandscape ? 54 : 50;

  const handleTokenTap = (unit: CombatUnit) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    const isEnemy = unit.side === 'enemy';
    const isStealthed = hasStatus(unit, 'stealth');
    const isEnemySelected = battle.selectedTargetId === unit.id;
    const isAllySelected = battle.selectedAllyTargetId === unit.id;

    if (
      unit.alive &&
      isEnemy &&
      !isStealthed &&
      canPlayerManualAct &&
      !isEnemySelected
    ) {
      onSelectEnemy(unit.id);
      return;
    }

    if (
      unit.alive &&
      !isEnemy &&
      hasSingleAllySkill &&
      canPlayerManualAct &&
      !isAllySelected
    ) {
      onSelectAlly(unit.id);
      return;
    }

    onInspectUnit(unit);
  };

  const startLongPress = (unit: CombatUnit) => {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      onInspectUnit(unit);
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const chatterUnit =
    battle.wingmanChat &&
    battle.units.find((u) => u.id === battle.wingmanChat?.unitId);
  const chatterPos = chatterUnit ? posMap.get(chatterUnit.id) : null;

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

  return (
    <div
      data-testid="battle-radar-container"
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
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* Deep radar dish backdrop */}
        <rect x="0" y="0" width={vw} height={vh} fill="url(#radarBgGlow)" />

        {/* Subtle drifting stars */}
        {STAR_DOTS.map((st, idx) => (
          <circle
            key={idx}
            cx={(st.x / 100) * vw}
            cy={(st.y / 100) * vh}
            r={st.r}
            fill="#bae6fd"
            opacity="0.35"
            className={skipAnimations ? undefined : 'anim-radar-star'}
            style={skipAnimations ? undefined : { animationDelay: st.delay }}
          />
        ))}

        {/* Concentric tactical range rings */}
        {[0.32, 0.64, 0.96].map((scale, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={Math.min(vw, vh) * 0.46 * scale}
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.09"
            strokeWidth="1"
            strokeDasharray={i === 1 ? '4 5' : undefined}
          />
        ))}

        {/* Rotating radar sweep wedge */}
        {!skipAnimations && (
          <g
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

        {/* 3-ROW SEPARATED TACTICAL LANE BANDS (EXPOSED vs PROTECTED vs EMPTY) */}
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
            : 'rgba(15, 23, 42, 0.28)';

          const strokeColor = isExposed
            ? isEnemySide
              ? 'rgba(248, 113, 113, 0.55)'
              : 'rgba(56, 189, 248, 0.55)'
            : isProtected
            ? 'rgba(100, 116, 139, 0.42)'
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
                strokeWidth={isExposed ? '1.4' : '1'}
                strokeDasharray={isProtected || exposure === 'empty' ? '4 4' : undefined}
              />
              <text
                x={lane.labelX}
                y={lane.labelY}
                textAnchor={lane.labelAnchor}
                fontSize={isLandscape ? '10.5' : '9.5'}
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
                fontSize={isLandscape ? '9.5' : '8.5'}
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

        {/* UNIT TOKENS */}
        {battle.units.map((unit, idx) => {
          const pos = posMap.get(unit.id);
          if (!pos) return null;

          const isEnemy = unit.side === 'enemy';
          const role = getTeamColorRole(unit);
          const teamHex = getTeamHex(role);
          const isActive = activeUnitId === unit.id && !battle.summary;
          const isTargeted =
            unit.alive &&
            ((isEnemy && battle.selectedTargetId === unit.id) ||
              (!isEnemy &&
                hasSingleAllySkill &&
                battle.selectedAllyTargetId === unit.id));
          const isStealthed = hasStatus(unit, 'stealth');
          const isSquare = Boolean(unit.isBoss || unit.isStructure);
          const isBlockedByFront =
            unit.alive && isEnemy && !validBasicTargetIds.has(unit.id);
          const exploding = battle.explodedUnitIds.includes(unit.id);

          const hpRatio = Math.max(
            0,
            Math.min(1, unit.hp / Math.max(1, unit.derived.maxHp))
          );
          const shdRatio = Math.max(
            0,
            Math.min(1, unit.shield / Math.max(1, unit.derived.maxShield))
          );

          const hpFillColor =
            hpRatio <= 0.25 ? '#ef4444' : hpRatio <= 0.55 ? '#fb923c' : '#22c55e';
          const facingAngle = isLandscape
            ? isEnemy
              ? -90
              : 90
            : isEnemy
            ? 180
            : 0;

          const shortName = formatShortUnitName(unit.name, 10);
          const primaryStatus = unit.statuses[0] ?? null;
          const extraStatuses = Math.max(0, unit.statuses.length - 1);

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

          const sq = tokenRadius * 1.85;
          const halfSq = sq / 2;
          const cham = 4;
          const squarePoints = `${-halfSq + cham},${-halfSq} ${halfSq - cham},${-halfSq} ${halfSq},${-halfSq + cham} ${halfSq},${halfSq - cham} ${halfSq - cham},${halfSq} ${-halfSq + cham},${halfSq} ${-halfSq},${halfSq - cham} ${-halfSq},${-halfSq + cham}`;

          return (
            <g
              key={unit.id}
              data-testid={`radar-unit-${unit.id}`}
              data-unit-row={unit.row}
              data-unit-side={unit.side}
              data-acting={isActive ? 'true' : 'false'}
              data-targeted={isTargeted ? 'true' : 'false'}
              transform={`translate(${pos.x}, ${pos.y})`}
              role="button"
              tabIndex={0}
              aria-label={hoverTooltip}
              onClick={() => handleTokenTap(unit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTokenTap(unit);
                }
              }}
              onPointerDown={() => startLongPress(unit)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              className="cursor-pointer focus:outline-none"
              opacity={
                !unit.alive
                  ? 0.32
                  : isStealthed
                  ? 0.58
                  : isBlockedByFront
                  ? 0.78
                  : 1
              }
            >
              <title>{hoverTooltip}</title>

              {/* Generous transparent hit target (>= 44px on phone) */}
              <circle cx="0" cy="0" r={tokenRadius + 14} fill="transparent" />

              <g
                className={
                  unit.alive && !skipAnimations ? 'anim-token-hover' : undefined
                }
                style={
                  unit.alive && !skipAnimations
                    ? { animationDelay: `${(idx % 5) * 0.4}s` }
                    : undefined
                }
              >
                {/* Acting Unit Gold-White Highlight Halo */}
                {isActive && unit.alive && (
                  <circle
                    cx="0"
                    cy="0"
                    r={tokenRadius + 7}
                    fill="rgba(254, 240, 138, 0.16)"
                    stroke="#fef08a"
                    strokeWidth="2.4"
                  />
                )}

                {/* Target Lock Reticle Brackets */}
                {isTargeted && (
                  <g className={skipAnimations ? undefined : 'anim-reticle-pulse'}>
                    <path
                      d={`M ${-tokenRadius - 7} ${-tokenRadius + 2} V ${-tokenRadius - 7} H ${-tokenRadius + 2}
                          M ${tokenRadius - 2} ${-tokenRadius - 7} H ${tokenRadius + 7} V ${-tokenRadius + 2}
                          M ${tokenRadius + 7} ${tokenRadius - 2} V ${tokenRadius + 7} H ${tokenRadius - 2}
                          M ${-tokenRadius + 2} ${tokenRadius + 7} H ${-tokenRadius - 7} V ${tokenRadius - 2}`}
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
                      r={tokenRadius + 4}
                      fill="rgba(56, 189, 248, 0.14)"
                      stroke="#38bdf8"
                      strokeWidth="1.4"
                      strokeDasharray="3 3"
                    />
                  )}

                {/* Token Body */}
                {isSquare ? (
                  <polygon
                    points={squarePoints}
                    fill="#0b1320"
                    stroke={isActive ? '#fef08a' : teamHex}
                    strokeWidth={isActive ? '2.2' : '1.8'}
                  />
                ) : (
                  <circle
                    cx="0"
                    cy="0"
                    r={tokenRadius}
                    fill="#0b1320"
                    stroke={isActive ? '#fef08a' : teamHex}
                    strokeWidth={isActive ? '2.2' : '1.6'}
                    strokeDasharray={isStealthed ? '3 2' : undefined}
                  />
                )}

                {/* Center Class Silhouette */}
                {unit.alive ? (
                  <ClassCenterIcon
                    classId={unit.classId}
                    isStructure={unit.isStructure}
                    isBoss={unit.isBoss}
                    color={teamHex}
                    facingAngle={facingAngle}
                  />
                ) : (
                  <path
                    d="M -5.5 -5.5 L 5.5 5.5 M 5.5 -5.5 L -5.5 5.5"
                    stroke="#64748b"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                )}

                {/* Status Icon Badge (top-right of token) */}
                {unit.alive && primaryStatus && (
                  <g
                    data-testid={`radar-status-${unit.id}`}
                    transform={`translate(${tokenRadius - 1}, ${-tokenRadius + 1})`}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="6.5"
                      fill="#050a12"
                      stroke={getStatusColor(primaryStatus)}
                      strokeWidth="1.4"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight="800"
                      fill={getStatusColor(primaryStatus)}
                    >
                      {getStatusGlyph(primaryStatus)}
                    </text>
                    {extraStatuses > 0 && (
                      <text
                        x="9.5"
                        y="3"
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
                  <g transform={`translate(0, ${-tokenRadius - 9})`}>
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
                      {t('auto.badge')}
                    </text>
                  </g>
                )}

                {/* Explosion Particle Burst */}
                {!skipAnimations && exploding && (
                  <g>
                    <circle
                      cx="0"
                      cy="0"
                      r="18"
                      fill="none"
                      stroke="#fb923c"
                      strokeWidth="3"
                      className="anim-explosion-ring"
                    />
                    {SPARK_VECTORS.map((sv, sIdx) => (
                      <circle
                        key={sIdx}
                        cx="0"
                        cy="0"
                        r="2.8"
                        fill={sIdx % 2 === 0 ? '#fde047' : '#ef4444'}
                        className="anim-explosion-spark"
                        style={
                          {
                            '--dx': `${sv.dx}px`,
                            '--dy': `${sv.dy}px`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </g>
                )}
              </g>

              {/* HP + Shield Linear Bars + Short Name Plate (directly below token, fixed width = zero shift) */}
              <g transform={`translate(0, ${tokenRadius + 5})`}>
                {/* HP Bar */}
                <rect
                  x={-barW / 2}
                  y="0"
                  width={barW}
                  height="3.6"
                  rx="1.5"
                  fill="#1e293b"
                />
                <rect
                  x={-barW / 2}
                  y="0"
                  width={Math.max(0, barW * hpRatio)}
                  height="3.6"
                  rx="1.5"
                  fill={hpFillColor}
                />

                {/* Shield Bar */}
                <rect
                  x={-barW / 2}
                  y="4.6"
                  width={barW}
                  height="2.4"
                  rx="1"
                  fill="#1e293b"
                />
                {unit.derived.maxShield > 0 && (
                  <rect
                    x={-barW / 2}
                    y="4.6"
                    width={Math.max(0, barW * shdRatio)}
                    height="2.4"
                    rx="1"
                    fill={hasStatus(unit, 'shield_break') ? '#ef4444' : '#38bdf8'}
                  />
                )}

                {/* Short Name (max 10 chars, no wrap) */}
                <rect
                  x={-barW / 2 - 4}
                  y="8.5"
                  width={barW + 8}
                  height="12"
                  rx="3"
                  fill="rgba(5, 10, 18, 0.88)"
                />
                <text
                  data-testid="radar-unit-name"
                  x="0"
                  y="17.2"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={isActive ? '#fef08a' : unit.alive ? '#f1f5f9' : '#64748b'}
                >
                  {shortName}
                </text>
              </g>
            </g>
          );
        })}

        {/* TOKEN-TO-TOKEN COMBAT FX OVERLAY */}
        {!skipAnimations &&
          battle.fxEvents.map((fx) => {
            const { from, targets } = resolveFxEndpoints(fx, battle, posMap);
            if (!from || targets.length === 0) return null;

            return (
              <g key={fx.id} className="pointer-events-none">
                {targets.map((to, tIdx) => {
                  const midX = (from.x + to.x) / 2;
                  const midY = (from.y + to.y) / 2;

                  if (fx.kind === 'heal') {
                    return (
                      <g key={tIdx}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="#10b981"
                          strokeWidth="2.4"
                          className="anim-beam"
                        />
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="14"
                          fill="none"
                          stroke="#34d399"
                          strokeWidth="2.4"
                          className="anim-radar-impact"
                        />
                      </g>
                    );
                  }

                  if (fx.kind === 'railgun') {
                    return (
                      <g key={tIdx}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke={fx.accentHex}
                          strokeWidth="5.5"
                          opacity="0.4"
                          className="anim-beam"
                        />
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="#fef9c3"
                          strokeWidth="2"
                          className="anim-beam"
                        />
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="14"
                          fill="none"
                          stroke={fx.accentHex}
                          strokeWidth="2.4"
                          className="anim-radar-impact"
                        />
                      </g>
                    );
                  }

                  if (fx.kind === 'missile') {
                    const perpX = -(to.y - from.y) * 0.16;
                    const perpY = (to.x - from.x) * 0.16;
                    return (
                      <g key={tIdx}>
                        <path
                          d={`M ${from.x} ${from.y} Q ${midX + perpX} ${
                            midY + perpY
                          } ${to.x} ${to.y}`}
                          fill="none"
                          stroke={fx.accentHex}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          className="anim-missile"
                        />
                        <path
                          d={`M ${from.x} ${from.y} Q ${midX - perpX} ${
                            midY - perpY
                          } ${to.x} ${to.y}`}
                          fill="none"
                          stroke="#fde047"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          className="anim-missile"
                        />
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="13"
                          fill="none"
                          stroke="#fb923c"
                          strokeWidth="2.2"
                          className="anim-radar-impact"
                        />
                      </g>
                    );
                  }

                  return (
                    <g key={tIdx}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={fx.accentHex}
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="anim-bolt"
                      />
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#ffffff"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        className="anim-bolt"
                      />
                      <circle
                        cx={to.x}
                        cy={to.y}
                        r="11"
                        fill="none"
                        stroke={fx.accentHex}
                        strokeWidth="2"
                        className="anim-radar-impact"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
      </svg>

      {/* Staggered Floating Damage / Status Popups Overlay (vertical + time staggered, capped, 800ms fade) */}
      {!skipAnimations && staggeredPopups.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {staggeredPopups.map((item) => (
            <div
              key={item.popup.id}
              data-testid="damage-popup"
              style={{
                left: `${item.leftPct}%`,
                top: `${item.topPct}%`,
                animationDelay: `${item.delayMs}ms`,
                animationDuration: `${item.durationMs}ms`,
              }}
              className={`absolute z-20 font-display text-[20px] font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-nowrap anim-popup ${getPopupColorClass(
                item.popup.tone
              )}`}
            >
              {item.popup.text}
            </div>
          ))}
        </div>
      )}

      {/* Wingman Radio Chatter Floating Bubble */}
      {battle.wingmanChat && chatterUnit && chatterPos && (
        <div
          style={{
            left: `${Math.min(78, Math.max(22, (chatterPos.x / vw) * 100))}%`,
            top: `${Math.max(6, (chatterPos.y / vh) * 100 - 12)}%`,
          }}
          className="pointer-events-none absolute z-30 -translate-x-1/2 max-w-[210px] rounded-lg border border-sky-400/70 bg-[#071322]/95 px-2.5 py-1.5 shadow-lg flex items-start gap-1.5"
        >
          <Radio className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0 text-[12px] leading-tight text-sky-100">
            <span className="font-bold text-sky-300">
              {formatShortUnitName(chatterUnit.name, 10)}:{' '}
            </span>
            <span>{t(battle.wingmanChat.textKey as Parameters<typeof t>[0])}</span>
          </div>
        </div>
      )}
    </div>
  );
}
