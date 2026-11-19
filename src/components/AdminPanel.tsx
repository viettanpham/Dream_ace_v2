import { useState } from 'react';
import { ShieldAlert, Terminal, X } from 'lucide-react';
import { EQUIPMENT_SLOTS, RARITY_LIST } from '../data/items';
import { getClassName, getRarityLabel, getSlotLabel, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { EquipmentSlot, ItemRarity } from '../types/game';

export function AdminPanel() {
  const { lang, t } = useI18n();
  const open = useGameStore((s) => s.adminPanelOpen);
  const setOpen = useGameStore((s) => s.setAdminPanelOpen);
  const pilot = useGameStore((s) => s.pilot);
  const screen = useGameStore((s) => s.screen);
  const battle = useGameStore((s) => s.battle);
  const adminConfig = useGameStore((s) => s.adminConfig);

  const adminSetGearLevel = useGameStore((s) => s.adminSetGearLevel);
  const adminAddGearExp = useGameStore((s) => s.adminAddGearExp);
  const adminSetGearUnspentPoints = useGameStore(
    (s) => s.adminSetGearUnspentPoints
  );
  const adminAddGearUnspentPoints = useGameStore(
    (s) => s.adminAddGearUnspentPoints
  );
  const adminResetGearAllocation = useGameStore(
    (s) => s.adminResetGearAllocation
  );
  const adminSetCredits = useGameStore((s) => s.adminSetCredits);
  const adminAddCredits = useGameStore((s) => s.adminAddCredits);
  const adminSetWarPoints = useGameStore((s) => s.adminSetWarPoints);
  const adminAddWarPoints = useGameStore((s) => s.adminAddWarPoints);
  const adminGenerateItems = useGameStore((s) => s.adminGenerateItems);
  const adminUnlockAllGears = useGameStore((s) => s.adminUnlockAllGears);
  const adminUnlockAllSectors = useGameStore((s) => s.adminUnlockAllSectors);
  const adminUpdateConfig = useGameStore((s) => s.adminUpdateConfig);
  const forceWinBattle = useGameStore((s) => s.forceWinBattle);
  const resetCampaign = useGameStore((s) => s.resetCampaign);

  const activeGear = pilot.gears[pilot.activeGearId];

  const [levelInput, setLevelInput] = useState(String(activeGear.level));
  const [expInput, setExpInput] = useState('500');
  const [ptsInput, setPtsInput] = useState('10');
  const [creditsInput, setCreditsInput] = useState('5000');
  const [wpInput, setWpInput] = useState('200');
  const [genSlot, setGenSlot] = useState<EquipmentSlot>('main_weapon');
  const [genTier, setGenTier] = useState<number>(2);
  const [genRarity, setGenRarity] = useState<ItemRarity>('epic');
  const [genQty, setGenQty] = useState<number>(3);
  const [confirmReset, setConfirmReset] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!open) return null;

  const flash = (msg: string) => {
    setStatusMsg(msg);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Admin Control Panel"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto tactical-scroll rounded-lg border border-amber-500/60 bg-[#0B111C] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-3.5 border-b border-slate-800 bg-[#090E17] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-xl font-bold text-slate-100 leading-none">
                {t('admin.title')}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('admin.subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-9 w-9 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {statusMsg && (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-300 font-mono-nums">
              {statusMsg}
            </div>
          )}

          {/* 1. SELECTED GEAR CONTROLS */}
          <section className="rounded border border-slate-800 bg-[#080C14] p-4 space-y-3">
            <h3 className="font-display text-base font-bold text-amber-400">
              {t('admin.gearSection', {
                gear: getClassName(lang, activeGear.classId),
                level: activeGear.level,
              })}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Set Level */}
              <div className="space-y-1.5">
                <label className="block text-slate-400">Set Level (1–50)</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={levelInput}
                    onChange={(e) => setLevelInput(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const lv = Number(levelInput) || 1;
                      adminSetGearLevel(lv);
                      flash(`Set ${activeGear.classId} to Lv.${lv}`);
                    }}
                    className="h-9 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Add EXP */}
              <div className="space-y-1.5">
                <label className="block text-slate-400">Add EXP</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={expInput}
                    onChange={(e) => setExpInput(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const amt = Number(expInput) || 0;
                      adminAddGearExp(amt);
                      flash(`Added +${amt} EXP to ${activeGear.classId}`);
                    }}
                    className="h-9 px-3 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                  >
                    +EXP
                  </button>
                </div>
              </div>

              {/* Add / Set Stat Points */}
              <div className="space-y-1.5">
                <label className="block text-slate-400">
                  Stat Points (Cur: {activeGear.unspentPoints})
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={ptsInput}
                    onChange={(e) => setPtsInput(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(ptsInput) || 0;
                      adminAddGearUnspentPoints(v);
                      flash(`Added +${v} stat pts`);
                    }}
                    className="h-9 px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                  >
                    +Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(ptsInput) || 0;
                      adminSetGearUnspentPoints(v);
                      flash(`Set stat pts to ${v}`);
                    }}
                    className="h-9 px-2.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  adminResetGearAllocation();
                  flash(`Reset stat allocation for ${activeGear.classId}`);
                }}
                className="h-8 px-3 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
              >
                Reset Allocation ({activeGear.classId})
              </button>
            </div>
          </section>

          {/* 2. GLOBAL PILOT & CAMPAIGN CONTROLS */}
          <section className="rounded border border-slate-800 bg-[#080C14] p-4 space-y-3">
            <h3 className="font-display text-base font-bold text-sky-400">
              {t('admin.globalSection')}
            </h3>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label className="block text-slate-400">
                  Credits (Cur: {pilot.credits.toLocaleString()})
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={creditsInput}
                    onChange={(e) => setCreditsInput(e.target.value)}
                    className="w-32 h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(creditsInput) || 0;
                      adminAddCredits(v);
                      flash(`Added +${v.toLocaleString()} CR`);
                    }}
                    className="h-9 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer"
                  >
                    +Add CR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(creditsInput) || 0;
                      adminSetCredits(v);
                      flash(`Set Credits to ${v.toLocaleString()} CR`);
                    }}
                    className="h-9 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold cursor-pointer"
                  >
                    Set CR
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400">
                  War Points (Cur: {(pilot.warPoints ?? 0).toLocaleString()} WP)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={wpInput}
                    onChange={(e) => setWpInput(e.target.value)}
                    className="w-28 h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(wpInput) || 0;
                      adminAddWarPoints(v);
                      flash(`Added +${v.toLocaleString()} WP`);
                    }}
                    className="h-9 px-3 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold cursor-pointer"
                  >
                    +Add WP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const v = Number(wpInput) || 0;
                      adminSetWarPoints(v);
                      flash(`Set War Points to ${v.toLocaleString()} WP`);
                    }}
                    className="h-9 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold cursor-pointer"
                  >
                    Set WP
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  adminUnlockAllGears();
                  flash('Unlocked all 4 Gears!');
                }}
                className="h-9 px-3.5 rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-semibold cursor-pointer"
              >
                Unlock All 4 Gears
              </button>

              <button
                type="button"
                onClick={() => {
                  adminUnlockAllSectors();
                  flash('Unlocked all campaign sectors!');
                }}
                className="h-9 px-3.5 rounded border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 font-semibold cursor-pointer"
              >
                Unlock All Sectors
              </button>
            </div>
          </section>

          {/* 3. ITEM GENERATOR */}
          <section className="rounded border border-slate-800 bg-[#080C14] p-4 space-y-3">
            <h3 className="font-display text-base font-bold text-purple-400">
              {t('admin.itemGenSection')}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end">
              <div>
                <label className="block text-slate-400 mb-1">Slot</label>
                <select
                  value={genSlot}
                  onChange={(e) => setGenSlot(e.target.value as EquipmentSlot)}
                  className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 text-slate-100"
                >
                  {EQUIPMENT_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {getSlotLabel(lang, s)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Tier (1–4)</label>
                <select
                  value={genTier}
                  onChange={(e) => setGenTier(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                >
                  {[1, 2, 3, 4].map((tr) => (
                    <option key={tr} value={tr}>
                      Tier {tr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Rarity</label>
                <select
                  value={genRarity}
                  onChange={(e) => setGenRarity(e.target.value as ItemRarity)}
                  className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 text-slate-100"
                >
                  {RARITY_LIST.map((r) => (
                    <option key={r} value={r}>
                      {getRarityLabel(lang, r)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Qty (1–20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={genQty}
                  onChange={(e) => setGenQty(Number(e.target.value) || 1)}
                  className="w-full h-9 px-2 rounded border border-slate-700 bg-slate-950 font-mono-nums text-slate-100"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const n = adminGenerateItems(
                    genSlot,
                    genTier,
                    genRarity,
                    genQty
                  );
                  flash(
                    `Generated ${n}x Tier ${genTier} ${genRarity} ${genSlot} into Cargo`
                  );
                }}
                className="h-9 px-3 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold cursor-pointer"
              >
                Generate
              </button>
            </div>
          </section>

          {/* 4. COMBAT & REWARD TOGGLES */}
          <section className="rounded border border-slate-800 bg-[#080C14] p-4 space-y-3">
            <h3 className="font-display text-base font-bold text-emerald-400">
              {t('admin.togglesSection')}
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adminConfig.godMode}
                  onChange={(e) =>
                    adminUpdateConfig({ godMode: e.target.checked })
                  }
                />
                <span className="text-slate-100 font-medium">God Mode</span>
              </label>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adminConfig.oneHitKills}
                  onChange={(e) =>
                    adminUpdateConfig({ oneHitKills: e.target.checked })
                  }
                />
                <span className="text-slate-100 font-medium">One-Hit Kills</span>
              </label>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adminConfig.alwaysWin}
                  onChange={(e) =>
                    adminUpdateConfig({ alwaysWin: e.target.checked })
                  }
                />
                <span className="text-slate-100 font-medium">Always Win</span>
              </label>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-700 bg-slate-900">
                <span className="text-slate-400">REWARD_MULT:</span>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={20}
                  value={adminConfig.rewardMultiplier}
                  onChange={(e) =>
                    adminUpdateConfig({
                      rewardMultiplier: Math.max(
                        0.1,
                        Number(e.target.value) || 2.0
                      ),
                    })
                  }
                  className="w-16 h-7 px-1.5 rounded border border-slate-700 bg-slate-950 font-mono-nums text-amber-300"
                />
                <span className="text-slate-500">x</span>
              </div>

              {screen === 'BATTLE' && battle && !battle.summary && (
                <button
                  type="button"
                  onClick={() => {
                    forceWinBattle();
                    setOpen(false);
                  }}
                  className="h-9 px-3.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                >
                  Instant Win Current Battle
                </button>
              )}
            </div>
          </section>

          {/* 5. DANGER ZONE: RESET SAVE */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-semibold cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{t('admin.resetSave')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-300">{t('title.erasePrompt')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    resetCampaign();
                    setOpen(false);
                  }}
                  className="h-9 px-3.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold cursor-pointer"
                >
                  {t('admin.confirmResetSave')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="h-9 px-3 rounded border border-slate-700 text-slate-300 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
