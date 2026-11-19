import { useMemo, useState } from 'react';
import { AlertTriangle, Coins, RefreshCw, ShoppingBag } from 'lucide-react';
import { MECH_CLASS_LIST, STAT_KEYS } from '../data/classes';
import { EQUIPMENT_SLOTS, RARITY_META, SHOP_CONFIG } from '../data/items';
import {
  getEffectiveItemStats,
  getGearEquippedInstances,
  getItemEquippedByGear,
  getSellPrice,
  validateEquipOnGear,
} from '../engine/equipment';
import {
  formatEquipValidationReason,
  formatItemTraitsList,
  getClassName,
  getItemInstanceDesc,
  getItemInstanceName,
  getRarityLabel,
  getSlotLabel,
  getStatShort,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { EquipmentSlot, ItemInstance, MechClassId } from '../types/game';

type ShopTab = 'buy' | 'sell';
type ClassFilter = 'all' | 'usable' | 'universal' | MechClassId;

export function ShopScreen() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const shopStock = useGameStore((s) => s.shopStock);
  const buyShopItem = useGameStore((s) => s.buyShopItem);
  const refreshShopStock = useGameStore((s) => s.refreshShopStock);
  const sellItem = useGameStore((s) => s.sellItem);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [tab, setTab] = useState<ShopTab>('buy');
  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const activeGear = pilot.gears[pilot.activeGearId];
  const equippedOnActive = useMemo(
    () => getGearEquippedInstances(activeGear, pilot.inventory),
    [activeGear, pilot.inventory]
  );

  const filteredStock = useMemo(() => {
    return shopStock.filter((item) => {
      if (slotFilter !== 'all' && item.slot !== slotFilter) return false;
      if (classFilter === 'universal' && item.classRestriction !== null) {
        return false;
      }
      if (classFilter === 'usable') {
        const val = validateEquipOnGear(item, activeGear, pilot.gears);
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
  }, [shopStock, slotFilter, classFilter, activeGear, pilot.gears]);

  // Only unequipped cargo items can be sold
  const unequippedInventory = useMemo(
    () =>
      pilot.inventory.filter(
        (inst) => getItemEquippedByGear(pilot.gears, inst.instanceId) === null
      ),
    [pilot.inventory, pilot.gears]
  );

  const filteredSellInventory = useMemo(() => {
    return unequippedInventory.filter((inst) => {
      if (slotFilter !== 'all' && inst.slot !== slotFilter) return false;
      return true;
    });
  }, [unequippedInventory, slotFilter]);

  const handleBuy = (item: ItemInstance) => {
    const res = buyShopItem(item.instanceId);
    if (res.ok) {
      setNoticeText(
        t('shop.boughtMsg', {
          item: getItemInstanceName(lang, item),
          price: item.price.toLocaleString(),
        })
      );
    }
  };

  const handleRefresh = () => {
    const res = refreshShopStock();
    if (res.ok) {
      setNoticeText(t('shop.refreshedMsg'));
    }
  };

  const handleSell = (inst: ItemInstance) => {
    const name = getItemInstanceName(lang, inst, true);
    const res = sellItem(inst.instanceId);
    if (res.ok) {
      setNoticeText(
        t('shop.soldMsg', {
          item: name,
          price: res.creditsEarned.toLocaleString(),
        })
      );
    }
  };

  const canRefresh = pilot.credits >= SHOP_CONFIG.refreshCost;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-5 space-y-4">
        {/* Header Bar */}
        <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
              {t('shop.title')}
            </h1>
            <p className="text-xs text-slate-400">
              {t('shop.subtitle', {
                refreshCost: SHOP_CONFIG.refreshCost,
                ratio: Math.round(SHOP_CONFIG.sellPriceRatio * 100),
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canRefresh}
              onClick={handleRefresh}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {t('shop.refreshStock', { cost: SHOP_CONFIG.refreshCost })}
              </span>
            </button>

            <div className="flex items-center gap-1 p-1 rounded bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTab('buy');
                  setNoticeText(null);
                }}
                className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'buy'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{t('shop.tabBuy', { count: shopStock.length })}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('sell');
                  setNoticeText(null);
                }}
                className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'sell'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>
                  {t('shop.tabSell', { count: unequippedInventory.length })}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Inline Feedback */}
        {noticeText && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-200">
            <span>{noticeText}</span>
            <button
              type="button"
              onClick={() => setActiveTab('gear')}
              className="font-semibold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap"
            >
              {t('shop.equipInHangar')}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 w-16 shrink-0">
              {t('shop.filterSlot')}
            </span>
            <button
              type="button"
              onClick={() => setSlotFilter('all')}
              className={`h-9 px-3 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                slotFilter === 'all'
                  ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('shop.allSlots')}
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
                {getSlotLabel(lang, slot)}
              </button>
            ))}
          </div>

          {tab === 'buy' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 w-16 shrink-0">
                {t('shop.filterClass')}
              </span>
              {(
                [
                  { id: 'all', label: t('common.allClasses') },
                  {
                    id: 'usable',
                    label: t('shop.usableNow', {
                      className: getClassName(lang, activeGear.classId),
                      level: activeGear.level,
                    }),
                  },
                  { id: 'universal', label: t('shop.universal') },
                  ...MECH_CLASS_LIST.map((c) => ({
                    id: c.id as ClassFilter,
                    label: t('shop.classLockedFilter', {
                      className: getClassName(lang, c.id),
                    }),
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

        {/* BUY RANDOMIZED STOCK GRID */}
        {tab === 'buy' && (
          <>
            {filteredStock.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0D131D]/90 p-10 text-center text-sm text-slate-400">
                {t('shop.noMatch')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredStock.map((item) => {
                  const validation = validateEquipOnGear(
                    item,
                    activeGear,
                    pilot.gears
                  );
                  const reasonText = formatEquipValidationReason(lang, validation);
                  const canAfford = pilot.credits >= item.price;
                  const itemStats = getEffectiveItemStats(item);
                  const currentInSlot = equippedOnActive[item.slot];
                  const curSlotStats = currentInSlot
                    ? getEffectiveItemStats(currentInSlot)
                    : null;
                  const traits = formatItemTraitsList(lang, item);

                  return (
                    <div
                      key={item.instanceId}
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
                              {getItemInstanceName(lang, item)}
                            </h2>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {getSlotLabel(lang, item.slot)} ·{' '}
                              {getRarityLabel(lang, item.rarity)} ·{' '}
                              {t('common.tier', { tier: item.tier })} ·{' '}
                              {t('common.levelShort')}
                              {item.requiredLevel}
                              {' · '}
                              {item.classRestriction
                                ? t('common.classOnly', {
                                    className: getClassName(
                                      lang,
                                      item.classRestriction
                                    ),
                                  })
                                : t('common.allClasses')}
                            </div>
                          </div>

                          <span
                            className={`font-mono-nums text-xs font-bold shrink-0 ${
                              item.rollQuality >= 80
                                ? 'text-amber-400'
                                : item.rollQuality >= 50
                                ? 'text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {item.rollQuality}%
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          {getItemInstanceDesc(lang, item)}
                        </p>

                        {/* Rolled Stats */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-nums text-emerald-400 font-semibold">
                          {STAT_KEYS.filter((k) => itemStats[k] > 0).map((key) => (
                            <span key={key}>
                              +{itemStats[key]} {getStatShort(lang, key)}
                            </span>
                          ))}
                        </div>

                        {/* Traits */}
                        {traits.length > 0 && (
                          <div className="flex flex-wrap gap-x-2.5 text-[11px] text-amber-300">
                            {traits.map((tr, i) => (
                              <span key={i}>{tr}</span>
                            ))}
                          </div>
                        )}

                        {/* Inline Comparison vs Active Gear Equipped Item */}
                        <div className="rounded border border-slate-800/90 bg-[#080C14] px-2.5 py-1.5 text-[11px] space-y-0.5">
                          <div className="text-slate-400">
                            {t('shop.compareVs', {
                              gear: getClassName(lang, activeGear.classId),
                            })}
                          </div>
                          {!curSlotStats ? (
                            <div className="text-emerald-400 font-medium">
                              {t('shop.emptySlotGain')}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-x-2.5 font-mono-nums">
                              {STAT_KEYS.map((k) => {
                                const diff = itemStats[k] - curSlotStats[k];
                                if (diff === 0) return null;
                                return (
                                  <span
                                    key={k}
                                    className={
                                      diff > 0
                                        ? 'text-emerald-400 font-semibold'
                                        : 'text-red-400 font-semibold'
                                    }
                                  >
                                    {getStatShort(lang, k)}{' '}
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {!validation.canEquip && reasonText && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {t('shop.cannotEquipNow', { reason: reasonText })}
                            </span>
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
                          onClick={() => handleBuy(item)}
                          className="h-10 px-4 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {canAfford ? t('shop.buyBtn') : t('shop.insufficientCr')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* SELL UNEQUIPPED CARGO */}
        {tab === 'sell' && (
          <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4">
            {filteredSellInventory.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                {unequippedInventory.length === 0
                  ? t('shop.sellEmpty')
                  : t('shop.sellEmptyFilter')}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredSellInventory.map((inst) => {
                  const sellPrice = getSellPrice(inst);
                  const effStats = getEffectiveItemStats(inst);

                  return (
                    <div
                      key={inst.instanceId}
                      className="py-3 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              RARITY_META[inst.rarity].textClass
                            }`}
                          >
                            {getItemInstanceName(lang, inst, true)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {getSlotLabel(lang, inst.slot)} ·{' '}
                            {getRarityLabel(lang, inst.rarity)} ·{' '}
                            {t('common.tier', { tier: inst.tier })} ·{' '}
                            {t('common.quality', { pct: inst.rollQuality })}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs font-mono-nums text-slate-300">
                          {STAT_KEYS.filter((k) => effStats[k] > 0).map((k) => (
                            <span key={k}>
                              +{effStats[k]} {getStatShort(lang, k)}
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
                            {t('shop.sellRatioNote', {
                              price: inst.price.toLocaleString(),
                            })}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSell(inst)}
                          className="h-10 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {t('shop.sellBtn')}
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
