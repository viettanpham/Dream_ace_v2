import { useState } from 'react';
import { ArrowUpCircle, Check, Lock, ShieldAlert, X } from 'lucide-react';
import { STAT_KEYS } from '../data/classes';
import {
  ENCHANT_CONFIG,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_META,
  getItemDefinition,
  RARITY_META,
} from '../data/items';
import {
  getEffectiveItemStats,
  getEnchantMetadata,
  validateEquipRequirement,
} from '../engine/equipment';
import {
  formatEquipValidationReason,
  getClassName,
  getItemName,
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
  ItemInstance,
  Language,
  StatBlock,
} from '../types/game';
import { soundFx } from '../utils/sound';

export type EquipmentPreviewChange =
  | { type: 'equip'; instance: ItemInstance }
  | { type: 'unequip'; slot: EquipmentSlot }
  | null;

interface EquipmentPanelProps {
  previewChange: EquipmentPreviewChange;
  onPreviewChange: (change: EquipmentPreviewChange) => void;
  previewStatDeltas: StatBlock;
}

function formatStatBadges(
  lang: Language,
  stats: StatBlock
): Array<{ label: string; value: number }> {
  return STAT_KEYS.filter((k) => stats[k] > 0).map((k) => ({
    label: getStatShort(lang, k),
    value: stats[k],
  }));
}

