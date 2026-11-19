import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { getTeamColorRole, hasStatus } from '../engine/combat';
import { useI18n } from '../i18n';
import type {
  ActiveStatusEffect,
  BattleState,
  CombatFxEvent,
  CombatUnit,
  FloatingPopup,
  MechClassId,
  TeamColorRole,
} from '../types/game';

interface BattleRadarViewProps {
  battle: BattleState;
  activeUnitId: string | null;
  validBasicTargetIds: Set<string>;
  canPlayerManualAct: boolean;
  hasSingleAllySkill: boolean;
  autoBattleEnabled: boolean;
  skipAnimations: boolean;
  onSelectEnemy: (unitId: string) => void;
  onSelectAlly: (unitId: string) => void;
  onInspectUnit: (unit: CombatUnit) => void;
}

interface TokenPos {
  x: number;
  y: number;
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
  { x: 54, y: 62, r: 0.9, delay: '1.5s' },
  { x: 37, y: 89, r: 1.1, delay: '2.1s' },
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

function getStatusDotColor(st: ActiveStatusEffect): string {
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
    // Turret / Flagship Fortress emblem
    return (
      <g transform={`rotate(${facingAngle})`}>
        <rect
          x="-6.5"
          y="-6.5"
          width="13"
          height="13"
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
          y2="-11"
          stroke="#f8fafc"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="0" cy="0" r="2.8" fill="#f8fafc" />
      </g>
    );
  }

  switch (classId) {
    case 'interceptor':
      // Sleek fast dart fighter
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="0,-10.5 7.5,7.5 0,4 -7.5,7.5"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polygon points="0,-7 2.4,2.5 0,1 -2.4,2.5" fill="#f8fafc" />
        </g>
      );
    case 'siege':
      // Bulky gunship with long forward rail cannon
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="-2,-11 2,-11 3.5,-3 8,-1 8,7.5 -8,7.5 -8,-1 -3.5,-3"
            fill={color}
            fillOpacity="0.32"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <rect x="-1.4" y="-10" width="2.8" height="9" fill="#f8fafc" />
        </g>
      );
    case 'support':
      // Rounded cruiser with side pods & repair cross core
      return (
        <g transform={`rotate(${facingAngle})`}>
          <circle
            cx="0"
            cy="0"
            r="7.5"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.5"
          />
          <rect x="-10" y="-3" width="2.5" height="6" rx="1" fill={color} />
          <rect x="7.5" y="-3" width="2.5" height="6" rx="1" fill={color} />
          <path
            d="M 0 -4.2 V 4.2 M -4.2 0 H 4.2"
            stroke="#f8fafc"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    case 'striker':
    default:
      // Wide-winged heavy bomber
      return (
        <g transform={`rotate(${facingAngle})`}>
          <polygon
            points="0,-9.5 3.5,-2 10.5,3.5 9.5,7.5 2.5,5 0,8.5 -2.5,5 -9.5,7.5 -10.5,3.5 -3.5,-2"
            fill={color}
            fillOpacity="0.3"
            stroke={color}
            strokeWidth="1.45"
            strokeLinejoin="round"
          />
          <circle cx="0" cy="-1.5" r="2" fill="#f8fafc" />
        </g>
      );
  }
}

