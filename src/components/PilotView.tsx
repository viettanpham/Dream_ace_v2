import { useMemo, useState } from 'react';
import { Check, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  EMPTY_STAT_BLOCK,
  MECH_CLASSES,
  MECH_CLASS_LIST,
  STAT_KEYS,
} from '../data/classes';
import { PROGRESSION_CONFIG } from '../data/progression';
import { sumEquippedStatBonuses } from '../engine/equipment';
import {
  calculateDerivedStats,
  calculateEffectiveStats,
  getExpForNextLevel,
} from '../engine/stats';
import {
  getClassCode,
  getClassDesc,
  getClassName,
  getClassRole,
  getStatDesc,
  getStatLabel,
  getStatShort,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { MechClassId, StatBlock, StatKey } from '../types/game';
import { soundFx } from '../utils/sound';
import { FighterSvg } from './FighterSvg';

export function PilotView() {
  const { lang, t } = useI18n();
  const player = useGameStore((s) => s.player);
  const setPilotName = useGameStore((s) => s.setPilotName);
  const switchClass = useGameStore((s) => s.switchClass);
  const commitStatAllocations = useGameStore((s) => s.commitStatAllocations);
  const resetStatAllocations = useGameStore((s) => s.resetStatAllocations);

  const [pending, setPending] = useState<StatBlock>({ ...EMPTY_STAT_BLOCK });

  const pendingTotal = STAT_KEYS.reduce((sum, key) => sum + pending[key], 0);
  const remainingPoints = player.unspentPoints - pendingTotal;
  const spentTotal = STAT_KEYS.reduce(
    (sum, key) => sum + player.allocatedPoints[key],
    0
  );

  const equipBonuses = useMemo(
    () => sumEquippedStatBonuses(player.equipped),
    [player.equipped]
  );

  const currentStats = useMemo(
    () =>
      calculateEffectiveStats(
        player.classId,
        player.level,
        player.allocatedPoints,
        EMPTY_STAT_BLOCK,
        equipBonuses
      ),
    [player.classId, player.level, player.allocatedPoints, equipBonuses]
  );

  const previewStats = useMemo(
    () =>
      calculateEffectiveStats(
        player.classId,
        player.level,
        player.allocatedPoints,
        pending,
        equipBonuses
      ),
    [player.classId, player.level, player.allocatedPoints, pending, equipBonuses]
  );

  const currentDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, currentStats),
    [player.classId, player.level, currentStats]
  );

  const previewDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, previewStats),
    [player.classId, player.level, previewStats]
  );

  const activeClass = MECH_CLASSES[player.classId];
  const nextExp = getExpForNextLevel(player.level);
  const expPct = Math.min(100, Math.round((player.exp / nextExp) * 100));

  const adjustPending = (key: StatKey, delta: number) => {
    if (delta > 0 && remainingPoints <= 0) return;
    if (delta < 0 && pending[key] <= 0) return;
    soundFx.playClick();
    setPending((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  };

  const handleConfirmAllocation = () => {
    if (pendingTotal <= 0) return;
    commitStatAllocations(pending);
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const handleClearPending = () => {
    soundFx.playClick();
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const handleRespec = () => {
    resetStatAllocations();
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const handleClassSelect = (classId: MechClassId) => {
    switchClass(classId);
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const derivedCards = [
    {
      key: 'hp',
      label: t('derived.maxHp'),
      cur: currentDerived.maxHp,
      prev: previewDerived.maxHp,
      color: 'text-emerald-400',
    },
    {
      key: 'shield',
      label: t('derived.maxShield'),
      cur: currentDerived.maxShield,
      prev: previewDerived.maxShield,
      color: 'text-sky-400',
    },
    {
      key: 'sp',
      label: t('derived.maxSp'),
      cur: currentDerived.maxSp,
      prev: previewDerived.maxSp,
      color: 'text-amber-400',
    },
    {
      key: 'speed',
      label: t('derived.speed'),
      cur: currentDerived.speed,
      prev: previewDerived.speed,
      color: 'text-slate-100',
    },
    {
      key: 'dodge',
      label: t('derived.dodge'),
      cur: currentDerived.dodgeChance,
      prev: previewDerived.dodgeChance,
      suffix: '%',
      color: 'text-slate-200',
    },
    {
      key: 'crit',
      label: t('derived.crit'),
      cur: currentDerived.critChance,
      prev: previewDerived.critChance,
      suffix: '%',
      color: 'text-slate-200',
    },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (5 cols): Pilot Dossier & 4 Gear Classes */}
        <div className="xl:col-span-5 space-y-4">
          {/* Pilot Identity Card */}
          <section className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <label
                  htmlFor="pilot-callsign-input"
                  className="block text-xs text-slate-400"
                >
                  {t('hangar.callsign')}
                </label>
                <input
                  id="pilot-callsign-input"
                  type="text"
                  maxLength={18}
                  value={player.name}
                  onChange={(e) => setPilotName(e.target.value)}
                  placeholder={t('hangar.callsignPlaceholder')}
                  className="w-full h-10 px-3 rounded border border-slate-700 bg-[#080C14] text-sm font-semibold text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="shrink-0">
                <FighterSvg
                  classId={player.classId}
                  side="ally"
                  facing="right"
                  size="sm"
                  heroHover
                  className="w-20 h-20"
                />
              </div>
            </div>

            {/* Level, EXP, Record */}
            <div className="space-y-2 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono-nums font-semibold text-slate-200">
                  {t('common.level')} {player.level} ·{' '}
                  {getClassName(lang, player.classId)}
                </span>
                <span className="font-mono-nums text-slate-400">
                  EXP {player.exp} / {nextExp}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${expPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono-nums pt-1">
                <span>
                  {t('common.wins')}: {player.battlesWon} / {player.battlesFought}
                </span>
                <span>
                  {t('common.credits')}:{' '}
                  <strong className="text-amber-400">
                    {player.credits.toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>
          </section>

          {/* 4-Class Specialization Selector */}
          <section className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 space-y-3">
            <div>
              <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                {t('gear.classSwitchLabel')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('hangar.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MECH_CLASS_LIST.map((cls) => {
                const isSelected = cls.id === player.classId;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => handleClassSelect(cls.id)}
                    className={`p-3 rounded border text-left transition-colors cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-slate-800/90 border-amber-400/80'
                        : 'bg-[#080C14] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-bold text-slate-100 leading-tight">
                          {getClassName(lang, cls.id)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {getClassCode(lang, cls.id)}
                        </div>
                      </div>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cls.accentHex }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {getClassDesc(lang, cls.id)}
                    </p>

                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono-nums text-slate-300 pt-1 border-t border-slate-800/80">
                      {STAT_KEYS.map((k) => (
                        <span key={k}>
                          {getStatShort(lang, k)}+{cls.perPointGain[k]}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN (7 cols): Stat Allocation & Live Derived Preview */}
        <section className="xl:col-span-7 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <h2 className="font-display text-xl font-bold tracking-wide text-slate-100">
                {t('hangar.statTitle')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('hangar.statSubtitle', {
                  perLevel: PROGRESSION_CONFIG.statPointsPerLevel,
                })}{' '}
                · {getClassRole(lang, player.classId)}
              </p>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-400">
                {t('hangar.availablePts')}
              </div>
              <div
                className={`font-mono-nums text-2xl font-bold leading-none ${
                  remainingPoints > 0 ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {remainingPoints}
              </div>
            </div>
          </div>

          {/* 6 Base Stat Rows with 40px Steppers */}
          <div className="divide-y divide-slate-800/80">
            {STAT_KEYS.map((key) => {
              const gainPerPt = activeClass.perPointGain[key];
              const curVal = currentStats[key];
              const prevVal = previewStats[key];
              const delta = prevVal - curVal;
              const gearBonus = equipBonuses[key];
              const spentPts = player.allocatedPoints[key];
              const pendingPts = pending[key];

              return (
                <div
                  key={key}
                  className="py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono-nums text-xs font-bold text-slate-400 w-9">
                        {getStatShort(lang, key)}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">
                        {getStatLabel(lang, key)}
                      </span>
                      <span className="font-mono-nums text-xs text-sky-400">
                        {t('hangar.perPt', { gain: gainPerPt })}
                      </span>
                      {gearBonus > 0 && (
                        <span className="font-mono-nums text-xs text-amber-400">
                          {t('hangar.gearBonus', { bonus: gearBonus })}
                        </span>
                      )}
                      {spentPts > 0 && (
                        <span className="font-mono-nums text-xs text-slate-500">
                          {t('hangar.spentPt', { pts: spentPts })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {getStatDesc(lang, key)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 text-right font-mono-nums">
                      <span
                        className={`text-base font-bold ${
                          delta > 0 ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {prevVal}
                      </span>
                      {delta > 0 && (
                        <span className="ml-1 text-xs font-semibold text-emerald-400">
                          +{delta}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={pendingPts <= 0}
                        onClick={() => adjustPending(key, -1)}
                        aria-label={`-${getStatShort(lang, key)}`}
                        className="h-10 w-10 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-mono-nums text-xs font-semibold text-slate-300">
                        {pendingPts}
                      </span>
                      <button
                        type="button"
                        disabled={remainingPoints <= 0}
                        onClick={() => adjustPending(key, 1)}
                        aria-label={`+${getStatShort(lang, key)}`}
                        className="h-10 w-10 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-emerald-400 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Derived Combat Telemetry Preview */}
          <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                {t('hangar.derivedTitle')}
              </span>
              {pendingTotal > 0 && (
                <span className="text-emerald-400 font-medium">
                  {t('hangar.livePreview')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {derivedCards.map((m) => {
                const diff = m.prev - m.cur;
                return (
                  <div
                    key={m.key}
                    className="rounded border border-slate-800/90 bg-[#080C14] px-3 py-2"
                  >
                    <div className="text-[11px] text-slate-400">{m.label}</div>
                    <div className="mt-0.5 font-mono-nums text-base font-bold flex items-baseline gap-1.5">
                      <span className={diff > 0 ? 'text-emerald-400' : m.color}>
                        {m.prev}
                        {m.suffix ?? ''}
                      </span>
                      {diff > 0 && (
                        <span className="text-xs text-emerald-400">+{diff}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              disabled={spentTotal <= 0}
              onClick={handleRespec}
              title={t('hangar.respecTitle')}
              className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('hangar.respec')}</span>
            </button>

            <div className="flex items-center gap-2">
              {pendingTotal > 0 && (
                <button
                  type="button"
                  onClick={handleClearPending}
                  className="h-10 px-3.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                >
                  {t('common.clear')}
                </button>
              )}

              <button
                type="button"
                disabled={pendingTotal <= 0}
                onClick={handleConfirmAllocation}
                className="h-10 px-4 inline-flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {pendingTotal > 0
                    ? t('hangar.confirmAllocCount', { count: pendingTotal })
                    : t('hangar.confirmAlloc')}
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
