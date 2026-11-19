import { Crosshair, Lock, Rocket, Skull } from 'lucide-react';
import { DROP_CONFIG } from '../data/items';
import { getSectorById, SECTORS_CATALOG } from '../data/maps';
import { calculateSingleEnemyReward } from '../engine/combat';
import {
  getClassName,
  getDifficultyLabel,
  getSectorDesc,
  getSectorName,
  getSectorRegion,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { SectorDifficulty } from '../types/game';
import { soundFx } from '../utils/sound';

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  border_outpost: { x: 165, y: 155 },
  debris_belt: { x: 420, y: 95 },
  iron_citadel: { x: 675, y: 150 },
};

const DIFFICULTY_TEXT_CLASS: Record<SectorDifficulty, string> = {
  Standard: 'text-emerald-400',
  Hard: 'text-amber-400',
  Elite: 'text-red-400',
};

const DIFFICULTY_HEX: Record<SectorDifficulty, string> = {
  Standard: '#34D399',
  Hard: '#FBBF24',
  Elite: '#F87171',
};

export function MapView() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const adminConfig = useGameStore((s) => s.adminConfig);
  const selectedSectorId = useGameStore((s) => s.selectedSectorId);
  const selectSector = useGameStore((s) => s.selectSector);
  const startBattle = useGameStore((s) => s.startBattle);

  const activeGear = pilot.gears[pilot.activeGearId];
  const selectedSector = getSectorById(selectedSectorId);
  const selectedDropConfig = DROP_CONFIG[selectedSector.difficulty];
  const estimatedEnemyLevel = Math.max(
    1,
    activeGear.level + selectedSector.levelOffset
  );

  // Estimate full-victory EXP & Credits using exact rebalanced formula
  const estRegular = calculateSingleEnemyReward(estimatedEnemyLevel, false);
  const estBoss = selectedSector.hasBoss
    ? calculateSingleEnemyReward(estimatedEnemyLevel + 1, true)
    : null;
  const estFullExp = Math.round(
    (estRegular.exp * (selectedSector.hasBoss ? 3 : 4) + (estBoss?.exp ?? 0)) *
      adminConfig.rewardMultiplier
  );
  const estFullCr = Math.round(
    (estRegular.credits * (selectedSector.hasBoss ? 3 : 4) +
      (estBoss?.credits ?? 0)) *
      adminConfig.rewardMultiplier
  );

  const handleSelectSector = (sectorId: string) => {
    if (!pilot.unlockedSectorIds.includes(sectorId)) return;
    soundFx.playClick();
    selectSector(sectorId);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-slate-100">
            {t('map.pageTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('map.pageSubtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => startBattle()}
          className="h-11 px-5 inline-flex items-center gap-2 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          <Rocket className="w-4 h-4" />
          <span>
            {t('hangar.deploySquad')} ({getClassName(lang, activeGear.classId)}{' '}
            Lv.{activeGear.level})
          </span>
        </button>
      </div>

      {/* Interactive Orbital Star Chart */}
      <section className="rounded-lg border border-slate-800/90 bg-[#080C14] p-3 relative overflow-hidden">
        <svg
          viewBox="0 0 840 240"
          className="w-full h-48 sm:h-56 select-none"
          role="img"
          aria-label={t('map.pageTitle')}
        >
          <ellipse
            cx="420"
            cy="265"
            rx="340"
            ry="185"
            fill="none"
            stroke="#1E293B"
            strokeWidth="1"
            strokeDasharray="6 6"
          />
          <line
            x1={NODE_POSITIONS.border_outpost.x}
            y1={NODE_POSITIONS.border_outpost.y}
            x2={NODE_POSITIONS.debris_belt.x}
            y2={NODE_POSITIONS.debris_belt.y}
            stroke="#334155"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          <line
            x1={NODE_POSITIONS.debris_belt.x}
            y1={NODE_POSITIONS.debris_belt.y}
            x2={NODE_POSITIONS.iron_citadel.x}
            y2={NODE_POSITIONS.iron_citadel.y}
            stroke="#334155"
            strokeWidth="2"
            strokeDasharray="6 4"
          />

          {SECTORS_CATALOG.map((sector) => {
            const pos = NODE_POSITIONS[sector.id] ?? { x: 420, y: 120 };
            const unlocked = pilot.unlockedSectorIds.includes(sector.id);
            const isSelected = sector.id === selectedSector.id;
            const hex = unlocked ? DIFFICULTY_HEX[sector.difficulty] : '#475569';

            return (
              <g
                key={sector.id}
                onClick={() => handleSelectSector(sector.id)}
                className={unlocked ? 'cursor-pointer' : 'opacity-50'}
              >
                {isSelected && unlocked && (
                  <>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="34"
                      fill={hex}
                      fillOpacity="0.12"
                      stroke={hex}
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="22"
                      fill="none"
                      stroke={hex}
                      strokeWidth="2"
                    />
                  </>
                )}

                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="14"
                  fill="#0D131D"
                  stroke={isSelected ? hex : '#475569'}
                  strokeWidth="2.5"
                />
                <circle cx={pos.x} cy={pos.y} r="5.5" fill={hex} />

                <text
                  x={pos.x}
                  y={pos.y + 42}
                  textAnchor="middle"
                  fill={isSelected ? '#F8FAFC' : '#94A3B8'}
                  fontSize="13"
                  fontWeight={isSelected ? '700' : '500'}
                >
                  {getSectorName(lang, sector.id)}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 58}
                  textAnchor="middle"
                  fill={hex}
                  fontSize="11"
                  fontWeight="600"
                >
                  {unlocked
                    ? `${getSectorRegion(lang, sector.id)} · ${getDifficultyLabel(
                        lang,
                        sector.difficulty
                      )}${sector.hasBoss ? ' · BOSS' : ''}`
                    : t('common.locked')}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      {/* Sector Cards + Selected Sector Briefing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 grid grid-cols-1 gap-3">
          {SECTORS_CATALOG.map((sector) => {
            const unlocked = pilot.unlockedSectorIds.includes(sector.id);
            const isSelected = sector.id === selectedSector.id;
            const dropCfg = DROP_CONFIG[sector.difficulty];
            const estLv = Math.max(1, activeGear.level + sector.levelOffset);

            return (
              <button
                key={sector.id}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSelectSector(sector.id)}
                className={`rounded-lg border p-4 text-left transition-colors space-y-2 ${
                  !unlocked
                    ? 'border-slate-800/60 bg-[#090D14]/60 opacity-60 cursor-not-allowed'
                    : isSelected
                    ? 'border-amber-400/80 bg-slate-900/95 cursor-pointer'
                    : 'border-slate-800/90 bg-[#0C121D]/95 hover:border-slate-700 cursor-pointer'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span>{getSectorRegion(lang, sector.id)}</span>
                      {sector.hasBoss && (
                        <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                          · <Skull className="w-3 h-3" /> BOSS 5x
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-xl font-bold text-slate-100 leading-tight">
                      {getSectorName(lang, sector.id)}
                    </h2>
                  </div>

                  {unlocked ? (
                    <span
                      className={`text-xs font-semibold ${
                        DIFFICULTY_TEXT_CLASS[sector.difficulty]
                      }`}
                    >
                      {getDifficultyLabel(lang, sector.difficulty)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                      <span>{t('map.lockedSector')}</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {getSectorDesc(lang, sector.id)}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-800/80 text-xs font-mono-nums text-slate-300">
                  <span>{t('hangar.hostilesLevel', { level: estLv })}</span>
                  <span className="text-purple-400">
                    {t('rarity.epic')}: {dropCfg.rarityWeights.epic}%
                  </span>
                  <span className="text-amber-400">
                    {t('rarity.legendary')}: {dropCfg.rarityWeights.legendary}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Sector Briefing */}
        <section className="lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-5 space-y-4">
          <div>
            <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              <span>{t('map.selectedSector')}</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-50 mt-0.5">
              {getSectorName(lang, selectedSector.id)}
            </h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {getSectorRegion(lang, selectedSector.id)} ·{' '}
              <span className={DIFFICULTY_TEXT_CLASS[selectedSector.difficulty]}>
                {getDifficultyLabel(lang, selectedSector.difficulty)}
              </span>
            </div>
          </div>

          {selectedSector.hasBoss && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-center gap-2 font-semibold">
              <Skull className="w-4 h-4 shrink-0" />
              <span>{t('map.bossWarning')}</span>
            </div>
          )}

          <p className="text-xs text-slate-300 leading-relaxed">
            {getSectorDesc(lang, selectedSector.id)}
          </p>

          <div className="divide-y divide-slate-800/80 border-y border-slate-800/80 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">{t('map.enemyEstimate')}</span>
              <span className="font-mono-nums font-semibold text-slate-100">
                4 × ~{t('common.levelShort')}
                {estimatedEnemyLevel}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">{t('map.rewardRate')}</span>
              <span className="font-mono-nums font-semibold text-emerald-400">
                ~{estFullExp} EXP · ~{estFullCr.toLocaleString()} CR
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">{t('map.dropOdds')}</span>
              <span className="font-mono-nums font-semibold text-amber-400">
                {selectedDropConfig.rarityWeights.epic}% /{' '}
                {selectedDropConfig.rarityWeights.legendary}%
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => startBattle()}
            className="w-full h-11 px-4 inline-flex items-center justify-center gap-2 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            <Rocket className="w-4 h-4" />
            <span>{t('hangar.deploySquad')}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
