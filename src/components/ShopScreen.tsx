import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  ChevronRight,
  Coins,
  KeyRound,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { MECH_CLASS_LIST, STAT_KEYS } from '../data/classes';
import { EQUIPMENT_SLOTS, RARITY_META, SHOP_CONFIG } from '../data/items';
import { getSkillById, OPENING_CARDS_LIST } from '../data/skills';
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
  getSkillCategoryLabel,
  getSkillDesc,
  getSkillName,
  getSlotLabel,
  getSlotShort,
  getStatShort,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { EquipmentSlot, ItemInstance, MechClassId } from '../types/game';
import { BottomSheet } from './BottomSheet';
import { SkillIcon } from './SkillIcon';

type ClassFilter = 'all' | 'usable' | 'universal' | MechClassId;

type MobileShopSheetState =
  | { kind: 'buy'; item: ItemInstance }
  | { kind: 'sell'; item: ItemInstance }
  | { kind: 'wp'; cardId: string }
  | null;

export function ShopScreen() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const shopStock = useGameStore((s) => s.shopStock);
  const shopSubTab = useGameStore((s) => s.shopSubTab);
  const setShopSubTab = useGameStore((s) => s.setShopSubTab);
  const buyShopItem = useGameStore((s) => s.buyShopItem);
  const refreshShopStock = useGameStore((s) => s.refreshShopStock);
  const sellItem = useGameStore((s) => s.sellItem);
  const buyOpeningCardAction = useGameStore((s) => s.buyOpeningCardAction);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [wpClassFilter, setWpClassFilter] = useState<'all' | MechClassId>('all');
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [noticeAction, setNoticeAction] = useState<'gear' | 'skill'>('gear');
  const [mobileSheet, setMobileSheet] = useState<MobileShopSheetState>(null);

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

  const filteredOpeningCards = useMemo(() => {
    return OPENING_CARDS_LIST.filter((card) => {
      if (wpClassFilter !== 'all' && card.classId !== wpClassFilter) {
        return false;
      }
      return true;
    });
  }, [wpClassFilter]);

  const handleBuy = (item: ItemInstance) => {
    const res = buyShopItem(item.instanceId);
    if (res.ok) {
      setNoticeAction('gear');
      setNoticeText(
        t('shop.boughtMsg', {
          item: getItemInstanceName(lang, item),
          price: item.price.toLocaleString(),
        })
      );
      setMobileSheet(null);
    }
  };

  const handleRefresh = () => {
    const res = refreshShopStock();
    if (res.ok) {
      setNoticeAction('gear');
      setNoticeText(t('shop.refreshedMsg'));
    }
  };

  const handleSell = (inst: ItemInstance) => {
    const name = getItemInstanceName(lang, inst, true);
    const res = sellItem(inst.instanceId);
    if (res.ok) {
      setNoticeAction('gear');
      setNoticeText(
        t('shop.soldMsg', {
          item: name,
          price: res.creditsEarned.toLocaleString(),
        })
      );
      setMobileSheet(null);
    }
  };

  const handleBuyOpeningCard = (cardId: string, skillId: string) => {
    const res = buyOpeningCardAction(cardId);
    if (res.ok) {
      setNoticeAction('skill');
      setNoticeText(
        t('shop.cardBoughtMsg', {
          skill: getSkillName(lang, skillId),
          cost: res.cost,
        })
      );
      setMobileSheet(null);
    }
  };

  const canRefresh = pilot.credits >= SHOP_CONFIG.refreshCost;
  const ownedCardsCount = pilot.ownedOpeningCards.length;

  const activeWpCard =
    mobileSheet?.kind === 'wp'
      ? OPENING_CARDS_LIST.find((c) => c.id === mobileSheet.cardId) ?? null
      : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-3 sm:p-5 space-y-3.5 sm:space-y-4">
        {/* Header Bar */}
        <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
              {t('shop.title')}
            </h1>
            <p className="text-sm md:text-xs text-slate-400">
              {t('shop.subtitle', {
                refreshCost: SHOP_CONFIG.refreshCost,
                ratio: Math.round(SHOP_CONFIG.sellPriceRatio * 100),
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shopSubTab === 'buy' && (
              <button
                type="button"
                disabled={!canRefresh}
                onClick={handleRefresh}
                className="min-h-[44px] md:min-h-0 md:h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg md:rounded border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {t('shop.refreshStock', { cost: SHOP_CONFIG.refreshCost })}
                </span>
              </button>
            )}

            <div className="w-full md:w-auto grid grid-cols-3 md:flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShopSubTab('buy');
                  setNoticeText(null);
                }}
                className={`min-h-[44px] md:min-h-0 md:h-9 px-2.5 md:px-3 inline-flex items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  shopSubTab === 'buy'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {t('shop.tabBuy', { count: shopStock.length })}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShopSubTab('sell');
                  setNoticeText(null);
                }}
                className={`min-h-[44px] md:min-h-0 md:h-9 px-2.5 md:px-3 inline-flex items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  shopSubTab === 'sell'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <Coins className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {t('shop.tabSell', { count: unequippedInventory.length })}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShopSubTab('warpoints');
                  setNoticeText(null);
                }}
                className={`min-h-[44px] md:min-h-0 md:h-9 px-2.5 md:px-3 inline-flex items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  shopSubTab === 'warpoints'
                    ? 'bg-purple-500 text-white'
                    : 'text-purple-300 hover:text-purple-100'
                }`}
              >
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">WP ({ownedCardsCount})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inline Feedback */}
        {noticeText && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm md:text-xs text-emerald-200">
            <span>{noticeText}</span>
            <button
              type="button"
              onClick={() =>
                setActiveTab(noticeAction === 'skill' ? 'skill' : 'gear')
              }
              className="min-h-[36px] font-semibold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap"
            >
              {noticeAction === 'skill'
                ? t('shop.goToSkillTab')
                : t('shop.equipInHangar')}
            </button>
          </div>
        )}

        {/* Filters for Buy / Sell (Horizontal scroll chips on phone) */}
        {shopSubTab !== 'warpoints' && (
          <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 tactical-scroll">
              <button
                type="button"
                onClick={() => setSlotFilter('all')}
                className={`min-h-[44px] md:min-h-0 md:h-9 px-3 rounded-lg md:rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                  className={`min-h-[44px] md:min-h-0 md:h-9 px-3 rounded-lg md:rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    slotFilter === slot
                      ? 'bg-slate-800 border-amber-400/80 text-slate-50'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="md:hidden">{getSlotShort(lang, slot)}</span>
                  <span className="hidden md:inline">
                    {getSlotLabel(lang, slot)}
                  </span>
                </button>
              ))}
            </div>

            {shopSubTab === 'buy' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-800/80 pb-1 tactical-scroll">
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
                    className={`min-h-[44px] md:min-h-0 md:h-9 px-3 rounded-lg md:rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
        )}

        {/* WAR POINT SHOP: OPENING CARDS */}
        {shopSubTab === 'warpoints' && (
          <div className="space-y-3.5">
            <div className="rounded-lg border border-purple-500/40 bg-[#100D1E]/95 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2 text-purple-300 font-display text-lg font-bold">
                  <KeyRound className="w-5 h-5" />
                  <span>
                    {t('shop.tabWarPoints', {
                      owned: ownedCardsCount,
                      total: OPENING_CARDS_LIST.length,
                    })}
                  </span>
                </div>
                <p className="text-sm md:text-xs text-slate-300 leading-relaxed">
                  {t('shop.wpIntro')}
                </p>
              </div>

              <div className="rounded-md border border-purple-500/40 bg-[#080B14] px-3.5 py-2 text-right font-mono-nums">
                <div className="text-[11px] text-slate-400">
                  {t('shop.availableWp')}
                </div>
                <div className="text-lg sm:text-xl font-bold text-purple-300 flex items-center gap-1.5">
                  <Award className="w-5 h-5 text-purple-400" />
                  <span>{(pilot.warPoints ?? 0).toLocaleString()} WP</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 tactical-scroll">
              <button
                type="button"
                onClick={() => setWpClassFilter('all')}
                className={`min-h-[44px] md:min-h-0 md:h-9 px-3 rounded-lg md:rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  wpClassFilter === 'all'
                    ? 'bg-slate-800 border-purple-400/80 text-slate-50'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('common.allClasses')}
              </button>
              {MECH_CLASS_LIST.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setWpClassFilter(cls.id)}
                  className={`min-h-[44px] md:min-h-0 md:h-9 px-3 rounded-lg md:rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    wpClassFilter === cls.id
                      ? 'bg-slate-800 border-purple-400/80 text-slate-50'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {getClassName(lang, cls.id)}
                </button>
              ))}
            </div>

            {/* Mobile List Rows (< md) */}
            <div className="md:hidden divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#0D131D]/95 overflow-hidden">
              {filteredOpeningCards.map((card) => {
                const skill = getSkillById(card.skillId);
                if (!skill) return null;
                const isOwned = pilot.ownedOpeningCards.includes(card.id);
                const isElite = card.category === 'elite';
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setMobileSheet({ kind: 'wp', cardId: card.id })}
                    className="w-full min-h-[64px] px-3.5 py-3 flex items-center justify-between gap-3 text-left active:bg-slate-800/70 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                          isElite
                            ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                            : 'border-purple-400/60 bg-purple-500/15 text-purple-300'
                        }`}
                      >
                        <SkillIcon icon={skill.icon} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-100 truncate">
                          {getSkillName(lang, skill.id)}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {getClassName(lang, card.classId)} ·{' '}
                          {getSkillCategoryLabel(lang, card.category)} · Lv.
                          {skill.unlockLevel}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOwned ? (
                        <span className="text-xs font-bold text-emerald-400">
                          {t('common.owned')}
                        </span>
                      ) : (
                        <span className="font-mono-nums text-sm font-bold text-purple-300">
                          {card.warPointCost} WP
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop Opening Cards Grid (>= md) */}
            <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredOpeningCards.map((card) => {
                const skill = getSkillById(card.skillId);
                if (!skill) return null;
                const isOwned = pilot.ownedOpeningCards.includes(card.id);
                const canAfford = (pilot.warPoints ?? 0) >= card.warPointCost;
                const isElite = card.category === 'elite';

                return (
                  <div
                    key={card.id}
                    className={`rounded-lg border p-4 flex flex-col justify-between gap-3 bg-[#0D131D]/95 ${
                      isOwned
                        ? 'border-emerald-500/50'
                        : isElite
                        ? 'border-amber-400/70'
                        : 'border-purple-400/60'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 ${
                              isElite
                                ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                                : 'border-purple-400/60 bg-purple-500/15 text-purple-300'
                            }`}
                          >
                            <SkillIcon icon={skill.icon} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold border ${
                                  isElite
                                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-300'
                                    : 'border-purple-400/70 bg-purple-500/15 text-purple-300'
                                }`}
                              >
                                {getSkillCategoryLabel(lang, card.category)}
                              </span>
                              <span className="text-slate-400">
                                {getClassName(lang, card.classId)} ·{' '}
                                {t('common.reqLevel', {
                                  level: skill.unlockLevel,
                                })}
                              </span>
                            </div>
                            <h3 className="font-display text-lg font-bold text-slate-100 leading-tight mt-0.5">
                              {t('shop.openingCardTitle', {
                                skill: getSkillName(lang, skill.id),
                              })}
                            </h3>
                          </div>
                        </div>

                        <span className="font-mono-nums text-xs font-bold text-amber-400 shrink-0">
                          {skill.spCost} SP
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {getSkillDesc(lang, skill.id)}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-3">
                      <div className="font-mono-nums text-sm font-bold text-purple-300 flex items-center gap-1">
                        <Award className="w-4 h-4 text-purple-400" />
                        <span>{card.warPointCost} WP</span>
                      </div>

                      {isOwned ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab('skill')}
                          className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('shop.cardOwnedBadge')}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() =>
                            handleBuyOpeningCard(card.id, skill.id)
                          }
                          className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>
                            {canAfford
                              ? t('shop.buyCardBtn', {
                                  cost: card.warPointCost,
                                })
                              : t('shop.insufficientWp', {
                                  cost: card.warPointCost,
                                })}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BUY RANDOMIZED STOCK */}
        {shopSubTab === 'buy' && (
          <>
            {filteredStock.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#0D131D]/90 p-10 text-center text-sm text-slate-400">
                {t('shop.noMatch')}
              </div>
            ) : (
              <>
                {/* Mobile Compact List Rows (< md) -> Buy in BottomSheet */}
                <div className="md:hidden divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#0D131D]/95 overflow-hidden">
                  {filteredStock.map((item) => {
                    const validation = validateEquipOnGear(
                      item,
                      activeGear,
                      pilot.gears
                    );
                    const itemStats = getEffectiveItemStats(item);
                    const statPreview = STAT_KEYS.filter((k) => itemStats[k] > 0)
                      .slice(0, 3)
                      .map((k) => `+${itemStats[k]} ${getStatShort(lang, k)}`)
                      .join(' · ');

                    return (
                      <button
                        key={item.instanceId}
                        type="button"
                        onClick={() => setMobileSheet({ kind: 'buy', item })}
                        className="w-full min-h-[68px] px-3.5 py-3 flex items-center justify-between gap-3 text-left active:bg-slate-800/70 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm font-bold truncate ${
                                RARITY_META[item.rarity].textClass
                              }`}
                            >
                              {getItemInstanceName(lang, item)}
                            </span>
                            {!validation.canEquip && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {getSlotShort(lang, item.slot)} · T{item.tier} · Lv.
                            {item.requiredLevel} · {item.rollQuality}%
                          </div>
                          {statPreview && (
                            <div className="text-xs font-mono-nums text-emerald-400 truncate">
                              {statPreview}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right font-mono-nums">
                            <div
                              className={`text-sm font-bold ${
                                pilot.credits >= item.price
                                  ? 'text-amber-300'
                                  : 'text-red-400'
                              }`}
                            >
                              {item.price.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500">CR</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop Multi-Column Card Grid (>= md) */}
                <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {filteredStock.map((item) => {
                    const validation = validateEquipOnGear(
                      item,
                      activeGear,
                      pilot.gears
                    );
                    const reasonText = formatEquipValidationReason(
                      lang,
                      validation
                    );
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

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-nums text-emerald-400 font-semibold">
                            {STAT_KEYS.filter((k) => itemStats[k] > 0).map(
                              (key) => (
                                <span key={key}>
                                  +{itemStats[key]} {getStatShort(lang, key)}
                                </span>
                              )
                            )}
                          </div>

                          {traits.length > 0 && (
                            <div className="flex flex-wrap gap-x-2.5 text-[11px] text-amber-300">
                              {traits.map((tr, i) => (
                                <span key={i}>{tr}</span>
                              ))}
                            </div>
                          )}

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
                                {t('shop.cannotEquipNow', {
                                  reason: reasonText,
                                })}
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
                            {canAfford
                              ? t('shop.buyBtn')
                              : t('shop.insufficientCr')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* SELL UNEQUIPPED CARGO */}
        {shopSubTab === 'sell' && (
          <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 overflow-hidden md:p-4">
            {filteredSellInventory.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-slate-400">
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
                      className="px-3.5 py-3 md:px-0 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setMobileSheet({ kind: 'sell', item: inst })
                        }
                        className="min-w-0 flex-1 space-y-1 text-left cursor-pointer md:cursor-default"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              RARITY_META[inst.rarity].textClass
                            }`}
                          >
                            {getItemInstanceName(lang, inst, true)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {getSlotShort(lang, inst.slot)} · T{inst.tier} ·{' '}
                            {inst.rollQuality}%
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs font-mono-nums text-slate-300">
                          {STAT_KEYS.filter((k) => effStats[k] > 0).map((k) => (
                            <span key={k}>
                              +{effStats[k]} {getStatShort(lang, k)}
                            </span>
                          ))}
                        </div>
                      </button>

                      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
                        <div className="text-right font-mono-nums">
                          <div className="text-sm font-bold text-amber-400">
                            +{sellPrice.toLocaleString()} CR
                          </div>
                          <div className="hidden sm:block text-[11px] text-slate-500">
                            {t('shop.sellRatioNote', {
                              price: inst.price.toLocaleString(),
                            })}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSell(inst)}
                          className="min-h-[44px] md:min-h-0 md:h-10 px-4 rounded-lg md:rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
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

      {/* Mobile Bottom Sheet for Shop Buy / Sell / WP Card */}
      <div className="md:hidden">
        <BottomSheet
          open={Boolean(mobileSheet)}
          onClose={() => setMobileSheet(null)}
          title={
            mobileSheet?.kind === 'buy' || mobileSheet?.kind === 'sell'
              ? getItemInstanceName(lang, mobileSheet.item, true)
              : activeWpCard
              ? getSkillName(lang, activeWpCard.skillId)
              : ''
          }
          subtitle={
            mobileSheet?.kind === 'buy' || mobileSheet?.kind === 'sell'
              ? `${getSlotLabel(lang, mobileSheet.item.slot)} · ${getRarityLabel(
                  lang,
                  mobileSheet.item.rarity
                )} · ${t('common.tier', { tier: mobileSheet.item.tier })}`
              : activeWpCard
              ? `${getClassName(lang, activeWpCard.classId)} · ${getSkillCategoryLabel(
                  lang,
                  activeWpCard.category
                )}`
              : undefined
          }
        >
          {mobileSheet?.kind === 'buy' && (() => {
            const item = mobileSheet.item;
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
              <div className="space-y-3.5">
                <p className="text-sm text-slate-300 leading-relaxed">
                  {getItemInstanceDesc(lang, item)}
                </p>

                <div className="rounded-lg border border-slate-800 bg-[#080C14] p-3 space-y-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono-nums text-emerald-400 font-semibold">
                    {STAT_KEYS.filter((k) => itemStats[k] > 0).map((key) => (
                      <span key={key}>
                        +{itemStats[key]} {getStatShort(lang, key)}
                      </span>
                    ))}
                  </div>
                  {traits.length > 0 && (
                    <div className="flex flex-wrap gap-x-2.5 text-xs text-amber-300 pt-1.5 border-t border-slate-800">
                      {traits.map((tr, i) => (
                        <span key={i}>{tr}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#080C14] p-3 text-xs space-y-1">
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
                    <div className="flex flex-wrap gap-x-3 font-mono-nums text-sm">
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
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {t('shop.cannotEquipNow', { reason: reasonText })}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => handleBuy(item)}
                  className="w-full min-h-[48px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold text-sm cursor-pointer"
                >
                  {canAfford
                    ? `${t('shop.buyBtn')} (${item.price.toLocaleString()} CR)`
                    : `${t('shop.insufficientCr')} (${item.price.toLocaleString()} CR)`}
                </button>
              </div>
            );
          })()}

          {mobileSheet?.kind === 'sell' && (() => {
            const inst = mobileSheet.item;
            const sellPrice = getSellPrice(inst);
            const effStats = getEffectiveItemStats(inst);
            return (
              <div className="space-y-4">
                <p className="text-sm text-slate-300">
                  {getItemInstanceDesc(lang, inst)}
                </p>
                <div className="rounded-lg border border-slate-800 bg-[#080C14] p-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono-nums text-slate-100">
                  {STAT_KEYS.filter((k) => effStats[k] > 0).map((k) => (
                    <span key={k}>
                      +{effStats[k]} {getStatShort(lang, k)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleSell(inst)}
                  className="w-full min-h-[48px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
                >
                  {t('shop.sellBtn')} (+{sellPrice.toLocaleString()} CR)
                </button>
              </div>
            );
          })()}

          {mobileSheet?.kind === 'wp' && activeWpCard && (() => {
            const skill = getSkillById(activeWpCard.skillId);
            if (!skill) return null;
            const isOwned = pilot.ownedOpeningCards.includes(activeWpCard.id);
            const canAfford = (pilot.warPoints ?? 0) >= activeWpCard.warPointCost;
            return (
              <div className="space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  {getSkillDesc(lang, skill.id)}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono-nums">
                  <span>
                    {t('common.reqLevel', { level: skill.unlockLevel })}
                  </span>
                  <span className="text-amber-400 font-bold">
                    {skill.spCost} SP
                  </span>
                </div>
                {isOwned ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheet(null);
                      setActiveTab('skill');
                    }}
                    className="w-full min-h-[48px] px-4 rounded-lg border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 font-bold text-sm cursor-pointer"
                  >
                    {t('shop.goToSkillTab')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() =>
                      handleBuyOpeningCard(activeWpCard.id, skill.id)
                    }
                    className="w-full min-h-[48px] px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-sm cursor-pointer"
                  >
                    {canAfford
                      ? t('shop.buyCardBtn', {
                          cost: activeWpCard.warPointCost,
                        })
                      : t('shop.insufficientWp', {
                          cost: activeWpCard.warPointCost,
                        })}
                  </button>
                )}
              </div>
            );
          })()}
        </BottomSheet>
      </div>
    </div>
  );
}
