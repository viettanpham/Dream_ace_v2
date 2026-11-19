import {
  Anchor,
  BatteryCharging,
  Castle,
  EyeOff,
  Flame,
  Gauge,
  Heart,
  Info,
  Radio,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldOff,
  Skull,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Target,
  Wind,
  Zap,
} from 'lucide-react';
import { useRef } from 'react';
import {
  getEffectiveUnitSpeed,
  getTeamColorRole,
  hasStatus,
} from '../engine/combat';
import {
  getArchetypeLabel,
  getClassName,
  getStatusDesc,
  getStatusLabel,
  getTeamTagLabel,
  useI18n,
} from '../i18n';
import type {
  ActiveStatusEffect,
  CombatUnit,
  FloatingPopup,
  StatusEffectType,
  TeamColorRole,
} from '../types/game';
import { FighterSvg } from './FighterSvg';
import { StatBar } from './StatBar';

interface BattleUnitCardProps {
  unit: CombatUnit;
  isActiveTurn: boolean;
  isTargeted: boolean;
  canTarget: boolean;
  exploding: boolean;
  skipAnimations: boolean;
  autoActive?: boolean;
  compact?: boolean;
  frontBlocked?: boolean;
  wingmanChatText?: string | null;
  popups: FloatingPopup[];
  onSelect?: () => void;
  onInspect?: () => void;
}

function getTeamVars(role: TeamColorRole): {
  accent: string;
  bg: string;
  border: string;
} {
  switch (role) {
    case 'me':
      return {
        accent: 'var(--team-me)',
        bg: 'var(--team-me-bg)',
        border: 'var(--team-me-border)',
      };
    case 'ally':
      return {
        accent: 'var(--team-ally)',
        bg: 'var(--team-ally-bg)',
        border: 'var(--team-ally-border)',
      };
    case 'boss':
      return {
        accent: 'var(--team-boss)',
        bg: 'var(--team-boss-bg)',
        border: 'var(--team-boss-border)',
      };
    case 'enemy':
    default:
      return {
        accent: 'var(--team-enemy)',
        bg: 'var(--team-enemy-bg)',
        border: 'var(--team-enemy-border)',
      };
  }
}

function getAnimClass(unit: CombatUnit, skip: boolean): string {
  if (skip) return '';
  switch (unit.animState) {
    case 'attacking':
      return unit.side === 'ally' ? 'anim-lunge-right' : 'anim-lunge-left';
    case 'hit':
      return 'anim-hit';
    case 'evaded':
      return 'anim-evade';
    case 'shielded':
      return 'anim-shield';
    case 'casting':
      return 'anim-cast';
    default:
      return '';
  }
}

