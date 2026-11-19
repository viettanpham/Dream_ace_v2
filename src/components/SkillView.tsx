import { ArrowUpCircle, Lock, Sparkles } from 'lucide-react';
import { BALANCE_CONFIG, getSkillUpgradeCost } from '../data/balance';
import { MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getScaledSkillStats, getSkillById } from '../data/skills';
import {
  getClassCode,
  getClassName,
  getClassRole,
  getSkillDesc,
  getSkillName,
  getSkillTargetLabel,
  getStatusLabel,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import { FighterSvg } from './FighterSvg';

export function SkillView() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const selectActiveGear = useGameStore((s) => s.selectActiveGear);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const upgradeActiveGearSkill = useGameStore((s) => s.upgradeActiveGearSkill);

  const activeGear = pilot.gears[pilot.activeGearId];
  const activeClass = MECH_CLASSES[activeGear.classId];
  const activeSkill = getSkillById(activeClass.signatureSkillId);
  const currentSkillLv = activeGear.skillLevels[activeSkill.id] ?? 1;
  const scaled = getScaledSkillStats(activeSkill, currentSkillLv);
  const nextScaled =
    currentSkillLv < BALANCE_CONFIG.skillMaxLevel
      ? getScaledSkillStats(activeSkill, currentSkillLv + 1)
      : null;
  const upgradeCost = getSkillUpgradeCost(currentSkillLv);
  const canAffordUpgrade =
    upgradeCost !== null && pilot.credits >= upgradeCost;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
            {t('skill.pageTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('skill.pageSubtitle')}
          </p>
        </div>
        <div className="text-right font-mono-nums">
          <div className="text-[11px] text-slate-400">
            {t('shop.availableCredits')}
          </div>
          <div className="text-lg font-bold text-amber-400">
            {pilot.credits.toLocaleString()} CR
          </div>
        </div>
      </div>

      {/* Active Gear Signature Skill Spotlight + Lv 1-5 Upgrade */}
      <section className="rounded-lg border border-amber-400/50 bg-[#0C121D]/95 p-5 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: activeClass.accentHex }}
        />

        <div className="relative z-10 shrink-0 flex flex-col items-center">
          <FighterSvg
            classId={activeGear.classId}
            side="ally"
            facing="right"
            size="md"
            heroHover
            className="w-36 h-36"
          />
          <div className="text-xs text-slate-400 mt-1">
            {getClassName(lang, activeGear.classId)} {t('common.levelShort')}
            {activeGear.level} · {getClassCode(lang, activeGear.classId)}
          </div>
        </div>

        <div className="relative z-10 flex-1 space-y-3 w-full">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('skill.activeBadge')}</span>
                <span className="text-slate-600">·</span>
                <span className="font-mono-nums text-sky-300">
                  {t('skill.levelLabel', {
                    level: currentSkillLv,
                    max: BALANCE_CONFIG.skillMaxLevel,
                  })}
                </span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-50 mt-0.5">
                {getSkillName(lang, activeSkill.id)}
              </h2>
            </div>

            {upgradeCost !== null ? (
              <button
                type="button"
                disabled={!canAffordUpgrade}
                onClick={() => upgradeActiveGearSkill()}
                className="h-10 px-4 inline-flex items-center gap-1.5 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  {t('skill.upgradeBtn', {
                    next: currentSkillLv + 1,
                    cost: upgradeCost.toLocaleString(),
                  })}
                </span>
              </button>
            ) : (
              <span className="h-9 px-3 inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-semibold">
                {t('skill.maxLevel')}
              </span>
            )}
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            {getSkillDesc(lang, activeSkill.id)}
          </p>

          {/* Scaled Tactical Metrics (with Next-Level Preview) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
              <div className="text-[11px] text-slate-400">{t('skill.spCost')}</div>
              <div className="font-mono-nums text-sm font-bold text-amber-400">
                {scaled.spCost} SP
                {nextScaled && nextScaled.spCost !== scaled.spCost && (
                  <span className="text-[11px] text-slate-400 ml-1">
                    → {nextScaled.spCost}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
              <div className="text-[11px] text-slate-400">
                {t('skill.targeting')}
              </div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {getSkillTargetLabel(
                  lang,
                  activeSkill.targetType,
                  activeSkill.hits
                )}
              </div>
            </div>

            {scaled.powerMultiplier > 0 ? (
              <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                <div className="text-[11px] text-slate-400">{t('skill.power')}</div>
                <div className="font-mono-nums text-sm font-bold text-slate-100">
                  {Math.round(scaled.powerMultiplier * 100)}%
                  {activeSkill.hits > 1 ? ` ×${activeSkill.hits}` : ''}
                  {nextScaled && (
                    <span className="text-[11px] text-emerald-400 ml-1">
                      → {Math.round(nextScaled.powerMultiplier * 100)}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                <div className="text-[11px] text-slate-400">
                  {t('skill.restore')}
                </div>
                <div className="font-mono-nums text-sm font-bold text-emerald-400">
                  {Math.round(scaled.shieldRestoreRatio * 100)}% SHD
                  {nextScaled && (
                    <span className="text-[11px] text-sky-300 ml-1">
                      → {Math.round(nextScaled.shieldRestoreRatio * 100)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
              <div className="text-[11px] text-slate-400">
                {t('skill.statusEffect')}
              </div>
              <div className="text-xs font-semibold text-sky-300 mt-0.5">
                {activeSkill.appliesStatus
                  ? `${getStatusLabel(lang, activeSkill.appliesStatus)} (${Math.round(
                      scaled.statusChance * 100
                    )}%)`
                  : activeSkill.cleansesStatus
                  ? t('skill.cleanseLabel')
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* All 4 Gear Class Skills Reference Grid */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold tracking-wide text-slate-100 px-0.5">
          {t('skill.allClassesTitle')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {MECH_CLASS_LIST.map((cls) => {
            const g = pilot.gears[cls.id];
            const sk = getSkillById(cls.signatureSkillId);
            const skLv = g.skillLevels[sk.id] ?? 1;
            const sc = getScaledSkillStats(sk, skLv);
            const isActive = cls.id === activeGear.classId;

            return (
              <div
                key={cls.id}
                className={`rounded-lg border p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isActive
                    ? 'border-amber-400/70 bg-slate-900/90'
                    : 'border-slate-800/90 bg-[#0C121D]/95'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cls.accentHex }}
                        />
                        <span>
                          {getClassName(lang, cls.id)} ·{' '}
                          {getClassRole(lang, cls.id)}
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold text-slate-100 mt-0.5">
                        {getSkillName(lang, sk.id)}
                      </h3>
                    </div>

                    <div className="text-right font-mono-nums shrink-0">
                      <div className="text-xs font-bold text-amber-400">
                        {sc.spCost} SP
                      </div>
                      <div className="text-[11px] text-sky-300">
                        Lv.{skLv}/{BALANCE_CONFIG.skillMaxLevel}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {getSkillDesc(lang, sk.id)}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">
                    {getSkillTargetLabel(lang, sk.targetType, sk.hits)}
                    {sk.appliesStatus
                      ? ` · ${getStatusLabel(lang, sk.appliesStatus)}`
                      : sk.cleansesStatus
                      ? ` · ${t('skill.cleanseLabel')}`
                      : ''}
                  </span>

                  {isActive ? (
                    <span className="font-semibold text-amber-400">
                      {t('common.active')}
                    </span>
                  ) : g.owned ? (
                    <button
                      type="button"
                      onClick={() => selectActiveGear(cls.id)}
                      className="h-8 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors cursor-pointer"
                    >
                      {t('garage.selectGear')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('garage')}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs cursor-pointer"
                    >
                      <Lock className="w-3 h-3" />
                      <span>{t('skill.lockedGear')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
