import { ArrowRight, Check, Sparkles, Wand2, X } from 'lucide-react';
import { STAT_KEYS } from '../data/classes';
import { RARITY_META } from '../data/items';
import {
  getClassName,
  getItemInstanceName,
  getSlotLabel,
  getStatShort,
  useI18n,
} from '../i18n';
import type {
  AutoEquipPlan,
  AutoEquipSlotPlan,
  ItemInstance,
} from '../types/game';
import { ClassIcon, SlotIcon } from './GameIcons';

interface AutoEquipModalProps {
  open: boolean;
  plan: AutoEquipPlan | null;
  replaceMarginPct: number;
  onApply: () => void;
  onClose: () => void;
}

function formatScore(val: number): string {
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

function renderItemTitle(
  lang: 'en' | 'vi',
  item: ItemInstance | null,
  emptyLabel: string
) {
  if (!item) {
    return <span className="text-slate-500 italic">{emptyLabel}</span>;
  }
  const name = getItemInstanceName(lang, item, true);
  return (
    <span className={`font-semibold ${RARITY_META[item.rarity].textClass}`}>
      {name}
      {item.enchantLevel > 0 ? ` +${item.enchantLevel}` : ''}
    </span>
  );
}

export function AutoEquipModal({
  open,
  plan,
  replaceMarginPct,
  onApply,
  onClose,
}: AutoEquipModalProps) {
  const { lang, t } = useI18n();

  if (!open || !plan) return null;

  const marginPctDisplay = Math.round(replaceMarginPct * 100);
  const title =
    plan.mode === 'all'
      ? t('ae.modalTitleAll')
      : t('ae.modalTitleSingle', {
          gear: getClassName(lang, plan.targetGearId),
        });

  const buildSlotDeltaBadges = (sp: AutoEquipSlotPlan) => {
    const badges: Array<{ key: string; label: string; positive: boolean }> = [];
    for (const k of STAT_KEYS) {
      const d = sp.statDeltas[k];
      if (d !== 0) {
        badges.push({
          key: k,
          label: `${getStatShort(lang, k)} ${d > 0 ? `+${d}` : d}`,
          positive: d > 0,
        });
      }
    }
    const td = sp.traitDeltas;
    if (td.critBonusPct !== 0) {
      badges.push({
        key: 'crit',
        label: `${t('ae.traitCrit')} ${td.critBonusPct > 0 ? `+${td.critBonusPct}%` : `${td.critBonusPct}%`}`,
        positive: td.critBonusPct > 0,
      });
    }
    if (td.armorPiercePct !== 0) {
      badges.push({
        key: 'pierce',
        label: `${t('ae.traitPierce')} ${td.armorPiercePct > 0 ? `+${td.armorPiercePct}%` : `${td.armorPiercePct}%`}`,
        positive: td.armorPiercePct > 0,
      });
    }
    if (td.splashPct !== 0) {
      badges.push({
        key: 'splash',
        label: `${t('ae.traitSplash')} ${td.splashPct > 0 ? `+${td.splashPct}%` : `${td.splashPct}%`}`,
        positive: td.splashPct > 0,
      });
    }
    if (td.spRegenPerTurn !== 0) {
      badges.push({
        key: 'sp',
        label: `${t('ae.traitSpRegen')} ${td.spRegenPerTurn > 0 ? `+${td.spRegenPerTurn}` : td.spRegenPerTurn}`,
        positive: td.spRegenPerTurn > 0,
      });
    }
    if (td.evasionMod !== 0) {
      badges.push({
        key: 'evaMod',
        label: `${t('ae.traitEvaMod')} ${td.evasionMod > 0 ? `+${td.evasionMod}` : td.evasionMod}`,
        positive: td.evasionMod > 0,
      });
    }
    if (td.longRangeDelta !== 0) {
      badges.push({
        key: 'longRange',
        label: `${td.longRangeDelta > 0 ? '+' : '-'}${t('ae.traitLongRange')}`,
        positive: td.longRangeDelta > 0,
      });
    }
    return badges;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="autoequip-modal"
    >
      <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-700 bg-[#0B111C] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-[#0E1522] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-wide text-sky-300 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">{title}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('ae.modalSubtitle', { pct: marginPctDisplay })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('error.closeBtn')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {plan.totalChangedSlots === 0 && (
            <div
              data-testid="autoequip-no-changes"
              className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2.5 text-xs text-slate-300 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{t('ae.noChanges')}</span>
            </div>
          )}

          {plan.gearPlans.map((gp) => {
            const gearScoreDelta =
              Math.round((gp.totalNextScore - gp.totalCurrentScore) * 10) / 10;
            const nonZeroGearStats = STAT_KEYS.filter(
              (k) => gp.totalStatDeltas[k] !== 0
            );

            return (
              <div
                key={gp.gearId}
                data-testid={`autoequip-gear-${gp.gearId}`}
                className="rounded-lg border border-slate-800 bg-[#080D16] overflow-hidden"
              >
                {/* Gear Section Header */}
                <div className="px-3 py-2.5 border-b border-slate-800/80 bg-[#0D1422] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ClassIcon classId={gp.gearId} className="w-4 h-4 shrink-0" />
                    <span className="font-display text-sm font-bold text-slate-100">
                      {getClassName(lang, gp.gearId)}
                    </span>
                    <span className="text-[11px] font-mono-nums text-slate-400">
                      · {t('ae.changesSummary', { count: gp.changedCount })}
                    </span>
                  </div>

                  {gp.changedCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-nums">
                      <span
                        className={`font-bold ${
                          gearScoreDelta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {t('ae.scoreLabel')}: {formatScore(gp.totalCurrentScore)} →{' '}
                        {formatScore(gp.totalNextScore)} (
                        {gearScoreDelta >= 0
                          ? `+${formatScore(gearScoreDelta)}`
                          : formatScore(gearScoreDelta)}
                        )
                      </span>
                    </div>
                  )}
                </div>

                {/* Overall Gear Stat Deltas */}
                {nonZeroGearStats.length > 0 && (
                  <div className="px-3 py-1.5 border-b border-slate-800/60 bg-slate-900/40 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-nums">
                    {nonZeroGearStats.map((k) => {
                      const d = gp.totalStatDeltas[k];
                      return (
                        <span
                          key={k}
                          className={
                            d > 0
                              ? 'text-emerald-400 font-semibold'
                              : 'text-rose-400 font-semibold'
                          }
                        >
                          {getStatShort(lang, k)} {d > 0 ? `+${d}` : d}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* 6 Fixed Slots */}
                <div className="divide-y divide-slate-800/70">
                  {gp.slots.map((sp) => {
                    const deltaBadges = sp.changed
                      ? buildSlotDeltaBadges(sp)
                      : [];
                    return (
                      <div
                        key={sp.slot}
                        data-testid={`autoequip-slot-${gp.gearId}-${sp.slot}`}
                        className={`px-3 py-2.5 text-xs ${
                          sp.changed
                            ? 'bg-emerald-950/15'
                            : 'bg-transparent opacity-75'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <SlotIcon
                              slot={sp.slot}
                              className="w-3.5 h-3.5 text-slate-400 shrink-0"
                            />
                            <span className="font-semibold text-slate-200">
                              {getSlotLabel(lang, sp.slot)}
                            </span>
                            {sp.changed && (
                              <span className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">
                                {t('ae.colComparison')}
                              </span>
                            )}
                          </div>

                          {sp.changed ? (
                            <span
                              data-testid={`autoequip-score-diff-${gp.gearId}-${sp.slot}`}
                              className={`font-mono-nums text-[11px] font-bold ${
                                sp.scoreDelta >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {formatScore(sp.currentScore)} →{' '}
                              {formatScore(sp.nextScore)} (
                              {sp.scoreDelta >= 0
                                ? `+${formatScore(sp.scoreDelta)}`
                                : formatScore(sp.scoreDelta)}
                              )
                            </span>
                          ) : (
                            <span
                              data-testid={`autoequip-keep-${gp.gearId}-${sp.slot}`}
                              className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-[11px] font-medium text-slate-400"
                            >
                              {t('ae.keep')}
                            </span>
                          )}
                        </div>

                        {sp.changed ? (
                          <div className="mt-1.5 space-y-1 pl-5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs leading-snug">
                              {renderItemTitle(
                                lang,
                                sp.currentItem,
                                t('ae.emptySlot')
                              )}
                              <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              {renderItemTitle(
                                lang,
                                sp.nextItem,
                                t('ae.emptySlot')
                              )}
                              {sp.reassignedFromGear && (
                                <span className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/15 text-[10px] font-semibold text-sky-300">
                                  {t('ae.reassignedFrom', {
                                    gear: getClassName(
                                      lang,
                                      sp.reassignedFromGear
                                    ),
                                  })}
                                </span>
                              )}
                            </div>

                            {deltaBadges.length > 0 && (
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono-nums text-[11px]">
                                {deltaBadges.map((b) => (
                                  <span
                                    key={b.key}
                                    className={
                                      b.positive
                                        ? 'text-emerald-400 font-semibold'
                                        : 'text-rose-400 font-semibold'
                                    }
                                  >
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-0.5 pl-5 text-[11px] text-slate-400 truncate">
                            {renderItemTitle(
                              lang,
                              sp.currentItem,
                              t('ae.emptySlot')
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-[#0E1522] flex items-center justify-between gap-2 shrink-0 pb-safe">
          <button
            type="button"
            data-testid="autoequip-cancel-btn"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            {t('ae.cancelBtn')}
          </button>

          <button
            type="button"
            data-testid="autoequip-apply-btn"
            disabled={plan.totalChangedSlots === 0}
            onClick={onApply}
            className="min-h-[42px] px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>{t('ae.applyBtn')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
