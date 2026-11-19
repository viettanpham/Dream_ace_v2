import { useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Check,
  Cpu,
  Crosshair,
  Flame,
  Info,
  Lock,
  Shield,
  ShieldAlert,
  X,
  Zap,
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
  getItemDefinition,
  RARITY_META,
} from '../data/items';
import {
  getEffectiveItemStats,
  getEnchantMetadata,
  simulateEquippedChange,
  sumEquippedStatBonuses,
  validateEquipRequirement,
} from '../engine/equipment';
import { calculateDerivedStats, calculateEffectiveStats } from '../engine/stats';
import {
  formatEquipValidationReason,
  getClassCode,
  getClassName,
  getClassRole,
  getItemDesc,
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
  MechClassId,
  StatBlock,
} from '../types/game';
import { soundFx } from '../utils/sound';
import { FighterSvg } from './FighterSvg';

type GearSelection =
  | { kind: 'slot'; slot: EquipmentSlot }
  | { kind: 'inventory'; instanceId: string }
  | null;

function SlotIcon({
  slot,
  className = 'w-4 h-4',
}: {
  slot: EquipmentSlot;
  className?: string;
}) {
  switch (slot) {
    case 'main_weapon':
      return <Crosshair className={className} />;
    case 'sub_weapon':
      return <Zap className={className} />;
    case 'armor':
      return <Shield className={className} />;
    case 'engine':
      return <Flame className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    case 'accessory':
      return <ArrowUpCircle className={className} />;
  }
}

