import { Crosshair, Rocket } from 'lucide-react';
import { DROP_CONFIG } from '../data/items';
import { getSectorById, SECTORS_CATALOG } from '../data/maps';
import {
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
  const player = useGameStore((s) => s.player);
  const selectedSectorId = useGameStore((s) => s.selectedSectorId);
  const selectSector = useGameStore((s) => s.selectSector);
  const startBattle = useGameStore((s) => s.startBattle);

  const selectedSector = getSectorById(selectedSectorId);
  const selectedDropConfig = DROP_CONFIG[selectedSector.difficulty];
  const estimatedEnemyLevel = Math.max(
    1,
    player.level + selectedSector.levelOffset
  );

  const handleSelectSector = (sectorId: string) => {
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
          <span>{t('hangar.deploySquad')}</span>
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
          {/* Subtle Orbital Grid Arcs */}
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
          <ellipse
            cx="420"
            cy="285"
            rx="440"
            ry="220"
            fill="none"
            stroke="#0F172A"
            strokeWidth="1"
          />

          {/* Jump Lane Connectors */}
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

          {/* Clickable Sector Nodes */}
          {SECTORS_CATALOG.map((sector) => {
            const pos = NODE_POSITIONS[sector.id] ?? { x: 420, y: 120 };
            const isSelected = sector.id === selectedSector.id;
            const hex = DIFFICULTY_HEX[sector.difficulty];

            return (
              <g
                key={sector.id}
                onClick={() => handleSelectSector(sector.id)}
                className="cursor-pointer"
              >
                {isSelected && (
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
                  {getSectorRegion(lang, sector.id)} ·{' '}
                  {getDifficultyLabel(lang, sector.difficulty)}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      {/* Sector Cards + Selected Sector Briefing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Sector List (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 gap-3">
          {SECTORS_CATALOG.map((sector) => {
            const isSelected = sector.id === selectedSector.id;
            const dropCfg = DROP_CONFIG[sector.difficulty];
            const estLv = Math.max(1, player.level + sector.levelOffset);

            return (
              <button
                key={sector.id}
                type="button"
                onClick={() => handleSelectSector(sector.id)}
                className={`rounded-lg border p-4 text-left transition-colors cursor-pointer space-y-2 ${
                  isSelected
                    ? 'border-amber-400/80 bg-slate-900/95'
                    : 'border-slate-800/90 bg-[#0C121D]/95 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-400">
                      {getSectorRegion(lang, sector.id)}
                    </div>
                    <h2 className="font-display text-xl font-bold text-slate-100 leading-tight">
                      {getSectorName(lang, sector.id)}
                    </h2>
                  </div>

                  <span
                    className={`text-xs font-semibold ${
                      DIFFICULTY_TEXT_CLASS[sector.difficulty]
                    }`}
                  >
                    {getDifficultyLabel(lang, sector.difficulty)}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {getSectorDesc(lang, sector.id)}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-800/80 text-xs font-mono-nums text-slate-300">
                  <span>{t('hangar.hostilesLevel', { level: estLv })}</span>
                  <span>EXP ×{sector.expMultiplier.toFixed(2)}</span>
                  <span>CR ×{sector.creditsMultiplier.toFixed(2)}</span>
                  <span className="text-amber-400">
                    {t('rarity.epic')}: {dropCfg.rarityWeights.epic}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Sector Briefing Panel (5 cols) */}
        <section className="lg:col-span-5 rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
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
          </div>

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
                EXP ×{selectedSector.expMultiplier.toFixed(2)} · CR ×
                {selectedSector.creditsMultiplier.toFixed(2)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">{t('map.dropOdds')}</span>
              <span className="font-mono-nums font-semibold text-amber-400">
                {selectedDropConfig.rarityWeights.epic}% ({t('rarity.rare')}{' '}
                {selectedDropConfig.rarityWeights.rare}%)
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
