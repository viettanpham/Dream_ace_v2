import { Shield } from 'lucide-react';
import { getClassName, useI18n } from '../i18n';
import type { CombatUnit, FloatingPopup } from '../types/game';
import { FighterSvg } from './FighterSvg';

interface BattleUnitCardProps {
  unit: CombatUnit;
  isActiveTurn: boolean;
  isTargeted: boolean;
  canTarget: boolean;
  exploding: boolean;
  popups: FloatingPopup[];
  onSelect?: () => void;
}

function getAnimClass(unit: CombatUnit): string {
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
  }
}

export function BattleUnitCard({
  unit,
  isActiveTurn,
  isTargeted,
  canTarget,
  exploding,
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
    ? t('battle.status.targeted')
    : unit.isPlayer
    ? t('battle.status.player')
    : t('battle.status.standby');

  const cardBorder = !unit.alive
    ? 'border-slate-800/60 bg-[#080C12]/60 opacity-55'
    : isActiveTurn
    ? 'border-amber-400 bg-[#141D2C] shadow-[0_0_0_1px_rgba(251,191,36,0.35)]'
    : isTargeted
    ? 'border-red-400/90 bg-[#1B1319] shadow-[0_0_0_1px_rgba(248,113,113,0.35)]'
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
      } ${getAnimClass(unit)}`}
    >
      {/* Floating Combat Popups */}
      {popups.map((pop, idx) => (
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
        {/* Space Fighter / Drone Sprite */}
        <div className="relative shrink-0">
          <FighterSvg
            classId={unit.classId}
            side={unit.side}
            facing={isEnemy ? 'left' : 'right'}
            size="md"
            destroyed={!unit.alive}
            defending={unit.isDefending}
            impactFlash={unit.animState === 'hit'}
            exploding={exploding}
          />
        </div>

        {/* Unit Info & Animated Bars */}
        <div className="flex-1 min-w-0 space-y-2">
          <div
            className={`flex items-baseline justify-between gap-2 ${
              isEnemy ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-none text-slate-100 truncate">
                {unit.name}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                {getClassName(lang, unit.classId)} · {t('common.levelShort')}
                <span className="font-mono-nums">{unit.level}</span> · SPD{' '}
                <span className="font-mono-nums text-slate-300">
                  {unit.derived.speed}
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
                  ? 'text-red-400'
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

          {/* HP Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-nums">
              <span className="text-slate-400">HP</span>
              <span className="text-slate-100">
                {unit.hp}/{unit.derived.maxHp}
              </span>
            </div>
            <div className="relative h-2 w-full rounded-sm bg-slate-900 overflow-hidden">
              <div
                className="absolute inset-0 bg-white/30 meter-trail"
                style={{ transform: `scaleX(${hpRatio})` }}
              />
              <div
                className={`absolute inset-0 ${hpBarColor} meter-fill`}
                style={{ transform: `scaleX(${hpRatio})` }}
              />
            </div>
          </div>

          {/* Shield & SP Bars */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] font-mono-nums">
                <span className="text-sky-400/90">SHD</span>
                <span className="text-sky-200">
                  {unit.shield}/{unit.derived.maxShield}
                </span>
              </div>
              <div className="relative h-1.5 w-full rounded-sm bg-slate-900 overflow-hidden">
                <div
                  className="absolute inset-0 bg-sky-200/30 meter-trail"
                  style={{ transform: `scaleX(${shieldRatio})` }}
                />
                <div
                  className="absolute inset-0 bg-sky-400 meter-fill"
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
                  className="absolute inset-0 bg-amber-400 meter-fill"
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
