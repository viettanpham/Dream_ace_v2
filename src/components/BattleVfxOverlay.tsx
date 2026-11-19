import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import type {
  BattleSpeed,
  BattleState,
  CombatFxEvent,
  CombatSide,
  CombatUnit,
} from '../types/game';
import {
  computeDefeatFadeDurationMs,
  computeHitFlashDurationMs,
  computeRadarFxDurationMs,
  type PopupAnchorPoint,
} from '../utils/battleDisplay';
import {
  completeUnitEffect,
  computeVfxDurationMs,
  createUnitEffectQueue,
  deriveStatusVfxFromDelta,
  enqueueUnitEffect,
  MAX_SIMULTANEOUS_EFFECTS_PER_UNIT,
  resolveFxWeaponStyle,
  resolveTargetAttackOutcome,
  type EffectiveVfxConfig,
  type QueuedUnitVfx,
  type UnitEffectQueueState,
} from '../utils/battleVfx';

export interface ManualAimLineSpec {
  fromId: string;
  toId: string;
  isAllySupport: boolean;
}

interface BattleVfxOverlayProps {
  battle: BattleState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  markerElementsRef: React.RefObject<Map<string, SVGGElement>>;
  svgPosMap: Map<string, PopupAnchorPoint>;
  vw: number;
  vh: number;
  battleSpeed: BattleSpeed;
  vfxConfig: EffectiveVfxConfig;
  playerWeaponId?: string | null;
  manualAimLine: ManualAimLineSpec | null;
  hitFlashUnitIds: Set<string>;
  defeatFadingUnitIds: Set<string>;
}

interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Computes unit center in container-relative pixels from the live unit marker's bounding box.
 * Falls back to proportional viewBox coordinates when bounding rects are empty (e.g. JSDOM).
 */
function measureUnitCenter(
  unitId: string,
  containerEl: HTMLDivElement | null,
  markerMap: Map<string, SVGGElement> | null,
  svgPosMap: Map<string, PopupAnchorPoint>,
  vw: number,
  vh: number
): PixelPoint | null {
  const cRect = containerEl?.getBoundingClientRect();
  const hasRealBox = Boolean(cRect && cRect.width > 0 && cRect.height > 0);
  const markerEl = markerMap?.get(unitId);

  if (hasRealBox && cRect && markerEl) {
    const mRect = markerEl.getBoundingClientRect();
    if (mRect.width > 0 || mRect.height > 0) {
      return {
        x: mRect.left - cRect.left + mRect.width / 2,
        y: mRect.top - cRect.top + mRect.height / 2,
      };
    }
  }

  const svgPos = svgPosMap.get(unitId);
  if (!svgPos) return null;

  if (hasRealBox && cRect) {
    // Preserve aspect ratio mapping (meet) matching the SVG's xMidYMid meet scaling
    const scale = Math.min(cRect.width / Math.max(1, vw), cRect.height / Math.max(1, vh));
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (cRect.width - renderedW) / 2;
    const offsetY = (cRect.height - renderedH) / 2;
    return {
      x: offsetX + svgPos.x * scale,
      y: offsetY + svgPos.y * scale,
    };
  }

  // Fallback for JSDOM / pre-layout measurements
  return { x: svgPos.x, y: svgPos.y };
}

function resolveFxActorAndTargets(
  fx: CombatFxEvent,
  battle: BattleState
): { actor?: CombatUnit; targetIds: string[] } {
  const fromSideUnits = battle.units.filter((u) => u.side === fx.fromSide);
  const actor =
    (fx.fromUnitId
      ? battle.units.find((u) => u.id === fx.fromUnitId)
      : undefined) ?? fromSideUnits[fx.fromSlotIndex];

  const toSideUnits = battle.units.filter((u) => u.side === fx.toSide);
  const targetIds: string[] = [];

  if (fx.toUnitIds && fx.toUnitIds.length > 0) {
    for (const id of fx.toUnitIds) {
      if (id && !targetIds.includes(id)) targetIds.push(id);
    }
  } else {
    for (const slotIdx of fx.toSlotIndices) {
      const target = toSideUnits[slotIdx];
      if (target && !targetIds.includes(target.id)) {
        targetIds.push(target.id);
      }
    }
  }

  return { actor, targetIds };
}

function getTeamPalette(side: CombatSide): {
  primary: string;
  core: string;
  glow: string;
  border: string;
} {
  if (side === 'ally') {
    return {
      primary: '#38bdf8',
      core: '#e0f2fe',
      glow: 'rgba(56, 189, 248, 0.45)',
      border: '#7dd3fc',
    };
  }
  return {
    primary: '#f97316',
    core: '#ffedd5',
    glow: 'rgba(249, 115, 22, 0.48)',
    border: '#fb923c',
  };
}

