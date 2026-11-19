import { Award, Volume2, VolumeX } from 'lucide-react';
import { getExpForNextLevel } from '../engine/stats';
import { getClassName, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import { LanguageToggle } from './LanguageToggle';

export function TopHud() {
  const { lang, t } = useI18n();
  const screen = useGameStore((s) => s.screen);
  const pilot = useGameStore((s) => s.pilot);
  const muted = useGameStore((s) => s.muted);
  const setScreen = useGameStore((s) => s.setScreen);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const activeGear = pilot.gears[pilot.activeGearId];
  const expNeeded = getExpForNextLevel(activeGear.level);
  const expPct = Math.min(100, Math.round((activeGear.exp / expNeeded) * 100));

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0A0F18]/95 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Brand Wordmark (DREAM ACE) */}
      <button
        type="button"
        onClick={() => setScreen('TITLE')}
        className="font-display text-2xl font-bold tracking-[0.12em] text-slate-50 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        {t('app.title')}
      </button>

      {/* Center: Pilot Name + Active Gear [Lv X] + Credits + War Points */}
      <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm text-slate-300 min-w-0">
        <div className="flex items-center gap-2 whitespace-nowrap min-w-0">
          <span className="hidden sm:inline text-slate-400">
            {t('common.pilot')}:
          </span>
          <span className="font-semibold text-slate-100 truncate max-w-[84px] sm:max-w-none">
            {pilot.name || 'Vance'}
          </span>
          <span className="font-mono-nums font-semibold text-amber-400">
            [{getClassName(lang, activeGear.classId)} {t('common.levelShort')}
            {activeGear.level}]
          </span>
          <div
            className="hidden lg:block w-16 h-1.5 bg-slate-800 rounded-sm overflow-hidden"
            title={`${activeGear.exp} / ${expNeeded} EXP`}
          >
            <div
              className="h-full bg-amber-400 meter-fill"
              style={{ transform: `scaleX(${expPct / 100})` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="hidden md:inline text-slate-400">
            {t('common.credits')}
          </span>
          <span className="font-mono-nums font-semibold text-amber-300">
            {pilot.credits.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500">CR</span>
        </div>

        <div
          className="flex items-center gap-1 whitespace-nowrap"
          title={t('common.warPoints')}
        >
          <Award className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="font-mono-nums font-semibold text-purple-300">
            {(pilot.warPoints ?? 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-purple-400/80">
            {t('common.wpShort')}
          </span>
        </div>
      </div>

      {/* Right: Return (when in Battle), VI | EN Toggle, Audio */}
      <div className="flex items-center gap-2 shrink-0">
        {screen === 'BATTLE' && (
          <button
            type="button"
            onClick={returnToHangar}
            className="h-9 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('nav.returnHangar')}
          </button>
        )}

        <LanguageToggle />

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t('common.unmuteTitle') : t('common.muteTitle')}
          title={muted ? t('common.unmuteTitle') : t('common.muteTitle')}
          className="h-9 w-9 flex items-center justify-center rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
        >
          {muted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
