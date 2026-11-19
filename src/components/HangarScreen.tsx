import { useMemo, useState } from 'react';
import {
  Info,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Swords,
  Wrench,
  X,
} from 'lucide-react';
import {
  EMPTY_STAT_BLOCK,
  MECH_CLASSES,
  MECH_CLASS_LIST,
  STAT_KEYS,
  STAT_META,
} from '../data/classes';
import { EQUIPMENT_SLOTS } from '../data/items';
import { SECTORS_CATALOG } from '../data/maps';
import { PROGRESSION_CONFIG } from '../data/progression';
import { getSkillById } from '../data/skills';
import {
  simulateEquippedChange,
  sumEquippedStatBonuses,
} from '../engine/equipment';
import {
  calculateDerivedStats,
  calculateEffectiveStats,
  getExpForNextLevel,
  getTotalSpentPoints,
} from '../engine/stats';
import { useGameStore } from '../store/useGameStore';
import type { MechClassId, StatBlock, StatKey } from '../types/game';
import { soundFx } from '../utils/sound';
import {
  EquipmentPanel,
  type EquipmentPreviewChange,
} from './EquipmentPanel';
import { MechSvg } from './MechSvg';

type HangarLeftTab = 'chassis' | 'equipment';

export function HangarScreen() {
  const player = useGameStore((s) => s.player);
  const selectedSectorId = useGameStore((s) => s.selectedSectorId);
  const hangarNotice = useGameStore((s) => s.hangarNotice);
  const clearHangarNotice = useGameStore((s) => s.clearHangarNotice);
  const setPilotName = useGameStore((s) => s.setPilotName);
  const switchClass = useGameStore((s) => s.switchClass);
  const commitStatAllocations = useGameStore((s) => s.commitStatAllocations);
  const resetStatAllocations = useGameStore((s) => s.resetStatAllocations);
  const selectSector = useGameStore((s) => s.selectSector);
  const startBattle = useGameStore((s) => s.startBattle);

  const [leftTab, setLeftTab] = useState<HangarLeftTab>('equipment');
  const [pending, setPending] = useState<StatBlock>({ ...EMPTY_STAT_BLOCK });
  const [equipPreview, setEquipPreview] =
    useState<EquipmentPreviewChange>(null);

  const pendingSpent = useMemo(
    () => STAT_KEYS.reduce((sum, key) => sum + pending[key], 0),
    [pending]
  );

  const remainingPoints = Math.max(0, player.unspentPoints - pendingSpent);
  const totalCommittedSpent = getTotalSpentPoints(player.allocatedPoints);

  const activeClass = MECH_CLASSES[player.classId];
  const signatureSkill = getSkillById(activeClass.signatureSkillId);
  const expNeeded = getExpForNextLevel(player.level);
  const expPct = Math.min(100, Math.round((player.exp / expNeeded) * 100));

  const equippedCount = useMemo(
    () => EQUIPMENT_SLOTS.filter((slot) => Boolean(player.equipped[slot])).length,
    [player.equipped]
  );

  // Current equipped flat bonuses
  const currentEquipBonuses = useMemo(
    () => sumEquippedStatBonuses(player.equipped),
    [player.equipped]
  );

  // Simulated equipped flat bonuses when previewing equip/unequip
  const previewEquipBonuses = useMemo(() => {
    if (!equipPreview) return currentEquipBonuses;
    const simulated = simulateEquippedChange(player.equipped, equipPreview);
    return sumEquippedStatBonuses(simulated);
  }, [player.equipped, equipPreview, currentEquipBonuses]);

  const equipOnlyDeltas = useMemo(() => {
    const d: StatBlock = { ...EMPTY_STAT_BLOCK };
    for (const key of STAT_KEYS) {
      d[key] = previewEquipBonuses[key] - currentEquipBonuses[key];
    }
    return d;
  }, [previewEquipBonuses, currentEquipBonuses]);

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
        pending,
        previewEquipBonuses
      ),
    [
      player.classId,
      player.level,
      player.allocatedPoints,
      pending,
      previewEquipBonuses,
    ]
  );

  const currentDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, currentStats),
    [player.classId, player.level, currentStats]
  );

  const previewDerived = useMemo(
    () => calculateDerivedStats(player.classId, player.level, previewStats),
    [player.classId, player.level, previewStats]
  );

  const handleClassSwitch = (classId: MechClassId) => {
    setEquipPreview(null);
    switchClass(classId);
  };

  const adjustPending = (key: StatKey, delta: 1 | -1) => {
    if (delta === 1 && remainingPoints <= 0) return;
    if (delta === -1 && pending[key] <= 0) return;
    soundFx.playStatTick(delta === 1);
    setPending((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  };

  const handleConfirm = () => {
    if (pendingSpent <= 0) return;
    commitStatAllocations(pending);
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const handleClearPending = () => {
    if (pendingSpent <= 0) return;
    soundFx.playClick();
    setPending({ ...EMPTY_STAT_BLOCK });
  };

  const handleResetAll = () => {
    setPending({ ...EMPTY_STAT_BLOCK });
    resetStatAllocations();
  };

  const hasAnyPreview = pendingSpent > 0 || Boolean(equipPreview);

  const derivedRows: Array<{
    label: string;
    current: number;
    preview: number;
    suffix?: string;
    accent?: string;
  }> = [
    {
      label: 'Max HP',
      current: currentDerived.maxHp,
      preview: previewDerived.maxHp,
      accent: 'text-emerald-400',
    },
    {
      label: 'Max Shield',
      current: currentDerived.maxShield,
      preview: previewDerived.maxShield,
      accent: 'text-sky-400',
    },
    {
      label: 'Max SP',
      current: currentDerived.maxSp,
      preview: previewDerived.maxSp,
      accent: 'text-amber-400',
    },
    {
      label: 'Turn Speed',
      current: currentDerived.speed,
      preview: previewDerived.speed,
      accent: 'text-slate-100',
    },
    {
      label: 'Dodge',
      current: currentDerived.dodgeChance,
      preview: previewDerived.dodgeChance,
      suffix: '%',
      accent: 'text-slate-100',
    },
    {
      label: 'Critical',
      current: currentDerived.critChance,
      preview: previewDerived.critChance,
      suffix: '%',
      accent: 'text-slate-100',
    },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-tactical-grid">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (7 cols): Class Switcher + Equipment/Enchant OR Chassis/Sectors */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Class Switcher & Workspace Tabs */}
          <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
                  Mech Hangar
                </h1>
                <p className="text-xs text-slate-400">
                  Switch class anytime to test builds; class-locked Armor & Engine unequip automatically.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="pilot-name-input" className="text-xs text-slate-400">
                  Callsign
                </label>
                <input
                  id="pilot-name-input"
                  type="text"
                  value={player.name}
                  onChange={(e) => setPilotName(e.target.value)}
                  maxLength={18}
                  placeholder="Pilot Name"
                  className="h-9 w-36 rounded border border-slate-700 bg-slate-950/90 px-2.5 text-xs font-medium text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {/* 4 Class Segmented Buttons */}
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="tablist"
              aria-label="Mech Classes"
            >
              {MECH_CLASS_LIST.map((cls) => {
                const isSelected = cls.id === player.classId;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleClassSwitch(cls.id)}
                    className={`h-11 px-3 rounded border text-left transition-colors cursor-pointer flex flex-col justify-center ${
                      isSelected
                        ? 'bg-slate-800/95 border-amber-400/80 text-slate-50'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-display text-base font-semibold leading-none tracking-wide">
                      {cls.name}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate mt-0.5">
                      {cls.role}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Inline Class-Switch Notice */}
            {hangarNotice && (
              <div className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-2 flex items-center justify-between gap-2 text-xs text-sky-200">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-sky-400" />
                  <span>{hangarNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={clearHangarNotice}
                  aria-label="Dismiss notice"
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Sub-View Switcher: Equipment & Enchant vs Chassis & Sectors */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/70">
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setLeftTab('equipment');
                }}
                className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  leftTab === 'equipment'
                    ? 'bg-slate-800 border border-amber-400/70 text-slate-50'
                    : 'bg-slate-900/70 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Equipment & Enchant ({equippedCount}/6 · {player.inventory.length} Bag)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setLeftTab('chassis');
                }}
                className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  leftTab === 'chassis'
                    ? 'bg-slate-800 border border-amber-400/70 text-slate-50'
                    : 'bg-slate-900/70 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-sky-400" />
                <span>Chassis & Combat Sectors</span>
              </button>
            </div>
          </div>

          {/* LEFT TAB CONTENT: EQUIPMENT & ENCHANT */}
          {leftTab === 'equipment' && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4">
              <EquipmentPanel
                previewChange={equipPreview}
                onPreviewChange={setEquipPreview}
                previewStatDeltas={equipOnlyDeltas}
              />
            </div>
          )}

          {/* LEFT TAB CONTENT: CHASSIS VIEWER & SECTORS */}
          {leftTab === 'chassis' && (
            <>
              <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                  <div className="sm:col-span-5 flex flex-col items-center justify-center py-3 rounded bg-[#080C12]/80 border border-slate-800/70">
                    <MechSvg
                      classId={player.classId}
                      side="ally"
                      facing="right"
                      size="lg"
                      className="w-44 h-44 sm:w-48 sm:h-48"
                    />
                    <div className="mt-1 font-mono-nums text-xs text-slate-400">
                      {activeClass.chassisCode}
                    </div>
                  </div>

                  <div className="sm:col-span-7 space-y-4">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-display text-2xl font-bold text-slate-50">
                          {activeClass.name} Frame
                        </h2>
                        <span className="text-xs text-slate-400">
                          {activeClass.role}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                        {activeClass.description}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Level <strong className="font-mono-nums text-amber-400">{player.level}</strong>
                          {' · '}
                          Wins <strong className="font-mono-nums text-slate-200">{player.battlesWon}</strong>/
                          <span className="font-mono-nums">{player.battlesFought}</span>
                        </span>
                        <span className="font-mono-nums text-slate-400">
                          {player.exp} / {expNeeded} EXP
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-sm bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 meter-fill"
                          style={{ transform: `scaleX(${expPct / 100})` }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-100">
                          Signature Skill: {signatureSkill.name}
                        </span>
                        <span className="font-mono-nums text-amber-400">
                          {signatureSkill.spCost} SP ·{' '}
                          {signatureSkill.targetType === 'all_enemies'
                            ? 'All Enemies'
                            : signatureSkill.targetType === 'all_allies'
                            ? 'All Allies'
                            : signatureSkill.hits > 1
                            ? `Single (${signatureSkill.hits}x)`
                            : 'Single Target'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {signatureSkill.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Combat Sector Selection */}
              <div className="rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl font-bold tracking-wide text-slate-100">
                    Combat Sortie Sector
                  </h2>
                  <span className="text-xs text-slate-400">
                    Higher difficulty improves loot drop & rarity odds
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SECTORS_CATALOG.map((sector) => {
                    const selected = sector.id === selectedSectorId;
                    const enemyLvl = Math.max(1, player.level + sector.levelOffset);
                    return (
                      <button
                        key={sector.id}
                        type="button"
                        onClick={() => selectSector(sector.id)}
                        className={`p-3 rounded border text-left transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                          selected
                            ? 'bg-slate-800/90 border-amber-400/80'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                            <span>{sector.regionCode}</span>
                            <span
                              className={
                                sector.difficulty === 'Elite'
                                  ? 'text-red-400 font-medium'
                                  : sector.difficulty === 'Hard'
                                  ? 'text-amber-400 font-medium'
                                  : 'text-emerald-400 font-medium'
                              }
                            >
                              {sector.difficulty}
                            </span>
                          </div>
                          <div className="mt-1 font-display text-lg font-semibold text-slate-100 leading-tight">
                            {sector.name}
                          </div>
                          <p className="mt-1 text-xs text-slate-400 leading-snug">
                            {sector.description}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono-nums text-slate-300">
                          <span>Hostiles ~Lv.{enemyLvl}</span>
                          <span className="text-amber-400">
                            {sector.expMultiplier}x EXP · {sector.creditsMultiplier}x CR
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* RIGHT COLUMN (5 cols): Live Stat Allocation & Equipment Delta Preview */}
        <section className="lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0D131D]/95 p-4 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-wide text-slate-100">
                  Stat Allocation & Readout
                </h2>
                <p className="text-xs text-slate-400">
                  +{PROGRESSION_CONFIG.statPointsPerLevel} pts/level · Includes equipped flat bonuses
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Available Points</div>
                <div className="font-mono-nums text-2xl font-bold leading-none mt-0.5 text-emerald-400">
                  {remainingPoints}
                  {pendingSpent > 0 && (
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      (-{pendingSpent})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 6 Core Stats Table */}
            <div className="divide-y divide-slate-800/80 border-y border-slate-800/80">
              {STAT_KEYS.map((key) => {
                const meta = STAT_META[key];
                const gainPerPt = activeClass.perPointGain[key];
                const committedPts = player.allocatedPoints[key] || 0;
                const pendingPts = pending[key] || 0;
                const gearBonus = currentEquipBonuses[key] || 0;
                const curVal = currentStats[key];
                const prevVal = previewStats[key];
                const deltaVal = prevVal - curVal;

                return (
                  <div
                    key={key}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-semibold text-sm text-slate-100">
                          {meta.label}
                        </span>
                        <span className="font-mono-nums text-xs text-amber-400/90">
                          +{gainPerPt}/pt
                        </span>
                        {gearBonus > 0 && (
                          <span className="font-mono-nums text-[11px] text-sky-400">
                            (+{gearBonus} gear)
                          </span>
                        )}
                        {committedPts > 0 && (
                          <span className="font-mono-nums text-[11px] text-slate-500">
                            · {committedPts}pt
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {meta.effectSummary}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Stat Value & Live Preview Green/Red Delta */}
                      <div className="text-right min-w-[78px]">
                        <span
                          className={`font-mono-nums text-base font-bold ${
                            deltaVal > 0
                              ? 'text-emerald-400'
                              : deltaVal < 0
                              ? 'text-red-400'
                              : 'text-slate-100'
                          }`}
                        >
                          {prevVal}
                        </span>
                        {deltaVal !== 0 && (
                          <span
                            className={`ml-1.5 font-mono-nums text-xs font-semibold ${
                              deltaVal > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {deltaVal > 0 ? `+${deltaVal}` : deltaVal}
                          </span>
                        )}
                      </div>

                      {/* Stepper Controls (>= 40px touch target) */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => adjustPending(key, -1)}
                          disabled={pendingPts <= 0}
                          aria-label={`Remove pending point from ${meta.label}`}
                          className="h-10 w-10 flex items-center justify-center rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 transition-colors cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-6 text-center font-mono-nums text-xs font-semibold text-slate-300">
                          {pendingPts > 0 ? `+${pendingPts}` : '0'}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustPending(key, 1)}
                          disabled={remainingPoints <= 0}
                          aria-label={`Add point to ${meta.label}`}
                          className="h-10 w-10 flex items-center justify-center rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-amber-400/70 disabled:opacity-30 disabled:cursor-not-allowed text-slate-100 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Derived Combat Metrics Live Preview Grid (green/red deltas) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Derived Combat Readout</span>
                {hasAnyPreview && (
                  <span className="text-amber-300 font-medium">
                    Live Preview Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {derivedRows.map((row) => {
                  const diff = row.preview - row.current;
                  return (
                    <div
                      key={row.label}
                      className="rounded border border-slate-800/90 bg-[#090E16] px-3 py-2"
                    >
                      <div className="text-[11px] text-slate-400">
                        {row.label}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span
                          className={`font-mono-nums text-base font-bold ${
                            diff > 0
                              ? 'text-emerald-400'
                              : diff < 0
                              ? 'text-red-400'
                              : row.accent
                          }`}
                        >
                          {row.preview}
                          {row.suffix ?? ''}
                        </span>
                        {diff !== 0 && (
                          <span
                            className={`font-mono-nums text-[11px] font-semibold ${
                              diff > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                            {row.suffix ?? ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Allocation Action Buttons + Primary Battle Launch */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pendingSpent <= 0}
                className="flex-1 h-10 px-4 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                Confirm Allocation {pendingSpent > 0 ? `(${pendingSpent})` : ''}
              </button>
              <button
                type="button"
                onClick={handleClearPending}
                disabled={pendingSpent <= 0}
                className="h-10 px-3 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                disabled={totalCommittedSpent === 0}
                title="Refund all spent stat points"
                className="h-10 px-3 inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Respec</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => startBattle()}
              className="w-full h-12 px-5 inline-flex items-center justify-center gap-2 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap"
            >
              <Swords className="w-4 h-4" />
              <span>Deploy Squadron to Battle</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
