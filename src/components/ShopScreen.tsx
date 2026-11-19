import { useMemo, useState } from 'react';
import { AlertTriangle, Coins, ShoppingBag } from 'lucide-react';
import { MECH_CLASSES, MECH_CLASS_LIST, STAT_KEYS, STAT_META } from '../data/classes';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_META,
  getItemDefinition,
  ITEMS_CATALOG,
  RARITY_META,
  SHOP_CONFIG,
} from '../data/items';
import {
  getEffectiveItemStats,
  getSellPrice,
  validateEquipRequirement,
} from '../engine/equipment';
import { useGameStore } from '../store/useGameStore';
import type { EquipmentSlot, MechClassId } from '../types/game';

type ShopTab = 'buy' | 'sell';
type ClassFilter = 'all' | 'usable' | 'universal' | MechClassId;

export function ShopScreen() {
  const player = useGameStore((s) => s.player);
  const buyItem = useGameStore((s) => s.buyItem);
  const sellItem = useGameStore((s) => s.sellItem);
  const setScreen = useGameStore((s) => s.setScreen);

  const [tab, setTab] = useState<ShopTab>('buy');
  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const ownedCountByItemId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inst of player.inventory) {
      counts[inst.itemId] = (counts[inst.itemId] || 0) + 1;
    }
    for (const slot of EQUIPMENT_SLOTS) {
      const eq = player.equipped[slot];
      if (eq) {
        counts[eq.itemId] = (counts[eq.itemId] || 0) + 1;
      }
    }
    return counts;
  }, [player.inventory, player.equipped]);

  const filteredCatalog = useMemo(() => {
    return ITEMS_CATALOG.filter((item) => {
      if (slotFilter !== 'all' && item.slot !== slotFilter) return false;

      if (classFilter === 'universal' && item.classRestriction !== null) {
        return false;
      }
      if (classFilter === 'usable') {
        const val = validateEquipRequirement(item, player.level, player.classId);
        if (!val.canEquip) return false;
      } else if (
        classFilter !== 'all' &&
        classFilter !== 'universal' &&
        item.classRestriction !== classFilter
      ) {
        return false;
      }

      return true;
    });
  }, [slotFilter, classFilter, player.level, player.classId]);

  const filteredSellInventory = useMemo(() => {
    return player.inventory.filter((inst) => {
      const def = getItemDefinition(inst.itemId);
      if (!def) return false;
      if (slotFilter !== 'all' && def.slot !== slotFilter) return false;
      return true;
    });
  }, [player.inventory, slotFilter]);

  const handleBuy = (itemId: string, itemName: string, price: number) => {
    const res = buyItem(itemId);
    if (res.ok) {
      setFeedback(`Purchased ${itemName} for ${price.toLocaleString()} CR. Added to Hangar inventory.`);
    } else if (res.reason) {
      setFeedback(res.reason);
    }
  };

  const handleSell = (instanceId: string, itemName: string) => {
    const res = sellItem(instanceId);
    if (res.ok) {
      setFeedback(`Sold ${itemName} for +${res.creditsEarned.toLocaleString()} CR.`);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-tactical-grid">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-5">
        {/* Header Bar */}
        <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
              Armory Supply Shop
            </h1>
            <p className="text-xs text-slate-400">
              Acquire chassis modules across 6 slots or liquidate surplus gear for{' '}
              {Math.round(SHOP_CONFIG.sellPriceRatio * 100)}% of retail value.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right pr-2">
              <div className="text-[11px] text-slate-400">Available Credits</div>
              <div className="font-mono-nums text-xl font-bold text-amber-400 leading-tight">
                {player.credits.toLocaleString()} CR
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTab('buy');
                  setFeedback(null);
                }}
                className={`h-9 px-4 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'buy'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Buy ({ITEMS_CATALOG.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('sell');
                  setFeedback(null);
                }}
                className={`h-9 px-4 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'sell'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Sell Inventory ({player.inventory.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inline Transaction Feedback */}
        {feedback && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-200">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setScreen('HANGAR')}
              className="font-semibold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap"
            >
              Equip in Hangar →
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 w-16 shrink-0">Slot</span>
            <button
              type="button"
              onClick={() => setSlotFilter('all')}
              className={`h-9 px-3 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                slotFilter === 'all'
                  ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All Slots
            </button>
            {EQUIPMENT_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSlotFilter(slot)}
                className={`h-9 px-3 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  slotFilter === slot
                    ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {EQUIPMENT_SLOT_META[slot].label}
              </button>
            ))}
          </div>

          {tab === 'buy' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 w-16 shrink-0">Class</span>
              {(
                [
                  { id: 'all', label: 'All Classes' },
                  {
                    id: 'usable',
                    label: `Usable Now (${MECH_CLASSES[player.classId].name} Lv.${player.level})`,
                  },
                  { id: 'universal', label: 'Universal' },
                  ...MECH_CLASS_LIST.map((c) => ({
                    id: c.id as ClassFilter,
                    label: `${c.name} Locked`,
                  })),
                ] as Array<{ id: ClassFilter; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setClassFilter(opt.id)}
                  className={`h-9 px-3 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    classFilter === opt.id
                      ? 'bg-slate-800 border-sky-400/80 text-slate-50'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BUY GRID */}
        {tab === 'buy' && (
          <>
            {filteredCatalog.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0D131D]/90 p-10 text-center text-sm text-slate-400">
                No items match the current slot and class filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredCatalog.map((item) => {
                  const validation = validateEquipRequirement(
                    item,
                    player.level,
                    player.classId
                  );
                  const canAfford = player.credits >= item.price;
                  const owned = ownedCountByItemId[item.id] || 0;
                  const bonusList = STAT_KEYS.filter(
                    (k) => (item.statBonuses[k] ?? 0) > 0
                  );

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border bg-[#0D131D]/95 p-4 flex flex-col justify-between gap-3 ${
                        RARITY_META[item.rarity].borderClass
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2
                              className={`font-display text-xl font-bold leading-tight ${
                                RARITY_META[item.rarity].textClass
                              }`}
                            >
                              {item.name}
                            </h2>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {EQUIPMENT_SLOT_META[item.slot].label} ·{' '}
                              {RARITY_META[item.rarity].label} · Lv.
                              <span className="font-mono-nums">
                                {item.requiredLevel}
                              </span>
                              {item.classRestriction
                                ? ` · ${MECH_CLASSES[item.classRestriction].name} Only`
                                : ' · All Classes'}
                            </div>
                          </div>

                          {owned > 0 && (
                            <span className="font-mono-nums text-xs text-slate-400 shrink-0">
                              Owned: {owned}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          {item.description}
                        </p>

                        {/* Stat Bonuses */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-mono-nums text-emerald-400 font-semibold">
                          {bonusList.map((key) => (
                            <span key={key}>
                              +{item.statBonuses[key]} {STAT_META[key].shortLabel}
                            </span>
                          ))}
                        </div>

                        {/* Cannot Equip Warning */}
                        {!validation.canEquip && validation.reason && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Cannot equip now: {validation.reason}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-slate-800/90 flex items-center justify-between gap-3">
                        <div className="font-mono-nums text-base font-bold text-slate-100">
                          {item.price.toLocaleString()}{' '}
                          <span className="text-xs font-normal text-slate-400">
                            CR
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() =>
                            handleBuy(item.id, item.name, item.price)
                          }
                          className="h-10 px-4 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {canAfford ? 'Buy Item' : 'Insufficient CR'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* SELL INVENTORY LIST */}
        {tab === 'sell' && (
          <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4">
            {filteredSellInventory.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                {player.inventory.length === 0
                  ? 'No unequipped items in inventory to sell. Unequip gear in the Hangar first if you wish to sell it.'
                  : 'No inventory items in the selected slot filter.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredSellInventory.map((inst) => {
                  const def = getItemDefinition(inst.itemId);
                  if (!def) return null;
                  const sellPrice = getSellPrice(def);
                  const effStats = getEffectiveItemStats(
                    inst.itemId,
                    inst.enchantLevel
                  );
                  const displayName =
                    inst.enchantLevel > 0
                      ? `${def.name} +${inst.enchantLevel}`
                      : def.name;

                  return (
                    <div
                      key={inst.instanceId}
                      className="py-3 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              RARITY_META[def.rarity].textClass
                            }`}
                          >
                            {displayName}
                          </span>
                          <span className="text-xs text-slate-400">
                            {EQUIPMENT_SLOT_META[def.slot].label} ·{' '}
                            {RARITY_META[def.rarity].label} · Lv.
                            {def.requiredLevel}
                            {def.classRestriction
                              ? ` · ${MECH_CLASSES[def.classRestriction].name} Only`
                              : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs font-mono-nums text-slate-300">
                          {STAT_KEYS.filter((k) => effStats[k] > 0).map((k) => (
                            <span key={k}>
                              +{effStats[k]} {STAT_META[k].shortLabel}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right font-mono-nums">
                          <div className="text-sm font-bold text-amber-400">
                            +{sellPrice.toLocaleString()} CR
                          </div>
                          <div className="text-[11px] text-slate-500">
                            40% of {def.price.toLocaleString()} CR
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSell(inst.instanceId, displayName)}
                          className="h-10 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
