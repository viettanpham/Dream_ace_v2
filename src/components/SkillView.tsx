import { Sparkles } from 'lucide-react';
import { MECH_CLASSES, MECH_CLASS_LIST } from '../data/classes';
import { getSkillById } from '../data/skills';
import {
  getClassCode,
  getClassName,
  getClassRole,
  getSkillDesc,
  getSkillName,
  getSkillTargetLabel,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import { FighterSvg } from './FighterSvg';

export function SkillView() {
  const { lang, t } = useI18n();
  const player = useGameStore((s) => s.player);
  const switchClass = useGameStore((s) => s.switchClass);

  const activeClass = MECH_CLASSES[player.classId];
  const activeSkill = getSkillById(activeClass.signatureSkillId);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
      {/* Page Header */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4">
        <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
          {t('skill.pageTitle')}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {t('skill.pageSubtitle')}
        </p>
      </div>

      {/* Active Gear Signature Skill Spotlight */}
      <section className="rounded-lg border border-amber-400/50 bg-[#0C121D]/95 p-5 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: activeClass.accentHex }}
        />

        <div className="relative z-10 shrink-0 flex flex-col items-center">
          <FighterSvg
            classId={player.classId}
            side="ally"
            facing="right"
            size="md"
            heroHover
            className="w-36 h-36"
          />
          <div className="text-xs text-slate-400 mt-1">
            {getClassName(lang, player.classId)} · {getClassCode(lang, player.classId)}
          </div>
        </div>

        <div className="relative z-10 flex-1 space-y-3 w-full">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('skill.activeBadge')}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-50 mt-0.5">
                {getSkillName(lang, activeSkill.id)}
              </h2>
            </div>

            <div className="font-mono-nums text-sm font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5">
              {activeSkill.spCost} SP
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            {getSkillDesc(lang, activeSkill.id)}
          </p>

          {/* Tactical Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
              <div className="text-[11px] text-slate-400">{t('skill.spCost')}</div>
              <div className="font-mono-nums text-sm font-bold text-amber-400">
                {activeSkill.spCost} SP
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
              <div className="text-[11px] text-slate-400">{t('skill.targeting')}</div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {getSkillTargetLabel(lang, activeSkill.targetType, activeSkill.hits)}
              </div>
            </div>

            {activeSkill.powerMultiplier > 0 ? (
              <>
                <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                  <div className="text-[11px] text-slate-400">{t('skill.power')}</div>
                  <div className="font-mono-nums text-sm font-bold text-slate-100">
                    {Math.round(activeSkill.powerMultiplier * 100)}%
                    {activeSkill.hits > 1 ? ` × ${activeSkill.hits}` : ''}
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                  <div className="text-[11px] text-slate-400">
                    {activeSkill.bonusCrit >= 20
                      ? t('skill.bonusCrit')
                      : t('skill.pierce')}
                  </div>
                  <div className="font-mono-nums text-sm font-bold text-sky-400">
                    {activeSkill.bonusCrit >= 20
                      ? `+${activeSkill.bonusCrit}%`
                      : `${Math.round(activeSkill.defensePierce * 100)}%`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                  <div className="text-[11px] text-slate-400">{t('skill.restore')}</div>
                  <div className="font-mono-nums text-sm font-bold text-sky-400">
                    +{Math.round(activeSkill.shieldRestoreRatio * 100)}% SHD
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-[#080C14] px-3 py-2">
                  <div className="text-[11px] text-slate-400">{t('derived.maxHp')}</div>
                  <div className="font-mono-nums text-sm font-bold text-emerald-400">
                    +{Math.round(activeSkill.hpRestoreRatio * 100)}% HP
                  </div>
                </div>
              </>
            )}
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
            const sk = getSkillById(cls.signatureSkillId);
            const isActive = cls.id === player.classId;
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
                          {getClassName(lang, cls.id)} · {getClassRole(lang, cls.id)}
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold text-slate-100 mt-0.5">
                        {getSkillName(lang, sk.id)}
                      </h3>
                    </div>

                    <span className="font-mono-nums text-xs font-bold text-amber-400 shrink-0">
                      {sk.spCost} SP
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {getSkillDesc(lang, sk.id)}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">
                    {getSkillTargetLabel(lang, sk.targetType, sk.hits)}
                    {sk.powerMultiplier > 0
                      ? ` · ${Math.round(sk.powerMultiplier * 100)}%${
                          sk.hits > 1 ? ` × ${sk.hits}` : ''
                        }`
                      : ` · +${Math.round(sk.shieldRestoreRatio * 100)}% SHD / +${Math.round(
                          sk.hpRestoreRatio * 100
                        )}% HP`}
                  </span>

                  {isActive ? (
                    <span className="font-semibold text-amber-400">
                      {t('gear.currentlyEquipped')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchClass(cls.id)}
                      className="h-8 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors cursor-pointer"
                    >
                      {getClassName(lang, cls.id)}
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