export function GearView() {
  const { lang, t } = useI18n();
  const player = useGameStore((s) => s.player);
  const unequippedNoticeItems = useGameStore((s) => s.unequippedNoticeItems);
  const clearHangarNotice = useGameStore((s) => s.clearHangarNotice);
  const switchClass = useGameStore((s) => s.switchClass);
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const enchantEquippedSlot = useGameStore((s) => s.enchantEquippedSlot);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [selection, setSelection] = useState<GearSelection>(null);
  const [confirmingUnequipSlot, setConfirmingUnequipSlot] =
    useState<EquipmentSlot | null>(null);
  const [enchantFeedback, setEnchantFeedback] =
    useState<EnchantAttemptResult | null>(null);

  const activeClass = MECH_CLASSES[player.classId];

  // Resolve selected item instance (from either equipped slot or cargo inventory)
  const selectedInventoryInstance =
    selection?.kind === 'inventory'
      ? player.inventory.find((i) => i.instanceId === selection.instanceId) ??
        null
      : null;

  const selectedSlotInstance =
    selection?.kind === 'slot' ? player.equipped[selection.slot] : null;

  // Determine live equipment preview change (for +/- green/red comparison in Top-Right & Bottom-Right)
  const previewEquipped = useMemo(() => {
    if (selectedInventoryInstance) {
      const def = getItemDefinition(selectedInventoryInstance.itemId);
      if (def) {
        return simulateEquippedChange(player.equipped, {
          type: 'equip',
          instance: selectedInventoryInstance,
        });
      }
    }
    if (confirmingUnequipSlot && player.equipped[confirmingUnequipSlot]) {
      return simulateEquippedChange(player.equipped, {
        type: 'unequip',
        slot: confirmingUnequipSlot,
      });
    }
    return player.equipped;
  }, [player.equipped, selectedInventoryInstance, confirmingUnequipSlot]);

  const currentEquipBonuses = useMemo(
    () => sumEquippedStatBonuses(player.equipped),
    [player.equipped]
  );

  const previewEquipBonuses = useMemo(
    () => sumEquippedStatBonuses(previewEquipped),
    [previewEquipped]
  );

  const currentStats = useMemo(
    () =>
      calculateEffectiveStats(
        player.classId,
        player.level,
        player.allocatedPoints,
        EMPTY_STAT_BLOCK,
        currentEquipBonuses
      ),
    [player.classId, player.level, player.allocatedPoints, currentEquipBonuses]
  );

  const previewStats = useMemo(
    () =>
      calculateEffectiveStats(
        player.classId,
        player.level,
        player.allocatedPoints,
        EMPTY_STAT_BLOCK,
        previewEquipBonuses
      ),
    [player.classId, player.level, player.allocatedPoints, previewEquipBonuses]
  );

  const currentDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, currentStats),
    [player.classId, player.level, currentStats]
  );

  const previewDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, previewStats),
    [player.classId, player.level, previewStats]
  );

  const statDeltas: StatBlock = useMemo(() => {
    const d = { ...EMPTY_STAT_BLOCK };
    for (const k of STAT_KEYS) {
      d[k] = previewStats[k] - currentStats[k];
    }
    return d;
  }, [previewStats, currentStats]);

  const isPreviewActive =
    Boolean(selectedInventoryInstance) || Boolean(confirmingUnequipSlot);

  const filteredInventory = useMemo(() => {
    return player.inventory.filter((inst) => {
      if (slotFilter === 'all') return true;
      const def = getItemDefinition(inst.itemId);
      return def?.slot === slotFilter;
    });
  }, [player.inventory, slotFilter]);

  const handleSelectSlot = (slot: EquipmentSlot) => {
    soundFx.playClick();
    setEnchantFeedback(null);
    setConfirmingUnequipSlot(null);
    if (player.equipped[slot]) {
      setSelection({ kind: 'slot', slot });
    } else {
      setSelection(null);
      setSlotFilter(slot);
    }
  };

  const handleSelectInventory = (instanceId: string) => {
    soundFx.playClick();
    setEnchantFeedback(null);
    setConfirmingUnequipSlot(null);
    setSelection((prev) =>
      prev?.kind === 'inventory' && prev.instanceId === instanceId
        ? null
        : { kind: 'inventory', instanceId }
    );
  };

  const handleClassSwitch = (classId: MechClassId) => {
    setSelection(null);
    setConfirmingUnequipSlot(null);
    setEnchantFeedback(null);
    switchClass(classId);
  };

  const handleConfirmEquip = () => {
    if (!selectedInventoryInstance) return;
    const def = getItemDefinition(selectedInventoryInstance.itemId);
    const res = equipItem(selectedInventoryInstance.instanceId);
    if (res.canEquip && def) {
      setSelection({ kind: 'slot', slot: def.slot });
    }
  };

  const handleConfirmUnequip = (slot: EquipmentSlot) => {
    unequipSlot(slot);
    setConfirmingUnequipSlot(null);
    setSelection(null);
    setEnchantFeedback(null);
  };

  const handleEnchant = (slot: EquipmentSlot) => {
    const res = enchantEquippedSlot(slot);
    if (res) {
      setEnchantFeedback(res);
    }
  };

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

  const unequippedNoticeText =
    unequippedNoticeItems.length > 0
      ? t('hangar.noticeUnequipped', {
          items: unequippedNoticeItems
            .map((it) => {
              const nm = getItemName(lang, it.itemId);
              return it.enchantLevel > 0 ? `${nm} +${it.enchantLevel}` : nm;
            })
            .join(', '),
        })
      : null;

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

  // Prepare detail panel data
  const activeDetailInstance = selectedInventoryInstance ?? selectedSlotInstance;
  const activeDetailDef = activeDetailInstance
    ? getItemDefinition(activeDetailInstance.itemId) ?? null
    : null;
  const activeDetailStats = activeDetailInstance
    ? getEffectiveItemStats(
        activeDetailInstance.itemId,
        activeDetailInstance.enchantLevel
      )
    : null;
  const activeValidation =
    selectedInventoryInstance && activeDetailDef
      ? validateEquipRequirement(activeDetailDef, player.level, player.classId)
      : null;
  const activeEnchantMeta =
    selectedSlotInstance && selection?.kind === 'slot'
      ? getEnchantMetadata(selectedSlotInstance)
      : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
      {/* Inline Class-Switch Unequip Notice */}
      {unequippedNoticeText && (
        <div className="rounded border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-sky-200">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-sky-400" />
            <span>{unequippedNoticeText}</span>
          </div>
          <button
            type="button"
            onClick={clearHangarNotice}
            aria-label="Dismiss"
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== TOP ROW: 3 COLUMNS (Slots | Ship Hover+Glow | Stats) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* COL 1 (4 cols): 6 Equipment Slots Stacked Vertically */}
        <section className="lg:col-span-4 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('gear.slotsHeading')}
            </h2>
            <span className="text-[11px] text-slate-400">
              {EQUIPMENT_SLOTS.filter((s) => Boolean(player.equipped[s])).length}/6
            </span>
          </div>

          <div className="space-y-1.5 flex-1 flex flex-col justify-between">
            {EQUIPMENT_SLOTS.map((slot) => {
              const slotMeta = EQUIPMENT_SLOT_META[slot];
              const inst = player.equipped[slot];
              const def = inst ? getItemDefinition(inst.itemId) : null;
              const isSelected =
                selection?.kind === 'slot' && selection.slot === slot;
              const isTargetOfPreview =
                selectedInventoryInstance &&
                getItemDefinition(selectedInventoryInstance.itemId)?.slot === slot;
              const isUnequipping = confirmingUnequipSlot === slot;

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleSelectSlot(slot)}
                  className={`w-full min-h-[48px] px-3 py-1.5 rounded border text-left transition-colors cursor-pointer flex items-center justify-between gap-2.5 ${
                    isUnequipping
                      ? 'border-red-400/80 bg-red-500/10'
                      : isSelected
                      ? 'border-sky-400 bg-sky-500/15'
                      : isTargetOfPreview
                      ? 'border-amber-400/80 bg-amber-500/10'
                      : 'border-slate-800/90 bg-[#080C14] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-8 w-8 rounded border flex items-center justify-center shrink-0 ${
                        def
                          ? `${RARITY_META[def.rarity].borderClass} bg-slate-900 ${RARITY_META[def.rarity].textClass}`
                          : 'border-slate-800 bg-slate-950 text-slate-600'
                      }`}
                    >
                      <SlotIcon slot={slot} className="w-4 h-4" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-none">
                        <span>{getSlotLabel(lang, slot)}</span>
                        {slotMeta.classLocked && (
                          <Lock className="w-2.5 h-2.5 text-slate-500" />
                        )}
                      </div>
                      <div
                        className={`mt-1 text-xs font-semibold truncate ${
                          def ? RARITY_META[def.rarity].textClass : 'text-slate-600'
                        }`}
                      >
                        {def ? getItemName(lang, def.id) : '—'}
                      </div>
                    </div>
                  </div>

                  {inst && inst.enchantLevel > 0 && (
                    <span className="font-mono-nums text-xs font-bold text-amber-400 shrink-0">
                      +{inst.enchantLevel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* COL 2 (5 cols): Hovering Space Fighter Ship + Glow + Class Switcher */}
        <section className="lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-col justify-between items-center relative overflow-hidden">
          {/* Subtle Orbital Bay Blueprint Rings */}
          <svg
            viewBox="0 0 360 280"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
            aria-hidden="true"
          >
            <circle cx="180" cy="128" r="88" stroke="#334155" strokeWidth="1" strokeDasharray="5 5" fill="none" />
            <circle cx="180" cy="128" r="120" stroke="#1E293B" strokeWidth="1" fill="none" />
            <line x1="30" y1="128" x2="330" y2="128" stroke="#1E293B" strokeWidth="1" />
          </svg>

          {/* Ambient Engine/Class Glow */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: activeClass.accentHex }}
          />

          {/* Top Class Identity Line */}
          <div className="relative z-10 w-full flex items-baseline justify-between gap-2">
            <div>
              <div className="font-display text-xl font-bold tracking-wide text-slate-50 leading-none">
                {getClassName(lang, player.classId)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {getClassCode(lang, player.classId)} · {getClassRole(lang, player.classId)}
              </div>
            </div>
            {player.unspentPoints > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('pilot')}
                className="text-xs font-mono-nums font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
              >
                {t('gear.allocateHint', { count: player.unspentPoints })}
              </button>
            )}
          </div>

          {/* Center Hovering Space Fighter */}
          <div className="relative z-10 py-3 flex items-center justify-center">
            <FighterSvg
              classId={player.classId}
              side="ally"
              facing="right"
              size="lg"
              heroHover
              className="w-48 h-48 sm:w-52 sm:h-52"
            />
          </div>

          {/* Compact 4-Class Switcher Strip */}
          <div className="relative z-10 w-full space-y-1.5">
            <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label={t('gear.classSwitchLabel')}>
              {MECH_CLASS_LIST.map((cls) => {
                const active = cls.id === player.classId;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleClassSwitch(cls.id)}
                    className={`h-9 px-2 rounded border text-xs font-display font-semibold tracking-wide transition-colors cursor-pointer truncate ${
                      active
                        ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {getClassName(lang, cls.id)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* COL 3 (3 cols): Live Combat Stats Readout with +/- Preview */}
        <section className="lg:col-span-3 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-3.5 flex flex-col justify-between gap-3">
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

          {/* 6 Base Stats (ATK, DEF, FUL, SPR, SHD, EVA) */}
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

          {/* 6 Derived Telemetry Metrics */}
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

      {/* ==================== BOTTOM ROW: 2 COLUMNS (Grid Inventory | Detail + +/- Comparison) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* BOTTOM-LEFT (7 cols): Grid Inventory */}
        <section className="lg:col-span-7 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                {t('gear.gridHeading')}
              </h2>
              <span className="font-mono-nums text-xs text-slate-400">
                {t('common.itemCount', { count: player.inventory.length })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('shop')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('equip.openShop')}
            </button>
          </div>

          {/* Slot Filter Buttons */}
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

          {/* Grid Tiles */}
          {filteredInventory.length === 0 ? (
            <div className="flex-1 min-h-[160px] rounded border border-slate-800/80 bg-[#080C14] px-4 py-8 flex items-center justify-center text-center text-xs text-slate-400">
              {player.inventory.length === 0
                ? t('equip.inventoryEmpty')
                : t('equip.inventoryEmptyFilter')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1 tactical-scroll">
              {filteredInventory.map((inst) => {
                const def = getItemDefinition(inst.itemId);
                if (!def) return null;
                const validation = validateEquipRequirement(
                  def,
                  player.level,
                  player.classId
                );
                const isSelected =
                  selection?.kind === 'inventory' &&
                  selection.instanceId === inst.instanceId;

                return (
                  <button
                    key={inst.instanceId}
                    type="button"
                    onClick={() => handleSelectInventory(inst.instanceId)}
                    className={`p-2.5 rounded border text-left transition-colors cursor-pointer flex flex-col justify-between gap-2 min-h-[82px] ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_0_1px_rgba(251,191,36,0.3)]'
                        : `${RARITY_META[def.rarity].borderClass} bg-[#080C14] hover:bg-slate-900/90`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono-nums ${
                          RARITY_META[def.rarity].textClass
                        }`}
                      >
                        <SlotIcon slot={def.slot} className="w-3.5 h-3.5" />
                        <span>{getSlotShort(lang, def.slot)}</span>
                      </span>

                      <div className="flex items-center gap-1">
                        {inst.enchantLevel > 0 && (
                          <span className="font-mono-nums text-[10px] font-bold text-amber-400">
                            +{inst.enchantLevel}
                          </span>
                        )}
                        {!validation.canEquip && (
                          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                    </div>

                    <div
                      className={`text-xs font-semibold leading-snug line-clamp-2 ${
                        RARITY_META[def.rarity].textClass
                      }`}
                    >
                      {getItemName(lang, def.id)}
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono-nums flex items-center justify-between">
                      <span>
                        {t('common.levelShort')}
                        {def.requiredLevel}
                      </span>
                      {def.classRestriction && (
                        <span className="truncate max-w-[70px]">
                          {getClassName(lang, def.classRestriction)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* BOTTOM-RIGHT (5 cols): Item Details + Live +/- Stat Comparison + Equip/Enchant/Unequip */}
        <section className="lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
              {t('gear.detailHeading')}
            </h2>
            {activeDetailInstance && (
              <span className="text-[11px] font-medium text-slate-400">
                {selection?.kind === 'slot'
                  ? t('gear.currentlyEquipped')
                  : t('gear.inCargo')}
              </span>
            )}
          </div>

          {!activeDetailInstance || !activeDetailDef || !activeDetailStats ? (
            <div className="flex-1 min-h-[180px] rounded border border-slate-800/80 bg-[#080C14] p-5 flex flex-col items-center justify-center text-center space-y-1.5">
              <div className="font-display text-lg font-semibold text-slate-300">
                {t('gear.emptyDetailTitle')}
              </div>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {t('gear.emptyDetailDesc')}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between gap-3">
              {/* Item Title & Meta */}
              <div className="space-y-2">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      className={`font-display text-xl font-bold leading-tight ${
                        RARITY_META[activeDetailDef.rarity].textClass
                      }`}
                    >
                      {getItemName(lang, activeDetailDef.id)}
                      {activeDetailInstance.enchantLevel > 0 && (
                        <span className="ml-1.5 font-mono-nums text-amber-400">
                          +{activeDetailInstance.enchantLevel}
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-slate-400 shrink-0">
                      {getRarityLabel(lang, activeDetailDef.rarity)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {getSlotLabel(lang, activeDetailDef.slot)} ·{' '}
                    {t('common.levelShort')}
                    <span className="font-mono-nums">
                      {activeDetailDef.requiredLevel}
                    </span>
                    {' · '}
                    {activeDetailDef.classRestriction
                      ? t('common.classOnly', {
                          className: getClassName(
                            lang,
                            activeDetailDef.classRestriction
                          ),
                        })
                      : t('common.allClasses')}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {getItemDesc(lang, activeDetailDef.id)}
                </p>

                {/* Item Effective Stat Bonuses */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 border-y border-slate-800/80 text-xs font-mono-nums text-slate-200">
                  {STAT_KEYS.filter((k) => activeDetailStats[k] > 0).map((k) => (
                    <span key={k}>
                      +{activeDetailStats[k]} {getStatShort(lang, k)}
                    </span>
                  ))}
                </div>

                {/* Live +/- Comparison Block (when comparing Inventory item or Unequip preview) */}
                {isPreviewActive && (
                  <div className="rounded border border-slate-800 bg-[#080C14] p-2.5 space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-300">
                      {t('gear.comparisonHeading')}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-nums">
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
                        <span className="text-slate-500">
                          {t('gear.noStatDiff')}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Cannot-Equip Inline Warning */}
                {activeValidation && !activeValidation.canEquip && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      {t('equip.cannotEquip', {
                        reason:
                          formatEquipValidationReason(lang, activeValidation) ??
                          '',
                      })}
                    </span>
                  </div>
                )}

                {/* Inline Enchant Section (when inspecting an Equipped Slot) */}
                {selection?.kind === 'slot' && activeEnchantMeta && (
                  <div className="rounded border border-sky-500/35 bg-[#091322] p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
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
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] font-mono-nums text-slate-300">
                        {STAT_KEYS.filter(
                          (k) => (activeDetailDef.statBonuses[k] ?? 0) > 0
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
                        className={`text-[11px] px-2.5 py-1.5 rounded border ${
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

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                {selection?.kind === 'inventory' && (
                  <>
                    <button
                      type="button"
                      disabled={!activeValidation?.canEquip}
                      onClick={handleConfirmEquip}
                      className="flex-1 h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-4 h-4" />
                      <span>{t('gear.confirmEquip')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setSelection(null);
                      }}
                      className="h-10 px-3.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                )}

                {selection?.kind === 'slot' && activeEnchantMeta && (
                  <>
                    {!activeEnchantMeta.isMax && (
                      <button
                        type="button"
                        disabled={player.credits < activeEnchantMeta.cost}
                        onClick={() => handleEnchant(selection.slot)}
                        className="flex-1 h-10 px-3.5 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {player.credits < activeEnchantMeta.cost
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
                          className="h-10 px-3.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {t('gear.confirmUnequip')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setConfirmingUnequipSlot(null);
                          }}
                          className="h-10 px-3 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer whitespace-nowrap"
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
                        className="h-10 px-3.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t('gear.previewUnequip')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