function getPopupColor(tone: FloatingPopup['tone']): string {
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

function getStatusBadgeStyle(st: ActiveStatusEffect): string {
  switch (st.type) {
    case 'burn':
      return 'border-orange-500/50 bg-orange-500/15 text-orange-300';
    case 'shield_break':
    case 'def_down':
    case 'vulnerable':
      return 'border-red-500/50 bg-red-500/15 text-red-300';
    case 'slow':
      return 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300';
    case 'silence':
      return 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300';
    case 'stealth':
      return 'border-purple-400/60 bg-purple-500/15 text-purple-200';
    case 'siege_mode':
    case 'siege_defense':
    case 'charging':
      return 'border-amber-400/60 bg-amber-500/15 text-amber-300';
    case 'invincible':
    case 'evade_all':
    case 'regen_hp':
      return 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300';
    default:
      return 'border-sky-400/50 bg-sky-500/15 text-sky-200';
  }
}

function StatusMiniIcon({ type }: { type: StatusEffectType }) {
  const cls = 'w-2.5 h-2.5 shrink-0';
  switch (type) {
    case 'burn':
      return <Flame className={cls} />;
    case 'shield_break':
      return <ShieldOff className={cls} />;
    case 'slow':
      return <Snowflake className={cls} />;
    case 'silence':
      return <Radio className={cls} />;
    case 'stealth':
      return <EyeOff className={cls} />;
    case 'vulnerable':
    case 'def_down':
      return <ShieldAlert className={cls} />;
    case 'siege_mode':
      return <Anchor className={cls} />;
    case 'siege_defense':
      return <Castle className={cls} />;
    case 'charging':
      return <BatteryCharging className={cls} />;
    case 'sure_hit':
      return <Target className={cls} />;
    case 'counter':
      return <RotateCcw className={cls} />;
    case 'evade_all':
      return <Sparkles className={cls} />;
    case 'invincible':
      return <Sun className={cls} />;
    case 'regen_hp':
      return <Heart className={cls} />;
    case 'spd_up':
      return <Gauge className={cls} />;
    case 'eva_up':
      return <Wind className={cls} />;
    case 'atk_up':
    case 'primary_dmg_up':
      return <Swords className={cls} />;
    case 'skill_dmg_up':
      return <Zap className={cls} />;
    case 'def_up':
    default:
      return <Shield className={cls} />;
  }
}

function formatStatusSuffix(st: ActiveStatusEffect): string {
  if (st.type === 'siege_mode' || st.type === 'siege_defense') {
    return 'ON';
  }
  if (st.type === 'charging') {
    return '⚡';
  }
  if (st.charges && st.charges > 0) {
    return `${st.charges}x`;
  }
  if (st.turnsRemaining >= 50) {
    return '∞';
  }
  return `${st.turnsRemaining}t`;
}

export function BattleUnitCard({
  unit,
  isActiveTurn,
  isTargeted,
  canTarget,
  exploding,
  skipAnimations,
  autoActive = false,
  compact = false,
  frontBlocked = false,
  wingmanChatText = null,
  popups,
  onSelect,
  onInspect,
}: BattleUnitCardProps) {
  const { lang, t } = useI18n();
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const hpRatio = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.derived.maxHp)));

  const isEnemy = unit.side === 'enemy';
  const shieldBroken = hasStatus(unit, 'shield_break');
  const isStealthed = hasStatus(unit, 'stealth');
  const effectiveSpeed = getEffectiveUnitSpeed(unit);
  const teamRole = getTeamColorRole(unit);
  const teamVars = getTeamVars(teamRole);
  const teamTag = getTeamTagLabel(lang, teamRole);

  const hpBarColor =
    hpRatio <= 0.25
      ? 'bg-red-500'
      : hpRatio <= 0.55
      ? 'bg-orange-400'
      : 'bg-emerald-500';

  const statusLabel = !unit.alive
    ? t('battle.status.destroyed')
    : isActiveTurn
    ? t('queue.actingLabel')
    : unit.isDefending
    ? t('battle.status.defending')
    : isTargeted
    ? isEnemy
      ? t('battle.status.targeted')
      : t('battle.status.allyTarget')
    : unit.isPlayer
    ? t('battle.status.player')
    : t('battle.status.standby');

  const cardStyle: React.CSSProperties | undefined = !unit.alive
    ? undefined
    : isActiveTurn
    ? {
        borderColor: 'var(--turn-active)',
        backgroundColor: '#141D2C',
      }
    : isTargeted
    ? {
        borderColor: isEnemy ? 'var(--team-enemy)' : 'var(--team-me)',
        backgroundColor: isEnemy ? '#1B1319' : '#0F1E1A',
      }
    : {
        borderColor: teamVars.border,
      };

  const cardClass = !unit.alive
    ? 'border-slate-800/60 bg-[#080C12]/60 opacity-55'
    : isActiveTurn
    ? skipAnimations
      ? 'shadow-[0_0_0_1px_var(--turn-active)]'
      : 'anim-turn-active'
    : 'bg-[#0E141F]/95 hover:brightness-110';

  const startLongPress = () => {
    if (!onInspect) return;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      onInspect();
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = () => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (canTarget && unit.alive && onSelect) {
      onSelect();
    } else if (onInspect) {
      onInspect();
    }
  };

  const isClickable = (canTarget && unit.alive && Boolean(onSelect)) || Boolean(onInspect);

  const visibleStatuses = compact ? unit.statuses.slice(0, 3) : unit.statuses;
  const overflowStatuses = compact ? Math.max(0, unit.statuses.length - 3) : 0;

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleCardClick : undefined}
      onKeyDown={
        isClickable
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick();
              }
            }
          : undefined
      }
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      style={cardStyle}
      className={`relative rounded-lg border transition-all select-none ${
        compact ? 'p-2' : 'p-3'
      } ${cardClass} ${isClickable ? 'cursor-pointer' : ''} ${
        isStealthed && unit.alive ? 'border-dashed opacity-85' : ''
      } ${frontBlocked && unit.alive ? 'opacity-85' : ''} ${getAnimClass(
        unit,
        skipAnimations
      )}`}
    >
      {/* Floating Popups (skipped when skipAnimations active) */}
      {!skipAnimations &&
        popups.map((pop, idx) => (
          <div
            key={pop.id}
            style={{ top: `${10 + idx * 18}px` }}
            className={`pointer-events-none absolute left-1/2 z-20 font-display text-lg font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] whitespace-nowrap anim-popup ${getPopupColor(
              pop.tone
            )}`}
          >
            {pop.text}
          </div>
        ))}

      {/* Wingman Radio Chatter Pill */}
      {wingmanChatText && unit.alive && (
        <div className="mb-1.5 rounded border border-sky-400/60 bg-sky-950/80 px-2 py-1 text-[11px] text-sky-100 flex items-center gap-1.5">
          <Radio className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="truncate">&ldquo;{wingmanChatText}&rdquo;</span>
        </div>
      )}

      <div
        className={`flex items-center ${compact ? 'gap-2' : 'gap-3'} ${
          isEnemy && !compact ? 'flex-row-reverse text-right' : 'flex-row text-left'
        }`}
      >
        <div
          className={`relative shrink-0 ${
            isStealthed && unit.alive ? 'opacity-60' : ''
          }`}
        >
          <FighterSvg
            classId={unit.classId}
            side={unit.side}
            facing={isEnemy ? 'left' : 'right'}
            size={compact ? 'sm' : 'md'}
            destroyed={!unit.alive}
            defending={unit.isDefending || hasStatus(unit, 'invincible')}
            impactFlash={!skipAnimations && unit.animState === 'hit'}
            exploding={!skipAnimations && exploding}
          />
        </div>

        <div className={`flex-1 min-w-0 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
          <div
            className={`flex items-start justify-between gap-1.5 ${
              isEnemy && !compact ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div
                className={`font-display ${
                  compact ? 'text-sm' : 'text-lg'
                } font-bold leading-tight text-slate-100 truncate flex items-center gap-1 ${
                  isEnemy && !compact ? 'justify-end' : 'justify-start'
                }`}
              >
                {unit.isBoss && (
                  <Skull
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--team-boss)' }}
                  />
                )}
                {!compact && (
                  <span
                    className="text-[9px] font-mono-nums font-bold px-1 py-0.5 rounded border shrink-0"
                    style={{
                      color: teamVars.accent,
                      borderColor: teamVars.border,
                      backgroundColor: teamVars.bg,
                    }}
                  >
                    {teamTag}
                  </span>
                )}
                <span
                  className="truncate"
                  style={{ color: unit.alive ? teamVars.accent : undefined }}
                >
                  {unit.name}
                </span>
                {unit.isPlayer && autoActive && unit.alive && (
                  <span className="px-1 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-mono-nums font-extrabold tracking-wider shrink-0">
                    {t('auto.badge')}
                  </span>
                )}
                {unit.isStructure && unit.alive && (
                  <span className="px-1 py-0.5 rounded bg-orange-500/20 border border-orange-400/50 text-[9px] font-mono-nums font-bold text-orange-300 shrink-0">
                    {t('battle.structureTag')}
                  </span>
                )}
                {!compact && unit.row === 'back' && unit.alive && (
                  <span className="px-1 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-[9px] font-mono-nums font-semibold text-sky-300 shrink-0">
                    {t('common.backRow')}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                {unit.archetype
                  ? getArchetypeLabel(lang, unit.archetype)
                  : getClassName(lang, unit.classId)}{' '}
                · {t('common.levelShort')}
                <span className="font-mono-nums">{unit.level}</span> · SPD{' '}
                <span
                  className={`font-mono-nums ${
                    hasStatus(unit, 'slow')
                      ? 'text-cyan-400 font-semibold'
                      : hasStatus(unit, 'spd_up')
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  {effectiveSpeed}
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1">
              {!compact && (
                <div
                  style={
                    isActiveTurn && unit.alive
                      ? { color: 'var(--turn-active-text)' }
                      : undefined
                  }
                  className={`text-[10px] font-semibold tracking-wider inline-flex items-center gap-1 ${
                    !unit.alive
                      ? 'text-slate-500'
                      : isActiveTurn
                      ? 'font-extrabold'
                      : isTargeted
                      ? isEnemy
                        ? 'text-red-400'
                        : 'text-emerald-400'
                      : unit.isDefending
                      ? 'text-sky-400'
                      : unit.isPlayer
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {unit.isDefending && unit.alive && <Shield className="w-3 h-3" />}
                  <span>{statusLabel}</span>
                </div>
              )}

              {onInspect && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspect();
                  }}
                  aria-label={t('battle.inspectUnit')}
                  title={t('battle.inspectUnit')}
                  className="min-w-[32px] min-h-[32px] sm:min-w-[28px] sm:min-h-[28px] rounded border border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-sky-300 flex items-center justify-center cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Active Status Effects Row */}
          {unit.alive && visibleStatuses.length > 0 && (
            <div
              className={`flex flex-wrap items-center gap-1 ${
                isEnemy && !compact ? 'justify-end' : 'justify-start'
              }`}
            >
              {visibleStatuses.map((st) => (
                <span
                  key={st.type}
                  title={getStatusDesc(lang, st.type)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-nums font-semibold border ${getStatusBadgeStyle(
                    st
                  )}`}
                >
                  <StatusMiniIcon type={st.type} />
                  <span>
                    {compact
                      ? formatStatusSuffix(st)
                      : `${getStatusLabel(lang, st.type)} ${formatStatusSuffix(st)}`}
                  </span>
                </span>
              ))}
              {overflowStatuses > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-nums font-bold border border-slate-700 bg-slate-900 text-slate-300">
                  +{overflowStatuses}
                </span>
              )}
            </div>
          )}

          {/* HP Bar */}
          <StatBar
            label="HP"
            value={unit.hp}
            max={unit.derived.maxHp}
            fillClassName={hpBarColor}
            heightClassName={compact ? 'h-1.5' : 'h-2'}
            instant={skipAnimations}
            showTrail
            compactHeader={compact}
          />

          {/* Shield & SP Bars */}
          <div className="grid grid-cols-2 gap-1.5">
            <StatBar
              label="SHD"
              labelClassName={
                shieldBroken ? 'text-red-400 line-through' : 'text-sky-400/90'
              }
              valueClassName={shieldBroken ? 'text-red-300' : 'text-sky-200'}
              value={unit.shield}
              max={Math.max(1, unit.derived.maxShield)}
              valueText={compact ? `${unit.shield}` : `${unit.shield}/${unit.derived.maxShield}`}
              fillClassName={shieldBroken ? 'bg-red-500/50' : 'bg-sky-400'}
              heightClassName="h-1.5"
              instant={skipAnimations}
              showTrail
              compactHeader
            />

            <StatBar
              label="SP"
              labelClassName="text-purple-300/90"
              valueClassName="text-purple-200"
              value={unit.sp}
              max={Math.max(1, unit.derived.maxSp)}
              valueText={compact ? `${unit.sp}` : `${unit.sp}/${unit.derived.maxSp}`}
              fillClassName="bg-purple-400"
              heightClassName="h-1.5"
              instant={skipAnimations}
              showTrail
              compactHeader
            />
          </div>
        </div>
      </div>
    </div>
  );
}
