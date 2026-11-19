import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getClassCode, getClassName, getClassRole, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import { FighterSvg } from './FighterSvg';
import { LanguageToggle } from './LanguageToggle';

export function TitleScreen() {
  const { lang, t } = useI18n();
  const player = useGameStore((s) => s.player);
  const hasSaveData = useGameStore((s) => s.hasSaveData);
  const muted = useGameStore((s) => s.muted);
  const startCampaign = useGameStore((s) => s.startCampaign);
  const resetCampaign = useGameStore((s) => s.resetCampaign);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startCampaign();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startCampaign, toggleMute]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-tactical-grid flex flex-col justify-between">
      {/* Deep-Space Orbital Radar & Star-Track SVG Backdrop */}
      <svg
        viewBox="0 0 1200 720"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
        aria-hidden="true"
      >
        <g transform="translate(860, 360)">
          <circle r="130" stroke="#334155" strokeWidth="1" fill="none" />
          <circle r="230" stroke="#334155" strokeWidth="1" strokeDasharray="6 6" fill="none" />
          <circle r="335" stroke="#1E293B" strokeWidth="1" fill="none" />
          <line x1="-380" y1="0" x2="380" y2="0" stroke="#1E293B" strokeWidth="1" />
          <line x1="0" y1="-380" x2="0" y2="380" stroke="#1E293B" strokeWidth="1" />
          <g className="anim-radar">
            <path
              d="M0 0 L335 0 A335 335 0 0 0 290 -168 Z"
              fill="url(#radarGrad)"
            />
          </g>
        </g>
        {/* Subtle distant flight trajectories */}
        <line x1="40" y1="150" x2="290" y2="150" stroke="#38BDF8" strokeWidth="1" opacity="0.18" />
        <line x1="90" y1="590" x2="410" y2="590" stroke="#F59E0B" strokeWidth="1" opacity="0.15" />
        <defs>
          <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Controls: Language Toggle (VI / EN) + Audio */}
      <div className="relative z-10 flex items-center justify-end gap-2.5 px-6 pt-5">
        <LanguageToggle />
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t('common.unmuteTitle') : t('common.muteTitle')}
          className="h-9 px-3.5 inline-flex items-center gap-2 rounded border border-slate-800 bg-[#0E1520]/90 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span>{muted ? t('common.audioMuted') : t('common.audioOn')}</span>
        </button>
      </div>

      {/* Center Split Composition */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left: Title Lockup & Actions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-amber-400 uppercase">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <polygon
                  points="22,12 6,4 10,12 6,20"
                  stroke="#F59E0B"
                  strokeWidth="1.7"
                  fill="#F59E0B"
                  fillOpacity="0.18"
                />
              </svg>
              <span>{t('app.subtitle')}</span>
            </div>
            <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight text-slate-50 leading-[0.92] text-balance">
              {t('app.title')}
            </h1>
            <p className="max-w-xl text-base text-slate-300 leading-relaxed">
              {t('app.tagline')}
            </p>
          </div>

          {hasSaveData && (
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-300 pt-1">
              <span className="text-slate-400">{t('title.savedPilot')}</span>
              <span className="font-semibold text-slate-100">
                {player.name || 'Vance'}
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums text-amber-400">
                {t('common.levelShort')}
                {player.level}
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>{getClassName(lang, player.classId)}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums">
                {player.credits.toLocaleString()} CR
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums">
                {t('title.winsCount', { count: player.battlesWon })}
              </span>
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={startCampaign}
              className="h-12 px-8 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm tracking-wide rounded transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              {hasSaveData ? t('title.continue') : t('title.start')}
            </button>

            {hasSaveData && !confirmReset && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="h-12 px-5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-100 font-medium text-sm rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                {t('title.newCampaign')}
              </button>
            )}

            {hasSaveData && confirmReset && (
              <div className="flex items-center gap-2 bg-slate-900 border border-red-500/40 rounded px-3 py-1.5">
                <span className="text-xs text-red-300">
                  {t('title.erasePrompt')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    resetCampaign();
                  }}
                  className="h-8 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded cursor-pointer whitespace-nowrap"
                >
                  {t('title.confirmReset')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="h-8 px-2.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Hovering Hero Space Fighter Centerpiece */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="relative flex flex-col items-center justify-center p-6">
            <div className="absolute inset-4 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
            <FighterSvg
              classId={player.classId}
              side="ally"
              facing="right"
              size="lg"
              heroHover
            />
            <div className="mt-3 text-center space-y-1">
              <div className="font-display text-xl font-semibold tracking-wide text-slate-100">
                {getClassCode(lang, player.classId)}
              </div>
              <div className="text-xs text-slate-400">
                {t('title.classLine', {
                  className: getClassName(lang, player.classId),
                  role: getClassRole(lang, player.classId),
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Flat Control Hint Line */}
      <footer className="relative z-10 px-6 pb-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span>{t('app.controlsHint')}</span>
        <span className="text-slate-500">{t('app.saveHint')}</span>
      </footer>
    </div>
  );
}
