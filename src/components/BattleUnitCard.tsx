import {
  Anchor,
  BatteryCharging,
  Castle,
  EyeOff,
  Flame,
  Gauge,
  Heart,
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
import { getEffectiveUnitSpeed, hasStatus } from '../engine/combat';
import {
  getArchetypeLabel,
  getClassName,
  getStatusDesc,
  getStatusLabel,
  useI18n,
} from '../i18n';
import type {
  ActiveStatusEffect,
  CombatUnit,
  FloatingPopup,
  StatusEffectType,
} from '../types/game';
import { FighterSvg } from './FighterSvg';

interface BattleUnitCardProps {
  unit: CombatUnit;
  isActiveTurn: boolean;
  isTargeted: boolean;
  canTarget: boolean;
  exploding: boolean;
  skipAnimations: boolean;
  popups: FloatingPopup[];
  onSelect?: () => void;
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
  popups,
  onSelect,
}: BattleUnitCardProps) {
  const { lang, t } = useI18n();
  const hpRatio = Math.max(0, Math.min(1, unit.hp / unit.derived.maxHp));
  const shieldRatio =
    unit.derived.maxShield > 0
      ? Math.max(0, Math.min(1, unit.shield / unit.derived.maxShield))
      : 0;
  const spRatio =
    unit.derived.maxSp > 0
      ? Math.max(0, Math.min(1, unit.sp / unit.derived.maxSp))
      : 0;

  const isEnemy = unit.side === 'enemy';
  const shieldBroken = hasStatus(unit, 'shield_break');
  const isStealthed = hasStatus(unit, 'stealth');
  const effectiveSpeed = getEffectiveUnitSpeed(unit);

  const hpBarColor =
    hpRatio <= 0.25
      ? 'bg-red-500'
      : hpRatio <= 0.55
      ? 'bg-amber-400'
      : 'bg-emerald-500';

  const statusLabel = !unit.alive
    ? t('battle.status.destroyed')
    : isActiveTurn
    ? t('battle.status.active')
    : unit.isDefending
    ? t('battle.status.defending')
    : isTargeted
    ? isEnemy
      ? t('battle.status.targeted')
      : t('battle.status.allyTarget')
    : unit.isPlayer
    ? t('battle.status.player')
    : t('battle.status.standby');

  const cardBorder = !unit.alive
    ? 'border-slate-800/60 bg-[#080C12]/60 opacity-55'
    : isActiveTurn
    ? 'border-amber-400 bg-[#141D2C] shadow-[0_0_0_1px_rgba(251,191,36,0.35)]'
    : isTargeted
    ? isEnemy
      ? 'border-red-400/90 bg-[#1B1319] shadow-[0_0_0_1px_rgba(248,113,113,0.35)]'
      : 'border-emerald-400/90 bg-[#0F1E1A] shadow-[0_0_0_1px_rgba(52,211,153,0.35)]'
    : unit.isBoss
    ? 'border-amber-500/60 bg-[#16111B]/95 hover:border-amber-400'
    : 'border-slate-800/90 bg-[#0E141F]/95 hover:border-slate-700';

  const interactiveProps =
    canTarget && unit.alive && onSelect
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: onSelect,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          },
        }
      : {};

  return (
    <div
      {...interactiveProps}
      className={`relative rounded-lg border p-3 transition-colors select-none ${cardBorder} ${
        canTarget && unit.alive ? 'cursor-pointer' : ''
      } ${isStealthed && unit.alive ? 'border-dashed opacity-85' : ''} ${getAnimClass(
        unit,
        skipAnimations
      )}`}
    >
      {/* Floating Popups (skipped when skipAnimations active) */}
      {!skipAnimations &&
        popups.map((pop, idx) => (
          <div
            key={pop.id}
            style={{ top: `${12 + idx * 18}px` }}
            className={`pointer-events-none absolute left-1/2 z-20 font-display text-lg font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] whitespace-nowrap anim-popup ${getPopupColor(
              pop.tone
            )}`}
          >
            {pop.text}
          </div>
        ))}

      <div
        className={`flex items-center gap-3 ${
          isEnemy ? 'flex-row-reverse text-right' : 'flex-row text-left'
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
            size="md"
            destroyed={!unit.alive}
            defending={unit.isDefending || hasStatus(unit, 'invincible')}
            impactFlash={!skipAnimations && unit.animState === 'hit'}
            exploding={!skipAnimations && exploding}
          />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div
            className={`flex items-baseline justify-between gap-2 ${
              isEnemy ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div className="min-w-0">
              <div
                className={`font-display text-lg font-bold leading-none text-slate-100 truncate flex items-center gap-1.5 ${
                  isEnemy ? 'justify-end' : 'justify-start'
                }`}
              >
                {unit.isBoss && (
                  <Skull className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="truncate">{unit.name}</span>
                {unit.row === 'back' && unit.alive && (
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

            <div
              className={`shrink-0 text-[10px] font-semibold tracking-wider inline-flex items-center gap-1 ${
                !unit.alive
                  ? 'text-slate-500'
                  : isActiveTurn
                  ? 'text-amber-400'
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
          </div>

          {/* Active Status Effects Row (all buffs, debuffs, stances) */}
          {unit.alive && unit.statuses.length > 0 && (
            <div
              className={`flex flex-wrap items-center gap-1 ${
                isEnemy ? 'justify-end' : 'justify-start'
              }`}
            >
              {unit.statuses.map((st) => (
                <span
                  key={st.type}
                  title={getStatusDesc(lang, st.type)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-nums font-semibold border ${getStatusBadgeStyle(
                    st
                  )}`}
                >
                  <StatusMiniIcon type={st.type} />
                  <span>
                    {getStatusLabel(lang, st.type)} {formatStatusSuffix(st)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* HP Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-nums">
              <span className="text-slate-400">HP</span>
              <span className="text-slate-100">
                {unit.hp}/{unit.derived.maxHp}
              </span>
            </div>
            <div className="relative h-2 w-full rounded-sm bg-slate-900 overflow-hidden">
              {!skipAnimations && (
                <div
                  className="absolute inset-0 bg-white/30 meter-trail"
                  style={{ transform: `scaleX(${hpRatio})` }}
                />
              )}
              <div
                className={`absolute inset-0 ${hpBarColor} ${
                  skipAnimations ? '' : 'meter-fill'
                }`}
                style={{ transform: `scaleX(${hpRatio})` }}
              />
            </div>
          </div>

          {/* Shield & SP Bars */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] font-mono-nums">
                <span
                  className={
                    shieldBroken ? 'text-red-400 line-through' : 'text-sky-400/90'
                  }
                >
                  SHD
                </span>
                <span
                  className={shieldBroken ? 'text-red-300' : 'text-sky-200'}
                >
                  {unit.shield}/{unit.derived.maxShield}
                </span>
              </div>
              <div className="relative h-1.5 w-full rounded-sm bg-slate-900 overflow-hidden">
                <div
                  className={`absolute inset-0 ${
                    shieldBroken ? 'bg-red-500/50' : 'bg-sky-400'
                  } ${skipAnimations ? '' : 'meter-fill'}`}
                  style={{ transform: `scaleX(${shieldRatio})` }}
                />
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] font-mono-nums">
                <span className="text-amber-400/90">SP</span>
                <span className="text-amber-200">
                  {unit.sp}/{unit.derived.maxSp}
                </span>
              </div>
              <div className="relative h-1.5 w-full rounded-sm bg-slate-900 overflow-hidden">
                <div
                  className={`absolute inset-0 bg-amber-400 ${
                    skipAnimations ? '' : 'meter-fill'
                  }`}
                  style={{ transform: `scaleX(${spRatio})` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
