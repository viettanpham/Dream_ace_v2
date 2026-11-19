import { Volume2, VolumeX } from 'lucide-react';
import { getExpForNextLevel } from '../engine/stats';
import { getClassName, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import { LanguageToggle } from './LanguageToggle';

export function TopHud() {
  const { lang, t } = useI18n();
  const screen = useGameStore((s) => s.screen);
  const player = useGameStore((s) => s.player);
  const muted = useGameStore((s) => s.muted);
  const setScreen = useGameStore((s) => s.setScreen);
  const startBattle = useGameStore((s) => s.startBattle);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const expNeeded = getExpForNextLevel(player.level);
  const expPct = Math.min(100, Math.round((player.exp / expNeeded) * 100));

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0A0F18]/95 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Zone 1: Brand Title */}
      <button
        type="button"
        onClick={() => setScreen('TITLE')}
        className="font-display text-xl font-bold tracking-wider text-slate-100 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        {t('app.title')}
      </button>

      {/* Zone 2: Pilot Readout */}
      <div className="hidden lg:flex items-center gap-5 text-xs text-slate-300">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-slate-400">{t('common.pilot')}</span>
          <span className="font-semibold text-slate-100">
            {player.name || 'Vance'}
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-300">
            {getClassName(lang, player.classId)}
          </span>
        </div>

        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="font-mono-nums font-semibold text-amber-400">
            {t('common.levelShort')}
            {player.level}
          </span>
          <div className="w-20 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-amber-400 meter-fill"
              style={{ transform: `scaleX(${expPct / 100})` }}
            />
          </div>
          <span className="font-mono-nums text-slate-400">
            {player.exp}/{expNeeded} EXP
          </span>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">{t('common.credits')}</span>
          <span className="font-mono-nums font-semibold text-slate-100">
            {player.credits.toLocaleString()} CR
          </span>
        </div>

        {player.unspentPoints > 0 && (
          <span className="font-mono-nums font-semibold text-emerald-400 whitespace-nowrap">
            {t('common.statPts', { count: player.unspentPoints })}
          </span>
        )}
      </div>

      {/* Zone 3: Navigation, Primary Action, Language & Audio */}
      <div className="flex items-center gap-2 shrink-0">
        {screen !== 'BATTLE' && (
          <nav className="flex items-center gap-1 mr-1" aria-label="Base sections">
            <button
              type="button"
              onClick={() => setScreen('HANGAR')}
              className={`h-9 px-3 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                screen === 'HANGAR'
                  ? 'bg-slate-800 text-slate-50 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t('nav.hangar')}
            </button>
            <button
              type="button"
              onClick={() => setScreen('SHOP')}
              className={`h-9 px-3 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                screen === 'SHOP'
                  ? 'bg-slate-800 text-slate-50 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t('nav.shop')}
            </button>
          </nav>
        )}

        {(screen === 'HANGAR' || screen === 'SHOP') && (
          <button
            type="button"
            onClick={() => startBattle()}
            className="h-9 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs tracking-wide rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {t('nav.deploy')}
          </button>
        )}

        {screen === 'BATTLE' && (
          <button
            type="button"
            onClick={returnToHangar}
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
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
          className="h-9 w-9 flex items-center justify-center rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