export function EquipmentPanel({
  previewChange,
  onPreviewChange,
  previewStatDeltas,
}: EquipmentPanelProps) {
  const { lang, t } = useI18n();
  const player = useGameStore((s) => s.player);
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const enchantEquippedSlot = useGameStore((s) => s.enchantEquippedSlot);
  const setScreen = useGameStore((s) => s.setScreen);

  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [selectedEnchantSlot, setSelectedEnchantSlot] =
    useState<EquipmentSlot | null>(null);
  const [enchantFeedback, setEnchantFeedback] =
    useState<EnchantAttemptResult | null>(null);

  const handleConfirmPreview = () => {
    if (!previewChange) return;
    if (previewChange.type === 'equip') {
      const res = equipItem(previewChange.instance.instanceId);
      if (res.canEquip) {
        onPreviewChange(null);
      }
    } else {
      unequipSlot(previewChange.slot);
      if (selectedEnchantSlot === previewChange.slot) {
        setSelectedEnchantSlot(null);
      }
      onPreviewChange(null);
    }
  };

  const handleCancelPreview = () => {
    soundFx.playClick();
    onPreviewChange(null);
  };

  const handleSelectEnchantSlot = (slot: EquipmentSlot) => {
    soundFx.playClick();
    setEnchantFeedback(null);
    setSelectedEnchantSlot((prev) => (prev === slot ? null : slot));
  };

  const handleEnchant = (slot: EquipmentSlot) => {
    const res = enchantEquippedSlot(slot);
    if (res) {
      setEnchantFeedback(res);
    }
  };

  const filteredInventory = player.inventory.filter((inst) => {
    if (slotFilter === 'all') return true;
    const def = getItemDefinition(inst.itemId);
    return def?.slot === slotFilter;
  });

  const enchantInstance = selectedEnchantSlot
    ? player.equipped[selectedEnchantSlot]
    : null;
  const enchantDef = enchantInstance
    ? getItemDefinition(enchantInstance.itemId)
    : null;
  const enchantMeta = enchantInstance
    ? getEnchantMetadata(enchantInstance)
    : null;

  // Preview title & replaced item
  let previewSummaryTitle = '';
  let previewReplacingName: string | null = null;
  if (previewChange?.type === 'equip') {
    const def = getItemDefinition(previewChange.instance.itemId);
    if (def) {
      const name = getItemName(lang, def.id);
      const enh =
        previewChange.instance.enchantLevel > 0
          ? ` +${previewChange.instance.enchantLevel}`
          : '';
      previewSummaryTitle = t('equip.previewEquip', {
        item: `${name}${enh}`,
        slot: getSlotLabel(lang, def.slot),
      });
      const currentInSlot = player.equipped[def.slot];
      if (currentInSlot) {
        const curName = getItemName(lang, currentInSlot.itemId);
        previewReplacingName =
          currentInSlot.enchantLevel > 0
            ? `${curName} +${currentInSlot.enchantLevel}`
            : curName;
      }
    }
  } else if (previewChange?.type === 'unequip') {
    const inst = player.equipped[previewChange.slot];
    if (inst) {
      const name = getItemName(lang, inst.itemId);
      previewSummaryTitle = t('equip.previewUnequip', {
        item: inst.enchantLevel > 0 ? `${name} +${inst.enchantLevel}` : name,
      });
    }
  }

  const nonZeroDeltas = STAT_KEYS.filter((k) => previewStatDeltas[k] !== 0);

  const renderEnchantMessage = (fb: EnchantAttemptResult): string => {
    const itemName = getItemName(lang, fb.itemId);
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

  return (
    <div className="space-y-4">
      {/* Live Equip/Unequip Confirmation Bar */}
      {previewChange && (
        <div className="rounded-lg border border-amber-400/70 bg-amber-500/10 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-amber-300">
                {t('equip.previewTitle')}
              </div>
              <div className="text-sm font-semibold text-slate-100 mt-0.5">
                {previewSummaryTitle}
              </div>
              {previewReplacingName && (
                <div className="text-xs text-slate-400">
                  {t('equip.replaces', { item: previewReplacingName })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleConfirmPreview}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('common.confirm')}</span>
              </button>
              <button
                type="button"
                onClick={handleCancelPreview}
                className="h-9 px-3 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-amber-400/20 text-xs font-mono-nums">
            {nonZeroDeltas.length > 0 ? (
              nonZeroDeltas.map((key) => {
                const delta = previewStatDeltas[key];
                return (
                  <span
                    key={key}
                    className={
                      delta > 0
                        ? 'text-emerald-400 font-semibold'
                        : 'text-red-400 font-semibold'
                    }
                  >
                    {getStatShort(lang, key)} {delta > 0 ? `+${delta}` : delta}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-400">{t('equip.noNetChange')}</span>
            )}
          </div>
        </div>
      )}

      {/* 6 Equipped Ship Part Slots Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold tracking-wide text-slate-100">
            {t('equip.loadoutHeading')}
          </h3>
          <span className="text-xs text-slate-400">
            {t('equip.classLockHint')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {EQUIPMENT_SLOTS.map((slot) => {
            const slotMeta = EQUIPMENT_SLOT_META[slot];
            const equippedInst = player.equipped[slot];
            const def = equippedInst
              ? getItemDefinition(equippedInst.itemId)
              : null;
            const effectiveStats = equippedInst
              ? getEffectiveItemStats(
                  equippedInst.itemId,
                  equippedInst.enchantLevel
                )
              : null;
            const isPreviewedUnequip =
              previewChange?.type === 'unequip' && previewChange.slot === slot;
            const isPreviewedTarget =
              previewChange?.type === 'equip' &&
              getItemDefinition(previewChange.instance.itemId)?.slot === slot;
            const isEnchantOpen = selectedEnchantSlot === slot;

            return (
              <div
                key={slot}
                className={`rounded border p-3 flex flex-col justify-between gap-2.5 transition-colors ${
                  isPreviewedUnequip
                    ? 'border-red-400/80 bg-red-500/10'
                    : isPreviewedTarget
                    ? 'border-amber-400/80 bg-amber-500/10'
                    : isEnchantOpen
                    ? 'border-sky-400/80 bg-[#121C2B]'
                    : 'border-slate-800 bg-[#0A0F18]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-400 uppercase tracking-wider">
                      {getSlotLabel(lang, slot)}
                    </span>
                    {slotMeta.classLocked && (
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>{t('common.classLocked')}</span>
                      </span>
                    )}
                  </div>

                  {equippedInst && def && effectiveStats ? (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`font-semibold text-sm truncate ${
                            RARITY_META[def.rarity].textClass
                          }`}
                        >
                          {getItemName(lang, def.id)}
                          {equippedInst.enchantLevel > 0 && (
                            <span className="ml-1 font-mono-nums text-amber-300">
                              +{equippedInst.enchantLevel}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {getRarityLabel(lang, def.rarity)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono-nums text-slate-300">
                        {formatStatBadges(lang, effectiveStats).map((s) => (
                          <span key={s.label}>
                            +{s.value} {s.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 py-1.5">
                      {t('equip.emptySlot')}
                    </div>
                  )}
                </div>

                {equippedInst && def && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => handleSelectEnchantSlot(slot)}
                      className={`flex-1 h-8 px-2.5 inline-flex items-center justify-center gap-1 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        isEnchantOpen
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-amber-300'
                      }`}
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>
                        {equippedInst.enchantLevel >= ENCHANT_CONFIG.maxLevel
                          ? t('equip.enchantMax')
                          : t('equip.enchantBtn', {
                              level: equippedInst.enchantLevel,
                            })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        onPreviewChange(
                          isPreviewedUnequip ? null : { type: 'unequip', slot }
                        );
                      }}
                      className="h-8 px-2.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isPreviewedUnequip ? t('common.cancel') : t('equip.unequip')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ENCHANT BENCH */}
      {selectedEnchantSlot && enchantInstance && enchantDef && enchantMeta && (
        <div className="rounded-lg border border-sky-500/40 bg-[#0B1422] p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-sky-400">
                {t('equip.enchantTitle', {
                  slot: getSlotLabel(lang, selectedEnchantSlot),
                })}
              </div>
              <div className="font-display text-xl font-bold text-slate-100">
                {getItemName(lang, enchantDef.id)}{' '}
                <span className="font-mono-nums text-amber-400">
                  +{enchantMeta.currentLevel}
                </span>
                {!enchantMeta.isMax && (
                  <span className="font-mono-nums text-slate-400 text-base">
                    {' '}
                    → +{enchantMeta.nextLevel}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                {t('equip.enchantDesc', {
                  curPct: Math.round(
                    enchantMeta.currentLevel * ENCHANT_CONFIG.bonusPerLevel * 100
                  ),
                  nextPart: enchantMeta.isMax
                    ? ''
                    : ` → +${Math.round(
                        enchantMeta.nextLevel * ENCHANT_CONFIG.bonusPerLevel * 100
                      )}%`,
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedEnchantSlot(null)}
              aria-label="Close enchant panel"
              className="h-8 w-8 flex items-center justify-center rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono-nums py-2 border-y border-slate-800">
            {STAT_KEYS.filter((k) => (enchantDef.statBonuses[k] ?? 0) > 0).map(
              (key) => {
                const cur = enchantMeta.currentStats[key];
                const nxt = enchantMeta.nextStats[key];
                const diff = nxt - cur;
                return (
                  <div key={key} className="flex items-baseline gap-1.5">
                    <span className="text-slate-400">
                      {getStatShort(lang, key)}
                    </span>
                    <span className="text-slate-100 font-semibold">+{cur}</span>
                    {!enchantMeta.isMax && (
                      <span
                        className={
                          diff > 0
                            ? 'text-emerald-400 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        → +{nxt}
                      </span>
                    )}
                  </div>
                );
              }
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {enchantMeta.isMax ? (
              <span className="text-xs font-semibold text-amber-400">
                {t('equip.enchantMaxReached')}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono-nums">
                <div>
                  <span className="text-slate-400">{t('equip.successRate')} </span>
                  <span
                    className={
                      enchantMeta.successRate >= 70
                        ? 'text-emerald-400 font-semibold'
                        : enchantMeta.successRate >= 45
                        ? 'text-amber-400 font-semibold'
                        : 'text-red-400 font-semibold'
                    }
                  >
                    {enchantMeta.successRate}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t('equip.cost')} </span>
                  <span
                    className={
                      player.credits >= enchantMeta.cost
                        ? 'text-slate-100 font-semibold'
                        : 'text-red-400 font-semibold'
                    }
                  >
                    {enchantMeta.cost.toLocaleString()} CR
                  </span>
                </div>
              </div>
            )}

            {!enchantMeta.isMax && (
              <button
                type="button"
                disabled={player.credits < enchantMeta.cost}
                onClick={() => handleEnchant(selectedEnchantSlot)}
                className="h-10 px-4 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                {player.credits < enchantMeta.cost
                  ? t('equip.needCredits', {
                      cost: enchantMeta.cost.toLocaleString(),
                    })
                  : t('equip.enchantAction', {
                      level: enchantMeta.nextLevel,
                      cost: enchantMeta.cost.toLocaleString(),
                    })}
              </button>
            )}
          </div>

          {enchantFeedback && (
            <div
              className={`text-xs px-3 py-2 rounded border ${
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

      {/* CARGO INVENTORY LIST */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('equip.inventoryTitle')}
            </h3>
            <span className="font-mono-nums text-xs text-slate-400">
              {t('common.itemCount', { count: player.inventory.length })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setScreen('SHOP')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            {t('equip.openShop')}
          </button>
        </div>

        {/* Slot Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSlotFilter('all')}
            className={`h-8 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
              className={`h-8 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
          <div className="rounded border border-slate-800/80 bg-[#0A0F18] px-4 py-6 text-center text-xs text-slate-400">
            {player.inventory.length === 0
              ? t('equip.inventoryEmpty')
              : t('equip.inventoryEmptyFilter')}
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 tactical-scroll">
            {filteredInventory.map((inst) => {
              const def = getItemDefinition(inst.itemId);
              if (!def) return null;

              const validation = validateEquipRequirement(
                def,
                player.level,
                player.classId
              );
              const reasonText = formatEquipValidationReason(lang, validation);
              const effStats = getEffectiveItemStats(
                inst.itemId,
                inst.enchantLevel
              );
              const isSelectedPreview =
                previewChange?.type === 'equip' &&
                previewChange.instance.instanceId === inst.instanceId;

              return (
                <div
                  key={inst.instanceId}
                  className={`rounded border p-3 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                    isSelectedPreview
                      ? 'border-amber-400/80 bg-amber-500/10'
                      : 'border-slate-800/90 bg-[#0A0F18] hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`font-semibold text-sm ${
                          RARITY_META[def.rarity].textClass
                        }`}
                      >
                        {getItemName(lang, def.id)}
                        {inst.enchantLevel > 0 && (
                          <span className="ml-1 font-mono-nums text-amber-300">
                            +{inst.enchantLevel}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {getSlotLabel(lang, def.slot)} ·{' '}
                        {getRarityLabel(lang, def.rarity)} ·{' '}
                        {t('common.levelShort')}
                        {def.requiredLevel}
                        {' · '}
                        {def.classRestriction
                          ? t('common.classOnly', {
                              className: getClassName(lang, def.classRestriction),
                            })
                          : t('common.allClasses')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono-nums text-slate-300">
                      {formatStatBadges(lang, effStats).map((s) => (
                        <span key={s.label}>
                          +{s.value} {s.label}
                        </span>
                      ))}
                    </div>

                    {!validation.canEquip && reasonText && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] text-red-400 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('equip.cannotEquip', { reason: reasonText })}</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      disabled={!validation.canEquip}
                      onClick={() => {
                        soundFx.playClick();
                        onPreviewChange(
                          isSelectedPreview
                            ? null
                            : { type: 'equip', instance: inst }
                        );
                      }}
                      className={`h-9 px-3.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed ${
                        isSelectedPreview
                          ? 'bg-slate-800 border border-amber-400 text-amber-300'
                          : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100'
                      }`}
                    >
                      {isSelectedPreview
                        ? t('equip.cancelPreviewBtn')
                        : t('equip.previewEquipBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
