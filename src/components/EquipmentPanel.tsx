import { useState } from 'react';
import { ArrowUpCircle, Check, Lock, ShieldAlert, X } from 'lucide-react';
import { MECH_CLASSES, STAT_KEYS, STAT_META } from '../data/classes';
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
import { useGameStore } from '../store/useGameStore';
import type {
  EnchantAttemptResult,
  EquipmentSlot,
  ItemInstance,
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

function formatStatBadges(stats: StatBlock): Array<{ label: string; value: number }> {
  return STAT_KEYS.filter((k) => stats[k] > 0).map((k) => ({
    label: STAT_META[k].shortLabel,
    value: stats[k],
  }));
}

export function EquipmentPanel({
  previewChange,
  onPreviewChange,
  previewStatDeltas,
}: EquipmentPanelProps) {
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

  // Describe pending preview action
  let previewSummaryTitle = '';
  let previewReplacingName: string | null = null;
  if (previewChange?.type === 'equip') {
    const def = getItemDefinition(previewChange.instance.itemId);
    if (def) {
      const enh =
        previewChange.instance.enchantLevel > 0
          ? ` +${previewChange.instance.enchantLevel}`
          : '';
      previewSummaryTitle = `Equip ${def.name}${enh} (${EQUIPMENT_SLOT_META[def.slot].label})`;
      const currentInSlot = player.equipped[def.slot];
      if (currentInSlot) {
        const curDef = getItemDefinition(currentInSlot.itemId);
        if (curDef) {
          previewReplacingName =
            currentInSlot.enchantLevel > 0
              ? `${curDef.name} +${currentInSlot.enchantLevel}`
              : curDef.name;
        }
      }
    }
  } else if (previewChange?.type === 'unequip') {
    const inst = player.equipped[previewChange.slot];
    const def = inst ? getItemDefinition(inst.itemId) : null;
    if (def && inst) {
      previewSummaryTitle = `Unequip ${def.name}${
        inst.enchantLevel > 0 ? ` +${inst.enchantLevel}` : ''
      }`;
    }
  }

  const nonZeroDeltas = STAT_KEYS.filter((k) => previewStatDeltas[k] !== 0);

  return (
    <div className="space-y-4">
      {/* Live Equip/Unequip Confirmation Bar */}
      {previewChange && (
        <div className="rounded-lg border border-amber-400/70 bg-amber-500/10 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-amber-300">
                Live Loadout Preview
              </div>
              <div className="text-sm font-semibold text-slate-100 mt-0.5">
                {previewSummaryTitle}
              </div>
              {previewReplacingName && (
                <div className="text-xs text-slate-400">
                  Replaces {previewReplacingName} (returned to inventory)
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
                <span>Confirm</span>
              </button>
              <button
                type="button"
                onClick={handleCancelPreview}
                className="h-9 px-3 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
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
                    {STAT_META[key].shortLabel} {delta > 0 ? `+${delta}` : delta}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-400">No net change to base stats</span>
            )}
          </div>
        </div>
      )}

      {/* 6 Equipped Slots Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold tracking-wide text-slate-100">
            Equipped Loadout (6 Slots)
          </h3>
          <span className="text-xs text-slate-400">
            Armor & Engine are class-locked
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
                      {slotMeta.label}
                    </span>
                    {slotMeta.classLocked && (
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>Class-Locked</span>
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
                          {def.name}
                          {equippedInst.enchantLevel > 0 && (
                            <span className="ml-1 font-mono-nums text-amber-300">
                              +{equippedInst.enchantLevel}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {RARITY_META[def.rarity].label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono-nums text-slate-300">
                        {formatStatBadges(effectiveStats).map((s) => (
                          <span key={s.label}>
                            +{s.value} {s.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 py-1.5">
                      Empty slot — equip an item from inventory below
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
                          ? 'Max +10'
                          : `Enchant (+${equippedInst.enchantLevel})`}
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
                      {isPreviewedUnequip ? 'Cancel' : 'Unequip'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ENCHANT BENCH (for selected equipped slot) */}
      {selectedEnchantSlot && enchantInstance && enchantDef && enchantMeta && (
        <div className="rounded-lg border border-sky-500/40 bg-[#0B1422] p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-sky-400">
                Equipment Enchanting · {EQUIPMENT_SLOT_META[selectedEnchantSlot].label}
              </div>
              <div className="font-display text-xl font-bold text-slate-100">
                {enchantDef.name}{' '}
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
                Each +1 adds +8% to stat bonuses (current: +
                {Math.round(
                  enchantMeta.currentLevel * ENCHANT_CONFIG.bonusPerLevel * 100
                )}
                %
                {!enchantMeta.isMax
                  ? ` → +${Math.round(
                      enchantMeta.nextLevel * ENCHANT_CONFIG.bonusPerLevel * 100
                    )}%`
                  : ''}
                ). Failure spends Credits with no item loss.
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

          {/* Current vs Next Enchant Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono-nums py-2 border-y border-slate-800">
            {STAT_KEYS.filter((k) => (enchantDef.statBonuses[k] ?? 0) > 0).map(
              (key) => {
                const cur = enchantMeta.currentStats[key];
                const nxt = enchantMeta.nextStats[key];
                const diff = nxt - cur;
                return (
                  <div key={key} className="flex items-baseline gap-1.5">
                    <span className="text-slate-400">{STAT_META[key].shortLabel}</span>
                    <span className="text-slate-100 font-semibold">+{cur}</span>
                    {!enchantMeta.isMax && (
                      <span
                        className={
                          diff > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'
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

          {/* Enchant Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {enchantMeta.isMax ? (
              <span className="text-xs font-semibold text-amber-400">
                Maximum Enchant Level Reached (+10 / +80% Bonus)
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono-nums">
                <div>
                  <span className="text-slate-400">Success Rate: </span>
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
                  <span className="text-slate-400">Cost: </span>
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
                  ? `Need ${enchantMeta.cost.toLocaleString()} CR`
                  : `Enchant to +${enchantMeta.nextLevel} (${enchantMeta.cost.toLocaleString()} CR)`}
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
              {enchantFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* INVENTORY LIST */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-lg font-bold tracking-wide text-slate-100">
              Inventory
            </h3>
            <span className="font-mono-nums text-xs text-slate-400">
              {player.inventory.length} item{player.inventory.length === 1 ? '' : 's'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setScreen('SHOP')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            Open Equipment Shop →
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
            All
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
              {EQUIPMENT_SLOT_META[slot].shortLabel}
            </button>
          ))}
        </div>

        {filteredInventory.length === 0 ? (
          <div className="rounded border border-slate-800/80 bg-[#0A0F18] px-4 py-6 text-center text-xs text-slate-400">
            {player.inventory.length === 0
              ? 'Your inventory is empty. Buy gear in the Shop or defeat enemies in battle for drops.'
              : 'No items in this slot category.'}
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
                        {def.name}
                        {inst.enchantLevel > 0 && (
                          <span className="ml-1 font-mono-nums text-amber-300">
                            +{inst.enchantLevel}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {EQUIPMENT_SLOT_META[def.slot].label} ·{' '}
                        {RARITY_META[def.rarity].label} · Lv.{def.requiredLevel}
                        {def.classRestriction
                          ? ` · ${MECH_CLASSES[def.classRestriction].name} Only`
                          : ' · All Classes'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono-nums text-slate-300">
                      {formatStatBadges(effStats).map((s) => (
                        <span key={s.label}>
                          +{s.value} {s.label}
                        </span>
                      ))}
                    </div>

                    {!validation.canEquip && validation.reason && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] text-red-400 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>Cannot equip: {validation.reason}</span>
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
                      {isSelectedPreview ? 'Cancel Preview' : 'Preview Equip'}
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