/**
 * Firefox-safe HTML overlay rendering ALL animated battle visual effects:
 * - Uses ONLY absolutely positioned HTML elements with transform: translate3d/rotate/scale and opacity.
 * - Zero animated SVG transforms, zero transform-box, zero offset-path, zero SVG SMIL.
 * - Computes positions from unit marker bounding boxes at event time so any radar scale works.
 * - Enforces max 2 simultaneous status effects per unit with FIFO queuing.
 */
export function BattleVfxOverlay({
  battle,
  containerRef,
  markerElementsRef,
  svgPosMap,
  vw,
  vh,
  battleSpeed,
  vfxConfig,
  playerWeaponId = null,
  manualAimLine,
  hitFlashUnitIds,
  defeatFadingUnitIds,
}: BattleVfxOverlayProps) {
  const { t } = useI18n();
  const [unitQueue, setUnitQueue] = useState<UnitEffectQueueState<QueuedUnitVfx>>(
    () => createUnitEffectQueue<QueuedUnitVfx>()
  );
  const [layoutTick, setLayoutTick] = useState(0);

  const prevEventCountRef = useRef<number>(battle.events.length);
  const prevUnitsRef = useRef<CombatUnit[]>(battle.units);
  const activeTimersRef = useRef<Map<string, number>>(new Map());
  const fxPointSnapshotRef = useRef<
    Map<string, { from: PixelPoint; targets: Record<string, PixelPoint> }>
  >(new Map());

  // Re-measure overlay coordinates cleanly on resize
  useEffect(() => {
    const onResize = () => setLayoutTick((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cleanup active timers on unmount
  useEffect(() => {
    return () => {
      activeTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      activeTimersRef.current.clear();
    };
  }, []);

  // Derive status effects from newly appended battle events & unit state transitions
  useEffect(() => {
    const prevCount = prevEventCountRef.current;
    const prevUnits = prevUnitsRef.current;

    const newEvents =
      battle.events.length > prevCount
        ? battle.events.slice(prevCount)
        : [];

    prevEventCountRef.current = battle.events.length;
    prevUnitsRef.current = battle.units;

    if (
      !vfxConfig.showStatusEffects ||
      vfxConfig.animationsSkipped ||
      (newEvents.length === 0 && prevUnits === battle.units)
    ) {
      return;
    }

    const derived = deriveStatusVfxFromDelta(
      newEvents,
      prevUnits,
      battle.units,
      battleSpeed,
      Date.now()
    );

    if (derived.length === 0) return;

    setUnitQueue((prev) => {
      let next = prev;
      for (const item of derived) {
        next = enqueueUnitEffect(
          next,
          item.unitId,
          item,
          MAX_SIMULTANEOUS_EFFECTS_PER_UNIT
        );
      }
      return next;
    });
  }, [
    battle.events,
    battle.units,
    battleSpeed,
    vfxConfig.showStatusEffects,
    vfxConfig.animationsSkipped,
  ]);

  // Clear queued status effects immediately if effects are turned off or reduced motion activates
  useEffect(() => {
    if (!vfxConfig.showStatusEffects || vfxConfig.animationsSkipped) {
      activeTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      activeTimersRef.current.clear();
      setUnitQueue(createUnitEffectQueue<QueuedUnitVfx>());
    }
  }, [vfxConfig.showStatusEffects, vfxConfig.animationsSkipped]);

  // Schedule auto-completion timers for currently active per-unit effects
  useEffect(() => {
    const activeIds = new Set<string>();
    Object.entries(unitQueue.activeByUnit).forEach(([unitId, list]) => {
      for (const fx of list) {
        activeIds.add(fx.id);
        if (!activeTimersRef.current.has(fx.id)) {
          const timerId = window.setTimeout(() => {
            activeTimersRef.current.delete(fx.id);
            setUnitQueue((cur) =>
              completeUnitEffect(
                cur,
                unitId,
                fx.id,
                MAX_SIMULTANEOUS_EFFECTS_PER_UNIT
              )
            );
          }, fx.durationMs + 40);
          activeTimersRef.current.set(fx.id, timerId);
        }
      }
    });

    activeTimersRef.current.forEach((timerId, id) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(timerId);
        activeTimersRef.current.delete(id);
      }
    });
  }, [unitQueue]);

  // Capture bounding-box positions at event time for active CombatFxEvents
  const fxRenderItems = useMemo(() => {
    void layoutTick;
    if (
      vfxConfig.animationsSkipped ||
      (!vfxConfig.showProjectiles && !vfxConfig.showMainImpactOrHeal)
    ) {
      return [];
    }

    const activeFxIds = new Set(battle.fxEvents.map((f) => f.id));
    fxPointSnapshotRef.current.forEach((_, key) => {
      if (!activeFxIds.has(key)) fxPointSnapshotRef.current.delete(key);
    });

    const recentEvents = battle.events.slice(-16);

    return battle.fxEvents.map((fx) => {
      const { actor, targetIds } = resolveFxActorAndTargets(fx, battle);
      let snap = fxPointSnapshotRef.current.get(fx.id);

      if (!snap) {
        const fromPt = actor
          ? measureUnitCenter(
              actor.id,
              containerRef.current,
              markerElementsRef.current,
              svgPosMap,
              vw,
              vh
            )
          : null;
        const targetPts: Record<string, PixelPoint> = {};
        for (const tid of targetIds) {
          const pt = measureUnitCenter(
            tid,
            containerRef.current,
            markerElementsRef.current,
            svgPosMap,
            vw,
            vh
          );
          if (pt) targetPts[tid] = pt;
        }
        if (fromPt) {
          snap = { from: fromPt, targets: targetPts };
          fxPointSnapshotRef.current.set(fx.id, snap);
        }
      }

      const weaponStyle = resolveFxWeaponStyle(
        fx,
        actor,
        targetIds.length,
        recentEvents,
        playerWeaponId
      );

      // Keep radar-fx duration aligned with computeRadarFxDurationMs for speed scaling consistency
      const durationMs = computeRadarFxDurationMs(fx.kind, battleSpeed);
      const vfxDurationMs = computeVfxDurationMs(weaponStyle, battleSpeed);

      return {
        fx,
        actor,
        targetIds,
        snap: snap ?? null,
        weaponStyle,
        durationMs,
        vfxDurationMs,
        recentEvents,
      };
    });
  }, [
    battle,
    battleSpeed,
    containerRef,
    markerElementsRef,
    svgPosMap,
    vw,
    vh,
    playerWeaponId,
    vfxConfig,
    layoutTick,
  ]);

  // Measure Manual-only thin targeting line from live bounding boxes
  const manualAimGeometry = useMemo(() => {
    void layoutTick;
    if (!manualAimLine) return null;
    const from = measureUnitCenter(
      manualAimLine.fromId,
      containerRef.current,
      markerElementsRef.current,
      svgPosMap,
      vw,
      vh
    );
    const to = measureUnitCenter(
      manualAimLine.toId,
      containerRef.current,
      markerElementsRef.current,
      svgPosMap,
      vw,
      vh
    );
    if (!from || !to) return null;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const pad = 22;
    if (dist <= pad * 2 + 4) return null;

    const ux = dx / dist;
    const uy = dy / dist;
    const startX = from.x + ux * pad;
    const startY = from.y + uy * pad;
    const length = dist - pad * 2;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    return {
      ...manualAimLine,
      startX,
      startY,
      length,
      angleDeg,
    };
  }, [manualAimLine, containerRef, markerElementsRef, svgPosMap, vw, vh, layoutTick]);

  const hitFlashDurationMs = computeHitFlashDurationMs(battleSpeed);
  const defeatFadeDurationMs = computeDefeatFadeDurationMs(battleSpeed);

  const unitCenter = (unitId: string): PixelPoint | null =>
    measureUnitCenter(
      unitId,
      containerRef.current,
      markerElementsRef.current,
      svgPosMap,
      vw,
      vh
    );

  const activeStatusEffects = Object.values(unitQueue.activeByUnit).flat();

  return (
    <div
      data-testid="radar-vfx-overlay"
      data-effects-mode={vfxConfig.mode}
      data-particles-enabled={vfxConfig.showDecorativeParticles ? 'true' : 'false'}
      className="pointer-events-none absolute inset-0 overflow-hidden z-20"
    >
      {/* Pure HTML Ambient Radar Sweep (transform rotate only; no SVG transform) */}
      {vfxConfig.showAmbientSweep && (
        <div
          data-testid="radar-sweep-layer"
          className="vfx-html-sweep pointer-events-none absolute left-1/2 top-1/2 w-[140%] aspect-square rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(56, 189, 248, 0.14) 0deg, rgba(56, 189, 248, 0.03) 34deg, transparent 58deg, transparent 360deg)',
          }}
        />
      )}

      {/* Manual-Only Thin Targeting Line (shown ONLY during Manual target selection, never in Auto or during combat resolution) */}
      {manualAimGeometry && (
        <div
          data-testid="radar-target-arrow"
          data-from={manualAimGeometry.fromId}
          data-to={manualAimGeometry.toId}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${manualAimGeometry.length.toFixed(1)}px`,
            height: '2px',
            transformOrigin: '0% 50%',
            transform: `translate3d(${manualAimGeometry.startX.toFixed(
              1
            )}px, ${manualAimGeometry.startY.toFixed(1)}px, 0) rotate(${manualAimGeometry.angleDeg.toFixed(
              2
            )}deg)`,
            background: manualAimGeometry.isAllySupport
              ? 'linear-gradient(90deg, rgba(52,211,153,0.18), rgba(52,211,153,0.78))'
              : 'linear-gradient(90deg, rgba(248,113,113,0.18), rgba(248,113,113,0.78))',
          }}
        >
          {/* Small directional tip */}
          <span
            style={{
              position: 'absolute',
              right: '-1px',
              top: '-3px',
              width: 0,
              height: 0,
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
              borderLeft: `7px solid ${
                manualAimGeometry.isAllySupport ? '#34d399' : '#f87171'
              }`,
            }}
          />
        </div>
      )}

      {/* Weapon Attack Visual Effects (HTML translate3d + opacity only) */}
      {fxRenderItems.map(
        ({
          fx,
          targetIds,
          snap,
          weaponStyle,
          durationMs,
          vfxDurationMs,
          recentEvents,
        }) => {
          if (!snap) return null;
          const palette = getTeamPalette(fx.fromSide);
          const isAlly = fx.fromSide === 'ally';
          const isHealFx = fx.kind === 'heal';

          return (
            <div
              key={fx.id}
              data-testid={`radar-fx-${fx.id}`}
              data-fx-kind={fx.kind}
              data-weapon-vfx={isHealFx ? 'heal' : weaponStyle}
              data-fx-duration={durationMs}
              className="pointer-events-none absolute inset-0"
            >
              {targetIds.map((targetId, tIdx) => {
                const to = snap.targets[targetId];
                if (!to) return null;
                const from = snap.from;
                const targetUnit = battle.units.find((u) => u.id === targetId);
                const { outcome, isSplash } = resolveTargetAttackOutcome(
                  targetId,
                  recentEvents,
                  targetUnit
                );

                // Heal beam/ring FX
                if (isHealFx) {
                  return (
                    <div
                      key={targetId}
                      data-testid={`vfx-heal-ring-${targetId}`}
                      className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                      style={
                        {
                          width: '44px',
                          height: '44px',
                          marginLeft: '-22px',
                          marginTop: '-22px',
                          border: '2px solid #34d399',
                          boxShadow: '0 0 10px rgba(52, 211, 153, 0.45)',
                          '--tx': `${to.x.toFixed(1)}px`,
                          '--ty': `${to.y.toFixed(1)}px`,
                          '--vfx-dur': `${vfxDurationMs}ms`,
                        } as CSSProperties
                      }
                    />
                  );
                }

                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.max(12, Math.hypot(dx, dy));
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

                // On dodge, overshoot slightly past the target
                const endX =
                  outcome === 'dodge' ? from.x + dx * 1.18 : to.x;
                const endY =
                  outcome === 'dodge' ? from.y + dy * 1.18 : to.y;

                // Curve control waypoints for missiles (pure translate3d, zero offset-path)
                const curveSign = isAlly ? -1 : 1;
                const nx = -dy / dist;
                const ny = dx / dist;
                const arcHeight = Math.min(46, Math.max(18, dist * 0.16)) * curveSign;
                const mx1 = from.x + (endX - from.x) * 0.36 + nx * arcHeight;
                const my1 = from.y + (endY - from.y) * 0.36 + ny * arcHeight;
                const mx2 = from.x + (endX - from.x) * 0.72 + nx * (arcHeight * 0.65);
                const my2 = from.y + (endY - from.y) * 0.72 + ny * (arcHeight * 0.65);
                const ang1 =
                  (Math.atan2(my1 - from.y, mx1 - from.x) * 180) / Math.PI;
                const ang2 =
                  (Math.atan2(my2 - my1, mx2 - mx1) * 180) / Math.PI;
                const ang3 =
                  (Math.atan2(endY - my2, endX - mx2) * 180) / Math.PI;

                const impactDelayMs = Math.round(vfxDurationMs * 0.48);
                const impactDurMs = Math.max(110, Math.round(vfxDurationMs * 0.68));
                const isSecondaryAreaHit =
                  weaponStyle === 'area' && (isSplash || tIdx > 0);

                return (
                  <div key={targetId} className="absolute inset-0">
                    {/* 1) PROJECTILE OR BEAM (skipped at x5/x10 high-speed compacting) */}
                    {vfxConfig.showProjectiles && !isSecondaryAreaHit && (
                      <>
                        {weaponStyle === 'beam' && (
                          <div
                            data-testid={`vfx-beam-${fx.id}-${targetId}`}
                            className="vfx-beam-fire absolute left-0 top-0"
                            style={
                              {
                                width: `${dist.toFixed(1)}px`,
                                height: isAlly ? '6px' : '8px',
                                marginTop: isAlly ? '-3px' : '-4px',
                                transformOrigin: '0% 50%',
                                borderRadius: isAlly ? '9999px' : '2px',
                                background: isAlly
                                  ? `linear-gradient(180deg, transparent, ${palette.primary}, #ffffff, ${palette.primary}, transparent)`
                                  : `repeating-linear-gradient(90deg, ${palette.primary} 0px, ${palette.core} 8px, #ef4444 14px)`,
                                boxShadow: `0 0 10px ${palette.glow}`,
                                '--sx': `${from.x.toFixed(1)}px`,
                                '--sy': `${from.y.toFixed(1)}px`,
                                '--ang': `${angleDeg.toFixed(2)}deg`,
                                '--vfx-dur': `${vfxDurationMs}ms`,
                              } as CSSProperties
                            }
                          />
                        )}

                        {weaponStyle === 'missile' && (
                          <>
                            <div
                              data-testid={`vfx-missile-${fx.id}-${targetId}`}
                              className="vfx-missile-arc absolute left-0 top-0"
                              style={
                                {
                                  width: '18px',
                                  height: '8px',
                                  marginLeft: '-9px',
                                  marginTop: '-4px',
                                  // Distinct team shapes: ally pointed nose, enemy notched diamond
                                  clipPath: isAlly
                                    ? 'polygon(0% 15%, 72% 0%, 100% 50%, 72% 100%, 0% 85%, 18% 50%)'
                                    : 'polygon(0% 50%, 28% 0%, 100% 25%, 82% 50%, 100% 75%, 28% 100%)',
                                  background: `linear-gradient(90deg, ${palette.primary}, ${palette.core})`,
                                  boxShadow: `0 0 8px ${palette.glow}`,
                                  '--sx': `${from.x.toFixed(1)}px`,
                                  '--sy': `${from.y.toFixed(1)}px`,
                                  '--mx1': `${mx1.toFixed(1)}px`,
                                  '--my1': `${my1.toFixed(1)}px`,
                                  '--mx2': `${mx2.toFixed(1)}px`,
                                  '--my2': `${my2.toFixed(1)}px`,
                                  '--ex': `${endX.toFixed(1)}px`,
                                  '--ey': `${endY.toFixed(1)}px`,
                                  '--ang1': `${ang1.toFixed(2)}deg`,
                                  '--ang2': `${ang2.toFixed(2)}deg`,
                                  '--ang3': `${ang3.toFixed(2)}deg`,
                                  '--vfx-dur': `${vfxDurationMs}ms`,
                                } as CSSProperties
                              }
                            />
                            {/* Decorative smoke trail puffs (Full mode at x1..x3 only) */}
                            {vfxConfig.showDecorativeParticles &&
                              [
                                { px: mx1, py: my1, delay: Math.round(vfxDurationMs * 0.24) },
                                { px: mx2, py: my2, delay: Math.round(vfxDurationMs * 0.48) },
                              ].map((puff, pIdx) => (
                                <span
                                  key={pIdx}
                                  data-testid={`vfx-particle-smoke-${fx.id}-${pIdx}`}
                                  className="vfx-smoke-puff absolute left-0 top-0 rounded-full"
                                  style={
                                    {
                                      width: '9px',
                                      height: '9px',
                                      marginLeft: '-4.5px',
                                      marginTop: '-4.5px',
                                      backgroundColor: 'rgba(203, 213, 225, 0.55)',
                                      animationDelay: `${puff.delay}ms`,
                                      '--px': `${puff.px.toFixed(1)}px`,
                                      '--py': `${puff.py.toFixed(1)}px`,
                                      '--vfx-dur': `${Math.max(120, Math.round(vfxDurationMs * 0.65))}ms`,
                                    } as CSSProperties
                                  }
                                />
                              ))}
                          </>
                        )}

                        {(weaponStyle === 'cannon' || weaponStyle === 'area') && (
                          <div
                            data-testid={`vfx-cannon-${fx.id}-${targetId}`}
                            className="vfx-cannon-fly absolute left-0 top-0"
                            style={
                              {
                                width: weaponStyle === 'area' ? '22px' : '20px',
                                height: weaponStyle === 'area' ? '7px' : '5px',
                                marginLeft: '-10px',
                                marginTop: '-2.5px',
                                // Distinct team shape: ally tapered lance, enemy blocky bolt
                                borderRadius: isAlly ? '2px 9999px 9999px 2px' : '1px',
                                background: `linear-gradient(90deg, transparent 0%, ${palette.primary} 42%, ${palette.core} 100%)`,
                                boxShadow: `0 0 8px ${palette.glow}`,
                                '--sx': `${from.x.toFixed(1)}px`,
                                '--sy': `${from.y.toFixed(1)}px`,
                                '--sx1': `${(from.x + (endX - from.x) * 0.14).toFixed(1)}px`,
                                '--sy1': `${(from.y + (endY - from.y) * 0.14).toFixed(1)}px`,
                                '--ex1': `${(from.x + (endX - from.x) * 0.86).toFixed(1)}px`,
                                '--ey1': `${(from.y + (endY - from.y) * 0.86).toFixed(1)}px`,
                                '--ex': `${endX.toFixed(1)}px`,
                                '--ey': `${endY.toFixed(1)}px`,
                                '--ang': `${angleDeg.toFixed(2)}deg`,
                                '--vfx-dur': `${vfxDurationMs}ms`,
                              } as CSSProperties
                            }
                          />
                        )}
                      </>
                    )}

                    {/* 2) TARGET IMPACT / OUTCOME EFFECT */}
                    {vfxConfig.showMainImpactOrHeal && outcome === 'dodge' && (
                      <div
                        data-testid={`vfx-dodge-${fx.id}-${targetId}`}
                        className="vfx-dodge-slide absolute left-0 top-0 flex flex-col items-center"
                        style={
                          {
                            marginLeft: '-24px',
                            marginTop: '-24px',
                            width: '48px',
                            animationDelay: `${Math.round(impactDelayMs * 0.6)}ms`,
                            '--tx': `${to.x.toFixed(1)}px`,
                            '--ty': `${to.y.toFixed(1)}px`,
                            '--dodge-dx': isAlly ? '12px' : '-12px',
                            '--vfx-dur': `${impactDurMs}ms`,
                          } as CSSProperties
                        }
                      >
                        <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-400/80 text-[11px] font-mono-nums font-bold text-slate-100 whitespace-nowrap">
                          ↔ {t('battle.vfxMiss')}
                        </span>
                      </div>
                    )}

                    {vfxConfig.showMainImpactOrHeal &&
                      outcome === 'shield_absorbed' && (
                        <div
                          data-testid={`vfx-shield-ripple-${fx.id}-${targetId}`}
                          className="vfx-ring-expand absolute left-0 top-0 rounded-full flex items-center justify-center"
                          style={
                            {
                              width: '50px',
                              height: '50px',
                              marginLeft: '-25px',
                              marginTop: '-25px',
                              border: '2.5px solid #38bdf8',
                              boxShadow:
                                'inset 0 0 8px rgba(56, 189, 248, 0.5), 0 0 12px rgba(56, 189, 248, 0.5)',
                              animationDelay: `${impactDelayMs}ms`,
                              '--tx': `${to.x.toFixed(1)}px`,
                              '--ty': `${to.y.toFixed(1)}px`,
                              '--vfx-dur': `${impactDurMs}ms`,
                            } as CSSProperties
                          }
                        />
                      )}

                    {vfxConfig.showMainImpactOrHeal && outcome === 'crit' && (
                      <>
                        <div
                          data-testid={`vfx-crit-flash-${fx.id}-${targetId}`}
                          className="vfx-crit-flash absolute left-0 top-0"
                          style={
                            {
                              width: '56px',
                              height: '56px',
                              marginLeft: '-28px',
                              marginTop: '-28px',
                              borderRadius: '4px',
                              border: '3px solid #fef08a',
                              background: 'rgba(254, 240, 138, 0.28)',
                              boxShadow: '0 0 16px rgba(250, 204, 21, 0.7)',
                              animationDelay: `${impactDelayMs}ms`,
                              '--tx': `${to.x.toFixed(1)}px`,
                              '--ty': `${to.y.toFixed(1)}px`,
                              '--vfx-dur': `${impactDurMs}ms`,
                            } as CSSProperties
                          }
                        />
                        <div
                          className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                          style={
                            {
                              width: '66px',
                              height: '66px',
                              marginLeft: '-33px',
                              marginTop: '-33px',
                              border: '3px double #facc15',
                              animationDelay: `${impactDelayMs}ms`,
                              '--tx': `${to.x.toFixed(1)}px`,
                              '--ty': `${to.y.toFixed(1)}px`,
                              '--vfx-dur': `${impactDurMs}ms`,
                            } as CSSProperties
                          }
                        />
                      </>
                    )}

                    {vfxConfig.showMainImpactOrHeal && outcome === 'normal' && (
                      <div
                        data-testid={`vfx-impact-${fx.id}-${targetId}`}
                        className="vfx-ring-expand absolute left-0 top-0"
                        style={
                          {
                            width:
                              weaponStyle === 'area'
                                ? isSecondaryAreaHit
                                  ? '42px'
                                  : '64px'
                                : weaponStyle === 'missile'
                                ? '54px'
                                : '38px',
                            height:
                              weaponStyle === 'area'
                                ? isSecondaryAreaHit
                                  ? '42px'
                                  : '64px'
                                : weaponStyle === 'missile'
                                ? '54px'
                                : '38px',
                            marginLeft:
                              weaponStyle === 'area'
                                ? isSecondaryAreaHit
                                  ? '-21px'
                                  : '-32px'
                                : weaponStyle === 'missile'
                                ? '-27px'
                                : '-19px',
                            marginTop:
                              weaponStyle === 'area'
                                ? isSecondaryAreaHit
                                  ? '-21px'
                                  : '-32px'
                                : weaponStyle === 'missile'
                                ? '-27px'
                                : '-19px',
                            // Distinct shapes: circle for ally/missile/area, sharp diamond border for enemy cannon
                            borderRadius:
                              !isAlly && weaponStyle === 'cannon' ? '4px' : '9999px',
                            border: `2.5px ${
                              weaponStyle === 'area' && isSecondaryAreaHit
                                ? 'dashed'
                                : 'solid'
                            } ${palette.primary}`,
                            background:
                              weaponStyle === 'missile' || weaponStyle === 'area'
                                ? palette.glow
                                : 'transparent',
                            animationDelay: `${impactDelayMs}ms`,
                            '--tx': `${to.x.toFixed(1)}px`,
                            '--ty': `${to.y.toFixed(1)}px`,
                            '--vfx-dur': `${impactDurMs}ms`,
                          } as CSSProperties
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        }
      )}

      {/* Brief HTML Hit Flash per unit (replaces SVG animated hit flash; skipped under reduced motion / Off) */}
      {vfxConfig.showMainImpactOrHeal &&
        Array.from(hitFlashUnitIds).map((unitId) => {
          const pt = unitCenter(unitId);
          if (!pt) return null;
          const unit = battle.units.find((u) => u.id === unitId);
          const isShielded = unit?.animState === 'shielded';
          return (
            <div
              key={`hit-${unitId}`}
              data-testid={`radar-hit-flash-${unitId}`}
              className="vfx-hit-flash-html absolute left-0 top-0 rounded-full"
              style={
                {
                  width: '44px',
                  height: '44px',
                  marginLeft: '-22px',
                  marginTop: '-22px',
                  border: isShielded ? '2.5px solid #38bdf8' : '2.5px solid #fef08a',
                  backgroundColor: isShielded
                    ? 'rgba(56, 189, 248, 0.25)'
                    : 'rgba(255, 255, 255, 0.35)',
                  '--tx': `${pt.x.toFixed(1)}px`,
                  '--ty': `${pt.y.toFixed(1)}px`,
                  '--vfx-dur': `${hitFlashDurationMs}ms`,
                } as CSSProperties
              }
            />
          );
        })}

      {/* Defeat Fade-Out Overlay (pure HTML translate3d + opacity) */}
      {vfxConfig.showMainImpactOrHeal &&
        Array.from(defeatFadingUnitIds).map((unitId) => {
          const pt = unitCenter(unitId);
          if (!pt) return null;
          return (
            <div
              key={`defeat-${unitId}`}
              data-testid={`radar-defeat-fade-${unitId}`}
              className="vfx-defeat-html absolute left-0 top-0 rounded-full"
              style={
                {
                  width: '48px',
                  height: '48px',
                  marginLeft: '-24px',
                  marginTop: '-24px',
                  border: '2px solid #f87171',
                  backgroundColor: 'rgba(239, 68, 68, 0.22)',
                  '--tx': `${pt.x.toFixed(1)}px`,
                  '--ty': `${pt.y.toFixed(1)}px`,
                  '--vfx-dur': `${defeatFadeDurationMs}ms`,
                } as CSSProperties
              }
            />
          );
        })}

      {/* Per-Unit Queued Status Effects (max 2 simultaneous per unit, HTML translate3d + opacity only) */}
      {vfxConfig.showStatusEffects &&
        activeStatusEffects.map((fx) => {
          const pt = unitCenter(fx.unitId);
          if (!pt) return null;
          const dur = `${fx.durationMs}ms`;

          if (fx.kind === 'hp_heal') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="hp_heal"
                className="absolute inset-0"
              >
                <div
                  className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '48px',
                      height: '48px',
                      marginLeft: '-24px',
                      marginTop: '-24px',
                      border: '2.5px solid #34d399',
                      boxShadow: '0 0 10px rgba(52, 211, 153, 0.45)',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-rise absolute left-0 top-0 text-[12px] font-mono-nums font-bold text-emerald-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-18px',
                      marginTop: '-26px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  {fx.label}
                </div>
                {vfxConfig.showDecorativeParticles &&
                  [-14, 0, 14].map((dx, i) => (
                    <span
                      key={i}
                      data-testid={`vfx-particle-heal-${fx.id}-${i}`}
                      className="vfx-particle-rise absolute left-0 top-0 text-[12px] font-bold text-emerald-300"
                      style={
                        {
                          marginLeft: `${dx - 4}px`,
                          marginTop: '-8px',
                          animationDelay: `${i * 70}ms`,
                          '--tx': `${pt.x.toFixed(1)}px`,
                          '--ty': `${pt.y.toFixed(1)}px`,
                          '--vfx-dur': dur,
                        } as CSSProperties
                      }
                    >
                      +
                    </span>
                  ))}
              </div>
            );
          }

          if (fx.kind === 'shield_heal') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="shield_heal"
                className="absolute inset-0"
              >
                <div
                  className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '50px',
                      height: '50px',
                      marginLeft: '-25px',
                      marginTop: '-25px',
                      border: '2.5px solid #38bdf8',
                      boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-rise absolute left-0 top-0 text-[11px] font-mono-nums font-bold text-sky-300 whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-20px',
                      marginTop: '-24px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  +{fx.amount ?? ''} SHD
                </div>
              </div>
            );
          }

          if (fx.kind === 'sp_restore') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="sp_restore"
                className="absolute inset-0"
              >
                <div
                  className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '44px',
                      height: '44px',
                      marginLeft: '-22px',
                      marginTop: '-22px',
                      border: '2px solid #c084fc',
                      backgroundColor: 'rgba(192, 132, 252, 0.16)',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-rise absolute left-0 top-0 text-[11px] font-mono-nums font-bold text-purple-300 whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-18px',
                      marginTop: '-24px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  ⚡ {fx.label}
                </div>
              </div>
            );
          }

          if (fx.kind === 'buff') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="buff"
                className="absolute inset-0"
              >
                <div
                  className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '46px',
                      height: '46px',
                      marginLeft: '-23px',
                      marginTop: '-23px',
                      border: '2px solid #4ade80',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-rise absolute left-0 top-0 px-1 rounded bg-emerald-950/90 border border-emerald-400/70 text-[11px] font-mono-nums font-bold text-emerald-200 whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-24px',
                      marginTop: '-26px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  ▲ {fx.label}
                </div>
              </div>
            );
          }

          if (fx.kind === 'debuff') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="debuff"
                className="absolute inset-0"
              >
                {/* Red outline pulse with short shake */}
                <div
                  className="vfx-debuff-shake absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '46px',
                      height: '46px',
                      marginLeft: '-23px',
                      marginTop: '-23px',
                      border: '2px dashed #f87171',
                      boxShadow: '0 0 8px rgba(248, 113, 113, 0.45)',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-fall absolute left-0 top-0 px-1 rounded bg-red-950/90 border border-red-400/70 text-[11px] font-mono-nums font-bold text-red-200 whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-24px',
                      marginTop: '-10px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  ▼ {fx.label}
                </div>
              </div>
            );
          }

          if (fx.kind === 'shield_break') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="shield_break"
                className="absolute inset-0"
              >
                {/* Cracking & dissolving split shield arcs */}
                <div
                  className="vfx-shield-shard-left absolute left-0 top-0 rounded-l-full"
                  style={
                    {
                      width: '22px',
                      height: '44px',
                      marginLeft: '-22px',
                      marginTop: '-22px',
                      borderLeft: '3px solid #38bdf8',
                      borderTop: '3px solid #38bdf8',
                      borderBottom: '3px solid #38bdf8',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-shield-shard-right absolute left-0 top-0 rounded-r-full"
                  style={
                    {
                      width: '22px',
                      height: '44px',
                      marginLeft: '0px',
                      marginTop: '-22px',
                      borderRight: '3px solid #f87171',
                      borderTop: '3px solid #f87171',
                      borderBottom: '3px solid #f87171',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
                <div
                  className="vfx-particle-rise absolute left-0 top-0 px-1 rounded bg-slate-950/90 border border-sky-400/70 text-[11px] font-mono-nums font-bold text-sky-200 whitespace-nowrap"
                  style={
                    {
                      marginLeft: '-30px',
                      marginTop: '-26px',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                >
                  × {t('battle.vfxShieldBreak')}
                </div>
              </div>
            );
          }

          if (fx.kind === 'stealth_enter') {
            return (
              <div
                key={fx.id}
                data-testid={`vfx-status-${fx.unitId}`}
                data-vfx-kind="stealth_enter"
                className="absolute inset-0"
              >
                <div
                  className="vfx-stealth-veil absolute left-0 top-0 rounded-full"
                  style={
                    {
                      width: '46px',
                      height: '46px',
                      marginLeft: '-23px',
                      marginTop: '-23px',
                      border: '2px dashed #94a3b8',
                      backgroundColor: 'rgba(148, 163, 184, 0.18)',
                      '--tx': `${pt.x.toFixed(1)}px`,
                      '--ty': `${pt.y.toFixed(1)}px`,
                      '--vfx-dur': dur,
                    } as CSSProperties
                  }
                />
              </div>
            );
          }

          // stealth_reveal: single radar sweep ring
          return (
            <div
              key={fx.id}
              data-testid={`vfx-status-${fx.unitId}`}
              data-vfx-kind="stealth_reveal"
              className="absolute inset-0"
            >
              <div
                className="vfx-ring-expand absolute left-0 top-0 rounded-full"
                style={
                  {
                    width: '56px',
                    height: '56px',
                    marginLeft: '-28px',
                    marginTop: '-28px',
                    border: '2px solid #facc15',
                    boxShadow: '0 0 12px rgba(250, 204, 21, 0.5)',
                    '--tx': `${pt.x.toFixed(1)}px`,
                    '--ty': `${pt.y.toFixed(1)}px`,
                    '--vfx-dur': dur,
                  } as CSSProperties
                }
              />
              <div
                className="vfx-particle-rise absolute left-0 top-0 px-1 rounded bg-slate-950/90 border border-amber-400/75 text-[11px] font-mono-nums font-bold text-amber-200 whitespace-nowrap"
                style={
                  {
                    marginLeft: '-30px',
                    marginTop: '-26px',
                    '--tx': `${pt.x.toFixed(1)}px`,
                    '--ty': `${pt.y.toFixed(1)}px`,
                    '--vfx-dur': dur,
                  } as CSSProperties
                }
              >
                ◎ {t('battle.vfxReveal')}
              </div>
            </div>
          );
        })}
    </div>
  );
}