function computeUnitPositions(
  units: CombatUnit[],
  isLandscape: boolean,
  vw: number,
  vh: number
): Map<string, TokenPos> {
  const map = new Map<string, TokenPos>();

  const groups: Array<{ side: 'ally' | 'enemy'; row: 'front' | 'back' }> = [
    { side: 'enemy', row: 'back' },
    { side: 'enemy', row: 'front' },
    { side: 'ally', row: 'front' },
    { side: 'ally', row: 'back' },
  ];

  for (const g of groups) {
    const rowUnits = units
      .filter((u) => u.side === g.side && u.row === g.row)
      .sort((a, b) => (a.formationCol ?? 0) - (b.formationCol ?? 0));

    const count = rowUnits.length;
    if (count === 0) continue;

    rowUnits.forEach((unit, idx) => {
      const frac = (idx + 0.5) / count;
      if (isLandscape) {
        // Horizontal battlefield: Allies on Left (Back -> Front) vs Enemies on Right (Front -> Back)
        const x =
          g.side === 'ally'
            ? g.row === 'back'
              ? vw * 0.14
              : vw * 0.33
            : g.row === 'front'
            ? vw * 0.67
            : vw * 0.86;
        const padY = count >= 4 ? 46 : 58;
        const usableH = vh - padY * 2;
        const y = padY + frac * usableH;
        map.set(unit.id, { x, y });
      } else {
        // Vertical portrait battlefield: Enemies on Top (Back -> Front) vs Allies on Bottom (Front -> Back)
        const y =
          g.side === 'enemy'
            ? g.row === 'back'
              ? vh * 0.135
              : vh * 0.345
            : g.row === 'front'
            ? vh * 0.635
            : vh * 0.845;
        const padX = count >= 4 ? 32 : 42;
        const usableW = vw - padX * 2;
        const x = padX + frac * usableW;
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
  onSelectEnemy,
  onSelectAlly,
  onInspectUnit,
}: BattleRadarViewProps) {
  const { t } = useI18n();
  const [isLandscape, setIsLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    setIsLandscape(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const vw = isLandscape ? 820 : 360;
  const vh = isLandscape ? 430 : 440;
  const cx = vw / 2;
  const cy = vh / 2;

  const posMap = useMemo(
    () => computeUnitPositions(battle.units, isLandscape, vw, vh),
    [battle.units, isLandscape, vw, vh]
  );

  const tokenRadius = battle.squadSize >= 8 && !isLandscape ? 19 : 22;
  const hpRingR = tokenRadius + 3.5;
  const shdRingR = tokenRadius + 6.8;
  const hpCirc = 2 * Math.PI * hpRingR;
  const shdCirc = 2 * Math.PI * shdRingR;

  const handleTokenTap = (unit: CombatUnit) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    const isEnemy = unit.side === 'enemy';
    const isStealthed = hasStatus(unit, 'stealth');
    const isEnemySelected = battle.selectedTargetId === unit.id;
    const isAllySelected = battle.selectedAllyTargetId === unit.id;

    if (unit.alive && isEnemy && !isStealthed && canPlayerManualAct && !isEnemySelected) {
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

  return (
    <div className="relative w-full h-full min-h-[340px] flex items-center justify-center overflow-hidden rounded-xl border border-slate-800/90 bg-[#050A12] select-none">
      {/* Main Tactical Radar SVG */}
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className="w-full h-full max-h-[560px]"
        role="img"
        aria-label={t('battle.viewRadar')}
      >
        <defs>
          <radialGradient id="radarBgGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0f2538" stopOpacity="0.65" />
            <stop offset="55%" stopColor="#07111d" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#04080f" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="radarSweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.22" />
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
            opacity="0.45"
            className={skipAnimations ? undefined : 'anim-radar-star'}
            style={skipAnimations ? undefined : { animationDelay: st.delay }}
          />
        ))}

        {/* Concentric tactical range rings */}
        {[0.24, 0.48, 0.72, 0.96].map((scale, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={Math.min(vw, vh) * 0.48 * scale}
            fill="none"
            stroke="#38bdf8"
            strokeOpacity={i === 1 ? '0.16' : '0.09'}
            strokeWidth="1"
            strokeDasharray={i % 2 === 1 ? '4 5' : undefined}
          />
        ))}

        {/* Crosshairs */}
        <line
          x1="0"
          y1={cy}
          x2={vw}
          y2={cy}
          stroke={isLandscape ? '#38bdf8' : '#f59e0b'}
          strokeOpacity={isLandscape ? '0.1' : '0.24'}
          strokeWidth={isLandscape ? '1' : '1.2'}
          strokeDasharray={isLandscape ? '3 6' : '6 5'}
        />
        <line
          x1={cx}
          y1="0"
          x2={cx}
          y2={vh}
          stroke={isLandscape ? '#f59e0b' : '#38bdf8'}
          strokeOpacity={isLandscape ? '0.24' : '0.1'}
          strokeWidth={isLandscape ? '1.2' : '1'}
          strokeDasharray={isLandscape ? '6 5' : '3 6'}
        />

        {/* Rotating radar sweep wedge */}
        {!skipAnimations && (
          <g
            className="anim-radar-sweep"
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          >
            <path
              d={`M ${cx} ${cy} L ${cx} ${cy - Math.max(vw, vh) * 0.55} A ${
                Math.max(vw, vh) * 0.55
              } ${Math.max(vw, vh) * 0.55} 0 0 1 ${
                cx + Math.max(vw, vh) * 0.25
              } ${cy - Math.max(vw, vh) * 0.49} Z`}
              fill="url(#radarSweepGrad)"
            />
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - Math.max(vw, vh) * 0.55}
              stroke="#38bdf8"
              strokeOpacity="0.28"
              strokeWidth="1.2"
            />
          </g>
        )}

        {/* Formation Row Labels */}
        {isLandscape ? (
          <g fill="#64748b" fontSize="9.5" fontFamily="monospace" fontWeight="600">
            <text x={vw * 0.14} y="18" textAnchor="middle">
              {t('common.backRow')}
            </text>
            <text x={vw * 0.33} y="18" textAnchor="middle" fill="#38bdf8">
              {t('common.frontRow')}
            </text>
            <text x={vw * 0.67} y="18" textAnchor="middle" fill="#f87171">
              {t('common.frontRow')}
            </text>
            <text x={vw * 0.86} y="18" textAnchor="middle">
              {t('common.backRow')}
            </text>
          </g>
        ) : (
          <g fill="#64748b" fontSize="8.5" fontFamily="monospace" fontWeight="700">
            <text x="10" y={vh * 0.135 - 24} fill="#f87171" opacity="0.7">
              {t('common.backRow')}
            </text>
            <text x="10" y={vh * 0.345 - 24} fill="#f87171" opacity="0.9">
              {t('common.frontRow')}
            </text>
            <text x="10" y={vh * 0.635 - 24} fill="#38bdf8" opacity="0.9">
              {t('common.frontRow')}
            </text>
            <text x="10" y={vh * 0.845 - 24} fill="#38bdf8" opacity="0.7">
              {t('common.backRow')}
            </text>
          </g>
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
          const spPipsTotal = 4;
          const spPipsFilled = Math.round(
            (unit.sp / Math.max(1, unit.derived.maxSp)) * spPipsTotal
          );

          const hpStrokeColor =
            hpRatio <= 0.25 ? '#ef4444' : hpRatio <= 0.55 ? '#fb923c' : '#22c55e';
          const facingAngle = isLandscape
            ? isEnemy
              ? -90
              : 90
            : isEnemy
            ? 180
            : 0;

          const visibleStatuses = unit.statuses.slice(0, 3);
          const overflowStatusCount = Math.max(0, unit.statuses.length - 3);
          const shortName =
            unit.name.length > 10 ? `${unit.name.slice(0, 9)}…` : unit.name;

          const sq = tokenRadius * 1.92;
          const halfSq = sq / 2;
          const cham = 5;
          const squarePoints = `${-halfSq + cham},${-halfSq} ${halfSq - cham},${-halfSq} ${halfSq},${-halfSq + cham} ${halfSq},${halfSq - cham} ${halfSq - cham},${halfSq} ${-halfSq + cham},${halfSq} ${-halfSq},${halfSq - cham} ${-halfSq},${-halfSq + cham}`;

          return (
            <g
              key={unit.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${unit.name} HP ${unit.hp}/${unit.derived.maxHp}`}
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
                  ? 0.34
                  : isStealthed
                  ? 0.58
                  : isBlockedByFront
                  ? 0.8
                  : 1
              }
            >
              {/* Generous invisible touch target (>= 48px on mobile) */}
              <circle cx="0" cy="0" r={tokenRadius + 12} fill="transparent" />

              <g
                className={
                  unit.alive && !skipAnimations ? 'anim-token-hover' : undefined
                }
                style={
                  unit.alive && !skipAnimations
                    ? { animationDelay: `${(idx % 5) * 0.45}s` }
                    : undefined
                }
              >
                {/* Active Turn Gold-White Glow */}
                {isActive && unit.alive && (
                  <circle
                    cx="0"
                    cy="0"
                    r={shdRingR + 5}
                    fill="rgba(254, 240, 138, 0.14)"
                    stroke="#fef08a"
                    strokeWidth="2.2"
                  />
                )}

                {/* Pulsing Target Reticle Brackets */}
                {isTargeted && (
                  <g className={skipAnimations ? undefined : 'anim-reticle-pulse'}>
                    <path
                      d={`M ${-shdRingR - 5} ${-shdRingR + 3} V ${-shdRingR - 5} H ${-shdRingR + 3}
                          M ${shdRingR - 3} ${-shdRingR - 5} H ${shdRingR + 5} V ${-shdRingR + 3}
                          M ${shdRingR + 5} ${shdRingR - 3} V ${shdRingR + 5} H ${shdRingR - 3}
                          M ${-shdRingR + 3} ${shdRingR + 5} H ${-shdRingR - 5} V ${shdRingR - 3}`}
                      fill="none"
                      stroke={isEnemy ? '#ef4444' : '#22c55e'}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* Shield Bubble when Defending / Invincible */}
                {unit.alive &&
                  (unit.isDefending || hasStatus(unit, 'invincible')) && (
                    <circle
                      cx="0"
                      cy="0"
                      r={shdRingR + 2.5}
                      fill="rgba(56, 189, 248, 0.12)"
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  )}

                {/* Token Body: Square for Structures/Bosses, Circle for Ships */}
                {isSquare ? (
                  <>
                    <polygon
                      points={squarePoints}
                      fill="#0b1320"
                      stroke={isActive ? '#fef08a' : teamHex}
                      strokeWidth={isActive ? '2.2' : '1.8'}
                    />
                    {/* Horizontal HP bar along bottom edge of square */}
                    <rect
                      x={-halfSq + 4}
                      y={halfSq - 5}
                      width={sq - 8}
                      height="3"
                      rx="1"
                      fill="#1e293b"
                    />
                    <rect
                      x={-halfSq + 4}
                      y={halfSq - 5}
                      width={Math.max(0, (sq - 8) * hpRatio)}
                      height="3"
                      rx="1"
                      fill={hpStrokeColor}
                    />
                    {/* Thin Shield bar along top edge of square */}
                    {unit.derived.maxShield > 0 && (
                      <>
                        <rect
                          x={-halfSq + 4}
                          y={-halfSq + 2}
                          width={sq - 8}
                          height="2.2"
                          rx="1"
                          fill="#1e293b"
                        />
                        <rect
                          x={-halfSq + 4}
                          y={-halfSq + 2}
                          width={Math.max(0, (sq - 8) * shdRatio)}
                          height="2.2"
                          rx="1"
                          fill="#38bdf8"
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* Outer Shield Arc Track + Fill */}
                    {unit.derived.maxShield > 0 && (
                      <>
                        <circle
                          cx="0"
                          cy="0"
                          r={shdRingR}
                          fill="none"
                          stroke="#1e293b"
                          strokeWidth="1.8"
                        />
                        <circle
                          cx="0"
                          cy="0"
                          r={shdRingR}
                          fill="none"
                          stroke={
                            hasStatus(unit, 'shield_break') ? '#ef4444' : '#38bdf8'
                          }
                          strokeWidth="1.8"
                          strokeDasharray={shdCirc}
                          strokeDashoffset={shdCirc * (1 - shdRatio)}
                          strokeLinecap="round"
                          transform="rotate(-90)"
                        />
                      </>
                    )}

                    {/* HP Progress Arc Track + Fill */}
                    <circle
                      cx="0"
                      cy="0"
                      r={hpRingR}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="2.8"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r={hpRingR}
                      fill="none"
                      stroke={hpStrokeColor}
                      strokeWidth="2.8"
                      strokeDasharray={hpCirc}
                      strokeDashoffset={hpCirc * (1 - hpRatio)}
                      strokeLinecap="round"
                      transform="rotate(-90)"
                    />

                    {/* Inner Ship Core Circle */}
                    <circle
                      cx="0"
                      cy="0"
                      r={tokenRadius - 1}
                      fill="#0b1320"
                      stroke={isActive ? '#fef08a' : teamHex}
                      strokeWidth={isActive ? '2' : '1.4'}
                      strokeDasharray={isStealthed ? '3 2' : undefined}
                    />
                  </>
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
                    d="M -6 -6 L 6 6 M 6 -6 L -6 6"
                    stroke="#64748b"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                )}

                {/* SP Pips underneath icon */}
                {unit.alive && (
                  <g transform={`translate(0, ${tokenRadius - 6})`}>
                    {Array.from({ length: spPipsTotal }).map((_, pIdx) => {
                      const px = (pIdx - (spPipsTotal - 1) / 2) * 4.5;
                      return (
                        <circle
                          key={pIdx}
                          cx={px}
                          cy="0"
                          r="1.4"
                          fill={pIdx < spPipsFilled ? '#c084fc' : '#334155'}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Up to 3 Status Mini-Badges + Overflow */}
                {unit.alive && visibleStatuses.length > 0 && (
                  <g
                    transform={`translate(${tokenRadius - 2}, ${-tokenRadius - 4})`}
                  >
                    {visibleStatuses.map((st, sIdx) => (
                      <circle
                        key={st.type}
                        cx={sIdx * 6.5 - 6}
                        cy="0"
                        r="3"
                        fill={getStatusDotColor(st)}
                        stroke="#050a12"
                        strokeWidth="1"
                      />
                    ))}
                    {overflowStatusCount > 0 && (
                      <text
                        x={visibleStatuses.length * 6.5 - 3}
                        y="3"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="700"
                        fill="#e2e8f0"
                      >
                        +{overflowStatusCount}
                      </text>
                    )}
                  </g>
                )}

                {/* AUTO Badge on Player Token */}
                {unit.isPlayer && autoBattleEnabled && unit.alive && (
                  <g transform={`translate(0, ${-shdRingR - 9})`}>
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

                {/* Explosion Particle Burst on Destruction */}
                {!skipAnimations && exploding && (
                  <g>
                    <circle
                      cx="0"
                      cy="0"
                      r="20"
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
                        r="3"
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

              {/* Short Name Label Below Token */}
              <g transform={`translate(0, ${shdRingR + 12})`}>
                <rect
                  x="-32"
                  y="-7.5"
                  width="64"
                  height="12"
                  rx="3"
                  fill="rgba(5, 10, 18, 0.82)"
                />
                <text
                  x="0"
                  y="1.5"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={isActive ? '#fef08a' : unit.alive ? '#e2e8f0' : '#64748b'}
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
                          r="16"
                          fill="none"
                          stroke="#34d399"
                          strokeWidth="2.5"
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
                          strokeWidth="6"
                          opacity="0.4"
                          className="anim-beam"
                        />
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="#fef9c3"
                          strokeWidth="2.2"
                          className="anim-beam"
                        />
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="15"
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
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          className="anim-missile"
                        />
                        <circle
                          cx={to.x}
                          cy={to.y}
                          r="14"
                          fill="none"
                          stroke="#fb923c"
                          strokeWidth="2.2"
                          className="anim-radar-impact"
                        />
                      </g>
                    );
                  }

                  // Default laser bolt
                  return (
                    <g key={tIdx}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={fx.accentHex}
                        strokeWidth="3.2"
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
                        r="12"
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

      {/* Floating Damage / Status Popups Overlay (aligned to token percentages) */}
      {!skipAnimations && battle.popups.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {battle.popups.map((pop, idx) => {
            const pos = posMap.get(pop.unitId);
            if (!pos) return null;
            const leftPct = (pos.x / vw) * 100;
            const topPct = Math.max(4, (pos.y / vh) * 100 - 4 - (idx % 3) * 3.5);
            return (
              <div
                key={pop.id}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className={`absolute z-20 font-display text-base sm:text-lg font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-nowrap anim-popup ${getPopupColorClass(
                  pop.tone
                )}`}
              >
                {pop.text}
              </div>
            );
          })}
        </div>
      )}

      {/* Wingman Radio Chatter Floating Bubble */}
      {battle.wingmanChat && chatterUnit && chatterPos && (
        <div
          style={{
            left: `${Math.min(78, Math.max(22, (chatterPos.x / vw) * 100))}%`,
            top: `${Math.max(6, (chatterPos.y / vh) * 100 - 11)}%`,
          }}
          className="pointer-events-none absolute z-30 -translate-x-1/2 max-w-[200px] rounded-lg border border-sky-400/70 bg-[#071322]/95 px-2.5 py-1.5 shadow-lg flex items-start gap-1.5"
        >
          <Radio className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0 text-[11px] leading-tight text-sky-100">
            <span className="font-bold text-sky-300">{chatterUnit.name}: </span>
            <span>{t(battle.wingmanChat.textKey as Parameters<typeof t>[0])}</span>
          </div>
        </div>
      )}

      {/* Bottom Corner Hint */}
      <div className="pointer-events-none absolute bottom-2 right-2.5 text-[10px] font-mono-nums text-slate-400/80 bg-slate-950/75 px-2 py-0.5 rounded border border-slate-800/80">
        {t('mobile.tapInspect')}
      </div>
    </div>
  );
}
