import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import {
  EMPTY_STAT_BLOCK,
  MECH_CLASSES,
  MECH_CLASS_LIST,
  STAT_KEYS,
} from '../data/classes';
import {
  ENCHANT_CONFIG,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_META,
  RARITY_META,
} from '../data/items';
import {
  getEffectiveItemStats,
  getEnchantMetadata,
  getGearEquippedInstances,
  getItemEquippedByGear,
  simulateGearEquipChange,
  sumGearEquipmentStats,
  sumGearSpecialTraits,
  validateEquipOnGear,
} from '../engine/equipment';
import { getGearPassiveBonuses } from '../engine/skills';
import {
  calculateDerivedStats,
  calculateEffectiveStats,
  calculateGearPowerRating,
} from '../engine/stats';
import {
  formatEquipValidationReason,
  formatItemTraitsList,
  getClassCode,
  getClassName,
  getClassRole,
  getItemInstanceDesc,
  getItemInstanceName,
  getRarityLabel,
  getSlotLabel,
  getSlotShort,
  getStatShort,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type {
  EnchantAttemptResult,
  EquipmentSlot,
  StatBlock,
} from '../types/game';
import { soundFx } from '../utils/sound';
import { BottomSheet } from './BottomSheet';
import { FighterSvg } from './FighterSvg';
import { SlotIcon } from './GameIcons';

type GearSelection =
  | { kind: 'slot'; slot: EquipmentSlot }
  | { kind: 'inventory'; instanceId: string }
  | null;

export function GearView() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const selectActiveGear = useGameStore((s) => s.selectActiveGear);
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const unequipInstanceEverywhere = useGameStore(
    (s) => s.unequipInstanceEverywhere
  );
  const enchantEquippedSlot = useGameStore((s) => s.enchantEquippedSlot);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [selection, setSelection] = useState<GearSelection>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileStatsExpanded, setMobileStatsExpanded] = useState(false);
  const [confirmingUnequipSlot, setConfirmingUnequipSlot] =
    useState<EquipmentSlot | null>(null);
  const [enchantFeedback, setEnchantFeedback] =
    useState<EnchantAttemptResult | null>(null);

  const activeGear = pilot.gears[pilot.activeGearId];
  const activeClass = MECH_CLASSES[activeGear.classId];
  const ownedGears = MECH_CLASS_LIST.filter((c) => pilot.gears[c.id].owned);

  const equippedMap = useMemo(
    () => getGearEquippedInstances(activeGear, pilot.inventory),
    [activeGear, pilot.inventory]
  );

  const selectedInventoryInstance =
    selection?.kind === 'inventory'
      ? pilot.inventory.find((i) => i.instanceId === selection.instanceId) ??
        null
      : null;

  const selectedSlotInstance =
    selection?.kind === 'slot' ? equippedMap[selection.slot] : null;

  const previewGear = useMemo(() => {
    if (selectedInventoryInstance) {
      const equippedOwner = getItemEquippedByGear(
        pilot.gears,
        selectedInventoryInstance.instanceId
      );
      if (equippedOwner !== activeGear.classId) {
        return simulateGearEquipChange(activeGear, {
          type: 'equip',
          instance: selectedInventoryInstance,
        });
      }
    }
    if (confirmingUnequipSlot && equippedMap[confirmingUnequipSlot]) {
      return simulateGearEquipChange(activeGear, {
        type: 'unequip',
        slot: confirmingUnequipSlot,
      });
    }
    return activeGear;
  }, [
    activeGear,
    pilot.gears,
    selectedInventoryInstance,
    confirmingUnequipSlot,
    equippedMap,
  ]);

  const currentEquipBonuses = useMemo(
    () => sumGearEquipmentStats(activeGear, pilot.inventory),
    [activeGear, pilot.inventory]
  );
  const currentEquipTraits = useMemo(
    () => sumGearSpecialTraits(activeGear, pilot.inventory),
    [activeGear, pilot.inventory]
  );

  const previewEquipBonuses = useMemo(
    () => sumGearEquipmentStats(previewGear, pilot.inventory),
    [previewGear, pilot.inventory]
  );
  const previewEquipTraits = useMemo(
    () => sumGearSpecialTraits(previewGear, pilot.inventory),
    [previewGear, pilot.inventory]
  );

  const passiveBonuses = useMemo(
    () => getGearPassiveBonuses(activeGear),
    [activeGear]
  );

  const currentStats = useMemo(
    () =>
      calculateEffectiveStats(
        activeGear.classId,
        activeGear.level,
        activeGear.allocatedPoints,
        EMPTY_STAT_BLOCK,
        currentEquipBonuses,
        currentEquipTraits,
        passiveBonuses
      ),
    [activeGear, currentEquipBonuses, currentEquipTraits, passiveBonuses]
  );

  const previewStats = useMemo(
    () =>
      calculateEffectiveStats(
        activeGear.classId,
        activeGear.level,
        activeGear.allocatedPoints,
        EMPTY_STAT_BLOCK,
        previewEquipBonuses,
        previewEquipTraits,
        passiveBonuses
      ),
    [activeGear, previewEquipBonuses, previewEquipTraits, passiveBonuses]
  );

  const currentDerived = useMemo(
    () =>
      calculateDerivedStats(
        activeGear.classId,
        activeGear.level,
        currentStats,
        currentEquipTraits,
        passiveBonuses
      ),
    [activeGear, currentStats, currentEquipTraits, passiveBonuses]
  );

  const previewDerived = useMemo(
    () =>
      calculateDerivedStats(
        activeGear.classId,
        activeGear.level,
        previewStats,
        previewEquipTraits,
        passiveBonuses
      ),
    [activeGear, previewStats, previewEquipTraits, passiveBonuses]
  );

  const powerRating = useMemo(
    () => calculateGearPowerRating(activeGear, pilot.inventory),
    [activeGear, pilot.inventory]
  );

  const statDeltas: StatBlock = useMemo(() => {
    const d = { ...EMPTY_STAT_BLOCK };
    for (const k of STAT_KEYS) {
      d[k] = previewStats[k] - currentStats[k];
    }
    return d;
  }, [previewStats, currentStats]);

  const isPreviewActive =
    (Boolean(selectedInventoryInstance) &&
      getItemEquippedByGear(
        pilot.gears,
        selectedInventoryInstance?.instanceId ?? ''
      ) !== activeGear.classId) ||
    Boolean(confirmingUnequipSlot);

  const filteredInventory = useMemo(() => {
    return pilot.inventory.filter((inst) => {
      if (slotFilter !== 'all' && inst.slot !== slotFilter) return false;
      return true;
    });
  }, [pilot.inventory, slotFilter]);

  const handleSelectSlot = (slot: EquipmentSlot) => {
    soundFx.playClick();
    setEnchantFeedback(null);
    setConfirmingUnequipSlot(null);
    if (equippedMap[slot]) {
      setSelection({ kind: 'slot', slot });
      setMobileDetailOpen(true);
    } else {
      setSelection(null);
      setMobileDetailOpen(false);
      setSlotFilter(slot);
    }
  };

  const handleSelectInventory = (instanceId: string) => {
    soundFx.playClick();
    setEnchantFeedback(null);
    setConfirmingUnequipSlot(null);
    setSelection((prev) => {
      const same = prev?.kind === 'inventory' && prev.instanceId === instanceId;
      if (same && window.innerWidth >= 1024) {
        return null;
      }
      return { kind: 'inventory', instanceId };
    });
    setMobileDetailOpen(true);
  };

  const handleConfirmEquip = () => {
    if (!selectedInventoryInstance) return;
    const res = equipItem(selectedInventoryInstance.instanceId);
    if (res.canEquip) {
      setSelection({ kind: 'slot', slot: selectedInventoryInstance.slot });
    }
  };

  const handleConfirmUnequip = (slot: EquipmentSlot) => {
    unequipSlot(slot);
    setConfirmingUnequipSlot(null);
    setSelection(null);
    setMobileDetailOpen(false);
    setEnchantFeedback(null);
  };

  const handleEnchant = (slot: EquipmentSlot) => {
    const res = enchantEquippedSlot(slot);
    if (res) setEnchantFeedback(res);
  };

  const renderEnchantMessage = (fb: EnchantAttemptResult): string => {
    const inst = pilot.inventory.find((i) => i.instanceId === fb.instanceId);
    const itemName = inst ? getItemInstanceName(lang, inst) : fb.templateId;
    if (fb.code === 'max_level') {
      return t('enchant.msg.max_level', { item: itemName });
    }
    if (fb.code === 'insufficient_credits') {
      return t('enchant.msg.insufficient_credits', {
        cost: fb.creditsSpent.toLocaleString(),
      });
    }
    if (fb.code === 'success') {
      return t('enchant.msg.success', {
        item: itemName,
        level: fb.newLevel,
        pct: Math.round(fb.newLevel * ENCHANT_CONFIG.bonusPerLevel * 100),
      });
    }
    return t('enchant.msg.failed', {
      item: itemName,
      rate: fb.successRate,
      level: fb.previousLevel,
      cost: fb.creditsSpent.toLocaleString(),
    });
  };

  const derivedMetrics = [
    {
      key: 'hp',
      label: 'HP',
      cur: currentDerived.maxHp,
      prev: previewDerived.maxHp,
      color: 'text-emerald-400',
    },
    {
      key: 'shd',
      label: 'SHD',
      cur: currentDerived.maxShield,
      prev: previewDerived.maxShield,
      color: 'text-sky-400',
    },
    {
      key: 'sp',
      label: 'SP',
      cur: currentDerived.maxSp,
      prev: previewDerived.maxSp,
      color: 'text-amber-400',
    },
    {
      key: 'spd',
      label: 'SPD',
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

  const activeDetailInstance = selectedInventoryInstance ?? selectedSlotInstance;
  const activeDetailStats = activeDetailInstance
    ? getEffectiveItemStats(activeDetailInstance)
    : null;
  const activeDetailOwnerGear = activeDetailInstance
    ? getItemEquippedByGear(pilot.gears, activeDetailInstance.instanceId)
    : null;
  const activeValidation =
    selectedInventoryInstance &&
    activeDetailOwnerGear !== activeGear.classId
      ? validateEquipOnGear(selectedInventoryInstance, activeGear, pilot.gears)
      : null;
  const activeEnchantMeta =
    selectedSlotInstance && selection?.kind === 'slot'
      ? getEnchantMetadata(selectedSlotInstance)
      : null;

  const renderDetailContent = () => {
    if (!activeDetailInstance || !activeDetailStats) return null;
    return (
      <div className="flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-3">
          {/* Item Header */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3
                className={`font-display text-xl font-bold leading-tight ${
                  RARITY_META[activeDetailInstance.rarity].textClass
                }`}
              >
                {getItemInstanceName(lang, activeDetailInstance, true)}
              </h3>
              <span
                className={`font-mono-nums text-xs font-semibold shrink-0 ${
                  activeDetailInstance.rollQuality >= 80
                    ? 'text-amber-400'
                    : activeDetailInstance.rollQuality >= 50
                    ? 'text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                {t('common.quality', {
                  pct: activeDetailInstance.rollQuality,
                })}
              </span>
            </div>
            <div className="text-xs sm:text-xs text-slate-400 mt-0.5">
              {getSlotLabel(lang, activeDetailInstance.slot)} ·{' '}
              {getRarityLabel(lang, activeDetailInstance.rarity)} ·{' '}
              {t('common.tier', { tier: activeDetailInstance.tier })} ·{' '}
              {t('common.levelShort')}
              {activeDetailInstance.requiredLevel}
              {' · '}
              {activeDetailInstance.classRestriction
                ? t('common.classOnly', {
                    className: getClassName(
                      lang,
                      activeDetailInstance.classRestriction
                    ),
                  })
                : t('common.allClasses')}
            </div>
          </div>

          <p className="text-sm lg:text-xs text-slate-300 leading-relaxed">
            {getItemInstanceDesc(lang, activeDetailInstance)}
          </p>

          {/* Total Effective Stats + Affixes + Traits */}
          <div className="rounded border border-slate-800/80 bg-[#080C14] p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:text-xs font-mono-nums text-slate-100 font-semibold">
              {STAT_KEYS.filter((k) => activeDetailStats[k] > 0).map((k) => (
                <span key={k}>
                  +{activeDetailStats[k]} {getStatShort(lang, k)}
                </span>
              ))}
            </div>

            {activeDetailInstance.affixes.length > 0 && (
              <div className="text-xs text-sky-300/90 flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1.5 border-t border-slate-800/80">
                <span className="text-slate-500">
                  {t('gear.affixesHeading')}:
                </span>
                {activeDetailInstance.affixes.map((af, idx) => (
                  <span
                    key={`${af.suffixId}_${idx}`}
                    className="font-mono-nums"
                  >
                    +{af.value} {getStatShort(lang, af.stat)}
                  </span>
                ))}
              </div>
            )}

            {formatItemTraitsList(lang, activeDetailInstance).length > 0 && (
              <div className="text-xs text-amber-300 flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1.5 border-t border-slate-800/80">
                {formatItemTraitsList(lang, activeDetailInstance).map(
                  (tr, idx) => (
                    <span key={idx}>{tr}</span>
                  )
                )}
              </div>
            )}
          </div>

          {/* Live +/- Comparison Block */}
          {isPreviewActive && (
            <div className="rounded border border-slate-800 bg-[#080C14] p-3 space-y-1.5">
              <div className="text-xs font-semibold text-amber-300">
                {t('gear.comparisonHeading')}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:text-xs font-mono-nums">
                {STAT_KEYS.filter((k) => statDeltas[k] !== 0).length > 0 ? (
                  STAT_KEYS.filter((k) => statDeltas[k] !== 0).map((k) => {
                    const delta = statDeltas[k];
                    return (
                      <span
                        key={k}
                        className={
                          delta > 0
                            ? 'text-emerald-400 font-semibold'
                            : 'text-red-400 font-semibold'
                        }
                      >
                        {getStatShort(lang, k)}{' '}
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-slate-500">{t('gear.noStatDiff')}</span>
                )}
              </div>
            </div>
          )}

          {/* Cannot-Equip Inline Warning */}
          {activeValidation && !activeValidation.canEquip && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {t('equip.cannotEquip', {
                    reason:
                      formatEquipValidationReason(lang, activeValidation) ?? '',
                  })}
                </span>
              </div>
              {activeValidation.equippedOnOtherGear && (
                <button
                  type="button"
                  onClick={() =>
                    unequipInstanceEverywhere(activeDetailInstance.instanceId)
                  }
                  className="shrink-0 min-h-[36px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold cursor-pointer"
                >
                  {t('gear.unequipFromOther', {
                    gear: getClassName(
                      lang,
                      activeValidation.equippedOnOtherGear
                    ),
                  })}
                </button>
              )}
            </div>
          )}

          {/* Inline Enchant Section (when inspecting an Equipped Slot) */}
          {selection?.kind === 'slot' && activeEnchantMeta && (
            <div className="rounded border border-sky-500/35 bg-[#091322] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-sky-300">
                  {activeEnchantMeta.isMax
                    ? t('equip.enchantMaxReached')
                    : `+${activeEnchantMeta.currentLevel} → +${activeEnchantMeta.nextLevel} (+8%/lv)`}
                </span>
                {!activeEnchantMeta.isMax && (
                  <span className="font-mono-nums text-slate-300">
                    <span
                      className={
                        activeEnchantMeta.successRate >= 70
                          ? 'text-emerald-400 font-semibold'
                          : activeEnchantMeta.successRate >= 45
                          ? 'text-amber-400 font-semibold'
                          : 'text-red-400 font-semibold'
                      }
                    >
                      {activeEnchantMeta.successRate}%
                    </span>
                    {' · '}
                    <span>{activeEnchantMeta.cost.toLocaleString()} CR</span>
                  </span>
                )}
              </div>

              {!activeEnchantMeta.isMax && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-nums text-slate-300">
                  {STAT_KEYS.filter(
                    (k) => activeEnchantMeta.currentStats[k] > 0
                  ).map((k) => (
                    <span key={k}>
                      {getStatShort(lang, k)} +{activeEnchantMeta.currentStats[k]}{' '}
                      <span className="text-emerald-400">
                        → +{activeEnchantMeta.nextStats[k]}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {enchantFeedback && (
                <div
                  className={`text-xs px-2.5 py-2 rounded border ${
                    enchantFeedback.success
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-300'
                  }`}
                >
                  {renderEnchantMessage(enchantFeedback)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons (>= 44px height) */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80">
          {selection?.kind === 'inventory' &&
            activeDetailOwnerGear !== activeGear.classId && (
              <>
                <button
                  type="button"
                  disabled={!activeValidation?.canEquip}
                  onClick={handleConfirmEquip}
                  className="flex-1 min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-sm lg:text-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {t('gear.confirmEquip', {
                      gear: getClassName(lang, activeGear.classId),
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setSelection(null);
                    setMobileDetailOpen(false);
                  }}
                  className="min-h-[44px] px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm lg:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {t('common.cancel')}
                </button>
              </>
            )}

          {selection?.kind === 'inventory' &&
            activeDetailOwnerGear === activeGear.classId && (
              <button
                type="button"
                onClick={() =>
                  setSelection({
                    kind: 'slot',
                    slot: activeDetailInstance.slot,
                  })
                }
                className="flex-1 min-h-[44px] px-4 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 font-semibold text-sm lg:text-xs transition-colors cursor-pointer"
              >
                {t('gear.currentlyEquipped')} · Enchant / Unequip
              </button>
            )}

          {selection?.kind === 'slot' && activeEnchantMeta && (
            <>
              {!activeEnchantMeta.isMax && (
                <button
                  type="button"
                  disabled={pilot.credits < activeEnchantMeta.cost}
                  onClick={() => handleEnchant(selection.slot)}
                  className="flex-1 min-h-[44px] px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm lg:text-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  {pilot.credits < activeEnchantMeta.cost
                    ? t('equip.needCredits', {
                        cost: activeEnchantMeta.cost.toLocaleString(),
                      })
                    : t('equip.enchantAction', {
                        level: activeEnchantMeta.nextLevel,
                        cost: activeEnchantMeta.cost.toLocaleString(),
                      })}
                </button>
              )}

              {confirmingUnequipSlot === selection.slot ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleConfirmUnequip(selection.slot)}
                    className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm lg:text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t('gear.confirmUnequip')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playClick();
                      setConfirmingUnequipSlot(null);
                    }}
                    className="min-h-[44px] px-3.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm lg:text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setConfirmingUnequipSlot(selection.slot);
                  }}
                  className="min-h-[44px] px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm lg:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {t('gear.previewUnequip')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3.5 sm:space-y-4">
      {/* ==================== TOP ROW: Mobile (Ship+KeyStats -> 3x2 Slots) / Desktop (Slots | Ship | Stats) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-stretch">
        {/* COL 2 on Desktop / FIRST on Mobile: Hovering Space Fighter + Key Stats + Collapsible Full Stats */}
        <section className="order-1 lg:order-2 lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 sm:p-4 flex flex-col justify-between items-center relative overflow-hidden gap-3">
          <svg
            viewBox="0 0 360 280"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
            aria-hidden="true"
          >
            <circle
              cx="180"
              cy="128"
              r="88"
              stroke="#334155"
              strokeWidth="1"
              strokeDasharray="5 5"
              fill="none"
            />
            <circle
              cx="180"
              cy="128"
              r="120"
              stroke="#1E293B"
              strokeWidth="1"
              fill="none"
            />
            <line x1="30" y1="128" x2="330" y2="128" stroke="#1E293B" strokeWidth="1" />
          </svg>

          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: activeClass.accentHex }}
          />

          {/* Active Gear Level & Power Rating */}
          <div className="relative z-10 w-full flex items-start justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-xl font-bold tracking-wide text-slate-50 leading-none">
                  {getClassName(lang, activeGear.classId)}
                </span>
                <span className="font-mono-nums text-xs font-bold text-amber-400">
                  {t('common.levelShort')}
                  {activeGear.level}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {getClassCode(lang, activeGear.classId)} ·{' '}
                {getClassRole(lang, activeGear.classId)}
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono-nums text-xs text-sky-300 font-semibold">
                {t('common.power')}: {powerRating}
              </div>
              {activeGear.unspentPoints > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('garage')}
                  className="text-xs font-mono-nums font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
                >
                  {t('gear.allocateHint', { count: activeGear.unspentPoints })}
                </button>
              )}
            </div>
          </div>

          {/* Mobile Compact Showcase: Ship Left + Key Stats Right */}
          <div className="relative z-10 w-full flex items-center justify-center lg:py-3 gap-3">
            <FighterSvg
              classId={activeGear.classId}
              side="ally"
              facing="right"
              size="lg"
              heroHover
              className="w-32 h-32 sm:w-40 sm:h-40 lg:w-52 lg:h-52 shrink-0"
            />

            {/* Key stats strip shown only on < lg */}
            <div className="lg:hidden flex-1 min-w-0 grid grid-cols-2 gap-1.5 font-mono-nums">
              <div className="rounded border border-slate-800 bg-[#080C14]/90 px-2 py-1.5">
                <div className="text-[11px] text-slate-400">HP</div>
                <div className="text-sm font-bold text-emerald-400">
                  {currentDerived.maxHp}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#080C14]/90 px-2 py-1.5">
                <div className="text-[11px] text-slate-400">SHD</div>
                <div className="text-sm font-bold text-sky-400">
                  {currentDerived.maxShield}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#080C14]/90 px-2 py-1.5">
                <div className="text-[11px] text-slate-400">ATK</div>
                <div className="text-sm font-bold text-slate-100">
                  {currentStats.attack}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#080C14]/90 px-2 py-1.5">
                <div className="text-[11px] text-slate-400">SPD</div>
                <div className="text-sm font-bold text-amber-300">
                  {currentDerived.speed}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Collapsible Full Stats Toggle (< lg) */}
          <div className="lg:hidden relative z-10 w-full space-y-2">
            <button
              type="button"
              onClick={() => setMobileStatsExpanded((v) => !v)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-slate-800 bg-[#080C14]/90 text-slate-200 text-sm font-semibold flex items-center justify-between cursor-pointer"
            >
              <span>
                {mobileStatsExpanded
                  ? t('mobile.hideStats')
                  : t('mobile.fullStats')}
              </span>
              {mobileStatsExpanded ? (
                <ChevronUp className="w-4 h-4 text-amber-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {mobileStatsExpanded && (
              <div className="rounded-lg border border-slate-800 bg-[#080C14]/95 p-3 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 font-mono-nums">
                  {STAT_KEYS.map((key) => (
                    <div
                      key={key}
                      className="rounded border border-slate-800/80 bg-slate-950/70 px-2 py-1.5 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-400">
                        {getStatShort(lang, key)}
                      </span>
                      <span className="font-bold text-slate-100">
                        {currentStats[key]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono-nums">
                  {derivedMetrics.map((m) => (
                    <div
                      key={m.key}
                      className="rounded border border-slate-800/80 bg-slate-950/70 px-2 py-1.5"
                    >
                      <div className="text-[10px] text-slate-400 truncate">
                        {m.label}
                      </div>
                      <div className={`text-xs font-bold ${m.color}`}>
                        {m.cur}
                        {m.suffix ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Owned Gears Selector */}
          <div className="relative z-10 w-full flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {ownedGears.map((cls) => {
                const g = pilot.gears[cls.id];
                const isSelected = cls.id === activeGear.classId;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      setSelection(null);
                      setMobileDetailOpen(false);
                      setConfirmingUnequipSlot(null);
                      setEnchantFeedback(null);
                      selectActiveGear(cls.id);
                    }}
                    className={`min-h-[44px] lg:min-h-0 lg:h-8 px-3 lg:px-2.5 rounded border text-xs font-display font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {getClassName(lang, cls.id)}{' '}
                    <span className="font-mono-nums text-[11px] opacity-80">
                      Lv.{g.level}
                    </span>
                  </button>
                );
              })}
            </div>

            {ownedGears.length < 4 && (
              <button
                type="button"
                onClick={() => setActiveTab('garage')}
                className="min-h-[44px] lg:min-h-0 px-2 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
              >
                + Garage ({ownedGears.length}/4)
              </button>
            )}
          </div>
        </section>

        {/* COL 1 on Desktop / SECOND on Mobile: 6 Equipment Slots (3x2 Square Tiles on Phone, Vertical Stack on Desktop) */}
        <section className="order-2 lg:order-1 lg:col-span-4 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('gear.slotsHeading')}
            </h2>
            <span className="text-xs font-mono-nums text-slate-400">
              {EQUIPMENT_SLOTS.filter((s) => Boolean(equippedMap[s])).length}/6
            </span>
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 lg:gap-1.5 flex-1">
            {EQUIPMENT_SLOTS.map((slot) => {
              const slotMeta = EQUIPMENT_SLOT_META[slot];
              const inst = equippedMap[slot];
              const isSelected =
                selection?.kind === 'slot' && selection.slot === slot;
              const isTargetOfPreview =
                selectedInventoryInstance &&
                selectedInventoryInstance.slot === slot &&
                getItemEquippedByGear(
                  pilot.gears,
                  selectedInventoryInstance.instanceId
                ) !== activeGear.classId;
              const isUnequipping = confirmingUnequipSlot === slot;

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleSelectSlot(slot)}
                  className={`w-full aspect-square lg:aspect-auto lg:min-h-[48px] p-2 lg:px-3 lg:py-1.5 rounded-lg lg:rounded border text-center lg:text-left transition-colors cursor-pointer flex flex-col lg:flex-row items-center justify-between gap-1 lg:gap-2.5 ${
                    isUnequipping
                      ? 'border-red-400/80 bg-red-500/10'
                      : isSelected
                      ? 'border-sky-400 bg-sky-500/15'
                      : isTargetOfPreview
                      ? 'border-amber-400/80 bg-amber-500/10'
                      : inst
                      ? `${RARITY_META[inst.rarity].borderClass} bg-[#080C14] hover:border-slate-600`
                      : 'border-slate-800/90 bg-[#080C14] hover:border-slate-700'
                  }`}
                >
                  {/* Top/Left Icon + Labels */}
                  <div className="flex flex-col lg:flex-row items-center gap-1 lg:gap-2.5 min-w-0 w-full">
                    <div className="flex items-center justify-between lg:justify-center w-full lg:w-auto">
                      <span
                        className={`h-8 w-8 rounded border flex items-center justify-center shrink-0 ${
                          inst
                            ? `${RARITY_META[inst.rarity].borderClass} bg-slate-900 ${RARITY_META[inst.rarity].textClass}`
                            : 'border-slate-800 bg-slate-950 text-slate-600'
                        }`}
                      >
                        <SlotIcon slot={slot} className="w-4 h-4" />
                      </span>
                      {inst && inst.enchantLevel > 0 && (
                        <span className="lg:hidden font-mono-nums text-[11px] font-bold text-amber-400">
                          +{inst.enchantLevel}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 w-full">
                      <div className="flex items-center justify-center lg:justify-start gap-1 text-[11px] text-slate-400 leading-none">
                        <span className="lg:hidden truncate">
                          {getSlotShort(lang, slot)}
                        </span>
                        <span className="hidden lg:inline">
                          {getSlotLabel(lang, slot)}
                        </span>
                        {slotMeta.classLocked && (
                          <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                        )}
                      </div>
                      <div
                        className={`mt-1 text-xs font-semibold truncate ${
                          inst
                            ? RARITY_META[inst.rarity].textClass
                            : 'text-slate-600'
                        }`}
                      >
                        {inst ? getItemInstanceName(lang, inst) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Desktop right quality + enchant */}
                  {inst && (
                    <div className="hidden lg:flex items-center gap-1.5 shrink-0 font-mono-nums text-[11px]">
                      <span className="text-slate-500">{inst.rollQuality}%</span>
                      {inst.enchantLevel > 0 && (
                        <span className="font-bold text-amber-400">
                          +{inst.enchantLevel}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* COL 3 (Desktop only >= lg): Live Combat Stats Readout with +/- Preview */}
        <section className="hidden lg:flex lg:order-3 lg:col-span-3 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('gear.statsHeading')}
            </h2>
            {isPreviewActive && (
              <span className="text-[11px] font-semibold text-amber-300">
                +/-
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-800/80 border-y border-slate-800/80">
            {STAT_KEYS.map((key) => {
              const prevVal = previewStats[key];
              const delta = statDeltas[key];
              return (
                <div
                  key={key}
                  className="py-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-mono-nums font-semibold text-slate-400">
                    {getStatShort(lang, key)}
                  </span>
                  <div className="flex items-baseline gap-1.5 font-mono-nums">
                    <span
                      className={`text-sm font-bold ${
                        delta > 0
                          ? 'text-emerald-400'
                          : delta < 0
                          ? 'text-red-400'
                          : 'text-slate-100'
                      }`}
                    >
                      {prevVal}
                    </span>
                    {delta !== 0 && (
                      <span
                        className={`text-[11px] font-semibold ${
                          delta > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        ({delta > 0 ? `+${delta}` : delta})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {derivedMetrics.map((m) => {
              const diff = m.prev - m.cur;
              return (
                <div
                  key={m.key}
                  className="rounded border border-slate-800/80 bg-[#080C14] px-2.5 py-1.5"
                >
                  <div className="text-[10px] text-slate-400 truncate">
                    {m.label}
                  </div>
                  <div className="font-mono-nums text-xs font-bold flex items-baseline gap-1">
                    <span
                      className={
                        diff > 0
                          ? 'text-emerald-400'
                          : diff < 0
                          ? 'text-red-400'
                          : m.color
                      }
                    >
                      {m.prev}
                      {m.suffix ?? ''}
                    </span>
                    {diff !== 0 && (
                      <span
                        className={`text-[10px] ${
                          diff > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ==================== BOTTOM ROW: Shared Cargo Grid | Inline Detail (Desktop) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Shared Cargo Grid */}
        <section className="lg:col-span-7 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                {t('gear.gridHeading')}
              </h2>
              <span className="font-mono-nums text-xs text-slate-400">
                {t('common.itemCount', { count: pilot.inventory.length })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('shop')}
              className="min-h-[36px] text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('equip.openShop')}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 tactical-scroll">
            <button
              type="button"
              onClick={() => setSlotFilter('all')}
              className={`min-h-[44px] lg:min-h-0 lg:h-8 px-3 lg:px-2.5 rounded-lg lg:rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                slotFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 border border-slate-600'
                  : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {t('common.all')}
            </button>
            {EQUIPMENT_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSlotFilter(slot)}
                className={`min-h-[44px] lg:min-h-0 lg:h-8 px-3 lg:px-2.5 rounded-lg lg:rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  slotFilter === slot
                    ? 'bg-slate-800 text-slate-100 border border-slate-600'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {getSlotShort(lang, slot)}
              </button>
            ))}
          </div>

          {filteredInventory.length === 0 ? (
            <div className="flex-1 min-h-[140px] rounded border border-slate-800/80 bg-[#080C14] px-4 py-8 flex items-center justify-center text-center text-sm lg:text-xs text-slate-400">
              {pilot.inventory.length === 0
                ? t('equip.inventoryEmpty')
                : t('equip.inventoryEmptyFilter')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1 tactical-scroll">
              {filteredInventory.map((inst) => {
                const ownerGear = getItemEquippedByGear(
                  pilot.gears,
                  inst.instanceId
                );
                const validation = validateEquipOnGear(
                  inst,
                  activeGear,
                  pilot.gears
                );
                const isSelected =
                  selection?.kind === 'inventory' &&
                  selection.instanceId === inst.instanceId;

                return (
                  <button
                    key={inst.instanceId}
                    type="button"
                    onClick={() => handleSelectInventory(inst.instanceId)}
                    className={`p-2.5 rounded-lg lg:rounded border text-left transition-colors cursor-pointer flex flex-col justify-between gap-1.5 min-h-[92px] ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_0_1px_rgba(251,191,36,0.3)]'
                        : `${RARITY_META[inst.rarity].borderClass} ${RARITY_META[inst.rarity].bgTintClass} hover:bg-slate-900/90`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono-nums ${
                          RARITY_META[inst.rarity].textClass
                        }`}
                      >
                        <SlotIcon slot={inst.slot} className="w-3.5 h-3.5" />
                        <span>T{inst.tier}</span>
                      </span>

                      <div className="flex items-center gap-1 font-mono-nums text-[11px]">
                        <span className="text-slate-400">
                          {inst.rollQuality}%
                        </span>
                        {inst.enchantLevel > 0 && (
                          <span className="font-bold text-amber-400">
                            +{inst.enchantLevel}
                          </span>
                        )}
                        {!validation.canEquip &&
                          ownerGear !== activeGear.classId && (
                            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                          )}
                      </div>
                    </div>

                    <div
                      className={`text-xs font-semibold leading-snug line-clamp-2 ${
                        RARITY_META[inst.rarity].textClass
                      }`}
                    >
                      {getItemInstanceName(lang, inst)}
                    </div>

                    <div className="text-[11px] font-mono-nums flex items-center justify-between gap-1">
                      {ownerGear ? (
                        <span
                          className={`truncate font-semibold ${
                            ownerGear === activeGear.classId
                              ? 'text-emerald-400'
                              : 'text-sky-300'
                          }`}
                        >
                          {t('common.equippedOnGear', {
                            gear: getClassName(lang, ownerGear),
                          })}
                        </span>
                      ) : (
                        <span className="text-slate-400 truncate">
                          {t('common.levelShort')}
                          {inst.requiredLevel}
                          {inst.classRestriction
                            ? ` · ${getClassName(lang, inst.classRestriction)}`
                            : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Inline Detail Panel (Desktop >= lg) */}
        <section className="hidden lg:flex lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('gear.detailHeading')}
            </h2>
            {activeDetailInstance && (
              <span className="text-[11px] font-medium text-slate-400">
                {activeDetailOwnerGear
                  ? t('common.equippedOnGear', {
                      gear: getClassName(lang, activeDetailOwnerGear),
                    })
                  : t('gear.inCargo')}
              </span>
            )}
          </div>

          {!activeDetailInstance || !activeDetailStats ? (
            <div className="flex-1 min-h-[180px] rounded border border-slate-800/80 bg-[#080C14] p-5 flex flex-col items-center justify-center text-center space-y-1.5">
              <div className="font-display text-lg font-semibold text-slate-300">
                {t('gear.emptyDetailTitle')}
              </div>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {t('gear.emptyDetailDesc')}
              </p>
            </div>
          ) : (
            renderDetailContent()
          )}
        </section>
      </div>

      {/* Mobile Bottom Sheet for Item Detail / Compare / Enchant (< lg) */}
      <div className="lg:hidden">
        <BottomSheet
          open={mobileDetailOpen && Boolean(activeDetailInstance)}
          onClose={() => {
            setMobileDetailOpen(false);
            setConfirmingUnequipSlot(null);
          }}
          title={
            activeDetailInstance
              ? getItemInstanceName(lang, activeDetailInstance, true)
              : t('gear.detailHeading')
          }
          subtitle={
            activeDetailInstance
              ? activeDetailOwnerGear
                ? t('common.equippedOnGear', {
                    gear: getClassName(lang, activeDetailOwnerGear),
                  })
                : t('gear.inCargo')
              : undefined
          }
        >
          {renderDetailContent()}
        </BottomSheet>
      </div>
    </div>
  );
}
