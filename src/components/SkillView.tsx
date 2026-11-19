import { useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Award,
  Check,
  KeyRound,
  Lock,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { BALANCE_CONFIG } from '../data/balance';
import { MECH_CLASSES } from '../data/classes';
import { getScaledSkillStats, getSkillById } from '../data/skills';
import {
  getRequiredGearLevelForSkillLevel,
  getSkillLearnOrUpgradeCost,
  getSkillsForClass,
  MAX_ACTIVE_SKILL_BAR,
  validateEquipSkillOnBar,
  validateLearnOrUpgradeSkill,
} from '../engine/skills';
import {
  getClassCode,
  getClassName,
  getSkillCategoryLabel,
  getSkillDesc,
  getSkillName,
  getSkillTargetLabel,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { SkillCategory, SkillDefinition } from '../types/game';
import { FighterSvg } from './FighterSvg';
import { SkillIcon } from './SkillIcon';

type SkillFilter = 'all' | 'class' | 'general' | 'special_elite';

function getCategoryStyle(category: SkillCategory): string {
  switch (category) {
    case 'elite':
      return 'border-amber-400/70 bg-amber-500/15 text-amber-300';
    case 'special':
      return 'border-purple-400/70 bg-purple-500/15 text-purple-300';
    case 'passive':
      return 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300';
    default:
      return 'border-slate-700 bg-slate-800/80 text-slate-300';
  }
}

export function SkillView() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const learnOrUpgradeSkill = useGameStore((s) => s.learnOrUpgradeSkill);
  const equipSkillToBar = useGameStore((s) => s.equipSkillToBar);
  const unequipSkillFromBar = useGameStore((s) => s.unequipSkillFromBar);
  const openWarPointShop = useGameStore((s) => s.openWarPointShop);
  const setTacticsModalOpen = useGameStore((s) => s.setTacticsModalOpen);

  const [filter, setFilter] = useState<SkillFilter>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeGear = pilot.gears[pilot.activeGearId];
  const activeClass = MECH_CLASSES[activeGear.classId];
  const activeGearName = getClassName(lang, activeGear.classId);

  // Strictly ONLY this Gear's class skills + General skills (engine helper)
  const classAndGeneralSkills = useMemo(
    () => getSkillsForClass(activeGear.classId),
    [activeGear.classId]
  );

  const passiveSkills = useMemo(
    () => classAndGeneralSkills.filter((s) => s.category === 'passive'),
    [classAndGeneralSkills]
  );

  const activeCatalogSkills = useMemo(
    () => classAndGeneralSkills.filter((s) => s.category !== 'passive'),
    [classAndGeneralSkills]
  );

  const filteredActiveSkills = useMemo(() => {
    return activeCatalogSkills.filter((s) => {
      if (filter === 'class') return s.classScope === activeGear.classId;
      if (filter === 'general') return s.classScope === 'general';
      if (filter === 'special_elite') {
        return s.category === 'special' || s.category === 'elite';
      }
      return true;
    });
  }, [activeCatalogSkills, filter, activeGear.classId]);

  const classOnlyCount = useMemo(
    () =>
      activeCatalogSkills.filter((s) => s.classScope === activeGear.classId)
        .length,
    [activeCatalogSkills, activeGear.classId]
  );
  const generalCount = useMemo(
    () => activeCatalogSkills.filter((s) => s.classScope === 'general').length,
    [activeCatalogSkills]
  );
  const specialEliteCount = useMemo(
    () =>
      activeCatalogSkills.filter(
        (s) => s.category === 'special' || s.category === 'elite'
      ).length,
    [activeCatalogSkills]
  );

  const handleLearnOrUpgrade = (skill: SkillDefinition) => {
    const prevLv = activeGear.skillLevels[skill.id] ?? 0;
    const res = learnOrUpgradeSkill(skill.id);
    if (res.validation.ok) {
      setFeedback(
        t(
          prevLv === 0 ? 'skill.learnedFeedback' : 'skill.upgradedFeedback',
          {
            skill: getSkillName(lang, skill.id),
            level: res.newLevel,
            gear: activeGearName,
          }
        )
      );
    }
  };

  const handleEquip = (skill: SkillDefinition) => {
    const res = equipSkillToBar(skill.id);
    if (res.ok) {
      setFeedback(
        t('skill.equippedFeedback', {
          skill: getSkillName(lang, skill.id),
          gear: activeGearName,
        })
      );
    }
  };

  const handleUnequip = (skillId: string) => {
    unequipSkillFromBar(skillId);
    setFeedback(
      t('skill.unequippedFeedback', {
        skill: getSkillName(lang, skillId),
        gear: activeGearName,
      })
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
      {/* Header + Active Gear Identity + Balances */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="hidden sm:flex w-16 h-16 shrink-0 rounded-lg border border-slate-800 bg-[#070B12] items-center justify-center">
            <FighterSvg
              classId={activeGear.classId}
              side="ally"
              facing="right"
              size="sm"
              className="w-14 h-14"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeClass.accentHex }}
              />
              <span className="font-semibold text-amber-400">
                {activeGearName} {t('common.levelShort')}
                {activeGear.level}
              </span>
              <span>·</span>
              <span>{getClassCode(lang, activeGear.classId)}</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100 mt-0.5">
              {t('skill.pageTitle', { gear: activeGearName })}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('skill.pageSubtitle', { gear: activeGearName })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right font-mono-nums">
            <div className="text-[11px] text-slate-400">
              {t('shop.availableCredits')}
            </div>
            <div className="text-base font-bold text-amber-400">
              {pilot.credits.toLocaleString()} CR
            </div>
          </div>

          <div className="text-right font-mono-nums pl-4 border-l border-slate-800">
            <div className="text-[11px] text-slate-400">
              {t('shop.availableWp')}
            </div>
            <div className="text-base font-bold text-purple-300 flex items-center justify-end gap-1">
              <Award className="w-4 h-4 text-purple-400" />
              <span>{(pilot.warPoints ?? 0).toLocaleString()} WP</span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-200">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. ACTIVE SKILL BAR (6 SLOTS) */}
      <section className="rounded-lg border border-amber-500/40 bg-[#0C121D]/95 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('skill.barTitle', {
                used: activeGear.equippedSkillBar.length,
                max: MAX_ACTIVE_SKILL_BAR,
              })}
            </h2>
            <p className="text-xs text-slate-400">{t('skill.barHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTacticsModalOpen(true)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                {t('auto.tacticsBtn')} ({activeGear.tactics.rules.length})
              </span>
            </button>
            <button
              type="button"
              onClick={openWarPointShop}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-purple-500/50 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t('skill.getCardInWpShop')}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {Array.from({ length: MAX_ACTIVE_SKILL_BAR }).map((_, idx) => {
            const skillId = activeGear.equippedSkillBar[idx];
            const skill = skillId ? getSkillById(skillId) : undefined;
            const lv = skill ? activeGear.skillLevels[skill.id] ?? 1 : 0;

            if (!skill) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[88px] rounded-md border border-dashed border-slate-800 bg-[#080C14]/70 p-3 flex flex-col items-center justify-center text-slate-600 text-xs"
                >
                  <span className="font-mono-nums text-[10px] mb-1">
                    #{idx + 1}
                  </span>
                  <span>{t('skill.emptySlot')}</span>
                </div>
              );
            }

            return (
              <div
                key={skill.id}
                className={`min-h-[88px] rounded-md border p-2.5 flex flex-col justify-between gap-2 bg-[#080C14] relative group ${
                  skill.category === 'elite'
                    ? 'border-amber-400/70'
                    : skill.category === 'special'
                    ? 'border-purple-400/70'
                    : 'border-sky-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-7 h-7 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-amber-300 shrink-0">
                      <SkillIcon icon={skill.icon} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100 leading-tight truncate">
                        {getSkillName(lang, skill.id)}
                      </div>
                      <div className="text-[10px] font-mono-nums text-sky-300">
                        Lv.{lv} · {skill.spCost} SP
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnequip(skill.id)}
                    title={t('skill.unequipBtn')}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-red-500/80 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-nums">
                  <span>
                    {skill.oncePerBattle
                      ? t('skill.oncePerBattle')
                      : skill.isToggle
                      ? t('skill.toggleTag')
                      : skill.cooldown > 0
                      ? t('skill.cooldown', { turns: skill.cooldown })
                      : t('skill.noCooldown')}
                  </span>
                  <span className="text-slate-500">#{idx + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. PASSIVE MODULES (ALWAYS ON ONCE LEARNED) */}
      {passiveSkills.length > 0 && (
        <section className="rounded-lg border border-emerald-500/35 bg-[#0C121D]/95 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('skill.passivesTitle')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {passiveSkills.map((skill) => {
              const currentLv = activeGear.skillLevels[skill.id] ?? 0;
              const isLearned = currentLv >= 1;
              const isMax = currentLv >= BALANCE_CONFIG.skillMaxLevel;
              const nextLv = Math.min(BALANCE_CONFIG.skillMaxLevel, currentLv + 1);
              const reqGearLv = getRequiredGearLevelForSkillLevel(skill, nextLv);
              const cost = getSkillLearnOrUpgradeCost(skill, nextLv);
              const validation = validateLearnOrUpgradeSkill(
                pilot,
                activeGear.classId,
                skill.id
              );

              return (
                <div
                  key={skill.id}
                  className={`rounded-md border p-3.5 flex flex-col justify-between gap-3 ${
                    isLearned
                      ? 'border-emerald-500/50 bg-[#08120F]'
                      : 'border-slate-800 bg-[#080C14]/80 opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center justify-center shrink-0">
                        <SkillIcon icon={skill.icon} className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg font-bold text-slate-100 leading-tight">
                            {getSkillName(lang, skill.id)}
                          </h3>
                          {isLearned && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              {t('skill.passiveAlwaysOn')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {getSkillDesc(lang, skill.id)}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono-nums text-xs font-bold text-emerald-300 shrink-0">
                      {isLearned
                        ? t('skill.levelLabel', {
                            level: currentLv,
                            max: BALANCE_CONFIG.skillMaxLevel,
                          })
                        : t('skill.notLearned')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-mono-nums">
                      {isMax
                        ? t('skill.maxLevel')
                        : t('skill.reqGearLv', { level: reqGearLv })}
                    </span>

                    {!isMax && (
                      <button
                        type="button"
                        disabled={!validation.ok}
                        onClick={() => handleLearnOrUpgrade(skill)}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>
                          {isLearned
                            ? t('skill.upgradeBtn', {
                                next: nextLv,
                                cost: cost.toLocaleString(),
                              })
                            : t('skill.learnBtn', {
                                cost: cost.toLocaleString(),
                              })}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. ACTIVE SKILL CATALOG (ONLY THIS GEAR'S CLASS + GENERAL) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
            {t('skill.catalogTitle', { gear: activeGearName })}
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: 'all',
                  label: t('skill.filterAll', {
                    count: activeCatalogSkills.length,
                  }),
                },
                {
                  id: 'class',
                  label: t('skill.filterClass', {
                    className: activeGearName,
                    count: classOnlyCount,
                  }),
                },
                {
                  id: 'general',
                  label: t('skill.filterGeneral', { count: generalCount }),
                },
                {
                  id: 'special_elite',
                  label: t('skill.filterSpecialElite', {
                    count: specialEliteCount,
                  }),
                },
              ] as Array<{ id: SkillFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`h-8 px-3 rounded border text-xs font-medium transition-colors cursor-pointer ${
                  filter === opt.id
                    ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredActiveSkills.map((skill) => {
            const currentLv = activeGear.skillLevels[skill.id] ?? 0;
            const isLearned = currentLv >= 1;
            const isMax = currentLv >= BALANCE_CONFIG.skillMaxLevel;
            const nextLv = Math.min(BALANCE_CONFIG.skillMaxLevel, currentLv + 1);
            const reqGearLv = getRequiredGearLevelForSkillLevel(skill, nextLv);
            const cost = getSkillLearnOrUpgradeCost(skill, nextLv);
            const learnVal = validateLearnOrUpgradeSkill(
              pilot,
              activeGear.classId,
              skill.id
            );
            const isEquipped = activeGear.equippedSkillBar.includes(skill.id);
            const equipVal = validateEquipSkillOnBar(activeGear, skill.id);
            const needsCard =
              !isLearned &&
              Boolean(skill.openingCardId) &&
              !pilot.ownedOpeningCards.includes(skill.openingCardId!);
            const hasCard =
              Boolean(skill.openingCardId) &&
              pilot.ownedOpeningCards.includes(skill.openingCardId!);
            const isLevelLocked = activeGear.level < reqGearLv;
            const isGreyedOut = !isLearned && (needsCard || isLevelLocked);
            const scaled = getScaledSkillStats(skill, Math.max(1, currentLv));

            return (
              <div
                key={skill.id}
                className={`rounded-lg border p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isEquipped
                    ? 'border-amber-400/70 bg-[#0D1524]'
                    : isGreyedOut
                    ? 'border-slate-800/70 bg-[#080B12]/70 opacity-75'
                    : 'border-slate-800 bg-[#0C121D]/95'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 ${
                          isGreyedOut
                            ? 'border-slate-800 bg-slate-900 text-slate-500'
                            : skill.category === 'elite'
                            ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                            : skill.category === 'special'
                            ? 'border-purple-400/60 bg-purple-500/15 text-purple-300'
                            : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                        }`}
                      >
                        {isGreyedOut ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <SkillIcon icon={skill.icon} className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getCategoryStyle(
                              skill.category
                            )}`}
                          >
                            {getSkillCategoryLabel(lang, skill.category)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {skill.classScope === 'general'
                              ? t('skill.scope.general')
                              : activeGearName}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-slate-100 leading-tight mt-0.5">
                          {getSkillName(lang, skill.id)}
                        </h3>
                      </div>
                    </div>

                    <div className="text-right font-mono-nums shrink-0">
                      <div className="text-xs font-bold text-amber-400">
                        {skill.spCost} SP
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          isLearned ? 'text-sky-300' : 'text-slate-500'
                        }`}
                      >
                        {isLearned
                          ? t('skill.levelLabel', {
                              level: currentLv,
                              max: BALANCE_CONFIG.skillMaxLevel,
                            })
                          : t('skill.notLearned')}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {getSkillDesc(lang, skill.id)}
                  </p>

                  {/* Tactical Metadata Row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-nums text-slate-400">
                    <span>{getSkillTargetLabel(lang, skill.targetType)}</span>
                    <span>·</span>
                    <span>
                      {skill.oncePerBattle
                        ? t('skill.oncePerBattle')
                        : skill.isToggle
                        ? t('skill.toggleTag')
                        : skill.cooldown > 0
                        ? t('skill.cooldown', { turns: skill.cooldown })
                        : t('skill.noCooldown')}
                    </span>
                    {isLearned && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400">
                          {t('skill.scaleInfo', {
                            pct: Math.round(scaled.effectMult * 100),
                          })}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Lock Reasons */}
                  {!isMax && (needsCard || isLevelLocked || hasCard) && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {isLevelLocked && (
                        <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 font-mono-nums">
                          {t('common.reqLevel', { level: reqGearLv })}
                        </span>
                      )}
                      {needsCard && (
                        <span className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/40 text-purple-200 inline-flex items-center gap-1">
                          <KeyRound className="w-3 h-3" />
                          <span>{t('skill.needOpeningCard')}</span>
                        </span>
                      )}
                      {!isLearned && hasCard && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>{t('skill.cardOwned')}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  {/* Left: Learn / Upgrade or Get Card */}
                  {needsCard ? (
                    <button
                      type="button"
                      onClick={openWarPointShop}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded border border-purple-500/50 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{t('skill.getCardInWpShop')}</span>
                    </button>
                  ) : isMax ? (
                    <span className="h-8 px-2.5 inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold text-xs">
                      {t('skill.maxLevel')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!learnVal.ok}
                      onClick={() => handleLearnOrUpgrade(skill)}
                      className="h-8 px-3 inline-flex items-center gap-1.5 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>
                        {isLearned
                          ? t('skill.upgradeBtn', {
                              next: nextLv,
                              cost: cost.toLocaleString(),
                            })
                          : t('skill.learnBtn', {
                              cost: cost.toLocaleString(),
                            })}
                      </span>
                    </button>
                  )}

                  {/* Right: Equip / Unequip to 6-slot Skill Bar */}
                  {isLearned &&
                    (isEquipped ? (
                      <button
                        type="button"
                        onClick={() => handleUnequip(skill.id)}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded border border-amber-400/60 bg-amber-500/15 hover:bg-red-500/20 hover:border-red-400/60 text-amber-200 hover:text-red-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('skill.equippedBtn')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!equipVal.ok}
                        onClick={() => handleEquip(skill)}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {equipVal.reason === 'bar_full'
                            ? t('skill.barFull')
                            : t('skill.equipBtn')}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
